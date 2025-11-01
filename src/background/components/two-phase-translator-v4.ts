/**
 * @file two-phase-translator-v4.ts
 * @description 支持AbortSignal的两阶段翻译器
 * 基于原有TwoPhaseTranslator，添加信号支持
 * @version 4.0
 * @date 2025-09-09
 */

import { IntelligentSegmenter } from './intelligent-segmenter';
import { OpenAITranslator } from './openai-translator';
import { MicrosoftTranslator } from './microsoft-translator';
import { MicrosoftTextOptimizer } from './microsoft-text-optimizer';
import { DeepSeekTranslator } from './deepseek-translator';
import { GeminiTranslator } from './gemini-translator';
import { DeepLTranslator } from './deepl-translator';
import { QwenTranslator } from './qwen-translator';
import { LanguageCodeMapper } from '@shared/utils/language-code-mapper';

export const GOOGLE_TRANSLATE_BATCH_TIMEOUT_MS = 10000;  // 谷歌免费翻译批次超时（毫秒）

/**
 * 两阶段翻译器 - 支持AbortSignal版本
 */
type GoogleEndpointId = 'single' | 't';

interface MicrosoftSubtitleEntry {
  id?: string;
  start: number;
  end?: number;
  duration?: number;
  rawText: string;
  text: string;
  __msIndex: number;
}

interface MicrosoftAggregate {
  text: string;
  indices: number[];
}

export class TwoPhaseTranslatorV4 {
  private static readonly OPENAI_BATCH_SIZE = 10;  // OpenAI单批最大字幕条数
  private static readonly API_DELAY = 50;  // API调用间隔
  private static readonly URGENT_RESPONSE_TIME = 300;  // 紧急响应时间目标
  private static readonly BATCH_START_DELAY = 200;  // 批量翻译启动延迟（200ms）
  private static readonly TIMEOUT_MS = 15000;  // 统一超时时间（15秒，适配OpenAI）
  private static readonly MS_MAX_ITEMS = 10;  // 微软每次请求最大字幕条数
  private static readonly MS_MAX_CHARS = 5000;  // 微软单个文本最大字符数
  private static readonly MS_MAX_TOTAL_CHARS = 50000;  // 微软单次请求字符总量限制

  /**
   * 并发翻译配置（Phase 1：仅DeepSeek启用）
   */
  private static readonly CONCURRENCY_CONFIG = {
    DEEPSEEK: 10,           // DeepSeek默认并发数（官方"无限制"，社区经验10）
    OPENAI: 10,             // OpenAI默认并发数（预留）
    GEMINI: 5,              // Gemini默认并发数（预留）
    BATCH_TIMEOUT_MS: 8000  // 单批次超时（8秒）
  };

  // 🚀 调试开关：启用微软5000字符窗口优化
  private static readonly USE_MICROSOFT_OPTIMIZER = true;  // 设为true启用新优化器
  
  private translationService: any = null;  // 翻译服务配置

  private segmenter!: IntelligentSegmenter;  // 懒加载，根据服务类型创建
  private microsoftTranslator: MicrosoftTranslator;
  private microsoftOptimizer: MicrosoftTextOptimizer;  // 新增：5000字符优化器
  private isComplete: boolean = false;
  private currentExecutionId: number = 0;
  private preferredGoogleEndpoint: GoogleEndpointId | null = null;
  private failedGoogleEndpoints = new Set<GoogleEndpointId>();

  constructor() {
    this.microsoftTranslator = new MicrosoftTranslator();
    this.microsoftOptimizer = new MicrosoftTextOptimizer();  // 新增：初始化优化器
  }

  /**
   * 设置翻译服务配置（并根据服务类型创建对应的IntelligentSegmenter）
   */
  public setTranslationService(service: any): void {
    this.translationService = service;

    // 根据翻译服务类型创建不同配置的IntelligentSegmenter
    const serviceType = service?.type;
    if (serviceType === 'openai') {
      // OpenAI使用固定批次大小（集中管理便于调整）
      this.segmenter = new IntelligentSegmenter(TwoPhaseTranslatorV4.OPENAI_BATCH_SIZE);
      console.debug(
        `[debug][TwoPhaseTranslatorV4] 使用OpenAI配置：${TwoPhaseTranslatorV4.OPENAI_BATCH_SIZE}条/批`
      );
    } else if (serviceType === 'deepseek') {
      // DeepSeek使用10条/批（优化：减少超时风险，提升响应速度）
      this.segmenter = new IntelligentSegmenter(10);
      console.debug('[debug][TwoPhaseTranslatorV4] 使用DeepSeek配置：10条/批');
    } else if (serviceType === 'gemini') {
      // Gemini使用80条/批（1M上下文窗口）
      this.segmenter = new IntelligentSegmenter(80);
      console.debug('[debug][TwoPhaseTranslatorV4] 使用Gemini配置：80条/批');
    } else if (serviceType === 'deepl') {
      // DeepL使用50条/批（API原生支持最多50条）
      this.segmenter = new IntelligentSegmenter(50);
      console.debug('[debug][TwoPhaseTranslatorV4] 使用DeepL配置：50条/批');
    } else if (serviceType === 'qwen') {
      // Qwen使用30条/批（智能断句）
      this.segmenter = new IntelligentSegmenter(30);
      console.debug('[debug][TwoPhaseTranslatorV4] 使用Qwen配置：30条/批');
    } else {
      // Google/Microsoft等其他服务使用40条/批
      this.segmenter = new IntelligentSegmenter(40);
      console.debug('[debug][TwoPhaseTranslatorV4] 使用Google/Microsoft配置：40条/批');
    }
  }

  /**
   * 获取当前服务的并发限制
   * @returns 并发数（0表示串行处理）
   */
  private getConcurrencyLimit(): number {
    const service = this.translationService;
    if (!service) return 0;

    // 检查是否启用并发翻译
    if (!service.enableConcurrentTranslation) {
      return 0; // 返回0表示使用串行处理
    }

    // 优先使用用户自定义的并发限制
    if (service.concurrencyLimit && service.concurrencyLimit > 0) {
      return service.concurrencyLimit;
    }

    // 使用服务默认配置
    const serviceType = service.type;
    switch (serviceType) {
      case 'deepseek':
        return TwoPhaseTranslatorV4.CONCURRENCY_CONFIG.DEEPSEEK;
      case 'openai':
        return TwoPhaseTranslatorV4.CONCURRENCY_CONFIG.OPENAI;
      case 'gemini':
        return TwoPhaseTranslatorV4.CONCURRENCY_CONFIG.GEMINI;
      default:
        return 0; // 其他服务默认串行
    }
  }

  /**
   * 获取批次超时时间
   * @returns 超时时间（毫秒）
   */
  private getBatchTimeout(): number {
    return TwoPhaseTranslatorV4.CONCURRENCY_CONFIG.BATCH_TIMEOUT_MS;
  }

  /**
   * 获取请求间延迟时间（用于流水线并发）
   * @returns 延迟时间（毫秒），0表示无延迟
   */
  private getRequestDelay(): number {
    const service = this.translationService;
    return service?.requestDelay ?? 0;
  }

