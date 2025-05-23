/**
 * @file control-panel.ts
 * @description 视频翻译控制面板组件，整合存储管理和翻译流程
 */

import { EventBus, EventPriority } from '../events/event-bus';
import { StorageManager, StorageKeys } from '../storage/storage-manager';
import { SettingsManager, UserSettings, SubtitleMode, TranslationApiType, SettingChangeEvent } from '../storage/settings-manager';
import { 
  TranslationDispatcher, 
  SubtitleEvent, 
  ProcessedSubtitleEvent,
  TranslationEvent,
  TranslationPriority
} from '../translation/translation-dispatcher';

/**
 * 控制面板事件类型
 */
export enum ControlPanelEvent {
  PANEL_INITIALIZED = 'controlPanel.initialized',
  PANEL_ERROR = 'controlPanel.error',
  TRANSLATION_STARTED = 'controlPanel.translationStarted',
  TRANSLATION_COMPLETED = 'controlPanel.translationCompleted',
  TRANSLATION_ERROR = 'controlPanel.translationError',
  SETTINGS_CHANGED = 'controlPanel.settingsChanged',
  UI_UPDATE_REQUIRED = 'controlPanel.uiUpdateRequired'
}

/**
 * 控制面板状态
 */
export interface ControlPanelState {
  isInitialized: boolean;
  isTranslating: boolean;
  lastError: string | null;
  currentVideoId: string | null;
  subtitleEvents: ProcessedSubtitleEvent[];
  settings: UserSettings;
}

/**
 * 字幕控制面板类
 * 负责协调字幕翻译流程和用户设置
 */
export class ControlPanel {
  private static instance: ControlPanel;
  private eventBus: EventBus;
  private storageManager: StorageManager;
  private settingsManager: SettingsManager;
  private translationDispatcher: TranslationDispatcher;
  private state: ControlPanelState;
  
  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.storageManager = StorageManager.getInstance();
    this.settingsManager = SettingsManager.getInstance();
    this.translationDispatcher = TranslationDispatcher.getInstance();
    
    // 初始化状态
    this.state = {
      isInitialized: false,
      isTranslating: false,
      lastError: null,
      currentVideoId: null,
      subtitleEvents: [],
      settings: {} as UserSettings
    };
    
