/**
 * Main World Script (injected into the page)
 * Responsible for accessing page-level APIs like getPlayerResponse()
 * and communicating back to the content script via postMessage.
 */
// 简化初始化日志

// 保存原始的fetch和XMLHttpRequest（必须在最开始保存）
const originalFetch = window.fetch;
const originalXHROpen = XMLHttpRequest.prototype.open;

// 统一超时配置
const TIMEOUT_CONFIG = {
  INTERCEPTOR: 5000,      // 拦截器5秒超时
  CAPTURE_FALLBACK: 6000  // Content Script 6秒兜底
};

// 并发控制标志
let isInitializing = false;

// 🔧 统一的消息处理器 - 合并事件转发和业务逻辑处理
class MainWorldMessenger {
  private static instance: MainWorldMessenger;
  private initTime: number;
  private messageHandlers: Map<string, (data: any) => Promise<void> | void>;

  constructor() {
    this.initTime = Date.now();
    this.messageHandlers = new Map();
    this.registerBusinessHandlers();
  }

  static getInstance(): MainWorldMessenger {
    if (!MainWorldMessenger.instance) {
      MainWorldMessenger.instance = new MainWorldMessenger();
    }
    return MainWorldMessenger.instance;
  }

  /**
   * 注册业务处理器
   */
  private registerBusinessHandlers(): void {
    // 注册字幕相关的业务处理器
    this.messageHandlers.set('REQUEST_SUBTITLE_CAPTURE', (data) => this.handleSubtitleCapture(data));
    this.messageHandlers.set('DESTROY_SUBTITLE_INTERCEPTOR', () => this.handleDestroyInterceptor());
    this.messageHandlers.set('REQUEST_CAPTION_TRACKS', (data) => this.handleRequestCaptionTracks(data));
    this.messageHandlers.set('GET_SUBTITLE_TRACKS_API', (data) => this.handleGetSubtitleTracksAPI(data));
    this.messageHandlers.set('SET_SUBTITLE_TRACK_API', (data) => this.handleSetSubtitleTrackAPI(data));
    this.messageHandlers.set('CHECK_AD_STATUS', (data) => this.handleCheckAdStatus(data));
  }

  /**
   * 统一的消息处理入口
   */
  async handleMessage(type: string, data: any): Promise<void> {
    const handler = this.messageHandlers.get(type);
    if (handler) {
      // 执行业务处理器
      await handler(data);
    } else {
      // 默认转发行为（用于事件消息）
      this.sendMessage(type, data);
    }
  }

  /**
   * 向content-script发送消息（简化版发送）
   */
  sendMessage(messageType: string, messageData?: any): void {
    try {
      window.postMessage({
        source: 'main-world-messenger',
        type: 'MESSAGE_FORWARDED',
        messageType: messageType,
        messageData: messageData ? JSON.parse(JSON.stringify(messageData)) : null
      }, '*');
    } catch (error) {
      console.error(`[MainWorldMessenger] 发送消息 "${messageType}" 时出错:`, error);
    }
  }

  /**
   * 发送响应消息（用于业务逻辑）
   */
  private sendResponse(type: string, payload?: any, requestId?: string): void {
    const message: any = {
      source: 'main-world',
      type: type,
      payload: payload
    };
    if (requestId) {
      message._requestId = requestId;
    }
    window.postMessage(message, '*');
  }

  // ============ 业务处理器方法 ============

  /**
   * 处理字幕捕获请求
   */
  private handleSubtitleCapture(data: any): void {
    const {
      sourceLanguageCode,
      sourceLanguageName,
      sourceKind,
      originalSubtitleState
    } = data;
    console.debug(
      `[debug][MainWorld] 收到字幕捕获请求 | sourceLanguageName: ${sourceLanguageName}, sourceLanguageCode: ${sourceLanguageCode}, sourceKind: ${sourceKind}, originalSubtitleState: ${originalSubtitleState}`
    );

    // 并发控制：防止重复初始化
    if (!SubtitleInterceptor.isActive() && !isInitializing) {
      isInitializing = true;

      const interceptor = SubtitleInterceptor.getInstance();
      // 传递原始状态给拦截器
      const success = interceptor.initialize({
        sourceLanguageName,
        sourceLanguageCode,
        sourceKind,
        originalSubtitleState
      });

      isInitializing = false;

      if (success) {
        interceptor.triggerSubtitleButton();
      } else {
        console.error('[Main World] 初始化失败');
        // 发送失败消息
        this.sendResponse('INTERCEPTOR_INIT_FAILED', { error: '初始化失败' });
      }
    } else {
      console.debug('[debug][MainWorld] 拦截器已激活或正在初始化，跳过');
    }
  }

  /**
   * 处理销毁拦截器请求
   */
  private handleDestroyInterceptor(): void {
    console.log('[Main World] 收到销毁拦截器请求');
    const interceptor = SubtitleInterceptor.getInstance();
    interceptor.destroy();

    // 发送销毁确认
    this.sendResponse('INTERCEPTOR_DESTROYED', {
      success: true,
      timestamp: Date.now()
    });
  }

