/**
 * @file storage-manager.ts
 * @description 存储访问层(Storage Access Layer)，统一管理所有存储操作
 */

/**
 * 存储键命名空间
 * 🔧 架构更新：项目统一使用 chrome.storage.local 存储所有数据
 */
export const StorageKeys = {
  // === 新架构核心存储键（符合architecture.md规范） ===
  // 统一的用户偏好设置存储键
  USER_PREFERENCES: 'user_preferences',
  // 视频源语言缓存
  VIDEO_SOURCE_LANGUAGE_CACHE: 'video_source_language_cache',
  
  // === Session Storage 存储键模板 ===
  // 原字幕数据：session_subtitles_${videoId}
  SESSION_SUBTITLES_PREFIX: 'session_subtitles_',

  // === 新架构存储前缀规范（与architecture.md保持一致） ===
  // 运行时状态前缀：由 RuntimeStateManager 管理，使用专用存储键
  // 用户偏好：由 UserPreferencesManager 管理，使用 USER_PREFERENCES 键
  // 缓存数据前缀：翻译缓存等
  CACHE_PREFIX: 'cache.',
  // 临时数据前缀
  TEMP_PREFIX: 'temp.',
  
  // 🗑️ 已弃用前缀（保留用于迁移兼容性）
  SETTINGS_PREFIX: 'settings.',                    // 已迁移到 UserPreferencesManager
  USER_PREFERENCES_PREFIX: 'user_preferences.',    // 替代 GLOBAL_SETTINGS，已迁移到 UserPreferencesManager  
  RUNTIME_STATE_PREFIX: 'runtime_state.',          // 已迁移到 RuntimeStateManager 专用键

  // 🗑️ 已弃用：旧版设置键（已迁移到新架构）
  // 所有设置现在通过 UserPreferencesManager 统一管理
  // RuntimeState 通过 RuntimeStateManager 管理
  // 此部分保留用于数据迁移兼容性
  
  // 🔄 临时兼容性层：保持旧版设置键可访问，直到完全迁移
  // TODO: 这些将在迁移完成后移除
  SETTINGS: {
    TRANSLATION_API: 'settings.translationApi',
    API_KEY: 'settings.apiKey',
    TARGET_LANG: 'settings.targetLang',
    SOURCE_LANG: 'settings.sourceLang',
    SUBTITLE_MODE: 'settings.subtitleMode',
    FONT_SIZE: 'settings.fontSize',
    FONT_COLOR: 'settings.fontColor',
    BACKGROUND_COLOR: 'settings.backgroundColor',
    TEXT_STROKE_COLOR: 'settings.textStrokeColor',
    TEXT_STROKE_WIDTH: 'settings.textStrokeWidth',
    LINE_WRAPPING_MODE: 'settings.lineWrappingMode',
    MAX_LINES_PER_CAPTION: 'settings.maxLinesPerCaption',
    AUTO_DETECT_SOURCE_LANGUAGE: 'settings.autoDetectSourceLanguage',
    OPENAI_CONFIG_MODEL: 'settings.openaiConfigModel',
    OPENAI_CONFIG_CUSTOM_MODEL: 'settings.openaiConfigCustomModel',
    OPENAI_CONFIG_TEMPERATURE: 'settings.openaiConfigTemperature',
    TRANSLATE_ACTIVE: 'settings.translateActive',
    SERVICE_TYPE: 'settings.serviceType',
    MEMBERSHIP_CREDENTIALS: 'settings.membershipCredentials',
    CUSTOM_API_CONFIG: 'settings.customApiConfig',
    OPENAI_CONFIG: 'settings.openaiConfig'
  },

  // Local storage 相关键（明确区分作用域）
  LOCAL: {
    VIDEO_SETTINGS_PREFIX: 'video_settings.',
    LAST_USED_VIDEOS: 'last_used_videos',
    CACHE_TRANSLATION_PREFIX: 'translation_cache.',
    CACHE_SUBTITLES_PREFIX: 'subtitle_cache.',
    TRANSLATIONS_PREFIX: 'local.translations.',
    API_TEST_RESULTS: 'local.apiTestResults',
    VIDEO_TRACKS_PREFIX: 'local.videoTracks.'
  },

  // 常用临时数据键 (存储在local中)
  TEMP: {
    CURRENT_VIDEO_ID: 'temp.currentVideoId',
    ACTIVE_TAB: 'temp.activeTab',
    SUBTITLE_EVENTS: 'temp.subtitleEvents',
    LAST_KNOWN_VIDEO_ID_FOR_TAB: 'temp.lastKnownVideoIdForTab'
  }
};