    // 设置事件监听器
    this.setupEventListeners();
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
   */
  private setupSettingsListeners(): void {
    // 源语言变更
    this.settingsManager.addChangeListener(
      SettingChangeEvent.SOURCE_LANG_CHANGED,
      (newValue, oldValue) => {
        this.updateState({ settings: { ...this.state.settings, sourceLang: newValue } });
        this.emitEvent(ControlPanelEvent.SETTINGS_CHANGED, { key: 'sourceLang', value: newValue });
      }
    );
    
    // 目标语言变更
    this.settingsManager.addChangeListener(
      SettingChangeEvent.TARGET_LANG_CHANGED, 
      (newValue, oldValue) => {
        this.updateState({ settings: { ...this.state.settings, targetLang: newValue } });
        this.emitEvent(ControlPanelEvent.SETTINGS_CHANGED, { key: 'targetLang', value: newValue });
      }
    );
    
    // 字幕模式变更
    this.settingsManager.addChangeListener(
      SettingChangeEvent.SUBTITLE_MODE_CHANGED,
      (newValue, oldValue) => {
        this.updateState({ settings: { ...this.state.settings, subtitleMode: newValue } });
        this.emitEvent(ControlPanelEvent.SETTINGS_CHANGED, { key: 'subtitleMode', value: newValue });
        this.emitEvent(ControlPanelEvent.UI_UPDATE_REQUIRED, { reason: 'subtitleModeChanged' });
      }
    );
    
    // 翻译开关变更
    this.settingsManager.addChangeListener(
      SettingChangeEvent.TRANSLATE_ACTIVE_CHANGED,
      (newValue, oldValue) => {
        this.updateState({ settings: { ...this.state.settings, translateActive: newValue } });
        this.emitEvent(ControlPanelEvent.SETTINGS_CHANGED, { key: 'translateActive', value: newValue });
        
        // 如果开启翻译，且有字幕事件，自动开始翻译
        if (newValue === true && this.state.currentVideoId && this.state.subtitleEvents.length === 0) {
          // 提示需要获取字幕
          this.emitEvent(ControlPanelEvent.UI_UPDATE_REQUIRED, { reason: 'needSubtitles' });
        }
      }
    );
    
    // 翻译API变更
    this.settingsManager.addChangeListener(
      SettingChangeEvent.TRANSLATION_API_CHANGED,
      (newValue, oldValue) => {
        this.updateState({ settings: { ...this.state.settings, translationApi: newValue } });
        this.emitEvent(ControlPanelEvent.SETTINGS_CHANGED, { key: 'translationApi', value: newValue });
      }
    );
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
          fromCache: data.fromCache
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
    this.eventBus.on('ui.controlsInjected', (data) => {
      console.log('[ControlPanel] 收到UI控件注入完成事件:', data);
      
      // 如果翻译已激活，可以自动开始翻译流程
      if (this.state.settings.translateActive && this.state.currentVideoId) {
        this.emitEvent(ControlPanelEvent.TRANSLATION_STARTED, {
          videoId: this.state.currentVideoId
        });
      }
    });
    
    // 监听UI控件恢复事件
    this.eventBus.on('ui.controlsRecovered', (data) => {
      console.log('[ControlPanel] 收到UI控件恢复事件:', data);
      
      // 如果翻译已激活，重新开始翻译流程
      if (this.state.settings.translateActive && this.state.currentVideoId) {
        this.emitEvent(ControlPanelEvent.TRANSLATION_STARTED, {
          videoId: this.state.currentVideoId
        });
      }
    });
    
    // 监听UI叠加层创建完成事件
    this.eventBus.on('ui.overlayCreated', (data) => {
      console.log('[ControlPanel] 收到UI叠加层创建完成事件:', data);
    });
    
    // 监听UI注入失败事件
    this.eventBus.on('ui.injectionFailed', (data) => {
      console.log('[ControlPanel] 收到UI注入失败事件:', data);
      this.updateState({
        lastError: `UI注入失败: ${data.reason || '未知错误'}`
      });
      
      // 如果是由于达到最大尝试次数，记录额外信息
      if (data.reason === 'MAX_ATTEMPTS_REACHED') {
        console.error(`[ControlPanel] UI注入失败，已尝试 ${data.attempts} 次`);
      }
    });
  }
  
