/**
 * @file subtitle-overlay.ts
 * @description YouTube字幕显示层 - 负责在视频上方显示翻译后的字幕
 */

import type { TranslationCacheData } from '../shared/types/storage-types';

export interface SubtitleEntry {
  start: number;      // 开始时间（秒）
  duration: number;   // 持续时间（秒）
  text: string;       // 原文
  translation?: string; // 译文
}

/**
 * 字幕显示层管理器
 */
export class SubtitleOverlay {
  private overlayElement: HTMLDivElement | null = null;
  private subtitleContainer: HTMLDivElement | null = null;
  private currentSubtitles: SubtitleEntry[] = [];
  private videoElement: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private isActive: boolean = false;
  private currentLanguageMode: 'bilingual' | 'targetOnly' = 'bilingual';
  
  constructor() {
    console.log('[SubtitleOverlay] 初始化字幕显示层');
  }
  
  /**
   * 初始化字幕显示层
   */
  public initialize(): void {
    // 查找视频元素
    this.videoElement = document.querySelector('video');
    if (!this.videoElement) {
      console.error('[SubtitleOverlay] 未找到视频元素');
      return;
    }
    
    // 创建字幕覆盖层
    this.createOverlay();
    
    // 开始监听视频播放
    this.startTimeUpdate();
  }
  
  /**
   * 创建字幕覆盖层DOM结构
   */
  private createOverlay(): void {
    // 如果已存在则先删除
    if (this.overlayElement) {
      this.overlayElement.remove();
    }
    
    // 创建覆盖层容器
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'youtube-subtitle-overlay';
    this.overlayElement.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2100;
      pointer-events: none;
      width: 90%;
      max-width: 800px;
      text-align: center;
    `;
    
    // 创建字幕容器
    this.subtitleContainer = document.createElement('div');
    this.subtitleContainer.id = 'subtitle-container';
    this.subtitleContainer.style.cssText = `
      background: rgba(0, 0, 0, 0.75);
      padding: 8px 16px;
      border-radius: 4px;
      display: none;
      backdrop-filter: blur(2px);
    `;
    
    this.overlayElement.appendChild(this.subtitleContainer);
    
    // 将覆盖层添加到视频容器
    const videoContainer = this.videoElement?.closest('#movie_player, .html5-video-player');
    if (videoContainer) {
      videoContainer.appendChild(this.overlayElement);
      console.log('[SubtitleOverlay] 字幕覆盖层已创建');
    } else {
      console.error('[SubtitleOverlay] 未找到视频容器');
    }
  }
  
  /**
   * 显示翻译后的字幕
   */
  public show(translationData: TranslationCacheData): void {
    console.log('[SubtitleOverlay] 显示翻译字幕，数据条数:', translationData.translatedSubtitles?.length);
    
    if (!translationData.translatedSubtitles || translationData.translatedSubtitles.length === 0) {
      console.warn('[SubtitleOverlay] 没有可显示的翻译字幕');
      return;
    }
    
    // 转换字幕格式
    this.currentSubtitles = translationData.translatedSubtitles.map(item => ({
      start: item.start,
      duration: item.duration,
      text: item.text,
      translation: item.translation
    }));
    
    // 设置显示模式
    this.currentLanguageMode = translationData.subtitleMode === 'targetOnly' ? 'targetOnly' : 'bilingual';
    
    this.isActive = true;
    
    // 确保覆盖层存在
    if (!this.overlayElement) {
      this.initialize();
    }
    
    console.log('[SubtitleOverlay] 字幕数据已加载，开始显示');
  }
  
  /**
   * 隐藏字幕
   */
  public hide(): void {
    console.log('[SubtitleOverlay] 隐藏字幕');
    this.isActive = false;
    if (this.subtitleContainer) {
      this.subtitleContainer.style.display = 'none';
    }
    this.currentSubtitles = [];
  }
  
  /**
   * 开始时间更新循环
   */
  private startTimeUpdate(): void {
    const updateSubtitle = () => {
      if (this.isActive && this.videoElement) {
        const currentTime = this.videoElement.currentTime;
        this.updateSubtitleDisplay(currentTime);
      }
      this.animationFrameId = requestAnimationFrame(updateSubtitle);
    };
    
    updateSubtitle();
  }
  
  /**
   * 根据当前时间更新字幕显示
   */
  private updateSubtitleDisplay(currentTime: number): void {
    if (!this.subtitleContainer) return;
    
    // 查找当前应该显示的字幕
    const currentSubtitle = this.currentSubtitles.find(subtitle => {
      const endTime = subtitle.start + subtitle.duration;
      return currentTime >= subtitle.start && currentTime < endTime;
    });
    
    if (currentSubtitle) {
      // 根据显示模式构建字幕HTML
      let subtitleHTML = '';
      
      if (this.currentLanguageMode === 'bilingual') {
        // 双语模式：显示原文和译文
        subtitleHTML = `
          <div style="color: #ffffff; font-size: 20px; line-height: 1.4; margin-bottom: 4px;">
            ${this.escapeHtml(currentSubtitle.text)}
          </div>
          <div style="color: #ffeb3b; font-size: 22px; line-height: 1.4; font-weight: 500;">
            ${this.escapeHtml(currentSubtitle.translation || currentSubtitle.text)}
          </div>
        `;
      } else {
        // 仅目标语言模式
        subtitleHTML = `
          <div style="color: #ffffff; font-size: 22px; line-height: 1.4; font-weight: 500;">
            ${this.escapeHtml(currentSubtitle.translation || currentSubtitle.text)}
          </div>
        `;
      }
      
      this.subtitleContainer.innerHTML = subtitleHTML;
      this.subtitleContainer.style.display = 'block';
    } else {
      // 没有字幕需要显示
      this.subtitleContainer.style.display = 'none';
    }
  }
  
  /**
   * HTML转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * 更新显示模式
   */
  public updateDisplayMode(mode: 'bilingual' | 'targetOnly'): void {
    this.currentLanguageMode = mode;
    console.log('[SubtitleOverlay] 更新显示模式:', mode);
  }
  
  /**
   * 销毁字幕层
   */
  public destroy(): void {
    console.log('[SubtitleOverlay] 销毁字幕层');
    
    // 停止动画循环
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // 移除DOM元素
    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = null;
    }
    
    this.subtitleContainer = null;
    this.videoElement = null;
    this.currentSubtitles = [];
    this.isActive = false;
  }
  
  /**
   * 调整字幕位置（响应全屏等变化）
   */
  public adjustPosition(): void {
    if (!this.overlayElement || !this.videoElement) return;
    
    // 检查是否全屏
    const isFullscreen = document.fullscreenElement || 
                        (document as any).webkitFullscreenElement || 
                        (document as any).mozFullScreenElement;
    
    if (isFullscreen) {
      // 全屏模式下调整位置
      this.overlayElement.style.bottom = '120px';
    } else {
      // 正常模式
      this.overlayElement.style.bottom = '80px';
    }
  }
}

// 导出单例
export const subtitleOverlay = new SubtitleOverlay();