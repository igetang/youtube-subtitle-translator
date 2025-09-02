/**
 * @file service-worker.ts
 * @description YouTube字幕翻译助手 - 后台服务工作脚本 (Service Worker)
 * 基于 Manifest V3 规范和 architecture.md 7.1.2 设计
 * @version 5.24.6
 */

// 已移除内存缓存层，直接使用 Local Storage 缓存

// 注释掉启动日志，避免前后确认型冗余
// console.log('[service-worker] Service Worker 已加载');

// === 核心模块导入 ===
import { UserPreferencesManager } from '../shared/storage/user-preferences-manager';
import { RuntimeStateManager } from '../shared/storage/runtime-state-manager';
import { StorageManager } from '../shared/storage/storage-manager';
import { TranslationCacheManager } from '../shared/storage/translation-cache-manager';
import { VideoSourceLanguageCacheManager } from '../shared/storage/video-source-language-cache-manager';
import { 
  TranslateActiveState, 
  RuntimeStateChangeEvent,
  DEFAULT_RUNTIME_STATE 
} from '../shared/types/runtime-state-types';
// SidePanel相关代码已归档至 /docs/archive/deprecated-sidepanel/
// 原文件: sidepanel-controller.ts (已移至归档目录)

// === 全局管理器实例 ===
const userPreferencesManager = UserPreferencesManager.getInstance();
const runtimeStateManager = RuntimeStateManager.getInstance();
const storageManager = StorageManager.getInstance();
const translationCacheManager = TranslationCacheManager.getInstance();
const videoSourceLanguageCacheManager = VideoSourceLanguageCacheManager.getInstance();

// === PENDING 状态超时管理 ===
const PENDING_TIMEOUT = 5000; // 5秒超时
const pendingTimeouts = new Map<string, NodeJS.Timeout>(); // key: tabId_videoId，管理各个标签页的超时定时器

// === 站点特定 SidePanel 功能 ===

/**
 * 判断是否为 YouTube URL
 * @param url - 要检查的 URL
 * @returns 是否为 YouTube 页面
 */
// === 官方标准：站点特定的SidePanel管理 ===
const YOUTUBE_ORIGINS = [
  'https://www.youtube.com',
  'https://youtube.com', 
  'https://m.youtube.com'
];

/**
 * 检查URL是否为YouTube页面 - 基于官方示例的精确匹配
 * @param url 页面URL
 * @returns 是否为YouTube页面
 */
function isYoutubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return YOUTUBE_ORIGINS.includes(urlObj.origin);
  } catch (error) {
    // 静默处理URL解析失败，减少警告日志
    // console.warn(`[service-worker] ⚠️ URL解析失败: ${url}`, error);
    return false;
  }
}

/**
 * 从URL中提取视频ID
 */
function extractVideoIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname === '/watch') {
      return urlObj.searchParams.get('v');
    }
    return null;
  } catch (error) {
    // 静默处理视频ID提取失败
    // console.warn(`[service-worker] ⚠️ 提取视频ID失败: ${url}`, error);
    return null;
  }
}

/**
 * 🎯 Popup状态检测函数
 * 优先使用运行时状态，兼容chrome.runtime.getContexts API
 */
async function getPopupState(): Promise<boolean> {
  try {
    // 优先使用运行时状态管理器（使用已初始化的全局实例）
    const popupOpen = await runtimeStateManager.getPopupState();
    
    // 如果有明确的状态，直接返回
    if (typeof popupOpen === 'boolean') {
      // 注释掉中间层状态检测日志
      // console.log(`[service-worker] 状态检测: popupOpen [${popupOpen}]`);
      return popupOpen;
    }
    
    // 降级到chrome.runtime.getContexts（Chrome 125+）
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.POPUP]
      });
      const isOpen = contexts.length > 0;
      
      // 同步状态到运行时管理器
      await runtimeStateManager.setPopupState(isOpen);
      
      return isOpen;
    }
    
    // 如果都不支持，返回false
    return false;
  } catch (error) {
    console.error(`[service-worker] ✗ 获取Popup状态失败`);
    return false;
  }
}

/**
 * 🎯 标签页图标状态管理
 * Popup Fallback方案：popup在manifest中配置为全局可用，这里只管理图标状态
 */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  // 只在URL改变且页面加载完成时执行，避免重复执行
  if (!info.url || info.status !== 'complete') return;
  if (!tab.url) return;
  
  try {
    const url = new URL(tab.url);
    
    if (YOUTUBE_ORIGINS.includes(url.origin)) {
      // YouTube页面：设置正常图标和popup
      await chrome.action.setIcon({
        tabId,
        path: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png'
        }
      });
      
      // 🔥 关键修复：为YouTube页面设置popup路径
      await chrome.action.setPopup({
        tabId,
        popup: 'src/popup/popup.html'
      });
      
      // 简化为静默执行，减少操作确认日志
      // console.log(`[service-worker] ✓ YouTube页面图标和Popup已设置 (Tab:${tabId}`);
    } else {
      // 其他网站：设置图标但禁用popup
      await chrome.action.setIcon({
        tabId,
        path: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png'
        }
      });
      
      // 🔥 非YouTube页面：禁用popup
      await chrome.action.setPopup({
        tabId,
        popup: ''  // 空字符串表示禁用popup
      });
      
      // 静默处理非YouTube页面
      // console.log(`[service-worker] ✓ 非YouTube页面图标已设置，Popup已禁用 (Tab:${tabId}`);
    }
  } catch (error) {
    // 静默处理图标更新错误
    // console.error(`[service-worker] ✗ 更新图标失败 (Tab:${tabId})`);
  }
});

// === Toast通知和Action点击处理已移除 ===
// 现在使用Popup Fallback方案：所有页面都可以打开popup，popup内部处理页面检测和界面显示

// === 极简Port方案：监听SidePanel生命周期 ===

/**
 * 🎯 Popup生命周期管理 - 替代原有的SidePanel Port监听器
 * Port连接 = Popup真正可用，监听Popup的生命周期事件
 */
