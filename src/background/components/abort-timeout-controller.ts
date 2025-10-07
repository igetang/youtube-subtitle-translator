/**
 * @class AbortTimeoutController - 基于AbortController的超时控制器
 * 采用2025年最佳实践：AbortSignal.timeout()和AbortSignal.any()
 * 符合W3C标准，提供真正的操作取消能力
 * 
 * @version 4.0
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
 * 操作取消错误类
 */
export class AbortError extends Error {
  public readonly name = 'AbortError';
  public readonly stage: string;
  
  constructor(message: string, stage: string) {
    super(message);
    this.stage = stage;
    Object.setPrototypeOf(this, AbortError.prototype);
  }
}

/**
 * 基于AbortController的超时控制器
 * 使用2025年最佳实践实现
 */
export class AbortTimeoutController {
  private static readonly DEFAULT_TIMEOUT = 15000;  // 默认15秒超时（适配OpenAI）
  
  /**
   * 执行带超时控制的异步操作
   * 使用AbortSignal.timeout()实现（2025年标准方法）
   * 
   * @param operation 异步操作函数，接收AbortSignal
   * @param options 配置选项
   * @returns 操作结果或抛出超时错误
   */
  public static async executeWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options: {
      timeoutMs?: number;
      stage?: string;
      fallback?: T;
      userSignal?: AbortSignal;  // 用户提供的取消信号
    } = {}
  ): Promise<T> {
    const {
      timeoutMs = this.DEFAULT_TIMEOUT,
      stage = 'operation',
      fallback,
      userSignal
    } = options;
    
    try {
      // 使用AbortSignal.timeout()创建超时信号（2025年最佳实践）
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      
      // 如果有用户信号，使用AbortSignal.any()组合多个信号
      const signal = userSignal 
        ? AbortSignal.any([userSignal, timeoutSignal])
        : timeoutSignal;
      
      // 检查信号是否已经触发
      if (signal.aborted) {
        throw new AbortError(`操作在开始前已被取消: ${stage}`, stage);
      }
      
      console.log(`[AbortTimeoutController] 开始执行 ${stage}，超时时间: ${timeoutMs}ms`);
      
      // 执行操作，传入信号
      const result = await operation(signal);
      
      console.log(`[AbortTimeoutController] ${stage} 成功完成`);
      return result;
      
    } catch (error: any) {
      // 区分不同类型的错误（2025年最佳实践）
      if (error.name === 'TimeoutError' || 
          (error.name === 'AbortError' && error.message.includes('timeout'))) {
        console.warn(`[AbortTimeoutController] ${stage} 超时（${timeoutMs}ms）`);
        
        if (fallback !== undefined) {
          console.log(`[AbortTimeoutController] 使用降级方案`);
          return fallback;
        }
        
        throw new TimeoutError(
          `${stage} 超时（${timeoutMs}ms）`,
          stage,
          timeoutMs
        );
      }
      
      if (error.name === 'AbortError') {
        console.warn(`[AbortTimeoutController] ${stage} 被用户取消`);
        throw new AbortError(`${stage} 被取消`, stage);
      }
      
      // 其他错误直接抛出
      console.error(`[AbortTimeoutController] ${stage} 执行失败:`, error);
      throw error;
    }
  }
  
  /**
   * 创建一个支持取消的fetch请求
   * 使用2025年Chrome扩展最佳实践
   * 
   * @param url 请求URL
   * @param options fetch选项和超时配置
   * @returns Response对象
   */
  public static async fetchWithTimeout(
    url: string,
    options: RequestInit & {
      timeoutMs?: number;
      stage?: string;
    } = {}
  ): Promise<Response> {
    const { timeoutMs = this.DEFAULT_TIMEOUT, stage = 'fetch', ...fetchOptions } = options;
    
    return this.executeWithTimeout(
      async (signal) => {
        const response = await fetch(url, {
          ...fetchOptions,
          signal
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response;
      },
      { timeoutMs, stage }
    );
  }
  
  /**
   * Chrome扩展消息发送带超时控制
   * 针对Chrome扩展Service Worker优化
   * 
   * @param message 消息内容
   * @param options 配置选项
   * @returns 响应结果
   */
  public static async sendMessageWithTimeout<T = any>(
    message: any,
    options: {
      timeoutMs?: number;
      stage?: string;
      fallback?: T;
    } = {}
  ): Promise<T> {
    const { timeoutMs = this.DEFAULT_TIMEOUT, stage = 'message', fallback } = options;
    
    // 创建AbortController用于取消
    const controller = new AbortController();
    
    return this.executeWithTimeout(
      async (signal) => {
        return new Promise<T>((resolve, reject) => {
          // 监听abort信号
          signal.addEventListener('abort', () => {
            reject(new TimeoutError(
              `消息响应超时: ${stage}`,
              stage,
              timeoutMs
            ));
          });
          
          // 发送消息
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (signal.aborted) {
              // 如果已经超时，忽略响应
              reject(new TimeoutError(
                `消息响应超时: ${stage}`,
                stage,
                timeoutMs
              ));
            } else {
              resolve(response);
            }
          });
        });
      },
      { timeoutMs, stage, fallback, userSignal: controller.signal }
    );
  }
  
  /**
   * 批量执行带超时控制的操作
   * 每个操作独立超时，使用Promise.allSettled
   * 
   * @param operations 操作数组
   * @param options 配置选项
   * @returns 所有操作的结果
   */
  public static async executeAllWithTimeout<T>(
    operations: Array<{
      operation: (signal: AbortSignal) => Promise<T>;
      fallback?: T;
    }>,
    options: {
      timeoutMs?: number;
      stagePrefix?: string;
    } = {}
  ): Promise<PromiseSettledResult<T>[]> {
    const { timeoutMs = this.DEFAULT_TIMEOUT, stagePrefix = 'batch' } = options;
    
    const promises = operations.map(async ({ operation, fallback }, index) => {
      try {
        return await this.executeWithTimeout(
          operation,
          {
            timeoutMs,
            stage: `${stagePrefix}_${index}`,
            fallback
          }
        );
      } catch (error) {
        // 如果有降级值且是超时错误，返回降级值
        if ((error instanceof TimeoutError || error instanceof AbortError) && 
            fallback !== undefined) {
          return fallback;
        }
        throw error;
      }
    });
    
    // 使用allSettled确保所有操作都执行完成
    return Promise.allSettled(promises);
  }
  
  /**
   * 创建一个可手动控制的超时管理器
   * 用于复杂场景，需要手动管理生命周期
   * 
   * @param timeoutMs 超时时间
   * @param stage 阶段标识
   * @returns 控制器和执行函数
   */
  public static createManualController(
    timeoutMs: number = this.DEFAULT_TIMEOUT,
    stage: string = 'manual'
  ): {
    controller: AbortController;
    execute: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
    abort: () => void;
  } {
    const controller = new AbortController();
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    
    // 组合信号
    const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);
    
    return {
      controller,
      execute: async <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
        if (combinedSignal.aborted) {
          throw new AbortError(`操作已被取消: ${stage}`, stage);
        }
        
        try {
          return await operation(combinedSignal);
        } catch (error: any) {
          if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            console.warn(`[AbortTimeoutController] ${stage} 被取消或超时`);
            throw error;
          }
          throw error;
        }
      },
      abort: () => {
        controller.abort();
        console.log(`[AbortTimeoutController] 手动取消操作: ${stage}`);
      }
    };
  }
}