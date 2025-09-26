/**
 * @file handle-toggle-translate-v4.ts
 * @description 使用AbortController架构的翻译切换处理函数
 * @version 4.0
 * @date 2025-09-09
 */

import type { ToggleTranslateRequest, ToggleTranslateResponse } from '../shared/types/message-types';
import { TranslateActiveState } from '../shared/types/runtime-state-types';

// 定义字幕数据接口
interface SubtitleData {
  subtitles: Array<{
    text: string;
    start: number;
    end: number;
    index?: number;
  }>;
  sourceLang?: string;
  currentTime?: number;
  videoId?: string;
}
import { abortTimeoutManager } from './components/abort-timeout-manager';
import { 
  StageTimeoutError, 
  SessionAbortError, 
  isTimeoutError, 
  isAbortError,
  getUserFriendlyMessage,
  getErrorLevel,
  ErrorLevel
} from '../shared/types/timeout-errors';
import { 
  sendMessageWithSignal, 
  fetchSubtitlesWithSignal,
  triggerSubtitleLoadWithSignal 
} from './components/message-with-signal';
import { TwoPhaseTranslatorV4 } from './components/two-phase-translator-v4';
import { createVttString } from '../shared/utils/vtt-utils';

/**
 * 处理翻译开关切换 - 使用AbortController架构v4.0
 */
