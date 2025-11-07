/**
 * @file gemini-translator.ts
 * @description Google Gemini 翻译器 - V4架构适配版本
 * @version 4.0.0
 *
 * 核心特性：
 * - 支持 stage ('urgent' | 'batch') 和 AbortSignal
 * - 非流式响应（stream: false）
 * - 批次大小 80（利用1M token上下文窗口）
 * - YAML格式（id + text结构，强制一对一对应）
 * - Phase 1: 从配置读取 batchDelay（手动选择 tier）
 * - 细化错误处理
 */

/**
 * Gemini API 请求接口
 */
interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    thinkingConfig?: {      // ⭐ 新增：thinking配置
      thinkingBudget?: number;  // 0 = 禁用thinking
    };
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
 * YAML字幕项接口
 */
interface YAMLSubtitleItem {
  id: number;
  text: string;
}

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
    batchSize: 80              // 建议批次大小
  },
  'gemini-2.5-flash-lite': {
    contextWindow: 1_000_000,  // 1M tokens 上下文窗口
    maxOutput: 65_536,         // 64K tokens 最大输出
    batchSize: 80              // 建议批次大小
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

    // ✅ 已改为debug级别（避免在两阶段翻译中重复打印）
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

        // 1. 转换为YAML格式（id + text结构）
        const t1 = performance.now();
        const yamlInput = this.convertToYAML(batch);
        const t2 = performance.now();

        // 2. 构建prompt（传入已转换的语言名称）
        const prompt = this.buildTranslationPrompt(yamlInput, batch.length, sourceLangName, targetLangName);
        const t3 = performance.now();

        // ✅ 合并3条debug日志为1条
        console.debug(
          `[debug][GeminiTranslator] 翻译批次 ${batchNumber}/${totalBatches}: ${batch.length}条字幕 | YAML输入${yamlInput.length}字符, Prompt${prompt.length}字符`
        );

        // 3. 估算maxOutputTokens（对比两种算法）
        const encoder = new TextEncoder();
        const inputBytes = encoder.encode(yamlInput).length;

        // Token估算：inputBytes ÷ 2.5 × 1.5
        const estimatedOutputTokens = Math.ceil((inputBytes / 2.5) * 1.5);
        const maxOutputTokens = Math.min(estimatedOutputTokens, this.modelConfig.maxOutput);

        // ✅ 删除调用API参数日志（内部实现细节，Token统计日志已包含关键信息）

        // 4. 调用Gemini API
        const responseText = await this.callGeminiAPI(prompt, signal, maxOutputTokens);
        const t4 = performance.now();

        // 4. 解析YAML结果
        const translations = this.parseYAMLResponse(responseText, batch.length);
        const t5 = performance.now();

        // ⏱️ 性能统计
        const perfTotal = t5 - perfStart;
        console.log(
          `[GeminiTranslator] ⏱️ 批次${batchNumber}性能分析: 总耗时${perfTotal.toFixed(0)}ms | ` +
          `YAML转换=${(t2-t1).toFixed(0)}ms, Prompt构建=${(t3-t2).toFixed(0)}ms, ` +
          `API调用=${(t4-t3).toFixed(0)}ms (${((t4-t3)/perfTotal*100).toFixed(1)}%), ` +
          `YAML解析=${(t5-t4).toFixed(0)}ms`
        );

        // 5. 验证数量匹配
        if (translations.length !== batch.length) {
          console.error(
            `[GeminiTranslator] ❌ 翻译数量不匹配: 期望${batch.length}条，实际${translations.length}条`
          );
          throw this.createFatalError('error_translation_switch_provider');
        }

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
   * 转换为YAML格式
   * @param texts 文本数组
   * @returns YAML字符串
   */
  private convertToYAML(texts: string[]): string {
    const items: YAMLSubtitleItem[] = texts.map((text, index) => ({
      id: index,
      text: text.replace(/\n/g, ' ').trim()  // 清理内部换行符
    }));

    const yamlLines = ['subtitles:'];
    items.forEach(item => {
      // YAML格式：缩进2空格，使用引号包裹text（避免特殊字符问题）
      yamlLines.push(`  - id: ${item.id}`);
      yamlLines.push(`    text: "${item.text.replace(/"/g, '\\"')}"`);  // 转义引号
    });

    return yamlLines.join('\n');
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
    yamlInput: string,
    count: number,
    sourceLangName: string,
    targetLangName: string
  ): string {
    // ✅ 直接使用传入的英文名称（不再内部转换）
    return `You are a professional subtitle translator.
Translate from ${sourceLangName} to ${targetLangName}.

INPUT FORMAT: YAML containing ${count} subtitle items (id + text)
OUTPUT FORMAT: YAML with EXACTLY ${count} translated items (keep the same id numbers!)

CRITICAL RULES:
1. Input has items with id: 0, 1, 2... ${count - 1}
2. Output MUST have the SAME id numbers: 0, 1, 2... ${count - 1}
3. Translate ONLY the text field, keep id unchanged
4. NEVER skip or merge items - every input id must have a corresponding output id
5. Return ONLY the YAML output, NO explanations

Example:
Input:
subtitles:
  - id: 0
    text: "Hello world"
  - id: 1
    text: "How are you"

Output:
subtitles:
  - id: 0
    text: "你好世界"
  - id: 1
    text: "你好吗"

IMPORTANT:
- Missing ANY id means the translation failed!
- The output must be valid YAML that can be parsed

Now translate this:

${yamlInput}`;
  }

  /**
   * 调用Gemini API
   * @param prompt 完整prompt
   * @param signal AbortSignal
   * @param maxOutputTokens 动态计算的最大输出tokens
   * @returns API响应文本
   */
  private async callGeminiAPI(prompt: string, signal: AbortSignal, maxOutputTokens: number): Promise<string> {
    // Gemini API endpoint（使用beta版支持最新模型）
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody: GeminiRequest = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: maxOutputTokens,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    // 日志已在translate方法中输出，这里不重复打印

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
    this.handleFinishReason(finishReason);

    // ✅ 删除响应文本长度日志（内部实现细节，对用户无意义）

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

    return content;
  }

  /**
   * 解析YAML响应
   * @param responseText API响应文本
   * @param expectedCount 期望的字幕条数
   * @returns 翻译后的文本数组
   */
  private parseYAMLResponse(responseText: string, expectedCount: number): string[] {
    try {
      // 简单的YAML解析（针对我们的特定格式）
      const lines = responseText.split('\n');
      const items: YAMLSubtitleItem[] = [];
      let currentItem: Partial<YAMLSubtitleItem> | null = null;

      for (const line of lines) {
        const trimmed = line.trim();

        // 匹配 "- id: N"
        const idMatch = trimmed.match(/^-\s*id:\s*(\d+)$/);
        if (idMatch) {
          // 保存上一个item
          if (currentItem && currentItem.id !== undefined && currentItem.text !== undefined) {
            items.push(currentItem as YAMLSubtitleItem);
          }
          // 开始新item
          currentItem = { id: parseInt(idMatch[1], 10) };
          continue;
        }

        // 匹配 "text: "..."" 或 "text: ..."
        const textMatch = trimmed.match(/^text:\s*"(.+)"$/) || trimmed.match(/^text:\s*(.+)$/);
        if (textMatch && currentItem) {
          // 反转义引号
          currentItem.text = textMatch[1].replace(/\\"/g, '"');
        }
      }

      // 保存最后一个item
      if (currentItem && currentItem.id !== undefined && currentItem.text !== undefined) {
        items.push(currentItem as YAMLSubtitleItem);
      }

      // 排序确保顺序正确
      items.sort((a, b) => a.id - b.id);

      // 验证数量
      if (items.length !== expectedCount) {
        console.error(
          `[GeminiTranslator] ⚠️ YAML解析数量不匹配: 期望${expectedCount}, 解析到${items.length}`
        );
        console.error('[GeminiTranslator] 原始响应:', responseText);
        throw this.createFatalError('error_translation_switch_provider');
      }

      // 提取text字段
      return items.map(item => item.text);

    } catch (error) {
      console.error('[GeminiTranslator] ❌ YAML解析失败:', error);
      console.error('[GeminiTranslator] 原始响应:', responseText);
      throw this.createFatalError('error_gemini_parse_failed');
    }
  }

  /**
   * 处理API错误
   * @param response fetch响应对象
   */
  private async handleAPIError(response: Response): Promise<never> {
    let errorMessage = '未知错误';
    let errorCode: string | undefined;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorData.message || '未知错误';
      errorCode = errorData.error?.status || errorData.status;
    } catch (parseError) {
      errorMessage = await response.text().catch(() => '未知错误');
    }

    const status = response.status;

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

    switch (finishReason) {
      case 'MAX_TOKENS':
        throw this.createFatalError('error_translation_switch_provider');
      case 'SAFETY':
        throw this.createFatalError('error_translation_switch_provider');
      case 'RECITATION':
        throw this.createFatalError('error_translation_switch_provider');
      default:
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
