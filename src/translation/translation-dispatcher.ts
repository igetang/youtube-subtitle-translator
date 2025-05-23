/**
 * @file translation-dispatcher.ts
 * @description 翻译调度器，统一协调翻译流程各步骤
 */

import { StorageManager, StorageKeys } from '../storage/storage-manager';
import { SettingsManager, SubtitleMode, TranslationApiType } from '../storage/settings-manager';

/**
 * 字幕事件结构
 */
export interface SubtitleEvent {
  id: string;
  start: number;
  end: number;
  text: string;
  langCode: string;
}

/**
 * 处理后的字幕事件
 */
export interface ProcessedSubtitleEvent {
  start: number;
  end: number;
  sourceText: string;
  targetText: string | null;
  sourceLangCode: string;
  targetLangCode: string;
}

/**
 * 翻译结果
 */
export interface TranslationResults {
  [id: string]: string;
}

/**
 * 翻译缓存项
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
  targetLang: string;
  translationApi: TranslationApiType;
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
  eventType: TranslationEvent,
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
  private settingsManager: SettingsManager;
  private eventHandlers: Map<TranslationEvent, Set<TranslationEventHandler>>;
  private activeRequests: Map<string, TranslationRequest>;
  private processingRequest: TranslationRequest | null = null;
  private isProcessing: boolean = false;

  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.settingsManager = SettingsManager.getInstance();
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
   * 添加翻译事件监听器
   * @param eventType 事件类型
   * @param handler 处理函数
   */
  public addEventListener(eventType: TranslationEvent, handler: TranslationEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * 移除翻译事件监听器
   * @param eventType 事件类型
   * @param handler 处理函数
   */
  public removeEventListener(eventType: TranslationEvent, handler: TranslationEventHandler): void {
    if (!this.eventHandlers.has(eventType)) return;
    
    this.eventHandlers.get(eventType)!.delete(handler);
    
    if (this.eventHandlers.get(eventType)!.size === 0) {
      this.eventHandlers.delete(eventType);
    }
  }

  /**
   * 触发翻译事件
   * @param eventType 事件类型
   * @param data 事件数据
   */
  private triggerEvent(eventType: TranslationEvent, data: any): void {
    if (!this.eventHandlers.has(eventType)) return;
    
    this.eventHandlers.get(eventType)!.forEach(handler => {
      try {
        handler(eventType, data);
      } catch (error) {
        console.error(`翻译事件处理函数执行错误 (事件: ${eventType}):`, error);
      }
    });
  }

  /**
   * 生成唯一请求ID
   */
  private generateRequestId(context: TranslationContext): string {
    const { videoId, sourceLang, targetLang, translationApi } = context;
    return `req_${videoId}_${sourceLang}_${targetLang}_${translationApi}_${Date.now()}`;
  }

  /**
   * 生成翻译缓存键
   */
  private generateCacheKey(context: TranslationContext): string {
    const { videoId, targetLang, translationApi } = context;
    return `${StorageKeys.CACHE.TRANSLATIONS_PREFIX}${videoId}_${targetLang}_${translationApi}`;
  }

  /**
   * 检查是否已经有相同条件的翻译请求
   */
  private hasSimilarRequest(context: TranslationContext): boolean {
    for (const request of this.activeRequests.values()) {
      const similar = request.context.videoId === context.videoId 
        && request.context.sourceLang === context.sourceLang
        && request.context.targetLang === context.targetLang
        && request.context.translationApi === context.translationApi;
        
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
      console.log('已有相同条件的翻译请求正在处理中');
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
      console.error('处理翻译请求时出错:', error);
      
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
            console.error('翻译回调执行错误:', callbackError);
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
    const { videoId, sourceEvents, sourceLang, targetLang, translationApi } = context;
    
    if (!sourceEvents || sourceEvents.length === 0) {
      throw new Error('没有可翻译的字幕');
    }
    
    console.log(`开始处理翻译请求: ${request.id}, 共 ${sourceEvents.length} 条字幕`);
    
    // 1. 查询字幕缓存
    const cacheKey = this.generateCacheKey(context);
    const cachedTranslations = await this.checkTranslationCache(cacheKey);
    
    let translationResults: TranslationResults = {};
    let translatedFromCache = false;
    
    if (cachedTranslations) {
      // 检查缓存是否包含所有字幕
      const allSubtitlesInCache = sourceEvents.every(event => 
        cachedTranslations[event.id] !== undefined
      );
      
      if (allSubtitlesInCache) {
        // 缓存中有所有字幕的翻译，直接使用
        translationResults = cachedTranslations;
        translatedFromCache = true;
        console.log(`使用缓存的翻译结果，共 ${Object.keys(translationResults).length} 条字幕`);
      } else {
        // 部分字幕在缓存中，提取需要翻译的部分
        translationResults = { ...cachedTranslations };
        const subtitlesToTranslate = sourceEvents.filter(event => 
          !translationResults[event.id]
        );
        
        console.log(`部分字幕在缓存中，需要翻译 ${subtitlesToTranslate.length} 条字幕`);
        
        // 2. 对未缓存的字幕进行翻译
        if (subtitlesToTranslate.length > 0) {
          const newTranslations = await this.translateSubtitles(
            subtitlesToTranslate,
            sourceLang,
            targetLang,
            translationApi
          );
          
          // 合并结果
          Object.assign(translationResults, newTranslations);
          
          // 更新缓存
          await this.updateTranslationCache(cacheKey, translationResults);
        }
      }
    } else {
      // 缓存中没有任何翻译，全部重新翻译
      console.log(`缓存未命中，翻译全部 ${sourceEvents.length} 条字幕`);
      
      // 2. 翻译字幕
      translationResults = await this.translateSubtitles(
        sourceEvents,
        sourceLang,
        targetLang,
        translationApi
      );
      
      // 更新缓存
      await this.updateTranslationCache(cacheKey, translationResults);
    }
    
    // 3. 合并源字幕和翻译结果
    const processedEvents = this.mergeSubtitleData(
      sourceEvents,
      translationResults,
      sourceLang,
      targetLang
    );
    
    // 4. 标记请求为完成状态
    request.status = TranslationStatus.COMPLETED;
    
    // 5. 触发翻译完成事件
    this.triggerEvent(TranslationEvent.TRANSLATION_COMPLETED, {
      requestId: request.id,
      processedEvents,
      fromCache: translatedFromCache
    });
    
    // 6. 调用回调函数
    if (callback) {
      try {
        callback(processedEvents);
      } catch (error) {
        console.error('翻译回调执行错误:', error);
      }
    }
    
    console.log(`翻译请求处理完成: ${request.id}`);
  }

  /**
   * 从缓存中查询翻译结果
   * @param cacheKey 缓存键
   * @returns 缓存的翻译结果
   */
  private async checkTranslationCache(cacheKey: string): Promise<TranslationResults | null> {
    try {
      const cache = await this.storageManager.get<TranslationCacheItem | null>(cacheKey, null, 'local');
      
      if (cache && cache.translations) {
        return cache.translations;
      }
      
      return null;
    } catch (error) {
      console.error('查询翻译缓存时出错:', error);
      return null;
    }
  }

  /**
   * 更新翻译缓存
   * @param cacheKey 缓存键
   * @param translations 翻译结果
   */
  private async updateTranslationCache(cacheKey: string, translations: TranslationResults): Promise<void> {
    try {
      const cacheData: TranslationCacheItem = {
        translations,
        timestamp: Date.now()
      };
      
      await this.storageManager.set(cacheKey, cacheData, 'local');
    } catch (error) {
      console.error('更新翻译缓存时出错:', error);
    }
  }

  /**
   * 翻译字幕
   * @param subtitles 待翻译的字幕
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param apiType API类型
   * @returns 翻译结果
   */
  private async translateSubtitles(
    subtitles: SubtitleEvent[],
    sourceLang: string,
    targetLang: string,
    apiType: TranslationApiType
  ): Promise<TranslationResults> {
    // 准备翻译请求参数
    const subtitlesToTranslate = subtitles.map(subtitle => ({
      id: subtitle.id,
      text: subtitle.text
    }));
    
    // 调用后台脚本进行翻译
    return new Promise<TranslationResults>((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'translateSubtitles',
        payload: {
          subtitles: subtitlesToTranslate,
          sourceLang,
          targetLang,
          videoId: subtitles[0]?.id.split('_')[0] || 'unknown', // 从ID中提取视频ID
          apiType
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.status === 'success') {
          resolve(response.translatedSubtitles || {});
        } else {
          reject(new Error(response?.message || '翻译失败'));
        }
      });
    });
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
    sourceLang: string,
    targetLang: string
  ): ProcessedSubtitleEvent[] {
    return sourceEvents.map(event => ({
      start: event.start,
      end: event.end,
      sourceText: event.text,
      targetText: translations[event.id] || null,
      sourceLangCode: sourceLang,
      targetLangCode: targetLang
    }));
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
    // 定义时间窗口
    const halfWindow = contextWindow / 2;
    const windowStart = Math.max(0, currentTime - halfWindow);
    const windowEnd = currentTime + halfWindow;
    
    const highPriority: SubtitleEvent[] = [];
    const normalPriority: SubtitleEvent[] = [];
    
    // 分组字幕
    subtitles.forEach(subtitle => {
      // 判断字幕是否在时间窗口内
      const isInWindow = 
        (subtitle.start >= windowStart && subtitle.start <= windowEnd) || // 开始时间在窗口内
        (subtitle.end >= windowStart && subtitle.end <= windowEnd) ||     // 结束时间在窗口内
        (subtitle.start <= windowStart && subtitle.end >= windowEnd);     // 跨越整个窗口
        
      if (isInWindow) {
        highPriority.push(subtitle);
      } else {
        normalPriority.push(subtitle);
      }
    });
    
    return {
      highPriority,
      normalPriority
    };
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
      
      console.log(`按优先级分组: 高优先级 ${highPriority.length} 条，普通优先级 ${normalPriority.length} 条`);
      
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
} 