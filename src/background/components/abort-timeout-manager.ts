/**
 * @file abort-timeout-manager.ts
 * @description 基于AbortController的超时管理器
 * 管理所有翻译会话的生命周期，提供统一的超时控制
 * @version 4.0
 * @date 2025-09-09
 */

import { TranslationSession } from './translation-session';

/**
 * 会话信息
 */
interface SessionInfo {
  main: AbortController;
  session: TranslationSession;
  stage: string;
  startTime: number;
}

/**
 * AbortTimeoutManager - 翻译会话管理器
 * 负责创建、管理和清理所有翻译会话
 */
export class AbortTimeoutManager {
  // 存储所有活跃的会话
  private sessions = new Map<string, SessionInfo>();
  
  /**
   * 创建一个新的翻译会话
   * @param sessionId 会话标识符，通常是 translate_${tabId}_${videoId}
   * @returns 新创建的TranslationSession实例
   */
  createSession(sessionId: string): TranslationSession {
    // 如果已存在同ID会话，先清理
    if (this.sessions.has(sessionId)) {
      console.warn(`[AbortTimeoutManager] 会话 ${sessionId} 已存在，将先清理旧会话`);
      this.abortSession(sessionId, '新会话创建，清理旧会话');
    }
    
    // 创建新的主控制器
    const mainController = new AbortController();
    
    // 创建会话实例
    const session = new TranslationSession(sessionId, mainController, this);
    
    // 存储会话信息
    this.sessions.set(sessionId, {
      main: mainController,
      session,
      stage: 'init',
      startTime: Date.now()
    });
    
    console.debug(`[debug][AbortTimeoutManager] 创建会话: ${sessionId}`);
    return session;
  }
  
  /**
   * 更新会话阶段
   * @param sessionId 会话ID
   * @param stage 新阶段名称
   */
  updateSessionStage(sessionId: string, stage: string): void {
    const sessionInfo = this.sessions.get(sessionId);
    if (sessionInfo) {
      sessionInfo.stage = stage;
      // 删除外层"进入阶段"日志（内层TranslationSession已打印"开始执行"）
    }
  }
  
  /**
   * 取消特定会话
   * @param sessionId 要取消的会话ID
   * @param reason 取消原因（如：'用户主动取消'、'超时'、'Tab关闭'等）
   */
  abortSession(sessionId: string, reason: string = '未知原因'): void {
    const sessionInfo = this.sessions.get(sessionId);
    if (sessionInfo) {
      const elapsed = Date.now() - sessionInfo.startTime;
      console.log(
        `[AbortTimeoutManager] 取消会话: ${sessionId} | 原因: ${reason} | 阶段: ${sessionInfo.stage} | 耗时: ${elapsed}ms`
      );

      // 触发abort信号，传入详细的错误对象
      const abortReason = new Error(`会话取消: ${reason} (阶段: ${sessionInfo.stage}, 耗时: ${elapsed}ms)`);
      (abortReason as any).code = 'SESSION_ABORTED';
      (abortReason as any).sessionId = sessionId;
      (abortReason as any).stage = sessionInfo.stage;
      (abortReason as any).elapsed = elapsed;
      (abortReason as any).abortReason = reason;

      sessionInfo.main.abort(abortReason);

      // 从映射中删除
      this.sessions.delete(sessionId);
    }
  }
  
  /**
   * 完成会话（正常结束）
   * @param sessionId 会话ID
   */
  completeSession(sessionId: string): void {
    const sessionInfo = this.sessions.get(sessionId);
    if (sessionInfo) {
      const elapsed = Date.now() - sessionInfo.startTime;
      console.log(`[AbortTimeoutManager] 完成会话: ${sessionId}，总耗时: ${elapsed}ms`);
      
      // 只删除记录，不触发abort
      this.sessions.delete(sessionId);
    }
  }
  
  /**
   * 检查会话是否存在
   * @param sessionId 会话ID
   * @returns 是否存在
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
  
  /**
   * 获取会话信息
   * @param sessionId 会话ID
   * @returns 会话信息或undefined
   */
  getSessionInfo(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * 获取活跃会话数量
   * @returns 活跃会话数
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
  
  /**
   * 获取所有活跃会话ID
   * @returns 会话ID数组
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
  
  /**
   * 清理所有会话
   */
  cleanup(): void {
    console.log(`[AbortTimeoutManager] 清理所有会话，当前数量: ${this.sessions.size}`);

    for (const [sessionId] of this.sessions) {
      // 使用abortSession统一处理，传入清理原因
      this.abortSession(sessionId, 'Service Worker清理');
    }

    // 清空映射（abortSession中已经delete，这里再确保清空）
    this.sessions.clear();
  }
  
  /**
   * 清理超时的会话（可选功能）
   * @param maxAge 最大存活时间（毫秒）
   */
  cleanupOldSessions(maxAge: number = 60000): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [sessionId, sessionInfo] of this.sessions) {
      if (now - sessionInfo.startTime > maxAge) {
        toDelete.push(sessionId);
      }
    }
    
    for (const sessionId of toDelete) {
      console.warn(`[AbortTimeoutManager] 清理超时会话: ${sessionId}`);
      this.abortSession(sessionId, `会话超时 (超过${maxAge}ms)`);
    }
  }
}

// 导出单例实例
export const abortTimeoutManager = new AbortTimeoutManager();