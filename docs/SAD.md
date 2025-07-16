# SidePanel架构设计文档

> **文档创建**: 2025-07-15  
> **版本**: v2.0  
> **设计理念**: Chrome官方API优先 + 统一状态检测 + 无状态存储  
> **状态**: 重新设计完成，待实施

## 🎯 **核心设计理念**

### **关键理解**
- **Chrome自动管理**：SidePanel的显示/隐藏和跨标签页同步
- **我们的职责**：提供统一的状态检测和操作接口
- **无状态存储**：不维护全局状态，每次实时检测Chrome状态
- **操作同步延续**：所有操作基于相同状态源，逻辑完全同步
- **🔥 用户手势上下文约束**：所有`chrome.sidePanel.open()`调用都必须在用户手势上下文中执行

### **三种操作方式完全同步**
1. **翻译设置按钮** → 检测状态 → 执行相反操作
2. **插件图标点击** → Chrome自动基于相同状态执行相反操作
3. **手动关闭SidePanel** → 改变状态 → 下次操作自动检测到变化

---

## 🏗️ **简化架构设计**

### **Layer 1: Chrome SidePanel自动管理层**
```typescript
/**
 * 🎯 基于官方示例：只告诉Chrome哪些页面启用SidePanel
 * Chrome自动处理显示/隐藏和跨标签页同步
 */

const YOUTUBE_ORIGINS = [
  'https://www.youtube.com',
  'https://youtube.com', 
  'https://m.youtube.com'
];

// 启用Chrome自动插件图标处理
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// 官方标准：网站特定启用
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  
  try {
    const url = new URL(tab.url);
    
    if (YOUTUBE_ORIGINS.includes(url.origin)) {
      // YouTube页面：启用SidePanel
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'src/sidepanel/sidepanel.html',
        enabled: true
      });
    } else {
      // 其他网站：禁用SidePanel
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
    }
  } catch (error) {
    console.error(`[背景服务] 更新SidePanel状态失败:`, error);
  }
});
```

### **Layer 2: 统一状态检测层**
```typescript
/**
 * 🎯 唯一权威状态源：Chrome的SidePanel实际状态
 * 所有操作都基于这个状态检测来决定下一步行为
 */

async function getSidePanelState(): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL]
    });
    return contexts.length > 0;
  } catch (error) {
    console.error('[状态检测] 获取SidePanel状态失败:', error);
    return false;
  }
}

// 状态检测消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getSidePanelState') {
    getSidePanelState()
      .then(isOpen => sendResponse({ success: true, isOpen }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
```

### **Layer 3: 统一操作处理层**
```typescript
/**
 * 🎯 翻译设置按钮点击处理
 * 基于统一状态检测，执行相反操作，与插件图标逻辑完全同步
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleSidePanel') {
    handleToggleSidePanel(sender)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleToggleSidePanel(sender: chrome.runtime.MessageSender): Promise<any> {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };
  
  try {
    // 🔥 关键：检测当前状态，执行相反操作
    const isCurrentlyOpen = await getSidePanelState();
    
    if (isCurrentlyOpen) {
      // 当前打开 → 关闭
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      console.log(`[翻译按钮] SidePanel已关闭`);
    } else {
      // 当前关闭 → 打开
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'src/sidepanel/sidepanel.html',
        enabled: true
      });
      
      // 🔥 用户手势上下文约束：此调用必须在用户手势上下文中执行
      // 翻译按钮点击事件提供了用户手势上下文，确保此调用成功
      await chrome.sidePanel.open({ tabId });
      console.log(`[翻译按钮] SidePanel已打开`);
    }
    
    return { 
      success: true, 
      newState: !isCurrentlyOpen
    };
    
  } catch (error) {
    console.error('[翻译按钮] 操作失败:', error);
    
    // 🔥 用户手势上下文错误处理
    if (error.message?.includes('user gesture')) {
      return { 
        success: false, 
        error: '需要用户手势上下文',
        errorType: 'USER_GESTURE_REQUIRED'
      };
    }
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}
```

