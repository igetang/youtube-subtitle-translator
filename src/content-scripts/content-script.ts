import { UIManager, UIEvent as UIManagerMessageType, ButtonType } from '@shared/components/ui-manager';
import { ControlPanel } from '@shared/components/control-panel';
import { 
  TranslationDispatcher, 
  TranslationContext as DispatcherContext,
  TranslationEvent
} from '@shared/translation/translation-dispatcher';
import { 
  SubtitleMode, 
  TranslationServiceType, 
  TRANSLATION_SERVICE_TEMPLATES, 
  TranslationServiceComplete 
} from '@shared/types/user-preferences-types';
import { SubtitleEvent, ProcessedSubtitleEvent } from '@shared/types/core-types';
import { testStoragePermissions } from '@shared/storage/storage-test';
import { 
  initializeMessageSystem, 
  MessageType, 
  MessageSender 
} from '@shared/messages/messages';
import { SharedMessageSystem } from '@shared/messages';
import { MessageHandlerCallbacks } from '@shared/messages/message-handlers';
import { UIActionEvent } from '@shared/types/message-types';
import { findBestMatchingTrack } from '@shared/types/subtitle-types';
import { TranslateActiveState } from '@shared/types/runtime-state-types';

/**
 * @file content-script.ts
 * @description 内容脚本，负责注入主世界脚本、处理消息和控制翻译流程
 */

// 🎯 立即输出日志确认脚本开始执行
console.log('[content-script] 初始化开始...', { 
  url: window.location.href, 
  readyState: document.readyState 
});

// ✅ MessageBus 变量声明
let messageBus: any = null;
let messageHandlers: any = null;

/**
 * 初始化Content Script的消息系统
 * 使用SharedMessageSystem替换GlobalMessageSystem，避免重复初始化
 */
function initializeContentScriptMessages() {
  const callbacks: MessageHandlerCallbacks = {
    onTranslationResponse: handleTranslationResponse,
    onUIStateUpdate: handleUIStateUpdate, 
    onSubtitleUpdated: handleSubtitleUpdated,
    onErrorReport: handleErrorReport
  };
  
  const { messageBus: mb, messageHandlers: mh } = SharedMessageSystem.initialize(
    MessageSender.CONTENT_SCRIPT, 
    callbacks
  );
  
  messageBus = mb;
  messageHandlers = mh;
}

// ✅ MessageBus回调处理函数实现
function handleTranslationResponse(data: any) {
  console.log('[content-script] <- translation response:', data);
  // 处理翻译响应逻辑
  if (data.translatedText) {
    console.log('[content-script] ✓ 翻译成功:', data.translatedText);
  }
}

function handleUIStateUpdate(data: any) {
  console.log('[content-script] <- UI state update:', data);
  
  // ✅ 迁移原UI_EVENT逻辑
  if (data.type === 'button_click' && data.payload?.buttonType === 'translate') {
    console.log('[content-script] 🎯 处理翻译按钮状态更新');
  }
  
  // ✅ 收到main-world ready消息时，初始化UI相关组件（仅一次）
  if (data.messageType === 'main-world:ready' || data.type === 'MAIN_WORLD_READY') {
    if (!isUIInitialized) {
      console.log('[content-script] 启动UI组件初始化流程');
      initializeUIComponents();
      isUIInitialized = true;
    } else {
      console.log('[content-script] UI已初始化，跳过重复初始化');
    }
  }
  
  // ✅ 迁移翻译开始/停止请求逻辑
  if (data.type === 'translation:start_requested') {
    console.log('[content-script] <- translation start request');
    // 🚀 使用部分状态同步更新翻译状态
    partialStateSync('translate').then(() => {
      handleTranslationStartRequest(data.message || data);
    });
  }
  
  if (data.type === 'translation:stop_requested') {
    console.log('[content-script] <- translation stop request');
    // 🚀 使用部分状态同步更新翻译状态
    partialStateSync('translate').then(() => {
      handleTranslationStopRequest(data.message || data);
    });
  }
}

function handleSubtitleUpdated(data: any) {
  console.log('[content-script] 收到字幕更新:', data);
  // 处理字幕更新逻辑
  if (data.events && Array.isArray(data.events)) {
    displayTranslatedSubtitles(data.events);
  }
}

function handleErrorReport(data: any) {
  console.log('[content-script] 收到错误报告:', data);
  console.error('[content-script] 错误详情:', data.errorMessage || data.error);
}

/**
 * Local storage访问代理类
 * 通过消息与Background Script的LocalStorageService通信
 */
class LocalStorageProxy {
  private static instance: LocalStorageProxy;

  private constructor() {}

  public static getInstance(): LocalStorageProxy {
    if (!LocalStorageProxy.instance) {
      LocalStorageProxy.instance = new LocalStorageProxy();
    }
    return LocalStorageProxy.instance;
  }

