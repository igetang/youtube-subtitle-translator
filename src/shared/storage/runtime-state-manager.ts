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
  private runtimeCache: Partial<RuntimeState> = {};
  private initialized: boolean = false;
  
  // 🔧 新增：同步缓存，用于保持用户手势上下文
  private syncCache: { popupOpen: boolean } = { popupOpen: false };

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

            // 更新运行时缓存
            (this.runtimeCache as any)[stateKey] = newValue;

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
      [RUNTIME_STATE_STORAGE_KEYS.POPUP_OPEN]: 'popupOpen'
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
      case 'popupOpen':
        event = RuntimeStateChangeEvent.POPUP_STATE_CHANGED;
        break;
    }
    
    if (event && this.changeHandlers.has(event)) {
      const handlers = this.changeHandlers.get(event)!;
      handlers.forEach(handler => {
        try {
          handler(newValue, oldValue, event as RuntimeStateChangeEvent);
        } catch (error) {
          console.error(`[runtime-state-manager] ✗ 事件处理器执行失败 (${event}):`, error);
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
    const currentHandlers = this.changeHandlers.get(event)!;
    currentHandlers.add(handler);

    this.changeHandlers.set(event, currentHandlers);
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
      // 🔧 数据迁移：清理存储中的布尔值
      await this.cleanupBooleanValues();
      
      // 尝试从存储加载状态
      const loadResult = await this.loadFromStorage();
      
      if (loadResult.success && loadResult.state) {
        // 加载成功，使用存储的状态
        this.runtimeCache = loadResult.state;
        console.log('[runtime-state-manager] ✓ 运行时状态已加载');
      } else {
        // 加载失败，使用默认状态
        await this.useDefaultState();
        console.log('[runtime-state-manager] ✓ 运行时状态已加载（默认值）');
      }

      this.initialized = true;
      
    } catch (error) {
      console.error('[runtime-state-manager] ✗ 初始化失败:', error);
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
        console.log('[runtime-state-manager] ✓ 数据迁移完成:', enumValue);
      }
    } catch (error) {
      console.error('[runtime-state-manager] ✗ 清理布尔值失败:', error);
    }
  }

  /**
   * 使用默认状态
   * 🔧 优化：移除重复的存储检查，直接使用默认状态
   */
  private async useDefaultState(): Promise<void> {
    try {
      // 直接使用默认状态，避免重复的存储检查
      const defaultState: RuntimeState = { ...DEFAULT_RUNTIME_STATE };

      this.runtimeCache = defaultState;
      // 🔧 同步更新 syncCache
      this.syncCache.popupOpen = defaultState.popupOpen;
      await this.saveToStorage(defaultState);
    } catch (error) {
      console.warn('[runtime-state-manager] ✗ 设置默认状态失败:', error);
      this.runtimeCache = { ...DEFAULT_RUNTIME_STATE };
      // 🔧 同步更新 syncCache
      this.syncCache.popupOpen = DEFAULT_RUNTIME_STATE.popupOpen;
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
        RUNTIME_STATE_STORAGE_KEYS.POPUP_OPEN
      ], RUNTIME_STATE_CONFIG.STORAGE_AREA);
      
      // 🔧 修复：检查是否有任何有效数据，即使是部分数据也算成功
      const hasTranslateData = storageData[RUNTIME_STATE_STORAGE_KEYS.TRANSLATE_ACTIVE] !== undefined;
      const hasPopupData = storageData[RUNTIME_STATE_STORAGE_KEYS.POPUP_OPEN] !== undefined;
      
      if (!hasTranslateData && !hasPopupData) {
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

      // 🔧 将字符串转换为枚举值（存储的是字符串，内部使用枚举）
      if (typeof translateActiveValue === 'string') {
        switch (translateActiveValue) {
          case 'inactive':
            translateActiveValue = TranslateActiveState.INACTIVE;
            break;
          case 'pending':
            translateActiveValue = TranslateActiveState.PENDING;
            break;
          case 'active':
            translateActiveValue = TranslateActiveState.ACTIVE;
            break;
          default:
            console.warn(`[runtime-state-manager] 未知的状态字符串: ${translateActiveValue}，使用默认值`);
            translateActiveValue = DEFAULT_RUNTIME_STATE.translateActive;
        }
      }

      // 重构运行时状态对象
      const loadedState: RuntimeState = {
        translateActive: translateActiveValue || DEFAULT_RUNTIME_STATE.translateActive,
        popupOpen: storageData[RUNTIME_STATE_STORAGE_KEYS.POPUP_OPEN] || DEFAULT_RUNTIME_STATE.popupOpen
      };
      
      // 🔧 同步更新 syncCache
      this.syncCache.popupOpen = loadedState.popupOpen;
      
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
      [RUNTIME_STATE_STORAGE_KEYS.POPUP_OPEN]: state.popupOpen
    };
    
    // 批量保存到存储
    await this.storageManager.setBatch(storageData, RUNTIME_STATE_CONFIG.STORAGE_AREA);
    // 更新运行时缓存
    this.runtimeCache = { ...state };
  }

  /**
   * 获取完整的运行时状态
   */
  public async getAllState(): Promise<RuntimeState> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 🔧 数据清理：确保translateActive始终是枚举值
    const state = { ...DEFAULT_RUNTIME_STATE, ...this.runtimeCache } as RuntimeState;
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

    let translateState = this.runtimeCache.translateActive || DEFAULT_RUNTIME_STATE.translateActive;

    // 🔧 数据清理：确保返回的始终是枚举值
    if (typeof translateState === 'boolean') {
      console.warn('[runtime-state-manager] getTranslateState检测到布尔值，进行转换:', translateState);
      translateState = (translateState as any) ? TranslateActiveState.ACTIVE : TranslateActiveState.INACTIVE;
    }

    // 🔧 将字符串转换为枚举值（确保返回的始终是枚举）
    if (typeof translateState === 'string') {
      switch (translateState) {
        case 'inactive':
          return TranslateActiveState.INACTIVE;
        case 'pending':
          return TranslateActiveState.PENDING;
        case 'active':
          return TranslateActiveState.ACTIVE;
        default:
          console.warn(`[runtime-state-manager] getTranslateState: 未知的状态字符串 "${translateState}"，使用默认值`);
          return DEFAULT_RUNTIME_STATE.translateActive;
      }
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

    // 检查缓存（先检查缓存，防止并发）
    if (this.runtimeCache.translateActive === state) {
      return; // 值未变化，无需保存
    }

    // 获取当前状态（用于日志）
    const currentState = this.runtimeCache.translateActive || DEFAULT_RUNTIME_STATE.translateActive;

    // 检查状态转换是否合法
    if (!TranslateStateHelper.canTransition(currentState, state)) {
      console.warn(`[RSM] 非法的状态转换: ${currentState} -> ${state}`);
      return;
    }

    // 立即更新运行时缓存
    this.runtimeCache.translateActive = state;

    // 获取完整的状态并保存
    const fullState = await this.getAllState();
    await this.saveToStorage(fullState);
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
   * 获取Popup状态
   */
  public async getPopupState(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.runtimeCache.popupOpen || DEFAULT_RUNTIME_STATE.popupOpen;
  }

  /**
   * 🔧 新增：同步获取Popup状态（用于保持用户手势上下文）
   * @returns Popup是否打开
   */
  public getPopupStateSync(): boolean {
    return this.syncCache.popupOpen;
  }

  /**
   * 设置Popup状态
   */
  public async setPopupState(open: boolean): Promise<void> {
    // 🔧 立即更新同步缓存
    this.syncCache.popupOpen = open;
    
    if (!this.initialized) {
      await this.initialize();
    }
    
    const oldValue = this.runtimeCache.popupOpen;
    if (oldValue === open) {
      return; // 值未变化，无需保存
    }
    
    console.log(`[runtime-state-manager] setPopupState: popupOpen [${oldValue} → ${open}]`);
    
    // 更新运行时缓存
    this.runtimeCache.popupOpen = open;
    
    // 获取完整的状态并保存
    const fullState = await this.getAllState();
    await this.saveToStorage(fullState);
  }

  /**
   * 销毁管理器
   */
  public destroy(): void {
    this.changeHandlers.clear();
    this.runtimeCache = {};
    this.initialized = false;
    
    console.log('[runtime-state-manager] 管理器已销毁');
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
    return { ...this.runtimeCache };
  }
}
