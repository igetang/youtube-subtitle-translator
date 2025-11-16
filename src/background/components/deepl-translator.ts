/**
 * @file deepl-translator.ts
 * @description DeepL 翻译器 - V4架构适配版本
 * @version 4.0.0
 *
 * 核心特性：
 * - 支持 stage ('urgent' | 'batch') 和 AbortSignal
 * - REST API（非Chat API）
 * - 原生批量翻译（最多50条/请求）
 * - 双端点架构（免费层/付费层）
 * - 字符计费（不是token）
 * - split_sentences 字符串类型
 * - 细化错误处理（403/413/429/456/529）
 */

/**
 * DeepL API 请求接口（基于官方文档 2025-10-22）
 */
import { TranslationError } from '@shared/types/translation-errors';

interface DeepLRequest {
  // 必需参数
  text: string[];                    // 待翻译文本数组，最多50条
  target_lang: string;               // 目标语言代码

  // 可选参数
  source_lang?: string;              // 源语言（省略则自动检测）
  context?: string;                  // 额外上下文（不翻译，不计费）
  split_sentences?: "0" | "1" | "nonewlines";  // ⚠️ 字符串类型
  preserve_formatting?: boolean | "0" | "1";   // 保留格式（支持字符串）
  formality?: "default" | "more" | "less" | "prefer_more" | "prefer_less";
  model_type?: "latency_optimized" | "quality_optimized" | "prefer_quality_optimized";
  glossary_id?: string;              // 词汇表ID（需要source_lang）
  show_billed_characters?: boolean;  // 在响应中包含计费字符数
  tag_handling?: "xml" | "html";     // 标签处理
  outline_detection?: boolean;       // XML结构检测
  non_splitting_tags?: string[];     // 不分句的XML标签
  splitting_tags?: string[];         // 强制分句的XML标签
  ignore_tags?: string[];            // 不翻译的XML标签
}

/**
 * DeepL API 响应接口
 */
interface DeepLResponse {
  translations: Array<{
    detected_source_language: string;  // 检测到的源语言
    text: string;                      // 翻译后的文本
    billed_characters?: number;        // 计费字符数（可选，设置show_billed_characters时返回）
    model_type_used?: string;          // 使用的模型类型（可选）
  }>;
  billed_characters?: number;          // 总计费字符数（可选）
}

/**
 * DeepL 错误响应
 */
interface DeepLErrorResponse {
  message: string;
}

/**
 * DeepL翻译器类 - V4架构
 */
export class DeepLTranslator {
  // 常量配置
  private static readonly FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate';
  private static readonly PRO_ENDPOINT = 'https://api.deepl.com/v2/translate';
  private static readonly BATCH_SIZE = 30;              // 优化：50→30（降低失败影响40%，提升安全阈值67%）
  private static readonly FREE_BATCH_DELAY_MS = 50;     // 免费层延迟
  private static readonly PRO_BATCH_DELAY_MS = 50;      // 付费层延迟

  private apiKey: string;
  private tier: 'free' | 'pro';
  private endpoint: string;
  private batchDelay: number;
  private formality: string;
  private splitSentences: "0" | "1" | "nonewlines";  // ⚠️ 字符串类型
  private preserveFormatting: boolean;
  private modelType: string;
  private showBilledCharacters: boolean;

