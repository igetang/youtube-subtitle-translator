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
    console.debug('[debug][MainWorld] 收到字幕捕获请求', data);

    const { sourceLang, sourceKind, originalSubtitleState } = data;
    console.debug('[debug][MainWorld] 目标字幕参数', {
      sourceLang,
      sourceKind,
      originalSubtitleState
    });
    if (originalSubtitleState !== undefined) {
      console.debug('[debug][MainWorld] 字幕按钮原始状态', originalSubtitleState);
    }

    // 并发控制：防止重复初始化
    if (!SubtitleInterceptor.isActive() && !isInitializing) {
      isInitializing = true;

      const interceptor = SubtitleInterceptor.getInstance();
      // 传递原始状态给拦截器
      const success = interceptor.initialize(sourceLang, sourceKind, originalSubtitleState);

      isInitializing = false;

      if (success) {
        console.debug('[debug][MainWorld] 拦截器初始化成功，准备触发字幕按钮');
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

    try {
      const tracks = await subtitleAPIController.getAvailableTracks();
      this.sendResponse('SUBTITLE_TRACKS_API_RESPONSE', {
        tracks: tracks,
        success: true
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
    const { langCode, _requestId: requestId } = data;
    console.debug('[debug][MainWorld] 收到设置字幕语言API请求', {
      langCode,
      requestId
    });

    if (!subtitleAPIController) {
      subtitleAPIController = new SubtitleAPIController();
    }

    try {
      const success = await subtitleAPIController.setSubtitleTrack(langCode);
      this.sendResponse('SET_SUBTITLE_TRACK_API_RESPONSE', {
        success: success,
        langCode: langCode
      }, requestId);
    } catch (error: any) {
      this.sendResponse('SET_SUBTITLE_TRACK_API_RESPONSE', {
        success: false,
        error: error.message
      }, requestId);
    }
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
  
  constructor() {
    this.player = document.getElementById('movie_player');
    this.detectModule();
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
   * 获取可用的字幕轨道列表（使用ISO 639-1语言代码）
   */
  async getAvailableTracks(): Promise<any[]> {
    if (!this.player || !this.captionsModule) {
      console.warn('[SubtitleAPIController] 播放器或模块未就绪');
      return [];
    }
    
    try {
      // 获取字幕轨道列表
      const tracks = this.player.getOption(this.captionsModule, 'tracklist');
      
      if (tracks && Array.isArray(tracks)) {
        console.log(`[SubtitleAPIController] 获取到 ${tracks.length} 个字幕轨道`);
        // 返回包含ISO 639-1语言代码的轨道信息
        return tracks.map(track => ({
          languageCode: track.languageCode,      // ISO 639-1代码 (如: en, fr, de, zh)
          languageName: track.languageName || track.displayName || '',
          kind: track.kind || '',
          isDefault: track.is_default || false,
          isTranslatable: track.is_translateable || track.is_translatable || false,
          vssId: track.vss_id || track.vssId || ''
        }));
      }
      
      return [];
    } catch (error) {
      console.error('[SubtitleAPIController] 获取字幕轨道失败:', error);
      return [];
    }
  }
  
  /**
   * 设置字幕语言（使用ISO 639-1语言代码）
   * @param langCode ISO 639-1语言代码，如: en, fr, de, zh, ja, ko等
   */
  async setSubtitleTrack(langCode: string): Promise<boolean> {
    if (!this.player || !this.captionsModule) {
      console.error('[SubtitleAPIController] 播放器或模块未就绪');
      return false;
    }

    try {
      console.debug('[debug][SubtitleAPIController] 尝试切换字幕语言', {
        langCode,
        module: this.captionsModule
      });

      const trackList = this.player.getOption(this.captionsModule, 'tracklist') || [];
      try {
        const snapshot = trackList.slice(0, 6).map((track: any) => ({
          languageCode: track.languageCode ?? track.language_code ?? null,
          vssId: track.vssId ?? track.vss_id ?? null,
          kind: track.kind ?? null,
          hasBaseUrl: Boolean(track.baseUrl)
        }));
        console.debug('[debug][SubtitleAPIController] tracklist 快照(前6条)', snapshot);
      } catch (snapshotError) {
        console.warn('[SubtitleAPIController] tracklist 快照记录失败:', snapshotError);
      }

      const candidateTrack = trackList.find((track: any) => {
        const trackLang = track.languageCode ?? track.language_code;
        return trackLang === langCode;
      });
      console.debug('[debug][SubtitleAPIController] tracklist 匹配结果', candidateTrack ? {
        languageCode: candidateTrack.languageCode ?? candidateTrack.language_code,
        vssId: candidateTrack.vssId ?? candidateTrack.vss_id ?? null,
        kind: candidateTrack.kind ?? null
      } : '未找到');

      if (!candidateTrack) {
        console.warn('[SubtitleAPIController] tracklist 未找到匹配轨道，准备从playerResponse补足');
      }

      // 设置字幕轨道（使用ISO 639-1标准）
      this.player.setOption(this.captionsModule, 'track', {
        "languageCode": langCode
      });

      // 如果使用的是旧模块，也尝试设置
      if (this.captionsModule === 'captions') {
        this.player.setOption('cc', 'track', {"languageCode": langCode});
      } else {
        this.player.setOption('captions', 'track', {"languageCode": langCode});
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
        console.log('[SubtitleAPIController] 已开启字幕显示');
      }
      
      console.log(`[SubtitleAPIController] ✓ 成功切换到语言: ${langCode}`);
      return true;
      
    } catch (error) {
      console.error('[SubtitleAPIController] 设置字幕语言失败:', error);
      return false;
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
}

// 全局字幕API控制器实例
let subtitleAPIController: SubtitleAPIController | null = null;

// 字幕拦截器类（优化版）
class SubtitleInterceptor {
  private static instance: SubtitleInterceptor | null = null;
  private capturedSubtitles: any[] = [];
  private capturedUrl: string | null = null;
  private isActive: boolean = false;  // 简化状态管理
  private destroyTimer: number | null = null;  // 超时保护
  private targetSourceLang: string | null = null;  // 目标源语言
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
  initialize(sourceLang?: string, sourceKind?: string, originalSubtitleState?: boolean): boolean {
    if (this.isActive) {
      console.log('[SubtitleInterceptor] 拦截器已激活，跳过初始化');
      return true;
    }

    // 保存目标参数
    this.targetSourceLang = sourceLang || null;
    this.targetSourceKind = sourceKind || null;
    this.originalSubtitleState = originalSubtitleState ?? null;
    console.debug('[debug][SubtitleInterceptor] 目标字幕', {
      targetSourceLang: this.targetSourceLang,
      targetSourceKind: this.targetSourceKind
    });
    if (this.originalSubtitleState !== null) {
      console.debug('[debug][SubtitleInterceptor] 原始字幕按钮状态', this.originalSubtitleState);
    }

    if (!subtitleAPIController) {
      try {
        subtitleAPIController = new SubtitleAPIController();
        console.debug('[debug][SubtitleInterceptor] 初始化 SubtitleAPIController 实例');
      } catch (controllerError) {
        console.warn('[SubtitleInterceptor] SubtitleAPIController 初始化失败:', controllerError);
      }
    }

    try {
      const currentTrack = subtitleAPIController?.getCurrentTrack?.();
      console.debug('[debug][SubtitleInterceptor] 初始化前播放器当前轨道', currentTrack);
    } catch (trackError) {
      console.warn('[SubtitleInterceptor] 获取当前轨道失败:', trackError);
    }

    if (subtitleAPIController && subtitleAPIController.getAvailableTracks) {
      subtitleAPIController.getAvailableTracks().then((tracks: any[]) => {
        if (tracks) {
          const snapshot = tracks.slice(0, 6).map(track => ({
            languageCode: track.languageCode,
            vssId: track.vssId ?? track.vss_id ?? null,
            kind: track.kind ?? null
          }));
          console.debug('[debug][SubtitleInterceptor] 初始化时可用轨道快照', snapshot);
        }
      }).catch(err => {
        console.warn('[SubtitleInterceptor] 获取可用轨道失败:', err);
      });
    }

    try {
      console.log('[SubtitleInterceptor] 🚀 按需初始化拦截器...');

      const self = this;

      // 劫持fetch
      window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : args[0]?.toString());

        // 直接拦截所有timedtext请求，因为YouTube已经在请求我们通过API选定的字幕轨道
        if (url && url.includes('timedtext')) {
          console.log('[SubtitleInterceptor] 🎯 捕获到字幕URL (Fetch):', url);
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
          console.log('[SubtitleInterceptor] 🎯 捕获到字幕URL (XHR):', urlString);
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

      console.log('[SubtitleInterceptor] ✅ 初始化成功');
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

    console.log('[SubtitleInterceptor] 🔧 销毁拦截器...');

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
          console.log('[SubtitleInterceptor] ✅ JSON3格式字幕解析成功，共', subtitles.length, '条');
        }
      } catch (e) {
        // 可能是XML格式
        const subtitles = this.parseXmlSubtitles(text);
        if (subtitles.length > 0) {
          this.saveAndNotify(subtitles);
          console.log('[SubtitleInterceptor] ✅ XML格式字幕解析成功，共', subtitles.length, '条');
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
          console.log('[SubtitleInterceptor] ✅ XHR JSON3格式字幕解析成功，共', subtitles.length, '条');
        }
      } catch (e) {
        // 可能是XML格式
        const subtitles = this.parseXmlSubtitles(responseText);
        if (subtitles.length > 0) {
          this.saveAndNotify(subtitles);
          console.log('[SubtitleInterceptor] ✅ XHR XML格式字幕解析成功，共', subtitles.length, '条');
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
    
    console.log('[SubtitleInterceptor] 📝 字幕已保存并通知，共', subtitles.length, '条');
    console.log('[SubtitleInterceptor] 📝 前3条示例:', subtitles.slice(0, 3));
  }

  triggerSubtitleButton(): void {
    console.debug('[debug][SubtitleInterceptor] 尝试自动触发字幕按钮', {
      targetSourceLang: this.targetSourceLang,
      targetSourceKind: this.targetSourceKind
    });

    const logCurrentTrack = (stage: string) => {
      try {
        if (subtitleAPIController) {
          const current = subtitleAPIController.getCurrentTrack();
          console.debug('[debug][SubtitleInterceptor] 播放器轨道状态', { stage, current });
        }
      } catch (error) {
        console.warn('[SubtitleInterceptor] 获取播放器轨道失败', { stage, error });
      }
    };

    logCurrentTrack('before-toggle');

    setTimeout(() => {
      const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
      if (subtitleBtn) {
        const isPressed = subtitleBtn.getAttribute('aria-pressed') === 'true';
        console.debug('[debug][SubtitleInterceptor] 字幕按钮当前状态', {
          isPressed,
          targetSourceLang: this.targetSourceLang
        });

        const clickOnce = (stage: string) => {
          subtitleBtn.click();
          console.debug('[debug][SubtitleInterceptor] 已点击字幕按钮', { stage });
          setTimeout(() => logCurrentTrack(stage), 150);
        };

        if (!isPressed) {
          clickOnce('enable');
        } else {
          clickOnce('toggle-off');
          setTimeout(() => clickOnce('toggle-on'), 500);
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
