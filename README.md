# Chrome扩展 - YouTube字幕翻译助手

## 项目概述
本项目是一个Chrome扩展，为YouTube视频提供实时字幕翻译功能。

## 🚀 核心功能
- ✅ **播放器控制栏集成**：翻译开关按钮 + 设置按钮
- ✅ **Popup设置面板**：支持插件图标点击打开设置界面
- ✅ **实时字幕翻译**：支持多种翻译服务
- ✅ **多语言支持**：自动检测源语言，支持多目标语言
- ✅ **本地缓存**：智能缓存翻译结果，提升性能

## 📋 最新更新

### 🔥 2025-06-21 - 架构优化：完全统一消息系统

**重大优化**：
- ✅ **完全替换GlobalMessageSystem**：移除重复的消息系统架构
- ✅ **统一消息系统**：SharedMessageSystem成为唯一的消息系统实现
- ✅ **彻底消除重复初始化**：从双重初始化优化为单一初始化
- ✅ **架构简化**：符合"简单优于复杂"原则，代码更易维护
- ✅ **性能大幅提升**：消除所有重复调用和重复日志

**技术实现**：
- 🎯 **SharedMessageSystem v2.0**：完全替换GlobalMessageSystem，统一管理所有消息初始化
- 🔧 **content-script优化**：使用 `SharedMessageSystem.initialize()` 替代 `initializeMessageSystem()`
- 🔧 **UIManager优化**：使用 `SharedMessageSystem.getMessageBus()` 获取共享实例
- 🔧 **ControlPanel优化**：使用 `SharedMessageSystem.getMessageHandlers()` 获取共享实例
- 🗑️ **清理冗余代码**：删除 `global-message-system.ts`，简化导出结构

**架构对比**：
```
// 优化前：双重系统架构
GlobalMessageSystem (content-script初始化)
  ↓
SharedMessageSystem (组件获取实例)
  ↓
重复初始化和日志

// 优化后：统一系统架构  
SharedMessageSystem (统一初始化和管理)
  ↓
所有组件共享同一实例
  ↓
单一初始化，性能最优
```

**优化效果**：
- 🚀 **初始化次数**：从2次减少到1次（100%消除重复）
- 📝 **日志输出**：从双重日志减少到单一清晰日志
- 💾 **内存使用**：消除重复实例，内存使用更优
- 🔧 **代码维护**：单一系统架构，维护成本降低

### 🔥 2025-01-XX - 架构重构：命名规范化 + Event系统完全清理

**重构内容**：
- ✅ **目录重命名**：`events/` → `messages/` (更符合实际功能)
- ✅ **文件重命名**：`events.ts` → `messages.ts`，`control-panel-new.ts` → `control-panel.ts`
- ✅ **类名重构**：`ControlPanelNew` → `ControlPanel`
- ✅ **术语统一**：完全移除"Event"字样，统一使用"Message"术语
- ✅ **代码清理**：清理所有`eventType`/`eventData`残留，统一使用`messageType`/`messageData`

### 🔥 2025-09-02 - YouTube Player API集成 + 3状态系统完善

**新增功能**：
- ✅ **YouTube Player API集成**：直接控制YouTube字幕，不受界面语言影响
- ✅ **ISO 639-1标准支持**：使用国际标准语言代码（en, fr, de, zh等）
- ✅ **PENDING状态5秒超时机制**：防止状态卡死，确保系统可恢复
- ✅ **智能源语言选择**：用户历史/英语优先/手动优先的智能规则

**技术实现**：
- 🎯 **SubtitleAPIController类**：封装YouTube Player API调用
- 🔄 **智能降级机制**：API失败时自动回退到拦截器方案
- ⏱️ **超时保护机制**：PENDING状态5秒后自动回退到INACTIVE
- 🌐 **跨语言界面支持**：日文、韩文界面下也能正常工作

### 🔥 2025-01-XX - 架构清理：MessageBus统一 + 消息系统优化

**问题解决**：
- ✅ **根本解决重复日志问题**：MessageBus重复注册路由导致的大量重复日志
- ✅ **统一消息系统**：MessageBus作为唯一的消息系统实现
- ✅ **架构设计改进**：实现真正的全局单例消息系统
- ✅ **性能优化**：避免重复初始化，减少资源消耗

