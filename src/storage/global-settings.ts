/**
 * @file global-settings.ts
 * @description 统一的全局设置类型定义，合并原UserSettings和VideoSettings
 */

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
 * 视频特定设置数据
 */
export interface VideoSpecificData {
  videoId: string;           // 视频ID
  sourceLang: string;        // 源语言
  targetLang: string;        // 目标语言
  lastUsed: number;          // 最后使用时间戳
  hasSubtitles: boolean;     // 视频是否有字幕
  sourceTrackKind?: string;  // 源语言轨道类型
}

/**
 * 统一的全局设置
 * 包含原UserSettings和VideoSettings的所有功能
 */
export interface GlobalSettings {
  // === 原UserSettings部分 ===
  
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
  
  // === 新增：视频管理部分 ===
  
  // 当前视频信息
  currentVideoId: string;
  
  // 视频特定设置缓存 (取代原VideoSettings存储)
  // 键为videoId，值为视频特定数据
  videoSpecificCache: Record<string, VideoSpecificData>;
  
  // 最近使用的视频列表 (用于缓存管理)
  recentVideos: string[];
  
  // 缓存管理设置
  maxCachedVideos: number;
  cacheCleanupInterval: number; // 缓存清理间隔 (毫秒)
}

/**
 * 默认全局设置
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  // 原UserSettings默认值
  sourceLang: 'auto',
  targetLang: null as any, // 🔄 动态计算，在初始化时根据UI语言智能选择
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
  },
  
  // 新增默认值
  currentVideoId: '',
  videoSpecificCache: {},
  recentVideos: [],
  maxCachedVideos: 50,
  cacheCleanupInterval: 24 * 60 * 60 * 1000 // 24小时
};

/**
 * 设置变更事件类型
 */
export enum GlobalSettingChangeEvent {
  SOURCE_LANG_CHANGED = 'sourceLangChanged',
  TARGET_LANG_CHANGED = 'targetLangChanged',
  SUBTITLE_MODE_CHANGED = 'subtitleModeChanged',
  TRANSLATE_ACTIVE_CHANGED = 'translateActiveChanged',
  TRANSLATION_API_CHANGED = 'translationApiChanged',
  API_KEY_CHANGED = 'apiKeyChanged',
  API_SETTINGS_CHANGED = 'apiSettingsChanged',
  CURRENT_VIDEO_CHANGED = 'currentVideoChanged',
  VIDEO_SPECIFIC_DATA_CHANGED = 'videoSpecificDataChanged'
}

/**
 * 设置变更处理函数类型
 */
export type GlobalSettingChangeHandler = (
  newValue: any,
  oldValue: any,
  event: GlobalSettingChangeEvent
) => void; 