/**
 * 存储区域类型
 */
export type StorageArea = 'sync' | 'local' | 'session';

/**
 * 存储配额监控结果
 */
export interface StorageQuotaInfo {
  usedBytes: number;
  totalBytes: number;
  percentUsed: number;
  isNearLimit: boolean;
}

/**
 * 存储变更处理函数类型
 */
export type StorageChangeHandler = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: StorageArea
) => void;

/**
 * 存储管理器类
 * 提供对 Chrome 存储的统一访问接口
 */
export class StorageManager {
  private static instance: StorageManager;
  private changeHandlers: Map<string, Set<StorageChangeHandler>>;
  private listeners: Map<StorageArea, (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void>;

  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.changeHandlers = new Map();
    this.listeners = new Map();

    // 初始化监听器
    this.setupStorageListeners();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * 设置存储变更监听器
   */
  private setupStorageListeners(): void {
    // 🔧 优化：项目主要使用local存储，但保留sync监听器用于向后兼容，添加session支持
    const areas: StorageArea[] = ['local', 'sync', 'session']; // 添加session支持
    
    areas.forEach(area => {
      const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
        this.notifyChangeHandlers(changes, areaName as StorageArea);
      };
      
      chrome.storage.onChanged.addListener(listener);
      this.listeners.set(area, listener);
    });
  }

  /**
   * 通知所有相关的变更处理程序
   */
  private notifyChangeHandlers(
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: StorageArea
  ): void {
    // 添加字幕相关键的判断
    const isSubtitleRelatedChange = Object.keys(changes).some(key => 
      key.includes('subtitle') || 
      key.includes('captionTracks') || 
      key.includes('translations')
    );

    // 对所有注册的键执行相应的处理函数
    this.changeHandlers.forEach((handlers, key) => {
      // 只处理以下情况：
      // 1. 通配符 '*' 监听器 (但需要注意字幕相关事件可能触发重操作)
      // 2. 明确匹配的键
      // 3. 前缀匹配的键
      const shouldNotify = 
        (key === '*' && (!isSubtitleRelatedChange || key.includes('subtitle') || key.includes('translations'))) || // 通配符情况特殊处理
        Object.keys(changes).some(changedKey => 
          changedKey === key || changedKey.startsWith(`${key}.`)
        );
      
      if (shouldNotify) {
        handlers.forEach(handler => {
          try {
            // 对于字幕获取等重操作，只在字幕相关数据变化时触发
            const isHeavyOperation = 
              key.includes('subtitle') || 
              key.includes('captionTracks') || 
              key.includes('translations');
              
            if (!isHeavyOperation || isSubtitleRelatedChange) {
              handler(changes, areaName);
            } else {
              console.log(`[storage-manager] 跳过非字幕数据变化触发的重操作: ${key}`);
            }
          } catch (error) {
            console.error(`[storage-manager] 存储变更处理函数执行错误 (键: ${key}):`, error);
          }
        });
      }
    });
  }

  /**
   * 添加存储变更监听器
   */
  public addChangeListener(key: string, handler: StorageChangeHandler): void {
    if (!this.changeHandlers.has(key)) {
      this.changeHandlers.set(key, new Set());
    }
    this.changeHandlers.get(key)!.add(handler);
  }

  /**
   * 移除存储变更监听器
   */
  public removeChangeListener(key: string, handler?: StorageChangeHandler): void {
    if (!this.changeHandlers.has(key)) return;
    
    if (handler) {
      this.changeHandlers.get(key)!.delete(handler);
      if (this.changeHandlers.get(key)!.size === 0) {
        this.changeHandlers.delete(key);
      }
    } else {
      this.changeHandlers.delete(key);
    }
  }

