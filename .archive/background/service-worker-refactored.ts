/**
 * 重构后的handleToggleTranslate函数
 * 使用AbortTimeoutManager和TranslationSession实现
 * @version 4.0
 */

import type { ToggleTranslateRequest, ToggleTranslateResponse } from '../shared/types/messages';
import { TranslateActiveState } from '../shared/types/runtime-state-types';

/**
 * 处理翻译开关切换 - 使用新的会话管理架构
 */
async function handleToggleTranslateRefactored(
  sender: chrome.runtime.MessageSender, 
  data: ToggleTranslateRequest
): Promise<ToggleTranslateResponse> {
  const { videoId, newState } = data;
  const tabId = sender.tab?.id;
  
  if (!tabId) {
    console.error('[service-worker] 无法获取标签页ID');
    return {
      success: false,
      error: '无法获取标签页信息'
    };
  }
  
  // 生成会话ID
  const sessionId = `translate_${tabId}_${videoId}`;
  
  // === 关闭翻译 ===
  if (!newState) {
    console.log('[service-worker] 关闭翻译');
    
    // 取消当前会话
    if (abortTimeoutManager.hasSession(sessionId)) {
      abortTimeoutManager.abortSession(sessionId);
    }
    
    // 清除旧的看门狗（兼容）
    watchdogManager.clearAll();
    
    // 设置状态为INACTIVE
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    
    return {
      success: true,
      action: 'stopped',
      message: '翻译已关闭'
    };
  }
  
  // === 开启翻译 ===
  console.log('[service-worker] 开启翻译，创建会话:', sessionId);
  
  // 创建新会话
  const session = abortTimeoutManager.createSession(sessionId);
  
  try {
    // 设置PENDING状态
    await runtimeStateManager.setTranslateState(TranslateActiveState.PENDING);
    
    // ========== Stage 1: 获取用户偏好（本地操作，无需超时）==========
    const preferences = await userPreferencesManager.getUserPreferences();
    
    if (!preferences || !preferences.translationService) {
      throw new Error('用户偏好配置不完整：缺少 translationService');
    }
    
    console.log('[service-worker] 用户偏好:', {
      targetLang: preferences.targetLang,
      service: preferences.translationService?.type
    });
    
    // ========== Stage 2: 检查缓存 ==========
    // 2.1 获取源语言信息
    const videoSourceManager = VideoSourceLanguageCacheManager.getInstance();
    const sourceData = await videoSourceManager.get(videoId);
    
    let sourceLang = 'auto';
    if (sourceData?.availableSourceLanguages?.length > 0) {
      sourceLang = selectBestSourceLanguage(
        sourceData.availableSourceLanguages,
        preferences.targetLang,
        sourceData.lastSelectedLanguage
      );
    }
    
    // 2.2 检查完整翻译缓存
    const cacheManager = TranslationCacheManager.getInstance();
    const cachedResult = await cacheManager.get(
      videoId,
      sourceLang,
      preferences.targetLang,
      preferences.translationService
    );
    
    if (cachedResult) {
      console.log('[service-worker] ✓ 命中完整缓存');
      await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
      session.complete();  // 正常完成会话
      
      return {
        success: true,
        action: 'cached',
        data: cachedResult
      };
    }
    
    // 2.3 检查部分缓存（相同源语言的原始字幕）
    const partialCaches = await cacheManager.findByVideoAndSourceLang(videoId, sourceLang);
    
    if (partialCaches.length > 0) {
      console.log('[service-worker] ✓ 命中部分缓存，执行翻译');
      const originalSubtitles = partialCaches[0].originalSubtitles;
      
      // 使用会话执行翻译
      const translatedResult = await session.executeStage(
        'translate_cached',
        async (signal) => {
          return await executeTranslationWithSignal(
            {
              subtitles: originalSubtitles,
              videoId,
              url: sender.tab?.url || '',
              tabId,
              currentTime: data.currentTime
            },
            preferences,
            signal
          );
        },
        { timeoutMs: 10000 }  // 翻译可能需要更长时间
      );
      
      await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
      session.complete();
      
      // 异步保存缓存
      saveTranslationCache(
        videoId,
        sourceLang,
        preferences,
        originalSubtitles,
        translatedResult.translatedSubtitles
      );
      
      return {
        success: true,
        action: 'translated',
        data: translatedResult
      };
    }
    
    // ========== Stage 3: 获取字幕数据（5秒超时）==========
    console.log('[service-worker] Stage 3: 获取字幕数据');
    
    // 3.1 先获取/更新轨道信息
    if (sourceLang === 'auto' || !sourceData) {
      await session.executeStage(
        'fetch_tracks',
        async (signal) => {
          const tracks = await fetchTracksWithSignal(tabId, videoId, signal);
          
          // 选择源语言
          if (sourceLang === 'auto') {
            sourceLang = selectBestSourceLanguage(
              tracks,
              preferences.targetLang,
              sourceData?.lastSelectedLanguage
            );
          }
          
          // 通过API设置字幕语言
          if (sourceLang && sourceLang !== 'auto') {
            await setSubtitleLanguageWithSignal(tabId, sourceLang, signal);
          }
          
          // 异步缓存轨道信息
          saveTrackMetadata(videoId, tracks, sourceLang);
          
          return tracks;
        },
        { timeoutMs: 3000 }
      );
    }
    
    // 3.2 触发字幕加载
    await session.executeStage(
      'trigger_load',
      async (signal) => {
        return await triggerSubtitleLoadWithSignal(tabId, signal);
      },
      { timeoutMs: 2000 }
    );
    
    // 3.3 等待字幕数据（这是关键的5秒超时）
    const subtitleData = await session.executeStage(
      'subtitle_fetch',
      async (signal) => {
        // 创建一个Promise来等待字幕响应
        return new Promise((resolve, reject) => {
          // 设置消息监听器
          const messageListener = (message: any, sender: any) => {
            if (message.type === 'SUBTITLE_DATA' && 
                sender.tab?.id === tabId &&
                message.data?.videoId === videoId) {
              // 收到字幕数据
              resolve(message.data);
              return true;
            }
          };
          
          // 添加监听器
          chrome.runtime.onMessage.addListener(messageListener);
          
          // 监听abort信号
          signal.addEventListener('abort', () => {
            chrome.runtime.onMessage.removeListener(messageListener);
            reject(new StageTimeoutError('subtitle_fetch', 5000));
          });
          
          // 清理函数
          const cleanup = () => {
            chrome.runtime.onMessage.removeListener(messageListener);
          };
          
          // 成功或失败都要清理
          resolve = ((originalResolve) => (value: any) => {
            cleanup();
            originalResolve(value);
          })(resolve);
          
          reject = ((originalReject) => (reason: any) => {
            cleanup();
            originalReject(reason);
          })(reject);
        });
      },
      { 
        timeoutMs: 5000,
        critical: true  // 字幕获取失败则终止流程
      }
    );
    
    // 检查字幕数据
    if (!subtitleData?.subtitles || subtitleData.subtitles.length === 0) {
      throw new Error('当前视频无字幕');
    }
    
    // ========== Stage 4: 执行两阶段翻译 ==========
    console.log('[service-worker] Stage 4: 执行两阶段翻译');
    
    const translator = new TwoPhaseTranslator();
    
    // 4.1 紧急翻译（5秒超时，失败不终止）
    const urgentResults = await session.executeStage(
      'urgent_translate',
      async (signal) => {
        return await translator.translateUrgent(
          subtitleData.subtitles,
          subtitleData.currentTime || 0,
          preferences,
          signal
        );
      },
      {
        timeoutMs: 5000,
        fallback: []  // 失败返回空数组
      }
    );
    
    // 4.2 批量翻译（5秒超时，失败返回原文）
    const batchResults = await session.executeStage(
      'batch_translate',
      async (signal) => {
        // 如果紧急翻译已覆盖全部，跳过批量
        if (urgentResults.length >= subtitleData.subtitles.length) {
          console.log('[service-worker] 紧急翻译已覆盖全部，跳过批量翻译');
          return urgentResults;
        }
        
        return await translator.translateBatch(
          subtitleData.subtitles,
          urgentResults,
          preferences,
          signal
        );
      },
      {
        timeoutMs: 5000,
        fallback: subtitleData.subtitles  // 失败返回原文
      }
    );
    
    // ========== Stage 5: 保存结果 ==========
    const finalResults = mergeTranslationResults(urgentResults, batchResults);
    
    // 设置状态为ACTIVE
    await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
    
    // 完成会话
    session.complete();
    
    // 异步保存缓存
    saveTranslationCache(
      videoId,
      sourceLang,
      preferences,
      subtitleData.subtitles,
      finalResults
    );
    
    return {
      success: true,
      action: 'started',
      data: {
        originalSubtitles: subtitleData.subtitles,
        translatedSubtitles: finalResults,
        sourceLang,
        targetLang: preferences.targetLang
      }
    };
    
  } catch (error: any) {
    console.error('[service-worker] 翻译失败:', error);
    
    // 根据错误类型处理
    let userMessage = '';
    let errorLevel = ErrorLevel.ERROR;
    
    if (isTimeoutError(error)) {
      userMessage = getUserFriendlyMessage(error);
      errorLevel = ErrorLevel.WARNING;
    } else if (isAbortError(error)) {
      // 用户取消，静默处理
      console.log('[service-worker] 用户取消翻译');
    } else {
      userMessage = error.message || '翻译失败';
    }
    
    // 取消会话
    session.abort(error.message);
    
    // 回退状态
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    
    // 通知UI
    if (userMessage && tabId) {
      await notifyTranslationError(tabId, userMessage, errorLevel);
    }
    
    return {
      success: false,
      error: error.message || '翻译失败'
    };
  }
}

