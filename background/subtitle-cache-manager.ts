/**
 * @class SubtitleCacheManager
 * 专门用于管理字幕翻译缓存的类
 * 根据设计方案实现高效的字幕缓存功能
 */
export class SubtitleCacheManager {
  private static instance: SubtitleCacheManager;
  
  // 默认缓存大小限制 (条目数量)
  private MAX_CACHE_VIDEOS = 100;
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  public static getInstance(): SubtitleCacheManager {
    if (!SubtitleCacheManager.instance) {
      SubtitleCacheManager.instance = new SubtitleCacheManager();
    }
    return SubtitleCacheManager.instance;
  }
  
  /**
   * 生成缓存键
   * 格式：subtitle_translation_cache_[videoId]_[targetLang]_[apiType]
   * @param videoId 视频ID
   * @param targetLang 目标语言
   * @param apiType 翻译API类型
   */
  private generateCacheKey(videoId: string, targetLang: string, apiType: string): string {
    return `subtitle_translation_cache_${videoId}_${targetLang}_${apiType}`;
  }
  
  /**
   * 获取指定视频的字幕翻译缓存
   * @param videoId 视频ID
   * @param targetLang 目标语言
   * @param apiType 翻译API类型
   * @returns 缓存对象，格式为 {timestamp: number, translations: {[sourceSubtitleId: string]: string}}
   */
  public async getSubtitleCache(
    videoId: string, 
    targetLang: string, 
    apiType: string
  ): Promise<{timestamp: number, translations: Record<string, string>} | null> {
    const cacheKey = this.generateCacheKey(videoId, targetLang, apiType);
    
    try {
      // 读取缓存
      const result = await chrome.storage.local.get(cacheKey);
      const cache = result[cacheKey];
      
      if (cache) {
        console.log(`[SubtitleCache] 视频 ${videoId} 的翻译缓存命中，包含 ${Object.keys(cache.translations || {}).length} 条字幕翻译`);
        return cache;
      } else {
        console.log(`[SubtitleCache] 未找到视频 ${videoId} 的翻译缓存`);
        return null;
      }
    } catch (error) {
      console.error('[SubtitleCache] 读取缓存失败:', error);
      return null;
    }
  }
  
  /**
   * 保存字幕翻译缓存
   * @param videoId 视频ID
   * @param targetLang 目标语言
   * @param apiType 翻译API类型
   * @param translations 翻译结果对象，键为源字幕ID，值为翻译文本
   */
  public async saveSubtitleCache(
    videoId: string, 
    targetLang: string, 
    apiType: string, 
    translations: Record<string, string>
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(videoId, targetLang, apiType);
    
    try {
      // 创建缓存对象
      const cacheData = {
        timestamp: Date.now(),
        translations
      };
      
      // 保存缓存
      await chrome.storage.local.set({ [cacheKey]: cacheData });
      console.log(`[SubtitleCache] 已保存视频 ${videoId} 的翻译缓存，包含 ${Object.keys(translations).length} 条翻译`);
      
      // 管理缓存大小
      await this.manageCacheSize();
    } catch (error) {
      console.error('[SubtitleCache] 保存缓存失败:', error);
    }
  }
  
  /**
   * 管理缓存大小，使用LRU策略清理
   * 当缓存条目超过限制时，移除最旧的缓存
   */
  private async manageCacheSize(): Promise<void> {
    try {
      // 获取所有缓存键
      const storageData = await chrome.storage.local.get(null);
      
      // 筛选出字幕缓存键
      const subtitleCacheEntries = Object.entries(storageData)
        .filter(([key]) => key.startsWith('subtitle_translation_cache_'))
        .map(([key, value]) => ({
          key,
          timestamp: (value as any).timestamp || 0
        }));
      
      // 如果缓存条目超过限制
      if (subtitleCacheEntries.length > this.MAX_CACHE_VIDEOS) {
        // 按时间戳排序（从旧到新）
        subtitleCacheEntries.sort((a, b) => a.timestamp - b.timestamp);
        
        // 计算需要移除的条目数
        const removeCount = subtitleCacheEntries.length - this.MAX_CACHE_VIDEOS;
        
        // 获取要移除的键
        const keysToRemove = subtitleCacheEntries
          .slice(0, removeCount)
          .map(entry => entry.key);
        
        // 批量移除
        await chrome.storage.local.remove(keysToRemove);
        console.log(`[SubtitleCache] 清理了 ${removeCount} 个旧的字幕缓存条目`);
      }
    } catch (error) {
      console.error('[SubtitleCache] 缓存大小管理失败:', error);
    }
  }
  
  /**
   * 清除指定视频的翻译缓存
   * @param videoId 视频ID
   * @param targetLang 目标语言，可选，如果不指定则清除所有目标语言的缓存
   * @param apiType 翻译API类型，可选，如果不指定则清除所有API类型的缓存
   */
  public async clearVideoCache(
    videoId: string, 
    targetLang?: string, 
    apiType?: string
  ): Promise<void> {
    try {
      const allStorageData = await chrome.storage.local.get(null);
      
      // 构造匹配模式
      const pattern = targetLang && apiType 
        ? `subtitle_translation_cache_${videoId}_${targetLang}_${apiType}`
        : targetLang 
          ? `subtitle_translation_cache_${videoId}_${targetLang}_`
          : `subtitle_translation_cache_${videoId}_`;
      
      // 筛选匹配的键
      const keysToRemove = Object.keys(allStorageData)
        .filter(key => key.startsWith(pattern));
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`[SubtitleCache] 已清除视频 ${videoId} 的 ${keysToRemove.length} 个缓存条目`);
      } else {
        console.log(`[SubtitleCache] 未找到视频 ${videoId} 的缓存条目`);
      }
    } catch (error) {
      console.error('[SubtitleCache] 清除缓存失败:', error);
    }
  }
  
  /**
   * 获取缓存统计信息
   */
  public async getCacheStats(): Promise<{
    totalVideos: number,
    totalTranslations: number,
    approximateSizeKB: number,
    languageStats: { [key: string]: number },
    apiStats: { [key: string]: number }
  }> {
    try {
      const storageData = await chrome.storage.local.get(null);
      
      const stats = {
        totalVideos: 0,
        totalTranslations: 0,
        approximateSizeKB: 0,
        languageStats: {} as { [key: string]: number },
        apiStats: {} as { [key: string]: number }
      };
      
      // 遍历所有缓存条目
      for (const [key, value] of Object.entries(storageData)) {
        if (key.startsWith('subtitle_translation_cache_')) {
          stats.totalVideos++;
          
          // 提取缓存键中的信息
          const parts = key.split('_');
          if (parts.length >= 6) {
            const targetLang = parts[4];
            const apiType = parts[5];
            
            // 统计语言和API类型
            stats.languageStats[targetLang] = (stats.languageStats[targetLang] || 0) + 1;
            stats.apiStats[apiType] = (stats.apiStats[apiType] || 0) + 1;
            
            // 统计翻译数量
            const translations = (value as any).translations || {};
            const translationCount = Object.keys(translations).length;
            stats.totalTranslations += translationCount;
          }
          
          // 估算大小
          stats.approximateSizeKB += Math.round(JSON.stringify(value).length / 1024);
        }
      }
      
      return stats;
    } catch (error) {
      console.error('[SubtitleCache] 获取缓存统计失败:', error);
      return {
        totalVideos: 0,
        totalTranslations: 0,
        approximateSizeKB: 0,
        languageStats: {},
        apiStats: {}
      };
    }
  }
} 