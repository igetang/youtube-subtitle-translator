/**
 * @file ui-renderer.ts
 * @description UI渲染器 - 根据组件重构计划.md第2步实现
 * 职责：纯UI渲染，不获取状态，只被动接收状态
 */

/**
 * UI渲染器类
 * 核心原则：
 * - 只做UI创建和更新
 * - 被动接收状态，不主动获取
 * - 不处理业务逻辑，只上报事件
 * - 职责单一：专注UI渲染
 */
export class UIRenderer {
  private coordinator: any = null;
  private uiState: any = {};
  private runtimeState: any = {};

  // UI元素引用
  private translateButton: HTMLElement | null = null;
  private settingsButton: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  
  // 图标引用
  private translateToggleButtonIcon: HTMLImageElement | null = null;
  private settingToggleButtonIcon: HTMLImageElement | null = null;
  
  // 资源URL
  private readonly SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting.svg');
  private readonly ACTIVE_SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting-active.svg');
  private readonly ON_ICON_URL = chrome.runtime.getURL('icons/on.svg');
  private readonly OFF_ICON_URL = chrome.runtime.getURL('icons/off.svg');
  private readonly NORMAL_BORDER_URL = chrome.runtime.getURL('icons/normal-border.svg');

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

    // 开始渲染UI
    this.render(this.uiState);
    this.updateButtonStates(this.runtimeState);

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
      // 按照旧版本顺序：先创建设置按钮，再创建翻译按钮
      this.createSettingsButton();
      this.createTranslateButton();
      this.createTooltip();

      console.log('[UIRenderer] ✅ UI组件渲染完成');
    } catch (error) {
      console.error('[UIRenderer] ❌ UI渲染失败:', error);
    }
  }

  /**
   * 创建翻译按钮
   */
  private createTranslateButton(): void {
    // 检查是否已存在
    if (document.getElementById('vid-translate-toggle-button')) {
      this.translateButton = document.getElementById('vid-translate-toggle-button');
      this.translateToggleButtonIcon = this.translateButton.querySelector('img');
      console.log('[UIRenderer] 翻译按钮已存在，复用现有按钮');
      return;
    }

    // 创建按钮和图标
    const { button, icon } = this.createControlButton(
      'vid-translate-toggle-button',
      '字幕翻译',
      this.OFF_ICON_URL,
      () => this.onButtonClick('translate')
    );

    // 保存引用
    this.translateButton = button;
    this.translateToggleButtonIcon = icon;

    // 插入到YouTube控制栏
    this.insertButtonToControlBar(button);
    
    console.log('[UIRenderer] ✅ 翻译按钮创建完成');
  }

  /**
   * 创建设置按钮
   */
  private createSettingsButton(): void {
    // 检查是否已存在
    if (document.getElementById('vid-translate-settings-button')) {
      this.settingsButton = document.getElementById('vid-translate-settings-button');
      this.settingToggleButtonIcon = this.settingsButton.querySelector('img');
      console.log('[UIRenderer] 设置按钮已存在，复用现有按钮');
      return;
    }

    // 创建按钮和图标
    const { button, icon } = this.createControlButton(
      'vid-translate-settings-button',
      '翻译设置',
      this.SETTING_ICON_URL,
      () => this.onButtonClick('settings')
    );

    // 保存引用
    this.settingsButton = button;
    this.settingToggleButtonIcon = icon;

    // 插入到YouTube控制栏
    this.insertButtonToControlBar(button);
    
    console.log('[UIRenderer] ✅ 设置按钮创建完成');
  }

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

  /**
   * 插入按钮到控制栏（参考旧版本实现）
   */
  private insertButtonToControlBar(button: HTMLElement): void {
    // 查找YouTube右侧控制栏
    const rightControls = document.querySelector('.ytp-right-controls');
    
    if (rightControls) {
      // 参考旧版本：根据按钮ID决定插入位置
      if (button.id === 'vid-translate-settings-button') {
        // 设置按钮插入到第一个原生按钮前面
        const firstNativeButton = rightControls.firstChild;
        rightControls.insertBefore(button, firstNativeButton);
        console.log('[UIRenderer] 设置按钮已插入到控制栏');
      } else if (button.id === 'vid-translate-toggle-button') {
        // 翻译按钮插入到设置按钮前面
        const settingsButton = document.getElementById('vid-translate-settings-button');
        if (settingsButton) {
          rightControls.insertBefore(button, settingsButton);
        } else {
          // 如果设置按钮不存在，插入到第一个位置
          const firstNativeButton = rightControls.firstChild;
          rightControls.insertBefore(button, firstNativeButton);
        }
        console.log('[UIRenderer] 翻译按钮已插入到控制栏');
      }
    } else {
      console.warn('[UIRenderer] 未找到YouTube右侧控制栏，尝试稍后插入');
      // 重试逻辑
      setTimeout(() => this.insertButtonToControlBar(button), 1000);
    }
  }

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
    console.log('[UIRenderer] UI元素已清理');
  }
}