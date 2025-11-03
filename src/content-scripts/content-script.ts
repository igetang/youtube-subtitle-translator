/**
 * @file content-script.ts
 * @description YouTube字幕翻译助手 - 整合后的内容脚本
 * 整合了原content-script-new.ts和content-script-coordinator.ts的功能
 */

import { UIRenderer } from '@shared/components/ui-renderer';
import { StateManager } from '@shared/components/state-manager';
import { TranslateActiveState } from '@shared/types/runtime-state-types';
import { subtitleOverlay } from './subtitle-overlay';
import { StorageManager, StorageKeys } from '@shared/storage/storage-manager';
import { UserPreferencesManager } from '@shared/storage/user-preferences-manager';
import { UserPreferenceChangeEvent } from '@shared/types/user-preferences-types';
import { ERROR_MESSAGE_DURATION } from '@shared/constants';

// ==================== 初始化 ====================

// 注释掉开始日志
// console.log('[content-script] 🚀 开始初始化...', { 
//   url: window.location.href, 
//   readyState: document.readyState 
// });

// 全局组件实例
let uiRenderer: UIRenderer | null = null;
let stateManager: StateManager | null = null;
let isInitialized = false;
let lastPopupCloseTime = 0;
let capturedSourceLang: string | null = null; // 存储从service-worker传递的源语言

// API响应处理器Map
const apiResponseHandlers = new Map<string, (response: any) => void>();

type RefreshReason = 'initialize' | 'visibility' | 'videoChange' | 'manual';

// 视频切换相关变量
let currentVideoId: string | null = null;
let isNavigating = false;
let urlCheckInterval: number | null = null;

// 可见性监听防重复标记
let hasVisibilityChangeListener = false;

// 错误消息定时器（需要管理两个：外层和内层）
let errorMessageTimer: number | null = null;
let errorMessageHideTimer: number | null = null;

// 自动恢复翻译的去重标志位
let isAutoRestoring = false;


/**
 * 获取当前视频ID
 */
function getVideoId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

/**
 * 检查是否为YouTube视频页面
 */
function isYouTubeVideoPage(): boolean {
  // 更宽松的检测，只要是YouTube网站就初始化
  // 因为YouTube使用单页应用，可能需要在其他页面也初始化
  return window.location.hostname.includes('youtube.com');
}

// ==================== 主世界脚本注入 ====================

/**
 * 注入主世界脚本
 */
function injectMainWorldScript(): void {
  try {
    const scriptId = 'yt-translator-main-world-script';
    
    if (document.getElementById(scriptId)) {
      console.log('[content-script] 主世界脚本已注入');
      return;
    }
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('main-world.js');
    
    (document.head || document.documentElement).appendChild(script);
    // 注释掉中间层日志
    // console.log('[content-script] 已注入主世界脚本');
    
    script.onload = () => {
      // 注释掉中间层日志
      // console.log('[content-script] 主世界脚本加载完成');
    };
    
    script.onerror = (e) => {
      console.error('[content-script] 主世界脚本加载失败:', e);
    };
  } catch (error) {
    console.error('[content-script] 注入主世界脚本时出错:', error);
  }
}

// ==================== UI组件初始化 ====================

/**
 * 初始化UI组件
 */
async function initializeUIComponents(): Promise<void> {
  try {
    // 创建UI渲染器
    uiRenderer = new UIRenderer();
    uiRenderer.initialize({}, {});
    // 注释掉中间层日志
    // console.log('[content-script] UIRenderer初始化完成');

    // 创建状态管理器
    stateManager = new StateManager();
    stateManager.initialize({}, {});
    // 注释掉中间层日志
    // console.log('[content-script] StateManager初始化完成');
    
    // 设置组件间的回调引用
    if (uiRenderer) {
      uiRenderer.setCoordinator({
        handleUserAction: handleUserAction,
        isInitialized: () => isInitialized
      });
    }
    if (stateManager) {
      stateManager.setCoordinator({
        handleUserAction: handleUserAction,
        isInitialized: () => isInitialized
      });
    }
    
    // 注释掉中间层日志
    // console.log('[content-script] 组件初始化完成');
    
    // 检查并创建按钮
    await checkAndCreateButtons();
    
  } catch (error) {
    console.error('[content-script] 组件初始化失败:', error);
    throw error;
  }
}

/**
 * 检查并创建按钮
 */
async function checkAndCreateButtons(): Promise<void> {
  // 尝试立即创建
  const rightControls = document.querySelector('.ytp-right-controls');
  const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
  
  if (rightControls && autoplayButton) {
    // 注释掉中间层日志
    // console.log('[content-script] YouTube控制栏已就绪，创建按钮');
    const success = await uiRenderer?.createButtons();
    if (success) {
      // 删除重复日志，UIRenderer已经输出了“按钮创建完成”
      // console.log('[content-script] ✅ 按钮创建成功');
      return;
    }
  }
  
  // 如果立即创建失败，等待DOM变化
  console.log('[content-script] 等待YouTube控制栏加载...');
  
  let attempts = 0;
  const maxAttempts = 10;
  
  const checkInterval = setInterval(async () => {
    attempts++;
    
    const rightControls = document.querySelector('.ytp-right-controls');
    const autoplayButton = document.querySelector('.ytp-autonav-toggle-button');
    
    if (rightControls && autoplayButton) {
      // 注释掉中间层日志
      // console.log('[content-script] YouTube控制栏就绪，尝试创建按钮');
      const success = await uiRenderer?.createButtons();
      if (success) {
        // 删除重复日志，UIRenderer已经输出了“按钮创建完成”
        // console.log('[content-script] ✅ 按钮创建成功');
        clearInterval(checkInterval);
        return;
      }
    }
    
    if (attempts >= maxAttempts) {
      console.warn('[content-script] 达到最大尝试次数，停止检查');
      clearInterval(checkInterval);
    }
  }, 500); // 每500ms检查一次
}

/**
 * 设置标签页可见性监听器，保持全局状态同步
 */
function setupVisibilityChangeListener(): void {
  if (hasVisibilityChangeListener) {
    return;
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      console.log('[content-script] 标签页激活，刷新状态');
      try {
        await refreshStates({ forcePopupClosed: true, reason: 'visibility' });
        // 🆕 标签页激活后,自动恢复翻译状态
        await autoRestoreTranslationIfNeeded();
      } catch (error) {
        console.error('[content-script] 标签页激活刷新状态失败:', error);
      }
    }
  });

  hasVisibilityChangeListener = true;
  console.debug('[debug][content-script] 标签页可见性监听器已设置');
}

// ==================== 用户交互处理 ====================

/**
 * 处理用户行为事件
 */
function handleUserAction(action: string, data: any): void {
  if (action === 'buttonClick') {
    console.debug(`[debug][content-script] 按钮点击: ${data.buttonType}`);
  }

  switch (action) {
    case 'buttonClick':
      handleButtonClick(data);
      break;
    case 'stateChange':
      handleStateChange(data);
      break;
    case 'chromeMessage':
      handleChromeMessage(data);
      break;
    default:
      console.warn(`[content-script] 未知的用户行为: ${action}`);
  }
}

/**
 * 处理按钮点击
 */
function handleButtonClick(data: any): void {
  const { buttonType } = data;
  
  switch (buttonType) {
    case 'translate':
      toggleTranslation();
      break;
    case 'settings':
      togglePopup();
      break;
    default:
      console.warn(`[content-script] 未知的按钮类型: ${buttonType}`);
  }
}

/**
 * 处理状态变化
 */
function handleStateChange(data: any): void {
  const { key, value, updates } = data;

  // 处理批量更新（来自updateStates）
  if (updates) {
    // 🔥 不再在状态变更时清除字幕
    // 字幕清除由错误处理流程通过 CLEAR_SUBTITLE_OVERLAY 消息统一管理
    // 或者用户手动关闭时通过 hideTranslatedSubtitles() 处理
    if (uiRenderer) {
      uiRenderer.update(updates);
    }
  }
  // 处理单个更新（来自updateState）
  else if (key && value !== undefined) {
    // 🔥 不再在状态变更时清除字幕
    // 字幕清除由错误处理流程通过 CLEAR_SUBTITLE_OVERLAY 消息统一管理
    // 或者用户手动关闭时通过 hideTranslatedSubtitles() 处理
    if (uiRenderer) {
      uiRenderer.update({ [key]: value });
    }
  }
}

/**
 * 处理Chrome消息
 */
