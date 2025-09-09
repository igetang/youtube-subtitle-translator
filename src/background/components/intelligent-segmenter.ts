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
    
    // 如果字幕总数不超过MAX_BATCH_SIZE，直接一批发送，无需分析时间间隔
    if (subtitles.length <= IntelligentSegmenter.MAX_BATCH_SIZE) {
      console.log(`[IntelligentSegmenter] 字幕总数${subtitles.length}条 ≤ ${IntelligentSegmenter.MAX_BATCH_SIZE}条，一次性发送`);
      return [{
        startIdx: 0,
        endIdx: subtitles.length,
        subtitles: subtitles
      }];
    }
    
    // 只有超过40条才需要分析时间间隔和智能断句
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
    
    // 如果剩余字幕数量不超过MAX_BATCH_SIZE，直接一次性发送
    if (searchEnd - startIdx <= IntelligentSegmenter.MAX_BATCH_SIZE && 
        searchEnd === subtitles.length) {
      console.log(`[IntelligentSegmenter] 剩余${searchEnd - startIdx}条，一次性发送`);
      return searchEnd;
    }
    
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
    
    // Step 2: 如果批次过小，后延寻找合适断点（根据07文档使用while循环）
    const originalCutPoint = cutPoint;  // 保存第一次找到的断点
    let loopCount = 0;
    const MAX_LOOPS = 3;  // 最多循环3次
    
    while (cutPoint - startIdx < IntelligentSegmenter.MIN_BATCH_SIZE && 
           cutPoint < subtitles.length &&
           loopCount < MAX_LOOPS) {
      let found = false;
      loopCount++;
      
      // 使用动态阈值判断，从当前cutPoint开始向后搜索
      for (let i = cutPoint; i < Math.min(searchEnd - 1, subtitles.length - 1); i++) {
        const currentEnd = subtitles[i].end || 
                          (subtitles[i].start + (subtitles[i].duration || 0));
        const nextStart = subtitles[i + 1].start;
        const gap = nextStart - currentEnd;
        
        // 使用动态阈值判断
        if (gap >= this.dynamicThreshold) {
          cutPoint = i + 1;
          found = true;
          console.log(`[IntelligentSegmenter] 后延找到断点(循环${loopCount}): 位置${i+1}, 间隔${gap.toFixed(2)}s`);
          break;
        }
      }
      
      // 如果没有找到合适断点，跳出循环
      if (!found) {
        console.log(`[IntelligentSegmenter] 后延未找到合适断点，停止搜索`);
        break;
      }
    }
    
    // 如果循环了3次还是小于10条，使用第一次的断点位置
    if (loopCount >= MAX_LOOPS && cutPoint - startIdx < IntelligentSegmenter.MIN_BATCH_SIZE) {
      cutPoint = originalCutPoint;
      console.log(`[IntelligentSegmenter] 达到最大循环次数，使用初始断点${originalCutPoint}`);
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