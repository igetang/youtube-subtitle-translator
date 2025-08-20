/**
 * @file service-worker.ts
 * @description YouTube字幕翻译助手 - 后台服务工作脚本 (Service Worker)
 * 基于 Manifest V3 规范和 architecture.md 7.1.2 设计
 * @version 5.24.6
 */

console.log('[background] >>>>>> Service Worker 已加载 (完整版) <<<<<<');

// === 核心模块导入 ===
import { UserPreferencesManager } from '../shared/storage/user-preferences-manager';
import { RuntimeStateManager } from '../shared/storage/runtime-state-manager';
import { StorageManager } from '../shared/storage/storage-manager';
import { 
  TranslateActiveState, 
  RuntimeStateChangeEvent,
  DEFAULT_RUNTIME_STATE 
} from '../shared/types/runtime-state-types';
// 移除SidePanel相关导入
// import { sidePanelController, SidePanelSource } from './sidepanel-controller';

// === 全局管理器实例 ===
const userPreferencesManager = UserPreferencesManager.getInstance();
const runtimeStateManager = RuntimeStateManager.getInstance();
const storageManager = StorageManager.getInstance();

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
    console.warn('[background] URL解析失败:', url, error);
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
    console.warn('[background] 提取视频ID失败:', url, error);
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
    const settingPanelOpen = await runtimeStateManager.getSettingPanelState();
    
    // 如果有明确的状态，直接返回
    if (typeof settingPanelOpen === 'boolean') {
      console.log('[状态检测] 使用运行时状态:', settingPanelOpen);
      return settingPanelOpen;
    }
    
    // 降级到chrome.runtime.getContexts（Chrome 125+）
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.POPUP]
      });
      const isOpen = contexts.length > 0;
      
      // 同步状态到运行时管理器
      await runtimeStateManager.setSettingPanelState(isOpen);
      
      return isOpen;
    }
    
    // 如果都不支持，返回false
    return false;
  } catch (error) {
    console.error('[状态检测] 获取Popup状态失败:', error);
    return false;
  }
}

