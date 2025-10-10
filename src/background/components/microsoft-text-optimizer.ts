/**
 * @file microsoft-text-optimizer.ts
 * @description 微软翻译5000字符滑动窗口优化器
 * 将多条字幕合并到单个Text对象中，最大化利用5000字符容量
 * 基于架构设计文档：docs/guides/microsoft-translate-implementation.md
 */

/**
 * 字幕条目接口
 */
export interface SubtitleEntry {
  id?: string;
  start: number;
  end?: number;
  duration?: number;
  text: string;
  [key: string]: any; // 允许额外字段
}

/**
 * 优化批次接口
 */
export interface OptimizedBatch {
  texts: string[];           // 每个元素是合并后的字幕文本（包含多条字幕）
  indexMapping: number[][];  // 记录每个text包含的原始字幕索引
}

/**
 * 微软翻译文本优化器
 * 实现5000字符滑动窗口 + 智能断句算法
 */
export class MicrosoftTextOptimizer {
  // 微软翻译API限制常量
  private static readonly MAX_CHARS_PER_TEXT = 5000;   // 每个Text对象的最大字符数
  private static readonly MAX_TEXTS_PER_REQUEST = 10;  // 每个请求的最大Text对象数
  private static readonly SEPARATOR = '\n';            // 字幕间分隔符（与谷歌保持一致）
  private static readonly TRUNCATE_SUFFIX = '...';     // 超长字幕截断后缀
  private static readonly SAFE_CHAR_LIMIT = 4900;      // 安全字符限制（留余地）

  /**
   * 将字幕数组重组为优化的微软翻译格式
   * @param subtitles 原始字幕数组
   * @returns 优化后的批次数组，每批最多10个Text对象
   */
  public optimizeBatches(subtitles: SubtitleEntry[]): OptimizedBatch[] {
    if (subtitles.length === 0) {
      return [];
    }

    const startTime = Date.now();
    console.debug(`[debug][MicrosoftTextOptimizer] 开始优化 ${subtitles.length} 条字幕`);

    // 第一步：预处理字幕（清理内部换行符）
    const processedSubtitles = this.preprocessSubtitles(subtitles);

    // 第二步：使用5000字符滑动窗口创建文本组
    const textGroups = this.createTextGroups(processedSubtitles);

    // 第三步：将文本组按10个一批组装成请求批次
    const batches = this.assembleBatches(textGroups);

    const endTime = Date.now();
    const optimizationRate = this.calculateOptimizationRate(subtitles.length, batches.length);

    console.log(`[MicrosoftTextOptimizer] 优化完成：${batches.length} 个批次，耗时 ${endTime - startTime}ms`);
    console.log(`[MicrosoftTextOptimizer] 优化率：${optimizationRate}%（请求减少 ${100 - optimizationRate}%）`);

    return batches;
  }

  /**
   * 预处理字幕，清理内部换行符
   */
  private preprocessSubtitles(subtitles: SubtitleEntry[]): Array<{
    index: number;
    text: string;
    length: number;
  }> {
    return subtitles.map((sub, idx) => {
      // 替换字幕内部的换行符为空格，避免影响分隔符
      const cleanText = sub.text.replace(/\n/g, ' ').trim();
      return {
        index: idx,
        text: cleanText,
        length: cleanText.length
      };
    });
  }

  /**
   * 基于5000字符窗口创建文本分组
   */
  private createTextGroups(processedSubtitles: Array<{
    index: number;
    text: string;
    length: number;
  }>): Array<{
    text: string;
    indices: number[];
  }> {
    const groups: Array<{
      text: string;
      indices: number[];
    }> = [];

    let currentIndex = 0;

    while (currentIndex < processedSubtitles.length) {
      const windowResult = this.createCharWindow(processedSubtitles, currentIndex);
      groups.push(windowResult);
      currentIndex = windowResult.nextIndex;
    }

    // 打印每组的统计信息
    if (groups.length <= 10) {  // 只在组数较少时打印详细信息
      groups.forEach((group, idx) => {
        console.debug(
          `[debug][MicrosoftTextOptimizer] Text组${idx + 1}: ` +
          `${group.indices.length}条字幕, ${group.text.length}字符`
        );
      });
    } else {
      console.debug(`[debug][MicrosoftTextOptimizer] 创建了 ${groups.length} 个Text组`);
    }

    return groups;
  }