  /**
   * 获取翻译配置 (从本地存储)
   * @param videoId 视频ID
   */
  async getTranslationConfigLocalStorage(videoId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'getTranslationConfig',
        data: {
          videoId: videoId
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * 检查翻译本地存储
   * @param videoId 视频ID
   * @param params 翻译参数
   */
  async checkTranslationLocalStorage(videoId: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'checkTranslationCache',
        data: {
          videoId: videoId,
          params: params
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * 保存轨道Memory Cache
   * @param videoId 视频ID
   * @param tracks 轨道数据
   */
  async saveTrackMemoryCache(videoId: string, tracks: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'saveTrackCache',
        data: {
          videoId: videoId,
          tracks: tracks
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * 保存翻译本地存储
   * @param videoId 视频ID
   * @param params 翻译参数
   * @param result 翻译结果
   */
  async saveTranslationLocalStorage(videoId: string, params: any, result: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'saveTranslationResult',
        data: {
          videoId: videoId,
          params: params,
          result: result
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * 获取轨道Memory Cache
   * @param videoId 视频ID
   */
  async getTrackMemoryCache(videoId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'getTrackCache',
        data: {
          videoId: videoId
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * 获取翻译状态
   * 🔄 迁移到RuntimeStateManager：通过background获取翻译状态
   * @returns {Promise<boolean>} 向后兼容的boolean值：true表示翻译激活（ACTIVE或PENDING），false表示翻译关闭（INACTIVE）
   */
  async getTranslateActive(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'getRuntimeState',
        data: { stateKey: 'translateActive' }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[content-script] 获取翻译状态失败:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          // 将TranslateActiveState转换为布尔值：INACTIVE=false, ACTIVE/PENDING=true
          const isActive = response.state !== TranslateActiveState.INACTIVE;
          resolve(isActive);
        } else {
          const errorMessage = `获取翻译状态响应异常: ${response?.error || '未知错误'}`;
          console.error(`[content-script] ${errorMessage}`);
          reject(new Error(errorMessage));
        }
      });
    });
  }

  /**
   * 获取翻译状态（TranslateActiveState枚举）
   * @returns {Promise<TranslateActiveState>} 完整的三态枚举值
   */
  async getTranslateActiveState(): Promise<TranslateActiveState> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'getRuntimeState',
        data: { stateKey: 'translateActive' }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[content-script] 获取翻译状态(枚举)失败:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          // 直接返回TranslateActiveState枚举值
          resolve(response.state);
        } else {
          const errorMessage = `获取翻译状态(枚举)响应异常: ${response?.error || '未知错误'}`;
          console.error(`[content-script] ${errorMessage}`);
          reject(new Error(errorMessage));
        }
      });
    });
  }

  /**
   * 获取翻译设置
   * 🔄 兼容性版本：从UserPreferences和VideoSourceLanguageCache获取
   */
  async getTranslationSettings(): Promise<any> {
    return new Promise(async (resolve) => {
      try {
        // 1. 先尝试从UserPreferences获取用户偏好设置
        const preferences = await chrome.storage.local.get('user_preferences');
        const userPrefs = preferences.user_preferences;
        
        // 2. 获取当前视频ID用于VideoSourceLanguageCache查询
        const videoId = this.getVideoIdFromCurrentPage();
        
        // 3. 尝试从VideoSourceLanguageCache获取源语言
        let sourceLang = 'en'; // 默认值
        if (videoId) {
          try {
            const videoCache = await chrome.storage.local.get('video_source_language_cache');
            const cache = videoCache.video_source_language_cache;
            if (cache && cache.items) {
              const videoItem = cache.items.find((item: any) => item.videoId === videoId);
              if (videoItem) {
                sourceLang = videoItem.sourceLang;
                console.log(`[content-script] 从VideoSourceLanguageCache获取源语言: ${sourceLang}`);
              }
            }
          } catch (error) {
            console.warn('[content-script] 从VideoSourceLanguageCache获取源语言失败:', error);
          }
        }
        
        // 4. 从UserPreferences获取其他设置
        const settings = {
          sourceLang,
          targetLang: userPrefs?.targetLang || 'zh-CN',
          translationApi: userPrefs?.translationService?.type || 'google-free',
          apiKey: userPrefs?.translationService?.apiKey || ''
        };
        
        console.log('[content-script] 获取翻译设置:', settings);
        resolve(settings);
      } catch (error) {
        console.warn('[content-script] 获取翻译设置失败，使用默认值:', error);
        // Fallback: 使用默认设置
        resolve({
          sourceLang: 'en',
          targetLang: 'zh-CN',
          translationApi: 'google-free',
          apiKey: ''
        });
      }
    });
  }
  
  /**
   * 从当前页面获取视频ID
   */
  private getVideoIdFromCurrentPage(): string | null {
    try {
      const url = window.location.href;
      const match = url.match(/[?&]v=([^&]+)/);
      return match ? match[1] : null;
    } catch (error) {
      console.warn('[content-script] 获取视频ID失败:', error);
      return null;
    }
  }
}

// 在文件顶部添加接口声明，扩展Window类型
declare global {
  interface Window {
    __uiManagerObserverSetup?: boolean;
    __uiManagerInjecting?: boolean;
    translatedSubtitles?: any[];
  }
}

console.log('[content-script] >>>>>> 内容脚本已加载 - TS版本 <<<<<<');

// 🔧 添加全局错误捕获
window.addEventListener('error', (event) => {
  console.error('[content-script] 全局错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[content-script] 未处理的Promise拒绝:', event.reason);
});

// 全局变量，跟踪主世界脚本的就绪状态
let mainWorldReady = false;
let messageBusReady = false;

// 全局状态变量
let isUIInitialized = false;

// 注入主世界脚本 - 无重试逻辑，简单可靠
function injectMainWorldScript() {
  try {
    const scriptId = 'yt-translator-main-world-script';
    // 如果脚本已存在，不会重复注入
    if (document.getElementById(scriptId)) {
      console.log('[content-script] 主世界脚本已注入，无需重复操作');
      return;
    }
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('main-world.js');
    
    // 确保插入到<head>
    (document.head || document.documentElement).appendChild(script);
          console.log('[content-script] 已注入主世界脚本:', script.src);
    
    // 监听脚本加载完成事件
    script.onload = () => {
              console.log('[content-script] 主世界脚本加载完成');
    };
    
    // 处理脚本加载失败
    script.onerror = (e) => {
              console.error('[content-script] 主世界脚本加载失败:', e);
    };
  } catch (error) {
    console.error('[content-script] 注入主世界脚本时出错:', error);
  }
}