function handleChromeMessage(data: any): void {
  const { messageType, message } = data;
  console.debug(`[debug][content-script] 处理Chrome消息: ${messageType}`);
  
  switch (messageType) {
    case 'UPDATE_BUTTON_STATE':
      if (message.isOpen !== undefined && uiRenderer) {
        if (!message.isOpen) {
          lastPopupCloseTime = Date.now();
        }
        uiRenderer.update({ popupOpen: message.isOpen });
      }
      break;
  }
}

// ==================== 翻译功能 ====================

/**
 * 切换翻译状态
 */
async function toggleTranslation(): Promise<void> {
  // 竞态条件保护：导航期间忽略操作
  if (isNavigating) {
    console.log('[content-script] 导航中，忽略翻译切换操作');
    return;
  }

  const currentState = stateManager?.getState('translateActive') || TranslateActiveState.INACTIVE;

  let isEnabling = false;
  switch (currentState) {
    case TranslateActiveState.INACTIVE:
    case 'inactive':
      isEnabling = true;
      break;
    case TranslateActiveState.ACTIVE:
    case 'active':
      isEnabling = false;
      break;
    case TranslateActiveState.PENDING:
    case 'pending':
      console.log('[content-script] 忽略PENDING状态的点击');
      return;
  }
  
  const videoId = getVideoId();
  if (!videoId) {
    console.error('[content-script] 无法获取视频ID');
    return;
  }

  // 在任何操作之前，先记录字幕按钮的原始状态
  const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
  const originalSubtitleState = subtitleBtn?.getAttribute('aria-pressed') === 'true';
  console.debug(`[debug][content-script] 翻译开始前，字幕按钮原始状态: ${originalSubtitleState ? '开启' : '关闭'}`);

  // 立即设置为PENDING状态，提供即时反馈
  if (isEnabling) {
    stateManager?.updateState('translateActive', 'pending');
  }

  // 获取当前播放时间
  let currentTime = 0;
  const videoElement = document.querySelector('video');
  if (videoElement) {
    currentTime = videoElement.currentTime;
    console.debug(`[debug][content-script] 当前播放时间: ${currentTime}s`);
  }

  // 获取当前源语言轨道（包括kind）
  const sourceTrack = await getCurrentSourceTrack(videoId);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_TRANSLATE',
      data: {
        videoId: videoId,
        newState: isEnabling,
        currentTime: currentTime,  // 添加当前播放时间
        originalSubtitleState: originalSubtitleState,  // 传递原始状态
        sourceLang: sourceTrack?.languageCode,  // 传递源语言代码
        sourceKind: sourceTrack?.kind  // 传递源语言类型（asr/forced/undefined）
      }
    });
    
    console.log('[content-script] 翻译切换响应:', response);
    
    switch (response.action) {
      case 'cached':
      case 'translated':
        displayTranslatedSubtitles(response.data);
        break;
      case 'streamed':
        // V4架构：数据已通过TRANSLATION_UPDATE事件推送，无需额外处理
        console.log('[content-script] V4流式传输完成');
        break;
      case 'needFetch':
        // Service Worker会自动发送REQUEST_SUBTITLE_CAPTURE，不需要重复发送
        // 遵循单一消息源原则：Service Worker控制，Content Script只响应
        console.log('[content-script] Service Worker正在请求字幕捕获...');
        break;
      case 'stopped':
        hideTranslatedSubtitles();
        break;
    }
  } catch (error) {
    console.error('[content-script] 翻译切换失败:', error);
    stateManager?.updateState('translateActive', 'inactive');
  }
}

/**
 * 请求字幕捕获（带超时保护）
 */
function requestSubtitleCapture(): void {
  console.debug('[debug][content-script] 发送字幕捕获请求到main-world...');
  window.postMessage({
    source: 'content-script',
    type: 'REQUEST_SUBTITLE_CAPTURE'
  }, '*');

  // 设置6秒超时（比拦截器内部的5秒稍长，确保能收到超时消息）
  setTimeout(() => {
    // 发送销毁消息（兜底保护）
    console.debug('[debug][content-script] 字幕捕获6秒超时，强制销毁拦截器');
    window.postMessage({
      source: 'content-script',
      type: 'DESTROY_SUBTITLE_INTERCEPTOR'
    }, '*');
  }, 6000);
}

/**
 * 显示翻译后的字幕
 */
async function displayTranslatedSubtitles(data: any): Promise<void> {
  // 移除冗余日志，show方法内部会打印
  await subtitleOverlay.show(data);
  // 状态更新由Background通过STATE_CHANGED消息统一管理，避免重复更新
  // stateManager?.updateState('translateActive', 'active');
}

/**
 * 隐藏翻译字幕
 */
function hideTranslatedSubtitles(): void {
  console.debug('[debug][content-script] 隐藏翻译字幕');
  subtitleOverlay.hide();
  // 状态更新由Background通过STATE_CHANGED消息统一管理，避免重复更新
  // stateManager?.updateState('translateActive', 'inactive');
}

// ==================== 翻译状态自动恢复 ====================

/**
 * 等待YouTube播放器准备就绪
 * @param timeout 超时时间（毫秒），默认10秒
 * @returns 是否准备就绪
 */
async function waitForYouTubePlayer(timeout: number = 10000): Promise<boolean> {
  // 检查播放器是否已经存在
  const existingPlayer = document.querySelector('.html5-video-player');
  if (existingPlayer) {
    console.log('[content-script] YouTube播放器已就绪（立即检测）');
    return true;
  }

  // 轮询检测
  const maxAttempts = Math.floor(timeout / 500);  // 默认20次（10秒）
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));

    const player = document.querySelector('.html5-video-player');
    if (player) {
      console.log(`[content-script] YouTube播放器已就绪（轮询第${i + 1}次）`);
      return true;
    }
  }

  console.error('[content-script] YouTube播放器未就绪，轮询超时');
  return false;
}

/**
 * 自动恢复翻译状态（如果需要）
 *
 * 使用场景：
 * 1. 页面初始化时（initialize()）
 * 2. 视频切换后（handleVideoChange()）
 * 3. 标签页激活时（visibilitychange）
 *
 * 工作流程：
 * 1. 检查去重标志，防止并发调用
 * 2. 等待YouTube播放器准备就绪
 * 3. 读取session中的translateActive状态
 * 4. 如果状态为'active'，自动触发翻译
 *
 * @param forceRestore 强制恢复(用于视频切换场景,此时状态已被重置但需要恢复)
 */
async function autoRestoreTranslationIfNeeded(forceRestore: boolean = false): Promise<void> {
  // === 步骤1：去重检查 ===
  if (isAutoRestoring) {
    console.log('[content-script] 正在自动恢复翻译，跳过重复调用');
    return;
  }

  if (!isInitialized) {
    console.log('[content-script] Content Script 未初始化完成，跳过自动恢复');
    return;
  }

  isAutoRestoring = true;

  try {
    // === 步骤2：等待YouTube播放器准备就绪 ===
    const playerReady = await waitForYouTubePlayer();
    if (!playerReady) {
      console.log('[content-script] YouTube播放器未就绪，跳过自动恢复');
      return;
    }

    // === 步骤3：读取session状态 ===
    // 优先从本地StateManager读取(状态最新),如果不存在则从RuntimeStateManager读取
    let translateActive: string;
    if (stateManager) {
      translateActive = stateManager.getTranslateState();
      console.log('[content-script] 检查翻译状态(StateManager):', translateActive, '| 强制恢复:', forceRestore);
    } else {
      // 降级方案: 从RuntimeStateManager读取
      const RuntimeStateManager = (await import('@shared/storage/runtime-state-manager')).RuntimeStateManager;
      const runtimeStateManager = RuntimeStateManager.getInstance();
      translateActive = await runtimeStateManager.getTranslateState();
      console.log('[content-script] 检查翻译状态(RuntimeStateManager):', translateActive, '| 强制恢复:', forceRestore);
    }

    // === 步骤4：判断是否需要恢复 ===
    if (!forceRestore && translateActive !== TranslateActiveState.ACTIVE) {
      console.log('[content-script] 翻译状态非active，无需恢复');
      return;
    }

    // === 步骤5：检查videoId ===
    const videoId = getVideoId();
    if (!videoId) {
      console.log('[content-script] 无法获取videoId，跳过自动恢复');
      return;
    }

    // === 步骤6：延迟执行，确保播放器完全加载 ===
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('[content-script] 🔄 自动恢复翻译:', videoId);

    // === 步骤7：设置状态为PENDING（符合状态机规范：ACTIVE → PENDING）===
    if (stateManager) {
      await stateManager.updateState('translateActive', TranslateActiveState.PENDING);
    }

    // === 步骤8：显示"翻译中"提示（无超时，依赖Service Worker错误处理）===
    subtitleOverlay.showPendingMessage('正在恢复翻译...', 0);

    // === 步骤9：直接发送翻译消息到Service Worker ===
    const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
    const originalSubtitleState = subtitleBtn?.getAttribute('aria-pressed') === 'true';

    const videoElement = document.querySelector('video');
    const currentTime = videoElement ? videoElement.currentTime : 0;

    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_TRANSLATE',
      data: {
        videoId,
        newState: true,  // 开启翻译
        currentTime,
        originalSubtitleState
      }
    });

    // === 步骤10：根据响应更新状态 ===
    if (response?.success) {
      console.log('[content-script] ✅ 自动恢复翻译完成');
      // Service Worker会设置状态为ACTIVE并通过消息通知更新UI
      // 这里不需要手动设置状态
    } else {
      console.error('[content-script] ❌ 自动恢复翻译失败:', response?.error);
      if (stateManager) {
        await stateManager.updateState('translateActive', TranslateActiveState.INACTIVE);
      }
      subtitleOverlay.hide();
    }

  } catch (error) {
    console.error('[content-script] ❌ 自动恢复翻译失败:', error);

    // 失败时重置状态为INACTIVE
    if (stateManager) {
      await stateManager.updateState('translateActive', TranslateActiveState.INACTIVE);
    }
    subtitleOverlay.hide();

  } finally {
    isAutoRestoring = false;
  }
}

