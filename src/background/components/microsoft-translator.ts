/**
 * @file microsoft-translator.ts
 * @description 微软免费翻译实现，支持路径A/B降级与请求批次控制
 */

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
          throw new Error(`单个文本超过微软限制: ${length} > ${MAX_CHARS_PER_ITEM}`);
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
    if (batch.length === 0) {
      return [];
    }

    let token = await this.authManager.getToken();
    let lastError: unknown = null;

    const queryPrimary = this.buildUrl(PRIMARY_ENDPOINT, sourceLang, targetLang);
    const querySecondary = this.buildUrl(SECONDARY_ENDPOINT, sourceLang, targetLang, true);

    for (const endpoint of [queryPrimary, querySecondary]) {
      let retry = false;
      do {
        try {
          const pathLabel = endpoint === queryPrimary ? 'A' : 'B';
          console.debug(`[debug][MicrosoftTranslator] 调用路径${pathLabel}，批次 ${batch.length} 条`);
          const translations = await this.executeRequest(endpoint, token, batch, stage);
          return translations;
        } catch (error) {
          lastError = error;

          if (error instanceof MicrosoftRequestError && error.status === 401) {
            this.authManager.invalidateToken();
            token = await this.authManager.getToken(true);
            retry = !retry;
            continue;
          }

          retry = false;
        }
      } while (retry);
    }

    console.warn('[MicrosoftTranslator] 所有路径均失败，回退原文', lastError);
    return batch;
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
    texts: string[],
    stage: Stage
  ): Promise<string[]> {
    const response = await fetch(url, {
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

    if (!response.ok) {
      throw new MicrosoftRequestError(`Microsoft translate failed: HTTP ${response.status}`, response.status);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Unexpected Microsoft API response format');
    }

    return data.map((item: any, idx) => {
      const translation = item?.translations?.[0]?.text;
      if (typeof translation === 'string') {
        return translation;
      }
      console.warn('[MicrosoftTranslator] 缺少翻译文本，使用原文', texts[idx]);
      return texts[idx];
    });
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
    if (optimizedTexts.length === 0) {
      return [];
    }

    console.debug(
      `[debug][MicrosoftTranslator] translateOptimized: ` +
      `处理 ${optimizedTexts.length} 个优化文本组 (${stage}阶段)`
    );

    let token = await this.authManager.getToken();
    let lastError: unknown = null;

    const queryPrimary = this.buildUrl(PRIMARY_ENDPOINT, sourceLang, targetLang);
    const querySecondary = this.buildUrl(SECONDARY_ENDPOINT, sourceLang, targetLang, true);

    // 尝试两个端点
    for (const endpoint of [queryPrimary, querySecondary]) {
      let retry = false;
      do {
        try {
          const pathLabel = endpoint === queryPrimary ? 'A' : 'B';
          console.debug(
            `[debug][MicrosoftTranslator] 调用优化路径${pathLabel}，` +
            `${optimizedTexts.length} 个文本组`
          );

          // 构建请求体 - 每个优化文本都是一个Text对象
          const requestBody = optimizedTexts.map(text => ({ Text: text }));

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              Origin: 'https://www.bing.com',
              Referer: 'https://www.bing.com/translator',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
            },
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            throw new MicrosoftRequestError(
              `Microsoft translate failed: HTTP ${response.status}`,
              response.status
            );
          }

          const data = await response.json();

          if (!Array.isArray(data)) {
            throw new Error('Unexpected Microsoft API response format');
          }

          // 提取翻译结果
          const translations = data.map((item: any, idx: number) => {
            const translation = item?.translations?.[0]?.text;
            if (typeof translation === 'string') {
              return translation;
            }
            console.warn(
              `[MicrosoftTranslator] 缺少翻译文本，使用原文`,
              optimizedTexts[idx]?.substring(0, 100)
            );
            return optimizedTexts[idx];
          });

          console.debug(
            `[debug][MicrosoftTranslator] 优化翻译成功，返回 ${translations.length} 个翻译结果`
          );

          return translations;

        } catch (error) {
          lastError = error;

          if (error instanceof MicrosoftRequestError && error.status === 401) {
            // 认证失败，刷新token并重试
            this.authManager.invalidateToken();
            token = await this.authManager.getToken(true);
            retry = !retry;
            continue;
          }

          retry = false;
        }
      } while (retry);
    }

    console.warn('[MicrosoftTranslator] 优化翻译所有路径均失败，回退原文', lastError);
    return optimizedTexts;
  }
}
