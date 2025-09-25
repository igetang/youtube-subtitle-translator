/**
 * @file subtitle-overlay.ts
 * @description YouTube字幕显示层 - 负责在视频上方显示翻译后的字幕
 */

import type { TranslationCacheData } from '../shared/types/storage-types';
import { UserPreferencesManager } from '../shared/storage';
import { SubtitleMode, UserPreferenceChangeEvent } from '../shared/types/user-preferences-types';
import { parseVttString, mergeSubtitles } from '../shared/utils/vtt-utils';

export interface SubtitleEntry {
  start: number;      // 开始时间（秒）
  duration: number;   // 持续时间（秒）
  text: string;       // 原文
  translation?: string; // 译文
  isUrgent?: boolean; // 是否为紧急翻译
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
  private userPreferencesManager: UserPreferencesManager;
  private isUrgentTranslation: boolean = false;

  // 响应式字幕相关属性
  private playerObserver: ResizeObserver | null = null;
  private playerElement: HTMLElement | null = null;

  constructor() {
    console.log('[SubtitleOverlay] 初始化字幕显示层');
    this.userPreferencesManager = UserPreferencesManager.getInstance();
    this.initializePreferencesListener();
  }

  /**
   * 初始化用户偏好监听器
   */
  private async initializePreferencesListener(): Promise<void> {
    // 初始化UserPreferencesManager
    await this.userPreferencesManager.initialize();

    // 监听字幕模式变化，实现实时切换
    this.userPreferencesManager.addChangeListener(
      UserPreferenceChangeEvent.SUBTITLE_MODE_CHANGED,
      async (newMode: SubtitleMode) => {
        console.log('[SubtitleOverlay] 字幕模式变更为:', newMode);
        this.updateDisplayMode(newMode === SubtitleMode.BILINGUAL ? 'bilingual' : 'targetOnly');
        // 立即刷新当前显示的字幕
        if (this.isActive) {
          this.forceUpdateDisplay();
        }
      }
    );
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

    // 查找播放器元素
    this.findPlayerElement();

    // 创建字幕覆盖层
    this.createOverlay();

    // 设置响应式监听
    this.setupResponsiveObserver();

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
    // 初始化默认值
    const defaultWidth = 1280;
    const defaultFontSize = defaultWidth * 0.025;  // 32px
    const defaultFontSizeSmall = defaultWidth * 0.0225;  // 28.8px

    this.overlayElement.style.cssText = `
      position: absolute;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2100;
      pointer-events: none;
      width: 90%;
      text-align: center;
      --subtitle-base-ratio: 2.5;
      --subtitle-min-size: 10px;       /* 降低最小值，允许更小的字体 */
      --subtitle-max-size: 48px;
      --player-width: ${defaultWidth};  /* 播放器宽度，将被动态更新 */
      --calculated-font-size: ${defaultFontSize}px;  /* 预计算的主字体大小 */
      --calculated-font-size-small: ${defaultFontSizeSmall}px;  /* 预计算的小字体大小 */
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
   * 显示翻译后的字幕 - 智能识别输入格式
   */
  public async show(translationData: any): Promise<void> {
    console.log('[SubtitleOverlay] 显示翻译字幕');

    try {
      // 智能识别输入格式
      // 情况1: 直接传入数组（纯数组格式）
      if (Array.isArray(translationData)) {
        console.log('[SubtitleOverlay] 输入格式: 纯数组');
        this.currentSubtitles = translationData;
      }
      // 情况2: V4架构当前格式（translatedSubtitles是数组）
      else if (translationData.translatedSubtitles && Array.isArray(translationData.translatedSubtitles)) {
        console.log('[SubtitleOverlay] 输入格式: V4架构数组格式');
        this.currentSubtitles = translationData.translatedSubtitles;
      }
      // 情况3: 缓存格式（VTT字符串）
      else if (translationData.translatedSubtitles && typeof translationData.translatedSubtitles === 'string') {
        console.log('[SubtitleOverlay] 输入格式: VTT字符串格式');

        if (!translationData.originalSubtitles) {
          console.warn('[SubtitleOverlay] 缺少原始字幕');
          return;
        }

        // 解析VTT格式
        const originalSubtitles = parseVttString(translationData.originalSubtitles);
        const translatedSubtitles = parseVttString(translationData.translatedSubtitles, true);

        // 合并原文和译文
        this.currentSubtitles = mergeSubtitles(originalSubtitles, translatedSubtitles);
      }
      // 无法识别的格式
      else {
        console.error('[SubtitleOverlay] 无法识别的数据格式:', translationData);
        return;
      }

      console.log('[SubtitleOverlay] 解析后的字幕条数:', this.currentSubtitles.length);

      // 从用户偏好读取显示模式
      const userPrefs = await this.userPreferencesManager.getUserPreferences();
      this.currentLanguageMode = userPrefs.subtitleMode === SubtitleMode.BILINGUAL ? 'bilingual' : 'targetOnly';
      console.log('[SubtitleOverlay] 使用字幕模式:', this.currentLanguageMode);

      this.isActive = true;

      // 确保覆盖层存在
      if (!this.overlayElement) {
        this.initialize();
      }

      // 确保覆盖层可见（修复视频切换后的显示问题）
      if (this.overlayElement) {
        this.overlayElement.style.display = '';
      }

      console.log('[SubtitleOverlay] 字幕数据已加载，开始显示');
    } catch (error) {
      console.error('[SubtitleOverlay] 显示字幕失败:', error);
    }
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
    // 同时隐藏外层overlay（与show/updateTranslations的显示逻辑对应）
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
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

      // 根据是否为紧急翻译决定译文颜色
      // 紧急翻译：黄色高亮 (#ffeb3b) - 保持原有样式
      // 批量翻译：与原文相同的白色 (#ffffff) - 新的样式
      const translationColor = currentSubtitle.isUrgent ? '#ffeb3b' : '#ffffff';

      if (this.currentLanguageMode === 'bilingual') {
        // 双语模式：显示原文和译文
        // 使用预计算的响应式字体大小（精确匹配YouTube）
        subtitleHTML = `
          <div class="subtitle-original" style="color: #ffffff; font-size: var(--calculated-font-size-small); line-height: 1.4; margin-bottom: 4px;">
            ${this.escapeHtml(currentSubtitle.text)}
          </div>
          <div class="subtitle-translation" style="color: ${translationColor}; font-size: var(--calculated-font-size); line-height: 1.4; font-weight: 500;">
            ${this.escapeHtml(currentSubtitle.translation || currentSubtitle.text)}
          </div>
        `;
      } else {
        // 仅目标语言模式
        // 使用预计算的响应式字体大小（精确匹配YouTube）
        subtitleHTML = `
          <div class="subtitle-translation" style="color: ${translationColor}; font-size: var(--calculated-font-size); line-height: 1.4; font-weight: 500;">
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
   * 强制刷新当前显示的字幕
   * 用于字幕模式切换时立即更新显示
   */
  private forceUpdateDisplay(): void {
    if (!this.videoElement || !this.subtitleContainer || !this.isActive) {
      return;
    }

    const currentTime = this.videoElement.currentTime;

    // 找到当前时间对应的字幕
    const currentSubtitle = this.currentSubtitles.find(subtitle => {
      const end = subtitle.start + subtitle.duration;
      return currentTime >= subtitle.start && currentTime < end;
    });

    if (currentSubtitle) {
      // 构建字幕HTML
      let subtitleHTML = '';

      if (this.currentLanguageMode === 'bilingual') {
        // 双语模式：显示原文和译文
        subtitleHTML = `
          <div style="color: #ffffff; font-size: var(--calculated-font-size-small); line-height: 1.4; margin-bottom: 4px;">
            ${this.escapeHtml(currentSubtitle.text)}
          </div>
          <div style="color: #ffffff; font-size: var(--calculated-font-size); line-height: 1.4; font-weight: 500;">
            ${this.escapeHtml(currentSubtitle.translation || currentSubtitle.text)}
          </div>
        `;
      } else {
        // 仅目标语言模式：只显示译文
        subtitleHTML = `
          <div style="color: #ffffff; font-size: var(--calculated-font-size); line-height: 1.4; font-weight: 500;">
            ${this.escapeHtml(currentSubtitle.translation || currentSubtitle.text)}
          </div>
        `;
      }

      // 更新显示
      this.subtitleContainer.innerHTML = subtitleHTML;
      this.subtitleContainer.style.display = 'block';
    } else {
      // 当前时间没有字幕，隐藏容器
      this.subtitleContainer.style.display = 'none';
    }
  }
  
  /**
   * 更新翻译（渐进式）
   * @param translatedSubtitles 翻译后的字幕数组
   * @param replaceAll 是否替换所有字幕（true用于紧急翻译，false用于渐进式更新）
   */
  public async updateTranslations(translatedSubtitles: SubtitleEntry[], replaceAll: boolean = false): Promise<void> {
    if (!translatedSubtitles || translatedSubtitles.length === 0) {
      return;
    }

    // 确保覆盖层已初始化
    if (!this.overlayElement) {
      this.initialize();
    }

    // 激活字幕显示
    this.isActive = true;

    // 确保覆盖层可见（修复视频切换后的显示问题）
    if (this.overlayElement) {
      this.overlayElement.style.display = '';
    }

    // 同步读取最新的用户字幕模式设置
    const userPrefs = await this.userPreferencesManager.getUserPreferences();
    this.currentLanguageMode = userPrefs.subtitleMode === SubtitleMode.BILINGUAL ? 'bilingual' : 'targetOnly';
    console.log('[SubtitleOverlay] 更新翻译时字幕模式:', this.currentLanguageMode);

    if (replaceAll) {
      // 完全替换模式：用于紧急翻译和批量翻译
      // 根据字幕中的isUrgent标记判断是否为紧急翻译
      const hasUrgentMark = translatedSubtitles.some(sub => sub.isUrgent === true);

      if (hasUrgentMark) {
        // 紧急翻译：保持黄色标记
        this.currentSubtitles = translatedSubtitles.map(sub => ({
          ...sub,
          isUrgent: true
        }));
        this.isUrgentTranslation = true;
      } else {
        // 批量翻译：全部标记为白色
        this.currentSubtitles = translatedSubtitles.map(sub => ({
          ...sub,
          isUrgent: false
        }));
        this.isUrgentTranslation = false;
      }
    } else {
      // 渐进式更新：合并新翻译
      this.isUrgentTranslation = false; // 标记为最终翻译
      
      // 创建一个Map用于快速查找
      const translationMap = new Map<number, SubtitleEntry>();
      translatedSubtitles.forEach((sub) => {
        // 使用start时间作为唯一标识
        const key = sub.start || (sub as any).startTime || 0;
        translationMap.set(key, sub);
      });
      
      // 更新现有字幕或添加新字幕
      this.currentSubtitles = this.currentSubtitles.map(existingSub => {
        const key = existingSub.start || (existingSub as any).startTime || 0;
        const updatedSub = translationMap.get(key);
        if (updatedSub) {
          // 最终翻译，移除紧急标记
          return { ...updatedSub, isUrgent: false };
        }
        return existingSub;
      });
      
      // 添加完全新的字幕（如果有）
      translatedSubtitles.forEach(sub => {
        const key = sub.start || (sub as any).startTime || 0;
        const exists = this.currentSubtitles.some(s => 
          (s.start || (s as any).startTime || 0) === key
        );
        if (!exists) {
          this.currentSubtitles.push(sub);
        }
      });
      
      // 按时间排序
      this.currentSubtitles.sort((a, b) => {
        const aStart = a.start || (a as any).startTime || 0;
        const bStart = b.start || (b as any).startTime || 0;
        return aStart - bStart;
      });
    }
    
    // 触发显示更新（使用当前时间）
    if (this.videoElement) {
      this.updateSubtitleDisplay(this.videoElement.currentTime);
    }
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
      this.overlayElement.style.bottom = '180px';
    } else {
      // 正常模式
      this.overlayElement.style.bottom = '140px';
    }
  }

