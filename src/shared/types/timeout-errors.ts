import { TranslationError } from './translation-errors';

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

function getI18nMessage(key: string, fallback: string): string {
  if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
    const message = chrome.i18n.getMessage(key);
    if (message) {
      return message;
    }
  }
  return fallback;
}

/**
 * 针对常见错误文案的友好提示映射
 * 所有字符串匹配均使用includes（区分大小写），满足全部关键字才命中
 */
const USER_MESSAGE_HINTS: Array<{
  keywords: string[];
  messageKey: string;
  fallback: string;
}> = [
  { keywords: ['openai', '未配置'], messageKey: 'error_openai_service_not_configured', fallback: 'OpenAI服务未配置，请在设置中添加API密钥' },
  { keywords: ['openai', 'not configured'], messageKey: 'error_openai_service_not_configured', fallback: 'OpenAI service is not configured. Please add an API key in settings.' },
  { keywords: ['deepseek', '未配置'], messageKey: 'error_deepseek_service_not_configured', fallback: 'DeepSeek服务未配置，请在设置中添加API密钥' },
  { keywords: ['deepseek', 'not configured'], messageKey: 'error_deepseek_service_not_configured', fallback: 'DeepSeek service is not configured. Please add an API key in settings.' },
  { keywords: ['gemini', '未配置'], messageKey: 'error_gemini_service_not_configured', fallback: 'Gemini服务未配置，请在设置中添加API密钥' },
  { keywords: ['gemini', 'not configured'], messageKey: 'error_gemini_service_not_configured', fallback: 'Gemini service is not configured. Please add an API key in settings.' },
  { keywords: ['deepl', '未配置'], messageKey: 'error_translation_service_not_configured', fallback: '翻译服务未配置，请在设置中添加API密钥' },
  { keywords: ['deepl', 'not configured'], messageKey: 'error_translation_service_not_configured', fallback: 'Translation service is not configured. Please add an API key in settings.' },
  { keywords: ['qwen', '未配置'], messageKey: 'error_translation_service_not_configured', fallback: '翻译服务未配置，请在设置中添加API密钥' },
  { keywords: ['qwen', 'not configured'], messageKey: 'error_translation_service_not_configured', fallback: 'Translation service is not configured. Please add an API key in settings.' },
  { keywords: ['密钥', '未配置'], messageKey: 'error_translation_service_not_configured', fallback: '翻译服务未配置，请在设置中添加API密钥' },
  { keywords: ['key', 'not configured'], messageKey: 'error_translation_service_not_configured', fallback: 'Translation service is not configured. Please add an API key in settings.' },
  { keywords: ['apikey'], messageKey: 'error_translation_service_not_configured', fallback: 'Translation service is not configured. Please add an API key in settings.' },
  { keywords: ['密钥', '无效'], messageKey: 'error_api_key_validation_failed', fallback: 'API密钥验证失败，请检查设置' },
  { keywords: ['key', 'invalid'], messageKey: 'error_api_key_validation_failed', fallback: 'API key validation failed, please check settings' },
  { keywords: ['拦截器超时'], messageKey: 'error_network_timeout_retry', fallback: '网络超时，请检查网络连接后重试' },
  { keywords: ['interceptor', 'timeout'], messageKey: 'error_network_timeout_retry', fallback: 'Network timeout, please check your connection and retry' },
  { keywords: ['速率限制'], messageKey: 'error_rate_limit', fallback: '请求过于频繁，请稍后重试' },
  { keywords: ['rate limit'], messageKey: 'error_rate_limit', fallback: 'Too many requests, please try again later' },
  { keywords: ['暂时不支持当前设置的语种'], messageKey: 'error_translation_language_not_supported', fallback: '当前翻译服务暂不支持该语言' },
  { keywords: ['当前设置的语种'], messageKey: 'error_translation_language_not_supported', fallback: '当前翻译服务暂不支持该语言' },
  { keywords: ['language', 'not supported'], messageKey: 'error_translation_language_not_supported', fallback: 'The current translation service does not support this language' },
  { keywords: ['请求参数错误'], messageKey: 'error_translation_config_error', fallback: '翻译配置异常，请检查设置' },
  { keywords: ['request', 'parameter', 'error'], messageKey: 'error_translation_config_error', fallback: 'Translation configuration error, please check settings' },
  { keywords: ['服务暂时不可用'], messageKey: 'error_translation_service_unavailable', fallback: '翻译服务暂时不可用，请稍后重试' },
  { keywords: ['service', 'temporarily', 'unavailable'], messageKey: 'error_translation_service_unavailable', fallback: 'Translation service temporarily unavailable, please try again later' },
  { keywords: ['返回格式'], messageKey: 'error_translation_service_response_abnormal', fallback: '翻译服务响应异常，请重试' },
  { keywords: ['响应格式'], messageKey: 'error_translation_service_response_abnormal', fallback: '翻译服务响应异常，请重试' },
  { keywords: ['response', 'format'], messageKey: 'error_translation_service_response_abnormal', fallback: 'Translation service responded unexpectedly, please retry' },
  { keywords: ['字幕获取失败'], messageKey: 'error_subtitle_fetch_failed', fallback: '字幕获取失败，请重试' },
  { keywords: ['subtitle', 'failed'], messageKey: 'error_subtitle_fetch_failed', fallback: 'Failed to fetch subtitles, please retry' }
];

