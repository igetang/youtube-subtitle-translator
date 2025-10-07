/**
 * @file openai-translator.ts
 * @description OpenAI翻译器 - V4架构适配版本
 * @version 4.0.0
 *
 * 核心特性：
 * - 支持stage ('urgent' | 'batch') 和 AbortSignal
 * - 非流式响应（stream: false）
 * - 批次大小160（配合IntelligentSegmenter）
 * - 文本清理 + 单\n分隔
 * - 细化错误处理
 */

/**
 * 模型配置映射表
 */
const MODEL_CONFIGS: Record<string, {
  contextWindow: number;
  maxOutput: number;
  pricing: {
    input: number;    // $/百万tokens
    output: number;
  };
}> = {
  'gpt-5': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 1.25, output: 10.0 }
  },
  'gpt-5-mini': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 0.25, output: 2.0 }
  },
  'gpt-5-nano': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 0.05, output: 0.40 }
  },
  // 兼容旧模型
  'gpt-4o': {
    contextWindow: 128_000,
    maxOutput: 16_000,
    pricing: { input: 2.5, output: 10.0 }
  },
  'gpt-4o-mini': {
    contextWindow: 128_000,
    maxOutput: 16_000,
    pricing: { input: 0.15, output: 0.6 }
  }
};

/**
 * OpenAI翻译器类 - V4架构
 */
export class OpenAITranslator {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private modelConfig: typeof MODEL_CONFIGS[string];

  /**
   * 构造函数
   * @param apiKey OpenAI API密钥
   * @param model 模型名称
   * @param temperature 温度参数 (0-1)
   */
  constructor(apiKey: string, model: string, temperature: number) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-5-mini'];

