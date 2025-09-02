/**
 * @file control-panel.ts
 * @description 视频翻译控制面板组件，基于新架构分离状态管理
 * 重构后的控制面板严格分离UserPreferences和RuntimeState
 */

import { EventBus, EventPriority } from '../events/event-bus';
import { StorageManager, StorageKeys } from '../storage/storage-manager';
// === 新架构状态管理器 ===
import { UserPreferencesManager } from '../storage/user-preferences-manager';
import { UserPreferences, UserPreferenceChangeEvent, SubtitleMode } from '../types/user-preferences-types';
import { RuntimeStateManager } from '../storage/runtime-state-manager';
import { RuntimeState, TranslateActiveState, RuntimeStateChangeEvent, TranslateStateHelper } from '../types/runtime-state-types';
import { ControlPanelState, ControlPanelEvent, ControlPanelStateChangeHandler } from '../types/component-types';
// === 临时兼容性导入 ===
import { SubtitleEvent, ProcessedSubtitleEvent } from '../types/core-types';
import { 
  TranslationDispatcher, 
  TranslationContext,
  TranslationPriority,
  TranslationEvent
} from '../translation/translation-dispatcher';

// === 移除旧的接口定义，使用新架构的types/component-types.ts中的定义 ===
// ControlPanelEvent 和 ControlPanelState 现在从 '../types/component-types' 导入

/**
 * 字幕控制面板类
 * 基于新架构分离状态管理，负责协调字幕翻译流程
 */
export class ControlPanel {
  private static instance: ControlPanel;
  private eventBus: EventBus;
  private storageManager: StorageManager;
  
  // === 新架构状态管理器 ===
  private userPreferencesManager: UserPreferencesManager;
  private runtimeStateManager: RuntimeStateManager;
  
  private translationDispatcher: TranslationDispatcher;
  private state: ControlPanelState;
  
  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.storageManager = StorageManager.getInstance();
    
    // 初始化新架构管理器
    this.userPreferencesManager = UserPreferencesManager.getInstance();
    this.runtimeStateManager = RuntimeStateManager.getInstance();
    
    this.translationDispatcher = TranslationDispatcher.getInstance();
    
    // 初始化状态（不包含settings字段）
    this.state = {
      isInitialized: false,
      isTranslating: false,
      lastError: null,
      
      currentVideoId: null,
      subtitleEvents: [],
      
      isVisible: true,
      isCollapsed: false,
      
      pendingUpdates: new Map(),
      batchUpdateTimeout: null
    };
    