function setupPortListener(): void {
  chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name === 'popup-lifecycle') {
      // 注释掉Port连接日志，避免前后确认型冗余
      // console.log('[service-worker] Popup Port连接建立');
      
      // 记录关联的标签页ID
      let associatedTabId: number | undefined;
      
      // 监听来自popup的消息，获取标签页ID
      port.onMessage.addListener((msg) => {
        if (msg.type === 'init' && msg.tabId) {
          associatedTabId = msg.tabId;
          // 注释掉关联日志
          // console.log(`[service-worker] Port关联标签页ID: ${associatedTabId}`);
        }
      });
      
      try {
        // 🔧 统一状态管理：Port连接 = Popup真正打开
        await runtimeStateManager.setPopupState(true);
        // 合并操作链路日志，移除此处的确认日志
        
      } catch (error) {
        console.error(`[service-worker] ✗ Popup状态更新失败`);
      }
      
      port.onDisconnect.addListener(async () => {
        // 注释掉中间层检测日志
        // console.log('[service-worker] popup关闭检测');
        
        try {
          // 🔧 统一状态管理：Port断开 = Popup真正关闭
          await runtimeStateManager.setPopupState(false);
          
          // 🔧 使用记录的标签页ID通知UI更新
          if (associatedTabId) {
            chrome.tabs.sendMessage(associatedTabId, {
              type: 'UPDATE_BUTTON_STATE',
              isOpen: false,
              source: 'popup-closed'
            }).catch(() => {
              // 忽略错误：标签页可能已关闭
              // 静默处理标签页关闭
              // console.log(`[service-worker] 标签页${associatedTabId}可能已关闭`);
            });
            // 注释掉操作确认日志
            // console.log(`[service-worker] 已通知标签页${associatedTabId}更新UI`);
          } else {
            // 静默处理无关联标签页
            // console.warn('[service-worker] 无关联标签页ID，无法通知UI更新');
          }
          // 保留一条简洁的关闭日志
          console.log('[service-worker] ✓ Popup关闭');
          
        } catch (error) {
          console.error(`[service-worker] ✗ popupClosed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
  });
}

// === 初始化Port监听器 ===
setupPortListener();

// === Service Worker 生命周期事件 ===

/**
 * 扩展安装或更新事件
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // 注释掉启动日志
  // console.log(`[service-worker] <- onInstalled (${details.reason})`);
  
  try {
    await initializeManagers();
    
    switch (details.reason) {
      case 'install':
        // 静默处理安装
        // console.log('[service-worker] 扩展首次安装，初始化默认设置');
        await setupDefaultSettings();
        break;
      case 'update':
        // 静默处理更新
        // console.log('[service-worker] 扩展更新，检查数据迁移');
        await handleUpdate(details.previousVersion);
        break;
    }
  } catch (error) {
    console.error(`[service-worker] ✗ onInstalled: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Chrome 浏览器启动事件
 */
chrome.runtime.onStartup.addListener(async () => {
  // 注释掉启动日志
  // console.log('[service-worker] <- onStartup');
  
  try {
    await initializeManagers();
    
    // 🎯 新增：确保启动时默认禁用Popup
    // 防止浏览器启动时popup在非YouTube页面仍然可用
    await chrome.action.setPopup({ popup: '' });
    await chrome.action.setIcon({
      path: {
        16: 'icons/icon16-disabled.png',
        48: 'icons/icon48-disabled.png'
      }
    });
    // 静默处理启动状态
    // console.log('[service-worker] ✓ onStartup: Popup状态已禁用');
  } catch (error) {
    console.error(`[service-worker] ✗ onStartup: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Service Worker 激活事件
 */
self.addEventListener('activate', (event: any) => {
  // 注释掉激活日志
  // console.log('[service-worker] <- activate');
  // 不重复初始化，onInstalled和onStartup已处理
});

// === 消息处理系统 ===

/**
 * 主消息监听器 - 优秀Chrome扩展设计模式
 * 🎯 分层处理原则：
 * 1. 需要用户手势的消息（SidePanel操作）→ 同步直接处理
 * 2. 业务逻辑消息 → 异步路由处理
 * 基于 architecture.md 3.4 按钮交互完整流程设计
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 简化消息日志，只在错误时输出
  // console.log(`[service-worker] 收到消息: ${message.type || message.action}`);
  
  // 🎯 同步处理层：Popup操作处理
  // 替代原有的SidePanel逻辑，改为Popup实现
  if (message.type === 'togglePopup') {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url;
    
    if (!tabId || !tabUrl || !isYoutubeUrl(tabUrl)) {
      sendResponse({
        success: false, 
        error: '只有YouTube页面才能打开翻译设置面板'
      });
      return false;
    }
    
    // 检测当前Popup状态并执行相反操作
    getPopupState().then(isCurrentlyOpen => {
      // 注释掉中间层状态日志
      // console.log(`[service-worker] 状态变更: popupOpen [${isCurrentlyOpen}]`);
      
      if (isCurrentlyOpen) {
        // 当前打开 → 关闭
        // Popup通过程序化关闭
        chrome.runtime.sendMessage({
          type: 'closePopup'
        }).then(() => {
          // 简化成功日志
          // console.log(`[service-worker] ✓ closePopup`);
          sendResponse({ success: true, status: 'closed', newState: false });
        }).catch(error => {
          console.error(`[service-worker] ✗ closePopup: ${error instanceof Error ? error.message : String(error)}`);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      } else {
        // 当前关闭 → 打开
        // 🔥 关键修复：先确保popup路径已设置，再打开
        chrome.action.setPopup({
          tabId: tabId,
          popup: 'src/popup/popup.html'
        }, () => {
          if (chrome.runtime.lastError) {
            console.error(`[service-worker] ✗ setPopup: ${chrome.runtime.lastError?.message}`);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          
          // 路径设置成功后，打开popup
          chrome.action.openPopup().then(() => {
            // 简化成功日志
            // console.log(`[service-worker] ✓ openPopup`);
            sendResponse({ success: true, status: 'opened', newState: true });
          }).catch(error => {
            console.error(`[service-worker] ✗ openPopup: ${error instanceof Error ? error.message : String(error)}`);
            // 如果openPopup失败（可能是Chrome版本问题），尝试备用方案
            const popupUrl = chrome.runtime.getURL('src/popup/popup.html');
            chrome.windows.create({
              url: popupUrl,
              type: 'popup',
              width: 450,
              height: 600
            }, () => {
              if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
              } else {
                // 简化备用方案日志
                // console.log(`[service-worker] ✓ openPopup (备用方案)`);
                sendResponse({ success: true, status: 'opened_window', newState: true });
              }
            });
          });
        });
      }
    }).catch(error => {
      console.error(`[service-worker] ✗ getPopupState: ${error instanceof Error ? error.message : String(error)}`);
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
    });
    
    return true; // 异步响应
  }

  // 🔥 特殊处理：openSidePanel需要保持用户手势上下文，立即执行
  if (message.type === 'openSidePanel') {
    const result = handleOpenSidePanelSync(sender, message.data);
    sendResponse(result);
    return false; // 同步响应，不保持消息通道
  }

  // 🔧 修复：只对未被直接处理的消息进行异步处理
  // 已经被直接处理的消息（togglePopup, openSidePanel）不应该再次进入异步流程
  
  // 🔧 优秀Chrome扩展设计：分层处理模式
  // 需要用户手势上下文的消息必须同步处理
  const SYNC_MESSAGES = ['togglePopup', 'openSidePanel'];
  
  if (SYNC_MESSAGES.includes(message.type)) {
    // 🔥 关键：这些消息已经在上面直接处理了，避免重复执行
    return true;
  }

  // 📦 其他消息使用异步处理（业务逻辑消息）
  // 确保异步消息正确处理
  (async () => {
    try {
      const response = await routeMessage(message, sender);
      // 优化日志输出：对于简单成功响应，只输出状态
      if (response && response.success === true && response.status) {
        // 简化响应日志，只在错误时输出
        // console.log(`[service-worker] ✓ ${message.type}: ${response.status}`);
      } else {
        // console.log(`[service-worker] ✓ ${message.type}:`, response);
      }
      sendResponse(response);
    } catch (error) {
      console.error(`[service-worker] ✗ ${message.type}: ${error instanceof Error ? error.message : String(error)}`);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '消息处理失败'
      });
    }
  })();
  return true; // 异步响应
});

// 🔧 移除重复的tabs.onActivated监听器
// 原因：官方示例只使用tabs.onUpdated，它已经能处理所有情况（包括标签页切换）
// 重复的监听器可能导致状态同步冲突

/**
 * 🔧 监听标签页关闭
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[service-worker] 标签页 ${tabId} 已关闭`);
});




/**
 * 消息路由函数
 * 基于 architecture.md 3.4.5 统一数据管理消息接口
 * 🚀 新架构：统一使用type字段，移除action兼容模式
 */
async function routeMessage(
  message: any, 
  sender: chrome.runtime.MessageSender
): Promise<any> {
  const { type, data } = message;
  
  
  switch (type) {
    // === Popup 相关消息 ===
    // 🎯 状态查询消息处理 - 替代原有的SidePanel逻辑
    case 'getPopupState':
      const isOpen = await getPopupState();
      return { success: true, isOpen };
    
    // 🎯 Popup切换处理 - 替代原有的toggleSidePanel逻辑
    case 'togglePopup':
      return await handleTogglePopup(sender, data);
    
    // 🎯 直接打开Popup - 新增简化逻辑
    case 'openPopup':
      return await handleOpenPopup(sender, data);
    
    // 🎯 Popup初始化数据请求 - 新架构核心消息
    case 'getPopupInitData':
      return await handleGetPopupInitData(message, sender);
    
    // 🎯 Popup生命周期消息
    case 'popupOpened':
      return await handlePopupOpened(sender);
      
    case 'popupClosed':
      return await handlePopupClosed(sender);
    
    case 'popupBlurred':
      return await handlePopupBlurred(sender);
    
    // 🔧 向后兼容：保留getSidePanelState处理器，但改为Popup实现
    case 'getSidePanelState':
      const sidePanelIsOpen = await getPopupState();
      return { success: true, isOpen: sidePanelIsOpen };
    
    // 🔧 向后兼容：保留closeSidePanel处理器
    case 'closeSidePanel':
      console.warn('[service-worker] ⚠️ closeSidePanel 已废弃');
      return await handleCloseSidePanel(sender);
    
    case 'openPopupFallback':
      return await handleOpenPopupFallback(sender);
    
    case 'SIDEPANEL_DATA_REQUEST':
      return await handleSidePanelDataRequest(data);
    
    // === 状态管理消息 ===
    case 'RUNTIME_STATE_GET':
      return await handleRuntimeStateGet(data);
    
    case 'RUNTIME_STATE_SET':
      return await handleRuntimeStateSet(data);
    
    case 'setRuntimeState':
      // 新格式：{ type: 'setRuntimeState', data: { stateKey: 'popupOpen', value: true } }
      // 直接从data中获取参数
      const setStateKey = data?.stateKey;
      const setStateValue = data?.value;
      
      if (!setStateKey) {
        console.error('[service-worker] setRuntimeState: 缺少stateKey或key参数');
        return {
          success: false,
          error: 'Missing stateKey or key parameter'
        };
      }
      
      // 删除这里的日志，runtime-state-manager内部已经有详细的状态变更日志
      return await handleRuntimeStateSet({ stateKey: setStateKey, value: setStateValue });
    
    case 'RUNTIME_STATE_GET_ALL':
      return await handleRuntimeStateGetAll();

    
    case 'getRuntimeState':
      // 🚀 修复：如果没有指定stateKey，返回所有运行时状态
      if (data?.stateKey) {
        // 获取特定状态键
        const stateResult = await handleRuntimeStateGet({ stateKey: data.stateKey });
        return {
          success: stateResult.success,
          state: stateResult.data, // 将data映射为state以满足ui-manager期望
          error: stateResult.error
        };
      } else {
        // 获取所有运行时状态
        const allStateResult = await handleRuntimeStateGetAll();
        return {
          success: allStateResult.success,
          ...allStateResult.data, // 直接展开所有状态数据
          error: allStateResult.error
        };
      }
    
    case 'getAllState':
      // 支持整合后的content-script使用的消息类型
      return await handleGetAllState(data);
    
    // === 用户偏好设置消息 ===
    case 'USER_PREFERENCES_GET':
      return await handleUserPreferencesGet(data);
    
    case 'getUserPreferences':
      // 🚀 新增：支持content-script的用户偏好获取
      return await handleUserPreferencesGet(data);
    
    case 'USER_PREFERENCES_UPDATE':
      return await handleUserPreferencesUpdate(data);
    
    // === 翻译相关消息 ===
    case 'getTranslationConfig':
      return await handleGetTranslationConfig(data);
    
    case 'checkTranslationCache':
      return await handleCheckTranslationCache(data);
    
    case 'translateSubtitles':
      return await handleTranslateSubtitles(data);
    
    case 'saveTranslationResult':
      return await handleSaveTranslationResult(data);
    
    // === 字幕轨道相关消息 ===
    case 'saveTrackCache':
      return await handleSaveTrackCache(data);
    
    case 'getTrackCache':
      return await handleGetTrackCache(data);
    
    // === API 测试消息 ===
    case 'API_CONNECTION_TEST':
      return await handleApiConnectionTest(data);
    
    // === 错误报告消息 ===
    case 'ERROR_REPORT':
      return await handleErrorReport(data);
    
    // === UI状态更新消息 ===
    case 'ui_state_update':
      console.log('[service-worker] <- UI_STATE_UPDATE');
      return {
        success: true,
        message: 'UI state update received'
      };
    
    // === SidePanel生命周期消息 ===
    case 'sidePanelActuallyOpened':
      return await handleSidePanelActuallyOpened(message);
    
    case 'sidePanelActuallyClosed':
      return await handleSidePanelActuallyClosed(message);
    
    // === 新增：处理SidePanel打开通知 ===
    case 'sidePanelOpened':
      // SidePanel通知已打开，我们可以在这里处理相关逻辑
      console.log('[service-worker] <- SIDEPANEL_OPENED');
      return {
        success: true,
        message: 'SidePanel opened notification received'
      };
    
    // === 🎯 页面级状态管理：检查SidePanel状态 ===
    case 'checkSidePanelStatus':
      return await handleCheckSidePanelStatus(sender);
    
    case 'getSidePanelStatus':
      return await handleGetSidePanelStatus(sender);
    
    // === 字幕数据处理 ===
    case 'SUBTITLE_DATA':
      // 清除 PENDING 超时定时器
      const timeoutKey = `${sender.tab?.id}_${data.videoId}`;
      const timeoutId = pendingTimeouts.get(timeoutKey);
      if (timeoutId) {
        clearTimeout(timeoutId);
        pendingTimeouts.delete(timeoutKey);
        console.log('[service-worker] 已清除PENDING超时定时器');
      }
      
      // 处理字幕数据并检查是否需要继续翻译流程
      const subtitleResult = await handleSubtitleData(data);
      
      // 如果当前状态是PENDING，说明正在等待字幕，需要继续翻译流程
      const currentState = await runtimeStateManager.getTranslateState();
      if (currentState === TranslateActiveState.PENDING) {
        console.log('[service-worker] 字幕捕获完成，继续执行翻译');
        // 触发翻译流程
        const translateResult = await continueTranslationWithSubtitles(data);
        return translateResult || subtitleResult;
      }
      
      return subtitleResult;
    
    // === 翻译控制 ===
    case 'TOGGLE_TRANSLATE':
    case 'translation_toggle':  // 支持新的消息类型
      // 合并冗余日志
      console.log('[service-worker] 翻译切换:', { type, data });
      return await handleToggleTranslate(sender, data);
    
    default:
      console.warn(`[service-worker] 未知消息类型: ${type}`);
      return {
        success: false,
        error: `未知消息类型: ${type}`
      };
  }
}

// === 消息处理器实现 ===

/**
 * 🎯 直接打开Popup - 简化逻辑
 * 只负责打开，不处理关闭（让Chrome自动处理）
 */
async function handleOpenPopup(sender: chrome.runtime.MessageSender, data?: any): Promise<any> {
  if (!sender.tab || !sender.tab.id) {
    console.warn('[service-worker] ⚠️ openPopup: 缺少有效的标签页信息');
    return {
      success: false,
      error: 'Invalid sender for opening popup'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  
  // 检查是否为YouTube页面
  if (!tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[service-worker] ⚠️ 非YouTube页面: ${tabUrl}`);
    return {
      success: false,
      error: '只有YouTube页面才能打开翻译设置面板'
    };
  }
  
  try {
    // 设置popup路径
    await chrome.action.setPopup({
      tabId: tabId,
      popup: 'src/popup/popup.html'
    });
    
    // 打开popup
    await chrome.action.openPopup();
    
    // 状态更新将由Port连接处理，这里不需要重复设置
    // await runtimeStateManager.setPopupState(true);
    
    // 日志将由消息路由统一输出，这里不重复
    
    return {
      success: true,
      status: 'opened'
    };
    
  } catch (error) {
    console.error('[service-worker] 打开Popup失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open popup'
    };
  }
}

/**
 * 🎯 处理Popup切换请求 - 替代原有的SidePanel逻辑
 * 基于用户手势上下文执行Popup打开/关闭操作
 */
async function handleTogglePopup(sender: chrome.runtime.MessageSender, data?: any): Promise<any> {
  if (!sender.tab || !sender.tab.id) {
    console.warn('[service-worker] ⚠️ togglePopup: 缺少有效的标签页信息');
    return {
      success: false,
      error: 'Invalid sender for toggling popup'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  const source = data?.source || 'translation-button';
  
  // 检查是否为YouTube页面
  if (!tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[service-worker] ⚠️ 非YouTube页面: ${tabUrl}`);
    return {
      success: false,
      error: '只有YouTube页面才能打开翻译设置面板',
      fallback: 'popup'
    };
  }
  
  try {
    // 🔥 关键修复：检测Popup真实状态
    const isCurrentlyOpen = await getPopupState();
    
    console.log(`[service-worker] 当前Popup状态: ${isCurrentlyOpen ? '已打开' : '已关闭'}`);
    
    if (isCurrentlyOpen) {
      // 当前已打开，无法直接关闭Popup，返回提示
      console.log(`[service-worker] ⚠️ Popup已打开，无法通过API关闭 (标签页: ${tabId})`);
      
      return {
        success: true,
        status: 'already_open',
        isOpen: true,
        message: 'Popup已打开，请手动关闭或直接在Popup中操作'
      };
    } else {
      // 当前未打开，执行打开操作
      
      // 确保popup路径设置正确
      await chrome.action.setPopup({
        tabId,
        popup: 'src/popup/popup.html'
      });
      
      // 🔥 用户手势上下文：直接调用openPopup()
      await chrome.action.openPopup();
      console.log(`[service-worker] ✓ Popup已打开 (Tab:${tabId})`);
      
      return {
        success: true,
        status: 'opened',
        isOpen: true,
        message: 'Popup已打开'
      };
    }
    
  } catch (error) {
    console.error(`[service-worker] 切换 Popup 失败，标签页: ${tabId}:`, error);
    
    // 分析具体错误类型
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    
    // 🔥 用户手势上下文错误处理
    if (errorMessage.includes('user gesture') || errorMessage.includes('user activation')) {
      console.error('[service-worker] ✗ 用户手势上下文不足');
      return {
        success: false,
        error: '需要用户手势上下文才能打开Popup',
        errorType: 'USER_GESTURE_REQUIRED',
        fallback: 'icon_click',
        message: '请点击扩展图标打开设置面板'
      };
    }
    
    return {
      success: false,
      error: `操作失败: ${errorMessage}`,
      fallback: 'popup'
    };
  }
}

/**
 * 🎯 处理Popup初始化数据请求 - 新架构核心功能
 * 返回PopupContext数据结构
 */
async function handleGetPopupInitData(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  const { tabId } = message;
  
  try {
    // 1. 获取标签页信息
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      console.warn(`[service-worker] ⚠️ 无法获取标签页信息: ${tabId}`);
      return {
        type: 'popupInitDataResponse',
        popupContext: null
      };
    }
    
    // 2. 检查是否为YouTube页面
    const isYoutube = isYoutubeUrl(tab.url);
    if (!isYoutube) {
      console.log(`[service-worker] 非YouTube页面: ${tab.url}`);
      return {
        type: 'popupInitDataResponse',
        popupContext: null
      };
    }
    
    // 3. 提取视频ID
    const videoId = extractVideoIdFromUrl(tab.url);
    if (!videoId) {
      console.warn(`[service-worker] ⚠️ 无法提取视频ID: ${tab.url}`);
      return {
        type: 'popupInitDataResponse',
        popupContext: null
      };
    }
    
    // 4. 获取用户偏好设置
    const userPreferencesResult = await handleUserPreferencesGet({});
    const userPreferences = userPreferencesResult.success ? userPreferencesResult.data : {};
    
    // 5. 两层缓存获取字幕轨道数据
    let availableSourceLanguages = [];
    let detectedSourceLang = 'auto';
    let lastSelectedLanguage = null;
    
    // 层级1: Local Storage缓存
    try {
      const localCache = await videoSourceLanguageCacheManager.get(videoId);
      if (localCache && localCache.availableSourceLanguages) {
        availableSourceLanguages = localCache.availableSourceLanguages;
        lastSelectedLanguage = localCache.lastSelectedLanguage || null;
        console.log(`[service-worker] ✓ 缓存命中[Local Storage]: ${availableSourceLanguages.length}个轨道`);
      }
    } catch (error) {
      console.warn(`[service-worker] Local Storage读取失败:`, error);
    }
    
    // 层级2: Content Script API
    if (availableSourceLanguages.length === 0) {
      try {
        console.log(`[service-worker] 缓存未命中，从Content Script获取`);
        const trackResponse = await chrome.tabs.sendMessage(tabId, {
          type: 'getVideoTrackData',
          videoId
        });
        
        if (trackResponse && trackResponse.success && trackResponse.tracks) {
          availableSourceLanguages = trackResponse.tracks;
          console.log(`[service-worker] ✓ 获取成功[Content Script API]: ${availableSourceLanguages.length}个轨道`);
          
          // 保存到Local Storage（注意：这里不设置lastSelectedLanguage，保持为null）
          if (availableSourceLanguages.length > 0) {
            await videoSourceLanguageCacheManager.set({
              videoId,
              availableSourceLanguages,
              lastSelectedLanguage: lastSelectedLanguage
            });
            
            console.log(`[service-worker] ✓ 已保存到缓存[Local Storage]`);
          }
        } else {
          console.warn(`[service-worker] ⚠️ 获取字幕轨道数据失败`, trackResponse);
        }
      } catch (error) {
        console.error(`[service-worker] ✗ 请求字幕轨道数据: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // 6. 智能选择源语言
    // 如果用户有历史选择，使用它；否则智能选择
    if (lastSelectedLanguage) {
      detectedSourceLang = lastSelectedLanguage;
      console.log(`[service-worker] 使用用户历史选择的源语言: ${detectedSourceLang}`);
    } else if (availableSourceLanguages.length > 0) {
      // 没有用户选择，进行智能选择
      const targetLang = userPreferences.targetLang || 'zh-CN';
      detectedSourceLang = selectBestSourceLanguage(
        availableSourceLanguages,
        targetLang,
        null  // 没有历史选择
      );
      console.log(`[service-worker] 智能选择源语言: ${detectedSourceLang} (目标语言: ${targetLang})`);
    } else {
      // 没有可用轨道，保持'auto'
      detectedSourceLang = 'auto';
      console.log(`[service-worker] 无可用轨道，保持自动检测`);
    }
    
    // 7. 构建PopupContext
    const popupContext = {
      videoId,
      tabId,
      userPreferences,
      detectedSourceLang,
      languagePolicy: {
        conflictState: { hasConflict: false },
        languageListState: { isLocked: false }
      },
      availableSourceLanguages
    };
    
    console.log(`[service-worker] PopupContext已构建:`, popupContext);
    
    return {
      type: 'popupInitDataResponse',
      popupContext
    };
    
  } catch (error) {
    console.error(`[service-worker] ✗ getPopupInitData: ${error instanceof Error ? error.message : String(error)}`);
    return {
      type: 'popupInitDataResponse',
      popupContext: null,
      error: error instanceof Error ? error.message : '获取初始化数据失败'
    };
  }
}

/**
 * 🎯 处理Popup打开事件
 * @deprecated 状态管理已由Port连接机制处理，此函数仅保留兼容性
 */
async function handlePopupOpened(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log(`[service-worker] <- popupOpened (已由Port机制处理状态)`);
    
    // 状态更新已在Port连接时处理，避免重复
    // await runtimeStateManager.setPopupState(true);
    // await broadcastSidePanelStateChange(true);
    
    return {
      success: true,
      message: 'Popup已打开'
    };
    
  } catch (error) {
    console.error(`[service-worker] ✗ popupOpened: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理Popup打开事件失败'
    };
  }
}

/**
 * 🎯 处理Popup关闭事件
 * @deprecated 状态管理已由Port断开机制处理，此函数已不再使用
 */
async function handlePopupClosed(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log(`[service-worker] <- popupClosed (已废弃，由Port机制处理)`);
    
    // 状态更新已在Port断开时处理，避免重复
    // await runtimeStateManager.setPopupState(false);
    // await broadcastSidePanelStateChange(false);
    
    return {
      success: true,
      message: 'Popup关闭事件已处理'
    };
    
  } catch (error) {
    console.error(`[service-worker] ✗ popupClosed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理Popup关闭事件失败'
    };
  }
}

/**
 * 🎯 处理Popup失去焦点事件
 * @deprecated 此事件已不再发送，函数保留仅用于兼容性
 */
async function handlePopupBlurred(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log(`[service-worker] <- popupBlurred (已废弃，不再使用)`);
    
    // 对于失去焦点事件，我们只记录日志，不改变状态
    // 因为用户可能只是临时点击了其他地方，popup仍然可能是打开的
    
    return {
      success: true,
      message: 'Popup失去焦点事件已处理'
    };
    
  } catch (error) {
    console.error(`[service-worker] ✗ popupBlurred: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理Popup失去焦点事件失败'
    };
  }
}

/**
 * ⚠️ DEPRECATED: 处理SidePanel切换请求（保留向后兼容）
 * 直接调用Chrome API，避免用户手势丢失问题
 * 基于 sidepanel-开关实现指南.md 的分析
 */
async function handleToggleSidePanel(sender: chrome.runtime.MessageSender, data?: any): Promise<any> {
  if (!sender.tab || !sender.tab.id) {
    console.warn('[service-worker] ⚠️ toggleSidePanel: 缺少有效的标签页信息');
    return {
      success: false,
      error: 'Invalid sender for toggling side panel'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  const source = data?.source || 'translation-button';
  
  // 检查是否为YouTube页面
  if (!tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[service-worker] ⚠️ toggleSidePanel: 非YouTube页面 ${tabUrl}`);
    return {
      success: false,
      error: '只有YouTube页面才能打开翻译设置面板',
      fallback: 'popup'
    };
  }
  
  try {
    // 🔥 关键修复：使用存储读取状态，避免重复API调用
    // 1. 首先从存储获取当前状态
    const isCurrentlyEnabled = await runtimeStateManager.getPopupState();
    
    console.log(`[service-worker] SidePanel状态: enabled=${isCurrentlyEnabled}`);
    
    if (isCurrentlyEnabled) {
      // 当前已启用，执行关闭操作
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      console.log(`[service-worker] ✓ SidePanel已关闭 (Tab:${tabId})`);
      
      // 🔧 移除状态更新：统一由Port断开监听器处理
      // 职责分离：toggleSidePanel只负责Chrome API调用
      
      return {
        success: true,
        status: 'closed',
        isOpen: false,
        message: 'SidePanel已关闭'
      };
    } else {
      // 当前未启用，执行打开操作
      await chrome.sidePanel.setOptions({ 
        tabId, 
        path: 'src/sidepanel/sidepanel.html',
        enabled: true 
      });
      
      // 直接调用open()，保持在用户手势上下文中
      await chrome.sidePanel.open({ tabId });
      console.log(`[service-worker] ✓ SidePanel已打开 (Tab:${tabId})`);
      
      // 🔧 移除状态更新：统一由Port连接监听器处理
      // 职责分离：toggleSidePanel只负责Chrome API调用
      
      return {
        success: true,
        status: 'opened',
        isOpen: true,
        message: 'SidePanel已打开'
      };
    }
    
  } catch (error) {
    console.error(`[service-worker] ✗ toggleSidePanel (Tab:${tabId}): ${error instanceof Error ? error.message : String(error)}`);
    
    // 分析具体错误类型
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.warn(`[service-worker] ⚠️ 错误详情: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage,
      fallback: 'popup',
      message: 'SidePanel切换失败，建议使用popup模式'
    };
  }
}

// 🔧 移除 sidePanelStateCache，统一使用 runtimeStateManager 管理状态

/**
 * 🎯 统一的Popup降级处理函数
 * 直接打开popup，如果失败给出提示
 */
async function fallbackToPopup(reason: string): Promise<void> {
  console.log(`[service-worker] 🔄 降级到Popup，原因: ${reason}`);
  
  try {
    // 设置popup路径并立即打开
    chrome.action.setPopup({ popup: 'src/popup/popup.html' }, async () => {
      if (chrome.runtime.lastError) {
        console.error(`[service-worker] ✗ 设置popup路径: ${chrome.runtime.lastError?.message}`);
        return;
      }
      
      // 立即打开popup
      try {
        await chrome.action.openPopup();
        console.log('[service-worker] ✓ Popup已打开');
      } catch (error) {
        console.error(`[service-worker] ✗ 打开popup: ${error instanceof Error ? error.message : String(error)}`);
        console.log('[service-worker] ⚠️ 请再次点击扩展图标打开设置');
      }
    });
  } catch (error) {
    console.error(`[service-worker] ✗ Popup降级处理: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 🎯 权威状态检测：使用Chrome官方推荐的getContexts方法检测SidePanel状态
 * 基于SAD.md设计 - Layer 2: 状态检测核心层
 */
async function getSidePanelState(): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL]
    });
    return contexts.length > 0;
  } catch (error) {
    console.error('[getSidePanelState] 检测失败:', error);
    return false;
  }
}

/**
 * 🧪 测试函数：使用官方推荐的getContexts方法检测SidePanel状态
 */
async function testSidePanelStateWithGetContexts(tabId: number): Promise<void> {
  try {
    console.log(`[service-worker] 测试getContexts检测 (Tab:${tabId})`);
    
    // 方法1：检测所有SidePanel上下文
    const allSidePanelContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL],
    });
    
    console.log(`[service-worker] SidePanel上下文数量: ${allSidePanelContexts.length}`);
    allSidePanelContexts.forEach((context, index) => {
      console.log(`[service-worker] SidePanel上下文 ${index}:`, {
        contextId: context.contextId,
        contextType: context.contextType,
        tabId: context.tabId,
        windowId: context.windowId,
        incognito: context.incognito
      });
    });
    
    // 方法2：检测特定标签页的SidePanel上下文
    const tabSpecificContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL],
      tabIds: [tabId]
    });
    
    console.log(`[service-worker] 标签页${tabId}SidePanel上下文数量: ${tabSpecificContexts.length}`);
    
    // 方法3：对比getOptions结果
    const options = await chrome.sidePanel.getOptions({ tabId });
    console.log(`[service-worker] getOptions结果:`, {
      enabled: options.enabled,
      path: options.path
    });
    
    // 方法4：对比统一状态管理器
    const managerState = runtimeStateManager.getPopupStateSync();
    console.log(`[service-worker] 状态管理器状态: ${managerState}`);
    
    // 方法5：使用新的权威状态检测
    const authoritative = await getSidePanelState();
    console.log(`[service-worker] 权威状态检测: ${authoritative}`);
    
    // 总结对比
    const isOpenByGetContexts = tabSpecificContexts.length > 0;
    const isEnabledByGetOptions = options.enabled ?? false;
    console.log(`[service-worker] 状态对比总结:`, {
      'getContexts检测结果': isOpenByGetContexts ? '已打开' : '未打开',
      'getOptions检测结果': isEnabledByGetOptions ? '已启用' : '未启用',
      '状态管理器状态': managerState ? '已打开' : '未打开',
      '权威状态检测': authoritative ? '已打开' : '未打开',
      '一致性检查': isOpenByGetContexts === authoritative ? '✅一致' : '❌不一致'
    });
    
  } catch (error) {
    console.error(`[service-worker] ✗ 测试getContexts: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 🚀 步骤2：同步处理翻译按钮切换 SidePanel - 基于 sidepanel-开关实现指南.md
 * 🔥 关键修复：使用官方推荐的getContexts()检测实际状态，在用户手势上下文中同步操作
 * 遵循文档设计原则：原生API优先 + 简单优于复杂
 */
async function handleToggleSidePanelSync(sender: chrome.runtime.MessageSender, data?: any): Promise<any> {
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  const source = data?.source || 'translation-button';
  
  if (!tabId || !tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[service-worker] ⚠️ toggleSidePanelSync: 无效请求 (Tab:${tabId})`);
    return { success: false, fallback: 'popup', error: '只有YouTube页面才能打开翻译设置面板' };
  }

  try {
    // 🎯 使用官方推荐的getContexts()方法检测SidePanel实际状态
    const sidePanelContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL],
      tabIds: [tabId]
    });
    
    const isActuallyOpen = sidePanelContexts.length > 0;
    console.log(`[service-worker] getContexts检测: ${isActuallyOpen ? '已打开' : '未打开'} (上下文: ${sidePanelContexts.length})`);
    
    // 🧪 保留测试函数进行对比
    testSidePanelStateWithGetContexts(tabId);

    if (isActuallyOpen) {
      // 当前打开 → 关闭
      console.log(`[service-worker] 执行关闭操作`);
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      console.log(`[service-worker] ✓ SidePanel已关闭 (Tab:${tabId})`);
      
      // 🔧 移除状态更新：统一由Port断开监听器处理
      // 原有的缓存清理已不需要（SidePanel已废弃）
      // setTimeout(() => {
      //   sidePanelController.clearStateCache(tabId);
      // }, 0);
      
      return { success: true, status: 'closed', message: 'SidePanel已关闭' };
      
    } else {
      // 当前关闭 → 打开
      console.log(`[service-worker] 执行打开操作`);
      
      // 🔥 关键修复：在用户手势上下文中同步执行所有操作
      await chrome.sidePanel.setOptions({ 
        tabId, 
        path: 'src/sidepanel/sidepanel.html',
        enabled: true 
      });
      await chrome.sidePanel.open({ tabId }); // 🔥 必须在用户手势上下文中同步调用
      console.log(`[service-worker] ✓ SidePanel已打开 (Tab:${tabId})`);
      
      // 🔧 移除状态更新：统一由Port连接监听器处理
      // 原有的缓存清理已不需要（SidePanel已废弃）
      // setTimeout(() => {
      //   sidePanelController.clearStateCache(tabId);
      // }, 0);
      
      return { success: true, status: 'opened', message: 'SidePanel已打开' };
    }
    
  } catch (error) {
    console.error(`[service-worker] SidePanel操作失败:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error', 
      status: 'error',
      details: `操作失败: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 同步处理打开 SidePanel 请求 - 保持用户手势上下文
 * 基于站点特定逻辑：只有YouTube页面才能打开sidepanel
 */
function handleOpenSidePanelSync(sender: chrome.runtime.MessageSender, message?: any): any {
  // 🔥 最小化操作 - 避免破坏用户手势上下文
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  
  if (!tabId || !tabUrl) {
    return { success: false, error: 'Invalid sender' };
  }

  if (!isYoutubeUrl(tabUrl)) {
    return { success: false, fallback: 'popup', error: 'Not YouTube' };
  }

  try {
    // 🔥 关键：直接调用，不要任何中间操作
    chrome.sidePanel.setOptions({ tabId, enabled: true });
    chrome.sidePanel.open({ tabId });
    
    // 🔧 优化：移除状态保存，由Port连接处理
    setTimeout(() => {
      // runtimeStateManager.setPopupState(true).catch(console.warn); // ❌ 移除：由Port连接处理
      // 🔧 移除重复广播：此函数是openSidePanel的同步版本，已被handleToggleSidePanelSync替代
      // handleToggleSidePanelSync已在第650行执行广播，避免重复
      // broadcastSidePanelStateChange(true); // ❌ 已移除重复广播
    }, 0);
    
    return { success: true, status: 'success' };
  } catch (error) {
    return { 
      success: false, 
      fallback: 'popup',
      error: error instanceof Error ? error.message : 'Failed to open'
    };
  }
}

/**
 * 处理打开 SidePanel 请求 (异步版本 - 保留用于其他场景)
 * 基于站点特定逻辑：只有YouTube页面才能打开sidepanel
 */
async function handleOpenSidePanel(sender: chrome.runtime.MessageSender, message?: any): Promise<any> {
  if (!sender.tab || !sender.tab.id || !sender.tab.url) {
    console.warn('[service-worker] ⚠️ openSidePanel: 缺少有效的标签页信息');
    return {
      success: false,
      status: 'error',
      error: 'Invalid sender for opening side panel'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  const source = message?.source || 'user-action';
  // 检查是否为YouTube页面
  if (!isYoutubeUrl(tabUrl)) {
    console.warn(`[service-worker] ⚠️ 非YouTube页面: ${tabUrl}`);
    return {
      success: false,
      status: 'error',
      message: '只有YouTube页面才能打开翻译设置面板',
      fallback: 'popup', // 建议降级到popup
      error: 'SidePanel only available on YouTube pages'
    };
  }

  try {
    console.log('[service-worker] 设置sidepanel选项');
    
    // 设置sidepanel选项（同步调用）- 官方推荐模式：只控制enabled状态
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: true
    });
    console.log(`[service-worker] SidePanel已设置为启用 (标签页: ${tabId})`);
    
    // 🔥 关键修复：只在真正的用户操作时才调用sidePanel.open()
    if (source === 'user-action') {
      // 添加短暂延迟确保setOptions生效，然后打开sidepanel
      try {
        await chrome.sidePanel.open({ tabId });
        console.log(`[service-worker] ✓ SidePanel打开成功 (Tab:${tabId})`);
      } catch (openError) {
        console.error(`[service-worker] ✗ SidePanel打开: ${openError instanceof Error ? openError.message : String(openError)}`);
        // 返回降级信息
        return {
          success: false,
          status: 'error',
          message: `SidePanel打开失败: ${openError instanceof Error ? openError.message : 'Unknown error'}`,
          fallback: 'popup'
        };
      }
    } else {
      console.log(`[service-worker] 跨标签页同步操作 (${source})`);
    }
    
    // 🔧 关键修复：只有非跨标签页同步时才更新全局状态，避免无限循环
    if (source !== 'cross-tab-sync') {
      // 🔧 优化：移除状态保存，由Port连接处理
      console.log(`[service-worker] 状态保存由Port连接处理`);
      // runtimeStateManager.setPopupState(true).then(() => {
      //   console.log(`[service-worker] ✅ session storage更新成功: popupOpen=true`);
      // }).catch(error => {
      //   console.warn('[service-worker] ❌ 更新运行时状态失败:', error);
      // });
      
      // 🔧 移除重复广播：此函数已被handleToggleSidePanelSync替代
      // handleToggleSidePanelSync已在第650行执行广播，避免重复
      // broadcastSidePanelStateChange(true); // ❌ 已移除重复广播
    } else {
      console.log('[service-worker] 跨标签页同步操作');
    }
    
    return {
      success: true,
      status: 'success',
      message: 'SidePanel request processed successfully',
      opened: source === 'user-action' ? 'side_panel' : 'enabled_only'
    };
  } catch (error) {
    console.error(`[service-worker] ✗ openSidePanel: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to process side panel request',
      fallback: 'popup' // 建议降级到popup
    };
  }
}

/**
 * 处理关闭 SidePanel 请求
 */
async function handleCloseSidePanel(sender: chrome.runtime.MessageSender): Promise<any> {
  if (!sender.tab || !sender.tab.id) {
    console.warn('[service-worker] ⚠️ closeSidePanel: 缺少有效的标签页ID');
    return {
      success: false,
      error: 'Invalid sender for closing side panel'
    };
  }

  const tabId = sender.tab.id;
  console.log(`[service-worker] 为标签页 ${tabId} 关闭 SidePanel`);

  try {
    // 方法1：设置为禁用状态
    await chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: false
    });
    console.log(`[service-worker] SidePanel 成功关闭 (标签页: ${tabId})`);
    
    // 🔧 移除状态更新：统一由Port断开监听器处理
    // 职责分离：废弃处理器也不再负责状态管理
    
    return {
      success: true,
      status: 'success',
      message: 'SidePanel closed successfully'
    };
  } catch (error) {
    console.error(`[service-worker] 关闭 SidePanel 失败:`, error);
    return {
      success: false,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to close side panel'
    };
  }
}

/**
 * 处理popup降级请求
 * 当sidepanel无法使用时的降级机制
 */
async function handleOpenPopupFallback(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log('[service-worker] popup降级策略');
    
    // 使用统一的降级函数
    await fallbackToPopup('消息请求降级');
    
    // 更新运行时状态
    await runtimeStateManager.setPopupState(true);
    
    return {
      success: true,
      status: 'success',
      message: 'Popup fallback executed'
    };
    
  } catch (error) {
    console.error(`[service-worker] ✗ Popup降级处理: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      status: 'error',
      message: error instanceof Error ? error.message : 'Popup fallback failed',
      error: 'Popup fallback exception'
    };
  }
}

/**
 * 处理 SidePanel 数据请求
 */
async function handleSidePanelDataRequest(data: any): Promise<any> {
  try {
    const { videoId } = data || {};
    
    // 获取用户偏好设置
    const userPreferences = await userPreferencesManager.getUserPreferences();
    
    // 获取运行时状态
    const runtimeState = await runtimeStateManager.getAllState();
    
    // 获取视频特定数据
    let videoData = null;
    if (videoId) {
      videoData = await getVideoSpecificData(videoId);
    }
    
    return {
      success: true,
      data: {
        userPreferences,
        runtimeState,
        videoData
      }
    };
  } catch (error) {
    console.error('[service-worker] SidePanel 数据请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get SidePanel data'
    };
  }
}

/**
 * 处理运行时状态获取
 */
async function handleRuntimeStateGet(data: any): Promise<any> {
  try {
    const { stateKey } = data;
    let result;
    
    switch (stateKey) {
      case 'translateActive':
        result = await runtimeStateManager.getTranslateState();
        break;
      case 'popupOpen':
        result = await runtimeStateManager.getPopupState();
        break;
      default:
        throw new Error(`未知状态键: ${stateKey}`);
    }
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('[service-worker] 获取运行时状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get runtime state'
    };
  }
}

/**
 * 处理运行时状态设置
 */
async function handleRuntimeStateSet(data: any): Promise<any> {
  try {
    const { stateKey, value } = data;
    
    switch (stateKey) {
      case 'translateActive':
        await runtimeStateManager.setTranslateState(value);
        break;
      case 'popupOpen':
        await runtimeStateManager.setPopupState(value);
        break;
      default:
        throw new Error(`未知状态键: ${stateKey}`);
    }
    
    return {
      success: true,
      message: `状态 ${stateKey} 已更新`
    };
  } catch (error) {
    console.error('[service-worker] 设置运行时状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set runtime state'
    };
  }
}

/**
 * 处理获取所有运行时状态
 */
async function handleRuntimeStateGetAll(): Promise<any> {
  try {
    const allState = await runtimeStateManager.getAllState();
    return {
      success: true,
      data: allState
    };
    } catch (error) {
    console.error('[service-worker] 获取所有运行时状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get all runtime state'
    };
  }
}

/**
 * 处理getAllState请求（整合后的content-script使用）
 */
async function handleGetAllState(data: any): Promise<any> {
  try {
    console.log('[service-worker] <- getAllState');
    
    // 获取运行时状态
    const runtimeState = await runtimeStateManager.getAllState();
    
    // 如果请求包含用户偏好
    let userPreferences = null;
    if (data?.includeUserPreferences) {
      userPreferences = await userPreferencesManager.getUserPreferences();
    }
    
    return {
      success: true,
      data: {
        ...runtimeState,
        ...(userPreferences && { userPreferences })
      }
    };
  } catch (error) {
    console.error(`[service-worker] ✗ getAllState: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取状态失败'
    };
  }
}

/**
 * 处理用户偏好设置获取
 */
async function handleUserPreferencesGet(data: any): Promise<any> {
  try {
    const { preferenceKey } = data || {}; // 🚀 修复：防止data为undefined
    
    if (preferenceKey) {
      // 获取单个偏好设置需要先获取所有设置然后提取
      const allPreferences = await userPreferencesManager.getUserPreferences();
      const value = (allPreferences as any)[preferenceKey];
      return {
        success: true,
        data: value
      };
    } else {
      // 🚀 修复：没有preferenceKey时返回所有用户偏好
      const allPreferences = await userPreferencesManager.getUserPreferences();
      return {
        success: true,
        data: allPreferences
      };
    }
  } catch (error) {
    console.error('[service-worker] 获取用户偏好设置失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user preferences'
    };
  }
}

/**
 * 处理用户偏好设置更新
 */
async function handleUserPreferencesUpdate(data: any): Promise<any> {
  try {
    const { updates } = data;
    
    // 使用updateUserPreferences方法来更新偏好设置
    await userPreferencesManager.updateUserPreferences(updates);
    
    return {
      success: true,
      message: '用户偏好设置已更新'
    };
  } catch (error) {
    console.error('[service-worker] 更新用户偏好设置失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user preferences'
    };
  }
}

// === 辅助函数 ===

// 🔒 初始化去重标志
let isInitialized = false;

/**
 * 初始化管理器
 * 🔧 添加去重机制，避免重复初始化
 */
async function initializeManagers(): Promise<void> {
  if (isInitialized) {
    console.log('[service-worker] ⚠️ 管理器已初始化');
    return;
  }

  try {
    console.log('[service-worker] 初始化管理器');
    
    // 按顺序初始化
    // StorageManager 不需要初始化，它在构造时自动设置
    await userPreferencesManager.initialize();
    await runtimeStateManager.initialize();
    
    // 设置状态变更监听器
    setupStateChangeListeners();
    
    // 标记为已初始化
    isInitialized = true;
    
    console.log('[service-worker] ✓ 所有管理器初始化完成');
  } catch (error) {
    console.error(`[service-worker] ✗ 管理器初始化: ${error instanceof Error ? error.message : String(error)}`);
    // 初始化失败时重置标志，允许重试
    isInitialized = false;
    throw error;
  }
}

/**
 * 设置默认设置
 */
async function setupDefaultSettings(): Promise<void> {
  try {
    // 设置默认用户偏好 - 使用 ensureDefaultPreferences 内部方法
    // UserPreferencesManager 会自动检查并设置默认偏好，无需手动设置
    console.log('[service-worker] 默认用户偏好由UserPreferencesManager处理');
    
    // 🔧 修复：不要重复设置默认运行时状态
    // RuntimeStateManager 在初始化时已经处理了默认状态设置
    // 避免重复调用导致的状态转换冲突
    console.log('[service-worker] 默认运行时状态由RuntimeStateManager处理');
    
    // 🎯 新增：设置默认Popup禁用状态
    // 确保扩展安装时所有页面的popup都是禁用的，只有YouTube页面才会启用
    await chrome.action.setPopup({ popup: '' });
    await chrome.action.setIcon({
      path: {
        16: 'icons/icon16-disabled.png',
        48: 'icons/icon48-disabled.png'
      }
    });
    console.log('[service-worker] ✓ 默认Popup状态已禁用');
    
    console.log('[service-worker] ✓ 默认设置已初始化');
  } catch (error) {
    console.error(`[service-worker] ✗ 设置默认设置: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 处理扩展更新
 */
async function handleUpdate(previousVersion?: string): Promise<void> {
  try {
    // 合并为一条日志，因为目前没有实际的迁移逻辑
    console.log(`[service-worker] 版本更新: ${previousVersion || '未知'} → 当前版本`);
    
    // 这里可以添加数据迁移逻辑
    // 例如：旧版本设置格式转换、清理过期缓存等
    
  } catch (error) {
    console.error(`[service-worker] ✗ 更新处理: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 设置状态变更监听器
 */
function setupStateChangeListeners(): void {
  // 监听翻译状态变更
  runtimeStateManager.addChangeListener(
    RuntimeStateChangeEvent.TRANSLATE_ACTIVE_CHANGED,
    (newValue, oldValue) => {
      console.log(`[service-worker] 状态变更: translateState [${oldValue} → ${newValue}]`);
      // 可以在这里添加状态变更后的处理逻辑
    }
  );
  
  // 监听设置面板状态变更
  runtimeStateManager.addChangeListener(
    RuntimeStateChangeEvent.POPUP_STATE_CHANGED,
    (newValue, oldValue) => {
      console.log(`[service-worker] 状态变更: popupOpen [${oldValue} → ${newValue}]`);
    }
  );
}

/**
 * 获取视频特定数据
 */
async function getVideoSpecificData(videoId: string): Promise<any> {
  try {
    // 这里可以实现获取视频特定数据的逻辑
    // 例如：字幕轨道信息、翻译缓存等
    return {
      videoId,
      tracks: [], // 从缓存获取
      translations: {} // 从缓存获取
    };
  } catch (error) {
    console.error(`[service-worker] ✗ 获取视频数据 (${videoId}): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// === 翻译相关处理器存根 ===
// 这些将在后续版本中实现

async function handleGetTranslationConfig(data: any): Promise<any> {
  console.warn('[service-worker] ⚠️ handleGetTranslationConfig 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleCheckTranslationCache(data: any): Promise<any> {
  console.warn('[service-worker] ⚠️ handleCheckTranslationCache 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleTranslateSubtitles(data: any): Promise<any> {
  console.warn('[service-worker] ⚠️ handleTranslateSubtitles 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleSaveTranslationResult(data: any): Promise<any> {
  console.warn('[service-worker] ⚠️ handleSaveTranslationResult 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleSaveTrackCache(data: any): Promise<any> {
  console.warn('[service-worker] ⚠️ handleSaveTrackCache 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleGetTrackCache(data: any): Promise<any> {
  console.warn('[service-worker] ⚠️ handleGetTrackCache 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

/**
 * 处理从 ContentScript 发送的字幕数据
 */
async function handleSubtitleData(data: any): Promise<any> {
  try {
    console.log('[service-worker] <- saveSubtitlesData:', {
      videoId: data.videoId,
      count: data.count,
      url: data.url
    });
    
    // 验证数据
    if (!data.videoId || !data.subtitles || !Array.isArray(data.subtitles)) {
      console.error('[service-worker] ✗ 字幕数据格式无效');
      return { success: false, error: '字幕数据格式无效' };
    }
    
    // 注意：已移除内存缓存，直接使用Local Storage
    
    console.log(`[service-worker] ✓ 字幕数据已缓存: ${data.videoId}`);
    
    // TODO: 根据当前翻译设置，触发翻译流程
    // 这里可以调用 handleTranslateSubtitles 或其他翻译相关函数
    
    return {
      success: true,
      message: '字幕数据已接收并缓存',
      videoId: data.videoId,
      count: data.count
    };
    
  } catch (error) {
    console.error(`[service-worker] ✗ saveSubtitlesData: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理字幕数据失败'
    };
  }
}

// === 类型定义 ===

/**
 * 翻译开关请求数据
 */
interface ToggleTranslateRequest {
  videoId: string;
  newState: boolean;
}

/**
 * 翻译开关响应数据
 */
interface ToggleTranslateResponse {
  success: boolean;
  action: 'cached' | 'translated' | 'needFetch' | 'stopped';
  data?: any;
  message?: string;
  error?: string;
  config?: UserPreferences;
}

/**
 * 字幕数据结构
 */
interface SubtitleData {
  subtitles: any[];
  videoId: string;
  url: string;
}

/**
 * 统一的源语言选择规则系统
 * 
 * 规则优先级：
 * 1. 用户历史选择（如果存在于当前轨道中）
 * 2. 英语优先（当目标语言非英语时）
 * 3. 手动字幕优于ASR
 * 4. 降级到第一个可用轨道
 */
function selectBestSourceLanguage(
  tracks: Array<{ languageCode: string; name: string; kind?: string }>,
  targetLang: string,
  lastSelectedLanguage?: string
): string {
  if (!tracks || tracks.length === 0) {
    return 'en'; // 默认返回英语
  }

  // 规则1: 用户历史选择优先
  if (lastSelectedLanguage) {
    const userTrack = tracks.find(t => t.languageCode === lastSelectedLanguage);
    if (userTrack) {
      console.log(`[service-worker] 使用用户历史选择: ${lastSelectedLanguage}`);
      return lastSelectedLanguage;
    }
  }

  // 准备数据：区分手动字幕和ASR
  const manualTracks = tracks.filter(t => !t.kind || t.kind !== 'asr');
  const asrTracks = tracks.filter(t => t.kind === 'asr');
  const targetIsEnglish = targetLang.startsWith('en');

  // 规则2+3: 英语优先（非英语目标时）+ 手动字幕优先
  if (!targetIsEnglish) {
    // 优先级：英语手动 > 英语ASR
    const englishManual = manualTracks.find(t => t.languageCode.startsWith('en'));
    if (englishManual) {
      console.log(`[service-worker] 选择英语手动字幕: ${englishManual.languageCode}`);
      return englishManual.languageCode;
    }

    const englishAsr = asrTracks.find(t => t.languageCode.startsWith('en'));
    if (englishAsr) {
      console.log(`[service-worker] 选择英语ASR字幕: ${englishAsr.languageCode}`);
      return englishAsr.languageCode;
    }
  }

  // 规则3: 手动字幕优先（非英语或目标为英语时）
  if (manualTracks.length > 0) {
    console.log(`[service-worker] 选择手动字幕: ${manualTracks[0].languageCode}`);
    return manualTracks[0].languageCode;
  }

  // 规则4: 降级策略 - 使用第一个可用轨道
  const selected = tracks[0];
  console.log(`[service-worker] 使用默认轨道: ${selected.languageCode} (${selected.kind === 'asr' ? 'ASR' : '手动'})`);
  return selected.languageCode;
}

/**
 * 生成翻译缓存键
 * 根据影响翻译结果的所有参数生成唯一键
 */
function generateTranslationCacheKey(
  videoId: string,
  sourceLang: string,
  targetLang: string,
  service: TranslationServiceConfig
): string {
  // 基础部分
  let key = `translation_${videoId}_${sourceLang}_${targetLang}_${service.type}`;
  
  // 根据服务类型添加特定参数
  switch (service.type) {
    case 'openai':
    case 'openai-free':
      // OpenAI需要模型和temperature
      if (service.model) {
        key += `_${service.model}`;
      }
      if (service.temperature !== undefined && service.temperature !== null) {
        key += `_${service.temperature}`;
      }
      break;
    case 'google':
    case 'google-free':
      // Google翻译无额外参数
      break;
    case 'deepl':
      // DeepL可能有formality参数
      if ((service as any).formality) {
        key += `_${(service as any).formality}`;
      }
      break;
  }
  
  return key;
}

/**
 * 处理翻译开关切换 - 实现缓存优先策略
 */
async function handleToggleTranslate(sender: chrome.runtime.MessageSender, data: ToggleTranslateRequest): Promise<ToggleTranslateResponse> {
  try {
    console.log('[service-worker] <- handleToggleTranslate');
    const { videoId, newState } = data;
    console.log('[service-worker] 处理翻译切换参数:', { videoId, newState });
    
    // 更新运行时状态
    if (!newState) {
      // 清除可能存在的超时定时器
      const timeoutKey = `${sender.tab?.id}_${videoId}`;
      const timeoutId = pendingTimeouts.get(timeoutKey);
      if (timeoutId) {
        clearTimeout(timeoutId);
        pendingTimeouts.delete(timeoutKey);
        console.log('[service-worker] 关闭翻译时清除了PENDING超时定时器');
      }
      
      // 关闭翻译 - 直接设置为INACTIVE（不经过PENDING）
      await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
      return { 
        success: true, 
        action: 'stopped',
        message: '翻译已关闭'
      };
    }
    
    // 开启翻译 - 设置为PENDING状态
    await runtimeStateManager.setTranslateState(TranslateActiveState.PENDING);
    
    // Step 1: 获取用户偏好配置
    console.log('[service-worker] Step 1: 获取用户偏好配置');
    let preferences;
    try {
      preferences = await userPreferencesManager.getUserPreferences();
      console.log('[service-worker] getUserPreferences 返回的数据:', {
        hasPreferences: !!preferences,
        preferencesType: typeof preferences,
        hasTranslationService: preferences ? !!preferences.translationService : false,
        translationServiceType: preferences?.translationService ? typeof preferences.translationService : 'N/A',
        translationServiceValue: preferences?.translationService,
        fullPreferences: preferences
      });
    } catch (error) {
      console.error(`[service-worker] ✗ getUserPreferences: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    
    // 添加防御性检查
    if (!preferences || !preferences.translationService) {
      console.error('[service-worker] ✗ preferences或translationService为空:', {
        preferences,
        translationService: preferences?.translationService
      });
      throw new Error('用户偏好配置不完整：缺少 translationService');
    }
    
    console.log('[service-worker] 用户偏好配置获取完成:', {
      targetLang: preferences.targetLang,
      translationService: preferences.translationService,
      translationServiceType: preferences.translationService?.type
    });
    
    // Step 2: 获取视频源语言数据
    console.log('[service-worker] Step 2: 获取视频源语言数据');
    const videoSourceManager = VideoSourceLanguageCacheManager.getInstance();
    const sourceData = await videoSourceManager.get(videoId);
    
    let sourceLang: string = 'auto'; // 默认值
    
    if (sourceData && sourceData.availableSourceLanguages && sourceData.availableSourceLanguages.length > 0) {
      // 使用智能选择函数
      sourceLang = selectBestSourceLanguage(
        sourceData.availableSourceLanguages,
        preferences.targetLang,
        sourceData.lastSelectedLanguage
      );
      console.log('[service-worker] 智能选择源语言:', sourceLang, {
        targetLang: preferences.targetLang,
        lastSelected: sourceData.lastSelectedLanguage,
        availableCount: sourceData.availableSourceLanguages.length
      });
    } else {
      // 没有缓存数据，需要从Content Script获取
      console.log('[service-worker] ⚠️ 没有源语言缓存，需要获取字幕轨道信息');
      // 这里暂时使用auto，后续在获取字幕时会更新
      sourceLang = 'auto';
    }
    
    // Step 3: 构建缓存键并检查翻译结果缓存
    console.log('[service-worker] Step 3: 检查翻译结果缓存');
    const cacheManager = TranslationCacheManager.getInstance();
    
    // 使用新的缓存键生成函数
    const cacheKey = generateTranslationCacheKey(
      videoId,
      sourceLang,
      preferences.targetLang,
      preferences.translationService
    );
    
    console.log('[service-worker] 生成的缓存键:', cacheKey);
    
    // 检查是否有缓存的翻译结果
    const cachedResult = await cacheManager.get(
      videoId,
      sourceLang,
      preferences.targetLang,
      preferences.translationService
    );
    if (cachedResult) {
      console.log('[service-worker] ✓ 找到缓存的翻译结果（P0级完全命中）');
      await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
      return {
        success: true,
        action: 'cached',
        data: cachedResult
      };
    }
    
    // Step 4: 查找相同源语言的原始字幕（P1级部分命中）
    console.log('[service-worker] Step 4: 查找可复用的原始字幕');
    const partialCaches = await cacheManager.findByVideoAndSourceLang(videoId, sourceLang);
    
    if (partialCaches.length > 0) {
      console.log(`[service-worker] ✓ 找到${partialCaches.length}个相同源语言的缓存，复用原始字幕`);
      const originalSubtitles = partialCaches[0].originalSubtitles;
      
      // 执行翻译
      console.log('[service-worker] 执行翻译（使用复用的原始字幕）');
      const translatedResult = await executeTranslation(
        {
          subtitles: originalSubtitles,
          videoId: videoId,
          url: window.location?.href || ''
        },
        preferences
      );
      
      // 先设置状态并返回结果给用户（优先响应）
      await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
      
      // 异步保存到缓存（不阻塞用户）
      Promise.resolve().then(async () => {
        try {
          await cacheManager.set({
            videoId,
            sourceLang,
            targetLang: preferences.targetLang,
            translationService: preferences.translationService,
            originalSubtitles,
            translatedSubtitles: translatedResult.translatedSubtitles,
            lastUsed: Date.now(),
            dataHash: ''
          });
          console.log('[service-worker] ✓ 翻译结果已异步缓存');
        } catch (err) {
          console.error('[service-worker] 异步缓存保存失败:', err);
        }
      });
      
      return {
        success: true,
        action: 'translated',
        data: translatedResult
      };
    }
    
    // Step 5: 需要获取字幕（P2/P3级）
    console.log('[service-worker] Step 5: 需要获取字幕数据');
    
    // 检查是否有tabId
    if (!sender.tab?.id) {
      console.error('[service-worker] 无法获取tabId');
      await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
      return {
        success: false,
        action: 'error',
        error: '无法获取标签页信息'
      };
    }
    
    const tabId = sender.tab.id;
    const timeoutKey = `${tabId}_${videoId}`;
    
    try {
      // Step 5.1: 获取轨道信息（如果需要）
      let needFetchTracks = sourceLang === 'auto' || !sourceData;
      if (needFetchTracks) {
        console.log('[service-worker] Step 5.1: 获取轨道信息');
        
        try {
          // 优先尝试使用Player API获取轨道（更可靠，返回ISO 639-1标准代码）
          let trackResponse = null;
          
          // 先尝试Player API方式
          try {
            const apiResponse = await chrome.tabs.sendMessage(tabId, {
              type: 'getSubtitleTracksAPI'
            });
            
            if (apiResponse && apiResponse.success && apiResponse.tracks) {
              console.log(`[service-worker] ✓ 通过Player API获取到${apiResponse.tracks.length}条轨道`);
              trackResponse = {
                success: true,
                tracks: apiResponse.tracks
              };
            }
          } catch (apiErr) {
            console.log('[service-worker] Player API不可用，尝试原方式');
          }
          
          // 如果API方式失败，回退到原方式
          if (!trackResponse) {
            trackResponse = await chrome.tabs.sendMessage(tabId, {
              type: 'getVideoTrackData',
              videoId: videoId
            });
          }
          
          if (trackResponse && trackResponse.success && trackResponse.tracks) {
            console.log(`[service-worker] 获取到${trackResponse.tracks.length}条轨道信息`);
            
            // Step 5.2: 选择最佳源语言
            if (sourceLang === 'auto') {
              sourceLang = selectBestSourceLanguage(
                trackResponse.tracks,
                preferences.targetLang,
                sourceData?.lastSelectedLanguage
              );
              console.log('[service-worker] Step 5.2: 选择源语言:', sourceLang);
            }
            
            // Step 5.3: 通过Player API设置字幕语言（使用ISO 639-1标准）
            if (sourceLang && sourceLang !== 'auto') {
              try {
                console.log(`[service-worker] Step 5.3: 通过API设置字幕语言: ${sourceLang}`);
                const setResult = await chrome.tabs.sendMessage(tabId, {
                  type: 'setSubtitleTrackAPI',
                  langCode: sourceLang  // 使用ISO 639-1语言代码
                });
                
                if (setResult && setResult.success) {
                  console.log(`[service-worker] ✓ 成功通过API切换到语言: ${sourceLang}`);
                } else {
                  console.warn('[service-worker] API设置字幕语言失败，将依赖拦截器');
                }
              } catch (apiError) {
                console.warn('[service-worker] API调用失败，回退到拦截器方案:', apiError);
              }
            }
            
            // Step 5.4: 异步缓存轨道元数据（不阻塞流程）
            if (!sourceData) {
              Promise.resolve().then(async () => {
                try {
                  const trackMetadata = trackResponse.tracks.map((track: any) => ({
                    languageCode: track.languageCode,
                    name: track.name,
                    kind: track.kind
                    // 不保存 baseUrl（6小时过期）
                  }));
                  
                  await videoSourceLanguageCacheManager.set(videoId, {
                    videoId: videoId,
                    availableSourceLanguages: trackMetadata,
                    lastSelectedLanguage: sourceLang,
                    lastUpdated: Date.now()
                  });
                  
                  console.log('[service-worker] ✓ 轨道元数据已异步缓存');
                } catch (err) {
                  console.error('[service-worker] 轨道缓存失败:', err);
                }
              });
            }
          }
        } catch (error) {
          console.warn('[service-worker] 获取轨道信息失败，继续使用拦截器:', error);
        }
      }
      
      // Step 5.4: 设置 PENDING 超时定时器（5秒）
      const timeoutId = setTimeout(async () => {
        console.warn(`[service-worker] PENDING超时（5秒）: ${timeoutKey}`);
        
        const currentState = await runtimeStateManager.getTranslateState();
        if (currentState === TranslateActiveState.PENDING) {
          await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
          
          // 通知用户
          chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_ERROR_MESSAGE',
            data: '字幕获取超时，请重试'
          }).catch(() => {});
        }
        
        pendingTimeouts.delete(timeoutKey);
      }, PENDING_TIMEOUT);
      
      pendingTimeouts.set(timeoutKey, timeoutId);
      
      // Step 5.5: 触发字幕拦截器
      console.log('[service-worker] Step 5.5: 触发字幕拦截器');
      await chrome.tabs.sendMessage(tabId, {
        type: 'REQUEST_SUBTITLE_CAPTURE',
        data: { 
          videoId,
          sourceLang // 传递选定的源语言
        }
      }).catch(error => {
        console.log('[service-worker] 触发字幕拦截器失败:', error);
      });
      
      // 返回 needFetch 状态
      return {
        success: true,
        action: 'needFetch',
        message: '正在加载字幕，请稍候',
        config: preferences
      };
      
    } catch (error) {
      // 清理定时器
      const timeoutId = pendingTimeouts.get(timeoutKey);
      if (timeoutId) {
        clearTimeout(timeoutId);
        pendingTimeouts.delete(timeoutKey);
      }
      
      console.error('[service-worker] Step 5 失败:', error);
      await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
      return {
        success: false,
        action: 'error',
        error: '无法触发字幕加载'
      };
    }
    
  } catch (error) {
    console.error(`[service-worker] ✗ handleToggleTranslate: ${error instanceof Error ? error.message : String(error)}`);
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理翻译切换失败'
    };
  }
}

/**
 * 继续翻译流程（当收到字幕数据后）
 */
async function continueTranslationWithSubtitles(data: any): Promise<any> {
  try {
    console.log('[service-worker] 继续翻译流程，处理字幕数据');
    
    const { videoId, subtitles, sourceLang: passedSourceLang } = data;
    
    if (!videoId || !subtitles || subtitles.length === 0) {
      console.error('[service-worker] 字幕数据无效或无字幕');
      // 无字幕时，设置为INACTIVE并发送错误消息
      await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
      
      // 发送错误消息到content-script显示
      if (data.tabId) {
        chrome.tabs.sendMessage(data.tabId, {
          type: 'SHOW_ERROR_MESSAGE',
          data: {
            message: '当前视频无字幕',
            duration: 5000,
            level: 'warning'
          }
        }).catch(err => {
          console.error('[service-worker] 发送错误消息失败:', err);
        });
      }
      
      return {
        success: false,
        error: '当前视频无字幕',
        action: 'no_subtitles'
      };
    }
    
    // 获取用户偏好配置
    const preferences = await userPreferencesManager.getUserPreferences();
    if (!preferences || !preferences.translationService) {
      console.error('[service-worker] 用户偏好配置不完整');
      return {
        success: false,
        error: '用户偏好配置不完整'
      };
    }
    
    // 获取或推断源语言
    const videoSourceManager = VideoSourceLanguageCacheManager.getInstance();
    const sourceData = await videoSourceManager.get(videoId);
    
    // 优先使用传递的源语言，其次缓存，最后默认值
    let sourceLang = passedSourceLang || sourceData?.lastSelectedLanguage || 'auto';
    
    // 记录源语言的来源
    if (passedSourceLang) {
      console.log(`[service-worker] 使用传递的源语言: ${passedSourceLang}`);
    } else if (sourceData?.lastSelectedLanguage) {
      console.log(`[service-worker] 使用缓存的源语言: ${sourceData.lastSelectedLanguage}`);
    }
    
    // 如果源语言还是auto，尝试从可用语言列表中选择
    if (sourceLang === 'auto' && sourceData?.availableSourceLanguages?.length > 0) {
      sourceLang = selectBestSourceLanguage(
        sourceData.availableSourceLanguages,
        preferences.targetLang,
        sourceData.lastSelectedLanguage
      );
      console.log(`[service-worker] 智能选择源语言: ${sourceLang}`);
    }
    
    console.log('[service-worker] 开始翻译字幕:', {
      videoId,
      sourceLang,
      targetLang: preferences.targetLang,
      subtitleCount: subtitles.length
    });
    
    // 调试：打印完整的preferences
    console.log('[DEBUG] preferences内容:', {
      targetLang: preferences.targetLang,
      translationService: preferences.translationService,
      subtitleMode: preferences.subtitleMode
    });
    
    // 执行翻译
    const translatedResult = await executeTranslation(
      {
        subtitles: subtitles,
        videoId: videoId,
        url: data.url || ''
      },
      preferences
    );
    
    // 保存到缓存
    const cacheManager = TranslationCacheManager.getInstance();
    await cacheManager.set({
      videoId,
      sourceLang,
      targetLang: preferences.targetLang,
      translationService: preferences.translationService,
      originalSubtitles: subtitles,
      translatedSubtitles: translatedResult.translatedSubtitles,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      dataHash: ''
    });
    
    // 更新状态为ACTIVE
    await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
    
    // 通知Content Script显示翻译结果
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'DISPLAY_TRANSLATION',
        data: translatedResult
      }).catch(error => {
        console.error('[service-worker] 无法发送翻译结果到Content Script:', error);
      });
    }
    
    return {
      success: true,
      action: 'translated',
      data: translatedResult,
      message: '字幕翻译完成'
    };
    
  } catch (error) {
    console.error('[service-worker] 继续翻译流程失败:', error);
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    return {
      success: false,
      error: error instanceof Error ? error.message : '翻译处理失败'
    };
  }
}

/**
 * 执行字幕翻译
 */
async function executeTranslation(subtitleData: SubtitleData, preferences: UserPreferences): Promise<any> {
  try {
    console.log('[DEBUG] executeTranslation开始，接收参数:', {
      subtitleData: {
        videoId: subtitleData.videoId,
        subtitleCount: subtitleData.subtitles?.length,
        url: subtitleData.url
      },
      preferences: {
        targetLang: preferences.targetLang,
        translationService: preferences.translationService,
        subtitleMode: preferences.subtitleMode
      }
    });
    
    const { subtitles, videoId, url } = subtitleData;
    const { targetLang, translationService, subtitleMode } = preferences;
    
    // 从字幕数据中检测源语言（默认为英语）
    const sourceLang = detectSourceLanguage(subtitles) || 'en';
    
    console.log('[DEBUG] detectSourceLanguage返回:', sourceLang);
    
    console.log('[service-worker] 执行翻译:', {
      subtitleCount: subtitles.length,
      sourceLang,
      targetLang,
      service: translationService.type,
      mode: subtitleMode
    });
    
    // 提取需要翻译的文本
    const textsToTranslate = subtitles.map((s: any) => s.text);
    
    // 批量翻译（每批50条，避免请求过大）
    const batchSize = 50;
    const translatedTexts: string[] = [];
    
    for (let i = 0; i < textsToTranslate.length; i += batchSize) {
      const batch = textsToTranslate.slice(i, i + batchSize);
      console.log(`[service-worker] 翻译批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(textsToTranslate.length/batchSize)}`);
      
      // 调用翻译API
      console.log('[DEBUG] 调用translateBatch前的参数:', {
        batchSize: batch.length,
        sourceLang: sourceLang || 'auto',
        targetLang: targetLang,
        serviceType: translationService.type || translationService
      });
      
      const translatedBatch = await translateBatch(
        batch,
        sourceLang || 'auto',
        targetLang,
        translationService
      );
      
      translatedTexts.push(...translatedBatch);
    }
    
    // 组装翻译结果（符合 TranslationCacheData 格式）
    const translatedSubtitles = subtitles.map((subtitle: any, index: number) => ({
      start: subtitle.start || subtitle.startTime || 0,
      duration: subtitle.duration || subtitle.dur || 0,
      text: subtitle.text,
      translation: translatedTexts[index] || subtitle.text
    }));
    
    // 构建符合 TranslationCacheData 接口的结果
    const result = {
      videoId,
      videoUrl: url,
      sourceLang: sourceLang || 'en',
      targetLang,
      subtitleMode: subtitleMode || 'bilingual',
      translationService: {
        type: translationService.type,
        name: translationService.name,
        model: translationService.model,
        temperature: translationService.temperature,
        rpm: translationService.rpm,
        tpm: translationService.tpm
      },
      translatedSubtitles: translatedSubtitles,
      lastUsed: Date.now(),
      dataHash: ''  // 将由 TranslationCacheManager 计算
    };
    
    console.log(`[service-worker] ✓ 翻译完成: ${translatedSubtitles.length}条字幕`);
    
    return result;
    
  } catch (error) {
    console.error(`[service-worker] ✗ 翻译执行: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * 检测字幕的源语言
 */
function detectSourceLanguage(subtitles: any[]): string {
  console.log('[DEBUG] detectSourceLanguage开始检测，字幕数量:', subtitles?.length);
  
  // 简单的语言检测逻辑
  // 可以根据字幕文本的字符特征判断语言
  if (!subtitles || subtitles.length === 0) {
    console.log('[DEBUG] 无字幕，返回默认语言: en');
    return 'en'; // 默认英语
  }
  
  // 取前几条字幕进行检测
  const sampleTexts = subtitles.slice(0, 5).map(s => s.text).join(' ');
  console.log('[DEBUG] 用于检测的样本文本:', sampleTexts.substring(0, 100));
  
  // 检测是否包含中文字符
  if (/[\u4e00-\u9fa5]/.test(sampleTexts)) {
    console.log('[DEBUG] 检测到中文字符，返回: zh');
    return 'zh';
  }
  
  // 检测是否包含日文字符
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sampleTexts)) {
    console.log('[DEBUG] 检测到日文字符，返回: ja');
    return 'ja';
  }
  
  // 检测是否包含韩文字符
  if (/[\uac00-\ud7af]/.test(sampleTexts)) {
    console.log('[DEBUG] 检测到韩文字符，返回: ko');
    return 'ko';
  }
  
  // 默认返回英语
  console.log('[DEBUG] 未检测到特殊字符，默认返回: en');
  return 'en';
}

/**
 * 批量翻译文本
 */
async function translateBatch(
  texts: string[], 
  sourceLang: string, 
  targetLang: string,
  service: any
): Promise<string[]> {
  console.log('[DEBUG] translateBatch接收参数:', {
    textsCount: texts.length,
    sourceLang: sourceLang,
    targetLang: targetLang,
    service: service,
    serviceType: service.type || service
  });
  
  try {
    // 根据翻译服务类型调用不同的API
    const serviceType = service.type || service;
    
    switch (serviceType) {
      case 'google':
      case 'google-free':
        return await translateWithGoogle(texts, sourceLang, targetLang);
        
      case 'microsoft':
      case 'microsoft-free':
        return await translateWithMicrosoft(texts, sourceLang, targetLang);
        
      case 'openai':
        return await translateWithOpenAI(texts, sourceLang, targetLang, service);
        
      case 'dummy':
        // 测试模式：返回简单的翻译标记
        return texts.map(text => `[译] ${text}`);
        
      default:
        console.warn('[service-worker] 不支持的翻译服务:', serviceType);
        // 返回原文
        return texts;
    }
  } catch (error) {
    console.error('[service-worker] 批量翻译失败:', error);
    // 失败时返回原文
    return texts;
  }
}

/**
 * 使用Google翻译API
 */
async function translateWithGoogle(
  texts: string[], 
  sourceLang: string, 
  targetLang: string
): Promise<string[]> {
  console.log('[DEBUG] translateWithGoogle接收参数:', {
    textsCount: texts.length,
    sourceLang: sourceLang,
    targetLang: targetLang,
    firstText: texts[0]?.substring(0, 50) // 打印第一条文本的前50个字符
  });
  
  try {
    // 使用Google Translate免费API
    const apiUrl = 'https://translate.googleapis.com/translate_a/single';
    
    // 将多个文本合并，用特殊分隔符分隔
    const separator = '\n---SEPARATOR---\n';
    const combinedText = texts.join(separator);
    
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLang === 'auto' ? 'auto' : sourceLang,
      tl: targetLang,
      dt: 't',
      q: combinedText
    });
    
    console.log('[DEBUG] Google API请求参数:', {
      sl: params.get('sl'),
      tl: params.get('tl'),
      textLength: combinedText.length,
      url: `${apiUrl}?${params.toString().substring(0, 100)}...` // 打印部分URL
    });
    
    const response = await fetch(`${apiUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Google翻译API错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 解析翻译结果
    let translatedText = '';
    if (data && data[0]) {
      data[0].forEach((item: any) => {
        if (item[0]) {
          translatedText += item[0];
        }
      });
    }
    
    // 分割翻译后的文本
    const translatedTexts = translatedText.split(separator);
    
    // 确保返回数组长度一致
    while (translatedTexts.length < texts.length) {
      translatedTexts.push(texts[translatedTexts.length]);
    }
    
    return translatedTexts;
    
  } catch (error) {
    console.error('[service-worker] Google翻译失败:', error);
    return texts; // 失败返回原文
  }
}

/**
 * 使用Microsoft翻译API（暂时返回原文）
 */
async function translateWithMicrosoft(
  texts: string[], 
  sourceLang: string, 
  targetLang: string
): Promise<string[]> {
  console.log('[service-worker] ⚠️ Microsoft翻译API尚未实现');
  // TODO: 实现Microsoft翻译API
  return texts;
}

/**
 * 使用OpenAI翻译API（暂时返回原文）
 */
async function translateWithOpenAI(
  texts: string[], 
  sourceLang: string, 
  targetLang: string,
  service: any
): Promise<string[]> {
  console.log('[service-worker] ⚠️ OpenAI翻译API尚未实现');
  // TODO: 实现OpenAI翻译API
  // 将使用 service.apiKey, service.model, service.temperature 等参数
  return texts;
}

async function handleApiConnectionTest(data: any): Promise<any> {
  console.log('[service-worker] <- testApiConnection:', data);
  
  const { apiType, apiKey, forceTest } = data;
  
  try {
    // 免费API测试逻辑
    if (apiType === 'google-free' || apiType === 'microsoft-free') {
      return await testFreeTranslationService(apiType);
    } 
    // 付费API测试逻辑
    else {
      if (!apiKey || apiKey.trim() === '') {
        return {
          success: false,
          message: '请输入API密钥'
        };
      }
      return await testPaidApiService(apiType, apiKey);
    }
  } catch (error) {
    console.error(`[service-worker] ✗ testApiConnection: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      message: error instanceof Error ? error.message : '未知错误'
    };
  }
}

async function handleErrorReport(data: any): Promise<any> {
  try {
    console.log('[service-worker] <- errorReport:', data);
    return {
      success: true,
      message: 'Error report received'
    };
  } catch (error) {
    console.error(`[service-worker] ✗ handleErrorReport: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to handle error report'
    };
  }
}

/**
 * 广播SidePanel状态变化到所有YouTube标签页
 * 🎯 职责：仅由操作函数调用，用于多标签页状态同步
 * 📵 生命周期事件不应调用此函数，避免重复广播
 */
function broadcastSidePanelStateChange(isOpen: boolean): void {
  chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'UPDATE_BUTTON_STATE',
          isOpen,
          source: 'cross-tab-sync'
        }).catch(() => {
          // 忽略错误：标签页可能没有content script或已关闭
        });
      }
    });
  });
  console.log(`[service-worker] 📡 已广播SidePanel状态变化: ${isOpen} 到所有YouTube标签页`);
}



/**
 * 🎯 消息处理专用状态获取函数 - 基于SAD.md设计
 * 用于响应Content Script的状态查询请求
 */
async function getSidePanelStateForMessage(): Promise<any> {
  try {
    const isOpen = await getSidePanelState();
    return { success: true, isOpen: isOpen };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '未知错误', isOpen: false };
  }
}

/**
 * 🔧 处理SidePanel实际打开通知 - 简化版（状态保存已移至Port连接处理）
 * 现在只负责记录日志，状态保存由Port连接处理（更可靠）
 */
async function handleSidePanelActuallyOpened(message: any): Promise<any> {
  try {
    console.log('[service-worker] 收到SidePanel实际打开通知:', message);
    console.log('[service-worker] 状态保存已由Port连接处理');
    
    return {
      success: true,
      message: 'SidePanel open notification received (state handled by Port)'
    };
  } catch (error) {
    console.error(`[service-worker] ✗ sidePanelActuallyOpened: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to handle SidePanel open notification'
    };
  }
}

/**
 * 处理SidePanel实际关闭通知
 */
async function handleSidePanelActuallyClosed(message: any): Promise<any> {
  try {
    console.log('[service-worker] 收到SidePanel实际关闭通知:', message);
    
    // 🔥 更新状态缓存
    const tabId = message.tabId;
    console.log(`[service-worker] 🔄 SidePanel已实际关闭: 标签页 ${tabId}`);
    
    // 确保运行时状态为关闭
    await runtimeStateManager.setPopupState(false);
    console.log('[service-worker] ✓ SidePanel状态已确认为关闭');
    
    // 🔧 生命周期事件：只负责内部状态同步，不广播
    // 广播由操作函数负责
    
    return {
      success: true,
      message: 'SidePanel close state confirmed'
    };
  } catch (error) {
    console.error(`[service-worker] ✗ sidePanelActuallyClosed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to handle SidePanel close notification'
    };
  }
}

/**
 * 🎯 页面级状态管理：检查当前标签页的SidePanel状态
 * 用于标签切换时同步按钮状态
 */
async function handleCheckSidePanelStatus(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      console.warn('[service-worker] ⚠️ 无法获取标签页ID');
      return {
        success: false,
        error: '无法获取标签页ID'
      };
    }
    
    // 使用存储读取检查SidePanel状态，高性能方案
    try {
      const isEnabled = await runtimeStateManager.getPopupState();
      
      console.log(`[service-worker] 标签页${tabId} SidePanel状态: enabled=${isEnabled}`);
      
      return {
        success: true,
        isEnabled: isEnabled
      };
    } catch (error) {
      // 如果获取失败，假设未启用
      console.warn(`[service-worker] ⚠️ 获取标签页${tabId}SidePanel状态: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: true,
        isEnabled: false
      };
    }
  } catch (error) {
    console.error('[service-worker] 检查SidePanel状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '检查SidePanel状态失败'
    };
  }
}

/**
 * 🎯 处理getSidePanelStatus消息 - 基于存储读取的高性能方案
 * 符合architecture.md的新架构设计
 */
async function handleGetSidePanelStatus(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    // 直接从存储读取状态，高性能方案
    const isEnabled = await runtimeStateManager.getPopupState();
    
    console.log(`[service-worker] getSidePanelStatus: enabled=${isEnabled}`);
    
    return {
      success: true,
      isEnabled: isEnabled
    };
  } catch (error) {
    console.error('[service-worker] getSidePanelStatus失败:', error);
    return {
      success: false,
      isEnabled: false
    };
  }
}

// === API测试相关函数 ===

/**
 * 测试免费翻译服务
 */
async function testFreeTranslationService(apiType: string): Promise<{success: boolean, message: string}> {
  console.log(`[service-worker] 测试免费翻译服务: ${apiType}`);
  
  const testText = 'Hello, this is a test message.';
  const sourceLang = 'en';
  const targetLang = 'zh-Hans';
  
  try {
    if (apiType === 'google-free') {
      const result = await testGoogleTranslateService(testText, sourceLang, targetLang);
      return {
        success: true,
        message: `Google翻译测试成功: ${result}`
      };
    } else if (apiType === 'microsoft-free') {
      const result = await testMicrosoftTranslateService(testText, sourceLang, targetLang);
      return {
        success: true,
        message: `Microsoft翻译测试成功: ${result}`
      };
    } else {
      return {
        success: false,
        message: `未知的免费API类型: ${apiType}`
      };
    }
  } catch (error) {
    console.error(`[service-worker] ✗ 免费翻译服务测试: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      message: error instanceof Error ? error.message : '测试失败'
    };
  }
}

/**
 * 测试付费API服务
 */
async function testPaidApiService(apiType: string, apiKey: string): Promise<{success: boolean, message: string}> {
  console.log(`[service-worker] 测试付费API服务: ${apiType}`);
  
  try {
    if (apiType === 'openai') {
      return await testOpenAIService(apiKey, 'gpt-3.5-turbo');
    } else if (apiType === 'deepl') {
      return {
        success: false,
        message: 'DeepL API测试功能尚未实现'
      };
    } else if (apiType === 'gemini') {
      return {
        success: false,
        message: 'Gemini API测试功能尚未实现'
      };
    } else {
      return {
        success: false,
        message: `API类型 ${apiType} 测试功能尚未实现`
      };
    }
  } catch (error) {
    console.error(`[service-worker] ✗ 付费API服务测试: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      message: error instanceof Error ? error.message : '测试失败'
    };
  }
}

/**
 * 测试Google翻译服务 - 双路径测试
 */
async function testGoogleTranslateService(testText: string, sourceLang: string, targetLang: string): Promise<string> {
  let pathAResult = '失败';
  let pathBResult = '失败';
  let pathATranslation = '';
  let pathBTranslation = '';
  
  // 测试路径A: /translate_a/single
  try {
    console.log('[service-worker] 测试Google翻译路径A');
    pathATranslation = await testGoogleTranslatePathA(testText, sourceLang, targetLang);
    pathAResult = '成功✅';
  } catch (error) {
    console.error(`[service-worker] ✗ Google翻译路径A: ${error instanceof Error ? error.message : String(error)}`);
    pathAResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 测试路径B: /translate_a/t
  try {
    console.log('[service-worker] 测试Google翻译路径B');
    pathBTranslation = await testGoogleTranslatePathB(testText, sourceLang, targetLang);
    pathBResult = '成功✅';
  } catch (error) {
    console.error(`[service-worker] ✗ Google翻译路径B: ${error instanceof Error ? error.message : String(error)}`);
    pathBResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 生成测试结果消息
  let resultMessage = `Google翻译测试结果:\n`;
  resultMessage += `- 路径A (/translate_a/single): ${pathAResult}\n`;
  resultMessage += `- 路径B (/translate_a/t): ${pathBResult}\n`;
  
  if (pathAResult.includes('成功') || pathBResult.includes('成功')) {
    resultMessage += `\n翻译示例:\n`;
    if (pathAResult.includes('成功')) {
      resultMessage += `- 路径A: "${pathATranslation}"\n`;
    }
    if (pathBResult.includes('成功')) {
      resultMessage += `- 路径B: "${pathBTranslation}"\n`;
    }
    
    // 检查是否有至少一条路径成功
    if (pathAResult.includes('成功') && pathBResult.includes('成功')) {
      return `${resultMessage}\n✅ 两条路径均可用!`;
    } else {
      return `${resultMessage}\n⚠️ 部分路径可用，系统将自动切换`;
    }
  } else {
    return `${resultMessage}\n❌ 所有路径均不可用`;
  }
}

/**
 * 测试Google翻译路径A - /translate_a/single
 */
async function testGoogleTranslatePathA(testText: string, sourceLang: string, targetLang: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(testText)}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://translate.google.com/',
      'Origin': 'https://translate.google.com'
    }
  };
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // 解析Google API返回格式: [[["翻译结果","原文",""],null,"en"]]
    if (data && Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      let translatedText = '';
      for (const item of data[0]) {
        if (Array.isArray(item) && item.length > 0) {
          translatedText += item[0];
        }
      }
      return translatedText || '翻译结果为空';
    } else {
      throw new Error('翻译返回格式异常');
    }
  } catch (error) {
    throw new Error(`路径A失败: ${(error as Error).message}`);
  }
}

/**
 * 测试Google翻译路径B - /translate_a/t  
 */
async function testGoogleTranslatePathB(testText: string, sourceLang: string, targetLang: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/t?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(testText)}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', 
      'Referer': 'https://translate.google.com/',
      'Origin': 'https://translate.google.com'
    }
  };
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // 解析结果 - 路径B可能返回不同格式
    if (data) {
      if (Array.isArray(data) && data.length > 0) {
        if (typeof data[0] === 'string') {
          // 简单格式：["翻译结果"]
          return data[0];
        } else if (Array.isArray(data[0])) {
          // 复杂格式：[["翻译片段1"],["翻译片段2"]]
          let translatedText = '';
          for (const item of data) {
            if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'string') {
              translatedText += item[0];
            }
          }
          return translatedText;
        }
      }
      throw new Error('翻译返回格式异常');
    } else {
      throw new Error('翻译返回空数据');
    }
  } catch (error) {
    throw new Error(`路径B失败: ${(error as Error).message}`);
  }
}

