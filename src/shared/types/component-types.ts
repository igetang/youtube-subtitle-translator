/**
 * @file component-types.ts
 * @description 组件状态类型定义
 * 基于 architecture.md 明确分离组件状态与外部状态依赖
 */

import { ProcessedSubtitleEvent } from './core-types';
import { UserPreferences } from './user-preferences-types';
import { RuntimeState, TranslateActiveState } from './runtime-state-types';

/**
 * 控制面板状态接口
 * 只包含面板本身的状态，不包含外部状态（UserPreferences、RuntimeState）
 * 外部状态通过管理器动态获取
 */
export interface ControlPanelState {
  // === 面板初始化状态 ===
  isInitialized: boolean;
  isTranslating: boolean;
  lastError: string | null;
  
  // === 当前视频状态 ===
  currentVideoId: string | null;
  subtitleEvents: ProcessedSubtitleEvent[];
  
  // === UI 状态 ===
  isVisible: boolean;
  isCollapsed: boolean;
  
  // === 批处理状态 ===
  pendingUpdates: Map<string, any>;
  batchUpdateTimeout: number | null;
}

/**
 * 默认控制面板状态
 */
export const DEFAULT_CONTROL_PANEL_STATE: ControlPanelState = {
  isInitialized: false,
  isTranslating: false,
  lastError: null,
  
  currentVideoId: null,
  subtitleEvents: [],
  
  isVisible: true,
  isCollapsed: false,
  
  pendingUpdates: new Map(),
  batchUpdateTimeout: null
};

/**
 * 控制面板事件类型
 */
export enum ControlPanelEvent {
  // === 初始化事件 ===
  INITIALIZED = 'initialized',
  DESTROYED = 'destroyed',
  PANEL_INITIALIZED = 'controlPanel.initialized',
  PANEL_ERROR = 'controlPanel.error',
  
  // === 状态变更事件 ===
  STATE_CHANGED = 'stateChanged',
  TRANSLATION_STARTED = 'translationStarted',
  TRANSLATION_STOPPED = 'translationStopped',
  TRANSLATION_COMPLETED = 'controlPanel.translationCompleted',
  TRANSLATION_ERROR = 'controlPanel.translationError',
  ERROR_OCCURRED = 'errorOccurred',
  SUBTITLE_TRACKS_LOADED = 'subtitleTracksLoaded',
  
  // === 兼容性事件（与旧架构保持兼容） ===
  SETTINGS_CHANGED = 'settingsChanged',
  SUBTITLE_PROCESSED = 'subtitleProcessed',
  UI_UPDATE_REQUIRED = 'controlPanel.uiUpdateRequired'
}

/**
 * 控制面板状态变更事件数据
 */
export interface ControlPanelStateChangeEvent {
  event: ControlPanelEvent;
  data: any;
  timestamp: number;
}

/**
 * 控制面板状态变更处理函数类型
 */
export type ControlPanelStateChangeHandler = (event: ControlPanelStateChangeEvent) => void;

/**
 * UI管理器状态接口
 * 管理YouTube页面UI控件的注入和状态
 * 
 * 📝 设计说明：
 * - 与RuntimeState分离：translateActive和popupOpen通过RuntimeStateManager管理
 * - 专注UI控件：控件注入、叠加层创建、错误处理
 * - 状态同步：与RuntimeState保持同步，但不直接依赖
 */
export interface UIManagerState {
  // === 控件注入状态 ===
  /** 控件是否已注入到页面 */
  controlsInjected: boolean;
  /** 字幕叠加层是否已创建 */
  overlayCreated: boolean;
  /** 控件注入尝试次数 */
  injectionAttempts: number;
  
  // === 运行时状态引用（通过RuntimeStateManager获取） ===
  /** 翻译激活状态 - 从RuntimeState同步 */
  translateActive: TranslateActiveState;
  /** Popup打开状态 - 从RuntimeState同步 */
  popupOpen: boolean;
  
  // === UI特有状态 ===
  /** 最后发生的错误 */
  lastError: string | null;
  /** 当前页面URL（用于导航检测） */
  currentPage: string | null;
  /** 是否为视频页面 */
  isVideoPage: boolean;
}

/**
 * 默认UI管理器状态
 */
export const DEFAULT_UI_MANAGER_STATE: UIManagerState = {
  // 控件注入状态
  controlsInjected: false,
  overlayCreated: false,
  injectionAttempts: 0,
  
  // 运行时状态（初始值，实际值从RuntimeState获取）
  translateActive: TranslateActiveState.INACTIVE,
  popupOpen: false,
  
  // UI特有状态
  lastError: null,
  currentPage: null,
  isVideoPage: false
};

/**
 * 组件状态管理器接口
 * 定义组件状态管理的基本规范
 */
export interface ComponentStateManager<T> {
  /**
   * 获取状态
   */
  getState(): T;
  
  /**
   * 更新状态（部分更新）
   */
  updateState(updates: Partial<T>): void;
  
  /**
   * 重置状态
   */
  resetState(): void;
  
