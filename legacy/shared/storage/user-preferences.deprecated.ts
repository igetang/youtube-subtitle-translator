/**
 * @file global-settings.ts
 * @description 重构后的全局设置类型定义
 */

// SubtitleMode 已移至 user-preferences-types.ts 统一管理
import { SubtitleMode } from '../types/user-preferences-types';

/**
 * 翻译服务类型
 */
export enum TranslationServiceType {
  GOOGLE_FREE = 'google-free',    // 免费Google翻译，不需要API key
  OPENAI = 'openai',              // OpenAI，需要API key + model + temperature
  GEMINI = 'gemini',              // Google Gemini，需要API key + model
  DEEPSEEK = 'deepseek',          // DeepSeek，需要API key + model
  QWEN = 'qwen',                  // 通义千问，需要API key + model
  DUMMY = 'dummy'                 // 用于测试
}

/**
 * 服务配置
 */
export interface ServiceConfig {
  apiKey: string;                 // API密钥（google-free时为空）
  model: string;                  // 模型名称（AI服务需要）
  temperature: number;            // 模型参数（AI服务需要）
  // 后续根据需要添加其他通用参数
}

/**
 * 全局设置 - 持久化用户偏好设置
 */
export interface GlobalSettings {
  // === 核心翻译设置 ===
  targetLang: string;                           // 目标语言（全局默认）
  subtitleMode: SubtitleMode;                   // 字幕显示模式
  
  // === 翻译服务配置 ===
  translationService: TranslationServiceType;  // 翻译服务类型
  
  // === 通用服务配置 ===
  serviceConfig: ServiceConfig;                 // 服务配置
  
  // === 数据完整性 ===
  hash: string;                                 // Hash: targetLang + subtitleMode + translationService
}

/**
 * ⚠️ 已弃用：RuntimeState 接口
 * 此接口已被移除，请使用新架构中的 RuntimeState：
 * 
 * 新位置：src/shared/types/runtime-state-types.ts
 * 管理器：RuntimeStateManager
 * 
 * 标准 RuntimeState 使用 TranslateActiveState 枚举而非 boolean 类型：
 * - translateActive: TranslateActiveState (INACTIVE/ACTIVE/PENDING)
 * - settingPanelOpen: boolean
 * 
 * 导入新接口：
 * import { RuntimeState } from '../types/runtime-state-types';
 */
// export interface RuntimeState {
//   translateActive: boolean;                     // 🚫 已弃用：使用 TranslateActiveState 枚举
//   settingPanelOpen: boolean;                    // ✅ 保留，但请使用新架构
// }

/**
 * 视频特定数据 - 跟翻译字幕一起存储
 */
export interface VideoSpecificData {
  videoId: string;                              // 视频ID
  sourceLang: string;                           // 源语言（用于匹配）
  targetLang: string;                           // 目标语言（用于匹配，不作为设置使用）
  translationService: TranslationServiceType;   // 翻译服务类型
  serviceConfig: ServiceConfig;                 // 服务配置
  lastUsed: number;                             // 最后使用时间戳
  hasSubtitles: boolean;                        // 是否有字幕
  translatedSubtitles: string;                  // 翻译后的字幕数据（JSON字符串或处理后的数据）
  
  // === 双重验证 ===
  dataHash: string;                             // 数据完整性hash
  version: string;                              // 数据结构版本
}

/**
 * 默认全局设置
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  targetLang: 'auto',                           // 默认目标语言
  subtitleMode: SubtitleMode.BILINGUAL,         // 默认双语模式
  translationService: TranslationServiceType.GOOGLE_FREE, // 默认免费Google翻译
  serviceConfig: {
    apiKey: '',                                 // 默认空API密钥
    model: 'null',                              // 默认模型
    temperature: 0.7                            // 默认温度
  },
  hash: ''                                      // 将在初始化时计算
};

/**
 * ⚠️ 已弃用：DEFAULT_RUNTIME_STATE
 * 此常量已被移除，请使用新架构中的 DEFAULT_RUNTIME_STATE：
 * 
 * 新位置：src/shared/types/runtime-state-types.ts
 * 导入：
 * import { DEFAULT_RUNTIME_STATE } from '../types/runtime-state-types';
 */
// export const DEFAULT_RUNTIME_STATE: RuntimeState = {
//   translateActive: false,                       // 🚫 已弃用：使用 TranslateActiveState.INACTIVE
//   settingPanelOpen: false,                     // ✅ 保留，但请使用新架构
// };

/**
 * 当前数据结构版本
 */
export const DATA_VERSION = '1.0.0';

/**
 * 计算全局设置hash
 */
export function calculateGlobalSettingsHash(settings: Omit<GlobalSettings, 'hash'>): string {
  const hashData = {
    targetLang: settings.targetLang,
    subtitleMode: settings.subtitleMode,
    translationService: settings.translationService
  };
  
  // 简单hash算法（生产环境可考虑使用更安全的hash）
  const str = JSON.stringify(hashData);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(16);
}

/**
 * 计算视频数据hash
 */
export function calculateVideoDataHash(data: Omit<VideoSpecificData, 'dataHash' | 'version'>): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * 设置变更事件类型
 * 注意：这里包含所有用户操作引起的设置变更，不仅限于GlobalSettings数据结构
 */
export enum GlobalSettingChangeEvent {
  TARGET_LANG_CHANGED = 'targetLangChanged',
  SUBTITLE_MODE_CHANGED = 'subtitleModeChanged',
  TRANSLATION_SERVICE_CHANGED = 'translationServiceChanged',
  SERVICE_CONFIG_CHANGED = 'serviceConfigChanged',
  RUNTIME_STATE_CHANGED = 'runtimeStateChanged',
  SOURCE_LANG_CHANGED = 'sourceLangChanged'  // 新增：源语言变更事件（存储在VideoSpecificData中）
}

/**
 * 设置变更处理函数类型
 */
export type GlobalSettingChangeHandler = (
  newValue: any,
  oldValue: any,
  event: GlobalSettingChangeEvent
) => void; 