/**
 * @file video-settings-cache.ts
 * @description 视频设置缓存管理
 */

import { StorageKeys, StorageManager } from './storage-manager';

/**
 * 视频设置缓存接口
 */
export interface VideoSettings {
  videoId: string;           // 视频ID
  sourceLang: string;        // 源语言
  targetLang: string;        // 目标语言
  lastUsed: number;          // 最后使用时间戳
  hasSubtitles: boolean;     // 视频是否有字幕
  sourceTrackKind?: string;  // 源语言轨道类型
}

/**
 * 视频设置缓存管理类
 * 负责管理视频特定设置的缓存存取
 */
export class VideoSettingsCache {
  private static instance: VideoSettingsCache;
  
  // 默认缓存视频数量限制
  private readonly MAX_CACHED_VIDEOS = 50;
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  public static getInstance(): VideoSettingsCache {
    if (!VideoSettingsCache.instance) {
      VideoSettingsCache.instance = new VideoSettingsCache();
    }
    return VideoSettingsCache.instance;
  }
  
  /**
   * 获取视频设置缓存
   * @param videoId 视频ID
   * @returns 视频设置或null（如果未找到）
   */
  public async getVideoSettings(videoId: string): Promise<VideoSettings | null> {
    if (!videoId) return null;
    
    const cacheKey = `${StorageKeys.CACHE.VIDEO_SETTINGS_PREFIX}${videoId}`;
    
    try {
      const settings = await StorageManager.getInstance().get<VideoSettings | null>(cacheKey, null, 'local');
      
      if (settings) {
        console.log(`[src/storage/video-settings-cache.ts] 找到视频 ${videoId} 的缓存设置`);
        return settings;
      } else {
        console.log(`[src/storage/video-settings-cache.ts] 未找到视频 ${videoId} 的缓存设置`);
        return null;
      }
    } catch (error) {
      console.error('[src/storage/video-settings-cache.ts] 获取视频设置缓存失败:', error);
      return null;
    }
  }
  
  /**
   * 保存视频设置缓存
   * @param settings 要保存的视频设置
   */
  public async saveVideoSettings(settings: VideoSettings): Promise<void> {
    if (!settings || !settings.videoId) return;
    
    const cacheKey = `${StorageKeys.CACHE.VIDEO_SETTINGS_PREFIX}${settings.videoId}`;
    
    try {
      // 确保设置包含最后使用时间
      const settingsToSave = {
        ...settings,
        lastUsed: settings.lastUsed || Date.now()
      };
      
      // 保存到存储
      await StorageManager.getInstance().set(cacheKey, settingsToSave, 'local');
      console.log(`[src/storage/video-settings-cache.ts] 已保存视频 ${settings.videoId} 的设置缓存`);
      
      // 更新最近使用的视频列表
      await this.updateLastUsedVideos(settings.videoId);
      
      // 管理缓存大小
      await this.manageCacheSize();
    } catch (error) {
      console.error('[src/storage/video-settings-cache.ts] 保存视频设置缓存失败:', error);
    }
  }
  
  /**
   * 更新最近使用的视频列表
   * @param videoId 刚使用的视频ID
   */
  private async updateLastUsedVideos(videoId: string): Promise<void> {
    try {
      // 获取当前的最近使用视频列表
      const lastUsedVideos = await StorageManager.getInstance().get<string[]>(StorageKeys.CACHE.LAST_USED_VIDEOS, [], 'local');
      
      // 将当前视频移到列表最前面（如果已存在则先移除）
      const newList = [
        videoId, 
        ...lastUsedVideos.filter(id => id !== videoId)
      ].slice(0, this.MAX_CACHED_VIDEOS); // 保持列表长度不超过限制
      
      // 保存更新后的列表
      await StorageManager.getInstance().set(StorageKeys.CACHE.LAST_USED_VIDEOS, newList, 'local');
    } catch (error) {
      console.error('[src/storage/video-settings-cache.ts] 更新最近使用视频列表失败:', error);
    }
  }
  
  /**
   * 管理缓存大小，移除超出限制的最老缓存
   */
  private async manageCacheSize(): Promise<void> {
    try {
      // 获取所有缓存的键
      const storageData = await StorageManager.getInstance().getBatch(null, 'local');
      
      // 筛选出视频设置缓存键
      const videoSettingsKeys = Object.keys(storageData)
        .filter(key => key.startsWith(StorageKeys.CACHE.VIDEO_SETTINGS_PREFIX));
      
      // 如果缓存数量超出限制
      if (videoSettingsKeys.length > this.MAX_CACHED_VIDEOS) {
        console.log(`[src/storage/video-settings-cache.ts] 缓存视频数量(${videoSettingsKeys.length})超出限制(${this.MAX_CACHED_VIDEOS})，开始清理`);
        
        // 按最后使用时间排序（从旧到新）
        const sortedEntries = videoSettingsKeys
          .map(key => ({
            key,
            lastUsed: (storageData[key] as VideoSettings).lastUsed || 0
          }))
          .sort((a, b) => a.lastUsed - b.lastUsed);
        
        // 计算需要移除的数量
        const removeCount = videoSettingsKeys.length - this.MAX_CACHED_VIDEOS;
        
        // 获取要移除的键
        const keysToRemove = sortedEntries
          .slice(0, removeCount)
          .map(entry => entry.key);
        
        // 移除最老的缓存
        await StorageManager.getInstance().remove(keysToRemove, 'local');
        console.log(`[src/storage/video-settings-cache.ts] 已清理 ${removeCount} 个最老的视频设置缓存`);
      }
    } catch (error) {
      console.error('[src/storage/video-settings-cache.ts] 管理缓存大小失败:', error);
    }
  }
  
  /**
   * 提取YouTube URL中的视频ID
   * @param url YouTube视频URL
   * @returns 视频ID或null
   */
  public static extractVideoId(url: string): string | null {
    if (!url) return null;
    
    try {
      // 支持多种YouTube URL格式
      const urlObj = new URL(url);
      
      // 标准视频URL: youtube.com/watch?v=VIDEO_ID
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }
      
      // 短链接: youtu.be/VIDEO_ID
      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.substring(1);
      }
      
      // 嵌入URL: youtube.com/embed/VIDEO_ID
      if (urlObj.pathname.startsWith('/embed/')) {
        return urlObj.pathname.split('/')[2];
      }
      
      return null;
    } catch (error) {
      console.error('[src/storage/video-settings-cache.ts] 提取视频ID失败:', error);
      return null;
    }
  }
} 