// 事件处理
// ✅ 已删除handleMainWorldMessage函数 - 避免重复处理
// 所有main-world消息现在统一通过setupMessageHandlers中的window.addEventListener处理

/**
 * 设置消息处理器
 * 监听来自主世界脚本的消息
 */
function setupMessageHandlers() {
  window.addEventListener('message', (event: MessageEvent<any>) => {
    if (event.source !== window || !event.data?.source?.startsWith('main-world')) {
      return;
    }

    const { type, payload, source, messageType, messageData } = event.data;
    
    // 🎯 优化：统一消息接收日志，避免重复
    console.log(`[content-script] 📥 接收 ${source} 消息: ${type}${messageType ? ` (${messageType})` : ''}`, payload);

    if (type === 'MESSAGE_FORWARDED') {
      // 🔧 修复：messageType和messageData在消息根级别，不在payload中
      if (messageType) {
        // ✅ 对于转发消息，使用MessageBus确保架构一致性
        safeSendMessage(MessageType.UI_STATE_UPDATE, { messageType: messageType, messageData: messageData });
      } else {
        console.warn('[content-script] MESSAGE_FORWARDED消息缺少messageType');
      }
    } else {
      // ✅ 统一使用MessageBus处理机制，避免重复调用
      safeSendMessage(MessageType.UI_STATE_UPDATE, { 
        type, 
        payload,
        source,
        messageType,
        messageData
      });
    }
  });

  // 🔧 修复：统一的消息监听器，合并重复的监听器功能
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return true;
    
    // 统一消息类型获取
    const messageType = message.type || message.action;
    console.log(`[content-script] 收到消息: ${messageType}`, message);
    
    // ✅ 迁移到MessageBus - 首先发射消息事件（保持原有逻辑）
    if (messageBus) {
      messageBus.sendMessage({
        type: MessageType.UI_STATE_UPDATE,
        data: { type: messageType, message }
      });
    }
    
    // 然后处理具体的消息类型
    // 处理请求可用字幕轨道
    if (messageType === 'requestAvailableTracks') {
      console.log('[content-script] 收到来自侧边栏的请求字幕轨道信息请求');
      
      // 触发字幕轨道信息请求
      requestCaptionTracks();
      
      // 由于requestCaptionTracks是异步的，我们不能立即返回数据
      // 向侧边栏返回一个空的响应，实际数据将通过后台服务工作器转发
      sendResponse({ 
        status: 'processing', 
        message: '正在请求字幕轨道信息，数据将通过后台服务工作器返回'
      });
      
      return true; // 保持消息通道开放
    }
    
    // 处理来自background的获取可用字幕轨道请求
    if (messageType === 'getAvailableTracks') {
      console.log(`[content-script] 收到来自background的getAvailableTracks请求，videoId: ${message.videoId}`);
      
      // 向主世界脚本请求字幕轨道信息，传递requestId
      window.postMessage({
        source: 'content-script',
        type: 'REQUEST_CAPTION_TRACKS',
        videoId: message.videoId || getVideoId(),
        _requestId: message._requestId  // 🔧 新增：传递requestId
      }, '*');
      
      sendResponse({ status: 'processing' });
      return true;
    }
    
    // 🔧 新增：处理requestCurrentVideoId请求
    if (messageType === 'requestCurrentVideoId') {
      const videoId = getVideoId();
      sendResponse({ 
        videoId: videoId,
        _requestId: message._requestId  // 🔧 新增：携带requestId
      });
      return false;
    }
    
    // 🆕 处理设置更新消息
    if (messageType === 'settingsUpdated') {
      console.log('[content-script] 收到设置更新消息:', message);
      
      (async () => {
        try {
          // 检查翻译开关状态
          const isTranslateActive = await LocalStorageProxy.getInstance().getTranslateActive();
          console.log(`[content-script] 设置更新后检查翻译开关状态: ${isTranslateActive}`);
          
          if (isTranslateActive) {
            console.log('[content-script] 翻译开关已开启，应用新设置并重新开始翻译流程');
            
            // 获取视频ID
            const videoId = message.videoId || getVideoId();
            if (videoId) {
              // 重新开始翻译流程
              await handleTranslationStartRequest({ 
                source: 'settings_update',
                videoId: videoId,
                settings: message.settings
              });
            } else {
              console.warn('[content-script] 无法获取视频ID，跳过翻译流程');
            }
          } else {
            console.log('[content-script] 翻译开关已关闭，清理当前翻译显示');
            
            // 清理翻译显示
            const subtitleOverlay = document.getElementById('yt-translate-subtitle-overlay');
            if (subtitleOverlay) {
              subtitleOverlay.style.visibility = 'hidden';
              
              const container = subtitleOverlay.querySelector('.translated-subtitles-container') as HTMLElement;
              if (container) {
                container.style.visibility = 'hidden';
                const translatedTextEl = container.querySelector('.translated-text') as HTMLElement;
                const originalTextEl = container.querySelector('.original-text') as HTMLElement;
                if (translatedTextEl) translatedTextEl.textContent = '';
                if (originalTextEl) originalTextEl.textContent = '';
              }
            }
            
            // 清理存储的字幕数据
            (window as any).translatedSubtitles = [];
            
            // ✅ 迁移到MessageBus - 发送翻译停止事件
            if (messageBus) {
              messageBus.sendMessage({
                type: MessageType.TRANSLATION_TOGGLE,
                data: {
                  enabled: false,
                  source: 'settings_update',
                  reason: 'translate_inactive',
                  timestamp: Date.now()
                }
              });
            }
          }
          
          sendResponse({ 
            status: 'success', 
            message: '设置更新处理完成',
            translateActive: isTranslateActive
          });
          
        } catch (error) {
          console.error('[content-script] 处理设置更新时出错:', error);
          sendResponse({ 
            status: 'error', 
            message: error instanceof Error ? error.message : '处理设置更新时出现未知错误'
          });
        }
      })();
      
      return true; // 表示我们会异步回复
    }

    // 返回true以支持异步sendResponse（针对其他未处理的消息）
    return true;
  });
}

