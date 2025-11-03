/**
 * @file ui-renderer.ts
 * @description UI渲染器 - 纯被动渲染器，彻底消除重复注入源头
 * 职责：只做UI创建和更新，不包含任何主动检测逻辑
 */

/**
 * UI渲染器类
 * 核心原则：
 * - 只做UI创建和更新（纯被动）
 * - 被动接收状态，不主动获取
 * - 不处理业务逻辑，只上报事件
 * - 不包含DOM观察、等待、监测等主动逻辑
 * - 职责单一：专注UI渲染，由ContentScriptCoordinator负责时机决策
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

  // 🚀 移除：控件监测与恢复机制已移动到ContentScriptCoordinator
  // 🚀 移除：状态标志管理已移动到ContentScriptCoordinator

  constructor() {
    // UI渲染器已创建（无需打印）
  }

  /**
   * 初始化UI渲染器 - 纯被动接收状态
   * @param uiState UI状态
   * @param runtimeState 运行时状态
   */
  initialize(uiState: any, runtimeState: any): void {
    this.uiState = uiState || {};
    this.runtimeState = runtimeState || {};

    // 🚀 移除：所有主动检测逻辑已移除，等待ContentScriptCoordinator的指令
    // 只初始化tooltip等无关DOM的UI元素
    this.createTooltip();

    console.log('[UIRenderer] ✅ UI渲染器就绪');
  }

  /**
   * 设置协调器引用
   */
  setCoordinator(coordinator: any): void {
    this.coordinator = coordinator;
  }

  /**
   * 🚀 新增：被动创建按钮的公共接口
   * 由ContentScriptCoordinator调用，只负责UI创建
   */
  public async createButtons(): Promise<boolean> {
    try {
      // 检查YouTube控制栏是否就绪
      const rightControls = document.querySelector('.ytp-right-controls');
      if (!rightControls) {
        console.debug('[debug][UIRenderer] YouTube控制栏未就绪，无法创建按钮');
        return false;
      }

      // 检查是否已存在按钮，如存在则清理
      this.cleanupExistingButtons();

      // 创建按钮
      const success = await this.performButtonCreation();

      if (success) {
        console.log('[UIRenderer] ✅ 按钮已创建');
      } else {
        console.log('[UIRenderer] ❌ 按钮创建失败');
      }

      return success;
    } catch (error) {
      console.error('[UIRenderer] ❌ 创建按钮时出错:', error);
      return false;
    }
  }

  /**
   * 🚀 新增：清理现有按钮
   */
  private cleanupExistingButtons(): void {
    const existingTranslateButton = document.getElementById('vid-translate-toggle-button');
    const existingSettingsButton = document.getElementById('vid-translate-settings-button');
    
    if (existingTranslateButton || existingSettingsButton) {
      console.log('[UIRenderer] 清理现有按钮');
      existingTranslateButton?.remove();
      existingSettingsButton?.remove();
      
      // 清理引用
      this.translateButton = null;
      this.settingsButton = null;
      this.translateToggleButtonIcon = null;
      this.settingToggleButtonIcon = null;
    }
  }

  /**
   * 🚀 新增：执行按钮创建的核心逻辑
   */
  private async performButtonCreation(): Promise<boolean> {
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return false;

    // 获取插入参照点
    const firstNativeButton = rightControls.firstChild;
    
    // 1. 创建设置按钮
    const { button: settingsButton, icon: settingsIcon } = this.createControlButton(
      'vid-translate-settings-button',
      this.runtimeState.popupOpen ? '关闭翻译设置' : '翻译设置',
      this.runtimeState.popupOpen ? this.ACTIVE_SETTING_ICON_URL : this.SETTING_ICON_URL,
      () => this.onButtonClick('settings')
    );
    
    // 2. 创建翻译按钮（基于3状态系统）
    const translateState = this.runtimeState.translateActive || 'inactive';
    const isActive = translateState === 'active';
    const isPending = translateState === 'pending';
    
    // 根据状态决定图标和提示文本
    let buttonIcon = this.OFF_ICON_URL;  // 默认关闭图标
    let buttonTooltip = '点击开启翻译';  // 默认提示
    
    if (isActive) {
      buttonIcon = this.ON_ICON_URL;
      buttonTooltip = '翻译已开启';
    } else if (isPending) {
      buttonIcon = this.OFF_ICON_URL;  // PENDING时暂时显示关闭图标，后续添加动画
      buttonTooltip = '处理中...';
    }
    
    const { button: translateButton, icon: toggleIcon } = this.createControlButton(
      'vid-translate-toggle-button',
      buttonTooltip,
      buttonIcon,
      () => this.onButtonClick('translate')
    );
    
    // 3. 按正确顺序插入按钮
    rightControls.insertBefore(settingsButton, firstNativeButton);
    rightControls.insertBefore(translateButton, settingsButton);
    
    // 4. 保存引用
    this.settingsButton = settingsButton;
    this.settingToggleButtonIcon = settingsIcon;
    this.translateButton = translateButton;
    this.translateToggleButtonIcon = toggleIcon;
    
    // 5. 确保字幕叠加层存在
    const playerContainer = document.querySelector('.html5-video-player');
    if (playerContainer && !this.subtitleOverlayElement) {
      this.createSubtitleOverlay(playerContainer as HTMLElement);
    }
    
    return true;
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
      vertical-align: top;
      align-self: center;
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
   * 更新按钮状态 - 基于传入的状态（3状态系统）
   */
  private updateButtonStates(runtimeState: any): void {
    if (!runtimeState) return;

    const translateState = runtimeState.translateActive || 'inactive';
    
    if (this.translateButton) {
      this.updateTranslateButtonWithState(translateState);
    }

    const isPopupOpen = runtimeState.popupOpen === true;
    if (this.settingsButton) {
      this.updateSettingsButton(isPopupOpen);
    }

    console.log('[UIRenderer] ✅ 按钮状态已更新:', {
      translateActive: translateState,
      popupOpen: isPopupOpen
    });
  }

  /**
   * 只做UI更新
   */
  update(changes: Partial<any>): void {
    // 合并所有状态更新为一条日志
    const updates: string[] = [];

    if (changes.translateActive !== undefined) {
      this.runtimeState.translateActive = changes.translateActive;
      // 直接使用枚举状态值，而不是转换为布尔值
      this.updateTranslateButtonWithState(changes.translateActive);
      updates.push(`翻译:${changes.translateActive}`);
    }

    if (changes.popupOpen !== undefined) {
      this.runtimeState.popupOpen = changes.popupOpen;
      this.updateSettingsButton(changes.popupOpen);
      updates.push(`设置:${changes.popupOpen ? '开' : '关'}`);
    }

    if (changes.controlsInjected !== undefined) {
      this.uiState.controlsInjected = changes.controlsInjected;
      updates.push(`控件:${changes.controlsInjected ? '已注入' : '未注入'}`);
    }

    // 只输出一条汇总日志
    if (updates.length > 0) {
      console.log(`[UIRenderer] ✅ UI更新: ${updates.join(', ')}`);
    }
  }

  /**
   * 更新翻译按钮状态（基于3状态系统）
   */
  private updateTranslateButtonWithState(state: string): void {
    if (!this.translateButton || !this.translateToggleButtonIcon) return;

    // 根据状态更新图标和提示
    let buttonIcon = this.OFF_ICON_URL;
    let buttonTooltip = '点击开启翻译';
    let isClickable = true;
    
    switch (state) {
      case 'active':
        buttonIcon = this.ON_ICON_URL;
        buttonTooltip = '翻译已开启';
        break;
      case 'pending':
        buttonIcon = this.OFF_ICON_URL;  // 后续可以添加加载动画
        buttonTooltip = '处理中...';
        isClickable = false;  // PENDING状态不可点击
        break;
      case 'inactive':
      default:
        buttonIcon = this.OFF_ICON_URL;
        buttonTooltip = '点击开启翻译';
        break;
    }
    
    // 更新图标
    this.translateToggleButtonIcon.src = buttonIcon;
    // 更新提示文本
    this.translateButton.title = buttonTooltip;
    this.translateButton.setAttribute('aria-label', buttonTooltip);
    // 更新可点击状态
    this.translateButton.style.pointerEvents = isClickable ? 'auto' : 'none';
    this.translateButton.style.opacity = isClickable ? '1' : '0.5';
    
    // 注释掉冗余日志，已在update方法中输出
    // console.log(`[UIRenderer] 翻译按钮状态更新: ${state}`);
  }
  
  /**
   * 更新翻译按钮状态（兼容旧调用）
   */
  private updateTranslateButton(isActive: boolean): void {
    // 将布尔值转换为状态枚举
    const state = isActive ? 'active' : 'inactive';
    this.updateTranslateButtonWithState(state);
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
      
      // 注释掉冗余日志，已在update方法中输出
      // console.log(`[UIRenderer] 设置按钮状态更新: ${isOpen ? '打开' : '关闭'}`);
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
    // UIRenderer现在是纯被动的，不主动执行渲染
    // 刷新由ContentScriptCoordinator通过createButtons()调用
  }

  /**
   * 不处理业务逻辑，只上报事件
   */
  private onButtonClick(buttonType: string): void {
    // 获取当前状态（翻译使用枚举值，设置面板仍用布尔值）
    const currentState = buttonType === 'translate' ? 
      (this.runtimeState.translateActive || 'inactive') :  // 传递枚举状态
      (this.runtimeState.popupOpen || false);
    
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

  // 🚀 移除：DOM观察器设置已移动到ContentScriptCoordinator

  // 🚀 移除：等待按钮逻辑已移动到ContentScriptCoordinator

  // 🚀 移除：控件持续监测已移动到ContentScriptCoordinator

  // 🚀 移除：停止监测已移动到ContentScriptCoordinator

  // 🚀 移除：完整注入流程已移动到ContentScriptCoordinator

  // 🚀 移除：统一注入入口已移动到ContentScriptCoordinator

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