/**
 * @file content-script.ts
 * @description YouTube字幕翻译助手 - 整合后的内容脚本
 * 整合了原content-script-new.ts和content-script-coordinator.ts的功能
 */

import { UIRenderer } from '@shared/components/ui-renderer';
import { StateManager } from '@shared/components/state-manager';
import { TranslateActiveState } from '@shared/types/runtime-state-types';
import { subtitleOverlay } from './subtitle-overlay';

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

// 视频切换相关变量
let currentVideoId: string | null = null;
let isNavigating = false;
let urlCheckInterval: number | null = null;


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
  console.log('[content-script] 检查YouTube控制栏是否就绪...');
  
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

// ==================== 用户交互处理 ====================

/**
 * 处理用户行为事件
 */
function handleUserAction(action: string, data: any): void {
  if (action === 'buttonClick') {
    console.log(`[content-script] 按钮点击: ${data.buttonType}`);
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
    // 注释掉中间层日志，状态变化已由StateManager记录
    // console.log(`[content-script] 批量状态变化:`, Object.keys(updates).join(', '));
    if (uiRenderer) {
      uiRenderer.update(updates);
    }
  } 
  // 处理单个更新（来自updateState）
  else if (key && value !== undefined) {
    // 注释掉中间层日志，状态变化已由StateManager记录
    // console.log(`[content-script] 状态变化: ${key} = ${value}`);
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
  console.log(`[content-script] 处理Chrome消息: ${messageType}`);
  
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
  
  // 立即设置为PENDING状态，提供即时反馈
  if (isEnabling) {
    stateManager?.updateState('translateActive', 'pending');
  }
  
  // 获取当前播放时间
  let currentTime = 0;
  const videoElement = document.querySelector('video');
  if (videoElement) {
    currentTime = videoElement.currentTime;
    console.log(`[content-script] 当前播放时间: ${currentTime}s`);
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_TRANSLATE',
      data: {
        videoId: videoId,
        newState: isEnabling,
        currentTime: currentTime  // 添加当前播放时间
      }
    });
    
    console.log('[content-script] 翻译切换响应:', response);
    
    switch (response.action) {
      case 'cached':
      case 'translated':
        displayTranslatedSubtitles(response.data);
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
  console.log('[content-script] 发送字幕捕获请求到main-world...');
  window.postMessage({
    source: 'content-script',
    type: 'REQUEST_SUBTITLE_CAPTURE'
  }, '*');

  // 设置6秒超时（比拦截器内部的5秒稍长，确保能收到超时消息）
  setTimeout(() => {
    // 发送销毁消息（兜底保护）
    console.log('[content-script] 字幕捕获6秒超时，强制销毁拦截器');
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
  console.log('[content-script] 隐藏翻译字幕');
  subtitleOverlay.hide();
  // 状态更新由Background通过STATE_CHANGED消息统一管理，避免重复更新
  // stateManager?.updateState('translateActive', 'inactive');
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
      console.log('[content-script] Popup已打开，将由Chrome自动关闭');
      return;
    }
    
    // 防抖检查
    if (lastPopupCloseTime > 0) {
      const timeSinceClose = Date.now() - lastPopupCloseTime;
      if (timeSinceClose < 300) {
        console.log('[content-script] 刚刚关闭popup，不执行打开操作');
        return;
      }
    }
    
    const openResponse = await chrome.runtime.sendMessage({
      type: 'openPopup',
      data: { source: 'settings-button' },
      timestamp: Date.now()
    });
    
    if (openResponse && openResponse.success) {
      console.log('[content-script] ✓ openPopup: 成功');
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

    // 处理REQUEST_SUBTITLE_CAPTURE消息
    if (messageType === 'REQUEST_SUBTITLE_CAPTURE') {
      console.log(`[content-script] 收到Chrome消息: ${messageType}`);
      // 保存源语言信息
      if (message.data?.sourceLang) {
        capturedSourceLang = message.data.sourceLang;
        console.log(`[content-script] 保存源语言: ${capturedSourceLang}`);
      }
      window.postMessage({
        source: 'content-script',
        type: 'REQUEST_SUBTITLE_CAPTURE',
        videoId: message.data?.videoId || getVideoId(),
        sourceLang: message.data?.sourceLang // 传递给main-world
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
    
    // 处理CLEAR_ERROR_MESSAGE消息
    if (messageType === 'CLEAR_ERROR_MESSAGE') {
      console.log('[content-script] 清除错误消息');
      clearErrorMessage();
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
        console.log(`[content-script] 总计翻译: ${message.data.totalSubtitles} 条字幕`);
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
      
      // 通知main-world开始捕获字幕
      window.postMessage({
        source: 'content-script',
        type: 'REQUEST_SUBTITLE_CAPTURE'
      }, '*');
      
      console.log('[content-script] 已发送字幕捕获请求到main-world');
      sendResponse({ success: true });
      return false;
    }
    
    // 处理getVideoTrackData消息
    if (messageType === 'getVideoTrackData') {
      console.log(`[content-script] 收到Chrome消息: ${messageType}`);
      handleGetVideoTrackData(message.videoId, sendResponse);
      return true; // 异步响应
    }
    
    // 处理通过Player API获取字幕轨道
    if (messageType === 'getSubtitleTracksAPI') {
      console.log(`[content-script] 收到Chrome消息: ${messageType}`);
      handleGetSubtitleTracksAPI(sendResponse);
      return true; // 异步响应
    }
    
    // 处理通过Player API设置字幕语言（ISO 639-1）
    if (messageType === 'setSubtitleTrackAPI') {
      console.log(`[content-script] 收到Chrome消息: ${messageType}, langCode: ${message.langCode}`);
      handleSetSubtitleTrackAPI(message.langCode, sendResponse);
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
  
  console.log('[content-script] 消息处理器设置完成');
}

// handleGetSubtitleData函数已被移除
// 原因：方法1（主动API调用）频繁失败，已迁移到方法2（字幕拦截器）
// 详见：/docs/guides/decision-log.md #23

/**
 * 处理通过Player API获取字幕轨道
 */
function handleGetSubtitleTracksAPI(sendResponse: (response: any) => void): void {
  console.log('[content-script] 开始通过API获取字幕轨道');
  
  const requestId = `api_tracks_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const timeout = setTimeout(() => {
    apiResponseHandlers.delete(requestId);
    sendResponse({
      success: false,
      error: 'API获取字幕轨道超时'
    });
  }, 5000);
  
  // 设置响应处理器
  apiResponseHandlers.set(requestId, (response) => {
    clearTimeout(timeout);
    sendResponse(response);
  });
  
  // 发送消息到main-world
  window.postMessage({
    source: 'content-script',
    type: 'GET_SUBTITLE_TRACKS_API',
    _requestId: requestId
  }, '*');
}

/**
 * 处理通过Player API设置字幕语言（使用ISO 639-1标准）
 */
function handleSetSubtitleTrackAPI(langCode: string, sendResponse: (response: any) => void): void {
  console.log(`[content-script] 通过API设置字幕语言: ${langCode}`);
  
  const requestId = `api_set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const timeout = setTimeout(() => {
    apiResponseHandlers.delete(requestId);
    sendResponse({
      success: false,
      error: 'API设置字幕语言超时'
    });
  }, 5000);
  
  // 设置响应处理器
  apiResponseHandlers.set(requestId, (response) => {
    clearTimeout(timeout);
    sendResponse(response);
  });
  
  // 发送消息到main-world
  window.postMessage({
    source: 'content-script',
    type: 'SET_SUBTITLE_TRACK_API',
    langCode: langCode,  // ISO 639-1语言代码
    _requestId: requestId
  }, '*');
}

/**
 * 处理获取视频轨道数据
 */
function handleGetVideoTrackData(videoId: string, sendResponse: (response: any) => void): void {
  console.log(`[content-script] 开始获取视频轨道数据，videoId: ${videoId}`);
  
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
        console.log(`[content-script] 收到轨道数据，共 ${payload.captionTracks.length} 条`);
        
        // 转换YouTube原始格式为简化格式
        const simplifiedTracks = payload.captionTracks.map((track: any) => ({
          languageCode: track.languageCode,
          name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode,
          vssId: track.vssId,
          kind: track.kind,
          isTranslatable: track.isTranslatable !== false
        }));
        
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
    await refreshStates();

    // 启动视频切换检测
    startVideoChangeDetection();

    isInitialized = true;
    // 保留最终初始化完成日志
    console.log('[content-script] ✅ 初始化完成');
    
  } catch (error) {
    console.error('[content-script] ❌ 初始化失败:', error);
  }
}

/**
 * 刷新所有状态
 */
async function refreshStates(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getAllState',
      data: { includeUserPreferences: true }
    });
    
    if (response && response.success) {
      const { translateActive, popupOpen } = response.data;
      
      // ✅ 方案A：只通过 StateManager 批量更新状态
      // StateManager 会通过通知机制自动触发 UI 更新
      if (stateManager) {
        await stateManager.updateStates({
          translateActive: translateActive || 'inactive',
          popupOpen: popupOpen || false
        });
      }
      
      // ❌ 删除直接调用 uiRenderer.update() 的代码
      // 避免重复更新UI，让状态管理器通过通知机制统一处理
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
    const { message, duration = 5000, level = 'warning' } = data;
    
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
        z-index: 2100;
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
    
    // 设置消息文本样式（类似字幕样式）
    const textStyles = {
      info: 'color: #4CAF50; font-size: 22px; line-height: 1.4; font-weight: 500;',
      warning: 'color: #ffeb3b; font-size: 22px; line-height: 1.4; font-weight: 500;',
      error: 'color: #ff5252; font-size: 22px; line-height: 1.4; font-weight: 500;'
    };
    
    messageBox.innerHTML = `<div style="${textStyles[level as keyof typeof textStyles] || textStyles.warning}">${message}</div>`;
    errorContainer.style.opacity = '1';
    errorContainer.style.display = 'block';
    
    // 自动隐藏
    setTimeout(() => {
      if (errorContainer) {
        errorContainer.style.opacity = '0';
        setTimeout(() => {
          if (errorContainer) {
            errorContainer.style.display = 'none';
          }
        }, 300);
      }
    }, duration);
    
    console.log('[content-script] 显示错误消息:', message);
  } catch (error) {
    console.error('[content-script] 显示错误消息失败:', error);
  }
}

/**
 * 清除错误消息
 */
function clearErrorMessage(): void {
  try {
    const errorContainer = document.getElementById('youtube-translator-error-message');
    if (errorContainer) {
      errorContainer.style.opacity = '0';
      setTimeout(() => {
        if (errorContainer && errorContainer.parentNode) {
          errorContainer.parentNode.removeChild(errorContainer);
        }
      }, 300);
    }
    console.log('[content-script] 清除错误消息');
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

  // 1. 重置翻译状态为关闭
  if (stateManager) {
    await stateManager.updateStates({
      translateActive: TranslateActiveState.INACTIVE
    });
  }

  // 2. 清理临时变量
  capturedSourceLang = null;

  // 2.5. 销毁拦截器（如果存在）
  console.log('[content-script] 视频切换，销毁拦截器...');
  window.postMessage({
    source: 'content-script',
    type: 'DESTROY_SUBTITLE_INTERCEPTOR'
  }, '*');

  // 3. 清理字幕显示（使用SubtitleOverlay的API）
  subtitleOverlay.hide();

  // 4. 更新按钮状态
  if (uiRenderer) {
    // 更新翻译按钮状态
    const translateButton = document.getElementById('youtube-translate-button');
    if (translateButton) {
      translateButton.classList.remove('active');
      translateButton.setAttribute('aria-pressed', 'false');
    }
  }

  // 5. 清除错误消息
  clearErrorMessage();

  console.log('[content-script] 视频切换重置完成');
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

  console.log('[content-script] 视频切换检测已启动');
}

// ==================== 启动 ====================

// 立即执行初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// 测试代码已移除（v3.0 无重试架构）

// 导出给测试使用
export {
  getVideoId,
  isYouTubeVideoPage,
  handleUserAction
};