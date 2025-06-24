/**
 * @file ui-renderer.ts
 * @description UI渲染器 - 根据组件重构计划.md第2步实现，集成ui-button-injection-analysis.md设计
 * 职责：纯UI渲染，不获取状态，只被动接收状态，但包含完整的按钮注入机制
 */

/**
 * UI渲染器类
 * 核心原则：
 * - 只做UI创建和更新
 * - 被动接收状态，不主动获取
 * - 不处理业务逻辑，只上报事件
 * - 职责单一：专注UI渲染
 * - 🚀 新增：包含完整的DOM观察、等待和监测机制
 */
export class UIRenderer {
  private coordinator: any = null;
  private uiState: any = {};
  private runtimeState: any = {};

  // UI元素引用
  private translateButton: HTMLElement | null = null;
  private settingsButton: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private subtitleOverlayElement: HTMLDivElement | null = null;
  
  // 图标引用
  private translateToggleButtonIcon: HTMLImageElement | null = null;
  private settingToggleButtonIcon: HTMLImageElement | null = null;
  
  // 资源URL
  private readonly SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting.svg');
  private readonly ACTIVE_SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting-active.svg');
  private readonly ON_ICON_URL = chrome.runtime.getURL('icons/on.svg');
  private readonly OFF_ICON_URL = chrome.runtime.getURL('icons/off.svg');
  private readonly NORMAL_BORDER_URL = chrome.runtime.getURL('icons/normal-border.svg');

  // 🚀 新增：控件监测与恢复机制
  private controlsCheckInterval: number | null = null;
  private readonly CONTROL_CHECK_INTERVAL = 3000; // 每3秒检查一次
  private readonly MAX_INJECTION_ATTEMPTS = 5; // 最大尝试次数
  private readonly INJECTION_RETRY_DELAY = 1000; // 注入重试延迟
  
  // 🚀 新增：状态标志
  private controlsInjected = false;
  private injectionAttempts = 0;
  private observerSetup = false;

  constructor() {
    console.log('[UIRenderer] UI渲染器已创建');
  }

  /**
   * 初始化UI渲染器 - 被动接收状态
   * @param uiState UI状态
   * @param runtimeState 运行时状态
   */
  initialize(uiState: any, runtimeState: any): void {
    console.log('[UIRenderer] 🎨 初始化UI渲染器（被动接收状态）');
    
    this.uiState = uiState || {};
    this.runtimeState = runtimeState || {};

    // 🚀 新增：设置DOM观察器
    this.setupObserver();

    // 开始渲染UI
    this.render(this.uiState);
    this.updateButtonStates(this.runtimeState);

    // 🚀 新增：启动持续监测
    this.startControlsCheck();

    console.log('[UIRenderer] ✅ UI渲染器初始化完成');
  }

  /**
   * 设置协调器引用
   */
  setCoordinator(coordinator: any): void {
    this.coordinator = coordinator;
  }

