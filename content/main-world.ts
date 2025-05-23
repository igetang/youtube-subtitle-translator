/**
 * Main World Script (injected into the page)
 * Responsible for accessing page-level APIs like getPlayerResponse()
 * and communicating back to the content script via postMessage.
 */
console.log('[Main World] 脚本开始加载');

// 在main-world.ts内部直接定义EventBus类和EventTypes，避免导入问题
class EventBus {
  private events = new Map<string, Array<{ callback: Function; once: boolean; priority: number }>>();
  private readonly MAX_LOG_ENTRIES = 100;
  private eventLog: Array<{ time: number; event: string; data: any }> = [];
  private debugMode = false;
  private static instance: EventBus;

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  setDebugMode(enable: boolean): void {
    this.debugMode = enable;
    if (enable) {
      console.log('[EventBus] 调试模式已开启，将记录所有事件');
    } else {
      console.log('[EventBus] 调试模式已关闭');
    }
  }

  on(event: string, callback: Function, options: { once?: boolean; priority?: number } = {}): () => void {
    const { once = false, priority = 0 } = options;
    
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    const callbacks = this.events.get(event)!;
    const callbackObj = { callback, once, priority };
    
    // 按优先级插入
    let inserted = false;
    for (let i = 0; i < callbacks.length; i++) {
      if (callbacks[i].priority < priority) {
        callbacks.splice(i, 0, callbackObj);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      callbacks.push(callbackObj);
    }
    
    if (this.debugMode) {
      console.log(`[EventBus] 已订阅事件 "${event}"${once ? '(一次性)' : ''}，优先级: ${priority}`);
    }
    
    // 返回取消订阅的函数
    return () => {
      this.off(event, callback);
    };
  }

  once(event: string, callback: Function, priority: number = 0): () => void {
    return this.on(event, callback, { once: true, priority });
  }

  off(event: string, callback?: Function): void {
    if (!this.events.has(event)) {
      return;
    }
    
    if (!callback) {
      // 移除全部订阅
      this.events.delete(event);
      if (this.debugMode) {
        console.log(`[EventBus] 已移除事件 "${event}" 的所有订阅`);
      }
      return;
    }
    
    const callbacks = this.events.get(event)!;
    const index = callbacks.findIndex((cb: { callback: Function }) => cb.callback === callback);
    
    if (index !== -1) {
      callbacks.splice(index, 1);
      if (this.debugMode) {
        console.log(`[EventBus] 已取消订阅事件 "${event}"`);
      }
      
      // 如果没有更多回调，删除事件条目
      if (callbacks.length === 0) {
        this.events.delete(event);
      }
    }
  }

  emit(event: string, data?: any): boolean {
    let handled = false;
    
    // 记录事件日志
    this.logEvent(event, data);
    
    // 通过消息传递向content-script转发所有事件
    try {
      window.postMessage({
        source: 'main-world-eventbus',
        type: 'EVENT_FORWARDED',
        eventType: event,
        eventData: data ? JSON.parse(JSON.stringify(data)) : null
      }, '*');
    } catch (error) {
      console.error(`[EventBus] 转发事件 "${event}" 到content-script时出错:`, error);
    }
    
    // 调用精确匹配的事件订阅者
    if (this.events.has(event)) {
      const callbacks = this.events.get(event)!;
      const onceFunctions = [];
      
      // 执行回调
      for (const cb of callbacks) {
        try {
          cb.callback(data);
          handled = true;
          
          if (cb.once) {
            onceFunctions.push(cb);
          }
        } catch (error) {
          console.error(`[EventBus] 处理事件 "${event}" 时出错:`, error);
        }
      }
      
      // 移除一次性订阅
      for (const onceFunc of onceFunctions) {
        const index = callbacks.indexOf(onceFunc);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
      
      // 如果没有更多回调，删除事件条目
      if (callbacks.length === 0) {
        this.events.delete(event);
      }
    }
    
    if (this.debugMode && !handled) {
      console.warn(`[EventBus] 事件 "${event}" 未被任何订阅者处理`);
    }
    
    return handled;
  }

  private logEvent(event: string, data?: any): void {
    // 添加日志条目
    this.eventLog.push({
      time: Date.now(),
      event,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    });
    
    // 限制日志大小
    if (this.eventLog.length > this.MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
    
    if (this.debugMode) {
      console.log(`[EventBus] 发布事件: "${event}"`, data);
    }
  }

  getSubscriberCount(event: string): number {
    if (!this.events.has(event)) {
      return 0;
    }
    return this.events.get(event)!.length;
  }
}

// 定义事件类型接口
interface EventTypesInterface {
  BASIC_INIT_DONE: string;
  FULL_INIT_DONE: string;
  NAVIGATION_STARTED: string;
  NAVIGATION_FINISHED: string;
  OVERLAY_CREATED: string;
  CONTROLS_INJECTED: string;
  SUBTITLE_MODE_CHANGED: string;
  // 新增UI管理器事件类型
  UI_CONTROLS_INJECTED: string;
  UI_OVERLAY_CREATED: string;
  UI_INJECTION_FAILED: string;
  [key: string]: string;
}

// 直接定义常用事件类型
const EventTypesConst: EventTypesInterface = {
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

// 创建并初始化EventBus实例
const eventBusInstance = EventBus.getInstance();

// 安全地注册EventBus实例到window对象，仅供主世界脚本内部使用
// 不再需要让content-script直接访问这个对象
try {
  // 给EventBus和事件类型加上时间戳，确保唯一性
  const timestamp = Date.now();
  const mainWorldEventBusKey = `__MAIN_WORLD_EVENTBUS_${timestamp}__`;
  
  // 使用Symbol作为属性键，增加安全性
  const internalKey = Symbol('mainWorldEventBus');
  
  // 将EventBus实例安全地存储在window对象上，但不直接暴露
  (window as any)[internalKey] = {
    eventBus: eventBusInstance,
    EventTypes: EventTypesConst,
    created: timestamp
  };
  
  console.log('[Main World] EventBus实例已创建，时间戳:', timestamp);
  
  // 通过闭包而不是全局变量来引用事件总线
  const handleContentScriptMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    const { data } = event;
    
    // 处理来自content-script的事件发送请求
    if (data && data.source === 'content-script-eventbus' && data.type === 'EMIT_EVENT') {
      try {
        const { eventType, eventData } = data;
        if (eventType) {
          console.log(`[Main World] 收到来自content-script的事件请求:`, eventType);
          eventBusInstance.emit(eventType, eventData);
        }
      } catch (e) {
        console.error('[Main World] 处理content-script事件请求时出错:', e);
      }
    }
  };
  
  // 添加消息监听器处理来自content-script的事件请求
  window.addEventListener('message', handleContentScriptMessage);
  
} catch (error) {
  console.error('[Main World] EventBus初始化时出错:', error);
}

// 发送就绪消息时不再包含eventBusModule状态，只通知准备好了
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
    
    // 延迟一点时间发送EventBus就绪消息，确保各组件都已初始化
    setTimeout(() => {
      window.postMessage({
        source: 'main-world',
        type: 'EVENTBUS_READY',
        timestamp: Date.now()
      }, '*');
      
      // 发送一个测试事件
      eventBusInstance.emit('main-world:ready', { timestamp: Date.now() });
    }, 50);
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
      try {
        const player = document.getElementById('movie_player');
        if (player && typeof (player as any).getPlayerResponse === 'function') {
          const playerResponse = (player as any).getPlayerResponse();
          const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

          console.log('[Main World] 获取到字幕轨道:', captionTracks);

          // 向content-script发送轨道数据
          window.postMessage({
            source: 'main-world',
            type: 'CAPTION_TRACKS_RESPONSE',
            payload: {
              captionTracks: captionTracks || null
            }
          }, '*');

        } else {
          console.warn('[Main World] 未找到movie_player或getPlayerResponse函数');
          window.postMessage({
            source: 'main-world',
            type: 'CAPTION_TRACKS_RESPONSE',
            error: '找不到播放器或API'
          }, '*');
        }
      } catch (error) {
        console.error('[Main World] 访问getPlayerResponse时出错:', error);
        window.postMessage({
          source: 'main-world',
          type: 'CAPTION_TRACKS_RESPONSE',
          error: error instanceof Error ? error.message : '未知错误'
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