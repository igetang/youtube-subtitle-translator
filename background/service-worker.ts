/**
 * Chrome Extension Service Worker
 */

console.log('Service Worker started.');

// 示例：监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed.');
  // 在这里可以进行一些初始化设置，比如设置默认 storage 值
  chrome.storage.sync.set({ featureEnabled: true });
});

// 示例：监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);
  // 处理来自 content script 或 popup 的消息
  if (message.action === 'getData') {
    chrome.storage.sync.get(['featureEnabled'], (result) => {
      sendResponse({ status: 'success', data: result });
    });
    return true; // 保持消息通道开放以异步发送响应
  }
}); 