function resetTranslateState(reason: RefreshReason): void {
  console.log(`[content-script] 重置翻译状态为未激活（reason=${reason}）`);
  capturedSourceLang = null;
  hideTranslatedSubtitles();
  window.postMessage({
    source: 'content-script',
    type: 'DESTROY_SUBTITLE_INTERCEPTOR'
  }, '*');
}

// ==================== Popup管理 ====================

/**
 * 切换Popup状态
 */
async function togglePopup(): Promise<void> {
  try {
    const stateResponse = await chrome.runtime.sendMessage({
      type: 'getPopupState'
    });
    
    const currentState = stateResponse.isOpen;

    if (currentState) {
      console.debug('[debug][content-script] Popup已打开，将由Chrome自动关闭');
      return;
    }

    // 防抖检查
    if (lastPopupCloseTime > 0) {
      const timeSinceClose = Date.now() - lastPopupCloseTime;
      if (timeSinceClose < 300) {
        console.debug('[debug][content-script] 刚刚关闭popup，不执行打开操作');
        return;
      }
    }

    const openResponse = await chrome.runtime.sendMessage({
      type: 'openPopup',
      data: { source: 'settings-button' },
      timestamp: Date.now()
    });

    if (openResponse && openResponse.success) {
      console.debug('[debug][content-script] ✓ openPopup: 成功');
      if (uiRenderer) {
        uiRenderer.update({ popupOpen: true });
      }
    }
  } catch (error) {
    console.error('[content-script] ✗ togglePopup:', error);
  }
}

// ==================== 消息处理 ====================

/**
 * 设置消息处理器
 */
