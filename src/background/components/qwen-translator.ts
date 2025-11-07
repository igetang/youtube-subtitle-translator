/**
 * Qwen-MT 翻译器（阿里通义千问机器翻译）
 *
 * 核心特性：
 * - OpenAI 兼容 API（chat/completions 端点）
 * - 批量翻译（\n 分隔符）
 * - AbortSignal 支持
 * - 自动语言检测（source_lang: "auto"）
 * - 智能断句（IntelligentSegmenter）
 *
 * 技术规格：
 * - 模型：qwen-mt-plus（旗舰翻译模型）
 * - 端点：北京地域（默认）
 * - 批次大小：30条/批（使用 IntelligentSegmenter 智能断句）
 * - 批次间延迟：200ms（仅 batch 阶段）
 * - 速率限制：60 RPM, 23,797 TPM
 */
declare const __CAPTION_TRANSLATION_DEBUG__: boolean;
const CAPTION_TRANSLATION_DEBUG =
  typeof __CAPTION_TRANSLATION_DEBUG__ === 'boolean' ? __CAPTION_TRANSLATION_DEBUG__ : false;
const QWEN_DEBUG_DELIMITER = '\n\n';

export type QwenErrorCategory = 'fatal' | 'retryable';

export class QwenTranslationError extends Error {
  public readonly category: QwenErrorCategory;
  public readonly status?: number;

  constructor(message: string, category: QwenErrorCategory, status?: number) {
    super(message);
    this.name = 'QwenTranslationError';
    this.category = category;
    this.status = status;
  }
}

