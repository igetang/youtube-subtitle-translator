/**
 * 简化的看门狗管理器 - 无重试版本
 * 基于 Fail Fast 原则，所有操作5秒超时，无重试机制
 * 
 * @version 3.0
 * @date 2025-09-09
 */

export class SimpleWatchdogManager {
  private static readonly TIMEOUT = 5000;  // 统一5秒超时
  private watchers = new Map<string, NodeJS.Timeout>();
  
  /**
   * 启动单次超时监控（无重试）
   * @param stage - 操作阶段标识
   * @param onTimeout - 超时回调函数
   */
  startWatchdog(stage: string, onTimeout: () => void): void {
    // 清除可能存在的旧看门狗
    this.clearWatchdog(stage);
    
    const timeout = setTimeout(() => {
      console.warn(`[SimpleWatchdog] ${stage} 超时（5秒），执行超时处理`);
      onTimeout();
      this.watchers.delete(stage);
    }, SimpleWatchdogManager.TIMEOUT);
    
    this.watchers.set(stage, timeout);
    console.log(`[SimpleWatchdog] 启动监控: ${stage}`);
  }
  
  /**
   * 操作成功，清除看门狗
   * @param stage - 操作阶段标识
   */
  clearWatchdog(stage: string): void {
    const timeout = this.watchers.get(stage);
    if (timeout) {
      clearTimeout(timeout);
      this.watchers.delete(stage);
      console.log(`[SimpleWatchdog] 清除监控: ${stage}`);
    }
  }
  
  /**
   * 清除所有看门狗
   */
  clearAll(): void {
    for (const [stage, timeout] of this.watchers.entries()) {
      clearTimeout(timeout);
      console.log(`[SimpleWatchdog] 清除监控: ${stage}`);
    }
    this.watchers.clear();
  }
  
  /**
   * 获取当前活跃的看门狗数量
   */
  getActiveCount(): number {
    return this.watchers.size;
  }
  
  /**
   * 获取所有活跃的看门狗阶段
   */
  getActiveStages(): string[] {
    return Array.from(this.watchers.keys());
  }
}