/**
 * @class IntelligentSegmenter - 智能断句器
 * 基于07架构文档的时间间隔断句方案
 * 负责将字幕智能分割为最优批次
 */
export class IntelligentSegmenter {
  // 调试开关：打印原始字幕时间信息
  private static readonly DEBUG_SUBTITLE_TIMING = false;  // 设为false关闭调试日志

  // 核心参数（基于07文档）
  private readonly maxBatchSize: number;  // 单批最大字幕数（可配置：DeepSeek用10，OpenAI用20，Google/Microsoft用40）
  private static readonly URGENT_BEFORE = 2;    // 紧急翻译前向范围（优化：9→2，更快响应）
  private static readonly URGENT_AFTER = 5;     // 紧急翻译后向范围（优化：10→5，减少token消耗）

  /**
   * 构造函数
   * @param maxBatchSize 单批最大字幕数（DeepSeek用10，OpenAI用20，Google/Microsoft用40）
   */
  constructor(maxBatchSize: number = 40) {
    this.maxBatchSize = maxBatchSize;
  }

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
    if (subtitles.length <= this.maxBatchSize) {
      console.debug(`[debug][IntelligentSegmenter] 字幕总数${subtitles.length}条 ≤ ${this.maxBatchSize}条，一次性发送`);
      return [{
        startIdx: 0,
        endIdx: subtitles.length,
        subtitles: subtitles
      }];
    }
    
    // 调试：打印前10条字幕的时间信息
    if (IntelligentSegmenter.DEBUG_SUBTITLE_TIMING) {
      console.log('[IntelligentSegmenter] ========== 原始字幕时间信息（前10条）==========');
      subtitles.slice(0, 10).forEach((sub, idx) => {
        const end = sub.end || (sub.start + (sub.duration || 0));
        console.log(`[IntelligentSegmenter] 字幕${idx + 1}: ` +
          `start=${sub.start.toFixed(3)}s, ` +
          `duration=${(sub.duration || 0).toFixed(3)}s, ` +
          `end=${end.toFixed(3)}s, ` +
          `text="${sub.text.substring(0, 30)}${sub.text.length > 30 ? '...' : ''}"`
        );
      });
      console.log('[IntelligentSegmenter] ================================================');
    }

