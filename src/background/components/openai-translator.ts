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
Input contains multiple subtitles separated by newlines.
Each line is one subtitle. Keep the same number of lines.
Do not add explanations.`
        },
        {
          role: "user",
          content: combined
        }
      ];

      // 4. 调用API
      const translatedCombined = await this.callOpenAIAPI(messages, signal);

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
   * 调用OpenAI API (非流式)
   * @param messages 消息数组
   * @param signal AbortSignal
   * @returns 翻译后的组合文本
   */
  private async callOpenAIAPI(
    messages: any[],
    signal: AbortSignal
  ): Promise<string> {
    const url = 'https://api.openai.com/v1/chat/completions';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: this.temperature,
          max_completion_tokens: 128000,  // GPT-5系列使用max_completion_tokens
          stream: false                   // 非流式
        }),
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