  /**
   * 清除所有变更监听器
   */
  public clearAllChangeListeners(): void {
    this.changeHandlers.clear();
  }

  /**
   * 获取指定存储区域的存储对象
   */
  private getStorageArea(area: StorageArea): chrome.storage.StorageArea {
    switch (area) {
      case 'sync':
        return chrome.storage.sync;
      case 'local':
        return chrome.storage.local;
      case 'session':
        return chrome.storage.session;
      default:
        console.warn(`[storage-manager] 不支持的存储区域: ${area}，降级到local存储`);
        return chrome.storage.local;
    }
  }

  /**
   * 从存储中获取值
   * @param key 键名
   * @param defaultValue 默认值
   * @param area 存储区域
   * @returns 存储的值或默认值
   */
  public async get<T>(key: string, defaultValue: T, area: StorageArea = 'local'): Promise<T> {
    const storage = this.getStorageArea(area);
    try {
      const result = await storage.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
              console.error(`[storage-manager] 获取存储键 ${key} 失败:`, error);
      return defaultValue;
    }
  }

  /**
   * 批量获取存储值
   * @param keys 键名数组或单个键名
   * @param area 存储区域
   * @returns 包含所有请求键的对象
   */
  public async getBatch(keys: string | string[] | null, area: StorageArea = 'local'): Promise<Record<string, any>> {
    const storage = this.getStorageArea(area);
    try {
      const result = await storage.get(keys);
      // 合并前后确认日志
      console.log(`[storage-manager] ✅ getBatch ${area}:`, { keys, result });
      return result;
    } catch (error) {
      console.error(`[storage-manager] ❌ 从 ${area} 区域批量获取存储键失败:`, error);
      return {};
    }
  }

  /**
   * 获取所有符合特定前缀的键值对
   * @param prefix 键名前缀
   * @param area 存储区域
   * @returns 所有匹配的键值对
   */
  public async getByPrefix(prefix: string, area: StorageArea = 'local'): Promise<Record<string, any>> {
    const allItems = await this.getBatch(null, area);
    const result: Record<string, any> = {};
    
    Object.keys(allItems)
      .filter(key => key.startsWith(prefix))
      .forEach(key => {
        result[key] = allItems[key];
      });
      
    return result;
  }

  /**
   * 设置存储值
   * @param key 键名
   * @param value 要存储的值
   * @param area 存储区域
   */
  public async set<T>(key: string, value: T, area: StorageArea = 'local'): Promise<void> {
    // 🔧 修正：项目架构统一使用chrome.storage.local，移除sync相关建议
    // 保留area参数向后兼容，但统一使用local区域
    if (area === 'sync') {
      console.warn(`[storage-manager] 键 ${key} 请求sync存储，但项目架构统一使用local存储，自动转换为local`);
      area = 'local';
    }

    const storage = this.getStorageArea(area);
    try {
      await storage.set({ [key]: value });
      // 合并前后确认为一行
      console.log(`[storage-manager] ✅ ${key} → ${area}:`, value);
    } catch (error) {
      console.error(`[storage-manager] ❌ 设置存储键 ${key} 到 ${area} 区域失败:`, error);
      
      // 简化错误处理，不再进行降级
      // 但保留对特定错误的日志记录，方便调试
      if (error instanceof Error) {
        if (error.message.includes('Access to storage is not allowed') || 
            error.message.includes('Permission denied')) {
          console.error(`[storage-manager] 没有访问 ${area} 存储的权限，请检查上下文和权限设置`);
        } else if (error.message.includes('QUOTA_BYTES')) {
          console.error(`[storage-manager] ${area} 存储配额已满，请考虑清理不必要的数据`);
        }
      }
      
      throw error;
    }
  }

