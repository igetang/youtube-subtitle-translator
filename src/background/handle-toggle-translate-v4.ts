/**
 * @file handle-toggle-translate-v4.ts
 * @description 使用AbortController架构的翻译切换处理函数
 * @version 4.0
 * @date 2025-09-09
 */

import type { ToggleTranslateRequest, ToggleTranslateResponse } from '../shared/types/message-types';
import { TranslateActiveState } from '../shared/types/runtime-state-types';
import { ERROR_MESSAGE_DURATION } from '../shared/constants';

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
import { createVttString, parseVttString } from '../shared/utils/vtt-utils';

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
  
  const {
    videoId,
    newState,
    originalSubtitleState,
    sourceLang: requestedSourceLang,
    targetLang: requestedTargetLang,
    reuseOriginalSubtitles,
    currentTime
  } = data;
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
    
    console.debug('[debug][service-worker-v4] → 获取用户偏好:', {
      targetLang: preferences.targetLang,
      service: preferences.translationService?.type,
      requestedSourceLang,
      requestedTargetLang,
      reuseOriginalSubtitles
    });
    
    // ========== Stage 2: 获取源语言信息 ==========
    console.log('[service-worker-v4] → Stage 2: 获取源语言信息');
    const sourceData = await videoSourceLanguageCacheManager.get(videoId);
    // 输出缓存查询结果
    console.debug(
      sourceData
        ? `[debug][service-worker-v4] Stage 2: 源语言缓存 [命中] | 可用轨道: ${sourceData.availableSourceLanguages?.length || 0}个${sourceData.selectedSourceTrack ? ' | 已选: ' + sourceData.selectedSourceTrack.languageCode + (sourceData.selectedSourceTrack.kind ? ' (' + sourceData.selectedSourceTrack.kind + ')' : '') : ''}`
        : '[debug][service-worker-v4] Stage 2: 源语言缓存 [未命中]'
    );
    let sourceLang = 'auto';
    let sourceKind: string | undefined;

    // 如果有缓存的轨道信息，先尝试使用缓存选择源语言
    if (sourceData?.availableSourceLanguages?.length > 0) {
      const availableTracks = sourceData.availableSourceLanguages;
      const cachedTrack = sourceData.selectedSourceTrack;

      const matchWithKind = (candidates: any[], preferredKind: string | undefined) => {
        if (!candidates.length) {
          return undefined;
        }
        if (preferredKind === 'asr' || preferredKind === 'forced') {
          const exact = candidates.find(track => track.kind === preferredKind);
          if (exact) {
            return exact;
          }
        }
        // 如果首选不是特殊轨道，优先选非ASR
        const manual = candidates.find(track => !track.kind);
        return manual || candidates[0];
      };

      let sourceTrack: { languageCode: string; kind?: string } | undefined;

      if (requestedSourceLang) {
        const candidates = availableTracks.filter(track => track.languageCode === requestedSourceLang);
        sourceTrack = matchWithKind(candidates, cachedTrack?.languageCode === requestedSourceLang ? cachedTrack.kind : undefined);
      }

      if (!sourceTrack && cachedTrack) {
        const candidates = availableTracks.filter(track => track.languageCode === cachedTrack.languageCode);
        sourceTrack = matchWithKind(candidates, cachedTrack.kind) || cachedTrack;
      }

      if (!sourceTrack) {
        if (requestedSourceLang) {
          console.log('[service-worker-v4] ⚠ 源语言 ' + requestedSourceLang + ' 不可用，可选: ' +
                      availableTracks.map((track: any) => track.languageCode + (track.kind ? '(' + track.kind + ')' : '')).join(', '));
        }
        sourceTrack = selectBestSourceLanguage(
          availableTracks,
          preferences.targetLang,
          cachedTrack
        );
      }

      sourceLang = sourceTrack.languageCode;
      sourceKind = sourceTrack.kind;
      console.log('[service-worker-v4] ✓ 选择源语言: ' + sourceLang +
                  (sourceKind ? ' (' + sourceKind + ')' : '') +
                  (requestedSourceLang ? ' [用户指定]' : ' [自动选择]'));
    }

    const sendSetSubtitleTrack = async (langCode?: string, kind?: string) => {
      if (!langCode || langCode === 'auto') {
        console.log('[service-worker-v4] 跳过设置字幕轨道: 语言=' + (langCode || 'auto'));
        return;
      }

      const setSubtitlePayload = {
        type: 'setSubtitleTrackAPI',
        langCode,
        kind  // 传递 kind 以支持精确匹配
      };

      try {
        console.debug('[debug][service-worker-v4] → 设置字幕轨道: ' + langCode + (kind ? ' (' + kind + ')' : ''));
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
      sourceKind,
      preferences.targetLang,
      preferences.translationService
    );

    if (cachedResult) {
      console.log('[service-worker-v4] ✓ 命中完整缓存');

      // 即使缓存命中也要切换字幕轨道
      await sendSetSubtitleTrack(sourceLang, sourceKind);

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
        // 获取可用字幕轨道（先尝试playerResponse，再兜底Player API）
        const trackResponse = await session.executeStage(
          'get_tracks',
          async (signal) => {
            let response = null;

            // 路径1：playerResponse.captionTracks（与Popup一致）
            try {
              const requestPayload = {
                type: 'getVideoTrackData',
                videoId: videoId
              };
              console.debug('[debug][service-worker-v4] → 获取视频轨道数据 (playerResponse)');
              response = await chrome.tabs.sendMessage(tabId, requestPayload);
              if (response?.success) {
                console.debug('[debug][service-worker-v4] ✓ 获取到 ' + (response.tracks?.length || 0) + ' 个轨道（playerResponse）');
              } else {
                console.debug('[debug][service-worker-v4] ✗ playerResponse 获取轨道失败');
              }
            } catch (responseError) {
              console.warn('[service-worker-v4] playerResponse 获取轨道异常，将尝试Player API', responseError);
            }

            // 路径2：Player API tracklist（兜底）
            if (!response?.success || !response.tracks?.length) {
              try {
                console.debug('[debug][service-worker-v4] → 获取视频轨道数据 (Player API)');
                const apiResponse = await chrome.tabs.sendMessage(tabId, {
                  type: 'getSubtitleTracksAPI'
                });
                if (apiResponse?.success && apiResponse.tracks?.length) {
                  console.debug('[debug][service-worker-v4] ✓ 获取到 ' + apiResponse.tracks.length + ' 个轨道（Player API）');
                  response = apiResponse;
                } else {
                  console.debug('[debug][service-worker-v4] ✗ Player API 获取轨道失败');
                }
              } catch (apiError) {
                console.warn('[service-worker-v4] Player API 获取轨道异常', apiError);
              }
            }

            return response;
          },
          { timeoutMs: 15000 }
        );

        if (trackResponse?.success && trackResponse.tracks?.length > 0) {
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
            sourceData?.selectedSourceTrack
          );
          sourceLang = sourceTrack.languageCode;
          sourceKind = sourceTrack.kind;
          console.log('[service-worker-v4] ✓ 智能选择并设置: ' + sourceLang +
                      (sourceKind ? ' (' + sourceKind + ')' : '') +
                      ' | 可用: ' + trackResponse.tracks.length + '个');

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
                selectedSourceTrack: sourceTrack
              });
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
      console.log(`[service-worker-v4] 已有缓存轨道信息，源语言: ${sourceLang}` +
                  (sourceKind ? ` (${sourceKind})` : ''));
      await sendSetSubtitleTrack(sourceLang, sourceKind);
    }

    // ========== Stage 4: 获取字幕（5秒超时）==========
    console.log('[service-worker-v4] → Stage 4: 获取字幕');

    let subtitleData: SubtitleData | null = null;

    if (reuseOriginalSubtitles && sourceLang && sourceLang !== 'auto') {
      try {
        const cachedEntries = await translationCacheManager.findByVideoAndSourceLang(videoId, sourceLang);
        const reusableEntry = cachedEntries.find(entry => entry.originalSubtitles);

        if (reusableEntry?.originalSubtitles) {
          const parsed = parseVttString(reusableEntry.originalSubtitles, false);
          if (parsed.length > 0) {
            subtitleData = {
              subtitles: parsed.map((entry, idx) => ({
                text: entry.text,
                start: entry.start,
                end: entry.start + entry.duration,
                index: idx
              })),
              sourceLang: sourceLang,
              currentTime: typeof currentTime === 'number' ? currentTime : 0
            };
            console.log('[service-worker-v4] ✓ 复用缓存字幕: ' + parsed.length + ' 条');
          }
        }
      } catch (error) {
        console.warn('[service-worker-v4] 查找缓存原始字幕失败，继续正常抓取:', error);
      }
    }

    if (!subtitleData) {
      await session.executeStage(
        'trigger_load',
        async (signal) => {
          const triggerPayload = {
            type: 'TRIGGER_SUBTITLE_LOAD',
            sourceLang: sourceLang,
            sourceKind: sourceKind,
            originalSubtitleState: originalSubtitleState  // 传递原始状态
          };
          console.debug('[debug][service-worker-v4] → 触发字幕加载' +
                      (triggerPayload.sourceLang ? ': ' + triggerPayload.sourceLang : ''));
          await chrome.tabs.sendMessage(tabId, triggerPayload);
          return true;
        },
        { timeoutMs: 2000 }
      );

      console.log('[service-worker-v4] 等待字幕数据响应...');
      subtitleData = await session.executeStage(
        'subtitle_fetch',
        async (signal) => {
          return new Promise((resolve, reject) => {
            let resolved = false;

            const messageListener = (message: any, msgSender: any) => {
              if (message.type === 'SUBTITLE_DATA' &&
                  msgSender.tab?.id === tabId &&
                  message.data?.videoId === videoId) {
                if (!resolved) {
                  resolved = true;
                  chrome.runtime.onMessage.removeListener(messageListener);
                  console.log('[service-worker-v4] ✓ 接收字幕数据: ' +
                              (message.data?.subtitles?.length || 0) + ' 条' +
                              (message.data?.sourceLang ? ' (' + message.data.sourceLang + ')' : ''));
                  resolve(message.data as SubtitleData);
                }
                return true;
              }
            };

            chrome.runtime.onMessage.addListener(messageListener);

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
          timeoutMs: 15000,
          critical: true  // 字幕获取失败则终止
        }
      );
    } else {
      console.log('[service-worker-v4] 使用缓存字幕数据，跳过字幕抓取阶段');
    }
    
    // 验证字幕数据
    if (!subtitleData?.subtitles || subtitleData.subtitles.length === 0) {
      throw new Error('当前视频无字幕');
    }

    const effectiveSubtitleData = subtitleData as SubtitleData;

    console.log(`[service-worker-v4] Stage 4: 字幕数据 [就绪] | ${effectiveSubtitleData.subtitles.length} 条 | 源语言: ${sourceLang}`);

    // 如果字幕数据中包含源语言信息，且当前是auto，更新源语言
    if (effectiveSubtitleData.sourceLang && sourceLang === 'auto') {
      sourceLang = effectiveSubtitleData.sourceLang;
      console.log(`[service-worker-v4] 使用字幕数据中的源语言: ${sourceLang}`);
    }
    
    // ========== Stage 4: 执行翻译 ==========
    console.log('[service-worker-v4] → Stage 4: 执行翻译');
    
    // 创建翻译器
    const translator = new TwoPhaseTranslatorV4();
    
    // 设置实际的翻译服务（使用用户配置的服务）
    translator.setTranslationService(preferences.translationService);
    
    // 执行紧急翻译（30秒超时 - DeepSeek专用）
    let urgentResults: any[] = [];
    let urgentError: any = null;

    try {
      urgentResults = await session.executeStage(
        'urgent_translate',
        async (signal) => {
          return await translator.translateUrgent(
            effectiveSubtitleData.subtitles,
            effectiveSubtitleData.currentTime || 0,
            preferences,
            signal
          );
        },
        {
          timeoutMs: 30000
          // 移除 fallback，让错误抛出以便判断是否为致命错误
        }
      );
    } catch (error) {
      urgentError = error;
      console.warn('[service-worker-v4] ⚠️ 紧急翻译失败:', error);

      // 判断是否为致命错误（API密钥问题）
      const category = (error as { category?: string })?.category;
      const errorMsg = error.message || '';
      const isFatalError =
        category === 'fatal' ||
        errorMsg.includes('API密钥') ||
        errorMsg.includes('密钥未配置') ||
        errorMsg.includes('密钥无效') ||
        (error as any).status === 401 ||
        (error as any).status === 403;

      if (isFatalError) {
        console.error('[service-worker-v4] ❌ 致命错误（API密钥问题），终止翻译流程');
        throw error; // 直接抛出，进入外层catch
      }

      // 可重试错误（如超时），继续执行批量翻译
      console.log('[service-worker-v4] 非致命错误（如超时），将继续尝试批量翻译');
    }

    // 紧急翻译完成日志已在 TwoPhaseTranslatorV4 中打印

    // 检查紧急翻译是否失败
    if (urgentResults.length === 0) {
      console.log('[service-worker-v4] ⚠️ 紧急翻译失败，继续批量翻译');

      // 发送警告消息给用户
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_WARNING_MESSAGE',
          data: {
            message: '快速翻译失败，正在执行完整翻译...',
            level: 'warning',
            duration: ERROR_MESSAGE_DURATION
          }
        });
      } catch (err) {
        console.error('[service-worker-v4] 发送警告消息失败:', err);
      }
    } else {
      // 立即发送紧急翻译结果到content-script显示
      console.log('[service-worker-v4] → 发送紧急翻译结果到前端显示');

      // 构建紧急翻译的字幕数据 - 统一为SubtitleEntry格式
      const urgentSubtitles = effectiveSubtitleData.subtitles.map((sub: any, idx: number) => {
        const result = urgentResults.find(r => r.index === idx);
        if (result) {
          return {
            start: sub.start,
            duration: sub.end - sub.start,
            text: result.originalText,  // 使用处理后的单行文本
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

    // 动态计算批量翻译总超时：批次数 × 单批超时
    const subtitleCount = effectiveSubtitleData.subtitles.length;
    const serviceType = preferences.translationService?.type;

    // 根据翻译服务类型计算批次数和单批超时
    let estimatedBatches = 1;
    let perBatchTimeout = 5000; // 默认5秒

    if (serviceType === 'deepseek') {
      // DeepSeek: 20条/批，单批30秒
      estimatedBatches = Math.ceil(subtitleCount / 20);
      perBatchTimeout = 30000;
    } else if (serviceType === 'google-free' || serviceType === 'google') {
      // 谷歌: 智能分批（约120条限制），单批5秒
      estimatedBatches = Math.ceil(subtitleCount / 120);
      perBatchTimeout = 5000;
    } else if (serviceType === 'microsoft-free' || serviceType === 'microsoft') {
      // 微软: 不预先分批，估算1批，单批5秒
      estimatedBatches = 1;
      perBatchTimeout = 5000;
    } else {
      // 其他服务: 默认估算（假设20条/批）
      estimatedBatches = Math.ceil(subtitleCount / 20);
      perBatchTimeout = 10000;
    }

    const batchTotalTimeout = estimatedBatches * perBatchTimeout;
    console.log(
      `[service-worker-v4] 批量翻译超时设置: ${subtitleCount}条字幕, ` +
      `预计${estimatedBatches}批 × ${perBatchTimeout}ms = ${batchTotalTimeout}ms总超时`
    );

    // 执行批量翻译（动态总超时）
    const batchResults = await session.executeStage(
      'batch_translate',
      async (signal) => {
        // 如果紧急翻译已覆盖全部，跳过
        if (urgentResults.length >= effectiveSubtitleData.subtitles.length) {
          console.log('[service-worker-v4] 紧急翻译已覆盖全部，跳过批量');
          return [];
        }

        return await translator.translateBatch(
          effectiveSubtitleData.subtitles,
          urgentResults,
          preferences,
          signal
        );
      },
      {
        timeoutMs: batchTotalTimeout
        // 不设置fallback，让错误向上抛出
      }
    );

    // 批量翻译完成日志已在 TwoPhaseTranslatorV4 中打印

    // ========== Stage 5: 构建和发送最终完整结果 ==========
    // 构建完整字幕数据（基于批量翻译结果）
    const finalSubtitles = effectiveSubtitleData.subtitles.map((sub: any, idx: number) => {
      const result = batchResults.find(r => r.index === idx);
      return {
        start: sub.start,
        duration: sub.end - sub.start,
        text: result?.originalText || sub.text,  // 优先使用处理后的单行文本
        translation: result?.translatedText || sub.text,
        id: String(sub.start),
        isUrgent: false  // 全部标记为非紧急（白色显示）
      };
    });

    // 为缓存准备VTT格式（原始字幕）
    const originalVtt = createVttString(
      effectiveSubtitleData.subtitles.map((sub: any, idx: number) => {
        const result = batchResults.find(r => r.index === idx);
        return {
          start: sub.start,
          duration: sub.end - sub.start,
          text: result?.originalText || sub.text,  // 使用处理后的单行文本
          id: String(sub.start)
        };
      })
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

    // 异步保存缓存（使用VTT格式）
    saveTranslationCacheAsync(
      videoId,
      sourceLang,
      sourceKind,       // 传递sourceKind
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

    // 分析错误类型，使用 getUserFriendlyMessage 统一处理
    let userMessage = '';
    let errorLevel = ErrorLevel.ERROR;

    if (isTimeoutError(error)) {
      userMessage = getUserFriendlyMessage(error);
      errorLevel = getErrorLevel(error);
      console.log('[service-worker-v4] 超时错误:', error.stage);
    } else if (isAbortError(error)) {
      // 用户取消会话，提示用户并记录信息
      userMessage = '翻译已取消';
      errorLevel = ErrorLevel.INFO;
      console.log('[service-worker-v4] 用户取消翻译');
    } else if ((error as any).category) {
      const category = (error as any).category;
      userMessage = error.message || getUserFriendlyMessage(error);
      errorLevel = category === 'fatal' ? ErrorLevel.ERROR : ErrorLevel.WARNING;
    } else {
      // 使用统一的错误消息映射（去掉技术细节）
      userMessage = getUserFriendlyMessage(error);
      errorLevel = getErrorLevel(error);
    }

    // 取消会话
    session.abort(error.message);

    // 🔥 第一步：先清除字幕（通过发送消息到content-script）
    if (tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'CLEAR_SUBTITLE_OVERLAY'
        });
        console.log('[service-worker-v4] → 已清除字幕显示');
      } catch (err) {
        console.error('[service-worker-v4] 清除字幕失败:', err);
      }
    }

    // 🔥 第二步：显示错误消息（完整的5秒显示）
    if (userMessage && tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_ERROR_MESSAGE',
          data: {
            message: userMessage,
            level: errorLevel.toString(),
            duration: ERROR_MESSAGE_DURATION
          }
        });
        console.log('[service-worker-v4] → 已发送错误消息到前端');
      } catch (err) {
        console.error('[service-worker-v4] 发送错误消息失败:', err);
      }
    }

    // 🔥 第三步：回退状态（此时UI变更不会再清除字幕）
    console.log('[service-worker-v4] → 设置状态为 INACTIVE（错误回退）');
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);

    // 通知UI状态变更
    console.log('[service-worker-v4] → 通知UI状态变更: INACTIVE（错误回退）');
    await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);
    
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
  sourceKind: 'asr' | 'forced' | undefined,
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
        sourceKind,  // 添加sourceKind字段
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
