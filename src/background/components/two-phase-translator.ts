import { IntelligentSegmenter } from './intelligent-segmenter';
import { TimeGapAnalyzer } from './time-gap-analyzer';

/**
 * @class TwoPhaseTranslator - 两阶段翻译器
 * 基于07架构文档的两阶段翻译策略
 * 阶段1：紧急翻译（用户当前位置）
 * 阶段2：完整批量翻译（全部字幕）
 */
export class TwoPhaseTranslator {
  private static readonly API_DELAY = 200;  // API调用间隔（毫秒）
  private static readonly URGENT_RESPONSE_TIME = 300;  // 紧急响应时间目标（毫秒）
  
  private segmenter: IntelligentSegmenter;
  private translationCallback: (texts: string[], sourceLang: string, targetLang: string) => Promise<string[]>;
  
  constructor(
    translationCallback: (texts: string[], sourceLang: string, targetLang: string) => Promise<string[]>
  ) {
    this.segmenter = new IntelligentSegmenter();
    this.translationCallback = translationCallback;
  }
  
  /**
   * 执行两阶段翻译
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
    console.log(`[TwoPhaseTranslator] 开始两阶段翻译:`, {
      总字幕数: allSubtitles.length,
      当前位置: currentIndex,
      语言对: `${sourceLang} → ${targetLang}`
    });
    
    const allTranslations = new Map<number, string>();
    const startTime = Date.now();
    
    // ========== 阶段1：紧急翻译 ==========
    console.log(`[TwoPhaseTranslator] 阶段1：紧急翻译`);
    
    const urgentBatch = IntelligentSegmenter.getUrgentBatch(allSubtitles, currentIndex);
    const urgentStartIdx = Math.max(0, currentIndex - 20);
    
    try {
      // 准备紧急批次文本（使用单个换行符分隔）
      // 先把每条字幕内部的换行符替换成空格，然后用换行符连接
      const urgentTexts = urgentBatch.map(sub => sub.text.replace(/\n/g, ' ').trim());
      const urgentCombined = urgentTexts.join('\n');  // 单个换行符作为分隔符
      
      // 执行紧急翻译
      const urgentTranslated = await this.translationCallback(
        [urgentCombined],
        sourceLang,
        targetLang
      );
      
      // 翻译结果已经是分割好的数组
      const urgentResults = urgentTranslated;
      
      // 存储紧急翻译结果
      urgentResults.forEach((translation, idx) => {
        const globalIdx = urgentStartIdx + idx;
        if (globalIdx < allSubtitles.length) {
          allTranslations.set(globalIdx, translation);
        }
      });
      
      const urgentTime = Date.now() - startTime;
      console.log(`[TwoPhaseTranslator] ✓ 紧急翻译完成:`, {
        耗时: `${urgentTime}ms`,
        目标: `${TwoPhaseTranslator.URGENT_RESPONSE_TIME}ms`,
        达标: urgentTime <= TwoPhaseTranslator.URGENT_RESPONSE_TIME ? '✅' : '❌'
      });
      
      // 通知紧急翻译完成
      onProgress?.('urgent', 100, {
        translatedCount: urgentResults.length,
        timeElapsed: urgentTime
      });
      
    } catch (error) {
      console.error(`[TwoPhaseTranslator] ✗ 紧急翻译失败:`, error);
      // 紧急翻译失败不影响后续批量翻译
    }
    
    // ========== 阶段2：完整批量翻译 ==========
    console.log(`[TwoPhaseTranslator] 阶段2：完整批量翻译`);
    
    // 创建智能批次
    const fullBatches = this.segmenter.createSmartBatches(allSubtitles);
    const batchQuality = IntelligentSegmenter.evaluateBatchQuality(fullBatches);
    
    console.log(`[TwoPhaseTranslator] 批次质量评估:`, {
      批次数: batchQuality.totalBatches,
      平均大小: batchQuality.avgSize.toFixed(1),
      最小: batchQuality.minSize,
      最大: batchQuality.maxSize,
      标准差: batchQuality.sizeStdDev.toFixed(2)
    });
    
    // 逐批翻译
    for (let i = 0; i < fullBatches.length; i++) {
      const batch = fullBatches[i];
      
      try {
        // 准备批次文本（使用单个换行符分隔）
        // 先把每条字幕内部的换行符替换成空格，然后用换行符连接
        const batchTexts = batch.subtitles.map(sub => sub.text.replace(/\n/g, ' ').trim());
        const batchCombined = batchTexts.join('\n');  // 单个换行符作为分隔符
        
        // 执行批量翻译
        const batchTranslated = await this.translationCallback(
          [batchCombined],
          sourceLang,
          targetLang
        );
        
        // 翻译结果已经是分割好的数组
        const batchResults = batchTranslated;
        
        // 验证结果数量
        if (batchResults.length !== batchTexts.length) {
          console.warn(`[TwoPhaseTranslator] ⚠️ 批次${i+1}结果数量不匹配:`, {
            期望: batchTexts.length,
            实际: batchResults.length
          });
        }
        
        // 存储批量翻译结果（覆盖紧急翻译）
        batchResults.forEach((translation, idx) => {
          const globalIdx = batch.startIdx + idx;
          if (globalIdx < allSubtitles.length) {
            allTranslations.set(globalIdx, translation);
          }
        });
        
        // 计算进度
        const progress = ((i + 1) / fullBatches.length) * 100;
        
        // 通知批量翻译进度
        onProgress?.('batch', progress, {
          currentBatch: i + 1,
          totalBatches: fullBatches.length,
          batchSize: batch.subtitles.length,
          translatedCount: allTranslations.size
        });
        
        console.log(`[TwoPhaseTranslator] 批次${i+1}/${fullBatches.length}完成 (${progress.toFixed(0)}%)`);
        
        // 批次间延迟，避免API限流
        if (i < fullBatches.length - 1) {
          await this.delay(TwoPhaseTranslator.API_DELAY);
        }
        
      } catch (error) {
        console.error(`[TwoPhaseTranslator] ✗ 批次${i+1}翻译失败:`, error);
        // 批次失败，使用原文作为降级
        batch.subtitles.forEach((sub, idx) => {
          const globalIdx = batch.startIdx + idx;
          if (!allTranslations.has(globalIdx)) {
            allTranslations.set(globalIdx, sub.text);
          }
        });
      }
    }
    
    // ========== 阶段3：完成 ==========
    const totalTime = Date.now() - startTime;
    
    console.log(`[TwoPhaseTranslator] ✓ 翻译完成:`, {
      总耗时: `${(totalTime / 1000).toFixed(1)}s`,
      翻译条数: allTranslations.size,
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
   * 合并批次文本用于翻译
   * 使用单个换行符分隔
   */
  public static mergeBatchTexts(texts: string[]): string {
    return texts.join('\n');  // 单个换行符
  }
  
  /**
   * 分割翻译结果
   * 按单个换行符分割
   */
  public static splitTranslationResult(result: string): string[] {
    return result.split('\n');  // 单个换行符
  }
  
  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 获取性能统计
   */
  public static getPerformanceMetrics(
    startTime: number,
    urgentTime: number,
    totalTime: number,
    subtitleCount: number,
    batchCount: number
  ): {
    urgentResponseTime: number;
    totalTranslationTime: number;
    avgTimePerSubtitle: number;
    avgTimePerBatch: number;
    throughput: number;  // 字幕/秒
  } {
    const totalTranslationTime = totalTime - startTime;
    
    return {
      urgentResponseTime: urgentTime,
      totalTranslationTime,
      avgTimePerSubtitle: totalTranslationTime / subtitleCount,
      avgTimePerBatch: totalTranslationTime / batchCount,
      throughput: subtitleCount / (totalTranslationTime / 1000)
    };
  }
}