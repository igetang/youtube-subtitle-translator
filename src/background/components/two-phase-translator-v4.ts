/**
 * @file two-phase-translator-v4.ts
 * @description 支持AbortSignal的两阶段翻译器
 * 基于原有TwoPhaseTranslator，添加信号支持
 * @version 4.0
 * @date 2025-09-09
 */

import { IntelligentSegmenter } from './intelligent-segmenter';
import { OpenAITranslator } from './openai-translator';

/**
 * 两阶段翻译器 - 支持AbortSignal版本
 */
export class TwoPhaseTranslatorV4 {
  private static readonly API_DELAY = 200;  // API调用间隔
  private static readonly URGENT_RESPONSE_TIME = 300;  // 紧急响应时间目标
  private static readonly BATCH_START_DELAY = 200;  // 批量翻译启动延迟（200ms）
  private static readonly TIMEOUT_MS = 5000;  // 统一超时时间
  
  private translationService: any = null;  // 翻译服务配置
  
  private segmenter: IntelligentSegmenter;
  private isComplete: boolean = false;
  private currentExecutionId: number = 0;
  
  constructor() {
    this.segmenter = new IntelligentSegmenter();
  }
  
  /**
   * 设置翻译服务配置
   */
  public setTranslationService(service: any): void {
    this.translationService = service;
  }
  
  /**
   * 执行紧急翻译（支持取消）
   * 
   * @param subtitles 所有字幕
   * @param currentTime 当前播放时间（秒）
   * @param preferences 用户偏好设置
   * @param signal AbortSignal用于取消操作
   * @returns 紧急翻译结果数组
   */
  public async translateUrgent(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    currentTime: number,
    preferences: any,
    signal: AbortSignal
  ): Promise<Array<{
    index: number;
    originalText: string;
    translatedText: string;
    isUrgent: true;
  }>> {
    // 检查信号
    if (signal.aborted) {
      throw new DOMException('紧急翻译开始前已取消', 'AbortError');
    }
    
    const results: any[] = [];
    
    try {
      // 找到当前播放位置的索引
      const currentIndex = subtitles.findIndex(sub =>
        currentTime >= sub.start && (!sub.end || currentTime <= sub.end)
      );

      // 获取紧急批次（当前位置前后的字幕）
      const urgentBatch = IntelligentSegmenter.getUrgentBatch(
        subtitles,
        Math.max(0, currentIndex)
      );

      // 打印当前位置详细信息
      const actualIndex = Math.max(0, currentIndex);
      const beforeCount = actualIndex;
      const afterCount = subtitles.length - actualIndex - 1;
      console.log(`[TwoPhaseTranslatorV4] 当前位置: ${currentTime}s, ` +
        `${currentIndex === -1 ? '无字幕匹配' : `匹配第${currentIndex + 1}条字幕`}, ` +
        `前${beforeCount}条, 后${afterCount}条, ` +
        `紧急批次: ${urgentBatch.length}条`);
      
      if (urgentBatch.length === 0) {
        return results;
      }
      
      console.log(`[TwoPhaseTranslatorV4] 紧急翻译 ${urgentBatch.length} 条字幕`);

      // 准备文本：移除单条字幕内的换行符，用空格替代
      const texts = urgentBatch.map(sub => sub.text.replace(/\n/g, ' ').trim());

      // 合并日志：显示处理前后对比
      // console.log('[TwoPhaseTranslatorV4] 原始字幕前3条:',
      //   urgentBatch.slice(0, 3).map((sub, i) => ({
      //     原始: sub.text,
      //     处理后: texts[i],
      //     包含换行: sub.text.includes('\n')
      //   }))
      // );
      
      // 检查信号
      if (signal.aborted) {
        throw new DOMException('紧急翻译准备时被取消', 'AbortError');
      }
      
      // 调用翻译API - 传递文本数组而不是合并的文本
      const translatedTexts = await this.callTranslationAPI(
        texts,  // 直接传递文本数组，让callTranslationAPI内部处理合并
        preferences.translationService,
        'auto',  // 源语言
        preferences.targetLang,
        signal
      );
      
      // 直接使用返回的翻译数组
      const translatedLines = translatedTexts || [];
      
      // 构建结果
      urgentBatch.forEach((sub, idx) => {
        const translatedText = translatedLines[idx] || sub.text;
        const originalIndex = subtitles.indexOf(sub);
        
        if (originalIndex !== -1) {
          results.push({
            index: originalIndex,
            originalText: sub.text,
            translatedText: translatedText,
            isUrgent: true
          });
        }
      });
      
      console.log(`[TwoPhaseTranslatorV4] ✓ 紧急翻译完成: ${results.length} 条`);
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[TwoPhaseTranslatorV4] ✗ 紧急翻译被取消');
      } else {
        console.error('[TwoPhaseTranslatorV4] ✗ 紧急翻译失败:', error);
      }
      throw error;
    }
    
