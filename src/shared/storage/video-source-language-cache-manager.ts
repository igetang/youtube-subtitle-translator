/**
 * @file video-source-language-cache-manager.ts
 * @description 视频源语言缓存管理器 - 完整实现版
 * 基于 architecture.md 7.1.4 VideoSourceLanguageData 设计规范
 */

import { StorageManager, StorageKeys } from './storage-manager';
import { 
  VideoSourceLanguageCache, 
  VideoSourceLanguageData,
  DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE 
} from '../types/user-preferences-types';
import type { SimplifiedCaptionTrack, TrackMetadata } from '../types/subtitle-types';

/**
 * 视频源语言缓存管理器
 * 存储每个视频的完整源语言信息，包括可用列表和用户选择
 */
export class VideoSourceLanguageCacheManager {
  private static instance: VideoSourceLanguageCacheManager;
  private storageManager: StorageManager;
  private cache: VideoSourceLanguageCache = DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE;
  private initialized: boolean = false;
  private readonly CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30天缓存有效期

  private constructor() {
    this.storageManager = StorageManager.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): VideoSourceLanguageCacheManager {
    if (!VideoSourceLanguageCacheManager.instance) {
      VideoSourceLanguageCacheManager.instance = new VideoSourceLanguageCacheManager();
    }
    return VideoSourceLanguageCacheManager.instance;
  }

  /**
   * 初始化缓存管理器
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const stored = await this.storageManager.get<VideoSourceLanguageCache | null>(
        StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE, 
        null, 
        'local'
      );

      if (stored && Array.isArray(stored.items)) {
        this.cache = stored;
        console.log(`[video-source-cache] 已加载${stored.items.length}个视频源语言缓存项`);
      } else {
        this.cache = { ...DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE };
        await this.saveCache();
        console.log('[video-source-cache] 创建新的视频源语言缓存');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[video-source-cache] 初始化失败:', error);
      this.cache = { ...DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE };
      this.initialized = true;
    }
  }

  /**
   * 获取视频源语言完整数据
   * @param videoId 视频ID
   * @returns 完整的源语言数据或null
   */
  public async get(videoId: string): Promise<VideoSourceLanguageData | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const item = this.cache.items.find(item => item.videoId === videoId);
    
    if (!item) {
      // 简化中间层日志，未命中不输出
      // console.log(`[video-source-cache] 缓存未命中: ${videoId}`);
      return null;
    }

    // 检查缓存是否过期
    if (Date.now() - item.fetchedAt > this.CACHE_TTL) {
      // 简化中间层日志
      // console.log(`[video-source-cache] 缓存已过期: ${videoId}`);
      // 移除过期项
      this.cache.items = this.cache.items.filter(i => i.videoId !== videoId);
      await this.saveCache();
      return null;
    }

    // 更新最后访问时间
    item.lastAccessed = Date.now();
    await this.saveCache();
    
    // 简化中间层日志，只在调试时输出
    // console.log(`[video-source-cache] ✓ 缓存命中: ${videoId}, ${item.availableSourceLanguages.length}个轨道`);
    return item;
  }

  /**
   * 保存视频源语言完整数据
   * @param data 要保存的数据
   */
  public async set(data: Omit<VideoSourceLanguageData, 'fetchedAt' | 'lastAccessed'>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const completeData: VideoSourceLanguageData = {
      ...data,
      fetchedAt: Date.now(),
      lastAccessed: Date.now()
    };

    const existingIndex = this.cache.items.findIndex(item => item.videoId === data.videoId);
    
    if (existingIndex !== -1) {
      // 更新现有项
      this.cache.items[existingIndex] = completeData;
      // 简化中间层日志
      // console.log(`[video-source-cache] 更新缓存: ${data.videoId}`);
    } else {
      // 添加新项（FIFO）
      this.cache.items.push(completeData);
      
      // 检查容量限制
      if (this.cache.items.length > this.cache.maxSize) {
        const removed = this.cache.items.shift();
        // 简化中间层日志
        // console.log(`[video-source-cache] FIFO移除: ${removed?.videoId}`);
      }
      
      // 简化中间层日志
      // console.log(`[video-source-cache] 添加缓存: ${data.videoId}`);
    }

    await this.saveCache();
  }

  /**
   * 更新用户选择的源语言
   * @param videoId 视频ID
   * @param sourceLang 源语言代码
   * @param sourceTrack 源语言轨道（可选）
   */
  public async updateSelectedLanguage(
    videoId: string, 
    sourceLang: string,
    sourceTrack?: SimplifiedCaptionTrack
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const item = this.cache.items.find(i => i.videoId === videoId);
    
    if (item) {
      item.lastSelectedLanguage = sourceLang;
      if (sourceTrack) {
        item.selectedSourceTrack = sourceTrack;
      }
      item.lastAccessed = Date.now();
      
      console.log(`[video-source-cache] 更新源语言选择: ${videoId} -> ${sourceLang}`);
      await this.saveCache();
    } else {
      console.warn(`[video-source-cache] 无法更新，视频不存在: ${videoId}`);
    }
  }

  /**
   * 向后兼容方法：获取视频源语言代码
   * @deprecated 使用 get() 获取完整数据
   */
  public async getVideoSourceLanguage(videoId: string): Promise<string | null> {
    const data = await this.get(videoId);
    return data?.lastSelectedLanguage || null;
  }

  /**
   * 向后兼容方法：更新视频源语言代码
   * @deprecated 使用 updateSelectedLanguage() 代替
   */
  public async updateVideoSourceLanguage(videoId: string, sourceLang: string): Promise<void> {
    await this.updateSelectedLanguage(videoId, sourceLang);
  }

  /**
   * 清除指定视频的缓存
   */
  public async clear(videoId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const originalLength = this.cache.items.length;
    this.cache.items = this.cache.items.filter(item => item.videoId !== videoId);
    
    if (this.cache.items.length < originalLength) {
      console.log(`[video-source-cache] 清除视频缓存: ${videoId}`);
      await this.saveCache();
    }
  }

  /**
   * 清除所有缓存
   */
  public async clearAll(): Promise<void> {
    this.cache = { ...DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE };
    await this.saveCache();
    console.log('[video-source-cache] 已清除所有缓存');
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): {
    totalItems: number;
    totalSize: number;
    oldestItem: string | null;
    newestItem: string | null;
  } {
    const items = this.cache.items;
    
    return {
      totalItems: items.length,
      totalSize: JSON.stringify(this.cache).length,
      oldestItem: items[0]?.videoId || null,
      newestItem: items[items.length - 1]?.videoId || null
    };
  }

  /**
   * 保存缓存到存储
   */
  private async saveCache(): Promise<void> {
    try {
      await this.storageManager.set(
        StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE, 
        this.cache, 
        'local'
      );
    } catch (error) {
      console.error('[video-source-cache] 保存缓存失败:', error);
    }
  }
}