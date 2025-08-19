/**
 * @file control-panel.ts  
 * @description 基于新架构完全重构的控制面板组件
 * 解决translateActive字段归属问题，分离UserPreferences和RuntimeState
 */

import { 
  initializeMessageSystem, 
  MessageType, 
  MessageSender,
  getMessageSystem 
} from '../messages/messages';
import { SharedMessageSystem } from '../messages/message-system-shared';
import { MessageHandlerCallbacks } from '../messages/message-handlers';
import { UserPreferencesManager } from '../storage/user-preferences-manager';
import { UserPreferences, UserPreferenceChangeEvent } from '../types/user-preferences-types';
import { RuntimeStateManager } from '../storage/runtime-state-manager';
import { RuntimeState, TranslateActiveState, RuntimeStateChangeEvent } from '../types/runtime-state-types';
import { ControlPanelState, ControlPanelEvent, DEFAULT_CONTROL_PANEL_STATE } from '../types/component-types';

/**
 * 新架构的控制面板类
 * 完全分离UserPreferences和RuntimeState管理
 */
export class ControlPanel {
  private static instance: ControlPanel;
  private messageBus: any;
  private messageHandlers: any;
  private userPreferencesManager: UserPreferencesManager;
  private runtimeStateManager: RuntimeStateManager;
  private state: ControlPanelState;
  
  private constructor() {
    // 🎯 使用共享消息系统实例，避免重复调用和日志
    this.messageBus = SharedMessageSystem.getMessageBus();
    this.messageHandlers = SharedMessageSystem.getMessageHandlers();
    
    if (!this.messageBus || !this.messageHandlers) {
      console.warn('[control-panel] ⚠️ 共享消息系统尚未初始化，控制面板可能无法正常工作');
    }
    this.userPreferencesManager = UserPreferencesManager.getInstance();
    this.runtimeStateManager = RuntimeStateManager.getInstance();
    this.state = { ...DEFAULT_CONTROL_PANEL_STATE };
    console.log('[control-panel] 新架构控制面板已创建');
  }
  
  public static getInstance(): ControlPanel {
    if (!ControlPanel.instance) {
      ControlPanel.instance = new ControlPanel();
    }
    return ControlPanel.instance;
  }
  
