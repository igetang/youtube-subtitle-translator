/**
 * @file gemini-translator.ts
 * @description Google Gemini 翻译器 - V4架构适配版本
 * @version 4.0.0
 *
 * 核心特性：
 * - 支持 stage ('urgent' | 'batch') 和 AbortSignal
 * - 非流式响应（stream: false）
 * - 批次大小 80（利用1M token上下文窗口）
 * - Structured Output（JSON Schema，强制一对一对应）
 * - Phase 1: 从配置读取 batchDelay（手动选择 tier）
 * - 细化错误处理
 */

/**
 * Gemini API 请求接口（REST API 使用 snake_case）
 */
interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig: {
    temperature: number;
    max_output_tokens: number;           // ✓ REST API 使用下划线命名
    response_mime_type?: string;         // ✓ REST API 使用下划线命名
    response_schema?: Record<string, unknown>;  // ✓ 注意：是 response_schema 而非 responseJsonSchema
  };
}

/**
 * Gemini API 响应接口
 */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * 字幕条目（Structured Output）
 */
interface SubtitleItem {
  id: number;
  text: string;
}

const SUBTITLE_TRANSLATION_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          text: { type: 'string' }
        },
        required: ['id', 'text']
      }
    }
  },
  required: ['translations']
} as const;

/**
 * 模型配置映射表
 */
const MODEL_CONFIGS: Record<string, {
  contextWindow: number;
  maxOutput: number;
  batchSize: number;
}> = {
  'gemini-2.5-flash': {
    contextWindow: 1_000_000,  // 1M tokens 上下文窗口
    maxOutput: 65_536,         // 64K tokens 最大输出
    batchSize: 25              // ⭐ 改为25，实现二次断句（50条→25+25）
  },
  'gemini-2.5-flash-lite': {
    contextWindow: 1_000_000,  // 1M tokens 上下文窗口
    maxOutput: 65_536,         // 64K tokens 最大输出
    batchSize: 25              // ⭐ 改为25，实现二次断句（50条→25+25）
  }
};

/**
 * Gemini翻译器类 - V4架构
 */
import { TranslationError } from '@shared/types/translation-errors';
import { LanguageCodeMapper } from '@shared/utils/language-code-mapper';

export class GeminiTranslator {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxOutputTokens: number;
  private batchDelay: number;  // Phase 1: 从配置读取（不自适应）
  private modelConfig: typeof MODEL_CONFIGS[string];

  /**
   * 构造函数
   * @param apiKey Gemini API密钥
   * @param model 模型名称（gemini-2.5-flash / gemini-2.5-flash-lite）
   * @param temperature 温度参数（0 = 确定性翻译）
   * @param maxOutputTokens 最大输出tokens
   * @param batchDelay 批次延迟（ms，Phase 1从配置读取）
   */
  constructor(
    apiKey: string,
    model: string,
    temperature: number,
    maxOutputTokens: number,
    batchDelay: number
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.maxOutputTokens = maxOutputTokens;
    this.batchDelay = batchDelay;
    this.modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gemini-2.5-flash'];

    console.debug(
      `[debug][GeminiTranslator] 初始化: 模型=${model}, temperature=${temperature}, ` +
      `上下文=${this.modelConfig.contextWindow} tokens, 最大输出=${this.maxOutputTokens} tokens, ` +
      `批次延迟=${batchDelay}ms`
    );
  }

