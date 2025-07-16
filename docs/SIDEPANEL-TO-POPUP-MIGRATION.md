# SidePanel到Popup迁移计划

> **文档创建**: 2025-01-15  
> **版本**: v1.0  
> **原因**: SidePanel官方支持问题，需要降级为Popup实现  
> **策略**: 分阶段迁移，每步可验证，保证向后兼容

## 🎯 **迁移概述**

### **目标**
- 将SidePanel完全替换为Popup
- 保持所有功能和操作入口不变
- 确保用户体验无感知差异

### **当前架构分析**
```
Content Script → Background Service Worker → SidePanel
     ↓                      ↓                    ↓
翻译设置按钮            toggleSidePanel        完整设置界面
插件图标点击          openSidePanel          生命周期管理
状态同步              getSidePanelState       设置存储
```

### **目标架构**
```
Content Script → Background Service Worker → Popup
     ↓                      ↓                    ↓
翻译设置按钮            togglePopup            完整设置界面
插件图标点击          openPopup              生命周期管理
状态同步              getPopupState           设置存储
```

---

## 📋 **分阶段迁移计划**

### **阶段1: 准备阶段 (无风险)**
> **目标**: 创建Popup基础结构，不影响现有功能

#### **Step 1.1: 修改Manifest配置**
**操作**:
```json
// manifest.json
{
  "action": {
    "default_popup": "src/popup/popup.html",  // 添加popup配置
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png"
    }
  },
  "permissions": [
    "storage",
    "sidePanel",  // 暂时保留，后续移除
    "tabs",
    "content_settings"
  ]
}
```

**测试验证**:
- [ ] 扩展正常加载
- [ ] 插件图标点击显示popup（但功能可能不完整）
- [ ] SidePanel功能保持正常

#### **Step 1.2: 创建禁用状态图标**
**操作**:
```
创建文件: icons/icon16-disabled.png
创建文件: icons/icon48-disabled.png
```

**测试验证**:
- [ ] 图标文件存在
- [ ] 非YouTube页面可以看到禁用状态图标（如果已实现）

#### **Step 1.3: 完善popup.ts基础结构**
**操作**:
```typescript
// src/popup/popup.ts
console.log('[Popup] 初始化开始...');

// 基础的Port连接
const port = chrome.runtime.connect({ name: 'popup-lifecycle' });

// 基础的关闭事件监听
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({ type: 'popupClosed' });
});

console.log('[Popup] 基础结构完成');
```

**测试验证**:
- [ ] 点击插件图标显示popup
- [ ] 控制台显示初始化日志
- [ ] SidePanel功能不受影响

---

### **阶段2: 双系统并存 (低风险)**
> **目标**: 实现Popup功能，但保持SidePanel为主要功能

#### **Step 2.1: 实现Popup状态检测**
**操作**:
```typescript
// src/background/service-worker.ts
// 添加新的状态检测函数
async function getPopupState(): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.POPUP]
    });
    return contexts.length > 0;
  } catch (error) {
    console.error('[状态检测] 获取Popup状态失败:', error);
    return false;
  }
}

// 添加新的消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getPopupState') {
    getPopupState()
      .then(isOpen => sendResponse({ success: true, isOpen }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // 保持原有逻辑不变
  // ... 原有代码
});
```

**测试验证**:
- [ ] 可以通过`chrome.runtime.sendMessage({ type: 'getPopupState' })`获取状态
- [ ] Popup打开时返回true，关闭时返回false
- [ ] SidePanel功能完全正常

#### **Step 2.2: 实现Popup操作处理**
**操作**:
```typescript
// src/background/service-worker.ts
// 添加新的操作处理函数
async function handleTogglePopup(sender: chrome.runtime.MessageSender): Promise<any> {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };
  
  try {
    const isCurrentlyOpen = await getPopupState();
    
    if (isCurrentlyOpen) {
      // 关闭popup的逻辑
      await chrome.runtime.sendMessage({ type: 'closePopup' });
    } else {
      // 打开popup
      await chrome.action.openPopup();
    }
    
    return { success: true, newState: !isCurrentlyOpen };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 添加新的消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'togglePopup') {
    handleTogglePopup(sender)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // 保持原有逻辑不变
  // ... 原有代码
});
```

**测试验证**:
- [ ] 可以通过`chrome.runtime.sendMessage({ type: 'togglePopup' })`切换状态
- [ ] Popup能正确打开和关闭
- [ ] SidePanel功能完全正常