    console.log(`[OpenAITranslator] 初始化: 模型=${model}, temperature=${temperature}`);
    console.log(`[OpenAITranslator] 上下文窗口: ${this.modelConfig.contextWindow} tokens`);
    console.log(`[OpenAITranslator] 最大输出: ${this.modelConfig.maxOutput} tokens`);
  }

  /**
   * 翻译文本数组 - V4架构接口
   * @param texts 待翻译的文本数组
   * @param sourceLang 源语言代码 (YouTube标准)
   * @param targetLang 目标语言代码 (YouTube标准)
   * @param stage 翻译阶段 ('urgent' | 'batch')
   * @param signal AbortSignal用于中断请求
   * @returns 翻译后的文本数组
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

    console.log(`[OpenAITranslator] → 开始翻译: ${texts.length}条字幕 (${stage}阶段)`);

    try {
      // 1. 清理每条字幕的内部换行符
      const cleanedTexts = texts.map(text => text.replace(/\n/g, ' ').trim());

      // 2. 用单换行符拼接
      const combined = cleanedTexts.join('\n');

      // 3. 构建messages
      const messages = [
        {
          role: "system",
          content: `You are a professional subtitle translator.
Translate from ${sourceLang} to ${targetLang}.

CRITICAL RULES:
- Input has ${texts.length} lines (subtitles)
- Output MUST have EXACTLY ${texts.length} lines
- Each input line = one output line
- PRESERVE the exact position of ALL line breaks (newlines)
- Do NOT merge lines even if they form a complete sentence
- Do NOT add or remove lines
- Do NOT change the newline structure
- Translate text ONLY, keep newlines UNCHANGED

Example:
Input (2 lines):
I think
this is good

Output (2 lines):
我认为
这很好

WRONG (merged):
我认为这很好`
        },
        {
          role: "user",
          content: combined
        }
      ];

      // 4. 调用API（动态计算max_completion_tokens）
      const estimatedOutputTokens = this.estimateOutputTokens(combined);
      const translatedCombined = await this.callOpenAIAPI(messages, signal, estimatedOutputTokens);

      // 5. 拆分结果
      const translations = translatedCombined.split(/\r?\n/).map(t => t.trim()).filter(t => t.length > 0);

      // 6. 验证数量
      if (translations.length !== texts.length) {
        console.warn(`[OpenAITranslator] ⚠️  翻译数量不匹配: 期望${texts.length}条，实际${translations.length}条`);

        // 尝试修复：补齐或截断
        if (translations.length < texts.length) {
          // 补齐缺失的翻译
          while (translations.length < texts.length) {
            translations.push('[翻译错误: 结果缺失]');
          }
        } else {
          // 截断多余的翻译
          translations.splice(texts.length);
        }
      }

      console.log(`[OpenAITranslator] ✓ 翻译完成: ${translations.length}条`);
      return translations;

    } catch (error) {
      console.error(`[OpenAITranslator] ✗ 翻译失败:`, error);
      throw error;
    }
  }

  /**
   * 估算输出token数（基于输入长度）
   * 根据OpenAI最佳实践：设置合理的max_completion_tokens可以显著降低延迟
   * @param inputText 输入文本
   * @returns 估算的输出token数
   */
  private estimateOutputTokens(inputText: string): number {
    // 估算逻辑（基于实际数据优化）：
    // 实测：1182字符 → 1458 tokens，比例约 1.23
    // 公式：字符数 × 2（包含翻译扩展 + 安全余量）
    const estimated = Math.ceil(inputText.length * 2);

    // 限制范围：最小500，最大4000（字幕翻译通常不超过4000）
    const bounded = Math.max(500, Math.min(estimated, 4000));

    console.log(`[OpenAITranslator] 📊 估算输出tokens: ${bounded} (输入${inputText.length}字符 × 2)`);
    return bounded;
  }

  /**
   * 调用OpenAI API (非流式)
   * @param messages 消息数组
   * @param signal AbortSignal
   * @param maxCompletionTokens 最大完成token数
   * @returns 翻译后的组合文本
   */
  private async callOpenAIAPI(
    messages: any[],
    signal: AbortSignal,
    maxCompletionTokens: number
  ): Promise<string> {
    const url = 'https://api.openai.com/v1/chat/completions';

    try {
      // GPT-5系列模型不支持自定义temperature，只能使用默认值1
      const isGPT5 = this.model.startsWith('gpt-5');
      const requestBody: any = {
        model: this.model,
        messages: messages,
        max_completion_tokens: maxCompletionTokens,  // 动态设置，避免过大值导致延迟
        stream: false                                 // 非流式
      };

      // GPT-5模型优化参数（加速响应）
      if (isGPT5) {
        requestBody.reasoning_effort = 'minimal';  // 最小推理，更快响应
        requestBody.verbosity = 'low';              // 简洁输出
        console.log('[OpenAITranslator] GPT-5优化: reasoning_effort=minimal, verbosity=low');
      } else {
        // 非GPT-5模型使用temperature参数
        requestBody.temperature = this.temperature;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal                          // AbortSignal支持
      });

      // 错误处理
      if (!response.ok) {
        await this.handleAPIError(response);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI API返回内容为空');
      }

      // 📊 打印实际token使用情况并对比估算值
      if (data.usage) {
        const actualInput = data.usage.prompt_tokens;
        const actualOutput = data.usage.completion_tokens;
        const actualTotal = data.usage.total_tokens;
        const estimatedOutput = maxCompletionTokens;
        const diff = estimatedOutput - actualOutput;
        const diffPercent = ((diff / actualOutput) * 100).toFixed(1);

        console.log(`[OpenAITranslator] 📊 Token实际用量:` +
          ` 输入${actualInput}, 输出${actualOutput}, 总计${actualTotal}`);
        console.log(`[OpenAITranslator] 📊 估算对比:` +
          ` 估算${estimatedOutput} vs 实际${actualOutput}` +
          ` (差距${diff}, ${diffPercent}%)`);
      }

      return content;

    } catch (error) {
      // AbortError特殊处理
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DOMException('OpenAI API请求被取消', 'AbortError');
      }
      throw error;
    }
  }

  /**
   * 处理API错误
   * @param response fetch响应对象
   */
  private async handleAPIError(response: Response): Promise<never> {
    let errorData: any = {};
    let errorMessage = '未知错误';

    try {
      errorData = await response.json();
      errorMessage = errorData.error?.message || errorData.message || '未知错误';
    } catch (parseError) {
      // JSON解析失败，使用状态码
      errorMessage = await response.text().catch(() => `HTTP ${response.status}`);
    }

    // 细化错误处理
    switch (response.status) {
      case 401:
      case 403:
        throw new Error(`OpenAI API密钥无效: ${errorMessage}`);

      case 429:
        throw new Error(`OpenAI API速率限制: ${errorMessage}`);

      case 500:
      case 502:
      case 503:
        throw new Error(`OpenAI服务暂时不可用: ${errorMessage}`);

      case 400:
        throw new Error(`OpenAI API请求参数错误: ${errorMessage}`);

      default:
        throw new Error(`OpenAI API错误 (${response.status}): ${errorMessage}`);
    }
  }
}
