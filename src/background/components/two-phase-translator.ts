import { IntelligentSegmenter } from './intelligent-segmenter';
import { SimpleWatchdogManager } from './simple-watchdog-manager';
import { TimeoutController, TimeoutError } from './timeout-controller';

/**
 * @class TwoPhaseTranslator - 两阶段翻译器（并行执行版本）
 * 基于07架构文档v3.0的最新设计
 * 阶段1：紧急翻译（前9后30共40条）
 * 阶段2：批量翻译（全部字幕，每批延迟200ms）
 * 
 * @version 3.1
 * @date 2025-09-10
 */
export class TwoPhaseTranslator {
  private static readonly API_DELAY = 200;  // API调用间隔（毫秒）
  private static readonly TIMEOUT_MS = 5000;  // 统一超时时间（毫秒）
  
  private segmenter: IntelligentSegmenter;
  private translationCallback: (texts: string[], sourceLang: string, targetLang: string) => Promise<string[]>;
  private watchdogManager: SimpleWatchdogManager;
  private isComplete: boolean = false;  // 批量翻译完成标志
  private urgentCoverageComplete: boolean = false;  // 紧急翻译覆盖全部标志
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
   * 执行两阶段翻译（并行执行版本）
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
    console.debug(`[debug][TwoPhaseTranslator] 开始两阶段翻译（并行执行版本）:`, {
      总字幕数: allSubtitles.length,
      当前位置: currentIndex,
      语言对: `${sourceLang} → ${targetLang}`
    });
    
    // 生成新的执行ID
    const executionId = ++this.currentExecutionId;
    
    // 重置标志
    this.isComplete = false;
    this.urgentCoverageComplete = false;
    
    // 检查紧急翻译是否覆盖全部字幕
    const urgentStart = Math.max(0, currentIndex - 9);
    const urgentEnd = Math.min(allSubtitles.length, currentIndex + 31);
    if (urgentEnd - urgentStart >= allSubtitles.length) {
      this.urgentCoverageComplete = true;
      console.debug(`[debug][TwoPhaseTranslator] 紧急翻译将覆盖全部${allSubtitles.length}条字幕`);
    }
    
    const startTime = Date.now();
    
    // ========== 并行执行两个阶段 ==========
    const [urgentResult, batchResult] = await Promise.allSettled([
      this.executeUrgentTranslation(
        allSubtitles,
        currentIndex,
        sourceLang,
        targetLang,
        executionId,
        startTime,
        onProgress
      ),
      this.executeBatchTranslation(
        allSubtitles,
        sourceLang,
        targetLang,
        executionId,
        startTime,
        onProgress
      )
    ]);
    
    // 合并结果
    const allTranslations = new Map<number, string>();
    
    // 处理紧急翻译结果
    if (urgentResult.status === 'fulfilled' && urgentResult.value) {
      urgentResult.value.forEach((value, key) => {
        allTranslations.set(key, value);
      });
      console.debug(`[debug][TwoPhaseTranslator] 紧急翻译完成: ${urgentResult.value.size}条`);
    } else if (urgentResult.status === 'rejected') {
      console.warn('[TwoPhaseTranslator] 紧急翻译失败:', urgentResult.reason);
    }
    
    // 批量翻译覆盖（如果有的话）
    if (batchResult.status === 'fulfilled' && batchResult.value) {
      batchResult.value.forEach((value, key) => {
        allTranslations.set(key, value);
      });
      console.debug(`[debug][TwoPhaseTranslator] 批量翻译完成: ${batchResult.value.size}条，覆盖显示`);
    } else if (batchResult.status === 'rejected') {
      console.warn('[TwoPhaseTranslator] 批量翻译失败:', batchResult.reason);
    }
    
    // ========== 翻译完成 ==========
    const totalTime = Date.now() - startTime;
    