/**
 * 获取错误级别
 */
export function getErrorLevel(error: any): ErrorLevel {
  if (error instanceof TranslationError) {
    return error.category === 'fatal' ? ErrorLevel.ERROR : ErrorLevel.WARNING;
  }
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
  if (isAbortError(error)) {
    return '';
  }

  if (isTimeoutError(error)) {
    return getI18nMessage('error_network_timeout_retry', '网络超时，请检查网络连接后重试');
  }

  if (isNetworkError(error)) {
    return getI18nMessage('error_network_connection_failed', '网络连接失败，请检查网络设置');
  }

  const rawMessage =
    typeof error?.message === 'string' && error.message.length > 0
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const normalizedMessage = rawMessage.toLowerCase();

  if (error instanceof TranslationError) {
    if (error.status === 401 || error.status === 403) {
      return getI18nMessage('error_api_key_validation_failed', 'API密钥验证失败，请检查设置');
    }
    if (error.status === 429) {
      return getI18nMessage('error_rate_limit', '请求过于频繁，请稍后重试');
    }
    if (error.status && [500, 502, 503].includes(error.status)) {
      return getI18nMessage('error_translation_service_unavailable', '翻译服务暂时不可用，请稍后重试');
    }
  }

  for (const hint of USER_MESSAGE_HINTS) {
    const hit = hint.keywords.every(keyword =>
      normalizedMessage.includes(keyword.toLowerCase())
    );
    if (hit) {
      return getI18nMessage(hint.messageKey, hint.fallback);
    }
  }

  if (normalizedMessage.includes('401') || normalizedMessage.includes('403')) {
    return getI18nMessage('error_api_key_validation_failed', 'API密钥验证失败，请检查设置');
  }

  if (normalizedMessage.includes('429')) {
    return getI18nMessage('error_rate_limit', '请求过于频繁，请稍后重试');
  }

  if (normalizedMessage.includes('服务器') || normalizedMessage.includes('server error')) {
    return getI18nMessage('error_translation_service_unavailable', '翻译服务暂时不可用，请稍后重试');
  }

  if (normalizedMessage.includes('批次') && normalizedMessage.includes('-')) {
    const parts = rawMessage.split('-');
    if (parts.length > 1) {
      const realError = parts[1].trim();
      return getUserFriendlyMessage({ message: realError });
    }
  }

  if (
    normalizedMessage.includes('数量不匹配') ||
    (normalizedMessage.includes('expected') && normalizedMessage.includes('actual'))
  ) {
    return getI18nMessage('error_translation_service_response_abnormal', '翻译服务响应异常，请重试');
  }

  if (
    normalizedMessage.includes('返回格式') ||
    normalizedMessage.includes('响应格式') ||
    normalizedMessage.includes('返回内容为空') ||
    normalizedMessage.includes('response format') ||
    normalizedMessage.includes('json')
  ) {
    return getI18nMessage('error_translation_service_response_abnormal', '翻译服务响应异常，请重试');
  }

  if (normalizedMessage.includes('无字幕') || normalizedMessage.includes('no subtitles')) {
    return getI18nMessage('error_no_subtitles', '当前视频无字幕');
  }

  if (
    normalizedMessage.includes('字幕获取失败') ||
    normalizedMessage.includes('字幕捕获') ||
    (normalizedMessage.includes('subtitle') && normalizedMessage.includes('failed'))
  ) {
    return getI18nMessage('error_subtitle_fetch_failed', '字幕获取失败，请重试');
  }

  // 语言冲突错误
  if (
    normalizedMessage.includes('翻译语言选择前后相同') ||
    normalizedMessage.includes('语言相同') ||
    normalizedMessage.includes('same language')
  ) {
    return getI18nMessage('error_same_language', '源语言和目标语言相同，无需翻译');
  }

  if (
    (normalizedMessage.includes('google') && normalizedMessage.includes('端点')) ||
    (normalizedMessage.includes('google') && normalizedMessage.includes('endpoint'))
  ) {
    return getI18nMessage('error_translation_service_unavailable', '翻译服务暂时不可用，请稍后重试');
  }

  return getI18nMessage('error_translation_failed_try_later', '翻译失败，请稍后重试');
}
