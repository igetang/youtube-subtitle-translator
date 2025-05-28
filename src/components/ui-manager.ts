/**
 * @file ui-manager.ts
 * @description YouTube播放器控件注入管理，负责创建和插入UI元素
 */

import { EventBus, EventPriority } from '../events/event-bus';

/**
 * UI管理器事件类型
 */
export enum UIEvent {
  CONTROLS_INJECTED = 'ui.controlsInjected',
  OVERLAY_CREATED = 'ui.overlayCreated',
  INJECTION_FAILED = 'ui.injectionFailed',
  CONTROLS_RECOVERED = 'ui.controlsRecovered'
}

/**
 * 按钮类型
 */
export enum ButtonType {
  TRANSLATE = 'translate',
  SETTINGS = 'settings'
}

/**
 * UI管理器状态
 */
export interface UIManagerState {
  controlsInjected: boolean;
  overlayCreated: boolean;
  translateActive: boolean;
  settingPanelOpen: boolean;
  lastError: string | null;
  injectionAttempts: number;
}

/**
 * YouTube播放器UI控件管理器
 * 负责注入翻译按钮和设置按钮
 */
export class UIManager {
  private static instance: UIManager;
  private eventBus: EventBus;
  private state: UIManagerState;
  
  // 资源URL
  private readonly SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting.svg');
  private readonly ACTIVE_SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting-active.svg');
  private readonly ON_ICON_URL = chrome.runtime.getURL('icons/on.svg');
  private readonly OFF_ICON_URL = chrome.runtime.getURL('icons/off.svg');
  private readonly NORMAL_BORDER_URL = chrome.runtime.getURL('icons/normal-border.svg');
  
  // 元素引用
  private translateToggleButtonIcon: HTMLImageElement | null = null;
  private settingToggleButtonIcon: HTMLImageElement | null = null;
  private subtitleOverlayElement: HTMLDivElement | null = null;
  
  // Tooltip相关变量
  private tooltipContainer: HTMLElement | null = null;
  private tooltipTextElement: HTMLElement | null = null;
  private hideTooltipTimeout: number | null = null;
  
  // 控件监测与恢复
  private controlsCheckInterval: number | null = null;
  private readonly CONTROL_CHECK_INTERVAL = 3000; // 每3秒检查一次
  private readonly MAX_INJECTION_ATTEMPTS = 5; // 最大尝试次数
  private readonly INJECTION_RETRY_DELAY = 1000; // 注入重试延迟
  
  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    console.log('[ui-manager] UIManager 初始化');
    this.eventBus = EventBus.getInstance();
    this.state = {
      controlsInjected: false,
      overlayCreated: false,
      translateActive: false,
      settingPanelOpen: false,
      lastError: null,
      injectionAttempts: 0
    };
    
    this.setupEventListeners();
    this.loadTranslateActiveState();
    this.loadSettingPanelOpenState();
    
    // 新增：设置sidepanel状态监听器
    this.setupSidePanelStateListener();
    
