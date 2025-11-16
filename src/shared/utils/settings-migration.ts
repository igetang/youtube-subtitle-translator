/**
 * YouTube字幕翻译助手 - 设置迁移工具
 * @fileoverview UserSettings → UserPreferences 迁移转换函数
 * @version 5.24.6
 * @author AI Assistant
 */

import { 
  UserPreferences, 
  TranslationServiceComplete, 
  TranslationServiceType,
  SubtitleMode,
  TRANSLATION_SERVICE_TEMPLATES,
  calculateUserPreferencesHash
} from '../types/user-preferences-types';

// ================================
// 旧版设置类型定义 (为了迁移)
// ================================

export enum LegacyTranslationApiType {
  GOOGLE_FREE = 'google_free',
  MICROSOFT_FREE = 'microsoft_free',
  YOUDAO_FREE = 'youdao_free',
  DEEPL = 'deepl',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  CUSTOM = 'custom',
  DUMMY = 'dummy'
}

export interface LegacyOpenAIConfig {
  model: string;
  customModel?: string;
  temperature: number;
}

export interface LegacyCustomApiConfig {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  bodyTemplate: string;
  responsePath: string;
}

export interface LegacyMembershipCredentials {
  loggedIn: boolean;
  token?: string;
}

export interface LegacyUserSettings {
  sourceLang: string;
  targetLang: string;
  subtitleMode: SubtitleMode;
  translationApi: LegacyTranslationApiType;
  apiKey: string;
  serviceType: 'apiKey' | 'membership';
  membershipCredentials: LegacyMembershipCredentials;
  customApiConfig: LegacyCustomApiConfig;
  openaiConfig: LegacyOpenAIConfig;
}

export const LEGACY_DEFAULT_SETTINGS: LegacyUserSettings = {
  sourceLang: 'auto',
  targetLang: typeof navigator !== 'undefined' ? navigator.language : 'zh-CN',
  subtitleMode: SubtitleMode.BILINGUAL,
  translationApi: LegacyTranslationApiType.GOOGLE_FREE,
  apiKey: '',
  serviceType: 'apiKey',
  membershipCredentials: {
    loggedIn: false
  },
  customApiConfig: {
    url: '',
    method: 'POST',
    headers: {},
    bodyTemplate: `{"text": "{text}", "source_lang": "{source_lang}", "target_lang": "{target_lang}"}`,
    responsePath: 'data.translated_text'
  },
  openaiConfig: {
    model: 'gpt-4o',
    temperature: 0.7
  }
};


// ================================
// 🔄 类型转换映射表
// ================================

/**
 * TranslationApiType → TranslationServiceType 映射表
 */
const API_TYPE_TO_SERVICE_TYPE: Record<LegacyTranslationApiType, TranslationServiceType> = {
  [LegacyTranslationApiType.GOOGLE_FREE]: TranslationServiceType.GOOGLE_FREE,
  [LegacyTranslationApiType.MICROSOFT_FREE]: TranslationServiceType.MICROSOFT_FREE,
  [LegacyTranslationApiType.YOUDAO_FREE]: TranslationServiceType.DUMMY, // 有道免费暂时映射到DUMMY
  [LegacyTranslationApiType.DEEPL]: TranslationServiceType.DEEPL,
  [LegacyTranslationApiType.OPENAI]: TranslationServiceType.OPENAI,
  [LegacyTranslationApiType.GEMINI]: TranslationServiceType.GEMINI,
  [LegacyTranslationApiType.DEEPSEEK]: TranslationServiceType.DEEPSEEK,
  [LegacyTranslationApiType.QWEN]: TranslationServiceType.QWEN,
  [LegacyTranslationApiType.CUSTOM]: TranslationServiceType.DUMMY, // 自定义API暂时映射到DUMMY
  [LegacyTranslationApiType.DUMMY]: TranslationServiceType.DUMMY
};

/**
 * TranslationServiceType → TranslationApiType 映射表（反向）
 */
