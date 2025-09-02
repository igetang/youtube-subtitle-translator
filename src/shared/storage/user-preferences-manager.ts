/**
 * @file user-preferences-manager.ts
 * @description 新架构下的用户偏好设置管理器
 */

import { StorageManager, StorageKeys } from './storage-manager';
import { 
  UserPreferences,
  DEFAULT_USER_PREFERENCES,
  UserPreferenceChangeEvent,
  UserPreferenceChangeHandler,
  calculateUserPreferencesHash,
  TranslationServiceType,
  TRANSLATION_SERVICE_TEMPLATES,
  SubtitleMode
} from '../types/user-preferences-types';

// 立即验证导入的默认值
console.log('[user-preferences-manager] 模块加载时 DEFAULT_USER_PREFERENCES:', {
  hasDefaultImported: !!DEFAULT_USER_PREFERENCES,
  hasTranslationService: !!DEFAULT_USER_PREFERENCES?.translationService,
  translationServiceType: DEFAULT_USER_PREFERENCES?.translationService?.type,
  fullDefault: DEFAULT_USER_PREFERENCES
});
import { findMatchingTargetLanguage } from '../utils/language-processing';
import { checkMigrationNeeded, convertUserSettingsToUserPreferences } from '../utils/settings-migration';

/**
 * VideoSettings interface for legacy compatibility
 */
interface VideoSettings {
  videoId: string;
  sourceLang: string;
  targetLang: string;
  lastUsed: number;
  hasSubtitles: boolean;
  sourceTrackKind?: string;
}

/**
 * 用户偏好设置管理器
 * 管理用户偏好设置的存取和变更通知
 */
export class UserPreferencesManager {
  private static instance: UserPreferencesManager;
  private storageManager: StorageManager;
  private changeHandlers: Map<UserPreferenceChangeEvent, Set<UserPreferenceChangeHandler>>;
  private initialized: boolean = false;

  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.changeHandlers = new Map();
    
