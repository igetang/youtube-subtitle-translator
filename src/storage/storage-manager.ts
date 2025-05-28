/**
 * @file storage-manager.ts
 * @description 存储访问层(Storage Access Layer)，统一管理所有存储操作
 */

/**
 * 存储键前缀常量
 */
export const StorageKeys = {
  // 用户设置前缀 (chrome.storage.sync)
  SETTINGS_PREFIX: 'settings.',
  // 本地存储数据前缀 (chrome.storage.local)
  LOCAL_PREFIX: 'local.',
  // 临时数据前缀 (存储在local中)
  TEMP_PREFIX: 'temp.',

  // 常用设置键
  SETTINGS: {
    SOURCE_LANG: 'settings.sourceLang',
    TARGET_LANG: 'settings.targetLang',
    SUBTITLE_MODE: 'settings.subtitleMode',
    TRANSLATION_API: 'settings.translationApi',
    TRANSLATE_ACTIVE: 'settings.translateActive',
    API_KEY: 'settings.apiKey',
    SERVICE_TYPE: 'settings.serviceType',
    MEMBERSHIP_CREDENTIALS: 'settings.membershipCredentials',
    CUSTOM_API_CONFIG: 'settings.customApiConfig',
    OPENAI_CONFIG: 'settings.openaiConfig',
    FONT_SIZE: 'settings.fontSize',
    FONT_COLOR: 'settings.fontColor',
    BACKGROUND_COLOR: 'settings.backgroundColor',
    TEXT_STROKE_COLOR: 'settings.textStrokeColor',
    TEXT_STROKE_WIDTH: 'settings.textStrokeWidth',
    LINE_WRAPPING_MODE: 'settings.lineWrappingMode',
    MAX_LINES_PER_CAPTION: 'settings.maxLinesPerCaption',
    AUTO_DETECT_SOURCE_LANGUAGE: 'settings.autoDetectSourceLanguage',
    OPENAI_CONFIG_MODEL: 'settings.openaiConfig.model',
    OPENAI_CONFIG_CUSTOM_MODEL: 'settings.openaiConfig.customModel',
    OPENAI_CONFIG_TEMPERATURE: 'settings.openaiConfig.temperature'
  },

  // 常用本地存储键
  LOCAL: {
    TRANSLATIONS_PREFIX: 'local.translations.',
    API_TEST_RESULTS: 'local.apiTestResults',
    LAST_USED_VIDEOS: 'local.lastUsedVideos',
    VIDEO_SETTINGS_PREFIX: 'local.videoSettings.',
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
export type StorageArea = 'sync' | 'local';

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
    // 创建所有存储区域的变更监听器
    const areas: StorageArea[] = ['sync', 'local'];
    
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
   * @param key 要监听的键名或前缀，使用 '*' 表示监听所有变更
   * @param handler 变更处理函数
   */
  public addChangeListener(key: string, handler: StorageChangeHandler): void {
    if (!this.changeHandlers.has(key)) {
      this.changeHandlers.set(key, new Set());
    }
    this.changeHandlers.get(key)!.add(handler);
  }

  /**
   * 移除存储变更监听器
   * @param key 要移除监听的键名或前缀
   * @param handler 要移除的处理函数，不提供则移除该键的所有处理函数
   */
  public removeChangeListener(key: string, handler?: StorageChangeHandler): void {
    if (!this.changeHandlers.has(key)) return;
    
    if (handler) {
      this.changeHandlers.get(key)!.delete(handler);
      // 如果没有处理函数，则删除整个集合
      if (this.changeHandlers.get(key)!.size === 0) {
        this.changeHandlers.delete(key);
      }
    } else {
      // 移除该键的所有处理函数
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
      case 'sync': return chrome.storage.sync;
      case 'local': return chrome.storage.local;
      default: return chrome.storage.local;
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
      return await storage.get(keys);
    } catch (error) {
              console.error(`[storage-manager] 批量获取存储键失败:`, error);
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
    // 根据键前缀确定最合适的存储区域，简化调用方的决策
    if (key.startsWith('settings.') && area !== 'sync') {
      console.log(`[storage-manager] 键 ${key} 以 'settings.' 开头，建议使用 sync 存储，但尊重调用方设置: ${area}`);
    }

    const storage = this.getStorageArea(area);
    try {
      await storage.set({ [key]: value });
    } catch (error) {
      console.error(`[storage-manager] 设置存储键 ${key} 失败:`, error);
      
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
    const storage = this.getStorageArea(area);
    try {
      await storage.remove(keys);
    } catch (error) {
      console.error(`[storage-manager] 移除存储键失败:`, error);
      throw error;
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
      case 'sync': return chrome.storage.sync.QUOTA_BYTES || 102400; // 100KB
      case 'local': return chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB
      default: return 5242880; // 默认5MB
    }
  }

  /**
   * 监控所有存储区域使用情况
   * @returns 所有存储区域的使用情况
   */
  public async monitorAllStorageUsage(): Promise<Record<StorageArea, StorageQuotaInfo>> {
    // 监控sync和local区域
    const areas: StorageArea[] = ['sync', 'local'];
    const result: Partial<Record<StorageArea, StorageQuotaInfo>> = {};
    
    for (const area of areas) {
      result[area] = await this.getQuotaInfo(area);
      
      // 如果接近限制，打印警告
      if (result[area]!.isNearLimit) {
        console.warn(`[storage-manager] 存储区域 ${area} 使用量接近限制: ${(result[area]!.usedBytes / 1024).toFixed(2)}KB / ${(result[area]!.totalBytes / 1024).toFixed(2)}KB (${result[area]!.percentUsed.toFixed(1)}%)`);
      }
    }
    
    return result as Record<StorageArea, StorageQuotaInfo>;
  }
}

/**
 * 创建一个带有防抖功能的存储变更处理函数
 * @param handler 原始处理函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖处理函数
 */
export function debounceStorageHandler(
  handler: StorageChangeHandler,
  wait: number = 200
): StorageChangeHandler {
  let timeout: number | null = null;
  let lastChanges: { [key: string]: chrome.storage.StorageChange } | null = null;
  let lastAreaName: StorageArea | null = null;

  const debouncedFunction: StorageChangeHandler = function(
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: StorageArea
  ) {
    lastChanges = changes;
    lastAreaName = areaName;
    
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
    
    timeout = window.setTimeout(() => {
      if (lastChanges !== null && lastAreaName !== null) {
        handler(lastChanges, lastAreaName);
      }
      timeout = null;
      lastChanges = null;
      lastAreaName = null;
    }, wait);
  };

  return debouncedFunction;
} 