  /**
   * 显示PENDING状态消息
   * 用于源语言切换等需要重新加载的场景
   */
  public showPendingMessage(message: string): void {
    if (!this.subtitleContainer) {
      // 如果容器不存在，先初始化
      this.initialize();
    }

    if (this.subtitleContainer) {
      // 显示黄色脉动文字
      this.subtitleContainer.innerHTML = `
        <div style="
          color: #ffeb3b;
          font-size: 20px;
          line-height: 1.4;
          animation: subtitlePulse 1.5s infinite;
        ">
          ${this.escapeHtml(message)}
        </div>
      `;
      this.subtitleContainer.style.display = 'block';

      // 确保overlay也显示
      if (this.overlayElement) {
        this.overlayElement.style.display = '';
      }

      // 添加CSS动画（如果还没有）
      if (!document.getElementById('subtitle-pulse-animation')) {
        const style = document.createElement('style');
        style.id = 'subtitle-pulse-animation';
        style.textContent = `
          @keyframes subtitlePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `;
        document.head.appendChild(style);
      }

      console.log('[SubtitleOverlay] 显示PENDING消息:', message);
    }
  }

  /**
   * 查找播放器元素
   */
  private findPlayerElement(): void {
    // 优先查找video-stream元素（实际的播放器视频大小）
    this.playerElement = document.querySelector('.video-stream.html5-main-video') as HTMLElement ||
                        document.querySelector('.html5-video-player') as HTMLElement;

    // 初始设置播放器宽度和预计算字体大小
    if (this.playerElement && this.overlayElement) {
      const width = this.playerElement.clientWidth || 1280;
      const fontSize = width * 0.025;
      const fontSizeSmall = width * 0.0225;

      this.overlayElement.style.setProperty('--player-width', width.toString());
      this.overlayElement.style.setProperty('--calculated-font-size', `${fontSize}px`);
      this.overlayElement.style.setProperty('--calculated-font-size-small', `${fontSizeSmall}px`);

      console.log(`[SubtitleOverlay] 初始播放器宽度: ${width}px, 字体大小: ${fontSize}px / ${fontSizeSmall}px`);
    }
  }

