/**
 * @file message-with-signal.ts
 * @description 支持AbortSignal的Chrome扩展消息传递工具
 * 允许在消息发送过程中取消操作
 * @version 4.0
 * @date 2025-09-09
 */

/**
 * 发送支持取消的消息到标签页
 * 
 * @param tabId 目标标签页ID
 * @param message 要发送的消息
 * @param signal AbortSignal用于取消操作
 * @returns Promise<T> 响应数据
 */
export async function sendMessageWithSignal<T = any>(
  tabId: number,
  message: any,
  signal: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    // 预检查：如果信号已经abort，直接拒绝
    if (signal.aborted) {
      reject(new DOMException('消息发送前已被取消', 'AbortError'));
      return;
    }
    
    let isResolved = false;
    
    // 监听abort事件
    const abortHandler = () => {
      if (!isResolved) {
        isResolved = true;
        reject(new DOMException('消息发送被取消', 'AbortError'));
      }
    };
    
    // 添加abort监听器
    signal.addEventListener('abort', abortHandler, { once: true });
    
    try {
      // 发送消息到content script
      chrome.tabs.sendMessage(tabId, message, (response) => {
        // 移除abort监听器
        signal.removeEventListener('abort', abortHandler);
        
        if (isResolved) {
          // 如果已经因为abort而resolved，忽略响应
          return;
        }
        
        isResolved = true;
        
        // 检查Chrome运行时错误
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        // 再次检查abort状态（双重保险）
        if (signal.aborted) {
          reject(new DOMException('消息响应时已被取消', 'AbortError'));
          return;
        }
        
        // 检查响应错误
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        
        // 成功返回响应
        resolve(response);
      });
    } catch (error) {
      // 清理监听器
      signal.removeEventListener('abort', abortHandler);
      isResolved = true;
      reject(error);
    }
  });
}

/**
 * 发送支持取消的运行时消息
 * 用于扩展内部通信（如popup到service worker）
 * 
 * @param message 要发送的消息
 * @param signal AbortSignal用于取消操作
 * @returns Promise<T> 响应数据
 */
export async function sendRuntimeMessageWithSignal<T = any>(
  message: any,
  signal: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    // 预检查
    if (signal.aborted) {
      reject(new DOMException('运行时消息发送前已被取消', 'AbortError'));
      return;
    }
    
    let isResolved = false;
    
    // 监听abort事件
    const abortHandler = () => {
      if (!isResolved) {
        isResolved = true;
        reject(new DOMException('运行时消息发送被取消', 'AbortError'));
      }
    };
    
    signal.addEventListener('abort', abortHandler, { once: true });
    
    try {
      // 发送运行时消息
      chrome.runtime.sendMessage(message, (response) => {
        signal.removeEventListener('abort', abortHandler);
        
        if (isResolved) {
          return;
        }
        
        isResolved = true;
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (signal.aborted) {
          reject(new DOMException('运行时消息响应时已被取消', 'AbortError'));
          return;
        }
        
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        
        resolve(response);
      });
    } catch (error) {
      signal.removeEventListener('abort', abortHandler);
      isResolved = true;
      reject(error);
    }
  });
}

/**
 * 批量发送消息（带超时控制）
 * 
 * @param messages 消息数组
 * @param signal 全局取消信号
 * @returns 所有消息的响应结果
 */
export async function sendMessagesInBatch<T = any>(
  messages: Array<{
    tabId?: number;
    message: any;
    timeoutMs?: number;
  }>,
  signal?: AbortSignal
): Promise<PromiseSettledResult<T>[]> {
  const promises = messages.map(async ({ tabId, message, timeoutMs = 5000 }) => {
    // 为每个消息创建独立的超时信号
    let messageSignal: AbortSignal;
    
    if (signal) {
      // 如果有全局信号，组合全局信号和超时信号
      try {
        messageSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(timeoutMs)
        ]);
      } catch {
        // 降级处理
        messageSignal = signal;
      }
    } else {
      // 只使用超时信号
      try {
        messageSignal = AbortSignal.timeout(timeoutMs);
      } catch {
        // 降级：创建一个不会超时的信号
        const controller = new AbortController();
        messageSignal = controller.signal;
      }
    }
    
    // 根据是否有tabId决定使用哪个函数
    if (tabId !== undefined) {
      return sendMessageWithSignal<T>(tabId, message, messageSignal);
    } else {
      return sendRuntimeMessageWithSignal<T>(message, messageSignal);
    }
  });
  
  return Promise.allSettled(promises);
}

/**
 * 获取字幕数据（带信号支持）
 */
export async function fetchSubtitlesWithSignal(
  tabId: number,
  videoId: string,
  signal: AbortSignal
): Promise<any> {
  const message = {
    type: 'FETCH_SUBTITLES',
    data: { videoId }
  };
  
  console.debug(`[debug][message-with-signal] 发送字幕获取请求: ${videoId}`);
  
  try {
    const response = await sendMessageWithSignal(tabId, message, signal);
    
    if (response?.subtitles) {
      console.debug(`[debug][message-with-signal] ✓ 获取到 ${response.subtitles.length} 条字幕`);
      return response;
    } else {
      throw new Error('未获取到字幕数据');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('[message-with-signal] 字幕获取被取消');
    } else {
      console.debug('[message-with-signal] 字幕获取失败:', error);
    }
    throw error;
  }
}

/**
 * 触发字幕加载（带信号支持）
 */
export async function triggerSubtitleLoadWithSignal(
  tabId: number,
  signal: AbortSignal
): Promise<any> {
  const message = {
    type: 'TRIGGER_SUBTITLE_LOAD'
  };
  
  console.debug('[debug][message-with-signal] 触发字幕加载');
  
  try {
    const response = await sendMessageWithSignal(tabId, message, signal);
    console.debug('[debug][message-with-signal] ✓ 字幕加载触发成功');
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('[message-with-signal] 字幕加载触发被取消');
    } else {
      console.debug('[message-with-signal] 字幕加载触发失败:', error);
    }
    throw error;
  }
}