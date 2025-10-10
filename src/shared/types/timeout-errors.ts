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
 * 将所有技术性错误转换为用户易懂的提示
 */
export function getUserFriendlyMessage(error: any): string {
  // 1. 用户取消操作
  if (isAbortError(error)) {
    return ''; // 用户主动取消，不需要提示
  }

  // 2. 网络超时（去掉阶段名称）
  if (isTimeoutError(error)) {
    return '网络超时，请检查网络连接后重试';
  }

  // 3. 网络连接失败
  if (isNetworkError(error)) {
    return '网络连接失败，请检查网络设置';
  }

  const errorMsg = error.message || error.toString() || '';

  // 4. API密钥未配置
  if (errorMsg.includes('API密钥未配置') || errorMsg.includes('apiKey')) {
    if (errorMsg.includes('OpenAI')) {
      return 'OpenAI服务未配置，请在设置中添加API密钥';
    }
    if (errorMsg.includes('DeepSeek')) {
      return 'DeepSeek服务未配置，请在设置中添加API密钥';
    }
    if (errorMsg.includes('Gemini')) {
      return 'Gemini服务未配置，请在设置中添加API密钥';
    }
    return '翻译服务未配置，请在设置中添加API密钥';
  }

  // 5. API密钥无效
  if (errorMsg.includes('密钥无效') || errorMsg.includes('密钥验证失败') ||
      errorMsg.includes('401') || errorMsg.includes('403')) {
    return 'API密钥验证失败，请检查设置';
  }

  // 6. API速率限制
  if (errorMsg.includes('速率限制') || errorMsg.includes('429')) {
    return '请求过于频繁，请稍后重试';
  }

  // 7. 服务暂时不可用
  if (errorMsg.includes('服务暂时不可用') || errorMsg.includes('服务器') ||
      errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
    return '翻译服务暂时不可用，请稍后重试';
  }

  // 8. 批次翻译失败（提取真正原因，去掉批次号）
  if (errorMsg.includes('批次') && errorMsg.includes('-')) {
    const parts = errorMsg.split('-');
    if (parts.length > 1) {
      const realError = parts[1].trim();
      // 递归调用以获取真正的友好提示
      return getUserFriendlyMessage({ message: realError });
    }
  }

  // 9. 翻译数量不匹配（不告诉用户技术细节）
  if (errorMsg.includes('数量不匹配') || errorMsg.includes('期望') && errorMsg.includes('实际')) {
    return '翻译服务响应异常，请重试';
  }

  // 10. API返回格式错误
  if (errorMsg.includes('返回格式') || errorMsg.includes('响应格式') ||
      errorMsg.includes('返回内容为空') || errorMsg.includes('JSON')) {
    return '翻译服务响应异常，请重试';
  }

  // 11. 无字幕
  if (errorMsg.includes('无字幕')) {
    return '当前视频无字幕';
  }

  // 12. 字幕获取失败
  if (errorMsg.includes('字幕获取失败') || errorMsg.includes('字幕捕获')) {
    return '字幕获取失败，请重试';
  }

  // 13. Google端点失败
  if (errorMsg.includes('Google') && errorMsg.includes('端点')) {
    return '翻译服务暂时不可用，请稍后重试';
  }

  // 14. 默认通用错误
  return '翻译失败，请稍后重试';
}