  /**
   * 添加状态变更监听器
   */
  addStateChangeListener(handler: (newState: T, oldState: T) => void): void;
  
  /**
   * 移除状态变更监听器
   */
  removeStateChangeListener(handler: (newState: T, oldState: T) => void): void;
  
  /**
   * 销毁管理器
   */
  destroy(): void;
}

/**
 * 组件状态管理器配置
 */
export interface ComponentStateManagerConfig {
  /**
   * 是否启用状态持久化
   */
  persistence?: boolean;
  
  /**
   * 状态变更批处理延迟时间（ms）
   */
  batchUpdateDelay?: number;
  
  /**
   * 最大状态历史记录数
   */
  maxStateHistory?: number;
  
  /**
   * 调试模式
   */
  debug?: boolean;
}

/**
 * 组件状态快照
 * 用于状态历史记录和调试
 */
export interface ComponentStateSnapshot<T> {
  state: T;
  timestamp: number;
  event?: string;
  source?: string;
}

/**
 * 组件状态验证器接口
 */
export interface ComponentStateValidator<T> {
  /**
   * 验证状态
   */
  validate(state: T): boolean;
  
  /**
   * 获取验证错误信息
   */
  getValidationErrors(state: T): string[];
  
  /**
   * 修复无效状态
   */
  fixInvalidState(state: T): T;
}

/**
 * 控制面板状态验证器
 */
export class ControlPanelStateValidator implements ComponentStateValidator<ControlPanelState> {
  /**
   * 验证控制面板状态
   */
  validate(state: ControlPanelState): boolean {
    return (
      typeof state.isInitialized === 'boolean' &&
      typeof state.isTranslating === 'boolean' &&
      (state.lastError === null || typeof state.lastError === 'string') &&
      (state.currentVideoId === null || typeof state.currentVideoId === 'string') &&
      Array.isArray(state.subtitleEvents) &&
      typeof state.isVisible === 'boolean' &&
      typeof state.isCollapsed === 'boolean' &&
      state.pendingUpdates instanceof Map &&
      (state.batchUpdateTimeout === null || typeof state.batchUpdateTimeout === 'number')
    );
  }
  
  /**
   * 获取验证错误信息
   */
  getValidationErrors(state: ControlPanelState): string[] {
    const errors: string[] = [];
    
    if (typeof state.isInitialized !== 'boolean') {
      errors.push('isInitialized必须是boolean类型');
    }
    
    if (typeof state.isTranslating !== 'boolean') {
      errors.push('isTranslating必须是boolean类型');
    }
    
    if (state.lastError !== null && typeof state.lastError !== 'string') {
      errors.push('lastError必须是null或string类型');
    }
    
    if (state.currentVideoId !== null && typeof state.currentVideoId !== 'string') {
      errors.push('currentVideoId必须是null或string类型');
    }
    
    if (!Array.isArray(state.subtitleEvents)) {
      errors.push('subtitleEvents必须是数组类型');
    }
    
    if (typeof state.isVisible !== 'boolean') {
      errors.push('isVisible必须是boolean类型');
    }
    
    if (typeof state.isCollapsed !== 'boolean') {
      errors.push('isCollapsed必须是boolean类型');
    }
    
    if (!(state.pendingUpdates instanceof Map)) {
      errors.push('pendingUpdates必须是Map类型');
    }
    
    if (state.batchUpdateTimeout !== null && typeof state.batchUpdateTimeout !== 'number') {
      errors.push('batchUpdateTimeout必须是null或number类型');
    }
    
    return errors;
  }
  
  /**
   * 修复无效的控制面板状态
   */
  fixInvalidState(state: ControlPanelState): ControlPanelState {
    const fixedState = { ...DEFAULT_CONTROL_PANEL_STATE };
    
    // 保留有效字段
    if (typeof state.isInitialized === 'boolean') {
      fixedState.isInitialized = state.isInitialized;
    }
    
    if (typeof state.isTranslating === 'boolean') {
      fixedState.isTranslating = state.isTranslating;
    }
    
    if (state.lastError === null || typeof state.lastError === 'string') {
      fixedState.lastError = state.lastError;
    }
    
    if (state.currentVideoId === null || typeof state.currentVideoId === 'string') {
      fixedState.currentVideoId = state.currentVideoId;
    }
    
    if (Array.isArray(state.subtitleEvents)) {
      fixedState.subtitleEvents = state.subtitleEvents;
    }
    
    if (typeof state.isVisible === 'boolean') {
      fixedState.isVisible = state.isVisible;
    }
    
    if (typeof state.isCollapsed === 'boolean') {
      fixedState.isCollapsed = state.isCollapsed;
    }
    
    if (state.pendingUpdates instanceof Map) {
      fixedState.pendingUpdates = state.pendingUpdates;
    }
    
    if (state.batchUpdateTimeout === null || typeof state.batchUpdateTimeout === 'number') {
      fixedState.batchUpdateTimeout = state.batchUpdateTimeout;
    }
    
    return fixedState;
  }
} 