### **Layer 4: UI状态同步层**
```typescript
/**
 * 🎯 在需要时获取状态并更新UI
 * 不维护全局状态，每次都实时检测
 */

// Content Script: 页面初始化时同步状态
async function initializeButtonState() {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'getSidePanelState'
    });
    
    if (result.success) {
      updateButtonDisplay(result.isOpen);
      console.log(`[内容脚本] 初始状态: ${result.isOpen ? '已打开' : '已关闭'}`);
    }
  } catch (error) {
    console.error('[内容脚本] 获取初始状态失败:', error);
    updateButtonDisplay(false); // 降级到默认状态
  }
}

// 翻译按钮点击处理
async function onTranslateButtonClick() {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'toggleSidePanel'
    });
    
    if (result.success) {
      updateButtonDisplay(result.newState);
      console.log(`[翻译按钮] 状态切换成功: ${result.newState ? '已打开' : '已关闭'}`);
    }
  } catch (error) {
    console.error('[翻译按钮] 操作失败:', error);
  }
}

// 按钮显示更新
function updateButtonDisplay(isOpen: boolean) {
  const button = document.querySelector('[data-translate-settings-button]');
  if (button) {
    button.textContent = isOpen ? '翻译设置 (已打开)' : '翻译设置';
    button.setAttribute('data-state', isOpen ? 'open' : 'closed');
  }
}
```

### **Layer 5: 手动关闭检测层**
```typescript
/**
 * 🎯 监听用户手动关闭SidePanel
 * 确保下次操作能正确检测到状态变化
 */

// SidePanel中建立Port连接
// src/sidepanel/sidepanel.ts
const port = chrome.runtime.connect({ name: 'sidepanel-lifecycle' });

// Background监听Port生命周期
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel-lifecycle') {
    console.log('[背景服务] SidePanel已连接');
    
    port.onDisconnect.addListener(() => {
      console.log('[背景服务] SidePanel已断开');
      // 不需要额外处理，getSidePanelState()会自动检测到状态变化
    });
  }
});
```

---

## 🔥 **用户手势上下文约束**

### **关键约束**
Chrome Extensions的`chrome.sidePanel.open()`API必须在用户手势上下文中调用，这是Chrome的安全机制。

### **用户手势上下文的来源**
1. **用户点击事件**：button.onclick, element.addEventListener('click')
2. **键盘事件**：keydown, keypress, keyup
3. **其他用户交互**：focus, blur, input等

### **用户手势上下文的传递**
```typescript
// ✅ 正确：在用户点击事件中直接调用
button.addEventListener('click', async () => {
  // 用户手势上下文存在
  const result = await chrome.runtime.sendMessage({ type: 'toggleSidePanel' });
});

// ✅ 正确：在消息监听器中立即处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleSidePanel') {
    // 用户手势上下文从Content Script传递到Background
    chrome.sidePanel.open({ tabId: sender.tab.id }); // 成功
  }
});

// ❌ 错误：在setTimeout中调用
button.addEventListener('click', () => {
  setTimeout(() => {
    chrome.sidePanel.open({ tabId }); // 失败：用户手势上下文丢失
  }, 100);
});

// ❌ 错误：在tabs.onUpdated中调用
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  chrome.sidePanel.open({ tabId }); // 失败：没有用户手势上下文
});
```

### **我们的实现策略**
1. **翻译按钮点击** → 用户手势上下文存在 → 立即发送消息到Background → 立即调用`chrome.sidePanel.open()`
2. **插件图标点击** → Chrome自动处理，无需我们管理用户手势上下文
3. **手动关闭** → 不需要用户手势上下文，只是监听Port断开

### **错误处理**
```typescript
try {
  await chrome.sidePanel.open({ tabId });
} catch (error) {
  if (error.message?.includes('user gesture')) {
    // 用户手势上下文丢失，提供用户友好的错误提示
    console.error('需要用户手势上下文才能打开SidePanel');
    // 可以显示提示，引导用户点击插件图标
  }
}
```

---

## 🔄 **三种操作方式同步延续**

### **核心同步机制**
```
所有操作 → 检测getSidePanelState() → 执行相反操作
```

### **具体同步场景**

