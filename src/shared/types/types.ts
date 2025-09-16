/**
 * YouTube字幕翻译助手 - 类型定义导出模块
 * @fileoverview 提供所有类型定义的统一入口，便于其他模块引用
 * @version 5.24.6
 * @author AI Assistant
 * @filename types.ts (重命名以避免index.ts混淆)
 */

// ================================
// 📋 核心类型导出
// ================================

export * from './core-types';
export * from './storage-types';
export * from './message-types';

// ================================
// 🎯 便捷类型导出 (常用类型的快捷引用)
// ================================

import type {
  LanguageCode,
  VideoId,
  Timestamp,
  HashValue,
  TranslationProvider,
  TranslationButtonState,
  SettingsButtonState
} from './core-types';

import type {
  ExtensionMessage,
  MessageType,
  MessageSender
} from './message-types';

// ================================
// 🏗️ 类型工具函数
// ================================

/**
 * 检查对象是否为特定的消息类型
 * @param obj 要检查的对象
 * @param messageType 期望的消息类型
 * @returns 类型守卫结果
 */
export function isMessageType<T extends ExtensionMessage>(
  obj: any,
  messageType: MessageType
): obj is T {
  return obj && typeof obj === 'object' && obj.type === messageType;
}

/**
 * 创建类型安全的消息ID
 * @param prefix 前缀
 * @returns 唯一的消息ID
 */
export function createMessageId(prefix: string = 'msg'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建时间戳
 * @returns 当前时间戳 (毫秒)
 */
export function createTimestamp(): Timestamp {
  return Date.now();
}

/**
 * 验证语言代码格式 (BCP-47)
 * @param code 语言代码
 * @returns 是否为有效的语言代码
 */
export function isValidLanguageCode(code: string): code is LanguageCode {
  // 简单的BCP-47格式验证
  return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(code);
}

/**
 * 验证视频ID格式 (YouTube视频ID)
 * @param id 视频ID
 * @returns 是否为有效的YouTube视频ID
 */
export function isValidVideoId(id: string): id is VideoId {
  // YouTube视频ID通常为11个字符的字母数字组合
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

// ================================
// 📊 类型统计信息
// ================================

/**
 * 获取类型定义统计信息
 */
export function getTypeStats() {
  return {
    coreTypes: 20,        // 核心类型数量
    storageTypes: 15,     // 存储类型数量
    messageTypes: 25,     // 消息类型数量
    totalTypes: 60,       // 总类型数量
    version: '5.24.6',    // 类型定义版本
    lastUpdated: '2025-06-03'
  };
}

// ================================
// 🔍 类型查询助手
// ================================

/**
 * 消息类型映射表 (用于运行时类型检查)
 */
export const MESSAGE_TYPE_MAP = {
  // 系统消息
  EXTENSION_INIT: 'extension_init',
  EXTENSION_SHUTDOWN: 'extension_shutdown',
  
  // 字幕消息
  SUBTITLE_DETECTED: 'subtitle_detected',
  SUBTITLE_UPDATED: 'subtitle_updated',
  SUBTITLE_REQUEST: 'subtitle_request',
  
  // 翻译消息
  TRANSLATION_REQUEST: 'translation_request',
  TRANSLATION_RESPONSE: 'translation_response',
  TRANSLATION_ERROR: 'translation_error',
  TRANSLATION_TOGGLE: 'translation_toggle',
  
  // UI消息
  UI_STATE_UPDATE: 'ui_state_update',
  BUTTON_STATE_CHANGE: 'button_state_change',
  
  // 设置消息
  SETTINGS_GET: 'settings_get',
  SETTINGS_UPDATE: 'settings_update',
  SETTINGS_RESET: 'settings_reset',
  
  // SidePanel消息
  SIDEPANEL_OPEN: 'sidepanel_open',
  SIDEPANEL_CLOSE: 'sidepanel_close',
  SIDEPANEL_DATA_REQUEST: 'sidepanel_data_request',
  SIDEPANEL_DATA_RESPONSE: 'sidepanel_data_response',
  
  // 缓存消息
  CACHE_GET: 'cache_get',
  CACHE_SET: 'cache_set',
  CACHE_CLEAR: 'cache_clear',
  
  // 监控消息
  ERROR_REPORT: 'error_report',
  PERFORMANCE_STATS: 'performance_stats'
} as const;

/**
 * 翻译服务提供商映射表
 */
export const TRANSLATION_PROVIDER_MAP = {
  OPENAI: 'openai',
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
  BAIDU: 'baidu'
} as const;

/**
 * 存储键映射表
 */
export const STORAGE_KEY_MAP = {
  USER_PREFERENCES: 'user_preferences',
  RUNTIME_STATE: 'runtime_state',
  ORIGINAL_SUBTITLES: 'original_subtitles',
  TRANSLATION_CACHE: 'translation_cache',
  VIDEO_SETTINGS: 'video_settings',
  PERFORMANCE_STATS: 'performance_stats'
} as const;

// ================================
// 🎯 重新导出所有枚举类型 (避免重复导出)
// ================================

export {
  StorageType,
  StorageKey
} from './storage-types';

export {
  MessagePriority
} from './message-types'; 