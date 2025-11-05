/**
 * @file translation-session.ts
 * @description 翻译会话类，封装单个翻译会话的超时控制
 * 使用AbortController + AbortSignal.timeout()实现精确的超时控制
 * @version 4.0
 * @date 2025-09-09
 */

import type { AbortTimeoutManager } from './abort-timeout-manager';
import { StageTimeoutError, SessionAbortError } from '../../shared/types/timeout-errors';

/**
 * 阶段执行选项
 */
export interface StageOptions<T> {
  timeoutMs?: number;      // 超时时间，默认5000ms
  fallback?: T;            // 降级返回值
  critical?: boolean;      // 是否关键阶段（失败终止流程）
}

/**
 * TranslationSession - 单个翻译会话
 * 封装会话级别的超时控制和阶段管理
 */
export class TranslationSession {
  private aborted = false;
  
  constructor(
    private readonly sessionId: string,
    private readonly mainController: AbortController,
    private readonly manager: AbortTimeoutManager
  ) {}
  
  /**
   * 检查会话是否已被取消
   */
  isAborted(): boolean {
    return this.aborted || this.mainController.signal.aborted;
  }
  
  /**
   * 为特定阶段创建组合信号
   * 组合主控制器信号（手动取消）和超时信号（自动超时）
   * 
   * @param stage 阶段名称
   * @param timeoutMs 超时时间（毫秒）
   * @returns 组合后的AbortSignal
   */
  createStageSignal(stage: string, timeoutMs: number = 5000): AbortSignal {
    // 检查是否已经被取消
    if (this.isAborted()) {
      // 返回一个已经abort的信号
      const abortedController = new AbortController();
      abortedController.abort();
      return abortedController.signal;
    }
    
    try {
      // 使用AbortSignal.timeout()创建超时信号（2025最佳实践）
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      
      // 组合：主控制器信号 + 阶段超时信号
      // 任一信号触发都会导致abort
      return AbortSignal.any([
        this.mainController.signal,  // 手动取消
        timeoutSignal                 // 自动超时
      ]);
    } catch (error) {
      // 兼容性处理：如果浏览器不支持AbortSignal.timeout或AbortSignal.any
      console.warn('[TranslationSession] AbortSignal.timeout/any不可用，使用降级方案');
      
      // 降级方案：手动实现超时
      const stageController = new AbortController();
      
      // 监听主控制器
      if (this.mainController.signal.aborted) {
        stageController.abort();
      } else {
        this.mainController.signal.addEventListener('abort', () => {
          stageController.abort();
        });
      }
      
      // 设置超时
      const timeoutId = setTimeout(() => {
        stageController.abort();
      }, timeoutMs);
      
      // 清理定时器
      stageController.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });
      
      return stageController.signal;
    }
  }
  
  /**
   * 执行带超时控制的阶段任务
   * 
   * @param stage 阶段名称（如：subtitle_fetch, urgent_translate等）
   * @param operation 要执行的异步操作，接收AbortSignal参数
   * @param options 执行选项
   * @returns 操作结果或降级值
   */
  async executeStage<T>(
    stage: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: StageOptions<T> = {}
  ): Promise<T> {
    const { 
      timeoutMs = 5000, 
      fallback,
      critical = false 
    } = options;
    
    // 检查会话是否已被取消
    if (this.isAborted()) {
      throw new SessionAbortError(this.sessionId, stage, '会话已被取消');
    }
    
    // 更新会话阶段
    this.manager.updateSessionStage(this.sessionId, stage);
    
    // 创建阶段信号
    const signal = this.createStageSignal(stage, timeoutMs);
    
    // 记录开始时间
    const startTime = Date.now();
    
    try {
      console.debug(`[debug][TranslationSession] → 开始执行: ${stage}，超时: ${timeoutMs}ms`);
      
      // 执行操作
      const result = await operation(signal);
      
      // 记录成功
      const elapsed = Date.now() - startTime;
      console.debug(`[debug][TranslationSession] ✓ ${stage} 成功，耗时: ${elapsed}ms`);
      
      return result;
      
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      
      // 区分错误类型
      if (error.name === 'TimeoutError' || 
          (error.name === 'AbortError' && error.message?.includes('timeout'))) {
        // 超时错误
        console.error(`[TranslationSession] ✗ ${stage} 超时，耗时: ${elapsed}ms`);
        
        if (fallback !== undefined && !critical) {
          console.log(`[TranslationSession] → 使用降级方案: ${stage}`);
          return fallback;
        }
        
        throw new StageTimeoutError(stage, timeoutMs, elapsed);
        
      } else if (error.name === 'AbortError') {
        // 手动取消
        console.log(`[TranslationSession] ✗ ${stage} 被手动取消，耗时: ${elapsed}ms`);
        this.aborted = true;
        throw new SessionAbortError(this.sessionId, stage, '用户取消操作');
        
      } else {
        // 其他错误 - 改为debug（避免重复打印，真正的错误已在底层打印）
        console.debug(`[debug][TranslationSession] ${stage} 失败，耗时: ${elapsed}ms`);

        if (fallback !== undefined && !critical) {
          console.log(`[TranslationSession] → 使用降级方案处理错误: ${stage}`);
          return fallback;
        }

        throw error;
      }
    }
  }
  
  /**
   * 并行执行多个阶段任务
   * 每个任务独立超时控制
   * 
   * @param stages 阶段任务数组
   * @returns 所有任务的结果（包括成功和失败）
   */
  async executeStagesInParallel<T>(
    stages: Array<{
      name: string;
      operation: (signal: AbortSignal) => Promise<T>;
      options?: StageOptions<T>;
    }>
  ): Promise<PromiseSettledResult<T>[]> {
    // 检查会话是否已被取消
    if (this.isAborted()) {
      throw new SessionAbortError(this.sessionId, 'parallel', '会话已被取消');
    }
    
    const promises = stages.map(({ name, operation, options }) => 
      this.executeStage(name, operation, options)
    );
    
    // 使用allSettled确保所有操作都执行完成
    return Promise.allSettled(promises);
  }
  
  /**
   * 手动取消会话
   * @param reason 取消原因
   */
  abort(reason: string = '手动取消'): void {
    if (!this.aborted) {
      // 改为debug，避免与AbortTimeoutManager重复打印
      console.debug(`[debug][TranslationSession] ✗ 取消会话 ${this.sessionId}: ${reason}`);
      this.aborted = true;
      this.mainController.abort();
      this.manager.abortSession(this.sessionId, reason);
    }
  }
  
  /**
   * 完成会话（正常结束）
   */
  complete(): void {
    if (!this.aborted) {
      console.debug(`[TranslationSession] ✓ 完成会话 ${this.sessionId}`);
      this.manager.completeSession(this.sessionId);
    }
  }
  
  /**
   * 获取会话ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
  
  /**
   * 获取主控制器信号
   * 用于传递给需要监听取消事件的操作
   */
  getMainSignal(): AbortSignal {
    return this.mainController.signal;
  }
}