    // 超过阈值需要智能断句
    console.log(`[IntelligentSegmenter] 开始智能分批:`, {
      总字幕数: subtitles.length,
      批次大小: this.maxBatchSize
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
      
      const batchStartTime = batch.subtitles[0]?.start || 0;
      const lastSubtitle = batch.subtitles[batch.subtitles.length - 1];
      const batchEndTime = lastSubtitle?.end ||
                          (lastSubtitle?.start + (lastSubtitle?.duration || 0)) || 0;

      console.debug(`[debug][IntelligentSegmenter] 批次${batches.length}: [${currentIdx}-${cutPoint}), ${batch.subtitles.length}条, ${batchStartTime.toFixed(1)}-${batchEndTime.toFixed(1)}s`);
      
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
   * 核心算法：
   * 1. 从后往前找强断点（gap > 2秒）
   * 2. 没找到则找弱断点（maxGap - minGap > 400ms）
   * 3. 确保批次 >= 10条
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
    const BATCH_SIZE = this.maxBatchSize;  // 使用实例配置的批次大小
    const MIN_BATCH_SIZE = 10;  // 最小批次大小
    const STRONG_GAP = 2.0;     // 强断点：2秒
    const WEAK_GAP_DIFF = 0.4;  // 弱断点：差值400ms

    const endIdx = Math.min(startIdx + BATCH_SIZE, subtitles.length);

    // 剩余不足BATCH_SIZE条，全部发送
    if (endIdx - startIdx < BATCH_SIZE) {
      console.debug(`[debug][IntelligentSegmenter] 剩余${endIdx - startIdx}条，全部发送`);
      return endIdx;
    }

    const MAX_RETRIES = 3;  // 最大重试次数

    // 第一轮：从后往前寻找强断点（gap > 2秒）
    const strongBreakCandidates: number[] = [];  // 存储所有找到的强断点

    // 从后往前查找强断点
    for (let i = endIdx - 1; i > startIdx; i--) {
      const currentSubtitle = subtitles[i - 1];
      const nextSubtitle = subtitles[i];
      const currentEnd = currentSubtitle.end ||
                        (currentSubtitle.start + (currentSubtitle.duration || 0));
      const gap = nextSubtitle.start - currentEnd;  // 单位：秒

      if (gap > STRONG_GAP) {
        const batchSize = i - startIdx;

        if (batchSize >= MIN_BATCH_SIZE) {
          // 找到满足条件的强断点，立即返回
          console.debug(`[debug][IntelligentSegmenter] ✓ 找到强断点: 索引${i}, 间隔${(gap * 1000).toFixed(1)}ms, 批次${batchSize}条`);

          if (IntelligentSegmenter.DEBUG_SUBTITLE_TIMING) {
            console.log(`[IntelligentSegmenter] 断句时间点: ${currentEnd.toFixed(3)}s | 间隔${(gap * 1000).toFixed(1)}ms | ${nextSubtitle.start.toFixed(3)}s`);
          }

          return i;
        } else {
          // 批次太小，加入候选列表
          strongBreakCandidates.push(i);
          console.debug(`[debug][IntelligentSegmenter] 强断点批次过小(${batchSize}条<10条)，记录为候选#${strongBreakCandidates.length}`);

          // 如果已找到3个候选，停止查找
          if (strongBreakCandidates.length >= MAX_RETRIES) {
            break;
          }
        }
      }
    }

    // 第二轮：寻找弱断点（maxGap - minGap > 400ms）
    if (strongBreakCandidates.length === 0) {
      // 没有找到强断点，尝试找弱断点

      // 先计算最小间隔
      let minGap = Infinity;
      for (let i = startIdx + 1; i < endIdx; i++) {
        const prevEnd = subtitles[i - 1].end ||
                       (subtitles[i - 1].start + (subtitles[i - 1].duration || 0));
        const gap = subtitles[i].start - prevEnd;
        minGap = Math.min(minGap, gap);
      }

      // 从后往前找弱断点
      const weakBreakCandidates: number[] = [];

      for (let i = endIdx - 1; i > startIdx; i--) {
        const currentSubtitle = subtitles[i - 1];
        const nextSubtitle = subtitles[i];
        const currentEnd = currentSubtitle.end ||
                          (currentSubtitle.start + (currentSubtitle.duration || 0));
        const gap = nextSubtitle.start - currentEnd;

        if (gap > minGap + WEAK_GAP_DIFF) {
          const batchSize = i - startIdx;

          if (batchSize >= MIN_BATCH_SIZE) {
            // 找到满足条件的弱断点，立即返回
            console.debug(`[debug][IntelligentSegmenter] ✓ 找到弱断点: 索引${i}, 间隔差${((gap - minGap) * 1000).toFixed(1)}ms, 批次${batchSize}条`);

            if (IntelligentSegmenter.DEBUG_SUBTITLE_TIMING) {
              console.log(`[IntelligentSegmenter] 断句时间点: ${currentEnd.toFixed(3)}s | 间隔${(gap * 1000).toFixed(1)}ms | ${nextSubtitle.start.toFixed(3)}s`);
            }

            return i;
          } else {
            // 批次太小，加入候选列表
            weakBreakCandidates.push(i);
            console.debug(`[debug][IntelligentSegmenter] 弱断点批次过小(${batchSize}条<10条)，记录为候选#${weakBreakCandidates.length}`);

            // 如果已找到3个候选，停止查找
            if (weakBreakCandidates.length >= MAX_RETRIES) {
              break;
            }
          }
        }
      }

      // 使用第一个找到的弱断点（如果有）
      if (weakBreakCandidates.length > 0) {
        const firstWeakBreak = weakBreakCandidates[weakBreakCandidates.length - 1];  // 最后一个是最靠前的
        const batchSize = firstWeakBreak - startIdx;
        console.log(`[IntelligentSegmenter] ⚠️ 使用首个弱断点: 索引${firstWeakBreak}（批次${batchSize}条<10条）`);
        return firstWeakBreak;
      }
    } else {
      // 有强断点候选，使用第一个找到的强断点
      const firstStrongBreak = strongBreakCandidates[strongBreakCandidates.length - 1];  // 最后一个是最靠前的
      const batchSize = firstStrongBreak - startIdx;
      console.log(`[IntelligentSegmenter] ⚠️ 使用首个强断点: 索引${firstStrongBreak}（批次${batchSize}条<10条）`);
      return firstStrongBreak;
    }

    // 没找到任何断点，BATCH_SIZE条全部发送
    const batchStartTime = subtitles[startIdx].start;
    const batchEndTime = subtitles[Math.min(endIdx - 1, subtitles.length - 1)].end ||
                        (subtitles[Math.min(endIdx - 1, subtitles.length - 1)].start +
                         (subtitles[Math.min(endIdx - 1, subtitles.length - 1)].duration || 0));

    console.log(`[IntelligentSegmenter] 未找到合适断点，${BATCH_SIZE}条一起发送`);

    if (IntelligentSegmenter.DEBUG_SUBTITLE_TIMING) {
      console.log(`[IntelligentSegmenter] 批次${Math.floor(startIdx / BATCH_SIZE) + 1}: `, {
        批次时间范围: `${batchStartTime.toFixed(3)}s - ${batchEndTime.toFixed(3)}s (总长${(batchEndTime - batchStartTime).toFixed(3)}s)`,
        批次索引范围: `[${startIdx}-${endIdx})`,
        说明: '字幕间隔太小，没有合适的断点'
      });
    }

    return endIdx;
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
    // 前9后30，共40条
    const start = Math.max(0, currentIndex - IntelligentSegmenter.URGENT_BEFORE);
    const end = Math.min(
      subtitles.length, 
      currentIndex + IntelligentSegmenter.URGENT_AFTER + 1
    );
    
    console.log(`[IntelligentSegmenter] 紧急批次:`, {
      当前位置: currentIndex,
      批次范围: `[${start}-${end})`,
      批次大小: end - start,
      前向: currentIndex - start,
      后向: end - currentIndex - 1
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