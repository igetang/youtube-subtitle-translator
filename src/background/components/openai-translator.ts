/**
 * @file openai-translator.ts
 * @description OpenAI翻译器 - V4架构适配版本
 * @version 4.3.2
 *
 * 核心特性：
 * - 支持stage ('urgent' | 'batch') 和 AbortSignal
 * - 非流式响应（stream: false）
 * - 批次大小20（配合IntelligentSegmenter，避免GPT合并字幕）
 * - 文本清理 + JSON格式/\n\n分隔格式（可切换）
 * - 编号标记系统（解决数量不匹配问题）
 * - 强化Prompt（数量约束前置，列表式规则，禁止额外输出）
 * - GPT-5参数优化（verbosity=medium，提高输出完整性）
 * - temperature参数支持（默认1.0，GPT-5系列会忽略但保留用于测试）
 * - 细化错误处理
 *
 * 更新记录：
 * - v4.3.2: 恢复temperature参数支持（默认1.0，用于测试，GPT-5会忽略）
 * - v4.3.1: 强化Prompt禁止额外文本，恢复Token估算对比日志
 * - v4.3.0: 精简callOpenAIAPI函数，删除无用判断，verbosity改为medium
 * - v4.2.1: 优化Prompt顺序（角色→任务→约束），强化数量要求，改用列表式规则
 * - v4.2.0: 针对GPT-5系列优化Prompt，精简至14行，重点防止AI合并重复字幕
 * - v4.1.0: 添加编号标记系统，每条字幕加[n]前缀，强制保持一对一对应
 */

/**
 * 模型配置映射表
 */
