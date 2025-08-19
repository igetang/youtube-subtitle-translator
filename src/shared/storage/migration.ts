/**
 * @file migration.ts
 * @description 数据迁移脚本，从旧架构迁移到新的分层架构
 */

import { StorageManager, StorageKeys } from './storage-manager';
// 🚨 FIXME: 迁移功能已过时，需要重构或移除
// import { GlobalSettings, RuntimeState, DEFAULT_GLOBAL_SETTINGS, DEFAULT_RUNTIME_STATE, TranslationServiceType, calculateGlobalSettingsHash } from './global-settings';

/**
 * 迁移状态
 */
interface MigrationStatus {
  completed: boolean;
  globalSettingsMigrated: boolean;
  runtimeStateMigrated: boolean;
  errors: string[];
}

/**
 * 数据迁移管理器
 * 🚨 已过时：需要重构或移除，当前架构已经稳定
 * @deprecated 使用新架构的管理器替代
 */
export class MigrationManager {
  private storageManager: StorageManager;

  constructor() {
    this.storageManager = StorageManager.getInstance();
  }

  /**
   * 执行完整的数据迁移
   * 🚨 已禁用：当前架构已稳定，迁移功能已过时
   */
  public async migrate(): Promise<MigrationStatus> {
    const status: MigrationStatus = {
      completed: true, // 直接返回完成状态
      globalSettingsMigrated: true,
      runtimeStateMigrated: true,
      errors: []
    };

    console.log('[migration] 迁移功能已禁用，返回默认完成状态');
    return status;
  }

  /**
   * 迁移用户偏好设置（原全局设置）
   * 🚨 已过时：迁移功能已废弃，新架构已稳定
   */
  private async migrateUserPreferences(status: MigrationStatus): Promise<void> {
    try {
      console.log('[migration] ⚠️ 迁移功能已废弃，跳过用户偏好设置迁移');
      status.globalSettingsMigrated = true;
    } catch (error) {
      status.errors.push(`用户偏好设置迁移失败: ${error}`);
      console.error('[migration] 用户偏好设置迁移失败:', error);
    }
  }

  /**
   * 迁移运行时状态
   * 🚨 已过时：迁移功能已废弃，新架构已稳定
   */
  private async migrateRuntimeState(status: MigrationStatus): Promise<void> {
    try {
      console.log('[migration] ⚠️ 迁移功能已废弃，跳过运行时状态迁移');
      status.runtimeStateMigrated = true;
    } catch (error) {
      status.errors.push(`运行时状态迁移失败: ${error}`);
      console.error('[migration] 运行时状态迁移失败:', error);
    }
  }

  /**
   * 清理旧的设置数据
   */
  private async cleanupOldSettings(status: MigrationStatus): Promise<void> {
    try {
      // 如果迁移成功，清理旧的设置数据
      if (status.globalSettingsMigrated && status.runtimeStateMigrated) {
        const oldSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'local');
        const keysToRemove = Object.keys(oldSettings);
        
        if (keysToRemove.length > 0) {
          await this.storageManager.remove(keysToRemove, 'local');
          console.log(`[migration] 已清理 ${keysToRemove.length} 个旧设置项`);
        }
      }
    } catch (error) {
      status.errors.push(`清理旧设置失败: ${error}`);
      console.error('[migration] 清理旧设置失败:', error);
    }
  }

  /**
   * 映射旧的API类型到新的服务类型
   * 🚨 已过时：迁移功能已废弃
   */
  private mapOldApiToNewService(oldApi: string): string {
    console.log('[migration] ⚠️ 映射方法已废弃，返回默认值');
    return 'google-free';
  }

  /**
   * 检查是否需要迁移
   */
  public async needsMigration(): Promise<boolean> {
    try {
      // 检查是否已有新的用户偏好设置
      const newSettings = await this.storageManager.getByPrefix(StorageKeys.USER_PREFERENCES_PREFIX, 'local');
      const hasNewSettings = Object.keys(newSettings).length > 0;

      // 检查是否还有旧的设置
      const oldSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'local');
      const hasOldSettings = Object.keys(oldSettings).length > 0;

      return !hasNewSettings && hasOldSettings;
    } catch (error) {
      console.error('[migration] 检查迁移需求失败:', error);
      return false;
    }
  }

  /**
   * 获取迁移信息
   */
  public async getMigrationInfo(): Promise<{
    needsMigration: boolean;
    oldSettingsCount: number;
    newSettingsCount: number;
  }> {
    try {
      const oldSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'local');
      const newSettings = await this.storageManager.getByPrefix(StorageKeys.USER_PREFERENCES_PREFIX, 'local');

      return {
        needsMigration: await this.needsMigration(),
        oldSettingsCount: Object.keys(oldSettings).length,
        newSettingsCount: Object.keys(newSettings).length
      };
    } catch (error) {
      console.error('[migration] 获取迁移信息失败:', error);
      return {
        needsMigration: false,
        oldSettingsCount: 0,
        newSettingsCount: 0
      };
    }
  }
} 