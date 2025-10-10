/**
 * @class TimeGapAnalyzer - 时间间隔分析器
 * 基于07架构文档的动态阈值计算方案
 * 用于分析字幕时间间隔，计算最优断句阈值
 */
export class TimeGapAnalyzer {
  /**
   * 分析字幕时间间隔统计
   * @param subtitles 字幕数组
   * @returns 时间间隔统计信息
   */
  public static analyzeGapStatistics(subtitles: Array<{
    start: number;
    end?: number;
    duration?: number;
    text: string;
  }>): {
    avgGap: number;
    medianGap: number;
    dynamicThreshold: number;
    gaps: number[];
    distribution: {
      under500ms: number;
      under1s: number;
      under2s: number;
      over2s: number;
    };
  } {
    const gaps: number[] = [];
    
    // 收集所有时间间隔
    for (let i = 0; i < subtitles.length - 1; i++) {
      const currentEnd = subtitles[i].end || 
                        (subtitles[i].start + (subtitles[i].duration || 0));
      const nextStart = subtitles[i + 1].start;
      const gap = nextStart - currentEnd;
      
      // 只记录正间隔（有停顿的地方）
      if (gap > 0) {
        gaps.push(gap);
      }
    }
    
    // 如果没有间隔数据，返回默认值
    if (gaps.length === 0) {
      return {
        avgGap: 0,
        medianGap: 0,
        dynamicThreshold: 1.0,
        gaps: [],
        distribution: {
          under500ms: 0,
          under1s: 0,
          under2s: 0,
          over2s: 0
        }
      };
    }
    
    // 计算平均值
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    
    // 计算中位数
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = this.getMedian(sortedGaps);
    
    // 动态阈值：3倍平均值或2倍中位数的较大值，最小1秒
    const dynamicThreshold = Math.max(
      avgGap * 3,      // 3倍平均值
      medianGap * 2,   // 2倍中位数
      1.0              // 最小1秒
    );
    
    // 统计间隔分布
    const distribution = {
      under500ms: gaps.filter(g => g < 0.5).length,
      under1s: gaps.filter(g => g >= 0.5 && g < 1).length,
      under2s: gaps.filter(g => g >= 1 && g < 2).length,
      over2s: gaps.filter(g => g >= 2).length
    };
    
    console.debug(`[debug][TimeGapAnalyzer] 间隔分析结果:`, {
      样本数: gaps.length,
      平均间隔: `${avgGap.toFixed(2)}s`,
      中位数: `${medianGap.toFixed(2)}s`,
      动态阈值: `${dynamicThreshold.toFixed(2)}s`,
      分布: distribution
    });
    
    return {
      avgGap,
      medianGap,
      dynamicThreshold,
      gaps,
      distribution
    };
  }
  
  /**
   * 计算中位数
   */
  private static getMedian(sortedArray: number[]): number {
    if (sortedArray.length === 0) return 0;
    
    const mid = Math.floor(sortedArray.length / 2);
    
    if (sortedArray.length % 2 === 0) {
      // 偶数个元素，取中间两个的平均值
      return (sortedArray[mid - 1] + sortedArray[mid]) / 2;
    } else {
      // 奇数个元素，取中间的
      return sortedArray[mid];
    }
  }
  
  /**
   * 判断某个间隔是否为显著停顿
   * @param gap 时间间隔（秒）
   * @param threshold 动态阈值
   * @returns 是否为显著停顿
   */
  public static isSignificantGap(gap: number, threshold: number): boolean {
    return gap >= threshold;
  }
  
  /**
   * 获取建议的批次大小范围
   * 基于间隔分布情况动态调整
   */
  public static getSuggestedBatchSizeRange(distribution: {
    under500ms: number;
    under1s: number;
    under2s: number;
    over2s: number;
  }): {
    min: number;
    max: number;
    optimal: number;
  } {
    const total = distribution.under500ms + distribution.under1s + 
                  distribution.under2s + distribution.over2s;
    
    // 如果大部分间隔都很短，说明是快节奏内容，批次可以更大
    const shortGapRatio = (distribution.under500ms + distribution.under1s) / total;
    
    if (shortGapRatio > 0.8) {
      // 快节奏：对话密集
      return { min: 10, max: 120, optimal: 80 };  // 修改为120以适应12000字符限制
    } else if (shortGapRatio > 0.5) {
      // 正常节奏
      return { min: 10, max: 120, optimal: 60 };  // 修改为120以适应12000字符限制
    } else {
      // 慢节奏：停顿较多
      return { min: 10, max: 120, optimal: 40 };  // 修改为120以适应12000字符限制
    }
  }
}