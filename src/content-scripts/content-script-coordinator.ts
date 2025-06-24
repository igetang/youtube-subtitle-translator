/**
 * @file content-script-coordinator.ts
 * @description ContentScript协调器 - 根据组件重构计划.md实现
 * 核心职责：统一初始化入口，消除重复状态调用，实现单一职责原则
 */

/**
 * ContentScript协调器
 * 职责：
 * 1. 统一调用 - 一次获取，分发给所有组件
 * 2. 单向数据流 - 协调器 → 组件，避免循环调用
 * 3. 职责分离 - 每个类只做一件事
 */
export class ContentScriptCoordinator {
  private uiRenderer: any = null;      // UIRenderer实例
  private stateManager: any = null;    // StateManager实例
  private initialized = false;

  constructor() {
    console.log('[ContentScriptCoordinator] 协调器已创建');
  }

  /**
   * 统一初始化入口 - 消除重复调用的核心方法
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[ContentScriptCoordinator] 已初始化，跳过重复初始化');
      return;
    }

    console.log('[ContentScriptCoordinator] 🚀 开始统一初始化...');

    try {
      // 1. 一次性获取所有状态
      const [runtimeState, userPreferences] = await Promise.all([
        this.getState('runtime'),
        this.getState('preferences')
      ]);
      
      // UI状态使用默认值，不需要从background获取
      const uiState = this.getDefaultState('ui');

      console.log('[ContentScriptCoordinator] ✅ 状态获取完成:', {
        runtimeState: !!runtimeState,
        userPreferences: !!userPreferences,
        uiState: !!uiState
      });

      // 2. 初始化各个单一职责组件
      await this.initializeComponents({
        runtimeState,
        userPreferences,
        uiState
      });

      // 3. 设置组件间通信
      this.setupCommunication();

      this.initialized = true;
      console.log('[ContentScriptCoordinator] ✅ 统一初始化完成');

    } catch (error) {
      console.error('[ContentScriptCoordinator] ❌ 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 状态获取统一方法
   */
  private async getState(type: 'runtime' | 'preferences' | 'ui'): Promise<any> {
    const messageMap = {
      runtime: 'getRuntimeState',
      preferences: 'getUserPreferences', 
      ui: 'getUIState'
    };

    try {
      const response = await chrome.runtime.sendMessage({ 
        type: messageMap[type] 
      });

      if (response && response.success) {
        return type === 'runtime' ? response.state : response.data || response;
      } else {
        console.warn(`[ContentScriptCoordinator] 获取${type}状态失败:`, response?.error);
        return this.getDefaultState(type);
      }
    } catch (error) {
      console.error(`[ContentScriptCoordinator] 获取${type}状态出错:`, error);
      return this.getDefaultState(type);
    }
  }

  /**
   * 获取默认状态
   */
  private getDefaultState(type: string): any {
    const defaults = {
      runtime: { translateActive: false },
      preferences: { targetLang: 'zh-CN', sourceLang: 'en' },
      ui: { controlsInjected: false }
    };
    return defaults[type as keyof typeof defaults] || {};
  }

  /**
   * 初始化各个单一职责组件 - 被动接收状态
   */
  private async initializeComponents(stateData: {
    runtimeState: any;
    userPreferences: any;
    uiState: any;
  }): Promise<void> {
    console.log('[ContentScriptCoordinator] 🚀 初始化单一职责组件...');

    // 使用新的单一职责组件
    await this.initializeNewComponents(stateData);

    console.log('[ContentScriptCoordinator] ✅ 组件初始化完成');
  }

  /**
   * 初始化新的单一职责组件
   */
  private async initializeNewComponents(stateData: any): Promise<void> {
    // 导入新的单一职责组件
    const { UIRenderer } = await import('../shared/components/ui-renderer');
    const { StateManager } = await import('../shared/components/state-manager');

    // 初始化UIRenderer - 纯UI渲染，被动接收状态
    this.uiRenderer = new UIRenderer();
    this.uiRenderer.initialize(stateData.uiState, stateData.runtimeState);
    
    // 初始化StateManager - 纯状态管理，被动接收状态
    this.stateManager = new StateManager();
    this.stateManager.initialize(stateData.runtimeState, stateData.userPreferences);

    console.log('[ContentScriptCoordinator] ✅ 新架构组件初始化完成');
  }