  /**
   * 处理获取字幕轨道请求
   */
  private handleRequestCaptionTracks(data: any): void {
    console.log('[Main World] 收到字幕轨道请求');
    const requestId = data._requestId;

    try {
      const player = document.getElementById('movie_player');
      if (player && typeof (player as any).getPlayerResponse === 'function') {
        const playerResponse = (player as any).getPlayerResponse();
        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (captionTracks && captionTracks.length > 0) {
          console.log(`[Main World] 从API获取到${captionTracks.length}条字幕轨道:`, captionTracks);
        } else {
          console.log('[Main World] API返回空的字幕轨道数据');
        }

        // 向content-script发送轨道数据
        this.sendResponse('CAPTION_TRACKS_RESPONSE', {
          captionTracks: captionTracks || null
        }, requestId);

      } else {
        console.warn('[Main World] 未找到movie_player或getPlayerResponse函数');
        this.sendResponse('CAPTION_TRACKS_RESPONSE', null, requestId);
      }
    } catch (error) {
      console.error('[Main World] 访问getPlayerResponse时出错:', error);
      this.sendResponse('CAPTION_TRACKS_RESPONSE', null, requestId);
    }
  }

  /**
   * 处理通过API获取字幕轨道
   */
  private async handleGetSubtitleTracksAPI(data: any): Promise<void> {
    const requestId = data._requestId;
    console.log('[Main World] 收到获取字幕轨道API请求');

    // 初始化API控制器（如果还没有）
    if (!subtitleAPIController) {
      subtitleAPIController = new SubtitleAPIController();
    }

    // 先检测广告状态
    if (subtitleAPIController.isAdPlaying()) {
      console.warn('[Main World] 当前处于广告阶段，返回 ad_playing');
      this.sendResponse('SUBTITLE_TRACKS_API_RESPONSE', {
        success: false,
        tracks: [],
        reason: 'ad_playing',
        error: 'ad_playing'
      }, requestId);
      return;
    }

    try {
      const result = await subtitleAPIController.getAvailableTracks();
      this.sendResponse('SUBTITLE_TRACKS_API_RESPONSE', {
        tracks: result.tracks,
        success: result.success,
        reason: result.reason,
        error: result.error
      }, requestId);
    } catch (error: any) {
      this.sendResponse('SUBTITLE_TRACKS_API_RESPONSE', {
        success: false,
        error: error.message
      }, requestId);
    }
  }

  /**
   * 处理设置字幕语言
   */
  private async handleSetSubtitleTrackAPI(data: any): Promise<void> {
    const { langCode, kind, _requestId: requestId } = data;
    // 删除"收到设置字幕语言API请求"日志（与content-script日志重复）

    if (!subtitleAPIController) {
      subtitleAPIController = new SubtitleAPIController();
    }

    try {
      const result = await subtitleAPIController.setSubtitleTrack(langCode, kind);
      this.sendResponse('SET_SUBTITLE_TRACK_API_RESPONSE', {
        success: result.success,
        langCode: langCode,
        kind: kind,
        reason: result.reason,
        error: result.error
      }, requestId);
    } catch (error: any) {
      this.sendResponse('SET_SUBTITLE_TRACK_API_RESPONSE', {
        success: false,
        error: error.message,
        reason: error?.reason || (error?.category === 'player_not_ready' ? 'player_not_ready' : undefined)
      }, requestId);
    }
  }

  /**
   * 处理广告状态查询
   */
  private handleCheckAdStatus(data: any): void {
    const requestId = data?._requestId;
    if (!subtitleAPIController) {
      subtitleAPIController = new SubtitleAPIController();
    }
    const isAdPlaying = subtitleAPIController.isAdPlaying();
    this.sendResponse('CHECK_AD_STATUS_RESPONSE', {
      isAdPlaying,
      detectedAt: Date.now()
    }, requestId);
  }
}

// 定义消息类型接口
interface MessageTypesInterface {
  BASIC_INIT_DONE: string;
  FULL_INIT_DONE: string;
  NAVIGATION_STARTED: string;
  NAVIGATION_FINISHED: string;
  OVERLAY_CREATED: string;
  CONTROLS_INJECTED: string;
  SUBTITLE_MODE_CHANGED: string;
  // 新增UI管理器消息类型
  UI_CONTROLS_INJECTED: string;
  UI_OVERLAY_CREATED: string;
  UI_INJECTION_FAILED: string;
  [key: string]: string;
}

