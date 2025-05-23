/**
 * Chrome 扩展 内容脚本
 */

console.log('内容脚本已加载。');

// 定义本地 EventBus 系统，不再依赖主世界脚本中的EventBus
class LocalEventBus {
  private events = new Map<string, Array<{ callback: Function; once: boolean; priority: number }>>();
  private debugMode = false;

  // 订阅事件
  public on(event: string, callback: Function, options: { once?: boolean; priority?: number } = {}): () => void {
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
      console.log(`[LocalEventBus] 已订阅事件 "${event}"${once ? '(一次性)' : ''}，优先级: ${priority}`);
    }
    
    // 返回取消订阅的函数
    return () => {
      this.off(event, callback);
    };
  }

  // 订阅一次性事件
  public once(event: string, callback: Function, priority: number = 0): () => void {
    return this.on(event, callback, { once: true, priority });
  }

  // 取消订阅
  public off(event: string, callback?: Function): void {
    if (!this.events.has(event)) {
      return;
    }
    
    if (!callback) {
      // 移除全部订阅
      this.events.delete(event);
      if (this.debugMode) {
        console.log(`[LocalEventBus] 已移除事件 "${event}" 的所有订阅`);
      }
      return;
    }
    
    const callbacks = this.events.get(event)!;
    const index = callbacks.findIndex((cb: { callback: Function }) => cb.callback === callback);
    
    if (index !== -1) {
      callbacks.splice(index, 1);
      if (this.debugMode) {
        console.log(`[LocalEventBus] 已取消订阅事件 "${event}"`);
      }
      
      // 如果没有更多回调，删除事件条目
      if (callbacks.length === 0) {
        this.events.delete(event);
      }
    }
  }

  // 发送事件（同时也转发到main-world）
  public emit(event: string, data?: any): boolean {
    let handled = false;
    
    // 转发到主世界脚本（如果主世界脚本已就绪）
    if (mainWorldReady) {
      try {
        window.postMessage({
          source: 'content-script-eventbus',
          type: 'EMIT_EVENT',
          eventType: event,
          eventData: data
        }, '*');
      } catch (error) {
        console.error(`[LocalEventBus] 转发事件到主世界脚本失败: ${error}`);
      }
    }
    
    // 调用本地注册的处理函数
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
          console.error(`[LocalEventBus] 处理事件 "${event}" 时出错:`, error);
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
      console.warn(`[LocalEventBus] 事件 "${event}" 未被任何订阅者处理`);
    }
    
    return handled;
  }

  // 设置调试模式
  public setDebugMode(enable: boolean): void {
    this.debugMode = enable;
    console.log(`[LocalEventBus] 调试模式已${enable ? '开启' : '关闭'}`);
  }

  // 获取订阅者数量
  public getSubscriberCount(event: string): number {
    if (!this.events.has(event)) {
      return 0;
    }
    return this.events.get(event)!.length;
  }
}

// 创建全局事件类型常量
const EventTypes = {
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
  TRANSLATE_ACTIVE_CHANGED: 'state:translate_active_changed'
};

// 创建本地事件总线实例
const eventBus = new LocalEventBus();

// 全局变量，跟踪主世界脚本的就绪状态
let mainWorldReady = false;
let eventBusReady = false;

// 注入主世界脚本 - 无重试逻辑，简单可靠
function injectMainWorldScript() {
  try {
    const scriptId = 'yt-translator-main-world-script';
    // 如果脚本已存在，不会重复注入
    if (document.getElementById(scriptId)) {
      console.log('[Content Script] 主世界脚本已注入，无需重复操作');
      return;
    }
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('src/main-world.js');
    
    // 确保插入到<head>
    (document.head || document.documentElement).appendChild(script);
    console.log('[Content Script] 已注入主世界脚本:', script.src);
    
    // 监听脚本加载完成事件
    script.onload = () => {
      console.log('[Content Script] 主世界脚本加载完成');
    };
    
    // 处理脚本加载失败
    script.onerror = (e) => {
      console.error('[Content Script] 主世界脚本加载失败:', e);
    };
  } catch (error) {
    console.error('[Content Script] 注入主世界脚本时出错:', error);
  }
}

// 消息处理：处理来自主世界脚本的消息
function setupMessageHandlers() {
  window.addEventListener('message', (event: MessageEvent) => {
    // 只处理来自同一窗口的消息
    if (event.source !== window) return;
    
    const { data } = event;
    if (!data || typeof data !== 'object') return;
    
    // 处理主世界脚本就绪消息
    if (data.source === 'main-world' && data.type === 'MAIN_WORLD_READY') {
      console.log('[Content Script] 收到主世界脚本就绪消息');
      mainWorldReady = true;
    }
    
    // 处理EventBus就绪消息
    if (data.source === 'main-world' && data.type === 'EVENTBUS_READY') {
      console.log('[Content Script] 收到EventBus就绪消息');
      eventBusReady = true;
    }
    
    // 处理转发的事件
    if (data.source === 'main-world-eventbus' && data.type === 'EVENT_FORWARDED') {
      const { eventType, eventData } = data;
      if (eventType) {
        console.log(`[Content Script] 收到主世界转发的事件: ${eventType}`);
        // 防止无限循环：不重新发送转发给我们的事件
        if (eventBus) {
          // 在本地处理此事件，但不重新转发到主世界
          const handlers = eventBus['events'].get(eventType) || [];
          let handled = false;
          
          // 手动调用处理函数，避免重新触发emit
          for (const handler of handlers) {
            try {
              handler.callback(eventData);
              handled = true;
            } catch (e) {
              console.error(`[Content Script] 处理转发事件时出错:`, e);
            }
          }
          
          if (handled) {
            console.log(`[Content Script] 已处理主世界转发的事件: ${eventType}`);
          } else {
            console.log(`[Content Script] 没有处理程序处理事件: ${eventType}`);
          }
        }
      }
    }
    
    // ... 其他消息处理 ...
  });
}

// 替代旧的getEventBus和safeEmit函数
function safeEmit(eventType: string, data: any): boolean {
  return eventBus.emit(eventType, data);
}

// 在脚本加载时执行初始化
function initializeEventSystem() {
  console.log('[Content Script] 初始化事件系统');
  
  // 设置消息处理
  setupMessageHandlers();
  
  // 注入主世界脚本
  injectMainWorldScript();
  
  // 开启调试模式
  eventBus.setDebugMode(true);
  
  console.log('[Content Script] 事件系统初始化完成');
}

// 立即初始化事件系统
initializeEventSystem();

// ... 后续的代码与原来相同，只是使用本地eventBus实例和EventTypes常量 ...