  /**
   * 执行紧急翻译（支持取消）
   *
   * @param subtitles 所有字幕
   * @param currentTime 当前播放时间（秒）
   * @param sourceLanguageName 源语言名称（如"English"，供Chat类API与日志使用）
   * @param sourceLanguageCode 源语言代码（如"en"，供需要代码的API使用）
   * @param preferences 用户偏好设置
   * @param signal AbortSignal用于取消操作
   * @returns 紧急翻译结果数组
   */
  public async translateUrgent(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    currentTime: number,
    sourceLanguageName: string,
    sourceLanguageCode: string,
    preferences: any,
    signal: AbortSignal
  ): Promise<Array<{
    index: number;
    originalText: string;
    translatedText: string;
    isUrgent: true;
  }>> {
    // 检查信号
    if (signal.aborted) {
      throw new DOMException('紧急翻译开始前已取消', 'AbortError');
    }
    
    const results: any[] = [];
    const serviceType = preferences.translationService?.type;
    const isMicrosoftService = serviceType === 'microsoft' || serviceType === 'microsoft-free';
    const normalizedSourceLanguageCode =
      sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';
    
    try {
      // 找到当前播放位置的索引
      const currentIndex = subtitles.findIndex(sub =>
        currentTime >= sub.start && (!sub.end || currentTime <= sub.end)
      );

      // 获取紧急批次（当前位置前后的字幕）
      const urgentBatch = IntelligentSegmenter.getUrgentBatch(
        subtitles,
        Math.max(0, currentIndex)
      );

      // 打印当前位置详细信息
      const actualIndex = Math.max(0, currentIndex);
      const beforeCount = actualIndex;
      const afterCount = subtitles.length - actualIndex - 1;
      console.log(`[TwoPhaseTranslatorV4] 当前位置: ${currentTime}s, ` +
        `${currentIndex === -1 ? '无字幕匹配' : `匹配第${currentIndex + 1}条字幕`}, ` +
        `前${beforeCount}条, 后${afterCount}条, ` +
        `紧急批次: ${urgentBatch.length}条`);
      
      if (urgentBatch.length === 0) {
        return results;
      }
      
      const sourceLabel = this.getSourceLanguageLabel(
        serviceType,
        sourceLanguageName,
        normalizedSourceLanguageCode
      );
      const targetLabel = this.getTargetLanguageLabel(serviceType, preferences.targetLang);
      console.log(
        `[TwoPhaseTranslatorV4] 紧急翻译 ${urgentBatch.length} 条字幕 | ${sourceLabel} → ${targetLabel}`
      );

      // 准备文本：移除单条字幕内的换行符，用空格替代
      const texts = urgentBatch.map(sub => sub.text.replace(/\n/g, ' ').trim());

      // 合并日志：显示处理前后对比
      // console.log('[TwoPhaseTranslatorV4] 原始字幕前3条:',
      //   urgentBatch.slice(0, 3).map((sub, i) => ({
      //     原始: sub.text,
      //     处理后: texts[i],
      //     包含换行: sub.text.includes('\n')
      //   }))
      // );
      
      // 检查信号
      if (signal.aborted) {
        throw new DOMException('紧急翻译准备时被取消', 'AbortError');
      }
      
      let translatedTexts: string[];
      if (isMicrosoftService) {
        translatedTexts = await this.translateWithMicrosoftSubtitles(
          urgentBatch,
          normalizedSourceLanguageCode,
          preferences.targetLang,
          'urgent',
          signal
        );
      } else {
        translatedTexts = await this.callTranslationAPI(
          texts,
          preferences.translationService,
          sourceLanguageName,
          normalizedSourceLanguageCode,
          preferences.targetLang,
          signal,
          { stage: 'urgent', batchIndex: 1, batchCount: 1 }
        );
      }

      const translatedLines = translatedTexts || [];
      
      // 构建结果
      urgentBatch.forEach((sub, idx) => {
        const translatedText = translatedLines[idx] || sub.text;
        const originalIndex = subtitles.indexOf(sub);

        if (originalIndex !== -1) {
          results.push({
            index: originalIndex,
            originalText: texts[idx],  // 复用已处理的单行文本
            translatedText: translatedText,
            isUrgent: true
          });
        }
      });
      
      console.log(`[TwoPhaseTranslatorV4] ✓ 紧急翻译完成: ${results.length} 条`);
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[TwoPhaseTranslatorV4] ✗ 紧急翻译被取消');
      } else {
        console.error('[TwoPhaseTranslatorV4] ✗ 紧急翻译失败:', error);
      }
      throw error;
    }
    
