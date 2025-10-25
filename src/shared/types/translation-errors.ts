/**
 * @file translation-errors.ts
 * @description 统一的翻译错误类型与工具方法
 */

export type TranslationErrorCategory = 'fatal' | 'retryable';

export type TranslationServiceName =
  | 'openai'
  | 'qwen'
  | 'gemini'
  | 'deepl'
  | 'google'
  | 'microsoft'
  | 'deepseek'
  | 'unknown';

/**
 * 统一的翻译错误类
 * - category: 错误类别（致命或可重试）
 * - service: 具体翻译服务来源
 * - status: HTTP 状态码（若有）
 * - errorCode: 服务返回的具体错误码（若有）
 */
export class TranslationError extends Error {
  public readonly name = 'TranslationError';

  constructor(
    message: string,
    public readonly category: TranslationErrorCategory,
    public readonly service: TranslationServiceName,
    public readonly status?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, TranslationError.prototype);
  }
}

/**
 * 判断是否为 TranslationError
 */
export function isTranslationError(error: unknown): error is TranslationError {
  return error instanceof TranslationError;
}

/**
 * 统一处理 fetch 抛出的网络错误
 * - AbortError 原样抛出（用于超时/用户取消）
 * - 其他错误封装为 TranslationError（retryable）
 */
export function handleFetchError(
  error: unknown,
  service: TranslationServiceName,
  contextMessage?: string
): never {
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw error;
  }

  const message = error instanceof Error ? error.message : String(error);
  throw new TranslationError(
    contextMessage ? `${contextMessage}: ${message}` : message,
    'retryable',
    service
  );
}
