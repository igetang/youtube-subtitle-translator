# 架构文档索引

## 📚 文档阅读顺序

### 核心架构文档（按顺序阅读）
1. **[01-design-principles.md](01-design-principles.md)** - 设计原则与架构决策
2. **[02-core-implementation.md](02-core-implementation.md)** - 核心功能实现
3. **[03-component-design.md](03-component-design.md)** - 组件设计与职责
4. **[04-message-system.md](04-message-system.md)** - 消息系统设计
5. **[05-performance-optimization.md](05-performance-optimization.md)** - 性能优化策略

### 专题文档
- **[popup.md](popup.md)** - Popup界面设计（替代SidePanel）
- **[translate-button-4-state-todo.md](translate-button-4-state-todo.md)** - 4状态翻译系统设计TODO
- **[architecture-bugs-and-solutions.md](architecture-bugs-and-solutions.md)** - 架构问题与解决方案

### 历史方案归档
- **[SidePanel方案文档](../archive/deprecated-sidepanel/)** - SidePanel完整技术方案（已废弃但保留参考价值）

## 🎯 关键架构决策

### 当前架构（v3.0.0）
- **消息系统**: MessageBus（已废弃EventBus）
- **UI方案**: Popup（已废弃SidePanel）
- **状态管理**: 4状态翻译系统（INACTIVE/PENDING/ACTIVE/INTENT_ONLY）
- **存储架构**: 分离RuntimeState和UserPreferences

### 为什么选择Popup而非SidePanel？
- **兼容性**: Popup支持所有Chrome版本，SidePanel需要Chrome 114+
- **用户体验**: Popup行为一致，SidePanel在不同页面表现不同
- **维护成本**: Popup是标准API，调试简单；SidePanel需要复杂的状态同步
- **详细分析**: 参见[设计原则文档](01-design-principles.md#已放弃方案-sidepanel)

### 架构演进历史
1. **EventBus → MessageBus** - 统一消息处理，提升可维护性
2. **SidePanel → Popup** - 提升兼容性和用户体验
3. **Boolean状态 → 4状态枚举** - 精确表达翻译状态
4. **全局同步 → 页面级状态管理** - 简化架构复杂度