const SERVICE_TYPE_TO_API_TYPE: Record<TranslationServiceType, LegacyTranslationApiType> = {
  [TranslationServiceType.GOOGLE_FREE]: LegacyTranslationApiType.GOOGLE_FREE,
  [TranslationServiceType.MICROSOFT_FREE]: LegacyTranslationApiType.MICROSOFT_FREE,
  [TranslationServiceType.OPENAI]: LegacyTranslationApiType.OPENAI,
  [TranslationServiceType.GEMINI]: LegacyTranslationApiType.GEMINI,
  [TranslationServiceType.DEEPSEEK]: LegacyTranslationApiType.DEEPSEEK,
  [TranslationServiceType.DEEPL]: LegacyTranslationApiType.DEEPL,
  [TranslationServiceType.QWEN]: LegacyTranslationApiType.QWEN,
  [TranslationServiceType.DUMMY]: LegacyTranslationApiType.DUMMY
};

// ================================
// 🔄 主要转换函数
// ================================

/**
 * UserSettings → UserPreferences 转换函数
 * @param userSettings 旧的UserSettings接口数据
 * @returns 转换后的UserPreferences数据
 */
export function convertUserSettingsToUserPreferences(userSettings: LegacyUserSettings): UserPreferences {
  console.log('[settings-migration] 开始转换 UserSettings → UserPreferences');
  
  try {
    // 1. 获取对应的服务类型
    const serviceType = API_TYPE_TO_SERVICE_TYPE[userSettings.translationApi];
    if (!serviceType) {
      console.debug(`[debug][settings-migration] 未知的翻译API类型: ${userSettings.translationApi}`);
      throw new Error(`未知的翻译API类型: ${userSettings.translationApi}`);
    }

    // 2. 获取基础服务模板
    const baseService = TRANSLATION_SERVICE_TEMPLATES[serviceType];
    if (!baseService) {
      console.debug(`[debug][settings-migration] 未找到服务模板: ${serviceType}`);
      throw new Error(`未找到服务模板: ${serviceType}`);
    }

    // 3. 构建完整的翻译服务配置
    const translationService: TranslationServiceComplete = {
      ...baseService,
      // 添加API密钥（如果存在）
      apiKey: userSettings.apiKey || undefined,
      
      // 根据服务类型整合特定配置
      ...(serviceType === TranslationServiceType.OPENAI && {
        model: userSettings.openaiConfig.model || 'gpt-4o',
        temperature: userSettings.openaiConfig.temperature || 0.7,
        // 如果有自定义模型，使用自定义模型
        ...(userSettings.openaiConfig.customModel && {
          model: userSettings.openaiConfig.customModel
        })
      }),
      
      // 其他AI服务的特定配置可以在这里添加
      ...(serviceType === TranslationServiceType.GEMINI && {
        model: baseService.model || 'gemini-pro',
        temperature: 0.7
      }),
      
      ...(serviceType === TranslationServiceType.DEEPSEEK && {
        model: baseService.model || 'deepseek-chat',
        temperature: 0.7
      }),
      
      ...(serviceType === TranslationServiceType.QWEN && {
        model: baseService.model || 'qwen-turbo',
        temperature: 0.7
      })
    };

    // 4. 构建UserPreferences对象（先不包含hash）
    const preferences: Omit<UserPreferences, 'hash'> = {
      targetLang: userSettings.targetLang || 'zh-CN',
      subtitleMode: userSettings.subtitleMode || SubtitleMode.BILINGUAL,
      translationService
    };

    // 5. 计算并添加hash
    const finalPreferences: UserPreferences = {
      ...preferences,
      hash: calculateUserPreferencesHash(preferences)
    };

    console.log('[settings-migration] ✅ UserSettings → UserPreferences 转换成功');
    console.log('[settings-migration] 转换详情:', {
      originalApi: userSettings.translationApi,
      newServiceType: serviceType,
      targetLang: finalPreferences.targetLang,
      subtitleMode: finalPreferences.subtitleMode,
      hasApiKey: !!finalPreferences.translationService.apiKey
    });

    return finalPreferences;

  } catch (error) {
    console.error('[settings-migration] ❌ UserSettings → UserPreferences 转换失败:', error);
    
    // 返回安全的默认值
    console.log('[settings-migration] 使用默认UserPreferences配置');
    const defaultPrefs: Omit<UserPreferences, 'hash'> = {
      targetLang: userSettings.targetLang || 'zh-CN',
      subtitleMode: userSettings.subtitleMode || SubtitleMode.BILINGUAL,
      translationService: {
        ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.GOOGLE_FREE],
        apiKey: undefined
      }
    };
    
    return {
      ...defaultPrefs,
      hash: calculateUserPreferencesHash(defaultPrefs)
    };
  }
}