    return results;
  }

  /**
   * 执行批量翻译（路由器方法）
   * 根据服务配置自动选择串行或并发翻译
   *
   * @param subtitles 所有字幕
   * @param urgentResults 紧急翻译结果（用于去重）
   * @param sourceLanguageName 源语言名称（如"English"，供Chat类API与日志使用）
   * @param sourceLanguageCode 源语言代码（如"en"，供需要代码的API使用）
   * @param preferences 用户偏好设置
   * @param signal AbortSignal用于取消操作
   * @returns 批量翻译结果数组
   */
  public async translateBatch(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    urgentResults: Array<any>,
    sourceLanguageName: string,
    sourceLanguageCode: string,
    preferences: any,
    signal: AbortSignal
  ): Promise<Array<{
    index: number;
    originalText: string;
    translatedText: string;
    isUrgent: false;
  }>> {
    // 获取并发限制和请求延迟
    const concurrency = this.getConcurrencyLimit();
    const requestDelay = this.getRequestDelay();

    // 路由到对应的翻译方法

    // 路由1：流水线并发模式（有延迟）
    if (concurrency > 0 && requestDelay > 0) {
      console.debug(`[debug][TwoPhaseTranslatorV4] 使用流水线并发模式（间隔${requestDelay}ms）`);
      return this.translateBatchPipeline(
        subtitles,
        urgentResults,
        sourceLanguageName,
        sourceLanguageCode,
        preferences,
        signal
      );
    }

    // 路由2：真并发模式（无延迟）
    if (concurrency > 0) {
      console.debug(`[debug][TwoPhaseTranslatorV4] 使用并发翻译模式（并发数: ${concurrency}）`);
      return this.translateBatchConcurrent(
        subtitles,
        urgentResults,
        sourceLanguageName,
        sourceLanguageCode,
        preferences,
        signal
      );
    }

    // 路由3：串行模式
    console.debug('[debug][TwoPhaseTranslatorV4] 使用串行翻译模式');
    return this.translateBatchSerial(
      subtitles,
      urgentResults,
      sourceLanguageName,
      sourceLanguageCode,
      preferences,
      signal
    );
  }

  /**
   * 串行批量翻译（原有逻辑）
   * 逐批处理，等待每批完成后再进行下一批
   *
   * @param subtitles 所有字幕
   * @param urgentResults 紧急翻译结果（用于去重）
   * @param sourceLanguageName 源语言名称（如"English"，供Chat类API与日志使用）
   * @param sourceLanguageCode 源语言代码（如"en"，供需要代码的API使用）
   * @param preferences 用户偏好设置
   * @param signal AbortSignal用于取消操作
   * @returns 批量翻译结果数组
   */
  private async translateBatchSerial(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    urgentResults: Array<any>,
    sourceLanguageName: string,
    sourceLanguageCode: string,
    preferences: any,
    signal: AbortSignal
  ): Promise<Array<{
    index: number;
    originalText: string;
    translatedText: string;
    isUrgent: false;
  }>> {
    // 检查信号
    if (signal.aborted) {
      throw new DOMException('批量翻译开始前已取消', 'AbortError');
    }
    
    const results: any[] = [];
    const serviceType = preferences.translationService?.type;
    const isMicrosoftService = serviceType === 'microsoft' || serviceType === 'microsoft-free';
    const normalizedSourceLanguageCode =
      sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';

    try {
      // 延迟启动（避免与紧急翻译冲突）
      await this.delayWithSignal(TwoPhaseTranslatorV4.BATCH_START_DELAY, signal);
      
      if ((preferences.translationService?.type === 'google' || preferences.translationService?.type === 'google-free') && !this.preferredGoogleEndpoint) {
        throw new Error('紧急翻译未确定可用的Google端点，跳过批量翻译');
      }

      // 批量翻译应该翻译全部字幕（包括紧急翻译的部分）
      // 理由：1. 获得更好的上下文 2. 提升翻译质量 3. 保持翻译一致性
      const batchSubtitles = subtitles;

      // 如果紧急翻译已经覆盖全部字幕，可以跳过批量翻译
      if (urgentResults.length === subtitles.length) {
        console.log('[TwoPhaseTranslatorV4] 紧急翻译已覆盖全部字幕，跳过批量翻译');
        return urgentResults;
      }

      // 根据翻译服务类型选择分批策略
      let batches: Array<typeof batchSubtitles>;
      let strategyInfo = '';

      if (isMicrosoftService) {
        // 微软翻译：不使用智能分段，直接传递所有字幕，让内部5000字符优化器处理
        batches = [batchSubtitles];  // 所有字幕作为一个批次
        strategyInfo = '微软5000字符优化';
      } else {
        // 谷歌翻译等：使用智能分段（基于时间间隔，120条限制）
        const batchesWithMeta = this.segmenter.createSmartBatches(batchSubtitles);
        // 从批次元数据中提取字幕数组
        batches = batchesWithMeta.map(batch => batch.subtitles);
        strategyInfo = `智能分批${batches.length}个`;
      }

      const sourceLabel = this.getSourceLanguageLabel(
        serviceType,
        sourceLanguageName,
        normalizedSourceLanguageCode
      );
      const targetLabel = this.getTargetLanguageLabel(serviceType, preferences.targetLang);
      console.log(
        `[TwoPhaseTranslatorV4] → 批量翻译: ${subtitles.length}条 | ${strategyInfo} | ${sourceLabel} → ${targetLabel}`
      );

      // 根据翻译服务类型确定单批超时时间
      let perBatchTimeout = 5000; // 默认5秒
      if (serviceType === 'deepseek') {
        perBatchTimeout = 30000; // DeepSeek需要30秒
      } else if (serviceType === 'openai') {
        perBatchTimeout = 15000; // OpenAI单批15秒（适配GPT-5响应时间）
      } else if (serviceType === 'gemini') {
        perBatchTimeout = 15000; // Gemini单批15秒（批次大小200）
      } else if (serviceType === 'deepl') {
        perBatchTimeout = 10000; // DeepL单批10秒（REST API，批次大小50）
      } else if (serviceType === 'qwen') {
        perBatchTimeout = 10000; // Qwen单批10秒（批次大小30）
      } else if (serviceType === 'google-free' || serviceType === 'google') {
        perBatchTimeout = GOOGLE_TRANSLATE_BATCH_TIMEOUT_MS; // 谷歌免费翻译10秒
      } else if (serviceType === 'microsoft-free' || serviceType === 'microsoft') {
        perBatchTimeout = 5000; // 微软免费翻译5秒
      } else {
        perBatchTimeout = 10000; // 其他服务默认10秒
      }

      // 逐批翻译
      for (let i = 0; i < batches.length; i++) {
        // 检查主信号（用户取消）
        if (signal.aborted) {
          throw new DOMException(`批量翻译在批次 ${i + 1} 被取消`, 'AbortError');
        }

        const batch = batches[i];
        const texts = batch.map(sub => sub.text.replace(/\n/g, ' ').trim());

        try {
          // 为每个批次创建独立的超时信号（根据服务类型动态设置）
          let batchSignal: AbortSignal;

          try {
            // 尝试使用现代API（Chrome 103+）
            const timeoutSignal = AbortSignal.timeout(perBatchTimeout);
            // 组合主信号（用户取消）和批次超时信号
            batchSignal = AbortSignal.any([signal, timeoutSignal]);
          } catch (e) {
            // 降级方案：如果浏览器不支持AbortSignal.timeout或AbortSignal.any
            const batchController = new AbortController();

            // 监听主信号
            if (signal.aborted) {
              batchController.abort();
            } else {
              signal.addEventListener('abort', () => batchController.abort());
            }

            // 设置动态超时
            const timeoutId = setTimeout(() => {
              batchController.abort(new DOMException('批次翻译超时', 'TimeoutError'));
            }, perBatchTimeout);

            // 清理定时器
            batchController.signal.addEventListener('abort', () => clearTimeout(timeoutId));

            batchSignal = batchController.signal;
          }

          if (isMicrosoftService) {
            console.debug(`[debug][TwoPhaseTranslatorV4] 调用微软翻译处理 ${batch.length} 条字幕（内部将使用5000字符优化）`);
          } else {
            console.debug(`[debug][TwoPhaseTranslatorV4] 翻译批次 ${i + 1}/${batches.length}（${texts.length}条）`);
          }

          let translatedTexts: string[];
          if (isMicrosoftService) {
            translatedTexts = await this.translateWithMicrosoftSubtitles(
              batch,
              normalizedSourceLanguageCode,
              preferences.targetLang,
              'batch',
              batchSignal
            );
          } else {
            translatedTexts = await this.callTranslationAPI(
              texts,
              preferences.translationService,
              sourceLanguageName,
              normalizedSourceLanguageCode,
              preferences.targetLang,
              batchSignal,
              { stage: 'batch', batchIndex: i + 1, batchCount: batches.length }
            );
          }

          const translatedLines = translatedTexts || [];
          
          // 构建结果
          batch.forEach((sub, idx) => {
            const translatedText = translatedLines[idx] || sub.text;
            const originalIndex = subtitles.indexOf(sub);

            if (originalIndex !== -1) {
              results.push({
                index: originalIndex,
                originalText: texts[idx],  // 复用已处理的单行文本
                translatedText: translatedText,
                isUrgent: false
              });
            }
          });
          
          // 批次完成不单独打印，由最终汇总统一报告
          
          // 批次间延迟（避免API限流）
          if (i < batches.length - 1) {
            await this.delayWithSignal(TwoPhaseTranslatorV4.API_DELAY, signal);
          }
          
        } catch (batchError: any) {
          // 用户取消，保持原逻辑
          if (batchError.name === 'AbortError' && signal.aborted) {
            console.log(`[TwoPhaseTranslatorV4] 用户取消批量翻译（批次 ${i + 1}）`);
            throw batchError;
          }

          // 任何批次失败，抛出简化的错误消息（去掉批次号和超时时间）
          const errorMsg = batchError.name === 'TimeoutError' || batchError.message === '批次翻译超时'
            ? '翻译超时'
            : batchError.message || '翻译失败';

          // 批次失败改为debug（避免重复打印，真正的错误已在OpenAI/DeepSeek/Gemini层打印）
          console.debug(`[debug][TwoPhaseTranslatorV4] 批次 ${i + 1}/${batches.length} 失败: ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }

      // 汇总报告
      console.log(`[TwoPhaseTranslatorV4] ✓ 批量翻译完成: ${results.length} 条`);
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[TwoPhaseTranslatorV4] ✗ 批量翻译被取消');
      }
      // 删除重复的错误日志（已在批次层和最外层打印）
      throw error;
    }
    
    return results;
  }

  /**
   * 流水线并发批量翻译
   * 按固定间隔依次发送请求，但不等待返回，最后统一收集结果
   *
   * 适用场景：
   * - 非官方API端点（如Google免费翻译）
   * - 需要避免触发速率限制
   * - 仍希望提升性能
   *
   * @param subtitles 所有字幕
   * @param urgentResults 紧急翻译结果（用于去重）
   * @param sourceLanguageName 源语言名称（如"English"，供Chat类API与日志使用）
   * @param sourceLanguageCode 源语言代码（如"en"，供需要代码的API使用）
   * @param preferences 用户偏好设置
   * @param signal AbortSignal用于取消操作
   * @returns 批量翻译结果数组
   */
  private async translateBatchPipeline(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    urgentResults: Array<any>,
    sourceLanguageName: string,
    sourceLanguageCode: string,
    preferences: any,
    signal: AbortSignal
  ): Promise<Array<{
    index: number;
    originalText: string;
    translatedText: string;
    isUrgent: false;
  }>> {

    // 检查信号
    if (signal.aborted) {
      throw new DOMException('批量翻译开始前已取消', 'AbortError');
    }

    const results: any[] = [];
    const serviceType = preferences.translationService?.type;
    const normalizedSourceLanguageCode =
      sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';

    try {
      // 延迟启动（避免与紧急翻译冲突）
      await this.delayWithSignal(TwoPhaseTranslatorV4.BATCH_START_DELAY, signal);

      const batchSubtitles = subtitles;

      // 如果紧急翻译已覆盖全部字幕，跳过批量翻译
      if (urgentResults.length === subtitles.length) {
        console.log('[TwoPhaseTranslatorV4] 紧急翻译已覆盖全部字幕，跳过批量翻译');
        return urgentResults;
      }

      // 使用智能分段创建批次
      const batchesWithMeta = this.segmenter.createSmartBatches(batchSubtitles);
      const batches = batchesWithMeta.map(batch => batch.subtitles);

      // 获取配置
      const requestDelay = this.getRequestDelay();
      const perBatchTimeout = this.getBatchTimeout();

      const sourceLabel = this.getSourceLanguageLabel(
        serviceType,
        sourceLanguageName,
        normalizedSourceLanguageCode
      );
      const targetLabel = this.getTargetLanguageLabel(serviceType, preferences.targetLang);

      console.log(
        `[TwoPhaseTranslatorV4] → 批量翻译: ${subtitles.length}条 | 流水线并发 | ${batches.length}批次 | 间隔${requestDelay}ms | ${sourceLabel} → ${targetLabel}`
      );

      // 🔑 流水线发送阶段
      const promises: Promise<any>[] = [];
      let sendStartTime = Date.now();

      for (let i = 0; i < batches.length; i++) {
        // 检查主信号
        if (signal.aborted) {
          throw new DOMException(`批量翻译在批次 ${i + 1} 发送前被取消`, 'AbortError');
        }

        const batch = batches[i];
        const texts = batch.map(sub => sub.text.replace(/\n/g, ' ').trim());

        // 延迟发送（除第一个批次外）
        if (i > 0 && requestDelay > 0) {
          await this.delayWithSignal(requestDelay, signal);
        }

        // 创建批次超时信号
        let batchSignal: AbortSignal;
        try {
          const timeoutSignal = AbortSignal.timeout(perBatchTimeout);
          batchSignal = AbortSignal.any([signal, timeoutSignal]);
        } catch (e) {
          const batchController = new AbortController();
          if (signal.aborted) {
            batchController.abort();
          } else {
            signal.addEventListener('abort', () => batchController.abort());
          }
          const timeoutId = setTimeout(() => {
            batchController.abort(new DOMException('批次翻译超时', 'TimeoutError'));
          }, perBatchTimeout);
          batchController.signal.addEventListener('abort', () => clearTimeout(timeoutId));
          batchSignal = batchController.signal;
        }

        // 🔑 立即创建Promise（开始执行），不等待返回
        const batchPromise = (async () => {
          const sendTime = new Date().toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
          });

          try {
            const translatedTexts = await this.callTranslationAPI(
              texts,
              preferences.translationService,
              sourceLanguageName,
              normalizedSourceLanguageCode,
              preferences.targetLang,
              batchSignal,
              { stage: 'batch', batchIndex: i + 1, batchCount: batches.length }
            );

            const returnTime = new Date().toLocaleTimeString('zh-CN', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              fractionalSecondDigits: 3
            });

            return {
              success: true,
              batchIndex: i,
              batch,
              texts,
              translatedTexts,
              sendTime,
              returnTime
            };

          } catch (error: any) {
            const returnTime = new Date().toLocaleTimeString('zh-CN', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              fractionalSecondDigits: 3
            });

            return {
              success: false,
              batchIndex: i,
              error,
              sendTime,
              returnTime
            };
          }
        })();

        promises.push(batchPromise);

        console.debug(`[debug][TwoPhaseTranslatorV4] 📤 批次${i + 1}/${batches.length} 已发送`);
      }

      const sendEndTime = Date.now();
      const sendDuration = sendEndTime - sendStartTime;
      console.debug(`[debug][TwoPhaseTranslatorV4] ✓ 所有批次发送完成，耗时${sendDuration}ms`);

      // 🔑 Promise.all统一等待所有结果
      console.debug(`[debug][TwoPhaseTranslatorV4] ⏳ 等待所有批次返回...`);
      const batchResults = await Promise.all(promises);

      const totalDuration = Date.now() - sendStartTime;
      console.debug(`[debug][TwoPhaseTranslatorV4] ✓ 所有批次返回完成，总耗时${totalDuration}ms`);

      // 打印返回顺序分析
      console.debug(`[debug][TwoPhaseTranslatorV4] 📊 返回顺序分析:`);
      const sortedByReturnTime = [...batchResults].sort((a, b) =>
        a.returnTime.localeCompare(b.returnTime)
      );
      sortedByReturnTime.forEach((result, idx) => {
        const status = result.success ? '✅' : '❌';
        const delay = result.returnTime ?
          `(发送${result.sendTime} → 返回${result.returnTime})` : '';
        console.debug(`  ${idx + 1}. 批次${result.batchIndex + 1} ${status} ${delay}`);
      });

      // 处理结果（按逻辑顺序）
      for (const result of batchResults) {
        if (!result.success) {
          const errorMsg = result.error.name === 'TimeoutError' || result.error.message === '批次翻译超时'
            ? '翻译超时'
            : result.error.message || '翻译失败';

          console.debug(`[debug][TwoPhaseTranslatorV4] 批次 ${result.batchIndex + 1}/${batches.length} 失败: ${errorMsg}`);
          throw new Error(errorMsg);
        }

        // 构建结果
        if (result.success && result.batch && result.texts && result.translatedTexts) {
          result.batch.forEach((sub: any, idx: number) => {
            const translatedText = result.translatedTexts![idx] || sub.text;
            const originalIndex = subtitles.indexOf(sub);

            if (originalIndex !== -1) {
              results.push({
                index: originalIndex,
                originalText: result.texts![idx],
                translatedText: translatedText,
                isUrgent: false
              });
            }
          });
        }
      }

      // 汇总报告
      console.log(`[TwoPhaseTranslatorV4] ✓ 流水线并发翻译完成: ${results.length} 条 | 总耗时${totalDuration}ms`);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[TwoPhaseTranslatorV4] ✗ 批量翻译被取消');
      }
      throw error;
    }

    return results;
  }

  /**
   * 并发批量翻译（新逻辑）
   * 使用分组并发：将批次分成多轮，每轮内并发执行
   *
   * @param subtitles 所有字幕
   * @param urgentResults 紧急翻译结果（用于去重）
   * @param sourceLanguageName 源语言名称
   * @param sourceLanguageCode 源语言代码
   * @param preferences 用户偏好设置
   * @param signal AbortSignal用于取消操作
   * @returns 批量翻译结果数组
   */
  private async translateBatchConcurrent(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    urgentResults: Array<any>,
    sourceLanguageName: string,
    sourceLanguageCode: string,
    preferences: any,
    signal: AbortSignal
  ): Promise<Array<{
    index: number;
    originalText: string;
    translatedText: string;
    isUrgent: false;
  }>> {
    // 检查信号
    if (signal.aborted) {
      throw new DOMException('批量翻译开始前已取消', 'AbortError');
    }

    const results: any[] = [];
    const serviceType = preferences.translationService?.type;
    const normalizedSourceLanguageCode =
      sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';

    try {
      // 延迟启动（避免与紧急翻译冲突）
      await this.delayWithSignal(TwoPhaseTranslatorV4.BATCH_START_DELAY, signal);

      // 批量翻译应该翻译全部字幕
      const batchSubtitles = subtitles;

      // 如果紧急翻译已经覆盖全部字幕，可以跳过批量翻译
      if (urgentResults.length === subtitles.length) {
        console.log('[TwoPhaseTranslatorV4] 紧急翻译已覆盖全部字幕，跳过批量翻译');
        return urgentResults;
      }

      // 使用智能分段创建批次
      const batchesWithMeta = this.segmenter.createSmartBatches(batchSubtitles);
      const batches = batchesWithMeta.map(batch => batch.subtitles);

      // 获取并发限制
      const concurrency = this.getConcurrencyLimit();
      const perBatchTimeout = this.getBatchTimeout();

      const sourceLabel = this.getSourceLanguageLabel(
        serviceType,
        sourceLanguageName,
        normalizedSourceLanguageCode
      );
      const targetLabel = this.getTargetLanguageLabel(serviceType, preferences.targetLang);

      console.log(
        `[TwoPhaseTranslatorV4] → 批量翻译: ${subtitles.length}条 | 并发${concurrency} | ${batches.length}批次 | ${sourceLabel} → ${targetLabel}`
      );

      // 分组并发执行
      let globalIndex = 0;
      for (let i = 0; i < batches.length; i += concurrency) {
        // 检查主信号
        if (signal.aborted) {
          throw new DOMException(`批量翻译在第${Math.floor(i / concurrency) + 1}轮被取消`, 'AbortError');
        }

        // 当前轮的批次
        const chunk = batches.slice(i, i + concurrency);
        const roundNum = Math.floor(i / concurrency) + 1;
        const totalRounds = Math.ceil(batches.length / concurrency);

        console.debug(`[debug][TwoPhaseTranslatorV4] 🚀 第${roundNum}/${totalRounds}轮并发开始（${chunk.length}个批次）`);

        // 创建并发Promise数组
        const chunkPromises = chunk.map(async (batch, chunkIndex) => {
          const batchIndex = globalIndex + chunkIndex;
          const texts = batch.map(sub => sub.text.replace(/\n/g, ' ').trim());

          try {
            // 为每个批次创建独立的超时信号
            let batchSignal: AbortSignal;

            try {
              // 尝试使用现代API（Chrome 103+）
              const timeoutSignal = AbortSignal.timeout(perBatchTimeout);
              batchSignal = AbortSignal.any([signal, timeoutSignal]);
            } catch (e) {
              // 降级方案
              const batchController = new AbortController();

              if (signal.aborted) {
                batchController.abort();
              } else {
                signal.addEventListener('abort', () => batchController.abort());
              }

              const timeoutId = setTimeout(() => {
                batchController.abort(new DOMException('批次翻译超时', 'TimeoutError'));
              }, perBatchTimeout);

              batchController.signal.addEventListener('abort', () => clearTimeout(timeoutId));
              batchSignal = batchController.signal;
            }

            const translatedTexts = await this.callTranslationAPI(
              texts,
              preferences.translationService,
              sourceLanguageName,
              normalizedSourceLanguageCode,
              preferences.targetLang,
              batchSignal,
              { stage: 'batch', batchIndex: batchIndex + 1, batchCount: batches.length }
            );

            const returnTime = new Date().toLocaleTimeString('zh-CN', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              fractionalSecondDigits: 3
            });

            return {
              success: true,
              batchIndex,
              batch,
              texts,
              translatedTexts,
              returnTime
            };

          } catch (error: any) {
            const returnTime = new Date().toLocaleTimeString('zh-CN', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              fractionalSecondDigits: 3
            });

            return {
              success: false,
              batchIndex,
              error,
              returnTime
            };
          }
        });

        // Promise.all 保证顺序
        const chunkResults = await Promise.all(chunkPromises);

        // 打印实际返回顺序（按时间排序）
        const sortedByTime = [...chunkResults].sort((a, b) =>
          a.returnTime.localeCompare(b.returnTime)
        );

        console.debug(`[debug][TwoPhaseTranslatorV4] 📊 第${roundNum}轮实际返回顺序（按时间）:`);
        sortedByTime.forEach((result, idx) => {
          const status = result.success ? '✅' : '❌';
          console.debug(`  ${idx + 1}. [${result.returnTime}] 批次${result.batchIndex + 1} ${status}`);
        });

        // 处理结果（按逻辑顺序）
        for (const result of chunkResults) {
          if (!result.success) {
            // 任何批次失败，直接抛出错误
            const errorMsg = result.error.name === 'TimeoutError' || result.error.message === '批次翻译超时'
              ? '翻译超时'
              : result.error.message || '翻译失败';

            console.debug(`[debug][TwoPhaseTranslatorV4] 批次 ${result.batchIndex + 1}/${batches.length} 失败: ${errorMsg}`);
            throw new Error(errorMsg);
          }

          // 构建结果（TypeScript类型守卫：确保success=true时这些字段存在）
          if (result.success && result.batch && result.texts && result.translatedTexts) {
            result.batch.forEach((sub: any, idx: number) => {
              const translatedText = result.translatedTexts![idx] || sub.text;
              const originalIndex = subtitles.indexOf(sub);

              if (originalIndex !== -1) {
                results.push({
                  index: originalIndex,
                  originalText: result.texts![idx],
                  translatedText: translatedText,
                  isUrgent: false
                });
              }
            });
          }
        }

        globalIndex += chunk.length;

        // 批次间延迟（避免API限流）
        if (i + concurrency < batches.length) {
          await this.delayWithSignal(TwoPhaseTranslatorV4.API_DELAY, signal);
        }
      }

      // 汇总报告
      console.log(`[TwoPhaseTranslatorV4] ✓ 并发批量翻译完成: ${results.length} 条`);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[TwoPhaseTranslatorV4] ✗ 批量翻译被取消');
      }
      throw error;
    }

    return results;
  }

  private async translateWithMicrosoftSubtitles(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    sourceLanguageCode: string,
    targetLang: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    if (subtitles.length === 0) {
      return [];
    }

    // 🚀 使用新的5000字符窗口优化器
    if (TwoPhaseTranslatorV4.USE_MICROSOFT_OPTIMIZER) {
      console.log(`[TwoPhaseTranslatorV4] 🚀 使用5000字符窗口优化器 (${stage}阶段，${subtitles.length}条字幕)`);

      try {
        // 步骤1：优化批次
        const optimizedBatches = this.microsoftOptimizer.optimizeBatches(subtitles);

        // 记录优化效果
        const originalRequests = Math.ceil(subtitles.length / 10);
        const optimizedRequests = optimizedBatches.length;
        const reduction = Math.round(((originalRequests - optimizedRequests) / originalRequests) * 100);
        console.debug(
          `[debug][TwoPhaseTranslatorV4] 优化效果: ${originalRequests}个请求 → ${optimizedRequests}个请求 (减少${reduction}%)`
        );

        // 收集所有翻译结果
        const allTranslatedTexts: string[] = [];
        const allIndexMappings: number[][] = [];

        // 步骤2：处理所有批次
        for (let batchIndex = 0; batchIndex < optimizedBatches.length; batchIndex++) {
          const batch = optimizedBatches[batchIndex];

          // 检查中断信号
          if (signal.aborted) {
            throw new DOMException('微软翻译已取消', 'AbortError');
          }

          console.debug(
            `[debug][TwoPhaseTranslatorV4] 处理批次 ${batchIndex + 1}/${optimizedBatches.length}: ` +
            `${batch.texts.length}个Text对象`
          );

          // 调用优化版翻译方法
          const translatedTexts = await this.microsoftTranslator.translateOptimized(
            batch.texts,
            sourceLanguageCode,
            targetLang,
            stage
          );

          // 收集结果
          allTranslatedTexts.push(...translatedTexts);
          allIndexMappings.push(...batch.indexMapping);

          // 批次间延迟（批量阶段）
          if (stage === 'batch' && batchIndex < optimizedBatches.length - 1) {
            await this.delayWithSignal(TwoPhaseTranslatorV4.API_DELAY, signal);
          }
        }

        // 步骤3：映射回原始字幕
        const mappedResults = this.microsoftOptimizer.mapResults(
          allTranslatedTexts,
          allIndexMappings,
          subtitles.length
        );

        console.log(
          `[TwoPhaseTranslatorV4] ✅ 优化翻译完成: ${mappedResults.filter(r => r !== '').length}/${subtitles.length}条成功`
        );

        return mappedResults;

      } catch (error) {
        console.error('[TwoPhaseTranslatorV4] ❌ 优化翻译失败，回退到旧逻辑:', error);
        // 如果优化版失败，回退到旧逻辑
        return this.translateWithMicrosoftSubtitlesLegacy(
          subtitles,
          sourceLanguageCode,
          targetLang,
          stage,
          signal
        );
      }
    }

    // 使用旧逻辑
    console.log(`[TwoPhaseTranslatorV4] 使用传统微软翻译逻辑`);
    return this.translateWithMicrosoftSubtitlesLegacy(
      subtitles,
      sourceLanguageCode,
      targetLang,
      stage,
      signal
    );
  }

  // 保留旧的实现作为后备
  private async translateWithMicrosoftSubtitlesLegacy(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    sourceLanguageCode: string,
    targetLang: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    const entries: MicrosoftSubtitleEntry[] = subtitles.map((sub, idx) => ({
      ...sub,
      rawText: sub.text ?? '',
      text: (sub.text ?? '').replace(/\n/g, ' ').trim(),
      __msIndex: idx
    }));

    if (entries.length === 0) {
      return [];
    }

    const aggregates = this.buildMicrosoftAggregates(entries);
    const requests = this.buildMicrosoftRequests(aggregates);
    const bucket = new Map<number, string[]>();

    for (let i = 0; i < requests.length; i++) {
      if (signal.aborted) {
        throw new DOMException('微软翻译已取消', 'AbortError');
      }

      const requestItems = requests[i];
      const textsForRequest = requestItems.map(item => item.text);
      const translations = await this.microsoftTranslator.translateTexts(
        textsForRequest,
        sourceLanguageCode,
        targetLang,
        stage
      );

      requestItems.forEach((item, idx) => {
        this.assignMicrosoftTranslation(item, translations[idx] ?? item.text, bucket);
      });

      if (stage === 'batch' && i < requests.length - 1) {
        await this.delayWithSignal(TwoPhaseTranslatorV4.API_DELAY, signal);
      }
    }

    return entries.map((entry, idx) => {
      const segments = bucket.get(idx);
      if (segments && segments.length > 0) {
        return segments.join('');
      }
      return entry.rawText || entry.text;
    });
  }

  private buildMicrosoftAggregates(subtitles: MicrosoftSubtitleEntry[]): MicrosoftAggregate[] {
    const aggregates: MicrosoftAggregate[] = [];
    let cursor = 0;

    while (cursor < subtitles.length) {
      const windowEnd = this.findMicrosoftWindowEnd(subtitles, cursor);
      const windowSubs = subtitles.slice(cursor, windowEnd);
      const smartBatches = this.segmenter.createSmartBatches(windowSubs);

      for (const batchMeta of smartBatches) {
        const group = batchMeta.subtitles as MicrosoftSubtitleEntry[];
        if (!group || group.length === 0) {
          continue;
        }

        const groupAggregates = this.aggregateMicrosoftGroup(group);
        aggregates.push(...groupAggregates);
      }

      cursor = windowEnd;
    }

    return aggregates;
  }

  private findMicrosoftWindowEnd(subtitles: MicrosoftSubtitleEntry[], start: number): number {
    let end = start;
    let length = 0;

    while (end < subtitles.length) {
      const normalized = subtitles[end].text;
      const candidateLength = normalized.length;

      if (candidateLength > TwoPhaseTranslatorV4.MS_MAX_CHARS) {
        return end + 1;
      }

      const nextLength = length === 0 ? candidateLength : length + 1 + candidateLength;
      if (nextLength > TwoPhaseTranslatorV4.MS_MAX_CHARS) {
        break;
      }

      length = nextLength;
      end++;
    }

    if (end === start) {
      return start + 1;
    }

    return end;
  }

  private aggregateMicrosoftGroup(group: MicrosoftSubtitleEntry[]): MicrosoftAggregate[] {
    const aggregates: MicrosoftAggregate[] = [];
    let currentText = '';
    let currentIndices: number[] = [];

    const flush = () => {
      if (currentIndices.length === 0) {
        return;
      }
      aggregates.push({
        text: currentText,
        indices: [...currentIndices]
      });
      currentText = '';
      currentIndices = [];
    };

    for (const subtitle of group) {
      const normalized = subtitle.text;
      const index = subtitle.__msIndex;

      if (normalized.length > TwoPhaseTranslatorV4.MS_MAX_CHARS) {
        flush();
        const chunks = this.chunkMicrosoftText(normalized, TwoPhaseTranslatorV4.MS_MAX_CHARS);
        chunks.forEach(chunk => {
          aggregates.push({
            text: chunk,
            indices: [index]
          });
        });
        continue;
      }

      const nextLength = currentText.length === 0
        ? normalized.length
        : currentText.length + 1 + normalized.length;

      if (nextLength > TwoPhaseTranslatorV4.MS_MAX_CHARS) {
        flush();
      }

      if (currentText.length === 0) {
        currentText = normalized;
      } else {
        currentText += '\n' + normalized;
      }
      currentIndices.push(index);
    }

    flush();
    return aggregates;
  }

  private chunkMicrosoftText(text: string, limit: number): string[] {
    if (text.length <= limit) {
      return [text];
    }

    const chunks: string[] = [];
    let startPtr = 0;

    while (startPtr < text.length) {
      let endPtr = Math.min(startPtr + limit, text.length);
      if (endPtr < text.length) {
        let adjusted = -1;
        for (let look = endPtr - 1; look >= startPtr; look--) {
          const ch = text[look];
          if ('\n。.!?！？；;,， '.includes(ch)) {
            if (look > startPtr) {
              adjusted = look + 1;
              break;
            }
          }
        }
        if (adjusted > startPtr) {
          endPtr = adjusted;
        }
      }

      if (endPtr <= startPtr) {
        endPtr = Math.min(startPtr + limit, text.length);
      }

      chunks.push(text.slice(startPtr, endPtr));
      startPtr = endPtr;
    }

    return chunks;
  }

  private buildMicrosoftRequests(aggregates: MicrosoftAggregate[]): MicrosoftAggregate[][] {
    const requests: MicrosoftAggregate[][] = [];
    let current: MicrosoftAggregate[] = [];
    let charCount = 0;

    for (const item of aggregates) {
      const length = item.text.length;

      if (
        current.length > 0 &&
        (current.length >= TwoPhaseTranslatorV4.MS_MAX_ITEMS || charCount + length > TwoPhaseTranslatorV4.MS_MAX_TOTAL_CHARS)
      ) {
        requests.push(current);
        current = [];
        charCount = 0;
      }

      current.push(item);
      charCount += length;
    }

    if (current.length > 0) {
      requests.push(current);
    }

    return requests;
  }

  private assignMicrosoftTranslation(
    aggregate: MicrosoftAggregate,
    translation: string,
    bucket: Map<number, string[]>
  ): void {
    if (aggregate.indices.length === 1) {
      this.appendMicrosoftPiece(aggregate.indices[0], translation, bucket);
      return;
    }

    const parts = translation.split(/\r?\n/);
    if (parts.length === aggregate.indices.length) {
      aggregate.indices.forEach((index, idx) => {
        this.appendMicrosoftPiece(index, parts[idx], bucket);
      });
      return;
    }

    const distributed = this.distributeMicrosoftFallback(translation, aggregate.indices.length);
    aggregate.indices.forEach((index, idx) => {
      this.appendMicrosoftPiece(index, distributed[idx], bucket);
    });
  }

  private appendMicrosoftPiece(index: number, piece: string, bucket: Map<number, string[]>): void {
    const list = bucket.get(index) || [];
    list.push(piece);
    bucket.set(index, list);
  }

  private distributeMicrosoftFallback(text: string, count: number): string[] {
    if (count <= 1) {
      return [text];
    }

    const avgLength = Math.ceil(text.length / count);
    const result: string[] = [];
    let offset = 0;

    for (let i = 0; i < count; i++) {
      if (offset >= text.length) {
        result.push('');
        continue;
      }

      if (i === count - 1) {
        result.push(text.slice(offset));
      } else {
        result.push(text.slice(offset, offset + avgLength));
      }

      offset += avgLength;
    }

    return result;
  }

  /**
   * 调用翻译API
   */
  private async callTranslationAPI(
    texts: string[],
    service: any,
    sourceLanguageName: string,
    sourceLanguageCode: string,
    targetLang: string,
    signal: AbortSignal,
    options?: { stage: 'urgent' | 'batch'; batchIndex?: number; batchCount?: number }
  ): Promise<string[]> {
    // 检查是否配置了翻译服务
    if (!service || !service.type) {
      console.warn('[TwoPhaseTranslatorV4] 未配置翻译服务，使用原文');
      return texts;
    }
    
    return new Promise(async (resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('翻译API调用前已取消', 'AbortError'));
        return;
      }
      
      // 监听取消
      const abortHandler = () => {
        reject(new DOMException('翻译API调用被取消', 'AbortError'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      
      try {
        let translatedTexts: string[] = [];

        // 根据翻译服务类型调用不同的API
        const normalizedSourceLanguageCode =
          sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';

        if (service.type === 'openai') {
          // 使用OpenAI翻译（V4架构）
          if (!service.apiKey) {
            throw new Error('OpenAI API密钥未配置');
          }

          const translator = new OpenAITranslator(
            service.apiKey,
            service.model || 'gpt-5-mini',
            service.temperature ?? 1,
            false  // 切换回旧版编号方案
          );

          const stage = options?.stage ?? 'batch';

          // 调用翻译（传递stage、批次信息和signal）
          translatedTexts = await translator.translate(
            texts,
            sourceLanguageName,
            targetLang,
            stage,
            signal,
            {
              batchIndex: options?.batchIndex,
              batchCount: options?.batchCount
            }
          );

        } else if (service.type === 'deepseek') {
          // 使用 DeepSeek 翻译
          if (!service.apiKey) {
            throw new Error('DeepSeek API密钥未配置');
          }

          const translator = new DeepSeekTranslator(service.apiKey);
          const stage = options?.stage ?? 'batch';

          // 调用翻译（传递 signal）
          translatedTexts = await translator.translate(
            texts,
            sourceLanguageName,
            targetLang,
            stage,
            signal
          );

        } else if (service.type === 'gemini') {
          // 使用 Gemini 翻译（Phase 1: 手动tier选择）
          if (!service.apiKey) {
            throw new Error('Gemini API密钥未配置');
          }

          const translator = new GeminiTranslator(
            service.apiKey,
            service.model || 'gemini-2.5-flash-lite',
            service.temperature ?? 0,
            service.maxTokens || 65536,
            service.batchDelay || 6000  // Phase 1: 从配置读取延迟
          );

          const stage = options?.stage ?? 'batch';

          // 调用翻译（传递 stage 和 signal）
          translatedTexts = await translator.translate(
            texts,
            sourceLanguageName,
            targetLang,
            stage,
            signal
          );

        } else if (service.type === 'deepl') {
          // 使用 DeepL 翻译
          if (!service.apiKey) {
            throw new Error('DeepL API密钥未配置');
          }

          const translator = new DeepLTranslator(
            service.apiKey,
            service.tier || 'free',
            service.formality || 'default',
            service.splitSentences ?? "0",
            service.preserveFormatting ?? false,
            service.model || 'latency_optimized',
            service.showBilledCharacters ?? true
          );

          const stage = options?.stage ?? 'batch';

          // 调用翻译（传递 stage 和 signal）
          translatedTexts = await translator.translate(
            texts,
            normalizedSourceLanguageCode,
            targetLang,
            stage,
            signal
          );

        } else if (service.type === 'qwen') {
          // 使用 Qwen-MT 翻译
          if (!service.apiKey) {
            throw new Error('Qwen API密钥未配置');
          }

          const translator = new QwenTranslator(
            service.apiKey,
            'beijing'  // 默认北京端点
          );

          const stage = options?.stage ?? 'batch';

          // 调用翻译（传递 stage 和 signal）
          translatedTexts = await translator.translate(
            texts,
            sourceLanguageName,
            targetLang,
            stage,
            signal
          );

        } else if (service.type === 'google' || service.type === 'google-free') {
          const stage = options?.stage ?? 'batch';
          const order = this.getGoogleEndpointOrder(stage);
          const allowFallback = stage !== 'batch';
          console.log(
            `[TwoPhaseTranslatorV4] Google翻译调用 stage=${stage} ${normalizedSourceLanguageCode} → ${targetLang} | 文本数=${texts.length}`
          );
          const { translations } = await this.translateWithGoogleEndpoints(
            texts,
            normalizedSourceLanguageCode,
            targetLang,
            {
              preferredOrder: order,
              recordStatistics: stage === 'urgent',
              allowFallback,
              stage
            }
          );
          translatedTexts = translations;
        } else if (service.type === 'microsoft' || service.type === 'microsoft-free') {
          console.warn('[TwoPhaseTranslatorV4] Microsoft翻译需要字幕上下文，返回原文');
          translatedTexts = texts;
          
        } else {
          // 未知服务类型，返回原文
          console.warn(`[TwoPhaseTranslatorV4] 未知的翻译服务类型: ${service.type}`);
          translatedTexts = texts;
        }
        
        signal.removeEventListener('abort', abortHandler);
        resolve(translatedTexts);

      } catch (error) {
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      }
    });
  }

  /**
   * 使用Google免费翻译，带端点自动切换
   */
  private async translateWithGoogleEndpoints(
    texts: string[],
    sourceLanguageCode: string,
    targetLang: string,
    options?: {
      preferredOrder?: GoogleEndpointId[];
      recordStatistics?: boolean;
      allowFallback?: boolean;
      stage?: 'urgent' | 'batch';
    }
  ): Promise<{ translations: string[]; endpoint: GoogleEndpointId }> {
    if (texts.length === 0) {
      return { translations: [], endpoint: 'single' };
    }

    const combinedText = texts.join('\n');
    const normalizedSourceLanguageCode =
      sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';
    const baseParams: Record<string, string> = {
      client: 'gtx',
      sl: normalizedSourceLanguageCode === 'auto' ? 'auto' : normalizedSourceLanguageCode,
      tl: targetLang,
      dt: 't',
      q: combinedText
    };
    const stage = options?.stage ?? 'batch';

    type Endpoint = {
      id: GoogleEndpointId;
      url: string;
      parse: (data: any) => string;
    };

    const endpointMap: Record<GoogleEndpointId, Endpoint> = {
      single: {
        id: 'single',
        url: 'https://translate.googleapis.com/translate_a/single',
        parse: (data: any) => {
          if (!Array.isArray(data) || !Array.isArray(data[0])) {
            throw new Error('unexpected response structure from /translate_a/single');
          }
          return data[0]
            .map((item: any) => (Array.isArray(item) && typeof item[0] === 'string' ? item[0] : ''))
            .join('');
        }
      },
      t: {
        id: 't',
        url: 'https://translate.googleapis.com/translate_a/t',
        parse: (data: any) => {
          if (!Array.isArray(data)) {
            throw new Error('unexpected response structure from /translate_a/t');
          }

          if (typeof data[0] === 'string') {
            return (data as string[]).join('');
          }

          if (Array.isArray(data[0])) {
            return (data as any[])
              .map((item) => (Array.isArray(item) && item.length > 0 ? String(item[0]) : ''))
              .join('');
          }

          throw new Error('unsupported translate_a/t payload shape');
        }
      }
    };

    const defaultOrder: GoogleEndpointId[] = ['single', 't'];
    const requestedOrder = options?.preferredOrder ?? defaultOrder;
    const allowFallback = options?.allowFallback !== false;
    const order = allowFallback
      ? Array.from(new Set([...requestedOrder, ...defaultOrder]))
      : requestedOrder;

    const errors: string[] = [];

    for (const id of order) {
      const endpoint = endpointMap[id];
      if (!endpoint) {
        continue;
      }

      try {
        const params = new URLSearchParams(baseParams);
        const response = await fetch(`${endpoint.url}?${params.toString()}`, {
          method: 'GET'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        const combinedTranslation = endpoint.parse(json);
        const normalized = this.normalizeGoogleTranslations(combinedTranslation, texts);

        if (normalized.length !== texts.length) {
          throw new Error(
            `normalized translation count mismatch (${normalized.length} vs ${texts.length})`
          );
        }

        console.debug(
          `[debug][TwoPhaseTranslatorV4] Google端点=${endpoint.id} 成功 stage=${stage} ${normalizedSourceLanguageCode} → ${targetLang} (${normalized.length}条)`
        );

        if (options?.recordStatistics) {
          this.preferredGoogleEndpoint = endpoint.id;
          this.failedGoogleEndpoints.delete(endpoint.id);
        }

        return { translations: normalized, endpoint: endpoint.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.debug(
          `[debug][TwoPhaseTranslatorV4] Google端点=${endpoint.id} 失败 stage=${stage} ${normalizedSourceLanguageCode} → ${targetLang}: ${message}`
        );
        errors.push(`${endpoint.id}: ${message}`);

        if (options?.recordStatistics) {
          this.failedGoogleEndpoints.add(endpoint.id);
        }
      }
    }

    throw new Error(`所有Google免费翻译端点调用失败: ${errors.join(' | ')}`);
  }

  /**
   * 规范化Google翻译结果，确保与原始文本数量匹配
   */
  private normalizeGoogleTranslations(combined: string, originalTexts: string[]): string[] {
    let translatedTexts = combined.split('\n').map((segment) => segment.trim());

    if (translatedTexts.length === originalTexts.length) {
      return translatedTexts;
    }

    if (translatedTexts.length === 1 && originalTexts.length > 1) {
      return this.splitByRatioForGoogle(combined, originalTexts);
    }

    if (translatedTexts.length > originalTexts.length && originalTexts.length > 0) {
      while (translatedTexts.length > originalTexts.length) {
        const extra = translatedTexts.pop();
        if (extra === undefined) {
          break;
        }
        const lastIndex = translatedTexts.length - 1;
        if (lastIndex >= 0) {
          translatedTexts[lastIndex] = `${translatedTexts[lastIndex]} ${extra}`.trim();
        }
      }
      if (translatedTexts.length === originalTexts.length) {
        return translatedTexts;
      }
    }

    while (translatedTexts.length < originalTexts.length) {
      const fallbackIndex = translatedTexts.length;
      translatedTexts.push(originalTexts[fallbackIndex]);
    }

    return translatedTexts.slice(0, originalTexts.length);
  }

  private getGoogleEndpointOrder(stage: 'urgent' | 'batch'): GoogleEndpointId[] {
    const defaultOrder: GoogleEndpointId[] = ['single', 't'];

    if (stage === 'batch') {
      if (!this.preferredGoogleEndpoint) {
        throw new Error('紧急翻译未成功，跳过批量翻译');
      }
      return [this.preferredGoogleEndpoint];
    }

    if (this.preferredGoogleEndpoint) {
      const remaining = defaultOrder.filter((id) => id !== this.preferredGoogleEndpoint);
      return [this.preferredGoogleEndpoint, ...remaining];
    }

    return defaultOrder;
  }

  /**
   * 当Google返回未按行拆分时，按原文比例切分
   */
  private splitByRatioForGoogle(combined: string, originalTexts: string[]): string[] {
    if (originalTexts.length === 0) {
      return [];
    }

    const processedOriginals = originalTexts.map((text) =>
      text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    );
    const originalLengths = processedOriginals.map((text) => (text.length > 0 ? text.length : 1));
    const totalOriginalLength = originalLengths.reduce((sum, len) => sum + len, 0);
    const segments: string[] = [];
    let currentPosition = 0;

    for (let i = 0; i < originalLengths.length; i++) {
      if (i === originalLengths.length - 1) {
        segments.push(combined.substring(currentPosition).trim() || originalTexts[i]);
        break;
      }

      const ratio = totalOriginalLength === 0 ? 1 / originalLengths.length : originalLengths[i] / totalOriginalLength;
      const estimatedLength = Math.max(1, Math.round(combined.length * ratio));
      let endPosition = currentPosition + estimatedLength;

      const searchEnd = Math.min(endPosition + 20, combined.length);
      for (let j = endPosition; j < searchEnd; j++) {
        if ('。！？，；,.!?,;'.includes(combined[j])) {
          endPosition = j + 1;
          break;
        }
      }

      const segment = combined.substring(currentPosition, Math.min(endPosition, combined.length)).trim();
      segments.push(segment || originalTexts[i]);
      currentPosition = Math.min(endPosition, combined.length);
    }

    return segments;
  }

  private getSourceLanguageLabel(
    serviceType: string | undefined,
    sourceLanguageName: string,
    sourceLanguageCode: string
  ): string {
    const normalizedCode =
      sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';

    switch (serviceType) {
      case 'google':
      case 'google-free':
      case 'microsoft':
      case 'microsoft-free':
      case 'deepl':
        return normalizedCode;
      default:
        return sourceLanguageName;
    }
  }

  private getTargetLanguageLabel(
    serviceType: string | undefined,
    targetLanguageCode: string
  ): string {
    switch (serviceType) {
      case 'openai':
      case 'deepseek':
      case 'gemini':
      case 'qwen':
        return LanguageCodeMapper.toEnglishName(targetLanguageCode);
      default:
        return targetLanguageCode;
    }
  }

  /**
   * 带信号的延迟
   */
  private delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('延迟开始前已取消', 'AbortError'));
        return;
      }
      
      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
        resolve();
      }, ms);
      
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new DOMException('延迟被取消', 'AbortError'));
      };
      
      signal.addEventListener('abort', abortHandler, { once: true });
    });
  }
  
  /**
   * 重置翻译器状态
   */
  public reset(): void {
    this.isComplete = false;
    this.currentExecutionId++;
    this.preferredGoogleEndpoint = null;
    this.failedGoogleEndpoints.clear();
  }
}
