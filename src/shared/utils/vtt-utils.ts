/**
 * VTT (WebVTT) 格式工具模块
 * 提供VTT格式字符串与字幕数组之间的转换功能
 */

import { SubtitleEvent } from '../types/core-types';

/**
 * 字幕条目接口（扩展版，包含翻译）
 */
export interface SubtitleEntry {
  start: number;
  duration: number;
  text: string;
  translation?: string;
  id?: string;
  isUrgent?: boolean;
}

/**
 * 将字幕数组转换为VTT格式字符串
 * @param subtitles 字幕事件数组
 * @param translations 翻译结果对象（可选）
 * @returns VTT格式字符串
 */
export function createVttString(
  subtitles: SubtitleEvent[],
  translations?: Record<string, string> | null
): string {
  let vtt = 'WEBVTT\n\n';

  subtitles.forEach(event => {
    if (!event.id && event.start === undefined) return;

    const formatTime = (time: number) => {
      const hours = Math.floor(time / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((time % 3600) / 60).toString().padStart(2, '0');
      const seconds = Math.floor(time % 60).toString().padStart(2, '0');
      const milliseconds = Math.round((time - Math.floor(time)) * 1000).toString().padStart(3, '0');
      return `${hours}:${minutes}:${seconds}.${milliseconds}`;
    };

    const end = event.start + event.duration;
    const translatedText = translations && event.id ? translations[event.id] : null;
    const finalText = translatedText ?? event.text ?? '';

    vtt += `${formatTime(event.start)} --> ${formatTime(end)}\n`;
    vtt += `${finalText.replace(/\n/g, ' ')}\n\n`;
  });

  return vtt;
}

/**
 * 将VTT格式字符串解析为字幕数组
 * @param vttString VTT格式字符串
 * @param includeTranslation 是否将文本作为翻译（用于翻译后的VTT）
 * @returns 字幕条目数组
 */
export function parseVttString(
  vttString: string,
  includeTranslation: boolean = false
): SubtitleEntry[] {
  // 类型保护：确保输入是字符串
  if (!vttString || typeof vttString !== 'string') {
    console.warn('[vtt-utils] parseVttString: 输入不是有效的字符串', vttString);
    return [];
  }

  const lines = vttString.split('\n');
  const subtitles: SubtitleEntry[] = [];
  let i = 0;

  // 跳过WEBVTT头部
  while(i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  // 解析每个字幕条目
  while(i < lines.length) {
    // 找到时间戳行
    while(i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    if (i >= lines.length) break;

    const timeLine = lines[i];
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);

    if (!timeMatch) {
      i++;
      continue;
    }

    // 解析时间
    const parseTime = (timeStr: string): number => {
      const parts = timeStr.split(':');
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const secondsParts = parts[2].split('.');
      const seconds = parseInt(secondsParts[0], 10);
      const milliseconds = parseInt(secondsParts[1], 10);
      return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    };

    const start = parseTime(timeMatch[1]);
    const end = parseTime(timeMatch[2]);
    const duration = end - start;

    i++;

    // 获取文本内容
    let text = '';
    while(i < lines.length && lines[i].trim() !== '') {
      text += (text ? '\n' : '') + lines[i];
      i++;
    }

    if (text.trim()) {
      const entry: SubtitleEntry = {
        start,
        duration,
        text: includeTranslation ? '' : text.trim(),
        id: String(start)
      };

      if (includeTranslation) {
        entry.translation = text.trim();
      }

      subtitles.push(entry);
    }

    i++;
  }

  return subtitles;
}

/**
 * 将原始字幕VTT和翻译字幕VTT合并为带翻译的字幕数组
 * @param originalVtt 原始字幕VTT字符串
 * @param translatedVtt 翻译字幕VTT字符串
 * @returns 合并后的字幕条目数组
 */
export function mergeVttStrings(
  originalVtt: string,
  translatedVtt: string
): SubtitleEntry[] {
  const originals = parseVttString(originalVtt, false);
  const translations = parseVttString(translatedVtt, true);

  // 创建翻译映射
  const translationMap = new Map<number, string>();
  translations.forEach(item => {
    if (item.translation) {
      translationMap.set(item.start, item.translation);
    }
  });

  // 合并原始字幕和翻译
  return originals.map(original => ({
    ...original,
    translation: translationMap.get(original.start) || original.text
  }));
}

/**
 * 合并原始字幕和翻译字幕数组
 * @param originals 原始字幕数组
 * @param translations 翻译字幕数组
 * @returns 合并后的字幕数组
 */
export function mergeSubtitles(
  originals: SubtitleEntry[],
  translations: SubtitleEntry[]
): SubtitleEntry[] {
  // 创建翻译映射
  const translationMap = new Map<number, string>();
  translations.forEach(item => {
    if (item.translation) {
      translationMap.set(item.start, item.translation);
    }
  });

  // 合并原始字幕和翻译
  return originals.map(original => ({
    ...original,
    translation: translationMap.get(original.start) || original.text
  }));
}

/**
 * 验证VTT格式字符串是否有效
 * @param vttString VTT格式字符串
 * @returns 是否为有效的VTT格式
 */
export function isValidVttString(vttString: string): boolean {
  if (!vttString || typeof vttString !== 'string') {
    return false;
  }

  // 必须以WEBVTT开头
  if (!vttString.trim().startsWith('WEBVTT')) {
    return false;
  }

  // 必须包含至少一个时间戳
  return vttString.includes('-->');
}

/**
 * 从缓存数据中提取原始字幕数组
 * 用于从VTT格式恢复到数组格式
 * @param vttString 原始字幕VTT字符串
 * @returns 字幕事件数组
 */
export function extractOriginalSubtitles(vttString: string): SubtitleEvent[] {
  const entries = parseVttString(vttString, false);
  return entries.map(entry => ({
    start: entry.start,
    duration: entry.duration,
    text: entry.text,
    id: entry.id
  }));
}

/**
 * 从缓存数据中提取翻译后的字幕数组
 * @param originalVtt 原始字幕VTT字符串
 * @param translatedVtt 翻译字幕VTT字符串
 * @returns 包含原文和翻译的字幕条目数组
 */
export function extractTranslatedSubtitles(
  originalVtt: string | any,
  translatedVtt: string | any
): SubtitleEntry[] {
  // 处理旧缓存格式兼容性问题
  // 如果输入已经是数组，说明是旧格式，直接返回
  if (Array.isArray(translatedVtt)) {
    console.warn('[vtt-utils] 检测到旧缓存格式（数组），直接返回');
    return translatedVtt as SubtitleEntry[];
  }

  // 如果任一参数不是字符串，返回空数组
  if (typeof originalVtt !== 'string' || typeof translatedVtt !== 'string') {
    console.warn('[vtt-utils] extractTranslatedSubtitles: 输入格式无效', {
      originalVtt: typeof originalVtt,
      translatedVtt: typeof translatedVtt
    });
    return [];
  }

  return mergeVttStrings(originalVtt, translatedVtt);
}