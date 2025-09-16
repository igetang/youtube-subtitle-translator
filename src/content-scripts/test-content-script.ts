/**
 * 测试用的简化Content Script
 * 用于验证注入是否正常工作
 */

console.log('[test-content-script] 🎯 Content Script已成功注入！');
console.log('[test-content-script] 当前URL:', window.location.href);
console.log('[test-content-script] 当前时间:', new Date().toISOString());

// 在页面添加一个简单的视觉指示器
const testIndicator = document.createElement('div');
testIndicator.id = 'youtube-translator-test-testIndicator';
testIndicator.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  background: #ff0000;
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  z-index: 10000;
  font-size: 12px;
  font-family: Arial, sans-serif;
`;
testIndicator.textContent = 'YouTube翻译助手已注入';

// 3秒后自动消失
setTimeout(() => {
  if (testIndicator.parentNode) {
    testIndicator.parentNode.removeChild(testIndicator);
  }
}, 3000);

// 等待页面加载完成后再添加指示器
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(testIndicator);
  });
} else {
  document.body.appendChild(testIndicator);
}

// 每5秒输出一次日志确认脚本持续运行
setInterval(() => {
  console.log('[test-content-script] ⚡ 脚本仍在运行...', new Date().toISOString());
}, 5000); 