// 直接定义常用消息类型
const MessageTypesConst: MessageTypesInterface = {
  // 导航相关事件
  NAVIGATION_STARTED: 'navigation:started',
  NAVIGATION_FINISHED: 'navigation:finished',
  
  // 初始化相关事件
  BASIC_INIT_DONE: 'init:basic_done',
  FULL_INIT_DONE: 'init:full_done',
  
  // DOM相关事件
  CONTROLS_INJECTED: 'dom:controls_injected',
  OVERLAY_CREATED: 'dom:overlay_created',
  PLAYER_READY: 'dom:player_ready',
  
  // 翻译相关事件
  TRANSLATION_STARTED: 'translation:started',
  TRANSLATION_FINISHED: 'translation:finished',
  TRANSLATION_ERROR: 'translation:error',
  
  // 字幕相关事件
  SUBTITLES_LOADED: 'subtitles:loaded',
  SUBTITLES_UPDATED: 'subtitles:updated',
  SUBTITLE_MODE_CHANGED: 'subtitles:mode_changed',
  
  // 设置相关事件
  SETTINGS_CHANGED: 'settings:changed',
  TARGET_LANG_CHANGED: 'settings:target_lang_changed',
  SOURCE_LANG_CHANGED: 'settings:source_lang_changed',
  
  // 状态相关事件
  STATE_CHANGED: 'state:changed',
  TRANSLATE_ACTIVE_CHANGED: 'state:translate_active_changed',
  
  // UI管理器事件
  UI_CONTROLS_INJECTED: 'ui.controlsInjected',
  UI_OVERLAY_CREATED: 'ui.overlayCreated',
  UI_INJECTION_FAILED: 'ui.injectionFailed'
};

// YouTube Player API字幕控制器类
class SubtitleAPIController {
  private player: any;
  private captionsModule: string | null = null;
  private readonly READY_TIMEOUT_MS = 5000;
  private readonly READY_POLL_INTERVAL_MS = 250;
  private readonly AD_CLASS_NAMES = ['ad-showing', 'ad-interrupting', 'ad-playing', 'playing-ad'];
  
  constructor() {
    this.refreshPlayerReference();
  }
  
  /**
   * 检测可用的字幕模块（captions或cc）
   */
  private detectModule(): void {
    if (!this.player) return;
    
    try {
      // 加载字幕模块
      if (typeof this.player.loadModule === 'function') {
        this.player.loadModule("captions"); // HTML5播放器
        this.player.loadModule("cc");       // AS3/Flash播放器
      }
      
      // 检测哪个模块可用
      if (typeof this.player.getOptions === 'function') {
        const options = this.player.getOptions();
        if (options && options.includes('captions')) {
          this.captionsModule = 'captions';
          console.log('[SubtitleAPIController] 使用captions模块');
        } else if (options && options.includes('cc')) {
          this.captionsModule = 'cc';
          console.log('[SubtitleAPIController] 使用cc模块');
        }
      }
    } catch (error) {
      console.error('[SubtitleAPIController] 检测模块失败:', error);
    }
  }

  /**
   * 刷新播放器引用（处理SPA导航）
   */
  private refreshPlayerReference(): void {
    const playerElement = document.getElementById('movie_player');
    if (!playerElement) {
      this.player = null;
      this.captionsModule = null;
      return;
    }

    if (playerElement !== this.player) {
      this.player = playerElement;
      this.captionsModule = null;
      this.detectModule();
    }
  }

  /**
   * 判断播放器是否已经就绪
   */
  private isPlayerReady(): boolean {
    if (!this.player) {
      return false;
    }

    if (!this.captionsModule) {
      this.detectModule();
    }

    const hasSetOption = typeof this.player?.setOption === 'function';
    const hasGetOption = typeof this.player?.getOption === 'function';
    return Boolean(this.captionsModule && hasSetOption && hasGetOption);
  }

  /**
   * 等待播放器就绪（包含超时）
   */
  private async waitForPlayerReady(timeoutMs: number = this.READY_TIMEOUT_MS): Promise<{ ready: boolean; reason?: string }> {
    const startTime = Date.now();
    const currentVideoId = new URLSearchParams(window.location.search).get('v');

    // 如果正在播放广告，立即返回
    if (this.isAdPlaying()) {
      console.warn('[SubtitleAPIController] 当前处于广告阶段，跳过字幕轨道设置');
      return { ready: false, reason: 'ad_playing' };
    }

    while (Date.now() - startTime < timeoutMs) {
      this.refreshPlayerReference();
      if (this.isAdPlaying()) {
        console.warn('[SubtitleAPIController] 等待播放器就绪时检测到广告播放');
        return { ready: false, reason: 'ad_playing' };
      }
      if (this.isPlayerReady()) {
        return { ready: true };
      }
      await this.sleep(this.READY_POLL_INTERVAL_MS);
    }

    // 最后再尝试一次
    this.refreshPlayerReference();
    if (this.isAdPlaying()) {
      console.warn('[SubtitleAPIController] 等待播放器就绪超时并检测到广告播放');
      return { ready: false, reason: 'ad_playing' };
    }
    if (this.isPlayerReady()) {
      return { ready: true };
    }

    console.warn(`[SubtitleAPIController] ⏱️ 等待播放器就绪超时 (videoId: ${currentVideoId}, timeout: ${timeoutMs}ms)`);
    return { ready: false, reason: 'timeout' };
  }