function setupMessageHandlers(): void {
  // 监听来自Service Worker的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;

    const messageType = message.type;

    // 处理REQUEST_SUBTITLE_CAPTURE消息（旧路径，保留兼容）
    if (messageType === 'REQUEST_SUBTITLE_CAPTURE') {
      console.debug(`[debug][content-script] 收到Chrome消息: ${messageType}`);
      // 保存源语言信息
      if (message.data?.sourceLang) {
        capturedSourceLang = message.data.sourceLang;
        console.debug(`[debug][content-script] 保存源语言: ${capturedSourceLang}, kind: ${message.data.sourceKind || '未指定'}`);
      }

      // 优先使用传递的状态，没有则读取当前状态（兼容旧代码）
      let originalSubtitleState = message.data?.originalSubtitleState;
      if (originalSubtitleState === undefined) {
        const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
        originalSubtitleState = subtitleBtn?.getAttribute('aria-pressed') === 'true';
        console.debug(`[debug][content-script] (兼容模式)读取字幕按钮当前状态: ${originalSubtitleState ? '开启' : '关闭'}`);
      } else {
        console.debug(`[debug][content-script] 使用传递的字幕按钮原始状态: ${originalSubtitleState ? '开启' : '关闭'}`);
      }

      window.postMessage({
        source: 'content-script',
        type: 'REQUEST_SUBTITLE_CAPTURE',
        videoId: message.data?.videoId || getVideoId(),
        sourceLang: message.data?.sourceLang, // 传递给main-world
        sourceKind: message.data?.sourceKind,  // 传递字幕类型
        originalSubtitleState: originalSubtitleState  // 传递原始状态
      }, '*');
      sendResponse({ success: true });
      return false;
    }
    
    // 处理DISPLAY_TRANSLATION消息
    if (messageType === 'DISPLAY_TRANSLATION') {
      console.log('[content-script] 🎯🎯🎯 收到最终翻译结果消息，准备显示字幕 🎯🎯🎯');
      displayTranslatedSubtitles(message.data);
      sendResponse({ success: true });
      return false;
    }
    
    // 处理SHOW_ERROR_MESSAGE消息（3状态系统错误提示）
    if (messageType === 'SHOW_ERROR_MESSAGE') {
      console.log('[content-script] 收到错误消息:', message.data);
      showErrorMessage(message.data);
      sendResponse({ success: true });
      return false;
    }

    // 处理SHOW_WARNING_MESSAGE消息
    if (messageType === 'SHOW_WARNING_MESSAGE') {
      console.log('[content-script] 收到警告消息:', message.data);
      showErrorMessage(message.data);  // 复用错误显示逻辑，level字段会控制样式
      sendResponse({ success: true });
      return false;
    }

    // 处理CLEAR_ERROR_MESSAGE消息
    if (messageType === 'CLEAR_ERROR_MESSAGE') {
      console.debug('[debug][content-script] 清除错误消息');
      clearErrorMessage();
      sendResponse({ success: true });
      return false;
    }

    // 处理CLEAR_SUBTITLE_OVERLAY消息（错误发生时清除字幕）
    if (messageType === 'CLEAR_SUBTITLE_OVERLAY') {
      console.debug('[debug][content-script] 清除字幕显示');
      subtitleOverlay.hide();
      sendResponse({ success: true });
      return false;
    }
    
    // 处理渐进式翻译更新消息
    if (messageType === 'TRANSLATION_UPDATE') {
      if (subtitleOverlay && message.data) {
        const { updateType, translatedSubtitles, batchIndex, totalBatches } = message.data;

        if (updateType === 'urgent') {
          // 紧急翻译：立即替换显示
          console.log(`[content-script] 🚀 收到紧急翻译(${translatedSubtitles?.length || 0}条)，立即显示`);
          subtitleOverlay.updateTranslations(translatedSubtitles, true);
        } else if (updateType === 'progressive') {
          // 批量翻译：完全覆盖紧急翻译
          if (batchIndex && totalBatches) {
            console.log(`[content-script] ✅ 收到批次翻译 ${batchIndex}/${totalBatches} (${translatedSubtitles?.length || 0}条)`);
          } else {
            console.log(`[content-script] ✅ 收到批量翻译(${translatedSubtitles?.length || 0}条)，完全覆盖`);
          }

          // 调试：检查接收到的批量翻译数据的isUrgent标记
          const urgentIncoming = translatedSubtitles?.filter((s: any) => s.isUrgent === true).length || 0;
          if (urgentIncoming > 0) {
            console.warn(`[content-script] ⚠️ 接收到的批量翻译中有 ${urgentIncoming}/${translatedSubtitles?.length || 0} 条标记为紧急！前3条:`,
              translatedSubtitles?.slice(0, 3).map((s: any) => ({ start: s.start, isUrgent: s.isUrgent })));
          }

          // 批量翻译也使用完全覆盖模式
          subtitleOverlay.updateTranslations(translatedSubtitles, true);
        } else {
          console.log(`[content-script] 收到翻译更新: ${updateType}`);
          subtitleOverlay.updateTranslations(translatedSubtitles, false);
        }
      }
      sendResponse({ success: true });
      return false;
    }
    
    // 处理翻译完成消息
    if (messageType === 'TRANSLATION_COMPLETE') {
      console.log('[content-script] 翻译全部完成');
      if (message.data) {
        console.debug(`[debug][content-script] 总计翻译: ${message.data.totalSubtitles} 条字幕`);
      }
      sendResponse({ success: true });
      return false;
    }
    
    // 处理STATE_CHANGED消息 - 状态变更通知
    if (messageType === 'STATE_CHANGED') {
      console.log('[content-script] 收到状态变更通知:', message.data);
      if (message.data && message.data.stateKey === 'translateActive') {
        // 更新UI状态
        if (stateManager) {
          stateManager.updateState('translateActive', message.data.value);
        }
      }
      sendResponse({ success: true });
      return false;
    }
    
    // 处理TRIGGER_SUBTITLE_LOAD消息 - 触发字幕加载
    if (messageType === 'TRIGGER_SUBTITLE_LOAD') {
      console.log('[content-script] 收到触发字幕加载请求');

      // ✅ 提取 sourceLanguageCode, sourceLanguageName, sourceKind 和 originalSubtitleState 参数
      const { sourceLanguageCode, sourceLanguageName, sourceKind, originalSubtitleState } = message;
      console.debug(`[debug][content-script] 收到源语言: ${sourceLanguageName} [${sourceLanguageCode}], 字幕类型: ${sourceKind}`);

      // ✅ 保存源语言name到capturedSourceLang（用于后续SUBTITLE_DATA消息）
      if (sourceLanguageName) {
        capturedSourceLang = sourceLanguageName;
        console.debug(`[debug][content-script] 保存源语言name: ${capturedSourceLang}`);
      }

      // 使用传递过来的原始状态，而不是重新读取
      if (originalSubtitleState !== undefined) {
        console.debug(`[debug][content-script] 使用传递的字幕按钮原始状态: ${originalSubtitleState ? '开启' : '关闭'}`);
      } else {
        // 兜底：如果没有传递状态，才读取当前状态
        const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
        const currentState = subtitleBtn?.getAttribute('aria-pressed') === 'true';
        console.debug(`[debug][content-script] 未传递原始状态，读取当前状态: ${currentState ? '开启' : '关闭'}`);
      }

      // 通知main-world开始捕获字幕，传递参数
      window.postMessage({
        source: 'content-script',
        type: 'REQUEST_SUBTITLE_CAPTURE',
        sourceLanguageCode: sourceLanguageCode,  // ✅ 传递code（保留，暂时未使用）
        sourceLanguageName: sourceLanguageName,  // ✅ 传递name
        sourceKind: sourceKind,
        originalSubtitleState: originalSubtitleState  // 传递原始状态
      }, '*');

      console.debug('[debug][content-script] 已发送字幕捕获请求到main-world（包含源语言参数）');
      sendResponse({ success: true });
      return false;
    }
    
    // 处理getVideoTrackData消息
    if (messageType === 'getVideoTrackData') {
      console.debug(`[debug][content-script] 收到Chrome消息: ${messageType}`);
      handleGetVideoTrackData(message.videoId, sendResponse);
      return true; // 异步响应
    }

    // 处理通过Player API获取字幕轨道
    if (messageType === 'getSubtitleTracksAPI') {
      console.debug(`[debug][content-script] 收到Chrome消息: ${messageType}`);
      handleGetSubtitleTracksAPI(sendResponse);
      return true; // 异步响应
    }

    // 处理通过Player API设置字幕语言（ISO 639-1）
    if (messageType === 'setSubtitleTrackAPI') {
      // 🔍 追踪当前videoId
      const currentVideoId = getVideoId();
      console.log(`[content-script] 🔍 setSubtitleTrackAPI - 当前videoId: ${currentVideoId}, langCode: ${message.langCode}, kind: ${message.kind}`);
      console.debug(`[debug][content-script] 收到Chrome消息: ${messageType}, langCode: ${message.langCode}` +
                  (message.kind ? `, kind: ${message.kind}` : ''));
      handleSetSubtitleTrackAPI(message.langCode, message.kind, sendResponse);
      return true; // 异步响应
    }
    
    // 转发其他消息给UI组件（这些消息会在handleChromeMessage中打印日志，这里不再重复打印）
    if (uiRenderer || stateManager) {
      handleUserAction('chromeMessage', {
        messageType,
        message,
        sender,
        timestamp: Date.now()
      });
    }
    
    return false;
  });
  
  // 监听来自main-world的消息
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || !event.data) return;
    
    const { source, type, payload, _requestId } = event.data;
    
    // 处理来自main-world的字幕数据
    if (source === 'main-world' && type === 'SUBTITLE_CAPTURED') {
      console.log('[content-script] 收到字幕数据:', payload.count, '条');
      handleSubtitleCaptured(payload);
    }

    // 处理拦截器销毁确认
    if (source === 'main-world' && type === 'INTERCEPTOR_DESTROYED') {
      console.log('[content-script] ✅ 拦截器已销毁');
    }

    // 处理拦截器初始化失败
    if (source === 'main-world' && type === 'INTERCEPTOR_INIT_FAILED') {
      console.error('[content-script] ❌ 拦截器初始化失败:', payload);
      showErrorMessage({
        message: '字幕获取失败：拦截器初始化错误',
        level: 'error',
        duration: 3000
      });
    }

    // 处理拦截器超时
    if (source === 'main-world' && type === 'INTERCEPTOR_TIMEOUT') {
      console.warn('[content-script] ⏱️ 拦截器超时自动销毁:', payload);
      showErrorMessage({
        message: '字幕获取超时',
        level: 'warning',
        duration: 3000
      });
    }

    // 处理来自main-world的API响应
    if (source === 'main-world') {
      // 字幕轨道API响应
      if (type === 'SUBTITLE_TRACKS_API_RESPONSE' && _requestId) {
        const handler = apiResponseHandlers.get(_requestId);
        if (handler) {
          handler(payload);
          apiResponseHandlers.delete(_requestId);
        }
      }
      
      // 设置字幕语言API响应
      if (type === 'SET_SUBTITLE_TRACK_API_RESPONSE' && _requestId) {
        const handler = apiResponseHandlers.get(_requestId);
        if (handler) {
          handler(payload);
          apiResponseHandlers.delete(_requestId);
        }
      }
    }
  });
}

// handleGetSubtitleData函数已被移除
// 原因：方法1（主动API调用）频繁失败，已迁移到方法2（字幕拦截器）
// 详见：/docs/guides/decision-log.md #23

/**
 * 处理通过Player API获取字幕轨道
 */
function handleGetSubtitleTracksAPI(sendResponse: (response: any) => void): void {
  // 🔍 追踪当前videoId
  const currentVideoId = getVideoId();
  console.log(`[content-script] 🔍 handleGetSubtitleTracksAPI - 当前videoId: ${currentVideoId}`);
  console.debug('[debug][content-script] 开始通过API获取字幕轨道');

  const requestId = `api_tracks_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const requestVideoId = currentVideoId;

  const timeout = setTimeout(() => {
    apiResponseHandlers.delete(requestId);
    console.warn(`[content-script] getSubtitleTracksAPI 超时，requestId: ${requestId}, videoId: ${requestVideoId}`);
    sendResponse({
      success: false,
      error: 'API获取字幕轨道超时',
      requestId,
      videoId: requestVideoId ?? undefined
    });
  }, 5000);
  
  // 设置响应处理器
  apiResponseHandlers.set(requestId, (response) => {
    clearTimeout(timeout);
    apiResponseHandlers.delete(requestId);

    const latestVideoId = getVideoId();
    if (latestVideoId !== requestVideoId) {
      console.warn('[content-script] 忽略过期的轨道响应', {
        requestId,
        expectedVideoId: requestVideoId,
        latestVideoId
      });
      sendResponse({
        success: false,
        error: 'video_changed',
        reason: 'video_changed',
        requestId,
        videoId: latestVideoId ?? undefined
      });
      return;
    }

    sendResponse({
      ...response,
      requestId,
      videoId: requestVideoId ?? undefined
    });
  });
  
  // 发送消息到main-world
  window.postMessage({
    source: 'content-script',
    type: 'GET_SUBTITLE_TRACKS_API',
    videoId: requestVideoId,
    _requestId: requestId
  }, '*');
}

/**
 * 设置字幕语言API（Promise版本，供内部调用）
 * @param langCode 语言代码（ISO 639-1标准）
 * @param kind 字幕类型（如 'asr'）
 * @returns Promise，包含成功状态和错误信息
 */
async function setSubtitleTrackAPI(
  langCode: string,
  kind: string | undefined
): Promise<{
  success: boolean;
  error?: string;
  langCode?: string;
  kind?: string;
  requestId?: string;
  videoId?: string;
  reason?: string;
}> {
  console.debug(`[debug][content-script] 通过API设置字幕语言: ${langCode}` + (kind ? ` (${kind})` : ''));

  return new Promise((resolve) => {
    const requestId = `api_set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const requestVideoId = getVideoId();

    const timeout = setTimeout(() => {
      apiResponseHandlers.delete(requestId);
      console.warn(`[content-script] setSubtitleTrackAPI 超时，requestId: ${requestId}, videoId: ${requestVideoId}`);
      resolve({
        success: false,
        error: 'API设置字幕语言超时',
        requestId,
        videoId: requestVideoId ?? undefined
      });
    }, 5000);

    // 设置响应处理器
    apiResponseHandlers.set(requestId, (response) => {
      clearTimeout(timeout);
      apiResponseHandlers.delete(requestId);

      const latestVideoId = getVideoId();
      if (latestVideoId !== requestVideoId) {
        console.warn('[content-script] 忽略过期的字幕轨道设置响应', {
          requestId,
          expectedVideoId: requestVideoId,
          latestVideoId
        });
        resolve({
          success: false,
          error: 'video_changed',
          reason: 'video_changed',
          requestId,
          videoId: latestVideoId ?? undefined
        });
        return;
      }

      resolve({
        ...response,
        requestId,
        videoId: requestVideoId ?? undefined
      });
    });

    // 发送消息到main-world
    window.postMessage({
      source: 'content-script',
      type: 'SET_SUBTITLE_TRACK_API',
      langCode: langCode,  // ISO 639-1语言代码
      kind: kind,           // 字幕类型（如 asr）
      videoId: requestVideoId,
      _requestId: requestId
    }, '*');
  });
}