/**
 * ✅ 混合消息机制：内部回调 + 跨组件MessageBus
 * @param messageType 消息类型
 * @param data 消息数据
 */
function safeSendMessage(messageType: MessageType, data: any): void {
  // 🔄 内部消息：直接回调
  if (isInternalMessage(messageType)) {
    console.log(`[content-script] 🔀 消息分发: ${messageType} → 内部回调`);
    handleInternalMessage(messageType, data);
  } 
  // 📤 跨组件消息：MessageBus
  else {
    if (messageBus) {
      console.log(`[content-script] 🔀 消息分发: ${messageType} → MessageBus`);
      messageBus.sendMessage({
        type: messageType,
        data
      });
    } else {
      console.error('[content-script] ❌ MessageBus未初始化，无法发送跨组件消息:', messageType, data);
    }
  }
}

/**
 * 判断是否为内部消息类型
 * @param messageType 消息类型
 */
function isInternalMessage(messageType: MessageType): boolean {
  return messageType === MessageType.UI_STATE_UPDATE;
}

/**
 * 处理内部消息
 * @param messageType 消息类型
 * @param data 消息数据
 */
function handleInternalMessage(messageType: MessageType, data: any): void {
  switch (messageType) {
    case MessageType.UI_STATE_UPDATE:
      console.log(`[content-script] 🎯 路由到: handleUIStateUpdate`);
      handleUIStateUpdate(data);
      break;
    // 可扩展其他内部消息类型
    default:
      console.warn(`[content-script] ⚠️ 未知的内部消息类型: ${messageType}`);
  }
}

// ✅ 立即初始化消息系统（不依赖DOM或main-world）
initializeContentScriptMessages();

// 🔧 初始化消息处理器
setupMessageHandlers();

// 🔧 注入主世界脚本
injectMainWorldScript();

// 确保在初始内容加载后检查是否需要重试注入UI
document.addEventListener('DOMContentLoaded', () => {
  console.log('[content-script] DOMContentLoaded - 检查UI状态');
  
  // 检查是否已初始化UI组件
  if (isUIInitialized) {
    // 检查是否已经成功注入控件
    const uiManager = UIManager.getInstance();
    
    // 只有当控件尚未注入时才尝试注入
    if (!uiManager.getState().controlsInjected && 
        !document.getElementById('vid-translate-toggle-button') && 
        !document.getElementById('vid-translate-settings-button')) {
      console.log('[content-script] DOMContentLoaded - 控件尚未注入，尝试重新注入');
      uiManager.injectControls().then(success => {
        console.log(`[content-script] DOMContentLoaded后重新注入控件: ${success ? '成功' : '失败'}`);
      });
    } else {
      console.log('[content-script] DOMContentLoaded - 控件已注入，无需操作');
    }
  } else {
    console.log('[content-script] DOMContentLoaded - UI尚未初始化，等待MAIN_WORLD_READY事件');
  }
});

// ==================== 📊 优化的状态同步系统 ====================

/**
 * 场景1: 全状态同步 - 页面导航/刷新/标签切换场景
 * 一次性获取所有状态并同步到UI组件
 */
async function fullStateSync(): Promise<void> {
  console.log('[content-script] 🔄 开始全状态同步...');
  
  try {
    // 🚀 并发获取所有状态数据
    const [runtimeStateResponse, userPrefsResponse] = await Promise.all([
      // 获取运行时状态
      chrome.runtime.sendMessage({ type: 'getRuntimeState' }),
      // 获取用户偏好设置  
      chrome.runtime.sendMessage({ type: 'getUserPreferences' })
    ]);
    
    console.log('[content-script] ✓ 状态获取完成:', {
      runtimeState: runtimeStateResponse,
      userPrefs: userPrefsResponse
    });
    
    // 🚀 并发初始化所有UI组件
    await Promise.all([
      initializeUIManagerOptimized(userPrefsResponse, runtimeStateResponse),
      initializeControlPanelOptimized(runtimeStateResponse)
    ]);
    
    // 🚀 批量发送UI状态更新
    sendBatchUIUpdate({
      type: 'full_sync',
      data: {
        userPrefs: userPrefsResponse,
        runtimeState: runtimeStateResponse,
        events: ['controlPanel.initialized', 'ui.components.ready']
      }
    });
    
    console.log('[content-script] ✓ 全状态同步完成');
    
  } catch (error) {
    console.error('[content-script] ✗ 全状态同步失败:', error);
    // 降级到传统初始化方式
    await fallbackInitialization();
  }
}

/**
 * 场景2: 部分状态同步 - 按钮操作/sidepanel操作场景
 */