/**
 * 测试微软翻译服务 - 双路径测试
 */
async function testMicrosoftTranslateService(testText: string, sourceLang: string, targetLang: string): Promise<string> {
  let pathAResult = '失败';
  let pathBResult = '失败';
  let pathATranslation = '';
  let pathBTranslation = '';
  
  // 测试路径A: Edge认证令牌
  try {
    console.log('[service-worker] 测试微软翻译路径A');
    pathATranslation = await testMicrosoftTranslatePathA(testText, sourceLang, targetLang);
    pathAResult = '成功✅';
  } catch (error) {
    console.error(`[service-worker] ✗ 微软翻译路径A: ${error instanceof Error ? error.message : String(error)}`);
    pathAResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 测试路径B: API-Edge端点
  try {
    console.log('[service-worker] 测试微软翻译路径B');
    pathBTranslation = await testMicrosoftTranslatePathB(testText, sourceLang, targetLang);
    pathBResult = '成功✅';
  } catch (error) {
    console.error(`[service-worker] ✗ 微软翻译路径B: ${error instanceof Error ? error.message : String(error)}`);
    pathBResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 生成测试结果消息
  let resultMessage = `微软翻译测试结果:\n`;
  resultMessage += `- 路径A (Edge认证令牌): ${pathAResult}\n`;
  resultMessage += `- 路径B (API-Edge端点): ${pathBResult}\n`;
  
  if (pathAResult.includes('成功') || pathBResult.includes('成功')) {
    resultMessage += `\n翻译示例:\n`;
    if (pathAResult.includes('成功')) {
      resultMessage += `- 路径A: "${pathATranslation}"\n`;
    }
    if (pathBResult.includes('成功')) {
      resultMessage += `- 路径B: "${pathBTranslation}"\n`;
    }
    
    // 检查是否有至少一条路径成功
    if (pathAResult.includes('成功') && pathBResult.includes('成功')) {
      return `${resultMessage}\n✅ 两条路径均可用!`;
    } else {
      return `${resultMessage}\n⚠️ 部分路径可用，系统将自动切换`;
    }
  } else {
    return `${resultMessage}\n❌ 所有路径均不可用`;
  }
}

/**
 * 测试微软翻译路径A - Edge认证令牌
 */
async function testMicrosoftTranslatePathA(testText: string, sourceLang: string, targetLang: string): Promise<string> {
  try {
    // 微软API语言代码映射
    const msLangMap: Record<string, string> = {
      'zh-Hans': 'zh-Hans', // 简体中文
      'zh-Hant': 'zh-Hant', // 繁体中文
      'en': 'en',           // 英语
    };
    
    // 转换语言代码格式
    const from = msLangMap[sourceLang] || sourceLang;
    const to = msLangMap[targetLang] || targetLang;
    
    // 获取认证令牌
    const tokenUrl = 'https://edge.microsoft.com/translate/auth';
    const tokenOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': '*/*',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      }
    };
    
    const authResponse = await fetch(tokenUrl, tokenOptions);
    
    if (!authResponse.ok) {
      throw new Error(`无法获取微软翻译认证令牌，状态码: ${authResponse.status}`);
    }
    
    const authToken = await authResponse.text();
    
    // 调用翻译API
    const translationUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}`;
    const translationOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': 'application/json',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      },
      body: JSON.stringify([{ Text: testText }])
    };
    
    const response = await fetch(translationUrl, translationOptions);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0 && data[0].translations && 
        Array.isArray(data[0].translations) && data[0].translations.length > 0) {
      return data[0].translations[0].text;
    } else {
      throw new Error('翻译结果格式异常');
    }
  } catch (error) {
    throw new Error(`路径A失败: ${(error as Error).message}`);
  }
}

/**
 * 测试微软翻译路径B - API-Edge端点
 */
async function testMicrosoftTranslatePathB(testText: string, sourceLang: string, targetLang: string): Promise<string> {
  try {
    // 微软API语言代码映射
    const msLangMap: Record<string, string> = {
      'zh-Hans': 'zh-Hans', // 简体中文
      'zh-Hant': 'zh-Hant', // 繁体中文
      'en': 'en',           // 英语
    };
    
    // 转换语言代码格式
    const from = msLangMap[sourceLang] || sourceLang;
    const to = msLangMap[targetLang] || targetLang;
    
    // 获取认证令牌
    const tokenUrl = 'https://edge.microsoft.com/translate/auth';
    const tokenOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': '*/*',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      }
    };
    
    const authResponse = await fetch(tokenUrl, tokenOptions);
    
    if (!authResponse.ok) {
      throw new Error(`无法获取微软翻译认证令牌，状态码: ${authResponse.status}`);
    }
    
    const authToken = await authResponse.text();
    
    // 调用翻译API - 使用Edge端点
    const translationUrl = `https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}&includeSentenceLength=true`;
    const translationOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': 'application/json',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      },
      body: JSON.stringify([{ Text: testText }])
    };
    
    const response = await fetch(translationUrl, translationOptions);
    
    if (!response.ok) {
      // 尝试获取详细错误信息
      let errorDetail = '';
      try {
        errorDetail = await response.text();
      } catch (e) {
        errorDetail = '无法获取详细错误信息';
      }
      
      throw new Error(`微软翻译路径B请求失败，状态码: ${response.status}，错误详情: ${errorDetail}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0 && data[0].translations && 
        Array.isArray(data[0].translations) && data[0].translations.length > 0) {
      return data[0].translations[0].text;
    } else {
      throw new Error('翻译结果格式异常');
    }
  } catch (error) {
    throw new Error(`路径B失败: ${(error as Error).message}`);
  }
}

/**
 * 测试OpenAI服务
 */
async function testOpenAIService(apiKey: string, model: string): Promise<{success: boolean, message: string}> {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: 'Say "test successful" in Chinese.'
        }
      ],
      max_tokens: 10,
      temperature: 0
    })
  };
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMsg);
    }
    
    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      const result = data.choices[0].message?.content || '测试成功';
      return {
        success: true,
        message: `OpenAI API测试成功: ${result}`
      };
    } else {
      throw new Error('OpenAI返回格式异常');
    }
  } catch (error) {
    console.error(`[service-worker] ✗ OpenAI测试: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'OpenAI测试失败'
    };
  }
}

// 🚀 新架构：依赖 onInstalled 和 onStartup 事件进行初始化
// 移除自执行函数，避免重复初始化
// 初始化由 chrome.runtime.onInstalled 和 chrome.runtime.onStartup 事件处理
