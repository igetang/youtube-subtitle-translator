/**
 * @file user-preferences-types.ts
 * @description 新架构下的用户偏好设置类型定义
 * 基于 architecture.md 7.1.1 UserPreferences 设计规范
 */

import type { SimplifiedCaptionTrack, TrackMetadata } from './subtitle-types';

/**
 * 字幕显示模式
 */
export enum SubtitleMode {
  BILINGUAL = 'bilingual',    // 双语显示：原文+译文
  TARGET_ONLY = 'targetOnly'  // 仅目标语言显示
}

/**
 * 翻译服务类型枚举
 */
export enum TranslationServiceType {
  GOOGLE_FREE = 'google-free',     // 免费Google翻译，不需要API key
  MICROSOFT_FREE = 'microsoft-free', // 免费微软翻译，不需要API key
  OPENAI = 'openai',               // OpenAI，需要API key + model + temperature
  GEMINI = 'gemini',               // Google Gemini，需要API key + model
  DEEPSEEK = 'deepseek',           // DeepSeek，需要API key + model
  DEEPL = 'deepl',                 // DeepL，需要API key + tier
  QWEN = 'qwen',                   // 通义千问，需要API key + model
  DUMMY = 'dummy'                  // 用于测试
}

/**
 * 完整的翻译服务配置结构 - 符合 architecture.md 标准
 */
export interface TranslationServiceComplete {
  // === 基础信息 ===
  type: TranslationServiceType;                 // 服务类型
  name: string;                                 // 显示名称
  
  // === 模型配置 ===
  model: string | null;                         // 模型名称
  availableModels?: string[];                   // 可用模型列表
  
  // === 认证信息 ===
  apiKey?: string;                              // API密钥（敏感信息）
  
  // === 调节参数 ===
  temperature?: number | null;                  // 温度参数
  maxTokens?: number | null;                    // 最大令牌数
  topP?: number;                                // Top-P参数
  
  // === 限流参数 ===
  rpm?: number | null;                          // 每分钟请求限制
  tpm?: number | null;                          // 每分钟令牌限制

  // === 并发翻译配置 ===
  enableConcurrentTranslation?: boolean;        // 是否启用并发翻译（默认true for DeepSeek）
  concurrencyLimit?: number;                    // 并发限制（用户可覆盖，留空则使用服务默认值）
  requestDelay?: number;                        // 请求间延迟（毫秒，用于流水线并发）

  // === Gemini专用参数（Phase 1） ===
  tier?: 'free' | 'paid' | 'pro';               // 账户类型：Gemini(free/paid)、DeepL(free/pro)
  batchDelay?: number;                          // 批量翻译延迟（ms）

  // === DeepL专用参数 ===
  formality?: string;                           // 正式度：'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less'
  splitSentences?: string;                      // 句子分割："0" | "1" | "nonewlines"（字符串类型）
  preserveFormatting?: boolean;                 // 是否保留原始格式
  showBilledCharacters?: boolean;               // 是否显示计费字符数

  // === OpenAI实验性参数 ===
  useImmersiveFormat?: boolean;                 // 是否使用沉浸式格式（\n\n分隔）而非JSON格式
  useStructuredOutputs?: boolean;               // 是否启用Structured Outputs双轨方案
}

/**
 * 用户偏好设置接口
 * 基于 architecture.md 7.1.1 UserPreferences 设计规范
 * 注意：移除了sourceLang字段，符合新架构设计
 */
export interface UserPreferences {
  // === 核心翻译设置 ===
  targetLang: string;                           // 目标语言（全局默认）
  subtitleMode: SubtitleMode;                   // 字幕显示模式

  // === 翻译服务配置（统一） ===
  translationService: TranslationServiceComplete;  // 完整的翻译服务配置

  // === 数据完整性 ===
  hash: string;                                 // 设置hash值
}

/**
 * 预定义的翻译服务模板 - 符合 architecture.md 标准
 */
