/**
 * @file youtube-types.ts
 * @description YouTube 相关的核心数据类型定义
 */

import { LanguageCode } from './core-types';

/**
 * YouTube 字幕轨道信息 (权威定义)
 * 
 * 此接口统一了项目中所有关于字幕轨道的数据结构，
 * 替代了 background/service-worker.ts 和其他地方的隐式定义。
 */
export interface CaptionTrack {
  /** 
   * 字幕轨道的 vssId，用于生成字幕数据URL
   * @example ".en" or "a.en"
   */
  vssId: string;
  
  /** 字幕文件的基础URL */
  baseUrl: string;
  
  /** 轨道名称信息 */
  name: {
    simpleText: string;
  };
  
  /** 语言代码 (BCP-47) */
  languageCode: LanguageCode;
  
  /** 是否可被翻译 */
  isTranslatable: boolean;
  
  /** 
   * 轨道类型
   * 'asr' = 自动语音识别 (auto-generated)
   * 'forced' = 强制字幕
   * 'auto' = 自动生成 (YouTube 使用)
   * undefined = 用户上传的正常字幕
   */
  kind?: 'asr' | 'forced' | 'auto';
}

/**
 * @interface SubtitleTrack
 * @description 应用内部标准的字幕轨道数据结构，符合 architecture.md 规范。
 *              此接口用于解耦系统与YouTube的具体API响应。
 */
export interface SubtitleTrack {
  /** 语言代码 (BCP-47) */
  languageCode: string;
  /** 用于UI显示的语言名称 */
  languageName: string;
  /** 获取字幕内容的完整 URL */
  baseUrl: string;
  /** 
   * 轨道类型
   * 'asr' = 自动语音识别
   * undefined = 正常字幕
   */
  kind?: string;
} 