export async function handleToggleTranslateV4(
  sender: chrome.runtime.MessageSender,
  data: ToggleTranslateRequest,
  dependencies: {
    runtimeStateManager: any;
    userPreferencesManager: any;
    videoSourceLanguageCacheManager: any;
    translationCacheManager: any;
    selectBestSourceLanguage: any;
    notifyStateChange: any;
  }
): Promise<ToggleTranslateResponse> {
  const {
    runtimeStateManager,
    userPreferencesManager,
    videoSourceLanguageCacheManager,
    translationCacheManager,
    selectBestSourceLanguage,
    notifyStateChange
  } = dependencies;
  
  const { videoId, newState, originalSubtitleState, sourceLang: requestedSourceLang } = data;
  const tabId = sender.tab?.id;
  
  if (!tabId) {
    console.error('[service-worker-v4] 无法获取标签页ID');
    return {
      success: false,
      action: 'error',
      error: '无法获取标签页信息'
    };
  }
  
  const sessionId = `translate_${tabId}_${videoId}`;
  
  // ========== 关闭翻译 ==========
  if (!newState) {
    console.log('[service-worker-v4] 关闭翻译，取消会话:', sessionId);
    
    // 取消当前会话
    if (abortTimeoutManager.hasSession(sessionId)) {
      abortTimeoutManager.abortSession(sessionId);
      console.log('[service-worker-v4] ✓ 会话已取消');
    }
    
    // 设置状态为INACTIVE
    console.log('[service-worker-v4] → 设置状态为 INACTIVE');
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    
    // 通知UI状态变更
    console.log('[service-worker-v4] → 通知UI状态变更: INACTIVE');
    await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);
    
    return {
      success: true,
      action: 'stopped',
      message: '翻译已关闭'
    };
  }
  
  // ========== 开启翻译 ==========
  console.log('[service-worker-v4] 开启翻译，创建会话:', sessionId);
  
  // 创建新会话
  const session = abortTimeoutManager.createSession(sessionId);
  
  try {
    // 设置PENDING状态
    await runtimeStateManager.setTranslateState(TranslateActiveState.PENDING);
    
    // ========== Stage 1: 获取配置（无需超时）==========
    const preferences = await userPreferencesManager.getUserPreferences();
    
    if (!preferences || !preferences.translationService) {
      throw new Error('用户偏好配置不完整：缺少 translationService');
    }
    
    console.log('[service-worker-v4] → 获取用户偏好:', {
      targetLang: preferences.targetLang,
      service: preferences.translationService?.type
    });
    
    // ========== Stage 2: 获取源语言信息 ==========
    console.log('[service-worker-v4] → Stage 2: 获取源语言信息');
    const sourceData = await videoSourceLanguageCacheManager.get(videoId);
    console.debug('[debug][service-worker-v4] Stage 2 源语言缓存查询结果', {
      hasCache: Boolean(sourceData),
      availableCount: sourceData?.availableSourceLanguages?.length || 0,
      lastSelectedLanguage: sourceData?.lastSelectedLanguage,
      selectedTrack: sourceData?.selectedSourceTrack ? {
        languageCode: sourceData.selectedSourceTrack.languageCode,
        kind: sourceData.selectedSourceTrack.kind ?? null
      } : null
    });
    let sourceLang = 'auto';
    let sourceKind: string | undefined;

    // 如果有缓存的轨道信息，先尝试使用缓存选择源语言
    if (sourceData?.availableSourceLanguages?.length > 0) {
      const preferredLang = requestedSourceLang ?? sourceData.lastSelectedLanguage;
      let sourceTrack = preferredLang
        ? sourceData.availableSourceLanguages.find((track: any) => track.languageCode === preferredLang)
        : undefined;

      if (!sourceTrack) {
        if (preferredLang) {
          console.debug('[debug][service-worker-v4] 缓存中未找到指定源语言，回退智能选择', {
            requestedSourceLang: preferredLang,
            available: sourceData.availableSourceLanguages.map((track: any) => track.languageCode)
          });
        }
        sourceTrack = selectBestSourceLanguage(
          sourceData.availableSourceLanguages,
          preferences.targetLang,
          sourceData.lastSelectedLanguage
        );
      }

      sourceLang = sourceTrack.languageCode;
      sourceKind = sourceTrack.kind;
      console.debug('[debug][service-worker-v4] 使用缓存的轨道信息选择源语言', {
        sourceLang,
        sourceKind,
        requestedSourceLang,
        cachedSelected: sourceData.selectedSourceTrack,
        cachedLastSelectedLanguage: sourceData.lastSelectedLanguage
      });
    }

    const sendSetSubtitleTrack = async (langCode?: string, kind?: string) => {
      if (!langCode || langCode === 'auto') {
        console.debug('[debug][service-worker-v4] 跳过 setSubtitleTrackAPI（源语言为空或auto）', {
          langCode,
          kind
        });
        return;
      }

      const setSubtitlePayload = {
        type: 'setSubtitleTrackAPI',
        langCode
      };

      try {
        console.debug('[debug][service-worker-v4] → setSubtitleTrackAPI 请求', {
          tabId,
          payload: setSubtitlePayload,
          kind
        });
        const setResult = await chrome.tabs.sendMessage(tabId, setSubtitlePayload);
        if (setResult?.success) {
          console.debug('[debug][service-worker-v4] ← setSubtitleTrackAPI 成功响应', setResult);
        } else {
          console.warn('[service-worker-v4] setSubtitleTrackAPI 返回失败，将依赖字幕按钮触发', setResult);
        }
      } catch (apiError) {
        console.warn('[service-worker-v4] setSubtitleTrackAPI 调用异常，将依赖字幕按钮触发', apiError);
      }
    };

    // 检查完整缓存（使用初步选择的源语言）
    const cachedResult = await translationCacheManager.get(
      videoId,
      sourceLang,
      preferences.targetLang,
      preferences.translationService
    );

    if (cachedResult) {
      console.log('[service-worker-v4] ✓ 命中完整缓存');
      console.log('[service-worker-v4] → 设置状态为 ACTIVE（缓存命中）');
      await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
      session.complete();

      // 通知UI
      console.log('[service-worker-v4] → 通知UI状态变更: ACTIVE（缓存命中）');
      await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);

      return {
        success: true,
        action: 'cached',
        data: cachedResult
      };
    }

    // ========== Stage 3: 获取字幕轨道（如果需要）==========
    console.log('[service-worker-v4] → Stage 3: 获取字幕轨道');

    // 如果没有缓存的轨道信息，或源语言仍是auto，主动获取轨道
    if (!sourceData?.availableSourceLanguages?.length || sourceLang === 'auto') {
      try {
        console.log('[service-worker-v4] 需要获取字幕轨道信息');

        // 获取可用字幕轨道
        const trackResponse = await session.executeStage(
          'get_tracks',
          async (signal) => {
            const requestPayload = {
              type: 'getVideoTrackData',
              videoId: videoId
            };
            console.debug('[debug][service-worker-v4] → getVideoTrackData 请求', {
              tabId,
              payload: requestPayload
            });
            const response = await chrome.tabs.sendMessage(tabId, requestPayload);
            console.debug('[debug][service-worker-v4] ← getVideoTrackData 响应', {
              success: response?.success,
              trackCount: response?.tracks?.length,
              keys: response ? Object.keys(response) : []
            });
            return response;
          },
          { timeoutMs: 5000 }  // 增加超时时间到5秒
        );

        if (trackResponse?.success && trackResponse.tracks?.length > 0) {
          console.log(`[service-worker-v4] 获取到 ${trackResponse.tracks.length} 条轨道信息`);
          try {
            const trackSnapshot = trackResponse.tracks.slice(0, 6).map((track: any) => ({
              languageCode: track.languageCode,
              name: track.name,
              vssId: track.vssId ?? track.vss_id ?? null,
              kind: track.kind ?? null,
              hasBaseUrl: Boolean(track.baseUrl)
            }));
            console.debug('[debug][service-worker-v4] 轨道快照(前6条)', trackSnapshot);
          } catch (snapshotError) {
            console.warn('[service-worker-v4] 轨道快照记录失败:', snapshotError);
          }

          // 使用智能选择算法选择最佳源语言
          const sourceTrack = selectBestSourceLanguage(
            trackResponse.tracks,
            preferences.targetLang,
            sourceData?.lastSelectedLanguage
          );
          sourceLang = sourceTrack.languageCode;
          sourceKind = sourceTrack.kind;
          console.debug('[debug][service-worker-v4] 智能选择源语言', {
            sourceLang,
            sourceKind,
            lastSelectedLanguage: sourceData?.lastSelectedLanguage
          });

          await sendSetSubtitleTrack(sourceLang, sourceKind);

          // 异步缓存轨道信息（不阻塞主流程）
          Promise.resolve().then(async () => {
            try {
              const trackMetadata = trackResponse.tracks.map((track: any) => ({
                languageCode: track.languageCode,
                name: track.name,
                kind: track.kind
              }));

              await videoSourceLanguageCacheManager.set({
                videoId: videoId,
                availableSourceLanguages: trackMetadata,
                lastSelectedLanguage: sourceLang
              });

              console.log('[service-worker-v4] ✓ 轨道元数据已缓存');
            } catch (err) {
              console.error('[service-worker-v4] 轨道缓存失败:', err);
            }
          });
        } else {
          console.warn('[service-worker-v4] 未能获取轨道信息，继续使用auto');
          sourceLang = 'auto';
        }
      } catch (error) {
        console.warn('[service-worker-v4] 获取轨道信息失败，继续使用auto:', error);
        sourceLang = 'auto';
      }
    } else {
      console.log(`[service-worker-v4] 已有缓存轨道信息，源语言: ${sourceLang}`);
      await sendSetSubtitleTrack(sourceLang, sourceKind);
    }

    // ========== Stage 4: 获取字幕（5秒超时）==========
    console.log('[service-worker-v4] → Stage 4: 获取字幕');
    
    // 先触发字幕加载
    await session.executeStage(
      'trigger_load',
      async (signal) => {
        const triggerPayload = {
          type: 'TRIGGER_SUBTITLE_LOAD',
          sourceLang: sourceLang,
          sourceKind: sourceKind,
          originalSubtitleState: originalSubtitleState  // 传递原始状态
        };
        console.debug('[debug][service-worker-v4] → TRIGGER_SUBTITLE_LOAD 请求', {
          tabId,
          payload: triggerPayload
        });
        await chrome.tabs.sendMessage(tabId, triggerPayload);
        console.debug('[debug][service-worker-v4] ← TRIGGER_SUBTITLE_LOAD 已发送');
        return true;
      },
      { timeoutMs: 2000 }
    );
    
    // 等待字幕数据（关键的5秒超时）
    console.log('[service-worker-v4] 等待字幕数据响应...');
    const subtitleData: SubtitleData = await session.executeStage(
      'subtitle_fetch',
      async (signal) => {
        return new Promise((resolve, reject) => {
          let resolved = false;
          
          // 设置消息监听器
          const messageListener = (message: any, msgSender: any) => {
            if (message.type === 'SUBTITLE_DATA' && 
                msgSender.tab?.id === tabId &&
                message.data?.videoId === videoId) {
              if (!resolved) {
                resolved = true;
                chrome.runtime.onMessage.removeListener(messageListener);
                console.debug('[debug][service-worker-v4] ← SUBTITLE_DATA', {
                  subtitleCount: message.data?.subtitles?.length,
                  sourceLang: message.data?.sourceLang,
                  hasTracks: Boolean(message.data?.tracks),
                  keys: Object.keys(message.data || {})
                });
                resolve(message.data);
              }
              return true;
            }
          };
          
          // 添加监听器
          chrome.runtime.onMessage.addListener(messageListener);
          
          // 监听abort信号
          signal.addEventListener('abort', () => {
            if (!resolved) {
              resolved = true;
              chrome.runtime.onMessage.removeListener(messageListener);
              reject(new StageTimeoutError('subtitle_fetch', 5000));
            }
          });
        });
      },
      { 
        timeoutMs: 5000,
        critical: true  // 字幕获取失败则终止
      }
    );
    
    // 验证字幕数据
    if (!subtitleData?.subtitles || subtitleData.subtitles.length === 0) {
      throw new Error('当前视频无字幕');
    }

    console.log(`[service-worker-v4] 获取到 ${subtitleData.subtitles.length} 条字幕`);
    console.debug('[debug][service-worker-v4] Stage 4 字幕数据概要', {
      subtitleCount: subtitleData.subtitles.length,
      sourceLang,
      sample: subtitleData.subtitles.slice(0, 3).map((sub: any, idx: number) => ({
        index: idx,
        start: sub.start,
        duration: sub.end ? sub.end - sub.start : sub.duration,
        textPreview: (sub.text || '').slice(0, 60)
      }))
    });

    // 如果字幕数据中包含源语言信息，且当前是auto，更新源语言
    if (subtitleData.sourceLang && sourceLang === 'auto') {
      sourceLang = subtitleData.sourceLang;
      console.log(`[service-worker-v4] 使用字幕数据中的源语言: ${sourceLang}`);
    }
    
    // ========== Stage 4: 执行翻译 ==========
    console.log('[service-worker-v4] → Stage 4: 执行翻译');
    
    // 创建翻译器
    const translator = new TwoPhaseTranslatorV4();
    
    // 设置实际的翻译服务（使用用户配置的服务）
    translator.setTranslationService(preferences.translationService);
    
    // 执行紧急翻译（5秒超时）
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
        fallback: []  // 失败返回空
      }
    );

    // 紧急翻译完成日志已在 TwoPhaseTranslatorV4 中打印

    // 立即发送紧急翻译结果到content-script显示
    if (urgentResults.length > 0) {
      console.log('[service-worker-v4] → 发送紧急翻译结果到前端显示');

      // 构建紧急翻译的字幕数据 - 统一为SubtitleEntry格式
      const urgentSubtitles = subtitleData.subtitles.map((sub: any, idx: number) => {
        const result = urgentResults.find(r => r.index === idx);
        if (result) {
          return {
            start: sub.start,
            duration: sub.end - sub.start,
            text: sub.text,
            translation: result.translatedText,
            id: String(sub.start),
            isUrgent: true  // 标记为紧急翻译
          };
        }
        return null;
      }).filter(Boolean);  // 过滤掉null值

      // 发送到content-script
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'TRANSLATION_UPDATE',
          data: {
            updateType: 'urgent',
            translatedSubtitles: urgentSubtitles  // SubtitleEntry[]格式
          }
        });
        console.log(`[service-worker-v4] ✓ 已发送 ${urgentSubtitles.length} 条紧急翻译`);
      } catch (err) {
        console.error('[service-worker-v4] 发送紧急翻译失败:', err);
      }
    }

    // 在紧急翻译和批量翻译之间等待5秒
    console.log('[service-worker-v4] → 等待5秒后开始批量翻译');

    // 检查会话是否已被取消
    if (session.isAborted()) {
      throw new DOMException('会话已被取消', 'AbortError');
    }

    // 简单的5秒延时
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 再次检查会话状态
    if (session.isAborted()) {
      console.log('[service-worker-v4] 等待期间会话被取消');
      throw new DOMException('等待期间会话被取消', 'AbortError');
    }

    // 执行批量翻译（60秒总超时，每批独立5秒超时）
    const batchResults = await session.executeStage(
      'batch_translate',
      async (signal) => {
        // 如果紧急翻译已覆盖全部，跳过
        if (urgentResults.length >= subtitleData.subtitles.length) {
          console.log('[service-worker-v4] 紧急翻译已覆盖全部，跳过批量');
          return [];
        }

        return await translator.translateBatch(
          subtitleData.subtitles,
          urgentResults,
          preferences,
          signal
        );
      },
      {
        timeoutMs: 60000,  // 总超时60秒（保护机制，每批独立5秒）
        fallback: []  // 失败返回空
      }
    );

    // 批量翻译完成日志已在 TwoPhaseTranslatorV4 中打印

    // ========== Stage 5: 构建和发送最终完整结果 ==========
    // 构建完整字幕数据（基于批量翻译结果）
    const finalSubtitles = subtitleData.subtitles.map((sub: any, idx: number) => {
      const result = batchResults.find(r => r.index === idx);
      return {
        start: sub.start,
        duration: sub.end - sub.start,
        text: sub.text,
        translation: result?.translatedText || sub.text,
        id: String(sub.start),
        isUrgent: false  // 全部标记为非紧急（白色显示）
      };
    });

    // 为缓存准备VTT格式（原始字幕）
    const originalVtt = createVttString(
      subtitleData.subtitles.map((sub: any) => ({
        start: sub.start,
        duration: sub.end - sub.start,
        text: sub.text,
        id: String(sub.start)
      }))
    );

    // 为缓存准备VTT格式（翻译字幕）- 基于finalSubtitles
    const translatedVtt = createVttString(
      finalSubtitles.map(sub => ({
        start: sub.start,
        duration: sub.duration,
        text: sub.translation || sub.text,
        id: sub.id
      }))
    );

    // 批量翻译完成后，发送完整的翻译结果（完全覆盖紧急翻译）
    if (batchResults.length > 0) {
      console.log('[service-worker-v4] → 发送批量翻译完整结果（完全覆盖）');

      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'TRANSLATION_UPDATE',
          data: {
            updateType: 'progressive',
            translatedSubtitles: finalSubtitles  // 完整的字幕列表
          }
        });
        console.log(`[service-worker-v4] ✓ 已发送批量翻译 ${finalSubtitles.length} 条（完全覆盖紧急翻译）`);
      } catch (err) {
        console.error('[service-worker-v4] 发送批量翻译失败:', err);
      }
    } else {
      console.log('[service-worker-v4] ⚠️ 批量翻译结果为空，使用紧急翻译结果');
    }

    // 异步保存缓存（使用VTT格式）
    saveTranslationCacheAsync(
      videoId,
      sourceLang,
      preferences,
      originalVtt,      // VTT格式
      translatedVtt,    // VTT格式
      translationCacheManager
    );

    // ========== Stage 6: 完成 ==========
    console.log('[service-worker-v4] → 设置状态为 ACTIVE');
    await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
    session.complete();

    // 通知UI
    console.log('[service-worker-v4] → 通知UI状态变更: ACTIVE');
    await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);

    return {
      success: true,
      action: 'streamed',  // V4架构标识：数据已通过TRANSLATION_UPDATE事件推送
      message: '翻译已通过实时更新完成'
      // 不返回data字段，避免重复处理
    };
    
  } catch (error: any) {
    console.error('[service-worker-v4] 翻译失败:', error);
    
    // 分析错误类型
    let userMessage = '';
    let errorLevel = ErrorLevel.ERROR;
    
    if (isTimeoutError(error)) {
      userMessage = getUserFriendlyMessage(error);
      errorLevel = getErrorLevel(error);
      console.log('[service-worker-v4] 超时错误:', error.stage);
    } else if (isAbortError(error)) {
      // 用户取消，静默处理
      console.log('[service-worker-v4] 用户取消翻译');
    } else {
      userMessage = error.message || '翻译失败';
    }
    
    // 取消会话
    session.abort(error.message);
    
    // 回退状态
    console.log('[service-worker-v4] → 设置状态为 INACTIVE（错误回退）');
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    
    // 通知UI状态变更
    console.log('[service-worker-v4] → 通知UI状态变更: INACTIVE（错误回退）');
    await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);
    
    // 显示错误消息
    if (userMessage && tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_ERROR_MESSAGE',
          data: {
            message: userMessage,
            level: errorLevel.toString(),
            duration: 3000
          }
        });
      } catch (err) {
        console.error('[service-worker-v4] 发送错误消息失败:', err);
      }
    }
    
    return {
      success: false,
      error: error.message || '翻译失败',
      action: 'error'
    };
  }
}

/**
 * 异步保存翻译缓存
 */
function saveTranslationCacheAsync(
  videoId: string,
  sourceLang: string,
  preferences: any,
  originalVtt: string,      // 改为VTT字符串
  translatedVtt: string,    // 改为VTT字符串
  cacheManager: any
): void {
  Promise.resolve().then(async () => {
    try {
      await cacheManager.set({
        videoId,
        sourceLang,
        targetLang: preferences.targetLang,
        translationService: preferences.translationService,
        originalSubtitles: originalVtt,      // VTT格式
        translatedSubtitles: translatedVtt,  // VTT格式
        lastUsed: Date.now(),
        dataHash: ''
      });
      console.log('[service-worker-v4] ✓ 翻译结果已异步缓存');
    } catch (err) {
      console.error('[service-worker-v4] 缓存保存失败:', err);
    }
  });
}