  /**
   * 翻译文本数组 - V4架构接口
   * @param texts 待翻译的文本数组
   * @param sourceLangName 源语言英文名称（如 'English', 'Chinese'）
   * @param targetLangName 目标语言英文名称（如 'Chinese', 'Japanese'）
   * @param stage 翻译阶段 ('urgent' | 'batch')
   * @param signal AbortSignal用于中断请求
   * @returns 翻译后的文本数组
   */
  public async translate(
    texts: string[],
    sourceLangName: string,
    targetLangName: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    // 检查初始信号状态
    if (signal.aborted) {
      throw this.createFatalError('error_translation_switch_provider');
    }

    // ✅ 直接使用上层传入的英文名称（已在callTranslationAPI中统一转换）
    console.log(
      `[GeminiTranslator] → 翻译 ${texts.length}条 | ${stage}阶段 | ${sourceLangName} → ${targetLangName} | ` +
      `批次大小=${this.modelConfig.batchSize}, 延迟=${this.batchDelay}ms`
    );

    const results: string[] = [];
    const totalBatches = Math.ceil(texts.length / this.modelConfig.batchSize);

    // 分批处理
    for (let i = 0; i < texts.length; i += this.modelConfig.batchSize) {
      if (signal.aborted) {
        throw this.createFatalError('error_translation_switch_provider');
      }

      const batch = texts.slice(i, i + this.modelConfig.batchSize);
      const batchNumber = Math.floor(i / this.modelConfig.batchSize) + 1;

      try {
        // ⏱️ 性能分析：记录各环节耗时
        const perfStart = performance.now();

        // 1. 转换为JSON结构
        const t1 = performance.now();
        const jsonInput = this.convertToJSON(batch);
        const t2 = performance.now();

        // 2. 构建prompt
        const prompt = this.buildTranslationPrompt(jsonInput, sourceLangName, targetLangName);
        const t3 = performance.now();

        // 3. 估算maxOutputTokens（JSON Schema格式需要更多token）
        const encoder = new TextEncoder();
        const inputBytes = encoder.encode(batch.join('\n')).length;
        // ⭐ JSON Schema格式开销大：基础估算 + JSON结构开销
        // 公式：(inputBytes / 2.5) * 倍数 + 每条固定开销
        const baseTokens = Math.ceil((inputBytes / 2.5) * 3.0);  // 基础翻译token（提高安全系数）
        const jsonOverhead = batch.length * 30;  // 每条JSON结构约30 tokens
        const estimatedOutputTokens = baseTokens + jsonOverhead;
        const maxOutputTokens = Math.min(estimatedOutputTokens, this.modelConfig.maxOutput);

        // 4. 调用Gemini API（Structured Output）
        const translatedItems = await this.callGeminiAPI(prompt, signal, maxOutputTokens);
        const t4 = performance.now();

        // 5. 验证翻译结果（传入原文用于对比）
        this.validateTranslationResult(translatedItems, batch.length, batch);
        const t5 = performance.now();

        const translations = translatedItems.map(item => item.text);

        // ⏱️ 性能统计
        const perfTotal = t5 - perfStart;
        console.log(
          `[GeminiTranslator] ⏱️ 批次${batchNumber}性能分析: 总耗时${perfTotal.toFixed(0)}ms | ` +
          `JSON转换=${(t2-t1).toFixed(0)}ms, Prompt构建=${(t3-t2).toFixed(0)}ms, ` +
          `API调用=${(t4-t3).toFixed(0)}ms (${((t4-t3)/perfTotal*100).toFixed(1)}%), ` +
          `验证=${(t5-t4).toFixed(0)}ms`
        );

        results.push(...translations);

        // 6. 批次间延迟（仅batch阶段，且非最后一批）
        if (stage === 'batch' && i + this.modelConfig.batchSize < texts.length) {
          console.debug(`[debug][GeminiTranslator] 批次延迟 ${this.batchDelay}ms`);
          await this.delayWithSignal(this.batchDelay, signal);
        }

      } catch (error) {
        console.error(`[GeminiTranslator] ✗ 批次${batchNumber}翻译失败:`, error);
        throw error;
      }
    }

    console.log(`[GeminiTranslator] ✓ 翻译完成: ${results.length}条字幕`);
    return results;
  }


  /**
   * 转换为 JSON 结构供 Schema 使用
   */
  private convertToJSON(texts: string[]): SubtitleItem[] {
    return texts.map((text, index) => ({
      id: index,
      text: text.replace(/\n/g, ' ').trim()
    }));
  }

  /**
   * 构建翻译prompt
   * @param yamlInput YAML格式输入
   * @param count 字幕条数
   * @param sourceLangName 源语言英文名称（如 'English', 'Chinese'）
   * @param targetLangName 目标语言英文名称（如 'Chinese', 'Japanese'）
   * @returns 完整prompt
   */
  private buildTranslationPrompt(
    items: SubtitleItem[],
    sourceLangName: string,
    targetLangName: string
  ): string {
    return `You are a professional subtitle translator. Translate these ${items.length} subtitles from ${sourceLangName} to ${targetLangName}.

CRITICAL RULES - MUST FOLLOW EXACTLY:
1. Each input item has an "id" and "text" field
2. Output MUST have EXACTLY ${items.length} items with THE SAME id numbers (0, 1, 2, ... ${items.length - 1})
3. Translate EACH subtitle INDEPENDENTLY - do NOT combine multiple subtitles into one translation
4. NEVER skip any subtitle - every input id MUST have a corresponding output
5. NEVER merge translations - each output text must correspond to ONE input text only
6. Keep the same id numbers in the same order: 0→0, 1→1, 2→2, etc.

EXAMPLE (for 3 subtitles):
Input:  [{"id":0,"text":"Hello"},{"id":1,"text":"World"},{"id":2,"text":"!"}]
Output: [{"id":0,"text":"你好"},{"id":1,"text":"世界"},{"id":2,"text":"！"}]

WRONG - DO NOT DO THIS:
Output: [{"id":0,"text":"你好世界！"}]  ← This merges 3 subtitles into 1, WRONG!

Now translate these ${items.length} subtitles:
${JSON.stringify(items, null, 2)}

Remember: Output must have EXACTLY ${items.length} items with ids from 0 to ${items.length - 1}.`;
  }

