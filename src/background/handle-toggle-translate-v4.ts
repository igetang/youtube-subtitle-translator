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
  sourceLanguageName?: string;
  sourceLanguageCode?: string;
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
import {
  TwoPhaseTranslatorV4,
  GOOGLE_TRANSLATE_BATCH_TIMEOUT_MS,
  DEEPSEEK_TIMEOUT_MS,
  OPENAI_TIMEOUT_MS,
  GEMINI_TIMEOUT_MS,
  DEEPL_TIMEOUT_MS,
  QWEN_TIMEOUT_MS,
  GOOGLE_TIMEOUT_MS,
  MICROSOFT_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS
} from './components/two-phase-translator-v4';
import { createVttString, parseVttString, mergeVttStrings, convertSubtitleEntriesToVtt } from '../shared/utils/vtt-utils';
import { LanguageCodeMapper } from '../shared/utils/language-code-mapper';
import { canReuseYouTubeTranslation, CaptionTrack } from '../shared/utils/youtube-subtitle-utils';

/**
 * 语言参数接口
 */
interface LanguageParams {
  source: string;  // 源语言参数（根据服务类型可能是code或name）
  target: string;  // 目标语言参数（根据服务类型可能是code或name）
}

/**
 * 提取语言代码的基础部分
 * @param langCode 语言代码 (如: "en-US", "zh-CN")
 * @returns 基础语言代码 (如: "en", "zh")
 */
function getBaseLangCode(langCode: string): string {
  if (!langCode || langCode.trim() === '' || langCode === 'auto') {
    return langCode;
  }
  return langCode.split('-')[0].toLowerCase();
}

/**
 * 根据翻译服务类型准备语言参数
 * 统一在最顶层转换一次，避免重复转换和日志打印
 *
 * @param sourceCode 源语言代码（如 'en', 'zh-CN'）
 * @param targetCode 目标语言代码（如 'ko', 'ja'）
 * @param serviceType 翻译服务类型
 * @returns 转换后的语言参数对象
 */