/**
 * 处理通过Player API设置字幕语言（Chrome消息处理器）
 * @param langCode 语言代码（ISO 639-1标准）
 * @param kind 字幕类型（如 'asr'）
 * @param sendResponse Chrome消息响应回调
 */
function handleSetSubtitleTrackAPI(
  langCode: string,
  kind: string | undefined,
  sendResponse: (response: any) => void
): void {
  setSubtitleTrackAPI(langCode, kind).then(sendResponse);
}

/**
 * 处理获取视频轨道数据
 */
function handleGetVideoTrackData(videoId: string, sendResponse: (response: any) => void): void {
  console.debug(`[debug][content-script] 开始获取视频轨道数据，videoId: ${videoId}`);

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const timeout = setTimeout(() => {
    window.removeEventListener('message', responseHandler);
    console.warn(`[content-script] 获取轨道数据超时`);
    sendResponse({ 
      success: false, 
      error: '获取轨道数据超时',
      tracks: []
    });
  }, 5000);
  
  function responseHandler(event: MessageEvent) {
    if (event.source !== window || !event.data) return;
    
    const { source, type, payload, _requestId } = event.data;
    
    if (source === 'main-world' && 
        type === 'CAPTION_TRACKS_RESPONSE' && 
        _requestId === requestId) {
      
      clearTimeout(timeout);
      window.removeEventListener('message', responseHandler);

      if (payload && payload.captionTracks) {
        console.debug(`[debug][content-script] 收到轨道数据，共 ${payload.captionTracks.length} 条`);

        // 转换YouTube原始格式为简化格式
        const simplifiedTracks = payload.captionTracks.map((track: any) => {
          const rawKind = track.kind;
          const normalizedKind = rawKind === 'asr' || rawKind === 'forced' ? rawKind : undefined;
          return {
            languageCode: track.languageCode,
            name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode,
            vssId: track.vssId,
            kind: normalizedKind,
            isTranslatable: track.isTranslatable !== false
          };
        });
        
        sendResponse({
          success: true,
          tracks: simplifiedTracks,
          videoId: videoId
        });
      } else if (event.data.error) {
        console.error(`[content-script] 获取轨道数据失败:`, event.data.error);
        sendResponse({
          success: false,
          error: event.data.error,
          tracks: []
        });
      } else {
        sendResponse({
          success: true,
          tracks: [],
          videoId: videoId
        });
      }
    }
  }
  
  window.addEventListener('message', responseHandler);
  
  window.postMessage({
    source: 'content-script',
    type: 'REQUEST_CAPTION_TRACKS',
    videoId: videoId,
    _requestId: requestId
  }, '*');
}

/**
 * 处理捕获到的字幕数据
 */
function handleSubtitleCaptured(payload: any): void {
  console.log('[content-script] 处理字幕数据，共', payload.count, '条');

  // 🔧 立即销毁拦截器，不管成功失败
  console.log('[content-script] 字幕捕获完成，立即销毁拦截器');
  window.postMessage({
    source: 'content-script',
    type: 'DESTROY_SUBTITLE_INTERCEPTOR'
  }, '*');

  // TODO: 暂停恢复字幕按钮状态，便于观察轨道切换流程
  // if (payload.needsRestore && payload.originalSubtitleState === false) {
  //   console.log('[content-script] 检测到需要恢复字幕按钮状态为关闭');
  //   setTimeout(() => {
  //     const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
  //     if (subtitleBtn && subtitleBtn.getAttribute('aria-pressed') === 'true') {
  //       console.log('[content-script] 恢复字幕按钮为关闭状态');
  //       subtitleBtn.click();
  //     }
  //   }, 1000); // 延迟1秒确保拦截完全结束
  // }

  const videoId = getVideoId();
  if (!videoId) {
    console.warn('[content-script] 无法获取视频ID');
    return;
  }

  // 获取当前播放时间
  let currentTime = 0;
  const videoElement = document.querySelector('video');
  if (videoElement) {
    currentTime = videoElement.currentTime;
  }

  // 然后才发送给 background
  chrome.runtime.sendMessage({
    type: 'SUBTITLE_DATA',
    data: {
      videoId: videoId,
      subtitles: payload.subtitles,
      url: payload.url,
      count: payload.count,
      sourceLang: capturedSourceLang, // 传递保存的源语言
      currentTime: currentTime  // 添加当前播放时间
      // 不要设置tabId，让service-worker从sender.tab.id获取
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[content-script] ✗ SUBTITLE_DATA:', chrome.runtime.lastError);
      // 即使失败也不需要再销毁，因为已经在前面销毁了
      return;
    }

    if (response && response.success) {
      console.log('[content-script] ✓ SUBTITLE_DATA: 成功');
    }
  });
}

// ==================== 初始化 ====================

/**
 * 主初始化函数
 */
async function initialize(): Promise<void> {
  try {
    // 检查是否为YouTube视频页面
    if (!isYouTubeVideoPage()) {
      // 只在非YouTube页面输出一次
      console.log('[content-script] 非YouTube视频页面，跳过初始化');
      return;
    }
    
    // 注入主世界脚本
    injectMainWorldScript();
    
    // 初始化UI组件
    await initializeUIComponents();
    
    // 设置消息处理器
    setupMessageHandlers();
    
    // 刷新状态
    await refreshStates({ forcePopupClosed: true, reason: 'initialize' });

    // 启动视频切换检测
    startVideoChangeDetection();

    // 监听标签页可见性变化
    setupVisibilityChangeListener();

    // 初始化用户偏好管理器，确保监听器可用
    const userPreferencesManager = UserPreferencesManager.getInstance();
    await userPreferencesManager.initialize();

    // 设置源语言、目标语言变更监听器
    setupSourceLanguageChangeListener();
    setupTargetLanguageChangeListener();
    setupTranslationServiceChangeListener();
    console.log('[content-script] ✅ 变更监听器已注册（源语言、目标语言、翻译服务）');

    isInitialized = true;
    console.log('[content-script] ✅ 内容脚本就绪');

    // 🆕 自动恢复翻译状态
    // 注意：必须在refreshStates()之后调用，因为refreshStates()会同步按钮UI状态
    await autoRestoreTranslationIfNeeded();

  } catch (error) {
    console.error('[content-script] ❌ 初始化失败:', error);
  }
}

/**
 * 刷新所有状态
 */