  /**
   * 设置字幕事件监听器
   */
  private setupSubtitleListeners(): void {
    // 监听字幕加载事件
    this.eventBus.on('subtitles:loaded', (data) => {
      console.log('[ControlPanel] 收到字幕轨道加载事件:', data);
      
      if (this.state.isTranslating) {
        console.log('[ControlPanel] 翻译已在进行中，忽略此次字幕加载');
        return;
      }
      
      if (!data.tracks || data.tracks.length === 0) {
        console.warn('[ControlPanel] 字幕轨道为空');
        this.handleTranslationError('没有可用的字幕轨道');
        return;
      }
      
      if (!data.videoId) {
        console.warn('[ControlPanel] 字幕事件缺少videoId');
        this.handleTranslationError('缺少视频ID信息');
        return;
      }
      
      // 确保当前视频ID与加载的字幕匹配
      if (this.state.currentVideoId !== data.videoId) {
        console.log(`[ControlPanel] 更新当前视频ID: ${data.videoId}`);
        this.setCurrentVideo(data.videoId).catch(error => {
          console.error('[ControlPanel] 设置当前视频ID失败:', error);
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
      console.log(`[ControlPanel] 处理${tracks.length}个字幕轨道`);
      
      // 检查字幕轨道数据
      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        throw new Error('无有效的字幕轨道数据');
      }
      
      // 记录轨道信息以便调试
      tracks.forEach((track, index) => {
        console.log(`[ControlPanel] 轨道 #${index}: 语言=${track.languageCode || '未知'}, 种类=${track.kind || '未知'}, 名称=${track.name?.simpleText || '未命名'}`);
      });
      
      // 设置状态为翻译中
      this.updateState({ isTranslating: true });
      
      // 发送翻译开始事件
      this.emitEvent(ControlPanelEvent.TRANSLATION_STARTED, {
        videoId,
        tracksCount: tracks.length
      });
      
      // 获取当前设置
      const { sourceLang, targetLang } = this.state.settings;
      console.log(`[ControlPanel] 使用语言设置: 源语言=${sourceLang}, 目标语言=${targetLang}`);
      
      // 查找最匹配的源语言轨道
      const sourceTrack = this.findBestTrack(tracks, sourceLang);
      if (!sourceTrack) {
        throw new Error(`未找到匹配的${sourceLang}源语言轨道，请检查轨道数据或尝试其他源语言`);
      }
      
      console.log(`[ControlPanel] 找到源语言轨道: ${sourceTrack.languageCode || '未知语言'}, 名称: ${sourceTrack.name?.simpleText || '未命名'}`);
      
      // 获取字幕数据
      console.log(`[ControlPanel] 开始获取源字幕数据...`);
      const subtitles = await this.fetchSubtitleData(sourceTrack);
      if (!subtitles || subtitles.length === 0) {
        throw new Error('未能获取字幕数据，请检查网络连接或尝试刷新页面');
      }
      
      console.log(`[ControlPanel] 成功获取${subtitles.length}条字幕`);
      
      // 开始翻译字幕
      await this.translateSubtitles(subtitles);
      
    } catch (error) {
      console.error('[ControlPanel] 处理字幕轨道失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.handleTranslationError(`处理字幕轨道失败: ${errorMessage}`);
      
      // 重置翻译状态
      this.updateState({ isTranslating: false });
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
        console.warn('[ControlPanel] 字幕轨道缺少baseUrl:', track);
        
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
      
      console.log(`[ControlPanel] 通过baseUrl获取字幕数据: ${track.baseUrl.substring(0, 100)}...`);
      
      // 此处为临时占位，实际实现中需要修改
      return [];
    } catch (error) {
      console.error('[ControlPanel] 获取字幕数据失败:', error);
      throw error;
    }
  }
  
  /**
   * 初始化控制面板
   */
  public async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      return;
    }
    
    try {
      // 初始化设置管理器
      await this.settingsManager.initialize();
      
      // 加载用户设置
      const settings = await this.settingsManager.getAllSettings();
      
      // 更新状态
      this.updateState({
        isInitialized: true,
        settings
      });
      
      // 触发初始化完成事件
      this.emitEvent(ControlPanelEvent.PANEL_INITIALIZED, {
        settings
      });
      
      console.log('控制面板初始化完成');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.updateState({
        lastError: errorMessage
      });
      
      this.emitEvent(ControlPanelEvent.PANEL_ERROR, {
        phase: 'initialization',
        error: errorMessage
      });
      
      console.error('控制面板初始化失败:', error);
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
    if (this.state.currentVideoId === videoId) {
      return;
    }
    
    // 更新状态
    this.updateState({
      currentVideoId: videoId,
      subtitleEvents: [] // 清空之前的字幕事件
    });
    
    // 直接存储到本地存储，不再使用session
    await this.storageManager.set(
      StorageKeys.TEMP.CURRENT_VIDEO_ID,
      videoId,
      'local' // 明确指定使用local存储
    );
    
    // 如果翻译功能已激活，自动触发翻译流程
    if (this.state.settings.translateActive) {
      this.emitEvent(ControlPanelEvent.UI_UPDATE_REQUIRED, {
        reason: 'videoChanged',
        videoId
      });
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
    if (!this.state.isInitialized) {
      throw new Error('控制面板尚未初始化');
    }
    
    if (!this.state.currentVideoId) {
      throw new Error('未设置当前视频ID');
    }
    
    if (subtitles.length === 0) {
      throw new Error('没有可翻译的字幕');
    }
    
    // 获取设置
    const { sourceLang, targetLang, translationApi, subtitleMode } = this.state.settings;
    
    // 创建翻译上下文
    const context = {
      videoId: this.state.currentVideoId,
      sourceEvents: subtitles,
      sourceLang,
      targetLang,
      translationApi,
      subtitleMode,
      currentTime
    };
    
    // 开始渐进式翻译
    await this.translationDispatcher.startProgressiveTranslation(
      context,
      (processedEvents, error) => {
        if (error) {
          this.handleTranslationError(error);
        } else {
          this.handleTranslationComplete(processedEvents);
        }
      }
    );
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
      console.error('保存翻译结果到本地存储失败:', error);
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
   * 获取设置值
   * @param key 设置键
   * @returns 设置值
   */
  public async getSetting<K extends keyof UserSettings>(key: K): Promise<UserSettings[K]> {
    return await this.settingsManager.getSetting(key);
  }
  
  /**
   * 更新设置值
   * @param key 设置键
   * @param value 设置值
   */
  public async updateSetting<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ): Promise<void> {
    await this.settingsManager.setSetting(key, value);
  }
  
  /**
   * 切换翻译状态
   */
  public async toggleTranslation(): Promise<boolean> {
    const currentState = await this.settingsManager.getSetting('translateActive');
    await this.settingsManager.setSetting('translateActive', !currentState);
    return !currentState;
  }
  
  /**
   * 切换字幕模式
   */
  public async toggleSubtitleMode(): Promise<SubtitleMode> {
    const currentMode = await this.settingsManager.getSetting('subtitleMode');
    const newMode = currentMode === SubtitleMode.BILINGUAL 
      ? SubtitleMode.TARGET_ONLY 
      : SubtitleMode.BILINGUAL;
    
    await this.settingsManager.setSetting('subtitleMode', newMode);
    return newMode;
  }
  
  /**
   * 清除翻译缓存
   * @param videoId 可选的视频ID，不提供则清除所有缓存
   */
  public async clearTranslationCache(videoId?: string): Promise<void> {
    if (videoId) {
      // 获取与特定视频相关的所有缓存键
      const cachePrefix = `${StorageKeys.CACHE.TRANSLATIONS_PREFIX}${videoId}`;
      const caches = await this.storageManager.getByPrefix(cachePrefix, 'local');
      
      if (Object.keys(caches).length > 0) {
        await this.storageManager.remove(Object.keys(caches), 'local');
        console.log(`已清除视频 ${videoId} 的翻译缓存`);
      }
    } else {
      // 清除所有翻译缓存
      const allCaches = await this.storageManager.getByPrefix(StorageKeys.CACHE.TRANSLATIONS_PREFIX, 'local');
      
      if (Object.keys(allCaches).length > 0) {
        await this.storageManager.remove(Object.keys(allCaches), 'local');
        console.log('已清除所有翻译缓存');
      }
    }
  }
  
  /**
   * 重置所有设置为默认值
   */
  public async resetAllSettings(): Promise<void> {
    await this.settingsManager.resetAllSettings();
    
    // 更新状态
    const settings = await this.settingsManager.getAllSettings();
    this.updateState({ settings });
    
    this.emitEvent(ControlPanelEvent.SETTINGS_CHANGED, {
      reset: true,
      settings
    });
  }
  
  /**
   * 导出设置为JSON字符串
   */
  public async exportSettings(): Promise<string> {
    return await this.settingsManager.exportSettings();
  }
  
  /**
   * 从JSON字符串导入设置
   * @param json 设置JSON字符串
   */
  public async importSettings(json: string): Promise<boolean> {
    const success = await this.settingsManager.importSettings(json);
    
    if (success) {
      // 更新状态
      const settings = await this.settingsManager.getAllSettings();
      this.updateState({ settings });
      
      this.emitEvent(ControlPanelEvent.SETTINGS_CHANGED, {
        imported: true,
        settings
      });
    }
    
    return success;
  }
} 