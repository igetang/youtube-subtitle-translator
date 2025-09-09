import { IntelligentSegmenter } from './intelligent-segmenter';
import { TimeGapAnalyzer } from './time-gap-analyzer';
import { SimpleWatchdogManager } from './simple-watchdog-manager';
import { TimeoutController, TimeoutError } from './timeout-controller';

/**
 * @class TwoPhaseTranslator - 两阶段翻译器（无重试版本）
 * 基于07架构文档v3.0的简化设计
 * 阶段1：紧急翻译（用户当前位置，失败静默跳过）
 * 阶段2：完整批量翻译（全部字幕，失败显示原文）
 * 
 * @version 3.0
 * @date 2025-09-09
 */
export class TwoPhaseTranslator {
  private static readonly API_DELAY = 200;  // API调用间隔（毫秒）
  private static readonly URGENT_RESPONSE_TIME = 300;  // 紧急响应时间目标（毫秒）
  private static readonly BATCH_START_DELAY = 5000;  // 批量翻译启动延迟（毫秒）- 临时改为5秒用于测试
  private static readonly TIMEOUT_MS = 5000;  // 统一超时时间（毫秒）
  
  private segmenter: IntelligentSegmenter;
  private translationCallback: (texts: string[], sourceLang: string, targetLang: string) => Promise<string[]>;
  private watchdogManager: SimpleWatchdogManager;
  private isComplete: boolean = false;  // 翻译完成标志，防止延迟覆盖
  private currentExecutionId: number = 0;  // 执行ID，防止过期结果覆盖
  
  constructor(
    translationCallback: (texts: string[], sourceLang: string, targetLang: string) => Promise<string[]>
  ) {
    this.segmenter = new IntelligentSegmenter();
    this.translationCallback = translationCallback;
    this.watchdogManager = new SimpleWatchdogManager();
    this.isComplete = false;
  }
  
