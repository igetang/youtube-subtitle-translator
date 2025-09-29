/**
 * @file translation-dispatcher.ts
 * @description 翻译调度器，统一协调翻译流程各步骤
 */

import { StorageManager, StorageKeys } from '../storage/storage-manager';
import { TranslationCacheManager } from '../storage/translation-cache-manager';
import { SubtitleMode, TranslationService, TranslationServiceType, TranslationServiceForCacheKey } from '../types/user-preferences-types';
import { SubtitleEvent, ProcessedSubtitleEvent, HashValue, LanguageCode } from '../types/core-types';
import { TranslationCacheData } from '../types/storage-types';
import { SimplifiedCaptionTrack } from '../types/subtitle-types';

/**
 * 翻译结果
 */
export interface TranslationResults {
  [id: string]: string;
}

/**
 * 翻译local storage项
 */
export interface TranslationCacheItem {
  translations: TranslationResults;
  timestamp: number;
}

/**
 * 翻译上下文
 */
export interface TranslationContext {
  videoId: string;
  sourceEvents: SubtitleEvent[];
  sourceLang: string;
  sourceKind?: 'asr' | 'forced';
  targetLang: string;
  translationService: TranslationService;
  subtitleMode: SubtitleMode;
  currentTime?: number;
}

/**
 * 翻译回调函数类型
 */
export type TranslationCallback = (
  processedEvents: ProcessedSubtitleEvent[],
  error?: string
) => void;

/**
 * 翻译事件类型
 */
export enum TranslationEvent {
  TRANSLATION_STARTED = 'translationStarted',
  TRANSLATION_PROGRESS = 'translationProgress',
  TRANSLATION_COMPLETED = 'translationCompleted',
  TRANSLATION_ERROR = 'translationError',
  TRANSLATION_CANCELLED = 'translationCancelled'
}

/**
 * 翻译事件处理函数类型
 */
export type TranslationEventHandler = (
  messageType: TranslationEvent,
  data: any
) => void;

/**
 * 翻译优先级
 */
export enum TranslationPriority {
  HIGH = 'high',   // 当前播放位置附近的字幕
  NORMAL = 'normal', // 其他字幕
  LOW = 'low'      // 后台处理的字幕
}

/**
 * 翻译状态
 */
export enum TranslationStatus {
  IDLE = 'idle',           // 空闲状态
  TRANSLATING = 'translating', // 翻译中
  COMPLETED = 'completed',    // 翻译完成
  ERROR = 'error',           // 发生错误
  CANCELLED = 'cancelled'    // 已取消
}

/**
 * 翻译请求
 */
interface TranslationRequest {
  id: string;
  context: TranslationContext;
  priority: TranslationPriority;
  callback?: TranslationCallback;
  status: TranslationStatus;
  timestamp: number;
  error?: string;
}

/**
 * 翻译调度器类
 * 统一协调翻译流程各步骤
 */
