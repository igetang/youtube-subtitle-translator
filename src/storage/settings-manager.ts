/**
 * @file settings-manager.ts
 * @description 用户设置管理模块，专门处理用户设置的存取和变更通知
 */

import { StorageManager, StorageKeys, debounceStorageHandler } from './storage-manager';

/**
 * 字幕显示模式
 */
export enum SubtitleMode {
  BILINGUAL = 'bilingual',  // 双语显示
  TARGET_ONLY = 'targetOnly' // 仅目标语言
}

/**
 * 翻译API类型
 */
export enum TranslationApiType {
  GOOGLE_FREE = 'google-free',
  MICROSOFT_FREE = 'microsoft-free',
  YOUDAO_FREE = 'youdao-free',
  DEEPL = 'deepl',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  CUSTOM = 'custom',
  DUMMY = 'dummy' // 用于测试
}

/**
 * OpenAI配置
 */
export interface OpenAIConfig {
  model: string;
  customModel: string;
  temperature: number;
}

/**
 * 自定义API配置
 */
export interface CustomApiConfig {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body: string;
  responsePath: string;
}

/**
 * 会员凭证
 */
export interface MembershipCredentials {
  loggedIn: boolean;
  provider?: string;
  userId?: string;
  token?: string;
  expires?: number;
}

/**
 * 用户设置
 */
export interface UserSettings {
  // 字幕翻译相关设置
  sourceLang: string;
  targetLang: string;
  subtitleMode: SubtitleMode;
  translateActive: boolean;
  
  // API相关设置
  translationApi: TranslationApiType;
  apiKey: string;
  serviceType: 'apiKey' | 'membership';
  membershipCredentials: MembershipCredentials;
  customApiConfig: CustomApiConfig;
  openaiConfig: OpenAIConfig;
}

/**
 * 设置变更事件类型
 */
export enum SettingChangeEvent {
  SOURCE_LANG_CHANGED = 'sourceLangChanged',
  TARGET_LANG_CHANGED = 'targetLangChanged',
  SUBTITLE_MODE_CHANGED = 'subtitleModeChanged',
  TRANSLATE_ACTIVE_CHANGED = 'translateActiveChanged',
  TRANSLATION_API_CHANGED = 'translationApiChanged',
  API_KEY_CHANGED = 'apiKeyChanged',
  API_SETTINGS_CHANGED = 'apiSettingsChanged'
}

/**
 * 设置变更处理函数类型
 */
export type SettingChangeHandler = (
  newValue: any,
  oldValue: any,
  event: SettingChangeEvent
) => void;

/**
 * 默认用户设置
 */
export const DEFAULT_SETTINGS: UserSettings = {
  sourceLang: 'auto',
  targetLang: 'zh-Hans',
  subtitleMode: SubtitleMode.BILINGUAL,
  translateActive: false,
  
  translationApi: TranslationApiType.GOOGLE_FREE,
  apiKey: '',
  serviceType: 'apiKey',
  membershipCredentials: {
    loggedIn: false
  },
  customApiConfig: {
    url: 'https://api.example.com/translate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"text": "${text}", "source": "${sourceLang}", "target": "${targetLang}"}',
    responsePath: 'translation'
  },
  openaiConfig: {
    model: 'gpt-4o',
    customModel: '',
    temperature: 0.7
  }
};

/**
 * 设置管理器类
 * 专门管理用户设置的存取和变更通知
 */
export class SettingsManager {
  private static instance: SettingsManager;
  private storageManager: StorageManager;
  private changeHandlers: Map<SettingChangeEvent, Set<SettingChangeHandler>>;
  private settingsCache: Partial<UserSettings> = {};
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
  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  /**
   * 设置存储变更监听器
   */
  private setupStorageListener(): void {
    // 使用防抖动监听器，减少高频率变更的处理
    const handleStorageChange = debounceStorageHandler((changes, area) => {
      if (area !== 'sync') return; // 用户设置只存储在 sync 区域
      
      // 处理所有与设置相关的变更
      Object.keys(changes).forEach((key) => {
        if (key.startsWith(StorageKeys.SETTINGS_PREFIX)) {
          const settingKey = key.replace(StorageKeys.SETTINGS_PREFIX, '') as keyof UserSettings;
          const change = changes[key];
          
          // 更新缓存
          if (this.settingsCache) {
            // 使用类型断言
            (this.settingsCache as any)[settingKey] = change.newValue;
          }
          
          // 根据设置键触发对应事件
          this.triggerChangeEvent(settingKey, change.newValue, change.oldValue);
        }
      });
    }, 100);
    
    // 添加监听器
    this.storageManager.addChangeListener(StorageKeys.SETTINGS_PREFIX, handleStorageChange);
  }

