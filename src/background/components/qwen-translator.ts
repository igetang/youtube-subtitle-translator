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
  private static readonly BATCH_DELAY_MS = 200;   // batch 阶段延迟

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

      // 调用 API 翻译单批
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

    // 🔍 Step 2: 合并文本并打印
    const combinedText = texts.join('\n');
    // console.log(`[QwenTranslator] 📤 发送给API的合并文本:`);
    // console.log(`  总字符数: ${combinedText.length}`);
    // console.log(`  内容(JSON格式): ${JSON.stringify(combinedText)}`);
    // console.log(`  显示连续换行符: ${combinedText.replace(/\n/g, '↵')}`);

    // 构建请求体（OpenAI 兼容格式 + system prompt控制格式）
    const instructions = [
      'You are a professional translator. Each line is a separate subtitle that needs to be translated independently.',
      'IMPORTANT: Keep the exact same number of lines. If the input has N lines separated by newlines, the output MUST also have exactly N lines.',
      'Translate line by line and preserve all newline characters \\n in the exact same positions.',
      'Do NOT merge multiple lines into one paragraph.',
      'Return ONLY the translations, no explanations.',
      '',
      '--- SUBTITLES TO TRANSLATE ---',
      combinedText
    ].join('\n');

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: instructions
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

    // 🔍 Step 3: 打印API返回的原始文本
    // console.log(`[QwenTranslator] 📨 API返回的原始文本:`);
    // console.log(`  总字符数: ${translatedText.length}`);
    // console.log(`  内容(JSON格式): ${JSON.stringify(translatedText)}`);
    // console.log(`  显示连续换行符: ${translatedText.replace(/\n/g, '↵')}`);

    // 分割翻译结果
    const translations = translatedText.split('\n');

    // 🔍 Step 4: 打印分割后的结果
    // console.log(`[QwenTranslator] 📦 split('\\n')后的结果数组: ${translations.length}条`);
    // translations.forEach((text, idx) => {
    //   console.log(`  [${idx}] "${text}" ${text === '' ? '← 空字符串' : `(${text.length}字符)`}`);
    // });

    // 验证数量匹配
    if (translations.length !== texts.length) {
      console.error(
        `[QwenTranslator] ❌ 翻译数量不匹配: ` +
        `期望${texts.length}条，实际${translations.length}条`
      );
      throw new QwenTranslationError(
        `翻译数量不匹配: 期望${texts.length}条，实际${translations.length}条`,
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
    const mapping: Record<string, string> = {
      // 中文
      'zh-CN': 'zh',
      'zh-Hans': 'zh',
      'zh-Hant': 'zh',

      // 英文
      'en': 'en',
      'en-US': 'en',
      'en-GB': 'en',

      // 日文
      'ja': 'ja',

      // 韩文
      'ko': 'ko',

      // 法文
      'fr': 'fr',

      // 西班牙文
      'es': 'es',

      // 德文
      'de': 'de',

      // 泰文
      'th': 'th',

      // 印尼文
      'id': 'id',

      // 越南文
      'vi': 'vi',

      // 阿拉伯文
      'ar': 'ar'
    };

    return mapping[ytCode] || ytCode;
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
        throw new QwenTranslationError('Qwen API 速率限制（超出 RPM 或 TPM）', 'retryable', status);

      case 400:
        throw new QwenTranslationError(`Qwen API 请求参数错误: ${errorMessage}`, 'fatal', status);

      case 500:
      case 502:
      case 503:
        throw new QwenTranslationError('Qwen API 服务器错误，请稍后重试', 'retryable', status);

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
