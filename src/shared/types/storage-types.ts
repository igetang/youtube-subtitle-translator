/**
 * YouTube字幕翻译助手 - 存储类型定义
 * @fileoverview 定义扩展存储系统中使用的所有数据结构
 * @version 5.24.6
 * @author AI Assistant
 */

import {
  LanguageCode,
  VideoId,
  Timestamp,
  HashValue,
  TranslationProvider,
  SubtitleEvent,
  ProcessedSubtitleEvent
} from './core-types';
import type { SimplifiedCaptionTrack } from './subtitle-types';

// ================================
// 💾 存储层级定义
// ================================

/**
 * 存储类型枚举
 */
export enum StorageType {
  /** Chrome Extension Storage API - 持久化存储 */
  CHROME_STORAGE = 'chrome_storage',
  /** Session Storage - 会话级存储 */
  SESSION_STORAGE = 'session_storage',
  /** Memory Cache - 内存缓存 */
  MEMORY_CACHE = 'memory_cache'
}

/**
 * 存储键前缀
 */
export enum StorageKey {
  /** 用户偏好设置 */
  USER_PREFERENCES = 'user_preferences',
  /** 运行时状态 */
  RUNTIME_STATE = 'runtime_state',
  /** 原字幕数据 */
  ORIGINAL_SUBTITLES = 'original_subtitles',
  /** 翻译缓存 */
  TRANSLATION_CACHE = 'translation_cache',
  /** 视频设置 */
  VIDEO_SETTINGS = 'video_settings',
  /** 性能统计 */
  PERFORMANCE_STATS = 'performance_stats'
}

// ================================
// 👤 用户偏好设置 (持久化存储)
// ================================

/**
 * 翻译服务配置
 */
export interface TranslationServiceConfig {
  /** 服务提供商 */
  provider: TranslationProvider;
  /** API密钥 (加密存储) */
  apiKey?: string;
  /** 服务端点URL */
  endpoint?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级 (数字越小优先级越高) */
  priority: number;
  /** 速率限制设置 */
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

/**
 * ⚠️ UserPreferences 接口已移至 user-preferences-types.ts
 * 
 * 为符合 architecture.md 标准规范，UserPreferences 接口统一定义在:
 * @see src/shared/types/user-preferences-types.ts
 * 
 * 如需使用 UserPreferences，请从以下位置导入:
 * import { UserPreferences } from '../types/user-preferences-types';
 */

// ================================
// 🔄 运行时状态 (会话存储)
// ================================

/**
 * ⚠️ RuntimeState 接口已移至 runtime-state-types.ts
 * 
 * 为符合 architecture.md 7.1.2 RuntimeState 标准规范，RuntimeState 接口统一定义在:
 * @see src/shared/types/runtime-state-types.ts
 * 
 * 如需使用 RuntimeState，请从以下位置导入:
 * import { RuntimeState } from '../types/runtime-state-types';
 * 
 * 标准 RuntimeState 仅包含核心字段：
 * - translateActive: TranslateActiveState
 * - popupOpen: boolean
 */

// ================================
// 📺 视频特定数据
// ================================

/**
 * ⚠️ VideoSourceLanguageCache 已移至 user-preferences-types.ts
 * 
 * 此接口定义已迁移到正确的文件位置，请使用：
 * @see VideoSourceLanguageCache in user-preferences-types.ts
 * @see VideoSourceLanguageItem in user-preferences-types.ts
 * 
 * 架构设计：
 * - 存储位置：chrome.storage.local
 * - 存储键：video_source_language_cache
 * - 缓存策略：FIFO覆盖，最大10个视频
 * - 解决问题：为TranslationCacheData提供源语言参数
 */

// 字幕轨道接口已移至 subtitle-types.ts 统一管理
// SimplifiedCaptionTrack 已通过顶部import导入

/**
 * ✅ 现已恢复：OriginalSubtitleData 接口
 *
 * 此接口现在是项目中原始字幕数据的权威定义，存储在 Background Service Worker 的内存缓存中。
 * 它取代了之前的 `MemoryCacheItem`，以提供更清晰的语义。
 *
 * @see OriginalSubtitleData - (位于 service-worker.ts) Background内存缓存项
 * @see CaptionTrack - (位于 youtube-types.ts) 完整的字幕轨道信息
 *
 * 架构指引：
 * - `OriginalSubtitleData` 包含一个视频的所有原始字幕轨道 (`CaptionTrack[]`)。
 * - 它由 `OriginalSubtitleManager` (位于 service-worker.ts) 管理。
 * - 存储位置：Background Service Worker 内存 (`originalSubtitleCache`)。
 */

/**
 * 翻译缓存数据 - 符合architecture.md 7.1.6设计规范
 * 存储完整的视频字幕翻译结果，支持精确缓存匹配和源语言管理
 * 
 * 存储规范：
 * - 存储位置: chrome.storage.local
 * - 键格式: subtitle_translation_cache_${videoId}_${sourceLang}_${targetLang}_${service.type}_${service.model}_${service.temperature}
 * - 缓存策略: LRU (基于lastUsed时间戳)
 * - 安全特性: 使用TranslationServiceForStorage排除API密钥
 */
export interface TranslationCacheData {
  // === 标识信息 ===
  /** 视频ID */
  videoId: string;
  /** 源语言（用于匹配） */
  sourceLang: string;
  /** 源语言字幕类型（手动/自动生成/强制） */
  sourceKind?: 'asr' | 'forced';
  /** 目标语言（用于匹配） */
  targetLang: string;
  
