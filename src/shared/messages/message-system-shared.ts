/**
 * @file message-system-shared.ts
 * @description 统一消息系统实例 - 替换GlobalMessageSystem，解决重复初始化问题
 * @version 2.0.0
 * @author AI Assistant
 */

import { MessageBus } from './message-bus';
import { MessageHandlers } from './message-handlers';
import type { MessageHandlerCallbacks } from './message-handlers';
import { MessageSender } from './messages';

/**
 * 统一消息系统实例
 * 替换GlobalMessageSystem，统一管理所有消息系统初始化
 * 
 * 设计原则：
 * - 符合单例模式，确保消息系统全局唯一
 * - 懒加载机制，仅在需要时初始化
 * - 幂等性保证，多次调用不会产生副作用
 * - 完全替换GlobalMessageSystem，消除重复
 */
export class SharedMessageSystem {
  private static messageBus: MessageBus | null = null;
  private static messageHandlers: MessageHandlers | null = null;
  private static initialized = false;
  private static senderType: MessageSender | null = null;

  /**
   * 初始化消息系统
   * 替换原有的initializeMessageSystem和GlobalMessageSystem
   * @param senderType 发送者类型
   * @param callbacks 消息处理回调
   * @param options 可选配置
   */
  public static initialize(
    senderType: MessageSender,
    callbacks?: MessageHandlerCallbacks,
    options?: { logging?: boolean }
  ): { messageBus: MessageBus; messageHandlers: MessageHandlers } {
    if (this.initialized && this.senderType === senderType) {
      console.log(`[SharedMessageSystem] 已初始化（${senderType}），跳过重复初始化`);
      return {
        messageBus: this.messageBus!,
        messageHandlers: this.messageHandlers!
      };
    }

    console.log(`[SharedMessageSystem] 开始初始化消息系统 (${senderType})...`);
    
    // 创建MessageBus实例（使用getInstance方法）
    this.messageBus = MessageBus.getInstance({
      currentSender: senderType,
      enableLogging: options?.logging ?? true
    });
    
    // 创建MessageHandlers实例
    this.messageHandlers = new MessageHandlers(callbacks);
    
    // 注册消息路由到MessageBus
    const routes = this.messageHandlers.getRoutes();
    this.messageBus.registerRoutes(routes);
    
    this.senderType = senderType;
    this.initialized = true;
    
    console.log('[SharedMessageSystem] ✅ 消息系统初始化完成');
    
    return {
      messageBus: this.messageBus,
      messageHandlers: this.messageHandlers
    };
  }

  /**
   * 获取已初始化的消息系统实例（向后兼容）
   */
  private static ensureInitialized(): void {
    if (!this.initialized) {
      console.warn('[SharedMessageSystem] 系统未初始化，使用默认配置自动初始化...');
      this.initialize(MessageSender.CONTENT_SCRIPT);
    }
  }

  /**
   * 获取共享的MessageBus实例
   * @returns MessageBus实例，如果未初始化则自动初始化
   */
  public static getMessageBus(): MessageBus | null {
    this.ensureInitialized();
    return this.messageBus;
  }

  /**
   * 获取共享的MessageHandlers实例
   * @returns MessageHandlers实例，如果未初始化则自动初始化
   */
  public static getMessageHandlers(): MessageHandlers | null {
    this.ensureInitialized();
    return this.messageHandlers;
  }

  /**
   * 检查初始化状态
   * @returns 是否已初始化
   */
  public static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取初始化状态信息（用于调试）
   */
  public static getStatus(): {
    initialized: boolean;
    hasMessageBus: boolean;
    hasMessageHandlers: boolean;
  } {
    return {
      initialized: this.initialized,
      hasMessageBus: this.messageBus !== null,
      hasMessageHandlers: this.messageHandlers !== null
    };
  }

  /**
   * 重置状态（仅用于测试）
   * ⚠️ 警告：此方法仅应在测试环境中使用
   */
  public static reset(): void {
    console.warn('[SharedMessageSystem] 🔄 重置消息系统（仅应在测试中使用）');
    this.messageBus = null;
    this.messageHandlers = null;
    this.initialized = false;
  }
} 