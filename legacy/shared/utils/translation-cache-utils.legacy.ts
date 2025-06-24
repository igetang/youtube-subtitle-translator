/**
 * @file translation-cache-utils.ts
 * @description TranslationCacheData相关工具函数
 * 基于 architecture.md 7.1.6 TranslationCacheData 设计规范
 */

import { TranslationCacheData } from '../types/storage-types';
import { SimplifiedCaptionTrack } from '../types/subtitle-types';
import { TranslationServiceForStorage } from '../types/user-preferences-types';

/**
 * 生成翻译缓存键
 * 格式: subtitle_translation_cache_${videoId}_${sourceLang}_${targetLang}_${service.type}_${service.model}_${service.temperature}
 * 
 * @param videoId 视频ID
 * @param sourceLang 源语言
 * @param targetLang 目标语言  
 * @param service 翻译服务配置
 * @returns 缓存键字符串
 */
export function generateTranslationCacheKey(
  videoId: string,
  sourceLang: string,
  targetLang: string,
  service: TranslationServiceForStorage
): string {
  const model = service.model || 'null';
  const temperature = service.temperature !== undefined && service.temperature !== null 
    ? service.temperature.toString() 
    : 'null';
  
  return `subtitle_translation_cache_${videoId}_${sourceLang}_${targetLang}_${service.type}_${model}_${temperature}`;
}

/**
 * 计算TranslationCacheData数据完整性hash
 * 基于 architecture.md 7.2.2 设计规范
 * 
 * @param data 翻译缓存数据（不包含dataHash字段）
 * @returns hash字符串
 */
export function calculateTranslationDataHash(data: Omit<TranslationCacheData, 'dataHash'>): string {
  const hashData = {
    videoId: data.videoId,
    sourceLang: data.sourceLang,
    targetLang: data.targetLang,
    translationService: {
      type: data.translationService.type,
      model: data.translationService.model,
      temperature: data.translationService.temperature
    },
    translatedSubtitles: data.translatedSubtitles,
    lastUsed: data.lastUsed
  };
  
  const str = JSON.stringify(hashData);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * 验证TranslationCacheData数据完整性
 * 
 * @param data 翻译缓存数据
 * @returns 验证是否通过
 */
export function validateTranslationCacheData(data: TranslationCacheData): boolean {
  try {
    const calculatedHash = calculateTranslationDataHash(data);
    return calculatedHash === data.dataHash;
  } catch (error) {
    console.error('[TranslationCacheUtils] 验证数据完整性失败:', error);
    return false;
  }
}

/**
 * 创建TranslationCacheData对象
 * 自动计算dataHash，确保数据完整性
 * 
 * @param params 创建参数
 * @returns 完整的TranslationCacheData对象
 */
export function createTranslationCacheData(params: {
  videoId: string;
  sourceLang: string;
  targetLang: string;
  availableSourceLanguages: SimplifiedCaptionTrack[];
  translationService: TranslationServiceForStorage;
  translatedSubtitles: string;
}): TranslationCacheData {
  const baseData = {
    ...params,
    lastUsed: Date.now()
  };
  
  const dataHash = calculateTranslationDataHash(baseData);
  
  return {
    ...baseData,
    dataHash
  };
}

/**
 * 解析翻译缓存键，提取组成部分
 * 
 * @param cacheKey 缓存键
 * @returns 解析结果或null
 */
export function parseTranslationCacheKey(cacheKey: string): {
  videoId: string;
  sourceLang: string;
  targetLang: string;
  serviceType: string;
  model: string;
  temperature: string;
} | null {
  const prefix = 'subtitle_translation_cache_';
  if (!cacheKey.startsWith(prefix)) {
    return null;
  }
  
  const parts = cacheKey.slice(prefix.length).split('_');
  if (parts.length < 6) {
    return null;
  }
  
  return {
    videoId: parts[0],
    sourceLang: parts[1],
    targetLang: parts[2],
    serviceType: parts[3],
    model: parts[4],
    temperature: parts[5]
  };
}

/**
 * 检查翻译缓存是否匹配当前请求
 * 
 * @param cacheData 缓存数据
 * @param videoId 视频ID
 * @param sourceLang 源语言
 * @param targetLang 目标语言
 * @param service 翻译服务配置
 * @returns 是否匹配
 */
export function isTranslationCacheMatch(
  cacheData: TranslationCacheData,
  videoId: string,
  sourceLang: string,
  targetLang: string,
  service: TranslationServiceForStorage
): boolean {
  return (
    cacheData.videoId === videoId &&
    cacheData.sourceLang === sourceLang &&
    cacheData.targetLang === targetLang &&
    cacheData.translationService.type === service.type &&
    cacheData.translationService.model === service.model &&
    cacheData.translationService.temperature === service.temperature
  );
}

/**
 * VTT格式示例生成器（用于测试和文档）
 * 
 * @param subtitles 字幕数组
 * @returns VTT格式字符串
 */
export function generateVTTExample(subtitles: Array<{
  start: string;
  end: string;
  text: string;
}>): string {
  let vtt = 'WEBVTT\n\n';
  
  subtitles.forEach(subtitle => {
    vtt += `${subtitle.start} --> ${subtitle.end}\n`;
    vtt += `${subtitle.text}\n\n`;
  });
  
  return vtt;
}

/**
 * 翻译缓存数据示例（用于测试和文档）
 */
export const TRANSLATION_CACHE_DATA_EXAMPLE: TranslationCacheData = {
  videoId: "abc123",
  sourceLang: "en",
  targetLang: "zh-CN",
  availableSourceLanguages: [
    {
      baseUrl: "https://www.youtube.com/api/timedtext?v=XJ63hB8wOP...",
      languageCode: "de", 
      name: "德语",
      kind: undefined
    },
    {
      baseUrl: "https://www.youtube.com/api/timedtext?v=XJ63hB8wOP...",
      languageCode: "fr",
      name: "法语", 
      kind: undefined
    },
    {
      baseUrl: "https://www.youtube.com/api/timedtext?v=XJ63hB8wOP...",
      languageCode: "en",
      name: "English",
      kind: "asr"
    }
  ],
  translationService: {
    type: 'openai' as any,
    name: "OpenAI GPT-4",
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 4096,
    rpm: 3500,
    tpm: 40000
  },
  translatedSubtitles: `WEBVTT

00:00:01.000 --> 00:00:03.000
大家好，欢迎来到我的频道

00:00:04.000 --> 00:00:06.000
今天我们将讨论人工智能的发展`,
  lastUsed: 1640995200000,
  dataHash: "a1b2c3d4e5f6"
}; 