// ========== 辅助函数 ==========

/**
 * 带信号的翻译执行
 */
async function executeTranslationWithSignal(
  data: any,
  preferences: any,
  signal: AbortSignal
): Promise<any> {
  // TODO: 改造executeTranslation支持signal
  return executeTranslation(data, preferences);
}

/**
 * 带信号的轨道获取
 */
async function fetchTracksWithSignal(
  tabId: number,
  videoId: string,
  signal: AbortSignal
): Promise<any[]> {
  const message = {
    type: 'getVideoTrackData',
    videoId
  };
  
  const response = await sendMessageWithSignal(tabId, message, signal);
  return response.tracks || [];
}

/**
 * 带信号的字幕语言设置
 */
async function setSubtitleLanguageWithSignal(
  tabId: number,
  langCode: string,
  signal: AbortSignal
): Promise<void> {
  const message = {
    type: 'setSubtitleTrackAPI',
    langCode
  };
  
  await sendMessageWithSignal(tabId, message, signal);
}

/**
 * 异步保存翻译缓存
 */
function saveTranslationCache(
  videoId: string,
  sourceLang: string,
  preferences: any,
  originalSubtitles: any[],
  translatedSubtitles: any[]
): void {
  Promise.resolve().then(async () => {
    try {
      const cacheManager = TranslationCacheManager.getInstance();
      await cacheManager.set({
        videoId,
        sourceLang,
        targetLang: preferences.targetLang,
        translationService: preferences.translationService,
        originalSubtitles,
        translatedSubtitles,
        lastUsed: Date.now(),
        dataHash: ''
      });
      console.log('[service-worker] ✓ 翻译结果已异步缓存');
    } catch (err) {
      console.error('[service-worker] 缓存保存失败:', err);
    }
  });
}

