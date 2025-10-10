/**
 * @class RateLimitManager - 管理OpenAI API的速率限制
 * 基于API响应中的x-ratelimit-*头部信息动态调整请求策略
 */
export class RateLimitManager {
  private static instance: RateLimitManager;
  
  // 默认限制值（保守估计）
  private defaultLimits = {
    tokensPerMinute: 60000,   // GPT-4默认每分钟60K tokens
    requestsPerMinute: 500,   // GPT-4默认每分钟500请求
  };
  
  // 当前限制值（从API响应头中获取）
  private currentLimits = {
    tokensPerMinute: this.defaultLimits.tokensPerMinute,
    requestsPerMinute: this.defaultLimits.requestsPerMinute,
    remainingTokens: this.defaultLimits.tokensPerMinute,
    remainingRequests: this.defaultLimits.requestsPerMinute,
    resetTokensTime: new Date(Date.now() + 60000), // 默认1分钟后重置
    resetRequestsTime: new Date(Date.now() + 60000), // 默认1分钟后重置
  };
  
  // 记录最近请求
  private recentRequests: {timestamp: number, tokens: number}[] = [];
  
  private constructor() {
    // 每分钟清理一次旧请求记录
    setInterval(() => this.cleanupOldRequests(), 60000);
  }
  
  public static getInstance(): RateLimitManager {
    if (!RateLimitManager.instance) {
      RateLimitManager.instance = new RateLimitManager();
    }
    return RateLimitManager.instance;
  }
  
  /**
   * 更新限制信息（从API响应头）
   */
  public updateLimits(headers: Headers): void {
    const rateLimitRequests = headers.get('x-ratelimit-limit-requests');
    const rateLimitTokens = headers.get('x-ratelimit-limit-tokens');
    const remainingRequests = headers.get('x-ratelimit-remaining-requests');
    const remainingTokens = headers.get('x-ratelimit-remaining-tokens');
    const resetRequests = headers.get('x-ratelimit-reset-requests');
    const resetTokens = headers.get('x-ratelimit-reset-tokens');
    
    if (rateLimitRequests) this.currentLimits.requestsPerMinute = Number(rateLimitRequests);
    if (rateLimitTokens) this.currentLimits.tokensPerMinute = Number(rateLimitTokens);
    if (remainingRequests) this.currentLimits.remainingRequests = Number(remainingRequests);
    if (remainingTokens) this.currentLimits.remainingTokens = Number(remainingTokens);
    
    // 解析重置时间（格式通常为"2023-06-01T12:00:00Z"）
    if (resetRequests) this.currentLimits.resetRequestsTime = new Date(resetRequests);
    if (resetTokens) this.currentLimits.resetTokensTime = new Date(resetTokens);
    
    console.debug('[debug][RateLimitManager] 更新限制信息:', {
      requestsPerMinute: this.currentLimits.requestsPerMinute,
      tokensPerMinute: this.currentLimits.tokensPerMinute,
      remainingRequests: this.currentLimits.remainingRequests,
      remainingTokens: this.currentLimits.remainingTokens,
      resetRequestsTime: this.currentLimits.resetRequestsTime,
      resetTokensTime: this.currentLimits.resetTokensTime
    });
  }
  
  /**
   * 记录请求（用于本地跟踪）
   */
  public recordRequest(tokenCount: number): void {
    this.recentRequests.push({
      timestamp: Date.now(),
      tokens: tokenCount
    });
    
    // 更新本地计数
    this.currentLimits.remainingRequests = Math.max(0, this.currentLimits.remainingRequests - 1);
    this.currentLimits.remainingTokens = Math.max(0, this.currentLimits.remainingTokens - tokenCount);
  }
  
  /**
   * 清理过时的请求记录
   */
  private cleanupOldRequests(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.recentRequests = this.recentRequests.filter(req => req.timestamp > oneMinuteAgo);
  }
  
  /**
   * 获取当前限制使用情况
   */
  public getLimitStatus(): {
    requestsUsed: number;
    tokensUsed: number;
    requestsLimit: number;
    tokensLimit: number;
    requestsRemaining: number;
    tokensRemaining: number;
  } {
    const oneMinuteAgo = Date.now() - 60000;
    
    // 计算过去一分钟内使用的请求数和token数
    const recentStats = this.recentRequests
      .filter(req => req.timestamp > oneMinuteAgo)
      .reduce((acc, req) => {
        acc.requests++;
        acc.tokens += req.tokens;
        return acc;
      }, {requests: 0, tokens: 0});
    
    return {
      requestsUsed: recentStats.requests,
      tokensUsed: recentStats.tokens,
      requestsLimit: this.currentLimits.requestsPerMinute,
      tokensLimit: this.currentLimits.tokensPerMinute,
      requestsRemaining: this.currentLimits.remainingRequests,
      tokensRemaining: this.currentLimits.remainingTokens
    };
  }
  
  /**
   * 计算最佳批处理大小
   * 基于当前限制和使用情况
   */
  public calculateOptimalBatchSize(avgTokensPerItem: number): number {
    const status = this.getLimitStatus();
    
    // 如果tokens几乎耗尽，减少批量大小
    if (status.tokensRemaining < status.tokensLimit * 0.1) {
      return 1; // 最小批量
    }
    
    // 根据剩余tokens和请求限制计算最佳批量大小
    const maxItemsByTokens = Math.floor(status.tokensRemaining / (avgTokensPerItem * 2)); // 因子2考虑输入和输出tokens
    const maxItemsByRequests = Math.ceil(status.requestsRemaining / 5); // 保留一些请求空间
    
    // 取两者的较小值，确保不超过限制
    let optimalBatchSize = Math.min(maxItemsByTokens, maxItemsByRequests);
    
    // 限制在合理范围内
    optimalBatchSize = Math.max(1, Math.min(10, optimalBatchSize));
    
    console.debug(`[debug][RateLimitManager] 计算最佳批量大小: ${optimalBatchSize} (平均每项${avgTokensPerItem}tokens)`);
    return optimalBatchSize;
  }
  
  /**
   * 计算请求延迟时间
   * 如果接近限制，增加延迟以避免超限
   */
  public calculateRequestDelay(): number {
    const status = this.getLimitStatus();
    
    // 如果请求数接近限制，增加延迟
    if (status.requestsRemaining < status.requestsLimit * 0.1) {
      return 1500; // 较长延迟
    } else if (status.requestsRemaining < status.requestsLimit * 0.3) {
      return 500; // 中等延迟
    } else {
      // 添加随机小延迟，避免请求过于集中
      return Math.floor(Math.random() * 50) + 5; // 5-55ms随机延迟
    }
  }
} 