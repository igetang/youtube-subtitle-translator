/**
 * [popup] YouTube字幕翻译助手 - Popup界面
 * 负责扩展的主要设置和控制面板
 */

console.log('[popup] Popup script loaded.');

// 创建基础UI
function initPopupUI() {
  const app = document.getElementById('app');
  if (!app) {
    console.error('[popup] App container not found');
    return;
  }

  // 创建主界面
  app.innerHTML = `
    <div class="popup-container">
      <div class="header">
        <h2>YouTube字幕翻译助手</h2>
      </div>
      <div class="content">
        <div class="status">
          <p>✅ 扩展已加载</p>
          <p>🔧 配置面板正在开发中...</p>
        </div>
        <div class="actions">
          <button id="openSidePanel" class="btn-primary">打开侧边栏</button>
          <button id="openOptions" class="btn-secondary">打开设置</button>
        </div>
      </div>
      <div class="footer">
        <small>版本 1.0.0</small>
      </div>
    </div>
  `;

  // 添加样式
  addPopupStyles();
  
  // 绑定事件
  bindEvents();
}

/**
 * 添加popup样式
 */
function addPopupStyles() {
  const style = document.createElement('style');
  style.textContent = `
    body {
      margin: 0;
      padding: 0;
      width: 320px;
      min-height: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
    }
    
    .popup-container {
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin: 8px;
    }
    
    .header h2 {
      margin: 0 0 16px 0;
      color: #333;
      font-size: 18px;
      text-align: center;
    }
    
    .content {
      margin-bottom: 16px;
    }
    
    .status p {
      margin: 8px 0;
      color: #666;
      font-size: 14px;
    }
    
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }
    
    .btn-primary, .btn-secondary {
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    
    .btn-primary {
      background: #007cff;
      color: white;
    }
    
    .btn-primary:hover {
      background: #0056b3;
    }
    
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    
    .btn-secondary:hover {
      background: #e0e0e0;
    }
    
    .footer {
      text-align: center;
      padding-top: 12px;
      border-top: 1px solid #eee;
    }
    
    .footer small {
      color: #999;
      font-size: 12px;
    }
  `;
  
  document.head.appendChild(style);
}

/**
 * 绑定事件处理
 */
function bindEvents() {
  // 打开侧边栏按钮
  const openSidePanelBtn = document.getElementById('openSidePanel');
  if (openSidePanelBtn) {
    openSidePanelBtn.addEventListener('click', async () => {
      try {
        console.log('[popup] Opening side panel...');
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab?.id) {
          // 为当前标签页开启侧边栏
          await chrome.sidePanel.open({ tabId: tab.id });
          console.log('[popup] Side panel opened successfully');
        }
      } catch (error) {
        console.error('[popup] Failed to open side panel:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert('打开侧边栏失败: ' + errorMessage);
      }
    });
  }

  // 打开设置按钮
  const openOptionsBtn = document.getElementById('openOptions');
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', () => {
      console.log('[popup] Opening options page...');
      chrome.runtime.openOptionsPage();
    });
  }
}

// 当DOM加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopupUI);
} else {
  initPopupUI();
} 