/**
 * UserPreferences → UserSettings 兼容性转换函数
 * @param userPreferences 新的UserPreferences接口数据
 * @returns 转换后的UserSettings数据（用于向后兼容）
 */
export function convertUserPreferencesToUserSettings(userPreferences: UserPreferences): LegacyUserSettings {
  console.log('[settings-migration] 开始转换 UserPreferences → UserSettings (兼容性)');
  
  try {
    const service = userPreferences.translationService;
    
    // 1. 反向映射服务类型
    const apiType = SERVICE_TYPE_TO_API_TYPE[service.type];
    if (!apiType) {
      console.debug(`[debug][settings-migration] 未知的服务类型: ${service.type}`);
      throw new Error(`未知的服务类型: ${service.type}`);
    }

    // 2. 构建UserSettings对象
    const userSettings: LegacyUserSettings = {
      // sourceLang字段在UserPreferences中已移除，使用默认值
      sourceLang: 'auto',
      
      // 直接映射的字段
      targetLang: userPreferences.targetLang,
      subtitleMode: userPreferences.subtitleMode,
      
      // API相关字段
      translationApi: apiType,
      apiKey: service.apiKey || '',
      
      // 简化的服务类型（兼容性考虑）
      serviceType: 'apiKey',
      
      // 默认的会员凭证（UserPreferences中不包含此信息）
      membershipCredentials: {
        loggedIn: false
      },
      
      // 使用默认的自定义API配置
      customApiConfig: LEGACY_DEFAULT_SETTINGS.customApiConfig,
      
      // 构建OpenAI配置
      openaiConfig: {
        model: service.model || 'gpt-4o',
        customModel: '', // UserPreferences中没有单独的customModel字段
        temperature: service.temperature || 0.7
      }
    };

    console.log('[settings-migration] ✅ UserPreferences → UserSettings 转换成功');
    console.log('[settings-migration] 转换详情:', {
      originalServiceType: service.type,
      newApiType: apiType,
      targetLang: userSettings.targetLang,
      subtitleMode: userSettings.subtitleMode,
      hasApiKey: !!userSettings.apiKey
    });

    return userSettings;

  } catch (error) {
    console.error('[settings-migration] ❌ UserPreferences → UserSettings 转换失败:', error);
    
    // 返回安全的默认值
    console.log('[settings-migration] 使用默认UserSettings配置');
    return {
      ...LEGACY_DEFAULT_SETTINGS,
      targetLang: userPreferences.targetLang,
      subtitleMode: userPreferences.subtitleMode
    };
  }
}

// ================================
// 🔍 验证和诊断工具
// ================================

/**
 * 验证UserSettings数据的完整性
 * @param userSettings 需要验证的UserSettings数据
 * @returns 验证结果和错误信息
 */
