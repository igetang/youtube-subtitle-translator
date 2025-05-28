/**
 * 背景脚本入口点
 * 将所有优化组件集成到一个文件中
 */

// 导入主背景脚本（将其作为主模块）
import './background'

// 导入字幕本地存储管理器（确保动态导入能够正常工作）
import './subtitle-local-storage'

// 导出优化模块（仅为类型系统，不影响运行时）
export { RateLimitManager } from './rate-limit-manager';
export { BatchProcessor } from './batch-processor';
export { TranslationLocalStorage } from './translation-local-storage';
export { OpenAITranslator } from './openai-translator';
export { SubtitleLocalStorage } from './subtitle-local-storage'; 