  /**
   * 构造函数
   * @param apiKey DeepL API密钥
   * @param tier 账户层级（'free' | 'pro'）
   * @param formality 正式度（'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less'）
   * @param splitSentences 句子分割（"0" | "1" | "nonewlines"，默认"0"禁止分句）
   * @param preserveFormatting 是否保留原始格式
   * @param modelType 模型类型（默认'latency_optimized'）
   * @param showBilledCharacters 是否显示计费字符数
   */
  constructor(
    apiKey: string,
    tier: 'free' | 'pro' = 'free',
    formality: string = 'default',
    splitSentences: "0" | "1" | "nonewlines" = "0",  // ⚠️ 默认"0"禁止分句
    preserveFormatting: boolean = false,
    modelType: string = 'latency_optimized',
    showBilledCharacters: boolean = true
  ) {
    this.apiKey = apiKey;
    this.tier = tier;
    this.endpoint = tier === 'free' ? DeepLTranslator.FREE_ENDPOINT : DeepLTranslator.PRO_ENDPOINT;
    this.batchDelay = tier === 'free' ? DeepLTranslator.FREE_BATCH_DELAY_MS : DeepLTranslator.PRO_BATCH_DELAY_MS;
    this.formality = formality;
    this.splitSentences = splitSentences;
    this.preserveFormatting = preserveFormatting;
    this.modelType = modelType;
    this.showBilledCharacters = showBilledCharacters;

    console.debug(
      `[debug][DeepLTranslator] 初始化: tier=${tier}, endpoint=${this.endpoint}, ` +
      `split_sentences="${splitSentences}", model_type="${modelType}", 批次延迟=${this.batchDelay}ms`
    );
  }

  /**
   * 批量翻译文本（支持 AbortSignal 和两阶段翻译）
   * @param texts 待翻译文本数组
   * @param sourceLang 源语言代码（DeepL 标准，如 'EN', 'ZH'）
   * @param targetLang 目标语言代码（DeepL 标准，如 'ZH-HANS', 'EN-US'）
   * @param stage 翻译阶段：urgent（无延迟） | batch（有延迟）
   * @param signal AbortSignal 用于取消操作
   */
  public async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    // ✅ 直接使用上层传入的DeepL标准CODE（已在prepareLanguageParams中统一转换）
    console.log(
      `[DeepLTranslator] → 翻译 ${texts.length}条 | ${stage}阶段 | ${sourceLang} → ${targetLang} | ${this.tier}`
    );

    // 检查初始信号状态
    if (signal.aborted) {
      throw this.createFatalError('error_translation_switch_provider');
    }

    const results: string[] = [];
    let totalBilledCharacters = 0;  // 总计费字符统计

    // 分批处理（30 条/批）
    for (let i = 0; i < texts.length; i += DeepLTranslator.BATCH_SIZE) {
      if (signal.aborted) {
        throw this.createFatalError('error_translation_switch_provider');
      }

      const batch = texts.slice(i, i + DeepLTranslator.BATCH_SIZE);

      // 调用 DeepL API（直接使用已转换的DeepL标准CODE）
      const requestBody: DeepLRequest = {
        text: batch,
        target_lang: targetLang,  // ✅ 直接使用（上层已转换）
        split_sentences: this.splitSentences,           // ⚠️ 字符串类型
        preserve_formatting: this.preserveFormatting,
        model_type: this.modelType as any,              // 模型类型
        show_billed_characters: this.showBilledCharacters  // 显示计费字符数
      };

      // 只有在支持 formality 的语言时才添加该参数
      if (this.isFormalitySupported(targetLang)) {
        requestBody.formality = this.formality as any;
      }

      // 源语言可选（省略则自动检测）
      if (sourceLang && sourceLang !== 'auto' && sourceLang !== 'AUTO') {
        requestBody.source_lang = sourceLang;  // ✅ 直接使用（上层已转换）
      }

      const response = await this.callAPI(requestBody, signal);

      // 提取翻译结果
      const translations = response.translations.map(t => t.text);

      // 验证数量匹配
      if (translations.length !== batch.length) {
        console.debug(
          `[DeepLTranslator] ✗ 批次翻译数量不匹配: 期望${batch.length}, 实际${translations.length}`
        );
        throw this.createFatalError('error_translation_switch_provider');
      }

      results.push(...translations);

      // 累加计费字符
      if (response.billed_characters) {
        totalBilledCharacters += response.billed_characters;
      }

      // 批次间延迟（仅 batch 阶段）
      if (stage === 'batch' && i + DeepLTranslator.BATCH_SIZE < texts.length) {
        console.debug(`[debug][DeepLTranslator] 批次间延迟 ${this.batchDelay}ms`);
        await this.delayWithSignal(this.batchDelay, signal);
      }
    }

