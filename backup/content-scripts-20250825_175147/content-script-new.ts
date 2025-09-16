/**
 * @file content-script-new.ts
 * @description 新架构的内容脚本入口 - 根据组件重构计划.md第5步实现
 * 使用ContentScript协调器，消除重复调用，实现单一职责原则
 */

import { ContentScriptCoordinator } from './content-script-coordinator';

/**
 * 🎯 立即输出日志确认脚本开始执行
 */
console.log('[content-script-new] 🚀 新架构Content Script开始初始化...', { 
  url: window.location.href, 
  readyState: document.readyState 
});

// 全局协调器实例
let coordinator: ContentScriptCoordinator | null = null;

/**
 * 获取当前视频ID
 */
function getVideoId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

/**
 * 统一初始化入口 - 简化版本，直接创建和初始化
 * 🔥 架构重构：移除等待机制，实现立即初始化
 */
async function initializeContentScript(): Promise<void> {
  try {
    console.log('[content-script-new] 🚀 启动内容脚本协调器...');
    
    // 创建协调器实例
    coordinator = new ContentScriptCoordinator();
    
    // 委托给协调器执行真正的初始化工作
    await coordinator.initialize();
    
    console.log('[content-script-new] ✅ 协调器启动完成');
    
  } catch (error) {
    console.error('[content-script-new] ❌ 初始化失败:', error);
    
    // 错误恢复：显示错误信息但不中断运行
    console.log('[content-script-new] 🔄 初始化失败，但脚本继续运行');
  }
}

/**
 * 注入主世界脚本
 */
function injectMainWorldScript(): void {
  try {
    const scriptId = 'yt-translator-main-world-script';
    
    // 如果脚本已存在，不会重复注入
    if (document.getElementById(scriptId)) {
      console.log('[content-script-new] 主世界脚本已注入，无需重复操作');
      return;
    }
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('main-world.js');
    
    // 确保插入到<head>
    (document.head || document.documentElement).appendChild(script);
    console.log('[content-script-new] 已注入主世界脚本:', script.src);
    
    // 监听脚本加载完成事件
    script.onload = () => {
      console.log('[content-script-new] 主世界脚本加载完成');
    };
    
    // 处理脚本加载失败
    script.onerror = (e) => {
      console.error('[content-script-new] 主世界脚本加载失败:', e);
    };
  } catch (error) {
    console.error('[content-script-new] 注入主世界脚本时出错:', error);
  }
}

/**
 * 处理获取视频轨道数据的请求
 * 通过向main-world脚本发送REQUEST_CAPTION_TRACKS消息获取真实数据
 */
function handleGetVideoTrackData(videoId: string, sendResponse: (response: any) => void): void {
  console.log(`[content-script-new] 开始获取视频轨道数据，videoId: ${videoId}`);
  
  // 生成唯一的请求ID
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 设置超时机制
  const timeout = setTimeout(() => {
    window.removeEventListener('message', responseHandler);
    console.warn(`[content-script-new] 获取轨道数据超时，videoId: ${videoId}`);
    sendResponse({
      success: false,
      error: '获取轨道数据超时'
    });
  }, 5000); // 5秒超时
  
  // 监听main-world的响应
  const responseHandler = (event: MessageEvent) => {
    if (event.source !== window || !event.data) return;
    
    const { source, type, _requestId, payload, error } = event.data;
    if (source === 'main-world' && type === 'CAPTION_TRACKS_RESPONSE' && _requestId === requestId) {
      clearTimeout(timeout);
      window.removeEventListener('message', responseHandler);
      
      if (error) {
        console.error(`[content-script-new] main-world返回错误: ${error}`);
        sendResponse({
          success: false,
          error: error
        });
        return;
      }
      
      const captionTracks = payload?.captionTracks;
      if (captionTracks && captionTracks.length > 0) {
        console.log(`[content-script-new] 成功获取到${captionTracks.length}条轨道数据`, captionTracks);
        
        // 转换为统一数据格式
        const trackData = captionTracks.map((track: any) => ({
          languageCode: track.languageCode || 'unknown',
          languageName: track.name?.simpleText || track.name || 'Unknown',
          kind: track.kind || 'standard'
        }));
        
        sendResponse({
          success: true,
          trackData: trackData
        });
      } else {
        console.log(`[content-script-new] 未获取到轨道数据或轨道为空`);
        sendResponse({
          success: true,
          trackData: []
        });
      }
    }
  };
  
  window.addEventListener('message', responseHandler);
  
  // 向main-world发送获取轨道请求
  window.postMessage({
    source: 'content-script',
    type: 'REQUEST_CAPTION_TRACKS',
    videoId: videoId,
    _requestId: requestId
  }, '*');
  
  console.log(`[content-script-new] 已发送REQUEST_CAPTION_TRACKS请求，requestId: ${requestId}`);
}

