/**
 * YouTube字幕翻译助手 - 消息系统导出模块
 * @fileoverview 提供新架构下的消息系统统一入口
 * @version 5.24.6
 * @author AI Assistant
 * @filename messages.ts (从events.ts重命名，避免index.ts混淆)
 */

// ================================
// 🎯 核心组件导出
// ================================

export { MessageBus } from './message-bus';
export type { MessageBusOptions, MessageLogEntry } from './message-bus';

export { MessageHandlers, createMessageHandlers, createEmptyMessageHandlers } from './message-handlers';
export type { MessageHandlerCallbacks } from './message-handlers';

// ================================
// 📋 类型重新导出 (便捷引用)
// ================================

export {
  MessageType,
  MessageSender,
  MessagePriority,
  TranslationButtonState,
  SettingsButtonState
} from '../types';

export type {
  ExtensionMessage,
  MessageHandler,
  MessageRoute,
  MessageSendOptions,
  MessageSendResult
} from '../types';

// ================================
// 🏗️ 便捷工具函数
// ================================

import { MessageBus, MessageBusOptions } from './message-bus';
import { MessageHandlers, MessageHandlerCallbacks } from './message-handlers';
import { MessageSender } from '../types';
import { SharedMessageSystem } from './message-system-shared';

/**
 * 初始化消息系统
 * ✅ 新版本：使用SharedMessageSystem确保单例，防止重复初始化
 * @param senderType 当前组件类型
 * @param callbacks 消息处理回调
 * @param options 额外配置选项
 * @returns 初始化后的消息总线和处理器
 */
export function initializeMessageSystem(
  senderType: MessageSender,
  callbacks: MessageHandlerCallbacks = {},
  options: { logging?: boolean } = {}
) {
  // 🎯 使用SharedMessageSystem，确保真正的单例
  return SharedMessageSystem.initialize(senderType, callbacks, options);
}

/**
 * 获取全局消息系统实例（向后兼容）
 * @returns SharedMessageSystem类
 */
export function getMessageSystem(): typeof SharedMessageSystem {
  return SharedMessageSystem;
}

/**
 * 获取已初始化的消息总线实例
 * @returns 消息总线实例或null
 */
export function getMessageBus(): MessageBus | null {
  try {
    return MessageBus.getInstance();
  } catch {
    return null;
  }
}

/**
 * 重置消息系统 (主要用于测试)
 */
export function resetMessageSystem(): void {
  MessageBus.resetInstance();
}

// ================================
// 🔍 调试工具
// ================================

/**
 * 获取消息系统状态信息
 */
export function getMessageSystemStatus() {
  const messageBus = getMessageBus();
  
  if (!messageBus) {
    return {
      initialized: false,
      stats: null
    };
  }

  return {
    initialized: true,
    stats: messageBus.getMessageStats()
  };
}

/**
 * 导出消息日志 (用于调试)
 */
export function exportMessageLog() {
  const messageBus = getMessageBus();
  
  if (!messageBus) {
    return [];
  }

  return messageBus.getMessageLog();
}

// ================================
// 🎯 清理完成
// ================================

// 🔧 所有Event相关内容已移除 - 清理完成 