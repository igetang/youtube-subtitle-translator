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
import { sidePanelController, SidePanelSource } from './sidepanel-controller';

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
 * 🚀 新架构：禁用自动打开，使用统一的toggle控制
 * 基于 sidepanel-开关实现指南.md 的已验证方案
 */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error('[background] 设置SidePanel行为失败:', error));

/**
 * 🚀 步骤1：插件图标点击处理 - 基于 sidepanel-开关实现指南.md
 * 简洁实现：直接调用Chrome API，保持用户手势上下文
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !isYoutubeUrl(tab.url)) return;

  console.log(`[background] 插件图标点击，标签页: ${tab.id}`);

  try {
    // 🔥 关键：直接在用户手势上下文中调用
    const options = await chrome.sidePanel.getOptions({ tabId: tab.id });
    const isCurrentlyEnabled = options.enabled ?? false;
    
    console.log(`[background] 当前状态: enabled=${isCurrentlyEnabled}`);
    
    if (isCurrentlyEnabled) {
      // 关闭SidePanel
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
      sidePanelStateCache.set(tab.id, false); // 🔥 更新缓存
      console.log(`[background] ❌ SidePanel已关闭 (插件图标, 标签页: ${tab.id})`);
    } else {
      // 打开SidePanel
      await chrome.sidePanel.setOptions({ 
        tabId: tab.id, 
        path: 'src/sidepanel/sidepanel.html',
        enabled: true 
      });
      await chrome.sidePanel.open({ tabId: tab.id });
      sidePanelStateCache.set(tab.id, true); // 🔥 更新缓存
      console.log(`[background] ✅ SidePanel已打开 (插件图标, 标签页: ${tab.id})`);
    }
    
    // 🔧 优化：移除状态保存，由Port连接处理
    setTimeout(() => {
      // runtimeStateManager.setSettingPanelState(!isCurrentlyEnabled).catch(console.warn); // ❌ 移除：由Port连接处理
      sidePanelController.clearStateCache(tab.id!);
      // 🎯 操作函数负责广播：插件图标点击操作
      broadcastSidePanelStateChange(!isCurrentlyEnabled);
    }, 0);
    
  } catch (error) {
    console.error('[background] 插件图标点击失败:', error);
    
    // 失败时降级到popup
    try {
      await chrome.action.setPopup({ popup: 'src/popup/popup.html' });
      console.log('[background] SidePanel失败，已降级到popup');
    } catch (popupError) {
      console.error('[background] 设置popup降级失败:', popupError);
    }
  }
});

/**
 * 🚀 官方标准：监听标签页更新，实现站点特定的SidePanel管理
 * 基于Google官方示例，严格按照最佳实践实现
 */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  // 只在URL变化时处理，避免重复触发
  if (!tab.url || !info.url) return;
  
  try {
    const url = new URL(tab.url);
    
    if (YOUTUBE_ORIGINS.includes(url.origin)) {
      // YouTube页面：启用SidePanel
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'src/sidepanel/sidepanel.html',
        enabled: true
      });
      console.log(`[background] ✅ SidePanel已启用 (YouTube页面: ${tabId})`);
    } else {
      // 其他网站：禁用SidePanel
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
      console.log(`[background] ❌ SidePanel已禁用 (非YouTube页面: ${tabId})`);
    }
  } catch (error) {
    console.error(`[background] 更新SidePanel状态失败 (标签页: ${tabId}):`, error);
  }
});

/**
 * 🔧 向后兼容：保留现有的updateSidePanelForTab函数
 * @deprecated 请使用上面的tabs.onUpdated监听器
 */
async function updateSidePanelForTab(tabId: number, url: string): Promise<void> {
  try {
    if (isYoutubeUrl(url)) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'src/sidepanel/sidepanel.html',
        enabled: true
      });
      console.log(`[background] YouTube页面 ${tabId} 启用sidepanel`);
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
      console.log(`[background] 非YouTube页面 ${tabId} 禁用sidepanel`);
    }
  } catch (error) {
    console.error(`[background] 更新标签页 ${tabId} sidepanel状态失败:`, error);
  }
}