  /**
   * 从当前位置创建一个5000字符窗口
   * 实现智能断句，确保不在字幕中间断开
   */
  private createCharWindow(
    subtitles: Array<{ index: number; text: string; length: number }>,
    startIndex: number
  ): {
    text: string;
    indices: number[];
    nextIndex: number;
  } {
    const MAX_CHARS = MicrosoftTextOptimizer.MAX_CHARS_PER_TEXT;
    const SEPARATOR = MicrosoftTextOptimizer.SEPARATOR;

    const texts: string[] = [];
    const indices: number[] = [];
    let currentLength = 0;
    let i = startIndex;

    // 向前查找，直到接近5000字符限制
    while (i < subtitles.length) {
      const subtitle = subtitles[i];

      // 计算加入这条字幕后的总长度（包括分隔符）
      const separatorLength = texts.length > 0 ? SEPARATOR.length : 0;
      const newLength = currentLength + separatorLength + subtitle.text.length;

      // 如果加入后超过限制
      if (newLength > MAX_CHARS) {
        // 特殊情况：单条字幕就超限
        if (texts.length === 0) {
          console.warn(
            `[MicrosoftTextOptimizer] 警告: 字幕${subtitle.index}超长` +
            `(${subtitle.text.length}字符)，执行截断处理`
          );
          // 截断处理（保留前4900字符，留余地给省略号）
          const truncated = this.truncateText(subtitle.text, MicrosoftTextOptimizer.SAFE_CHAR_LIMIT);
          texts.push(truncated);
          indices.push(subtitle.index);
          i++;
        }
        // 否则在此断开，不包含当前字幕
        break;
      }

      // 加入当前字幕
      texts.push(subtitle.text);
      indices.push(subtitle.index);
      currentLength = newLength;
      i++;
    }

    // 组合文本
    const combinedText = texts.join(SEPARATOR);

    return {
      text: combinedText,
      indices: indices,
      nextIndex: i
    };
  }

  /**
   * 将文本组装配成批次，每批最多10个Text对象
   */
  private assembleBatches(textGroups: Array<{
    text: string;
    indices: number[];
  }>): OptimizedBatch[] {
    const batches: OptimizedBatch[] = [];
    const MAX_TEXTS = MicrosoftTextOptimizer.MAX_TEXTS_PER_REQUEST;

    for (let i = 0; i < textGroups.length; i += MAX_TEXTS) {
      const batchGroups = textGroups.slice(i, i + MAX_TEXTS);

      batches.push({
        texts: batchGroups.map(g => g.text),
        indexMapping: batchGroups.map(g => g.indices)
      });
    }

    return batches;
  }

  /**
   * 将微软翻译的响应重新映射到原始字幕
   * @param translatedTexts 微软API返回的翻译文本数组
   * @param indexMapping 每个text包含的字幕索引
   * @param originalCount 原始字幕总数
   * @returns 映射后的翻译结果数组
   */
  public mapResults(
    translatedTexts: string[],
    indexMapping: number[][],
    originalCount: number
  ): string[] {
    const results = new Array(originalCount).fill('');
    const SEPARATOR = MicrosoftTextOptimizer.SEPARATOR;

    console.debug(`[debug][MicrosoftTextOptimizer] 开始映射翻译结果到 ${originalCount} 条原始字幕`);

    // 遍历每个翻译后的文本
    for (let i = 0; i < translatedTexts.length; i++) {
      const translatedText = translatedTexts[i];
      const subtitleIndices = indexMapping[i];

      if (!subtitleIndices || subtitleIndices.length === 0) {
        continue;
      }

      // 按分隔符分割翻译结果
      const translatedParts = translatedText.split(SEPARATOR);

      // 检查分割是否匹配
      if (translatedParts.length !== subtitleIndices.length) {
        console.warn(
          `[MicrosoftTextOptimizer] Text组${i + 1}分割不匹配: ` +
          `期望${subtitleIndices.length}条，实际${translatedParts.length}条，` +
          `使用降级策略`
        );

        // 降级策略：按比例分配或使用完整文本
        const fallbackParts = this.applyFallbackStrategy(
          translatedText,
          subtitleIndices.length
        );

        subtitleIndices.forEach((originalIndex, j) => {
          results[originalIndex] = fallbackParts[j] || translatedText;
        });
      } else {
        // 正常映射
        subtitleIndices.forEach((originalIndex, j) => {
          results[originalIndex] = translatedParts[j].trim();
        });
      }
    }

    // 验证映射完整性
    const unmappedCount = results.filter(r => r === '').length;
    if (unmappedCount > 0) {
      console.warn(`[MicrosoftTextOptimizer] 警告: ${unmappedCount} 条字幕未能映射到翻译结果`);
    }

    return results;
  }

