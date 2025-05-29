/**
 * @file global-settings-manager.ts
 * @description 统一的全局设置管理器，整合原SettingsManager和VideoSettingsLocalStorage功能
 */

import { StorageManager, StorageKeys, StorageArea } from './storage-manager';
import { 
  GlobalSettings, 
  VideoSpecificData, 
  DEFAULT_GLOBAL_SETTINGS, 
  GlobalSettingChangeEvent, 
  GlobalSettingChangeHandler 
} from './global-settings';
import { findMatchingTargetLanguage } from '../utils/language-processing';

/**
 * 统一的全局设置管理器
 * 管理所有设置的存取、缓存和变更通知
 */
export class GlobalSettingsManager {
  private static instance: GlobalSettingsManager;
  private storageManager: StorageManager;
  private changeHandlers: Map<GlobalSettingChangeEvent, Set<GlobalSettingChangeHandler>>;
  private settingsMemoryCache: Partial<GlobalSettings> = {};
  private initialized: boolean = false;

  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.changeHandlers = new Map();
    
    // 添加存储变更监听器
    this.setupStorageListener();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): GlobalSettingsManager {
    if (!GlobalSettingsManager.instance) {
      GlobalSettingsManager.instance = new GlobalSettingsManager();
    }
    return GlobalSettingsManager.instance;
  }

  /**
   * 设置存储变更监听器
   */
  private setupStorageListener(): void {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: StorageArea) => {
      if (area !== 'local') return; // 🔧 修正：设置只存储在 local 区域
      
      // 处理所有与设置相关的变更
      Object.keys(changes).forEach((key) => {
        if (key.startsWith(StorageKeys.GLOBAL_SETTINGS_PREFIX)) {
          const settingKey = key.replace(StorageKeys.GLOBAL_SETTINGS_PREFIX, '') as keyof GlobalSettings;
          const change = changes[key];
          
          // 更新memory cache
          if (this.settingsMemoryCache) {
            (this.settingsMemoryCache as any)[settingKey] = change.newValue;
          }
          
          // 根据设置键触发对应事件
          this.triggerChangeEvent(settingKey, change.newValue, change.oldValue);
        }
      });
    };
    
    // 添加监听器
    this.storageManager.addChangeListener(StorageKeys.GLOBAL_SETTINGS_PREFIX, handleStorageChange);
  }

  /**
   * 根据设置键触发相应的变更事件
   */
  private triggerChangeEvent(
    settingKey: keyof GlobalSettings,
    newValue: any,
    oldValue: any
  ): void {
    let event: GlobalSettingChangeEvent | null = null;
    
    // 映射设置键到事件类型
    switch (settingKey) {
      case 'sourceLang':
        event = GlobalSettingChangeEvent.SOURCE_LANG_CHANGED;
        break;
      case 'targetLang':
        event = GlobalSettingChangeEvent.TARGET_LANG_CHANGED;
        break;
      case 'subtitleMode':
        event = GlobalSettingChangeEvent.SUBTITLE_MODE_CHANGED;
        break;
      case 'translateActive':
        event = GlobalSettingChangeEvent.TRANSLATE_ACTIVE_CHANGED;
        break;
      case 'translationApi':
        event = GlobalSettingChangeEvent.TRANSLATION_API_CHANGED;
        break;
      case 'apiKey':
        event = GlobalSettingChangeEvent.API_KEY_CHANGED;
        break;
      case 'serviceType':
      case 'membershipCredentials':
      case 'customApiConfig':
      case 'openaiConfig':
        event = GlobalSettingChangeEvent.API_SETTINGS_CHANGED;
        break;
      case 'currentVideoId':
        event = GlobalSettingChangeEvent.CURRENT_VIDEO_CHANGED;
        break;
      case 'videoSpecificCache':
      case 'recentVideos':
        event = GlobalSettingChangeEvent.VIDEO_SPECIFIC_DATA_CHANGED;
        break;
    }
    
    // 如果有对应的事件类型，触发所有注册的处理函数
    if (event !== null && this.changeHandlers.has(event)) {
      const handlers = this.changeHandlers.get(event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(newValue, oldValue, event as GlobalSettingChangeEvent);
          } catch (error) {
            console.error(`[global-settings-manager] 设置变更处理函数执行错误 (事件: ${event}):`, error);
          }
        });
      }
    }
  }

  /**
   * 添加设置变更监听器
   */
  public addChangeListener(event: GlobalSettingChangeEvent, handler: GlobalSettingChangeHandler): void {
    if (!this.changeHandlers.has(event)) {
      this.changeHandlers.set(event, new Set());
    }
    this.changeHandlers.get(event)!.add(handler);
  }

  /**
   * 移除设置变更监听器
   */
  public removeChangeListener(event: GlobalSettingChangeEvent, handler?: GlobalSettingChangeHandler): void {
    if (!this.changeHandlers.has(event)) return;
    
    if (handler) {
      this.changeHandlers.get(event)!.delete(handler);
      if (this.changeHandlers.get(event)!.size === 0) {
        this.changeHandlers.delete(event);
      }
    } else {
      this.changeHandlers.delete(event);
    }
  }

  /**
   * 初始化设置管理器
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // 获取所有设置
      const settings = await this.storageManager.getByPrefix(StorageKeys.GLOBAL_SETTINGS_PREFIX, 'local');
      
      // 转换为内部格式并存入memory cache
      this.settingsMemoryCache = {};
      Object.keys(settings).forEach((key) => {
        if (key.startsWith(StorageKeys.GLOBAL_SETTINGS_PREFIX)) {
          const settingKey = key.replace(StorageKeys.GLOBAL_SETTINGS_PREFIX, '') as keyof GlobalSettings;
          (this.settingsMemoryCache as any)[settingKey] = settings[key];
        }
      });
      
      // 确保所有必要设置都有默认值
      await this.ensureDefaultSettings();
      
      this.initialized = true;
      console.log('[global-settings-manager] 设置管理器初始化完成');
    } catch (error) {
      console.error('[global-settings-manager] 设置管理器初始化失败:', error);
      this.settingsMemoryCache = { ...DEFAULT_GLOBAL_SETTINGS };
    }
  }

  /**
   * 确保所有必要设置都存在
   */
  private async ensureDefaultSettings(): Promise<void> {
    const settings: Record<string, any> = {};
    let needSave = false;
    
    // 🔄 新增：动态计算智能的目标语言
    const smartDefaultSettings = await this.getSmartDefaultSettings();
    
    for (const key of Object.keys(DEFAULT_GLOBAL_SETTINGS) as Array<keyof GlobalSettings>) {
      if (this.settingsMemoryCache[key] === undefined) {
        const defaultValue = smartDefaultSettings[key];
        (this.settingsMemoryCache as any)[key] = defaultValue;
        settings[`${StorageKeys.GLOBAL_SETTINGS_PREFIX}${key}`] = defaultValue;
        needSave = true;
      }
    }
    
    if (needSave) {
      await this.storageManager.setBatch(settings, 'local');
      console.log('[global-settings-manager] ✅已应用智能默认设置并local存储:', settings);
    }
  }

  /**
   * 🔄 新增：获取智能默认设置（根据UI语言计算targetLang）
   */
  private async getSmartDefaultSettings(): Promise<GlobalSettings> {
    // 获取浏览器UI语言
    const uiLang = chrome.i18n.getUILanguage();
    console.log(`[global-settings-manager] 获取到浏览器UI语言: ${uiLang}`);
    
    // 根据UI语言选择合适的目标语言
    const matchedLang = findMatchingTargetLanguage(uiLang);
    const smartTargetLang = matchedLang ? matchedLang.code : 'en';
    
    console.log(`[global-settings-manager] 根据UI语言(${uiLang})选择的智能目标语言: ${smartTargetLang}`);
    
    // 返回智能默认设置
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      targetLang: smartTargetLang
    };
  }

  /**
   * 获取所有设置
   */
  public async getAllSettings(): Promise<GlobalSettings> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 🔄 优化：使用智能默认设置作为基础，而不是原始的DEFAULT_GLOBAL_SETTINGS
    const smartDefaults = await this.getSmartDefaultSettings();
    return { ...smartDefaults, ...this.settingsMemoryCache } as GlobalSettings;
  }

  /**
   * 获取特定设置
   */
  public async getSetting<K extends keyof GlobalSettings>(key: K): Promise<GlobalSettings[K]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.settingsMemoryCache[key] !== undefined) {
      return this.settingsMemoryCache[key] as GlobalSettings[K];
    }
    
    // 🔄 优化：对于targetLang等需要智能计算的设置，使用智能默认值
    const smartDefaults = await this.getSmartDefaultSettings();
    const defaultValue = smartDefaults[key];
    
    const storageKey = `${StorageKeys.GLOBAL_SETTINGS_PREFIX}${key}`;
    const value = await this.storageManager.get(storageKey, defaultValue, 'local');
    
    this.settingsMemoryCache[key] = value;
    
    return value as GlobalSettings[K];
  }

  /**
   * 设置特定设置
   */
  public async setSetting<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.settingsMemoryCache[key] === value) {
      return;
    }
    
    this.settingsMemoryCache[key] = value;
    
    const storageKey = `${StorageKeys.GLOBAL_SETTINGS_PREFIX}${key}`;
    await this.storageManager.set(storageKey, value, 'local');
  }

  /**
   * 批量设置多个设置
   */
  public async setMultipleSettings(settings: Partial<GlobalSettings>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const storageSettings: Record<string, any> = {};
    let hasChanges = false;
    
    for (const key of Object.keys(settings) as Array<keyof GlobalSettings>) {
      const value = settings[key];
      
      if (value === undefined || this.settingsMemoryCache[key] === value) {
        continue;
      }
      
      (this.settingsMemoryCache as any)[key] = value;
      
      const storageKey = `${StorageKeys.GLOBAL_SETTINGS_PREFIX}${key}`;
      storageSettings[storageKey] = value;
      hasChanges = true;
    }
    
    if (hasChanges) {
      await this.storageManager.setBatch(storageSettings, 'local');
    }
  }

  // === 视频特定功能 (取代原VideoSettingsLocalStorage) ===

  /**
   * 获取视频特定数据
   */
  public async getVideoSpecificData(videoId: string): Promise<VideoSpecificData | null> {
    if (!videoId) return null;
    
    const cache = await this.getSetting('videoSpecificCache');
    const videoData = cache[videoId];
    
    if (videoData) {
      console.log(`[global-settings-manager] 找到视频 ${videoId} 的特定数据`);
      return videoData;
    }
    
    console.log(`[global-settings-manager] 未找到视频 ${videoId} 的特定数据`);
    return null;
  }

  /**
   * 保存视频特定数据
   */
  public async saveVideoSpecificData(data: VideoSpecificData): Promise<void> {
    if (!data || !data.videoId) return;
    
    const currentCache = await this.getSetting('videoSpecificCache');
    const existingData = currentCache[data.videoId];
    
    // 检查变更
    let hasRealChanges = false;
    let changeDetails: string[] = [];
    
    if (!existingData) {
      hasRealChanges = true;
      changeDetails.push('首次保存');
    } else {
      if (existingData.sourceLang !== data.sourceLang) {
        hasRealChanges = true;
        changeDetails.push(`源语言: ${existingData.sourceLang} → ${data.sourceLang}`);
      }
      if (existingData.targetLang !== data.targetLang) {
        hasRealChanges = true;
        changeDetails.push(`目标语言: ${existingData.targetLang} → ${data.targetLang}`);
      }
      if (existingData.hasSubtitles !== data.hasSubtitles) {
        hasRealChanges = true;
        changeDetails.push(`字幕状态: ${existingData.hasSubtitles} → ${data.hasSubtitles}`);
      }
      if (existingData.sourceTrackKind !== data.sourceTrackKind) {
        hasRealChanges = true;
        changeDetails.push(`轨道类型: ${existingData.sourceTrackKind} → ${data.sourceTrackKind}`);
      }
      
      const timeDiff = Math.abs(data.lastUsed - existingData.lastUsed);
      if (timeDiff > 60000) { // 1分钟
        changeDetails.push(`上次使用时间: ${new Date(existingData.lastUsed).toLocaleTimeString()} → ${new Date(data.lastUsed).toLocaleTimeString()}`);
      }
    }
    
    const writeReason = hasRealChanges ? '数据变更' : '仅时间戳更新';
    console.log(`[global-settings-manager] 保存视频数据 ${data.videoId} (${writeReason}): ${changeDetails.length > 0 ? changeDetails.join(', ') : '无实质变更'}`);
    
    // 更新缓存
    const updatedCache = {
      ...currentCache,
      [data.videoId]: {
        ...data,
        lastUsed: data.lastUsed || Date.now()
      }
    };
    
    await this.setSetting('videoSpecificCache', updatedCache);
    
    // 更新最近使用的视频列表
    await this.updateRecentVideos(data.videoId);
    
    // 管理缓存大小
    await this.manageCacheSize();
  }

  /**
   * 更新最近使用的视频列表
   */
  private async updateRecentVideos(videoId: string): Promise<void> {
    try {
      const recentVideos = await this.getSetting('recentVideos');
      const maxCached = await this.getSetting('maxCachedVideos');
      
      const newList = [
        videoId,
        ...recentVideos.filter(id => id !== videoId)
      ].slice(0, maxCached);
      
      await this.setSetting('recentVideos', newList);
    } catch (error) {
      console.error('[global-settings-manager] 更新最近使用视频列表失败:', error);
    }
  }

  /**
   * 管理缓存大小
   */
  private async manageCacheSize(): Promise<void> {
    try {
      const cache = await this.getSetting('videoSpecificCache');
      const maxCached = await this.getSetting('maxCachedVideos');
      
      const videoIds = Object.keys(cache);
      
      if (videoIds.length > maxCached) {
        console.log(`[global-settings-manager] 缓存视频数量(${videoIds.length})超出限制(${maxCached})，开始清理`);
        
        // 按最后使用时间排序（从旧到新）
        const sortedEntries = videoIds
          .map(videoId => ({
            videoId,
            lastUsed: cache[videoId].lastUsed || 0
          }))
          .sort((a, b) => a.lastUsed - b.lastUsed);
        
        const removeCount = videoIds.length - maxCached;
        const videosToRemove = sortedEntries.slice(0, removeCount);
        
        // 创建新的缓存对象，移除最老的数据
        const newCache = { ...cache };
        videosToRemove.forEach(({ videoId }) => {
          delete newCache[videoId];
        });
        
        await this.setSetting('videoSpecificCache', newCache);
        
        // 同时更新最近使用列表
        const recentVideos = await this.getSetting('recentVideos');
        const newRecentVideos = recentVideos.filter(videoId => newCache[videoId]);
        await this.setSetting('recentVideos', newRecentVideos);
        
        console.log(`[global-settings-manager] 已清理 ${removeCount} 个最老的视频数据`);
      }
    } catch (error) {
      console.error('[global-settings-manager] 管理缓存大小失败:', error);
    }
  }

  /**
   * 设置当前视频ID
   */
  public async setCurrentVideoId(videoId: string): Promise<void> {
    await this.setSetting('currentVideoId', videoId);
  }

  /**
   * 获取当前视频ID
   */
  public async getCurrentVideoId(): Promise<string> {
    return await this.getSetting('currentVideoId');
  }

  /**
   * 提取YouTube URL中的视频ID
   */
  public static extractVideoId(url: string): string | null {
    if (!url) return null;
    
    try {
      const urlObj = new URL(url);
      
      // 标准视频URL: youtube.com/watch?v=VIDEO_ID
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }
      
      // 短链接: youtu.be/VIDEO_ID
      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.substring(1);
      }
      
      // 嵌入URL: youtube.com/embed/VIDEO_ID
      if (urlObj.pathname.startsWith('/embed/')) {
        return urlObj.pathname.split('/')[2];
      }
      
      return null;
    } catch (error) {
      console.error('[global-settings-manager] 提取视频ID失败:', error);
      return null;
    }
  }

  /**
   * 重置所有设置为默认值
   */
  public async resetAllSettings(): Promise<void> {
    const currentSettings = await this.storageManager.getByPrefix(StorageKeys.GLOBAL_SETTINGS_PREFIX, 'local');
    const keysToRemove = Object.keys(currentSettings);
    
    if (keysToRemove.length > 0) {
      await this.storageManager.remove(keysToRemove, 'local');
    }
    
    this.settingsMemoryCache = { ...DEFAULT_GLOBAL_SETTINGS };
    
    const defaultStorageSettings: Record<string, any> = {};
    for (const key of Object.keys(DEFAULT_GLOBAL_SETTINGS) as Array<keyof GlobalSettings>) {
      const storageKey = `${StorageKeys.GLOBAL_SETTINGS_PREFIX}${key}`;
      defaultStorageSettings[storageKey] = DEFAULT_GLOBAL_SETTINGS[key];
    }
    
    await this.storageManager.setBatch(defaultStorageSettings, 'local');
    console.log('[global-settings-manager] 所有设置已重置为默认值');
  }

  /**
   * 导出所有设置为JSON字符串
   */
  public async exportSettings(): Promise<string> {
    const settings = await this.getAllSettings();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * 从JSON字符串导入设置
   */
  public async importSettings(json: string): Promise<boolean> {
    try {
      const importedSettings = JSON.parse(json);
      
      if (typeof importedSettings !== 'object' || importedSettings === null) {
        throw new Error('无效的设置格式');
      }
      
      const validSettings: Partial<GlobalSettings> = {};
      for (const key of Object.keys(DEFAULT_GLOBAL_SETTINGS) as Array<keyof GlobalSettings>) {
        if (importedSettings[key] !== undefined) {
          validSettings[key] = importedSettings[key];
        }
      }
      
      await this.setMultipleSettings(validSettings);
      console.log('[global-settings-manager] 设置导入成功');
      return true;
    } catch (error) {
      console.error('[global-settings-manager] 设置导入失败:', error);
      return false;
    }
  }
} 