async function refreshStates(options: { forcePopupClosed?: boolean; reason?: RefreshReason } = {}): Promise<void> {
  try {
    const { forcePopupClosed = true, reason = 'manual' } = options;
    // 只有视频切换时才强制重置翻译状态(因为是新视频,旧翻译无效)
    // 其他场景(initialize, visibility)保持session状态,由autoRestore决定是否恢复
    const shouldForceInactive = reason === 'videoChange';

    const response = await chrome.runtime.sendMessage({
      type: 'getAllState',
      data: { includeUserPreferences: true }
    });
    
    if (response && response.success) {
      const { translateActive, popupOpen } = response.data;
      const resolvedTranslateActive = shouldForceInactive ? TranslateActiveState.INACTIVE : (translateActive || 'inactive');
      const resolvedPopupOpen = forcePopupClosed ? false : (popupOpen || false);
      
      // ✅ 方案A：只通过 StateManager 批量更新状态
      // StateManager 会通过通知机制自动触发 UI 更新
      if (stateManager) {
        await stateManager.updateStates({
          translateActive: resolvedTranslateActive,
          popupOpen: resolvedPopupOpen
        });
      }
      
      // ❌ 删除直接调用 uiRenderer.update() 的代码
      // 避免重复更新UI，让状态管理器通过通知机制统一处理

      if (shouldForceInactive) {
        resetTranslateState(reason);
      }
    }
  } catch (error) {
    console.error('[content-script] 刷新状态失败:', error);
  }
}

/**
 * 显示错误消息（3状态系统）
 * @param data 错误消息数据
 */
function showErrorMessage(data: { message: string; duration?: number; level?: string }): void {
  try {
    // 🔥 清除之前的两个定时器，防止提前隐藏新消息
    if (errorMessageTimer !== null) {
      clearTimeout(errorMessageTimer);
      errorMessageTimer = null;
    }
    if (errorMessageHideTimer !== null) {
      clearTimeout(errorMessageHideTimer);
      errorMessageHideTimer = null;
    }

    // 🔥 字幕已在错误处理流程中通过 CLEAR_SUBTITLE_OVERLAY 消息清除
    // 这里不需要再清除，避免冗余操作
    const { message, duration = ERROR_MESSAGE_DURATION, level = 'warning' } = data;

    // 查找视频容器
    const videoElement = document.querySelector('video');
    const videoContainer = videoElement?.closest('#movie_player, .html5-video-player');

    if (!videoContainer) {
      console.error('[content-script] 未找到视频容器，无法显示错误消息');
      return;
    }

    // 查找或创建错误消息容器（使用字幕样式）
    let errorContainer = document.getElementById('youtube-translator-error-message');
    if (!errorContainer) {
      errorContainer = document.createElement('div');
      errorContainer.id = 'youtube-translator-error-message';
      errorContainer.style.cssText = `
        position: absolute;
        bottom: 140px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        pointer-events: none;
        width: 90%;
        max-width: 800px;
        text-align: center;
        transition: opacity 0.3s ease;
      `;

      // 创建内部消息容器（类似字幕容器）
      const messageBox = document.createElement('div');
      messageBox.id = 'error-message-box';
      messageBox.style.cssText = `
        background: rgba(0, 0, 0, 0.75);
        padding: 8px 16px;
        border-radius: 4px;
        backdrop-filter: blur(2px);
        display: inline-block;
      `;

      errorContainer.appendChild(messageBox);
      videoContainer.appendChild(errorContainer);
    }

    const messageBox = errorContainer.querySelector('#error-message-box') as HTMLElement;
    if (!messageBox) return;

    // 🎯 获取字幕覆盖层的字体大小（与字幕保持一致）
    const subtitleOverlayEl = document.querySelector('.subtitle-overlay-responsive');
    let fontSize = '18px'; // 默认值
    if (subtitleOverlayEl) {
      const computedFontSize = getComputedStyle(subtitleOverlayEl).getPropertyValue('--calculated-font-size').trim();
      if (computedFontSize) {
        fontSize = computedFontSize;
      }
    }

    // 设置消息文本样式（使用与字幕相同的响应式字体大小）
    const textStyles = {
      info: `color: #4CAF50; font-size: ${fontSize}; line-height: 1.4; font-weight: 500;`,
      warning: `color: #ffeb3b; font-size: ${fontSize}; line-height: 1.4; font-weight: 500;`,
      error: `color: #ff5252; font-size: ${fontSize}; line-height: 1.4; font-weight: 500;`
    };

    messageBox.innerHTML = `<div style="${textStyles[level as keyof typeof textStyles] || textStyles.warning}">${message}</div>`;
    errorContainer.style.opacity = '1';
    errorContainer.style.display = 'block';

    // 自动隐藏 - 保存两个定时器引用
    errorMessageTimer = window.setTimeout(() => {
      const container = document.getElementById('youtube-translator-error-message');

      if (container) {
        container.style.opacity = '0';

        // 🔥 保存内层定时器引用，确保可以被清除
        errorMessageHideTimer = window.setTimeout(() => {
          const c = document.getElementById('youtube-translator-error-message');
          if (c) {
            c.style.display = 'none';
          }
          errorMessageTimer = null;
          errorMessageHideTimer = null;
        }, 300);
      } else {
        errorMessageTimer = null;
      }
    }, duration);
  } catch (error) {
    console.error('[content-script] 显示错误消息失败:', error);
  }
}

/**
 * 清除错误消息
 */
function clearErrorMessage(): void {
  try {
    // 清除两个定时器
    if (errorMessageTimer !== null) {
      clearTimeout(errorMessageTimer);
      errorMessageTimer = null;
    }
    if (errorMessageHideTimer !== null) {
      clearTimeout(errorMessageHideTimer);
      errorMessageHideTimer = null;
    }

    const errorContainer = document.getElementById('youtube-translator-error-message');
    if (errorContainer) {
      errorContainer.style.opacity = '0';
      setTimeout(() => {
        if (errorContainer && errorContainer.parentNode) {
          errorContainer.parentNode.removeChild(errorContainer);
        }
      }, 300);
    }
  } catch (error) {
    console.error('[content-script] 清除错误消息失败:', error);
  }
}

// ==================== 视频切换处理 ====================

/**
 * 处理视频切换
 */
async function handleVideoChange(oldVideoId: string | null, newVideoId: string): Promise<void> {
  console.log(`[content-script] 视频切换检测: ${oldVideoId} → ${newVideoId}`);

  // 1. 清理临时变量
  capturedSourceLang = null;

  // 2. 销毁拦截器（如果存在）
  console.log('[content-script] 视频切换，销毁拦截器...');
  window.postMessage({
    source: 'content-script',
    type: 'DESTROY_SUBTITLE_INTERCEPTOR'
  }, '*');

  // 3. 清理字幕显示（使用SubtitleOverlay的API）
  subtitleOverlay.hide();

  // 4. 清除错误消息
  clearErrorMessage();

  // 5. 🆕 保存切换前的翻译状态(用于后续自动恢复)
  // 重要: 通过background获取session storage中的原始值,避免读取到被污染的缓存
  let shouldAutoRestore = false;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getAllState',
      data: { includeUserPreferences: false }
    });

    if (response?.success) {
      const previousState = response.data?.translateActive;
      shouldAutoRestore = previousState === 'active' || previousState === TranslateActiveState.ACTIVE;
      console.log('[content-script] 视频切换前翻译状态(background):', previousState, '| 需要恢复:', shouldAutoRestore);
    } else {
      console.warn('[content-script] 获取切换前状态失败:', response?.error);
    }
  } catch (error) {
    console.error('[content-script] 获取切换前状态失败:', error);
  }

  // 6. 重新读取全局状态并重置翻译状态(清理旧视频的翻译)
  try {
    await refreshStates({ forcePopupClosed: true, reason: 'videoChange' });
  } catch (error) {
    console.error('[content-script] 视频切换刷新状态失败:', error);
  }

  // 7. 确保按钮重新注入并应用最新状态
  try {
    await checkAndCreateButtons();
  } catch (error) {
    console.error('[content-script] 视频切换后重新创建按钮失败:', error);
  }

  // 8. 🆕 根据保存的状态决定是否自动恢复翻译
  // 如果切换前翻译是开启的,自动翻译新视频
  if (shouldAutoRestore) {
    console.log('[content-script] 视频切换后自动恢复翻译');
    await autoRestoreTranslationIfNeeded(true); // 强制恢复
  } else {
    console.log('[content-script] 视频切换前翻译未开启,不自动恢复');
  }

  console.log('[content-script] 视频切换处理完成');
}

/**
 * 启动视频切换检测
 */