export const TRANSLATION_SERVICE_TEMPLATES: Record<TranslationServiceType, Omit<TranslationServiceComplete, 'apiKey'>> = {
  [TranslationServiceType.GOOGLE_FREE]: {
    type: TranslationServiceType.GOOGLE_FREE,
    name: 'Google 翻译（免费）',
    model: null,
    temperature: null,
    rpm: 100,
    tpm: null,

    // 🔥 流水线并发配置
    enableConcurrentTranslation: true,   // 启用并发
    concurrencyLimit: 999,               // 设置很大 = 一轮发完所有批次
    requestDelay: 100                    // 每批次间隔100ms
  },
  [TranslationServiceType.MICROSOFT_FREE]: {
    type: TranslationServiceType.MICROSOFT_FREE,
    name: 'Microsoft 翻译（免费）',
    model: null,
    temperature: null,
    rpm: 100,
    tpm: null,

    // 🔥 真并发配置
    enableConcurrentTranslation: true,  // 启用并发
    concurrencyLimit: 10,               // 并发数：10（激进策略）
    requestDelay: 0                     // 无延迟（真并发）
  },
  [TranslationServiceType.OPENAI]: {
    type: TranslationServiceType.OPENAI,
    name: 'OpenAI GPT',
    model: 'gpt-5-mini',
    availableModels: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
    temperature: 1,  // GPT-5系列只支持默认值1
    maxTokens: 128000,
    rpm: 60,
    tpm: 40000,
    useImmersiveFormat: false,  // 默认使用JSON格式（带编号）
    useStructuredOutputs: false // 默认关闭Structured Outputs方案
  },
  [TranslationServiceType.GEMINI]: {
    type: TranslationServiceType.GEMINI,
    name: 'Google Gemini',
    model: 'gemini-2.5-flash-lite',               // Gemini 2.5 Flash-Lite（快速·推荐用于字幕翻译）
    availableModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],  // 可用模型列表
    temperature: 0,                               // 翻译任务需要确定性（0 = 无随机性）
    maxTokens: 65536,                             // Gemini 2.5的最大输出tokens
    rpm: 60,                                      // 默认RPM（实际会根据tier调整）
    tpm: 120000,                                  // 默认TPM（实际会根据tier调整）
    tier: 'free',                                 // Phase 1: 手动选择账户类型（默认免费层）
    batchDelay: 6000                              // Phase 1: 批量翻译延迟（免费层flash: 6秒）
  },
  [TranslationServiceType.DEEPSEEK]: {
    type: TranslationServiceType.DEEPSEEK,
    name: 'DeepSeek',
    model: 'deepseek-chat',
    availableModels: ['deepseek-chat'],  // 只保留翻译模型
    temperature: 1.3,  // 官方推荐值（固定，不暴露给用户）
    maxTokens: 8000,   // 支持更长输出
    rpm: 50,
    tpm: 50000,
    enableConcurrentTranslation: true,  // 默认启用并发翻译
    concurrencyLimit: undefined         // 留空，使用代码中的预设值（10）
  },
  [TranslationServiceType.DEEPL]: {
    type: TranslationServiceType.DEEPL,
    name: 'DeepL',
    model: 'latency_optimized',                    // 模型类型（默认延迟优化）
    availableModels: ['latency_optimized', 'quality_optimized', 'prefer_quality_optimized'],
    temperature: null,                             // DeepL 不支持 temperature
    maxTokens: null,                               // DeepL 按字符计费，无 token 概念
    rpm: null,                                     // 官方未公布RPM限制
    tpm: null,                                     // 按字符计费，无TPM概念
    tier: 'free',                                  // 'free' | 'pro'（用户选择）
    batchDelay: 50,                                // 批次间延迟（ms）
    formality: 'default',                          // 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less'
    splitSentences: "0",                           // ⚠️ 字符串类型，默认"0"禁止分句
    preserveFormatting: false,                     // 格式保留
    showBilledCharacters: true,                    // 显示计费字符数（便于监控）

    // 🔥 真并发配置
    enableConcurrentTranslation: true,  // 启用并发
    concurrencyLimit: 10,               // 并发数：10（50 QPS限制下的最佳实践）
    requestDelay: 0                     // 无延迟（真并发）
  },
  [TranslationServiceType.QWEN]: {
    type: TranslationServiceType.QWEN,
    name: 'Qwen-MT',
    model: 'qwen-mt-plus',                         // Qwen-MT旗舰翻译模型
    availableModels: ['qwen-mt-plus'],            // 只有一个翻译模型
    temperature: 0,                                // 翻译需要确定性
    maxTokens: 8192,                               // 最大输出tokens（官方限制）
    rpm: 60,                                       // 每分钟请求限制
    tpm: 23797,                                    // 每分钟tokens限制
    batchDelay: 200                                // 批次间延迟（仅batch阶段）
  },
  [TranslationServiceType.DUMMY]: {
    type: TranslationServiceType.DUMMY,
    name: '测试翻译',
    model: null,
    temperature: null,
    rpm: 1000,
    tpm: null
  }
};

