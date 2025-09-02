/**
 * @file content-script-external.js
 * @description 外部内容脚本，不使用ES模块，负责注入主世界脚本
 */

console.log('[Content Script] 外部内容脚本已加载');

// 检查并注入主世界脚本
function injectMainWorldScript() {
  try {
    const scriptId = 'yt-translator-main-world-script';
    if (document.getElementById(scriptId)) {
      console.log('[Content Script] 主世界脚本已注入，无需重复操作');
      return;
    }
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('src/main-world.js');
    script.type = 'module'; // 主世界脚本使用ES模块
    
    console.log('[Content Script] 注入的脚本URL:', script.src);
    
    (document.head || document.documentElement).appendChild(script);
    console.log('[Content Script] 已注入主世界脚本:', script.src);
    
    script.onload = () => {
      console.log('[Content Script] 主世界脚本加载完成');
    };
    
    script.onerror = (error) => {
      console.error('[Content Script] 主世界脚本加载失败:', error);
    };
  } catch (error) {
    console.error('[Content Script] 注入主世界脚本时出错:', error);
  }
}

// 注册消息监听器
function setupMessageListeners() {
  // 监听来自背景脚本的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Content Script] 收到消息:', message);
    
    if (message.action === 'getVideoInfo') {
      // 获取当前视频信息
      const videoId = new URLSearchParams(window.location.search).get('v');
      sendResponse({ videoId: videoId });
      return true;
    }
    
    return false;
  });
}

// 初始化内容脚本
function initialize() {
  console.log('[Content Script] 初始化内容脚本');
  
  // 注入主世界脚本
  injectMainWorldScript();
  
  // 设置消息监听器
  setupMessageListeners();
}

// 启动内容脚本
initialize(); 