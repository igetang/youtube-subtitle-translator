/**
 * @class TranslationLocalStorage - 管理翻译本地存储
 * 负责高效存储和检索翻译结果到chrome.storage.local
 */
export class TranslationLocalStorage {
  private static instance: TranslationLocalStorage;
  
  // 默认local storage大小限制
private MAX_CACHE_ITEMS = 1000;
  
  private constructor() {}
  
  public static getInstance(): TranslationLocalStorage {
    if (!TranslationLocalStorage.instance) {
      TranslationLocalStorage.instance = new TranslationLocalStorage();
    }
    return TranslationLocalStorage.instance;
  }
  
  /**
   * 生成local storage键
   */
  public generateLocalStorageKey(text: string, sourceLang: string, targetLang: string, model: string): string {
    return `${text}_${sourceLang}_${targetLang}_${model}`;
  }
  
  /**
   * 获取翻译本地存储
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param model 模型名称
   * @returns 本地存储对象
   */
  public async getLocalStorage(sourceLang: string, targetLang: string, model: string): Promise<Record<string, string>> {
    const cacheKey = `openai_translation_cache_${sourceLang}_${targetLang}_${model}`;
    
    try {
      // 读取本地存储
      const storageData = await new Promise<{[key: string]: any}>((resolve) => {
        chrome.storage.local.get(cacheKey, (data) => resolve(data));
      });
      
      const localStorageData = storageData[cacheKey] || {};
      // 简化加载日志
      // console.log(`[TranslationLocalStorage] 加载: ${Object.keys(localStorageData).length} 条`);
      return localStorageData;
    } catch (error) {
      console.debug('[TranslationLocalStorage] ✗ 读取失败:', error);
      return {};
    }
  }
  
  /**
   * 保存翻译本地存储
   * @param localStorageData 本地存储对象
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param model 模型名称
   */
  public async saveLocalStorage(localStorageData: Record<string, string>, sourceLang: string, targetLang: string, model: string): Promise<void> {
    const cacheKey = `openai_translation_cache_${sourceLang}_${targetLang}_${model}`;
    
    try {
      // 检查local storage大小并清理
      await this.manageCacheSize(localStorageData);
      
      // 保存更新后的本地存储
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ [cacheKey]: localStorageData }, () => resolve());
      });
      // 简化更新日志
      // console.log(`[TranslationLocalStorage] 更新: ${Object.keys(localStorageData).length} 条`);
    } catch (error) {
      console.debug('[TranslationLocalStorage] ✗ 更新失败:', error);
    }
  }
  
  /**
   * 管理local storage大小，移除最旧的项目
   */
  private async manageCacheSize(localStorageData: Record<string, string>): Promise<void> {
    const localStorageSize = Object.keys(localStorageData).length;
    
    if (localStorageSize > this.MAX_CACHE_ITEMS) {
      // 简化清理日志
      // console.log(`[TranslationLocalStorage] 清理: ${localStorageSize} > ${this.MAX_CACHE_ITEMS}`);
      
      // 获取本地存储键并按创建时间排序（这里简化为按键的字母顺序）
      const keys = Object.keys(localStorageData).sort();
      
      // 计算需要移除的条目数
      const removeCount = localStorageSize - Math.floor(this.MAX_CACHE_ITEMS * 0.8); // 移除20%
      
      // 移除最旧的条目
      const keysToRemove = keys.slice(0, removeCount);
      keysToRemove.forEach(key => {
        delete localStorageData[key];
      });
      
      // 简化移除日志
      // console.log(`[TranslationLocalStorage] 移除: ${removeCount} 条`);
    }
  }
  
  /**
   * 清空特定语言对和模型的本地存储
   */
  public async clearLocalStorage(sourceLang: string, targetLang: string, model: string): Promise<void> {
    const cacheKey = `openai_translation_cache_${sourceLang}_${targetLang}_${model}`;
    
    try {
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove(cacheKey, () => resolve());
      });
      // 注释掉清空日志
      // console.log(`[TranslationLocalStorage] 清空: ${cacheKey}`);
    } catch (error) {
      console.debug('[TranslationLocalStorage] ✗ 清空失败:', error);
    }
  }
  
  /**
   * 获取本地存储统计信息
   */
  public async getLocalStorageStats(): Promise<{
    totalItems: number,
    totalSize: number,
    languagePairs: { [key: string]: number }
  }> {
    try {
      // 获取所有本地存储键
      const storageData = await new Promise<{[key: string]: any}>((resolve) => {
        chrome.storage.local.get(null, (data) => resolve(data));
      });
      
      const stats = {
        totalItems: 0,
        totalSize: 0,
        languagePairs: {} as { [key: string]: number }
      };
      
      // 遍历所有本地存储，计算统计信息
      for (const [key, value] of Object.entries(storageData)) {
        if (key.startsWith('openai_translation_cache_')) {
          const localStorageItems = typeof value === 'object' ? Object.keys(value).length : 0;
          stats.totalItems += localStorageItems;
          
          // 估算大小（粗略计算）
          const localStorageSize = JSON.stringify(value).length;
          stats.totalSize += localStorageSize;
          
          // 提取语言对
          const langPairMatch = key.match(/openai_translation_cache_(.+?)_(.+?)_/);
          if (langPairMatch) {
            const langPair = `${langPairMatch[1]}->${langPairMatch[2]}`;
            stats.languagePairs[langPair] = (stats.languagePairs[langPair] || 0) + localStorageItems;
          }
        }
      }

      return stats;
    } catch (error) {
      console.debug('[TranslationLocalStorage] ✗ 统计失败:', error);
      return {
        totalItems: 0,
        totalSize: 0,
        languagePairs: {}
      };
    }
  }
} 