export function validateUserSettings(userSettings: Partial<LegacyUserSettings>): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查必需字段
  if (!userSettings.targetLang) {
    errors.push('缺少目标语言设置 (targetLang)');
  }

  if (!userSettings.subtitleMode) {
    errors.push('缺少字幕模式设置 (subtitleMode)');
  }

  if (!userSettings.translationApi) {
    errors.push('缺少翻译API设置 (translationApi)');
  }

  // 检查枚举值的有效性
  if (userSettings.translationApi && !Object.values(LegacyTranslationApiType).includes(userSettings.translationApi)) {
    errors.push(`无效的翻译API类型: ${userSettings.translationApi}`);
  }

  if (userSettings.subtitleMode && !Object.values(SubtitleMode).includes(userSettings.subtitleMode)) {
    errors.push(`无效的字幕模式: ${userSettings.subtitleMode}`);
  }

  // 检查API密钥（仅警告）
  if (userSettings.translationApi === LegacyTranslationApiType.OPENAI && !userSettings.apiKey) {
    warnings.push('OpenAI服务需要API密钥，但未提供');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 验证UserPreferences数据的完整性
 * @param userPreferences 需要验证的UserPreferences数据
 * @returns 验证结果和错误信息
 */
export function validateUserPreferences(userPreferences: Partial<UserPreferences>): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查必需字段
  if (!userPreferences.targetLang) {
    errors.push('缺少目标语言设置 (targetLang)');
  }

  if (!userPreferences.subtitleMode) {
    errors.push('缺少字幕模式设置 (subtitleMode)');
  }

  if (!userPreferences.translationService) {
    errors.push('缺少翻译服务配置 (translationService)');
  } else {
    const service = userPreferences.translationService;
    
    if (!service.type) {
      errors.push('翻译服务缺少类型设置 (translationService.type)');
    }

    if (!service.name) {
      errors.push('翻译服务缺少名称设置 (translationService.name)');
    }

    // 检查需要API密钥的服务
    if ([TranslationServiceType.OPENAI, TranslationServiceType.GEMINI, TranslationServiceType.DEEPSEEK, TranslationServiceType.QWEN].includes(service.type) && !service.apiKey) {
      warnings.push(`${service.name || service.type} 服务需要API密钥，但未提供`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ================================
// 🚨 迁移状态检查
// ================================

/**
 * 检查系统中是否存在旧的UserSettings数据
 * @returns Promise<boolean> 是否存在需要迁移的数据
 */
export async function checkMigrationNeeded(): Promise<boolean> {
  try {
    // 检查chrome.storage.local中是否存在旧的设置键
    const result = await chrome.storage.local.get([
      'settings_sourceLang',
      'settings_targetLang', 
      'settings_translationApi',
      'settings_apiKey'
    ]);

    const hasOldSettings = Object.keys(result).some(key => result[key] !== undefined);
    
    // 只有在发现旧设置时才记录
    if (hasOldSettings) {
      console.log('[settings-migration] 发现旧设置需要迁移:', {
        foundKeys: Object.keys(result).filter(key => result[key] !== undefined)
      });
    }

    return hasOldSettings;

  } catch (error) {
    console.error('[settings-migration] 迁移检查失败:', error);
    return false;
  }
}

/**
 * 生成迁移报告
 * @param userSettings 原始UserSettings数据
 * @param userPreferences 转换后的UserPreferences数据
 * @returns 迁移报告
 */
export function generateMigrationReport(
  userSettings: LegacyUserSettings,
  userPreferences: UserPreferences
): {
  summary: string;
  details: {
    preserved: string[];
    transformed: string[];
    dropped: string[];
  };
} {
  const preserved: string[] = [];
  const transformed: string[] = [];
  const dropped: string[] = [];

  // 分析保留的字段
  if (userSettings.targetLang === userPreferences.targetLang) {
    preserved.push('targetLang');
  }

  if (userSettings.subtitleMode === userPreferences.subtitleMode) {
    preserved.push('subtitleMode');
  }

  // 分析转换的字段
  transformed.push(`translationApi (${userSettings.translationApi} → ${userPreferences.translationService.type})`);
  
  if (userSettings.apiKey && userPreferences.translationService.apiKey) {
    transformed.push('apiKey (集成到translationService)');
  }

  if (userSettings.openaiConfig) {
    transformed.push('openaiConfig (集成到translationService)');
  }

  // 分析丢弃的字段
  dropped.push('sourceLang (改由VideoSourceLanguageCache管理)');
  dropped.push('serviceType (逻辑集成到translationService)');
  dropped.push('membershipCredentials (暂时移除)');
  dropped.push('customApiConfig (暂时移除)');

  return {
    summary: `迁移完成：保留${preserved.length}个字段，转换${transformed.length}个字段，丢弃${dropped.length}个字段`,
    details: {
      preserved,
      transformed,
      dropped
    }
  };
} 