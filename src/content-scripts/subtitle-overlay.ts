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
  // 🎚️ 日志控制开关
  private readonly ENABLE_DETAILED_SUBTITLE_LOG = false;  // 关闭详细字幕日志（🔍数量、📋详情）

  private overlayElement: HTMLDivElement | null = null;
  private subtitleWindow: HTMLDivElement | null = null;  // 🆕 字幕窗口（用于拖拽）
  private subtitleContainer: HTMLDivElement | null = null;
  private currentSubtitles: SubtitleEntry[] = [];
  private videoElement: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private isActive: boolean = false;
  private currentLanguageMode: 'bilingual' | 'targetOnly' = 'bilingual';
  private userPreferencesManager: UserPreferencesManager;
  private isUrgentTranslation: boolean = false;
  private pendingMessageTimer: number | null = null;  // 用于清除pending消息的定时器

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
   * 创建字幕覆盖层DOM结构（三层结构：容器 → 窗口 → 字幕）
   */
  private createOverlay(): void {
    // 如果已存在则先删除
    if (this.overlayElement) {
      this.overlayElement.remove();
    }

    // 🆕 第一层：覆盖层容器（全屏覆盖，事件穿透）
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'youtube-subtitle-overlay';
    this.overlayElement.className = 'subtitle-overlay-responsive'; // 🆕 添加class用于CSS选择器
    // 初始化默认值
    const defaultWidth = 1280;
    const defaultFontSize = defaultWidth * 0.025;  // 32px
    const defaultFontSizeSmall = defaultWidth * 0.0225;  // 28.8px

    this.overlayElement.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      /* bottom: 2%; */  /* 临时调试：向上移动100px验证同步 */
      bottom: calc(2% + 100px);
      margin-bottom: 0;
      z-index: 2147483647;
      pointer-events: none;
      transition: margin-bottom 0.1s ease-out;
      --subtitle-base-ratio: 2.5;
      --subtitle-min-size: 10px;
      --subtitle-max-size: 48px;
      --player-width: ${defaultWidth};
      --calculated-font-size: ${defaultFontSize}px;
      --calculated-font-size-small: ${defaultFontSizeSmall}px;
    `;

    // 🆕 第二层：字幕窗口（flex容器，用于居中子元素）
    this.subtitleWindow = document.createElement('div');
    this.subtitleWindow.id = 'subtitle-window';
    this.subtitleWindow.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      display: flex;
      justify-content: center;
      align-items: flex-end;
      pointer-events: none;
    `;

    // 🆕 第三层：字幕容器（自适应内容宽度，可选择文本）
    this.subtitleContainer = document.createElement('div');
    this.subtitleContainer.id = 'subtitle-container';
    this.subtitleContainer.style.cssText = `
      background: none;
      padding: 0;
      border-radius: 0px;
      width: fit-content;
      max-width: 100%;
      visibility: hidden;
      text-align: center;
      pointer-events: auto;
      cursor: text;
      user-select: text;
      -webkit-user-select: text;
    `;

    // 组装DOM结构
    this.subtitleWindow.appendChild(this.subtitleContainer);
    this.overlayElement.appendChild(this.subtitleWindow);

    // 将覆盖层添加到视频容器
    const videoContainer = this.videoElement?.closest('#movie_player, .html5-video-player');
    if (videoContainer) {
      videoContainer.appendChild(this.overlayElement);
      console.log('[SubtitleOverlay] 字幕覆盖层已创建（三层结构）');
    } else {
      console.error('[SubtitleOverlay] 未找到视频容器');
    }

    // 🆕 注入CSS样式：控制栏显示时自动调整字幕位置
    if (!document.getElementById('subtitle-overlay-controlbar-style')) {
      const style = document.createElement('style');
      style.id = 'subtitle-overlay-controlbar-style';
      style.textContent = `
        /* 控制栏显示时，字幕向上移动61px（匹配YouTube原生行为） */
        #movie_player:not(.ytp-autohide) .subtitle-overlay-responsive {
          margin-bottom: 61px !important;
        }
      `;
      document.head.appendChild(style);
      console.debug('[debug][SubtitleOverlay] 控制栏响应CSS已注入');
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
        console.debug('[debug][SubtitleOverlay] 输入格式: 纯数组');
        this.currentSubtitles = translationData;
      }
      // 情况2: V4架构当前格式（translatedSubtitles是数组）
      else if (translationData.translatedSubtitles && Array.isArray(translationData.translatedSubtitles)) {
        console.debug('[debug][SubtitleOverlay] 输入格式: V4架构数组格式');
        this.currentSubtitles = translationData.translatedSubtitles;

        // 🔍 打印数量（V4架构格式）
        if (this.ENABLE_DETAILED_SUBTITLE_LOG) {
          console.log(`[SubtitleOverlay] 🔍 接收到的字幕数量: ${this.currentSubtitles.length}条`);
        }
      }
      // 情况3: 缓存格式（VTT字符串）
      else if (translationData.translatedSubtitles && typeof translationData.translatedSubtitles === 'string') {
        console.debug('[debug][SubtitleOverlay] 输入格式: VTT字符串格式');

        if (!translationData.originalSubtitles) {
          console.warn('[SubtitleOverlay] 缺少原始字幕');
          return;
        }

        // 解析VTT格式
        const originalSubtitles = parseVttString(translationData.originalSubtitles);
        const translatedSubtitles = parseVttString(translationData.translatedSubtitles, true);

        // 🔍 打印原字幕和翻译字幕的数量（调试用）
        if (this.ENABLE_DETAILED_SUBTITLE_LOG) {
          console.log(`[SubtitleOverlay] 🔍 原字幕数量: ${originalSubtitles.length}, 翻译字幕数量: ${translatedSubtitles.length}`);
          if (originalSubtitles.length !== translatedSubtitles.length) {
            console.warn(`[SubtitleOverlay] ⚠️ 数量不匹配！原字幕${originalSubtitles.length}条，翻译${translatedSubtitles.length}条`);
          }
        }

        // 合并原文和译文
        this.currentSubtitles = mergeSubtitles(originalSubtitles, translatedSubtitles);
      }
      // 无法识别的格式
      else {
        console.error('[SubtitleOverlay] 无法识别的数据格式:', translationData);
        return;
      }

      console.debug(`[debug][SubtitleOverlay] 解析后的字幕条数: ${this.currentSubtitles.length}`);

      // 📋 打印所有字幕详情（用于调试）
      if (this.ENABLE_DETAILED_SUBTITLE_LOG) {
        console.log(`[SubtitleOverlay] 📋 所有字幕详情（共${this.currentSubtitles.length}条）:`);
        this.currentSubtitles.forEach((subtitle, index) => {
          const startTime = subtitle.start.toFixed(3);
          const endTime = (subtitle.start + subtitle.duration).toFixed(3);
          const origText = subtitle.text || '';
          const transText = subtitle.translation || '';
          console.log(
            `  [${index}] ${startTime}s-${endTime}s | 原: "${origText}" | 译: "${transText}"`
          );
        });
      }

      // 从用户偏好读取显示模式
      const userPrefs = await this.userPreferencesManager.getUserPreferences();
      this.currentLanguageMode = userPrefs.subtitleMode === SubtitleMode.BILINGUAL ? 'bilingual' : 'targetOnly';
      console.debug(`[debug][SubtitleOverlay] 使用字幕模式: ${this.currentLanguageMode}`);

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

    // 清除pending消息定时器
    if (this.pendingMessageTimer) {
      clearTimeout(this.pendingMessageTimer);
      this.pendingMessageTimer = null;
    }

    this.isActive = false;
    if (this.subtitleContainer) {
      this.subtitleContainer.style.visibility = 'hidden';
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
        // 每行独立背景，独立宽度（支持换行符自动拆分）
        const originalStyles = 'color: #ffffff; font-size: var(--calculated-font-size-small); line-height: normal; background: rgba(8, 8, 8, 0.75); padding: 0px 5px; display: block; width: fit-content; margin: 0 auto;';
        const translationStyles = `color: ${translationColor}; font-size: var(--calculated-font-size); line-height: normal; background: rgba(8, 8, 8, 0.75); padding: 0px 5px; display: block; width: fit-content; margin: 0 auto;`;

        subtitleHTML = `
          ${this.createMultiLineDiv(currentSubtitle.text, originalStyles)}
          ${this.createMultiLineDiv(currentSubtitle.translation || currentSubtitle.text, translationStyles)}
        `.trim();
      } else {
        // 仅目标语言模式
        // 使用预计算的响应式字体大小（精确匹配YouTube）
        // 每行独立背景，独立宽度（支持换行符自动拆分）
        const translationStyles = `color: ${translationColor}; font-size: var(--calculated-font-size); line-height: normal; background: rgba(8, 8, 8, 0.75); padding: 0px 5px; display: block; width: fit-content; margin: 0 auto;`;

        subtitleHTML = this.createMultiLineDiv(currentSubtitle.translation || currentSubtitle.text, translationStyles);
      }

      this.subtitleContainer.innerHTML = subtitleHTML;
      this.subtitleContainer.style.visibility = 'visible';
    } else {
      // 没有字幕需要显示
      this.subtitleContainer.style.visibility = 'hidden';
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
   * 将文本按换行符拆分，为每行创建独立的 div
   * @param text 原始文本
   * @param styles 样式字符串
   * @returns HTML 字符串
   */
  private createMultiLineDiv(text: string, styles: string): string {
    const lines = text.split('\n');
    return lines.map(line =>
      `<div style="${styles}">${this.escapeHtml(line)}</div>`
    ).join('');
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
        // 每行独立背景，独立宽度（支持换行符自动拆分）
        const originalStyles = 'color: #ffffff; font-size: var(--calculated-font-size-small); line-height: normal; background: rgba(8, 8, 8, 0.75); padding: 0px 5px; display: block; width: fit-content; margin: 0 auto;';
        const translationStyles = 'color: #ffffff; font-size: var(--calculated-font-size); line-height: normal; background: rgba(8, 8, 8, 0.75); padding: 0px 5px; display: block; width: fit-content; margin: 0 auto;';

        subtitleHTML = `
          ${this.createMultiLineDiv(currentSubtitle.text, originalStyles)}
          ${this.createMultiLineDiv(currentSubtitle.translation || currentSubtitle.text, translationStyles)}
        `.trim();
      } else {
        // 仅目标语言模式：只显示译文
        // 每行独立背景，独立宽度（支持换行符自动拆分）
        const translationStyles = 'color: #ffffff; font-size: var(--calculated-font-size); line-height: normal; background: rgba(8, 8, 8, 0.75); padding: 0px 5px; display: block; width: fit-content; margin: 0 auto;';

        subtitleHTML = this.createMultiLineDiv(currentSubtitle.translation || currentSubtitle.text, translationStyles);
      }

      // 更新显示
      this.subtitleContainer.innerHTML = subtitleHTML;
      this.subtitleContainer.style.visibility = 'visible';
    } else {
      // 当前时间没有字幕，隐藏容器
      this.subtitleContainer.style.visibility = 'hidden';
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
    console.debug(`[debug][SubtitleOverlay] 更新翻译时字幕模式: ${this.currentLanguageMode}`);

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
    if (!this.subtitleWindow || !this.videoElement) return;

    // 检查是否全屏
    const isFullscreen = document.fullscreenElement ||
                        (document as any).webkitFullscreenElement ||
                        (document as any).mozFullScreenElement;

    // 🆕 全屏模式不再需要特殊调整，由 CSS margin-bottom 统一控制
    // 已移除 paddingBottom 调整逻辑，字幕位置完全由 overlay 的 bottom + marginBottom 控制
  }

  /**
   * 显示PENDING状态消息
   * 用于源语言切换等需要重新加载的场景
   * @param message 要显示的消息
   * @param timeout 超时时间（毫秒），默认5秒
   */
  public showPendingMessage(message: string, timeout: number = 5000): void {
    // 清除之前的定时器
    if (this.pendingMessageTimer) {
      clearTimeout(this.pendingMessageTimer);
      this.pendingMessageTimer = null;
    }

    if (!this.subtitleContainer) {
      // 如果容器不存在，先初始化
      this.initialize();
    }

    if (this.subtitleContainer) {
      // 显示黄色脉动文字
      this.subtitleContainer.innerHTML = `
        <div style="
          width: fit-content;
          margin: 0 auto;
          color: #ffeb3b;
          font-size: 20px;
          line-height: 1.4;
          animation: subtitlePulse 1.5s infinite;
        ">
          ${this.escapeHtml(message)}
        </div>
      `.trim();
      this.subtitleContainer.style.visibility = 'visible';

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

      console.debug(`[debug][SubtitleOverlay] 显示PENDING消息: ${message}`);

      // 设置自动隐藏定时器
      this.pendingMessageTimer = window.setTimeout(() => {
        console.debug('[debug][SubtitleOverlay] Pending消息超时，自动隐藏');
        this.hide();
        this.pendingMessageTimer = null;
      }, timeout);
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
      const height = this.playerElement.clientHeight || 720;

      // 🆕 使用改进的字体算法：同时考虑宽高比（与ResizeObserver保持一致）
      // 匹配YouTube原生字幕算法：width/40, height/22
      const widthRatio = width / 40;
      const heightRatio = height / 22;
      let baseSize = Math.min(widthRatio, heightRatio);

      if (width === 0 || height === 0) {
        baseSize = 16;
      }

      let minSize = 10;
      if (heightRatio > 14 && heightRatio > widthRatio * 2) {
        minSize = Math.max(heightRatio / 2.5, 14);
      }

      const fontSize = Math.max(baseSize, minSize);
      const fontSizeSmall = fontSize * 0.9;

      this.overlayElement.style.setProperty('--player-width', width.toString());
      this.overlayElement.style.setProperty('--calculated-font-size', `${fontSize}px`);
      this.overlayElement.style.setProperty('--calculated-font-size-small', `${fontSizeSmall}px`);

      console.debug(`[debug][SubtitleOverlay] 初始播放器尺寸: ${width}x${height}, 字体: ${fontSize.toFixed(1)}px / ${fontSizeSmall.toFixed(1)}px`);
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

          // 🆕 改进的字体算法：同时考虑宽高比
          // 匹配YouTube原生字幕算法：width/40, height/22
          const widthRatio = width / 40;
          const heightRatio = height / 22;
          let baseSize = Math.min(widthRatio, heightRatio);

          // 如果宽高为0，设置默认值
          if (width === 0 || height === 0) {
            baseSize = 16;
          }

          // 最小字号
          let minSize = 10;

          // 特殊情况：高度比较大且是宽度的2倍以上（竖屏、Shorts等）
          if (heightRatio > 14 && heightRatio > widthRatio * 2) {
            minSize = Math.max(heightRatio / 2.5, 14);
          }

          // 最终字号 = max(计算值, 最小值)
          const fontSize = Math.max(baseSize, minSize);
          const fontSizeSmall = fontSize * 0.9;  // 原文字号为主字号的90%

          this.overlayElement.style.setProperty('--calculated-font-size', `${fontSize}px`);
          this.overlayElement.style.setProperty('--calculated-font-size-small', `${fontSizeSmall}px`);
          console.debug(`[debug][SubtitleOverlay] 播放器尺寸: ${width}x${height}, 字体: ${fontSize.toFixed(1)}px / ${fontSizeSmall.toFixed(1)}px`);
        }

        // ========== 响应式字幕调试代码（已注释） ==========
//         // 调试：获取YouTube原生字幕大小
//         const nativeSubtitle = document.querySelector('.ytp-caption-segment');
//         let nativeFontSize = 0;
//         if (nativeSubtitle) {
//           const nativeStyles = window.getComputedStyle(nativeSubtitle);
//           nativeFontSize = parseFloat(nativeStyles.fontSize);
//         }
// 
//         // 获取我们的字幕大小
//         let ourFontSize = 0;
//         if (this.overlayElement) {
//           const subtitleEl = this.overlayElement.querySelector('.subtitle-translation, .subtitle-original') as HTMLElement;
//           if (subtitleEl) {
//             const ourStyles = window.getComputedStyle(subtitleEl);
//             ourFontSize = parseFloat(ourStyles.fontSize);
//           }
//         }
// 
//         // 计算理论值
//         const theoreticalSize = width * 0.025; // 2.5%播放器宽度
//         const viewportWidth = window.innerWidth;
// 
//         // 获取容器实际宽度
//         const containerWidth = this.overlayElement ? this.overlayElement.offsetWidth : 0;
//         const containerPercent = width > 0 ? (containerWidth / width * 100).toFixed(1) : 0;
// 
//         console.log(`%c[响应式字幕调试] ===========================`, 'color: #00ff00; font-weight: bold');
//         console.log(`📐 窗口宽度: ${viewportWidth}px | 播放器宽度: ${width}px | 播放器高度: ${height}px`);
//         console.log(`📦 字幕容器: ${containerWidth}px (播放器的${containerPercent}%)`);
//         console.log(`🎯 YouTube原生字幕: ${nativeFontSize.toFixed(2)}px`);
//         console.log(`📝 我们的字幕(新): ${ourFontSize.toFixed(2)}px`);
//         console.log(`📊 理论值(2.5%播放器): ${theoreticalSize.toFixed(2)}px`);
//         console.log(`✅ 匹配度: 原生vs我们=${Math.abs(nativeFontSize - ourFontSize).toFixed(2)}px 差异`);
//         console.log(`%c=========================================`, 'color: #00ff00; font-weight: bold');
        // ========== 响应式字幕调试代码结束 ==========
      }
    });

    this.playerObserver.observe(this.playerElement);
  }


  /**
   * 重写销毁方法，清理ResizeObserver
   */
  public destroy(): void {
    console.log('[SubtitleOverlay] 销毁字幕层');

    // 清除pending消息定时器
    if (this.pendingMessageTimer) {
      clearTimeout(this.pendingMessageTimer);
      this.pendingMessageTimer = null;
    }

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