async function partialStateSync(stateType: 'translate' | 'settings' | 'ui'): Promise<void> {
  console.log(`[content-script] 🔄 开始部分状态同步: ${stateType}`);
  
  try {
    switch (stateType) {
      case 'translate':
        const runtimeState = await chrome.runtime.sendMessage({ type: 'getRuntimeState' });
        
        // 更新翻译相关组件状态
        const controlPanel = ControlPanel.getInstance();
        // 使用现有方法更新状态
        await controlPanel.updateRuntimeState(runtimeState);
        
        sendUIUpdate({ 
          type: 'translate_state_update', 
          data: { translateActive: runtimeState.translateActive }
        });
        break;
        
      case 'settings':
        const userPrefs = await chrome.runtime.sendMessage({ type: 'getUserPreferences' });
        
        // 重新初始化UI以应用新设置
        const uiManager = UIManager.getInstance();
        await uiManager.injectControls();
        
        sendUIUpdate({ 
          type: 'settings_update', 
          data: userPrefs 
        });
        break;
        
      case 'ui':
        // UI刷新同步
        const uiManager2 = UIManager.getInstance();
        await uiManager2.injectControls();
        
        sendUIUpdate({ 
          type: 'ui_refresh', 
          data: { timestamp: Date.now() }
        });
        break;
    }
    
    console.log(`[content-script] ✓ 部分状态同步完成: ${stateType}`);
    
  } catch (error) {
    console.error(`[content-script] ❌ 部分状态同步失败 (${stateType}):`, error);
  }
}

/**
 * 批量UI状态更新
 */
function sendBatchUIUpdate(updateData: any): void {
  if (messageBus) {
    messageBus.sendMessage({
      type: MessageType.UI_STATE_UPDATE,
      data: updateData,
      messageId: `batch_update_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: Date.now(),
      sender: MessageSender.CONTENT_SCRIPT
    });
  }
}

/**
 * 单一UI状态更新
 */
function sendUIUpdate(updateData: any): void {
  if (messageBus) {
    messageBus.sendMessage({
      type: MessageType.UI_STATE_UPDATE,
      data: updateData,
      messageId: `update_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: Date.now(),
      sender: MessageSender.CONTENT_SCRIPT
    });
  }
}

/**
 * 降级初始化方式（保持向后兼容）
 */
async function fallbackInitialization(): Promise<void> {
  console.log('[content-script] 🔄 使用降级初始化方式...');
  
  initializeUIManager();
  initializeControlPanel();
  
  console.log('[content-script] ✅ 降级初始化完成');
}

/**
 * 初始化UI相关组件 - 优化版本
 * 只在收到MAIN_WORLD_READY消息后调用，且仅调用一次
 */
function initializeUIComponents() {
  console.log('[content-script] 🚀 开始优化的UI组件初始化...');
  
  // 使用全状态同步方式初始化
  fullStateSync().catch(error => {
    console.error('[content-script] 全状态同步失败，使用降级方式:', error);
    fallbackInitialization();
  });
}

/**
 * 优化版UI管理器初始化 - 带状态参数
 */
async function initializeUIManagerOptimized(userPrefs: any, runtimeState: any): Promise<void> {
  console.log('[content-script] 🚀 初始化UI管理器（优化版）');
  
  // 获取UI管理器实例
  const uiManager = UIManager.getInstance();
  
  // 设置DOM观察器，自动注入控件
  uiManager.setupObserver();
  
  // 基于状态信息初始化UI
  if (runtimeState?.translateActive) {
    console.log('[content-script] ✅ 初始化时翻译状态为激活');
  }
  
  console.log('[content-script] ✅ UI管理器初始化完成（优化版）');
}

/**
 * 原始UI管理器初始化 - 兼容性保留
 */
function initializeUIManager() {
  // 获取UI管理器实例
  const uiManager = UIManager.getInstance();
  
  // 设置DOM观察器，自动注入控件
  uiManager.setupObserver();
  
  console.log('[content-script] ✅ UI管理器初始化完成');
}

/**
 * 优化版控制面板初始化 - 带状态参数
 */
async function initializeControlPanelOptimized(runtimeState: any): Promise<void> {
  console.log('[content-script] 🚀 初始化翻译控制面板（优化版）');
  
  try {
    // 获取新架构控制面板实例
    const controlPanel = ControlPanel.getInstance();
    
    // 初始化控制面板
    await controlPanel.initialize();
    
    // 基于运行时状态设置初始值
    if (runtimeState) {
      await controlPanel.updateRuntimeState(runtimeState);
      console.log('[content-script] ✅ 控制面板状态已同步:', runtimeState);
    }
    
    console.log('[content-script] ✅ 翻译控制面板初始化完成（优化版）');
    
  } catch (error) {
    console.error('[content-script] 新架构控制面板初始化失败:', error);
    throw error;
  }
}

/**
 * 原始控制面板初始化 - 兼容性保留
 */
function initializeControlPanel() {
  console.log('[content-script] 初始化翻译控制面板（新架构）');
  
  try {
    // 获取新架构控制面板实例
    const controlPanel = ControlPanel.getInstance();
    
    // 初始化控制面板
    controlPanel.initialize().then(() => {
      console.log('[content-script] 新架构翻译控制面板初始化完成');
    }).catch((error) => {
      console.error('[content-script] 新架构控制面板初始化失败:', error);
    });
    
  } catch (error) {
    console.error('[content-script] 创建新架构翻译控制面板时出错:', error);
  }
}

/**
 * C10-C25: 处理翻译开始请求
 * 按照架构文档的完整流程实现
 */
