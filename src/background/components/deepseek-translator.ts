/**
 * @file deepseek-translator.ts
 * @description DeepSeek AI 翻译服务实现
 * @version V4 - 支持 AbortSignal、两阶段翻译
 * @date 2025-10-06
 */

/**
 * DeepSeek API 消息接口
 */
interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * DeepSeek API 请求接口
 */
interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature: number;
  max_tokens: number;
  stream: false;
}

/**
 * DeepSeek API 响应接口
 */
interface DeepSeekResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * DeepSeek 翻译器类
 * 支持 V4 架构规范：AbortSignal、两阶段翻译、批量处理
 */
export class DeepSeekTranslator {
  // ========== 常量配置 ==========
  private static readonly ENDPOINT = 'https://api.deepseek.com/chat/completions';
  private static readonly MODEL = 'deepseek-chat';
  private static readonly TEMPERATURE = 1.3;          // 官方推荐值（翻译场景）
  private static readonly MAX_TOKENS = 8000;          // 支持更长输出
  private static readonly BATCH_SIZE = 20;            // 统一批次大小
  private static readonly BATCH_DELAY_MS = 200;       // batch 阶段延迟
  private static readonly SEPARATOR = '\n---\n';      // 字幕分隔符

  // ========== 实例属性 ==========
  private apiKey: string;

  /**
   * 构造函数
   * @param apiKey DeepSeek API 密钥
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 批量翻译文本（支持 AbortSignal 和两阶段翻译）
   * @param texts 待翻译文本数组
   * @param sourceLang 源语言代码（YouTube标准）
   * @param targetLang 目标语言代码（YouTube标准）
   * @param stage 翻译阶段：urgent（无延迟） | batch（200ms延迟）
   * @param signal AbortSignal 用于取消操作
   * @returns 翻译结果数组
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

    // 检查初始信号状态
    if (signal.aborted) {
      throw new DOMException('DeepSeek翻译开始前已取消', 'AbortError');
    }

    console.log(
      `[DeepSeekTranslator] 开始翻译 ${texts.length} 条字幕 (${stage}阶段)`
    );

    const results: string[] = [];

    // 分批处理（统一 20 条/批）
    const totalBatches = Math.ceil(texts.length / DeepSeekTranslator.BATCH_SIZE);
    for (let i = 0; i < texts.length; i += DeepSeekTranslator.BATCH_SIZE) {
      const batch = texts.slice(i, i + DeepSeekTranslator.BATCH_SIZE);
      const batchNumber = Math.floor(i / DeepSeekTranslator.BATCH_SIZE) + 1;

      console.debug(
        `[debug][DeepSeekTranslator] 翻译批次 ${batchNumber}/${totalBatches}: ` +
        `${batch.length} 条字幕 (${stage}阶段)`
      );

      // 构建提示词并调用 API
      const messages = this.buildTranslationPrompt(
        batch,
        this.mapLanguageCode(sourceLang),
        this.mapLanguageCode(targetLang)
      );

      const response = await this.callAPI(messages, signal);

      // 解析响应
      const translations = response.split(DeepSeekTranslator.SEPARATOR);

      // 验证数量匹配
      if (translations.length !== batch.length) {
        console.error(
          `[DeepSeekTranslator] 批次翻译数量不匹配: 期望${batch.length}, 实际${translations.length}`
        );
        throw new Error(
          `DeepSeek翻译结果数量不匹配: 期望${batch.length}条, 实际返回${translations.length}条`
        );
      }

      results.push(...translations.map(t => t.trim()));

      // 批次间延迟（仅 batch 阶段）
      if (stage === 'batch' && i + DeepSeekTranslator.BATCH_SIZE < texts.length) {
        await this.delayWithSignal(DeepSeekTranslator.BATCH_DELAY_MS, signal);
      }
    }

    console.log(`[DeepSeekTranslator] ✅ 翻译完成: ${results.length}/${texts.length} 条成功`);

    return results;
  }

  /**
   * 构建翻译提示词
   * @param texts 待翻译文本数组
   * @param sourceLang 源语言（已映射）
   * @param targetLang 目标语言（已映射）
   * @returns DeepSeek 消息数组
   */
  private buildTranslationPrompt(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): DeepSeekMessage[] {
    const combinedText = texts.join(DeepSeekTranslator.SEPARATOR);

    return [
      {
        role: 'system',
        content: `You are a professional translator. Translate from ${sourceLang} to ${targetLang}.
Keep the same format and structure.
If there are multiple texts separated by "---", translate each one and keep the separator.
Return ONLY the translation without any explanation.`
      },
      {
        role: 'user',
        content: combinedText
      }
    ];
  }

  /**
   * 调用 DeepSeek API（支持 AbortSignal）
   * @param messages 消息数组
   * @param signal AbortSignal 用于取消操作
   * @returns 翻译结果（已拼接）
   */
  private async callAPI(
    messages: DeepSeekMessage[],
    signal: AbortSignal
  ): Promise<string> {
    try {
      const response = await fetch(DeepSeekTranslator.ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: DeepSeekTranslator.MODEL,
          messages,
          temperature: DeepSeekTranslator.TEMPERATURE,
          max_tokens: DeepSeekTranslator.MAX_TOKENS,
          stream: false
        } as DeepSeekRequest),
        signal  // 使用外部 AbortSignal
      });

      // 错误处理细化（简化错误消息）
      if (!response.ok) {
        switch (response.status) {
          case 401:
          case 403:
            throw new Error('DeepSeek API密钥无效');
          case 429:
            throw new Error('DeepSeek API速率限制');
          case 500:
          case 502:
          case 503:
            throw new Error('DeepSeek服务暂时不可用');
          default:
            throw new Error(`DeepSeek API错误 (${response.status})`);
        }
      }

      const data: DeepSeekResponse = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('DeepSeek API返回格式错误');
      }

      // 记录 token 使用情况
      console.debug(
        `[debug][DeepSeekTranslator] Token使用: ` +
        `输入=${data.usage.prompt_tokens}, ` +
        `输出=${data.usage.completion_tokens}, ` +
        `总计=${data.usage.total_tokens}`
      );

      return data.choices[0].message.content;

    } catch (error: any) {
      // AbortError 处理
      if (error.name === 'AbortError') {
        throw new DOMException('DeepSeek API请求被取消', 'AbortError');
      }
      throw error;
    }
  }

  /**
   * 延迟工具（支持 AbortSignal 中断）
   * @param ms 延迟毫秒数
   * @param signal AbortSignal 用于取消延迟
   */
  private async delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);

      const abortHandler = () => {
        clearTimeout(timer);
        reject(new DOMException('延迟被取消', 'AbortError'));
      };

      signal.addEventListener('abort', abortHandler, { once: true });
    });
  }

  /**
   * 语言代码映射（YouTube标准 → DeepSeek标准）
   * DeepSeek 使用标准 ISO 639-1 语言代码
   * @param code YouTube 语言代码
   * @returns DeepSeek 语言代码
   */
  private mapLanguageCode(code: string): string {
    const mapping: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'zh',
      'zh-Hans': 'zh',
      'zh-Hant': 'zh',
      'en': 'en',
      'ja': 'ja',
      'ko': 'ko',
      'es': 'es',
      'fr': 'fr',
      'de': 'de',
      'ru': 'ru',
      'ar': 'ar',
      'pt': 'pt',
      'it': 'it',
      'nl': 'nl',
      'hi': 'hi',
      'vi': 'vi',
      'th': 'th',
      'id': 'id',
      'tr': 'tr',
      'pl': 'pl',
      'uk': 'uk'
    };

    return mapping[code] || code;
  }
}
