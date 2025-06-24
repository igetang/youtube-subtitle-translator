/**
 * @file src/shared/types/index.ts
 * @description 类型定义的统一出口
 */

export * from './component-types';
export * from './core-types';
export * from './message-types';
export * from './runtime-state-types';
export * from './storage-types';
export * from './subtitle-types';
export * from './user-preferences-types';
// Note: youtube-types has SubtitleTrack conflict with core-types
export type { 
  CaptionTrack
} from './youtube-types';
export * from './types'; 