  /**
   * 根据设置键触发相应的变更事件
   */
  private triggerChangeEvent(
    settingKey: keyof UserSettings,
    newValue: any,
    oldValue: any
  ): void {
    let event: SettingChangeEvent | null = null;
    
    // 映射设置键到事件类型
    switch (settingKey) {
      case 'sourceLang':
        event = SettingChangeEvent.SOURCE_LANG_CHANGED;
        break;
      case 'targetLang':
        event = SettingChangeEvent.TARGET_LANG_CHANGED;
        break;
      case 'subtitleMode':
        event = SettingChangeEvent.SUBTITLE_MODE_CHANGED;
        break;
      case 'translateActive':
        event = SettingChangeEvent.TRANSLATE_ACTIVE_CHANGED;
        break;
      case 'translationApi':
        event = SettingChangeEvent.TRANSLATION_API_CHANGED;
        break;
      case 'apiKey':
        event = SettingChangeEvent.API_KEY_CHANGED;
        break;
      case 'serviceType':
      case 'membershipCredentials':
      case 'customApiConfig':
      case 'openaiConfig':
        event = SettingChangeEvent.API_SETTINGS_CHANGED;
        break;
    }
    
    // 如果有对应的事件类型，触发所有注册的处理函数
    if (event !== null && this.changeHandlers.has(event)) {
      const handlers = this.changeHandlers.get(event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(newValue, oldValue, event as SettingChangeEvent);
          } catch (error) {
            console.error(`设置变更处理函数执行错误 (事件: ${event}):`, error);
          }
        });
      }
    }
  }

  /**
   * 添加设置变更监听器
   * @param event 设置变更事件类型
   * @param handler 变更处理函数
   */
  public addChangeListener(event: SettingChangeEvent, handler: SettingChangeHandler): void {
    if (!this.changeHandlers.has(event)) {
      this.changeHandlers.set(event, new Set());
    }
    this.changeHandlers.get(event)!.add(handler);
  }

  /**
   * 移除设置变更监听器
   * @param event 设置变更事件类型
   * @param handler 要移除的处理函数，不提供则移除该事件的所有处理函数
   */
  public removeChangeListener(event: SettingChangeEvent, handler?: SettingChangeHandler): void {
    if (!this.changeHandlers.has(event)) return;
    
    if (handler) {
      this.changeHandlers.get(event)!.delete(handler);
      // 如果没有处理函数，则删除整个集合
      if (this.changeHandlers.get(event)!.size === 0) {
        this.changeHandlers.delete(event);
      }
    } else {
      // 移除该事件的所有处理函数
      this.changeHandlers.delete(event);
    }
  }

  /**
   * 初始化设置管理器，加载并缓存所有设置
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // 获取所有设置
      const settings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'sync');
      
      // 转换为内部格式并存入缓存
      this.settingsCache = {};
      Object.keys(settings).forEach((key) => {
        if (key.startsWith(StorageKeys.SETTINGS_PREFIX)) {
          const settingKey = key.replace(StorageKeys.SETTINGS_PREFIX, '') as keyof UserSettings;
          // 使用类型断言
          (this.settingsCache as any)[settingKey] = settings[key];
        }
      });
      
      // 确保所有必要设置都有默认值
      await this.ensureDefaultSettings();
      
      this.initialized = true;
      console.log('设置管理器初始化完成');
    } catch (error) {
      console.error('设置管理器初始化失败:', error);
      // 初始化失败时，使用默认设置
      this.settingsCache = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * 确保所有必要设置都存在，不存在时使用默认值
   */
  private async ensureDefaultSettings(): Promise<void> {
    const settings: Record<string, any> = {};
    let needSave = false;
    
    // 检查所有默认设置键
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof UserSettings>) {
      // 如果缓存中没有该设置，或值为 undefined，使用默认值
      if (this.settingsCache[key] === undefined) {
        (this.settingsCache as any)[key] = DEFAULT_SETTINGS[key];
        settings[`${StorageKeys.SETTINGS_PREFIX}${key}`] = DEFAULT_SETTINGS[key];
        needSave = true;
      }
    }
    
    // 如果有需要保存的默认设置，批量保存
    if (needSave) {
      await this.storageManager.setBatch(settings, 'sync');
      console.log('已应用默认设置:', settings);
    }
  }

  /**
   * 获取所有设置
   * @returns 所有用户设置
   */
  public async getAllSettings(): Promise<UserSettings> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 合并缓存与默认值，确保返回完整的设置对象
    return { ...DEFAULT_SETTINGS, ...this.settingsCache } as UserSettings;
  }

  /**
   * 获取特定设置
   * @param key 设置键
   * @returns 设置值
   */
  public async getSetting<K extends keyof UserSettings>(key: K): Promise<UserSettings[K]> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 如果缓存中有该设置，直接返回
    if (this.settingsCache[key] !== undefined) {
      return this.settingsCache[key] as UserSettings[K];
    }
    
    // 否则从存储中获取
    const storageKey = `${StorageKeys.SETTINGS_PREFIX}${key}`;
    const value = await this.storageManager.get(storageKey, DEFAULT_SETTINGS[key], 'sync');
    
    // 更新缓存
    this.settingsCache[key] = value;
    
    return value as UserSettings[K];
  }

  /**
   * 设置特定设置
   * @param key 设置键
   * @param value 设置值
   */
  public async setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): Promise<void> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 如果值相同，不做任何操作
    if (this.settingsCache[key] === value) {
      return;
    }
    
    // 更新缓存
    this.settingsCache[key] = value;
    
    // 保存到存储
    const storageKey = `${StorageKeys.SETTINGS_PREFIX}${key}`;
    await this.storageManager.set(storageKey, value, 'sync');
  }

  /**
   * 批量设置多个设置
   * @param settings 设置键值对
   */
  public async setMultipleSettings(settings: Partial<UserSettings>): Promise<void> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 准备存储对象
    const storageSettings: Record<string, any> = {};
    let hasChanges = false;
    
    // 处理每个设置
    for (const key of Object.keys(settings) as Array<keyof UserSettings>) {
      const value = settings[key];
      
      // 跳过未定义的值和相同的值
      if (value === undefined || this.settingsCache[key] === value) {
        continue;
      }
      
      // 更新缓存
      (this.settingsCache as any)[key] = value;
      
      // 添加到存储对象
      const storageKey = `${StorageKeys.SETTINGS_PREFIX}${key}`;
      storageSettings[storageKey] = value;
      hasChanges = true;
    }
    
    // 如果有变更，批量保存
    if (hasChanges) {
      await this.storageManager.setBatch(storageSettings, 'sync');
    }
  }

  /**
   * 重置所有设置为默认值
   */
  public async resetAllSettings(): Promise<void> {
    // 获取当前所有设置键
    const currentSettings = await this.storageManager.getByPrefix(StorageKeys.SETTINGS_PREFIX, 'sync');
    const keysToRemove = Object.keys(currentSettings);
    
    // 如果有设置，先清除
    if (keysToRemove.length > 0) {
      await this.storageManager.remove(keysToRemove, 'sync');
    }
    
    // 重置缓存
    this.settingsCache = { ...DEFAULT_SETTINGS };
    
    // 保存默认设置
    const defaultStorageSettings: Record<string, any> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof UserSettings>) {
      const storageKey = `${StorageKeys.SETTINGS_PREFIX}${key}`;
      defaultStorageSettings[storageKey] = DEFAULT_SETTINGS[key];
    }
    
    await this.storageManager.setBatch(defaultStorageSettings, 'sync');
    console.log('所有设置已重置为默认值');
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
   * @param json 设置JSON字符串
   */
  public async importSettings(json: string): Promise<boolean> {
    try {
      const importedSettings = JSON.parse(json);
      
      // 验证导入的数据
      if (typeof importedSettings !== 'object' || importedSettings === null) {
        throw new Error('无效的设置格式');
      }
      
      // 过滤有效的设置键
      const validSettings: Partial<UserSettings> = {};
      for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof UserSettings>) {
        if (importedSettings[key] !== undefined) {
          validSettings[key] = importedSettings[key];
        }
      }
      
      // 应用设置
      await this.setMultipleSettings(validSettings);
      console.log('设置导入成功');
      return true;
    } catch (error) {
      console.error('设置导入失败:', error);
      return false;
    }
  }
} 