// === 极简Port方案：监听SidePanel生命周期 ===

/**
 * 🚀 优化后的Port监听器 - SidePanel生命周期的最可靠检测点
 * 🎯 Port连接 = SidePanel真正可用，在此处进行状态保存
 */
function setupPortListener(): void {
  chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name === 'sidepanel-lifecycle') {
      console.log('[background] 🔥 SidePanel Port连接建立 - 这是最可靠的打开检测点');
      
      try {
        // 🚀 优化：在Port连接建立时直接保存状态，这是最终的打开确认
        await runtimeStateManager.setSettingPanelState(true);
        console.log('[background] ✅ SidePanel状态已保存为打开（基于Port连接）');
        
        // 从SidePanel获取当前标签页ID用于缓存更新
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          sidePanelStateCache.set(tab.id, true);
          console.log(`[background] 🔄 更新状态缓存: 标签页 ${tab.id} → 已打开（基于Port连接）`);
        }
        
      } catch (error) {
        console.error('[background] Port连接建立时状态保存失败:', error);
      }
      
      port.onDisconnect.addListener(async () => {
        console.log('[background] 🔥 检测到SidePanel关闭（Port断开）');
        
        try {
          // 更新运行时状态
          await runtimeStateManager.setSettingPanelState(false);
          console.log('[background] ✅ SidePanel状态已更新为关闭');
          
          // 清理状态缓存
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            sidePanelStateCache.set(tab.id, false);
            console.log(`[background] 🔄 更新状态缓存: 标签页 ${tab.id} → 已关闭（基于Port断开）`);
          }
          
        } catch (error) {
          console.error('[background] 处理SidePanel关闭事件失败:', error);
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
 * 主消息监听器
 * 基于 architecture.md 3.4 按钮交互完整流程设计
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 🔥 关键修复：所有SidePanel相关操作都必须在消息监听器中直接处理，保持用户手势上下文
  if (message.type === 'toggleSidePanel') {
    console.log(`[background] 🚀 直接处理toggleSidePanel (用户手势保护), 来自: ${
      sender.tab ? `标签页ID ${sender.tab.id}` : '扩展内部'
    }`);
    
    // 直接调用同步处理函数，保持用户手势
    const result = handleToggleSidePanelSync(sender, message.data);
    sendResponse(result);
    return false; // 同步响应，不保持消息通道
  }

  // 🔥 特殊处理：openSidePanel需要保持用户手势上下文，立即执行
  if (message.type === 'openSidePanel') {
    const result = handleOpenSidePanelSync(sender, message.data);
    sendResponse(result);
    return false; // 同步响应，不保持消息通道
  }

  // 🔧 修复：只对未被直接处理的消息进行异步处理
  // 已经被直接处理的消息（toggleSidePanel, openSidePanel）不应该再次进入异步流程
  
  // 其他消息的日志和处理
  // 🔧 修复：跳过有专门日志的消息，避免重复记录
  const skipGeneralLog = ['sidePanelActuallyOpened', 'sidePanelActuallyClosed'];
  if (!skipGeneralLog.includes(message.type)) {
    console.log(`[background] 收到消息: type='${message.type}', 来自: ${
      sender.tab ? `标签页ID ${sender.tab.id} (${sender.tab.url})` : '扩展内部'
    }`, message);
  }

  // 其他消息使用异步处理
  handleMessage(message, sender, sendResponse)
    .catch(error => {
      console.error(`[background] 消息处理异常 (${message.type}):`, error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '消息处理异常'
      });
    });
  
  return true; // 异步响应 - 按照architecture.md规范
});

// 🔧 保留标签页切换监听器，但使用标准实现
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      console.log(`[background] 标签页切换到 ${activeInfo.tabId} (${tab.url})`);
      const url = new URL(tab.url);
      
      if (YOUTUBE_ORIGINS.includes(url.origin)) {
        await chrome.sidePanel.setOptions({
          tabId: activeInfo.tabId,
          path: 'src/sidepanel/sidepanel.html',
          enabled: true
        });
        console.log(`[background] ✅ 标签页切换 - SidePanel已启用`);
      } else {
        await chrome.sidePanel.setOptions({
          tabId: activeInfo.tabId,
          enabled: false
        });
        // 🔥 清理状态缓存
        sidePanelStateCache.delete(activeInfo.tabId);
        console.log(`[background] ❌ 标签页切换 - SidePanel已禁用`);
      }
    }
  } catch (error) {
    console.error(`[background] 标签页切换处理失败:`, error);
  }
});