async function handleTranslationStartRequest(data: any): Promise<void> {
  console.log('[content-script] 处理翻译开始请求，按照架构文档C10-C25流程');
  
  try {
    // 🆕 首先检查翻译开关状态
    const isTranslateActive = await LocalStorageProxy.getInstance().getTranslateActive();
    console.log(`[content-script] 翻译开始前检查翻译开关状态: ${isTranslateActive}`);
    
    if (!isTranslateActive) {
      console.log('[content-script] 翻译开关已关闭，跳过翻译流程');
      return;
    }
    
    // C11: ContentScript: 组装翻译参数请求
    const videoId = getVideoId();
    if (!videoId) {
      console.error('[content-script] 无法获取视频ID，无法开始翻译');
      return;
    }
    
    console.log(`[content-script] C11: 组装翻译参数请求，视频ID: ${videoId}`);
    
    // C12: 发送消息到Background: getTranslationConfig
    console.log('[content-script] C12: 发送getTranslationConfig消息到Background (检查local storage)');
          const localStorageProxy = LocalStorageProxy.getInstance();
      const configResponse = await localStorageProxy.getTranslationConfigLocalStorage(videoId);
    
    if (!configResponse.success) {
      console.error('[content-script] 获取翻译配置失败:', configResponse.error);
      return;
    }
    
    // C22: ContentScript: 接收配置参数
    console.log('[content-script] C22: 接收Background返回的配置参数:', configResponse.config);
    
    // C23: 判断配置来源
    if (configResponse.hasCache && configResponse.config.sourceLang && configResponse.config.targetLang) {
      console.log('[content-script] C23: 有设置local storage，检查翻译结果local storage');
      
      // C24: ContentScript请求: checkTranslationCache
      const cacheCheckResponse = await localStorageProxy.checkTranslationLocalStorage(videoId, {
        sourceLang: configResponse.config.sourceLang,
        targetLang: configResponse.config.targetLang,
        apiType: 'google-free' // TODO: 从配置获取
      });
      
      if (cacheCheckResponse.success && cacheCheckResponse.hasCache) {
        // C29: ContentScript: 直接显示local storage字幕
        console.log('[content-script] C29: 找到翻译local storage，直接显示');
        displayTranslatedSubtitles(cacheCheckResponse.data);
        return;
      } else {
        console.log('[content-script] C27: 翻译结果缓存未完全匹配，检查Memory Cache字幕轨道');
        
        // 🔥 新增：L → M 路径 - 检查Memory Cache字幕轨道
        try {
          const trackCacheResponse = await localStorageProxy.getTrackMemoryCache(videoId);
          
          if (trackCacheResponse.success && trackCacheResponse.data && trackCacheResponse.data.length > 0) {
            console.log('[content-script] M: Memory Cache命中 ⚡，使用内存缓存轨道数据执行翻译');
            // N: 使用内存缓存轨道数据
            await startTranslationProcess(trackCacheResponse.data, videoId);
            return;
          } else {
            console.log('[content-script] M: Memory Cache未命中，调用API获取字幕轨道');
            // O: 调用API获取字幕轨道
          }
        } catch (error) {
          console.error('[content-script] 检查Memory Cache轨道数据失败:', error);
          console.log('[content-script] 降级到API获取字幕轨道');
        }
      }
    } else {
      console.log('[content-script] C23: 使用默认配置，直接执行翻译流程');
    }
    
    // C25-C30: 执行翻译流程（API获取轨道）
    console.log('[content-script] C25: 执行翻译流程 - API获取字幕轨道');
    
    // C30: ContentScript: ControlPanel.setCurrentVideo (新架构)
    const controlPanel = ControlPanel.getInstance();
    await controlPanel.initialize(); // 确保已初始化
    await controlPanel.setCurrentVideo(videoId);
    
    // C31: ContentScript: requestCaptionTracks
    console.log('[content-script] C31: 请求字幕轨道');
    requestCaptionTracks();
    
  } catch (error) {
    console.error('[content-script] 处理翻译开始请求时出错:', error);
  }
}

/**
 * C40-C41: 处理翻译停止请求
 */
function handleTranslationStopRequest(data: any): void {
      console.log('[content-script] C40-C41: 停止翻译并清理显示');
  
  // 清理翻译显示
  const subtitleOverlay = document.getElementById('yt-translate-subtitle-overlay');
  if (subtitleOverlay) {
    subtitleOverlay.innerHTML = '';
    subtitleOverlay.style.display = 'none';
  }
  
  // ✅ 迁移到MessageBus - 停止相关的翻译处理
  if (messageBus) {
    messageBus.sendMessage({
      type: MessageType.TRANSLATION_TOGGLE,
      data: {
        enabled: false,
        source: 'content_script',
        reason: 'user_requested',
        timestamp: Date.now()
      }
    });
  }
}

// 获取当前YouTube视频ID
function getVideoId(): string | null {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  } catch (error) {
    console.error('[content-script] 获取视频ID时出错:', error);
    return null;
  }
}

// 请求字幕轨道信息
function requestCaptionTracks() {
      console.log('[content-script] 请求字幕轨道信息');
  
  // 向主世界脚本发送请求
  window.postMessage({
    source: 'content-script',
    type: 'REQUEST_CAPTION_TRACKS'
  }, '*');
}

/**
 * C35-C39: 处理字幕轨道获取完成后的翻译流程
 * @param captionTracks 原始字幕轨道数据
 * @param videoId 视频ID
 */
