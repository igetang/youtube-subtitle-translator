/**
 * @file ui-manager.ts
 * @description YouTube播放器控件注入管理，负责创建和插入UI元素
 */

import { 
  initializeMessageSystem, 
  MessageType, 
  MessageSender,
  getMessageSystem 
} from '../messages/messages';
import { SharedMessageSystem } from '../messages/message-system-shared';
import { MessageHandlerCallbacks } from '../messages/message-handlers';
import { TranslateActiveState } from '../types/runtime-state-types';
import { UIActionEvent } from '../types/message-types';

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

// UIManagerState接口已移至 ../types/component-types.ts 统一管理
import type { UIManagerState } from '../types/component-types';
import { DEFAULT_UI_MANAGER_STATE } from '../types/component-types';

/**
 * YouTube播放器UI控件管理器
 * 负责注入翻译按钮和设置按钮
 */
export class UIManager {
  private static instance: UIManager;
  private messageBus: any;
  private messageHandlers: any;
  private state: UIManagerState;
  
  // 资源URL
  private readonly SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting.svg');
  private readonly ACTIVE_SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting-active.svg');
  private readonly ON_ICON_URL = chrome.runtime.getURL('icons/on.svg');
  private readonly OFF_ICON_URL = chrome.runtime.getURL('icons/off.svg');
  private readonly NORMAL_BORDER_URL = chrome.runtime.getURL('icons/normal-border.svg');
  
  // UI控件引用
  private translateToggleButtonIcon: HTMLImageElement | null = null;
  private settingToggleButtonIcon: HTMLImageElement | null = null;
  private subtitleOverlayElement: HTMLDivElement | null = null;
  
  // 防止重复加载状态的标志
  private isLoadingState: boolean = false;
  private isLoadingTranslateState: boolean = false;
  
  // 🔧 修复：监听器重复注册防护变量
  // 🔥 已移除：SidePanel状态监听器相关变量（由ContentScriptCoordinator统一处理）
  // private sidePanelStateListenerAdded: boolean = false;
  // private sidePanelStateMessageHandler: ... = null;
  
  // Tooltip元素引用
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
    // 🎯 使用共享消息系统实例，避免重复调用和日志
    this.messageBus = SharedMessageSystem.getMessageBus();
    this.messageHandlers = SharedMessageSystem.getMessageHandlers();
    
    if (!this.messageBus || !this.messageHandlers) {
      console.warn('[ui-manager] ⚠️ 共享消息系统尚未初始化，UI管理器可能无法正常工作');
    }
    
    // 🎯 初始化基本状态
    this.state = {
      ...DEFAULT_UI_MANAGER_STATE,
      translateActive: TranslateActiveState.INACTIVE,    // 🔄 使用枚举值
      currentPage: window.location.href,
      isVideoPage: window.location.pathname.includes('/watch')
    };
    
    // 🎯 统一初始化流程 - 避免重复调用
    this.initializeUIManager();
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
   * 统一初始化流程
   * 🔧 确保每个初始化函数只被调用一次，避免重复
   */
  private initializeUIManager(): void {
    console.log('[ui-manager] 开始统一初始化流程...');
    
    try {
      // 1️⃣ 基础组件初始化
      this.ensureTooltipExists();
      
      // 2️⃣ 暂时移除setupCoreEventListeners调用，避免重复日志问题
      // this.setupCoreEventListeners();  // ❌ 暂时禁用
      
      // 🔧 直接调用需要的功能，跳过有问题的handlePageNavigation
      this.startControlsCheck();        // ✅ 启动控件检查（有用）
      this.setupTabSwitchListener();    // ✅ 标签切换监听（有用）
      
      // 3️⃣ 🔥 已移除：SidePanel状态监听器（由ContentScriptCoordinator统一处理）
      // this.setupSidePanelStateListener(); // 已移除，避免重复消息处理
      
      // 4️⃣ 初始状态加载（异步执行，不阻塞构造函数）
      this.loadInitialStates();
      
      console.log('[ui-manager] ✓ 统一初始化完成');
    } catch (error) {
      console.error('[ui-manager] 初始化失败:', error);
    }
  }

  /**
   * 设置核心事件监听器（不包含状态加载逻辑）
   * 🔧 移除重复调用，专注于事件监听设置
   * 
   * ⚠️ 暂时保留但不调用此函数
   * 原因：handlePageNavigation() 在初始化时立即执行导致重复日志
   * 策略：直接调用需要的子功能，跳过有问题的handlePageNavigation
   */
  private setupCoreEventListeners(): void {
    // 监听页面导航事件
    this.handlePageNavigation();  // ❌ 这个调用导致重复日志问题
    
    // 启动控件检查
    this.startControlsCheck();
    
    // 🔧 新增：添加标签切换监听器（visibilitychange）
    this.setupTabSwitchListener();
    
    // ❌ 移除重复调用：this.setupSidePanelStateListener(); 
    // 此函数已在 initializeUIManager() 中单独调用
  }

