/**
 * Main World Script (injected into the page)
 * Responsible for accessing page-level APIs like getPlayerResponse()
 * and communicating back to the content script via postMessage.
 */
console.log('[Main World] 脚本开始加载');

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

// 发送就绪消息时不再包含messengerModule状态，只通知准备好了
let readyMessageSent = false;

function sendReadyMessage(): void {
  if (!readyMessageSent) {
    console.log('[Main World] 发送就绪消息');
    window.postMessage({ 
      source: 'main-world', 
      type: 'MAIN_WORLD_READY',
      timestamp: Date.now()
    }, '*');
    readyMessageSent = true;
    
    // ✅ 简化消息发送：移除重复的MESSENGER_READY和MESSAGE_FORWARDED
    // 保持架构简单，避免重复日志
  }
}

// 立即发送就绪消息
sendReadyMessage();

// 简化为一个监听器处理各种content-script请求
window.addEventListener('message', (event: MessageEvent) => {
  // 基本安全检查
  if (event.source !== window) return;
  const { data } = event;
  if (!data || typeof data !== 'object') return;
  
  // 仅处理来自content-script的消息
  if (data.source === 'content-script') {
    // 响应就绪状态请求
    if (data.type === 'CHECK_MAIN_WORLD_READY') {
      console.log('[Main World] 收到就绪检查请求，重新发送就绪消息');
      sendReadyMessage();
      return;
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
  }
});

// 确保页面加载完成后也发送就绪消息
window.addEventListener('load', () => {
  console.log('[Main World] 页面加载完成，确保就绪消息已发送');
  sendReadyMessage();
});

// 不再需要重复发送就绪消息，避免引起混淆
// setTimeout(sendReadyMessage, 100); 