  /**
   * 批量设置存储值
   * @param items 要存储的键值对
   * @param area 存储区域
   */
  public async setBatch(items: Record<string, any>, area: StorageArea = 'local'): Promise<void> {
    const storage = this.getStorageArea(area);
    try {
      await storage.set(items);
    } catch (error) {
      console.error(`[storage-manager] 批量设置存储失败:`, error);
      throw error;
    }
  }

  /**
   * 移除存储键
   * @param keys 要移除的键名或键名数组
   * @param area 存储区域
   */
  public async remove(keys: string | string[], area: StorageArea = 'local'): Promise<void> {
    try {
      const storageArea = this.getStorageArea(area);
      await storageArea.remove(keys);
    } catch (error) {
      console.error(`[storage-manager] 移除键 "${keys}" 时出错:`, error);
      throw error;
    }
  }

  /**
   * 查找所有以指定前缀开头的键
   * @param prefix 前缀
   * @param area 存储区域
   * @returns 匹配的键名数组
   */
  public async findKeysByPrefix(prefix: string, area: StorageArea = 'local'): Promise<string[]> {
    try {
      const storageArea = this.getStorageArea(area);
      const allItems = await storageArea.get(null);
      return Object.keys(allItems).filter(key => key.startsWith(prefix));
    } catch (error) {
      console.error(`[storage-manager] 查找前缀为 "${prefix}" 的键时出错:`, error);
      return [];
    }
  }

  /**
   * 清除指定区域的所有存储
   * @param area 存储区域
   */
  public async clear(area: StorageArea = 'local'): Promise<void> {
    const storage = this.getStorageArea(area);
    try {
      await storage.clear();
    } catch (error) {
      console.error(`[storage-manager] 清除存储区域 ${area} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取特定存储区域的使用情况
   * @param area 存储区域
   * @returns 存储配额信息
   */
  public async getQuotaInfo(area: StorageArea = 'local'): Promise<StorageQuotaInfo> {
    const storage = this.getStorageArea(area);
    try {
      const bytesInUse = await storage.getBytesInUse();
      const totalBytes = this.getStorageQuota(area);
      const percentUsed = (bytesInUse / totalBytes) * 100;
      
      return {
        usedBytes: bytesInUse,
        totalBytes,
        percentUsed,
        isNearLimit: percentUsed > 80 // 使用超过80%视为接近限制
      };
    } catch (error) {
      console.error(`[storage-manager] 获取存储配额信息失败:`, error);
      return {
        usedBytes: 0,
        totalBytes: this.getStorageQuota(area),
        percentUsed: 0,
        isNearLimit: false
      };
    }
  }

  /**
   * 获取存储区域的总配额
   * @param area 存储区域
   * @returns 配额字节数
   */
  private getStorageQuota(area: StorageArea): number {
    switch (area) {
      case 'sync':
        return chrome.storage.sync.QUOTA_BYTES || 102400; // 100KB
      case 'local':
        return chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB
      case 'session':
        return chrome.storage.session?.QUOTA_BYTES || 1048576; // 1MB (估算值)
      default:
        return 1048576; // 1MB默认值
    }
  }

  /**
   * 监控所有存储区域使用情况
   * @returns 所有存储区域的使用情况
   */
  public async monitorAllStorageUsage(): Promise<Record<StorageArea, StorageQuotaInfo>> {
    // 🔧 优化：主要监控local区域，sync作为辅助监控
    const areas: StorageArea[] = ['local', 'sync']; // local优先
    const result: Partial<Record<StorageArea, StorageQuotaInfo>> = {};
    
    for (const area of areas) {
      result[area] = await this.getQuotaInfo(area);
      
      // 如果接近限制，打印警告（重点关注local区域）
      if (result[area]!.isNearLimit) {
        const priority = area === 'local' ? 'CRITICAL' : 'INFO';
        console.warn(`[storage-manager] [${priority}] 存储区域 ${area} 使用量接近限制: ${(result[area]!.usedBytes / 1024).toFixed(2)}KB / ${(result[area]!.totalBytes / 1024).toFixed(2)}KB (${result[area]!.percentUsed.toFixed(1)}%)`);
      }
    }
    
    return result as Record<StorageArea, StorageQuotaInfo>;
  }
} 