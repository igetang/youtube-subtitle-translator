/**
 * @file content-script-coordinator.ts
 * @description ContentScript协调器 - 根据组件重构计划.md实现
 * 核心职责：统一初始化入口，消除重复状态调用，实现单一职责原则
 */

import { subtitleOverlay } from './subtitle-overlay';

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
  private lastPopupCloseTime: number = 0;  // 记录上次popup关闭的时间
  
  // DOM观察器和控件监测相关属性
  private observerSetup = false;
  private controlsInjected = false;
  private injectionAttempts = 0;
  private controlsCheckInterval: number | null = null;
  
  // 配置常量
  private readonly MAX_INJECTION_ATTEMPTS = 5;
  private readonly INJECTION_RETRY_DELAY = 1000;
  private readonly CONTROL_CHECK_INTERVAL = 2000;

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
      
      // 4. 启动UI控制逻辑
      this.startUIManagement();
      
      // 5. 🎯 初始化时获取Popup状态
      await this.initializePopupState();
      
      // 6. 初始化字幕显示层
      subtitleOverlay.initialize();

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

    // 导入单一职责组件
    const { UIRenderer } = await import('../shared/components/ui-renderer');
    const { StateManager } = await import('../shared/components/state-manager');

    // 初始化UIRenderer - 纯UI渲染，被动接收状态
    this.uiRenderer = new UIRenderer();
    this.uiRenderer.initialize(stateData.uiState, stateData.runtimeState);
    
    // 初始化StateManager - 纯状态管理，被动接收状态
    this.stateManager = new StateManager();
    this.stateManager.initialize(stateData.runtimeState, stateData.userPreferences);

    console.log('[ContentScriptCoordinator] ✅ 组件初始化完成');
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
    
    // 添加监听来自main-world的字幕数据
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window || !event.data) return;
      
      const { source, type, payload } = event.data;
      
      // 处理来自main-world的字幕数据
      if (source === 'main-world' && type === 'SUBTITLE_CAPTURED') {
        console.log('[ContentScriptCoordinator] 收到字幕数据:', payload.count, '条');
        this.handleSubtitleCaptured(payload);
      }
    });
    
    console.log('[ContentScriptCoordinator] 组件间通信设置完成');
  }

  /**
   * 处理用户行为事件 - 组件间通信的中枢
   */
  handleUserAction(action: string, data: any): void {
    // 🔥 简化日志：只记录关键用户行为，避免重复日志
    if (action === 'buttonClick') {
      console.log(`[ContentScriptCoordinator] 🎯 ${data.buttonType}按钮点击`);
    } else if (action === 'chromeMessage') {
      // Chrome消息的具体处理由handleChromeMessage输出日志，这里不重复输出
      // 避免重复：handleUserAction + handleChromeMessage 双重日志
    } else {
      console.log(`[ContentScriptCoordinator] 🎯 处理用户行为: ${action}`, data);
    }

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
      case 'chromeMessage':
        this.handleChromeMessage(data);
        break;
      default:
        console.warn(`[ContentScriptCoordinator] 未知的用户行为: ${action}`);
    }
  }

  /**
   * 处理按钮点击
   */
  private async handleButtonClick(data: any): Promise<void> {
    // 🔥 简化日志：上层已经记录了按钮点击，这里只处理逻辑
    
    if (!this.stateManager) {
      console.warn('[ContentScriptCoordinator] StateManager未初始化');
      return;
    }

    if (data.buttonType === 'translate') {
      // 使用缓存优先的翻译处理流程
      await this.handleTranslateToggle(data.currentState);
    } else if (data.buttonType === 'settings') {
      // 切换popup状态
      this.togglePopup();
    }
  }
  
  /**
   * 处理翻译开关切换 - 缓存优先策略（基于4状态系统）
   */
  private async handleTranslateToggle(currentState: string): Promise<void> {
    console.log('[ContentScriptCoordinator] ===== 开始处理翻译切换 =====');
    
    // 根据当前状态决定是开启还是关闭
    // INACTIVE -> 开启翻译
    // ACTIVE/INTENT_ONLY -> 关闭翻译
    // PENDING -> 忽略（不应该发生，因为按钮已禁用）
    let isEnabling = false;
    
    switch (currentState) {
      case 'inactive':
        isEnabling = true;
        break;
      case 'active':
      case 'intent_only':
        isEnabling = false;
        break;
      case 'pending':
        console.log('[ContentScriptCoordinator] 忽略PENDING状态的点击');
        return;
      default:
        // 默认当作INACTIVE处理
        isEnabling = true;
    }
    
    const videoId = this.getVideoId();
    
    if (!videoId) {
      console.error('[ContentScriptCoordinator] 无法获取视频ID');
      return;
    }
    
    console.log('[ContentScriptCoordinator] 切换翻译状态:', { 
      currentState, 
      isEnabling, 
      videoId 
    });
    
    try {
      console.log('[ContentScriptCoordinator] 准备发送 TOGGLE_TRANSLATE 消息到 Service Worker...');
      // 发送翻译切换请求到Service Worker（缓存优先）
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_TRANSLATE',
        data: {
          videoId: videoId,
          newState: isEnabling  // 仍然传递布尔值给Service Worker
        }
      });
      
      console.log('[ContentScriptCoordinator] 翻译切换响应:', response);
      
      // 根据响应处理不同场景
      switch (response.action) {
        case 'cached':
          // 使用缓存的翻译结果
          console.log('[ContentScriptCoordinator] ✅ 使用缓存的翻译结果');
          this.displayTranslatedSubtitles(response.data);
          break;
          
        case 'translated':
          // 显示新翻译的结果
          console.log('[ContentScriptCoordinator] ✅ 显示新翻译结果');
          this.displayTranslatedSubtitles(response.data);
          break;
          
        case 'needTranslation':
          // 有字幕数据但需要翻译（临时处理，将在Step 3实现翻译）
          console.log('[ContentScriptCoordinator] 有字幕数据，等待翻译实现');
          // TODO: 显示加载状态
          break;
          
        case 'needFetch':
          // 需要获取字幕
          console.log('[ContentScriptCoordinator] 需要获取字幕数据');
          this.requestSubtitleCapture();
          break;
          
        case 'stopped':
          // 翻译已停止
          console.log('[ContentScriptCoordinator] 翻译已停止');
          this.hideTranslatedSubtitles();
          break;
          
        default:
          console.warn('[ContentScriptCoordinator] 未知响应动作:', response.action);
      }
      
      // 更新本地状态（Service Worker会设置正确的最终状态）
      // 这里不需要手动更新，因为状态会通过消息系统同步
      
    } catch (error) {
      console.error('[ContentScriptCoordinator] 翻译切换失败:', error);
      // 错误时恢复到INACTIVE状态
      this.stateManager.updateState('translateActive', 'inactive');
    }
  }
  
  /**
   * 获取当前视频ID
   */
  private getVideoId(): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }
  
  /**
   * 显示翻译后的字幕
   */
  private displayTranslatedSubtitles(data: any): void {
    console.log('[ContentScriptCoordinator] 准备显示翻译字幕:', data);
    
    // 显示翻译字幕
    subtitleOverlay.show(data);
    
    // 更新UI状态 - 使用 updateState 方法设置 translateActive 为 'active'
    if (this.stateManager) {
      this.stateManager.updateState('translateActive', 'active');
    }
  }
  
  /**
   * 隐藏翻译字幕
   */
  private hideTranslatedSubtitles(): void {
    console.log('[ContentScriptCoordinator] 隐藏翻译字幕');
    
    // 隐藏字幕显示层
    subtitleOverlay.hide();
    
    // 更新UI状态 - 使用 updateState 方法设置 translateActive 为 'inactive'
    if (this.stateManager) {
      this.stateManager.updateState('translateActive', 'inactive');
    }
  }

  /**
   * 请求获取字幕数据
   */
  private requestSubtitleCapture(): void {
    console.log('[ContentScriptCoordinator] 发送字幕捕获请求到main-world...');
    
    // 向main-world脚本发送消息
    window.postMessage({
      source: 'content-script',
      type: 'REQUEST_SUBTITLE_CAPTURE'
    }, '*');
  }

  /**
   * 处理捕获到的字幕数据
   */
  private handleSubtitleCaptured(payload: any): void {
    console.log('[ContentScriptCoordinator] 处理字幕数据，共', payload.count, '条');
    
    // 获取当前视频ID
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    
    if (!videoId) {
      console.warn('[ContentScriptCoordinator] 无法获取视频ID');
      return;
    }
    
    // 发送字幕数据到Service Worker
    chrome.runtime.sendMessage({
      type: 'SUBTITLE_DATA',
      data: {
        videoId: videoId,
        subtitles: payload.subtitles,
        url: payload.url,
        count: payload.count
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[ContentScriptCoordinator] 发送字幕数据失败:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        console.log('[ContentScriptCoordinator] ✅ 字幕数据已发送到Service Worker');
        // TODO: 触发翻译流程
      }
    });
  }

  /**
   * 切换Popup状态 - 使用简单的时间防抖机制
   */
  private async togglePopup(): Promise<void> {
    try {
      // 获取当前popup状态
      const stateResponse = await chrome.runtime.sendMessage({
        type: 'getPopupState'
      });
      
      const currentState = stateResponse.isOpen;
      console.log('[ContentScriptCoordinator] 当前Popup状态:', currentState ? '已打开' : '关闭');
      
      if (currentState) {
        // Popup已打开，让Chrome自动关闭即可
        console.log('[ContentScriptCoordinator] Popup已打开，将由Chrome自动关闭');
        return;
      }
      
      // Popup未打开，检查是否刚刚关闭（防抖）
      const timeSinceClose = Date.now() - this.lastPopupCloseTime;
      console.log(`[ContentScriptCoordinator] 距离上次关闭时间: ${timeSinceClose}ms`);
      
      if (timeSinceClose < 300) {
        // 300ms内的点击视为Chrome自动关闭导致的，不执行打开
        console.log('[ContentScriptCoordinator] 刚刚关闭popup（300ms内），不执行打开操作');
        return;
      }
      
      // 执行打开操作
      console.log('[ContentScriptCoordinator] 执行打开Popup操作');
      const openResponse = await chrome.runtime.sendMessage({
        type: 'openPopup',
        data: { source: 'settings-button' },
        timestamp: Date.now()
      });
      
      if (openResponse && openResponse.success) {
        console.log('[ContentScriptCoordinator] ✅ Popup打开成功');
      } else {
        console.error('[ContentScriptCoordinator] ❌ Popup打开失败:', openResponse?.error);
      }
      
    } catch (error) {
      console.error('[ContentScriptCoordinator] ❌ 处理Popup切换失败:', error);
    }
  }
  
  /**
   * 显示SidePanel操作提示
   */
  private showSidePanelHint(): void {
    // 创建临时提示元素
    const hint = document.createElement('div');
    hint.textContent = '请点击浏览器工具栏中的扩展图标来打开/关闭翻译设置面板';
    hint.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: fadeInOut 4s ease-in-out;
    `;
    
    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-10px); }
        15% { opacity: 1; transform: translateY(0); }
        85% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(hint);
    
    // 4秒后自动移除
    setTimeout(() => {
      hint.remove();
      style.remove();
    }, 4000);
    
    console.log('[ContentScriptCoordinator] 💡 已显示SidePanel操作提示');
  }

  /**
   * 打开SidePanel（保持用户手势上下文）
   * @deprecated 推荐使用toggleSidePanel进行状态切换
   */
  private async openSidePanel(): Promise<void> {
    console.log('[ContentScriptCoordinator] 🚀 打开SidePanel（用户手势上下文）');
    
    try {
      // 发送打开sidepanel请求到background
      const result = await chrome.runtime.sendMessage({
        type: 'openSidePanel',
        source: 'settings-button'
      });
      
      if (result && result.success) {
        console.log('[ContentScriptCoordinator] ✅ SidePanel打开成功');
        // 注意：状态更新将由SidePanel的Port连接自动处理，避免重复调用
      } else {
        console.error('[ContentScriptCoordinator] ❌ SidePanel打开失败:', result?.error);
      }
    } catch (error) {
      console.error('[ContentScriptCoordinator] ❌ 打开SidePanel出错:', error);
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
   * 处理Chrome消息
   */
  private handleChromeMessage(data: any): void {
    const { messageType, message } = data;
    console.log(`[ContentScriptCoordinator] 处理Chrome消息: ${messageType}`, message);
    
    // 根据消息类型处理
    switch (messageType) {
      case 'UPDATE_BUTTON_STATE':
        // 🎯 SAD.md设计：标准的UI状态更新消息
        if (message.isOpen !== undefined && this.uiRenderer) {
          // 记录popup关闭时间
          if (!message.isOpen) {
            this.lastPopupCloseTime = Date.now();
            console.log(`[ContentScriptCoordinator] 记录popup关闭时间: ${this.lastPopupCloseTime}`);
          }
          this.uiRenderer.update({ settingPanelOpen: message.isOpen });
          console.log(`[ContentScriptCoordinator] 按钮状态更新: ${message.isOpen ? '已打开' : '已关闭'} (${message.source})`);
        }
        break;
        
      case 'SIDEPANEL_STATE_CHANGED':
        // 🔧 向后兼容：保持对旧消息格式的支持
        if (message.isOpen !== undefined && this.uiRenderer) {
          this.uiRenderer.update({ settingPanelOpen: message.isOpen });
          console.log(`[ContentScriptCoordinator] 状态变化 (兼容模式): ${message.isOpen ? '已打开' : '已关闭'}`);
        }
        break;
        
      default:
        // 其他Chrome消息暂时只记录，不处理
        console.log(`[ContentScriptCoordinator] 收到其他Chrome消息: ${messageType}`);
    }
  }

  /**
   * 🎯 初始化时获取Popup状态
   */
  private async initializePopupState(): Promise<void> {
    try {
      console.log('[ContentScriptCoordinator] 🎯 获取Popup初始状态...');
      
      // 发送getPopupState消息到Background
      const result = await chrome.runtime.sendMessage({
        type: 'getPopupState'
      });
      
      if (result && result.success && this.uiRenderer) {
        this.uiRenderer.update({ settingPanelOpen: result.isOpen });
        console.log(`[ContentScriptCoordinator] ✅ Popup初始状态: ${result.isOpen ? '已打开' : '已关闭'}`);
      } else {
        console.warn('[ContentScriptCoordinator] ⚠️ 获取Popup状态失败，使用默认状态');
        if (this.uiRenderer) {
          this.uiRenderer.update({ settingPanelOpen: false });
        }
      }
    } catch (error) {
      console.error('[ContentScriptCoordinator] ❌ 初始化Popup状态失败:', error);
      // 降级到默认状态
      if (this.uiRenderer) {
        this.uiRenderer.update({ settingPanelOpen: false });
      }
    }
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
  
  /**
   * 🚀 启动UI管理 - 成为唯一的UI决策点
   */
  private startUIManagement(): void {
    console.log('[ContentScriptCoordinator] 🎯 启动UI管理模块');
    
    // 设置DOM观察器
    this.setupDOMObserver();
    
    // 初始检查并尝试创建按钮
    this.performInitialButtonCheck();
  }
  
  /**
   * 🚀 设置DOM观察器，监听YouTube控制栏变化
   */
  private setupDOMObserver(): void {
    if (this.observerSetup) {
      console.log('[ContentScriptCoordinator] DOM观察器已设置，跳过');
      return;
    }
    
    console.log('[ContentScriptCoordinator] 🔍 设置DOM观察器');
    this.observerSetup = true;
    
    const observer = new MutationObserver((mutations) => {
      // 如果控件已注入，不触发新的注入
      if (this.controlsInjected || 
          document.getElementById('vid-translate-toggle-button') || 
          document.getElementById('vid-translate-settings-button')) {
        return;
      }
      
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
                console.log('[ContentScriptCoordinator] 检测到关键元素:', node.className);
              }
            }
          });
        }
      });
      
      if (hasRelevantChanges) {
        this.checkAndCreateButtons('DOM变化检测');
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    console.log('[ContentScriptCoordinator] ✅ DOM观察器已设置');
  }
  
  /**
   * 🚀 执行初始按钮检查
   */
  private performInitialButtonCheck(): void {
    console.log('[ContentScriptCoordinator] 🔍 执行初始按钮检查');
    
    const rightControls = document.querySelector('.ytp-right-controls');
    const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
    
    if (rightControls && autoplayButton) {
      console.log('[ContentScriptCoordinator] 初始检测到必要元素，尝试创建按钮');
      this.checkAndCreateButtons('初始检测');
    } else {
      console.log('[ContentScriptCoordinator] 初始检测未找到必要元素，等待DOM变化');
    }
    
    // 设置超时检查
    setTimeout(() => {
      if (!this.controlsInjected) {
        console.log('[ContentScriptCoordinator] 超时检查，尝试创建按钮');
        this.checkAndCreateButtons('超时检查');
      }
    }, 3000);
  }
  
  /**
   * 🚀 检查并创建按钮
   */
  private async checkAndCreateButtons(source: string): Promise<void> {
    if (this.controlsInjected || !this.uiRenderer) {
      return;
    }
    
    console.log(`[ContentScriptCoordinator] ${source}触发按钮创建检查`);
    
    const rightControls = document.querySelector('.ytp-right-controls');
    const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
    
    if (rightControls && autoplayButton) {
      console.log('[ContentScriptCoordinator] 检测到YouTube控制栏就绪，调用UIRenderer创建按钮');
      
      const success = await this.uiRenderer.createButtons();
      if (success) {
        this.controlsInjected = true;
        this.injectionAttempts = 0;
        this.startControlsMonitoring();
        // ✅ 移除重复日志：UIRenderer已输出"按钮创建完成"，避免重复
      } else {
        this.injectionAttempts++;
        if (this.injectionAttempts < this.MAX_INJECTION_ATTEMPTS) {
          console.log(`[ContentScriptCoordinator] 按钮创建失败，第${this.injectionAttempts}次尝试，将重试`);
          setTimeout(() => this.checkAndCreateButtons(source + '-重试'), this.INJECTION_RETRY_DELAY);
        } else {
          console.warn('[ContentScriptCoordinator] 达到最大尝试次数，放弃创建按钮');
        }
      }
    } else {
      console.log('[ContentScriptCoordinator] YouTube控制栏尚未就绪，等待中...');
    }
  }
  
  /**
   * 🚀 启动控件监测
   */
  private startControlsMonitoring(): void {
    if (this.controlsCheckInterval !== null) {
      return;
    }
    
    console.log('[ContentScriptCoordinator] 🔄 启动控件监测');
    
    this.controlsCheckInterval = window.setInterval(() => {
      if (this.controlsInjected) {
        const translateButton = document.getElementById('vid-translate-toggle-button');
        const settingsButton = document.getElementById('vid-translate-settings-button');
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
        const rightControls = document.querySelector('.ytp-right-controls');
        
        // 如果按钮丢失但YouTube控制栏就绪，尝试恢复
        if ((!translateButton || !settingsButton) && autoplayButton && rightControls) {
          console.log('[ContentScriptCoordinator] 检测到按钮丢失，尝试恢复');
          this.controlsInjected = false;
          this.injectionAttempts = 0;
          this.checkAndCreateButtons('按钮恢复');
        }
      }
    }, this.CONTROL_CHECK_INTERVAL);
  }
  
  /**
   * 🚀 停止控件监测
   */
  private stopControlsMonitoring(): void {
    if (this.controlsCheckInterval !== null) {
      window.clearInterval(this.controlsCheckInterval);
      this.controlsCheckInterval = null;
      console.log('[ContentScriptCoordinator] 🛑 已停止控件监测');
    }
  }
}