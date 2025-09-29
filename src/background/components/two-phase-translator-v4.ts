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
  private static readonly API_DELAY = 200;  // API调用间隔
  private static readonly URGENT_RESPONSE_TIME = 300;  // 紧急响应时间目标
  private static readonly BATCH_START_DELAY = 200;  // 批量翻译启动延迟（200ms）
  private static readonly TIMEOUT_MS = 5000;  // 统一超时时间
  private static readonly MS_MAX_ITEMS = 10;  // 微软每次请求最大字幕条数
  private static readonly MS_MAX_CHARS = 5000;  // 微软单个文本最大字符数
  private static readonly MS_MAX_TOTAL_CHARS = 50000;  // 微软单次请求字符总量限制

  // 🚀 调试开关：启用微软5000字符窗口优化
  private static readonly USE_MICROSOFT_OPTIMIZER = true;  // 设为true启用新优化器
  
  private translationService: any = null;  // 翻译服务配置
  
  private segmenter: IntelligentSegmenter;
  private microsoftTranslator: MicrosoftTranslator;
  private microsoftOptimizer: MicrosoftTextOptimizer;  // 新增：5000字符优化器
  private isComplete: boolean = false;
  private currentExecutionId: number = 0;
  private preferredGoogleEndpoint: GoogleEndpointId | null = null;
  private failedGoogleEndpoints = new Set<GoogleEndpointId>();

  constructor() {
    this.segmenter = new IntelligentSegmenter();
    this.microsoftTranslator = new MicrosoftTranslator();
    this.microsoftOptimizer = new MicrosoftTextOptimizer();  // 新增：初始化优化器
  }
  
  /**
   * 设置翻译服务配置
   */
  public setTranslationService(service: any): void {
    this.translationService = service;
  }
  
  /**
   * 执行紧急翻译（支持取消）
   * 
   * @param subtitles 所有字幕
   * @param currentTime 当前播放时间（秒）
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
      
      console.log(`[TwoPhaseTranslatorV4] 紧急翻译 ${urgentBatch.length} 条字幕`);

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
          'auto',
          preferences.targetLang,
          'urgent',
          signal
        );
      } else {
        translatedTexts = await this.callTranslationAPI(
          texts,
          preferences.translationService,
          'auto',
          preferences.targetLang,
          signal,
          { stage: 'urgent' }
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
            originalText: sub.text,
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
   * 执行批量翻译（支持取消）
   * 
   * @param subtitles 所有字幕
   * @param urgentResults 紧急翻译结果（用于去重）
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

    try {
      // 延迟启动（避免与紧急翻译冲突）
      await this.delayWithSignal(TwoPhaseTranslatorV4.BATCH_START_DELAY, signal);
      
      if ((preferences.translationService?.type === 'google' || preferences.translationService?.type === 'google-free') && !this.preferredGoogleEndpoint) {
        throw new Error('紧急翻译未确定可用的Google端点，跳过批量翻译');
      }

      console.log(`[TwoPhaseTranslatorV4] → 开始批量翻译 ${subtitles.length} 条字幕`);

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

      if (isMicrosoftService) {
        // 微软翻译：不使用智能分段，直接传递所有字幕，让内部5000字符优化器处理
        console.log(`[TwoPhaseTranslatorV4] → 微软翻译：使用5000字符优化，不预先分批`);
        batches = [batchSubtitles];  // 所有字幕作为一个批次
      } else {
        // 谷歌翻译等：使用智能分段（基于时间间隔，120条限制）
        const batchesWithMeta = this.segmenter.createSmartBatches(batchSubtitles);
        // 从批次元数据中提取字幕数组
        batches = batchesWithMeta.map(batch => batch.subtitles);
        console.log(`[TwoPhaseTranslatorV4] → 谷歌翻译：分成 ${batches.length} 个批次`);
      }
      
      // 批次失败计数
      let failedBatches = 0;
      
      // 逐批翻译
      for (let i = 0; i < batches.length; i++) {
        // 检查主信号（用户取消）
        if (signal.aborted) {
          throw new DOMException(`批量翻译在批次 ${i + 1} 被取消`, 'AbortError');
        }

        const batch = batches[i];
        const texts = batch.map(sub => sub.text.replace(/\n/g, ' ').trim());

        try {
          // 为每个批次创建独立的5秒超时信号
          let batchSignal: AbortSignal;

          try {
            // 尝试使用现代API（Chrome 103+）
            const timeoutSignal = AbortSignal.timeout(5000);
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

            // 设置5秒超时
            const timeoutId = setTimeout(() => {
              batchController.abort(new DOMException('批次翻译超时', 'TimeoutError'));
            }, 5000);

            // 清理定时器
            batchController.signal.addEventListener('abort', () => clearTimeout(timeoutId));

            batchSignal = batchController.signal;
          }

          if (isMicrosoftService) {
            console.log(`[TwoPhaseTranslatorV4] 调用微软翻译处理 ${batch.length} 条字幕（内部将使用5000字符优化）`);
          } else {
            console.log(`[TwoPhaseTranslatorV4] 翻译批次 ${i + 1}/${batches.length}（${texts.length}条）`);
          }

          let translatedTexts: string[];
          if (isMicrosoftService) {
            translatedTexts = await this.translateWithMicrosoftSubtitles(
              batch,
              'auto',
              preferences.targetLang,
              'batch',
              batchSignal
            );
          } else {
            translatedTexts = await this.callTranslationAPI(
              texts,
              preferences.translationService,
              'auto',
              preferences.targetLang,
              batchSignal,
              { stage: 'batch' }
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
                originalText: sub.text,
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
          // 区分错误类型
          if (batchError.name === 'AbortError' && signal.aborted) {
            // 用户主动取消，终止整个批量翻译
            console.log(`[TwoPhaseTranslatorV4] 用户取消批量翻译（批次 ${i + 1}）`);
            throw batchError;
          }

          // 批次超时或其他错误，记录但继续下一批
          if (batchError.name === 'TimeoutError' || batchError.message === '批次翻译超时') {
            console.warn(`[TwoPhaseTranslatorV4] 批次 ${i + 1}/${batches.length} 超时（5秒），使用原文`);
          } else {
            console.error(`[TwoPhaseTranslatorV4] 批次 ${i + 1}/${batches.length} 失败:`, batchError.message);
          }

          // 批次失败计数
          failedBatches++;

          // 失败批次使用原文
          batch.forEach(sub => {
            const originalIndex = subtitles.indexOf(sub);
            if (originalIndex !== -1) {
              results.push({
                index: originalIndex,
                originalText: sub.text,
                translatedText: sub.text,  // 使用原文
                isUrgent: false
              });
            }
          });
        }
      }
      
      // 汇总报告
      if (failedBatches > 0) {
        console.log(`[TwoPhaseTranslatorV4] ✓ 批量翻译完成: ${results.length} 条 (有 ${failedBatches}/${batches.length} 个批次失败)`);
      } else {
        console.log(`[TwoPhaseTranslatorV4] ✓ 批量翻译完成: ${results.length} 条`);
      }
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[TwoPhaseTranslatorV4] ✗ 批量翻译被取消');
      } else {
        console.error('[TwoPhaseTranslatorV4] ✗ 批量翻译失败:', error);
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
    sourceLang: string,
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
        console.log(
          `[TwoPhaseTranslatorV4] 优化效果: ${originalRequests}个请求 → ${optimizedRequests}个请求 (减少${reduction}%)`
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

          console.log(
            `[TwoPhaseTranslatorV4] 处理批次 ${batchIndex + 1}/${optimizedBatches.length}: ` +
            `${batch.texts.length}个Text对象`
          );

          // 调用优化版翻译方法
          const translatedTexts = await this.microsoftTranslator.translateOptimized(
            batch.texts,
            sourceLang,
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
        return this.translateWithMicrosoftSubtitlesLegacy(subtitles, sourceLang, targetLang, stage, signal);
      }
    }

    // 使用旧逻辑
    console.log(`[TwoPhaseTranslatorV4] 使用传统微软翻译逻辑`);
    return this.translateWithMicrosoftSubtitlesLegacy(subtitles, sourceLang, targetLang, stage, signal);
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
    sourceLang: string,
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
        sourceLang,
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
    sourceLang: string,
    targetLang: string,
    signal: AbortSignal,
    options?: { stage: 'urgent' | 'batch' }
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
        if (service.type === 'openai') {
          // 使用OpenAI翻译
          const translator = new OpenAITranslator(
            service.apiKey,
            {
              model: service.model || 'gpt-3.5-turbo',
              customModel: service.customModel,
              temperature: service.temperature || 0.3
            }
          );
          
          // 将文本数组转换为OpenAI期待的格式
          const subtitles = texts.map((text, idx) => ({
            id: `sub_${idx}`,
            text: text
          }));
          
          // 调用翻译
          const results = await translator.translateSubtitles(
            subtitles,
            sourceLang,
            targetLang
          );
          
          // 转换回文本数组
          translatedTexts = subtitles.map(sub => results[sub.id] || sub.text);
          
        } else if (service.type === 'google' || service.type === 'google-free') {
          const stage = options?.stage ?? 'batch';
          const order = this.getGoogleEndpointOrder(stage);
          const allowFallback = stage !== 'batch';
        const { translations } = await this.translateWithGoogleEndpoints(texts, sourceLang, targetLang, {
          preferredOrder: order,
          recordStatistics: stage === 'urgent',
          allowFallback
        });
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
    sourceLang: string,
    targetLang: string,
    options?: {
      preferredOrder?: GoogleEndpointId[];
      recordStatistics?: boolean;
      allowFallback?: boolean;
    }
  ): Promise<{ translations: string[]; endpoint: GoogleEndpointId }> {
    if (texts.length === 0) {
      return { translations: [], endpoint: 'single' };
    }

    const combinedText = texts.join('\n');
    const baseParams: Record<string, string> = {
      client: 'gtx',
      sl: sourceLang === 'auto' ? 'auto' : sourceLang,
      tl: targetLang,
      dt: 't',
      q: combinedText
    };

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

        console.log(
          `[TwoPhaseTranslatorV4] Google endpoint=${endpoint.id} success (${normalized.length}条)`
        );

        if (options?.recordStatistics) {
          this.preferredGoogleEndpoint = endpoint.id;
          this.failedGoogleEndpoints.delete(endpoint.id);
        }

        return { translations: normalized, endpoint: endpoint.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[TwoPhaseTranslatorV4] Google endpoint=${endpoint.id} failed，尝试切换`,
          message
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