  /**
   * 判断当前是否有广告播放
   */
  public isAdPlaying(): boolean {
    this.refreshPlayerReference();
    if (!this.player) {
      return false;
    }

    try {
      const classList: DOMTokenList | undefined = this.player.classList;
      if (classList) {
        const hasAdClass = this.AD_CLASS_NAMES.some(cls => classList.contains(cls));
        if (hasAdClass) {
          return true;
        }
      }

      if (typeof this.player.getVideoData === 'function') {
        const videoData = this.player.getVideoData();
        if (videoData?.isAdPlaying === true) {
          return true;
        }
      }

      if (typeof this.player.getAdState === 'function') {
        const adState = this.player.getAdState();
        if (adState !== undefined && adState !== -1) {
          return true;
        }
      }
    } catch (error) {
      console.warn('[SubtitleAPIController] 检测广告状态失败:', error);
    }

    return false;
  }
  
  /**
   * 获取可用的字幕轨道列表（使用ISO 639-1语言代码）
   */
  async getAvailableTracks(): Promise<{ success: boolean; tracks: any[]; reason?: string; error?: string }> {
    const readyResult = await this.waitForPlayerReady(3000);
    if (!readyResult.ready) {
      console.warn(`[SubtitleAPIController] 播放器未就绪，无法获取轨道列表 (reason: ${readyResult.reason})`);
      return {
        success: false,
        tracks: [],
        reason: readyResult.reason
      };
    }

    try {
      // 🔍 获取当前videoId用于日志追踪
      const currentVideoId = new URLSearchParams(window.location.search).get('v');
      console.log(`[SubtitleAPIController] 🔍 getAvailableTracks - 当前URL的videoId: ${currentVideoId}`);

      // 🔧 等待tracklist加载完成（最多3秒）
      let tracks = this.player.getOption(this.captionsModule, 'tracklist');
      let retries = 0;
      const maxRetries = 6; // 6次 * 500ms = 3秒

      while ((!tracks || !Array.isArray(tracks) || tracks.length === 0) && retries < maxRetries) {
        console.debug(`[SubtitleAPIController] ⏳ 等待tracklist加载... 尝试 ${retries + 1}/${maxRetries}, 当前: ${tracks?.length || 0}条`);
        await new Promise(resolve => setTimeout(resolve, 500));
        tracks = this.player.getOption(this.captionsModule, 'tracklist');
        retries++;
      }

      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        console.warn(`[SubtitleAPIController] ⚠️ tracklist加载超时或为空，已等待${retries * 500}ms (videoId: ${currentVideoId})`);
        return {
          success: false,
          tracks: [],
          reason: 'tracklist_empty'
        };
      }

      console.log(`[SubtitleAPIController] ✓ tracklist已加载，获取到 ${tracks.length} 个字幕轨道 (videoId: ${currentVideoId}, 等待: ${retries * 500}ms)`);

      if (tracks && Array.isArray(tracks)) {
        // 返回包含ISO 639-1语言代码的轨道信息
        const normalizedTracks = tracks.map(track => {
          const rawKind = track.kind;
          const normalizedKind = rawKind === 'asr' || rawKind === 'forced' ? rawKind : undefined;
          return {
            languageCode: track.languageCode,      // ISO 639-1代码 (如: en, fr, de, zh)
            languageName: track.languageName || track.displayName || '',
            kind: normalizedKind,
            isDefault: track.is_default || false,
            isTranslatable: track.is_translateable || track.is_translatable || false,
            vssId: track.vss_id || track.vssId || ''
          };
        });
        return {
          success: true,
          tracks: normalizedTracks
        };
      }
      
      return {
        success: true,
        tracks: []
      };
    } catch (error) {
      console.error('[SubtitleAPIController] 获取字幕轨道失败:', error);
      return {
        success: false,
        tracks: [],
        reason: 'exception',
        error: (error as Error)?.message
      };
    }
  }
  
  /**
   * 设置字幕语言（使用ISO 639-1语言代码）
   * @param langCode ISO 639-1语言代码，如: en, fr, de, zh, ja, ko等
   * @param kind 字幕类型，如: asr (自动生成), 无值表示人工字幕
   */
  async setSubtitleTrack(langCode: string, kind?: string): Promise<{ success: boolean; reason?: string; error?: string }> {
    if (this.isAdPlaying()) {
      console.warn('[SubtitleAPIController] 当前正在播放广告，跳过字幕切换');
      return {
        success: false,
        reason: 'ad_playing'
      };
    }

    const readyResult = await this.waitForPlayerReady(this.READY_TIMEOUT_MS);
    if (!readyResult.ready) {
      const failureReason = readyResult.reason || 'player_not_ready';
      console.error(`[SubtitleAPIController] 播放器或模块未就绪，设置字幕失败 (reason: ${failureReason})`);
      return {
        success: false,
        reason: failureReason
      };
    }

    // 检测ASR轨道，使用UI方法
    if (kind === 'asr') {
      console.log('[SubtitleAPIController] 检测到ASR轨道，使用UI方法');
      const success = await this.selectASRViaUI(langCode);
      return { success };
    }

    try {
      // 删除emoji日志（与service-worker日志重复）
      console.debug(`[debug][SubtitleAPIController] 设置字幕轨道: ${langCode}${kind ? ' (' + kind + ')' : ''}`);

      // 🔥 核心简化：直接设置，不验证tracklist
      // Service Worker已经通过getSubtitleTracksAPI验证过轨道存在
      // YouTube API会自动处理：轨道存在则切换，不存在则静默失败

      // 设置字幕轨道（使用ISO 639-1标准）
      const trackConfig: any = { "languageCode": langCode };
      if (kind !== undefined) {
        trackConfig.kind = kind;
      }

      this.player.setOption(this.captionsModule, 'track', trackConfig);

      // 如果使用的是旧模块，也尝试设置
      if (this.captionsModule === 'captions') {
        this.player.setOption('cc', 'track', trackConfig);
      } else {
        this.player.setOption('captions', 'track', trackConfig);
      }

      try {
        const currentTrack = this.player.getOption(this.captionsModule, 'track');
        console.debug('[debug][SubtitleAPIController] setOption之后当前轨道', currentTrack);
      } catch (inspectError) {
        console.warn('[SubtitleAPIController] 获取当前轨道失败:', inspectError);
      }

      // 确保字幕按钮开启
      const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
      if (subtitleBtn && subtitleBtn.getAttribute('aria-pressed') !== 'true') {
        subtitleBtn.click();
        console.debug('[debug][SubtitleAPIController] 已开启字幕显示');
      }

      // 删除"成功切换"日志（与service-worker日志重复）
      return { success: true };
      
    } catch (error) {
      console.error('[SubtitleAPIController] 设置字幕语言失败:', error);
      return {
        success: false,
        error: (error as Error)?.message || 'set_option_failed'
      };
    }
  }
  
  /**
   * 获取当前字幕语言
   */
  getCurrentTrack(): string | null {
    if (!this.player || !this.captionsModule) {
      return null;
    }

    try {
      const currentTrack = this.player.getOption(this.captionsModule, 'track');
      return currentTrack?.languageCode || null;
    } catch (error) {
      console.error('[SubtitleAPIController] 获取当前字幕失败:', error);
      return null;
    }
  }

  /**
   * 通过UI菜单选择ASR轨道
   * @param langCode 语言代码（如: en）
   */
  private async selectASRViaUI(langCode: string): Promise<boolean> {
    try {
      // Step 1: 打开设置菜单
      const settingsBtn = document.querySelector('.ytp-settings-button') as HTMLElement;
      if (!settingsBtn) {
        console.error('[SubtitleAPIController] 未找到设置按钮');
        return false;
      }

      settingsBtn.click();
      await this.sleep(300);

      // Step 2: 进入字幕菜单
      const menuItems = document.querySelectorAll('.ytp-settings-menu .ytp-menuitem');
      let subtitleMenuItem: HTMLElement | null = null;

      menuItems.forEach(item => {
        const label = item.querySelector('.ytp-menuitem-label');
        if (label && this.isSubtitleMenuItem(label.textContent || '')) {
          subtitleMenuItem = item as HTMLElement;
        }
      });

      if (!subtitleMenuItem) {
        console.error('[SubtitleAPIController] 未找到字幕菜单项');
        settingsBtn.click(); // 关闭菜单
        return false;
      }

      subtitleMenuItem.click();
      await this.sleep(300);

      // Step 3: 选择ASR选项
      const subtitleOptions = document.querySelectorAll('.ytp-panel-menu .ytp-menuitem');
      let asrOption: HTMLElement | null = null;

      subtitleOptions.forEach(option => {
        const label = option.querySelector('.ytp-menuitem-label');
        if (label) {
          const text = label.textContent?.trim() || '';
          // 匹配自动生成的选项
          if (this.matchesLanguage(text, langCode) && this.isAutoGenerated(text)) {
            asrOption = option as HTMLElement;
            console.log('[SubtitleAPIController] 找到ASR选项:', text);
          }
        }
      });

      if (asrOption) {
        asrOption.click();
        await this.sleep(300);

        // Step 4: 关闭菜单
        const backBtn = document.querySelector('.ytp-panel-back-button') as HTMLElement;
        if (backBtn) {
          backBtn.click();
          await this.sleep(100);
        }
        settingsBtn.click();

        console.log('[SubtitleAPIController] ✓ 成功通过UI选择ASR轨道:', langCode);
        return true;
      }

      // 关闭菜单
      const backBtn = document.querySelector('.ytp-panel-back-button') as HTMLElement;
      if (backBtn) {
        backBtn.click();
        await this.sleep(100);
      }
      settingsBtn.click();

      console.warn('[SubtitleAPIController] 未找到ASR轨道，尝试API回退');
      // 如果UI方法失败，回退到API方法尝试普通轨道
      return await this.fallbackToNormalTrack(langCode);

    } catch (error) {
      console.error('[SubtitleAPIController] UI选择ASR失败:', error);
      return false;
    }
  }

  /**
   * 回退到普通轨道（非ASR）
   */
  private async fallbackToNormalTrack(langCode: string): Promise<boolean> {
    try {
      const trackConfig = { languageCode: langCode };
      this.player.setOption(this.captionsModule, 'track', trackConfig);

      // 确保字幕按钮开启
      const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
      if (subtitleBtn && subtitleBtn.getAttribute('aria-pressed') !== 'true') {
        subtitleBtn.click();
        await this.sleep(100);
      }

      console.log('[SubtitleAPIController] 已回退到普通轨道:', langCode);
      return true;
    } catch (error) {
      console.error('[SubtitleAPIController] 回退失败:', error);
      return false;
    }
  }

  /**
   * 辅助函数：延时
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 辅助函数：判断是否为字幕菜单项
   */
  private isSubtitleMenuItem(text: string): boolean {
    return text.includes('字幕') ||
           text.includes('Subtitle') ||
           text.includes('Caption') ||
           text.includes('CC');
  }

  /**
   * 辅助函数：匹配语言
   */
  private matchesLanguage(text: string, langCode: string): boolean {
    const languageNames: { [key: string]: string[] } = {
      'en': ['英语', '英文', 'English'],
      'zh': ['中文', '中国', 'Chinese'],
      'ja': ['日语', '日文', 'Japanese'],
      'ko': ['韩语', '韩文', 'Korean'],
      'es': ['西班牙语', 'Spanish'],
      'fr': ['法语', 'French'],
      'de': ['德语', 'German'],
      'ru': ['俄语', 'Russian']
    };

    const names = languageNames[langCode];
    if (!names) return false;

    return names.some(name => text.includes(name));
  }

  /**
   * 辅助函数：判断是否为自动生成
   */
  private isAutoGenerated(text: string): boolean {
    return text.includes('自动生成') ||
           text.includes('auto-generated') ||
           text.includes('automatic') ||
           text.includes('自动') ||
           text.includes('auto');
  }
}

