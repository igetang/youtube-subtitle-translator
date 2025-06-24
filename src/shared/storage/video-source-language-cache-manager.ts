/**
 * @file video-source-language-cache-manager.ts
 * @description 视频源语言缓存管理器
 * 基于 architecture.md 7.1.4 VideoSourceLanguageCache 设计规范
 */

import { StorageManager, StorageKeys } from './storage-manager';
import { 
  VideoSourceLanguageCache, 
  VideoSourceLanguageItem, 
  DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE 
} from '../types/user-preferences-types';

/**
 * 视频源语言缓存管理器
 * 解决TranslationCacheData缓存键构建问题，维护每个视频的源语言选择
 */
export class VideoSourceLanguageCacheManager {
  private storageManager: StorageManager;
  private cache: VideoSourceLanguageCache = DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE;
  private initialized: boolean = false;

  public constructor() {
    this.storageManager = StorageManager.getInstance();
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
        console.log(`[VideoSourceLanguageCacheManager] 已加载${stored.items.length}个视频源语言缓存项`);
      } else {
        this.cache = { ...DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE };
        await this.saveCache();
        console.log('[VideoSourceLanguageCacheManager] 创建新的视频源语言缓存');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[VideoSourceLanguageCacheManager] 初始化失败:', error);
      this.cache = { ...DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE };
    }
  }

  /**
   * 添加或更新视频源语言缓存
   * @param videoId 视频ID
   * @param sourceLang 源语言代码
   */
  public async updateVideoSourceLanguage(videoId: string, sourceLang: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const existingIndex = this.cache.items.findIndex(item => item.videoId === videoId);
    
    if (existingIndex !== -1) {
      // 🔄 视频ID已存在：直接覆盖sourceLang，保持在原位置
      this.cache.items[existingIndex].sourceLang = sourceLang;
      console.log(`[VideoSourceLanguageCacheManager] 更新视频${videoId}源语言: ${sourceLang}`);
    } else {
      // ➕ 视频ID不存在：执行FIFO操作
      // 1. 添加新项到末尾
      this.cache.items.push({ videoId, sourceLang });
      
      // 2. 检查容量限制
      if (this.cache.items.length > this.cache.maxSize) {
        const removed = this.cache.items.shift(); // 移除最旧的(数组开头)
        console.log(`[VideoSourceLanguageCacheManager] FIFO移除旧缓存: ${removed?.videoId}`);
      }
      
      console.log(`[VideoSourceLanguageCacheManager] 添加新视频${videoId}源语言: ${sourceLang}`);
    }

    await this.saveCache();
  }

  /**
   * 获取视频源语言
   * @param videoId 视频ID
   * @returns 源语言代码或null
   */
  public async getVideoSourceLanguage(videoId: string): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const item = this.cache.items.find(item => item.videoId === videoId);
    const result = item ? item.sourceLang : null;
    
    console.log(`[VideoSourceLanguageCacheManager] 查询视频${videoId}源语言: ${result || '未找到'}`);
    return result;
  }

  /**
   * 获取所有缓存项（用于调试）
   */
  public async getAllCacheItems(): Promise<VideoSourceLanguageItem[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return [...this.cache.items];
  }

  /**
   * 清空所有缓存
   */
  public async clearAllCache(): Promise<void> {
    this.cache = { ...DEFAULT_VIDEO_SOURCE_LANGUAGE_CACHE };
    await this.saveCache();
    console.log('[VideoSourceLanguageCacheManager] 已清空所有视频源语言缓存');
  }

  /**
   * 保存缓存到存储
   */
  private async saveCache(): Promise<void> {
    try {
      await this.storageManager.set(StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE, this.cache, 'local');
    } catch (error) {
      console.error('[VideoSourceLanguageCacheManager] 保存缓存失败:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): { itemCount: number; maxSize: number; usage: number } {
    return {
      itemCount: this.cache.items.length,
      maxSize: this.cache.maxSize,
      usage: Math.round((this.cache.items.length / this.cache.maxSize) * 100)
    };
  }
} 