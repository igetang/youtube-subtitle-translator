/**
 * 共享模块统一导出
 * 为Chrome Extension提供跨模块的类型、工具、消息系统等
 */

// === 核心组件模块 ===
export * from './components/ui-manager';
// export * from './components/control-panel'; // 已迁移到legacy文件夹

// === 消息系统模块 ===
// export * from './messages/message-bus'; // ✅ 使用MessageBus (events目录已重命名为messages)

// === 存储管理模块 ===
export * from './storage/storage-manager';
export * from './storage/user-preferences-manager';
export * from './storage/runtime-state-manager';
export * from './storage/video-source-language-cache-manager';

// === 类型定义模块 ===
export * from './types/core-types';
export * from './types/user-preferences-types';
export * from './types/runtime-state-types';
export * from './types/component-types';

// === 翻译调度模块 ===
export * from './translation/translation-dispatcher';

// 推荐导入方式：
// import type { MessageType } from '@shared/types/types';
// import { MessageBus } from '@shared';

// 类型导出（如果需要直接引用特定类型）
// 用户可以通过 import type { ... } from '@shared/types/...' 来引用具体类型
export * from './types/user-preferences-types';
export * from './types/runtime-state-types';

// 公共组件导出
// export * from './components/control-panel';
export * from './components/ui-manager';

// 常量导出（目录为空，暂时注释）
// export * from './constants';

// 新架构管理器导出已移除 - 使用统一的管理器实现
// UserPreferencesManager 和 RuntimeStateManager 通过 storage/index.ts 导出 