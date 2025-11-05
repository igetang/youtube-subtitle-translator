/**
 * @file token-estimator.ts
 * @description Token估算工具类
 *
 * 统一的token估算逻辑，适用于OpenAI、Gemini、DeepSeek等Chat API
 *
 * 估算公式：
 * - 输入token估算：inputBytes / 2.5
 * - 输出token估算：inputTokens × 1.5
 * - 简化公式：inputBytes × 0.6
 *
 * 使用场景：
 * - 设置max_tokens/max_completion_tokens参数
 * - 预估API调用成本
 * - 优化API性能（合理的max_tokens可降低延迟）
 */

export class TokenEstimator {
  /**
   * 估算输出token数
   *
   * @param inputText 输入文本
   * @param maxLimit 模型的最大输出token限制
   * @param overhead 额外开销（如JSON格式字符）
   * @returns 估算的输出token数
   *
   * @example
   * // 基本使用
   * const maxTokens = TokenEstimator.estimateOutputTokens("Hello world", 8000);
   *
   * // 带JSON开销
   * const maxTokens = TokenEstimator.estimateOutputTokens(jsonText, 8000, 100);
   */
  static estimateOutputTokens(
    inputText: string,
    maxLimit: number,
    overhead: number = 0
  ): number {
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(inputText).length + overhead;

    // 估算公式：inputBytes / 2.5 × 1.5 = inputBytes × 0.6
    const estimatedInputTokens = inputBytes / 2.5;
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 1.5);

    // 限制在模型最大值范围内
    const maxTokens = Math.min(estimatedOutputTokens, maxLimit);

    return maxTokens;
  }

  /**
   * 估算输出token数（带详细信息）
   *
   * @param inputText 输入文本
   * @param maxLimit 模型的最大输出token限制
   * @param overhead 额外开销
   * @returns 详细的估算信息
   *
   * @example
   * const info = TokenEstimator.estimateOutputTokensWithDetails("Hello", 8000);
   * console.log(info.estimatedOutputTokens); // 估算的输出token数
   * console.log(info.inputBytes); // 输入字节数
   */
  static estimateOutputTokensWithDetails(
    inputText: string,
    maxLimit: number,
    overhead: number = 0
  ): {
    inputBytes: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    maxTokens: number;
  } {
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(inputText).length + overhead;
    const estimatedInputTokens = inputBytes / 2.5;
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 1.5);
    const maxTokens = Math.min(estimatedOutputTokens, maxLimit);

    return {
      inputBytes,
      estimatedInputTokens: Math.round(estimatedInputTokens),
      estimatedOutputTokens,
      maxTokens
    };
  }
}
