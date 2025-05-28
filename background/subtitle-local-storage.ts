/**
 * @class SubtitleLocalStorage
 * 专门用于管理字幕翻译本地存储的类
 * 根据设计方案实现高效的字幕本地存储功能
 */
export class SubtitleLocalStorage {
  private static instance: SubtitleLocalStorage;
  
  // 默认local storage大小限制 (条目数量)
private MAX_CACHE_VIDEOS = 100;
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  public static getInstance(): SubtitleLocalStorage {
    if (!SubtitleLocalStorage.instance) {
      SubtitleLocalStorage.instance = new SubtitleLocalStorage();
    }
    return SubtitleLocalStorage.instance;
  }
  
  /**
   * 生成local storage键
   * 格式：subtitle_translation_cache_[videoId]_[targetLang]_[apiType]
   * @param videoId 视频ID
   * @param targetLang 目标语言
   * @param apiType 翻译API类型
   */
  private generateLocalStorageKey(videoId: string, targetLang: string, apiType: string): string {
    return `subtitle_translation_cache_${videoId}_${targetLang}_${apiType}`;
  }
  
  /**
   * 获取指定视频的字幕翻译local storage
   * @param videoId 视频ID
   * @param targetLang 目标语言
   * @param apiType 翻译API类型
   * @returns local storage对象，格式为 {timestamp: number, translations: {[sourceSubtitleId: string]: string}}
   */
  public async getSubtitleCache(
    videoId: string, 
    targetLang: string, 
    apiType: string
  ): Promise<{timestamp: number, translations: Record<string, string>} | null> {
    const localStorageKey = this.generateLocalStorageKey(videoId, targetLang, apiType);
    
    try {
            // 读取本地存储
      const result = await chrome.storage.local.get(localStorageKey);
      const localStorageData = result[localStorageKey];

      if (localStorageData) {
        console.log(`[SubtitleCache] 视频 ${videoId} 的翻译本地存储命中，包含 ${Object.keys(localStorageData.translations || {}).length} 条字幕翻译`);
        return localStorageData;
      } else {
        console.log(`[SubtitleCache] 未找到视频 ${videoId} 的翻译本地存储`);
        return null;
      }
    } catch (error) {
      console.error('[SubtitleCache] 读取local storage失败:', error);
      return null;
    }
  }
  
  /**
   * 保存字幕翻译local storage
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
    const localStorageKey = this.generateLocalStorageKey(videoId, targetLang, apiType);
    
    try {
      // 创建local storage对象
      const cacheData = {
        timestamp: Date.now(),
        translations
      };
      
      // 保存local storage
      await chrome.storage.local.set({ [localStorageKey]: cacheData });
      console.log(`[SubtitleCache] 已保存视频 ${videoId} 的翻译local storage，包含 ${Object.keys(translations).length} 条翻译`);
      
      // 管理local storage大小
      await this.manageCacheSize();
    } catch (error) {
      console.error('[SubtitleCache] 保存local storage失败:', error);
    }
  }
  
  /**
   * 管理local storage大小，使用LRU策略清理
   * 当local storage条目超过限制时，移除最旧的local storage
   */
  private async manageCacheSize(): Promise<void> {
    try {
      // 获取所有local storage键
      const storageData = await chrome.storage.local.get(null);
      
      // 筛选出字幕local storage键
      const subtitleCacheEntries = Object.entries(storageData)
        .filter(([key]) => key.startsWith('subtitle_translation_cache_'))
        .map(([key, value]) => ({
          key,
          timestamp: (value as any).timestamp || 0
        }));
      
      // 如果local storage条目超过限制
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
        console.log(`[SubtitleCache] 清理了 ${removeCount} 个旧的字幕local storage条目`);
      }
    } catch (error) {
      console.error('[SubtitleCache] local storage大小管理失败:', error);
    }
  }
  
  /**
   * 清除指定视频的翻译local storage
   * @param videoId 视频ID
   * @param targetLang 目标语言，可选，如果不指定则清除所有目标语言的local storage
   * @param apiType 翻译API类型，可选，如果不指定则清除所有API类型的local storage
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
        console.log(`[SubtitleCache] 已清除视频 ${videoId} 的 ${keysToRemove.length} 个local storage条目`);
      } else {
        console.log(`[SubtitleCache] 未找到视频 ${videoId} 的local storage条目`);
      }
    } catch (error) {
      console.error('[SubtitleCache] 清除local storage失败:', error);
    }
  }
  
  /**
   * 获取local storage统计信息
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
      
      // 遍历所有local storage条目
      for (const [key, value] of Object.entries(storageData)) {
        if (key.startsWith('subtitle_translation_cache_')) {
          stats.totalVideos++;
          
          // 提取local storage键中的信息
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
      console.error('[SubtitleCache] 获取local storage统计失败:', error);
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