#### **场景1: 翻译按钮 → 插件图标**
```
1. 用户点击翻译按钮 → 检测状态：关闭 → 执行打开 → SidePanel打开
2. 用户点击插件图标 → Chrome检测状态：打开 → 自动关闭 → SidePanel关闭
```

#### **场景2: 插件图标 → 翻译按钮**
```
1. 用户点击插件图标 → Chrome检测状态：关闭 → 自动打开 → SidePanel打开
2. 用户点击翻译按钮 → 检测状态：打开 → 执行关闭 → SidePanel关闭
```

#### **场景3: 手动关闭 → 任何操作**
```
1. 用户手动关闭SidePanel → Port断开 → 状态变为关闭
2. 用户点击任何按钮 → 检测状态：关闭 → 执行打开 → SidePanel打开
```

#### **场景4: 跨标签页操作**
```
1. 标签页A：用户操作打开SidePanel
2. 切换到标签页B → Chrome自动显示SidePanel（同一网站）
3. 标签页B：用户操作 → 检测状态：打开 → 执行关闭 → SidePanel关闭
4. 切换回标签页A → Chrome自动隐藏SidePanel（状态同步）
```

---

## 🎯 **架构优势**

### **1. 完全基于Chrome官方机制**
- ✅ 使用官方`setPanelBehavior`处理插件图标
- ✅ 使用官方`runtime.getContexts`作为权威状态源
- ✅ 利用Chrome自动跨标签页同步能力

### **2. 无状态存储，实时检测**
- ✅ 不维护全局状态变量
- ✅ 每次操作都检测实时状态
- ✅ 避免状态不一致问题

### **3. 操作逻辑完全同步**
- ✅ 所有操作基于相同状态源
- ✅ 执行相同的切换逻辑
- ✅ 三种操作方式完全互通

### **4. 用户手势上下文保证**
- ✅ 翻译按钮点击在用户手势上下文中处理
- ✅ 插件图标点击由Chrome自动保持用户手势
- ✅ 所有`chrome.sidePanel.open()`调用都在用户操作中

---

## 🚀 **实施步骤**

### **Step 1: 实现Chrome自动管理层**
- 实现官方标准的`tabs.onUpdated`监听
- 设置`setPanelBehavior`启用插件图标自动处理
- 移除不必要的`tabs.onActivated`监听

### **Step 2: 实现统一状态检测**
- 实现`getSidePanelState()`函数
- 实现状态查询消息处理
- 确保状态检测的可靠性

### **Step 3: 实现统一操作处理**
- 实现`handleToggleSidePanel()`函数
- 确保用户手势上下文保持
- 实现错误处理和降级机制

### **Step 4: 实现UI状态同步**
- Content Script初始化时获取状态
- 翻译按钮点击处理
- 按钮显示状态更新

### **Step 5: 实现手动关闭检测**
- SidePanel中建立Port连接
- Background监听Port生命周期
- 确保状态变化能被检测到

---

## 🧪 **测试验证清单**

### **基础功能**
- [ ] 翻译按钮点击能正确切换SidePanel状态
- [ ] 插件图标点击能正确切换SidePanel状态
- [ ] 手动关闭SidePanel后状态检测正确

### **同步延续**
- [ ] 翻译按钮打开 → 插件图标关闭 → 状态同步
- [ ] 插件图标打开 → 翻译按钮关闭 → 状态同步
- [ ] 手动关闭 → 任何操作打开 → 状态同步

### **跨标签页**
- [ ] 标签页A操作 → 切换到标签页B → SidePanel状态正确
- [ ] 标签页B操作 → 切换回标签页A → SidePanel状态正确
- [ ] 页面刷新后状态恢复正确

### **边界情况**
- [ ] 网络错误时降级处理
- [ ] 权限错误时用户提示
- [ ] 用户手势上下文丢失时处理

---

## 📚 **相关文档**

- [Chrome SidePanel API官方文档](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Chrome官方SidePanel示例](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-site-specific)
- [Chrome Extension用户手势要求](https://developer.chrome.com/docs/extensions/develop/concepts/user-activation)
- [项目主架构文档](./architecture.md)