    return results;
  }
  
  /**
   * 执行批量翻译（支持取消）
   * 
   * @param subtitles 所有字幕
   * @param urgentResults 紧急翻译结果（用于去重）
   * @param preferences 用户偏好设置
   * @param signal AbortSignal用于取消操作
   * @returns 批量翻译结果数组
   */
  public async translateBatch(
    subtitles: Array<{
      id?: string;
      start: number;
      end?: number;
      duration?: number;
      text: string;
    }>,
    urgentResults: Array<any>,
    preferences: any,
    signal: AbortSignal
  ): Promise<Array<{
    index: number;
    originalText: string;
    translatedText: string;
    isUrgent: false;
  }>> {
    // 检查信号
    if (signal.aborted) {
      throw new DOMException('批量翻译开始前已取消', 'AbortError');
    }
    
    const results: any[] = [];
    
    try {
      // 延迟启动（避免与紧急翻译冲突）
      await this.delayWithSignal(TwoPhaseTranslatorV4.BATCH_START_DELAY, signal);
      
      console.log(`[TwoPhaseTranslatorV4] → 开始批量翻译 ${subtitles.length} 条字幕`);

      // 批量翻译应该翻译全部字幕（包括紧急翻译的部分）
      // 理由：1. 获得更好的上下文 2. 提升翻译质量 3. 保持翻译一致性
      const batchSubtitles = subtitles;

      // 如果紧急翻译已经覆盖全部字幕，可以跳过批量翻译
      if (urgentResults.length === subtitles.length) {
        console.log('[TwoPhaseTranslatorV4] 紧急翻译已覆盖全部字幕，跳过批量翻译');
        return urgentResults;
      }
      
      // 使用智能分段（createSmartBatches内部会自动分析时间间隔）
      const batchesWithMeta = this.segmenter.createSmartBatches(batchSubtitles);

      // 从批次元数据中提取字幕数组
      const batches = batchesWithMeta.map(batch => batch.subtitles);
      
      console.log(`[TwoPhaseTranslatorV4] → 分成 ${batches.length} 个批次`);
      
      // 批次失败计数
      let failedBatches = 0;
      
      // 逐批翻译
      for (let i = 0; i < batches.length; i++) {
        // 检查主信号（用户取消）
        if (signal.aborted) {
          throw new DOMException(`批量翻译在批次 ${i + 1} 被取消`, 'AbortError');
        }

        const batch = batches[i];
        const texts = batch.map(sub => sub.text.replace(/\n/g, ' ').trim());

        try {
          // 为每个批次创建独立的5秒超时信号
          let batchSignal: AbortSignal;

          try {
            // 尝试使用现代API（Chrome 103+）
            const timeoutSignal = AbortSignal.timeout(5000);
            // 组合主信号（用户取消）和批次超时信号
            batchSignal = AbortSignal.any([signal, timeoutSignal]);
          } catch (e) {
            // 降级方案：如果浏览器不支持AbortSignal.timeout或AbortSignal.any
            const batchController = new AbortController();

            // 监听主信号
            if (signal.aborted) {
              batchController.abort();
            } else {
              signal.addEventListener('abort', () => batchController.abort());
            }

            // 设置5秒超时
            const timeoutId = setTimeout(() => {
              batchController.abort(new DOMException('批次翻译超时', 'TimeoutError'));
            }, 5000);

            // 清理定时器
            batchController.signal.addEventListener('abort', () => clearTimeout(timeoutId));

            batchSignal = batchController.signal;
          }

          console.log(`[TwoPhaseTranslatorV4] 翻译批次 ${i + 1}/${batches.length}（${texts.length}条）`);

          // 调用翻译API - 使用批次独立的信号
          const translatedTexts = await this.callTranslationAPI(
            texts,
            preferences.translationService,
            'auto',
            preferences.targetLang,
            batchSignal  // 使用带超时的批次信号
          );
          
          // 直接使用返回的翻译数组
          const translatedLines = translatedTexts || [];
          
          // 构建结果
          batch.forEach((sub, idx) => {
            const translatedText = translatedLines[idx] || sub.text;
            const originalIndex = subtitles.indexOf(sub);
            
            if (originalIndex !== -1) {
              results.push({
                index: originalIndex,
                originalText: sub.text,
                translatedText: translatedText,
                isUrgent: false
              });
            }
          });
          
          // 批次完成不单独打印，由最终汇总统一报告
          
          // 批次间延迟（避免API限流）
          if (i < batches.length - 1) {
            await this.delayWithSignal(TwoPhaseTranslatorV4.API_DELAY, signal);
          }
          
        } catch (batchError: any) {
          // 区分错误类型
          if (batchError.name === 'AbortError' && signal.aborted) {
            // 用户主动取消，终止整个批量翻译
            console.log(`[TwoPhaseTranslatorV4] 用户取消批量翻译（批次 ${i + 1}）`);
            throw batchError;
          }

          // 批次超时或其他错误，记录但继续下一批
          if (batchError.name === 'TimeoutError' || batchError.message === '批次翻译超时') {
            console.warn(`[TwoPhaseTranslatorV4] 批次 ${i + 1}/${batches.length} 超时（5秒），使用原文`);
          } else {
            console.error(`[TwoPhaseTranslatorV4] 批次 ${i + 1}/${batches.length} 失败:`, batchError.message);
          }

          // 批次失败计数
          failedBatches++;

          // 失败批次使用原文
          batch.forEach(sub => {
            const originalIndex = subtitles.indexOf(sub);
            if (originalIndex !== -1) {
              results.push({
                index: originalIndex,
                originalText: sub.text,
                translatedText: sub.text,  // 使用原文
                isUrgent: false
              });
            }
          });
        }
      }
      
      // 汇总报告
      if (failedBatches > 0) {
        console.log(`[TwoPhaseTranslatorV4] ✓ 批量翻译完成: ${results.length} 条 (有 ${failedBatches}/${batches.length} 个批次失败)`);
      } else {
        console.log(`[TwoPhaseTranslatorV4] ✓ 批量翻译完成: ${results.length} 条`);
      }
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[TwoPhaseTranslatorV4] ✗ 批量翻译被取消');
      } else {
        console.error('[TwoPhaseTranslatorV4] ✗ 批量翻译失败:', error);
      }
      throw error;
    }
    
    return results;
  }
  
  /**
   * 调用翻译API
   */
  private async callTranslationAPI(
    texts: string[],
    service: any,
    sourceLang: string,
    targetLang: string,
    signal: AbortSignal
  ): Promise<string[]> {
    // 检查是否配置了翻译服务
    if (!service || !service.type) {
      console.warn('[TwoPhaseTranslatorV4] 未配置翻译服务，使用原文');
      return texts;
    }
    
    return new Promise(async (resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('翻译API调用前已取消', 'AbortError'));
        return;
      }
      
      // 监听取消
      const abortHandler = () => {
        reject(new DOMException('翻译API调用被取消', 'AbortError'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      
      try {
        let translatedTexts: string[] = [];
        
        // 根据翻译服务类型调用不同的API
        if (service.type === 'openai') {
          // 使用OpenAI翻译
          const translator = new OpenAITranslator(
            service.apiKey,
            {
              model: service.model || 'gpt-3.5-turbo',
              customModel: service.customModel,
              temperature: service.temperature || 0.3
            }
          );
          
          // 将文本数组转换为OpenAI期待的格式
          const subtitles = texts.map((text, idx) => ({
            id: `sub_${idx}`,
            text: text
          }));
          
          // 调用翻译
          const results = await translator.translateSubtitles(
            subtitles,
            sourceLang,
            targetLang
          );
          
          // 转换回文本数组
          translatedTexts = subtitles.map(sub => results[sub.id] || sub.text);
          
        } else if (service.type === 'google' || service.type === 'google-free') {
          // Google翻译（免费版）
          // console.log('[TwoPhaseTranslatorV4] 使用Google免费翻译');
          // console.log('[TwoPhaseTranslatorV4] 输入texts数组长度:', texts.length);
          
          // Google免费翻译API
          const translateUrl = 'https://translate.googleapis.com/translate_a/single';
          // 使用换行符连接，让Google把多条字幕当作连续段落处理
          // 单条字幕内的换行符已在前面被替换为空格
          const combinedText = texts.join('\n');
          // console.log('[TwoPhaseTranslatorV4] 合并后文本长度:', combinedText.length);
          // console.log('[TwoPhaseTranslatorV4] 合并后文本前200字符:', combinedText.substring(0, 200));
          
          const params = new URLSearchParams({
            client: 'gtx',
            sl: sourceLang === 'auto' ? 'auto' : sourceLang,
            tl: targetLang,
            dt: 't',
            format: 'text',  // 添加：保留换行符作为文本的一部分，而不是句子分隔符
            q: combinedText
          });
          
          try {
            const response = await fetch(`${translateUrl}?${params}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              // console.log('[TwoPhaseTranslatorV4] Google API原始响应:', JSON.stringify(data).substring(0, 500));
              
              // Google API返回嵌套数组结构
              const translations = data[0].map((item: any) => item[0]).join('');
              // console.log('[TwoPhaseTranslatorV4] 合并的翻译结果长度:', translations.length);
              // console.log('[TwoPhaseTranslatorV4] 合并的翻译结果前200字符:', translations.substring(0, 200));
              
              // 使用换行符分割（与合并时一致）
              translatedTexts = translations.split('\n').map((t: string) => t.trim());
              console.log('[TwoPhaseTranslatorV4] 分割后数组长度:', translatedTexts.length);
              console.log('[TwoPhaseTranslatorV4] 分割后前3个:', translatedTexts.slice(0, 3));
              
              // 确保返回的翻译数量与原文数量一致
              if (translatedTexts.length !== texts.length) {
                console.warn(`[TwoPhaseTranslatorV4] 翻译结果数量不匹配！期待${texts.length}个，得到${translatedTexts.length}个`);
                // 如果分割失败，尝试按原文数量平均分配
                if (translatedTexts.length === 1 && texts.length > 1) {
                  // 可能分隔符被翻译了，尝试其他分割方式
                  console.log('[TwoPhaseTranslatorV4] 尝试按长度比例分割');
                  const totalLength = texts.join('').length;
                  let currentPos = 0;
                  translatedTexts = texts.map((text, index) => {
                    const ratio = text.length / totalLength;
                    const translatedLength = Math.floor(translations.length * ratio);
                    const result = translations.substring(currentPos, currentPos + translatedLength);
                    currentPos += translatedLength;
                    return result || text;
                  });
                } else {
                  // 填充缺失的翻译
                  while (translatedTexts.length < texts.length) {
                    translatedTexts.push(texts[translatedTexts.length]);
                  }
                }
              }
            } else {
              console.error('[TwoPhaseTranslatorV4] Google翻译API请求失败');
              translatedTexts = texts;
            }
          } catch (error) {
            console.error('[TwoPhaseTranslatorV4] Google翻译API调用出错:', error);
            translatedTexts = texts;
          }
          
        } else if (service.type === 'microsoft' || service.type === 'microsoft-free') {
          // Microsoft翻译（免费版）
          console.log('[TwoPhaseTranslatorV4] 使用Microsoft免费翻译');
          // TODO: 实现Microsoft翻译API调用
          translatedTexts = texts.map(text => `[MS译] ${text}`);
          
        } else {
          // 未知服务类型，返回原文
          console.warn(`[TwoPhaseTranslatorV4] 未知的翻译服务类型: ${service.type}`);
          translatedTexts = texts;
        }
        
        signal.removeEventListener('abort', abortHandler);
        resolve(translatedTexts);
        
      } catch (error) {
        signal.removeEventListener('abort', abortHandler);
        if (!signal.aborted) {
          console.error('[TwoPhaseTranslatorV4] 翻译API调用失败:', error);
          // 失败时返回原文
          resolve(texts);
        }
      }
    });
  }
  
  /**
   * 带信号的延迟
   */
  private delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('延迟开始前已取消', 'AbortError'));
        return;
      }
      
      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
        resolve();
      }, ms);
      
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new DOMException('延迟被取消', 'AbortError'));
      };
      
      signal.addEventListener('abort', abortHandler, { once: true });
    });
  }
  
  /**
   * 重置翻译器状态
   */
  public reset(): void {
    this.isComplete = false;
    this.currentExecutionId++;
  }
}