import { RateLimitManager } from '../utils/rate-limit-manager';

/**
 * @class BatchProcessor - 处理字幕批量翻译
 * 负责将字幕数据分组为最优批次，以适应API限制
 */
export class BatchProcessor {
  /**
   * 将字幕分组为最优批次
   * @param subtitles 字幕数组
   * @param avgTokensPerSubtitle 每个字幕的平均token数（估计值）
   * @param maxBatchSize 最大批量大小
   * @returns 批处理数组
   */
  public static createOptimalBatches(
    subtitles: { id: string, text: string }[],
    avgTokensPerSubtitle: number = 0,
    maxBatchSize: number = 8
  ): { id: string, text: string }[][] {
    // 如果没有提供平均token数，则估算
    if (avgTokensPerSubtitle <= 0) {
      avgTokensPerSubtitle = BatchProcessor.estimateTokenCount(subtitles);
    }
    
    // 获取RateLimitManager实例
    const rateLimitManager = RateLimitManager.getInstance();
    
    // 根据当前API限制状态计算最佳批处理大小
    const optimalBatchSize = Math.min(
      maxBatchSize, 
      rateLimitManager.calculateOptimalBatchSize(avgTokensPerSubtitle)
    );
    
    // 创建批次
    const batches: { id: string, text: string }[][] = [];
    for (let i = 0; i < subtitles.length; i += optimalBatchSize) {
      batches.push(subtitles.slice(i, i + optimalBatchSize));
    }
    
    console.log(`[BatchProcessor] 创建了 ${batches.length} 个批次，每批最多 ${optimalBatchSize} 条字幕`);
    return batches;
  }
  
  /**
   * 估算字幕的平均token数
   */
  private static estimateTokenCount(subtitles: { id: string, text: string }[]): number {
    if (subtitles.length === 0) return 0;
    
    // 简单估算：英文约4个字符/token，中文约1.5个字符/token
    // 这是一个粗略估计，实际token数取决于模型的分词器
    const totalLength = subtitles.reduce((sum, subtitle) => sum + subtitle.text.length, 0);
    const avgLength = totalLength / subtitles.length;
    
    // 检测是否包含较多中文字符
    const sampleText = subtitles.slice(0, Math.min(5, subtitles.length))
      .map(s => s.text).join('');
    const chineseCharRatio = (sampleText.match(/[\u4e00-\u9fa5]/g) || []).length / sampleText.length;
    
    // 根据中文字符比例调整token估算
    let avgTokens;
    if (chineseCharRatio > 0.5) {
      // 主要是中文
      avgTokens = avgLength / 1.5;
    } else {
      // 主要是英文或其他语言
      avgTokens = avgLength / 4;
    }
    
    // 添加一些buffer，并四舍五入
    avgTokens = Math.ceil(avgTokens * 1.2);
    
    console.log(`[BatchProcessor] 估算平均每条字幕约 ${avgTokens} tokens (中文比例: ${(chineseCharRatio * 100).toFixed(1)}%)`);
    return avgTokens;
  }
  
  /**
   * 智能合并字幕文本，优化批处理效率
   * @param subtitles 字幕数组
   * @param maxTokensPerBatch 每批次最大token数
   * @returns 合并后的批次
   */
  public static optimizeTextGroups(
    subtitles: { id: string, text: string }[],
    maxTokensPerBatch: number = 1000
  ): { 
    ids: string[], 
    combinedText: string,
    estimatedTokens: number
  }[] {
    if (subtitles.length === 0) return [];
    
    const groups: { 
      ids: string[], 
      combinedText: string,
      estimatedTokens: number
    }[] = [];
    
    let currentGroup = {
      ids: [] as string[],
      combinedText: '',
      estimatedTokens: 0
    };
    
    for (const subtitle of subtitles) {
      // 估算当前字幕的token数
      const hasChineseChars = /[\u4e00-\u9fa5]/.test(subtitle.text);
      const tokenFactor = hasChineseChars ? 1.5 : 4;
      const estimatedTokens = Math.ceil(subtitle.text.length / tokenFactor);
      
      // 如果添加当前字幕会超出限制，或这是个非常长的字幕，创建新组
      if (currentGroup.estimatedTokens > 0 && 
          (currentGroup.estimatedTokens + estimatedTokens > maxTokensPerBatch ||
           estimatedTokens > maxTokensPerBatch / 2)) {
        groups.push({...currentGroup});
        currentGroup = {
          ids: [],
          combinedText: '',
          estimatedTokens: 0
        };
      }
      
      // 添加到当前组
      currentGroup.ids.push(subtitle.id);
      currentGroup.combinedText += (currentGroup.combinedText ? '\n---\n' : '') + subtitle.text;
      currentGroup.estimatedTokens += estimatedTokens;
    }
    
    // 添加最后一组
    if (currentGroup.ids.length > 0) {
      groups.push(currentGroup);
    }
    
    console.log(`[BatchProcessor] 优化后创建了 ${groups.length} 个文本组，平均每组 ${Math.round(subtitles.length / groups.length)} 条字幕`);
    return groups;
  }
} 