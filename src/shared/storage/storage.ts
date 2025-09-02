/**
 * YouTube字幕翻译助手 - 存储系统导出模块
 * @fileoverview 存储模块统一入口，导出重构后的存储架构
 * @version 5.24.6
 * @author AI Assistant
 * @filename storage.ts (重命名以避免index.ts混淆)
 */

// 🚨 此文件已过时 - 请使用 src/shared/storage/index.ts
// 保留用于向后兼容，但建议迁移到新的导出结构

// 存储管理器（有限导出）
export { StorageManager, StorageKeys } from './storage-manager';
export { UserPreferencesManager as GlobalSettingsManager } from './user-preferences-manager'; // 向后兼容别名
export { RuntimeStateManager } from './runtime-state-manager';
export { MigrationManager } from './migration';

// 🗑️ 以下导出已弃用 - 这些模块已经重构或删除
// export type { GlobalSettings, RuntimeState, VideoSpecificData, ServiceConfig } from './global-settings';
// export { SubtitleMode, TranslationServiceType, ... } from './global-settings';

// ✅ 推荐使用新的导出方式：
// import { UserPreferencesManager, StorageManager } from '@shared/storage';

// 导出存储区域类型
export type { StorageArea, StorageQuotaInfo, StorageChangeHandler } from './storage-manager'; 