#### **Step 2.3: 实现Popup网站特定启用**
**操作**:
```typescript
// src/background/service-worker.ts
// 在现有的tabs.onUpdated.addListener中添加popup逻辑
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  
  try {
    const url = new URL(tab.url);
    const YOUTUBE_ORIGINS = [
      'https://www.youtube.com',
      'https://youtube.com', 
      'https://m.youtube.com'
    ];
    
    if (YOUTUBE_ORIGINS.includes(url.origin)) {
      // YouTube页面：同时设置SidePanel和Popup
      
      // 原有SidePanel逻辑保持不变
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'src/sidepanel/sidepanel.html',
        enabled: true
      });
      
      // 新增：设置Popup
      await chrome.action.setPopup({
        tabId,
        popup: 'src/popup/popup.html'
      });
      
    } else {
      // 其他网站：同时禁用SidePanel和Popup
      
      // 原有SidePanel逻辑保持不变
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
      
      // 新增：禁用Popup
      await chrome.action.setPopup({
        tabId,
        popup: ''
      });
    }
  } catch (error) {
    console.error(`[背景服务] 更新面板状态失败:`, error);
  }
});
```

**测试验证**:
- [ ] YouTube页面：点击插件图标显示popup
- [ ] 非YouTube页面：点击插件图标无反应或显示禁用状态
- [ ] SidePanel功能完全正常

---

### **阶段3: 功能复制 (中风险)**
> **目标**: 将SidePanel的完整功能复制到Popup

#### **Step 3.1: 复制SidePanel核心逻辑**
**操作**:
```typescript
// src/popup/popup.ts
// 导入SidePanel的核心逻辑
import { VideoSettingsLocalStorage } from '../shared/storage/video-settings-local-storage';
import { StorageManager } from '../shared/storage/storage-manager';
import { targetLanguages } from '../shared/utils/languages';

// 复制SidePanel的初始化逻辑
class PopupManager {
  async initialize() {
    // 复制sidepanel.ts的初始化逻辑
    await this.initializeUI();
    await this.loadSettings();
    this.addEventListeners();
  }
  
  // 复制具体的实现方法
  // ... 从sidepanel.ts复制相关方法
}

const popupManager = new PopupManager();
popupManager.initialize();
```

**测试验证**:
- [ ] Popup显示完整的设置界面
- [ ] 所有设置项都能正确加载
- [ ] 设置变更能正确保存
- [ ] SidePanel功能完全正常

#### **Step 3.2: 实现Popup生命周期管理**
**操作**:
```typescript
// src/popup/popup.ts
// 建立Port连接
const port = chrome.runtime.connect({ name: 'popup-lifecycle' });

// 关闭事件监听
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({ type: 'popupClosed' });
});

// src/background/service-worker.ts
// 添加Popup生命周期监听
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup-lifecycle') {
    console.log('[背景服务] Popup已连接');
    
    port.onDisconnect.addListener(() => {
      console.log('[背景服务] Popup已断开');
      // 通知content script更新按钮状态
      updateAllTabsButtonState(false);
    });
  }
  
  // 保持原有SidePanel逻辑不变
  // ... 原有代码
});
```

**测试验证**:
- [ ] Popup打开时建立连接
- [ ] Popup关闭时断开连接
- [ ] 生命周期事件正确触发
- [ ] SidePanel功能完全正常

#### **Step 3.3: 实现设置同步**
**操作**:
```typescript
// 确保Popup和SidePanel使用相同的存储
// 验证两者的设置完全同步
```

**测试验证**:
- [ ] 在Popup中修改设置，SidePanel中看到相同变化
- [ ] 在SidePanel中修改设置，Popup中看到相同变化
- [ ] 翻译功能在两种面板中都正常工作

---

### **阶段4: 切换测试 (高风险)**
> **目标**: 添加临时的切换机制，允许测试Popup功能

#### **Step 4.1: 添加测试切换机制**
**操作**:
```typescript
// src/background/service-worker.ts
// 添加临时的偏好设置
let USE_POPUP_MODE = false; // 默认false，保持SidePanel

// 添加切换消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'switchToPopupMode') {
    USE_POPUP_MODE = true;
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'switchToSidePanelMode') {
    USE_POPUP_MODE = false;
    sendResponse({ success: true });
    return false;
  }
  
  // 修改现有的toggleSidePanel逻辑
  if (message.type === 'toggleSidePanel') {
    if (USE_POPUP_MODE) {
      // 使用Popup逻辑
      handleTogglePopup(sender)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
    } else {
      // 使用原有SidePanel逻辑
      // ... 原有代码
    }
    return true;
  }
  
  // 其他消息...
});
```

**测试验证**:
- [ ] 默认模式：翻译按钮打开SidePanel
- [ ] 执行`chrome.runtime.sendMessage({ type: 'switchToPopupMode' })`后：翻译按钮打开Popup
- [ ] 执行`chrome.runtime.sendMessage({ type: 'switchToSidePanelMode' })`后：翻译按钮打开SidePanel
- [ ] 两种模式功能完全一致

