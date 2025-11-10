/**
 * @file retry-handler.ts
 * @description 统一的重试处理器，专门用于翻译服务的429错误处理
 * @version 1.0.0
 *
 * 核心特性:
 * - 基于60秒滑动窗口的智能延迟计算
 * - 支持AbortSignal中断
 * - 最大重试3次
 * - 延迟边界检查: 0 < delay <= 20s, 否则使用20s
 */

import { TranslationError } from '@shared/types/translation-errors';

/**
 * RetryHandler 重试处理器
 * 专门处理翻译API的429错误(Rate Limit)
 */
export class RetryHandler {
  // ========== 常量配置 ==========
  private static readonly MAX_RETRIES = 3;               // 最大重试次数
  private static readonly RATE_LIMIT_WINDOW_MS = 60000;  // 速率限制窗口: 60秒
  private static readonly MIN_DELAY_MS = 20000;          // 最小延迟: 20秒
  private static readonly MAX_DELAY_MS = 20000;          // 最大延迟: 20秒

  /**
   * 执行带重试的操作
   * @param operation 要执行的异步操作
   * @param options 配置选项
   * @returns 操作结果
   */
  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      signal: AbortSignal;
      serviceName: string;
      batchNumber?: number;
      totalBatches?: number;
      maxRetries?: number;
    }
  ): Promise<T> {
    const { signal, serviceName, batchNumber, totalBatches, maxRetries = RetryHandler.MAX_RETRIES } = options;

    let retryCount = 0;
    let batchStartTime = Date.now();  // 记录批次开始时间
    let last429Time = 0;               // 记录上次429错误的时间

    while (retryCount <= maxRetries) {
      // 检查中断信号
      if (signal.aborted) {
        throw new Error('操作已取消');
      }

      try {
        // 执行操作
        const result = await operation();

        // 成功后打印日志(仅在发生过重试时)
        if (retryCount > 0) {
          console.log(
            `[${serviceName}] ✓ 重试成功: ${RetryHandler.formatBatchInfo(batchNumber, totalBatches)} | ` +
            `重试次数: ${retryCount}/${maxRetries}`
          );
        }

        return result;
      } catch (error) {
        // 检查是否是429错误
        if (!RetryHandler.is429Error(error)) {
          // 非429错误直接抛出
          throw error;
        }

        // 达到最大重试次数
        if (retryCount >= maxRetries) {
          console.error(
            `[${serviceName}] ✗ 重试失败: ${RetryHandler.formatBatchInfo(batchNumber, totalBatches)} | ` +
            `已达最大重试次数 ${maxRetries}`
          );
          throw error;
        }

        // 计算智能延迟
        const now = Date.now();
        retryCount++;
        const { delay, rawDelay, usedFallback } = RetryHandler.calculateSmartDelay(retryCount, batchStartTime, last429Time, now);
        last429Time = now;  // 更新上次429时间

        // 打印延迟日志（包含原始计算值和实际使用值）
        if (usedFallback) {
          console.log(
            `[${serviceName}] ⏳ 触发限速(429): ${RetryHandler.formatBatchInfo(batchNumber, totalBatches)} | ` +
            `重试 ${retryCount}/${maxRetries} | 计算延迟=${(rawDelay / 1000).toFixed(1)}s (超出边界) → 实际延迟=${(delay / 1000).toFixed(1)}s`
          );
        } else {
          console.log(
            `[${serviceName}] ⏳ 触发限速(429): ${RetryHandler.formatBatchInfo(batchNumber, totalBatches)} | ` +
            `重试 ${retryCount}/${maxRetries} | 延迟=${(delay / 1000).toFixed(1)}s`
          );
        }

        // 执行延迟
        await RetryHandler.delayWithSignal(delay, signal);
      }
    }

    // 理论上不会到这里,因为上面已经处理了所有情况
    throw new Error('重试逻辑错误');
  }

  /**
   * 智能延迟计算算法
   *
   * 算法说明:
   * 1. 第一次429: delay = 60s - (当前时间 - 批次开始时间)
   * 2. 后续429: delay = 60s - (当前时间 - 上次429时间)
   * 3. 边界检查: 如果 0 < delay <= 20s 则使用, 否则使用20s
   *
   * @param retryCount 当前重试次数(1-3)
   * @param batchStartTime 批次开始时间戳
   * @param last429Time 上次429错误时间戳
   * @param now 当前时间戳
   * @returns 延迟信息 { delay: 实际使用的延迟, rawDelay: 原始计算延迟, usedFallback: 是否使用了兜底值 }
   */
  private static calculateSmartDelay(
    retryCount: number,
    batchStartTime: number,
    last429Time: number,
    now: number
  ): { delay: number; rawDelay: number; usedFallback: boolean } {
    let rawDelay: number;

    if (retryCount === 1) {
      // 第一次429: 基于批次开始时间计算
      const elapsed = now - batchStartTime;
      rawDelay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsed;
    } else {
      // 后续429: 基于上次429时间计算
      const elapsedSinceLast = now - last429Time;

      // 如果距离上次429已经超过60秒,说明窗口已过,使用最小延迟
      if (elapsedSinceLast >= RetryHandler.RATE_LIMIT_WINDOW_MS) {
        return {
          delay: RetryHandler.MIN_DELAY_MS,
          rawDelay: RetryHandler.RATE_LIMIT_WINDOW_MS - elapsedSinceLast,
          usedFallback: true
        };
      }

      rawDelay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsedSinceLast;
    }

    // 边界检查: 0 < delay <= 20s
    if (rawDelay > 0 && rawDelay <= RetryHandler.MAX_DELAY_MS) {
      return {
        delay: rawDelay,
        rawDelay: rawDelay,
        usedFallback: false
      };
    }

    // 超出边界,使用最小延迟
    return {
      delay: RetryHandler.MIN_DELAY_MS,
      rawDelay: rawDelay,
      usedFallback: true
    };
  }

  /**
   * 支持中断的延迟函数
   * @param ms 延迟毫秒数
   * @param signal 中断信号
   */
  private static async delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
        resolve();
      }, ms);

      const abortHandler = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abortHandler);
        reject(new Error('延迟被中断'));
      };

      signal.addEventListener('abort', abortHandler);
    });
  }

  /**
   * 检查错误是否是429错误
   * @param error 错误对象
   * @returns 是否是429错误
   */
  private static is429Error(error: unknown): boolean {
    if (error instanceof TranslationError && error.status !== undefined) {
      return error.status === 429;
    }
    return false;
  }

  /**
   * 格式化批次信息
   * @param batchNumber 批次编号
   * @param totalBatches 总批次数
   * @returns 格式化字符串
   */
  private static formatBatchInfo(batchNumber?: number, totalBatches?: number): string {
    if (batchNumber !== undefined && totalBatches !== undefined) {
      return `批次 ${batchNumber}/${totalBatches}`;
    }
    return '批次未知';
  }
}
