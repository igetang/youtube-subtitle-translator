/**
 * @file migration-helper.ts
 * @description 数据迁移助手
 * 负责将旧版本的数据结构迁移到新版本
 * 🚧 注意: 此文件已被存根化 (stubbed out) 以便进行重构。
 * 迁移逻辑将在核心重构完成后重新实现。
 */

import { StorageManager } from './storage-manager';
import {
  LAST_MIGRATION_TIMESTAMP_KEY,
  MigrationResult
} from '../types/storage-types';

/**
 * 迁移助手 (存根实现)
 * 这是一个临时的占位符，以确保项目可以编译。
 * 在核心业务逻辑重构完成后，需要重新实现这里的迁移逻辑。
 */
export class MigrationHelper {
  private static instance: MigrationHelper;
  private storageManager: StorageManager;

  private constructor() {
    this.storageManager = StorageManager.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): MigrationHelper {
    if (!MigrationHelper.instance) {
      MigrationHelper.instance = new MigrationHelper();
    }
    return MigrationHelper.instance;
  }

  /**
   * 执行完整迁移 (存根实现)
   * 当前此方法仅记录一个时间戳，表示"迁移"已完成，
   * 实际上并未执行任何数据转换。
   * @returns 一个表示迁移成功的承诺。
   */
  public async migrate(): Promise<MigrationResult> {
    console.log('[migration-helper] 存根化的迁移任务执行。写入迁移完成时间戳。');
    
    await this.storageManager.set(LAST_MIGRATION_TIMESTAMP_KEY, Date.now());
    
    return {
      completed: true,
      details: {
        userPreferences: { migrated: true, error: undefined },
        videoCache: { migrated: true, error: undefined }
      }
    };
  }

  /**
   * 检查是否需要执行数据迁移 (存根实现)
   * 仅在首次运行时返回 true，以便 `migrate` 方法可以执行并设置时间戳。
   * @returns 如果需要运行迁移，则返回 true。
   */
  public async needsMigration(): Promise<boolean> {
    const lastMigrationTimestamp = await this.storageManager.get(LAST_MIGRATION_TIMESTAMP_KEY, 0);
    // 如果从未迁移过（即时间戳为0），则需要运行一次"迁移"来设置时间戳。
    if (lastMigrationTimestamp === 0) {
      console.log('[migration-helper] 未发现迁移时间戳，需要执行首次（存根化）迁移。');
      return true;
    }
    return false;
  }
} 