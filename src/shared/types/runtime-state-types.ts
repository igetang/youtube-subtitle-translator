/**
 * @file runtime-state-types.ts
 * @description 新架构下的运行时状态类型定义
 * 基于 architecture.md 7.1.2 RuntimeState 设计规范
 */

/**
 * 翻译状态枚举 - 支持4状态逻辑
 */
export enum TranslateActiveState {
  INACTIVE = 'inactive',      // 翻译关闭
  PENDING = 'pending',         // 翻译执行中（过渡状态）
  ACTIVE = 'active',           // 翻译激活（有字幕并显示翻译）
  INTENT_ONLY = 'intent_only'  // 仅有意图（用户想翻译但无字幕）
}

/**
 * 运行时状态 - 全局状态管理
 * 严格符合 architecture.md 7.1.2 RuntimeState 标准规范
 */
export interface RuntimeState {
  // === 核心功能状态 ===
  translateActive: TranslateActiveState;      // 翻译状态（三态：INACTIVE/ACTIVE/PENDING）
  settingPanelOpen: boolean;                  // 设置面板状态（支持A段状态判断）
}

/**
 * 默认运行时状态
 * 严格符合 architecture.md 7.1.2 RuntimeState 标准规范
 */
export const DEFAULT_RUNTIME_STATE: RuntimeState = {
  translateActive: TranslateActiveState.INACTIVE,  // 默认翻译关闭
  settingPanelOpen: false                          // 默认设置面板关闭
};

/**
 * 运行时状态变更事件类型
 */
export enum RuntimeStateChangeEvent {
  TRANSLATE_ACTIVE_CHANGED = 'translateActiveChanged',
  SETTING_PANEL_CHANGED = 'settingPanelChanged'
}

/**
 * 运行时状态变更处理函数类型
 */
export type RuntimeStateChangeHandler = (
  newValue: any,
  oldValue: any,
  event: RuntimeStateChangeEvent
) => void;

/**
 * 翻译状态转换辅助函数
 */
export class TranslateStateHelper {
  /**
   * 判断是否可以从当前状态转换到目标状态
   * @param from 当前状态
   * @param to 目标状态
   * @returns 是否允许转换
   */
  static canTransition(from: TranslateActiveState, to: TranslateActiveState): boolean {
    // 🚀 修复：允许相同状态的转换（幂等操作）
    if (from === to) {
      return true;
    }
    
    // 定义状态转换规则（4状态系统）
    const transitions: Record<TranslateActiveState, TranslateActiveState[]> = {
      // 从INACTIVE只能进入PENDING（开启翻译）
      [TranslateActiveState.INACTIVE]: [TranslateActiveState.PENDING],
      // 从PENDING可以进入ACTIVE（有字幕）、INTENT_ONLY（无字幕）或INACTIVE（出错）
      [TranslateActiveState.PENDING]: [TranslateActiveState.ACTIVE, TranslateActiveState.INTENT_ONLY, TranslateActiveState.INACTIVE],
      // 从ACTIVE直接回到INACTIVE（关闭翻译）
      [TranslateActiveState.ACTIVE]: [TranslateActiveState.INACTIVE],
      // 从INTENT_ONLY直接回到INACTIVE（关闭翻译）
      [TranslateActiveState.INTENT_ONLY]: [TranslateActiveState.INACTIVE]
    };
    
    return transitions[from]?.includes(to) || false;
  }
  
  /**
   * 获取状态的显示名称
   * @param state 翻译状态
   * @returns 显示名称
   */
  static getDisplayName(state: TranslateActiveState): string {
    const names: Record<TranslateActiveState, string> = {
      [TranslateActiveState.INACTIVE]: '翻译关闭',
      [TranslateActiveState.PENDING]: '处理中...',
      [TranslateActiveState.ACTIVE]: '翻译已开启',
      [TranslateActiveState.INTENT_ONLY]: '无字幕'
    };
    
    return names[state];
  }
  
  /**
   * 判断状态是否表示翻译功能可用
   * @param state 翻译状态
   * @returns 是否可用
   */
  static isTranslationAvailable(state: TranslateActiveState): boolean {
    // ACTIVE表示正在显示翻译，PENDING表示正在处理
    return state === TranslateActiveState.ACTIVE || state === TranslateActiveState.PENDING;
  }
  
  /**
   * 判断用户是否有翻译意图
   * @param state 翻译状态
   * @returns 是否有翻译意图
   */
  static hasTranslationIntent(state: TranslateActiveState): boolean {
    // ACTIVE、PENDING和INTENT_ONLY都表示用户想要翻译
    return state === TranslateActiveState.ACTIVE || 
           state === TranslateActiveState.PENDING || 
           state === TranslateActiveState.INTENT_ONLY;
  }
  
  /**
   * 判断状态是否处于处理中
   * @param state 翻译状态  
   * @returns 是否处理中
   */
  static isProcessing(state: TranslateActiveState): boolean {
    return state === TranslateActiveState.PENDING;
  }
}

/**
 * 运行时状态存储键定义
 * 基于 architecture.md 存储规范
 */
export const RUNTIME_STATE_STORAGE_KEYS = {
  TRANSLATE_ACTIVE: 'runtime_state_translateActive',
  SETTING_PANEL_OPEN: 'runtime_state_settingPanelOpen'
} as const;

/**
 * 运行时状态存储配置
 * 🔧 重要修正：使用 chrome.storage.session 实现跨标签页状态同步
 * 符合 architecture.md 7.1.2 RuntimeState 设计规范
 */
export const RUNTIME_STATE_CONFIG = {
  STORAGE_AREA: 'session' as const,                   // 使用session storage实现跨标签页同步
  PREFIX: 'runtime_state_'                            // 存储键前缀
} as const; 