  /**
   * 初始化控制面板
   */
  public async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      console.log('[control-panel] 已经初始化，跳过');
      return;
    }
    
    console.log('[control-panel] 开始初始化...');
    
    try {
      // 🔧 修复：不直接初始化存储管理器，而是通过Background Script访问
      // 在Content Script环境中不应该直接调用存储管理器的initialize
      // await this.userPreferencesManager.initialize();
      // await this.runtimeStateManager.initialize();
      
      // 设置事件监听器
      this.setupEventListeners();
      
      // 标记为已初始化
      this.state.isInitialized = true;
      
      console.log('[control-panel] 初始化完成（通过Background Script访问存储）');
      this.emitMessage(ControlPanelEvent.PANEL_INITIALIZED, { timestamp: Date.now() });
      
    } catch (error) {
      console.error('[control-panel] 初始化失败:', error);
      this.state.lastError = `初始化失败: ${error}`;
      throw error;
    }
  }
  
  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 用户偏好变更监听
    this.userPreferencesManager.addChangeListener(
      UserPreferenceChangeEvent.TARGET_LANG_CHANGED,
      (newValue, oldValue) => {
        console.log('[control-panel] 目标语言已变更:', newValue);
      }
    );
    
    this.userPreferencesManager.addChangeListener(
      UserPreferenceChangeEvent.SUBTITLE_MODE_CHANGED,
      (newValue, oldValue) => {
        console.log('[control-panel] 字幕模式已变更:', newValue);
      }
    );
    
    // 运行时状态变更监听
    this.runtimeStateManager.addChangeListener(
      RuntimeStateChangeEvent.TRANSLATE_ACTIVE_CHANGED,
      (newValue, oldValue) => {
        this.handleTranslateActiveChanged(newValue, oldValue);
        console.log('[control-panel] 翻译状态已变更:', newValue);
      }
    );
    
    this.runtimeStateManager.addChangeListener(
      RuntimeStateChangeEvent.SETTING_PANEL_CHANGED,
      (newValue, oldValue) => {
        console.log('[control-panel] 设置面板状态已变更:', newValue);
      }
    );
  }
  
  /**
   * 处理翻译状态变更
   */
  private handleTranslateActiveChanged(newState: TranslateActiveState, oldState: TranslateActiveState): void {
    // 更新面板翻译状态
    if (newState === TranslateActiveState.PENDING) {
      this.state.isTranslating = true;
    } else if (oldState === TranslateActiveState.PENDING) {
      this.state.isTranslating = false;
    }
  }
  
  /**
   * 发出消息
   */
  private emitMessage(messageType: ControlPanelEvent, data: any): void {
    try {
      // ✅ 迁移到MessageBus
      if (this.messageBus) {
        console.log('[control-panel] 发送消息:', { messageType, data });
        this.messageBus.sendMessage({
          type: MessageType.UI_STATE_UPDATE,
          data: { event: messageType, ...data },
          messageId: `cp_msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          timestamp: Date.now(),
          sender: MessageSender.CONTENT_SCRIPT
        });
      } else {
        console.warn('[control-panel] MessageBus未初始化，无法发送消息:', messageType);
      }
    } catch (error) {
      console.error('[control-panel] 发送消息失败:', error, { messageType, data });
    }
  }
  
  // ========================================
  // 公共API - 新架构方法
  // ========================================
  
  /**
   * 获取用户偏好设置
   */
  public async getUserPreferences(): Promise<UserPreferences> {
    // 🔧 修复：通过Background Script获取，而不是直接调用管理器
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'getUserPreferences'
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || '获取用户偏好设置失败'));
        }
      });
    });
  }
  
  /**
   * 获取运行时状态
   */
  public async getRuntimeState(): Promise<RuntimeState> {
    // 🔧 修复：通过Background Script获取，而不是直接调用管理器
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'getRuntimeState'
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || '获取运行时状态失败'));
        }
      });
    });
  }
  
  /**
   * 更新用户偏好设置
   */
  public async updateUserPreferences(updates: Partial<UserPreferences>): Promise<void> {
    // 🔧 修复：通过Background Script更新，而不是直接调用管理器
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'USER_PREFERENCES_UPDATE',
        data: {
          updates: updates
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve();
        } else {
          reject(new Error(response?.error || '更新用户偏好设置失败'));
        }
      });
    });
  }
  
  /**
   * 更新运行时状态
   * 🚀 优化：批量更新状态，减少消息调用次数
   */
  public async updateRuntimeState(updates: Partial<RuntimeState>): Promise<void> {
    // 🚀 优化：如果只有一个字段更新，使用单个消息
    const updateKeys = Object.keys(updates);
    
    if (updateKeys.length === 1) {
      // 单字段更新，使用现有逻辑
      const key = updateKeys[0];
      return new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'setRuntimeState',
          data: {
            stateKey: key,
            value: updates[key as keyof RuntimeState]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || `更新${key}失败`));
          }
        });
      });
    } else if (updateKeys.length > 1) {
      // 🚀 多字段更新：并发处理，但会产生多个消息
      // 未来可以考虑实现批量更新API来进一步优化
      const promises = [];
      
      if (updates.translateActive !== undefined) {
        promises.push(new Promise<void>((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'setRuntimeState',
            data: {
              stateKey: 'translateActive',
              value: updates.translateActive
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.success) {
              resolve();
            } else {
              reject(new Error(response?.error || '更新翻译状态失败'));
            }
          });
        }));
      }
      
      if (updates.settingPanelOpen !== undefined) {
        promises.push(new Promise<void>((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'setRuntimeState',
            data: {
              stateKey: 'settingPanelOpen',
              value: updates.settingPanelOpen
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.success) {
              resolve();
            } else {
              reject(new Error(response?.error || '更新设置面板状态失败'));
            }
          });
        }));
      }
      
      await Promise.all(promises);
    }
  }
  
  /**
   * 切换翻译状态
   */
  public async toggleTranslation(): Promise<TranslateActiveState> {
    // 🔧 修复：通过Background Script操作，而不是直接调用管理器
    const currentState = await this.getCurrentTranslateState();
    const newState = currentState === TranslateActiveState.INACTIVE 
      ? TranslateActiveState.ACTIVE 
      : TranslateActiveState.INACTIVE;
    
    await this.updateRuntimeState({ translateActive: newState });
    return newState;
  }
  
  /**
   * 检查翻译是否激活
   */
  public async isTranslationActive(): Promise<boolean> {
    // 🔧 修复：通过Background Script检查，而不是直接调用管理器
    const state = await this.getCurrentTranslateState();
    return state === TranslateActiveState.ACTIVE || state === TranslateActiveState.PENDING;
  }
  
  /**
   * 获取当前翻译状态
   */
  private async getCurrentTranslateState(): Promise<TranslateActiveState> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'getRuntimeState',
        data: {
          stateKey: 'translateActive'
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || '获取翻译状态失败'));
        }
      });
    });
  }
  
  /**
   * 设置当前视频ID
   */
  public async setCurrentVideo(videoId: string): Promise<void> {
    if (!this.state.isInitialized) {
      console.warn('[control-panel] 控制面板未初始化，自动初始化...');
      await this.initialize();
    }
    
    if (this.state.currentVideoId === videoId) {
      console.log('[control-panel] 视频ID未变化，跳过设置');
      return;
    }
    
    console.log('[control-panel] 设置当前视频ID:', videoId);
    
    // 清空之前的字幕事件
    this.state.currentVideoId = videoId;
    this.state.subtitleEvents = [];
    this.state.lastError = null;
    
    // 发出视频变更消息
    this.emitMessage(ControlPanelEvent.STATE_CHANGED, {
      type: 'videoChanged',
      videoId: videoId,
      timestamp: Date.now()
    });
    
    console.log('[control-panel] 当前视频ID已设置，字幕事件已清空');
  }
  
  /**
   * 获取控制面板状态
   */
  public getState(): ControlPanelState {
    return { ...this.state };
  }
  
  /**
   * 添加监听器 - 占位符方法
   * 🔧 保留接口兼容性，等待后续完全迁移到MessageBus后删除
   */
  public addEventListener(
    messageType: ControlPanelEvent,
    handler: (data: any) => void,
    priority: number = 0
  ): () => void {
    // 🔧 占位符方法 - 不执行任何操作
    console.warn('[control-panel] addEventListener方法已废弃，请使用MessageBus通信');
    
    // 返回空的清理函数
    return () => {
      // 无操作
    };
  }

  // ✅ MessageBus回调处理方法
  private handleTranslationResponse(data: any): void {
    console.log('[control-panel] 收到翻译响应:', data);
    // 控制面板可以根据翻译响应更新状态
  }

  private handleUIStateUpdate(data: any): void {
    console.log('[control-panel] 收到UI状态更新:', data);
    // 处理UI状态更新逻辑
    if (data.translateActive !== undefined) {
      this.state.isTranslating = data.translateActive;
    }
  }

  private handleSubtitleUpdated(data: any): void {
    console.log('[control-panel] 收到字幕更新:', data);
    // 控制面板可以记录字幕事件
    if (data.subtitleText) {
      // ✅ 使用正确的ProcessedSubtitleEvent结构
      this.state.subtitleEvents.push({
        id: data.id || `subtitle-${Date.now()}`,
        start: data.start || 0,
        end: data.end || 0,
        originalText: data.subtitleText,
        translatedText: data.translatedText || null,
        sourceLangCode: data.sourceLangCode || 'unknown',
        targetLangCode: data.targetLangCode || 'zh-CN',
        textHash: data.textHash || `hash-${Date.now()}`
      });
    }
  }

  private handleErrorReport(data: any): void {
    console.log('[control-panel] 收到错误报告:', data);
    console.error('[control-panel] 错误详情:', data.errorMessage || data.error);
    this.state.lastError = data.errorMessage || data.error || '未知错误';
  }
}