  /**
   * 执行两阶段翻译（无重试版本）
   * @param allSubtitles 所有字幕
   * @param currentIndex 当前播放位置索引
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param onProgress 进度回调
   * @returns 翻译结果映射
   */
  public async translateVideo(
    allSubtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    currentIndex: number,
    sourceLang: string,
    targetLang: string,
    onProgress?: (phase: string, progress: number, data?: any) => void
  ): Promise<Map<number, string>> {
    console.log(`[TwoPhaseTranslator] 开始两阶段翻译（无重试版本）:`, {
      总字幕数: allSubtitles.length,
      当前位置: currentIndex,
      语言对: `${sourceLang} → ${targetLang}`
    });
    
    // 生成新的执行ID
    const executionId = ++this.currentExecutionId;
    
    // 重置完成标志
    this.isComplete = false;
    
    const startTime = Date.now();
    const allTranslations = new Map<number, string>();
    
    // ========== 执行两阶段翻译（智能判断是否需要批量） ==========
    
    // 第一阶段：紧急翻译（立即执行）
    const urgentTranslations = await this.executeUrgentTranslation(
      allSubtitles,
      currentIndex,
      sourceLang,
      targetLang,
      executionId,
      startTime,
      onProgress
    ).catch(error => {
      console.warn('[TwoPhaseTranslator] 紧急翻译失败或超时，继续批量翻译');
      return new Map<number, string>();
    });
    
    // 将紧急翻译结果添加到总结果
    urgentTranslations.forEach((value, key) => {
      allTranslations.set(key, value);
    });
    
    // 检查紧急翻译是否已覆盖全部字幕
    let batchTranslationCount = 0;
    if (urgentTranslations.size >= allSubtitles.length) {
      console.log(`[TwoPhaseTranslator] 紧急翻译已覆盖全部${allSubtitles.length}条字幕，跳过批量翻译`);
      // 直接返回，不执行批量翻译
    } else {
      console.log(`[TwoPhaseTranslator] 紧急翻译覆盖${urgentTranslations.size}/${allSubtitles.length}条，继续批量翻译`);
      
      // 第二阶段：批量翻译（只在需要时执行）
      const batchTranslations = await this.executeBatchTranslation(
        allSubtitles,
        sourceLang,
        targetLang,
        executionId,
        startTime,
        onProgress
      );
      
      // 用批量翻译覆盖/补充
      batchTranslations.forEach((value, key) => {
        allTranslations.set(key, value);
      });
      batchTranslationCount = batchTranslations.size;
    }
    
    console.log(`[TwoPhaseTranslator] 翻译完成: 总计${allTranslations.size}条字幕`);
    
    // ========== 翻译完成 ==========
    this.isComplete = true;
    const totalTime = Date.now() - startTime;
    
    console.log(`[TwoPhaseTranslator] ✅ 翻译完成，总耗时: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`[TwoPhaseTranslator] 翻译统计:`, {
      最终结果: allTranslations.size,
      覆盖率: `${((allTranslations.size / allSubtitles.length) * 100).toFixed(1)}%`
    });
    
    // 通知翻译完成
    onProgress?.('complete', 100, {
      totalTime,
      translatedCount: allTranslations.size,
      totalSubtitles: allSubtitles.length
    });
    
    return allTranslations;
  }
  
  /**
   * 执行紧急翻译（无重试，5秒超时）
   */
  private async executeUrgentTranslation(
    allSubtitles: Array<any>,
    currentIndex: number,
    sourceLang: string,
    targetLang: string,
    executionId: number,
    startTime: number,
    onProgress?: (phase: string, progress: number, data?: any) => void
  ): Promise<Map<number, string>> {
    const urgentTranslations = new Map<number, string>();
    
    // 准备紧急批次
    const urgentBatch = IntelligentSegmenter.getUrgentBatch(allSubtitles, currentIndex);
    const urgentStartIdx = Math.max(0, currentIndex - 20);
    
    // 准备紧急批次文本
    const urgentTexts = urgentBatch.map(sub => sub.text.replace(/\n/g, ' ').trim());
    const urgentCombined = urgentTexts.join('\n');
    
    console.log(`[TwoPhaseTranslator] 开始紧急翻译: ${urgentBatch.length}条字幕`);
    
    // 使用超时控制器执行（无重试）
    const urgentResults = await TimeoutController.executeWithTimeout(
      this.translationCallback([urgentCombined], sourceLang, targetLang),
      TwoPhaseTranslator.TIMEOUT_MS,
      'urgent_translate'
    );
    
    // 检查执行ID是否匹配
    if (executionId !== this.currentExecutionId) {
      console.log('[TwoPhaseTranslator] 紧急翻译执行ID不匹配，忽略过期结果');
      return urgentTranslations;
    }
    
    // 检查是否已完成
    if (this.isComplete) {
      console.log('[TwoPhaseTranslator] 紧急翻译返回太晚，翻译已完成，忽略结果');
      return urgentTranslations;
    }
    
    // 存储紧急翻译结果
    const splitResults = urgentResults[0].split('\n');
    splitResults.forEach((translation, idx) => {
      const globalIdx = urgentStartIdx + idx;
      if (globalIdx < urgentBatch.length + urgentStartIdx) {
        urgentTranslations.set(globalIdx, translation);
      }
    });
    
    const urgentTime = Date.now() - startTime;
    console.log(`[TwoPhaseTranslator] 🚀 紧急翻译完成，耗时: ${urgentTime}ms`);
    
    // 通知紧急翻译完成
    onProgress?.('urgent', 100, {
      translatedCount: splitResults.length,
      timeElapsed: urgentTime,
      translations: urgentTranslations,
      urgentRange: {
        startIdx: urgentStartIdx,
        endIdx: urgentStartIdx + splitResults.length
      }
    });
    
    return urgentTranslations;
  }
  
  /**
   * 执行批量翻译（每批独立，失败降级显示原文）
   */
  private async executeBatchTranslation(
    allSubtitles: Array<any>,
    sourceLang: string,
    targetLang: string,
    executionId: number,
    startTime: number,
    onProgress?: (phase: string, progress: number, data?: any) => void
  ): Promise<Map<number, string>> {
    const batchTranslations = new Map<number, string>();
    
    // 延迟启动，避免与紧急翻译同时请求API
    console.log(`[TwoPhaseTranslator] 批量翻译将在${TwoPhaseTranslator.BATCH_START_DELAY}ms后启动`);
    await this.delay(TwoPhaseTranslator.BATCH_START_DELAY);
    
    // 检查执行ID是否仍然有效
    if (executionId !== this.currentExecutionId) {
      console.log('[TwoPhaseTranslator] 批量翻译执行ID不匹配，取消执行');
      return batchTranslations;
    }
    
    console.log('[TwoPhaseTranslator] 开始批量翻译');
    
    // 创建智能批次
    const fullBatches = this.segmenter.createSmartBatches(allSubtitles);
    console.log(`[TwoPhaseTranslator] 创建了${fullBatches.length}个批次`);
    
    // 每批独立执行，失败不影响其他批次
    const batchPromises = fullBatches.map(async (batch, i) => {
      // 延迟发送，每批间隔200ms
      await this.delay(i * TwoPhaseTranslator.API_DELAY);
      
      // 再次检查执行ID
      if (executionId !== this.currentExecutionId) {
        console.log(`[TwoPhaseTranslator] 批次${i+1}执行ID不匹配，跳过`);
        return null;
      }
      
      const batchTexts = batch.subtitles.map(sub => sub.text.replace(/\n/g, ' ').trim());
      const combinedText = batchTexts.join('\n');
      
      try {
        // 使用超时控制器执行（无重试，失败返回原文）
        const batchResults = await TimeoutController.executeWithTimeout(
          this.translationCallback([combinedText], sourceLang, targetLang),
          TwoPhaseTranslator.TIMEOUT_MS,
          `batch_${i}`,
          [combinedText]  // 失败时返回原文作为降级方案
        );
        
        // 处理翻译结果
        const splitResults = batchResults[0].split('\n');
        const results: Array<{ index: number; translation: string }> = [];
        
        // 检查分割是否成功
        if (splitResults.length !== batch.subtitles.length) {
          // 翻译结果数量不匹配 - 这是一个严重错误
          console.error(`[TwoPhaseTranslator] 批次${i+1}翻译结果分割失败(期望${batch.subtitles.length}条,得到${splitResults.length}条)`);
          
          // 降级策略：返回原文，至少保证字幕可读
          console.warn(`[TwoPhaseTranslator] 批次${i+1}使用原文作为降级方案`);
          batch.subtitles.forEach((sub, idx) => {
            const globalIdx = batch.startIdx + idx;
            results.push({ index: globalIdx, translation: sub.text });
          });
        } else {
          // 正常分割，数量匹配
          splitResults.forEach((translation, idx) => {
            const globalIdx = batch.startIdx + idx;
            results.push({ index: globalIdx, translation: translation.trim() });
          });
        }
        
        console.log(`[TwoPhaseTranslator] ✓ 批次${i+1}/${fullBatches.length}翻译成功`);
        
        // 通知批次进度
        onProgress?.('batch', ((i + 1) / fullBatches.length) * 100, {
          batchIndex: i,
          totalBatches: fullBatches.length,
          translatedCount: results.length
        });
        
        return results;
        
      } catch (error) {
        // 批次失败，返回原文
        console.warn(`[TwoPhaseTranslator] 批次${i+1}翻译失败，使用原文`);
        
        const fallbackResults: Array<{ index: number; translation: string }> = [];
        batch.subtitles.forEach((sub, idx) => {
          const globalIdx = batch.startIdx + idx;  // 修正：使用 startIdx 而不是 startIndex
          fallbackResults.push({ index: globalIdx, translation: sub.text });
        });
        
        return fallbackResults;
      }
    });
    
    // 等待所有批次完成（无论成功或失败）
    const allBatchResults = await Promise.allSettled(batchPromises);
    
    // 合并所有批次结果
    allBatchResults.forEach((result, batchIdx) => {
      if (result.status === 'fulfilled' && result.value) {
        result.value.forEach(item => {
          if (item) {
            batchTranslations.set(item.index, item.translation);
          }
        });
      }
    });
    
    
    const batchTime = Date.now() - startTime - TwoPhaseTranslator.BATCH_START_DELAY;
    console.log(`[TwoPhaseTranslator] 📦 批量翻译完成，耗时: ${(batchTime / 1000).toFixed(1)}s`);
    
    return batchTranslations;
  }
  
  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 清理资源
   */
  public cleanup(): void {
    this.watchdogManager.clearAll();
    this.isComplete = true;
    this.currentExecutionId++;
  }
}