/**
 * @file migration-helper.ts
 * @description 数据迁移助手，帮助从旧设置结构迁移到新的统一设置结构
 */

import { StorageManager, StorageKeys } from './storage-manager';
import { GlobalSettings, DEFAULT_GLOBAL_SETTINGS, VideoSpecificData } from './global-settings';
import { GlobalSettingsManager } from './global-settings-manager';

/**
 * 迁移状态
 */
export interface MigrationStatus {
  completed: boolean;
  userSettingsMigrated: boolean;
  videoSettingsMigrated: boolean;
  videoCount: number;
  errors: string[];
}

/**
 * 数据迁移助手类
 */
export class MigrationHelper {
  private static instance: MigrationHelper;
  private storageManager: StorageManager;
  private globalSettingsManager: GlobalSettingsManager;
  
  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.globalSettingsManager = GlobalSettingsManager.getInstance();
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
   * 检查是否需要迁移
   */
  public async needsMigration(): Promise<boolean> {
    try {
      // 检查是否已经有新的全局设置
      const globalSettings = await this.storageManager.getByPrefix(StorageKeys.GLOBAL_SETTINGS_PREFIX, 'local');
      const hasGlobalSettings = Object.keys(globalSettings).length > 0;
      
      if (hasGlobalSettings) {
        console.log('[migration-helper] 已存在全局设置，无需迁移');
        return false;
      }
      
      // 检查是否有旧的用户设置
      const oldUserSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'local');
      const hasOldUserSettings = Object.keys(oldUserSettings).length > 0;
      
      // 检查是否有旧的视频设置
      const oldVideoSettings = await this.storageManager.getByPrefix(StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX, 'local');
      const hasOldVideoSettings = Object.keys(oldVideoSettings).length > 0;
      
      const needsMigration = hasOldUserSettings || hasOldVideoSettings;
      
      if (needsMigration) {
        console.log('[migration-helper] 发现旧设置数据，需要迁移:', {
          userSettings: hasOldUserSettings,
          videoSettings: hasOldVideoSettings
        });
      } else {
        console.log('[migration-helper] 未发现旧设置数据，无需迁移');
      }
      
      return needsMigration;
    } catch (error) {
      console.error('[migration-helper] 检查迁移需求失败:', error);
      return false;
    }
  }
  
  /**
   * 执行完整迁移
   */
  public async migrate(): Promise<MigrationStatus> {
    const status: MigrationStatus = {
      completed: false,
      userSettingsMigrated: false,
      videoSettingsMigrated: false,
      videoCount: 0,
      errors: []
    };
    
    try {
      console.log('[migration-helper] 开始数据迁移...');
      
      // 检查是否真的需要迁移
      if (!(await this.needsMigration())) {
        status.completed = true;
        return status;
      }
      
      // 步骤1：迁移用户设置
      await this.migrateUserSettings(status);
      
      // 步骤2：迁移视频设置
      await this.migrateVideoSettings(status);
      
      // 步骤3：验证迁移结果
      await this.validateMigration(status);
      
      // 步骤4：清理旧数据（可选，保留作为备份）
      // await this.cleanupOldData(status);
      
      status.completed = status.userSettingsMigrated && (status.videoCount === 0 || status.videoSettingsMigrated);
      
      if (status.completed) {
        console.log('[migration-helper] ✅ 数据迁移完成', {
          userSettings: status.userSettingsMigrated,
          videoSettings: status.videoSettingsMigrated,
          videoCount: status.videoCount,
          errors: status.errors.length
        });
      } else {
        console.warn('[migration-helper] ⚠️ 数据迁移部分完成', status);
      }
      
    } catch (error) {
      status.errors.push(`迁移过程出错: ${error}`);
      console.error('[migration-helper] 数据迁移失败:', error);
    }
    
    return status;
  }
  
  /**
   * 迁移用户设置
   */
  private async migrateUserSettings(status: MigrationStatus): Promise<void> {
    try {
      console.log('[migration-helper] 开始迁移用户设置...');
      
      // 获取所有旧的用户设置
      const oldSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'local');
      
      if (Object.keys(oldSettings).length === 0) {
        console.log('[migration-helper] 未发现旧用户设置，使用默认值');
        status.userSettingsMigrated = true;
        return;
      }
      
      // 构建新的全局设置
      const newGlobalSettings: Partial<GlobalSettings> = { ...DEFAULT_GLOBAL_SETTINGS };
      
      // 映射旧设置到新设置
      Object.keys(oldSettings).forEach(key => {
        const settingKey = key.replace(StorageKeys.SETTINGS_PREFIX, '');
        const value = oldSettings[key];
        
        // 映射已知的设置键
        switch (settingKey) {
          case 'sourceLang':
          case 'targetLang':
          case 'subtitleMode':
          case 'translateActive':
          case 'translationApi':
          case 'apiKey':
          case 'serviceType':
          case 'membershipCredentials':
          case 'customApiConfig':
          case 'openaiConfig':
            (newGlobalSettings as any)[settingKey] = value;
            console.log(`[migration-helper] 迁移设置: ${settingKey} = ${JSON.stringify(value)}`);
            break;
          default:
            console.log(`[migration-helper] 跳过未知设置: ${settingKey}`);
            break;
        }
      });
      
      // 保存到新的全局设置
      await this.globalSettingsManager.setMultipleSettings(newGlobalSettings);
      
      status.userSettingsMigrated = true;
      console.log('[migration-helper] ✅ 用户设置迁移完成');
      
    } catch (error) {
      const errorMsg = `用户设置迁移失败: ${error}`;
      status.errors.push(errorMsg);
      console.error(`[migration-helper] ${errorMsg}`);
    }
  }
  
  /**
   * 迁移视频设置
   */
  private async migrateVideoSettings(status: MigrationStatus): Promise<void> {
    try {
      console.log('[migration-helper] 开始迁移视频设置...');
      
      // 获取所有旧的视频设置
      const oldVideoSettings = await this.storageManager.getByPrefix(StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX, 'local');
      const videoIds = Object.keys(oldVideoSettings).map(key => 
        key.replace(StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX, '')
      );
      
      status.videoCount = videoIds.length;
      
      if (videoIds.length === 0) {
        console.log('[migration-helper] 未发现旧视频设置');
        status.videoSettingsMigrated = true;
        return;
      }
      
      console.log(`[migration-helper] 发现 ${videoIds.length} 个视频的设置，开始迁移...`);
      
      // 构建新的视频缓存
      const videoSpecificCache: Record<string, VideoSpecificData> = {};
      const recentVideos: string[] = [];
      
      // 迁移每个视频的设置
      videoIds.forEach(videoId => {
        const oldData = oldVideoSettings[`${StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX}${videoId}`];
        
        if (oldData && oldData.videoId) {
          const newVideoData: VideoSpecificData = {
            videoId: oldData.videoId,
            sourceLang: oldData.sourceLang || 'auto',
            targetLang: oldData.targetLang || 'zh-Hans',
            lastUsed: oldData.lastUsed || Date.now(),
            hasSubtitles: oldData.hasSubtitles !== undefined ? oldData.hasSubtitles : true,
            sourceTrackKind: oldData.sourceTrackKind
          };
          
          videoSpecificCache[videoId] = newVideoData;
          recentVideos.push(videoId);
          
          console.log(`[migration-helper] 迁移视频设置: ${videoId}`);
        }
      });
      
      // 按最后使用时间排序最近视频列表
      recentVideos.sort((a, b) => {
        const timeA = videoSpecificCache[a]?.lastUsed || 0;
        const timeB = videoSpecificCache[b]?.lastUsed || 0;
        return timeB - timeA; // 降序，最新的在前
      });
      
      // 限制最近视频列表长度
      const maxCachedVideos = await this.globalSettingsManager.getSetting('maxCachedVideos');
      const limitedRecentVideos = recentVideos.slice(0, maxCachedVideos);
      
      // 同时限制缓存大小
      const limitedCache: Record<string, VideoSpecificData> = {};
      limitedRecentVideos.forEach(videoId => {
        if (videoSpecificCache[videoId]) {
          limitedCache[videoId] = videoSpecificCache[videoId];
        }
      });
      
      // 保存到全局设置
      await this.globalSettingsManager.setSetting('videoSpecificCache', limitedCache);
      await this.globalSettingsManager.setSetting('recentVideos', limitedRecentVideos);
      
      status.videoSettingsMigrated = true;
      console.log(`[migration-helper] ✅ 视频设置迁移完成，迁移了 ${Object.keys(limitedCache).length} 个视频`);
      
    } catch (error) {
      const errorMsg = `视频设置迁移失败: ${error}`;
      status.errors.push(errorMsg);
      console.error(`[migration-helper] ${errorMsg}`);
    }
  }
  
  /**
   * 验证迁移结果
   */
  private async validateMigration(status: MigrationStatus): Promise<void> {
    try {
      console.log('[migration-helper] 验证迁移结果...');
      
      // 验证全局设置是否存在
      const globalSettings = await this.globalSettingsManager.getAllSettings();
      
      if (!globalSettings || typeof globalSettings !== 'object') {
        throw new Error('全局设置验证失败：设置不存在或格式错误');
      }
      
      // 验证关键设置字段
      const requiredFields = ['sourceLang', 'targetLang', 'translationApi'];
      for (const field of requiredFields) {
        if (!(field in globalSettings)) {
          throw new Error(`全局设置验证失败：缺少必需字段 ${field}`);
        }
      }
      
      // 验证视频缓存
      if (status.videoCount > 0) {
        const videoCache = globalSettings.videoSpecificCache;
        if (!videoCache || typeof videoCache !== 'object') {
          throw new Error('视频缓存验证失败：缓存不存在或格式错误');
        }
        
        console.log(`[migration-helper] 验证通过：全局设置包含 ${Object.keys(videoCache).length} 个视频的缓存`);
      }
      
      console.log('[migration-helper] ✅ 迁移结果验证通过');
      
    } catch (error) {
      const errorMsg = `迁移结果验证失败: ${error}`;
      status.errors.push(errorMsg);
      console.error(`[migration-helper] ${errorMsg}`);
    }
  }
  
  /**
   * 清理旧数据（可选）
   * 注意：这将永久删除旧设置，建议谨慎使用
   */
  public async cleanupOldData(): Promise<void> {
    try {
      console.log('[migration-helper] 开始清理旧数据...');
      
      // 清理旧用户设置
      const oldUserSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'local');
      const userSettingKeys = Object.keys(oldUserSettings);
      
      if (userSettingKeys.length > 0) {
        await this.storageManager.remove(userSettingKeys, 'local');
        console.log(`[migration-helper] 清理了 ${userSettingKeys.length} 个旧用户设置`);
      }
      
      // 清理旧视频设置
      const oldVideoSettings = await this.storageManager.getByPrefix(StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX, 'local');
      const videoSettingKeys = Object.keys(oldVideoSettings);
      
      if (videoSettingKeys.length > 0) {
        await this.storageManager.remove(videoSettingKeys, 'local');
        console.log(`[migration-helper] 清理了 ${videoSettingKeys.length} 个旧视频设置`);
      }
      
      // 清理旧的最近使用视频列表
      await this.storageManager.remove(StorageKeys.LOCAL.LAST_USED_VIDEOS, 'local');
      
      console.log('[migration-helper] ✅ 旧数据清理完成');
      
    } catch (error) {
      console.error('[migration-helper] 清理旧数据失败:', error);
      throw error;
    }
  }
  
  /**
   * 创建数据备份
   */
  public async createBackup(): Promise<string> {
    try {
      console.log('[migration-helper] 创建数据备份...');
      
      // 获取所有旧设置
      const oldUserSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'local');
      const oldVideoSettings = await this.storageManager.getByPrefix(StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX, 'local');
      const lastUsedVideos = await this.storageManager.get(StorageKeys.LOCAL.LAST_USED_VIDEOS, [], 'local');
      
      const backup = {
        timestamp: new Date().toISOString(),
        userSettings: oldUserSettings,
        videoSettings: oldVideoSettings,
        lastUsedVideos: lastUsedVideos
      };
      
      const backupString = JSON.stringify(backup, null, 2);
      console.log('[migration-helper] ✅ 数据备份创建完成');
      
      return backupString;
      
    } catch (error) {
      console.error('[migration-helper] 创建数据备份失败:', error);
      throw error;
    }
  }
} 