  /**
   * 截断超长文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const suffix = MicrosoftTextOptimizer.TRUNCATE_SUFFIX;
    const truncateLength = maxLength - suffix.length;

    // 尝试在单词边界截断
    const truncated = text.substring(0, truncateLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');

    if (lastSpaceIndex > truncateLength * 0.8) {
      // 如果找到的空格位置合适（不会损失太多内容）
      return truncated.substring(0, lastSpaceIndex) + suffix;
    }

    return truncated + suffix;
  }

  /**
   * 降级策略：当翻译结果分割不匹配时的处理
   */
  private applyFallbackStrategy(text: string, expectedCount: number): string[] {
    if (expectedCount <= 1) {
      return [text];
    }

    // 策略1：尝试按其他分隔符分割
    const altSeparators = ['. ', '。', '! ', '！', '? ', '？'];
    for (const sep of altSeparators) {
      if (text.includes(sep)) {
        const parts = text.split(sep);
        if (parts.length === expectedCount) {
          return parts.map((p, i) => i < parts.length - 1 ? p + sep.trim() : p);
        }
      }
    }

    // 策略2：按比例分配文本
    const avgLength = Math.ceil(text.length / expectedCount);
    const parts: string[] = [];

    for (let i = 0; i < expectedCount; i++) {
      const start = i * avgLength;
      const end = Math.min((i + 1) * avgLength, text.length);
      parts.push(text.substring(start, end).trim());
    }

    return parts;
  }

  /**
   * 计算优化率
   */
  private calculateOptimizationRate(originalCount: number, batchCount: number): number {
    // 原始请求数（每10条一批）
    const originalRequests = Math.ceil(originalCount / 10);
    // 优化后的请求数
    const optimizedRequests = batchCount;

    if (originalRequests === 0) {
      return 0;
    }

    // 优化率 = (优化后 / 原始) * 100
    return Math.round((optimizedRequests / originalRequests) * 100);
  }

  /**
   * 预估优化效果（用于测试和调试）
   * @param subtitleCount 字幕总数
   * @param avgLength 平均字幕长度
   * @returns 预估信息
   */
  public estimateOptimization(
    subtitleCount: number,
    avgLength: number = 50
  ): {
    originalRequests: number;
    optimizedRequests: number;
    reductionRate: number;
    textsPerRequest: number;
  } {
    // 原始方案：每条字幕一个Text，每10个Text一个请求
    const originalRequests = Math.ceil(subtitleCount / 10);

    // 优化方案：估算每个Text可以容纳的字幕数
    const subtitlesPerText = Math.floor(
      MicrosoftTextOptimizer.MAX_CHARS_PER_TEXT / (avgLength + 1)
    );

    // 计算需要的Text数
    const textCount = Math.ceil(subtitleCount / subtitlesPerText);

    // 计算请求数
    const optimizedRequests = Math.ceil(
      textCount / MicrosoftTextOptimizer.MAX_TEXTS_PER_REQUEST
    );

    const reductionRate = Math.round(
      ((originalRequests - optimizedRequests) / originalRequests) * 100
    );

    console.debug(
      `[debug][MicrosoftTextOptimizer] 预估优化效果:\n` +
      `  - ${subtitleCount}条字幕（平均${avgLength}字符/条）\n` +
      `  - 原始方案: ${originalRequests}个请求\n` +
      `  - 优化方案: ${optimizedRequests}个请求\n` +
      `  - 请求减少: ${reductionRate}%\n` +
      `  - 每个Text约${subtitlesPerText}条字幕`
    );

    return {
      originalRequests,
      optimizedRequests,
      reductionRate,
      textsPerRequest: subtitlesPerText
    };
  }
}