/**
 * 🎯 标签页图标状态管理
 * Popup Fallback方案：popup在manifest中配置为全局可用，这里只管理图标状态
 */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
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
      
      console.log(`[background] ✅ YouTube页面图标和Popup已设置 (标签页: ${tabId})`);
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
      
      console.log(`[background] ✅ 非YouTube页面图标已设置，Popup已禁用 (标签页: ${tabId})`);
    }
  } catch (error) {
    console.error(`[background] 更新图标和Popup状态失败 (标签页: ${tabId}):`, error);
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
      console.log('[background] 🔥 Popup Port连接建立 - 确认Popup已实际打开');
      
      try {
        // 🔧 统一状态管理：Port连接 = Popup真正打开
        await runtimeStateManager.setSettingPanelState(true);
        broadcastSidePanelStateChange(true);
        console.log('[background] ✅ Popup状态已更新为打开');
        
      } catch (error) {
        console.error('[background] 处理Popup打开事件失败:', error);
      }
      
      port.onDisconnect.addListener(async () => {
        console.log('[background] 🔥 检测到Popup关闭（Port断开）');
        
        try {
          // 🔧 统一状态管理：Port断开 = Popup真正关闭
          await runtimeStateManager.setSettingPanelState(false);
          
          // 🔧 修复：统一使用broadcastSidePanelStateChange，避免重复和消息类型不匹配
          // 移除重复的直接消息发送，由broadcastSidePanelStateChange统一处理
          
          broadcastSidePanelStateChange(false);
          console.log('[background] ✅ Popup状态已更新为关闭，所有标签页已同步');
          
        } catch (error) {
          console.error('[background] 处理Popup关闭事件失败:', error);
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
  console.log('[background] onInstalled event:', details);
  
  try {
    await initializeManagers();
    
    switch (details.reason) {
      case 'install':
        console.log('[background] 扩展首次安装，初始化默认设置');
        await setupDefaultSettings();
        break;
      case 'update':
        console.log('[background] 扩展更新，检查数据迁移');
        await handleUpdate(details.previousVersion);
        break;
    }
  } catch (error) {
    console.error('[background] onInstalled 初始化失败:', error);
  }
});

/**
 * Chrome 浏览器启动事件
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[background] onStartup event');
  
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
    console.log('[background] ✅ 启动时Popup状态已设置为禁用');
  } catch (error) {
    console.error('[background] onStartup 初始化失败:', error);
  }
});

/**
 * Service Worker 激活事件
 */
self.addEventListener('activate', (event: any) => {
  console.log('[background] Service Worker activated');
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
  // 🎯 同步处理层：Popup操作处理
  // 替代原有的SidePanel逻辑，改为Popup实现
  if (message.type === 'togglePopup') {
    console.log(`[background] 🚀 直接处理togglePopup, 来自: ${
      sender.tab ? `标签页ID ${sender.tab.id}` : '扩展内部'
    }`);
    
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
      console.log(`[background] 翻译按钮，当前Popup状态: ${isCurrentlyOpen ? '已打开' : '未打开'}`);
      
      if (isCurrentlyOpen) {
        // 当前打开 → 关闭
        // Popup通过程序化关闭
        chrome.runtime.sendMessage({
          type: 'closePopup'
        }).then(() => {
          console.log(`[background] ❌ Popup已关闭 (翻译按钮)`);
          sendResponse({ success: true, status: 'closed', newState: false });
        }).catch(error => {
          console.error(`[background] 关闭Popup失败:`, error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        // 当前关闭 → 打开
        // 🔥 关键修复：先确保popup路径已设置，再打开
        chrome.action.setPopup({
          tabId: tabId,
          popup: 'src/popup/popup.html'
        }, () => {
          if (chrome.runtime.lastError) {
            console.error(`[background] 设置Popup路径失败:`, chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          
          // 路径设置成功后，打开popup
          chrome.action.openPopup().then(() => {
            console.log(`[background] ✅ Popup已打开 (翻译按钮)`);
            sendResponse({ success: true, status: 'opened', newState: true });
          }).catch(error => {
            console.error(`[background] 打开Popup失败:`, error);
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
                console.log(`[background] ✅ Popup已通过windows.create打开（备用方案）`);
                sendResponse({ success: true, status: 'opened_window', newState: true });
              }
            });
          });
        });
      }
    }).catch(error => {
      console.error(`[background] 获取Popup状态失败:`, error);
      sendResponse({ success: false, error: error.message });
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
  const skipGeneralLog = ['sidePanelActuallyOpened', 'sidePanelActuallyClosed'];
  if (!skipGeneralLog.includes(message.type)) {
    console.log(`[background] 收到异步消息: type='${message.type}', 来自: ${
      sender.tab ? `标签页ID ${sender.tab.id} (${sender.tab.url})` : '扩展内部'
    }`, message);
  }

  handleAsyncMessage(message, sender, sendResponse);
  return true; // 异步响应
});

// 🔧 移除重复的tabs.onActivated监听器
// 原因：官方示例只使用tabs.onUpdated，它已经能处理所有情况（包括标签页切换）
// 重复的监听器可能导致状态同步冲突

/**
 * 🔧 监听标签页关闭
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[background] 标签页 ${tabId} 已关闭`);
});



/**
 * 异步消息处理函数
 * 🔧 优秀Chrome扩展设计：处理不需要用户手势的业务消息
 * 基于 architecture.md 3.4.5 统一数据管理消息接口
 */
async function handleAsyncMessage(
  message: any, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    const response = await routeMessage(message, sender);
    sendResponse(response);
  } catch (error) {
    console.error(`[background] 处理异步消息失败 (${message.type}):`, error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : '消息处理失败'
    });
  }
}

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
      console.warn('[background] closeSidePanel 已废弃，建议使用 toggleSidePanel');
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
      // 新格式：{ type: 'setRuntimeState', data: { stateKey: 'settingPanelOpen', value: true } }
      // 直接从data中获取参数
      const setStateKey = data?.stateKey;
      const setStateValue = data?.value;
      
      if (!setStateKey) {
        console.error('[background] setRuntimeState: 缺少stateKey或key参数');
        return {
          success: false,
          error: 'Missing stateKey or key parameter'
        };
      }
      
      console.log(`[background] setRuntimeState: ${setStateKey}=${setStateValue}`);
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
      console.log('[background] 收到UI状态更新消息:', data);
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
      console.log('[background] 收到SidePanel打开通知');
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
      return await handleSubtitleData(data);
    
    default:
      console.warn(`[background] 未知消息类型: ${type}`);
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
    console.warn('[background] openPopup 缺少有效的标签页信息');
    return {
      success: false,
      error: 'Invalid sender for opening popup'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  
  console.log(`[background] 收到打开Popup请求，标签页: ${tabId}`);
  
  // 检查是否为YouTube页面
  if (!tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[background] 非YouTube页面不能打开Popup: ${tabUrl}`);
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
    
    // 更新运行时状态（使用全局实例）
    await runtimeStateManager.setSettingPanelState(true);
    
    console.log(`[background] ✅ Popup已打开`);
    
    return {
      success: true,
      status: 'opened'
    };
    
  } catch (error) {
    console.error('[background] 打开Popup失败:', error);
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
    console.warn('[background] togglePopup 缺少有效的标签页信息');
    return {
      success: false,
      error: 'Invalid sender for toggling popup'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  const source = data?.source || 'translation-button';
  
  console.log(`[background] 收到切换 Popup 请求，标签页: ${tabId}，来源: ${source}`);
  
  // 检查是否为YouTube页面
  if (!tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[background] 非YouTube页面不能操作Popup: ${tabUrl}`);
    return {
      success: false,
      error: '只有YouTube页面才能打开翻译设置面板',
      fallback: 'popup'
    };
  }
  
  try {
    // 🔥 关键修复：检测Popup真实状态
    const isCurrentlyOpen = await getPopupState();
    
    console.log(`[background] 当前Popup状态: ${isCurrentlyOpen ? '已打开' : '已关闭'}`);
    
    if (isCurrentlyOpen) {
      // 当前已打开，无法直接关闭Popup，返回提示
      console.log(`[background] ⚠️ Popup已打开，无法通过API关闭 (标签页: ${tabId})`);
      
      return {
        success: true,
        status: 'already_open',
        isOpen: true,
        message: 'Popup已打开，请手动关闭或直接在Popup中操作'
      };
    } else {
      // 当前未打开，执行打开操作
      console.log(`[background] 🚀 准备打开Popup (标签页: ${tabId})`);
      
      // 确保popup路径设置正确
      await chrome.action.setPopup({
        tabId,
        popup: 'src/popup/popup.html'
      });
      
      // 🔥 用户手势上下文：直接调用openPopup()
      await chrome.action.openPopup();
      console.log(`[background] ✅ Popup已打开 (标签页: ${tabId})`);
      
      return {
        success: true,
        status: 'opened',
        isOpen: true,
        message: 'Popup已打开'
      };
    }
    
  } catch (error) {
    console.error(`[background] 切换 Popup 失败，标签页: ${tabId}:`, error);
    
    // 分析具体错误类型
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    
    // 🔥 用户手势上下文错误处理
    if (errorMessage.includes('user gesture') || errorMessage.includes('user activation')) {
      console.error('[background] ❌ 用户手势上下文不足，无法打开Popup');
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
    console.log(`[background] 处理getPopupInitData请求，标签页ID: ${tabId}`);
    
    // 1. 获取标签页信息
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      console.warn(`[background] 无法获取标签页信息: ${tabId}`);
      return {
        type: 'popupInitDataResponse',
        popupContext: null
      };
    }
    
    // 2. 检查是否为YouTube页面
    const isYoutube = isYoutubeUrl(tab.url);
    if (!isYoutube) {
      console.log(`[background] 非YouTube页面: ${tab.url}`);
      return {
        type: 'popupInitDataResponse',
        popupContext: null
      };
    }
    
    // 3. 提取视频ID
    const videoId = extractVideoIdFromUrl(tab.url);
    if (!videoId) {
      console.warn(`[background] 无法提取视频ID: ${tab.url}`);
      return {
        type: 'popupInitDataResponse',
        popupContext: null
      };
    }
    
    // 4. 获取用户偏好设置
    const userPreferencesResult = await handleUserPreferencesGet({});
    const userPreferences = userPreferencesResult.success ? userPreferencesResult.data : {};
    
    // 5. 向Content Script请求字幕轨道数据
    let availableSourceLanguages = [];
    let detectedSourceLang = 'auto';
    
    try {
      console.log(`[background] 向Content Script请求字幕轨道数据...`);
      const trackResponse = await chrome.tabs.sendMessage(tabId, {
        type: 'getVideoTrackData',
        videoId
      });
      
      if (trackResponse && trackResponse.success && trackResponse.trackData) {
        availableSourceLanguages = trackResponse.trackData;
        console.log(`[background] 获取到${availableSourceLanguages.length}个字幕轨道`);
      } else {
        console.warn(`[background] 获取字幕轨道数据失败:`, trackResponse);
      }
    } catch (error) {
      console.error(`[background] 请求字幕轨道数据失败:`, error);
    }
    
    // 6. 构建PopupContext
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
    
    console.log(`[background] PopupContext已构建:`, popupContext);
    
    return {
      type: 'popupInitDataResponse',
      popupContext
    };
    
  } catch (error) {
    console.error(`[background] 处理getPopupInitData失败:`, error);
    return {
      type: 'popupInitDataResponse',
      popupContext: null,
      error: error instanceof Error ? error.message : '获取初始化数据失败'
    };
  }
}

/**
 * 🎯 处理Popup打开事件
 */
async function handlePopupOpened(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log(`[background] 处理popupOpened事件`);
    
    // 更新运行时状态（使用全局实例）
    await runtimeStateManager.setSettingPanelState(true);
    
    // 广播状态变化
    await broadcastSidePanelStateChange(true);
    
    return {
      success: true,
      message: 'Popup打开事件已处理'
    };
    
  } catch (error) {
    console.error(`[background] 处理popupOpened失败:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理Popup打开事件失败'
    };
  }
}

/**
 * 🎯 处理Popup关闭事件
 */
async function handlePopupClosed(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log(`[background] 处理popupClosed事件`);
    
    // 更新运行时状态（使用全局实例）
    await runtimeStateManager.setSettingPanelState(false);
    
    // 广播状态变化
    await broadcastSidePanelStateChange(false);
    
    return {
      success: true,
      message: 'Popup关闭事件已处理'
    };
    
  } catch (error) {
    console.error(`[background] 处理popupClosed失败:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理Popup关闭事件失败'
    };
  }
}

/**
 * 🎯 处理Popup失去焦点事件
 */
async function handlePopupBlurred(sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log(`[background] 处理popupBlurred事件`);
    
    // 对于失去焦点事件，我们只记录日志，不改变状态
    // 因为用户可能只是临时点击了其他地方，popup仍然可能是打开的
    
    return {
      success: true,
      message: 'Popup失去焦点事件已处理'
    };
    
  } catch (error) {
    console.error(`[background] 处理popupBlurred失败:`, error);
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
    console.warn('[background] toggleSidePanel 缺少有效的标签页信息');
    return {
      success: false,
      error: 'Invalid sender for toggling side panel'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  const source = data?.source || 'translation-button';
  
  console.log(`[background] 收到切换 SidePanel 请求，标签页: ${tabId}，来源: ${source}`);
  
  // 检查是否为YouTube页面
  if (!tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[background] 非YouTube页面不能操作SidePanel: ${tabUrl}`);
    return {
      success: false,
      error: '只有YouTube页面才能打开翻译设置面板',
      fallback: 'popup'
    };
  }
  
  try {
    // 🔥 关键修复：使用存储读取状态，避免重复API调用
    // 1. 首先从存储获取当前状态
    const isCurrentlyEnabled = await runtimeStateManager.getSettingPanelState();
    
    console.log(`[background] 当前SidePanel存储状态: enabled=${isCurrentlyEnabled}`);
    
    if (isCurrentlyEnabled) {
      // 当前已启用，执行关闭操作
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      console.log(`[background] ❌ SidePanel已关闭 (标签页: ${tabId})`);
      
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
      console.log(`[background] ✅ SidePanel已打开 (标签页: ${tabId})`);
      
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
    console.error(`[background] 切换 SidePanel 失败，标签页: ${tabId}:`, error);
    
    // 分析具体错误类型
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.warn(`[background] 错误详情: ${errorMessage}`);
    
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
  console.log(`[background] 🔄 降级到Popup，原因: ${reason}`);
  
  try {
    // 设置popup路径并立即打开
    chrome.action.setPopup({ popup: 'src/popup/popup.html' }, async () => {
      if (chrome.runtime.lastError) {
        console.error('[background] ❌ 设置popup路径失败:', chrome.runtime.lastError);
        return;
      }
      
      // 立即打开popup
      try {
        await chrome.action.openPopup();
        console.log('[background] ✅ Popup已打开');
      } catch (error) {
        console.error('[background] ❌ 打开popup失败:', error);
        console.log('[background] ⚠️ 请再次点击扩展图标打开设置');
      }
    });
  } catch (error) {
    console.error('[background] ❌ Popup降级处理失败:', error);
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
    console.log(`[background] 🧪 测试getContexts检测SidePanel状态，标签页: ${tabId}`);
    
    // 方法1：检测所有SidePanel上下文
    const allSidePanelContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL],
    });
    
    console.log(`[background] 🧪 所有SidePanel上下文数量: ${allSidePanelContexts.length}`);
    allSidePanelContexts.forEach((context, index) => {
      console.log(`[background] 🧪 SidePanel上下文 ${index}:`, {
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
    
    console.log(`[background] 🧪 标签页${tabId}的SidePanel上下文数量: ${tabSpecificContexts.length}`);
    
    // 方法3：对比getOptions结果
    const options = await chrome.sidePanel.getOptions({ tabId });
    console.log(`[background] 🧪 getOptions结果:`, {
      enabled: options.enabled,
      path: options.path
    });
    
    // 方法4：对比统一状态管理器
    const managerState = runtimeStateManager.getSettingPanelStateSync();
    console.log(`[background] 🧪 状态管理器状态: ${managerState}`);
    
    // 方法5：使用新的权威状态检测
    const authoritative = await getSidePanelState();
    console.log(`[background] 🧪 权威状态检测结果: ${authoritative}`);
    
    // 总结对比
    const isOpenByGetContexts = tabSpecificContexts.length > 0;
    const isEnabledByGetOptions = options.enabled ?? false;
    console.log(`[background] 🧪 状态对比总结:`, {
      'getContexts检测结果': isOpenByGetContexts ? '已打开' : '未打开',
      'getOptions检测结果': isEnabledByGetOptions ? '已启用' : '未启用',
      '状态管理器状态': managerState ? '已打开' : '未打开',
      '权威状态检测': authoritative ? '已打开' : '未打开',
      '一致性检查': isOpenByGetContexts === authoritative ? '✅一致' : '❌不一致'
    });
    
  } catch (error) {
    console.error(`[background] 🧪 测试getContexts时出错:`, error);
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
    console.warn(`[background] toggleSidePanelSync: 无效请求，标签页: ${tabId}`);
    return { success: false, fallback: 'popup', error: '只有YouTube页面才能打开翻译设置面板' };
  }

  console.log(`[background] 🚀 开始处理SidePanel切换（用户手势上下文保持），标签页: ${tabId}`);

  try {
    // 🎯 使用官方推荐的getContexts()方法检测SidePanel实际状态
    const sidePanelContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL],
      tabIds: [tabId]
    });
    
    const isActuallyOpen = sidePanelContexts.length > 0;
    console.log(`[background] ✅ getContexts()检测结果: ${isActuallyOpen ? '已打开' : '未打开'} (上下文数量: ${sidePanelContexts.length})`);
    
    // 🧪 保留测试函数进行对比
    testSidePanelStateWithGetContexts(tabId);

    if (isActuallyOpen) {
      // 当前打开 → 关闭
      console.log(`[background] 🎯 执行关闭操作...`);
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      console.log(`[background] ❌ SidePanel已关闭 (翻译按钮, 标签页: ${tabId})`);
      
      // 🔧 移除状态更新：统一由Port断开监听器处理
      // 原有的缓存清理已不需要（SidePanel已废弃）
      // setTimeout(() => {
      //   sidePanelController.clearStateCache(tabId);
      // }, 0);
      
      return { success: true, status: 'closed', message: 'SidePanel已关闭' };
      
    } else {
      // 当前关闭 → 打开
      console.log(`[background] 🎯 执行打开操作（保持用户手势上下文）...`);
      
      // 🔥 关键修复：在用户手势上下文中同步执行所有操作
      await chrome.sidePanel.setOptions({ 
        tabId, 
        path: 'src/sidepanel/sidepanel.html',
        enabled: true 
      });
      await chrome.sidePanel.open({ tabId }); // 🔥 必须在用户手势上下文中同步调用
      console.log(`[background] ✅ SidePanel已打开 (翻译按钮, 标签页: ${tabId})`);
      
      // 🔧 移除状态更新：统一由Port连接监听器处理
      // 原有的缓存清理已不需要（SidePanel已废弃）
      // setTimeout(() => {
      //   sidePanelController.clearStateCache(tabId);
      // }, 0);
      
      return { success: true, status: 'opened', message: 'SidePanel已打开' };
    }
    
  } catch (error) {
    console.error(`[background] SidePanel操作失败:`, error);
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
      // runtimeStateManager.setSettingPanelState(true).catch(console.warn); // ❌ 移除：由Port连接处理
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
    console.warn('[background] openSidePanel 缺少有效的标签页信息');
    return {
      success: false,
      status: 'error',
      error: 'Invalid sender for opening side panel'
    };
  }

  const tabId = sender.tab.id;
  const tabUrl = sender.tab.url;
  const source = message?.source || 'user-action';
  console.log(`[background] 收到为标签页 ${tabId} (${tabUrl}) 打开 SidePanel 的请求，来源: ${source}`);

  // 检查是否为YouTube页面
  if (!isYoutubeUrl(tabUrl)) {
    console.warn(`[background] 非YouTube页面不能打开SidePanel: ${tabUrl}`);
    return {
      success: false,
      status: 'error',
      message: '只有YouTube页面才能打开翻译设置面板',
      fallback: 'popup', // 建议降级到popup
      error: 'SidePanel only available on YouTube pages'
    };
  }

  try {
    console.log('[background] 设置sidepanel选项...');
    
    // 设置sidepanel选项（同步调用）- 官方推荐模式：只控制enabled状态
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: true
    });
    console.log(`[background] SidePanel已设置为启用 (标签页: ${tabId})`);
    
    // 🔥 关键修复：只在真正的用户操作时才调用sidePanel.open()
    if (source === 'user-action') {
      // 添加短暂延迟确保setOptions生效，然后打开sidepanel
      try {
        await chrome.sidePanel.open({ tabId });
        console.log(`[background] ✅ SidePanel 打开成功 (YouTube标签页: ${tabId})`);
      } catch (openError) {
        console.error(`[background] ❌ SidePanel 打开失败:`, openError);
        // 返回降级信息
        return {
          success: false,
          status: 'error',
          message: `SidePanel打开失败: ${openError instanceof Error ? openError.message : 'Unknown error'}`,
          fallback: 'popup'
        };
      }
    } else {
      console.log(`[background] 跨标签页同步操作，只设置enabled状态，不强制打开 (${source})`);
    }
    
    // 🔧 关键修复：只有非跨标签页同步时才更新全局状态，避免无限循环
    if (source !== 'cross-tab-sync') {
      // 🔧 优化：移除状态保存，由Port连接处理
      console.log(`[background] 状态保存将由Port连接处理，跳过重复保存`);
      // runtimeStateManager.setSettingPanelState(true).then(() => {
      //   console.log(`[background] ✅ session storage更新成功: settingPanelOpen=true`);
      // }).catch(error => {
      //   console.warn('[background] ❌ 更新运行时状态失败:', error);
      // });
      
      // 🔧 移除重复广播：此函数已被handleToggleSidePanelSync替代
      // handleToggleSidePanelSync已在第650行执行广播，避免重复
      // broadcastSidePanelStateChange(true); // ❌ 已移除重复广播
    } else {
      console.log('[background] 跨标签页同步操作，跳过全局状态更新');
    }
    
    return {
      success: true,
      status: 'success',
      message: 'SidePanel request processed successfully',
      opened: source === 'user-action' ? 'side_panel' : 'enabled_only'
    };
  } catch (error) {
    console.error(`[background] 处理 SidePanel 请求失败:`, error);
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
    console.warn('[background] closeSidePanel 缺少有效的标签页ID');
    return {
      success: false,
      error: 'Invalid sender for closing side panel'
    };
  }

  const tabId = sender.tab.id;
  console.log(`[background] 为标签页 ${tabId} 关闭 SidePanel`);

  try {
    // 方法1：设置为禁用状态
    await chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: false
    });
    console.log(`[background] SidePanel 成功关闭 (标签页: ${tabId})`);
    
    // 🔧 移除状态更新：统一由Port断开监听器处理
    // 职责分离：废弃处理器也不再负责状态管理
    
    return {
      success: true,
      status: 'success',
      message: 'SidePanel closed successfully'
    };
  } catch (error) {
    console.error(`[background] 关闭 SidePanel 失败:`, error);
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
    console.log('[background] 执行popup降级策略...');
    
    // 使用统一的降级函数
    await fallbackToPopup('消息请求降级');
    
    // 更新运行时状态
    await runtimeStateManager.setSettingPanelState(true);
    
    return {
      success: true,
      status: 'success',
      message: 'Popup fallback executed'
    };
    
  } catch (error) {
    console.error('[background] Popup降级处理异常:', error);
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
    console.error('[background] SidePanel 数据请求失败:', error);
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
      case 'settingPanelOpen':
        result = await runtimeStateManager.getSettingPanelState();
        break;
      default:
        throw new Error(`未知状态键: ${stateKey}`);
    }
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('[background] 获取运行时状态失败:', error);
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
      case 'settingPanelOpen':
        await runtimeStateManager.setSettingPanelState(value);
        break;
      default:
        throw new Error(`未知状态键: ${stateKey}`);
    }
    
    return {
      success: true,
      message: `状态 ${stateKey} 已更新`
    };
  } catch (error) {
    console.error('[background] 设置运行时状态失败:', error);
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
    console.error('[background] 获取所有运行时状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get all runtime state'
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
    console.error('[background] 获取用户偏好设置失败:', error);
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
    console.error('[background] 更新用户偏好设置失败:', error);
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
    console.log('[background] ⚠️ 管理器已初始化，跳过重复初始化');
    return;
  }

  try {
    console.log('[background] 开始初始化管理器...');
    
    // 按顺序初始化
    // StorageManager 不需要初始化，它在构造时自动设置
    await userPreferencesManager.initialize();
    await runtimeStateManager.initialize();
    
    // 设置状态变更监听器
    setupStateChangeListeners();
    
    // 标记为已初始化
    isInitialized = true;
    
    console.log('[background] ✅ 所有管理器初始化完成');
  } catch (error) {
    console.error('[background] ❌ 管理器初始化失败:', error);
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
    console.log('[background] 默认用户偏好将由 UserPreferencesManager 自动处理');
    
    // 🔧 修复：不要重复设置默认运行时状态
    // RuntimeStateManager 在初始化时已经处理了默认状态设置
    // 避免重复调用导致的状态转换冲突
    console.log('[background] 默认运行时状态将由 RuntimeStateManager 自动处理');
    
    // 🎯 新增：设置默认Popup禁用状态
    // 确保扩展安装时所有页面的popup都是禁用的，只有YouTube页面才会启用
    await chrome.action.setPopup({ popup: '' });
    await chrome.action.setIcon({
      path: {
        16: 'icons/icon16-disabled.png',
        48: 'icons/icon48-disabled.png'
      }
    });
    console.log('[background] ✅ 默认Popup状态已设置为禁用');
    
    console.log('[background] ✅ 默认设置已初始化');
  } catch (error) {
    console.error('[background] ❌ 设置默认设置失败:', error);
  }
}

/**
 * 处理扩展更新
 */
async function handleUpdate(previousVersion?: string): Promise<void> {
  try {
    console.log(`[background] 从版本 ${previousVersion} 更新到当前版本`);
    
    // 这里可以添加数据迁移逻辑
    // 例如：旧版本设置格式转换、清理过期缓存等
    
    console.log('[background] ✅ 更新处理完成');
  } catch (error) {
    console.error('[background] ❌ 更新处理失败:', error);
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
      console.log(`[background] 翻译状态变更: ${oldValue} -> ${newValue}`);
      // 可以在这里添加状态变更后的处理逻辑
    }
  );
  
  // 监听设置面板状态变更
  runtimeStateManager.addChangeListener(
    RuntimeStateChangeEvent.SETTING_PANEL_CHANGED,
    (newValue, oldValue) => {
      console.log(`[background] 设置面板状态变更: ${oldValue} -> ${newValue}`);
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
    console.error(`[background] 获取视频数据失败 (${videoId}):`, error);
    return null;
  }
}

// === 翻译相关处理器存根 ===
// 这些将在后续版本中实现

async function handleGetTranslationConfig(data: any): Promise<any> {
  console.warn('[background] handleGetTranslationConfig 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleCheckTranslationCache(data: any): Promise<any> {
  console.warn('[background] handleCheckTranslationCache 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleTranslateSubtitles(data: any): Promise<any> {
  console.warn('[background] handleTranslateSubtitles 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleSaveTranslationResult(data: any): Promise<any> {
  console.warn('[background] handleSaveTranslationResult 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleSaveTrackCache(data: any): Promise<any> {
  console.warn('[background] handleSaveTrackCache 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

async function handleGetTrackCache(data: any): Promise<any> {
  console.warn('[background] handleGetTrackCache 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
}

/**
 * 处理从 ContentScript 发送的字幕数据
 */
async function handleSubtitleData(data: any): Promise<any> {
  try {
    console.log('[background] 收到字幕数据:', {
      videoId: data.videoId,
      count: data.count,
      url: data.url
    });
    
    // 验证数据
    if (!data.videoId || !data.subtitles || !Array.isArray(data.subtitles)) {
      console.error('[background] 字幕数据格式无效');
      return { success: false, error: '字幕数据格式无效' };
    }
    
    // 存储到内存缓存（MemoryCache）
    // 注意：这里使用简单的全局变量存储，实际项目中应该使用更完善的缓存管理
    if (!global.subtitleCache) {
      global.subtitleCache = new Map();
    }
    
    global.subtitleCache.set(data.videoId, {
      subtitles: data.subtitles,
      url: data.url,
      timestamp: Date.now()
    });
    
    console.log('[background] ✅ 字幕数据已缓存，视频ID:', data.videoId);
    
    // TODO: 根据当前翻译设置，触发翻译流程
    // 这里可以调用 handleTranslateSubtitles 或其他翻译相关函数
    
    return {
      success: true,
      message: '字幕数据已接收并缓存',
      videoId: data.videoId,
      count: data.count
    };
    
  } catch (error) {
    console.error('[background] 处理字幕数据失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理字幕数据失败'
    };
  }
}

async function handleApiConnectionTest(data: any): Promise<any> {
  console.log('[background] 开始API连接测试:', data);
  
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
    console.error('[background] API连接测试失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '未知错误'
    };
  }
}

async function handleErrorReport(data: any): Promise<any> {
  try {
    console.log('[background] 错误报告:', data);
    return {
      success: true,
      message: 'Error report received'
    };
  } catch (error) {
    console.error('[background] 处理错误报告失败:', error);
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
  console.log(`[background] 📡 已广播SidePanel状态变化: ${isOpen} 到所有YouTube标签页`);
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
    console.log('[background] 收到SidePanel实际打开通知:', message);
    console.log('[background] ℹ️ 状态保存已由Port连接处理，此处仅记录日志');
    
    return {
      success: true,
      message: 'SidePanel open notification received (state handled by Port)'
    };
  } catch (error) {
    console.error('[background] 处理SidePanel打开通知失败:', error);
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
    console.log('[background] 收到SidePanel实际关闭通知:', message);
    
    // 🔥 更新状态缓存
    const tabId = message.tabId;
    console.log(`[background] 🔄 SidePanel已实际关闭: 标签页 ${tabId}`);
    
    // 确保运行时状态为关闭
    await runtimeStateManager.setSettingPanelState(false);
    console.log('[background] ✅ SidePanel状态已确认为关闭');
    
    // 🔧 生命周期事件：只负责内部状态同步，不广播
    // 广播由操作函数负责
    
    return {
      success: true,
      message: 'SidePanel close state confirmed'
    };
  } catch (error) {
    console.error('[background] 处理SidePanel关闭通知失败:', error);
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
      console.warn('[background] 无法获取标签页ID');
      return {
        success: false,
        error: '无法获取标签页ID'
      };
    }
    
    // 使用存储读取检查SidePanel状态，高性能方案
    try {
      const isEnabled = await runtimeStateManager.getSettingPanelState();
      
      console.log(`[background] 🎯 标签页 ${tabId} SidePanel存储状态: enabled=${isEnabled}`);
      
      return {
        success: true,
        isEnabled: isEnabled
      };
    } catch (error) {
      // 如果获取失败，假设未启用
      console.warn(`[background] 获取标签页 ${tabId} SidePanel存储状态失败:`, error);
      return {
        success: true,
        isEnabled: false
      };
    }
  } catch (error) {
    console.error('[background] 检查SidePanel状态失败:', error);
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
    const isEnabled = await runtimeStateManager.getSettingPanelState();
    
    console.log(`[background] getSidePanelStatus: enabled=${isEnabled}`);
    
    return {
      success: true,
      isEnabled: isEnabled
    };
  } catch (error) {
    console.error('[background] getSidePanelStatus失败:', error);
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
  console.log(`[background] 测试免费翻译服务: ${apiType}`);
  
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
    console.error(`[background] 免费翻译服务测试失败:`, error);
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
  console.log(`[background] 测试付费API服务: ${apiType}`);
  
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
    console.error(`[background] 付费API服务测试失败:`, error);
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
    console.log('[background] 测试Google翻译路径A...');
    pathATranslation = await testGoogleTranslatePathA(testText, sourceLang, targetLang);
    pathAResult = '成功✅';
  } catch (error) {
    console.error('[background] Google翻译路径A测试失败:', error);
    pathAResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 测试路径B: /translate_a/t
  try {
    console.log('[background] 测试Google翻译路径B...');
    pathBTranslation = await testGoogleTranslatePathB(testText, sourceLang, targetLang);
    pathBResult = '成功✅';
  } catch (error) {
    console.error('[background] Google翻译路径B测试失败:', error);
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
    console.log('[background] 测试微软翻译路径A...');
    pathATranslation = await testMicrosoftTranslatePathA(testText, sourceLang, targetLang);
    pathAResult = '成功✅';
  } catch (error) {
    console.error('[background] 微软翻译路径A测试失败:', error);
    pathAResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 测试路径B: API-Edge端点
  try {
    console.log('[background] 测试微软翻译路径B...');
    pathBTranslation = await testMicrosoftTranslatePathB(testText, sourceLang, targetLang);
    pathBResult = '成功✅';
  } catch (error) {
    console.error('[background] 微软翻译路径B测试失败:', error);
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
    console.error('[background] OpenAI测试失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'OpenAI测试失败'
    };
  }
}

// 🚀 新架构：依赖 onInstalled 和 onStartup 事件进行初始化
// 移除自执行函数，避免重复初始化
// 初始化由 chrome.runtime.onInstalled 和 chrome.runtime.onStartup 事件处理
