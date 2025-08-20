/**
 * @file runtime-state-manager.ts
 * @description 运行时状态管理器
 * 基于 architecture.md 7.1.2 RuntimeState 设计规范
 */

import {
  RuntimeState,
  TranslateActiveState,
  RuntimeStateChangeEvent,
  RuntimeStateChangeHandler,
  DEFAULT_RUNTIME_STATE,
  RUNTIME_STATE_STORAGE_KEYS,
  RUNTIME_STATE_CONFIG,
  TranslateStateHelper
} from '../types/runtime-state-types';

import { StorageManager, StorageArea } from './storage-manager';

/**
 * 运行时状态管理器
 * 严格符合 architecture.md 7.1.2 RuntimeState 设计规范
 */
export class RuntimeStateManager {
  private static instance: RuntimeStateManager;
  private storageManager: StorageManager;
  private changeHandlers: Map<RuntimeStateChangeEvent, Set<RuntimeStateChangeHandler>>;
  private stateMemoryCache: Partial<RuntimeState> = {};
  private initialized: boolean = false;
  
  // 🔧 新增：同步缓存，用于保持用户手势上下文
  private syncCache: { settingPanelOpen: boolean } = { settingPanelOpen: false };

  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.changeHandlers = new Map();
    
    // 添加存储变更监听器
    this.setupStorageListener();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): RuntimeStateManager {
    if (!RuntimeStateManager.instance) {
      RuntimeStateManager.instance = new RuntimeStateManager();
    }
    return RuntimeStateManager.instance;
  }

  /**
   * 设置存储变更监听器
   */
  private setupStorageListener(): void {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: StorageArea) => {
      if (area !== RUNTIME_STATE_CONFIG.STORAGE_AREA) return;
      
      // 处理运行时状态变更
      Object.keys(changes).forEach((key) => {
        if (this.isRuntimeStateKey(key)) {
          const stateKey = this.extractStateKey(key);
          if (stateKey) {
            const change = changes[key];
            let newValue = change.newValue;
            
            // 🔧 数据迁移：如果是translateActive且值是布尔值，转换为枚举值
            if (stateKey === 'translateActive' && typeof newValue === 'boolean') {
              console.warn('[runtime-state-manager] 存储监听器检测到布尔值，进行转换:', newValue);
              newValue = newValue ? TranslateActiveState.ACTIVE : TranslateActiveState.INACTIVE;
            }
            
            // 更新内存缓存
            (this.stateMemoryCache as any)[stateKey] = newValue;
            
            // 触发变更事件
            this.triggerChangeEvent(stateKey, newValue, change.oldValue);
          }
        }
      });
    };
    
    // 添加监听器
    this.storageManager.addChangeListener(RUNTIME_STATE_CONFIG.PREFIX, handleStorageChange);
  }

  /**
   * 检查是否是运行时状态存储键
   */
  private isRuntimeStateKey(key: string): boolean {
    return Object.values(RUNTIME_STATE_STORAGE_KEYS).includes(key as any);
  }

  /**
   * 从存储键提取状态键
   */
  private extractStateKey(storageKey: string): keyof RuntimeState | null {
    const mapping: Record<string, keyof RuntimeState> = {
      [RUNTIME_STATE_STORAGE_KEYS.TRANSLATE_ACTIVE]: 'translateActive',
      [RUNTIME_STATE_STORAGE_KEYS.SETTING_PANEL_OPEN]: 'settingPanelOpen'
    };
    
    return mapping[storageKey] || null;
  }

  /**
   * 触发状态变更事件
   */
  private triggerChangeEvent(
    stateKey: keyof RuntimeState,
    newValue: any,
    oldValue: any
  ): void {
    let event: RuntimeStateChangeEvent | null = null;
    
    switch (stateKey) {
      case 'translateActive':
        event = RuntimeStateChangeEvent.TRANSLATE_ACTIVE_CHANGED;
        break;
      case 'settingPanelOpen':
        event = RuntimeStateChangeEvent.SETTING_PANEL_CHANGED;
        break;
    }
    
    if (event && this.changeHandlers.has(event)) {
      const handlers = this.changeHandlers.get(event)!;
      handlers.forEach(handler => {
        try {
          handler(newValue, oldValue, event as RuntimeStateChangeEvent);
        } catch (error) {
          console.error(`[runtime-state-manager] 事件处理器执行失败 (${event}):`, error);
        }
      });
    }
  }

  /**
   * 添加状态变更监听器
   */
  public addChangeListener(event: RuntimeStateChangeEvent, handler: RuntimeStateChangeHandler): void {
    if (!this.changeHandlers.has(event)) {
      this.changeHandlers.set(event, new Set());
    }
    this.changeHandlers.get(event)!.add(handler);
  }

  /**
   * 移除状态变更监听器
   */
  public removeChangeListener(event: RuntimeStateChangeEvent, handler: RuntimeStateChangeHandler): void {
    if (this.changeHandlers.has(event)) {
      this.changeHandlers.get(event)!.delete(handler);
    }
  }

  /**
   * 初始化管理器
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      console.log('[runtime-state-manager] 初始化运行时状态管理器...');
      
      // 🔧 数据迁移：清理存储中的布尔值
      await this.cleanupBooleanValues();
      
      // 尝试从存储加载状态
      const loadResult = await this.loadFromStorage();
      
      if (loadResult.success && loadResult.state) {
        // 加载成功，使用存储的状态
        this.stateMemoryCache = loadResult.state;
        console.log('[runtime-state-manager] 已从存储加载运行时状态:', loadResult.state);
      } else {
        // 加载失败，使用默认状态
        console.log(`[runtime-state-manager] 加载失败，使用默认状态: ${loadResult.reason}`);
        await this.useDefaultState();
      }
      
      this.initialized = true;
      console.log('[runtime-state-manager] 运行时状态管理器初始化完成');
      
    } catch (error) {
      console.error('[runtime-state-manager] 初始化失败:', error);
      // 出错时使用默认状态
      await this.useDefaultState();
      this.initialized = true;
    }
  }

  /**
   * 清理存储中的布尔值，迁移到枚举值
   * 🔧 数据迁移：确保存储中的translateActive始终是枚举值
   */
  private async cleanupBooleanValues(): Promise<void> {
    try {
      const storageKey = RUNTIME_STATE_STORAGE_KEYS.TRANSLATE_ACTIVE;
      const currentValue = await this.storageManager.get(storageKey, RUNTIME_STATE_CONFIG.STORAGE_AREA);
      
      if (typeof currentValue === 'boolean') {
        console.warn('[runtime-state-manager] 发现存储中的布尔值，进行数据迁移:', currentValue);
        const enumValue = currentValue ? TranslateActiveState.ACTIVE : TranslateActiveState.INACTIVE;
        await this.storageManager.set(storageKey, enumValue, RUNTIME_STATE_CONFIG.STORAGE_AREA);
        console.log('[runtime-state-manager] 数据迁移完成，新值:', enumValue);
      }
    } catch (error) {
      console.error('[runtime-state-manager] 清理布尔值失败:', error);
    }
  }

  /**
   * 使用默认状态
   * 🔧 优化：移除重复的存储检查，直接使用默认状态
   */
  private async useDefaultState(): Promise<void> {
    console.log('[runtime-state-manager] 使用默认状态（避免重复存储查询）...');
    
    try {
      // 直接使用默认状态，避免重复的存储检查
      const defaultState: RuntimeState = { ...DEFAULT_RUNTIME_STATE };
      
      this.stateMemoryCache = defaultState;
      // 🔧 同步更新 syncCache
      this.syncCache.settingPanelOpen = defaultState.settingPanelOpen;
      await this.saveToStorage(defaultState);
      
      console.log('[runtime-state-manager] 已设置默认状态:', defaultState);
    } catch (error) {
      console.warn('[runtime-state-manager] 设置默认状态失败:', error);
      this.stateMemoryCache = { ...DEFAULT_RUNTIME_STATE };
      // 🔧 同步更新 syncCache
      this.syncCache.settingPanelOpen = DEFAULT_RUNTIME_STATE.settingPanelOpen;
    }
  }

  /**
   * 从存储加载状态
   */
  private async loadFromStorage(): Promise<{
    success: boolean;
    state?: RuntimeState;
    reason?: string;
  }> {
    try {
      const storageData = await this.storageManager.getBatch([
        RUNTIME_STATE_STORAGE_KEYS.TRANSLATE_ACTIVE,
        RUNTIME_STATE_STORAGE_KEYS.SETTING_PANEL_OPEN
      ], RUNTIME_STATE_CONFIG.STORAGE_AREA);
      
      // 🔧 修复：检查是否有任何有效数据，即使是部分数据也算成功
      const hasTranslateData = storageData[RUNTIME_STATE_STORAGE_KEYS.TRANSLATE_ACTIVE] !== undefined;
      const hasSettingData = storageData[RUNTIME_STATE_STORAGE_KEYS.SETTING_PANEL_OPEN] !== undefined;
      
      if (!hasTranslateData && !hasSettingData) {
        return {
          success: false,
          reason: 'STORAGE_EMPTY: 存储完全为空'
        };
      }
      
      // 🔧 数据迁移：将布尔值转换为枚举值
      let translateActiveValue = storageData[RUNTIME_STATE_STORAGE_KEYS.TRANSLATE_ACTIVE];
      if (typeof translateActiveValue === 'boolean') {
        console.warn('[runtime-state-manager] 检测到旧版布尔值，进行数据迁移:', translateActiveValue);
        translateActiveValue = translateActiveValue ? TranslateActiveState.ACTIVE : TranslateActiveState.INACTIVE;
      }
      
      // 重构运行时状态对象
      const loadedState: RuntimeState = {
        translateActive: translateActiveValue || DEFAULT_RUNTIME_STATE.translateActive,
        settingPanelOpen: storageData[RUNTIME_STATE_STORAGE_KEYS.SETTING_PANEL_OPEN] || DEFAULT_RUNTIME_STATE.settingPanelOpen
      };
      
      // 🔧 同步更新 syncCache
      this.syncCache.settingPanelOpen = loadedState.settingPanelOpen;
      
      return {
        success: true,
        state: loadedState
      };
      
    } catch (error) {
      return {
        success: false,
        reason: `LOAD_ERROR: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 保存运行时状态到存储
   */
  private async saveToStorage(state: RuntimeState): Promise<void> {
    // 准备存储数据
    const storageData = {
      [RUNTIME_STATE_STORAGE_KEYS.TRANSLATE_ACTIVE]: state.translateActive,
      [RUNTIME_STATE_STORAGE_KEYS.SETTING_PANEL_OPEN]: state.settingPanelOpen
    };
    
    console.log(`[runtime-state-manager] 准备保存到${RUNTIME_STATE_CONFIG.STORAGE_AREA} storage:`, storageData);
    
    // 批量保存到存储
    await this.storageManager.setBatch(storageData, RUNTIME_STATE_CONFIG.STORAGE_AREA);
    
    console.log(`[runtime-state-manager] ✅ 已成功保存到${RUNTIME_STATE_CONFIG.STORAGE_AREA} storage`);
    
    // 更新内存缓存
    this.stateMemoryCache = { ...state };
  }

  /**
   * 获取完整的运行时状态
   */
  public async getAllState(): Promise<RuntimeState> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 🔧 数据清理：确保translateActive始终是枚举值
    const state = { ...DEFAULT_RUNTIME_STATE, ...this.stateMemoryCache } as RuntimeState;
    if (typeof state.translateActive === 'boolean') {
      console.warn('[runtime-state-manager] getAllState检测到布尔值，进行转换:', state.translateActive);
      state.translateActive = (state.translateActive as any) ? TranslateActiveState.ACTIVE : TranslateActiveState.INACTIVE;
    }
    
    return state;
  }

  /**
   * 获取翻译状态
   */
  public async getTranslateState(): Promise<TranslateActiveState> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    let translateState = this.stateMemoryCache.translateActive || DEFAULT_RUNTIME_STATE.translateActive;
    
    // 🔧 数据清理：确保返回的始终是枚举值
    if (typeof translateState === 'boolean') {
      console.warn('[runtime-state-manager] getTranslateState检测到布尔值，进行转换:', translateState);
      translateState = (translateState as any) ? TranslateActiveState.ACTIVE : TranslateActiveState.INACTIVE;
    }
    
    return translateState;
  }

  /**
   * 设置翻译状态
   */
  public async setTranslateState(state: TranslateActiveState): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 检查状态转换是否合法
    const currentState = await this.getTranslateState();
    if (!TranslateStateHelper.canTransition(currentState, state)) {
      console.warn(`[runtime-state-manager] 非法的状态转换: ${currentState} -> ${state}`);
      return;
    }
    
    if (this.stateMemoryCache.translateActive === state) {
      return; // 值未变化，无需保存
    }
    
    // 更新内存缓存
    this.stateMemoryCache.translateActive = state;
    
    // 获取完整的状态并保存
    const fullState = await this.getAllState();
    await this.saveToStorage(fullState);
    
    console.log(`[runtime-state-manager] 翻译状态已更新:`, state);
  }

  /**
   * 检查翻译是否可用
   */
  public async isTranslationAvailable(): Promise<boolean> {
    const state = await this.getTranslateState();
    return TranslateStateHelper.isTranslationAvailable(state);
  }

  /**
   * 检查是否正在处理翻译
   */
  public async isTranslationProcessing(): Promise<boolean> {
    const state = await this.getTranslateState();
    return TranslateStateHelper.isProcessing(state);
  }

  /**
   * 获取设置面板状态
   */
  public async getSettingPanelState(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.stateMemoryCache.settingPanelOpen || DEFAULT_RUNTIME_STATE.settingPanelOpen;
  }

  /**
   * 🔧 新增：同步获取设置面板状态（用于保持用户手势上下文）
   * @returns 设置面板是否打开
   */
  public getSettingPanelStateSync(): boolean {
    return this.syncCache.settingPanelOpen;
  }

  /**
   * 设置设置面板状态
   */
  public async setSettingPanelState(open: boolean): Promise<void> {
    console.log(`[runtime-state-manager] 设置面板状态变更请求: ${open}`);
    
    // 🔧 立即更新同步缓存
    this.syncCache.settingPanelOpen = open;
    
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.stateMemoryCache.settingPanelOpen === open) {
      console.log(`[runtime-state-manager] 设置面板状态无变化 (${open})，跳过保存`);
      return; // 值未变化，无需保存
    }
    
    console.log(`[runtime-state-manager] 设置面板状态从 ${this.stateMemoryCache.settingPanelOpen} 变更为 ${open}`);
    
    // 更新内存缓存
    this.stateMemoryCache.settingPanelOpen = open;
    
    // 获取完整的状态并保存
    const fullState = await this.getAllState();
    await this.saveToStorage(fullState);
    
    console.log(`[runtime-state-manager] ✅ 设置面板状态已更新并保存到session storage: ${open}`);
  }

  /**
   * 销毁管理器
   */
  public destroy(): void {
    this.changeHandlers.clear();
    this.stateMemoryCache = {};
    this.initialized = false;
    
    console.log('[runtime-state-manager] 运行时状态管理器已销毁');
  }

  /**
   * 获取完整的运行时状态
   * 
   * @returns {Promise<Partial<RuntimeState>>} 返回一个包含所有当前运行时状态的对象。
   */
  public async getAllStates(): Promise<Partial<RuntimeState>> {
    if (!this.initialized) {
      await this.initialize();
    }
    return { ...this.stateMemoryCache };
  }
} 