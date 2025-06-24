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
 * 统一初始化入口 - 根本解决重复调用问题
 */
async function initializeContentScript(): Promise<void> {
  if (coordinator) {
    console.log('[content-script-new] 协调器已初始化，跳过重复初始化');
    return;
  }

  try {
    console.log('[content-script-new] 🚀 开始统一初始化...');
    
    // 创建协调器实例
    coordinator = new ContentScriptCoordinator();
    
    // 执行统一初始化 - 一次获取所有状态，分发给组件
    await coordinator.initialize();
    
    console.log('[content-script-new] ✅ 统一初始化完成');
    
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
 * 设置消息处理器 - 简化版本，主要处理main-world ready事件
 */
function setupMessageHandlers(): void {
  // 监听来自主世界脚本的消息
  window.addEventListener('message', (event: MessageEvent<any>) => {
    if (event.source !== window || !event.data?.source?.startsWith('main-world')) {
      return;
    }

    const { type, messageType } = event.data;
    
    console.log(`[content-script-new] 📥 接收主世界消息: ${type}${messageType ? ` (${messageType})` : ''}`);

    // 处理main-world ready事件
    if (messageType === 'main-world:ready' || type === 'MAIN_WORLD_READY') {
      if (!coordinator || !coordinator.isInitialized()) {
        console.log('[content-script-new] 收到main-world ready，开始初始化');
        initializeContentScript();
      } else {
        console.log('[content-script-new] 协调器已初始化，跳过重复初始化');
      }
    }
  });

  // 监听Chrome消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return true;
    
    const messageType = message.type || message.action;
    console.log(`[content-script-new] 收到Chrome消息: ${messageType}`, message);
    
    // 如果协调器已初始化，可以通过协调器处理消息
    if (coordinator && coordinator.isInitialized()) {
      // 将消息转发给协调器处理
      coordinator.handleUserAction('chromeMessage', {
        messageType,
        message,
        sender,
        timestamp: Date.now()
      });
    }
    
    return true; // 保持异步响应通道开放
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
    
    // 4. 注入主世界脚本
    injectMainWorldScript();
    
    // 5. 初始化Content Script（等待main-world ready事件）
    // 不立即初始化，等待main-world ready事件
    console.log('[content-script-new] 等待main-world ready事件...');
    
  } catch (error) {
    console.error('[content-script-new] ❌ 主要初始化流程失败:', error);
  }
}

// 🚀 启动主要初始化流程
main();

// 确保在初始内容加载后检查是否需要重试
document.addEventListener('DOMContentLoaded', () => {
  console.log('[content-script-new] DOMContentLoaded - 检查初始化状态');
  
  if (!coordinator || !coordinator.isInitialized()) {
    console.log('[content-script-new] 协调器未初始化，等待main-world ready事件');
  } else {
    console.log('[content-script-new] 协调器已初始化');
  }
});

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