// 全局字幕API控制器实例
let subtitleAPIController: SubtitleAPIController | null = null;

// 字幕拦截器类（优化版）
interface SubtitleInterceptorInitOptions {
  sourceLanguageName?: string;
  sourceLanguageCode?: string;
  sourceKind?: string;
  originalSubtitleState?: boolean;
}

class SubtitleInterceptor {
  private static instance: SubtitleInterceptor | null = null;
  private capturedSubtitles: any[] = [];
  private capturedUrl: string | null = null;
  private isActive: boolean = false;  // 简化状态管理
  private destroyTimer: number | null = null;  // 超时保护
  private targetSourceLanguageName: string | null = null;  // 目标源语言名称
  private targetSourceLanguageCode: string | null = null;  // 目标源语言代码
  private targetSourceKind: string | null = null;  // 目标字幕类型（手动/asr）
  private originalSubtitleState: boolean | null = null;  // 保存原始字幕按钮状态

  static getInstance(): SubtitleInterceptor {
    // 单例模式，确保全局只有一个实例
    if (!SubtitleInterceptor.instance) {
      SubtitleInterceptor.instance = new SubtitleInterceptor();
    }
    return SubtitleInterceptor.instance;
  }

  // 检查拦截器是否激活
  static isActive(): boolean {
    return SubtitleInterceptor.instance?.isActive || false;
  }