/**
 * 设置消息处理器 - 简化版本，只处理Chrome消息
 * 🔥 架构重构：移除main-world ready事件依赖，实现独立初始化
 */
function setupMessageHandlers(): void {
  // 监听Chrome消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return true;
    
    const messageType = message.type || message.action;
    console.log(`[content-script-new] 收到Chrome消息: ${messageType}`, message);
    
    // 🎯 处理getVideoTrackData消息（用于Popup初始化）
    if (messageType === 'getVideoTrackData') {
      console.log(`[content-script-new] 处理getVideoTrackData请求，视频ID: ${message.videoId}`);
      
      // 向main-world脚本请求真实的字幕轨道数据
      handleGetVideoTrackData(message.videoId, sendResponse);
      
      return true; // 异步响应
    }
    
    // 🔧 处理GET_SUBTITLE_DATA消息
    if (messageType === 'GET_SUBTITLE_DATA') {
      console.log('[content-script-new] 处理GET_SUBTITLE_DATA请求:', message.data);
      
      const { videoId, sourceLang } = message.data || {};
      const requestId = `subtitle_${Date.now()}`;
      
      // 创建Promise来管理异步响应
      const handleRequest = new Promise((resolve) => {
        let responded = false;
        
        // 等待主世界脚本返回数据
        const handleSubtitleResponse = (event: MessageEvent) => {
          if (event.data && event.data.source === 'main-world' && 
              event.data.type === 'SUBTITLE_DATA_RESPONSE' &&
              event.data._requestId === requestId) {
            window.removeEventListener('message', handleSubtitleResponse);
            
            if (!responded) {
              responded = true;
              console.log('[content-script-new] 收到字幕数据响应');
              
              // 返回字幕数据
              if (event.data.error) {
                resolve({
                  success: false,
                  error: event.data.error
                });
              } else {
                resolve({
                  success: true,
                  data: {
                    subtitles: event.data.subtitles || [],
                    tracks: event.data.tracks || [],
                    detectedLanguage: event.data.detectedLanguage,
                    url: event.data.url,
                    videoId: event.data.videoId
                  }
                });
              }
            }
          }
        };
        
        window.addEventListener('message', handleSubtitleResponse);
        
        // 向主世界脚本请求字幕数据
        console.log('[content-script-new] 向main-world发送字幕请求，requestId:', requestId);
        window.postMessage({
          source: 'content-script',
          type: 'REQUEST_SUBTITLE_DATA',
          videoId: videoId || getVideoId(),
          sourceLang: sourceLang,
          _requestId: requestId
        }, '*');
        
        // 设置超时（4秒）
        setTimeout(() => {
          window.removeEventListener('message', handleSubtitleResponse);
          if (!responded) {
            responded = true;
            console.warn('[content-script-new] 字幕请求超时，requestId:', requestId);
            resolve({
              success: false,
              error: '获取字幕超时（4秒）'
            });
          }
        }, 4000);
      });
      
      // 异步发送响应
      handleRequest.then(sendResponse);
      return true; // 保持消息通道开放
    }
    
    // 其他消息转发给协调器处理
    if (coordinator && coordinator.isInitialized()) {
      coordinator.handleUserAction('chromeMessage', {
        messageType,
        message,
        sender,
        timestamp: Date.now()
      });
    }
    
    // 返回false，让其他监听器有机会处理消息
    return false;
  });

  console.log('[content-script-new] 消息处理器设置完成');
}

/**
 * 全局错误处理
 */
function setupErrorHandling(): void {
  // 添加全局错误捕获
  window.addEventListener('error', (event) => {
    console.error('[content-script-new] 全局错误:', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[content-script-new] 未处理的Promise拒绝:', event.reason);
  });
}

/**
 * DOM准备检查
 */
function waitForDOMReady(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve());
    } else {
      resolve();
    }
  });
}

/**
 * 主要初始化流程
 */
async function main(): Promise<void> {
  try {
    // 1. 设置错误处理
    setupErrorHandling();
    
    // 2. 设置消息处理器
    setupMessageHandlers();
    
    // 3. 等待DOM准备
    await waitForDOMReady();
    
    // 4. 立即初始化ContentScriptCoordinator（架构重构：移除等待依赖）
    await initializeContentScript();
    
    // 5. 并行注入主世界脚本（独立进行，无需等待）
    injectMainWorldScript();
    
  } catch (error) {
    console.error('[content-script-new] ❌ 主要初始化流程失败:', error);
  }
}

// 🚀 启动主要初始化流程
main();

// 🔥 架构重构：移除DOMContentLoaded检查，因为已改为立即初始化模式

// 导出协调器实例供调试使用
declare global {
  interface Window {
    __contentScriptCoordinator?: ContentScriptCoordinator;
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__contentScriptCoordinator', {
    get: () => coordinator,
    configurable: true
  });
}

console.log('[content-script-new] >>>>>> 新架构内容脚本已加载完成 <<<<<<');