  /**
   * 异步加载初始状态
   * 🚀 使用统一状态获取机制，一次性获取所有状态
   */
  private async loadInitialStates(): Promise<void> {
    console.log('[ui-manager] 开始加载初始状态...');
    
    try {
      // 🚀 使用统一状态刷新，避免重复调用
      await this.refreshAllStates();
      console.log('[ui-manager] ✓ 初始状态加载完成');
    } catch (error) {
      console.error('[ui-manager] 初始状态加载失败:', error);
      // 设置默认状态
      this.state.translateActive = TranslateActiveState.INACTIVE;
      this.state.popupOpen = false;
    }
  }

  /**
   * 设置标签切换监听器
   * 使用visibilitychange API检测标签激活，主动拉取状态
   * 🔧 优化：避免重复调用状态加载函数
   */
  private setupTabSwitchListener(): void {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        console.log('[ui-manager] 标签页激活，重新同步状态');
        
        // 🔧 优化：使用状态刷新而不是重复加载
        await this.refreshStatesOnTabSwitch();
      }
    });
    
    console.log('[ui-manager] 标签切换监听器已设置');
  }

  /**
   * 标签页切换时的状态刷新
   * 🔧 避免与初始化时的状态加载冲突
   */
  private async refreshStatesOnTabSwitch(): Promise<void> {
    // 防止在加载过程中重复刷新
    if (this.isLoadingState || this.isLoadingTranslateState) {
      console.log('[ui-manager] 状态正在加载中，跳过标签页刷新');
      return;
    }
    
    try {
      // 🔥 使用新的精确状态检测方法
      await this.checkAndSyncSidePanelStatus();
      
      // 🔧 优化：仅在状态可能变化时重新加载翻译状态
      await this.refreshTranslateActiveState();
      
      console.log('[ui-manager] ✓ 标签页状态刷新完成');
    } catch (error) {
      console.error('[ui-manager] 标签页状态刷新失败:', error);
    }
  }

  /**
   * 🚀 统一刷新所有状态（避免重复调用）
   * 一次性获取所有运行时状态，减少消息数量
   */
  private async refreshAllStates(): Promise<void> {
    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'getRuntimeState'  // 获取完整状态，不指定stateKey
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.success) {
        const fullState = response.data || response.state;
        
        // 更新翻译状态
        if (fullState.translateActive !== undefined) {
          const translateState = fullState.translateActive as TranslateActiveState;
          this.state.translateActive = translateState;
          this.updateTranslateButtonState(this.isActiveState(translateState));
          console.log(`[ui-manager] ✓ 翻译状态已刷新: ${translateState}`);
        }
        
        // 更新设置面板状态
        if (fullState.popupOpen !== undefined) {
          const settingOpen = !!fullState.popupOpen;
          this.state.popupOpen = settingOpen;
          this.updateSettingsButtonState(settingOpen);
          console.log(`[ui-manager] ✓ 设置面板状态已刷新: ${settingOpen}`);
        }
        
        console.log('[ui-manager] ✓ 所有状态已统一刷新');
      }
    } catch (error) {
      console.error('[ui-manager] 统一刷新状态失败:', error);
    }
  }

  /**
   * 刷新翻译激活状态（向后兼容方法）
   * 🔧 重定向到统一刷新机制
   */
  private async refreshTranslateActiveState(): Promise<void> {
    console.log('[ui-manager] 重定向到统一状态刷新');
    await this.refreshAllStates();
  }
  
  /**
   * 🔥 已移除：SidePanel状态变化监听器
   * 新架构通过ContentScriptCoordinator统一处理消息，避免重复监听
   * 状态更新改为通过UIRenderer的update()方法被动接收
   */
  // private setupSidePanelStateListener() - 已移除，避免重复消息处理
  
  /**
   * 检查并同步SidePanel状态
   * 使用chrome.sidePanel.getOptions()精确检测状态
   */
  private async checkAndSyncSidePanelStatus(): Promise<void> {
    // 🔧 添加防重复检测机制
    if (this.isLoadingState) {
      console.log('[ui-manager] SidePanel状态检测中，跳过重复请求');
      return;
    }
    
    this.isLoadingState = true;
    
    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'checkSidePanelStatus'
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.success) {
        const isEnabled = response.isEnabled === true;
        console.log(`[ui-manager] 🎯 SidePanel状态检测结果: ${isEnabled}`);
        
        // 更新设置按钮状态
        this.state.popupOpen = isEnabled;
        this.updateSettingsButtonState(isEnabled);
      } else {
        console.warn('[ui-manager] SidePanel状态检测失败:', response?.error);
        // 检测失败时假设未启用
        this.state.popupOpen = false;
        this.updateSettingsButtonState(false);
      }
    } catch (error) {
      console.error('[ui-manager] 检查SidePanel状态失败:', error);
      // 出错时假设未启用
      this.state.popupOpen = false;
      this.updateSettingsButtonState(false);
    } finally {
      this.isLoadingState = false;
    }
  }
  
  /**
   * 🔥 已移除：SidePanel状态监听器清理方法
   * 新架构通过ContentScriptCoordinator统一处理消息，无需独立清理
   */
  // private cleanupSidePanelStateListener() - 已移除

  /**
   * 从存储中加载翻译激活状态
   * 🔄 迁移到RuntimeStateManager：通过background获取翻译状态
   */
  private async loadTranslateActiveState(): Promise<void> {
    if (this.isLoadingTranslateState) {
      console.log('[ui-manager] 翻译状态加载中，跳过重复请求');
      return;
    }
    
    this.isLoadingTranslateState = true;
    
    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'getRuntimeState',
          data: { stateKey: 'translateActive' }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.success) {
        // 直接使用RuntimeState的TranslateActiveState
        const state = response.state as TranslateActiveState;
        this.state.translateActive = state;
        this.updateTranslateButtonState(this.isActiveState(state));
        console.log(`[ui-manager] ✓ loadTranslateActiveState: ${state}`);
      } else {
        console.error(`[ui-manager] 获取翻译状态响应异常: ${response?.error || '未知错误'}`);
        this.state.translateActive = TranslateActiveState.INACTIVE;
        this.updateTranslateButtonState(false);
      }
    } catch (error) {
      console.error('[ui-manager] 从RuntimeStateManager获取翻译状态失败:', error);
      this.state.translateActive = TranslateActiveState.INACTIVE;
      this.updateTranslateButtonState(false);
    } finally {
      this.isLoadingTranslateState = false;
    }
  }
  
  /**
   * 检查状态是否为激活状态（ACTIVE或PENDING）
   * @private
   */
  private isActiveState(state: TranslateActiveState): boolean {
    return state === TranslateActiveState.ACTIVE || state === TranslateActiveState.PENDING;
  }

  /**
   * 获取当前翻译状态的boolean表示（用于向后兼容）
   * @returns {boolean} true表示翻译激活（ACTIVE或PENDING），false表示翻译关闭（INACTIVE）
   */
  public isTranslateActive(): boolean {
    return this.isActiveState(this.state.translateActive);
  }

  /**
   * 从存储中加载设置面板打开状态
   */
  private async loadSettingPanelOpenState(): Promise<void> {
    if (this.isLoadingState) {
      console.log('[ui-manager] 设置面板状态加载中，跳过重复请求');
      return;
    }
    
    this.isLoadingState = true;
    
    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'getRuntimeState',
          data: { stateKey: 'popupOpen' }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.success) {
        const open = !!response.state;
        this.state.popupOpen = open;
        this.updateSettingsButtonState(open);
        console.log(`[ui-manager] ✓ loadSettingPanelOpenState: ${open}`);
      } else {
        console.error(`[ui-manager] 获取设置面板状态响应异常: ${response?.error || '未知错误'}`);
        this.state.popupOpen = false;
        this.updateSettingsButtonState(false);
      }
    } catch (error) {
      console.error('[ui-manager] 从RuntimeStateManager获取设置面板状态失败:', error);
      this.state.popupOpen = false;
      this.updateSettingsButtonState(false);
    } finally {
      this.isLoadingState = false;
    }
  }
  

  
  /**
   * 处理页面导航
   * 🔧 优化：移除重复的状态加载调用
   */
  private handlePageNavigation(): void {
    console.log('[ui-manager] 检测到页面导航，重置UI状态');
    
    // 🔥 已移除：SidePanel状态监听器清理（由ContentScriptCoordinator统一处理）
    // this.cleanupSidePanelStateListener(); // 已移除
    
    // 停止持续监测
    this.stopControlsCheck();
    
    // 移除现有控件
    this.removeExistingControls();
    
    // 重置UI控件状态
    this.state.controlsInjected = false;
    this.state.overlayCreated = false;
    this.state.injectionAttempts = 0;
    this.state.lastError = null;
    
    // 更新页面状态
    this.state.currentPage = window.location.href;
    this.state.isVideoPage = window.location.pathname.includes('/watch');
    
    // 🔧 优化：页面导航时延迟刷新状态，避免与初始化冲突
    console.log('[ui-manager] 页面导航：调度状态刷新...');
    this.scheduleNavigationStateRefresh();
    
    // 清除引用
    this.translateToggleButtonIcon = null;
    this.settingToggleButtonIcon = null;
    this.subtitleOverlayElement = null;
  }

  /**
   * 调度页面导航后的状态刷新
   * 🔧 避免与初始化状态加载产生竞争
   */
  private scheduleNavigationStateRefresh(): void {
    // 延迟执行，确保页面导航完成且不与初始化冲突
    setTimeout(async () => {
      try {
        // 检查是否正在初始化
        if (this.isLoadingState || this.isLoadingTranslateState) {
          console.log('[ui-manager] 初始化进行中，跳过导航状态刷新');
          return;
        }
        
        console.log('[ui-manager] 开始页面导航状态刷新...');
        
        // 🚀 使用统一状态刷新机制，一次获取所有状态
        await this.refreshAllStates();
        
      } catch (error) {
        console.error('[ui-manager] 页面导航状态刷新失败:', error);
        // 设置默认状态
        this.state.translateActive = TranslateActiveState.INACTIVE;
        this.state.popupOpen = false;
      }
    }, 100); // 100ms延迟，确保页面导航完成
  }

  /**
   * 刷新设置面板状态（向后兼容方法）
   * 🔧 重定向到统一刷新机制
   */
  private async refreshSettingPanelState(): Promise<void> {
    console.log('[ui-manager] 重定向到统一状态刷新');
    await this.refreshAllStates();
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
              // ✅ 迁移到MessageBus
              if (this.messageBus) {
                this.messageBus.sendMessage({
                  type: MessageType.UI_STATE_UPDATE,
                  data: {
                    event: UIEvent.CONTROLS_RECOVERED,
                    timestamp: Date.now()
                  }
                });
              }
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
  /**
   * 显示工具提示
   * 支持多行文本和错误信息的长时间显示
   */
  private showTooltip(targetElement: HTMLElement, text: string, displayTime?: number): void {
    // Tooltip元素已在构造函数中创建，不再需要此检查
    if (!this.tooltipContainer || !this.tooltipTextElement) return;
    
    // 清除任何隐藏定时器
    if (this.hideTooltipTimeout) {
      clearTimeout(this.hideTooltipTimeout);
      this.hideTooltipTimeout = null;
    }
    
    // 更新文本 - 优先使用dataset.tooltipText，支持换行符转换
    const tooltipText = targetElement.dataset.tooltipText || text;
    
    // 支持多行文本显示
    if (tooltipText.includes('\n')) {
      this.tooltipTextElement.innerHTML = tooltipText.replace(/\n/g, '<br>');
    } else {
      this.tooltipTextElement.textContent = tooltipText;
    }
    
    // 根据消息类型调整样式
    const isErrorMessage = tooltipText.includes('无法打开') || 
                           tooltipText.includes('失败') || 
                           tooltipText.includes('错误') ||
                           tooltipText.includes('降级');
    
    if (isErrorMessage) {
      // 错误信息使用更宽的tooltip和不同的样式
      this.tooltipContainer.style.maxWidth = '300px';
      this.tooltipContainer.style.backgroundColor = 'rgba(220, 53, 69, 0.95)';
      this.tooltipContainer.style.borderColor = '#dc3545';
    } else {
      // 普通提示保持原有样式
      this.tooltipContainer.style.maxWidth = '200px';
      this.tooltipContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
      this.tooltipContainer.style.borderColor = '#666';
    }
    
    // 技巧: 先设为可见但透明，用于测量尺寸
    this.tooltipContainer.style.visibility = 'hidden';
    this.tooltipContainer.style.display = 'block';
    this.tooltipContainer.style.opacity = '0';
    
    // 计算尺寸和位置
    const tooltipWidth = this.tooltipContainer.offsetWidth;
    const tooltipHeight = this.tooltipContainer.offsetHeight;
    const targetRect = targetElement.getBoundingClientRect();
    
    // 计算位置（目标元素上方居中）
    const centerX = targetRect.left + targetRect.width / 2;
    const topY = targetRect.top;
    let left = centerX - tooltipWidth / 2;
    let top = topY - tooltipHeight - 8; // 动态偏移量
    
    // 边界检查，防止超出视窗
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < 0) left = 8;
    if (left + tooltipWidth > viewportWidth) left = viewportWidth - tooltipWidth - 8;
    if (top < 0) top = targetRect.bottom + 8; // 如果上方放不下，放到下方
    
    // 应用位置
    this.tooltipContainer.style.left = `${left}px`;
    this.tooltipContainer.style.top = `${top}px`;
    
    // 显示并设置为可见
    this.tooltipContainer.style.visibility = 'visible';
    this.tooltipContainer.style.opacity = '1';
    
    // 根据消息类型设置不同的显示时间
    const autoDisplayTime = displayTime || (isErrorMessage ? 8000 : 3000); // 错误信息显示8秒，普通信息3秒
    
    // 设置自动隐藏
    this.hideTooltipTimeout = window.setTimeout(() => {
      this.hideTooltip();
    }, autoDisplayTime);
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
    const button = document.createElement('button');
    button.id = id;
    button.className = 'ytp-button';
    button.title = tooltipText;
    
    // 🔧 修复：添加按钮的基本样式，确保正确的尺寸和布局
    button.style.cssText = `
      position: relative;
      width: 48px;
      height: 48px;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
    `;

    const icon = this.createIconImage(iconSrc, tooltipText);
    button.appendChild(icon);

    // 🔧 修复：使用命名函数引用，便于移除事件监听器
    const clickHandler = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();

      // ✅ 发送一个标准化的UIActionEvent
      this.sendUIMessage('button_click', {
        type: 'button_click',
        payload: {
          buttonType: id.includes('translate') ? 'translate' : 'settings'
        }
      });
    };

    const mouseOverHandler = () => this.showTooltip(button, tooltipText);
    const mouseOutHandler = () => this.hideTooltip();

    // 绑定事件监听器
    button.addEventListener('click', clickHandler);
    button.addEventListener('mouseover', mouseOverHandler);
    button.addEventListener('mouseout', mouseOutHandler);

    // 🔧 修复：将事件处理器存储在元素上，便于后续清理
    (button as any).__eventHandlers = {
      click: clickHandler,
      mouseover: mouseOverHandler,
      mouseout: mouseOutHandler
    };

    return { button, icon };
  }

  /**
   * 🔧 修复：清理按钮的事件监听器
   * @param button 按钮元素
   */
  private cleanupButtonEventListeners(button: HTMLElement): void {
    const handlers = (button as any).__eventHandlers;
    if (handlers) {
      if (handlers.click) {
        button.removeEventListener('click', handlers.click);
      }
      if (handlers.mouseover) {
        button.removeEventListener('mouseover', handlers.mouseover);
      }
      if (handlers.mouseout) {
        button.removeEventListener('mouseout', handlers.mouseout);
      }
      // 清理引用
      delete (button as any).__eventHandlers;
    }
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
    
    // ✅ 触发事件
    this.sendUIMessage(UIEvent.OVERLAY_CREATED, {
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
    
    // 🔧 修复：严格检查和清理已存在的按钮
    const existingTranslateButton = document.getElementById('vid-translate-toggle-button');
    const existingSettingsButton = document.getElementById('vid-translate-settings-button');
    
    // 如果按钮已存在，先清理再重新注入，避免重叠问题
    if (existingTranslateButton || existingSettingsButton) {
      console.log('[ui-manager] 检测到已存在的按钮，清理后重新注入', {
        translateButton: !!existingTranslateButton,
        settingsButton: !!existingSettingsButton
      });
      
      // 🔧 修复：清理已存在的按钮及其事件监听器
      if (existingTranslateButton) {
        this.cleanupButtonEventListeners(existingTranslateButton);
        existingTranslateButton.remove();
        console.log('[ui-manager] 已移除现有的翻译按钮及其事件监听器');
      }
      if (existingSettingsButton) {
        this.cleanupButtonEventListeners(existingSettingsButton);
        existingSettingsButton.remove();
        console.log('[ui-manager] 已移除现有的设置按钮及其事件监听器');
      }
      
      // 重置注入状态，允许重新注入
      this.state.controlsInjected = false;
    }
    
    // 如果状态标记为已注入但实际按钮不存在，也需要重新注入
    if (this.state.controlsInjected && !existingTranslateButton && !existingSettingsButton) {
      console.log('[ui-manager] 状态与实际不符，重置注入状态');
      this.state.controlsInjected = false;
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
        
        // ✅ 触发注入失败事件
        this.sendUIMessage(UIEvent.INJECTION_FAILED, {
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
      
      // 🔧 恢复：按照legacy代码，使用右侧控制栏
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
      
      // 🔧 恢复：按照legacy代码，使用第一个子元素作为参照点
      const firstNativeButton = rightControls.firstChild;
      console.log('[ui-manager] 插入参照点:', firstNativeButton ? '找到第一个原生按钮' : '未找到参照点');
      
      // 1. 创建设置按钮
      const settingsTooltip = this.state.popupOpen
        ? (chrome.i18n.getMessage('tooltip_close_translation_settings') || '关闭翻译设置')
        : (chrome.i18n.getMessage('tooltip_translation_settings') || '翻译设置');
      const { button: settingsButton, icon: settingsIcon } = this.createControlButton(
        'vid-translate-settings-button',
        settingsTooltip,
        this.state.popupOpen ? this.ACTIVE_SETTING_ICON_URL : this.SETTING_ICON_URL,
        () => {
          const newState = !this.state.popupOpen;
          console.log(`[ui-manager] 设置按钮点击，切换状态为: ${newState}`);
          
          // 🔥 关键修复：使用同步函数保持用户手势上下文
          this.setSettingPanelOpen(newState);
        }
      );
      
      // 保存设置图标引用
      this.settingToggleButtonIcon = settingsIcon;
      // 设置数据属性以供CSS选择器使用
      settingsButton.dataset.tooltipText = settingsTooltip;
      
      // 2. 创建翻译按钮
      // 🔧 修复：使用 isActiveState 方法正确判断翻译状态
      const isActive = this.isActiveState(this.state.translateActive);
      const translateTooltip = isActive
        ? (chrome.i18n.getMessage('tooltip_disable_translation_button') || '关闭翻译')
        : (chrome.i18n.getMessage('tooltip_enable_translation_button') || '开启翻译');
      const { button: translateButton, icon: toggleIcon } = this.createControlButton(
        'vid-translate-toggle-button',
        translateTooltip,
        isActive ? this.ON_ICON_URL : this.OFF_ICON_URL,
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
      translateButton.dataset.tooltipText = translateTooltip;
      
      // 🔧 恢复：完全按照legacy代码的插入逻辑
      // 先插入设置按钮到第一个原生按钮前面
      rightControls.insertBefore(settingsButton, firstNativeButton);
      console.log('[ui-manager] 已注入设置按钮');
      
      // 再插入翻译按钮到设置按钮前面
      rightControls.insertBefore(translateButton, settingsButton);
      console.log('[ui-manager] 已注入翻译按钮');
      
      // 更新状态标志
      this.state.controlsInjected = true;
      this.state.injectionAttempts = 0; // 重置尝试次数
      
      // 启动控件持续监测
      this.startControlsCheck();
      
      // ✅ 触发控件注入完成事件
      this.sendUIMessage(UIEvent.CONTROLS_INJECTED, {
        translateButton,
        settingsButton,
        translateActive: this.state.translateActive
      });
      
      console.log('[ui-manager] 控件注入完成');
      
      // 如果翻译已激活，触发翻译开始事件
      // 🔧 修复：使用 isActiveState 方法正确判断翻译状态
      if (this.isActiveState(this.state.translateActive)) {
        // ✅ 发送翻译开始请求
        if (this.messageBus) {
          this.messageBus.sendMessage({
            type: MessageType.TRANSLATION_TOGGLE,
            data: { active: true }
          });
        }
      } else {
      }
      
      // Popup会在用户点击时打开，不需要自动打开逻辑
      if (this.state.popupOpen) {
        console.log('[ui-manager] Popup状态已激活');
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
  public setTranslateActive(state: TranslateActiveState | boolean): void {
    // 处理向后兼容性：boolean转换为TranslateActiveState
    const targetState = typeof state === 'boolean' 
      ? (state ? TranslateActiveState.ACTIVE : TranslateActiveState.INACTIVE)
      : state;
    
    console.log(`[ui-manager] 设置翻译状态: ${targetState}`);
    
    // C4: 更新 this.state.translateActive
    this.state.translateActive = targetState;
    
    // C5: 调用 updateTranslateButtonState
    this.updateTranslateButtonState(this.isActiveState(targetState));
    
    // 🔧 基于架构9.1节：使用统一的消息发送错误处理模式
    this.sendMessageWithFallback('setRuntimeState', {
      stateKey: 'translateActive',
      value: targetState
    }).then(result => {
      if (result.success) {
        console.log(`[ui-manager] 已保存翻译状态(RuntimeState): ${targetState}`);
      } else {
        console.warn('[ui-manager] 通过RuntimeStateManager设置翻译状态失败，使用兼容性方案:', result.error);
        // 兼容性回退：保存到旧的存储键（转换为boolean）
        const boolValue = this.isActiveState(targetState);
        this.setStorageWithErrorHandling('translateActive', boolValue).then(success => {
          if (success) {
            console.log(`[ui-manager] 已保存翻译状态(兼容性): ${boolValue}`);
          } else {
            console.error(`[ui-manager] 兼容性翻译状态保存也失败`);
          }
        });
      }
    });
    
    // ✅ C7-C9: 根据翻译状态发出相应事件
    // 获取当前视频ID
    const videoId = new URLSearchParams(window.location.search).get('v') || '';
    
    if (this.isActiveState(targetState)) {
      console.log('[ui-manager] 翻译已激活，发出translation:start_requested事件');
      // ✅ C9: 发出 translation:start_requested
      // 直接发送给Service Worker
      chrome.runtime.sendMessage({
        type: MessageType.TRANSLATION_TOGGLE,
        data: {
          videoId: videoId,
          newState: true,
          source: 'ui_button',
          timestamp: Date.now()
        }
      }).then(response => {
        console.log('[ui-manager] Service Worker响应:', response);
      }).catch(error => {
        console.error('[ui-manager] 发送消息失败:', error);
      });
    } else {
      console.log('[ui-manager] 翻译已停用，发出translation:stop_requested事件');
      // ✅ C8: 发出 translation:stop_requested  
      chrome.runtime.sendMessage({
        type: MessageType.TRANSLATION_TOGGLE,
        data: {
          videoId: videoId,
          newState: false,
          source: 'ui_button',
          timestamp: Date.now()
        }
      }).then(response => {
        console.log('[ui-manager] Service Worker响应:', response);
      }).catch(error => {
        console.error('[ui-manager] 发送消息失败:', error);
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
      const enableText = chrome.i18n.getMessage('button_tooltip_enable_translation') || '开启翻译';
      const disableText = chrome.i18n.getMessage('button_tooltip_disable_translation') || '关闭翻译';
      const tooltipText = active ? disableText : enableText;
      button.title = tooltipText;
      button.setAttribute('aria-label', tooltipText);
      button.dataset.tooltipText = tooltipText;
    }
  }
  
  /**
   * 更新设置按钮状态
   */
  private updateSettingsButtonState(open: boolean): void {
    this.state.popupOpen = open;
    if (this.settingToggleButtonIcon) {
      this.settingToggleButtonIcon.src = open ? this.ACTIVE_SETTING_ICON_URL : this.SETTING_ICON_URL;
      
      // 更新按钮的tooltip文本
      const button = document.getElementById('vid-translate-settings-button');
      if (button) {
        const tooltipText = open
          ? (chrome.i18n.getMessage('tooltip_close_translation_settings') || '关闭翻译设置')
          : (chrome.i18n.getMessage('tooltip_translation_settings') || '翻译设置');
        button.title = tooltipText;
        button.setAttribute('aria-label', tooltipText);
        button.dataset.tooltipText = tooltipText;
      }
    }
  }
  
  /**
   * 设置设置面板打开状态 
   * 遵循architecture.md设计：先确认成功再更新UI状态，包含完整降级机制
   * @param open - 面板是否应打开
   * @param source - 触发此更改的来源
   */
  public setSettingPanelOpen(open: boolean, source: string = 'user-action'): void {
    console.log(`[ui-manager] 用户操作：Popup ${open ? '打开' : '关闭'}, 来源: ${source}`);
    
    if (!open) {
      // Popup会自动关闭，只需更新状态
      this.state.popupOpen = false;
      this.updateSettingsButtonState(false);
      return;
    }
    
    // 直接打开Popup
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().then(() => {
        console.log('[ui-manager] ✅ Popup打开成功');
        this.state.popupOpen = true;
        this.updateSettingsButtonState(true);
        this.showTooltip(
          this.settingToggleButtonIcon?.parentElement || document.body,
          '设置面板已打开',
          2000
        );
      }).catch(error => {
        console.error('[ui-manager] ✗ Popup打开失败:', error);
        this.showTooltip(
          this.settingToggleButtonIcon?.parentElement || document.body,
          '无法打开设置面板',
          2000
        );
      });
    } else {
      console.error('[ui-manager] chrome.action.openPopup API不可用');
      this.showTooltip(
        this.settingToggleButtonIcon?.parentElement || document.body,
        '无法打开设置面板',
        2000
      );
    }
  }

  /**
   * 🚀 新增：降级到popup的处理机制
   * 当SidePanel打开失败时的备选方案 - 遵循architecture.md设计
   */
  private async fallbackToPopup(): Promise<void> {
    try {
      console.log('[ui-manager] 执行popup降级策略...');
      
      // 1. 尝试通过chrome.action.openPopup打开popup（如果在用户手势上下文中）
      if (chrome.action && chrome.action.openPopup) {
        try {
          await chrome.action.openPopup();
          console.log('[ui-manager] 成功通过chrome.action.openPopup打开popup');
          
          // 2. 显示降级成功的反馈（状态由Background Script管理）
          this.showTooltip(
            this.settingToggleButtonIcon?.parentElement || document.body, 
            '已打开设置弹窗（降级模式）'
          );
          
          return; // 成功，退出
        } catch (popupError) {
          console.warn('[ui-manager] chrome.action.openPopup 失败:', popupError);
        }
      }
      
      // 3. 如果chrome.action.openPopup不可用或失败，尝试发送消息给background
      try {
        const fallbackResponse = await this.sendMessageWithPromise({
          type: 'openPopupFallback',
          data: {
            source: 'ui-manager-fallback'
          }
        });
        
        if (fallbackResponse.status === 'success') {
          console.log('[ui-manager] Background Script成功处理popup降级');
          this.showTooltip(
            this.settingToggleButtonIcon?.parentElement || document.body, 
            '已打开设置弹窗（降级模式）'
          );
        } else {
          throw new Error(fallbackResponse.message || 'Background popup降级失败');
        }
      } catch (fallbackError) {
        console.error('[ui-manager] Background Script popup降级失败:', fallbackError);
        this.handleFinalFallbackFailure();
      }
    } catch (error) {
      console.error('[ui-manager] popup降级处理异常:', error);
      this.handleFinalFallbackFailure();
    }
  }

  /**
   * 🚨 最终降级失败处理
   * 当所有降级策略都失败时的用户反馈 - 遵循architecture.md设计
   */
  private handleFinalFallbackFailure(): void {
    console.error('[ui-manager] 所有降级策略均失败，显示最终错误提示');
    
    // 确保UI状态正确
    this.state.popupOpen = false;
    this.updateSettingsButtonState(false);
    
    // 显示详细错误信息和解决建议
    const target = this.settingToggleButtonIcon?.parentElement || document.body;
    const errorMessage = '设置面板暂时无法打开\n' +
                        '🔧 解决方案：\n' +
                        '• 尝试刷新页面\n' +
                        '• 或重新加载扩展';
    this.showTooltip(target, errorMessage, 8000); // 8秒显示
  }

  /**
   * 🔧 新增：基于架构9.1节的统一消息发送错误处理模式
   * 发送消息到background，包含上下文有效性检查和降级机制
   * @param action 消息动作
   * @param data 消息数据
   * @returns Promise<发送结果>
   */
  private async sendMessageWithFallback(action: string, data?: any): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. 检查扩展上下文有效性
      if (!chrome.runtime?.id) {
        console.warn('[ui-manager] Extension context invalid, skipping message');
        return { success: false, error: 'Extension context invalid' };
      }
      
      // 2. 发送消息并处理错误
      return new Promise((resolve) => {
        console.log(`[ui-manager] 即将发送 ${action} 消息`);
        chrome.runtime.sendMessage({
          type: action,
          data,
          source: 'ui-manager',
          timestamp: Date.now()
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(`[ui-manager] ${action} 消息发送失败:`, chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log(`[ui-manager] ${action} 消息发送成功，响应:`, response);
            // 正确处理Background的响应
            resolve(response || { success: true });
          }
        });
      });
    } catch (error) {
      console.error(`[ui-manager] ${action} 消息发送异常:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 🔧 新增：基于架构9.1节的统一存储错误处理模式
   * @param key 存储键
   * @param value 存储值
   * @returns Promise<存储是否成功>
   */
  private async setStorageWithErrorHandling(key: string, value: any): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            console.error(`[ui-manager] 存储${key}失败:`, chrome.runtime.lastError.message);
            resolve(false);
          } else {
            console.log(`[ui-manager] 存储${key}成功`);
            resolve(true);
          }
        });
      } catch (error) {
        console.error(`[ui-manager] 存储${key}异常:`, error);
        resolve(false);
      }
    });
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

  /**
   * 以Promise方式发送消息，并包含超时机制
   * @param message 要发送的消息
   * @param timeout 超时时间（毫秒）
   * @returns Promise，解析为响应或因错误/超时而拒绝
   * @private
   */
  private sendMessageWithPromise<T = any>(message: any, timeout = 1000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Message timed out after ${timeout}ms: ${JSON.stringify(message)}`));
      }, timeout);
      
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ✅ MessageBus回调处理方法
  private handleTranslationResponse(data: any): void {
    console.log('[ui-manager] 收到翻译响应:', data);
    // UI管理器主要负责界面状态，翻译响应处理可以在这里添加
  }

  // ✅ MessageBus辅助方法
  private sendUIMessage(messageType: string, data: any = {}): void {
    if (this.messageBus) {
      this.messageBus.sendMessage({
        type: MessageType.UI_STATE_UPDATE,
        data: { event: messageType, ...data }
      });
    }
  }

  private handleUIStateUpdate(data: any): void {
    console.log('[ui-manager] 收到UI状态更新:', data);
    // 处理UI状态更新逻辑
    if (data.translateActive !== undefined) {
      this.setTranslateActive(data.translateActive);
    }
    if (data.popupOpen !== undefined) {
      this.updateSettingsButtonState(data.popupOpen);
    }
  }

  private handleSubtitleUpdated(data: any): void {
    console.log('[ui-manager] 收到字幕更新:', data);
    // UI管理器可以根据字幕更新调整界面状态
  }

  private handleErrorReport(data: any): void {
    console.log('[ui-manager] 收到错误报告:', data);
    console.error('[ui-manager] 错误详情:', data.errorMessage || data.error);
  }
}
