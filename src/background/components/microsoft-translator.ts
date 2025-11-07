/**
 * @file microsoft-translator.ts
 * @description 微软免费翻译实现，支持路径A/B降级与请求批次控制
 */

import { TranslationError } from '@shared/types/translation-errors';
import { MicrosoftAuthManager } from './microsoft-auth-manager';

type Stage = 'urgent' | 'batch';

const MAX_ITEMS_PER_REQUEST = 10;
const MAX_CHARS_PER_ITEM = 5000;
const MAX_CHARS_PER_REQUEST = 50000;

const PRIMARY_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate';
const SECONDARY_ENDPOINT = 'https://api-edge.cognitive.microsofttranslator.com/translate';
const API_VERSION = '3.0';

class MicrosoftRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'MicrosoftRequestError';
  }
}

class MicrosoftResponseError extends Error {
  constructor(
    message: string,
    public readonly code: 'response_format' | 'missing_translation'
  ) {
    super(message);
    this.name = 'MicrosoftResponseError';
  }
}

type MicrosoftFailureReason =
  | { type: 'text_too_long' }
  | { type: 'network' }
  | { type: 'response_format' }
  | { type: 'missing_translation' }
  | { type: 'http'; status: number };

export class MicrosoftTranslator {
  private readonly authManager = MicrosoftAuthManager.getInstance();

  // 功能开关：启用5000字符窗口优化
  private static readonly USE_OPTIMIZER = true;  // 可以通过这个开关快速切换新旧逻辑

  public async translateTexts(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    stage: Stage
  ): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    const translations: string[] = [];
    let index = 0;

    while (index < texts.length) {
      const batch: string[] = [];
      let charCount = 0;

      while (index < texts.length && batch.length < MAX_ITEMS_PER_REQUEST) {
        const text = texts[index] ?? '';
        const length = text.length;

        if (length > MAX_CHARS_PER_ITEM) {
          throw this.buildTranslationError(stage, { type: 'text_too_long' });
        }

        if (batch.length > 0 && charCount + length > MAX_CHARS_PER_REQUEST) {
          break;
        }

        batch.push(text);
        charCount += length;
        index++;
      }

      const batchTranslations = await this.translateBatch(batch, sourceLang, targetLang, stage);
      translations.push(...batchTranslations);
    }

