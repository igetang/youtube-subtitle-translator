# 消息格式迁移完成 - 统一使用 type 字段

## 🎯 修改目标
将所有消息格式从兼容模式（同时使用 `type` 和 `action` 字段）改为新架构的 `type` 字段，解决"未知消息类型: undefined"的警告问题。

## ✅ 已完成的修改

### 1. Background Service Worker (src/background/service-worker.ts)
- ✅ 消息路由逻辑从 `const { action, data } = message` 改为 `const { type, data } = message`
- ✅ 所有 switch case 从检查 `action` 改为检查 `type`
- ✅ 错误日志从 `action` 改为 `type`
- ✅ 消息监听器中的直接处理逻辑从 `message.action` 改为 `message.type`
- ✅ 广播消息从 `action: 'SIDEPANEL_STATE_CHANGED'` 改为 `type: 'SIDEPANEL_STATE_CHANGED'`
- ✅ **新增处理 `ui_state_update` 消息类型**

### 2. UI Manager (src/shared/components/ui-manager.ts)
- ✅ 所有 `chrome.runtime.sendMessage` 调用移除 `action` 字段，只保留 `type` 字段
- ✅ `getRuntimeState` 消息格式从 `{ action: 'getRuntimeState', key: 'xxx' }` 改为 `{ type: 'getRuntimeState', data: { stateKey: 'xxx' } }`
- ✅ `checkSidePanelStatus` 消息格式统一
- ✅ `openSidePanel` 消息移除 `action` 字段
- ✅ 消息监听器从 `message.action` 改为 `message.type`

### 3. Content Script (src/content-scripts/content-script.ts)
- ✅ 消息格式从 `{ action: 'getRuntimeState', key: 'xxx' }` 改为 `{ type: 'getRuntimeState', data: { stateKey: 'xxx' } }`
- ✅ 消息监听器兼容性处理：`const messageType = message.type || message.action`
- ✅ 所有消息检查从 `message.action` 改为 `messageType`

### 4. SidePanel (src/sidepanel/sidepanel.ts)
- ✅ 消息检查格式更新，增加向后兼容性：`(message.type || message.action)`

## 🔧 新的统一消息格式

### Background Service Worker 消息处理格式：
```typescript
// 消息路由
const { type, data } = message;
switch (type) {
  case 'ui_state_update':
    console.log('[background] 收到UI状态更新消息:', data);
    return { success: true, message: 'UI state update received' };
    
  case 'getRuntimeState':
    const stateResult = await handleRuntimeStateGet({ stateKey: data?.stateKey });
    return {
      success: stateResult.success,
      state: stateResult.data,
      error: stateResult.error
    };
    
  case 'setRuntimeState':
    const setStateKey = data?.stateKey;
    const setStateValue = data?.value;
    // ... 处理逻辑
}
```

### 组件发送消息格式：
```typescript
// UI Manager
chrome.runtime.sendMessage({
  type: 'getRuntimeState',
  data: { stateKey: 'translateActive' }
})

// Content Script
chrome.runtime.sendMessage({
  type: 'getRuntimeState',
  data: { stateKey: 'translateActive' }
})

// Background 广播
chrome.tabs.sendMessage(tab.id, {
  type: 'SIDEPANEL_STATE_CHANGED',
  isOpen
})
```

## 🎯 问题解决状态

### ✅ 已解决的警告：
- "未知消息类型: undefined" - 通过统一使用 `type` 字段解决
- "未知消息类型: ui_state_update" - 通过在 background 添加对应处理解决

### 🔍 修复涉及的消息类型：
- `getRuntimeState` - 获取运行时状态
- `setRuntimeState` - 设置运行时状态  
- `checkSidePanelStatus` - 检查侧面板状态
- `openSidePanel` - 打开侧面板
- `toggleSidePanel` - 切换侧面板
- `SIDEPANEL_STATE_CHANGED` - 侧面板状态变化通知
- `ui_state_update` - UI状态更新通知

## 🚀 验证结果
- ✅ TypeScript 编译无错误
- ✅ 项目构建成功
- ✅ 所有消息格式统一为新架构
- ✅ 保持必要的向后兼容性

## 📝 使用说明
现在重新加载 Chrome 插件并刷新 YouTube 页面，应该不会再看到之前的消息类型警告。所有组件间的消息传递现在都使用统一的 `type` 字段架构。

## 🔄 后续优化建议
1. 可以考虑逐步移除向后兼容代码（如 `message.type || message.action`）
2. 继续完善消息类型的 TypeScript 类型定义
3. 考虑添加消息格式验证机制 