function prepareLanguageParams(
  sourceCode: string,
  targetCode: string,
  serviceType: string
): LanguageParams {
  const normalizedSourceCode = sourceCode && sourceCode.trim() !== '' ? sourceCode : 'auto';

  switch (serviceType) {
    case 'google-free':
    case 'microsoft-free':
    case 'google':
    case 'microsoft':
      // REST API 使用小写 code
      return {
        source: normalizedSourceCode.toLowerCase(),
        target: targetCode.toLowerCase()
      };

    case 'deepl': {
      // DeepL 使用映射后的大写 CODE（与DeepSeek/Gemini保持一致的架构）
      const deeplSource = LanguageCodeMapper.toDeepLSourceCode(normalizedSourceCode);
      const deeplTarget = LanguageCodeMapper.toDeepLTargetCode(targetCode);

      // ✅ 统一打印：整个翻译流程只打印1次语言转换日志
      console.debug(
        `[debug][LanguageCodeMapper] ${normalizedSourceCode} → ${deeplSource}, ${targetCode} → ${deeplTarget}`
      );
      console.log(
        `[service-worker-v4] 📋 DeepL API语言参数: ${deeplSource} → ${deeplTarget}`
      );

      return {
        source: deeplSource,
        target: deeplTarget
      };
    }

    case 'deepseek':
    case 'gemini':
      // Chat API 使用英文名称（静默模式）
      const sourceName = LanguageCodeMapper.toEnglishName(normalizedSourceCode, true);
      const targetName = LanguageCodeMapper.toEnglishName(targetCode, true);

      // ✅ 统一打印：整个翻译流程只打印1次语言转换日志
      console.debug(
        `[debug][LanguageCodeMapper] ${normalizedSourceCode} → ${sourceName}, ${targetCode} → ${targetName}`
      );
      console.log(
        `[service-worker-v4] 📋 Chat API语言参数: ${sourceName} → ${targetName}`
      );

      return {
        source: sourceName,
        target: targetName
      };

    default:
      // 默认使用小写 code
      return {
        source: normalizedSourceCode.toLowerCase(),
        target: targetCode.toLowerCase()
      };
  }
}

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
    sourceKind: requestedSourceKind,  // 用户指定的源语言类型（asr/forced/undefined）
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
      error: chrome.i18n.getMessage('error_tab_info_unavailable') || 'Unable to access tab information'
    };
  }

  const handlePlayerNotReady = () => {
    const notReadyError: any = new Error(
      chrome.i18n.getMessage('error_player_not_ready') || 'Player not ready yet, please try again later'
    );
    notReadyError.category = 'player_not_ready';
    throw notReadyError;
  };

  const handleAdPlaying = () => {
    const adError: any = new Error(
      chrome.i18n.getMessage('info_ad_playback_skip_translation') || 'Ad playing, translation paused'
    );
    adError.category = 'ad_playing';
    throw adError;
  };
  
  const sessionId = `translate_${tabId}_${videoId}`;
  
  // ========== 关闭翻译 ==========
  if (!newState) {
    console.log('[service-worker-v4] 关闭翻译，取消会话:', sessionId);
    
    // 取消当前会话
    if (abortTimeoutManager.hasSession(sessionId)) {
      abortTimeoutManager.abortSession(sessionId, '用户主动关闭翻译');
      console.log('[service-worker-v4] ✓ 会话已取消');
    }
    
    // 设置状态为INACTIVE
    console.debug('[service-worker-v4] → 设置状态为 INACTIVE');
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);
    
    return {
      success: true,
      action: 'stopped',
      message: chrome.i18n.getMessage('status_translation_disabled') || 'Translation turned off'
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

    // ========== Stage 0: 广告检测（前置）==========
    let adStatusResponse: { success: boolean; isAdPlaying: boolean } | undefined;
    try {
      adStatusResponse = await session.executeStage(
        'check_ad',
        async (signal) => {
          return await sendMessageWithSignal<{ success: boolean; isAdPlaying: boolean }>(
            tabId,
            { type: 'checkPlayerAdState' },
            signal
          );
        },
        { timeoutMs: 5000 }
      );
    } catch (error: any) {
      // 广告检测调用失败（网络、超时等），不应阻塞流程
      console.debug('[debug][service-worker-v4] ⚠️ 广告检测调用失败，继续流程:', error?.message || error);
    }

    // 检查广告检测结果（移到try-catch外面）
    if (adStatusResponse?.isAdPlaying) {
      console.log('[service-worker-v4] ✗ 检测到广告播放，终止翻译流程');
      handleAdPlaying(); // 这个错误会传播到外层catch（Line 930）
    }
    console.log('[service-worker-v4] ✓ 广告检测通过');

    // ========== Stage 2: 获取源语言信息 ==========
    const sourceData = await videoSourceLanguageCacheManager.get(videoId);
    // 缓存查询结果（debug级别）
    console.debug(
      sourceData
        ? `[debug][service-worker-v4] 源语言缓存 [命中] | 可用轨道: ${sourceData.availableSourceLanguages?.length || 0}个${sourceData.selectedSourceTrack ? ' | 已选: ' + sourceData.selectedSourceTrack.languageCode + (sourceData.selectedSourceTrack.kind ? ' (' + sourceData.selectedSourceTrack.kind + ')' : '') : ''}`
        : '[debug][service-worker-v4] 源语言缓存 [未命中]'
    );
    // ✅ 新架构：同时保存 languageCode 和 name
    let sourceLanguageCode = 'auto';  // 用于YouTube API
    let sourceLanguageName = 'auto';  // 用于翻译API
    let sourceKind: string | undefined;
    let availableTracks: CaptionTrack[] | undefined;
    let resolvedSourceTrack: CaptionTrack | undefined;

    // 如果有缓存的轨道信息，先尝试使用缓存选择源语言
    if (sourceData?.availableSourceLanguages?.length > 0) {
      availableTracks = sourceData.availableSourceLanguages;
      const cachedTracks = sourceData.availableSourceLanguages;
      const cachedTrack = sourceData.selectedSourceTrack;

      const matchWithKind = (
        candidates: Array<{ languageCode: string; name: string; kind?: string }>,
        preferredKind: string | undefined
      ): { languageCode: string; name: string; kind?: string } | undefined => {
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

      let sourceTrack: { languageCode: string; name: string; kind?: string } | undefined;

      if (requestedSourceLang) {
        const candidates = cachedTracks.filter((track: { languageCode: string; name: string; kind?: string }) => track.languageCode === requestedSourceLang);
        // 优先使用用户明确指定的sourceKind，其次使用缓存的kind
        const preferredKind = requestedSourceKind || (cachedTrack?.languageCode === requestedSourceLang ? cachedTrack.kind : undefined);
        sourceTrack = matchWithKind(candidates, preferredKind);
      }

      if (!sourceTrack && cachedTrack) {
        const candidates = cachedTracks.filter((track: { languageCode: string; name: string; kind?: string }) => track.languageCode === cachedTrack.languageCode);
        sourceTrack = matchWithKind(candidates, cachedTrack.kind) || cachedTrack;
      }

      if (!sourceTrack) {
        if (requestedSourceLang) {
          console.log('[service-worker-v4] ⚠ 源语言 ' + requestedSourceLang + ' 不可用，可选: ' +
                      cachedTracks.map((track: any) => track.languageCode + (track.kind ? '(' + track.kind + ')' : '')).join(', '));
        }
        sourceTrack = selectBestSourceLanguage(
          cachedTracks,
          preferences.targetLang,
          cachedTrack
        );
      }

      // ✅ 统一使用YouTube API原始字段命名
      // selectBestSourceLanguage 保证返回非空值（有默认English兜底），所以这里使用非空断言
      sourceLanguageCode = sourceTrack!.languageCode;  // 用于YouTube API（如 "en"）
      sourceLanguageName = sourceTrack!.name;          // 用于翻译API（如 "English"）
      sourceKind = sourceTrack!.kind;
      resolvedSourceTrack = sourceTrack!;
      console.log('[service-worker-v4] ✓ 源语言: ' + sourceLanguageName +
                  ' [' + sourceLanguageCode + ']' +
                  (sourceKind ? ' (' + sourceKind + ')' : '') +
                  ' | ' + (requestedSourceLang ? '用户指定' : '缓存选择'));
    }

    const sendSetSubtitleTrack = async (langCode?: string, kind?: string): Promise<{ success: boolean; reason?: string; error?: string }> => {
      if (!langCode || langCode === 'auto') {
        console.log('[service-worker-v4] 跳过设置字幕轨道: 语言=' + (langCode || 'auto'));
        return { success: true };
      }

      const setSubtitlePayload = {
        type: 'setSubtitleTrackAPI',
        langCode,
        kind  // 传递 kind 以支持精确匹配
      };

      try {
        // 删除"准备设置"和"成功"日志（与外层智能选择日志重复）
        const setResult = await chrome.tabs.sendMessage(tabId, setSubtitlePayload);
        if (setResult?.success) {
          return { success: true };
        }

        if (setResult?.reason === 'player_not_ready') {
          console.debug('[debug][service-worker-v4] setSubtitleTrackAPI 返回播放器未就绪，终止自动恢复', setResult);
          handlePlayerNotReady();
        }

        if (setResult?.reason === 'ad_playing') {
          console.debug('[debug][service-worker-v4] setSubtitleTrackAPI 返回广告播放状态，终止自动恢复', setResult);
          handleAdPlaying();
        }

        console.debug('[debug][service-worker-v4] setSubtitleTrackAPI 返回失败，将依赖字幕按钮触发', setResult);
        return {
          success: false,
          reason: setResult?.reason,
          error: setResult?.error
        };
      } catch (apiError) {
        if ((apiError as any)?.category === 'player_not_ready') {
          console.debug('[debug][service-worker-v4] setSubtitleTrackAPI 抛出播放器未就绪错误', apiError);
          handlePlayerNotReady();
        }
        if ((apiError as any)?.category === 'ad_playing') {
          console.debug('[debug][service-worker-v4] setSubtitleTrackAPI 抛出广告播放状态错误', apiError);
          handleAdPlaying();
        }
        console.debug('[debug][service-worker-v4] setSubtitleTrackAPI 调用异常，将依赖字幕按钮触发', apiError);
        return {
          success: false,
          reason: 'exception',
          error: (apiError as Error)?.message
        };
      }
    };

    const sendDisableSubtitles = async (): Promise<void> => {
      try {
        const result = await chrome.tabs.sendMessage(tabId, { type: 'disableSubtitles' });
        if (result?.success) {
          console.debug('[debug][service-worker-v4] ✓ 已关闭YouTube原生字幕');
        } else {
          console.debug('[debug][service-worker-v4] → 尝试关闭YouTube字幕，返回: ' + (result?.reason || 'unknown'));
        }
      } catch (error) {
        console.debug('[debug][service-worker-v4] 关闭YouTube字幕失败（忽略）:', error);
      }
    };

    interface FetchSubtitleOptions {
      stageLabel: string;
      reuseCachedSource?: boolean;
    }

    const fetchSubtitlesByTrack = async (
      track: CaptionTrack,
      options: FetchSubtitleOptions
    ): Promise<SubtitleData> => {
      let subtitleData: SubtitleData | null = null;

      if (options?.reuseCachedSource && reuseOriginalSubtitles && track.name && track.name !== 'auto') {
        try {
          const cachedEntries = await translationCacheManager.findByVideoAndSourceLang(videoId, track.name);
          const reusableEntry = cachedEntries.find((entry: any) => entry.originalSubtitles);

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
                sourceLanguageName: track.name,
                sourceLanguageCode: track.languageCode,
                currentTime: typeof currentTime === 'number' ? currentTime : 0,
                videoId
              };
              console.log(`[service-worker-v4] ✓ 复用缓存字幕: ${parsed.length} 条 (${options.stageLabel})`);
            }
          }
        } catch (error) {
          console.debug(`[debug][service-worker-v4] 复用缓存字幕失败（${options.stageLabel}），继续抓取:`, error);
        }
      }

      const setResult = await sendSetSubtitleTrack(track.languageCode, track.kind);
      if (!setResult.success && setResult.reason === 'player_not_ready') {
        handlePlayerNotReady();
      }
      if (!setResult.success && setResult.reason === 'ad_playing') {
        handleAdPlaying();
      }

      if (!subtitleData) {
        await session.executeStage(
          `${options.stageLabel}_trigger`,
          async (signal) => {
            const triggerPayload = {
              type: 'TRIGGER_SUBTITLE_LOAD',
              sourceLanguageCode: track.languageCode,
              sourceLanguageName: track.name,
              sourceKind: track.kind,
              originalSubtitleState
            };
            console.debug(`[debug][service-worker-v4] → 触发字幕加载(${options.stageLabel}): ${track.name} [${track.languageCode}]`);
            await chrome.tabs.sendMessage(tabId, triggerPayload);
            return true;
          },
          { timeoutMs: 5000 }
        );

        subtitleData = await session.executeStage(
          `${options.stageLabel}_fetch`,
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

                    if (message.data?.error === 'INTERCEPTOR_TIMEOUT') {
                      console.log(`[service-worker-v4] ✗ ${options.stageLabel} 拦截器5秒超时，终止`);
                      reject(new Error('拦截器超时: ' + (message.data?.errorMessage || '5秒超时')));
                      return true;
                    }

                    const subtitleLabel = message.data?.sourceLanguageName
                      ? ` (${message.data.sourceLanguageName}${message.data?.sourceLanguageCode ? ' [' + message.data.sourceLanguageCode + ']' : ''})`
                      : '';
                    console.log(`[service-worker-v4] ✓ 接收字幕数据(${options.stageLabel}): ${(message.data?.subtitles?.length || 0)} 条${subtitleLabel}`);
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
                  reject(new StageTimeoutError(`${options.stageLabel}_subtitle_fetch`, 15000));
                }
              });
            });
          },
          {
            timeoutMs: 15000,
            critical: true
          }
        );
      }

      if (!subtitleData?.subtitles || subtitleData.subtitles.length === 0) {
        throw new Error('No subtitles available for track: ' + track.languageCode);
      }

      if (!subtitleData.sourceLanguageName) {
        subtitleData.sourceLanguageName = track.name;
      }
      if (!subtitleData.sourceLanguageCode) {
        subtitleData.sourceLanguageCode = track.languageCode;
      }
      subtitleData.videoId = videoId;
      return subtitleData;
    };

    // 检查完整缓存（使用初步选择的源语言name）
    const cachedResult = await translationCacheManager.get(
      videoId,
      sourceLanguageName,  // ✅ 缓存键使用name
      sourceKind,
      preferences.targetLang,
      preferences.translationService
    );

    if (cachedResult) {
      console.log('[service-worker-v4] ✓ 命中完整缓存');

      // 即使缓存命中也要切换字幕轨道
      const cachedTrackResult = await sendSetSubtitleTrack(sourceLanguageCode, sourceKind);  // ✅ YouTube API使用code
      if (!cachedTrackResult.success && cachedTrackResult.reason === 'player_not_ready') {
        handlePlayerNotReady();
      }
      if (!cachedTrackResult.success && cachedTrackResult.reason === 'ad_playing') {
        handleAdPlaying();
      }

      // 解析缓存的VTT数据为SubtitleEntry数组
      const cachedSubtitles = mergeVttStrings(
        cachedResult.originalSubtitles,
        cachedResult.translatedSubtitles
      );

      console.log(`[service-worker-v4] → 发送缓存的字幕数据: ${cachedSubtitles.length} 条`);

      // 发送缓存的字幕数据到Content Script
      try {
        await sendDisableSubtitles();
        await chrome.tabs.sendMessage(tabId, {
          type: 'TRANSLATION_UPDATE',
          data: {
            updateType: 'progressive',  // 使用progressive类型，完整覆盖
            translatedSubtitles: cachedSubtitles  // SubtitleEntry[]格式
          }
        });
        console.log('[service-worker-v4] ✓ 已发送缓存字幕数据');
      } catch (err) {
        console.debug('[debug][service-worker-v4] 发送缓存字幕数据失败:', err);
      }

      console.debug('[service-worker-v4] → 设置状态为 ACTIVE（缓存命中）');
      await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
      session.complete();

      await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);

      return {
        success: true,
        action: 'cached',
        data: cachedResult
      };
    }

    // ========== Stage 3: 获取字幕轨道（如果需要）==========
    // 如果没有缓存的轨道信息，或源语言仍是auto，主动获取轨道
    if (!sourceData?.availableSourceLanguages?.length || sourceLanguageCode === 'auto') {
      try {
        const trackRequestId = `get_tracks_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // 获取可用字幕轨道（先尝试playerResponse，再兜底Player API）
        const trackResponse = await session.executeStage(
          'get_tracks',
          async (signal) => {
            const classifyError = (error: unknown): { category: string; message: string } => {
              const rawMessage = (error as Error)?.message || String(error);
              if (rawMessage.includes('Receiving end does not exist')) {
                return { category: 'tab_unreachable', message: rawMessage };
              }
              if ((error as DOMException)?.name === 'AbortError') {
                throw error;
              }
              return { category: 'runtime_error', message: rawMessage };
            };

            const requestWithSignal = async (
              payload: Record<string, unknown>,
              source: 'playerResponse' | 'playerApi'
            ): Promise<any> => {
              try {
                const response = await sendMessageWithSignal<any>(tabId, {
                  ...payload,
                  _requestId: trackRequestId,
                  videoId
                }, signal);

                if (response?.success && response.tracks?.length) {
                  console.debug(`[debug][service-worker-v4] ✓ 获取到 ${response.tracks.length} 个轨道（${source}） | requestId: ${trackRequestId}`);
                  return { ...response, trackSource: source };
                }

                if (response?.success) {
                  console.debug(`[debug][service-worker-v4] ${source} 返回空轨道 | requestId: ${trackRequestId}`);
                  return {
                    success: false,
                    tracks: [],
                    reason: `${source}_empty`,
                    trackSource: source
                  };
                }

                console.debug(`[debug][service-worker-v4] ${source} 返回失败 | requestId: ${trackRequestId}`, response);
                return {
                  success: false,
                  tracks: [],
                  reason: `${source}_failure`,
                  trackSource: source,
                  error: response?.error
                };
              } catch (error) {
                const { category, message } = classifyError(error);
                console.debug(`[debug][service-worker-v4] ${source} 获取轨道异常 (${category}) | requestId: ${trackRequestId}`, error);
                return {
                  success: false,
                  tracks: [],
                  reason: `${source}_${category}`,
                  trackSource: source,
                  error: message
                };
              }
            };

            console.debug('[debug][service-worker-v4] → 获取视频轨道数据 (playerResponse)');
            const playerResponseResult = await requestWithSignal({
              type: 'getVideoTrackData',
              videoId
            }, 'playerResponse');

            if (playerResponseResult?.success && playerResponseResult.tracks?.length) {
              return { ...playerResponseResult, requestId: trackRequestId };
            }

            // 删除"准备通过Player API获取轨道"日志（改为debug级别）
            console.debug(`[debug][service-worker-v4] 准备通过Player API获取轨道 (videoId: ${videoId}) | requestId: ${trackRequestId}`);
            const playerApiResult = await requestWithSignal({
              type: 'getSubtitleTracksAPI'
            }, 'playerApi');

            if (playerApiResult?.success && playerApiResult.tracks?.length) {
              return { ...playerApiResult, requestId: trackRequestId };
            }

            const failureResult = playerApiResult ?? playerResponseResult ?? {
              success: false,
              tracks: [],
              reason: 'no_tracks',
              trackSource: 'playerApi'
            };
            return { ...failureResult, requestId: trackRequestId };
          },
          { timeoutMs: 15000 }
        );

        if (trackResponse?.reason === 'player_not_ready') {
          handlePlayerNotReady();
        }
        if (trackResponse?.reason === 'ad_playing') {
          handleAdPlaying();
        }

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
            console.debug('[debug][service-worker-v4] 轨道快照记录失败:', snapshotError);
          }

          // ✅ 保持YouTube API原始字段：languageCode 和 name
          // 不需要转换字段名，直接使用API返回的数据

          // 使用智能选择算法选择最佳源语言
          const sourceTrack = selectBestSourceLanguage(
            trackResponse.tracks,  // 直接传递原始tracks
            preferences.targetLang,
            sourceData?.selectedSourceTrack
          );
          // ✅ 统一使用YouTube API原始字段命名
          sourceLanguageCode = sourceTrack.languageCode;  // 用于YouTube API（如 "en"）
          sourceLanguageName = sourceTrack.name;          // 用于翻译API（如 "English"）
          sourceKind = sourceTrack.kind;
          console.log('[service-worker-v4] ✓ 源语言: ' + sourceLanguageName +
                      ' [' + sourceLanguageCode + ']' +
                      (sourceKind ? ' (' + sourceKind + ')' : '') +
                      ' | 智能选择 (' + trackResponse.tracks.length + '个可用)');

          availableTracks = trackResponse.tracks.map((track: any) => ({
            languageCode: track.languageCode,
            name: track.name,
            kind: track.kind
          }));
          resolvedSourceTrack = {
            languageCode: sourceLanguageCode,
            name: sourceLanguageName,
            kind: sourceKind
          };

          const trackSwitchResult = await sendSetSubtitleTrack(sourceLanguageCode, sourceKind);  // ✅ YouTube API使用code
          if (!trackSwitchResult.success && trackSwitchResult.reason === 'player_not_ready') {
            handlePlayerNotReady();
          }
          if (!trackSwitchResult.success && trackSwitchResult.reason === 'ad_playing') {
            handleAdPlaying();
          }

          // 异步缓存轨道信息（不阻塞主流程）
          Promise.resolve().then(async () => {
            try {
              const trackMetadata = trackResponse.tracks.map((track: any) => ({
                languageCode: track.languageCode,
                name: track.name,  // ✅ 保持YouTube API原始字段名
                kind: track.kind
              }));

              await videoSourceLanguageCacheManager.set({
                videoId: videoId,
                availableSourceLanguages: trackMetadata,
                selectedSourceTrack: {
                  languageCode: sourceLanguageCode,
                  name: sourceLanguageName,
                  kind: sourceKind
                }
              });
            } catch (err) {
              console.debug('[debug][service-worker-v4] 轨道缓存失败:', err);
            }
          });
        } else {
          const failureReason = trackResponse?.reason || 'no_tracks';
          console.debug(`[debug][service-worker-v4] ✗ 未获取到字幕轨道，reason=${failureReason} | requestId: ${trackResponse?.requestId ?? 'n/a'}`);

          // 特殊情况处理（提前返回）
          if (failureReason === 'player_not_ready') {
            handlePlayerNotReady();
            return {
              success: false,
              action: 'error',
              error: chrome.i18n.getMessage('error_player_not_ready') || 'Player not ready yet, please try again later'
            };
          }
          if (failureReason === 'ad_playing') {
            handleAdPlaying();
            return {
              success: false,
              action: 'error',
              error: chrome.i18n.getMessage('info_ad_playback_skip_translation') || 'Ad playing, translation paused'
            };
          }

          // ⭐ 空字幕轨道：直接抛出错误终止流程
          if (failureReason === 'tracklist_empty') {
            console.error('[service-worker-v4] ✗ 视频无字幕轨道，终止翻译流程');
            throw new Error(chrome.i18n.getMessage('error_no_subtitles') || '当前视频无字幕');
          }

          // 其他未知错误：降级使用auto继续
          console.debug('[debug][service-worker-v4] 未知轨道错误，降级使用auto');
          sourceLanguageCode = 'auto';
          sourceLanguageName = 'auto';
        }
      } catch (error: any) {
        console.debug('[debug][service-worker-v4] 获取轨道信息失败，继续使用auto:', error);
        if (error?.category === 'player_not_ready') {
          handlePlayerNotReady();
        }
        if (error?.category === 'ad_playing') {
          handleAdPlaying();
        }
        sourceLanguageCode = 'auto';
        sourceLanguageName = 'auto';
      }
    } else {
      console.log(`[service-worker-v4] 已有缓存轨道信息，源语言: ${sourceLanguageName}` +
                  (sourceKind ? ` (${sourceKind})` : ''));
      const finalTrackResult = await sendSetSubtitleTrack(sourceLanguageCode, sourceKind);  // ✅ YouTube API使用code
      if (!finalTrackResult.success && finalTrackResult.reason === 'player_not_ready') {
        handlePlayerNotReady();
      }
      if (!finalTrackResult.success && finalTrackResult.reason === 'ad_playing') {
        handleAdPlaying();
      }
    }

    // ========== Stage 4.7: 检查是否可以复用YouTube翻译 ==========
    if (availableTracks?.length && resolvedSourceTrack) {
      const reuseCheck = canReuseYouTubeTranslation(
        availableTracks,
        resolvedSourceTrack.languageCode,
        resolvedSourceTrack.kind,
        preferences.targetLang
      );

      if (reuseCheck.canReuse && reuseCheck.targetTrack) {
        console.log(`[service-worker-v4] 🎯 复用YouTube字幕: ${resolvedSourceTrack.languageCode} → ${reuseCheck.targetTrack.languageCode}`);

        try {
          const targetSubtitleData = await fetchSubtitlesByTrack(reuseCheck.targetTrack, {
            stageLabel: 'native_target'
          });
          const nativeSourceData = await fetchSubtitlesByTrack(resolvedSourceTrack, {
            stageLabel: 'native_source',
            reuseCachedSource: true
          });

          await sendDisableSubtitles();

          if (nativeSourceData.sourceLanguageName && sourceLanguageName === 'auto') {
            sourceLanguageName = nativeSourceData.sourceLanguageName;
          }
          if (nativeSourceData.sourceLanguageCode && sourceLanguageCode === 'auto') {
            sourceLanguageCode = nativeSourceData.sourceLanguageCode;
          }

          const originalVtt = convertSubtitleEntriesToVtt(nativeSourceData.subtitles);
          const translatedVtt = convertSubtitleEntriesToVtt(targetSubtitleData.subtitles);
          const mergedSubtitles = mergeVttStrings(originalVtt, translatedVtt);

          await translationCacheManager.set({
            videoId,
            sourceLang: sourceLanguageName,
            sourceKind: sourceKind,
            targetLang: preferences.targetLang,
            translationService: preferences.translationService,
            originalSubtitles: originalVtt,
            translatedSubtitles: translatedVtt,
            lastUsed: Date.now(),
            dataHash: ''
          });

          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'TRANSLATION_UPDATE',
              data: {
                updateType: 'progressive',
                translatedSubtitles: mergedSubtitles
              }
            });
            console.log(`[service-worker-v4] ✓ 已发送YouTube原生字幕 ${mergedSubtitles.length} 条`);
          } catch (err) {
            console.debug('[debug][service-worker-v4] 发送原生字幕失败:', err);
          }

          await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
          session.complete();
          await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);

          return {
            success: true,
            action: 'native',
            message: chrome.i18n.getMessage('status_translation_streamed') || 'Translation delivered via live updates'
          };
        } catch (nativeError) {
          console.debug('[debug][service-worker-v4] ⚠️ YouTube字幕复用失败，继续走翻译流程', nativeError);
          await sendSetSubtitleTrack(resolvedSourceTrack.languageCode, resolvedSourceTrack.kind);
        }
      }
    }

    // ========== Stage 4: 获取字幕数据（5秒超时）==========

    let subtitleData: SubtitleData | null = null;

    if (reuseOriginalSubtitles && sourceLanguageName && sourceLanguageName !== 'auto') {
      try {
        const cachedEntries = await translationCacheManager.findByVideoAndSourceLang(videoId, sourceLanguageName);
        const reusableEntry = cachedEntries.find((entry: any) => entry.originalSubtitles);

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
          sourceLanguageName: sourceLanguageName,  // ✅ 使用name
          currentTime: typeof currentTime === 'number' ? currentTime : 0
        };
        console.log('[service-worker-v4] ✓ 复用缓存字幕: ' + parsed.length + ' 条');
      }
        }
      } catch (error) {
        console.debug('[debug][service-worker-v4] 查找缓存原始字幕失败，继续正常抓取:', error);
      }
    }

    if (!subtitleData) {
      await session.executeStage(
        'trigger_load',
        async (signal) => {
          const triggerPayload = {
            type: 'TRIGGER_SUBTITLE_LOAD',
            sourceLanguageCode: sourceLanguageCode,  // ✅ 传递code（用于YouTube API）
            sourceLanguageName: sourceLanguageName,  // ✅ 传递name（用于翻译API）
            sourceKind: sourceKind,
            originalSubtitleState: originalSubtitleState  // 传递原始状态
          };
          console.debug('[debug][service-worker-v4] → 触发字幕加载: ' + sourceLanguageName +
                      ' [' + sourceLanguageCode + ']');
          await chrome.tabs.sendMessage(tabId, triggerPayload);
          return true;
        },
        { timeoutMs: 5000 }
      );

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

                  // 检查是否为拦截器超时错误
                  if (message.data?.error === 'INTERCEPTOR_TIMEOUT') {
                    console.log('[service-worker-v4] ✗ 拦截器5秒超时，立即终止');
                    reject(new Error('拦截器超时: ' + (message.data?.errorMessage || '5秒超时')));
                    return true;
                  }

                  const subtitleLabel = message.data?.sourceLanguageName
                    ? ` (${message.data.sourceLanguageName}${message.data?.sourceLanguageCode ? ' [' + message.data.sourceLanguageCode + ']' : ''})`
                    : '';
                  console.log(`[service-worker-v4] ✓ 接收字幕数据: ${(message.data?.subtitles?.length || 0)} 条${subtitleLabel}`);
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
                reject(new StageTimeoutError('subtitle_fetch', 15000));
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
      throw new Error(chrome.i18n.getMessage('error_no_subtitles') || 'No subtitles available for this video');
    }

    const effectiveSubtitleData = subtitleData as SubtitleData;

    console.log(`[service-worker-v4] 字幕数据就绪 | ${effectiveSubtitleData.subtitles.length} 条 | 源语言: ${sourceLanguageName}`);

    await sendDisableSubtitles();

    // 如果字幕数据中包含源语言信息，且当前是auto，更新源语言
    if (effectiveSubtitleData.sourceLanguageName && sourceLanguageName === 'auto') {
      sourceLanguageName = effectiveSubtitleData.sourceLanguageName;
      console.log(`[service-worker-v4] 使用字幕数据中的源语言: ${sourceLanguageName}`);
    }
    if (effectiveSubtitleData.sourceLanguageCode && sourceLanguageCode === 'auto') {
      sourceLanguageCode = effectiveSubtitleData.sourceLanguageCode;
      console.log(`[service-worker-v4] 使用字幕数据中的源语言代码: ${sourceLanguageCode}`);
    }

    // ========== Stage 4.5: 统一准备语言参数 ==========
    // ✅ 根据翻译服务类型，统一转换一次语言参数（只转换1次，只打印1次）
    const languageParams = prepareLanguageParams(
      sourceLanguageCode,
      preferences.targetLang,
      preferences.translationService?.type || 'google-free'
    );

    // ========== Stage 4.6: 验证语言选择 ==========
    // 检查源语言和目标语言是否相同或属于同一语言族
    const sourceBase = getBaseLangCode(sourceLanguageCode);
    const targetBase = getBaseLangCode(preferences.targetLang);

    if (sourceBase !== 'auto' && sourceBase === targetBase) {
      console.log(`[service-worker-v4] ❌ 语言验证失败: ${sourceLanguageCode} → ${preferences.targetLang} (同一语言族)`);
      throw new Error('翻译语言选择前后相同，无需翻译');
    }

    // ========== Stage 5: 执行翻译 ==========

    // 创建翻译器
    const translator = new TwoPhaseTranslatorV4();
    
    // 设置实际的翻译服务（使用用户配置的服务）
    translator.setTranslationService(preferences.translationService);
    const resolvedConcurrencyLimit = translator.getResolvedConcurrencyLimit();
    const resolvedRequestDelay = translator.getResolvedRequestDelay();

    // 获取服务类型（用于超时计算）
    const serviceType = preferences.translationService?.type;

    // 执行紧急翻译（超时时间与批量翻译保持一致）
    let urgentResults: any[] = [];
    let urgentError: any = null;

    // 根据服务类型获取超时时间
    let urgentTimeout: number;
    switch (serviceType) {
      case 'deepseek':
        urgentTimeout = DEEPSEEK_TIMEOUT_MS;
        break;
      case 'openai':
        urgentTimeout = OPENAI_TIMEOUT_MS;
        break;
      case 'gemini':
        urgentTimeout = GEMINI_TIMEOUT_MS;
        break;
      case 'deepl':
        urgentTimeout = DEEPL_TIMEOUT_MS;
        break;
      case 'qwen':
        urgentTimeout = QWEN_TIMEOUT_MS;
        break;
      case 'google':
      case 'google-free':
        urgentTimeout = GOOGLE_TIMEOUT_MS;
        break;
      case 'microsoft':
      case 'microsoft-free':
        urgentTimeout = MICROSOFT_TIMEOUT_MS;
        break;
      default:
        urgentTimeout = DEFAULT_TIMEOUT_MS;
    }

    try {
      urgentResults = await session.executeStage(
        'urgent_translate',
        async (signal) => {
          return await translator.translateUrgent(
            effectiveSubtitleData.subtitles,
            effectiveSubtitleData.currentTime || 0,
            languageParams,  // ✅ 传递统一转换后的语言参数
            preferences,
            signal
          );
        },
        {
          timeoutMs: urgentTimeout
          // 移除 fallback，让错误抛出以便判断是否为致命错误
        }
      );
    } catch (error) {
      urgentError = error;
      const errorObj = error as any;

      // 简化日志：只打印摘要，详细信息由最外层catch打印
      console.debug('[debug][service-worker-v4] ⚠️ 紧急翻译失败:', errorObj?.message || error);

      // 判断是否为致命错误（API密钥问题）
      const category = errorObj?.category;
      const errorMsg = (error as Error)?.message || '';
      const lowerErrorMsg = errorMsg.toLowerCase();
      const isFatalError =
        category === 'fatal' ||
        errorObj.status === 401 ||
        errorObj.status === 403 ||
        lowerErrorMsg.includes('api key') ||
        lowerErrorMsg.includes('not configured') ||
        lowerErrorMsg.includes('invalid key') ||
        lowerErrorMsg.includes('密钥') ||
        lowerErrorMsg.includes('未配置') ||
        lowerErrorMsg.includes('无效');

      if (isFatalError) {
        console.debug('[debug][service-worker-v4] ❌ 致命错误（API密钥问题），终止翻译流程');
        throw error; // 直接抛出，进入外层catch
      }

      // 可重试错误（如超时、取消），继续执行批量翻译
      console.log('[service-worker-v4] 非致命错误（如超时/取消），将继续尝试批量翻译');
    }

    // 紧急翻译完成日志已在 TwoPhaseTranslatorV4 中打印

    // 检查紧急翻译是否失败
    if (urgentResults.length === 0) {
      console.log('[service-worker-v4] ⚠️ 紧急翻译失败，继续批量翻译');
      // retryable错误静默处理，批量翻译将覆盖全部内容
      // fatal错误已在上面抛出，不会执行到这里
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
            isUrgent: false  // 与批量翻译保持一致的样式
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
        console.debug('[debug][service-worker-v4] 发送紧急翻译失败:', err);
      }
    }

    // 紧急阶段完成后立即开始批量翻译
    console.log('[service-worker-v4] → 准备开始批量翻译');

    // 检查会话是否已被取消
    if (session.isAborted()) {
      throw new DOMException('会话已被取消', 'AbortError');
    }

    // 🔑 关键优化：先执行智能断句，基于实际批次数计算超时
    // 注意：必须在 executeStage() 之前计算，因为 timeoutMs 需要提前确定

    const subtitleCount = effectiveSubtitleData.subtitles.length;

    // Step 1: 提前创建智能批次（获取实际批次数）
    // 注意：这里只是为了计算超时，实际翻译时会在 translateBatch() 内部重新创建
    const tempSegmenter = translator['segmenter'];  // 访问已配置好的 segmenter
    const preliminaryBatches = tempSegmenter?.createSmartBatches(effectiveSubtitleData.subtitles) || [];
    const actualBatchCount = preliminaryBatches.length || Math.ceil(subtitleCount / 20);

    // Step 2: 基于实际批次数和并发数计算超时
    let batchTotalTimeout: number;
    let timeoutCalculationInfo: string;

    if (serviceType === 'deepseek') {
      // DeepSeek并发或串行超时计算（与 DeepL/Gemini 设计保持一致）
      const concurrency = resolvedConcurrencyLimit > 0 ? resolvedConcurrencyLimit : 1;

      if (resolvedConcurrencyLimit > 0) {
        const rounds = Math.ceil(actualBatchCount / concurrency);
        batchTotalTimeout = rounds * DEEPSEEK_TIMEOUT_MS;
        timeoutCalculationInfo =
          `${subtitleCount}条 → ${actualBatchCount}批 → ${rounds}轮 (并发${concurrency}) × ${DEEPSEEK_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
      } else {
        batchTotalTimeout = actualBatchCount * DEEPSEEK_TIMEOUT_MS;
        timeoutCalculationInfo =
          `${subtitleCount}条 → ${actualBatchCount}批 × ${DEEPSEEK_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
      }
    } else if (serviceType === 'openai') {
      // OpenAI并发超时计算
      const concurrency = 10;
      const rounds = Math.ceil(actualBatchCount / concurrency);
      batchTotalTimeout = rounds * OPENAI_TIMEOUT_MS;
      timeoutCalculationInfo = `${subtitleCount}条 → ${actualBatchCount}批 → ${rounds}轮 × ${OPENAI_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
    } else if (serviceType === 'gemini') {
      // Gemini并发超时计算
      const concurrency = resolvedConcurrencyLimit > 0 ? resolvedConcurrencyLimit : 5;
      const rounds = Math.ceil(actualBatchCount / concurrency);
      const pipelineDelay = resolvedRequestDelay > 0 && actualBatchCount > 1
        ? (actualBatchCount - 1) * resolvedRequestDelay
        : 0;
      batchTotalTimeout = rounds * GEMINI_TIMEOUT_MS + pipelineDelay;
      const delayInfo = pipelineDelay > 0
        ? ` + 延迟(${actualBatchCount - 1}×${resolvedRequestDelay}ms)`
        : '';
      timeoutCalculationInfo =
        `${subtitleCount}条 → ${actualBatchCount}批 → ${rounds}轮 × ${GEMINI_TIMEOUT_MS}ms${delayInfo} = ${batchTotalTimeout}ms`;
    } else if (serviceType === 'deepl') {
      // DeepL串行超时计算
      batchTotalTimeout = actualBatchCount * DEEPL_TIMEOUT_MS;
      timeoutCalculationInfo = `${subtitleCount}条 → ${actualBatchCount}批 × ${DEEPL_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
    } else if (serviceType === 'qwen') {
      // Qwen串行超时计算
      batchTotalTimeout = actualBatchCount * QWEN_TIMEOUT_MS;
      timeoutCalculationInfo = `${subtitleCount}条 → ${actualBatchCount}批 × ${QWEN_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
    } else if (serviceType === 'google-free' || serviceType === 'google') {
      // Google串行超时计算
      batchTotalTimeout = actualBatchCount * GOOGLE_TIMEOUT_MS;
      timeoutCalculationInfo = `${subtitleCount}条 → ${actualBatchCount}批 × ${GOOGLE_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
    } else if (serviceType === 'microsoft-free' || serviceType === 'microsoft') {
      // Microsoft串行超时计算
      batchTotalTimeout = actualBatchCount * MICROSOFT_TIMEOUT_MS;
      timeoutCalculationInfo = `${subtitleCount}条 → ${actualBatchCount}批 × ${MICROSOFT_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
    } else {
      // 其他服务：默认超时
      batchTotalTimeout = actualBatchCount * DEFAULT_TIMEOUT_MS;
      timeoutCalculationInfo = `${subtitleCount}条 → ${actualBatchCount}批 × ${DEFAULT_TIMEOUT_MS}ms = ${batchTotalTimeout}ms`;
    }

    console.log(`[service-worker-v4] 批量翻译超时设置: ${timeoutCalculationInfo}`);

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
      languageParams,  // ✅ 传递统一转换后的语言参数
      preferences,
      signal,
      preliminaryBatches
    );
  },
  {
    timeoutMs: batchTotalTimeout
    // 不设置fallback，让错误向上抛出
      }
    );

    // 批量翻译完成日志已在 TwoPhaseTranslatorV4 中打印

    // ========== Stage 6: 构建和发送最终完整结果 ==========
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
      console.debug('[debug][service-worker-v4] 发送批量翻译失败:', err);
    }

    // 异步保存缓存（使用VTT格式）
    saveTranslationCacheAsync(
      videoId,
      sourceLanguageName,  // ✅ 缓存键使用name
      sourceKind as 'asr' | 'forced' | undefined,  // 传递sourceKind
      preferences,
      originalVtt,      // VTT格式
      translatedVtt,    // VTT格式
      translationCacheManager
    );

    // ========== Stage 6: 完成 ==========
    console.debug('[service-worker-v4] → 设置状态为 ACTIVE');
    await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
    session.complete();

    await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);

    return {
      success: true,
      action: 'streamed',  // V4架构标识：数据已通过TRANSLATION_UPDATE事件推送
      message: chrome.i18n.getMessage('status_translation_streamed') || 'Translation delivered via live updates'
      // 不返回data字段，避免重复处理
    };
    
  } catch (error: any) {
    console.error('[service-worker-v4] 翻译失败:', error?.message || error);

    const friendlyMessage = getUserFriendlyMessage(error);
    let userMessage = '';
    let errorLevel = ErrorLevel.ERROR;

    if ((error as any)?.category === 'ad_playing') {
      userMessage = chrome.i18n.getMessage('info_ad_playback_skip_translation') || 'Ad playing, translation paused';
      errorLevel = ErrorLevel.INFO;
      console.log('[service-worker-v4] 广告播放期间停止翻译');
    } else if (isTimeoutError(error)) {
      userMessage =
        friendlyMessage || chrome.i18n.getMessage('error_network_timeout_retry') || '网络超时，请检查网络连接后重试';
      errorLevel = getErrorLevel(error);
      console.log('[service-worker-v4] 超时错误:', error.stage);
    } else if (isAbortError(error)) {
      const abortReason =
        error.reason ||
        chrome.i18n.getMessage('error_unknown') ||
        'Unknown error';
      userMessage =
        chrome.i18n.getMessage('info_translation_cancelled', [abortReason]) ||
        `Translation cancelled: ${abortReason}`;
      errorLevel = ErrorLevel.INFO;
      console.log('[service-worker-v4] 翻译被取消:', abortReason);
    } else if ((error as any).category) {
      const category = (error as any).category;
      userMessage =
        friendlyMessage ||
        error.message ||
        chrome.i18n.getMessage('error_translation_failed') ||
        'Translation failed';
      errorLevel = category === 'fatal' ? ErrorLevel.ERROR : ErrorLevel.WARNING;

      console.debug('[debug][service-worker-v4] 错误详情:', {
        name: error?.name,
        message: error?.message,
        category: error?.category,
        service: error?.service,
        code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n') // 只保留前3行堆栈
      });
    } else {
      userMessage =
        friendlyMessage ||
        error.message ||
        chrome.i18n.getMessage('error_translation_failed') ||
        'Translation failed';
      errorLevel = getErrorLevel(error);

      console.debug('[debug][service-worker-v4] 未知错误详情:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n')
      });
    }

    if (!userMessage) {
      userMessage =
        friendlyMessage ||
        chrome.i18n.getMessage('error_translation_failed') ||
        'Translation failed';
    }

    // 取消会话
    session.abort(error?.message || 'aborted');

    // 🔥 第一步：先清除字幕（通过发送消息到content-script）
    if (tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'CLEAR_SUBTITLE_OVERLAY'
        });
        console.log('[service-worker-v4] → 已清除字幕显示');
      } catch (err) {
        console.debug('[debug][service-worker-v4] 清除字幕失败:', err);
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
        console.debug('[debug][service-worker-v4] 发送错误消息失败:', err);
      }
    }

    // 🔥 第三步：回退状态（此时UI变更不会再清除字幕）
    console.debug('[service-worker-v4] → 设置状态为 INACTIVE（错误回退）');
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);

    await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);
    
    return {
      success: false,
      error:
        userMessage ||
        friendlyMessage ||
        error?.message ||
        chrome.i18n.getMessage('error_translation_failed') ||
        'Translation failed',
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
    } catch (err) {
      console.debug('[debug][service-worker-v4] 缓存保存失败:', err);
    }
  });
}