import { handleFetchError, TranslationError } from '@shared/types/translation-errors';
import { LanguageCodeMapper } from '@shared/utils/language-code-mapper';

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
   * @param temperature 温度参数（GPT-5系列固定为1，此参数保留用于测试）
   */
  constructor(apiKey: string, model: string, temperature: number = 1.0) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-5-mini'];
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

    if (signal.aborted) {
      throw new DOMException('OpenAI 翻译开始前已取消', 'AbortError');
    }

    console.log(`[OpenAITranslator] → 开始翻译: ${texts.length}条字幕 (${stage}阶段)`);

    try {
      // 1. 清理每条字幕的内部换行符
      const cleanedTexts = texts.map(text => text.replace(/\n/g, ' ').trim());

      // 2. 添加编号标记（帮助AI保持一对一对应）
      const numberedTexts = cleanedTexts.map((text, i) => `[${i}] ${text}`);

      // 3. 转换为JSON数组格式
      const jsonInput = JSON.stringify(numberedTexts);
      console.debug(`[debug][OpenAITranslator] JSON输入长度: ${jsonInput.length}字符, ${numberedTexts.length}条带编号字幕`);

      // 3. 转换目标语言代码为英文名称（Chat API要求）
      const targetLangName = LanguageCodeMapper.toEnglishName(targetLang);

      // 4. 构建messages（精简版Prompt，明确输入输出格式）
      const messages = [
        {
          role: "system",
          content: `You are a professional subtitle translator.
Translate ${texts.length} subtitles from ${sourceLang} to ${targetLangName}.

INPUT FORMAT: JSON array with ${texts.length} numbered items: ["[0] text1", "[1] text2", ...]
OUTPUT FORMAT: JSON array with ${texts.length} translations: ["[0] 翻译1", "[1] 翻译2", ...]

CRITICAL RULES:
- Input has ${texts.length} items → Output MUST have ${texts.length} items
- NEVER merge duplicate items (they have different timestamps)
- Each [n] input must produce one [n] output, even if text is identical
- Return ONLY valid JSON array, no extra text

Example:
Input: ["[0] Hello", "[1] Hello", "[2] World"]
Output: ["[0] 你好", "[1] 你好", "[2] 世界"]`
        },
        {
          role: "user",
          content: jsonInput
        }
      ];

      // 4. 调用API（动态计算max_completion_tokens，考虑JSON额外开销）
      const jsonOverhead = texts.length * 4; // JSON格式额外字符：[] " " ,
      const estimatedOutputTokens = this.estimateOutputTokens(jsonInput, jsonOverhead);

      // 打印合并日志：模型 + max_completion_tokens + 翻译语言参数
      console.log(`[OpenAITranslator] 模型=${this.model}, max_completion_tokens=${estimatedOutputTokens}, 翻译语言参数: ${sourceLang} → ${targetLangName}`);

      if (signal.aborted) {
        throw new DOMException('OpenAI 翻译已取消', 'AbortError');
      }

      const responseText = await this.callOpenAIAPI(messages, signal, estimatedOutputTokens);

      // 5. 解析JSON结果
      let numberedTranslations: string[];
      try {
        // 尝试直接解析
        numberedTranslations = JSON.parse(responseText);
        console.debug(`[debug][OpenAITranslator] ✓ JSON解析成功，收到${numberedTranslations.length}条带编号翻译`);
      } catch (parseError) {
        console.warn(`[OpenAITranslator] ⚠️  JSON解析失败，尝试提取JSON部分`, parseError);
        console.error(`[OpenAITranslator] 📄 OpenAI原始响应:`, responseText);

        // 容错：提取JSON数组部分（AI可能返回了额外文字）
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            numberedTranslations = JSON.parse(jsonMatch[0]);
            console.debug(`[debug][OpenAITranslator] ✓ 从响应中提取JSON成功，收到${numberedTranslations.length}条带编号翻译`);
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            throw new TranslationError(
              `OpenAI 翻译结果解析失败: ${errorMsg}`,
              'retryable',
              'openai'
            );
          }
        } else {
          throw new TranslationError(
            'OpenAI 翻译响应缺少JSON数组',
            'retryable',
            'openai'
          );
        }
      }

      // 6. 验证返回类型和数量
      if (!Array.isArray(numberedTranslations)) {
        throw new TranslationError(
          `OpenAI 翻译响应格式错误：返回类型为 ${typeof numberedTranslations}`,
          'retryable',
          'openai'
        );
      }

      // 7. 去除编号，提取纯翻译文本
      const translations = numberedTranslations.map((item, index) => {
        // 移除开头的 [n] 编号
        const cleaned = item.replace(/^\[\d+\]\s*/, '');

        // 检查编号是否正确（可选的验证）
        const expectedPrefix = `[${index}]`;
        if (!item.startsWith(expectedPrefix)) {
          console.warn(`[OpenAITranslator] ⚠️ 编号不匹配: 期望 ${expectedPrefix}，实际 ${item.substring(0, 10)}`);
        }

        return cleaned;
      });

      // 8. 最终数量验证
      if (translations.length !== texts.length) {
        // 打印详细调试信息
        console.error(`[OpenAITranslator] 原始输入(全部${texts.length}条):`, cleanedTexts);
        console.error(`[OpenAITranslator] AI返回结果(全部${numberedTranslations.length}条):`, numberedTranslations);
        console.error(`[OpenAITranslator] API原始响应:`, responseText);

        // 抛出错误
        throw new TranslationError(
          `OpenAI 翻译数量不匹配：期望${texts.length}条，实际${translations.length}条`,
          'retryable',
          'openai'
        );
      }

      console.log(`[OpenAITranslator] ✓ 翻译完成: ${translations.length}条字幕（已去除编号）`);
      return translations;

    } catch (error) {
      console.error(`[OpenAITranslator] ✗ 翻译失败:`, error);
      throw error;
    }
  }

  /**
   * 估算输出token数（基于输入长度）
   * 根据OpenAI最佳实践：设置合理的max_completion_tokens可以显著降低延迟
   * @param inputText 输入文本（JSON格式或\n\n分隔）
   * @param jsonOverhead JSON格式额外字符数
   * @returns 估算的输出token数
   */
  private estimateOutputTokens(inputText: string, jsonOverhead: number = 0): number {
    // 估算逻辑（与Gemini保持一致）：
    // 1. 字符数 → UTF-8字节数（中文3字节，英文1字节）
    // 2. 字节数 ÷ 2.5 = 输入tokens
    // 3. 输入tokens × 1.5 = 输出tokens（50%余量，保证充足空间）
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(inputText).length + jsonOverhead;
    const estimatedInputTokens = inputBytes / 2.5;
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 1.5);  // 50%余量

    // 限制上限（避免超过模型最大输出）
    const maxOutputTokens = Math.min(estimatedOutputTokens, this.modelConfig.maxOutput);

    console.debug(
      `[debug][OpenAITranslator] 📊 估算: ${inputBytes}字节 → 输入~${Math.round(estimatedInputTokens)}tokens → ` +
      `输出~${estimatedOutputTokens}tokens (上限${this.modelConfig.maxOutput})`
    );
    return maxOutputTokens;
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

    // 构建请求体
    // 注意：GPT-5系列会忽略temperature参数（固定为1），但保留用于测试
    const requestBody = {
      model: this.model,
      messages,
      max_completion_tokens: maxCompletionTokens,
      stream: false,
      temperature: this.temperature,      // GPT-5系列会忽略此参数
      reasoning_effort: 'minimal',        // 保持最快速度
      verbosity: 'low'                 // 提高输出完整性
    };

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (error) {
      handleFetchError(error, 'openai', 'OpenAI API 网络请求失败');
    }

    if (!response.ok) {
      await this.handleAPIError(response);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new TranslationError(
        'OpenAI API 返回内容解析失败',
        'retryable',
        'openai',
        response.status
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      // 添加详细调试信息，帮助排查问题
      console.error('[OpenAITranslator] API返回结构异常:', {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        firstChoice: data.choices?.[0],
        hasMessage: !!data.choices?.[0]?.message,
        messageContent: data.choices?.[0]?.message?.content,
        finishReason: data.choices?.[0]?.finish_reason,
        fullResponse: data
      });

      throw new TranslationError(
        'OpenAI API 返回内容为空',
        'retryable',
        'openai',
        response.status
      );
    }

    // Token使用统计（含估算对比）
    if (data.usage) {
      const actualInput = data.usage.prompt_tokens;
      const actualOutput = data.usage.completion_tokens;
      const actualTotal = data.usage.total_tokens;
      const estimatedOutput = maxCompletionTokens;
      const diff = estimatedOutput - actualOutput;

      console.log(
        `[OpenAITranslator] 📊 Token用量: 输入${actualInput}, ` +
        `输出${actualOutput} (估算${estimatedOutput}, 差值${diff}), 总计${actualTotal}`
      );
    }

    return content;
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
      errorCode = errorData.error?.code || errorData.code;
    } catch {
      errorMessage = await response.text().catch(() => '未知错误');
    }

    const status = response.status;

    switch (status) {
      case 400:
        throw new TranslationError(
          `OpenAI 请求参数错误: ${errorMessage}`,
          'fatal',
          'openai',
          status,
          errorCode
        );
      case 401:
      case 403:
        throw new TranslationError(
          'OpenAI API密钥无效，请检查设置',
          'fatal',
          'openai',
          status,
          errorCode
        );
      case 402:
        throw new TranslationError(
          'OpenAI 账户余额不足，请前往官网充值',
          'fatal',
          'openai',
          status,
          errorCode
        );
      case 422:
        throw new TranslationError(
          'OpenAI 暂时不支持当前设置的语种',
          'fatal',
          'openai',
          status,
          errorCode
        );
      case 429:
        throw new TranslationError(
          'OpenAI API 请求过于频繁，请稍后重试',
          'retryable',
          'openai',
          status,
          errorCode
        );
      case 500:
      case 502:
      case 503:
        throw new TranslationError(
          'OpenAI 服务暂时不可用，请稍后重试',
          'retryable',
          'openai',
          status,
          errorCode
        );
      default:
        throw new TranslationError(
          `OpenAI API 错误 (${status}): ${errorMessage}`,
          'fatal',
          'openai',
          status,
          errorCode
        );
    }
  }
}