export class QwenTranslator {
  private static readonly BEIJING_ENDPOINT =
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  private static readonly SINGAPORE_ENDPOINT =
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
  private static readonly BATCH_SIZE = 30;        // 智能断句最大批次
  private static readonly BATCH_DELAY_MS = 50;    // batch 阶段延迟
  private static readonly SUPPORTED_CODES = new Set<string>([
    'auto',
    'en', 'zh', 'zh_tw', 'ru', 'ja', 'ko', 'es', 'fr', 'pt', 'de', 'it',
    'th', 'vi', 'id', 'ms', 'ar', 'hi', 'he', 'my', 'ta', 'ur', 'bn', 'pl',
    'nl', 'ro', 'tr', 'km', 'lo', 'yue', 'cs', 'el', 'sv', 'hu', 'da', 'fi',
    'uk', 'bg', 'sr', 'te', 'af', 'hy', 'as', 'ast', 'eu', 'be', 'bs', 'ca',
    'ceb', 'hr', 'arz', 'et', 'gl', 'ka', 'gu', 'is', 'jv', 'kn', 'kk', 'lv',
    'lt', 'lb', 'mk', 'mai', 'mt', 'mr', 'acm', 'ary', 'ars', 'ne', 'az',
    'apc', 'uz', 'nb', 'nn', 'oc', 'or', 'pag', 'scn', 'sd', 'si', 'sk', 'sl',
    'ajp', 'sw', 'tl', 'acq', 'sq', 'aeb', 'vec', 'war', 'cy', 'fa'
  ]);
  private static readonly LANGUAGE_OVERRIDES: Record<string, string> = {
    auto: 'auto',
    // 中文
    'zh': 'zh',
    'zh-cn': 'zh',
    'zh-hans': 'zh',
    'zh-sg': 'zh',
    'zh-my': 'zh',
    'zh-tw': 'zh_tw',
    'zh-hk': 'zh_tw',
    'zh-mo': 'zh_tw',
    'zh-hant': 'zh_tw',
    'zh-hant-hk': 'zh_tw',
    'zh-hant-mo': 'zh_tw',
    'zh-hant-tw': 'zh_tw',
    'zh-yue': 'yue',
    'cmn': 'zh',
    'cmn-hans': 'zh',
    'cmn-hant': 'zh_tw',
    // 英文
    'en': 'en',
    'en-us': 'en',
    'en-gb': 'en',
    'en-au': 'en',
    'en-ca': 'en',
    'en-in': 'en',
    'en-nz': 'en',
    'en-sg': 'en',
    'en-ph': 'en',
    'en-jm': 'en',
    // 西班牙语
    'es': 'es',
    'es-es': 'es',
    'es-mx': 'es',
    'es-419': 'es',
    'es-ar': 'es',
    'es-us': 'es',
    'es-co': 'es',
    'es-cl': 'es',
    'es-pe': 'es',
    'es-uy': 'es',
    'es-ec': 'es',
    // 葡萄牙语
    'pt': 'pt',
    'pt-pt': 'pt',
    'pt-br': 'pt',
    'pt-ao': 'pt',
    'pt-mz': 'pt',
    // 法语
    'fr': 'fr',
    'fr-fr': 'fr',
    'fr-ca': 'fr',
    'fr-be': 'fr',
    'fr-ch': 'fr',
    'fr-lu': 'fr',
    'fr-ma': 'fr',
    // 德语
    'de': 'de',
    'de-de': 'de',
    'de-at': 'de',
    'de-ch': 'de',
    // 俄语
    'ru': 'ru',
    'ru-ru': 'ru',
    'ru-by': 'ru',
    'ru-kz': 'ru',
    'ru-ua': 'ru',
    'ru-md': 'ru',
    // 阿拉伯语及变体
    'ar': 'ar',
    'ar-sa': 'ar',
    'ar-eg': 'ar',
    'ar-ae': 'ar',
    'ar-qa': 'ar',
    'ar-jo': 'ar',
    'ar-ma': 'ar',
    'ar-tn': 'ar',
    'ar-ly': 'ar',
    'ar-dz': 'ar',
    'ar-iq': 'acm',
    'ar-ye': 'acq',
    'ar-lb': 'ajp',
    'ar-sy': 'ajp',
    'ar-bh': 'ars',
    // 其他常见语言别名
    'id-id': 'id',
    'in': 'id',
    'ms-my': 'ms',
    'ms-sg': 'ms',
    'fil': 'tl',
    'tl-ph': 'tl',
    'jw': 'jv',
    'jv-id': 'jv',
    'iw': 'he',
    'he-il': 'he',
    'fa-ir': 'fa',
    'fa-af': 'fa',
    'nb-no': 'nb',
    'no': 'nb',
    'nn-no': 'nn',
    'uz-uz': 'uz',
    'uz-cyrl': 'uz',
    'uz-latn': 'uz',
    'az-az': 'az',
    'az-latn': 'az',
    'az-cyrl': 'az',
    'hy-am': 'hy',
    'sr-rs': 'sr',
    'sr-me': 'sr',
    'sr-latn': 'sr',
    'sr-cyrl': 'sr',
    'bs-ba': 'bs',
    'ca-es': 'ca',
    'ceb-ph': 'ceb',
    'gl-es': 'gl',
    'ka-ge': 'ka',
    'lo-la': 'lo',
    'km-kh': 'km',
    'sv-se': 'sv',
    'sv-fi': 'sv',
    'fi-fi': 'fi',
    'da-dk': 'da',
    'pl-pl': 'pl',
    'tr-tr': 'tr',
    'uk-ua': 'uk',
    'cs-cz': 'cs',
    'hu-hu': 'hu',
    'ro-ro': 'ro',
    'bg-bg': 'bg',
    'vi-vn': 'vi',
    'th-th': 'th',
    'bn-bd': 'bn',
    'bn-in': 'bn',
    'ta-in': 'ta',
    'ta-lk': 'ta',
    'hi-in': 'hi',
    'ur-pk': 'ur',
    'ur-in': 'ur'
  };

  private apiKey: string;
  private model: 'qwen-mt-plus';
  private endpoint: string;

  constructor(
    apiKey: string,
    region: 'beijing' | 'singapore' = 'beijing'
  ) {
    this.apiKey = apiKey;
    this.model = 'qwen-mt-plus';
    this.endpoint = region === 'beijing'
      ? QwenTranslator.BEIJING_ENDPOINT
      : QwenTranslator.SINGAPORE_ENDPOINT;

    console.debug(
      `[debug][QwenTranslator] 初始化: region=${region}, ` +
      `batchSize=${QwenTranslator.BATCH_SIZE}, ` +
      `batchDelay=${QwenTranslator.BATCH_DELAY_MS}ms`
    );
  }

  /**
   * 主翻译方法
   *
   * @param texts 待翻译文本数组
   * @param sourceLang 源语言（'auto' 或具体语言代码）
   * @param targetLang 目标语言代码
   * @param stage 翻译阶段（'urgent' 或 'batch'）
   * @param signal AbortSignal 用于取消翻译
   * @returns 翻译结果数组
   */
  public async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const results: string[] = [];