async function handleTranslationProcessAfterTracks(captionTracks: any[], videoId: string): Promise<void> {
  console.log('[content-script] C35-C39: 处理轨道获取完成后的翻译流程');
  
  try {
    // 🆕 首先检查翻译开关状态
    const isTranslateActive = await LocalStorageProxy.getInstance().getTranslateActive();
    console.log(`[content-script] 轨道获取完成后检查翻译开关状态: ${isTranslateActive}`);
    
    if (!isTranslateActive) {
      console.log('[content-script] 翻译开关已关闭，跳过翻译流程');
      return;
    }
    
    // C36: ContentScript: 执行翻译
    console.log('[content-script] C36: 开始执行翻译');
    
    // 使用现有的翻译处理函数
    await startTranslationProcess(captionTracks, videoId);
    
    // 翻译完成后的处理在startTranslationProcess内部已经包含了
    // C37: saveTranslationCache - 在startTranslationProcess中处理 (保存到local storage)
    // C38: Background保存翻译结果到持久local storage - 在startTranslationProcess中处理
    // C39: 显示翻译字幕 - 在startTranslationProcess中处理
    
  } catch (error) {
    console.error('[content-script] 轨道获取后翻译流程处理失败:', error);
  }
}

/**
 * 翻译流程处理函数
 * 负责获取字幕数据、翻译处理、显示等完整流程
 * @param captionTracks 字幕轨道数据
 * @param videoId 视频ID
 */
async function startTranslationProcess(captionTracks: any[], videoId: string): Promise<void> {
  console.log('[content-script] C35: 开始翻译处理流程');

  // 从用户设置中获取目标语言等
  const settings = await LocalStorageProxy.getInstance().getTranslationSettings();
  if (!settings) {
    console.error('[content-script] 无法获取翻译设置，终止流程');
    return;
  }
  const { targetLang, sourceLang: preferredSourceLang, translationApi, apiKey } = settings;

  // C36: 寻找最佳匹配的字幕轨道
  console.log(`[content-script] C36: 寻找最佳字幕轨道, 偏好语言=${preferredSourceLang}`);
  const bestTrack = findBestMatchingTrack(captionTracks, preferredSourceLang);

  if (!bestTrack) {
    console.error('[content-script] 没有找到合适的字幕轨道进行翻译');
    // ✅ 迁移到MessageBus
    if (messageBus) {
      messageBus.sendMessage({
        type: MessageType.TRANSLATION_ERROR,
        data: { 
          originalText: '',
          textHash: '',
          sourceLanguage: preferredSourceLang || 'auto',
          targetLanguage: targetLang,
          provider: translationApi,
          errorCode: 'NO_SUITABLE_TRACK',
          errorMessage: '没有找到合适的字幕轨道',
          retryable: false
        }
      });
    }
    return;
  }

  console.log(`[content-script] 选中的最佳字幕轨道:`, bestTrack);
  const sourceLang = bestTrack.languageCode;

  // C37 & C38: 获取原始字幕数据
  console.log('[content-script] C37 & C38: 获取原始字幕数据...');
  const sourceEvents = await fetchSubtitleData(bestTrack.baseUrl);
  if (sourceEvents.length === 0) {
    console.error('[content-script] 获取到的原始字幕数据为空');
    // ✅ 迁移到MessageBus
    if (messageBus) {
      messageBus.sendMessage({
        type: MessageType.TRANSLATION_ERROR,
        data: { 
          originalText: '',
          textHash: '',
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          provider: translationApi,
          errorCode: 'EMPTY_SUBTITLE_DATA',
          errorMessage: '获取到的原始字幕为空',
          retryable: true
        }
      });
    }
    return;
  }

  console.log(`[content-script] 获取到 ${sourceEvents.length} 条原始字幕`);

  // C39 - C45: 使用TranslationDispatcher进行翻译
  const dispatcher = TranslationDispatcher.getInstance();
  
  // 构建完整的 translationService 对象
  const serviceType = translationApi as unknown as TranslationServiceType;
  const translationService: TranslationServiceComplete = {
    ...TRANSLATION_SERVICE_TEMPLATES[serviceType],
    apiKey: apiKey || ''
  };

  const context: DispatcherContext = {
    videoId,
    sourceEvents,
    sourceLang,
    targetLang,
    translationService,
    subtitleMode: SubtitleMode.BILINGUAL
  };

  dispatcher.addEventListener(TranslationEvent.TRANSLATION_COMPLETED, (messageType, data: any) => {
    console.log('[content-script] C45: 收到TRANSLATION_COMPLETE事件');
    displayTranslatedSubtitles(data.processedEvents);
    // ✅ 迁移到MessageBus - 翻译成功
    if (messageBus) {
      messageBus.sendMessage({
        type: MessageType.TRANSLATION_RESPONSE,
        data: {
          originalText: '批量翻译',
          translatedText: '翻译完成',
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          provider: translationApi || 'google-free',
          textHash: 'batch_translation',
          confidence: 1.0,
          fromCache: false
        }
      });
    }
  });

  dispatcher.addEventListener(TranslationEvent.TRANSLATION_ERROR, (messageType, data: any) => {
    console.error('[content-script] 翻译调度器出错:', data.error);
    // ✅ 迁移到MessageBus - 翻译错误
    if (messageBus) {
      messageBus.sendMessage({
        type: MessageType.TRANSLATION_ERROR,
        data: { 
          originalText: '批量翻译',
          textHash: 'batch_translation',
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          provider: translationApi || 'google-free',
          errorCode: 'DISPATCHER_ERROR',
          errorMessage: data.error?.message || '未知翻译错误',
          retryable: true
        }
      });
    }
  });

  console.log('[content-script] C39: 调用翻译调度器 processSubtitles');
  dispatcher.submitTranslationRequest(context);
}

