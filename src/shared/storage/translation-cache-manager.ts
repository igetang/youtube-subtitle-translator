// import { logger } from '../utils/logger';
import type { TranslationCacheData } from '../types/storage-types';
import type { TranslationServiceForCacheKey } from '../types/user-preferences-types';

const CACHE_KEY_PREFIX = 'subtitle_translation_cache_';
const MAX_CACHE_ENTRIES = 50;

/**
 * @class TranslationCacheManager
 * @description Manages the translation cache in chrome.storage.local.
 * Follows the design in architecture.md 7.1.6.
 * - Storage: chrome.storage.local
 * - Key Format: subtitle_translation_cache_${videoId}_${sourceLang}_${targetLang}_${service.type}_${service.model}_${service.temperature}
 * - Cache Policy: LRU
 */
export class TranslationCacheManager {
  private static instance: TranslationCacheManager;

  private constructor() {
    // logger.log('[translation-cache-manager] Initialized');
    console.log('[translation-cache-manager] Initialized');
  }

  /**
   * Returns the singleton instance of the TranslationCacheManager.
   * @returns {TranslationCacheManager} The singleton instance.
   */
  public static getInstance(): TranslationCacheManager {
    if (!TranslationCacheManager.instance) {
      TranslationCacheManager.instance = new TranslationCacheManager();
    }
    return TranslationCacheManager.instance;
  }