/**
 * 异步保存轨道元数据
 */
function saveTrackMetadata(
  videoId: string,
  tracks: any[],
  selectedLang: string
): void {
  Promise.resolve().then(async () => {
    try {
      const videoSourceManager = VideoSourceLanguageCacheManager.getInstance();
      const trackMetadata = tracks.map((track: any) => ({
        languageCode: track.languageCode,
        name: track.name,
        kind: track.kind
      }));
      
      await videoSourceManager.set(videoId, {
        videoId,
        availableSourceLanguages: trackMetadata,
        lastSelectedLanguage: selectedLang,
        lastUpdated: Date.now()
      });
      
      console.log('[service-worker] ✓ 轨道元数据已异步缓存');
    } catch (err) {
      console.error('[service-worker] 轨道缓存失败:', err);
    }
  });
}

/**
 * 合并翻译结果
 */
function mergeTranslationResults(
  urgentResults: any[],
  batchResults: any[]
): any[] {
  // TODO: 实现合并逻辑
  return batchResults;
}

/**
 * 通知翻译错误
 */
async function notifyTranslationError(
  tabId: number,
  message: string,
  level: ErrorLevel
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_ERROR_MESSAGE',
      data: {
        message,
        level: level.toString(),
        duration: 3000
      }
    });
  } catch (err) {
    console.error('[service-worker] 发送错误消息失败:', err);
  }
}

// 导出重构后的函数
export { handleToggleTranslateRefactored };