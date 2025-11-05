/**
 * @file deepseek-translator.ts
 * @description DeepSeek AI 翻译服务实现
 * @version V4 - 支持 AbortSignal、两阶段翻译
 * @date 2025-10-06
 */

import {
  handleFetchError,
  TranslationError,
} from '@shared/types/translation-errors';
import { LanguageCodeMapper } from '@shared/utils/language-code-mapper';
import { TokenEstimator } from '@shared/utils/token-estimator';

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
  // ========== 调试开关 ==========
  private static readonly DEBUG_TRANSLATION = false;  // 🔧 调试开关：打印翻译前后的详细信息

  // ========== 常量配置 ==========
  private static readonly ENDPOINT = 'https://api.deepseek.com/chat/completions';
  private static readonly MODEL = 'deepseek-chat';
  private static readonly TEMPERATURE = 1.3;          // 官方推荐值（翻译场景）
  private static readonly MAX_TOKENS = 8000;          // 支持更长输出
  private static readonly BATCH_SIZE = 10;            // 批量翻译批次大小（优化：20→10，减少超时风险）
  private static readonly BATCH_DELAY_MS = 50;        // batch 阶段延迟
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
   * @param sourceLangName 源语言英文名称（如 'English', 'Chinese'）
   * @param targetLangName 目标语言英文名称（如 'Chinese', 'Japanese'）
   * @param stage 翻译阶段：urgent（无延迟） | batch（200ms延迟）
   * @param signal AbortSignal 用于取消操作
   * @returns 翻译结果数组
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
      throw new DOMException('DeepSeek翻译开始前已取消', 'AbortError');
    }

    // ✅ 直接使用上层传入的英文名称（已在callTranslationAPI中统一转换）
    console.log(
      `[DeepSeekTranslator] → 翻译 ${texts.length}条 | ${stage}阶段 | ${sourceLangName} → ${targetLangName}`
    );

    const results: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalEstimatedOutputTokens = 0;

    // 分批处理（统一 10 条/批）
    const totalBatches = Math.ceil(texts.length / DeepSeekTranslator.BATCH_SIZE);
    for (let i = 0; i < texts.length; i += DeepSeekTranslator.BATCH_SIZE) {
      if (signal.aborted) {
        throw new DOMException('DeepSeek翻译已取消', 'AbortError');
      }

      const batch = texts.slice(i, i + DeepSeekTranslator.BATCH_SIZE);
      const batchNumber = Math.floor(i / DeepSeekTranslator.BATCH_SIZE) + 1;

      // 🔧 调试日志：打印输入字幕（完整拼接字符串）
      const combinedInput = batch.join(DeepSeekTranslator.SEPARATOR);
      if (DeepSeekTranslator.DEBUG_TRANSLATION) {
        console.log(`\n========== [DeepSeekTranslator] 批次${batchNumber}/${totalBatches} (${stage}阶段) ==========`);
        console.log(`📥 原文拼接字符串 (共${batch.length}条):`);
        console.log(JSON.stringify(combinedInput));
        console.log(`${'='.repeat(60)}`);
      }

      // 构建提示词并调用 API（使用英文语言名称）
      const messages = this.buildTranslationPrompt(
        batch,
        sourceLangName,
        targetLangName
      );

      // 估算输出token（使用统一的TokenEstimator工具）
      const combinedText = batch.join(DeepSeekTranslator.SEPARATOR);
      const estimatedMaxTokens = TokenEstimator.estimateOutputTokens(
        combinedText,
        DeepSeekTranslator.MAX_TOKENS
      );

      const { content: response, usage } = await this.callAPI(messages, signal, estimatedMaxTokens);

      // 累计token使用
      if (usage) {
        totalInputTokens += usage.prompt_tokens;
        totalOutputTokens += usage.completion_tokens;
        totalEstimatedOutputTokens += estimatedMaxTokens;
      }

      // 🔧 调试日志：打印API返回的原始响应（完整字符串）
      if (DeepSeekTranslator.DEBUG_TRANSLATION) {
        console.log(`\n🔄 译文返回字符串:`);
        console.log(JSON.stringify(response));
        console.log(`${'='.repeat(60)}`);
        console.log(`🔍 响应长度: ${response.length}字符`);
        console.log(`🔍 分隔符"\\n---\\n"出现次数: ${(response.match(/\n---\n/g) || []).length}次 (期望${batch.length - 1}次)`);
        console.log(`${'='.repeat(60)}`);
      }

      // 解析响应
      const translations = response.split(DeepSeekTranslator.SEPARATOR);

      // 🔧 调试日志：打印双语对比
      if (DeepSeekTranslator.DEBUG_TRANSLATION) {
        console.log(`\n📋 双语字幕对比 (原文${batch.length}条 vs 译文${translations.length}条):`);
        const maxCount = Math.max(batch.length, translations.length);
        for (let idx = 0; idx < maxCount; idx++) {
          const original = batch[idx] || '【缺失】';
          const translated = translations[idx] || '【缺失】';
          console.log(`\n[${idx + 1}/${maxCount}]`);
          console.log(`  原文: ${original}`);
          console.log(`  译文: ${translated}`);
        }
        console.log(`${'='.repeat(60)}\n`);
      }

      // 验证数量匹配
      if (translations.length !== batch.length) {
        console.error(
          `[DeepSeekTranslator] ❌ 批次翻译数量不匹配: 期望${batch.length}, 实际${translations.length}`
        );
        // 🔧 详细错误信息
        if (DeepSeekTranslator.DEBUG_TRANSLATION) {
          console.error(`[DeepSeekTranslator] 🔍 详细对比:`);
          console.error(`  期望输入: ${batch.length}条`);
          console.error(`  实际输出: ${translations.length}条`);
          console.error(`  差异: ${translations.length - batch.length}条`);
        }
        throw new TranslationError(
          `DeepSeek 翻译数量不匹配: 期望 ${batch.length} 条，实际返回 ${translations.length} 条`,
          'retryable',
          'deepseek'
        );
      }

      results.push(...translations.map(t => t.trim()));

      // 批次间延迟（仅 batch 阶段）
      if (stage === 'batch' && i + DeepSeekTranslator.BATCH_SIZE < texts.length) {
        await this.delayWithSignal(DeepSeekTranslator.BATCH_DELAY_MS, signal);
      }
    }

    // ✅ 合并Token使用和翻译完成日志
    const remainingTokens = totalEstimatedOutputTokens - totalOutputTokens;
    console.debug(
      `[debug][DeepSeekTranslator] ✅ 翻译完成: ${results.length}/${texts.length}条 | ` +
      `Token: 输入=${totalInputTokens}, 估算=${totalEstimatedOutputTokens}, 输出=${totalOutputTokens}, 余量=${remainingTokens}`
    );

    return results;
  }

  /**
   * 构建翻译提示词
   * @param texts 待翻译文本数组
   * @param sourceLangName 源语言英文名称（如 'English', 'Chinese'）
   * @param targetLangName 目标语言英文名称（如 'Chinese', 'Japanese'）
   * @returns DeepSeek 消息数组
   */
  private buildTranslationPrompt(
    texts: string[],
    sourceLangName: string,
    targetLangName: string
  ): DeepSeekMessage[] {
    const combinedText = texts.join(DeepSeekTranslator.SEPARATOR);
    const count = texts.length;

    return [
      {
        role: 'system',
        content: `You are a professional translator. Translate ALL ${count} subtitles from ${sourceLangName} to ${targetLangName}.

CRITICAL RULES:
1. Return EXACTLY ${count} translations (one per input text)
2. Do NOT merge or combine any texts
3. Translate each text separately, keep same order

Input: ${count} texts separated by "\n---\n"
Output: ${count} translations separated by "\n---\n"

Example (3 texts):
Input: "A\n---\nB\n---\nC"
Output: "译A\n---\n译B\n---\n译C"

No explanations. Only translations.`
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
   * @param maxTokens 动态计算的最大输出tokens
   * @returns 翻译结果和token使用信息
   */
  private async callAPI(
    messages: DeepSeekMessage[],
    signal: AbortSignal,
    maxTokens: number
  ): Promise<{ content: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    let response: Response | undefined;

    try {
      response = await fetch(DeepSeekTranslator.ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: DeepSeekTranslator.MODEL,
          messages,
          temperature: DeepSeekTranslator.TEMPERATURE,
          max_tokens: maxTokens,  // 使用动态估算的值
          stream: false
        } as DeepSeekRequest),
        signal
      });
    } catch (error) {
      handleFetchError(error, 'deepseek', 'DeepSeek API 网络请求失败');
    }

    if (!response) {
      throw new TranslationError(
        'DeepSeek API 请求失败',
        'retryable',
        'deepseek'
      );
    }

    if (!response.ok) {
      await this.handleAPIError(response);
    }

    let data: DeepSeekResponse;
    try {
      data = await response.json();
    } catch (error) {
      throw new TranslationError(
        'DeepSeek API 返回内容解析失败',
        'retryable',
        'deepseek',
        response.status
      );
    }

    if (!data.choices?.[0]?.message?.content) {
      throw new TranslationError(
        'DeepSeek API 返回格式错误：缺少必要字段',
        'fatal',
        'deepseek',
        response.status
      );
    }

    return {
      content: data.choices[0].message.content,
      usage: data.usage
    };
  }

  /**
   * 延迟工具（支持 AbortSignal 中断）
   * @param ms 延迟毫秒数
   * @param signal AbortSignal 用于取消延迟
   */
  private async delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
        resolve();
      }, ms);

      const abortHandler = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abortHandler);
        reject(new DOMException('延迟被取消', 'AbortError'));
      };

      signal.addEventListener('abort', abortHandler);
    });
  }

  private async handleAPIError(response: Response): Promise<never> {
    let errorMessage = '未知错误';
    let errorCode: string | undefined;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorData.message || errorMessage;
      errorCode = errorData.error?.code || errorData.code;
    } catch {
      const fallback = await response.text().catch(() => '');
      if (fallback) {
        errorMessage = fallback;
      }
    }

    const { status } = response;

    switch (status) {
      case 400:
        throw new TranslationError(
          `DeepSeek API 请求格式错误: ${errorMessage}`,
          'fatal',
          'deepseek',
          status,
          errorCode
        );
      case 401:
      case 403:
        throw new TranslationError(
          'DeepSeek API 密钥无效或已过期',
          'fatal',
          'deepseek',
          status,
          errorCode
        );
      case 402:
        throw new TranslationError(
          'DeepSeek 账户余额不足，请前往官网充值',
          'fatal',
          'deepseek',
          status,
          errorCode
        );
      case 422:
        throw new TranslationError(
          `DeepSeek API 请求参数错误: ${errorMessage}`,
          'fatal',
          'deepseek',
          status,
          errorCode
        );
      case 429:
        throw new TranslationError(
          'DeepSeek API 速率限制，请稍后重试',
          'retryable',
          'deepseek',
          status,
          errorCode
        );
      case 500:
      case 502:
      case 503:
        throw new TranslationError(
          'DeepSeek API 服务器错误，请稍后重试',
          'retryable',
          'deepseek',
          status,
          errorCode
        );
      default:
        throw new TranslationError(
          `DeepSeek API 错误 (${status}): ${errorMessage}`,
          'fatal',
          'deepseek',
          status,
          errorCode
        );
    }
  }

}
