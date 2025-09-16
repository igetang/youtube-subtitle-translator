/**
 * @file timeout-errors.ts
 * @description 超时相关的错误类型定义
 * @version 4.0
 * @date 2025-09-09
 */

/**
 * 阶段超时错误
 * 当某个翻译阶段执行超时时抛出
 */
export class StageTimeoutError extends Error {
  public readonly name = 'StageTimeoutError';
  
  constructor(
    public readonly stage: string,      // 超时的阶段名称
    public readonly timeoutMs: number,  // 设定的超时时间
    public readonly elapsed?: number    // 实际执行时间
  ) {
    super(`阶段 ${stage} 超时(${timeoutMs}ms)${elapsed ? `，实际耗时: ${elapsed}ms` : ''}`);
    Object.setPrototypeOf(this, StageTimeoutError.prototype);
  }
}

/**
 * 会话取消错误
 * 当翻译会话被手动取消时抛出
 */
export class SessionAbortError extends Error {
  public readonly name = 'SessionAbortError';
  
  constructor(
    public readonly sessionId: string,  // 会话ID
    public readonly stage: string,      // 取消时的阶段
    public readonly reason: string = '用户取消'  // 取消原因
  ) {
    super(`会话 ${sessionId} 在 ${stage} 阶段被取消: ${reason}`);
    Object.setPrototypeOf(this, SessionAbortError.prototype);
  }
}

/**
 * 网络错误
 * 网络请求失败时抛出
 */
export class NetworkError extends Error {
  public readonly name = 'NetworkError';
  
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * 翻译API错误
 * 翻译服务返回错误时抛出
 */
export class TranslationAPIError extends Error {
  public readonly name = 'TranslationAPIError';
  
  constructor(
    message: string,
    public readonly service: string,    // 翻译服务名称
    public readonly errorCode?: string  // 错误代码
  ) {
    super(message);
    Object.setPrototypeOf(this, TranslationAPIError.prototype);
  }
}

/**
 * 判断是否为超时错误
 */
export function isTimeoutError(error: any): error is StageTimeoutError {
  return error?.name === 'StageTimeoutError' || 
         error?.name === 'TimeoutError' ||
         (error?.name === 'AbortError' && error?.message?.includes('timeout'));
}

/**
 * 判断是否为取消错误
 */
export function isAbortError(error: any): error is SessionAbortError {
  return error?.name === 'SessionAbortError' || 
         (error?.name === 'AbortError' && !error?.message?.includes('timeout'));
}

/**
 * 判断是否为网络错误
 */
export function isNetworkError(error: any): error is NetworkError {
  return error?.name === 'NetworkError' || 
         error?.message?.includes('Failed to fetch') ||
         error?.message?.includes('Network');
}

/**
 * 错误级别枚举
 */
export enum ErrorLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * 获取错误级别
 */
export function getErrorLevel(error: any): ErrorLevel {
  if (isAbortError(error)) {
    return ErrorLevel.INFO;  // 用户取消，不算错误
  }
  if (isTimeoutError(error)) {
    return ErrorLevel.WARNING;  // 超时，警告级别
  }
  if (isNetworkError(error)) {
    return ErrorLevel.WARNING;  // 网络问题，警告级别
  }
  return ErrorLevel.ERROR;  // 其他错误
}

/**
 * 获取用户友好的错误消息
 */
export function getUserFriendlyMessage(error: any): string {
  if (isTimeoutError(error)) {
    const stageNames: Record<string, string> = {
      'subtitle_fetch': '字幕获取',
      'urgent_translate': '紧急翻译',
      'batch_translate': '批量翻译',
      'api_call': 'API调用'
    };
    const stageName = stageNames[error.stage] || error.stage;
    return `${stageName}超时，请检查网络连接后重试`;
  }
  
  if (isAbortError(error)) {
    return ''; // 用户主动取消，不需要提示
  }
  
  if (isNetworkError(error)) {
    return '网络连接失败，请检查网络设置';
  }
  
  if (error.message?.includes('无字幕')) {
    return '当前视频无字幕';
  }
  
  return '翻译失败，请稍后重试';
}