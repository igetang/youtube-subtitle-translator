import { RateLimitManager } from '../utils/rate-limit-manager';
import { BatchProcessor } from './batch-processor';
import { TranslationLocalStorage } from '../utils/translation-local-storage';

/**
 * @class OpenAITranslator - 主翻译类
 * 整合TranslationLocalStorage、BatchProcessor和RateLimitManager提供端到端翻译
 */
export class OpenAITranslator {
  private translationLocalStorage: TranslationLocalStorage;
  private rateLimitManager: RateLimitManager;
  private apiKey: string;
  private model: string;
  private temperature: number;
  
  constructor(apiKey: string, openaiConfig: { model: string, customModel: string, temperature: number }) {
    this.translationLocalStorage = TranslationLocalStorage.getInstance();
    this.rateLimitManager = RateLimitManager.getInstance();
    this.apiKey = apiKey;
    
    // 确定要使用的模型
    this.model = openaiConfig.model;
    if (this.model === 'custom' && openaiConfig.customModel) {
      this.model = openaiConfig.customModel;
    }
    
    this.temperature = openaiConfig.temperature;
  }
  
  /**
   * 翻译字幕
   * @param subtitles 要翻译的字幕数组
   * @param sourceLang 源语言代码
   * @param targetLang 目标语言代码
   * @returns 翻译结果的对象 {id: translatedText}
   */
  public async translateSubtitles(
    subtitles: { id: string, text: string }[],
    sourceLang: string,
    targetLang: string
  ): Promise<{ [id: string]: string }> {
    console.log(`[OpenAITranslator] 开始翻译 ${subtitles.length} 条字幕，从 ${sourceLang} 到 ${targetLang}`);
    
    const results: { [id: string]: string } = {};
    
        // 1. 从本地存储获取已翻译内容
    const localStorageData = await this.translationLocalStorage.getLocalStorage(sourceLang, targetLang, this.model);
    const fromLocalStorage: { id: string, text: string }[] = [];
    const pendingTranslation: { id: string, text: string }[] = [];

    // 检查哪些内容可以从本地存储获取
    for (const subtitle of subtitles) {
      const localStorageKey = this.translationLocalStorage.generateLocalStorageKey(subtitle.text, sourceLang, targetLang, this.model);
              if (localStorageData[localStorageKey]) {
          results[subtitle.id] = localStorageData[localStorageKey];
        fromLocalStorage.push(subtitle);
      } else {
        pendingTranslation.push(subtitle);
      }
    }
    
        if (fromLocalStorage.length > 0) {
      console.log(`[OpenAITranslator] ✓ 从本地存储中获取了 ${fromLocalStorage.length} 条翻译`);
    }

    // 如果全部从本地存储获取，直接返回结果
    if (pendingTranslation.length === 0) {
              console.log(`[OpenAITranslator] 所有翻译都从本地存储获取，无需调用API`);
      return results;
    }
    
    // 2. 创建最优批次处理剩余需要翻译的字幕
    const batches = BatchProcessor.createOptimalBatches(
      pendingTranslation,
      0, // 自动估算token
      8  // 最大批量大小
    );
    
    // 3. 语言名称映射，用于提示词生成
    const languageNames: Record<string, string> = {
      'zh-Hans': 'Simplified Chinese',
      'zh-Hant': 'Traditional Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'en': 'English',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'ru': 'Russian',
      'pt': 'Portuguese',
      'it': 'Italian',
      'nl': 'Dutch',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'vi': 'Vietnamese',
      'th': 'Thai',
      'id': 'Indonesian'
    };
    
    // 获取语言全名
    const sourceLanguage = languageNames[sourceLang] || sourceLang;
    const targetLanguage = languageNames[targetLang] || targetLang;
    
    // 4. 定义并行执行的批次数量
    // 根据当前API限制状态调整并行度
    const parallelStatus = this.rateLimitManager.getLimitStatus();
    const maxParallelBatches = parallelStatus.requestsRemaining > 10 ? 3 : 1;
    
    // 5. 分组执行批次，每组最多并行执行maxParallelBatches个批次
    for (let i = 0; i < batches.length; i += maxParallelBatches) {
      const currentBatches = batches.slice(i, i + maxParallelBatches);
      
      // 并行处理当前组的批次
      const batchPromises = currentBatches.map(async (batch, groupIndex) => {
        const batchIndex = i + groupIndex;
        try {
          console.log(`[OpenAITranslator] 处理第 ${batchIndex + 1}/${batches.length} 批字幕 (${batch.length} 条)`);
          
          // 构建批量翻译的消息
          const messages = [
            {
              role: "system",
              content: `You are a professional translator. Translate the following ${sourceLanguage} subtitles to ${targetLanguage}. Keep the same meaning, tone, and style. Do not add or remove information. Respond only with the translations in the exact same order. Do not include explanations.`
            },
            {
              role: "user",
              content: batch.map(item => item.text).join("\n---\n")
            }
          ];
          
          // 构建请求体 - 启用流式响应
          const payload = {
            model: this.model,
            messages: messages,
            temperature: this.temperature,
            max_tokens: 2048, // 设置一个合理的最大token数
            stream: true, // 启用流式响应
          };
          
          // 估算输入tokens数量并记录到RateLimitManager
          const estimatedTokens = batch.reduce((sum, item) => {
            // 简单估算：英文约4个字符/token，中文约1.5个字符/token
            const hasChineseChars = /[\u4e00-\u9fa5]/.test(item.text);
            const tokenFactor = hasChineseChars ? 1.5 : 4;
            return sum + Math.ceil(item.text.length / tokenFactor);
          }, 200); // 200是system提示的估算token数
          
          // 记录请求
          this.rateLimitManager.recordRequest(estimatedTokens);
          
          // 计算请求延迟
          const delay = this.rateLimitManager.calculateRequestDelay();
          if (delay > 10) {
            console.log(`[OpenAITranslator] 添加 ${delay}ms 请求延迟以避免限流`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // 调用流式OpenAI API
          const translatedSegments = await this.callOpenAIStreamingAPI(
            "/v1/chat/completions", 
            payload, 
            batch.length
          );
          
          // 确保返回的分段数量与输入相同
          if (translatedSegments.length >= batch.length) {
            // 将翻译结果与字幕ID关联
            batch.forEach((subtitle, index) => {
              if (index < translatedSegments.length) {
                results[subtitle.id] = translatedSegments[index];
                
                // 更新本地存储
                const localStorageKey = this.translationLocalStorage.generateLocalStorageKey(
                  subtitle.text, 
                  sourceLang, 
                  targetLang, 
                  this.model
                );
                localStorageData[localStorageKey] = translatedSegments[index];
              }
            });
          } else {
            console.error(`[OpenAITranslator] OpenAI返回的分段数量 (${translatedSegments.length}) 少于请求的字幕数量 (${batch.length})`);
            
            // 尝试一对一匹配尽可能多的字幕
            batch.forEach((subtitle, index) => {
              if (index < translatedSegments.length) {
                results[subtitle.id] = translatedSegments[index];
                
                // 更新本地存储
                const localStorageKey = this.translationLocalStorage.generateLocalStorageKey(
                  subtitle.text, 
                  sourceLang, 
                  targetLang, 
                  this.model
                );
                localStorageData[localStorageKey] = translatedSegments[index];
              } else {
                // 对于没有匹配的字幕，使用错误信息
                results[subtitle.id] = `[翻译错误: 批量翻译结果数量不匹配]`;
              }
            });
          }
        } catch (error) {
          console.error(`[OpenAITranslator] 批次 ${batchIndex + 1} 翻译失败:`, error);
          
          // 记录该批次中的每个字幕错误
          batch.forEach(subtitle => {
            results[subtitle.id] = `[翻译错误: ${(error as Error).message}]`;
          });
        }
      });
      
      // 等待当前组的所有批次完成
      await Promise.all(batchPromises);
      
      // 在组之间添加短暂延迟，避免API限流
      if (i + maxParallelBatches < batches.length) {
        const interBatchDelay = this.rateLimitManager.calculateRequestDelay() * 2;
        await new Promise(resolve => setTimeout(resolve, Math.max(300, interBatchDelay)));
      }
    }
    
        // 6. 保存更新后的本地存储
    await this.translationLocalStorage.saveLocalStorage(localStorageData, sourceLang, targetLang, this.model);

    // 7. 添加成功提示
    const successCount = Object.keys(results).length - fromLocalStorage.length;
          console.log(`[OpenAITranslator] 翻译成功完成！从API翻译 ${successCount}/${subtitles.length} 条字幕，从本地存储获取 ${fromLocalStorage.length} 条`);
    
    return results;
  }
  
  /**
   * 调用OpenAI流式API并处理响应
   * @param endpoint OpenAI接口路径，例如'/v1/chat/completions'
   * @param payload 请求体对象
   * @param expectedSegments 预期的分段数量
   * @returns 翻译后的文本数组
   */
  private async callOpenAIStreamingAPI(
    endpoint: string, 
    payload: any,
    expectedSegments: number
  ): Promise<string[]> {
    const url = `https://api.openai.com${endpoint}`;
    const controller = new AbortController();
    
    // 设置30秒超时
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    // 最大重试次数
    const MAX_RETRIES = 2;
    let retryCount = 0;
    
    // 用于收集流式翻译结果
    let combinedContent = '';
    
    const attemptRequest = async (): Promise<string[]> => {
      try {
        console.log(`[OpenAI Stream] 发送请求${retryCount > 0 ? ` (重试 #${retryCount})` : ''}`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        
        // 尝试从响应头更新速率限制信息
        this.rateLimitManager.updateLimits(response.headers);
        
        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch (parseErr) {
            const errText = await response.text();
            throw new Error(`OpenAI 接口调用失败: ${response.status} ${errText}`);
          }
          const { message, type, code, param } = errorData.error || {};
          const error = new Error(`OpenAI 接口调用失败: ${message}`);
          Object.assign(error, { status: response.status, type, code, param });
          throw error;
        }
        
        if (!response.body) {
          throw new Error('响应没有可读取的数据流');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let isFirst = true;
        let lastProgressUpdate = Date.now();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          
          // 收到第一个数据块，报告开始流式传输
          if (isFirst) {
            console.log('[OpenAI Stream] 开始接收流式数据');
            isFirst = false;
          }
          
          // 每500ms报告一次进度
          const now = Date.now();
          if (now - lastProgressUpdate > 500) {
            console.log(`[OpenAI Stream] 正在接收数据，当前长度: ${combinedContent.length}字符`);
            lastProgressUpdate = now;
          }
          
          const lines = chunk.split('\n').filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
          
          for (const line of lines) {
            try {
              if (line.startsWith('data: ')) {
                const jsonData = line.slice(6);
                if (jsonData !== '[DONE]') {
                  const parsedData = JSON.parse(jsonData);
                  const delta = parsedData.choices?.[0]?.delta?.content || '';
                  combinedContent += delta;
                }
              }
            } catch (error: unknown) {
              console.warn('[OpenAI Stream] 解析流数据出错:', error, '原始行:', line);
            }
          }
        }
        
        // 分割结果为预期的段落
        // 特殊处理：检查是否已经通过"---"分隔
        let segments: string[];
        
        if (combinedContent.includes('---')) {
          // 使用分隔符分割
          segments = combinedContent.split('---').map(s => s.trim());
        } else if (expectedSegments === 1) {
          // 只需要一个段落
          segments = [combinedContent.trim()];
        } else {
          // 尝试按行分割，然后合并为expectedSegments个段落
          const lines = combinedContent.split('\n').filter(line => line.trim().length > 0);
          
          if (lines.length >= expectedSegments) {
            // 如果行数大于等于预期段落数，可以按行分割
            segments = lines.slice(0, expectedSegments);
          } else {
            // 否则，按字符均分
            console.warn(`[OpenAI Stream] 无法按预期分割结果，尝试按字符均分: ${combinedContent}`);
            segments = [];
            const charsPerSegment = Math.ceil(combinedContent.length / expectedSegments);
            
            for (let i = 0; i < expectedSegments; i++) {
              const start = i * charsPerSegment;
              const end = Math.min(start + charsPerSegment, combinedContent.length);
              if (start < combinedContent.length) {
                segments.push(combinedContent.substring(start, end).trim());
              }
            }
          }
        }
        
        console.log(`[OpenAI Stream] 获取到 ${segments.length} 个文本段落，预期 ${expectedSegments} 个`);
        
        // 确保我们返回至少预期数量的段落
        while (segments.length < expectedSegments) {
          segments.push("[翻译错误: 分段数量不足]");
        }
        
        // 只返回预期数量的段落
        return segments.slice(0, expectedSegments);
        
      } catch (error: unknown) {
        // 对某些错误类型进行重试
        if (retryCount < MAX_RETRIES && (
          // 网络错误或超时
          error instanceof Error && 
          (error.name === 'TypeError' || error.name === 'AbortError' || 
           // 速率限制错误 
           (error.message && error.message.includes('rate limit')))
        )) {
          retryCount++;
          console.warn(`[OpenAI Stream] 请求失败，正在重试 (${retryCount}/${MAX_RETRIES}):`, error);
          
          // 指数退避重试
          const delayMs = 1000 * Math.pow(2, retryCount - 1);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          // 清空之前收集的内容
          combinedContent = '';
          
          return attemptRequest();
        }
        
        throw error;
      }
    };
    
    try {
      const result = await attemptRequest();
      clearTimeout(timeoutId);
      return result;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OpenAI API请求超时');
      }
      throw error;
    }
  }
} 