    // 设置存储变更监听器
    this.setupStorageListener();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): UserPreferencesManager {
    if (!UserPreferencesManager.instance) {
      UserPreferencesManager.instance = new UserPreferencesManager();
    }
    return UserPreferencesManager.instance;
  }

  /**
   * 设置存储变更监听器
   */
  private setupStorageListener(): void {
    // 监听UserPreferences相关的存储变更
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;
      
      // 检查是否是UserPreferences的变更
      const userPrefsKey = StorageKeys.USER_PREFERENCES_PREFIX;
      Object.keys(changes).forEach((key) => {
        if (key.startsWith(userPrefsKey)) {
          console.log('[user-preferences-manager] 检测到UserPreferences存储变更:', key);
          
          // 触发变更事件
          this.triggerPreferencesChangeEvent(changes[key].newValue, changes[key].oldValue);
        }
      });
    };
    
    // 添加监听器
    this.storageManager.addChangeListener(StorageKeys.USER_PREFERENCES_PREFIX, handleStorageChange);
  }

  /**
   * 触发偏好设置变更事件
   */
  private triggerPreferencesChangeEvent(newPrefs: UserPreferences, oldPrefs: UserPreferences): void {
    if (!newPrefs || !oldPrefs) return;

    // 检查各个字段的变更
    if (newPrefs.targetLang !== oldPrefs.targetLang) {
      this.triggerChangeEvent(UserPreferenceChangeEvent.TARGET_LANG_CHANGED, newPrefs.targetLang, oldPrefs.targetLang);
    }

    if (newPrefs.subtitleMode !== oldPrefs.subtitleMode) {
      this.triggerChangeEvent(UserPreferenceChangeEvent.SUBTITLE_MODE_CHANGED, newPrefs.subtitleMode, oldPrefs.subtitleMode);
    }

    if (JSON.stringify(newPrefs.translationService) !== JSON.stringify(oldPrefs.translationService)) {
      this.triggerChangeEvent(UserPreferenceChangeEvent.TRANSLATION_SERVICE_CHANGED, newPrefs.translationService, oldPrefs.translationService);
    }
  }

  /**
   * 触发特定的变更事件
   */
  private triggerChangeEvent(
    event: UserPreferenceChangeEvent,
    newValue: any,
    oldValue: any
  ): void {
    if (this.changeHandlers.has(event)) {
      const handlers = this.changeHandlers.get(event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(newValue, oldValue, event);
          } catch (error) {
            console.error(`[user-preferences-manager] ✗ 事件处理器执行错误 (${event}):`, error);
          }
        });
      }
    }
  }

  /**
   * 添加偏好设置变更监听器
   * @param event 偏好设置变更事件类型
   * @param handler 变更处理函数
   */
  public addChangeListener(event: UserPreferenceChangeEvent, handler: UserPreferenceChangeHandler): void {
    if (!this.changeHandlers.has(event)) {
      this.changeHandlers.set(event, new Set());
    }
    this.changeHandlers.get(event)!.add(handler);
  }

  /**
   * 移除偏好设置变更监听器
   * @param event 偏好设置变更事件类型
   * @param handler 要移除的处理函数（可选）
   */
  public removeChangeListener(event: UserPreferenceChangeEvent, handler?: UserPreferenceChangeHandler): void {
    if (!this.changeHandlers.has(event)) return;

    const handlers = this.changeHandlers.get(event)!;
    if (handler) {
      handlers.delete(handler);
    } else {
      handlers.clear();
    }

    if (handlers.size === 0) {
      this.changeHandlers.delete(event);
    }
  }

  /**
   * 验证UserPreferences数据的完整性 (移植自 settings-migration.ts)
   * @param userPreferences 需要验证的UserPreferences数据
   * @returns 验证结果和错误信息
   */
  private validateUserPreferences(userPreferences: Partial<UserPreferences>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!userPreferences) {
      errors.push('UserPreferences 对象不能为空');
      return { isValid: false, errors, warnings };
    }

    // 1. 检查顶级字段
    if (typeof userPreferences.targetLang !== 'string' || !userPreferences.targetLang) {
      errors.push('targetLang 必须是一个非空字符串');
    }
    if (!Object.values(SubtitleMode).includes(userPreferences.subtitleMode as SubtitleMode)) {
      errors.push('subtitleMode 必须是有效的SubtitleMode枚举值');
    }

    // 2. 检查 translationService 对象
    const service = userPreferences.translationService;
    if (!service || typeof service !== 'object') {
      errors.push('translationService 必须是一个对象');
    } else {
      if (!Object.values(TranslationServiceType).includes(service.type as TranslationServiceType)) {
        errors.push('translationService.type 必须是有效的TranslationServiceType枚举值');
      }
      if (typeof service.name !== 'string' || !service.name) {
        errors.push('translationService.name 必须是一个非空字符串');
      }

      // 检查特定于API的字段
      const template = TRANSLATION_SERVICE_TEMPLATES[service.type as TranslationServiceType];
      if (template) {
        if (template.model !== null && (typeof service.model !== 'string' || !service.model)) {
          warnings.push(`translationService.model 对于 ${service.type} 应该是字符串`);
        }
        if (template.temperature !== null && typeof service.temperature !== 'number') {
          warnings.push(`translationService.temperature 对于 ${service.type} 应该是数字`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 初始化用户偏好设置管理器
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 检查并执行从UserSettings到UserPreferences的迁移
      const migrationNeeded = await checkMigrationNeeded();
      if (migrationNeeded) {
        // const legacySettings = await LegacySettingsManager.getAllSettings(); // 🔴 废弃的调用
        // const migratedPreferences = convertUserSettingsToUserPreferences(legacySettings);
        
        // 🔴 注意：由于 LegacySettingsManager 已被移除，这里的迁移逻辑需要重新审视。
        // 暂时跳过基于旧管理器的自动迁移，以避免错误。
        // 如果需要保留迁移，应提供一个独立的、不依赖旧文件的数据转换函数。
        console.warn('[user-preferences-manager] LegacySettingsManager 已移除，暂时跳过旧数据迁移。');
      }

      // 确保默认偏好设置存在
      await this.ensureDefaultPreferences();

      this.initialized = true;
      console.log('[user-preferences-manager] ✓ 初始化完成');

    } catch (error) {
      console.error('[user-preferences-manager] ✗ 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 确保默认偏好设置存在
   */
  private async ensureDefaultPreferences(): Promise<void> {
    try {
      const existing = await this.getUserPreferences();
      if (!existing) {
        console.log('[user-preferences-manager] 设置默认偏好配置');
        await this.setUserPreferences(DEFAULT_USER_PREFERENCES);
      }
    } catch (error) {
      console.error('[user-preferences-manager] 设置默认偏好配置失败:', error);
      await this.setUserPreferences(DEFAULT_USER_PREFERENCES);
    }
  }

  /**
   * 获取完整的用户偏好设置
   */
  public async getUserPreferences(): Promise<UserPreferences> {
    try {
      const storageKey = `${StorageKeys.USER_PREFERENCES_PREFIX}main`;
      console.log('[user-preferences-manager] 从Local Storage读取偏好设置, key:', storageKey);
      const data = await this.storageManager.get<UserPreferences | null>(storageKey, null);
      
      if (data) {
        // 验证数据完整性
        const validation = this.validateUserPreferences(data);
        
        if (validation.isValid) {
          console.log('[user-preferences-manager] ✓ 读取成功:', {
            targetLang: data.targetLang,
            subtitleMode: data.subtitleMode,
            translationServiceType: data.translationService?.type
          });
          return data;
        } else {
          console.warn('[user-preferences-manager] 存储的偏好设置数据无效:', validation.errors);
        }
      }

      // 如果没有找到有效数据，返回默认设置
      console.log('[user-preferences-manager] 使用默认偏好设置');
      return DEFAULT_USER_PREFERENCES;

    } catch (error) {
      console.error('[user-preferences-manager] 获取偏好设置失败:', error);
      return DEFAULT_USER_PREFERENCES;
    }
  }

  /**
   * 设置完整的用户偏好设置
   */
  public async setUserPreferences(preferences: UserPreferences): Promise<void> {
    try {
      // 验证数据
      const validation = this.validateUserPreferences(preferences);
      if (!validation.isValid) {
        throw new Error(`偏好设置数据无效: ${validation.errors.join(', ')}`);
      }

      // 重新计算hash
      const prefsWithoutHash: Omit<UserPreferences, 'hash'> = {
        targetLang: preferences.targetLang,
        subtitleMode: preferences.subtitleMode,
        translationService: preferences.translationService
      };
      
      const finalPreferences: UserPreferences = {
        ...prefsWithoutHash,
        hash: calculateUserPreferencesHash(prefsWithoutHash)
      };

      // 保存到存储
      const storageKey = `${StorageKeys.USER_PREFERENCES_PREFIX}main`;
      await this.storageManager.set(storageKey, finalPreferences);

      console.log('[user-preferences-manager] ✓ setUserPreferences: 成功');

    } catch (error) {
      console.error('[user-preferences-manager] ✗ setUserPreferences:', error);
      throw error;
    }
  }

  /**
   * 更新部分偏好设置
   */
  public async updateUserPreferences(updates: Partial<Omit<UserPreferences, 'hash'>>): Promise<void> {
    try {
      const current = await this.getUserPreferences();
      const updated: UserPreferences = {
        ...current,
        ...updates,
        hash: '' // 临时值，会在setUserPreferences中重新计算
      };

      await this.setUserPreferences(updated);

    } catch (error) {
      console.error('[user-preferences-manager] ✗ updateUserPreferences:', error);
      throw error;
    }
  }

  /**
   * 重置偏好设置为默认值
   */
  public async resetUserPreferences(): Promise<void> {
    try {
      console.log('[user-preferences-manager] 重置偏好设置为默认值');
      await this.setUserPreferences(DEFAULT_USER_PREFERENCES);
    } catch (error) {
      console.error('[user-preferences-manager] ✗ resetUserPreferences:', error);
      throw error;
    }
  }

  /**
   * 导出偏好设置为JSON字符串
   */
  public async exportUserPreferences(): Promise<string> {
    try {
      const preferences = await this.getUserPreferences();
      
      // 移除敏感信息（API密钥）
      const exportData = {
        ...preferences,
        translationService: {
          ...preferences.translationService,
          apiKey: undefined
        }
      };

      return JSON.stringify(exportData, null, 2);

    } catch (error) {
      console.error('[user-preferences-manager] ✗ exportUserPreferences:', error);
      throw error;
    }
  }

  /**
   * 从JSON字符串导入偏好设置
   */
  public async importUserPreferences(json: string): Promise<boolean> {
    try {
      const data = JSON.parse(json);
      
      // 验证导入的数据
      const validation = this.validateUserPreferences(data);
      if (!validation.isValid) {
        console.error('[user-preferences-manager] 导入数据验证失败:', validation.errors);
        return false;
      }

      // 保留当前的API密钥（如果存在）
      const current = await this.getUserPreferences();
      const imported: UserPreferences = {
        ...data,
        translationService: {
          ...data.translationService,
          apiKey: data.translationService.apiKey || current.translationService.apiKey
        }
      };

      await this.setUserPreferences(imported);
      console.log('[user-preferences-manager] ✓ importUserPreferences: 成功');
      return true;

    } catch (error) {
      console.error('[user-preferences-manager] ✗ importUserPreferences:', error);
      return false;
    }
  }

  /**
   * 获取当前状态信息
   */
  public getStatus(): {
    initialized: boolean;
    changeListenersCount: number;
  } {
    return {
      initialized: this.initialized,
      changeListenersCount: Array.from(this.changeHandlers.values()).reduce((total, set) => total + set.size, 0)
    };
  }

  /**
   * 获取视频特定数据 - 为兼容性提供
   * @param videoId 视频ID
   * @returns {Promise<VideoSettings | null>} 视频的特定设置，如果不存在则返回 null。
   * @description 从本地存储中获取特定视频的设置。
   */
  public async getVideoSettings(videoId: string): Promise<VideoSettings | null> {
    if (!videoId) return null;

    try {
      const storageKey = `${StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX}${videoId}`;
      const videoData = await this.storageManager.get<VideoSettings | null>(storageKey, null, 'local');
      
      if (videoData) {
        console.log(`[user-preferences-manager] ✓ getVideoSettings: ${videoId}`);
        return videoData;
      } else {
        console.log(`[user-preferences-manager] getVideoSettings: ${videoId} 未找到`);
        return null;
      }
    } catch (error) {
      console.error('[user-preferences-manager] 获取视频特定数据失败:', error);
      return null;
    }
  }

  /**
   * 保存特定视频的设置。
   * @param {VideoSettings} videoData - 要保存的视频设置数据。
   */
  public async saveVideoSettings(videoData: VideoSettings): Promise<void> {
    if (!videoData || !videoData.videoId) {
      console.warn('[user-preferences-manager] 无效的视频数据，跳过保存');
      return;
    }

    try {
      const storageKey = `${StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX}${videoData.videoId}`;
      const dataToSave = {
        ...videoData,
        lastUsed: videoData.lastUsed || Date.now()
      };

      // 检查是否有实际变更
      const existingData = await this.storageManager.get<VideoSettings | null>(storageKey, null, 'local');
      let hasChanges = false;
      let changeDetails: string[] = [];

      if (!existingData) {
        hasChanges = true;
        changeDetails.push('首次保存');
      } else {
        if (existingData.sourceLang !== dataToSave.sourceLang) {
          hasChanges = true;
          changeDetails.push(`源语言: ${existingData.sourceLang} → ${dataToSave.sourceLang}`);
        }
        if (existingData.targetLang !== dataToSave.targetLang) {
          hasChanges = true;
          changeDetails.push(`目标语言: ${existingData.targetLang} → ${dataToSave.targetLang}`);
        }
        if (existingData.hasSubtitles !== dataToSave.hasSubtitles) {
          hasChanges = true;
          changeDetails.push(`字幕状态: ${existingData.hasSubtitles} → ${dataToSave.hasSubtitles}`);
        }
        if (existingData.sourceTrackKind !== dataToSave.sourceTrackKind) {
          hasChanges = true;
          changeDetails.push(`轨道类型: ${existingData.sourceTrackKind} → ${dataToSave.sourceTrackKind}`);
        }
      }

      const writeReason = hasChanges ? '数据变更' : '仅时间戳更新';
      console.log(`[user-preferences-manager] 保存视频数据 ${videoData.videoId} (${writeReason}): ${changeDetails.length > 0 ? changeDetails.join(', ') : '无实质变更'}`);

      await this.storageManager.set(storageKey, dataToSave, 'local');
      console.log(`[user-preferences-manager] ✓ saveVideoSettings: ${videoData.videoId}`);

      // 更新最近使用的视频列表
      await this.updateLastUsedVideos(videoData.videoId);
      
      // 管理缓存大小
      await this.manageCacheSize();
    } catch (error) {
      console.error('[user-preferences-manager] 保存视频特定数据失败:', error);
    }
  }

  /**
   * 更新最近使用的视频列表
   * @param videoId 视频ID
   */
  private async updateLastUsedVideos(videoId: string): Promise<void> {
    try {
      const MAX_CACHED_VIDEOS = 50;
      const lastUsedVideos = await this.storageManager.get<string[]>(StorageKeys.LOCAL.LAST_USED_VIDEOS, [], 'local');
      
      const newList = [
        videoId,
        ...lastUsedVideos.filter(id => id !== videoId)
      ].slice(0, MAX_CACHED_VIDEOS);
      
      await this.storageManager.set(StorageKeys.LOCAL.LAST_USED_VIDEOS, newList, 'local');
    } catch (error) {
      console.error('[user-preferences-manager] 更新最近使用视频列表失败:', error);
    }
  }

  /**
   * 管理缓存大小，移除超出限制的最老视频数据
   */
  private async manageCacheSize(): Promise<void> {
    try {
      const MAX_CACHED_VIDEOS = 50;
      const storageData = await this.storageManager.getBatch(null, 'local');
      
      const videoSettingsKeys = Object.keys(storageData)
        .filter(key => key.startsWith(StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX));
      
      if (videoSettingsKeys.length > MAX_CACHED_VIDEOS) {
        console.log(`[user-preferences-manager] 视频缓存数量(${videoSettingsKeys.length})超出限制(${MAX_CACHED_VIDEOS})，开始清理`);
        
        const sortedEntries = videoSettingsKeys
          .map(key => ({
            key,
            lastUsed: (storageData[key] as VideoSettings).lastUsed || 0
          }))
          .sort((a, b) => a.lastUsed - b.lastUsed);
        
        const removeCount = videoSettingsKeys.length - MAX_CACHED_VIDEOS;
        const keysToRemove = sortedEntries
          .slice(0, removeCount)
          .map(entry => entry.key);
        
        await this.storageManager.remove(keysToRemove, 'local');
        console.log(`[user-preferences-manager] 已清理 ${removeCount} 个最老的视频数据`);
      }
    } catch (error) {
      console.error('[user-preferences-manager] 管理缓存大小失败:', error);
    }
  }
} 