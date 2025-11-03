# 架构文档索引

## 📚 文档阅读顺序

### 核心架构文档（按顺序阅读）
1. **[01-design-principles.md](01-design-principles.md)** - 设计原则与架构决策
2. **[02-core-implementation.md](02-core-implementation.md)** - 核心功能实现
3. **[03-component-design.md](03-component-design.md)** - 组件设计与职责
4. **[04-message-system.md](04-message-system.md)** - 消息系统设计
5. **[05-performance-optimization.md](05-performance-optimization.md)** - 性能优化策略
6. **[06-simplified-popup-architecture.md](06-simplified-popup-architecture.md)** - 简化的Popup直接调用架构
7. **[07-batch-translation-architecture.md](07-batch-translation-architecture.md)** - 批量翻译架构（时间间隔断句）
8. **[08-abort-timeout-architecture.md](08-abort-timeout-architecture.md)** - 基于AbortController的超时架构（v4.0）
9. **[09-subtitle-data-format-architecture.md](09-subtitle-data-format-architecture.md)** - 字幕数据格式架构
10. **[10-asr-subtitle-selection-solution.md](10-asr-subtitle-selection-solution.md)** - ASR字幕轨道选择解决方案
11. **[11-responsive-subtitle-implementation.md](11-responsive-subtitle-implementation.md)** - 响应式字幕实现
12. **[12-native-subtitle-injection-architecture.md](12-native-subtitle-injection-architecture.md)** - 🆕 YouTube原生字幕注入架构（Hook XHR方案）

### 专题文档
- **[popup.md](popup.md)** - Popup界面设计（替代SidePanel）
- **[translate-button-3-state-todo.md](translate-button-3-state-todo.md)** - 3状态翻译系统设计（已实现，文档待更新）
- **[architecture-bugs-and-solutions.md](architecture-bugs-and-solutions.md)** - 架构问题与解决方案

### 历史方案归档
- **[SidePanel方案文档](../archive/deprecated-sidepanel/)** - SidePanel完整技术方案（已废弃但保留参考价值）

## 🎯 关键架构决策

### 当前架构（v3.0.0）
- **消息系统**: MessageBus（已废弃EventBus）
- **UI方案**: Popup直接调用架构（Content Script直接调用chrome.action.openPopup()）
- **状态管理**: 3状态翻译系统（INACTIVE/PENDING/ACTIVE）
- **存储架构**: 三层分离（UserPreferences、VideoSourceLanguageData、TranslationCacheData）
- **状态同步**: chrome.storage.session共享内存（无需消息传递）

### 为什么选择Popup直接调用架构？
- **性能优异**: 响应速度从150ms降低到50ms，提升75%
- **代码简化**: 代码量减少40%，无需复杂的消息传递
- **兼容性好**: Popup支持所有Chrome版本，chrome.action.openPopup()在Chrome 88+可用
- **状态同步**: 利用chrome.storage.session自动同步，无需手动管理
- **详细分析**: 参见[简化架构文档](06-simplified-popup-architecture.md)

### 架构演进历史
1. **MessageBus统一** - 统一消息处理，提升可维护性
2. **SidePanel → Popup** - 提升兼容性和用户体验
3. **Boolean状态 → 3状态枚举** - 简化翻译状态管理（INACTIVE/PENDING/ACTIVE）
4. **PENDING超时机制** - 5秒超时保护，防止状态卡死
5. **YouTube Player API集成** - 使用官方API控制字幕，ISO 639-1标准
6. **智能源语言选择** - 用户历史/英语优先/手动优先规则
7. **批量翻译系统v2** - 时间间隔断句取代规则断句（2025.09）
8. **AbortController超时架构v4** - 真正中断执行流，解决超时问题（2025.09）
9. **视频源语言缓存单一数据源重构** - 消除重复写入，职责清晰分离（2025.11）⭐