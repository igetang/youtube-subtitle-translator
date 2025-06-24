/**
 * YouTube字幕翻译助手 - 消息处理器集合
 * @fileoverview 提供各种消息类型的标准处理器实现
 * @version 5.24.6
 * @author AI Assistant
 */

import {
  MessageType,
  MessageSender,
  MessageRoute,
  MessageHandler,
  ExtensionMessage,
  SubtitleDetectedMessage,
  SubtitleUpdatedMessage,
  TranslationRequestMessage,
  TranslationResponseMessage,
  TranslationToggleMessage,
  UIStateUpdateMessage,
  SettingsGetMessage,
  SettingsUpdateMessage,
  SidePanelDataRequestMessage,
  ErrorReportMessage
} from '../types';

/**
 * 消息处理器回调接口
 */
export interface MessageHandlerCallbacks {
  /** 字幕检测回调 */
  onSubtitleDetected?: (data: SubtitleDetectedMessage['data']) => void;
  /** 字幕更新回调 */
  onSubtitleUpdated?: (data: SubtitleUpdatedMessage['data']) => void;
  /** 翻译请求回调 */
  onTranslationRequest?: (data: TranslationRequestMessage['data']) => Promise<string>;
  /** 翻译响应回调 */
  onTranslationResponse?: (data: TranslationResponseMessage['data']) => void;
  /** 翻译开关回调 */
  onTranslationToggle?: (data: TranslationToggleMessage['data']) => void;
  /** UI状态更新回调 */
  onUIStateUpdate?: (data: UIStateUpdateMessage['data']) => void;
  /** 设置获取回调 */
  onSettingsGet?: (data: SettingsGetMessage['data']) => Promise<any>;
  /** 设置更新回调 */
  onSettingsUpdate?: (data: SettingsUpdateMessage['data']) => Promise<boolean>;
  /** SidePanel数据请求回调 */
  onSidePanelDataRequest?: (data: SidePanelDataRequestMessage['data']) => Promise<any>;
  /** 错误报告回调 */
  onErrorReport?: (data: ErrorReportMessage['data']) => void;
}

/**
 * 消息处理器工厂类
 */
export class MessageHandlers {
  private callbacks: MessageHandlerCallbacks;