    console.log(`[TwoPhaseTranslator] ✅ 翻译完成，总耗时: ${(totalTime / 1000).toFixed(1)}s`);
    console.debug(`[debug][TwoPhaseTranslator] 翻译统计:`, {
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
    
    // 准备紧急批次（前9后30）
    const urgentBatch = IntelligentSegmenter.getUrgentBatch(allSubtitles, currentIndex);
    const urgentStartIdx = Math.max(0, currentIndex - 9);
    
    // 准备紧急批次文本
    const urgentTexts = urgentBatch.map(sub => sub.text.replace(/\n/g, ' ').trim());
    const urgentCombined = urgentTexts.join('\n');
    
    console.debug(`[debug][TwoPhaseTranslator] 开始紧急翻译: ${urgentBatch.length}条字幕`);
    
    // 使用超时控制器执行（无重试）
    const urgentResults = await TimeoutController.executeWithTimeout(
      this.translationCallback([urgentCombined], sourceLang, targetLang),
      TwoPhaseTranslator.TIMEOUT_MS,
      'urgent_translate'
    );
    
    // 检查执行ID是否匹配
    if (executionId !== this.currentExecutionId) {
      console.debug('[debug][TwoPhaseTranslator] 紧急翻译执行ID不匹配，忽略过期结果');
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
    console.debug(`[debug][TwoPhaseTranslator] 🚀 紧急翻译完成，耗时: ${urgentTime}ms`);
    
    // 显示逻辑：检查批量翻译是否已完成
    if (!this.isComplete) {
      // 批量未完成，显示紧急翻译结果
      console.debug('[debug][TwoPhaseTranslator] 批量未完成，显示紧急翻译结果');
      
      // 通知紧急翻译完成并显示
      onProgress?.('urgent', 100, {
        translatedCount: splitResults.length,
        timeElapsed: urgentTime,
        translations: urgentTranslations,
        urgentRange: {
          startIdx: urgentStartIdx,
          endIdx: urgentStartIdx + splitResults.length
        }
      });
    } else {
      console.debug('[debug][TwoPhaseTranslator] 批量已完成，忽略紧急翻译结果');
    }
    
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
  ): Promise<Map<number, string> | null> {
    // 前置判断：是否需要执行批量翻译
    if (this.urgentCoverageComplete) {
      console.debug('[debug][TwoPhaseTranslator] 跳过批量翻译：紧急翻译已覆盖全部');
      this.isComplete = true;
      return null;
    }
    
    const batchTranslations = new Map<number, string>();
    
    // 检查执行ID是否仍然有效
    if (executionId !== this.currentExecutionId) {
      console.debug('[debug][TwoPhaseTranslator] 批量翻译执行ID不匹配，取消执行');
      return batchTranslations;
    }
    
    console.debug('[debug][TwoPhaseTranslator] 开始批量翻译（并行执行，每批延迟200ms）');
    
    // 创建智能批次
    const fullBatches = this.segmenter.createSmartBatches(allSubtitles);
    console.debug(`[debug][TwoPhaseTranslator] 创建了${fullBatches.length}个批次`);
    
    // 顺序执行批次，每批延迟200ms
    for (let i = 0; i < fullBatches.length; i++) {
      // 每批延迟200ms（第一批不延迟）
      if (i > 0) {
        await this.delay(TwoPhaseTranslator.API_DELAY);
      }
      
      // 再次检查执行ID
      if (executionId !== this.currentExecutionId) {
        console.debug(`[debug][TwoPhaseTranslator] 批次${i+1}执行ID不匹配，停止批量翻译`);
        break;
      }
      
      const batch = fullBatches[i];
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
        
        // 检查分割是否成功
        if (splitResults.length !== batch.subtitles.length) {
          // 翻译结果数量不匹配
          console.error(`[TwoPhaseTranslator] 批次${i+1}翻译结果分割失败(期望${batch.subtitles.length}条,得到${splitResults.length}条)`);
          
          // 降级策略：返回原文
          batch.subtitles.forEach((sub, idx) => {
            const globalIdx = batch.startIdx + idx;
            batchTranslations.set(globalIdx, sub.text);
          });
        } else {
          // 正常分割，数量匹配
          splitResults.forEach((translation, idx) => {
            const globalIdx = batch.startIdx + idx;
            batchTranslations.set(globalIdx, translation.trim());
          });
        }
        
        console.debug(`[debug][TwoPhaseTranslator] ✓ 批次${i+1}/${fullBatches.length}翻译成功`);
        
        // 通知批次进度
        onProgress?.('batch', ((i + 1) / fullBatches.length) * 100, {
          currentBatch: i + 1,
          totalBatches: fullBatches.length,
          translatedCount: batch.subtitles.length
        });
        
      } catch (error) {
        // 批次失败，返回原文
        console.warn(`[TwoPhaseTranslator] 批次${i+1}翻译失败，使用原文:`, error);
        
        batch.subtitles.forEach((sub, idx) => {
          const globalIdx = batch.startIdx + idx;
          batchTranslations.set(globalIdx, sub.text);
        });
      }
    }
    
    // 标记批量翻译完成
    this.isComplete = true;
    
    const batchTime = Date.now() - startTime;
    console.debug(`[debug][TwoPhaseTranslator] 📦 批量翻译完成，耗时: ${(batchTime / 1000).toFixed(1)}s`);
    
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