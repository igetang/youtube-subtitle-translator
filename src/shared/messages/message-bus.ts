/**
 * YouTube字幕翻译助手 - 消息总线系统
 * @fileoverview 基于新架构的统一消息通信系统，支持类型安全的消息传递
 * @version 5.24.6
 * @author AI Assistant
 */

import {
  ExtensionMessage,
  MessageType,
  MessageSender,
  MessagePriority,
  MessageHandler,
  MessageSendOptions,
  MessageSendResult,
  MessageRoute,
  createMessageId,
  createTimestamp
} from '../types';

/**
 * 消息总线配置选项
 */
export interface MessageBusOptions {
  /** 是否启用消息日志 */
  enableLogging?: boolean;
  /** 最大日志条目数 */
  maxLogSize?: number;
  /** 默认消息超时时间 (毫秒) */
  defaultTimeout?: number;
  /** 是否启用消息验证 */
  enableValidation?: boolean;
  /** 当前组件类型 */
  currentSender: MessageSender;
}

/**
 * 消息日志条目
 */
export interface MessageLogEntry {
  /** 消息ID */
  messageId: string;
  /** 消息类型 */
  type: MessageType;
  /** 发送者 */
  sender: MessageSender;
  /** 接收者 */
  receiver?: MessageSender;
  /** 时间戳 */
  timestamp: number;
  /** 消息大小 (字节) */
  size: number;
  /** 处理状态 */
  status: 'sent' | 'received' | 'handled' | 'timeout' | 'error';
  /** 处理时间 (毫秒) */
  processingTime?: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 消息总线类 - 统一的消息通信管理器
 */
export class MessageBus {
  private static instance: MessageBus | null = null;
  
  /** 消息路由表 */
  private routes = new Map<MessageType, MessageRoute>();
  
  /** 待响应的消息回调 */
  private pendingCallbacks = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  /** 消息日志 */
  private messageLog: MessageLogEntry[] = [];
  
  /** 配置选项 */
  private options: Required<MessageBusOptions>;
  
  /** 默认配置 */
  private static readonly DEFAULT_OPTIONS: Omit<Required<MessageBusOptions>, 'currentSender'> = {
    enableLogging: true,
    maxLogSize: 200,
    defaultTimeout: 5000,
    enableValidation: true
  };

  /**
   * 私有构造函数
   */
  private constructor(options: MessageBusOptions) {
    this.options = {
      ...MessageBus.DEFAULT_OPTIONS,
      ...options
    };

    // 监听Chrome Extension消息
    this.setupMessageListener();
    
    this.log('[MessageBus] 消息总线已初始化', {
      sender: this.options.currentSender,
      logging: this.options.enableLogging
    });
  }

  /**
   * 获取单例实例
   */
  public static getInstance(options?: MessageBusOptions): MessageBus {
    if (!MessageBus.instance && options) {
      MessageBus.instance = new MessageBus(options);
    } else if (!MessageBus.instance) {
      throw new Error('[MessageBus] 首次获取实例时必须提供配置选项');
    }
    return MessageBus.instance;
  }

  /**
   * 重置单例实例 (主要用于测试)
   */
  public static resetInstance(): void {
    MessageBus.instance = null;
  }

  /**
   * 注册消息路由
   */
  public registerRoute(route: MessageRoute): void {
    this.routes.set(route.type, route);
    // 单个注册时不输出日志，避免在批量注册时产生过多日志
  }

  /**
   * 批量注册消息路由
   */
  public registerRoutes(routes: MessageRoute[]): void {
    routes.forEach(route => this.routes.set(route.type, route));
    this.log('[MessageBus] 批量注册消息路由', { count: routes.length, types: routes.map(r => r.type) });
  }

  /**
   * 发送消息
   */
  public async sendMessage<T = any>(
    message: Omit<ExtensionMessage, 'messageId' | 'timestamp' | 'sender'>,
    options: MessageSendOptions = {}
  ): Promise<MessageSendResult<T>> {
    const fullMessage: ExtensionMessage = {
      ...message,
      messageId: createMessageId('msg'),
      timestamp: createTimestamp(),
      sender: this.options.currentSender
    } as ExtensionMessage;

    const startTime = Date.now();
    
    try {
      // 验证消息
      if (this.options.enableValidation) {
        this.validateMessage(fullMessage);
      }

      // 记录发送日志
      this.logMessage(fullMessage, 'sent');

      let response: T | undefined;

      if (options.waitForResponse !== false) {
        response = await this.sendMessageWithResponse<T>(fullMessage, options);
      } else {
        await this.sendMessageNoResponse(fullMessage, options);
      }

      const endTime = Date.now();
      return {
        success: true,
        response,
        sentAt: startTime,
        respondedAt: endTime,
        roundTripTime: endTime - startTime
      };

    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logMessage(fullMessage, 'error', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        sentAt: startTime,
        respondedAt: endTime,
        roundTripTime: endTime - startTime
      };
    }
  }

  /**
   * 发送消息并等待响应
   */
  private async sendMessageWithResponse<T>(
    message: ExtensionMessage,
    options: MessageSendOptions
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(message.messageId);
        reject(new Error(`消息超时: ${message.type}`));
      }, options.timeout || this.options.defaultTimeout);

      this.pendingCallbacks.set(message.messageId, {
        resolve,
        reject,
        timeout
      });