  /**
   * 调用Gemini API
   * @param prompt 完整prompt
   * @param signal AbortSignal
   * @param maxOutputTokens 动态计算的最大输出tokens
   * @returns API响应文本
   */
  private async callGeminiAPI(
    prompt: string,
    signal: AbortSignal,
    maxOutputTokens: number
  ): Promise<SubtitleItem[]> {
    // Gemini API endpoint（使用beta版支持最新模型）
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody: GeminiRequest = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: this.temperature,
        max_output_tokens: maxOutputTokens,        // ✓ 使用 snake_case
        response_mime_type: 'application/json',    // ✓ 使用 snake_case
        response_schema: SUBTITLE_TRANSLATION_SCHEMA  // ✓ 使用 response_schema（REST API 字段名）
      }
    };

    // 🔍 打印请求参数（调试用）
    console.log(`[GeminiTranslator] 📤 API请求参数: max_output_tokens=${maxOutputTokens}, temperature=${this.temperature}`);

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw this.createFatalError('error_translation_switch_provider');
      }
      throw this.createFatalError('error_gemini_network_failed');
    }

    if (!response.ok) {
      console.debug(`[debug][GeminiTranslator] ❌ API返回错误状态: ${response.status} ${response.statusText}`);
      await this.handleAPIError(response);
    }

    let data: GeminiResponse;
    try {
      data = await response.json();
    } catch {
      throw this.createFatalError('error_gemini_parse_failed', undefined, response.status);
    }

    if (!data.candidates?.[0]?.content) {
      throw this.createFatalError('error_gemini_response_format', undefined, response.status);
    }

    const content = data.candidates[0].content.parts[0]?.text;
    if (!content) {
      throw this.createFatalError('error_gemini_response_format', undefined, response.status);
    }

    const finishReason = data.candidates[0].finishReason;

    // 🔍 调试：打印完整响应结构（帮助排查问题）
    console.debug('[debug][GeminiTranslator] API响应结构:', {
      finishReason,
      hasContent: !!content,
      contentLength: content?.length || 0,
      usageMetadata: data.usageMetadata
    });

    this.handleFinishReason(finishReason);

    if (data.usageMetadata) {
      const actualInput = data.usageMetadata.promptTokenCount;
      const actualOutput = data.usageMetadata.candidatesTokenCount;
      const thoughtsTokens = (data.usageMetadata as any).thoughtsTokenCount || 0;
      const estimatedOutput = maxOutputTokens;
      const remaining = estimatedOutput - actualOutput;
      const remainingPercent = actualOutput === 0 ? '0.0' : ((remaining / actualOutput) * 100).toFixed(1);

      // ✅ 优化格式：调整顺序为 输入 → 估算 → 输出 → thinking → 余量
      console.log(
        `[GeminiTranslator] 📊 Token实际用量: 输入=${actualInput}, 估算=${estimatedOutput}, 输出=${actualOutput}, thinking=${thoughtsTokens}, 余量=${remaining} (${remainingPercent}%)`
      );
    }

    try {
      const parsed = JSON.parse(content);
      const translations = parsed?.translations;
      if (!Array.isArray(translations)) {
        console.debug('[debug][GeminiTranslator] ❌ JSON 响应缺少 translations 字段');
        console.debug('[debug][GeminiTranslator] 📄 原始响应:', content);
        throw this.createFatalError('error_gemini_parse_failed', undefined, response.status);
      }
      return translations as SubtitleItem[];
    } catch (error) {
      console.debug('[debug][GeminiTranslator] ❌ JSON 解析失败:', error);
      console.debug('[debug][GeminiTranslator] 📄 原始响应:', content);
      throw this.createFatalError('error_gemini_parse_failed', undefined, response.status);
    }
  }

  /**
   * 验证翻译结果
   * @param items 翻译后的字幕
   * @param expectedCount 期望数量
   * @param originalTexts 原始文本数组（用于对比调试）
   */
  private validateTranslationResult(
    items: SubtitleItem[],
    expectedCount: number,
    originalTexts?: string[]
  ): void {
    if (items.length !== expectedCount) {
      console.debug(
        `[debug][GeminiTranslator] ❌ 翻译数量不匹配: 期望${expectedCount}条，实际${items.length}条`
      );
      throw this.createFatalError('error_translation_switch_provider');
    }

    for (let i = 0; i < items.length; i++) {
      if (items[i].id !== i) {
        console.debug(
          `[debug][GeminiTranslator] ❌ ID 不连续: 期望 id=${i}, 实际 id=${items[i].id}`
        );
        throw this.createFatalError('error_translation_switch_provider');
      }

      // 检查空翻译
      if (!items[i].text || items[i].text.trim() === '') {
        const originalText = originalTexts?.[i] || '(无原文)';

        // 🔍 打印详细的翻译前后对比
        console.debug(`[debug][GeminiTranslator] ❌ 发现空翻译: id=${items[i].id}`);
        console.debug(`[debug][GeminiTranslator] 📋 翻译前后对比:`);
        console.debug(`  原文[${i}]: "${originalText}"`);
        console.debug(`  译文[${i}]: "${items[i].text}"`);

        // 打印全部翻译对比（完整batch）
        console.debug(`[debug][GeminiTranslator] 📊 完整批次翻译对比（共${items.length}条）:`);
        console.debug('========================================');
        for (let j = 0; j < items.length; j++) {
          const orig = originalTexts?.[j] || '(无)';
          const trans = items[j]?.text || '(空)';
          const marker = j === i ? '❌' : '  ';
          const status = j === i ? '[空翻译]' : (trans === '(空)' ? '[空]' : '[正常]');

          console.debug(`${marker} [${j}] ${status}`);
          console.debug(`    原文: "${orig}"`);
          console.debug(`    译文: "${trans}"`);
          console.debug('----------------------------------------');
        }
        console.debug('========================================');

        throw this.createFatalError('error_translation_switch_provider');
      }
    }
  }

  /**
   * 处理API错误
   * @param response fetch响应对象
   */
  private async handleAPIError(response: Response): Promise<never> {
    let errorMessage = '未知错误';
    let errorCode: string | undefined;
    let rawBody: unknown = undefined;

    try {
      const errorData = await response.json();
       rawBody = errorData;
      errorMessage = errorData.error?.message || errorData.message || '未知错误';
      errorCode = errorData.error?.status || errorData.status;
    } catch (parseError) {
      rawBody = await response.text().catch(() => undefined);
      if (typeof rawBody === 'string' && rawBody.trim() !== '') {
        errorMessage = rawBody;
      } else {
        errorMessage = '未知错误';
      }
    }

    const status = response.status;
    console.debug('[debug][GeminiTranslator] ⚠️ API错误响应:', {
      status,
      errorCode,
      message: errorMessage,
      body: rawBody
    });

    switch (status) {
      case 400:
        if (errorCode === 'FAILED_PRECONDITION' || errorMessage.toLowerCase().includes('billing')) {
          throw this.createFatalError('error_translation_switch_provider', undefined, status);
        }
        if (errorMessage.toLowerCase().includes('api key')) {
          throw this.createFatalError('error_gemini_api_key_invalid', undefined, status);
        }
        throw this.createFatalError('error_translation_switch_provider', undefined, status);
      case 401:
      case 403:
        throw this.createFatalError('error_gemini_api_key_invalid', undefined, status);
      case 404:
        throw this.createFatalError('error_translation_switch_provider', undefined, status);
      case 429:
        throw this.createFatalError('error_gemini_rate_limit', undefined, status);
      case 500:
      case 502:
      case 503:
      case 504:
        throw this.createFatalError('error_gemini_server_error', undefined, status);
      default:
        throw this.createFatalError('error_translation_switch_provider', errorMessage, status);
    }
  }

  private handleFinishReason(finishReason: string): void {
    if (!finishReason || finishReason === 'STOP') {
      return;
    }

    // ⚠️ 打印实际的 finishReason 以便调试
    console.debug(`[debug][GeminiTranslator] ❌ 非正常结束: finishReason="${finishReason}"`);

    switch (finishReason) {
      case 'MAX_TOKENS':
        console.debug('[debug][GeminiTranslator] 原因: Token超限，请减少批次大小或增加max_output_tokens');
        throw this.createFatalError('error_translation_switch_provider');
      case 'SAFETY':
        console.debug('[debug][GeminiTranslator] 原因: 内容被安全过滤器拦截');
        throw this.createFatalError('error_translation_switch_provider');
      case 'RECITATION':
        console.debug('[debug][GeminiTranslator] 原因: 检测到重复内容');
        throw this.createFatalError('error_translation_switch_provider');
      default:
        console.debug(`[debug][GeminiTranslator] 原因: 未知的finishReason="${finishReason}"，请检查API文档`);
        throw this.createFatalError('error_translation_switch_provider');
    }
  }

  /**
   * 延迟工具（支持AbortSignal中断）
   * @param ms 延迟毫秒数
   * @param signal AbortSignal用于取消延迟
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
    return new TranslationError(resolvedMessage, 'fatal', 'gemini', status);
  }

}