/**
 * 默认用户偏好设置
 */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  targetLang: 'zh-CN',                    // 默认目标语言
  subtitleMode: SubtitleMode.BILINGUAL,   // 默认双语显示
  translationService: {
    ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.GOOGLE_FREE],
    apiKey: undefined // 确保不包含API密钥
  },
  hash: ''                                // 初始hash为空，将在保存时计算
};

/**
 * UserPreferences设置变更事件类型
 */
export enum UserPreferenceChangeEvent {
  TARGET_LANG_CHANGED = 'targetLangChanged',
  SUBTITLE_MODE_CHANGED = 'subtitleModeChanged', 
  TRANSLATION_SERVICE_CHANGED = 'translationServiceChanged'
}

/**
 * UserPreferences设置变更处理函数类型
 */
export type UserPreferenceChangeHandler = (
  newValue: any,
  oldValue: any,
  event: UserPreferenceChangeEvent
) => void;

/**
 * 计算用户偏好设置hash
 * @param preferences 用户偏好设置（不包含hash字段）
 * @returns hash字符串
 */
export function calculateUserPreferencesHash(preferences: Omit<UserPreferences, 'hash'>): string {
  const str = JSON.stringify({
    targetLang: preferences.targetLang,
    subtitleMode: preferences.subtitleMode,
    translationService: {
      ...preferences.translationService,
      apiKey: '[REDACTED]' // 不包含敏感信息在hash计算中
    }
  });
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * 📋 派生类型设计架构
 * 基于TranslationServiceComplete，为不同使用场景提供专门化类型
 */

// 存储用：排除敏感信息  
export type TranslationServiceForStorage = Omit<TranslationServiceComplete, 'apiKey'>;

// 传输用：排除敏感信息，适合消息传递
export type TranslationServiceForTransfer = Omit<TranslationServiceComplete, 'apiKey'>;

// UI显示用：仅包含显示相关字段
export type TranslationServiceForUI = Pick<TranslationServiceComplete, 
  'type' | 'name' | 'model' | 'availableModels'>;

// API调用用：包含执行翻译所需的所有信息
export type TranslationServiceForAPI = TranslationServiceComplete;

// 缓存键用：仅包含影响翻译结果的字段  
export type TranslationServiceForCacheKey = Pick<TranslationServiceComplete, 
  'type' | 'model' | 'temperature'>;

/**
 * 向后兼容：保持原有接口名称
 */
export type TranslationService = TranslationServiceComplete;

/**
 * 视频源语言完整数据
 * 存储每个视频的完整源语言信息，包括可用列表和用户选择
 *
 * 注意：源语言代码从 selectedSourceTrack?.languageCode 获取
 */
export interface VideoSourceLanguageData {
  /** 视频ID */
  videoId: string;

  /** 可用的源语言列表（仅元数据，不含URL） */
  availableSourceLanguages: TrackMetadata[];

  /** 当前选中的源语言轨道（包含完整信息：languageCode, name, kind） */
  selectedSourceTrack?: TrackMetadata;

  /** 数据获取时间戳 */
  fetchedAt: number;

  /** 最后访问时间戳 */
  lastAccessed: number;
}

/**
 * 视频源语言缓存容器
 * 使用FIFO策略管理多个视频的源语言数据
 */
export interface VideoSourceLanguageCache {
  /** 缓存项数组，按FIFO顺序排列 (最新的在数组末尾) */
  items: VideoSourceLanguageData[];
  /** 最大缓存数量 */
  maxSize: number; // 固定为10
}

// 向后兼容：保留旧的类型别名（将逐步废弃）
export type VideoSourceLanguageItem = VideoSourceLanguageData;

/**
 * 默认视频源语言缓存
 */
export const DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE: VideoSourceLanguageCache = {
  items: [],
  maxSize: 10
};