  /**
   * 设置组件间通信
   */
  private setupCommunication(): void {
    // 设置组件间的回调引用
    if (this.uiRenderer) {
      this.uiRenderer.setCoordinator(this);
    }
    if (this.stateManager) {
      this.stateManager.setCoordinator(this);
    }
    console.log('[ContentScriptCoordinator] 组件间通信设置完成');
  }

  /**
   * 处理用户行为事件 - 组件间通信的中枢
   */
  handleUserAction(action: string, data: any): void {
    console.log(`[ContentScriptCoordinator] 🎯 处理用户行为: ${action}`, data);

    switch (action) {
      case 'buttonClick':
        this.handleButtonClick(data);
        break;
      case 'stateChange':
        this.handleStateChange(data);
        break;
      case 'pageVisible':
        this.handlePageVisible(data);
        break;
      default:
        console.warn(`[ContentScriptCoordinator] 未知的用户行为: ${action}`);
    }
  }

  /**
   * 处理按钮点击
   */
  private handleButtonClick(data: any): void {
    console.log('[ContentScriptCoordinator] 处理按钮点击:', data);
    
    if (!this.stateManager) {
      console.warn('[ContentScriptCoordinator] StateManager未初始化');
      return;
    }

    if (data.buttonType === 'translate') {
      // 切换翻译状态
      const newState = !data.currentState;
      this.stateManager.updateState('translateActive', newState);
    } else if (data.buttonType === 'settings') {
      // 打开设置面板
      this.stateManager.updateState('settingPanelOpen', true);
    }
  }

  /**
   * 处理状态变化
   */
  private handleStateChange(data: any): void {
    console.log('[ContentScriptCoordinator] 处理状态变化:', data);
    
    if (!this.uiRenderer) {
      console.warn('[ContentScriptCoordinator] UIRenderer未初始化');
      return;
    }

    // 通过UIRenderer更新UI显示
    const changes: any = {};
    if (data.key) {
      changes[data.key] = data.value;
    } else if (data.type === 'batch_update') {
      // 批量更新时，提取需要UI更新的状态
      if (data.runtimeState) {
        if (data.runtimeState.translateActive !== undefined) {
          changes.translateActive = data.runtimeState.translateActive;
        }
        if (data.runtimeState.settingPanelOpen !== undefined) {
          changes.settingPanelOpen = data.runtimeState.settingPanelOpen;
        }
      }
    }

    if (Object.keys(changes).length > 0) {
      this.uiRenderer.update(changes);
    }
  }

  /**
   * 处理页面可见性变化
   */
  private handlePageVisible(data: any): void {
    console.log('[ContentScriptCoordinator] 页面变为可见，刷新状态');
    // 可以在这里触发状态刷新，但通过协调器统一管理
    this.refreshStates();
  }

  /**
   * 刷新状态 - 按需调用，仍然通过协调器统一管理
   */
  private async refreshStates(): Promise<void> {
    try {
      console.log('[ContentScriptCoordinator] 🔄 刷新状态...');
      
      // 仍然是一次性获取所有状态
      const [runtimeState, userPreferences] = await Promise.all([
        this.getState('runtime'),
        this.getState('preferences')
      ]);
      
      // 通过StateManager更新状态
      if (this.stateManager) {
        await this.stateManager.updateStates(runtimeState, userPreferences);
      }
      
      // 通过UIRenderer更新UI
      if (this.uiRenderer) {
        this.uiRenderer.refresh();
      }

      console.log('[ContentScriptCoordinator] ✅ 状态刷新完成');
    } catch (error) {
      console.error('[ContentScriptCoordinator] 刷新状态失败:', error);
    }
  }

  /**
   * 获取初始化状态
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取组件实例（用于向后兼容和调试）
   */
  getUIRenderer(): any {
    return this.uiRenderer;
  }

  getStateManager(): any {
    return this.stateManager;
  }
}