    console.log('[control-panel] 控制面板已创建，等待初始化...');
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): ControlPanel {
    if (!ControlPanel.instance) {
      ControlPanel.instance = new ControlPanel();
    }
    return ControlPanel.instance;
  }
  
  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听设置变更
    this.setupSettingsListeners();
    
    // 监听翻译事件
    this.setupTranslationListeners();
    
    // 监听UI事件
    this.setupUIListeners();
    
    // 监听字幕加载事件
    this.setupSubtitleListeners();
  }
  
  /**
   * 设置设置变更监听器
   * 重构为新架构：分离UserPreferences和RuntimeState监听
   */
  private setupSettingsListeners(): void {
    // === 用户偏好变更监听（新架构） ===
    this.userPreferencesManager.addChangeListener(
      UserPreferenceChangeEvent.TARGET_LANG_CHANGED,
      (newValue, oldValue) => {
        console.log('[control-panel] 目标语言已变更:', newValue);
      }
    );
    
    this.userPreferencesManager.addChangeListener(
      UserPreferenceChangeEvent.SUBTITLE_MODE_CHANGED,
      (newValue, oldValue) => {
        this.emitEvent(ControlPanelEvent.UI_UPDATE_REQUIRED, { reason: 'subtitleModeChanged' });
        console.log('[control-panel] 字幕模式已变更:', newValue);
      }
    );
    
    this.userPreferencesManager.addChangeListener(
      UserPreferenceChangeEvent.TRANSLATION_SERVICE_CHANGED,
      (newValue, oldValue) => {
        console.log('[control-panel] 翻译服务已变更:', newValue);
      }
    );
    
    // === 运行时状态变更监听（新架构） ===
    this.runtimeStateManager.addChangeListener(
      RuntimeStateChangeEvent.TRANSLATE_ACTIVE_CHANGED,
      (newValue, oldValue) => {
        // 根据翻译状态变更处理UI更新
        this.handleTranslateActiveChanged(newValue, oldValue);
        console.log('[control-panel] 翻译状态已变更:', TranslateStateHelper.getDisplayName(newValue));
      }
    );
    
    this.runtimeStateManager.addChangeListener(
      RuntimeStateChangeEvent.SETTING_PANEL_CHANGED,
      (newValue, oldValue) => {
        console.log('[control-panel] 设置面板状态已变更:', newValue);
      }
    );
  }
  
  /**
   * 处理翻译状态变更
   */
  private handleTranslateActiveChanged(newState: TranslateActiveState, oldState: TranslateActiveState): void {
    // 更新面板状态
    if (newState === TranslateActiveState.PENDING) {
      this.updateState({ isTranslating: true });
    } else if (oldState === TranslateActiveState.PENDING) {
      this.updateState({ isTranslating: false });
    }
    
    // 如果开启翻译，且有字幕事件，自动开始翻译
    if (newState === TranslateActiveState.ACTIVE && this.state.currentVideoId && this.state.subtitleEvents.length === 0) {
      // 提示需要获取字幕
      this.emitEvent(ControlPanelEvent.UI_UPDATE_REQUIRED, { reason: 'needSubtitles' });
    }
  }
  
  /**
   * 设置翻译事件监听器
   */
  private setupTranslationListeners(): void {
    // 翻译开始事件
    this.translationDispatcher.addEventListener(
      TranslationEvent.TRANSLATION_STARTED,
      (eventType, data) => {
        this.updateState({ isTranslating: true });
        this.emitEvent(ControlPanelEvent.TRANSLATION_STARTED, data);
      }
    );
    
    // 翻译完成事件
    this.translationDispatcher.addEventListener(
      TranslationEvent.TRANSLATION_COMPLETED,
      (eventType, data) => {
        this.updateState({ 
          isTranslating: false,
          subtitleEvents: data.processedEvents 
        });
        this.emitEvent(ControlPanelEvent.TRANSLATION_COMPLETED, {
          processedEvents: data.processedEvents,
          fromLocalStorage: data.fromLocalStorage
        });
      }
    );
    
    // 翻译错误事件
    this.translationDispatcher.addEventListener(
      TranslationEvent.TRANSLATION_ERROR,
      (eventType, data) => {
        this.updateState({ 
          isTranslating: false,
          lastError: data.error 
        });
        this.emitEvent(ControlPanelEvent.TRANSLATION_ERROR, {
          error: data.error
        });
      }
    );
  }
  
  /**
   * 设置UI事件监听器
   */
  private setupUIListeners(): void {
    // 监听UI控件注入完成事件
    this.eventBus.on('ui.controlsInjected', async (data) => {
      console.log('[control-panel] 收到UI控件注入完成事件:', data);
      
      const translateActive = await this.runtimeStateManager.getTranslateState();
      if (translateActive === TranslateActiveState.ACTIVE && this.state.currentVideoId) {
        this.emitEvent(ControlPanelEvent.TRANSLATION_STARTED, {
          videoId: this.state.currentVideoId
        });
      }
    });
    
    // 监听UI控件恢复事件
    this.eventBus.on('ui.controlsRecovered', (data) => {
      console.log('[control-panel] 收到UI控件恢复事件:', data);
      
      // 如果翻译已激活，重新开始翻译流程
      if (this.state.isTranslating && this.state.currentVideoId) {
        this.emitEvent(ControlPanelEvent.TRANSLATION_STARTED, {
          videoId: this.state.currentVideoId
        });
      }
    });
    
    // 监听UI叠加层创建完成事件
    this.eventBus.on('ui.overlayCreated', (data) => {
      console.log('[control-panel] 收到UI叠加层创建完成事件:', data);
    });
    
    // 监听UI注入失败事件
    this.eventBus.on('ui.injectionFailed', (data) => {
      console.log('[control-panel] 收到UI注入失败事件:', data);
      this.updateState({
        lastError: `UI注入失败: ${data.reason || '未知错误'}`
      });
      
      // 如果是由于达到最大尝试次数，记录额外信息
      if (data.reason === 'MAX_ATTEMPTS_REACHED') {
        console.error(`[control-panel] UI注入失败，已尝试 ${data.attempts} 次`);
      }
    });
  }
  
  /**
   * 设置字幕事件监听器
   */
  private setupSubtitleListeners(): void {
    // 监听字幕加载事件
    this.eventBus.on('subtitles:loaded', (data) => {
      console.log('[control-panel] 收到字幕轨道加载事件:', data);
      
      if (this.state.isTranslating) {
        console.log('[control-panel] 翻译已在进行中，忽略此次字幕加载');
        return;
      }
      
      if (!data.tracks || data.tracks.length === 0) {
        console.warn('[control-panel] 字幕轨道为空');
        this.handleTranslationError('没有可用的字幕轨道');
        return;
      }
      
      if (!data.videoId) {
        console.warn('[control-panel] 字幕事件缺少videoId');
        this.handleTranslationError('缺少视频ID信息');
        return;
      }
      
      // 确保当前视频ID与加载的字幕匹配
      if (this.state.currentVideoId !== data.videoId) {
        console.log(`[control-panel] 更新当前视频ID: ${data.videoId}`);
        this.setCurrentVideo(data.videoId).catch(error => {
          console.error('[control-panel] 设置当前视频ID失败:', error);
        });
      }
      
      // 处理字幕轨道
      this.processSubtitleTracks(data.tracks, data.videoId);
    });
  }
  
  /**
   * 处理字幕轨道数据
   * @param tracks 字幕轨道数组
   * @param videoId 视频ID
   */
  private async processSubtitleTracks(tracks: any[], videoId: string): Promise<void> {
    try {
      this.emitEvent(ControlPanelEvent.SUBTITLE_TRACKS_LOADED, { tracks, videoId });

      const userPreferences = await this.userPreferencesManager.getUserPreferences();
      // 修正：应该使用源语言来查找轨道，但新架构下源语言管理已分离
      // 此处临时使用一个通用逻辑，后续需要与 VideoSourceLanguageCache 结合
      const bestTrack = this.findBestTrack(tracks, 'en'); 

      if (bestTrack) {
        const subtitleEvents = await this.fetchSubtitleData(bestTrack);
        // 修正：此处不应更新state，原始字幕事件应直接发送去翻译
        
        const runtimeState = await this.runtimeStateManager.getTranslateState();
        if (runtimeState === TranslateActiveState.ACTIVE) {
          this.translateSubtitles(subtitleEvents);
        }
      } else {
        console.warn('[control-panel] 未找到合适的字幕轨道');
        this.emitEvent(ControlPanelEvent.TRANSLATION_ERROR, { error: '未找到合适的字幕轨道' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[control-panel] 处理字幕轨道时出错:', errorMessage);
      this.emitEvent(ControlPanelEvent.TRANSLATION_ERROR, { error: errorMessage });
    }
  }
  
  /**
   * 查找最匹配的字幕轨道
   * @param tracks 字幕轨道数组
   * @param langCode 目标语言代码
   * @returns 最匹配的轨道或undefined
   */
  private findBestTrack(tracks: any[], langCode: string): any {
    // 首先尝试精确匹配
    const exactMatch = tracks.find(track => track.languageCode === langCode);
    if (exactMatch) {
      return exactMatch;
    }
    
    // 尝试前缀匹配（如"en-US"匹配"en"）
    const prefixMatch = tracks.find(track => 
      track.languageCode && langCode && (
        track.languageCode.startsWith(langCode + '-') || 
        langCode.startsWith(track.languageCode + '-')
      )
    );
    if (prefixMatch) {
      return prefixMatch;
    }
    
    // 如果没有匹配，使用第一个轨道作为后备
    return tracks.length > 0 ? tracks[0] : undefined;
  }
  
  /**
   * 获取字幕数据
   * @param track 字幕轨道
   * @returns 字幕事件数组
   */
  private async fetchSubtitleData(track: any): Promise<SubtitleEvent[]> {
    try {
      // 检查track对象是否有效
      if (!track) {
        throw new Error('无效的字幕轨道');
      }
      
      // 如果track已包含处理好的字幕数据，直接返回
      if (track.subtitles && Array.isArray(track.subtitles)) {
        return track.subtitles.map((sub: any, index: number) => ({
          id: `${this.state.currentVideoId}_${index}`,
          start: sub.start,
          end: sub.end,
          text: sub.text,
          langCode: track.languageCode || 'unknown'
        }));
      }
      
      // 检查是否有baseUrl
      if (!track.baseUrl) {
        console.warn('[control-panel] 字幕轨道缺少baseUrl:', track);
        
        // 如果没有baseUrl但有其他可用数据，尝试使用
        if (track.url) {
          track.baseUrl = track.url;
        } else if (track.baseUrlData) {
          track.baseUrl = track.baseUrlData;
        } else {
          throw new Error('字幕轨道缺少必要的URL数据');
        }
      }
      
      // 发起请求获取字幕数据
      // 这里需要实现通过baseUrl获取字幕数据的逻辑
      // 在实际应用中，可能需要与content-script通信
      
      console.log(`[control-panel] 通过baseUrl获取字幕数据: ${track.baseUrl.substring(0, 100)}...`);
      
      // 此处为临时占位，实际实现中需要修改
      return [];
    } catch (error) {
      console.error('[control-panel] 获取字幕数据失败:', error);
      throw error;
    }
  }
  
  /**
   * 初始化控制面板
   */
  public async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      console.warn('[control-panel] 控制面板已初始化，跳过重复操作');
      return;
    }
    
    console.log('[control-panel] 正在初始化控制面板...');
    
    try {
      // 确保管理器已初始化
      await this.userPreferencesManager.initialize();
      await this.runtimeStateManager.initialize();
      
      this.setupEventListeners();
      
      this.updateState({ isInitialized: true });
      
      this.emitEvent(ControlPanelEvent.INITIALIZED, { success: true });
      console.log('[control-panel] ✅ 控制面板初始化完成');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[control-panel] ❌ 控制面板初始化失败:', errorMessage);
      this.updateState({ lastError: errorMessage });
      this.emitEvent(ControlPanelEvent.PANEL_ERROR, { error: errorMessage });
    }
  }
  
  /**
   * 更新控制面板状态
   * @param updates 状态更新
   */
  private updateState(updates: Partial<ControlPanelState>): void {
    this.state = {
      ...this.state,
      ...updates
    };
  }
  
  /**
   * 发送事件
   * @param eventType 事件类型
   * @param data 事件数据
   */
  private emitEvent(eventType: ControlPanelEvent, data: any): void {
    this.eventBus.emit(eventType, {
      ...data,
      timestamp: Date.now()
    });
  }
  
  /**
   * 添加事件监听器
   * @param eventType 事件类型
   * @param handler 处理函数
   * @param priority 优先级
   */
  public addEventListener(
    eventType: ControlPanelEvent,
    handler: (data: any) => void,
    priority: EventPriority = EventPriority.NORMAL
  ): () => void {
    return this.eventBus.on(eventType, handler, priority);
  }
  
  /**
   * 设置当前视频ID
   * @param videoId YouTube视频ID
   */
  public async setCurrentVideo(videoId: string): Promise<void> {
    if (this.state.currentVideoId === videoId) return;

    console.log(`[control-panel] 设置当前视频ID: ${videoId}`);
    this.updateState({ 
      currentVideoId: videoId,
      subtitleEvents: [], // 清空旧的字幕事件
      lastError: null
    });

    // 根据翻译状态决定是否自动获取字幕
    const translateActive = await this.runtimeStateManager.getTranslateState();
    if (translateActive === TranslateActiveState.ACTIVE) {
      this.emitEvent(ControlPanelEvent.UI_UPDATE_REQUIRED, { reason: 'videoChanged' });
    }
  }
  
  /**
   * 提交翻译请求
   * @param subtitles 字幕事件数组
   * @param currentTime 当前播放时间（秒）
   */
  public async translateSubtitles(
    subtitles: SubtitleEvent[],
    currentTime?: number
  ): Promise<void> {
    if (!this.state.currentVideoId) {
      console.error('[control-panel] 无法开始翻译：缺少视频ID');
      return;
    }
    
    try {
      const userPreferences = await this.userPreferencesManager.getUserPreferences();
      
      const context: TranslationContext = {
        videoId: this.state.currentVideoId,
        sourceEvents: subtitles,
        sourceLang: 'auto', 
        targetLang: userPreferences.targetLang,
        subtitleMode: userPreferences.subtitleMode,
        translationService: userPreferences.translationService, // ✨ 确认：传递完整的服务对象
        currentTime
      };
      
      this.translationDispatcher.submitTranslationRequest(
        context,
        TranslationPriority.NORMAL
      );
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleTranslationError(errorMessage);
    }
  }
  
  /**
   * 处理翻译完成
   * @param processedEvents 处理后的字幕事件
   */
  private handleTranslationComplete(processedEvents: ProcessedSubtitleEvent[]): void {
    // 更新状态
    this.updateState({
      subtitleEvents: processedEvents,
      isTranslating: false
    });
    
    // 使用本地存储替代会话存储
    this.storageManager.set(
      StorageKeys.TEMP.SUBTITLE_EVENTS,
      processedEvents,
      'local' // 明确指定使用local存储
    ).catch(error => {
              console.error('[control-panel] 保存翻译结果到本地存储失败:', error);
    });
  }
  
  /**
   * 处理翻译错误
   * @param error 错误信息
   */
  private handleTranslationError(error: string): void {
    this.updateState({
      lastError: error,
      isTranslating: false
    });
    
    this.emitEvent(ControlPanelEvent.TRANSLATION_ERROR, {
      error
    });
  }
  
  /**
   * 获取当前控制面板状态
   * @returns 控制面板状态
   */
  public getState(): ControlPanelState {
    return { ...this.state };
  }
  
  /**
   * 切换翻译功能开启/关闭状态
   * @returns 返回新的翻译激活状态
   */
  public async toggleTranslation(): Promise<TranslateActiveState> {
    const currentState = await this.runtimeStateManager.getTranslateState();
    
    const nextState =
      currentState === TranslateActiveState.ACTIVE
        ? TranslateActiveState.INACTIVE
        : TranslateActiveState.ACTIVE;
        
    await this.runtimeStateManager.setTranslateState(nextState);
    return nextState;
  }
  
  /**
   * 切换字幕模式
   * @returns 返回新的字幕模式
   */
  public async toggleSubtitleMode(): Promise<SubtitleMode> {
    const currentPrefs = await this.userPreferencesManager.getUserPreferences();
    const currentMode = currentPrefs.subtitleMode;

    const nextMode =
      currentMode === SubtitleMode.BILINGUAL
        ? SubtitleMode.TARGET_ONLY
        : SubtitleMode.BILINGUAL;
    
    await this.userPreferencesManager.updateUserPreferences({ subtitleMode: nextMode });
    return nextMode;
  }
  
  /**
   * 清除指定视频的翻译本地存储
   * @param videoId 可选，如果未提供，则清除当前视频的缓存
   */
  public async clearTranslationLocalStorage(videoId?: string): Promise<void> {
    const finalVideoId = videoId || this.state.currentVideoId;
    if (!finalVideoId) {
      console.warn('[control-panel] 无法清除本地存储，因为没有当前视频ID');
      return;
    }
    
    // 调用翻译分发器来处理缓存清理
    await this.translationDispatcher.clearCacheForVideo(finalVideoId);
  }
  
  /**
   * 重置用户偏好为默认值
   */
  public async resetUserPreferences(): Promise<void> {
    await this.userPreferencesManager.resetUserPreferences();
    console.log('[control-panel] 用户偏好已重置为默认值');
  }
  
  /**
   * 导出用户偏好
   * @returns 包含用户偏好设置的JSON字符串
   */
  public async exportUserPreferences(): Promise<string> {
    return this.userPreferencesManager.exportUserPreferences();
  }
  
  /**
   * 导入用户偏好
   * @param json 包含用户偏好设置的JSON字符串
   * @returns 导入是否成功
   */
  public async importUserPreferences(json: string): Promise<boolean> {
    return this.userPreferencesManager.importUserPreferences(json);
  }
} 