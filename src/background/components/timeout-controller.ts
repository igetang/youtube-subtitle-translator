/**
 * @class TimeoutController - 超时控制器（无重试版本）
 * 基于Promise.race实现真正的超时控制
 * 遵循 Fail Fast 原则，无重试机制
 * 
 * @version 3.0
 * @date 2025-09-09
 */

/**
 * 自定义超时错误类
 */
export class TimeoutError extends Error {
  public readonly name = 'TimeoutError';
  public readonly stage: string;
  public readonly timeoutMs: number;
  
  constructor(message: string, stage: string, timeoutMs: number) {
    super(message);
    this.stage = stage;
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * 超时控制器类（简化版）
 */
export class TimeoutController {
  private static readonly DEFAULT_TIMEOUT = 5000;  // 默认5秒超时
  
  /**
   * 创建一个超时Promise
   * @param ms 超时时间（毫秒）
   * @param stage 阶段标识（用于错误信息）
   * @returns 超时后reject的Promise
   */
  private static timeout(ms: number, stage: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          `${stage} 超时（${ms}ms）`,
          stage,
          ms
        ));
      }, ms);
    });
  }
  
  /**
   * 带超时的执行（无重试）
   * @param task 要执行的任务Promise
   * @param timeoutMs 超时时间（默认5000ms）
   * @param stage 阶段标识（用于日志）
   * @param fallback 可选的降级返回值
   * @returns 执行结果或降级值
   */
  public static async executeWithTimeout<T>(
    task: Promise<T>,
    timeoutMs: number = TimeoutController.DEFAULT_TIMEOUT,
    stage: string = 'operation',
    fallback?: T
  ): Promise<T> {
    try {
      const result = await Promise.race([
        task,
        this.timeout(timeoutMs, stage)
      ]);
      
      console.log(`[TimeoutController] ${stage} 成功完成`);
      return result;
      
    } catch (error) {
      if (error instanceof TimeoutError) {
        if (fallback !== undefined) {
          console.warn(`[TimeoutController] ${stage} 超时（${timeoutMs}ms），使用降级方案`);
          return fallback;
        }
        console.error(`[TimeoutController] ${stage} 超时（${timeoutMs}ms），无降级方案`);
      }
      throw error;
    }
  }
  
  /**
   * 批量执行带超时的任务（每个任务独立超时）
   * @param tasks 任务数组
   * @param timeoutMs 每个任务的超时时间
   * @param stage 阶段标识前缀
   * @returns 所有任务的结果（包括成功和失败）
   */
  public static async executeAllWithTimeout<T>(
    tasks: Array<{
      task: Promise<T>;
      fallback?: T;
    }>,
    timeoutMs: number = TimeoutController.DEFAULT_TIMEOUT,
    stage: string = 'batch'
  ): Promise<PromiseSettledResult<T>[]> {
    const promises = tasks.map(async ({ task, fallback }, index) => {
      try {
        return await this.executeWithTimeout(
          task,
          timeoutMs,
          `${stage}_${index}`,
          fallback
        );
      } catch (error) {
        // 如果有降级值且是超时错误，返回降级值
        if (error instanceof TimeoutError && fallback !== undefined) {
          return fallback;
        }
        throw error;
      }
    });
    
    // 使用 allSettled 确保所有任务都执行完成
    return Promise.allSettled(promises);
  }
  
  /**
   * 创建可取消的超时控制（支持AbortController）
   * @param timeoutMs 超时时间
   * @param stage 阶段标识
   * @returns {controller, timeoutPromise}
   */
  public static createAbortableTimeout(
    timeoutMs: number,
    stage: string
  ): {
    controller: AbortController;
    timeoutPromise: Promise<never>;
  } {
    const controller = new AbortController();
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(
          `${stage} 超时（${timeoutMs}ms）`,
          stage,
          timeoutMs
        ));
      }, timeoutMs);
      
      // 如果外部abort，清除定时器
      controller.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });
    });
    
    return { controller, timeoutPromise };
  }
}