  /**
   * 设置ResizeObserver监听播放器大小变化
   */
  private setupResponsiveObserver(): void {
    if (!this.playerElement) return;

    // 如果已有监听器，先断开
    if (this.playerObserver) {
      this.playerObserver.disconnect();
    }

    // 创建新的监听器
    this.playerObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;

        // 更新CSS变量：播放器宽度和计算后的字体大小
        if (this.overlayElement) {
          this.overlayElement.style.setProperty('--player-width', width.toString());
          // 直接计算并设置精确的字体大小
          const fontSize = width * 0.025;
          const fontSizeSmall = width * 0.0225;
          this.overlayElement.style.setProperty('--calculated-font-size', `${fontSize}px`);
          this.overlayElement.style.setProperty('--calculated-font-size-small', `${fontSizeSmall}px`);
          console.log(`[SubtitleOverlay] 更新播放器宽度: ${width}px, 字体: ${fontSize}px`);
        }

        // 调试：获取YouTube原生字幕大小
        const nativeSubtitle = document.querySelector('.ytp-caption-segment');
        let nativeFontSize = 0;
        if (nativeSubtitle) {
          const nativeStyles = window.getComputedStyle(nativeSubtitle);
          nativeFontSize = parseFloat(nativeStyles.fontSize);
        }

        // 获取我们的字幕大小
        let ourFontSize = 0;
        if (this.overlayElement) {
          const subtitleEl = this.overlayElement.querySelector('.subtitle-translation, .subtitle-original') as HTMLElement;
          if (subtitleEl) {
            const ourStyles = window.getComputedStyle(subtitleEl);
            ourFontSize = parseFloat(ourStyles.fontSize);
          }
        }

        // 计算理论值
        const theoreticalSize = width * 0.025; // 2.5%播放器宽度
        const viewportWidth = window.innerWidth;

        // 获取容器实际宽度
        const containerWidth = this.overlayElement ? this.overlayElement.offsetWidth : 0;
        const containerPercent = width > 0 ? (containerWidth / width * 100).toFixed(1) : 0;

        console.log(`%c[响应式字幕调试] ===========================`, 'color: #00ff00; font-weight: bold');
        console.log(`📐 窗口宽度: ${viewportWidth}px | 播放器宽度: ${width}px | 播放器高度: ${height}px`);
        console.log(`📦 字幕容器: ${containerWidth}px (播放器的${containerPercent}%)`);
        console.log(`🎯 YouTube原生字幕: ${nativeFontSize.toFixed(2)}px`);
        console.log(`📝 我们的字幕(新): ${ourFontSize.toFixed(2)}px`);
        console.log(`📊 理论值(2.5%播放器): ${theoreticalSize.toFixed(2)}px`);
        console.log(`✅ 匹配度: 原生vs我们=${Math.abs(nativeFontSize - ourFontSize).toFixed(2)}px 差异`);
        console.log(`%c=========================================`, 'color: #00ff00; font-weight: bold');
      }
    });

    this.playerObserver.observe(this.playerElement);
  }


  /**
   * 重写销毁方法，清理ResizeObserver
   */
  public destroy(): void {
    console.log('[SubtitleOverlay] 销毁字幕层');

    // 断开ResizeObserver
    if (this.playerObserver) {
      this.playerObserver.disconnect();
      this.playerObserver = null;
    }

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
    this.playerElement = null;
    this.currentSubtitles = [];
    this.isActive = false;
  }
}

// 导出单例
export const subtitleOverlay = new SubtitleOverlay();