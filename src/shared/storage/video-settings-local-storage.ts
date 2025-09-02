/**
 * @file video-settings-local-storage.ts
 * @description 视频设置本地存储管理
 */

import { StorageKeys, StorageManager } from './storage-manager';

/**
 * 视频设置接口
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
 * 视频设置本地存储管理类
 * 负责管理视频特定设置的本地存储存取
 */
export class VideoSettingsLocalStorage {
  private static instance: VideoSettingsLocalStorage;
  
  // 默认local storage视频数量限制
  private readonly MAX_CACHED_VIDEOS = 50;
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  public static getInstance(): VideoSettingsLocalStorage {
    if (!VideoSettingsLocalStorage.instance) {
      VideoSettingsLocalStorage.instance = new VideoSettingsLocalStorage();
    }
    return VideoSettingsLocalStorage.instance;
  }
  
  /**
   * 获取视频设置local storage
   * @param videoId 视频ID
   * @returns 视频设置或null（如果未找到）
   */
  public async getVideoSettings(videoId: string): Promise<VideoSettings | null> {
    if (!videoId) return null;
    
    const localStorageKey = `${StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX}${videoId}`;
    
    try {
      const settings = await StorageManager.getInstance().get<VideoSettings | null>(localStorageKey, null, 'local');
      
      if (settings) {
        console.log(`[video-settings-local-storage] 找到视频 ${videoId} 的local storage设置`);
        return settings;
      } else {
        console.log(`[video-settings-local-storage] 未找到视频 ${videoId} 的local storage设置`);
        return null;
      }
    } catch (error) {
      console.error('[video-settings-local-storage] 获取视频设置local storage失败:', error);
      return null;
    }
  }
  
  /**
   * 保存视频设置local storage
   * @param settings 要保存的视频设置
   */
  public async saveVideoSettings(settings: VideoSettings): Promise<void> {
    if (!settings || !settings.videoId) return;
    
    const localStorageKey = `${StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX}${settings.videoId}`;
    
    try {
      // 🔧 优化：获取当前存储的设置进行对比
      const existingSettings = await StorageManager.getInstance().get<VideoSettings | null>(localStorageKey, null, 'local');
      
      // 确保设置包含最后使用时间
      const settingsToSave = {
        ...settings,
        lastUsed: settings.lastUsed || Date.now()
      };
      
      // 🔧 优化：详细的变更检测和日志记录
      let hasRealChanges = false;
      let changeDetails: string[] = [];
      
      if (!existingSettings) {
        hasRealChanges = true;
        changeDetails.push('首次保存');
      } else {
        // 检查每个关键字段的变化
        if (existingSettings.sourceLang !== settingsToSave.sourceLang) {
          hasRealChanges = true;
          changeDetails.push(`源语言: ${existingSettings.sourceLang} → ${settingsToSave.sourceLang}`);
        }
        if (existingSettings.targetLang !== settingsToSave.targetLang) {
          hasRealChanges = true;
          changeDetails.push(`目标语言: ${existingSettings.targetLang} → ${settingsToSave.targetLang}`);
        }
        if (existingSettings.hasSubtitles !== settingsToSave.hasSubtitles) {
          hasRealChanges = true;
          changeDetails.push(`字幕状态: ${existingSettings.hasSubtitles} → ${settingsToSave.hasSubtitles}`);
        }
        if (existingSettings.sourceTrackKind !== settingsToSave.sourceTrackKind) {
          hasRealChanges = true;
          changeDetails.push(`轨道类型: ${existingSettings.sourceTrackKind} → ${settingsToSave.sourceTrackKind}`);
        }
        
        // 检查时间戳是否有意义的更新（大于1分钟差异视为有意义）
        const timeDiff = Math.abs(settingsToSave.lastUsed - existingSettings.lastUsed);
        if (timeDiff > 60000) { // 1分钟
          changeDetails.push(`上次使用时间: ${new Date(existingSettings.lastUsed).toLocaleTimeString()} → ${new Date(settingsToSave.lastUsed).toLocaleTimeString()}`);
        }
      }
      
      // 记录写入触发信息
      const writeReason = hasRealChanges ? '数据变更' : '仅时间戳更新';
      console.log(`[video-settings-local-storage] 保存视频设置 ${settings.videoId} (${writeReason}): ${changeDetails.length > 0 ? changeDetails.join(', ') : '无实质变更'}`);
      
      // 保存到存储
      await StorageManager.getInstance().set(localStorageKey, settingsToSave, 'local');
      console.log(`[video-settings-local-storage] ✅视频 ${settings.videoId} 设置已写入local storage`);
      
      // 更新最近使用的视频列表
      await this.updateLastUsedVideos(settings.videoId);
      
      // 管理本地存储大小
      await this.manageCacheSize();
    } catch (error) {
      console.error('[video-settings-local-storage] 保存视频设置local storage失败:', error);
    }
  }
  
  /**
   * 更新最近使用的视频列表
   * @param videoId 刚使用的视频ID
   */
  private async updateLastUsedVideos(videoId: string): Promise<void> {
    try {
      // 获取当前的最近使用视频列表
      const lastUsedVideos = await StorageManager.getInstance().get<string[]>(StorageKeys.LOCAL.LAST_USED_VIDEOS, [], 'local');
      
      // 将当前视频移到列表最前面（如果已存在则先移除）
      const newList = [
        videoId, 
        ...lastUsedVideos.filter(id => id !== videoId)
      ].slice(0, this.MAX_CACHED_VIDEOS); // 保持列表长度不超过限制
      
      // 保存更新后的列表
              await StorageManager.getInstance().set(StorageKeys.LOCAL.LAST_USED_VIDEOS, newList, 'local');
    } catch (error) {
              console.error('[video-settings-local-storage] 更新最近使用视频列表失败:', error);
    }
  }
  
  /**
   * 管理本地存储大小，移除超出限制的最老本地存储
   */
  private async manageCacheSize(): Promise<void> {
    try {
      // 获取所有local storage的键
      const storageData = await StorageManager.getInstance().getBatch(null, 'local');
      
      // 筛选出视频设置local storage键
      const videoSettingsKeys = Object.keys(storageData)
        .filter(key => key.startsWith(StorageKeys.LOCAL.VIDEO_SETTINGS_PREFIX));
      
      // 如果local storage数量超出限制
      if (videoSettingsKeys.length > this.MAX_CACHED_VIDEOS) {
        console.log(`[video-settings-local-storage] local storage视频数量(${videoSettingsKeys.length})超出限制(${this.MAX_CACHED_VIDEOS})，开始清理`);
        
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
        
        // 移除最老的local storage
        await StorageManager.getInstance().remove(keysToRemove, 'local');
        console.log(`[video-settings-local-storage] 已清理 ${removeCount} 个最老的视频设置local storage`);
      }
    } catch (error) {
      console.error('[video-settings-local-storage] 管理本地存储大小失败:', error);
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
              console.error('[video-settings-local-storage] 提取视频ID失败:', error);
      return null;
    }
  }
} 