    // 分批处理
    for (let i = 0; i < texts.length; i += QwenTranslator.BATCH_SIZE) {
      // 检查取消信号
      if (signal.aborted) {
        throw new DOMException('Qwen翻译已取消', 'AbortError');
      }

      const batch = texts.slice(i, i + QwenTranslator.BATCH_SIZE);
      const batchNumber = Math.floor(i / QwenTranslator.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(texts.length / QwenTranslator.BATCH_SIZE);

      console.log(
        `[QwenTranslator] → 翻译批次 ${batchNumber}/${totalBatches}: ` +
        `${batch.length}条 | qwen-mt-plus | ${stage}阶段`
      );

      // 调用 API 翻译单批（Qwen需要code）
      const translations = await this.translateBatch(
        batch,
        sourceLang,
        targetLang,
        signal
      );

      results.push(...translations);

      // 批次间延迟（仅 batch 阶段，urgent 阶段无延迟）
      if (stage === 'batch' && i + QwenTranslator.BATCH_SIZE < texts.length) {
        await this.delayWithSignal(QwenTranslator.BATCH_DELAY_MS, signal);
      }
    }

    console.log(`[QwenTranslator] ✓ 翻译完成: 共${results.length}条`);
    return results;
  }

  /**
   * 单批翻译
   */
  private async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    signal: AbortSignal
  ): Promise<string[]> {
    // 🔍 Step 1: 打印输入的texts数组
    // console.log(`[QwenTranslator] 📥 输入texts数组: ${texts.length}条`);
    // texts.forEach((text, idx) => {
    //   console.log(`  [${idx}] "${text}" ${text === '' ? '← 空字符串' : `(${text.length}字符)`}`);
    // });

    // 🔍 Step 2: 使用双换行符拼接（描述层已清洗换行）
    const sanitizedTexts = texts.map(text => text.trim());
    const delimiter = QWEN_DEBUG_DELIMITER;
    const combinedText = sanitizedTexts.join(delimiter);
    if (CAPTION_TRANSLATION_DEBUG) {
      console.log(`[QwenTranslator][debug] 📥 输入字幕 ${sanitizedTexts.length} 条`);
      console.log('[QwenTranslator][debug] 📤 发送给API的合并文本:');
      console.log(`  总字符数: ${combinedText.length}`);
      console.log(`  内容(JSON格式): ${JSON.stringify(combinedText)}`);
      console.log(`  使用分隔符: ${JSON.stringify(delimiter)}`);
    }

    // 构建请求体（OpenAI 兼容格式 + system prompt控制格式）
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: combinedText
        }
      ],
      translation_options: {
        source_lang: sourceLang === 'auto' ? 'auto' : this.mapLanguage(sourceLang),
        target_lang: this.mapLanguage(targetLang)
      }
    };

    console.debug(
      `[debug][QwenTranslator] 请求: ${texts.length}条字幕, ` +
      `${sourceLang} → ${targetLang}`
    );

    // 发送请求
    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal  // AbortSignal 支持
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new QwenTranslationError(
        `Qwen API 请求失败: ${message}`,
        'retryable'
      );
    }

    // 错误处理
    if (!response.ok) {
      await this.handleAPIError(response);
    }

    // 解析响应
    let data: any;
    try {
      data = await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new QwenTranslationError(
        `Qwen API 响应解析失败: ${message}`,
        'retryable'
      );
    }
    const translatedText = data.choices[0]?.message?.content;

    if (!translatedText) {
      throw new QwenTranslationError(
        'Qwen API 返回内容为空',
        'fatal'
      );
    }

    const duration = Date.now() - startTime;
    console.log(
      `[QwenTranslator] ← API响应: ${duration}ms | ${texts.length}条`
    );

    if (CAPTION_TRANSLATION_DEBUG) {
      console.log('[QwenTranslator][debug] 📨 API返回的原始文本:');
      console.log(`  总字符数: ${translatedText.length}`);
      console.log(`  内容(JSON格式): ${JSON.stringify(translatedText)}`);
      const previewSegments = translatedText.replace(/\r\n/g, '\n').split(/\n{2,}/);
      console.log(`  使用分隔符预览: ${previewSegments.join(' | ')}`);
    }

    // 分割翻译结果（兼容 \r\n 和连续换行符）
    const normalizedTranslatedText = translatedText.replace(/\r\n/g, '\n').trim();
    let translations = normalizedTranslatedText === ''
      ? []
      : normalizedTranslatedText.split(/\n{2,}/).map(text => text.trim());

    // Qwen 可能降级为单换行，必要时回退
    if (translations.length !== texts.length) {
      const fallbackTranslations = normalizedTranslatedText.split('\n').map(text => text.trim());
      if (fallbackTranslations.length === texts.length) {
        translations = fallbackTranslations;
      }
    }

    if (CAPTION_TRANSLATION_DEBUG) {
      console.log(`[QwenTranslator][debug] 📦 Qwen 返回字幕 ${translations.length} 条`);
      console.log('[QwenTranslator][debug] 译文全文:', JSON.stringify(translatedText));
      console.log('[QwenTranslator][debug] 📝 原文 / 译文 对照:');
      const maxLength = Math.max(sanitizedTexts.length, translations.length);
      for (let i = 0; i < maxLength; i += 1) {
        const original = sanitizedTexts[i] ?? '<缺少原文>';
        const translated = translations[i] ?? '<缺少译文>';
        console.log(`  [${i}] 原文: ${JSON.stringify(original)}`);
        console.log(`      译文: ${JSON.stringify(translated)}`);
      }
    }

    // 验证数量匹配
    if (translations.length !== texts.length) {
      console.error(
        `[QwenTranslator] ❌ 翻译数量不匹配: ` +
        `期望${texts.length}条，实际${translations.length}条`
      );
      throw new QwenTranslationError(
        'Qwen 翻译失败，请稍后重试',
        'retryable'
      );
    }

    console.debug(
      `[debug][QwenTranslator] ✓ 批次翻译成功: ${translations.length}条`
    );
    return translations;
  }

  /**
   * 语言代码映射（YouTube → Qwen）
   */
  private mapLanguage(ytCode: string): string {
    if (!ytCode) {
      return ytCode;
    }

    const normalized = ytCode.replace(/_/g, '-').toLowerCase();

    const override = QwenTranslator.LANGUAGE_OVERRIDES[normalized];
    if (override) {
      return override;
    }

    const base = normalized.split('-')[0];
    const baseOverride = QwenTranslator.LANGUAGE_OVERRIDES[base];
    if (baseOverride) {
      return baseOverride;
    }

    const underscoreCode = normalized.replace(/-/g, '_');
    if (QwenTranslator.SUPPORTED_CODES.has(underscoreCode)) {
      return underscoreCode;
    }

    if (QwenTranslator.SUPPORTED_CODES.has(base)) {
      return base;
    }

    const underscoreBase = base.replace(/-/g, '_');
    if (QwenTranslator.SUPPORTED_CODES.has(underscoreBase)) {
      return underscoreBase;
    }

    return underscoreCode;
  }

  /**
   * API 错误处理
   */
  private async handleAPIError(response: Response): Promise<never> {
    let errorMessage = '未知错误';

    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorData.message || '未知错误';
    } catch {
      // JSON 解析失败
    }

    const status = response.status;

    switch (status) {
      case 401:
      case 403:
        throw new QwenTranslationError('Qwen API 密钥无效或已过期', 'fatal', status);

      case 429:
        throw new QwenTranslationError(chrome.i18n.getMessage('error_qwen_rate_limit') || 'Qwen API 速率限制（超出 RPM 或 TPM）', 'retryable', status);

      case 400:
        throw new QwenTranslationError(`${chrome.i18n.getMessage('error_qwen_request_param') || 'Qwen API 请求参数错误'}: ${errorMessage}`, 'fatal', status);

      case 500:
      case 502:
      case 503:
        throw new QwenTranslationError(chrome.i18n.getMessage('error_qwen_server_error') || 'Qwen API 服务器错误，请稍后重试', 'retryable', status);

      default:
        throw new QwenTranslationError(
          `Qwen API 错误 (${status}): ${errorMessage}`,
          'fatal',
          status
        );
    }
  }

  /**
   * 可取消的延迟
   */
  private async delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('延迟被取消', 'AbortError'));
      });
    });
  }
}