  /**
   * Calculates a hash for the translation data to ensure integrity.
   * @private
   * @param {Omit<TranslationCacheData, 'dataHash'>} data - The data to hash.
   * @returns {string} The calculated hash.
   */
  private _calculateDataHash(data: Omit<TranslationCacheData, 'dataHash'>): string {
    const hashData = {
      videoId: data.videoId,
      sourceLang: data.sourceLang,
      targetLang: data.targetLang,
      translationService: {
        type: data.translationService.type,
        model: data.translationService.model,
        temperature: data.translationService.temperature,
      },
      translatedSubtitles: data.translatedSubtitles,
    };

    const str = JSON.stringify(hashData);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Validates the integrity of the cached data using its hash.
   * @private
   * @param {TranslationCacheData} data - The cached data to validate.
   * @returns {boolean} True if the data is valid, false otherwise.
   */
  private _validateData(data: TranslationCacheData): boolean {
    if (!data.dataHash) {
      console.warn('[translation-cache-manager] Cache item has no hash, validation skipped.', data);
      return true; // For backward compatibility with items that have no hash
    }
    const expectedHash = this._calculateDataHash(data);
    const isValid = expectedHash === data.dataHash;
    if (!isValid) {
      console.warn('[translation-cache-manager] Cache data integrity check failed.', {
        data,
        expectedHash,
      });
    }
    return isValid;
  }

  /**
   * Generates a cache key based on the provided parameters.
   * @private
   * @param {string} videoId - The ID of the video.
   * @param {string} sourceLang - The source language.
   * @param {string} targetLang - The target language.
   * @param {TranslationServiceForCacheKey} service - The translation service configuration.
   * @returns {string} The generated cache key.
   */
  private _getCacheKey(
    videoId: string,
    sourceLang: string,
    targetLang: string,
    service: TranslationServiceForCacheKey,
  ): string {
    const servicePart = `${service.type}_${service.model || 'default'}_${service.temperature || 'default'}`;
    return `${CACHE_KEY_PREFIX}${videoId}_${sourceLang}_${targetLang}_${servicePart}`;
  }

  /**
   * Retrieves a translation from the cache.
   * Updates the `lastUsed` timestamp if an item is found.
   * @param {string} videoId - The ID of the video.
   * @param {string} sourceLang - The source language.
   * @param {string} targetLang - The target language.
   * @param {TranslationServiceForCacheKey} service - The translation service configuration.
   * @returns {Promise<TranslationCacheData | null>} The cached data or null if not found.
   */
  public async get(
    videoId: string,
    sourceLang: string,
    targetLang: string,
    service: TranslationServiceForCacheKey,
  ): Promise<TranslationCacheData | null> {
    const key = this._getCacheKey(videoId, sourceLang, targetLang, service);
    try {
      const result = await chrome.storage.local.get(key);
      if (result[key]) {
        console.log(`[translation-cache-manager] ✓ get: cache hit`);
        const data = result[key] as TranslationCacheData;

        if (!this._validateData(data)) {
          console.log(`[translation-cache-manager] ✗ get: invalid cache data, deleting`);
          // Don't await, just fire and forget
          chrome.storage.local.remove(key);
          return null;
        }

        // Update lastUsed timestamp without awaiting
        this._updateLastUsed(key, data);
        return data;
      }
      // logger.log(`[translation-cache-manager] Cache miss for key: ${key}`);
      console.log(`[translation-cache-manager] get: cache miss`);
      return null;
    } catch (error) {
      // logger.error('[translation-cache-manager] Error getting cache item:', error);
      console.error('[translation-cache-manager] ✗ get:', error);
      return null;
    }
  }

  /**
   * Updates the lastUsed timestamp of a cache item.
   * @private
   * @param {string} key - The cache key.
   * @param {TranslationCacheData} data - The cache data.
   */
  private async _updateLastUsed(key: string, data: TranslationCacheData): Promise<void> {
    const updatedData = { ...data, lastUsed: Date.now() };
    try {
      await chrome.storage.local.set({ [key]: updatedData });
    } catch (error) {
      // logger.error(`[translation-cache-manager] Failed to update lastUsed for key ${key}:`, error);
      console.error(`[translation-cache-manager] ✗ _updateLastUsed:`, error);
    }
  }

  /**
   * Stores a translation in the cache.
   * Enforces the LRU cache policy.
   * @param {TranslationCacheData} data - The data to store.
   * @returns {Promise<void>}
   */
  public async set(data: TranslationCacheData): Promise<void> {
    const serviceKeyParams: TranslationServiceForCacheKey = {
      type: data.translationService.type,
      model: data.translationService.model,
      temperature: data.translationService.temperature,
    };
    const key = this._getCacheKey(data.videoId, data.sourceLang, data.targetLang, serviceKeyParams);
    
    // Ensure lastUsed is set, and calculate hash before storing
    const dataToStore: TranslationCacheData = {
      ...data,
      lastUsed: Date.now(),
      dataHash: '', // placeholder
    };
    dataToStore.dataHash = this._calculateDataHash(dataToStore);

    try {
      await this._enforceLruPolicy();
      await chrome.storage.local.set({ [key]: dataToStore });
      console.log(`[translation-cache-manager] ✓ set: cached`);
    } catch (error) {
      // logger.error('[translation-cache-manager] Error setting cache item:', error);
      console.error('[translation-cache-manager] ✗ set:', error);
    }
  }

  /**
   * Enforces the LRU cache policy by removing the least recently used items
   * if the cache size exceeds the maximum limit.
   * @private
   */
  private async _enforceLruPolicy(): Promise<void> {
    try {
      const allItems = await chrome.storage.local.get(null);
      const cacheEntries = Object.entries(allItems)
        .filter(([key]) => key.startsWith(CACHE_KEY_PREFIX))
        .map(([key, value]) => ({ key, lastUsed: (value as TranslationCacheData).lastUsed || 0 }));

      if (cacheEntries.length >= MAX_CACHE_ENTRIES) {
        // logger.log('[translation-cache-manager] Cache limit reached, enforcing LRU policy.');
        console.log('[translation-cache-manager] 缓存限制，执行LRU策略');
        cacheEntries.sort((a, b) => a.lastUsed - b.lastUsed);
        
        const itemsToRemoveCount = cacheEntries.length - MAX_CACHE_ENTRIES + 1;
        const keysToRemove = cacheEntries.slice(0, itemsToRemoveCount).map(entry => entry.key);

        if (keysToRemove.length > 0) {
          // logger.log('[translation-cache-manager] Removing keys:', keysToRemove);
          console.log('[translation-cache-manager] 移除过期缓存:', keysToRemove.length);
          await chrome.storage.local.remove(keysToRemove);
        }
      }
    } catch (error) {
      // logger.error('[translation-cache-manager] Error enforcing LRU policy:', error);
      console.error('[translation-cache-manager] ✗ _enforceLruPolicy:', error);
    }
  }

  /**
   * Clears the entire translation cache.
   * @returns {Promise<void>}
   */
  public async clear(): Promise<void> {
    try {
      const allItems = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allItems).filter(key => key.startsWith(CACHE_KEY_PREFIX));
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        // logger.log(`[translation-cache-manager] Cleared ${keysToRemove.length} cache items.`);
        console.log(`[translation-cache-manager] ✓ clear: 清理${keysToRemove.length}个缓存`);
      } else {
        // logger.log('[translation-cache-manager] Cache is already empty.');
        console.log('[translation-cache-manager] clear: 缓存已为空');
      }
    } catch (error) {
      // logger.error('[translation-cache-manager] Error clearing cache:', error);
      console.error('[translation-cache-manager] ✗ clear:', error);
    }
  }
} 