/**
 * 获取字幕数据
 * @param baseUrl 字幕文件的基础URL
 * @returns 返回字幕事件数组
 */
async function fetchSubtitleData(baseUrl: string): Promise<SubtitleEvent[]> {
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const subtitleText = await response.text();
    return parseSubtitleData(subtitleText);
  } catch (error) {
    console.error('[content-script] 获取字幕数据失败:', error);
    return [];
  }
}

/**
 * 解析字幕数据
 * @param subtitleText 字幕原始文本 (XML格式)
 * @returns 返回字幕事件数组
 */
function parseSubtitleData(subtitleText: string): SubtitleEvent[] {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(subtitleText, "text/xml");
    const textNodes = xmlDoc.getElementsByTagName('text');
    
    return Array.from(textNodes).map((node, index) => {
      const start = parseFloat(node.getAttribute('start') || '0');
      const duration = parseFloat(node.getAttribute('dur') || '0');
      const text = node.textContent || '';
      
      // 实体解码
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = text;
      
      return {
        id: `sub_${index}`,
        start,
        duration,
        text: tempDiv.textContent || tempDiv.innerText || ''
      };
    });
  } catch (error) {
    console.error('[content-script] 解析字幕数据失败:', error);
    return [];
  }
}

/**
 * 合并原始字幕和翻译字幕 (此函数在新架构中被 `TranslationDispatcher` 替代，但可作为参考)
 * @param sourceEvents 原始字幕事件
 * @param targetEvents 翻译后的字幕事件
 * @param targetLang 目标语言
 * @returns 返回合并后的字幕事件数组
 */
function mergeSubtitleData(sourceEvents: SubtitleEvent[], targetEvents: ProcessedSubtitleEvent[], targetLang: string): ProcessedSubtitleEvent[] {
  // 注意：此函数逻辑需要与 ProcessedSubtitleEvent 结构对齐
  return sourceEvents.map((sourceEvent, index) => {
    const targetEvent = targetEvents.find(t => t.id === sourceEvent.id);
    return {
      id: sourceEvent.id || `${index}`,
      start: sourceEvent.start,
      end: sourceEvent.start + sourceEvent.duration,
      originalText: sourceEvent.text,
      translatedText: targetEvent ? targetEvent.translatedText : null,
      sourceLangCode: 'unknown', // 需要从上游获取
      targetLangCode: targetLang,
      textHash: '' // 需要计算
    };
  });
}

/**
 * 在页面上显示翻译字幕
 * @param subtitles 处理后的字幕事件数组
 */
function displayTranslatedSubtitles(subtitles: ProcessedSubtitleEvent[]): void {
  // 将翻译结果存储在window对象上，供主世界脚本访问
  // 这是Content Script和Main World之间通信的一种方式
  window.translatedSubtitles = subtitles;
  
  // ✅ 迁移到MessageBus - 向主世界发送事件，通知其更新字幕
  if (messageBus) {
    messageBus.sendMessage({
      type: MessageType.SUBTITLE_UPDATED,
      data: {
        videoId: getVideoId() || 'unknown',
        events: subtitles,
        languageCode: subtitles[0]?.targetLangCode || 'unknown',
        trackId: 'translated'
      }
    });
  }
  
  console.log(`[content-script] 已将 ${subtitles.length} 条翻译字幕发送到主世界`);
}

/**
 * 当视频播放时间更新时，处理字幕的显示逻辑
 * 注意：此函数在主世界(main-world)脚本中运行，这里是作为逻辑参考
 */
function handleSubtitleUpdate(this: HTMLVideoElement): void {
  const currentTime = this.currentTime;
  const subtitles = (window as any).translatedSubtitles;
  
  if (!subtitles || !subtitles.length) return;
  
  // 获取字幕叠加层
  const overlay = document.getElementById('yt-translate-subtitle-overlay');
  if (!overlay) return;
  
  // 确保容器可见性
  const container = overlay.querySelector('.translated-subtitles-container') as HTMLElement;
  if (!container) return;
  
  // 查找翻译文本和原文文本元素
  const translatedTextEl = container.querySelector('.translated-text') as HTMLElement;
  const originalTextEl = container.querySelector('.original-text') as HTMLElement;
  if (!translatedTextEl || !originalTextEl) return;
  
  // 查找当前时间应显示的字幕
  const currentSubtitles = subtitles.filter(
    (sub: any) => currentTime >= sub.start && currentTime <= sub.end
  );
  
  if (currentSubtitles.length > 0) {
    // 更新字幕内容
    const currentSub = currentSubtitles[0]; // 使用第一个匹配的字幕
    
    if (currentSub.targetText) {
      translatedTextEl.textContent = currentSub.targetText;
      originalTextEl.textContent = currentSub.sourceText;
      originalTextEl.style.display = 'block'; // 显示原文
    } else {
      translatedTextEl.textContent = currentSub.sourceText;
      originalTextEl.style.display = 'none'; // 隐藏原文
    }
    
    // 显示字幕容器
    overlay.style.visibility = 'visible';
    container.style.visibility = 'visible';
  } else {
    // 没有当前字幕，隐藏显示
    overlay.style.visibility = 'hidden';
    container.style.visibility = 'hidden';
    
    // 清空内容
    translatedTextEl.textContent = '';
    originalTextEl.textContent = '';
  }
}

// 🔧 修复：已删除重复的消息监听器，功能已合并到setupMessageHandlers中的统一监听器