  // 初始化返回成功状态
  initialize(options: SubtitleInterceptorInitOptions = {}): boolean {
    const {
      sourceLanguageName,
      sourceLanguageCode,
      sourceKind,
      originalSubtitleState
    } = options;

    if (this.isActive) {
      console.log('[SubtitleInterceptor] 拦截器已激活，跳过初始化');
      return true;
    }

    // 保存目标参数
    this.targetSourceLanguageName = sourceLanguageName || null;
    this.targetSourceLanguageCode = sourceLanguageCode || null;
    this.targetSourceKind = sourceKind || null;
    this.originalSubtitleState = originalSubtitleState ?? null;

    if (!subtitleAPIController) {
      try {
        subtitleAPIController = new SubtitleAPIController();
      } catch (controllerError) {
        console.warn('[SubtitleInterceptor] SubtitleAPIController 初始化失败:', controllerError);
      }
    }

    try {
      const currentTrack = subtitleAPIController?.getCurrentTrack?.();
      const buttonState = this.originalSubtitleState !== null ? (this.originalSubtitleState ? '已开启' : '已关闭') : '未知';
      console.log(`[SubtitleInterceptor] 🚀 初始化 | 当前轨道: ${currentTrack || '无'} | 按钮状态: ${buttonState}`);

      const self = this;

      // 劫持fetch
      window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : args[0]?.toString());

        // 直接拦截所有timedtext请求，因为YouTube已经在请求我们通过API选定的字幕轨道
        if (url && url.includes('timedtext')) {
          self.capturedUrl = url;

          const response = await originalFetch(...args);
          const clone = response.clone();

          // 异步处理字幕数据
          self.processSubtitleResponse(clone, url);

          return response;
        }

        return originalFetch(...args);
      };

