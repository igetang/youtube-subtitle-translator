/**
 * YouTube字幕翻译助手 - 后台脚本导出模块
 * @fileoverview 背景脚本入口点，将所有优化组件集成到一个文件中
 * @version 5.24.6
 * @author AI Assistant
 * @filename background-modules.ts (重命名以避免index.ts混淆)
 */

// 导入主背景脚本（将其作为主模块）
import './background'

// 导入字幕本地存储管理器（确保动态导入能够正常工作）
import './subtitle-local-storage'

// 导出优化模块（仅为类型系统，不影响运行时）
export { RateLimitManager } from './utils/rate-limit-manager';
export { BatchProcessor } from './components/batch-processor';
export { TranslationLocalStorage } from './utils/translation-local-storage';
export { OpenAITranslator } from './components/openai-translator';
export { SubtitleLocalStorage } from './utils/subtitle-local-storage'; 