    // 预先创建Tooltip元素
    this.ensureTooltipExists();
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }
  
  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    console.log('[ui-manager] 设置事件监听器');
    
    // 监听页面导航事件
      this.handlePageNavigation();
    
    // 启动控件检查
    this.startControlsCheck();
    
    // 监听视频事件（可在此处添加）
    // TODO: 在后续版本中实现视频状态监听
  }
  
  /**
   * 设置sidepanel状态监听器
   * 监听来自sidepanel的关闭通知，实现按钮状态同步
   */
  private setupSidePanelStateListener(): void {
    console.log('[ui-manager] 设置sidepanel状态监听器');
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'sidePanelClosed') {
        console.log('[ui-manager] 收到sidepanel关闭通知', {
          timestamp: message.timestamp,
          source: message.source
        });
        
        // 更新设置按钮状态为未激活
        this.setSettingPanelOpen(false, message.source);
        
        // 发送确认回复
        sendResponse({ 
          received: true, 
          timestamp: Date.now(),
          action: 'button-state-updated'
        });
      }
    });
    
    console.log('[ui-manager] sidepanel状态监听器设置完成');
  }
  
  /**
   * 从存储中加载翻译激活状态
   */
  private loadTranslateActiveState(): void {
    // 确保初始状态为false，即使在异步加载之前访问也是关闭状态
    this.state.translateActive = false;
    
    chrome.storage.sync.get('translateActive', (result) => {
      const isActive = !!result.translateActive;
      this.state.translateActive = isActive;
      console.log('[ui-manager] 已加载翻译状态:', isActive);
      
      // 如果按钮已经存在，更新按钮状态以匹配加载的状态
      this.updateTranslateButtonState(isActive);
    });
  }
  
  /**
   * 从存储中加载设置面板打开状态
   */
  private loadSettingPanelOpenState(): void {
    this.state.settingPanelOpen = false;
    chrome.storage.sync.get('settingPanelOpen', (result) => {
      const open = !!result.settingPanelOpen;
      this.state.settingPanelOpen = open;
      console.log('[ui-manager] 已加载设置面板状态:', open);
      // 如果按钮已存在，更新状态以匹配加载的状态
      this.updateSettingsButtonState(open);
    });
  }
  
  /**
   * 处理页面导航
   */
  private handlePageNavigation(): void {
    console.log('[ui-manager] 检测到页面导航，重置UI状态');
    
    // 停止持续监测
    this.stopControlsCheck();
    
    // 移除现有控件
    this.removeExistingControls();
    
    // 重置状态标志，但保留翻译激活状态
    // 注意：不重置this.state.translateActive，保持用户的翻译偏好
    const currentTranslateActive = this.state.translateActive; // 保存当前翻译状态
    
    this.state.controlsInjected = false;
    this.state.overlayCreated = false;
    this.state.injectionAttempts = 0;
    
    // 确保翻译状态保持不变
    this.state.translateActive = currentTranslateActive;
    console.log(`[ui-manager] 导航后保留翻译状态: ${this.state.translateActive}`);
    
    // 清除引用
    this.translateToggleButtonIcon = null;
    this.settingToggleButtonIcon = null;
    this.subtitleOverlayElement = null;
  }
  
  /**
   * 启动控件持续监测
   * 周期性检查控件是否存在，如不存在则重新注入
   */
  private startControlsCheck(): void {
    // 如果已经在监测中，不重复启动
    if (this.controlsCheckInterval !== null) {
      return;
    }
    
    console.log('[ui-manager] 启动控件持续监测');
    
    this.controlsCheckInterval = window.setInterval(() => {
      // 只有在控件已注入的情况下才检查
      if (this.state.controlsInjected) {
        const translateButton = document.getElementById('vid-translate-toggle-button');
        const settingsButton = document.getElementById('vid-translate-settings-button');
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
        const rightControls = document.querySelector('.ytp-right-controls');
        
        // 如果按钮丢失并且自动播放按钮和右侧控制栏都存在，尝试重新注入
        if ((!translateButton || !settingsButton) && autoplayButton && rightControls) {
          console.log('[ui-manager] 检测到控件丢失且界面就绪，尝试重新注入');
          
          // 重置注入状态
          this.state.controlsInjected = false;
          this.state.injectionAttempts = 0;
          
          // 尝试重新注入
          this.injectControls().then(success => {
            // 如果成功重新注入，触发恢复事件
            if (success) {
              console.log('[ui-manager] 控件已成功恢复');
              this.eventBus.emit(UIEvent.CONTROLS_RECOVERED, {
                timestamp: Date.now()
              });
            }
          });
        } else if (!translateButton || !settingsButton) {
          console.log('[ui-manager] 检测到控件丢失，但界面尚未就绪，等待中...');
        }
      }
    }, this.CONTROL_CHECK_INTERVAL);
  }
  
  /**
   * 停止控件持续监测
   */
  private stopControlsCheck(): void {
    if (this.controlsCheckInterval !== null) {
      window.clearInterval(this.controlsCheckInterval);
      this.controlsCheckInterval = null;
      console.log('[ui-manager] 已停止控件持续监测');
    }
  }
  
  /**
   * 移除现有控件
   */
  private removeExistingControls(): void {
    const translateButton = document.getElementById('vid-translate-toggle-button');
    const settingsButton = document.getElementById('vid-translate-settings-button');
    const overlay = document.getElementById('yt-translate-subtitle-overlay');
    
    if (translateButton) {
      translateButton.remove();
      console.log('[ui-manager] 已移除翻译按钮');
    }
    
    if (settingsButton) {
      settingsButton.remove();
      console.log('[ui-manager] 已移除设置按钮');
    }
    
    if (overlay) {
      overlay.remove();
      console.log('[ui-manager] 已移除字幕叠加层');
    }
  }
  
  /**
   * 创建边框图像
   */
  private createBorderImage(): HTMLImageElement {
    const border = document.createElement('img');
    border.src = this.NORMAL_BORDER_URL;
    border.style.cssText = `
      position: absolute;
      width: 36px;
      height: 36px;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    `;
    return border;
  }
  
  /**
   * 创建图标图像
   */
  private createIconImage(src: string, alt: string): HTMLImageElement {
    const icon = document.createElement('img');
    icon.src = src;
    icon.alt = alt;
    icon.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 24px;
      height: 24px;
    `;
    return icon;
  }
  
  /**
   * 确保Tooltip元素存在
   */
  private ensureTooltipExists(): void {
    if (this.tooltipContainer && this.tooltipTextElement) return;
    
    // 创建容器
    this.tooltipContainer = document.createElement('div');
    this.tooltipContainer.className = 'ytp-tooltip ytp-top vid-translate-tooltip'; // 使用YouTube原生类名
    this.tooltipContainer.setAttribute('aria-hidden', 'true');
    this.tooltipContainer.style.cssText = `
      position: fixed; /* 使用fixed相对于视口定位 */
      max-width: 300px;
      display: none; /* 初始隐藏 */
      z-index: 2300;
      pointer-events: none;
      box-sizing: border-box;
      /* 模拟YouTube工具提示样式 */
      background-color: rgba(28, 28, 28, 0.9);
      color: #fff;
      padding: 6px 8px;
      border-radius: 5px;
      font-size: 1.2rem;
      font-weight: 500;
      white-space: nowrap; /* 防止文本换行 */
      text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
      transition: opacity 0.1s cubic-bezier(0.4, 0, 1, 1);
      opacity: 0;
    `;
    
    // 用于文本的内部元素 (模拟ytp-tooltip-text)
    this.tooltipTextElement = document.createElement('div');
    this.tooltipTextElement.className = 'ytp-tooltip-text'; // 使用YouTube类名
    this.tooltipContainer.appendChild(this.tooltipTextElement);
    
    // 添加到文档
    document.body.appendChild(this.tooltipContainer);
    
    console.log('[ui-manager] 已创建Tooltip元素');
  }

  /**
   * 显示Tooltip
   */
  private showTooltip(targetElement: HTMLElement, text: string): void {
    // Tooltip元素已在构造函数中创建，不再需要此检查
    if (!this.tooltipContainer || !this.tooltipTextElement) return;
    
    // 清除任何隐藏定时器
    if (this.hideTooltipTimeout) {
      clearTimeout(this.hideTooltipTimeout);
      this.hideTooltipTimeout = null;
    }
    
    // 更新文本 - 优先使用dataset.tooltipText，以确保显示最新的文本
    const tooltipText = targetElement.dataset.tooltipText || text;
    this.tooltipTextElement.textContent = tooltipText;
    
    // 技巧: 先设为可见但透明，用于测量尺寸
    this.tooltipContainer.style.visibility = 'hidden';
    this.tooltipContainer.style.display = 'block';
    this.tooltipContainer.style.opacity = '0';
    
    // 计算尺寸和位置
    const tooltipWidth = this.tooltipContainer.offsetWidth;
    const targetRect = targetElement.getBoundingClientRect();
    
    // 计算位置（目标元素上方居中）
    const centerX = targetRect.left + targetRect.width / 2;
    const topY = targetRect.top;
    const left = centerX - tooltipWidth / 2;
    const top = topY - 40; // 固定偏移量
    
    // 应用位置
    this.tooltipContainer.style.left = `${left}px`;
    this.tooltipContainer.style.top = `${top}px`;
    
    // 显示并设置为可见
    this.tooltipContainer.style.visibility = 'visible';
    this.tooltipContainer.style.opacity = '1';
  }

  /**
   * 隐藏Tooltip
   */
  private hideTooltip(): void {
    if (!this.tooltipContainer) return;
    
    // 先设置透明度为0，实现淡出效果
    this.tooltipContainer.style.opacity = '0';
    
    // 等待过渡动画结束后完全隐藏
    this.hideTooltipTimeout = window.setTimeout(() => {
      if (this.tooltipContainer) {
        this.tooltipContainer.style.display = 'none';
      }
      this.hideTooltipTimeout = null;
    }, 100); // 配合CSS过渡时间
  }
  
  /**
   * 创建控制按钮
   */
  private createControlButton(
    id: string,
    tooltipText: string,
    iconSrc: string,
    onClick: () => void
  ): { button: HTMLButtonElement; icon: HTMLImageElement } {
    // 创建按钮容器
    const button = document.createElement('button');
    button.id = id;
    button.className = 'ytp-button vid-translate-button'; // 使用YouTube原生的ytp-button类
    button.setAttribute('aria-label', tooltipText);
    // 应用关键的内联样式
    button.style.cssText = `
      position: relative; /* 用于子元素绝对定位 */
      overflow: visible; /* 确保边框可见 */
      width: 48px; /* 保持宽度 */
      display: inline-flex; /* 让父容器知道如何处理 */
      align-items: center; /* 垂直居中内部内容 */
      justify-content: center; /* 水平居中内部内容 */
    `;
    
    // 创建边框和图标
    const border = this.createBorderImage();
    const icon = this.createIconImage(iconSrc, tooltipText);
    
    // 添加到按钮
    button.appendChild(border);
    button.appendChild(icon);
    
    // 设置点击事件（不使用被动事件，因为需要阻止默认行为）
    button.addEventListener('click', onClick, { passive: false });
    
    // 添加tooltip数据属性，用于状态更新时更新提示文本
    button.dataset.tooltipText = tooltipText;
    
    // 添加工具提示专用事件处理（使用被动事件改善性能）
    button.addEventListener('mouseenter', () => this.showTooltip(button, tooltipText), { passive: true });
    button.addEventListener('mouseleave', () => this.hideTooltip(), { passive: true });
    
    return { button, icon };
  }
  
  /**
   * 创建字幕叠加层
   */
  public createSubtitleOverlay(playerContainer: HTMLElement): HTMLDivElement {
    // 如果已经创建，直接返回
    if (this.subtitleOverlayElement) {
      return this.subtitleOverlayElement;
    }
    
    // 创建叠加层
    const overlay = document.createElement('div');
    overlay.id = 'yt-translate-subtitle-overlay'; // 更改ID为统一ID
    overlay.style.cssText = `
      position: absolute;
      bottom: 60px;
      left: 0;
      right: 0;
      text-align: center;
      z-index: 100;
      pointer-events: none;
      transition: bottom 0.3s ease;
      visibility: hidden; /* 默认隐藏，内容脚本负责显示 */
    `;
    
    // 创建内部容器
    const container = document.createElement('div');
    container.className = 'translated-subtitles-container';
    container.style.cssText = `
      display: inline-block;
      max-width: 80%;
      padding: 4px 8px;
      border-radius: 4px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
      font-size: 20px;
      line-height: 1.4;
      visibility: hidden; /* 默认隐藏，内容脚本负责显示 */
    `;
    
    // 创建默认翻译文本元素
    const translatedText = document.createElement('div');
    translatedText.className = 'translated-text';
    translatedText.style.cssText = `
      font-weight: bold;
      white-space: pre-wrap;
    `;
    
    // 创建默认原文文本元素
    const originalText = document.createElement('div');
    originalText.className = 'original-text';
    originalText.style.cssText = `
      font-size: 0.85em;
      opacity: 0.9;
      white-space: pre-wrap;
      margin-top: 2px;
    `;
    
    // 组装元素
    container.appendChild(translatedText);
    container.appendChild(originalText);
    overlay.appendChild(container);
    playerContainer.appendChild(overlay);
    
    // 保存引用
    this.subtitleOverlayElement = overlay;
    this.state.overlayCreated = true;
    
    // 触发事件
    this.eventBus.emit(UIEvent.OVERLAY_CREATED, {
      element: overlay
    });
    
    console.log('[ui-manager] 已创建字幕叠加层');
    
    return overlay;
  }
  
  /**
   * 等待YouTube自动播放按钮加载完成
   * @returns 一个Promise，解析为自动播放按钮元素或null
   */
  private waitForAutoplayButton(): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      // 首先尝试立即查找
      const autoplayButton = document.querySelector('.ytp-autonav-toggle-button') as HTMLElement;
      
      if (autoplayButton) {
        console.log('[ui-manager] 已找到自动播放按钮');
        resolve(autoplayButton);
        return;
      }
      
      console.log('[ui-manager] 未立即找到自动播放按钮，开始监听DOM变化...');
      
      // 查找右侧控制栏
      const rightControls = document.querySelector('.ytp-right-controls');
      if (rightControls) {
        console.log('[ui-manager] 已找到右侧控制栏，继续等待自动播放按钮');
      } else {
        console.log('[ui-manager] 右侧控制栏也未找到，可能页面未完全加载');
      }
      
      // 如果未找到，使用MutationObserver监视
      const observer = new MutationObserver((mutations, obs) => {
        const foundButton = document.querySelector('.ytp-autonav-toggle-button') as HTMLElement;
        
        if (foundButton) {
          console.log('[ui-manager] 自动播放按钮加载完成');
          obs.disconnect();
          resolve(foundButton);
        }
      });
      
      // 设置超时，最多等待3秒
      setTimeout(() => {
        observer.disconnect();
        console.log('[ui-manager] 等待自动播放按钮超时');
        
        // 超时时再次检查控件状态
        const finalButton = document.querySelector('.ytp-autonav-toggle-button') as HTMLElement;
        const finalRightControls = document.querySelector('.ytp-right-controls');
        
        console.log('[ui-manager] 等待超时时元素状态:', {
          autoplayButton: !!finalButton,
          rightControls: !!finalRightControls
        });
        
        resolve(finalButton);
      }, 3000);
      
      // 开始观察
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      console.log('[ui-manager] 开始监听自动播放按钮');
    });
  }
  
  /**
   * 注入控件
   * 将翻译按钮和设置按钮注入YouTube播放器
   */
  public async injectControls(): Promise<boolean> {
    console.log(`[ui-manager] 注入控件，当前状态: controlsInjected=${this.state.controlsInjected}, 尝试次数=${this.state.injectionAttempts}`);
    
    // 获取当前存在的按钮
    const existingTranslateButton = document.getElementById('vid-translate-toggle-button');
    const existingSettingsButton = document.getElementById('vid-translate-settings-button');
    
    // 扩展检查条件：如果任一按钮已存在，我们认为已经注入
    if (this.state.controlsInjected || existingTranslateButton || existingSettingsButton) {
      console.log('[ui-manager] 控件已存在，跳过注入', {
        stateFlag: this.state.controlsInjected,
        translateButton: !!existingTranslateButton,
        settingsButton: !!existingSettingsButton
      });
      
      // 确保状态标记和实际DOM保持一致
      this.state.controlsInjected = true;
      
      // 确保启动控件监测
      this.startControlsCheck();
      
      return true;
    }
    
    // 设置一个标志，防止重复注入
    if ((window as any).__uiManagerInjecting) {
      console.log('[ui-manager] 另一个注入操作正在进行中，跳过本次注入');
      return false;
    }
    
    // 标记注入开始
    (window as any).__uiManagerInjecting = true;
    
    try {
      // 检查注入尝试次数
      if (this.state.injectionAttempts >= this.MAX_INJECTION_ATTEMPTS) {
        console.warn('[ui-manager] 达到最大注入尝试次数，放弃注入');
        this.state.lastError = '达到最大注入尝试次数';
        
        // 触发注入失败事件
        this.eventBus.emit(UIEvent.INJECTION_FAILED, {
          reason: 'MAX_ATTEMPTS_REACHED',
          attempts: this.state.injectionAttempts
        });
        
        return false;
      }
      
      // 增加尝试计数
      this.state.injectionAttempts++;
      
      // 等待自动播放按钮加载完成，作为界面就绪的信号
      const autoplayButton = await this.waitForAutoplayButton();
      if (!autoplayButton) {
        console.log('[ui-manager] 未找到自动播放按钮，稍后重试');
        
        // 设置重试定时器
        setTimeout(() => {
          (window as any).__uiManagerInjecting = false; // 重置标志
          this.injectControls();
        }, this.INJECTION_RETRY_DELAY);
        
        return false;
      }
      
      // 查找YouTube播放器控件容器
      const rightControls = document.querySelector('.ytp-right-controls');
      if (!rightControls) {
        console.log('[ui-manager] 未找到.ytp-right-controls，稍后重试');
        
        // 设置重试定时器
        setTimeout(() => {
          (window as any).__uiManagerInjecting = false; // 重置标志
          this.injectControls();
        }, this.INJECTION_RETRY_DELAY);
        
        return false;
      }
      
      // 再次检查是否已经注入 - 这是避免竞态条件的关键步骤
      if (document.getElementById('vid-translate-toggle-button') || 
          document.getElementById('vid-translate-settings-button')) {
        console.log('[ui-manager] 在注入过程中检测到控件已存在，避免重复注入');
        this.state.controlsInjected = true;
        this.startControlsCheck();
        return true;
      }
      
      // 确保字幕叠加层存在
      const playerContainer = document.querySelector('.html5-video-player');
      if (playerContainer && !this.subtitleOverlayElement) {
        this.createSubtitleOverlay(playerContainer as HTMLElement);
      }
      
      // 获取第一个原生按钮作为插入参照点
      const firstNativeButton = rightControls.firstChild;
      console.log('[ui-manager] 获取到右侧控制栏第一个元素作为插入参照点');
      
      // 1. 创建设置按钮
      const { button: settingsButton, icon: settingsIcon } = this.createControlButton(
        'vid-translate-settings-button',
        this.state.settingPanelOpen ? '关闭翻译设置' : '翻译设置',
        this.state.settingPanelOpen ? this.ACTIVE_SETTING_ICON_URL : this.SETTING_ICON_URL,
        () => {
          const newState = !this.state.settingPanelOpen;
          console.log(`[ui-manager] 设置按钮点击，切换状态为: ${newState}`);
          
          // ✅ 直接调用，不发事件（简单操作）
          this.setSettingPanelOpen(newState);
        }
      );
      
      // 保存设置图标引用
      this.settingToggleButtonIcon = settingsIcon;
      // 设置数据属性以供CSS选择器使用
      settingsButton.dataset.tooltipText = this.state.settingPanelOpen ? '关闭翻译设置' : '翻译设置';
      
      // 2. 创建翻译按钮
      const { button: translateButton, icon: toggleIcon } = this.createControlButton(
        'vid-translate-toggle-button',
        this.state.translateActive ? '关闭翻译' : '开启翻译',
        this.state.translateActive ? this.ON_ICON_URL : this.OFF_ICON_URL,
        () => {
          // 切换翻译状态
          const newState = !this.state.translateActive;
          console.log(`[ui-manager] 翻译按钮点击，切换状态为: ${newState}`);
          
          // ✅ 直接调用本组件方法（避免循环）
          this.setTranslateActive(newState);
        }
      );
      
      // 保存图标引用，方便后续更新
      this.translateToggleButtonIcon = toggleIcon;
      
      // 设置数据属性以供CSS选择器使用
      translateButton.dataset.tooltipText = this.state.translateActive ? '关闭翻译' : '开启翻译';
      
      // 插入按钮到播放器控制栏
      // 先将设置按钮插入到第一个原生按钮前面
      rightControls.insertBefore(settingsButton, firstNativeButton);
      console.log('[ui-manager] 已注入设置按钮');
      
      // 再将翻译按钮插入到设置按钮前面，确保翻译按钮在最左侧
      rightControls.insertBefore(translateButton, settingsButton);
      console.log('[ui-manager] 已注入翻译按钮');
      
      // 更新状态标志
      this.state.controlsInjected = true;
      this.state.injectionAttempts = 0; // 重置尝试次数
      
      // 启动控件持续监测
      this.startControlsCheck();
      
      // 触发控件注入完成事件
      this.eventBus.emit(UIEvent.CONTROLS_INJECTED, {
        translateButton,
        settingsButton,
        translateActive: this.state.translateActive
      });
      
      console.log('[ui-manager] 控件注入完成');
      
      // 如果翻译已激活，触发翻译开始事件
      if (this.state.translateActive) {
        console.log('[ui-manager] 翻译状态已激活(值为true)，自动开始翻译');
        this.eventBus.emit('translation:start_requested', {});
      } else {
        console.log('[ui-manager] 翻译状态未激活(值为false)，不自动开始翻译');
      }
      
      // 在 injectControls 完成前，新增：如果设置面板已激活，则打开侧边栏
      if (this.state.settingPanelOpen) {
        console.log('[ui-manager] 设置面板已激活，打开侧边栏');
        console.log('[ui-manager] 即将发送 openSidePanel 消息');
        chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
          console.log('[ui-manager] openSidePanel 回调，lastError =', chrome.runtime.lastError, ', response =', response);
          if (chrome.runtime.lastError) {
            console.error('[ui-manager] 打开侧边栏出错:', chrome.runtime.lastError.message);
          }
        });
      } else {
        console.log('[ui-manager] 即将发送 closeSidePanel 消息');
        chrome.runtime.sendMessage({ action: 'closeSidePanel' }, (response) => {
          console.log('[ui-manager] closeSidePanel 回调，lastError =', chrome.runtime.lastError, ', response =', response);
          if (chrome.runtime.lastError) {
            console.error('[ui-manager] 关闭侧边栏出错:', chrome.runtime.lastError.message);
          }
        });
      }
      
      return true;
    } finally {
      // 无论成功与否，都重置正在注入标志
      (window as any).__uiManagerInjecting = false;
    }
  }
  
  /**
   * 设置翻译激活状态
   * 按照架构文档C3-C9的流程实现
   */
  public setTranslateActive(active: boolean): void {
    console.log(`[ui-manager] 设置翻译状态: ${active}`);
    
    // C4: 更新 this.state.translateActive
    this.state.translateActive = active;
    
    // C5: 调用 updateTranslateButtonState
    this.updateTranslateButtonState(active);
    
    // C6: 保存到 chrome.storage.sync
    chrome.storage.sync.set({ translateActive: active }, () => {
      console.log(`[ui-manager] 已保存翻译状态: ${active}`);
    });
    
    // C7-C9: 根据翻译状态发出相应事件
    if (active) {
      console.log('[ui-manager] 翻译已激活，发出translation:start_requested事件');
      // C9: 发出 translation:start_requested
      this.eventBus.emit('translation:start_requested', {
        source: 'ui_button',
        timestamp: Date.now()
      });
    } else {
      console.log('[ui-manager] 翻译已停用，发出translation:stop_requested事件');
      // C8: 发出 translation:stop_requested  
      this.eventBus.emit('translation:stop_requested', {
        source: 'ui_button',
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * 更新翻译按钮状态
   */
  private updateTranslateButtonState(active: boolean): void {
    // 如果按钮图标不存在，无需更新
    if (!this.translateToggleButtonIcon) {
      return;
    }
    
    // 更新图标
    this.translateToggleButtonIcon.src = active ? this.ON_ICON_URL : this.OFF_ICON_URL;
    
    // 更新提示文本
    const button = document.getElementById('vid-translate-toggle-button');
    if (button) {
      button.title = active ? '关闭翻译' : '开启翻译';
      button.setAttribute('aria-label', active ? '关闭翻译' : '开启翻译');
      button.dataset.tooltipText = active ? '关闭翻译' : '开启翻译';
    }
  }
  
  /**
   * 更新设置按钮状态
   */
  private updateSettingsButtonState(open: boolean): void {
    if (!this.settingToggleButtonIcon) {
      return;
    }
    // 更新图标
    this.settingToggleButtonIcon.src = open ? this.ACTIVE_SETTING_ICON_URL : this.SETTING_ICON_URL;
    // 更新提示文本
    const button = document.getElementById('vid-translate-settings-button');
    if (button) {
      button.title = open ? '关闭翻译设置' : '翻译设置';
      button.setAttribute('aria-label', open ? '关闭翻译设置' : '翻译设置');
      button.dataset.tooltipText = open ? '关闭翻译设置' : '翻译设置';
    }
  }
  
  /**
   * 设置设置面板打开状态
   * @param open 是否打开
   * @param source 调用来源，用于优化消息发送逻辑
   */
  public setSettingPanelOpen(open: boolean, source: string = 'user-action'): void {
    console.log(`[ui-manager] 设置设置面板状态: ${open}, 来源: ${source}`);
    this.state.settingPanelOpen = open;
    // 更新按钮图标和提示
    this.updateSettingsButtonState(open);
    // 保存状态到存储
    chrome.storage.sync.set({ settingPanelOpen: open }, () => {
      console.log(`[ui-manager] 已保存设置面板状态: ${open}`);
    });
    
    // 根据状态和来源决定是否发送消息到background
    if (open) {
      console.log('[ui-manager] 即将发送 openSidePanel 消息');
      chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
        console.log('[ui-manager] openSidePanel 回调，lastError =', chrome.runtime.lastError, ', response =', response);
        if (chrome.runtime.lastError) {
          console.error('[ui-manager] 打开侧边栏出错:', chrome.runtime.lastError.message);
        }
      });
    } else {
      // 只有在用户主动关闭时才发送closeSidePanel消息
      // 如果是由于sidepanel检测到关闭而触发的，则跳过发送消息
      if (source === 'user-action') {
        console.log('[ui-manager] 用户主动关闭，发送 closeSidePanel 消息');
      chrome.runtime.sendMessage({ action: 'closeSidePanel' }, (response) => {
        console.log('[ui-manager] closeSidePanel 回调，lastError =', chrome.runtime.lastError, ', response =', response);
        if (chrome.runtime.lastError) {
          console.error('[ui-manager] 关闭侧边栏出错:', chrome.runtime.lastError.message);
        }
      });
      } else {
        console.log(`[ui-manager] 由${source}触发的关闭，跳过发送closeSidePanel消息`);
      }
    }
  }
  
  /**
   * 设置观察器，监听DOM变化
   * 当页面结构变化时自动注入控件
   */
  public setupObserver(): void {
    console.log('[ui-manager] 开始设置DOM变化观察器');
    
    // 防止重复设置观察器
    if ((window as any).__uiManagerObserverSetup) {
      console.log('[ui-manager] DOM变化观察器已经设置过，跳过');
      return;
    }
    
    // 标记已设置
    (window as any).__uiManagerObserverSetup = true;
    
    // 先扫描当前DOM，查看是否已有控件容器
    const currentRightControls = document.querySelector('.ytp-right-controls');
    const currentAutoplayButton = document.querySelector('.ytp-autonav-toggle-button');
    
    // 检查现有按钮
    const existingTranslateButton = document.getElementById('vid-translate-toggle-button');
    const existingSettingsButton = document.getElementById('vid-translate-settings-button');
    
    // 如果按钮已存在，记录状态并跳过注入
    if (existingTranslateButton || existingSettingsButton) {
      console.log('[ui-manager] 观察器初始化时检测到控件已存在', {
        translateButton: !!existingTranslateButton,
        settingsButton: !!existingSettingsButton
      });
      this.state.controlsInjected = true;
      return;
    }
    
    // 执行初始检查，如果必要元素都存在，尝试执行初始注入
    if (currentRightControls && currentAutoplayButton && !this.state.controlsInjected) {
      console.log('[ui-manager] 初始检测到必要元素已存在，安排注入');
      // 使用setTimeout来确保当前执行栈完成后再进行注入，避免干扰DOM观察器的设置
      setTimeout(() => this.tryInjectControls('初始检测'), 0);
    }
    
    // 创建DOM变化观察器
    const observer = new MutationObserver((mutations) => {
      // 如果控件已注入，不触发新的注入
      if (this.state.controlsInjected || 
          document.getElementById('vid-translate-toggle-button') || 
          document.getElementById('vid-translate-settings-button')) {
        return;
      }
      
      // 记录变化的节点，帮助调试
      let hasRelevantChanges = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (node.classList && (
                  node.classList.contains('ytp-right-controls') || 
                  node.classList.contains('ytp-autonav-toggle-button') ||
                  node.classList.contains('html5-video-player')
                )) {
                hasRelevantChanges = true;
                console.log('[ui-manager] 检测到关键元素添加:', node.className);
              }
              
              // 也检查子元素
              const rightControls = node.querySelector('.ytp-right-controls');
              const autoplayButton = node.querySelector('.ytp-autonav-toggle-button');
              if (rightControls || autoplayButton) {
                hasRelevantChanges = true;
                console.log('[ui-manager] 检测到节点内部包含关键元素:', rightControls ? '.ytp-right-controls' : '', autoplayButton ? '.ytp-autonav-toggle-button' : '');
              }
            }
          });
        }
      });
      
      // 只有当有相关变化且控件尚未注入时，才尝试注入
      if (hasRelevantChanges && !this.state.controlsInjected && 
          !document.getElementById('vid-translate-toggle-button') && 
          !document.getElementById('vid-translate-settings-button')) {
        
        // 如果控件未注入，尝试注入
        const rightControls = document.querySelector('.ytp-right-controls');
        const playerContainer = document.querySelector('.html5-video-player');
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
        
        console.log('[ui-manager] DOM变化后的元素状态:', {
          rightControls: !!rightControls,
          playerContainer: !!playerContainer,
          autoplayButton: !!autoplayButton,
          controlsInjected: this.state.controlsInjected,
          translateButtonExists: !!document.getElementById('vid-translate-toggle-button')
        });
        
        // 先检查是否同时存在自动播放按钮和右侧控制栏
        if (autoplayButton && rightControls) {
          this.tryInjectControls('DOM变化检测');
        } else if (rightControls && !autoplayButton) {
          console.log('[ui-manager] 已找到右侧控制栏，但自动播放按钮尚未加载，等待中...');
        } else if (!rightControls) {
          console.log('[ui-manager] 右侧控制栏尚未加载，等待中...');
        }
        
        // 如果找到播放器容器但叠加层不存在，创建叠加层
        if (playerContainer && !this.subtitleOverlayElement) {
          console.log('[ui-manager] 检测到播放器容器，创建字幕叠加层');
          this.createSubtitleOverlay(playerContainer as HTMLElement);
        }
      }
    });
    
    // 开始观察body元素的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true, // 监听属性变化
      attributeFilter: ['class', 'style'] // 仅监听class和style属性
    });
    
    console.log('[ui-manager] 已设置DOM变化观察器');
    
    // 添加超时检查，确保在合理时间后尝试注入
    setTimeout(() => {
      if (!this.state.controlsInjected && 
          !document.getElementById('vid-translate-toggle-button') && 
          !document.getElementById('vid-translate-settings-button')) {
        console.log('[ui-manager] 超时检查 - 控件尚未注入，重新尝试');
        
        const rightControls = document.querySelector('.ytp-right-controls');
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
        
        if (rightControls && autoplayButton) {
          this.tryInjectControls('超时检查');
        } else {
          console.log('[ui-manager] 超时检查 - 必要元素不存在:', {
            rightControls: !!rightControls,
            autoplayButton: !!autoplayButton
          });
        }
      }
    }, 5000); // 5秒后检查
  }
  
  /**
   * 尝试注入控件的统一入口
   * @param source 触发注入的来源
   */
  private tryInjectControls(source: string): void {
    console.log(`[ui-manager] ${source}触发尝试注入控件`);
    this.injectControls().then(success => {
      console.log(`[ui-manager] ${source}触发的注入${success ? '成功' : '失败'}`);
    });
  }
  
  /**
   * 获取状态
   */
  public getState(): UIManagerState {
    return { ...this.state };
  }
} 