      // 发送消息
      this.performSend(message, options)
        .catch(error => {
          clearTimeout(timeout);
          this.pendingCallbacks.delete(message.messageId);
          reject(error);
        });
    });
  }

  /**
   * 发送消息不等待响应
   */
  private async sendMessageNoResponse(
    message: ExtensionMessage,
    options: MessageSendOptions
  ): Promise<void> {
    await this.performSend(message, options);
  }

  /**
   * 执行实际的消息发送
   */
  private async performSend(
    message: ExtensionMessage,
    options: MessageSendOptions
  ): Promise<void> {
    if (options.tabId) {
      // 发送到特定标签页
      await chrome.tabs.sendMessage(options.tabId, message);
    } else {
      // 发送到background script
      await chrome.runtime.sendMessage(message);
    }
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      return this.handleIncomingMessage(message, sender, sendResponse);
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleIncomingMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    try {
      // 记录接收日志
      this.logMessage(message, 'received');

      // 检查是否为响应消息
      if (this.isResponseMessage(message)) {
        this.handleResponseMessage(message);
        return false;
      }

      // 查找路由处理器
      const route = this.routes.get(message.type);
      if (!route) {
        this.log('[MessageBus] 未找到消息路由', { type: message.type });
        return false;
      }

      // 检查跨标签页权限
      if (!route.allowCrossTab && sender.tab?.id !== message.tabId) {
        this.log('[MessageBus] 跨标签页消息被拒绝', { 
          type: message.type,
          senderTab: sender.tab?.id,
          targetTab: message.tabId
        });
        return false;
      }

      // 记录处理日志
      this.logMessage(message, 'handled');

      // 调用处理器
      const result = route.handler(message, sender, sendResponse);
      
      // 返回是否需要保持响应通道开启
      return route.requiresResponse || Boolean(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logMessage(message, 'error', errorMessage);
      this.log('[MessageBus] 消息处理出错', { 
        type: message.type, 
        error: errorMessage 
      });
      return false;
    }
  }

  /**
   * 检查是否为响应消息
   */
  private isResponseMessage(message: any): boolean {
    return message && typeof message === 'object' && 'originalMessageId' in message;
  }

  /**
   * 处理响应消息
   */
  private handleResponseMessage(response: any): void {
    const callback = this.pendingCallbacks.get(response.originalMessageId);
    if (callback) {
      clearTimeout(callback.timeout);
      this.pendingCallbacks.delete(response.originalMessageId);
      
      if (response.success) {
        callback.resolve(response.data);
      } else {
        callback.reject(new Error(response.error || '未知错误'));
      }
    }
  }

  /**
   * 验证消息格式
   */
  private validateMessage(message: ExtensionMessage): void {
    if (!message.type) {
      throw new Error('消息类型不能为空');
    }
    if (!message.messageId) {
      throw new Error('消息ID不能为空');
    }
    if (!message.sender) {
      throw new Error('发送者不能为空');
    }
    if (!message.timestamp) {
      throw new Error('时间戳不能为空');
    }
  }

  /**
   * 记录消息日志
   */
  private logMessage(
    message: ExtensionMessage,
    status: MessageLogEntry['status'],
    error?: string
  ): void {
    if (!this.options.enableLogging) {
      return;
    }

    const logEntry: MessageLogEntry = {
      messageId: message.messageId,
      type: message.type,
      sender: message.sender,
      receiver: message.receiver,
      timestamp: message.timestamp,
      size: JSON.stringify(message).length,
      status,
      error
    };

    this.messageLog.push(logEntry);

    // 限制日志大小
    if (this.messageLog.length > this.options.maxLogSize) {
      this.messageLog.shift();
    }
  }

  /**
   * 获取消息统计信息
   */
  public getMessageStats() {
    const stats = {
      totalMessages: this.messageLog.length,
      sentMessages: 0,
      receivedMessages: 0,
      handledMessages: 0,
      errorMessages: 0,
      timeoutMessages: 0,
      averageResponseTime: 0,
      registeredRoutes: this.routes.size,
      pendingCallbacks: this.pendingCallbacks.size
    };

    let totalResponseTime = 0;
    let responseCount = 0;

    this.messageLog.forEach(entry => {
      switch (entry.status) {
        case 'sent':
          stats.sentMessages++;
          break;
        case 'received':
          stats.receivedMessages++;
          break;
        case 'handled':
          stats.handledMessages++;
          if (entry.processingTime) {
            totalResponseTime += entry.processingTime;
            responseCount++;
          }
          break;
        case 'error':
          stats.errorMessages++;
          break;
        case 'timeout':
          stats.timeoutMessages++;
          break;
      }
    });

    if (responseCount > 0) {
      stats.averageResponseTime = totalResponseTime / responseCount;
    }

    return stats;
  }

  /**
   * 获取消息日志
   */
  public getMessageLog(): MessageLogEntry[] {
    return [...this.messageLog];
  }

  /**
   * 清理消息日志
   */
  public clearMessageLog(): void {
    this.messageLog.length = 0;
  }

  /**
   * 清理超时的回调
   */
  public cleanup(): void {
    this.pendingCallbacks.forEach((callback, messageId) => {
      clearTimeout(callback.timeout);
      callback.reject(new Error('消息总线正在清理'));
    });
    this.pendingCallbacks.clear();
  }

  /**
   * 内部日志方法
   */
  private log(message: string, data?: any): void {
    if (this.options.enableLogging) {
      console.log(message, data || '');
    }
  }
} 