/**
 * 🔧 监听标签页关闭，清理状态缓存
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  sidePanelStateCache.delete(tabId);
  console.log(`[background] 标签页 ${tabId} 已关闭，清理状态缓存`);
});



/**
 * 统一消息处理函数
 * 基于 architecture.md 3.4.5 统一数据管理消息接口
 */
async function handleMessage(
  message: any, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    const response = await routeMessage(message, sender);
    sendResponse(response);
  } catch (error) {
    console.error(`[background] 处理消息失败 (${message.type}):`, error);
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
    // === SidePanel 相关消息 ===
    // 🔧 移除重复处理：toggleSidePanel和openSidePanel已在主监听器中直接处理
    // case 'toggleSidePanel': // 已移除 - 在主监听器中直接处理
    // case 'openSidePanel': // 已移除 - 在主监听器中直接处理
    
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
 * 🚀 修复：处理 SidePanel 切换请求 - 回归Legacy模式
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
  const source = data?.source || SidePanelSource.TRANSLATION_BUTTON;
  
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
    // 🔥 关键修复：直接使用Chrome API，保持用户手势上下文
    // 1. 首先获取当前状态
    const options = await chrome.sidePanel.getOptions({ tabId });
    const isCurrentlyEnabled = options.enabled ?? false;
    
    console.log(`[background] 当前SidePanel状态: enabled=${isCurrentlyEnabled}`);
    
    if (isCurrentlyEnabled) {
      // 当前已启用，执行关闭操作
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      console.log(`[background] ❌ SidePanel已关闭 (标签页: ${tabId})`);
      
      // 异步更新状态，不影响用户手势
      setTimeout(() => {
        runtimeStateManager.setSettingPanelState(false).catch(console.warn);
        sidePanelController.clearStateCache(tabId);
        broadcastSidePanelStateChange(false);
      }, 0);
      
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
      
      // 异步更新状态，不影响用户手势
      setTimeout(() => {
        runtimeStateManager.setSettingPanelState(true).catch(console.warn);
        sidePanelController.clearStateCache(tabId);
        broadcastSidePanelStateChange(true);
      }, 0);
      
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

// 🎯 简单的状态缓存 - 避免异步状态检测破坏用户手势
const sidePanelStateCache = new Map<number, boolean>();

/**
 * 🚀 步骤2：同步处理翻译按钮切换 SidePanel - 基于 sidepanel-开关实现指南.md
 * 🔥 关键修复：使用本地状态缓存实现真正的 toggle 功能
 * 避免异步 getOptions() 破坏用户手势上下文
 */
function handleToggleSidePanelSync(sender: chrome.runtime.MessageSender, data?: any): any {
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  const source = data?.source || 'translation-button';
  
  if (!tabId || !tabUrl || !isYoutubeUrl(tabUrl)) {
    console.warn(`[background] toggleSidePanelSync: 无效请求，标签页: ${tabId}`);
    return { success: false, fallback: 'popup', error: '只有YouTube页面才能打开翻译设置面板' };
  }

  // 🔥 关键：使用本地缓存获取当前状态，避免异步调用
  const isCurrentlyOpen = sidePanelStateCache.get(tabId) ?? false;
  console.log(`[background] 翻译按钮切换，标签页: ${tabId}, 当前状态: ${isCurrentlyOpen ? '已打开' : '已关闭'}`);

  try {
    if (isCurrentlyOpen) {
      // 当前打开 → 关闭
      chrome.sidePanel.setOptions({ tabId, enabled: false });
      sidePanelStateCache.set(tabId, false);
      console.log(`[background] ❌ SidePanel已关闭 (翻译按钮, 标签页: ${tabId})`);
      
      // 异步状态同步
      setTimeout(() => {
        runtimeStateManager.setSettingPanelState(false).catch(console.warn);
        sidePanelController.clearStateCache(tabId);
        // 🎯 操作函数负责广播：翻译按钮切换操作（关闭）
        broadcastSidePanelStateChange(false);
      }, 0);
      
      return { 
        success: true, 
        status: 'closed',
        message: 'SidePanel已关闭'
      };
    } else {
      // 当前关闭 → 打开
      chrome.sidePanel.setOptions({ 
        tabId, 
        path: 'src/sidepanel/sidepanel.html',
        enabled: true 
      });
      chrome.sidePanel.open({ tabId }); // 🔥 在用户手势上下文中调用
      sidePanelStateCache.set(tabId, true);
      console.log(`[background] ✅ SidePanel已打开 (翻译按钮, 标签页: ${tabId})`);
      
      // 🔧 优化：移除状态保存，由Port连接处理
      setTimeout(() => {
        // runtimeStateManager.setSettingPanelState(true).catch(console.warn); // ❌ 移除：由Port连接处理
        sidePanelController.clearStateCache(tabId);
        // 🎯 操作函数负责广播：翻译按钮切换操作（打开）
        broadcastSidePanelStateChange(true);
      }, 0);
      
      return { 
        success: true, 
        status: 'opened',
        message: 'SidePanel已打开'
      };
    }
  } catch (error) {
    console.error(`[background] SidePanel操作失败:`, error);
    return { 
      success: false, 
      fallback: 'popup',
      error: error instanceof Error ? error.message : 'Failed to toggle'
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
    
    // 更新运行时状态
    await runtimeStateManager.setSettingPanelState(false);
    
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
    
    // 尝试通过action API打开popup
    if (chrome.action && chrome.action.openPopup) {
      try {
        await chrome.action.openPopup();
        console.log('[background] 成功通过chrome.action.openPopup打开popup');
        
        // 更新运行时状态
        await runtimeStateManager.setSettingPanelState(true);
        
        return {
          success: true,
          status: 'success',
          message: 'Popup opened successfully',
          method: 'action.openPopup'
        };
      } catch (popupError) {
        console.warn('[background] chrome.action.openPopup 失败:', popupError);
        // 继续尝试其他方法
      }
    }
    
    // 如果action.openPopup不可用或失败，返回失败
    // (在新架构中，popup会通过manifest的default_popup自动处理)
    console.log('[background] action.openPopup不可用，依赖manifest default_popup');
    return {
      success: false,
      status: 'error',
      message: 'Popup fallback methods not available',
      error: 'No popup fallback available'
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

async function handleApiConnectionTest(data: any): Promise<any> {
  console.warn('[background] handleApiConnectionTest 尚未实现');
  return { success: false, error: 'Function not implemented yet' };
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
          type: 'SIDEPANEL_STATE_CHANGED',
          isOpen
        }).catch(() => {
          // 忽略错误：标签页可能没有content script或已关闭
        });
      }
    });
  });
  console.log(`[background] 📡 已广播SidePanel状态变化: ${isOpen} 到所有YouTube标签页`);
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
    if (tabId) {
      sidePanelStateCache.set(tabId, false);
      console.log(`[background] 🔄 更新状态缓存: 标签页 ${tabId} → 已关闭`);
    }
    
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
    
    // 使用chrome.sidePanel.getOptions()检查当前标签页的SidePanel状态
    try {
      const options = await chrome.sidePanel.getOptions({ tabId });
      const isEnabled = options.enabled === true;
      
      console.log(`[background] 🎯 标签页 ${tabId} SidePanel状态: enabled=${isEnabled}, path=${options.path}`);
      
      return {
        success: true,
        isEnabled: isEnabled
      };
    } catch (error) {
      // 如果获取失败，假设未启用
      console.warn(`[background] 获取标签页 ${tabId} SidePanel状态失败:`, error);
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

// 🚀 新架构：依赖 onInstalled 和 onStartup 事件进行初始化
// 移除自执行函数，避免重复初始化
// 初始化由 chrome.runtime.onInstalled 和 chrome.runtime.onStartup 事件处理
