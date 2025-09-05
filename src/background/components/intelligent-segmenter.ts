import { TimeGapAnalyzer } from './time-gap-analyzer';

/**
 * @class IntelligentSegmenter - 智能断句器
 * 基于07架构文档的时间间隔断句方案
 * 负责将字幕智能分割为最优批次
 */
export class IntelligentSegmenter {
  // 核心参数（基于07文档）
  private static readonly MAX_BATCH_SIZE = 40;  // 搜索窗口大小
  private static readonly MIN_BATCH_SIZE = 10;  // 最小批次大小
  private static readonly URGENT_RADIUS = 20;   // 紧急翻译半径
  
  private dynamicThreshold: number = 1.0;  // 动态阈值，会根据内容调整
  
  /**
   * 创建智能批次
   * @param subtitles 所有字幕
   * @returns 分割后的批次数组
   */
  public createSmartBatches(subtitles: Array<{
    id?: string;
    start: number;
    end?: number;
    duration?: number;
    text: string;
  }>): Array<{
    startIdx: number;
    endIdx: number;
    subtitles: typeof subtitles;
  }> {
    if (subtitles.length === 0) {
      return [];
    }
    
    // 分析时间间隔，获取动态阈值
    const gapStats = TimeGapAnalyzer.analyzeGapStatistics(subtitles);
    this.dynamicThreshold = gapStats.dynamicThreshold;
    
    console.log(`[IntelligentSegmenter] 开始智能分批:`, {
      总字幕数: subtitles.length,
      动态阈值: `${this.dynamicThreshold.toFixed(2)}s`
    });
    
    const batches: Array<{
      startIdx: number;
      endIdx: number;
      subtitles: typeof subtitles;
    }> = [];
    
    let currentIdx = 0;
    
    while (currentIdx < subtitles.length) {
      const cutPoint = this.findOptimalCutPoint(subtitles, currentIdx);
      const batch = {
        startIdx: currentIdx,
        endIdx: cutPoint,
        subtitles: subtitles.slice(currentIdx, cutPoint)
      };
      
      batches.push(batch);
      
      console.log(`[IntelligentSegmenter] 批次${batches.length}:`, {
        范围: `[${currentIdx}-${cutPoint})`,
        数量: batch.subtitles.length,
        首句: batch.subtitles[0]?.text.substring(0, 30)
      });
      
      currentIdx = cutPoint;
    }
    
    console.log(`[IntelligentSegmenter] ✓ 分批完成:`, {
      批次数: batches.length,
      平均大小: Math.round(subtitles.length / batches.length)
    });
    
    return batches;
  }
  
  /**
   * 找到最优断点
   * 核心算法：在40条内找最大时间间隔
   */
  private findOptimalCutPoint(
    subtitles: Array<{
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    startIdx: number
  ): number {
    const searchEnd = Math.min(
      startIdx + IntelligentSegmenter.MAX_BATCH_SIZE,
      subtitles.length
    );
    
    // Step 1: 在40条内找最大时间间隔
    let maxGap = 0;
    let cutPoint = searchEnd;
    
    for (let i = startIdx; i < searchEnd - 1; i++) {
      const currentEnd = subtitles[i].end || 
                        (subtitles[i].start + (subtitles[i].duration || 0));
      const nextStart = subtitles[i + 1].start;
      const gap = nextStart - currentEnd;
      
      if (gap > maxGap) {
        maxGap = gap;
        cutPoint = i + 1;
      }
    }
    
    // Step 2: 如果批次过小，尝试后延寻找合适断点
    if (cutPoint - startIdx < IntelligentSegmenter.MIN_BATCH_SIZE) {
      // 从最小批次位置开始寻找
      const minBatchEnd = Math.min(
        startIdx + IntelligentSegmenter.MIN_BATCH_SIZE,
        subtitles.length
      );
      
      // 在MIN到MAX之间寻找超过阈值的间隔
      for (let i = minBatchEnd - 1; i < searchEnd - 1; i++) {
        const currentEnd = subtitles[i].end || 
                          (subtitles[i].start + (subtitles[i].duration || 0));
        const nextStart = subtitles[i + 1].start;
        const gap = nextStart - currentEnd;
        
        // 使用动态阈值判断
        if (gap >= this.dynamicThreshold) {
          cutPoint = i + 1;
          break;
        }
      }
      
      // 如果还是没找到，至少保证最小批次大小
      if (cutPoint - startIdx < IntelligentSegmenter.MIN_BATCH_SIZE) {
        cutPoint = Math.min(minBatchEnd, subtitles.length);
      }
    }
    
    return cutPoint;
  }
  
  /**
   * 获取紧急翻译批次（当前播放位置附近）
   * @param subtitles 所有字幕
   * @param currentIndex 当前播放位置索引
   * @returns 紧急批次
   */
  public static getUrgentBatch(
    subtitles: Array<any>,
    currentIndex: number
  ): Array<any> {
    // 前后各20条，共41条（包括当前）
    const start = Math.max(0, currentIndex - IntelligentSegmenter.URGENT_RADIUS);
    const end = Math.min(
      subtitles.length, 
      currentIndex + IntelligentSegmenter.URGENT_RADIUS + 1
    );
    
    console.log(`[IntelligentSegmenter] 紧急批次:`, {
      当前位置: currentIndex,
      批次范围: `[${start}-${end})`,
      批次大小: end - start
    });
    
    return subtitles.slice(start, end);
  }
  
  /**
   * 评估批次质量
   * 用于调试和优化
   */
  public static evaluateBatchQuality(batches: Array<{
    startIdx: number;
    endIdx: number;
    subtitles: Array<any>;
  }>): {
    avgSize: number;
    minSize: number;
    maxSize: number;
    sizeStdDev: number;
    totalBatches: number;
  } {
    if (batches.length === 0) {
      return {
        avgSize: 0,
        minSize: 0,
        maxSize: 0,
        sizeStdDev: 0,
        totalBatches: 0
      };
    }
    
    const sizes = batches.map(b => b.subtitles.length);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    
    // 计算标准差
    const variance = sizes.reduce((sum, size) => {
      return sum + Math.pow(size - avgSize, 2);
    }, 0) / sizes.length;
    const sizeStdDev = Math.sqrt(variance);
    
    return {
      avgSize,
      minSize,
      maxSize,
      sizeStdDev,
      totalBatches: batches.length
    };
  }
}