    // 出口日志
    const batchCount = Math.ceil(texts.length / DeepLTranslator.BATCH_SIZE);
    console.debug(
      `[debug][DeepLTranslator] ✅ 翻译完成: ${results.length}/${texts.length}条 | ` +
      `计费字符: ${totalBilledCharacters} | 批次数: ${batchCount}`
    );

    return results;
  }

  /**
   * 调用 DeepL API（支持 AbortSignal）
   */
  private async callAPI(
    requestBody: DeepLRequest,
    signal: AbortSignal
  ): Promise<DeepLResponse> {
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw this.createFatalError('error_translation_switch_provider');
      }
      throw this.createFatalError('error_deepl_network_failed');
    }

    if (!response.ok) {
      await this.handleAPIError(response);
    }

    let data: DeepLResponse;
    try {
      data = await response.json();
    } catch {
      throw this.createFatalError('error_translation_switch_provider', undefined, response.status);
    }

    if (!data.translations || !Array.isArray(data.translations)) {
      throw this.createFatalError('error_translation_switch_provider', undefined, response.status);
    }

    // 记录检测到的源语言（仅第一批次记录一次）
    if (data.translations[0]?.detected_source_language) {
      console.debug(
        `[debug][DeepLTranslator] 检测到源语言: ${data.translations[0].detected_source_language}`
      );
    }

    return data;
  }

  private async handleAPIError(response: Response): Promise<never> {
    let errorMessage = '未知错误';

    try {
      const errorData: DeepLErrorResponse = await response.json();
      errorMessage = errorData.message || '未知错误';
    } catch {
      errorMessage = await response.text().catch(() => '未知错误');
    }

    const status = response.status;

    switch (status) {
      case 400:
      case 404:
      case 413:
      case 500:
      case 503:
      case 529:
        throw this.createFatalError('error_translation_switch_provider', undefined, status);
      case 403:
        throw this.createFatalError('error_api_key_invalid', undefined, status);
      case 429:
        throw this.createFatalError('error_deepl_rate_limit', undefined, status);
      case 456:
        throw this.createFatalError('error_deepl_quota_exhausted', undefined, status);
      default:
        throw this.createFatalError('error_translation_switch_provider', undefined, status);
    }
  }

  /**
   * 延迟工具（支持 AbortSignal 中断）
   */
  private async delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);

      const abortHandler = () => {
        clearTimeout(timer);
        reject(this.createFatalError('error_translation_switch_provider'));
      };

      signal.addEventListener('abort', abortHandler, { once: true });
    });
  }

  private createFatalError(messageKey?: string, fallback?: string, status?: number): TranslationError {
    const defaultMessage = fallback || '翻译失败，请切换翻译服务或重试';
    const resolvedMessage = messageKey
      ? chrome.i18n.getMessage(messageKey) || defaultMessage
      : defaultMessage;
    return new TranslationError(resolvedMessage, 'fatal', 'deepl', status);
  }

  /**
   * 检查目标语言是否支持 formality 参数
   * 注意：targetLang 现在是 DeepL 标准CODE（大写），如 'DE', 'FR', 'PT-BR'
   */
  private isFormalitySupported(targetLang: string): boolean {
    // DeepL 标准CODE（大写）
    const supportedLangs = ['DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'PT', 'PT-BR', 'PT-PT', 'JA', 'RU'];
    return supportedLangs.includes(targetLang);
  }
}

// ⚠️ 重要警告：Next-gen模型会忽略split_sentences参数
//
// 根据DeepL官方文档：
// "Please note that for next-gen models, the parameter split_sentences passed
//  by the user is ignored and a value of 'nonewlines' is used for maximum
//  translation quality."
//
// 这意味着即使我们设置 split_sentences="0"，DeepL可能仍会分句（只是不按换行符分句）。
// 需要在实际测试时验证返回数量是否匹配输入数量。
// 如果数量不匹配，需要在代码中添加数量验证和错误处理逻辑。