  // === 源语言信息 ===
  /** 可用的源语言列表（使用简化类型，支持SidePanel显示） */
  availableSourceLanguages: SimplifiedCaptionTrack[];
  
  // === 翻译服务配置（安全版本） ===
  /** 完整配置，但排除API密钥 - 引用user-preferences-types.ts */
  translationService: import('../types/user-preferences-types').TranslationServiceForStorage;
  
  // === 翻译内容 ===
  /** 原始字幕数据（完整VTT格式字符串） - 用于服务切换时复用 */
  originalSubtitles: string;
  /** 翻译后的字幕数据（完整VTT格式字符串） */
  translatedSubtitles: string;
  
  // === 元数据 ===
  /** 最后使用时间戳 */
  lastUsed: number;
  
  // === 数据完整性验证 ===
  /** 数据完整性hash */
  dataHash: string;
}

export interface TranslationPerformanceStats {
  /** 总翻译请求数 */
  totalRequests: number;
  /** 成功请求数 */
  successfulRequests: number;
  /** 缓存命中数 */
  cacheHits: number;
  /** 平均响应时间 (毫秒) */
  avgResponseTime: number;
  /** 各服务提供商统计 */
  providerStats: Record<TranslationProvider, {
    requests: number;
    successes: number;
    avgTime: number;
    errors: number;
  }>;
  /** 语言对统计 */
  languagePairStats: Record<string, {
    requests: number;
    avgTime: number;
    cacheHitRate: number;
  }>;
}

export interface SystemPerformanceStats {
  /** 内存使用统计 */
  memory: {
    used: number;
    peak: number;
    available: number;
  };
  /** 缓存统计 */
  cache: {
    size: number;
    hitRate: number;
    evictions: number;
  };
  /** 网络统计 */
  network: {
    requests: number;
    bytes: number;
    avgLatency: number;
  };
  /** 统计时间范围 */
  timeRange: {
    start: Timestamp;
    end: Timestamp;
  };
}

export interface StorageOperationResult<T = any> {
  /** 操作是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 操作时间戳 */
  timestamp: Timestamp;
}

export interface StorageQueryOptions {
  /** 是否包含过期数据 */
  includeExpired?: boolean;
  /** 排序字段 */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 限制返回数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

export interface CachePolicy {
  /** 最大条目数 */
  maxEntries: number;
  /** 默认TTL (秒) */
  defaultTTL: number;
  /** 清理策略 */
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
  /** 是否压缩存储 */
  compression: boolean;
}

export type StorageTypes = {
  StorageType: StorageType;
  StorageKey: StorageKey;
  // OriginalSubtitleData: 内存缓存类型，定义于 service-worker.ts
  SimplifiedCaptionTrack: SimplifiedCaptionTrack;     // 🔄 字幕轨道类型（用于MemoryCache）
  TranslationCacheData: TranslationCacheData;
  StorageOperationResult: StorageOperationResult;
  // RuntimeState: 已移至 runtime-state-types.ts
  // UserPreferences: 已移至 user-preferences-types.ts
};

export interface MigrationResult {
  completed: boolean;
  details: {
    userPreferences: {
      migrated: boolean;
      error?: string;
    };
    videoCache: {
      migrated: boolean;
      error?: string;
    };
  };
}

export const STORAGE_PREFIXES = {
  SETTINGS: 'settings.',
  USER_PREFERENCES: 'user_preferences.',   // 替代 GLOBAL_SETTINGS
  RUNTIME_STATE: 'runtime_state.',
  CACHE: 'cache.',
  TEMP: 'temp.'
} as const;

/**
 * 最后迁移时间戳的存储键
 */
export const LAST_MIGRATION_TIMESTAMP_KEY = 'migration_last_timestamp'; 