      // 劫持XMLHttpRequest
      XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
        const urlString = url.toString();
        // 直接拦截所有timedtext请求，因为YouTube已经在请求我们通过API选定的字幕轨道
        if (urlString && urlString.includes('timedtext')) {
          self.capturedUrl = urlString;

          const xhr = this;
          const loadHandler = function() {
            self.processXHRResponse(xhr.responseText, urlString);
          };
          xhr.addEventListener('load', loadHandler, { once: true });
        }
        return originalXHROpen.apply(this, [method, url, async, username, password] as any);
      };

      this.isActive = true;

      // 设置5秒超时自动销毁（与Service Worker同步）
      this.destroyTimer = window.setTimeout(() => {
        console.log('[SubtitleInterceptor] ⏱️ 5秒超时自动销毁');
        this.destroy();
        // 通知content-script超时
        window.postMessage({
          source: 'main-world',
          type: 'INTERCEPTOR_TIMEOUT',
          payload: { reason: '5秒超时' }
        }, '*');
      }, TIMEOUT_CONFIG.INTERCEPTOR);

      return true;

    } catch (error) {
      console.error('[SubtitleInterceptor] ❌ 初始化失败:', error);
      return false;
    }
  }

  /**
   * 销毁拦截器，恢复原始的fetch和XMLHttpRequest
   */
  destroy(): void {
    if (!this.isActive) {
      console.log('[SubtitleInterceptor] 拦截器未激活，无需销毁');
      return;
    }

    // 清除超时计时器
    if (this.destroyTimer) {
      clearTimeout(this.destroyTimer);
      this.destroyTimer = null;
    }

    // 恢复原始的fetch和XMLHttpRequest
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXHROpen;

    // 清理状态
    this.capturedSubtitles = [];
    this.capturedUrl = null;
    this.isActive = false;
    this.originalSubtitleState = null;  // 清理原始状态
    this.targetSourceLanguageName = null;
    this.targetSourceLanguageCode = null;
    this.targetSourceKind = null;

    // 清理全局字幕数据
    delete (window as any).__capturedSubtitles;

    // 清理静态实例引用
    SubtitleInterceptor.instance = null;

    console.log('[SubtitleInterceptor] ✅ 拦截器已销毁');
  }

  private async processSubtitleResponse(response: Response, url: string): Promise<void> {
    // 如果拦截器未激活，不处理响应
    if (!this.isActive) {
      console.log('[SubtitleInterceptor] 拦截器未激活，忽略响应');
      return;
    }

    try {
      const text = await response.text();
      // 移除中间步骤日志

      // 尝试解析为JSON
      try {
        const data = JSON.parse(text);
        if (data.events) {
          // JSON3格式
          const subtitles = this.parseJson3Subtitles(data);
          this.saveAndNotify(subtitles);
        }
      } catch (e) {
        // 可能是XML格式
        const subtitles = this.parseXmlSubtitles(text);
        if (subtitles.length > 0) {
          this.saveAndNotify(subtitles);
        }
      }
    } catch (error) {
      console.error('[SubtitleInterceptor] 处理字幕响应失败:', error);
    }
  }

  private processXHRResponse(responseText: string, url: string): void {
    // 如果拦截器未激活，不处理响应
    if (!this.isActive) {
      console.log('[SubtitleInterceptor] 拦截器未激活，忽略XHR响应');
      return;
    }

    try {
      // 移除中间步骤日志

      // 尝试解析为JSON
      try {
        const data = JSON.parse(responseText);
        if (data.events) {
          // JSON3格式
          const subtitles = this.parseJson3Subtitles(data);
          this.saveAndNotify(subtitles);
        }
      } catch (e) {
        // 可能是XML格式
        const subtitles = this.parseXmlSubtitles(responseText);
        if (subtitles.length > 0) {
          this.saveAndNotify(subtitles);
        }
      }
    } catch (error) {
      console.error('[SubtitleInterceptor] 处理XHR字幕响应失败:', error);
    }
  }

  private parseJson3Subtitles(data: any): any[] {
    const subtitles: any[] = [];
    if (data.events) {
      data.events.forEach((event: any) => {
        if (event.segs) {
          const text = event.segs.map((seg: any) => seg.utf8).join('');
          if (text.trim()) {
            subtitles.push({
              start: (event.tStartMs || 0) / 1000,
              duration: (event.dDurationMs || 0) / 1000,
              end: ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000,
              text: text.trim()
            });
          }
        }
      });
    }
    return subtitles;
  }

  private parseXmlSubtitles(xmlText: string): any[] {
    const subtitles: any[] = [];
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const texts = xmlDoc.getElementsByTagName('text');
      
      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const start = parseFloat(text.getAttribute('start') || '0');
        const dur = parseFloat(text.getAttribute('dur') || '0');
        subtitles.push({
          start: start,
          duration: dur,
          end: start + dur,
          text: text.textContent || ''
        });
      }
    } catch (error) {
      console.error('[SubtitleInterceptor] XML解析失败:', error);
    }
    return subtitles;
  }

  private saveAndNotify(subtitles: any[]): void {
    if (subtitles.length === 0) return;

    // 如果拦截器未激活，不保存和通知
    if (!this.isActive) {
      console.log('[SubtitleInterceptor] 拦截器未激活，不保存字幕');
      return;
    }

    // 保存到全局变量
    this.capturedSubtitles = subtitles;
    (window as any).__capturedSubtitles = subtitles;
    
    // 通知content-script，包含原始状态信息
    window.postMessage({
      source: 'main-world',
      type: 'SUBTITLE_CAPTURED',
      payload: {
        subtitles: subtitles,
        url: this.capturedUrl,
        count: subtitles.length,
        originalSubtitleState: this.originalSubtitleState,  // 传递原始状态
        needsRestore: this.originalSubtitleState === false  // 如果原本是关闭的，需要恢复
      }
    }, '*');
    
    // 提取语言代码（从URL中）
    const langMatch = this.capturedUrl?.match(/[&?]lang=([^&]+)/);
    const lang = langMatch ? langMatch[1] : 'unknown';
    console.log(`[SubtitleInterceptor] 🎯 捕获字幕 | ${subtitles.length}条 | ${lang}`);
  }

  triggerSubtitleButton(): void {
    setTimeout(() => {
      const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
      if (subtitleBtn) {
        const isPressed = subtitleBtn.getAttribute('aria-pressed') === 'true';
        console.log(`[SubtitleInterceptor] → 触发字幕按钮 | 当前状态: ${isPressed ? 'ON' : 'OFF'} | 操作: ${!isPressed ? 'enable' : 'toggle-off→toggle-on'}`);

        const clickOnce = () => {
          subtitleBtn.click();
        };

        if (!isPressed) {
          clickOnce();
        } else {
          clickOnce();
          setTimeout(() => clickOnce(), 500);
        }
      } else {
        console.warn('[SubtitleInterceptor] 未找到字幕按钮');
      }
    }, 1000);
  }
}