export class TranslationDispatcher {
  private static instance: TranslationDispatcher;
  private storageManager: StorageManager;
  private translationCacheManager: TranslationCacheManager;
  private eventHandlers: Map<TranslationEvent, Set<TranslationEventHandler>>;
  private activeRequests: Map<string, TranslationRequest>;
  private processingRequest: TranslationRequest | null = null;
  private isProcessing: boolean = false;

  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.translationCacheManager = TranslationCacheManager.getInstance();
    this.eventHandlers = new Map();
    this.activeRequests = new Map();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): TranslationDispatcher {
    if (!TranslationDispatcher.instance) {
      TranslationDispatcher.instance = new TranslationDispatcher();
    }
    return TranslationDispatcher.instance;
  }

  /**
   * 添加翻译消息监听器
   * @param messageType 消息类型
   * @param handler 处理函数
   */
  public addEventListener(messageType: TranslationEvent, handler: TranslationEventHandler): void {
    if (!this.eventHandlers.has(messageType)) {
      this.eventHandlers.set(messageType, new Set());
    }
    this.eventHandlers.get(messageType)!.add(handler);
  }

  /**
   * 移除翻译消息监听器
   * @param messageType 消息类型
   * @param handler 处理函数
   */
  public removeEventListener(messageType: TranslationEvent, handler: TranslationEventHandler): void {
    if (!this.eventHandlers.has(messageType)) return;
    
    this.eventHandlers.get(messageType)!.delete(handler);
    
    if (this.eventHandlers.get(messageType)!.size === 0) {
      this.eventHandlers.delete(messageType);
    }
  }

  /**
   * 触发翻译消息
   * @param messageType 消息类型
   * @param data 消息数据
   */
  private triggerEvent(messageType: TranslationEvent, data: any): void {
    if (!this.eventHandlers.has(messageType)) return;
    
    this.eventHandlers.get(messageType)!.forEach(handler => {
      try {
        handler(messageType, data);
      } catch (error) {
        console.error(`[translation-dispatcher] 翻译消息处理函数执行错误 (消息: ${messageType}):`, error);
      }
    });
  }

  /**
   * 清除指定视频的翻译缓存
   * @param videoId 视频ID
   */
  public async clearCacheForVideo(videoId: string): Promise<void> {
    const prefix = `${StorageKeys.LOCAL.TRANSLATIONS_PREFIX}${videoId}`;
    try {
      const keysToRemove = await this.storageManager.findKeysByPrefix(prefix, 'local');
      if (keysToRemove.length > 0) {
        await this.storageManager.remove(keysToRemove, 'local');
        console.log(`[translation-dispatcher] 已清除视频 ${videoId} 的 ${keysToRemove.length} 个翻译缓存。`);
      }
    } catch (error) {
      console.error(`[translation-dispatcher] 清除视频 ${videoId} 的翻译缓存时出错:`, error);
    }
  }

  /**
   * 生成唯一请求ID
   */
  private generateRequestId(context: TranslationContext): string {
    const { videoId, sourceLang, targetLang, translationService } = context;
    return `req_${videoId}_${sourceLang}_${targetLang}_${translationService.type}_${Date.now()}`;
  }

  /**
   * 生成翻译本地存储键
   */
  private generateLocalStorageKey(context: TranslationContext): string {
    const { videoId, targetLang, translationService } = context;
    return `${StorageKeys.LOCAL.TRANSLATIONS_PREFIX}${videoId}_${targetLang}_${translationService.type}`;
  }

  /**
   * 检查是否已经有相同条件的翻译请求
   */
  private hasSimilarRequest(context: TranslationContext): boolean {
    for (const request of this.activeRequests.values()) {
      const similar = request.context.videoId === context.videoId 
        && request.context.sourceLang === context.sourceLang
        && request.context.targetLang === context.targetLang
        && request.context.translationService.type === context.translationService.type;
        
      if (similar && request.status === TranslationStatus.TRANSLATING) {
        return true;
      }
    }
    return false;
  }

  /**
   * 提交翻译请求
   * @param context 翻译上下文
   * @param priority 优先级
   * @param callback 回调函数
   * @returns 请求ID
   */
  public submitTranslationRequest(
    context: TranslationContext,
    priority: TranslationPriority = TranslationPriority.NORMAL,
    callback?: TranslationCallback
  ): string {
    // 如果已有相同条件的请求，优先处理现有请求
    if (this.hasSimilarRequest(context)) {
              console.log('[translation-dispatcher] 已有相同条件的翻译请求正在处理中');
    }
    
    const requestId = this.generateRequestId(context);
    
    // 创建新请求
    const request: TranslationRequest = {
      id: requestId,
      context,
      priority,
      callback,
      status: TranslationStatus.IDLE,
      timestamp: Date.now()
    };
    
    // 添加到活动请求列表
    this.activeRequests.set(requestId, request);
    
    // 触发事件
    this.triggerEvent(TranslationEvent.TRANSLATION_STARTED, { requestId, context });
    
    // 启动处理队列
    this.processNextRequest();
    
    return requestId;
  }

  /**
   * 取消翻译请求
   * @param requestId 请求ID
   * @returns 是否成功取消
   */
  public cancelTranslationRequest(requestId: string): boolean {
    // 如果请求正在处理中且匹配当前请求，标记为取消但不立即移除
    if (this.processingRequest && this.processingRequest.id === requestId) {
      this.processingRequest.status = TranslationStatus.CANCELLED;
      this.triggerEvent(TranslationEvent.TRANSLATION_CANCELLED, { requestId });
      return true;
    }
    
    // 如果请求在队列中但尚未处理，直接移除
    if (this.activeRequests.has(requestId)) {
      const request = this.activeRequests.get(requestId)!;
      
      if (request.status === TranslationStatus.IDLE) {
        this.activeRequests.delete(requestId);
        this.triggerEvent(TranslationEvent.TRANSLATION_CANCELLED, { requestId });
        return true;
      }
    }
    
    return false;
  }

  /**
   * 处理下一个翻译请求
   */
  private async processNextRequest(): Promise<void> {
    // 如果已经在处理，直接返回
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // 获取下一个要处理的请求
      const nextRequest = this.getNextRequest();
      
      if (!nextRequest) {
        this.isProcessing = false;
        return; // 没有待处理的请求
      }
      
      this.processingRequest = nextRequest;
      nextRequest.status = TranslationStatus.TRANSLATING;
      
      // 开始翻译流程
      await this.executeTranslationFlow(nextRequest);
      
      // 处理完成后移除请求
      this.activeRequests.delete(nextRequest.id);
      this.processingRequest = null;
    } catch (error) {
              console.error('[translation-dispatcher] 处理翻译请求时出错:', error);
      
      // 如果有正在处理的请求，标记为出错
      if (this.processingRequest) {
        this.processingRequest.status = TranslationStatus.ERROR;
        this.processingRequest.error = error instanceof Error ? error.message : '未知错误';
        
        // 触发错误事件
        this.triggerEvent(TranslationEvent.TRANSLATION_ERROR, { 
          requestId: this.processingRequest.id,
          error: this.processingRequest.error
        });
        
        // 调用错误回调
        if (this.processingRequest.callback) {
          try {
            this.processingRequest.callback([], this.processingRequest.error);
          } catch (callbackError) {
            console.error('[translation-dispatcher] 翻译回调执行错误:', callbackError);
          }
        }
        
        // 处理完成后移除请求
        this.activeRequests.delete(this.processingRequest.id);
        this.processingRequest = null;
      }
    } finally {
      this.isProcessing = false;
      
      // 检查是否还有待处理的请求
      if (this.activeRequests.size > 0) {
        // 等待一小段时间后处理下一个请求，避免连续处理导致性能问题
        setTimeout(() => this.processNextRequest(), 100);
      }
    }
  }

  /**
   * 获取下一个要处理的请求
   * 按优先级和时间戳排序
   */
  private getNextRequest(): TranslationRequest | null {
    if (this.activeRequests.size === 0) {
      return null;
    }
    
    // 获取所有待处理的请求
    const pendingRequests = Array.from(this.activeRequests.values())
      .filter(request => request.status === TranslationStatus.IDLE);
    
    if (pendingRequests.length === 0) {
      return null;
    }
    
    // 按优先级和时间戳排序
    pendingRequests.sort((a, b) => {
      // 首先按优先级排序
      const priorityOrder = {
        [TranslationPriority.HIGH]: 0,
        [TranslationPriority.NORMAL]: 1,
        [TranslationPriority.LOW]: 2
      };
      
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      
      // 优先级相同时按时间戳排序（先提交的先处理）
      return a.timestamp - b.timestamp;
    });
    
    return pendingRequests[0];
  }

  /**
   * 执行翻译流程
   * @param request 翻译请求
   */
  private async executeTranslationFlow(request: TranslationRequest): Promise<void> {
    const { context, callback } = request;

    try {
      this.triggerEvent(TranslationEvent.TRANSLATION_STARTED, { request });

      // 1. 检查VTT缓存
      const vttCache = await this.translationCacheManager.get(
        context.videoId,
        context.sourceLang,
        context.targetLang,
        context.translationService
      );

      if (vttCache && vttCache.translatedSubtitles) {
        console.log('[translation-dispatcher] VTT缓存命中 (在旧流程中)');
        const processedEvents = this._parseVttString(
          vttCache.translatedSubtitles,
          context.sourceEvents,
          context.sourceLang,
          context.targetLang
        );
        this.triggerEvent(TranslationEvent.TRANSLATION_COMPLETED, {
          request,
          processedEvents,
          fromCache: true
        });
        callback?.(processedEvents);
        return;
      }

      console.log('[translation-dispatcher] VTT缓存未命中 (在旧流程中)，执行API翻译');
      
      // 2. 如果缓存未命中，调用API翻译
      const translations = await this.translateSubtitles(
        context.sourceEvents,
        context.sourceLang,
        context.targetLang,
        context.translationService
      );

      // 3. 创建VTT字符串并存入缓存
      const vttString = this._createVttString(context.sourceEvents, translations);

      if (vttString) {
        const dataToCache: TranslationCacheData = {
          videoId: context.videoId,
          sourceLang: context.sourceLang,
          sourceKind: context.sourceKind,
          targetLang: context.targetLang,
          availableSourceLanguages: [], // TODO: 需要从合适的源获取
          translationService: { // 转换为安全的存储格式
            type: context.translationService.type,
            name: context.translationService.name,
            model: context.translationService.model || '', // 修正：提供默认值
            temperature: context.translationService.temperature || 0 // 修正：提供默认值
          },
          translatedSubtitles: vttString,
          lastUsed: Date.now(),
          dataHash: '' // 将由cache manager生成
        };
        
        await this.translationCacheManager.set(dataToCache);
      }
      
      console.log('[translation-dispatcher] VTT字符串已创建并存入缓存 (在旧流程中)');

      // 4. 合并并返回结果
      const processedEvents = this.mergeSubtitleData(
        context.sourceEvents,
        translations,
        context.sourceLang,
        context.targetLang
      );

      this.triggerEvent(TranslationEvent.TRANSLATION_COMPLETED, {
        request,
        processedEvents,
        fromCache: false
      });

      callback?.(processedEvents);
    } catch (error) {
      console.error('[translation-dispatcher] 翻译流程执行失败:', error);
      this.triggerEvent(TranslationEvent.TRANSLATION_ERROR, { request, error });
      if (callback) {
        callback([], error instanceof Error ? error.message : '未知错误');
      }
    } finally {
      this.processingRequest = null;
      this.isProcessing = false;
      this.processNextRequest();
    }
  }

  /**
   * 创建VTT格式字符串
   * @private
   */
  private _createVttString(sourceEvents: SubtitleEvent[], translations: TranslationResults): string {
    let vtt = 'WEBVTT\n\n';
    sourceEvents.forEach(event => {
      if (!event.id) return; // Skip events without an ID

      const formatTime = (time: number) => {
        const hours = Math.floor(time / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((time % 3600) / 60).toString().padStart(2, '0');
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        const milliseconds = Math.round((time - Math.floor(time)) * 1000).toString().padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${milliseconds}`;
      };

      const end = event.start + event.duration;
      const translatedText = translations[event.id];
      // @ts-ignore - event.text can be optional, but we need to proceed.
      const finalText = translatedText ?? event.text ?? ''; // Ensure it's always a string

      vtt += `${formatTime(event.start)} --> ${formatTime(end)}\n`;
      vtt += `${finalText.replace(/\n/g, ' ')}\n\n`;
    });
    return vtt;
  }

  /**
   * 解析VTT字符串为ProcessedSubtitleEvent数组
   * @private
   */
  private _parseVttString(vtt: string, sourceEvents: SubtitleEvent[], sourceLang: string, targetLang: string): ProcessedSubtitleEvent[] {
    const lines = vtt.split('\n');
    const events: ProcessedSubtitleEvent[] = [];
    let i = 0;

    // Skip WEBVTT header
    while(i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    // Correlate with sourceEvents to rebuild full ProcessedSubtitleEvent
    for (let j = 0; j < sourceEvents.length && i < lines.length; j++) {
        const sourceEvent = sourceEvents[j];
        
        // Find the timestamp line
        while(i < lines.length && !lines[i].includes('-->')) {
          i++;
        }
        if (i >= lines.length) break;
        const timeLine = lines[i];
        i++;

        // Get text
        let text = '';
        while(i < lines.length && lines[i].trim() !== '') {
            text += (text ? '\n' : '') + lines[i];
            i++;
        }

        events.push({
            id: sourceEvent.id || String(sourceEvent.start),
            start: sourceEvent.start,
            end: sourceEvent.start + sourceEvent.duration,
            originalText: sourceEvent.text,
            translatedText: text,
            sourceLangCode: sourceLang as LanguageCode,
            targetLangCode: targetLang as LanguageCode,
            textHash: '' // Hashing can be done here if needed
        });
    }

    return events;
  }

  /**
   * 翻译字幕
   * @param subtitles 待翻译的字幕
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param translationService 翻译服务
   * @returns 翻译结果
   */
  private async translateSubtitles(
    subtitles: SubtitleEvent[],
    sourceLang: string,
    targetLang: string,
    translationService: TranslationService
  ): Promise<TranslationResults> {
    if (subtitles.length === 0) {
      return {};
    }

    const texts = subtitles.map(s => s.text);
    let result: TranslationResults = {};
    
    // 使用传入的 translationService 进行翻译
    const service = await this.getTranslationService(translationService);
    if (!service) {
      throw new Error(`无法获取 ${translationService.type} 的翻译服务`);
    }
    result = await service.translate(texts, sourceLang, targetLang);

    // 将翻译结果映射回字幕ID
    const finalResult: TranslationResults = {};
    subtitles.forEach((subtitle, index) => {
      const id = subtitle.id || String(subtitle.start);
      // 'result' from a batch translation might be an array of strings
      if (Array.isArray(result) && result[index]) {
        finalResult[id] = result[index];
      } else if (!Array.isArray(result) && result[texts[index]]) { // Or a map from text to translation
        finalResult[id] = result[texts[index]];
      }
    });

    return finalResult;
  }

  /**
   * 获取具体翻译服务的实例
   * @param serviceConfig 完整的翻译服务配置
   */
  private async getTranslationService(serviceConfig: TranslationService): Promise<{ translate: (texts: string[], sourceLang: string, targetLang: string) => Promise<any> } | null> {
    // 这是一个模拟实现，实际应用中会根据 serviceConfig.type 动态加载并实例化对应的翻译服务类
    // 例如: new GoogleTranslateService(serviceConfig)
    console.log(`[translation-dispatcher] 获取翻译服务: ${serviceConfig.type}`, serviceConfig);
    
    if (serviceConfig.type === TranslationServiceType.DUMMY) {
      return {
        translate: async (texts: string[]) => {
          const translated: TranslationResults = {};
          texts.forEach(text => {
            translated[text] = `DUMMY: ${text}`;
          });
          return translated;
        }
      };
    }
    
    // 实际的翻译服务实现会放在这里
    // For now, returning a mock for any other service type
    return {
      translate: async (texts: string[]) => {
        const translated: TranslationResults = {};
        texts.forEach(text => {
          translated[text] = `Translated: ${text}`;
        });
        return translated;
      }
    };
  }

  /**
   * 合并源字幕和翻译结果
   * @param sourceEvents 源字幕事件
   * @param translations 翻译结果
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @returns 处理后的字幕事件
   */
  private mergeSubtitleData(
    sourceEvents: SubtitleEvent[],
    translations: TranslationResults,
    sourceLang: LanguageCode,
    targetLang: LanguageCode
  ): ProcessedSubtitleEvent[] {
    return sourceEvents.map(event => {
      // A simple hash function for demonstration. In a real scenario, a more robust one like SHA-1 would be used.
      const textHash = btoa(unescape(encodeURIComponent(event.text)));
      const id = event.id || String(event.start);

      return {
        id: id,
        start: event.start,
        end: event.start + event.duration,
        originalText: event.text,
        translatedText: translations[id] || null,
        sourceLangCode: sourceLang,
        targetLangCode: targetLang,
        textHash: textHash,
      };
    });
  }

  /**
   * 按优先级分组字幕
   * 将当前播放位置附近的字幕作为高优先级处理
   * @param subtitles 所有字幕
   * @param currentTime 当前播放时间(秒)
   * @param contextWindow 上下文窗口大小(秒)
   * @returns 分组后的字幕
   */
  public groupSubtitlesByPriority(
    subtitles: SubtitleEvent[],
    currentTime: number,
    contextWindow: number = 90
  ): {
    highPriority: SubtitleEvent[],
    normalPriority: SubtitleEvent[]
  } {
    const highPriority: SubtitleEvent[] = [];
    const normalPriority: SubtitleEvent[] = [];

    for (const event of subtitles) {
      const eventEnd = event.start + event.duration;
      if (
        (event.start >= currentTime && event.start <= currentTime + contextWindow) ||
        (eventEnd >= currentTime && eventEnd <= currentTime + contextWindow) ||
        (event.start < currentTime && eventEnd > currentTime)
      ) {
        highPriority.push(event);
      } else {
        normalPriority.push(event);
      }
    }

    return { highPriority, normalPriority };
  }

  /**
   * 优化的翻译流程
   * 先翻译当前播放位置附近的字幕，再处理其余字幕
   * @param context 翻译上下文
   * @param callback 回调函数
   * @returns 是否成功启动翻译
   */
  public async startProgressiveTranslation(
    context: TranslationContext,
    callback?: TranslationCallback
  ): Promise<boolean> {
    const { sourceEvents, currentTime } = context;
    
    if (!sourceEvents || sourceEvents.length === 0) {
      return false;
    }
    
    // 如果提供了当前时间，按优先级分组
    if (currentTime !== undefined) {
      const { highPriority, normalPriority } = this.groupSubtitlesByPriority(
        sourceEvents,
        currentTime,
        90 // 前后各45秒
      );
      
      console.log(`[translation-dispatcher] 按优先级分组: 高优先级 ${highPriority.length} 条，普通优先级 ${normalPriority.length} 条`);
      
      if (highPriority.length > 0) {
        // 创建高优先级上下文
        const highPriorityContext: TranslationContext = {
          ...context,
          sourceEvents: highPriority
        };
        
        // 提交高优先级翻译请求
        const highPriorityRequestId = this.submitTranslationRequest(
          highPriorityContext,
          TranslationPriority.HIGH,
          (processedEvents, error) => {
            // 高优先级翻译完成后回调
            if (callback && !error) {
              callback(processedEvents);
            }
            
            // 如果有普通优先级字幕，继续处理
            if (normalPriority.length > 0) {
              // 创建普通优先级上下文
              const normalPriorityContext: TranslationContext = {
                ...context,
                sourceEvents: normalPriority
              };
              
              // 提交普通优先级翻译请求
              this.submitTranslationRequest(
                normalPriorityContext,
                TranslationPriority.NORMAL,
                (moreProcessedEvents, moreError) => {
                  // 合并结果
                  if (callback && !moreError) {
                    callback([...processedEvents, ...moreProcessedEvents]);
                  }
                }
              );
            }
          }
        );
        
        return true;
      }
    }
    
    // 如果没有当前时间或没有高优先级字幕，直接翻译所有字幕
    const requestId = this.submitTranslationRequest(
      context,
      TranslationPriority.NORMAL,
      callback
    );
    
    return true;
  }

  /**
   * 直接获取翻译结果（新方法，用于简化的请求-响应模式）
   * @param context 翻译上下文
   * @returns 处理过的字幕事件数组
   * @throws 如果翻译失败则抛出错误
   */
  public async getTranslation(context: TranslationContext): Promise<ProcessedSubtitleEvent[]> {
    // 简化日志，避免重复输出 - 调用方已经有日志
    
    try {
      // 1. 检查VTT缓存
      const cacheResult = await this.translationCacheManager.get(
        context.videoId,
        context.sourceLang,
        context.targetLang,
        context.translationService
      );
      
      if (cacheResult && cacheResult.translatedSubtitles) {
        console.log('[translation-dispatcher] VTT缓存命中');
        const processedEvents = this._parseVttString(
          cacheResult.translatedSubtitles,
          context.sourceEvents,
          context.sourceLang,
          context.targetLang
        );
        return processedEvents;
      }
      
      console.log('[translation-dispatcher] VTT缓存未命中，执行API翻译');

      // 2. 如果缓存未命中，调用API翻译
      const translations = await this.translateSubtitles(
        context.sourceEvents,
        context.sourceLang,
        context.targetLang,
        context.translationService
      );

      // 3. 创建VTT字符串并存入缓存
      const vttString = this._createVttString(context.sourceEvents, translations);
      
      // 构造要缓存的数据对象
      const dataToCache: TranslationCacheData = {
        videoId: context.videoId,
        sourceLang: context.sourceLang,
        sourceKind: context.sourceKind,
        targetLang: context.targetLang,
        availableSourceLanguages: [], // 修正：添加缺失的属性
        translationService: { // 修正：手动转换以匹配安全的存储类型
          type: context.translationService.type,
          name: context.translationService.name,
          model: context.translationService.model || '',
          temperature: context.translationService.temperature || 0,
        },
        translatedSubtitles: vttString,
        lastUsed: Date.now(), // 修正：使用 lastUsed
        dataHash: '' // dataHash 将由 cache manager 在 set 方法内部生成
      };

      await this.translationCacheManager.set(dataToCache);
      
      console.log('[translation-dispatcher] VTT字符串已创建并存入缓存');

      // 4. 合并并返回结果
      const processedEvents = this.mergeSubtitleData(
        context.sourceEvents,
        translations,
        context.sourceLang,
        context.targetLang
      );

      return processedEvents;

    } catch (error) {
      console.error('[translation-dispatcher] 直接翻译流程失败:', error);
      // 重新抛出错误，以便上层调用者（如service-worker）可以捕获它
      throw error;
    }
  }
} 