  /**
   * 只做UI创建
   */
  private render(uiState: any): void {
    console.log('[UIRenderer] 🎨 开始渲染UI组件...');

    // 等待DOM准备好后渲染
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.performRender());
    } else {
      this.performRender();
    }
  }

  /**
   * 执行实际渲染
   */
  private performRender(): void {
    try {
      // 🚀 改进：使用完整的注入机制而非简单创建
      this.injectControls();
      this.createTooltip();

      console.log('[UIRenderer] ✅ UI组件渲染完成');
    } catch (error) {
      console.error('[UIRenderer] ❌ UI渲染失败:', error);
    }
  }

  // 🚀 注意：原有的 createTranslateButton 和 createSettingsButton 方法已被完整的 injectControls 方法取代
  // 这些方法的功能现在集成在 injectControls 中，提供更好的控制和错误处理

  /**
   * 创建提示框
   */
  private createTooltip(): void {
    if (document.getElementById('translate-tooltip')) {
      this.tooltip = document.getElementById('translate-tooltip');
      return;
    }

    const tooltip = document.createElement('div');
    tooltip.id = 'translate-tooltip';
    tooltip.className = 'translate-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      display: none;
    `;

    document.body.appendChild(tooltip);
    this.tooltip = tooltip;
    
    console.log('[UIRenderer] ✅ 提示框创建完成');
  }

  /**
   * 创建控制按钮（参考旧版ui-manager的实现）
   */
  private createControlButton(
    id: string,
    tooltipText: string,
    iconSrc: string,
    clickHandler: () => void
  ): { button: HTMLElement; icon: HTMLImageElement } {
    // 创建按钮元素
    const button = document.createElement('button');
    button.id = id;
    button.className = 'ytp-button';
    button.title = tooltipText;
    button.setAttribute('aria-label', tooltipText);
    button.style.cssText = `
      position: relative;
      display: inline-block;
      width: 48px;
      height: 48px;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
      margin: 0;
      overflow: hidden;
    `;

    // 创建边框图像
    const border = this.createBorderImage();
    button.appendChild(border);

    // 创建图标图像
    const icon = this.createIconImage(iconSrc, tooltipText);
    button.appendChild(icon);

    // 添加点击事件
    button.addEventListener('click', clickHandler);

    return { button, icon };
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

  // 🚀 注意：原有的 insertButtonToControlBar 方法已被集成到 injectControls 中
  // 新的注入逻辑提供了更好的等待机制、错误处理和状态管理

  /**
   * 更新按钮状态 - 基于传入的状态
   */
  private updateButtonStates(runtimeState: any): void {
    if (!runtimeState) return;

    const isTranslateActive = runtimeState.translateActive === true || 
                             runtimeState.translateActive === 'active';
    
    if (this.translateButton) {
      this.updateTranslateButton(isTranslateActive);
    }

    const isSettingPanelOpen = runtimeState.settingPanelOpen === true;
    if (this.settingsButton) {
      this.updateSettingsButton(isSettingPanelOpen);
    }

    console.log('[UIRenderer] ✅ 按钮状态已更新:', {
      translateActive: isTranslateActive,
      settingPanelOpen: isSettingPanelOpen
    });
  }

  /**
   * 只做UI更新
   */
  update(changes: Partial<any>): void {
    console.log('[UIRenderer] 🔄 更新UI状态:', changes);

    if (changes.translateActive !== undefined) {
      this.runtimeState.translateActive = changes.translateActive;
      this.updateTranslateButton(changes.translateActive);
    }

    if (changes.settingPanelOpen !== undefined) {
      this.runtimeState.settingPanelOpen = changes.settingPanelOpen;
      this.updateSettingsButton(changes.settingPanelOpen);
    }

    if (changes.controlsInjected !== undefined) {
      this.uiState.controlsInjected = changes.controlsInjected;
    }
  }

  /**
   * 更新翻译按钮状态
   */
  private updateTranslateButton(isActive: boolean): void {
    if (this.translateToggleButtonIcon) {
      // 更新图标
      this.translateToggleButtonIcon.src = isActive ? this.ON_ICON_URL : this.OFF_ICON_URL;
    }
    
    if (this.translateButton) {
      // 更新标题和属性
      const tooltipText = isActive ? '关闭翻译' : '开启翻译';
      this.translateButton.title = tooltipText;
      this.translateButton.setAttribute('aria-label', tooltipText);
      
      console.log(`[UIRenderer] 翻译按钮状态更新: ${isActive ? '激活' : '未激活'}`);
    }
  }

  /**
   * 更新设置按钮状态
   */
  private updateSettingsButton(isOpen: boolean): void {
    if (this.settingToggleButtonIcon) {
      // 更新图标
      this.settingToggleButtonIcon.src = isOpen ? this.ACTIVE_SETTING_ICON_URL : this.SETTING_ICON_URL;
    }
    
    if (this.settingsButton) {
      // 更新标题和属性
      const tooltipText = isOpen ? '关闭翻译设置' : '翻译设置';
      this.settingsButton.title = tooltipText;
      this.settingsButton.setAttribute('aria-label', tooltipText);
      
      console.log(`[UIRenderer] 设置按钮状态更新: ${isOpen ? '打开' : '关闭'}`);
    }
  }

  /**
   * 刷新UI
   */
  refresh(newUiState?: any): void {
    console.log('[UIRenderer] 🔄 刷新UI');
    if (newUiState) {
      this.uiState = newUiState;
    }
    this.performRender();
  }

  /**
   * 不处理业务逻辑，只上报事件
   */
  private onButtonClick(buttonType: string): void {
    const currentState = buttonType === 'translate' ? 
      (this.runtimeState.translateActive || false) : 
      (this.runtimeState.settingPanelOpen || false);
    
    console.log(`[UIRenderer] ${buttonType}按钮被点击，当前状态:`, currentState);
    
    // 不处理业务逻辑，只通知协调器
    if (this.coordinator) {
      this.coordinator.handleUserAction('buttonClick', {
        buttonType,
        currentState
      });
    } else {
      console.warn('[UIRenderer] 协调器未设置，无法上报按钮点击事件');
    }
  }

  /**
   * 获取当前UI状态
   */
  getState(): any {
    return {
      ...this.uiState,
      translateButtonExists: !!this.translateButton,
      settingsButtonExists: !!this.settingsButton,
      tooltipExists: !!this.tooltip
    };
  }

  /**
   * 清理UI元素
   */
  cleanup(): void {
    // 停止监测
    this.stopControlsCheck();
    
    if (this.translateButton) {
      this.translateButton.remove();
      this.translateButton = null;
    }
    if (this.settingsButton) {
      this.settingsButton.remove();
      this.settingsButton = null;
    }
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
    if (this.subtitleOverlayElement) {
      this.subtitleOverlayElement.remove();
      this.subtitleOverlayElement = null;
    }
    console.log('[UIRenderer] UI元素已清理');
  }

  // ======================== 🚀 新增：核心注入机制 ========================

  /**
   * 🚀 设置DOM观察器，监听YouTube控制栏变化
   * 按照ui-button-injection-analysis.md设计实现
   */
  setupObserver(): void {
    console.log('[UIRenderer] 🔍 设置DOM变化观察器');
    
    // 防止重复设置观察器
    if (this.observerSetup) {
      console.log('[UIRenderer] DOM观察器已设置，跳过重复设置');
      return;
    }
    
    this.observerSetup = true;
    
    // 先扫描当前DOM，查看是否已有控件容器
    const currentRightControls = document.querySelector('.ytp-right-controls');
    const currentAutoplayButton = document.querySelector('.ytp-autonav-toggle-button');
    
    // 检查现有按钮
    const existingTranslateButton = document.getElementById('vid-translate-toggle-button');
    const existingSettingsButton = document.getElementById('vid-translate-settings-button');
    
    // 如果按钮已存在，记录状态并跳过注入
    if (existingTranslateButton || existingSettingsButton) {
      console.log('[UIRenderer] 观察器初始化时检测到控件已存在', {
        translateButton: !!existingTranslateButton,
        settingsButton: !!existingSettingsButton
      });
      this.controlsInjected = true;
      return;
    }
    
    // 执行初始检查，如果必要元素都存在，尝试执行初始注入
    if (currentRightControls && currentAutoplayButton && !this.controlsInjected) {
      console.log('[UIRenderer] 初始检测到必要元素已存在，安排注入');
      setTimeout(() => this.tryInjectControls('初始检测'), 0);
    }
    
    // 创建DOM变化观察器
    const observer = new MutationObserver((mutations) => {
      // 如果控件已注入，不触发新的注入
      if (this.controlsInjected || 
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
                console.log('[UIRenderer] 检测到关键元素添加:', node.className);
              }
              
              // 也检查子元素
              const rightControls = node.querySelector('.ytp-right-controls');
              const autoplayButton = node.querySelector('.ytp-autonav-toggle-button');
              if (rightControls || autoplayButton) {
                hasRelevantChanges = true;
                console.log('[UIRenderer] 检测到节点内部包含关键元素:', rightControls ? '.ytp-right-controls' : '', autoplayButton ? '.ytp-autonav-toggle-button' : '');
              }
            }
          });
        }
      });
      
      // 只有当有相关变化且控件尚未注入时，才尝试注入
      if (hasRelevantChanges && !this.controlsInjected && 
          !document.getElementById('vid-translate-toggle-button') && 
          !document.getElementById('vid-translate-settings-button')) {
        
        const rightControls = document.querySelector('.ytp-right-controls');
        const playerContainer = document.querySelector('.html5-video-player');
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
        
        console.log('[UIRenderer] DOM变化后的元素状态:', {
          rightControls: !!rightControls,
          playerContainer: !!playerContainer,
          autoplayButton: !!autoplayButton,
          controlsInjected: this.controlsInjected,
          translateButtonExists: !!document.getElementById('vid-translate-toggle-button')
        });
        
        // 检查是否同时存在自动播放按钮和右侧控制栏
        if (autoplayButton && rightControls) {
          this.tryInjectControls('DOM变化检测');
        } else if (rightControls && !autoplayButton) {
          console.log('[UIRenderer] 已找到右侧控制栏，但自动播放按钮尚未加载，等待中...');
        } else if (!rightControls) {
          console.log('[UIRenderer] 右侧控制栏尚未加载，等待中...');
        }
        
        // 如果找到播放器容器但叠加层不存在，创建叠加层
        if (playerContainer && !this.subtitleOverlayElement) {
          console.log('[UIRenderer] 检测到播放器容器，创建字幕叠加层');
          this.createSubtitleOverlay(playerContainer as HTMLElement);
        }
      }
    });
    
    // 开始观察body元素的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    console.log('[UIRenderer] ✅ DOM变化观察器已设置');
    
    // 添加超时检查，确保在合理时间后尝试注入
    setTimeout(() => {
      if (!this.controlsInjected && 
          !document.getElementById('vid-translate-toggle-button') && 
          !document.getElementById('vid-translate-settings-button')) {
        console.log('[UIRenderer] 超时检查 - 控件尚未注入，重新尝试');
        
        const rightControls = document.querySelector('.ytp-right-controls');
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
        
        if (rightControls && autoplayButton) {
          this.tryInjectControls('超时检查');
        } else {
          console.log('[UIRenderer] 超时检查 - 必要元素不存在:', {
            rightControls: !!rightControls,
            autoplayButton: !!autoplayButton
          });
        }
      }
    }, 5000); // 5秒后检查
  }

  /**
   * 🚀 等待YouTube自动播放按钮加载完成
   * 按照ui-button-injection-analysis.md设计实现
   */
  private waitForAutoplayButton(): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      // 首先尝试立即查找
      const autoplayButton = document.querySelector('.ytp-autonav-toggle-button') as HTMLElement;
      
      if (autoplayButton) {
        console.log('[UIRenderer] 已找到自动播放按钮');
        resolve(autoplayButton);
        return;
      }
      
      console.log('[UIRenderer] 未立即找到自动播放按钮，开始监听DOM变化...');
      
      // 如果未找到，使用MutationObserver监视
      const observer = new MutationObserver((mutations, obs) => {
        const foundButton = document.querySelector('.ytp-autonav-toggle-button') as HTMLElement;
        
        if (foundButton) {
          console.log('[UIRenderer] 自动播放按钮加载完成');
          obs.disconnect();
          resolve(foundButton);
        }
      });
      
      // 设置超时，最多等待3秒
      setTimeout(() => {
        observer.disconnect();
        console.log('[UIRenderer] 等待自动播放按钮超时');
        
        const finalButton = document.querySelector('.ytp-autonav-toggle-button') as HTMLElement;
        console.log('[UIRenderer] 等待超时时元素状态:', {
          autoplayButton: !!finalButton,
          rightControls: !!document.querySelector('.ytp-right-controls')
        });
        
        resolve(finalButton);
      }, 3000);
      
      // 开始观察
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      console.log('[UIRenderer] 开始监听自动播放按钮');
    });
  }

  /**
   * 🚀 启动控件持续监测
   * 按照ui-button-injection-analysis.md设计实现
   */
  private startControlsCheck(): void {
    // 如果已经在监测中，不重复启动
    if (this.controlsCheckInterval !== null) {
      return;
    }
    
    console.log('[UIRenderer] 🔄 启动控件持续监测');
    
    this.controlsCheckInterval = window.setInterval(() => {
      // 只有在控件已注入的情况下才检查
      if (this.controlsInjected) {
        const translateButton = document.getElementById('vid-translate-toggle-button');
        const settingsButton = document.getElementById('vid-translate-settings-button');
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
        const rightControls = document.querySelector('.ytp-right-controls');
        
        // 如果按钮丢失并且自动播放按钮和右侧控制栏都存在，尝试重新注入
        if ((!translateButton || !settingsButton) && autoplayButton && rightControls) {
          console.log('[UIRenderer] 检测到控件丢失且界面就绪，尝试重新注入');
          
          // 重置注入状态
          this.controlsInjected = false;
          this.injectionAttempts = 0;
          
          // 尝试重新注入
          this.injectControls().then(success => {
            if (success) {
              console.log('[UIRenderer] 控件已成功恢复');
            }
          });
        } else if (!translateButton || !settingsButton) {
          console.log('[UIRenderer] 检测到控件丢失，但界面尚未就绪，等待中...');
        }
      }
    }, this.CONTROL_CHECK_INTERVAL);
  }

  /**
   * 🚀 停止控件持续监测
   */
  private stopControlsCheck(): void {
    if (this.controlsCheckInterval !== null) {
      window.clearInterval(this.controlsCheckInterval);
      this.controlsCheckInterval = null;
      console.log('[UIRenderer] 🛑 已停止控件持续监测');
    }
  }

  /**
   * 🚀 注入控件的核心方法
   * 按照ui-button-injection-analysis.md设计实现完整的注入流程
   */
  async injectControls(): Promise<boolean> {
    console.log(`[UIRenderer] 注入控件，当前状态: controlsInjected=${this.controlsInjected}, 尝试次数=${this.injectionAttempts}`);
    
    // 检查和清理已存在的按钮
    const existingTranslateButton = document.getElementById('vid-translate-toggle-button');
    const existingSettingsButton = document.getElementById('vid-translate-settings-button');
    
    if (existingTranslateButton || existingSettingsButton) {
      console.log('[UIRenderer] 检测到已存在的按钮，清理后重新注入', {
        translateButton: !!existingTranslateButton,
        settingsButton: !!existingSettingsButton
      });
      
      if (existingTranslateButton) {
        existingTranslateButton.remove();
      }
      if (existingSettingsButton) {
        existingSettingsButton.remove();
      }
      
      this.controlsInjected = false;
    }
    
    // 检查注入尝试次数
    if (this.injectionAttempts >= this.MAX_INJECTION_ATTEMPTS) {
      console.warn('[UIRenderer] 达到最大注入尝试次数，放弃注入');
      return false;
    }
    
    // 增加尝试计数
    this.injectionAttempts++;
    
    // 等待自动播放按钮加载完成，作为界面就绪的信号
    const autoplayButton = await this.waitForAutoplayButton();
    if (!autoplayButton) {
      console.log('[UIRenderer] 未找到自动播放按钮，稍后重试');
      setTimeout(() => {
        this.injectControls();
      }, this.INJECTION_RETRY_DELAY);
      return false;
    }
    
    // 查找右侧控制栏
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) {
      console.log('[UIRenderer] 未找到.ytp-right-controls，稍后重试');
      setTimeout(() => {
        this.injectControls();
      }, this.INJECTION_RETRY_DELAY);
      return false;
    }
    
    // 再次检查是否已经注入（避免竞态条件）
    if (document.getElementById('vid-translate-toggle-button') || 
        document.getElementById('vid-translate-settings-button')) {
      console.log('[UIRenderer] 在注入过程中检测到控件已存在，避免重复注入');
      this.controlsInjected = true;
      this.startControlsCheck();
      return true;
    }
    
    // 确保字幕叠加层存在
    const playerContainer = document.querySelector('.html5-video-player');
    if (playerContainer && !this.subtitleOverlayElement) {
      this.createSubtitleOverlay(playerContainer as HTMLElement);
    }
    
    // 获取插入参照点
    const firstNativeButton = rightControls.firstChild;
    console.log('[UIRenderer] 插入参照点:', firstNativeButton ? '找到第一个原生按钮' : '未找到参照点');
    
    // 🚀 按照设计文档：先创建设置按钮，再创建翻译按钮
    
    // 1. 创建设置按钮
    const { button: settingsButton, icon: settingsIcon } = this.createControlButton(
      'vid-translate-settings-button',
      this.runtimeState.settingPanelOpen ? '关闭翻译设置' : '翻译设置',
      this.runtimeState.settingPanelOpen ? this.ACTIVE_SETTING_ICON_URL : this.SETTING_ICON_URL,
      () => this.onButtonClick('settings')
    );
    
    // 保存设置图标引用
    this.settingToggleButtonIcon = settingsIcon;
    this.settingsButton = settingsButton;
    
    // 2. 创建翻译按钮
    const isActive = this.runtimeState.translateActive === true || 
                     this.runtimeState.translateActive === 'active';
    const { button: translateButton, icon: toggleIcon } = this.createControlButton(
      'vid-translate-toggle-button',
      isActive ? '关闭翻译' : '开启翻译',
      isActive ? this.ON_ICON_URL : this.OFF_ICON_URL,
      () => this.onButtonClick('translate')
    );
    
    // 保存翻译图标引用
    this.translateToggleButtonIcon = toggleIcon;
    this.translateButton = translateButton;
    
    // 🚀 按照设计文档：正确的插入顺序
    // 先插入设置按钮到第一个原生按钮前面
    rightControls.insertBefore(settingsButton, firstNativeButton);
    console.log('[UIRenderer] 已注入设置按钮');
    
    // 再插入翻译按钮到设置按钮前面
    rightControls.insertBefore(translateButton, settingsButton);
    console.log('[UIRenderer] 已注入翻译按钮');
    
    // 更新状态标志
    this.controlsInjected = true;
    this.injectionAttempts = 0; // 重置尝试次数
    
    // 启动控件持续监测
    this.startControlsCheck();
    
    console.log('[UIRenderer] ✅ 控件注入完成');
    
    return true;
  }

  /**
   * 🚀 尝试注入控件的统一入口
   */
  private tryInjectControls(source: string): void {
    console.log(`[UIRenderer] ${source}触发尝试注入控件`);
    this.injectControls().then((success: boolean) => {
      console.log(`[UIRenderer] ${source}触发的注入${success ? '成功' : '失败'}`);
    });
  }

  /**
   * 🚀 创建字幕叠加层
   */
  private createSubtitleOverlay(playerContainer: HTMLElement): HTMLDivElement {
    // 如果已经创建，直接返回
    if (this.subtitleOverlayElement) {
      return this.subtitleOverlayElement;
    }
    
    // 创建叠加层
    const overlay = document.createElement('div');
    overlay.id = 'yt-translate-subtitle-overlay';
    overlay.style.cssText = `
      position: absolute;
      bottom: 60px;
      left: 0;
      right: 0;
      text-align: center;
      z-index: 100;
      pointer-events: none;
      transition: bottom 0.3s ease;
      visibility: hidden;
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
      visibility: hidden;
    `;
    
    // 创建翻译文本元素
    const translatedText = document.createElement('div');
    translatedText.className = 'translated-text';
    translatedText.style.cssText = `
      font-weight: bold;
      white-space: pre-wrap;
    `;
    
    // 创建原文文本元素
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
    
    console.log('[UIRenderer] ✅ 已创建字幕叠加层');
    
    return overlay;
  }
}