#### **Step 4.2: 创建测试脚本**
**操作**:
```javascript
// scripts/test-popup-mode.js
// 测试切换到Popup模式
chrome.runtime.sendMessage({ type: 'switchToPopupMode' }, (response) => {
  if (response.success) {
    console.log('已切换到Popup模式');
  }
});

// scripts/test-sidepanel-mode.js  
// 测试切换回SidePanel模式
chrome.runtime.sendMessage({ type: 'switchToSidePanelMode' }, (response) => {
  if (response.success) {
    console.log('已切换到SidePanel模式');
  }
});
```

**测试验证**:
- [ ] 可以通过脚本随时切换模式
- [ ] 切换后立即生效
- [ ] 功能完全一致

---

### **阶段5: 正式切换 (高风险)**
> **目标**: 正式切换到Popup模式，移除SidePanel

#### **Step 5.1: 默认启用Popup模式**
**操作**:
```typescript
// src/background/service-worker.ts
// 将默认模式改为Popup
let USE_POPUP_MODE = true; // 改为true
```

**测试验证**:
- [ ] 默认情况下翻译按钮打开Popup
- [ ] 所有功能正常工作
- [ ] 用户体验无差异

#### **Step 5.2: 更新Content Script消息**
**操作**:
```typescript
// src/content-scripts/content-script-coordinator.ts
// 修改toggleSidePanel方法
private toggleSidePanel(): void {
  // 发送Popup切换请求
  chrome.runtime.sendMessage({
    type: 'togglePopup',  // 改为togglePopup
    data: { source: 'translation-button' },
    timestamp: Date.now()
  }, (response) => {
    // 处理响应...
  });
}

// 修改initializeSidePanelState方法
private async initializeSidePanelState(): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    type: 'getPopupState'  // 改为getPopupState
  });
  // 处理结果...
}
```

**测试验证**:
- [ ] 翻译按钮正确切换Popup状态
- [ ] 按钮状态正确同步
- [ ] 跨标签页状态同步正常

#### **Step 5.3: 移除SidePanel权限和代码**
**操作**:
```json
// manifest.json
{
  "permissions": [
    "storage",
    // "sidePanel",  // 移除sidePanel权限
    "tabs",
    "content_settings"
  ]
}
```

```typescript
// src/background/service-worker.ts
// 移除所有SidePanel相关代码
// 删除handleToggleSidePanel等函数
// 删除SidePanel相关的tabs.onUpdated逻辑
```

**测试验证**:
- [ ] 扩展正常加载
- [ ] 没有SidePanel相关错误
- [ ] 所有功能通过Popup正常工作

---

## 🧪 **测试验证清单**

### **功能一致性测试**
- [ ] 源语言选择：SidePanel vs Popup
- [ ] 目标语言选择：SidePanel vs Popup
- [ ] 字幕类型切换：SidePanel vs Popup
- [ ] API密钥设置：SidePanel vs Popup
- [ ] 翻译测试：SidePanel vs Popup
- [ ] 设置保存/加载：SidePanel vs Popup

### **操作入口测试**
- [ ] 翻译设置按钮：正确切换面板状态
- [ ] 插件图标点击：正确显示/隐藏面板
- [ ] 手动关闭：失去焦点正确关闭
- [ ] 跨标签页：状态正确同步

### **边界情况测试**
- [ ] 非YouTube页面：正确禁用
- [ ] 快速切换：状态一致性
- [ ] 网络错误：降级处理
- [ ] 权限错误：用户提示

### **性能测试**
- [ ] 启动速度：Popup vs SidePanel
- [ ] 内存使用：监控内存占用
- [ ] 响应速度：UI交互响应

---

## 🚨 **风险控制**

### **回滚机制**
每个阶段都保持向后兼容：
- 阶段1-2：可以立即回滚，无功能影响
- 阶段3-4：通过切换机制快速回滚
- 阶段5：准备完整的SidePanel备份

### **监控指标**
- 错误率：监控console错误
- 用户反馈：收集用户体验反馈
- 功能完整性：确保所有功能正常

### **应急预案**
- 立即回滚：恢复到前一个阶段
- 功能降级：禁用有问题的功能
- 用户通知：及时告知用户状态

---

## 📚 **相关文档**

- [SidePanel架构设计文档](./SAD.md)
- [Popup架构设计文档](./POPUP-ARCHITECTURE.md)
- [项目主架构文档](./architecture.md)

---

## 📝 **执行记录**

### **已完成**
- [ ] 阶段1: 准备阶段
- [ ] 阶段2: 双系统并存
- [ ] 阶段3: 功能复制
- [ ] 阶段4: 切换测试
- [ ] 阶段5: 正式切换

### **问题记录**
- [ ] 问题1：...
- [ ] 问题2：...

### **性能对比**
- [ ] 启动时间：SidePanel: Xms, Popup: Yms
- [ ] 内存占用：SidePanel: XMB, Popup: YMB
- [ ] 用户满意度：SidePanel: X%, Popup: Y% 