function startVideoChangeDetection(): void {
  // 保存初始视频ID
  currentVideoId = getVideoId();

  // 方法1：监听YouTube导航事件
  document.addEventListener('yt-navigate-start', () => {
    console.log('[content-script] YouTube导航开始');
    isNavigating = true;
  });

  document.addEventListener('yt-navigate-finish', () => {
    console.log('[content-script] YouTube导航完成');

    const newVideoId = getVideoId();
    if (newVideoId && newVideoId !== currentVideoId) {
      handleVideoChange(currentVideoId, newVideoId);
      currentVideoId = newVideoId;
    }

    // 500ms后恢复操作
    setTimeout(() => {
      isNavigating = false;
    }, 500);
  });

  // 方法2：URL轮询检测（备用方案）
  urlCheckInterval = window.setInterval(() => {
    const newVideoId = getVideoId();
    if (newVideoId && newVideoId !== currentVideoId) {
      // 如果导航事件没有触发，使用轮询检测
      if (!isNavigating) {
        console.log('[content-script] URL变化检测到视频切换');
        handleVideoChange(currentVideoId, newVideoId);
        currentVideoId = newVideoId;
      }
    }
  }, 1000);
}

// ==================== 启动 ====================

// 立即执行初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// 测试代码已移除（v3.0 无重试架构）

// ==================== 源语言实时变更功能 ====================

/**
 * 设置源语言变更监听器
 * 复用现有的StorageManager监听机制
 */
function setupSourceLanguageChangeListener(): void {
  // 复用现有的StorageManager监听机制
  StorageManager.getInstance().addChangeListener(
    StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE,
    handleSourceLanguageCacheChange
  );
}

function setupTargetLanguageChangeListener(): void {
  const prefsManager = UserPreferencesManager.getInstance();
  prefsManager.addChangeListener(
    UserPreferenceChangeEvent.TARGET_LANG_CHANGED,
    async (newLang: string, oldLang: string) => {
      try {
        if (!newLang || newLang === oldLang) {
          return;
        }

        const translateState = stateManager?.getState('translateActive');
        const isActive = translateState === TranslateActiveState.ACTIVE || translateState === 'active';

        if (!isActive) {
          console.debug('[debug][content-script] 目标语言变更但翻译未激活，忽略实时更新');
          return;
        }

        await handleTargetLanguageChangeRealtime(newLang, oldLang);
      } catch (error) {
        console.error('[content-script] 处理目标语言变更监听失败:', error);
      }
    }
  );
}

function setupTranslationServiceChangeListener(): void {
  const prefsManager = UserPreferencesManager.getInstance();
  prefsManager.addChangeListener(
    UserPreferenceChangeEvent.TRANSLATION_SERVICE_CHANGED,
    async (newService: any, oldService: any) => {
      try {
        if (!newService) {
          return;
        }
        if (oldService && JSON.stringify(newService) === JSON.stringify(oldService)) {
          return;
        }

        const translateState = stateManager?.getState('translateActive');
        const isActive = translateState === TranslateActiveState.ACTIVE || translateState === 'active';

        if (!isActive) {
          console.debug('[debug][content-script] 翻译服务变更但翻译未激活，忽略实时更新');
          return;
        }

        subtitleOverlay.hide();
        stateManager?.updateState('translateActive', 'pending');
        subtitleOverlay.showPendingMessage('翻译服务切换，重新翻译中...');

        const videoId = getVideoId();
        if (!videoId) {
          console.warn('[content-script] 无法获取视频ID，终止翻译服务变更处理');
          return;
        }

        const sourceTrack = await getCurrentSourceTrack(videoId);
        const sourceLang = sourceTrack?.languageCode || 'auto';
        capturedSourceLang = sourceLang;

        const userPrefs = await prefsManager.getUserPreferences();
        const cacheResponse = await chrome.runtime.sendMessage({
          type: 'checkTranslationCache',
          data: {
            videoId,
            sourceLang,
            sourceKind: sourceTrack?.kind,  // 添加源语言类型
            targetLang: userPrefs.targetLang,
            service: newService
          }
        });

        if (cacheResponse?.success && cacheResponse.data) {
          console.log('[content-script] 使用翻译服务缓存的翻译结果');
          await subtitleOverlay.show(cacheResponse.data);
          stateManager?.updateState('translateActive', 'active');
          return;
        }

        const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
        const originalSubtitleState = subtitleBtn?.getAttribute('aria-pressed') === 'true';

        const videoElement = document.querySelector('video');
        const currentTime = videoElement ? videoElement.currentTime : 0;

        const response = await chrome.runtime.sendMessage({
          type: 'TOGGLE_TRANSLATE',
          data: {
            videoId,
            newState: true,
            currentTime,
            originalSubtitleState,
            sourceLang,
            sourceKind: sourceTrack?.kind,  // 添加源语言类型
            targetLang: userPrefs.targetLang,
            reuseOriginalSubtitles: true,
            isRestart: true
          }
        });

        // 完善的response处理
        if (!response) {
          console.error('[content-script] 无响应');
          subtitleOverlay.hide();
          showErrorMessage({ message: '翻译服务无响应，请重试', duration: ERROR_MESSAGE_DURATION });
        } else if (!response.success) {
          console.error('[content-script] 翻译失败:', response.error);
          subtitleOverlay.hide();
          showErrorMessage({
            message: response.error || '翻译失败，请重试',
            duration: ERROR_MESSAGE_DURATION
          });
        } else if (response.action === 'translated' || response.action === 'cached') {
          displayTranslatedSubtitles(response.data);
        } else if (response.action === 'streamed') {
          // V4架构成功 - 数据已通过TRANSLATION_UPDATE推送
          console.log('[content-script] V4架构翻译成功，数据已流式推送');
        } else {
          console.warn('[content-script] 未知响应格式:', response);
          subtitleOverlay.hide();
          showErrorMessage({ message: '翻译响应格式异常', duration: ERROR_MESSAGE_DURATION });
        }
      } catch (error) {
        console.error('[content-script] 处理翻译服务变更监听失败:', error);
        stateManager?.updateState('translateActive', 'inactive');
        subtitleOverlay.hide();
      }
    }
  );
}

/**
 * 处理源语言缓存变化
 */
/**
 * 处理源语言缓存变化
 */
async function handleSourceLanguageCacheChange(
  changes: { [key: string]: chrome.storage.StorageChange },
  area: string
): Promise<void> {
  console.log('[content-script] handleSourceLanguageCacheChange 被调用', { area, keys: Object.keys(changes) });

  if (area !== 'local') return;

  // 获取变更数据
  const change = changes[StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE];
  if (!change) {
    console.log('[content-script] 没有找到 VIDEO_SOURCE_LANGUAGE_CACHE 变更');
    return;
  }

  console.log('[content-script] 检测到 VIDEO_SOURCE_LANGUAGE_CACHE 变更', {
    hasNew: !!change.newValue,
    hasOld: !!change.oldValue
  });

  const newCache = change.newValue;
  const oldCache = change.oldValue;

  // 复用现有的getVideoId()函数
  const currentVideoId = getVideoId();
  if (!currentVideoId) return;

  // 查找当前视频的数据
  const newVideoData = newCache?.items?.find((item: any) => item.videoId === currentVideoId);
  const oldVideoData = oldCache?.items?.find((item: any) => item.videoId === currentVideoId);

  // 🔧 修复：移除 sourceChanged 检查，允许用户重复选择相同源语言来强制重新翻译
  // 背景：下拉列表第一个选项可能是当前已选中的，点击后因为新旧值相同不触发翻译
  // 解决：允许用户通过重新选择相同源语言来刷新翻译
  if (newVideoData?.selectedSourceTrack?.languageCode) {

    // 复用stateManager获取当前翻译状态
    const translateState = stateManager?.getState('translateActive');
    const isActive = translateState === TranslateActiveState.ACTIVE || translateState === 'active';

    if (isActive) {
      // 检查源语言或类型是否变化（用于日志记录）
      const sourceChanged =
        newVideoData.selectedSourceTrack.languageCode !== oldVideoData?.selectedSourceTrack?.languageCode ||
        newVideoData.selectedSourceTrack.kind !== oldVideoData?.selectedSourceTrack?.kind;

      console.log(`[content-script] 检测到源语言选择: ${newVideoData.selectedSourceTrack.languageCode}` +
        (newVideoData.selectedSourceTrack.kind ? ` (${newVideoData.selectedSourceTrack.kind})` : '') +
        (sourceChanged ? ' [已变更]' : ' [强制刷新]'));

      // 处理源语言变更（即使未变化也执行，允许强制刷新）
      await handleSourceLanguageChange(
        newVideoData.selectedSourceTrack.languageCode,
        newVideoData.selectedSourceTrack.kind
      );
    }
  }
}

/**
 * 处理源语言变更（最大化复用现有功能）
 */
