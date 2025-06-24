# EventBus到MessageBus迁移指南

## 🎯 迁移概述

本指南帮助将代码从旧的EventBus架构迁移到新的MessageBus架构。

### 📋 迁移原因

- **标准化**: 基于Chrome原生消息API，更符合扩展开发规范
- **类型安全**: 完整的TypeScript类型支持
- **性能优化**: 减少中间层，提升通信效率
- **维护性**: 统一消息路由，降低架构复杂度

### 🚀 **完整重构步骤规划**

#### **阶段1: 安全防护措施** ✅ **已完成**
1. ✅ EventBus类添加废弃警告
2. ✅ 创建迁移指南文档
3. ✅ 控制台警告确保开发者知晓

#### **阶段2: 核心文件迁移** 🔄 **进行中**

**Phase 2.1 - 高优先级文件**
- [ ] `src/content-scripts/content-script.ts` - 内容脚本核心
- [ ] `src/shared/components/ui-manager.ts` - UI管理器
- [ ] `src/shared/components/control-panel.ts` - 控制面板

**Phase 2.2 - 中优先级文件**
- [ ] `src/content-scripts/main-world.ts` - 主世界脚本
- [ ] 其他使用EventBus的工具类

#### **阶段3: 架构整合** 🔄 **待开始**
1. [ ] 更新Background Service Worker消息路由
2. [ ] 统一消息类型定义
3. [ ] 优化MessageBus配置

#### **阶段4: 清理工作** ⏳ **待开始**
1. [ ] 移除EventBus相关代码
2. [ ] 清理旧的事件类型定义
3. [ ] 更新所有导入语句

#### **阶段5: 验证与测试** ⏳ **待开始**
1. [ ] 功能完整性测试
2. [ ] 性能对比测试
3. [ ] 错误处理验证

## 🔄 API对照表

### 基础使用

```typescript
// ❌ 旧方式 (EventBus)
import { EventBus } from '../messages/event-bus';
const eventBus = EventBus.getInstance();

// ✅ 新方式 (MessageBus)
import { initializeMessageSystem } from '../messages/messages';
const { messageBus } = initializeMessageSystem('content-script');
```

### 消息发送

```typescript
// ❌ 旧方式
eventBus.emit('translation:start_requested', { videoId: 'xxx' });

// ✅ 新方式
messageBus.sendMessage({
  type: MessageType.TRANSLATION_REQUEST,
  data: { videoId: 'xxx' }
});
```

### 事件监听

```typescript
// ❌ 旧方式
eventBus.on('translation:finished', (data) => {
  console.log('翻译完成', data);
});

// ✅ 新方式
const { messageHandlers } = initializeMessageSystem('content-script', {
  onTranslationResponse: (data) => {
    console.log('翻译完成', data);
  }
});
```

### 事件类型

```typescript
// ❌ 旧方式
import { MessageType } from '../messages/messages';
eventBus.emit(EventTypes.TRANSLATION_STARTED, data);

// ✅ 新方式
import { MessageType } from '../types';
messageBus.sendMessage({
  type: MessageType.TRANSLATION_REQUEST,
  data
});
```

## 📝 具体文件迁移步骤

### 1. content-script.ts

```typescript
// ❌ 删除
import { EventBus, EventPriority } from '@shared/messages/event-bus';
const eventBus = EventBus.getInstance();

// ✅ 添加
import { initializeMessageSystem, MessageType } from '@shared/messages/messages';

// 在初始化函数中
const { messageBus, messageHandlers } = initializeMessageSystem('content-script', {
  onTranslationResponse: handleTranslationResponse,
  onUIStateUpdate: handleUIStateUpdate,
  // ...其他回调
});
```

### 2. ui-manager.ts

```typescript
// ❌ 删除
import { EventBus, EventPriority } from '../messages/event-bus';
this.eventBus = EventBus.getInstance();

// ✅ 添加
import { initializeMessageSystem, MessageType } from '../messages/messages';

constructor() {
  const { messageBus } = initializeMessageSystem('content-script');
  this.messageBus = messageBus;
}
```

### 3. control-panel.ts

```typescript
// ❌ 删除
import { EventBus, EventPriority } from '../messages/event-bus';
this.eventBus = EventBus.getInstance();

// ✅ 添加
import { initializeMessageSystem, MessageType } from '../messages/messages';

constructor() {
  const { messageBus } = initializeMessageSystem('content-script');
  this.messageBus = messageBus;
}
```

## 🎯 迁移优先级

### Phase 1 - 核心文件 (高优先级)
- [ ] `src/content-scripts/content-script.ts`
- [ ] `src/shared/components/ui-manager.ts`  
- [ ] `src/shared/components/control-panel.ts`

### Phase 2 - 辅助文件 (中优先级)
- [ ] `src/content-scripts/main-world.ts`
- [ ] 其他使用EventBus的工具类

### Phase 3 - 清理工作 (低优先级)
- [ ] 删除EventBus相关代码
- [ ] 更新导入语句
- [ ] 清理事件类型定义

## ⚠️ 注意事项

1. **渐进迁移**: 逐个文件迁移，避免一次性大规模修改
2. **测试验证**: 每个文件迁移后都要测试功能完整性
3. **保持兼容**: 迁移期间保持EventBus可用，避免功能中断
4. **日志监控**: 注意控制台的废弃警告，确保迁移完整性

## 🔍 迁移验证

### 检查清单
- [ ] 控制台不再出现EventBus废弃警告
- [ ] 所有原有功能正常工作
- [ ] 消息通信响应及时
- [ ] 错误处理机制完整
- [ ] 类型检查通过

### 测试场景
- [ ] YouTube页面加载
- [ ] 翻译功能开关
- [ ] 设置面板操作
- [ ] 字幕显示切换
- [ ] 跨标签页状态同步

## 📊 **关键设计决策**

### **1. 消息路由中心化**
- **决策**: Background Service Worker作为唯一消息路由中心
- **优势**: 统一消息处理，避免点对点通信的复杂性
- **实现**: 所有组件通过`chrome.runtime.sendMessage`与Background通信

### **2. 类型安全优先**
- **决策**: 完整的TypeScript类型定义
- **优势**: 编译时错误检查，减少运行时错误
- **实现**: 严格的消息接口定义和类型检查

### **3. 向后兼容策略**
- **决策**: 渐进迁移，保持旧系统可用
- **优势**: 降低风险，确保系统稳定性
- **实现**: EventBus添加废弃警告，但保持功能完整

### **4. 错误处理统一化**
- **决策**: 统一的错误处理和降级机制
- **优势**: 提升系统稳定性和用户体验
- **实现**: MessageBus内建错误处理和重试机制 