    return translations;
  }

  private async translateBatch(
    batch: string[],
    sourceLang: string,
    targetLang: string,
    stage: Stage
  ): Promise<string[]> {
    return this.translateViaEndpoints(batch, sourceLang, targetLang, stage);
  }

  private async translateViaEndpoints(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    stage: Stage
  ): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    let token = await this.authManager.getToken();
    const endpoints = [
      { url: this.buildUrl(PRIMARY_ENDPOINT, sourceLang, targetLang), label: 'A' },
      { url: this.buildUrl(SECONDARY_ENDPOINT, sourceLang, targetLang, true), label: 'B' }
    ];

    let lastRetryableReason: MicrosoftFailureReason | null = null;

    for (const endpoint of endpoints) {
      try {
        console.debug(
          `[debug][MicrosoftTranslator] 调用路径${endpoint.label}，批次 ${texts.length} 条`
        );
        return await this.executeRequest(endpoint.url, token, texts);
      } catch (error) {
        const classified = this.classifyMicrosoftError(error);

        if (stage === 'urgent' && this.isUrgentRetryable(classified)) {
          lastRetryableReason = classified;
          continue;
        }

        throw this.buildTranslationError(stage, classified);
      }
    }

    throw this.buildTranslationError(
      stage,
      lastRetryableReason ?? { type: 'network' }
    );
  }

  private buildUrl(base: string, sourceLang: string, targetLang: string, includeSentenceLength = false): string {
    const params = new URLSearchParams();
    params.set('api-version', API_VERSION);

    const mappedTarget = this.mapLanguageCode(targetLang);
    params.set('to', mappedTarget);

    const mappedSource = this.mapLanguageCode(sourceLang);
    if (mappedSource && mappedSource !== 'auto') {
      params.set('from', mappedSource);
    }

    if (includeSentenceLength) {
      params.set('includeSentenceLength', 'true');
    }

    return `${base}?${params.toString()}`;
  }

  private async executeRequest(
    url: string,
    token: string,
    texts: string[]
  ): Promise<string[]> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          Origin: 'https://www.bing.com',
          Referer: 'https://www.bing.com/translator',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        },
        body: JSON.stringify(texts.map(text => ({ Text: text })))
      });
    } catch (error) {
      throw error;
    }

    if (!response.ok) {
      throw new MicrosoftRequestError(
        `Microsoft translate failed: HTTP ${response.status}`,
        response.status
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new MicrosoftResponseError(
        'Unexpected Microsoft API response format',
        'response_format'
      );
    }

    if (!Array.isArray(data)) {
      throw new MicrosoftResponseError(
        'Unexpected Microsoft API response format',
        'response_format'
      );
    }

    const translations: string[] = [];
    for (let idx = 0; idx < data.length; idx += 1) {
      const translation = data[idx]?.translations?.[0]?.text;
      if (typeof translation === 'string') {
        translations.push(translation);
      } else {
        throw new MicrosoftResponseError(
          `[MicrosoftTranslator] 缺少翻译文本: index=${idx}`,
          'missing_translation'
        );
      }
    }

    return translations;
  }

  private mapLanguageCode(lang: string): string {
    if (!lang) {
      return 'auto';
    }

    const lower = lang.toLowerCase();
    switch (lower) {
      case 'zh-cn':
      case 'zh-hans':
      case 'zh':
        return 'zh-Hans';
      case 'zh-tw':
      case 'zh-hant':
        return 'zh-Hant';
      case 'pt-br':
        return 'pt-BR';
      case 'pt-pt':
        return 'pt-PT';
      case 'auto':
        return 'auto';
      default:
        return lang;
    }
  }

  private classifyMicrosoftError(error: unknown): MicrosoftFailureReason {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    if (error instanceof MicrosoftRequestError && typeof error.status === 'number') {
      return { type: 'http', status: error.status };
    }

    if (error instanceof MicrosoftResponseError) {
      return { type: error.code };
    }

    return { type: 'network' };
  }

  private isUrgentRetryable(reason: MicrosoftFailureReason): boolean {
    if (reason.type === 'network') {
      return true;
    }
    if (reason.type === 'response_format' || reason.type === 'missing_translation') {
      return true;
    }
    if (reason.type === 'http' && reason.status === 429) {
      return true;
    }
    return false;
  }

  private buildTranslationError(stage: Stage, reason: MicrosoftFailureReason): TranslationError {
    const { key, fallback, status } = this.getMessageForReason(reason);
    const urgentRetryable = stage === 'urgent' && this.isUrgentRetryable(reason);
    const category = urgentRetryable ? 'retryable' : 'fatal';
    const message = chrome.i18n.getMessage(key) || fallback;
    return new TranslationError(message, category, 'microsoft', status);
  }

  private getMessageForReason(
    reason: MicrosoftFailureReason
  ): { key: string; fallback: string; status?: number } {
    switch (reason.type) {
      case 'text_too_long':
        return {
          key: 'error_microsoft_text_too_long',
          fallback: '翻译失败，请切换翻译服务或重试'
        };
      case 'network':
        return {
          key: 'error_microsoft_network',
          fallback: '网络请求失败，请重试'
        };
      case 'response_format':
        return {
          key: 'error_microsoft_response_format',
          fallback: '翻译失败，请切换翻译服务或重试'
        };
      case 'missing_translation':
        return {
          key: 'error_microsoft_response_format',
          fallback: '翻译失败，请切换翻译服务或重试'
        };
      case 'http': {
        switch (reason.status) {
          case 400:
            return {
              key: 'error_microsoft_param_invalid',
              fallback: '翻译失败，请切换翻译服务或重试',
              status: reason.status
            };
          case 401:
            return {
              key: 'error_microsoft_auth_failed',
              fallback: '翻译失败，请切换翻译服务或重试',
              status: reason.status
            };
          case 403:
            return {
              key: 'error_microsoft_quota_exceeded',
              fallback: '免费配额已用完，请切换翻译服务或明天再试',
              status: reason.status
            };
          case 408:
            return {
              key: 'error_microsoft_unavailable',
              fallback: '翻译失败，请切换翻译服务或重试',
              status: reason.status
            };
          case 429:
            return {
              key: 'error_microsoft_rate_limit',
              fallback: '翻译过于频繁，请稍后重试',
              status: reason.status
            };
          case 500:
          case 503:
            return {
              key: 'error_microsoft_service_error',
              fallback: '翻译失败，请切换翻译服务或重试',
              status: reason.status
            };
          default:
            return {
              key: 'error_microsoft_service_error',
              fallback: '翻译失败，请切换翻译服务或重试',
              status: reason.status
            };
        }
      }
    }
  }

  /**
   * 优化版翻译方法 - 支持5000字符窗口优化
   * 处理已经合并的文本（多条字幕用换行符连接）
   */
  public async translateOptimized(
    optimizedTexts: string[],
    sourceLang: string,
    targetLang: string,
    stage: Stage
  ): Promise<string[]> {
    return this.translateViaEndpoints(optimizedTexts, sourceLang, targetLang, stage);
  }
}