async function handleSourceLanguageChange(newSourceLang: string, newSourceKind?: 'asr' | 'forced'): Promise<void> {
  console.log('[content-script] 开始处理源语言变更:', newSourceLang, newSourceKind ? `(${newSourceKind})` : '');

  try {
    // 1. 复用hide()清除字幕，复用updateState设置PENDING
    subtitleOverlay.hide();
    stateManager?.updateState('translateActive', 'pending');

    // 2. 使用新添加的showPendingMessage方法
    subtitleOverlay.showPendingMessage('源语言切换，重新进行字幕翻译...');

    // 3. 复用UserPreferencesManager获取偏好
    const userPrefs = await UserPreferencesManager.getInstance().getUserPreferences();

    // 4. 通过消息调用Service Worker的缓存检查
    const cacheResponse = await chrome.runtime.sendMessage({
      type: 'checkTranslationCache',
      data: {
        videoId: getVideoId(),
        sourceLang: newSourceLang,
        sourceKind: newSourceKind,  // 添加源语言类型
        targetLang: userPrefs.targetLang,
        service: userPrefs.translationService
      }
    });

    if (cacheResponse.success && cacheResponse.data) {
      // 5A. 有缓存：复用show()方法显示
      console.log('[content-script] 使用缓存的翻译结果');

      // 🔧 修复：缓存命中后也要切换YouTube字幕轨道
      const setResult = await setSubtitleTrackAPI(newSourceLang, newSourceKind);
      if (setResult.success) {
        console.log(`[content-script] ✓ 已切换YouTube字幕轨道: ${newSourceLang}${newSourceKind ? ` (${newSourceKind})` : ''}`);
      } else {
        console.warn('[content-script] ⚠️ 切换YouTube字幕轨道失败，但仍显示翻译字幕');
      }

      await subtitleOverlay.show(cacheResponse.data);
      stateManager?.updateState('translateActive', 'active');
    } else {
      // 5B. 无缓存：复用现有的TOGGLE_TRANSLATE消息触发重新翻译
      console.log('[content-script] 无缓存，触发重新翻译');

      // 获取当前播放时间
      const videoElement = document.querySelector('video');
      const currentTime = videoElement ? videoElement.currentTime : 0;

      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_TRANSLATE',
        data: {
          videoId: getVideoId(),
          newState: true,  // 始终开启
          currentTime: currentTime,
          isRestart: true,  // 标识是重新翻译
          sourceLang: newSourceLang,  // 指定新的源语言
          sourceKind: newSourceKind  // 指定新的源语言类型
        }
      });

      // 完善的response处理
      if (!response) {
        console.error('[content-script] 无响应');
        subtitleOverlay.hide();
        showErrorMessage({ message: '翻译服务无响应，请重试', duration: ERROR_MESSAGE_DURATION });
      } else if (!response.success) {
        console.error('[content-script] 翻译失败:', response.error);
        subtitleOverlay.hide();
        showErrorMessage({
          message: response.error || '翻译失败，请重试',
          duration: ERROR_MESSAGE_DURATION
        });
      } else if (response.action === 'translated' || response.action === 'cached') {
        displayTranslatedSubtitles(response.data);
      } else if (response.action === 'streamed') {
        // V4架构成功 - 数据已通过TRANSLATION_UPDATE推送
        console.log('[content-script] V4架构翻译成功，数据已流式推送');
      } else {
        console.warn('[content-script] 未知响应格式:', response);
        subtitleOverlay.hide();
        showErrorMessage({ message: '翻译响应格式异常', duration: ERROR_MESSAGE_DURATION });
      }
    }
  } catch (error) {
    console.error('[content-script] 处理源语言变更失败:', error);
    // 恢复到非活动状态
    stateManager?.updateState('translateActive', 'inactive');
    subtitleOverlay.hide();
  }
}

async function handleTargetLanguageChangeRealtime(newTargetLang: string, oldTargetLang?: string): Promise<void> {
  console.log('[content-script] 开始处理目标语言变更:', { newTargetLang, oldTargetLang });

  try {
    subtitleOverlay.hide();
    stateManager?.updateState('translateActive', 'pending');
    subtitleOverlay.showPendingMessage('目标语言切换，重新翻译中...');

    const videoId = getVideoId();
    if (!videoId) {
      console.warn('[content-script] 无法获取视频ID，终止目标语言变更处理');
      return;
    }

    const sourceTrack = await getCurrentSourceTrack(videoId);
    const sourceLang = sourceTrack?.languageCode || 'auto';
    capturedSourceLang = sourceLang;

    const prefsManager = UserPreferencesManager.getInstance();
    const userPrefs = await prefsManager.getUserPreferences();

    const cacheResponse = await chrome.runtime.sendMessage({
      type: 'checkTranslationCache',
      data: {
        videoId,
        sourceLang,
        sourceKind: sourceTrack?.kind,  // 添加源语言类型
        targetLang: newTargetLang,
        service: userPrefs.translationService
      }
    });

    if (cacheResponse.success && cacheResponse.data) {
      console.log('[content-script] 使用目标语言缓存的翻译结果');
      await subtitleOverlay.show(cacheResponse.data);
      stateManager?.updateState('translateActive', 'active');
      return;
    }

    console.log('[content-script] 目标语言缓存未命中，触发重新翻译');

    const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
    const originalSubtitleState = subtitleBtn?.getAttribute('aria-pressed') === 'true';

    const videoElement = document.querySelector('video');
    const currentTime = videoElement ? videoElement.currentTime : 0;

    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_TRANSLATE',
      data: {
        videoId,
        newState: true,
        currentTime,
        originalSubtitleState,
        sourceLang,
        sourceKind: sourceTrack?.kind,  // 添加源语言类型
        targetLang: newTargetLang,
        reuseOriginalSubtitles: true,
        isRestart: true
      }
    });

    // 完善的response处理
    if (!response) {
      // 无响应
      console.error('[content-script] 无响应');
      subtitleOverlay.hide();
      showErrorMessage({ message: '翻译服务无响应，请重试', duration: ERROR_MESSAGE_DURATION });
      stateManager?.updateState('translateActive', 'inactive');
    } else if (!response.success) {
      // 失败响应
      console.error('[content-script] 翻译失败:', response.error);
      subtitleOverlay.hide();
      showErrorMessage({
        message: response.error || '翻译失败，请重试',
        duration: ERROR_MESSAGE_DURATION
      });
      stateManager?.updateState('translateActive', 'inactive');
    } else if (response.action === 'translated' || response.action === 'cached') {
      // 旧架构成功
      displayTranslatedSubtitles(response.data);
    } else if (response.action === 'streamed') {
      // V4架构成功 - 数据已通过TRANSLATION_UPDATE推送
      console.log('[content-script] V4架构翻译成功，数据已流式推送');
      // 状态会通过其他消息更新，这里不需要额外处理
    } else {
      // 未知响应
      console.warn('[content-script] 未知响应格式:', response);
      subtitleOverlay.hide();
      showErrorMessage({ message: '翻译响应格式异常', duration: ERROR_MESSAGE_DURATION });
      stateManager?.updateState('translateActive', 'inactive');
    }
  } catch (error) {
    console.error('[content-script] 处理目标语言变更失败:', error);
    stateManager?.updateState('translateActive', 'inactive');
    subtitleOverlay.hide();
    showErrorMessage({ message: '处理目标语言变更失败', duration: ERROR_MESSAGE_DURATION });
  }
}

async function getCurrentSourceLanguageForRealtime(videoId: string): Promise<string> {
  if (capturedSourceLang) {
    return capturedSourceLang;
  }

  try {
    const result = await chrome.storage.local.get(StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE);
    const cache = result[StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE];
    const cachedItem = cache?.items?.find((item: any) => item.videoId === videoId);
    if (cachedItem?.selectedSourceTrack?.languageCode) {
      return cachedItem.selectedSourceTrack.languageCode;
    }
  } catch (error) {
    console.warn('[content-script] 获取源语言缓存失败:', error);
  }

  return 'auto';
}

/**
 * 获取当前选中的源语言轨道（包括kind信息）
 */
async function getCurrentSourceTrack(videoId: string): Promise<{ languageCode: string; kind?: 'asr' | 'forced' } | null> {
  try {
    const result = await chrome.storage.local.get(StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE);
    const cache = result[StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE];
    const cachedItem = cache?.items?.find((item: any) => item.videoId === videoId);
    if (cachedItem?.selectedSourceTrack) {
      return {
        languageCode: cachedItem.selectedSourceTrack.languageCode,
        kind: cachedItem.selectedSourceTrack.kind
      };
    }
  } catch (error) {
    console.warn('[content-script] 获取源语言轨道失败:', error);
  }
  return null;
}

// 导出给测试使用
export {
  getVideoId,
  isYouTubeVideoPage,
  handleUserAction
};