**日志改进**：
```
// 之前：重复日志和混乱的消息系统
[MessageBus] 注册消息路由 ▶ {type: 'subtitle_detected'}
[MessageBus] 注册消息路由 ▶ {type: 'subtitle_detected'}  
[MessageBus] 注册消息路由 ▶ {type: 'subtitle_detected'}

// 现在：清洁简洁
[MessageBus] ✅ 消息系统初始化完成（单例模式）
[service-worker] Step 5.1: 获取轨道信息
[service-worker] ✓ 通过Player API获取到17条轨道
[service-worker] Step 5.2: 选择源语言: en
[service-worker] Step 5.3: 通过API设置字幕语言: en
```

**架构文件**：
- 🆕 `src/content-scripts/main-world.ts` - 新增SubtitleAPIController类
- 🔧 `src/background/service-worker.ts` - Step 5优化，集成Player API
- 🔧 `src/content-scripts/content-script.ts` - 新增API消息处理
- 📁 `src/shared/messages/message-bus.ts` - 统一消息系统实现

### 🎯 2025-01-XX - 播放器控制栏功能完成

**功能状态**：
- ✅ **翻译按钮**：开启/关闭翻译功能，状态图标动态切换
- ✅ **设置按钮**：打开Popup设置界面，管理翻译配置
- ✅ **状态同步**：按钮状态与实际功能状态完全一致

**架构完成**：
- ✅ **MessageBus 系统**：统一的消息通信机制
- ✅ **Popup 控制器**：智能页面检测和界面切换
- ✅ **UI 管理器**：自动注入和状态管理

## 🏗️ 技术架构

### 消息系统架构
```
MessageBus (单例)
├── MessageHandlers
├── 路由注册 (幂等)
└── 错误处理机制

组件获取方式：
content-script → 初始化MessageBus
ui-manager → 获取已初始化的实例  
control-panel → 获取已初始化的实例
```

### 文件结构
```
src/
├── content-scripts/          # 内容脚本
├── background/              # 后台脚本  
├── shared/
│   ├── messages/            # 🔄 重命名：events → messages
│   │   ├── message-bus.ts            # 消息总线（整合全局单例功能）
│   │   ├── message-handlers.ts      # 消息处理器
│   │   └── messages.ts               # 🔄 重命名：events.ts → messages.ts
│   ├── components/          # UI组件
│   │   ├── control-panel.ts          # 🔄 重命名：control-panel-new.ts → control-panel.ts
│   │   └── ui-manager.ts
│   └── types/              # 类型定义
└── popup/                  # Popup设置界面（替代SidePanel）
```

## 🚀 开发指南

### 构建命令
```bash
npm run build          # 完整构建
npm run build:dev      # 开发模式构建  
npm run build:watch    # 监听模式构建
```

### 调试技巧
1. **F12控制台**：查看详细的日志输出，现在日志更加清晰
2. **Extension DevTools**：查看Background Script状态
3. **Popup DevTools**：调试Popup设置界面功能

## 📝 开发日志

- **重复日志问题**：通过MessageBus单例模式根本解决 ✅
- **EventBus完全移除**：main-world中的EventBus已简化为MainWorldMessenger ✅
- **性能优化**：消息系统初始化性能显著提升

## 🔄 后续计划

1. **功能扩展**：添加更多翻译服务支持
2. **性能监控**：添加消息系统性能指标
3. **错误恢复**：完善消息系统故障恢复机制

## 🤝 贡献指南

如需贡献代码，请确保：
1. 遵循现有的MessageBus单例架构
2. 不要重复初始化消息系统
3. 添加适当的错误处理和日志记录 

# YouTube字幕翻译助手

> **版本**: v5.24.7+  
> **架构状态**: ✅ **消息格式迁移完成** - Background已全面采用新的MessageType标准格式

## 🔄 **最新架构更新**

### **消息格式标准化完成** (2025-01-XX)
- ✅ **Background消息处理**: 已完全迁移到新的MessageType枚举格式
- ✅ **类型安全**: 消除了基于字符串的旧格式，采用TypeScript枚举
- ✅ **消息追踪**: 支持完整的消息ID和元数据追踪
- ✅ **错误处理**: 统一的错误响应格式和处理机制

**消息格式变更**:
```typescript
// ❌ 旧格式 (已彻底废弃，不应在任何新代码中使用)
{ action: 'getRuntimeState', key: 'translateActive' }

// ✅ 新格式 (当前标准，所有代码必须使用此格式)
{ 
  type: MessageType.UI_STATE_UPDATE,
  messageId: 'msg_xxx',
  sender: MessageSender.CONTENT_SCRIPT,
  timestamp: 1750...,
  data: { ... }
}
```

## 📖 简介 