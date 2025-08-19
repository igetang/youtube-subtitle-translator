/**
 * @file src/shared/storage/index.ts
 * @description 存储模块的统一导出入口
 * 遵循"单源真相"和"依赖注入"原则，提供唯一的管理器实例
 */

export { MigrationHelper } from './migration-helper';
export { RuntimeStateManager } from './runtime-state-manager';
export { UserPreferencesManager } from './user-preferences-manager';
export { VideoSourceLanguageCacheManager } from './video-source-language-cache-manager';
export { TranslationCacheManager } from './translation-cache-manager';
export { VideoSettingsLocalStorage } from './video-settings-local-storage';
export type { VideoSettings } from './video-settings-local-storage';
export { StorageManager, StorageKeys } from './storage-manager';
export type { StorageArea } from './storage-manager';
// 🚨 暂时禁用：migration.ts需要重构后才能导出
// export { MigrationManager } from './migration';

// 🗑️ 移除所有实例创建，此文件只作为类型和类的导出桶
// import { UserPreferencesManager } from './user-preferences-manager';
// import { VideoSourceLanguageCacheManager } from './video-source-language-cache-manager';
// import { RuntimeStateManager } from './runtime-state-manager';

// 实例应由使用者通过 Class.getInstance() 获取，以避免循环依赖
// export const userPreferencesManager = UserPreferencesManager.getInstance();
// export const storageManager = StorageManager.getInstance();

// 向后兼容别名 - 逐步迁移中，最终将移除
export { UserPreferencesManager as GlobalSettingsManager } from './user-preferences-manager';

export type { 
  UserPreferences, 
  SubtitleMode, 
  TranslationServiceType, 
  TranslationServiceComplete,
  TranslationServiceForStorage,
  TranslationServiceForTransfer,
  TranslationServiceForUI,
  TranslationServiceForAPI,
  TranslationServiceForCacheKey,
  TranslationService,
  VideoSourceLanguageItem,
  VideoSourceLanguageCache
} from '../types/user-preferences-types';

export type { 
  RuntimeState, 
  RuntimeStateChangeEvent, 
  RuntimeStateChangeHandler 
} from '../types/runtime-state-types';

export { TranslateActiveState } from '../types/runtime-state-types'; 