// 创建并初始化MainWorldMessenger实例
const messengerInstance = MainWorldMessenger.getInstance();

// 安全地注册Messenger实例到window对象，仅供主世界脚本内部使用
// 不再需要让content-script直接访问这个对象
try {
  // 给Messenger和事件类型加上时间戳，确保唯一性
  const timestamp = Date.now();
  const mainWorldMessengerKey = `__MAIN_WORLD_MESSENGER_${timestamp}__`;
  
  // 使用Symbol作为属性键，增加安全性
  const internalKey = Symbol('mainWorldMessenger');
  
  // 将Messenger实例安全地存储在window对象上，但不直接暴露
  (window as any)[internalKey] = {
    messenger: messengerInstance,
    MessageTypes: MessageTypesConst,
    created: timestamp
  };
  
  console.log('[Main World] MainWorldMessenger实例已创建，时间戳:', timestamp);
  
  // 统一的消息监听器 - 处理所有来自content-script的消息
  const handleContentScriptMessage = async (event: MessageEvent) => {
    if (event.source !== window) return;
    const { data } = event;
    if (!data || typeof data !== 'object') return;

    // 处理来自content-script-messenger的事件转发请求
    if (data.source === 'content-script-messenger' && data.type === 'SEND_MESSAGE') {
      try {
        const { messageType, messageData } = data;
        if (messageType) {
          console.log(`[Main World] 收到来自content-script的消息请求:`, messageType);
          messengerInstance.sendMessage(messageType, messageData);
        }
      } catch (e) {
        console.error('[Main World] 处理content-script消息请求时出错:', e);
      }
    }

    // 处理来自content-script的业务请求
    if (data.source === 'content-script') {
      const { type } = data;
      if (type) {
        console.log(`[Main World] 处理业务请求: ${type}`);
        await messengerInstance.handleMessage(type, data);
      }
    }
  };

  // 只需要一个监听器处理所有消息
  window.addEventListener('message', handleContentScriptMessage);
  
  } catch (error) {
    console.error('[Main World] MainWorldMessenger初始化时出错:', error);
  }

// 🔥 架构重构：已将所有消息处理整合到MainWorldMessenger
// 不再需要第二个监听器，所有消息通过统一的handleContentScriptMessage处理
// 🔥 架构重构：移除页面加载就绪消息发送，简化架构
window.addEventListener('load', () => {
  console.log('[Main World] 页面加载完成');
});

// 🔥 架构重构：彻底移除就绪消息机制

// 导出空对象以满足TypeScript的isolatedModules要求
export {}; 
