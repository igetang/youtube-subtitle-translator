/**
 * @class CacheManager - 管理翻译缓存
 * 负责高效存储和检索翻译结果
 */
export class CacheManager {
  private static instance: CacheManager;
  
  // 默认缓存大小限制
  private MAX_CACHE_ITEMS = 1000;
  
  private constructor() {}
  
  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  /**
   * 生成缓存键
   */
  public generateCacheKey(text: string, sourceLang: string, targetLang: string, model: string): string {
    return `${text}_${sourceLang}_${targetLang}_${model}`;
  }
  
  /**
   * 获取翻译缓存
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param model 模型名称
   * @returns 缓存对象
   */
  public async getCache(sourceLang: string, targetLang: string, model: string): Promise<Record<string, string>> {
    const cacheKey = `openai_translation_cache_${sourceLang}_${targetLang}_${model}`;
    
    try {
      // 读取缓存
      const storageData = await new Promise<{[key: string]: any}>((resolve) => {
        chrome.storage.local.get(cacheKey, (data) => resolve(data));
      });
      
      const cache = storageData[cacheKey] || {};
      console.log(`[CacheManager] 从缓存加载了 ${Object.keys(cache).length} 条记录`);
      return cache;
    } catch (error) {
      console.error('[CacheManager] 读取缓存失败:', error);
      return {};
    }
  }
  
  /**
   * 保存翻译缓存
   * @param cache 缓存对象
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param model 模型名称
   */
  public async saveCache(cache: Record<string, string>, sourceLang: string, targetLang: string, model: string): Promise<void> {
    const cacheKey = `openai_translation_cache_${sourceLang}_${targetLang}_${model}`;
    
    try {
      // 检查缓存大小并清理
      await this.manageCacheSize(cache);
      
      // 保存更新后的缓存
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ [cacheKey]: cache }, () => resolve());
      });
      console.log(`[CacheManager] 已更新缓存，现包含 ${Object.keys(cache).length} 条记录`);
    } catch (error) {
      console.error('[CacheManager] 更新缓存失败:', error);
    }
  }
  
  /**
   * 管理缓存大小，移除最旧的项目
   */
  private async manageCacheSize(cache: Record<string, string>): Promise<void> {
    const cacheSize = Object.keys(cache).length;
    
    if (cacheSize > this.MAX_CACHE_ITEMS) {
      console.log(`[CacheManager] 缓存过大 (${cacheSize} > ${this.MAX_CACHE_ITEMS})，清理旧条目...`);
      
      // 获取缓存键并按创建时间排序（这里简化为按键的字母顺序）
      const keys = Object.keys(cache).sort();
      
      // 计算需要移除的条目数
      const removeCount = cacheSize - Math.floor(this.MAX_CACHE_ITEMS * 0.8); // 移除20%
      
      // 移除最旧的条目
      const keysToRemove = keys.slice(0, removeCount);
      keysToRemove.forEach(key => {
        delete cache[key];
      });
      
      console.log(`[CacheManager] 已移除 ${removeCount} 条旧缓存条目`);
    }
  }
  
  /**
   * 清空特定语言对和模型的缓存
   */
  public async clearCache(sourceLang: string, targetLang: string, model: string): Promise<void> {
    const cacheKey = `openai_translation_cache_${sourceLang}_${targetLang}_${model}`;
    
    try {
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove(cacheKey, () => resolve());
      });
      console.log(`[CacheManager] 已清空缓存: ${cacheKey}`);
    } catch (error) {
      console.error('[CacheManager] 清空缓存失败:', error);
    }
  }
  
  /**
   * 获取缓存统计信息
   */
  public async getCacheStats(): Promise<{
    totalItems: number,
    totalSize: number,
    languagePairs: { [key: string]: number }
  }> {
    try {
      // 获取所有缓存键
      const storageData = await new Promise<{[key: string]: any}>((resolve) => {
        chrome.storage.local.get(null, (data) => resolve(data));
      });
      
      const stats = {
        totalItems: 0,
        totalSize: 0,
        languagePairs: {} as { [key: string]: number }
      };
      
      // 遍历所有缓存，计算统计信息
      for (const [key, value] of Object.entries(storageData)) {
        if (key.startsWith('openai_translation_cache_')) {
          const cacheItems = typeof value === 'object' ? Object.keys(value).length : 0;
          stats.totalItems += cacheItems;
          
          // 估算大小（粗略计算）
          const cacheSize = JSON.stringify(value).length;
          stats.totalSize += cacheSize;
          
          // 提取语言对
          const langPairMatch = key.match(/openai_translation_cache_(.+?)_(.+?)_/);
          if (langPairMatch) {
            const langPair = `${langPairMatch[1]}->${langPairMatch[2]}`;
            stats.languagePairs[langPair] = (stats.languagePairs[langPair] || 0) + cacheItems;
          }
        }
      }
      
      return stats;
    } catch (error) {
      console.error('[CacheManager] 获取缓存统计失败:', error);
      return {
        totalItems: 0,
        totalSize: 0,
        languagePairs: {}
      };
    }
  }
} 