/**
 * Main World Script (injected into the page)
 * Responsible for accessing page-level APIs like getPlayerResponse()
 * and communicating back to the content script via postMessage.
 */
console.log('[Main World] 脚本开始加载');

// 字幕拦截器初始化标志
let subtitleInterceptorInitialized = false;

// 🔧 简化后的消息转发器 - 使用标准消息机制
class MainWorldMessenger {
  private static instance: MainWorldMessenger;
  private initTime: number;

  constructor() {
    this.initTime = Date.now();
  }

  static getInstance(): MainWorldMessenger {
    if (!MainWorldMessenger.instance) {
      MainWorldMessenger.instance = new MainWorldMessenger();
    }
    return MainWorldMessenger.instance;
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

// 字幕拦截器类
class SubtitleInterceptor {
  private static instance: SubtitleInterceptor;
  private capturedSubtitles: any[] = [];
  private capturedUrl: string | null = null;

  static getInstance(): SubtitleInterceptor {
    if (!SubtitleInterceptor.instance) {
      SubtitleInterceptor.instance = new SubtitleInterceptor();
    }
    return SubtitleInterceptor.instance;
  }

  initialize(): void {
    if (subtitleInterceptorInitialized) {
      console.log('[SubtitleInterceptor] 已经初始化，跳过');
      return;
    }

    console.log('[SubtitleInterceptor] 🎯 开始初始化字幕拦截器');

    // 劫持fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      
      if (url && url.includes('timedtext')) {
        console.log('[SubtitleInterceptor] 🎯 捕获到字幕URL (Fetch):', url);
        this.capturedUrl = url;
        
        const response = await originalFetch(...args);
        const clone = response.clone();
        
        // 异步处理字幕数据
        this.processSubtitleResponse(clone, url);
        
        return response;
      }
      
      return originalFetch(...args);
    };

    // 劫持XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const self = this;
    XMLHttpRequest.prototype.open = function(method: string, url: string, ...rest: any[]) {
      if (url && url.includes('timedtext')) {
        console.log('[SubtitleInterceptor] 🎯 捕获到字幕URL (XHR):', url);
        self.capturedUrl = url;
        
        this.addEventListener('load', function() {
          self.processXHRResponse(this.responseText, url);
        });
      }
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    subtitleInterceptorInitialized = true;
    console.log('[SubtitleInterceptor] ✅ 字幕拦截器初始化完成');
  }

  private async processSubtitleResponse(response: Response, url: string): Promise<void> {
    try {
      const text = await response.text();
      console.log('[SubtitleInterceptor] 正在处理字幕响应，长度:', text.length);
      
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
    try {
      console.log('[SubtitleInterceptor] 正在处理XHR字幕响应，长度:', responseText.length);
      
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
    
    // 保存到全局变量
    this.capturedSubtitles = subtitles;
    (window as any).__capturedSubtitles = subtitles;
    
    // 通知content-script
    window.postMessage({
      source: 'main-world',
      type: 'SUBTITLE_CAPTURED',
      payload: {
        subtitles: subtitles,
        url: this.capturedUrl,
        count: subtitles.length
      }
    }, '*');
    
    console.log('[SubtitleInterceptor] 📝 字幕已保存并通知，共', subtitles.length, '条');
    console.log('[SubtitleInterceptor] 📝 前3条示例:', subtitles.slice(0, 3));
  }

  triggerSubtitleButton(): void {
    console.log('[SubtitleInterceptor] 尝试自动触发字幕按钮...');
    
    setTimeout(() => {
      const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
      if (subtitleBtn) {
        const isPressed = subtitleBtn.getAttribute('aria-pressed') === 'true';
        console.log('[SubtitleInterceptor] 字幕按钮当前状态:', isPressed ? '开启' : '关闭');
        
        if (!isPressed) {
          // 如果字幕关闭，先打开
          subtitleBtn.click();
          console.log('[SubtitleInterceptor] 已打开字幕');
        } else {
          // 如果字幕已开启，先关闭再打开以触发请求
          subtitleBtn.click(); // 关闭
          setTimeout(() => {
            subtitleBtn.click(); // 打开
            console.log('[SubtitleInterceptor] 已切换字幕以触发请求');
          }, 500);
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
  
  // 通过闭包而不是全局变量来引用事件总线
  const handleContentScriptMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    const { data } = event;
    
    // 处理来自content-script的消息发送请求
    if (data && data.source === 'content-script-messenger' && data.type === 'SEND_MESSAGE') {
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
  };
  
  // 添加消息监听器处理来自content-script的事件请求
  window.addEventListener('message', handleContentScriptMessage);
  
  } catch (error) {
    console.error('[Main World] MainWorldMessenger初始化时出错:', error);
  }

// 🔥 架构重构：移除ready消息机制，实现解耦设计
// main-world脚本专注于页面交互，不需要向content-script发送就绪消息

// 🔥 架构重构：移除立即发送就绪消息

// 简化为一个监听器处理各种content-script请求
window.addEventListener('message', (event: MessageEvent) => {
  // 基本安全检查
  if (event.source !== window) return;
  const { data } = event;
  if (!data || typeof data !== 'object') return;
  
  // 仅处理来自content-script的消息
  if (data.source === 'content-script') {
    // 🔥 架构重构：移除就绪状态请求处理，不再需要ready消息机制
    
    // 处理字幕捕获请求
    if (data.type === 'REQUEST_SUBTITLE_CAPTURE') {
      console.log('[Main World] 收到字幕捕获请求，初始化拦截器...');
      const interceptor = SubtitleInterceptor.getInstance();
      interceptor.initialize();
      interceptor.triggerSubtitleButton();
    }
    
    // 处理轨道请求
    if (data.type === 'REQUEST_CAPTION_TRACKS') {
      console.log('[Main World] 收到字幕轨道请求');
      const requestId = data._requestId; // 🔧 新增：获取requestId
      
      try {
        const player = document.getElementById('movie_player');
        if (player && typeof (player as any).getPlayerResponse === 'function') {
          const playerResponse = (player as any).getPlayerResponse();
          const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

          if (captionTracks && captionTracks.length > 0) {
            console.log(`[Main World] 从API获取到${captionTracks.length}条字幕轨道，保存到memory cache:`, captionTracks);
          } else {
            console.log('[Main World] API返回空的字幕轨道数据');
          }

          // 向content-script发送轨道数据时携带requestId
          window.postMessage({
            source: 'main-world',
            type: 'CAPTION_TRACKS_RESPONSE',
            payload: {
              captionTracks: captionTracks || null
            },
            _requestId: requestId  // 🔧 新增：携带相同的requestId
          }, '*');

        } else {
          console.warn('[Main World] 未找到movie_player或getPlayerResponse函数');
          window.postMessage({
            source: 'main-world',
            type: 'CAPTION_TRACKS_RESPONSE',
            error: '找不到播放器或API',
            _requestId: requestId  // 🔧 新增：错误时也携带requestId
          }, '*');
        }
      } catch (error) {
        console.error('[Main World] 访问getPlayerResponse时出错:', error);
        window.postMessage({
          source: 'main-world',
            type: 'CAPTION_TRACKS_RESPONSE',
          error: error instanceof Error ? error.message : '未知错误',
          _requestId: requestId  // 🔧 新增：异常时也携带requestId
        }, '*');
      }
    }
    
    // 处理字幕数据请求
    if (data.type === 'REQUEST_SUBTITLE_DATA') {
      console.log('[Main World] 收到字幕数据请求:', data);
      const requestId = data._requestId;
      const { videoId, sourceLang } = data;
      
      try {
        // 获取播放器和轨道信息
        const player = document.getElementById('movie_player');
        if (player && typeof (player as any).getPlayerResponse === 'function') {
          const playerResponse = (player as any).getPlayerResponse();
          const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          
          console.log('[Main World] 获取到字幕轨道:', {
            trackCount: captionTracks?.length || 0,
            requestedLang: sourceLang
          });
          
          // 查找匹配的字幕轨道
          let selectedTrack = null;
          if (captionTracks && sourceLang) {
            selectedTrack = captionTracks.find((track: any) => track.languageCode === sourceLang);
          } else if (captionTracks && captionTracks.length > 0) {
            selectedTrack = captionTracks[0]; // 默认选择第一个
          }
          
          if (selectedTrack) {
            console.log('[Main World] 选中字幕轨道:', {
              languageCode: selectedTrack.languageCode,
              hasBaseUrl: !!selectedTrack.baseUrl
            });
            
            // 构建字幕URL
            const baseUrl = selectedTrack.baseUrl;
            const subtitleUrl = baseUrl ? `${baseUrl}&fmt=json3` : null;
            
            // 如果有URL，尝试获取字幕
            if (subtitleUrl) {
              console.log('[Main World] 开始获取字幕，URL长度:', subtitleUrl.length);
              const startTime = Date.now();
              
              fetch(subtitleUrl)
                .then(response => {
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                  }
                  return response.json();
                })
                .then(data => {
                  const fetchTime = Date.now() - startTime;
                  console.log(`[Main World] 成功获取字幕数据，耗时: ${fetchTime}ms，字幕条数: ${data.events?.length || 0}`);
                  
                  window.postMessage({
                    source: 'main-world',
                    type: 'SUBTITLE_DATA_RESPONSE',
                    subtitles: data.events || [],
                    tracks: captionTracks,
                    detectedLanguage: selectedTrack.languageCode,
                    url: subtitleUrl,
                    videoId: videoId,
                    _requestId: requestId
                  }, '*');
                })
                .catch(error => {
                  const fetchTime = Date.now() - startTime;
                  console.error(`[Main World] 获取字幕失败，耗时: ${fetchTime}ms，错误:`, error);
                  
                  window.postMessage({
                    source: 'main-world',
                    type: 'SUBTITLE_DATA_RESPONSE',
                    error: `获取字幕失败: ${error.message}`,
                    tracks: captionTracks,
                    _requestId: requestId
                  }, '*');
                });
            } else {
              // 没有字幕URL，返回轨道信息
              console.log('[Main World] 轨道无baseUrl，返回空字幕');
              window.postMessage({
                source: 'main-world',
                type: 'SUBTITLE_DATA_RESPONSE',
                subtitles: [],
                tracks: captionTracks,
                detectedLanguage: selectedTrack?.languageCode,
                videoId: videoId,
                _requestId: requestId
              }, '*');
            }
          } else {
            // 没有找到轨道
            console.log('[Main World] 未找到匹配的字幕轨道');
            window.postMessage({
              source: 'main-world',
              type: 'SUBTITLE_DATA_RESPONSE',
              subtitles: [],
              tracks: captionTracks || [],
              videoId: videoId,
              _requestId: requestId
            }, '*');
          }
        } else {
          console.warn('[Main World] 未找到播放器');
          window.postMessage({
            source: 'main-world',
            type: 'SUBTITLE_DATA_RESPONSE',
            error: '播放器未找到',
            _requestId: requestId
          }, '*');
        }
      } catch (error) {
        console.error('[Main World] 处理字幕请求失败:', error);
        window.postMessage({
          source: 'main-world',
          type: 'SUBTITLE_DATA_RESPONSE',
          error: error instanceof Error ? error.message : '未知错误',
          _requestId: requestId
        }, '*');
      }
    }
  }
});

// 🔥 架构重构：移除页面加载就绪消息发送，简化架构
window.addEventListener('load', () => {
  console.log('[Main World] 页面加载完成');
});

// 🔥 架构重构：彻底移除就绪消息机制 