  constructor(callbacks: MessageHandlerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * 更新回调函数
   */
  public updateCallbacks(callbacks: Partial<MessageHandlerCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 获取所有消息路由
   */
  public getRoutes(): MessageRoute[] {
    return [
      // 字幕相关路由
      {
        type: MessageType.SUBTITLE_DETECTED,
        handler: this.createTypedHandler(this.handleSubtitleDetected.bind(this)),
        requiresResponse: false,
        allowCrossTab: true
      },
      {
        type: MessageType.SUBTITLE_UPDATED,
        handler: this.createTypedHandler(this.handleSubtitleUpdated.bind(this)),
        requiresResponse: false,
        allowCrossTab: true
      },

      // 翻译相关路由
      {
        type: MessageType.TRANSLATION_REQUEST,
        handler: this.createTypedHandler(this.handleTranslationRequest.bind(this)),
        requiresResponse: true,
        timeout: 10000,
        allowCrossTab: false
      },
      {
        type: MessageType.TRANSLATION_RESPONSE,
        handler: this.createTypedHandler(this.handleTranslationResponse.bind(this)),
        requiresResponse: false,
        allowCrossTab: true
      },
      {
        type: MessageType.TRANSLATION_TOGGLE,
        handler: this.createTypedHandler(this.handleTranslationToggle.bind(this)),
        requiresResponse: false,
        allowCrossTab: true
      },

      // UI相关路由
      {
        type: MessageType.UI_STATE_UPDATE,
        handler: this.createTypedHandler(this.handleUIStateUpdate.bind(this)),
        requiresResponse: false,
        allowCrossTab: true
      },

      // 设置相关路由
      {
        type: MessageType.SETTINGS_GET,
        handler: this.createTypedHandler(this.handleSettingsGet.bind(this)),
        requiresResponse: true,
        timeout: 3000,
        allowCrossTab: false
      },
      {
        type: MessageType.SETTINGS_UPDATE,
        handler: this.createTypedHandler(this.handleSettingsUpdate.bind(this)),
        requiresResponse: true,
        timeout: 5000,
        allowCrossTab: false
      },

      // SidePanel相关路由
      {
        type: MessageType.SIDEPANEL_DATA_REQUEST,
        handler: this.createTypedHandler(this.handleSidePanelDataRequest.bind(this)),
        requiresResponse: true,
        timeout: 3000,
        allowCrossTab: false
      },

      // 错误处理路由
      {
        type: MessageType.ERROR_REPORT,
        handler: this.createTypedHandler(this.handleErrorReport.bind(this)),
        requiresResponse: false,
        allowCrossTab: true
      }
    ];
  }

  /**
   * 创建类型安全的处理器包装器
   */
  private createTypedHandler(handler: any): MessageHandler {
    return (message: ExtensionMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      return handler(message, sender, sendResponse);
    };
  }

  /**
   * 处理字幕检测消息
   */
  private handleSubtitleDetected(
    message: SubtitleDetectedMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): void {
    try {
      this.log('[MessageHandlers] 处理字幕检测消息', message.data);
      
      if (this.callbacks.onSubtitleDetected) {
        this.callbacks.onSubtitleDetected(message.data);
      }
    } catch (error) {
      this.handleError('字幕检测消息处理失败', error, message);
    }
  }

  /**
   * 处理字幕更新消息
   */
  private handleSubtitleUpdated(
    message: SubtitleUpdatedMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): void {
    try {
      this.log('[MessageHandlers] 处理字幕更新消息', {
        videoId: message.data.videoId,
        eventsCount: message.data.events.length
      });
      
      if (this.callbacks.onSubtitleUpdated) {
        this.callbacks.onSubtitleUpdated(message.data);
      }
    } catch (error) {
      this.handleError('字幕更新消息处理失败', error, message);
    }
  }

  /**
   * 处理翻译请求消息
   */
  private async handleTranslationRequest(
    message: TranslationRequestMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      this.log('[MessageHandlers] 处理翻译请求消息', {
        textLength: message.data.text.length,
        sourceLanguage: message.data.sourceLanguage,
        targetLanguage: message.data.targetLanguage
      });

      if (this.callbacks.onTranslationRequest) {
        const translatedText = await this.callbacks.onTranslationRequest(message.data);
        
        sendResponse({
          success: true,
          data: {
            originalText: message.data.text,
            translatedText,
            sourceLanguage: message.data.sourceLanguage,
            targetLanguage: message.data.targetLanguage,
            textHash: message.data.textHash,
            fromCache: false
          }
        });
      } else {
        sendResponse({
          success: false,
          error: '翻译处理器未注册'
        });
      }

      return true; // 保持响应通道开启
    } catch (error) {
      this.handleError('翻译请求处理失败', error, message);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '翻译处理失败'
      });
      return true;
    }
  }

  /**
   * 处理翻译响应消息
   */
  private handleTranslationResponse(
    message: TranslationResponseMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): void {
    try {
      this.log('[MessageHandlers] 处理翻译响应消息', {
        textHash: message.data.textHash,
        fromCache: message.data.fromCache
      });
      
      if (this.callbacks.onTranslationResponse) {
        this.callbacks.onTranslationResponse(message.data);
      }
    } catch (error) {
      this.handleError('翻译响应消息处理失败', error, message);
    }
  }

  /**
   * 处理翻译开关消息
   */
  private handleTranslationToggle(
    message: TranslationToggleMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): void {
    try {
      this.log('[MessageHandlers] 处理翻译开关消息', {
        enabled: message.data.enabled,
        videoId: message.data.videoId
      });
      
      if (this.callbacks.onTranslationToggle) {
        this.callbacks.onTranslationToggle(message.data);
      }
    } catch (error) {
      this.handleError('翻译开关消息处理失败', error, message);
    }
  }

  /**
   * 处理UI状态更新消息
   */
  private handleUIStateUpdate(
    message: UIStateUpdateMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): void {
    try {
      this.log('[MessageHandlers] 处理UI状态更新消息', message.data);
      
      if (this.callbacks.onUIStateUpdate) {
        this.callbacks.onUIStateUpdate(message.data);
      }
    } catch (error) {
      this.handleError('UI状态更新消息处理失败', error, message);
    }
  }

  /**
   * 处理设置获取消息
   */
  private async handleSettingsGet(
    message: SettingsGetMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      this.log('[MessageHandlers] 处理设置获取消息', message.data);

      if (this.callbacks.onSettingsGet) {
        const settings = await this.callbacks.onSettingsGet(message.data);
        
        sendResponse({
          success: true,
          data: settings
        });
      } else {
        sendResponse({
          success: false,
          error: '设置获取处理器未注册'
        });
      }

      return true; // 保持响应通道开启
    } catch (error) {
      this.handleError('设置获取处理失败', error, message);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '设置获取失败'
      });
      return true;
    }
  }

  /**
   * 处理设置更新消息
   */
  private async handleSettingsUpdate(
    message: SettingsUpdateMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      this.log('[MessageHandlers] 处理设置更新消息', {
        hasPreferences: !!message.data.preferences,
        merge: message.data.merge
      });

      if (this.callbacks.onSettingsUpdate) {
        const success = await this.callbacks.onSettingsUpdate(message.data);
        
        sendResponse({
          success,
          data: { updated: success }
        });
      } else {
        sendResponse({
          success: false,
          error: '设置更新处理器未注册'
        });
      }

      return true; // 保持响应通道开启
    } catch (error) {
      this.handleError('设置更新处理失败', error, message);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '设置更新失败'
      });
      return true;
    }
  }

  /**
   * 处理SidePanel数据请求消息
   */
  private async handleSidePanelDataRequest(
    message: SidePanelDataRequestMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      this.log('[MessageHandlers] 处理SidePanel数据请求', {
        requestType: message.data.requestType,
        tabId: message.data.tabId
      });

      if (this.callbacks.onSidePanelDataRequest) {
        const data = await this.callbacks.onSidePanelDataRequest(message.data);
        
        sendResponse({
          success: true,
          data
        });
      } else {
        sendResponse({
          success: false,
          error: 'SidePanel数据请求处理器未注册'
        });
      }

      return true; // 保持响应通道开启
    } catch (error) {
      this.handleError('SidePanel数据请求处理失败', error, message);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'SidePanel数据请求失败'
      });
      return true;
    }
  }

  /**
   * 处理错误报告消息
   */
  private handleErrorReport(
    message: ErrorReportMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): void {
    try {
      this.log('[MessageHandlers] 处理错误报告消息', {
        errorType: message.data.errorType,
        errorCode: message.data.errorCode,
        severity: message.data.severity
      });
      
      if (this.callbacks.onErrorReport) {
        this.callbacks.onErrorReport(message.data);
      }
    } catch (error) {
      this.handleError('错误报告消息处理失败', error, message);
    }
  }

  /**
   * 处理错误
   */
  private handleError(context: string, error: unknown, message?: ExtensionMessage): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[MessageHandlers] ${context}:`, {
      error: errorMessage,
      messageType: message?.type,
      messageId: message?.messageId
    });

    // 如果有错误报告回调，报告此错误
    if (this.callbacks.onErrorReport && message) {
             this.callbacks.onErrorReport({
         errorType: 'system',
         errorCode: 'MESSAGE_HANDLER_ERROR',
         errorMessage: `${context}: ${errorMessage}`,
         context: {
           operation: context,
           url: `messageType:${message.type}`,
           userAgent: message.messageId
         },
         severity: 'medium'
       });
    }
  }

  /**
   * 日志记录
   */
  private log(message: string, data?: any): void {
    console.log(message, data || '');
  }
}

/**
 * 创建标准消息处理器集合
 */
export function createMessageHandlers(callbacks: MessageHandlerCallbacks = {}): MessageHandlers {
  return new MessageHandlers(callbacks);
}

/**
 * 创建空的消息处理器集合 (用于测试)
 */
export function createEmptyMessageHandlers(): MessageHandlers {
  return new MessageHandlers({});
} 