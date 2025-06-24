# SidePanel用户手势修复测试

> 基于文档：`docs/sidepanel-开关实现指南.md`

## 🎯 **测试目标**
验证第一步修复：将 `handleToggleSidePanel` 和 `chrome.action.onClicked` 改为直接API调用，解决用户手势丢失问题。

## 📋 **测试场景**

### **场景1：翻译按钮点击测试**
- [ ] 在YouTube页面点击翻译设置按钮
- [ ] 验证SidePanel能正常打开
- [ ] 再次点击按钮验证能正常关闭
- [ ] 检查console日志是否有错误

### **场景2：扩展图标点击测试**
- [ ] 点击Chrome扩展图标
- [ ] 验证SidePanel能正常开关
- [ ] 与翻译按钮状态保持同步

### **场景3：两个操作源协调测试**
- [ ] 用翻译按钮打开，用扩展图标关闭
- [ ] 用扩展图标打开，用翻译按钮关闭
- [ ] 验证状态切换正常

### **场景4：非YouTube页面测试**
- [ ] 在非YouTube页面点击扩展图标
- [ ] 验证是否正确降级到popup
- [ ] 检查错误处理是否正常

## 🔧 **关键修改点**

### **修改前（失败）**：
```typescript
// 异步控制器调用，丢失用户手势
const result = await sidePanelController.toggleSidePanel(tabId, source);
```

### **修改后（成功）**：
```typescript
// 直接API调用，保持用户手势上下文
const options = await chrome.sidePanel.getOptions({ tabId });
const isCurrentlyEnabled = options.enabled ?? false;

if (isCurrentlyEnabled) {
  await chrome.sidePanel.setOptions({ tabId, enabled: false });
} else {
  await chrome.sidePanel.setOptions({ tabId, enabled: true });
  await chrome.sidePanel.open({ tabId }); // 关键：直接调用
}
```

## 📊 **测试结果**

**测试时间**：2025-06-20  
**测试环境**：Chrome 131+  
**测试状态**：待测试  

### **预期改进**：
1. ✅ 解决 `Error: The user gesture is not active` 错误
2. ✅ SidePanel能正常开关
3. ✅ 翻译按钮和扩展图标状态同步
4. ✅ 保持错误处理和降级机制

### **实际结果**：
- [ ] 待用户测试确认

## 🚀 **下一步计划**
如果第一步测试成功，继续进行：
- 步骤2：实现状态检测和同步
- 步骤3：修改UIManager的按钮处理逻辑 