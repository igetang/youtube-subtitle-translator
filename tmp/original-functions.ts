    } else {
      // 默认假设是 JSON 或 JSON 变体
      const jsonData = await response.json();
      console.log('Fetched JSON subtitle data.');
      return jsonData;
    }
    } catch (error) {
    console.error('Error fetching or parsing subtitle data:', error);
        return null;
    }
}

/**
 * 解析原始字幕数据 (来自 fetchSubtitleData) 并返回标准化的事件数组。
 * @param subtitleJson - 从 fetchSubtitleData 获取的 JSON 或 XML 解析后的对象。
 * @param langCode - 该字幕数据的语言代码。
 * @returns {{ start: number; end: number; text: string; langCode: string }[] | null} 标准化事件数组或 null。
 */
function parseSubtitleData(subtitleJson: any, langCode: string): { start: number; end: number; text: string; langCode: string }[] | null {
    if (!subtitleJson || !subtitleJson.events || !Array.isArray(subtitleJson.events)) {
        console.error(`无效的字幕 JSON 数据 (lang: ${langCode}):`, subtitleJson);
        return null;
    }

    const events: { start: number; end: number; text: string; langCode: string }[] = [];
    subtitleJson.events.forEach((event: any) => {
        if (event.tStartMs !== undefined && event.segs) {
            const start = event.tStartMs / 1000;
            const duration = event.dDurationMs > 0 ? event.dDurationMs / 1000 : 5; // Default 5s duration
        const end = start + duration;
        const text = event.segs.map((seg: any) => seg.utf8 || '').join('');
            if (text.trim()) {
                // HTML Decode text just in case
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = text;
                const decodedText = tempDiv.textContent || tempDiv.innerText || '';
                events.push({ start, end, text: decodedText, langCode });
        }
      }
    });
    console.log(`解析了 ${events.length} 条字幕事件 (lang: ${langCode})。`);
    return events.length > 0 ? events : null;
}


// --- Subtitle Display & Sync (Keep handleSubtitleUpdate, updateSubtitleLoop, stopSubtitleUpdates, createSubtitleOverlay) ---

/**
 * 根据当前视频时间、存储的字幕模式更新字幕叠加层。
 * 现在会处理原文和译文。
 */
async function handleSubtitleUpdate() {
  if (!videoElement || !subtitleOverlayElement || processedSubtitleEvents.length === 0) {
    if (subtitleOverlayElement && subtitleOverlayElement.style.display !== 'none') {
      subtitleOverlayElement.style.display = 'none'; // 隐藏（如果没有视频或字幕）
      subtitleOverlayElement.innerText = ''; // 清空内容
    }
    return;
  }

  const currentTime = videoElement.currentTime;
  let textToShow = '';
  let isErrorMessage = false;  // 标记是否是错误消息

  // 查找当前时间对应的字幕事件
  const activeEvent = processedSubtitleEvents.find(
    (event) => currentTime >= event.start && currentTime <= event.end
  );

  if (activeEvent) {
    // 使用全局变量而不是每次从存储读取
    const subtitleMode = currentSubtitleMode || 'bilingual'; // 默认值
    
    // 根据模式组合要显示的文本
    const sourceText = activeEvent.sourceText || ''; // Fallback to empty string if null
    const targetText = activeEvent.targetText || ''; // Fallback to empty string if null
    
    // 检查targetText是否是错误消息
    isErrorMessage = targetText.includes('使用') && targetText.includes('翻译服务失败');
    
    // 处理错误消息的特殊情况
    if (isErrorMessage) {
      // 使用DOM元素创建带有独立样式的内容
      subtitleOverlayElement.innerHTML = ''; // 清空已有内容
      
      // 创建错误消息元素
      const errorElement = document.createElement('div');
      errorElement.textContent = targetText;
      errorElement.style.color = '#ff6b6b'; // 红色文本
      subtitleOverlayElement.appendChild(errorElement);
      
      // 如果有源文本并且处于需要显示的模式，添加源文本元素
      if (sourceText && (subtitleMode === 'bilingual' || subtitleMode === 'targetOnly')) {
        const sourceElement = document.createElement('div');
        sourceElement.textContent = sourceText;
        sourceElement.style.color = 'white'; // 保持正常颜色
        subtitleOverlayElement.appendChild(sourceElement);
      }
      
      // 已经使用innerHTML设置了内容，不需要再设置textToShow
      textToShow = '';
    } else {
      // 使用 bilingual 和 targetOnly 作为模式名称，与侧边栏保持一致
      switch (subtitleMode) {
        case 'bilingual':
          if (sourceText && targetText && sourceText !== targetText) {
            textToShow = `${targetText}\n${sourceText}`; // 目标语言在上，源语言在下
          } else {
            textToShow = targetText || sourceText; // Show whichever is available if one is missing or they are same
          }
          break;
        case 'targetOnly':
          textToShow = targetText || sourceText; // Prioritize target, fallback to source
          break;
        default: // Fallback to bilingual for unknown modes
          if (sourceText && targetText && sourceText !== targetText) {
            textToShow = `${targetText}\n${sourceText}`; // 目标语言在上，源语言在下
          } else {
            textToShow = targetText || sourceText;
          }
      }
      
      // 非错误情况下，使用普通文本
      subtitleOverlayElement.innerHTML = '';
      if (textToShow) {
        subtitleOverlayElement.innerText = textToShow;
      }
    }
  }

  // 更新叠加层内容和可见性
  if (textToShow || subtitleOverlayElement.hasChildNodes()) {
    // 设置全局样式（背景色等）
    if (isErrorMessage) {
      subtitleOverlayElement.style.backgroundColor = 'rgba(0, 0, 0, 0.85)'; // 更深的背景
    } else {
      subtitleOverlayElement.style.color = 'rgb(255, 255, 255)'; // 恢复正常颜色
      subtitleOverlayElement.style.backgroundColor = 'rgba(8, 8, 8, 0.75)'; // 恢复正常背景
    }
    
    // 添加延迟触发自动宽度调整，确保文本渲染完成
    setTimeout(() => {
      // 强制一次宽度重新计算
      if (subtitleOverlayElement) {
        // 调用新函数动态调整宽度
        updateOverlayWidth();
      }
    }, 0);
    
    if (subtitleOverlayElement.style.display === 'none' || subtitleOverlayElement.style.visibility === 'hidden') {
      subtitleOverlayElement.style.display = 'inline-block'; // 改为inline-block确保自动宽度
      subtitleOverlayElement.style.visibility = 'visible';
      subtitleOverlayElement.style.opacity = '1'; // 确保可见
    }
  } else {
    if (subtitleOverlayElement.style.display !== 'none') {
      subtitleOverlayElement.style.opacity = '0';
      // 在淡出动画后隐藏
      setTimeout(() => {
        if (subtitleOverlayElement && subtitleOverlayElement.style.opacity === '0') {
          subtitleOverlayElement.style.display = 'none';
          subtitleOverlayElement.style.visibility = 'hidden';
          subtitleOverlayElement.innerHTML = ''; // 清空内容
        }
      }, 200); // 匹配 CSS transition 时间
    }
  }
}

/**
 * 使用 requestAnimationFrame 的字幕更新循环。
 */
function updateSubtitleLoop() {
        handleSubtitleUpdate(); 
    // 继续请求下一帧
    if (translateActive) { // 仅当翻译激活时继续循环
    animationFrameId = requestAnimationFrame(updateSubtitleLoop);
    } else {
        animationFrameId = null; // 确保 ID 被清除
    }
}

/**
 * 停止字幕更新循环并隐藏叠加层。
 */
function stopSubtitleUpdates() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        console.log('Subtitle update loop stopped.');
    }
    if (subtitleOverlayElement) {
        subtitleOverlayElement.style.opacity = '0';
        subtitleOverlayElement.style.visibility = 'hidden';
        subtitleOverlayElement.textContent = ''; // 清空内容
        // 确保显示方式保持一致
        subtitleOverlayElement.style.display = 'inline-block';
    }
}

/**
 * 创建字幕叠加层元素并附加到播放器容器。
 * @param {HTMLElement} playerContainer - YouTube 播放器容器元素。
 */
function createSubtitleOverlay(playerContainer: HTMLElement) {
    if (subtitleOverlayElement) return; // 防止重复创建

    // 缓存播放器容器引用
    playerContainerElement = playerContainer;

    // 首先创建一个包装容器，用于定位
    const overlayWrapper = document.createElement('div');
    overlayWrapper.id = 'yt-translator-subtitle-wrapper';
    overlayWrapper.style.cssText = `
        position: absolute;
        bottom: 10%;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        pointer-events: none;
    `;

    // 然后创建实际的字幕容器
    subtitleOverlayElement = document.createElement('div');
    subtitleOverlayElement.id = 'yt-translator-subtitle-overlay';
    subtitleOverlayElement.style.cssText = `
        position: static;
        background-color: rgba(8, 8, 8, 0.75);
        color: rgb(255, 255, 255);
        padding: 0px 8px 0px 8px;
        border-radius: 8px;
        white-space: pre-wrap;
        text-align: center;
        display: inline-block;
        width: auto; /* 关键：宽度由内容自动决定 */
        max-width: 93%; /* 移除最大宽度限制 */
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.1s ease-in-out;
        text-shadow: rgba(0, 0, 0, 0.8) 0px 2px 2px;
    `;

    // 将字幕容器添加到包装容器中
    overlayWrapper.appendChild(subtitleOverlayElement);
    
    // 将包装容器添加到播放器中
    playerContainer.appendChild(overlayWrapper);
    
    console.log('Subtitle overlay created and appended.');

    // --- 新增：初始调用字体大小更新 ---
    updateOverlayFontSize();

    // --- 新增：确保 ResizeObserver 监听 ---
    ensureResizeObserver(playerContainer);
}


// --- NEW: Translation Process Function ---
/**
 * 重构后的翻译流程：获取源和目标（或翻译），然后合并。
 */
async function startTranslationProcess(): Promise<void> {
  console.log('启动翻译流程 (重构版)...');
  stopSubtitleUpdates(); // 停止任何正在运行的更新
  processedSubtitleEvents = []; // 清空旧数据


  // 确保 video 元素存在
  if (!videoElement) {
    videoElement = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!videoElement) {
      console.error('无法找到 video 元素。');
      await setTranslateActive(false); 
      return;
    }
     // videoElement.removeEventListener('timeupdate', handleSubtitleUpdate); // This was commented out before, keep it that way
  }

  // 1. 获取设置和可用轨道
  let settings: { sourceLang?: string; targetLang?: string; } = {};
  let allTracks: any[] | null = null;
  try {
    // settings = await chrome.storage.sync.get(['sourceLang', 'targetLang', 'subtitleMode']); // OLD get
    [settings, allTracks] = await Promise.all([
         chrome.storage.sync.get(['sourceLang', 'targetLang']),
         // fetchAndProcessTracksInfo 现在返回处理后的 [{ languageCode, languageName, kind }],
         // 但我们需要原始轨道数据 (包含 baseUrl) -> 从 cachedCaptionTracks 获取
          fetchAndProcessTracksInfo().then(() => cachedCaptionTracks) // Ensure tracks are fetched and return the raw cached ones
     ]);

    if (!settings.targetLang) {
        // console.warn('未在设置中找到目标语言'); // OLD message
        console.error('未设置目标语言!');
        await setTranslateActive(false);
        return;
    }
     // if (!settings.sourceLang) { // OLD check
       // console.warn('未在设置中找到源语言。');
     // }
     if (!settings.sourceLang) {
         console.error('未设置源语言!');
         await setTranslateActive(false); return;
     }
     if (!allTracks || allTracks.length === 0) {
          console.error('无法获取视频的可用字幕轨道。');
          await setTranslateActive(false); return;
     }
     console.log("获取设置与轨道信息成功:", settings, `找到 ${allTracks.length} 条轨道`);

  } catch (error) {
    console.error('从 chrome.storage.sync 获取设置失败:', error);
    await setTranslateActive(false);
    return;
  }
  const targetLang = settings.targetLang;
  const sourceLang = settings.sourceLang;

  // let targetTrackInfo: { languageCode: string, languageName: string, kind: string } | undefined = undefined; // OLD variable
  // let needsTranslation = true; // OLD variable, logic changes
  // let trackToFetch: any | null = null; // OLD variable, logic changes

  let sourceTrackInfo: any = null;
  let nativeTargetTrackInfo: any = null;
  let needsTranslation = false; // Default to false


  // --- 2. 查找最佳源语言轨道 ---
  console.log(`[源] 查找轨道 for: ${sourceLang}`);
  // (使用与之前类似的 P1-P3 匹配逻辑，但应用于源语言)
  // P1 Source: Exact Match (prefer non-ASR with baseUrl)
   sourceTrackInfo = allTracks.find(track => track.languageCode === sourceLang && track.kind !== 'asr' && track.baseUrl) ||
                     allTracks.find(track => track.languageCode === sourceLang && track.baseUrl);
  // P2/P3 Source: Fuzzy Match (simplified)
   if (!sourceTrackInfo) {
       const sourceBase = sourceLang.split(/[-_]/)[0];
       sourceTrackInfo = allTracks.find(track => track.languageCode === sourceBase && track.kind !== 'asr' && track.baseUrl) ||
                         allTracks.find(track => track.languageCode === sourceBase && track.baseUrl);
       if (!sourceTrackInfo) {
            sourceTrackInfo = allTracks.find(track => track.languageCode.startsWith(sourceBase + '-') && track.kind !== 'asr' && track.baseUrl) ||
                              allTracks.find(track => track.languageCode.startsWith(sourceBase + '-') && track.baseUrl);
       }
   }

   // --- 添加调试日志：打印找到的源轨道信息 ---
   if (sourceTrackInfo) {
     console.log('[Debug] Selected Source Track Info:', {
       languageCode: sourceTrackInfo.languageCode,
       name: sourceTrackInfo.name?.simpleText || 'N/A',
       kind: sourceTrackInfo.kind || 'N/A', //显式显示 kind
       baseUrl: sourceTrackInfo.baseUrl
     });
   } else {
      console.error(`[源] 无法找到有效的源语言轨道 (${sourceLang})`);
      // TODO: Add user-facing notification?
      await setTranslateActive(false);
      return;
   }
   // --- 结束调试日志 ---
   // console.log(`[源] 找到轨道:`, sourceTrackInfo); // 可以注释掉旧的日志


  // --- 3. 查找最佳原生目标语言轨道 ---
   console.log(`[目标] 查找原生轨道 for: ${targetLang}`);
   // (使用之前定义的 P1-P3 匹配逻辑查找目标轨道)
    const targetMatchResult = findBestMatchingTrack(allTracks, targetLang); // 需要一个辅助函数
    nativeTargetTrackInfo = targetMatchResult; // Assuming findBestMatchingTrack returns the full track object or null

   if (nativeTargetTrackInfo) {
       // --- 添加调试日志：打印找到的原生目标轨道信息 ---
       console.log('[Debug] Found Native Target Track Info:', {
         languageCode: nativeTargetTrackInfo.languageCode,
         name: nativeTargetTrackInfo.name?.simpleText || 'N/A',
         kind: nativeTargetTrackInfo.kind || 'N/A', // 显式显示 kind
         baseUrl: nativeTargetTrackInfo.baseUrl
       });
       // --- 结束调试日志 ---
       // console.log(`[目标] 找到原生轨道:`, nativeTargetTrackInfo); // 可以注释掉旧的日志
    needsTranslation = false;
    } else {
       console.log(`[目标] 未找到原生轨道，需要翻译。`);
    needsTranslation = true;
  }

  // --- 4. 异步获取数据 ---
  let sourceSubtitlePromise: Promise<ReturnType<typeof parseSubtitleData>> | null = null;
  let targetSubtitlePromise: Promise<ReturnType<typeof parseSubtitleData>> | null = null; // For native target track


  console.log(`[数据] 开始获取源字幕 (${sourceTrackInfo.languageCode}) from ${sourceTrackInfo.baseUrl}`);
  sourceSubtitlePromise = fetchSubtitleData(sourceTrackInfo.baseUrl)
      .then(data => data ? parseSubtitleData(data, sourceTrackInfo.languageCode) : null)
      .catch(error => {
          console.error(`获取或解析源字幕 (${sourceTrackInfo.languageCode}) 时出错:`, error);
          return null; // Return null on error
      });

  if (!needsTranslation && nativeTargetTrackInfo) {
      console.log(`[数据] 开始获取原生目标字幕 (${nativeTargetTrackInfo.languageCode}) from ${nativeTargetTrackInfo.baseUrl}`);
      targetSubtitlePromise = fetchSubtitleData(nativeTargetTrackInfo.baseUrl)
           .then(data => data ? parseSubtitleData(data, nativeTargetTrackInfo.languageCode) : null)
           .catch(error => {
               console.error(`获取或解析原生目标字幕 (${nativeTargetTrackInfo.languageCode}) 时出错:`, error);
               return null; // Return null on error
          });
  }

  // --- 5. 等待数据获取完成 ---
  const [sourceEvents, nativeTargetEvents] = await Promise.all([
      sourceSubtitlePromise,
      targetSubtitlePromise // Will be null if needsTranslation is true
  ]);

   if (!sourceEvents || sourceEvents.length === 0) {
       console.error("未能获取或解析源字幕数据，无法继续。");
       await setTranslateActive(false);
        return;
    }
   console.log(`[数据] 源字幕事件处理完成 (${sourceEvents.length} 条)`);
   if (nativeTargetEvents && nativeTargetEvents.length > 0) {
        console.log(`[数据] 原生目标字幕事件处理完成 (${nativeTargetEvents.length} 条)`);
   }


  // 获取当前播放时间
  const currentTime = videoElement.currentTime;
  
  // 7. 需要翻译的情况 - 渐进式翻译
  if (needsTranslation) {
    // 创建字幕覆盖层（如果尚未创建）
    if (!subtitleOverlayElement) {
      const playerContainer = document.querySelector('.html5-video-player');
      if (playerContainer) {
        createSubtitleOverlay(playerContainer as HTMLElement);
      }
    }
    
    // 分组字幕，优先处理当前时间附近的
    const { prioritySubtitles, remainingSubtitles } = groupSubtitlesByPriority(
      sourceEvents,
      currentTime,
      120 // 当前时间前后各60秒的字幕优先翻译
    );
    
    // 先翻译优先字幕
    if (prioritySubtitles.length > 0) {
      console.log(`[翻译] 优先处理当前播放时间 ${currentTime.toFixed(2)}s 附近的 ${prioritySubtitles.length} 条字幕`);
      const priorityResults = await translateSubtitlesBatch(
        prioritySubtitles,
        sourceTrackInfo.languageCode,
        targetLang,
        "优先"
      );
      
      // 立即更新和显示结果
      updateWithTranslationResults(
        sourceEvents,
        priorityResults,
        targetLang,
        true // 这是第一批，直接启动显示
      );
    } else {
      console.log(`[翻译] 当前时间 ${currentTime.toFixed(2)}s 附近没有字幕需要优先处理`);
    }
    
    // 后台处理剩余字幕
    if (remainingSubtitles.length > 0) {
      console.log(`[翻译] 后台处理剩余的 ${remainingSubtitles.length} 条字幕`);
      
      // 不等待，后台处理
      translateSubtitlesBatch(
        remainingSubtitles,
        sourceTrackInfo.languageCode,
        targetLang,
        "剩余"
      ).then(remainingResults => {
        // 合并到现有字幕中
        updateWithTranslationResults(
          sourceEvents,
          remainingResults,
          targetLang,
          false // 不是第一批，合并到现有事件中
        );
      }).catch(error => {
        console.error('[翻译] 后台处理剩余字幕时出错:', error);
      });
    } else {
      console.log('[翻译] 没有剩余字幕需要后台处理');
    }
    return;
  }
  
  // 8. 非翻译的情况 - 使用原生字幕
  console.log(`[数据] 原生目标字幕事件处理完成 (${nativeTargetEvents?.length || 0} 条)`);
  // 处理原生目标字幕的情况
  processedSubtitleEvents = mergeSubtitleData(
    sourceEvents,
    nativeTargetEvents,
    targetLang
  );
  
  if (processedSubtitleEvents.length > 0) {
    console.log("[显示] 使用原生目标字幕，开始显示循环。");
    // 创建字幕覆盖层（如果尚未创建）
    if (!subtitleOverlayElement) {
      const playerContainer = document.querySelector('.html5-video-player');
      if (playerContainer) {
        createSubtitleOverlay(playerContainer as HTMLElement);
      }
    }
    startSubtitleDisplayLoop();
  } else {
    console.warn("处理后的原生字幕事件为空，无法显示。");
    await setTranslateActive(false);
  }
}

/** 辅助函数：启动字幕显示循环 */
function startSubtitleDisplayLoop() {
    stopSubtitleUpdates(); 
    if (videoElement && processedSubtitleEvents.length > 0) {
        console.log("启动字幕显示循环 (requestAnimationFrame)");
        animationFrameId = requestAnimationFrame(updateSubtitleLoop);
    } else {
         console.warn("无法启动字幕显示循环，videoElement 或 processedSubtitleEvents 不可用。");
    }
}

/**
 * 辅助函数：将后台返回的翻译结果合并到 processedSubtitleEvents 中。
 * @param translatedData - 后台返回的翻译结果对象 { [id: string]: string }。
 */
function updateStoredSubtitlesWithTranslation(translatedData: { [id: string]: string }) {
    let updatedCount = 0;
    processedSubtitleEvents = processedSubtitleEvents.map((event, index) => {
        const id = `${event.start}-${event.end}-${index}`; // 使用与发送时相同的 ID 生成逻辑
        const translatedText = translatedData[id];
        if (translatedText !== undefined) {
            updatedCount++;
            // return { ...event, translatedText: translatedText }; // OLD STRUCTURE
            // For new structure, we assume this function is called AFTER mergeSubtitleData
            // which already handles populating targetText from translations.
            // This function might become obsolete or needs rework if we want to update existing merged events.
            // Let's comment out the modification for now, as mergeSubtitleData should handle it.
             console.warn("updateStoredSubtitlesWithTranslation called, but logic is now in mergeSubtitleData.");
        } else {
        console.warn(`未找到 ID ${id} 的翻译结果。`);
        }
        return event; // 保持原样
    });
    console.log(`已将 ${updatedCount} 条翻译结果合并到 processedSubtitleEvents (或已在 mergeSubtitleData 中处理)`);
}


// --- Control Injection Logic ---

/**
 * 将自定义控件注入到 YouTube 播放器。
 * @returns {void}
 */
function injectControls(): void { 
  console.log(`[injectControls] Function called. controlsInjected = ${controlsInjected}`);

  // --- Restore combined check: Use flag AND check for existing elements ---
  if (controlsInjected ||
      document.getElementById('vid-translate-toggle-button') ||
      document.getElementById('vid-translate-settings-button')) {
    console.log(`[injectControls] Skipping injection.`);
    controlsInjected = true; 
    return;
  }
  // --- End of combined check ---

  /* // Keep the previous flag-only check commented out for reference
  // --- Use ONLY controlsInjected flag to prevent re-injection in the same context ---
  if (controlsInjected) {
    console.log('[injectControls] Skipping because controlsInjected is already true.'); // Add log for clarity
    return;
  }
  // --- Removed the check for existing element IDs ---
  */

  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) {
    console.log('[injectControls] .ytp-right-controls not found, retrying later...');
    return; // 稍后由 MutationObserver 重试
  }

  // 确保字幕叠加层存在
  const playerContainer = document.querySelector('.html5-video-player');
  if (playerContainer && !subtitleOverlayElement) {
    createSubtitleOverlay(playerContainer as HTMLElement);
  }

  const firstNativeButton = rightControls.firstChild; // 获取插入参照点

  // --- 1. 创建设置按钮 ---
  const { button: settingsButton } = createControlButton(
    'vid-translate-settings-button',
    '翻译设置',
    SETTING_ICON_URL, // 初始图标
    () => { // 点击回调
      console.log('Settings button clicked.');
      // 打开 Side Panel
      chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
         if (chrome.runtime.lastError) {
           console.error('[CS - SettingsClick] Error sending openSidePanel:', chrome.runtime.lastError.message);
         } else if (response?.status === 'success') {
           console.log('[CS - SettingsClick] Background confirmed Side Panel open.');
         } else {
           console.warn('[CS - SettingsClick] Unexpected response for openSidePanel:', response);
         }
       });
       // 确保轨道信息可用 (如果尚未获取)
       fetchAndProcessTracksInfo()
         .then(() => console.log('[CS - SettingsClick] Track info fetched/confirmed for Side Panel.'))
         .catch(error => console.error('[CS - SettingsClick] Failed to fetch track info for Side Panel:', error));
    }
  );
  rightControls.insertBefore(settingsButton, firstNativeButton);
  console.log('[injectControls] Settings button injected.');

  // --- 2. 创建翻译按钮 ---
  const { button: translateButton, icon: toggleIcon } = createControlButton(
    'vid-translate-toggle-button',
    translateActive ? '关闭翻译' : '开启翻译', // 更新初始 tooltip
    translateActive ? ON_ICON_URL : OFF_ICON_URL,
    async () => { // 改为 async 以便调用 setTranslateActive
       const newState = !translateActive; 
       console.log(`Translate button clicked. Attempting state change to: ${newState}`);

       if (newState) {
           // 尝试启动翻译
           // 先更新状态和图标（乐观更新），startTranslationProcess 失败时会回滚
           await setTranslateActive(true);
           startTranslationProcess(); // 异步启动，不阻塞 UI
       } else {
           // 停止翻译
           console.log('Stopping translation process...');
           stopSubtitleUpdates();
           await setTranslateActive(false); // 更新状态、图标、存储
       }
    }
  );
  translateToggleButtonIcon = toggleIcon; 
  translateButton.dataset.tooltipText = translateActive ? '关闭翻译' : '开启翻译'; // 设置初始data-* 属性

  rightControls.insertBefore(translateButton, settingsButton);
  console.log('[injectControls] Translate toggle button injected.');

  // --- 标记注入完成 ---
  controlsInjected = true;
  console.log('[injectControls] Custom controls injected successfully.');
  console.log(`[injectControls] Checking auto-start condition: translateActive = ${translateActive}`); 
  if (translateActive) {
      console.log('[injectControls] Controls injected and translateActive is true, initiating auto-start...');
      startTranslationProcess().catch((error: unknown) => { 
          console.error('[injectControls] Auto-start after injection failed:', error);
      });
  }
}


// --- Initialization and Navigation Handling --- 

/**
 * 注入主世界脚本到页面中。
 */
function injectMainWorldScript() {
  try {
    const scriptId = 'yt-translator-main-world-script';
    if (document.getElementById(scriptId)) {
      console.log('[Content Script] Main world script already injected.');
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('src/main-world.js');
    script.type = 'module'; // 如果 main-world.js 使用了 ES 模块特性
    (document.head || document.documentElement).appendChild(script);
    console.log('[Content Script] Injected main world script:', script.src);
    script.onload = () => {
      console.log('[Content Script] Main world script loaded.');
      // 可选：如果需要明确知道脚本何时准备好，可以在这里设置一个标志，或等待 'MAIN_WORLD_READY' 消息
    };
    script.onerror = (e) => {
       console.error('[Content Script] Failed to load main world script:', e);
    };
  } catch (error) {
    console.error('[Content Script] Error injecting main world script:', error);
  }
}

/**
 * 初始化内容脚本，包括按钮注入、DOM 监听和主世界脚本注入。
 */
function initialize() {
  console.log('初始化内容脚本 (v2 - PostMessage)...');

  // --- 注入主世界脚本 ---
  injectMainWorldScript();
  // --- 结束注入 ---

  // 从存储中读取初始翻译状态
  chrome.storage.sync.get('translateActive', (result) => {
    translateActive = !!result.translateActive; // 使用 !! 确保是布尔值
    console.log('从存储加载的初始翻译状态:', translateActive);
    // 尝试立即注入（如果控件已存在）
    injectControls();
  });

  // 使用 MutationObserver 监听 DOM 变化以确保注入
  const observer = new MutationObserver((mutations) => {
    // 优化：检查是否有相关节点变化，以及控件是否尚未注入
    if (!controlsInjected) {
       const rightControls = document.querySelector('.ytp-right-controls'); // 改为检查右侧控件
       const playerContainer = document.querySelector('.html5-video-player'); // 同时检查播放器容器
       if (rightControls) {
         console.log('[MutationObserver] Detected right controls, attempting injectControls...'); // <--- 新增日志
         // injectControls 会检查 controlsInjected 标志，避免重复调用实际注入逻辑
         // 并且它现在包含了自动启动的逻辑
         injectControls();
       }
       // 如果叠加层需要播放器容器，也在这里检查
       if (playerContainer && !subtitleOverlayElement) {
           // console.log('[MutationObserver] Detected player container, ensuring overlay exists...'); // 可选日志
           createSubtitleOverlay(playerContainer as HTMLElement);
       }
    }
    // 注意：移除了之前在这里重新查找 video 元素并尝试重启循环的逻辑。
    // 现在这个逻辑由 injectControls -> startTranslationProcess 处理。
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('MutationObserver 已设置。');


  // --- 处理来自 Side Panel 或 Background 的消息 ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'requestAvailableTracks') {
          console.log('收到来自 Side Panel 的 requestAvailableTracks 请求');
          // --- 调用新的核心函数获取轨道信息 ---
          fetchAndProcessTracksInfo().then(tracks => {
              console.log('发送给 Side Panel 的可用轨道信息 (来自 Main World):', tracks);
              sendResponse({ availableTracks: tracks || [] });
          }).catch(error => {
              console.error('处理 requestAvailableTracks 时出错 (Main World):', error);
              sendResponse({ availableTracks: [] });
          });
          return true; // 异步响应
      } else if (message.type === 'GET_TRANSLATABLE_LANGUAGES') {
          console.log('[CS] Received GET_TRANSLATABLE_LANGUAGES request.');
          // --- 使用正确的函数获取轨道信息 ---
          fetchAndProcessTracksInfo()
            .then(tracks => {
                console.log('[CS] Fetched Tracks for GET_TRANSLATABLE_LANGUAGES:', JSON.stringify(tracks, null, 2));
                // Send back the processed tracks (which have the desired structure)
                sendResponse({ success: true, availableTracks: tracks || [] });
            })
            .catch(error => {
                console.error('[CS] Error fetching tracks for GET_TRANSLATABLE_LANGUAGES:', error);
                sendResponse({ success: false, error: error.message || 'Failed to fetch track info.' });
            });
          // --- 结束修改 ---
          return true; // Indicate asynchronous response
      }
      return false; // Indicate synchronous response or no response needed for other messages
  });

  // --- 新增：监听存储变化 ---
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.targetLang) {
      const newTargetLang = changes.targetLang.newValue;
      const oldTargetLang = changes.targetLang.oldValue;
      console.log(`[CS Storage Listener] 检测到 targetLang 变化: 从 ${oldTargetLang} 到 ${newTargetLang}`);

      // 检查翻译功能是否处于激活状态
      if (translateActive) {
        console.log('[CS Storage Listener] 翻译功能已激活，将使用新的目标语言重新启动翻译流程...');
        // 重新执行翻译流程
        // 需要确保 startTranslationProcess 能够安全地被重复调用
        // 它应该停止之前的字幕更新、清除状态，然后再开始新的流程
        startTranslationProcess().catch(error => {
          console.error('[CS Storage Listener] 重新启动翻译流程时出错:', error);
          // 考虑是否需要通知用户或回滚状态
        });
      } else {
        console.log('[CS Storage Listener] 翻译功能未激活，无需操作。');
      }
    }
    // 可以添加对 sourceLang 或 subtitleMode 变化的监听（如果需要）
    if (namespace === 'sync' && changes.subtitleMode) {
        const newMode = changes.subtitleMode.newValue;
        const oldMode = changes.subtitleMode.oldValue;
        console.log(`[CS Storage Listener] 检测到 subtitleMode 变化: 从 ${oldMode} 到 ${newMode}`);
        // 字幕模式的改变不需要重新获取或翻译，只需要在下一次 handleSubtitleUpdate 时生效
        // 但如果希望立即看到效果（虽然可能不明显），可以强制调用一次
        if (translateActive && videoElement) {
             console.log('[CS Storage Listener] 翻译已激活，强制更新字幕显示以应用新模式...');
             handleSubtitleUpdate(); // 强制更新一次显示
        }
    }
     if (namespace === 'sync' && changes.sourceLang) {
         const newSourceLang = changes.sourceLang.newValue;
         const oldSourceLang = changes.sourceLang.oldValue;
         console.log(`[CS Storage Listener] 检测到 sourceLang 变化: 从 ${oldSourceLang} 到 ${newSourceLang}`);
         // 如果翻译激活且确实需要翻译（即没有找到原生目标轨道）
         // 则可能需要重新启动流程
         if (translateActive) {
              // 需要更复杂的检查：只有当上次执行 startTranslationProcess 确实进入了"需要翻译"的分支时，
              // sourceLang 的改变才需要重启。如果上次是直接用了原生轨道，则 sourceLang 改变无影响。
              // 为了简化，暂时也触发重启，让 startTranslationProcess 内部逻辑判断是否需要重新获取源轨道。
              console.log('[CS Storage Listener] 翻译功能已激活，将使用新的源语言重新启动翻译流程（如果需要）...');
              // 同样确保 startTranslationProcess 可以安全地被重复调用
              startTranslationProcess().catch(error => {
                  console.error('[CS Storage Listener] 因 sourceLang 改变重新启动翻译流程时出错:', error);
              });
         }
     }
     // 新增：监听翻译API类型变化
     if (namespace === 'sync' && changes.translationApi) {
         const newApi = changes.translationApi.newValue;
         const oldApi = changes.translationApi.oldValue;
         console.log(`[CS Storage Listener] 检测到 translationApi 变化: 从 ${oldApi} 到 ${newApi}`);
         
         // 当翻译API改变并且翻译功能已激活时，重新启动翻译流程
         if (translateActive && processedSubtitleEvents.length > 0) {
             console.log('[CS Storage Listener] 翻译API已变更，重新获取翻译...');
             // 重新执行翻译流程
             startTranslationProcess().catch(error => {
                 console.error('[CS Storage Listener] 因API变更重新翻译时出错:', error);
             });
         }
     }
  });
  // --- 结束监听存储变化 ---

  // --- 新增：监听来自 Main World 的消息 ---
  window.addEventListener('message', (event) => {
    // 验证消息来源和类型
    if (event.source !== window || event.data?.source !== 'main-world') {
      return;
      }

    const { type, payload, error } = event.data;

    if (type === 'MAIN_WORLD_READY') {
        console.log('[Content Script] Received MAIN_WORLD_READY signal.');
        mainWorldReady = true;
        // 如果有等待发送的请求，可以在这里发送 (可能不需要，因为请求只在需要时触发)
        // if (captionTracksRequestSent && !resolveCaptionTracksPromise) {
        //      console.log('[Content Script] Main world ready, re-attempting request...');
        // }
    } else if (type === 'CAPTION_TRACKS_RESPONSE') {
      console.log('[Content Script] Received CAPTION_TRACKS_RESPONSE:', event.data);
      if (error) {
        console.error('[Content Script] Error from main world script:', error);
        if (rejectCaptionTracksPromise) {
          rejectCaptionTracksPromise(new Error(error));
        }
      } else if (payload && resolveCaptionTracksPromise) {
        // 成功收到轨道数据，解决 Promise
        resolveCaptionTracksPromise(payload.captionTracks || null);
      } else {
          console.warn('[Content Script] Received caption tracks response but no pending promise.');
      }
      // 清理 Promise 回调
      resolveCaptionTracksPromise = null;
      rejectCaptionTracksPromise = null;
    }
  });
  // --- 结束监听 Main World 消息 ---

  // --- 处理 YouTube 页面内导航 ---
  // 确保只添加一次监听器
  if (!(document as any).__yt_navigate_listener_added__) {
      document.addEventListener('yt-navigate-finish', handleYoutubeNavigation);
      (document as any).__yt_navigate_listener_added__ = true;
      console.log('已添加 yt-navigate-finish 监听器。');
  } else {
       console.log('yt-navigate-finish 监听器已存在，跳过添加。');
  }
  
  // 初始化字幕显示模式
  initializeSubtitleMode();
  
  console.log('内容脚本初始化完成。');
}

/**
 * 获取并处理当前视频的可用字幕轨道信息 (通过 Main World)。
 * 使用 Promise 来处理异步通信。
 * 只在首次调用时实际请求，之后返回缓存结果。
 * @returns {Promise<{ languageCode: string, languageName: string, kind: string }[] | null>} 处理后的轨道信息数组，或 null 表示获取失败。
 */
async function fetchAndProcessTracksInfo(): Promise<{ languageCode: string, languageName: string, kind: string }[] | null> {
    if (tracksInfoFetched) {
        console.log('[CS-fetch] 轨道信息已获取，返回缓存的处理结果。');
        return processedAvailableTracks;
    }

    console.log('[CS-fetch] 首次请求轨道信息 (向 Main World)...');

    // 如果请求已发送且正在等待响应，避免重复请求
    if (captionTracksRequestSent && (resolveCaptionTracksPromise || rejectCaptionTracksPromise)) {
        console.warn('[CS-fetch] 请求已发送，正在等待响应，请勿重复调用。');
        // 返回一个永远 pending 的 Promise 或 null，或者等待现有 Promise
        // 等待现有 Promise 的简化方式：
        if (resolveCaptionTracksPromise && rejectCaptionTracksPromise) {
             console.log('[CS-fetch] 等待现有 Promise 完成...');
             return new Promise((res, rej) => {
                 const originalResolve = resolveCaptionTracksPromise;
                 const originalReject = rejectCaptionTracksPromise;
                 // @ts-ignore possible null assignment
                 resolveCaptionTracksPromise = (value) => { originalResolve(value); res(processedAvailableTracks); }; // 解决时返回处理后的结果
                 // @ts-ignore possible null assignment
                 rejectCaptionTracksPromise = (reason) => { originalReject(reason); rej(reason); };
             });
        }
        return null; // 如果无法附加到现有 Promise，返回 null
    }

    // --- 创建 Promise 来等待 Main World 的响应 ---
    const captionTracksPromise = new Promise<any[] | null>((resolve, reject) => {
        resolveCaptionTracksPromise = resolve;
        rejectCaptionTracksPromise = reject;

        // 设置超时，例如 10 秒
        const timeoutId = setTimeout(() => {
            if (rejectCaptionTracksPromise) {
                console.error('[CS-fetch] 获取字幕轨道超时。');
                rejectCaptionTracksPromise(new Error('Timeout waiting for caption tracks from main world'));
                resolveCaptionTracksPromise = null; // 清理引用
                rejectCaptionTracksPromise = null; // 清理引用
                captionTracksRequestSent = false; // 允许下次重试
            }
        }, 10000);

        // 包装 resolve/reject 以清理超时
        const wrapPromiseCallback = <T extends (...args: any[]) => void>(callback: T | null): T | null => {
            if (!callback) return null;
            return ((...args: any[]) => {
                clearTimeout(timeoutId);
                callback(...args);
            }) as T;
        };

        resolveCaptionTracksPromise = wrapPromiseCallback(resolveCaptionTracksPromise);
        rejectCaptionTracksPromise = wrapPromiseCallback(rejectCaptionTracksPromise);

        // --- 发送消息到 Main World (如果已就绪) ---
        const sendMessageToMainWorld = () => {
            console.log('[CS-fetch] 发送 REQUEST_CAPTION_TRACKS 消息到 Main World...');
            window.postMessage({
                source: 'content-script',
                type: 'REQUEST_CAPTION_TRACKS'
            }, '*'); // Target origin '*' can be refined
            captionTracksRequestSent = true; // 标记请求已发送
        };

        // 检查 Main World 是否已就绪
        if (mainWorldReady) {
            sendMessageToMainWorld();
            } else {
            // 如果 Main World 尚未就绪，等待 'MAIN_WORLD_READY' 消息
            console.log('[CS-fetch] Main World 尚未就绪，等待 MAIN_WORLD_READY 消息...');
            const readyListener = (event: MessageEvent) => {
                if (event.source === window && event.data?.source === 'main-world' && event.data?.type === 'MAIN_WORLD_READY') {
                    console.log('[CS-fetch] 在等待期间收到 MAIN_WORLD_READY，发送消息...');
                    window.removeEventListener('message', readyListener);
                    sendMessageToMainWorld();
            }
            };
            window.addEventListener('message', readyListener);
            // 额外超时：如果在一定时间内未收到 READY 信号，也视为失败
            const readyTimeoutId = setTimeout(() => {
                window.removeEventListener('message', readyListener);
                if (rejectCaptionTracksPromise) {
                    console.error('[CS-fetch] 等待 MAIN_WORLD_READY 超时。');
                     rejectCaptionTracksPromise(new Error('Timeout waiting for main world script to be ready'));
                     resolveCaptionTracksPromise = null;
                     rejectCaptionTracksPromise = null;
                     captionTracksRequestSent = false;
                }
            }, 5000); // 例如 5 秒
            // 包装 resolve/reject 以清理 readyTimeoutId
             const wrapPromiseCallbackForReady = <T extends (...args: any[]) => void>(callback: T | null): T | null => {
                 if (!callback) return null;
                 return ((...args: any[]) => {
                     clearTimeout(readyTimeoutId);
                     window.removeEventListener('message', readyListener); // 确保监听器被移除
                     callback(...args);
                 }) as T;
            };
            resolveCaptionTracksPromise = wrapPromiseCallbackForReady(resolveCaptionTracksPromise);
            rejectCaptionTracksPromise = wrapPromiseCallbackForReady(rejectCaptionTracksPromise);
        }
    });
    // --- 结束 Promise 创建 ---

    try {
        // 等待 Main World 的响应
        const rawTracks = await captionTracksPromise;
        console.log('[CS-fetch] 从 Main World 收到原始轨道:', rawTracks);

        if (rawTracks && Array.isArray(rawTracks) && rawTracks.length > 0) {
            cachedCaptionTracks = rawTracks; // 缓存原始数据
            console.log('[CS-fetch] 处理收到的原始轨道数据...');

            // --- 处理逻辑：直接映射所有轨道，保持原始 kind --- 
             processedAvailableTracks = rawTracks.map((track: any) => {
                // 直接使用原始的 kind 值，不做任何修改或默认赋值
            return {
                languageCode: track.languageCode,
                    languageName: track.name?.simpleText || track.languageCode, // 使用 name.simpleText，回退到 code
                    kind: track.kind // 直接使用原始 kind (可能为 undefined, null, 'asr', etc.)
            };
        });
            console.log(`[CS-fetch] 处理完成的轨道信息:`, processedAvailableTracks);

    } else {
            console.warn('[CS-fetch] 从 Main World 收到的轨道数据无效或为空。');
            cachedCaptionTracks = null;
        processedAvailableTracks = []; 
    }

    tracksInfoFetched = true;
        // 清理请求发送标志，以便下次导航可以重新请求
        // captionTracksRequestSent = false; // 移动到 finally 或 navigation handler

    } catch (error) {
        console.error('[CS-fetch] 获取或处理轨道信息时出错:', error);
        tracksInfoFetched = false; // 获取失败，标记为未获取
        cachedCaptionTracks = null;
        processedAvailableTracks = null;
        // return null; // 错误时将在 finally 后返回
        throw error; // 重新抛出错误，让调用者知道失败了
    } finally {
        // 清理回调引用，无论成功或失败
        resolveCaptionTracksPromise = null;
        rejectCaptionTracksPromise = null;
        // 不在这里重置 captionTracksRequestSent，由导航处理器负责
        console.log('[CS-fetch] Promise 处理完成 (finally)。');
    }
     // 只有在成功时返回处理结果
     return processedAvailableTracks;
    }


/**
 * 处理 YouTube 页面内导航完成事件。
 * 重置与特定视频相关的状态。
 */
function handleYoutubeNavigation(): void {
    console.log('检测到 YouTube 页面导航，准备清理并重置状态...');
    // 停止任何正在运行的字幕更新循环
    stopSubtitleUpdates();

    // 重置与当前视频相关的状态
    cachedCaptionTracks = null;
    tracksInfoFetched = false;
    processedAvailableTracks = null;
    processedSubtitleEvents = [];
    videoElement = null;
    // 注意：不重置 translateActive，因为我们希望在导航后保持状态

    // 移除任何现有的按钮（在重置标志前）
    // 主动清理步骤：查找并移除旧按钮元素。
    const existingTranslateButton = document.getElementById('vid-translate-toggle-button');
    const existingSettingsButton = document.getElementById('vid-translate-settings-button');
    if (existingTranslateButton) {
        existingTranslateButton.remove();
        console.log('已移除旧的翻译按钮。');
    }
    if (existingSettingsButton) {
        existingSettingsButton.remove();
        console.log('已移除旧的设置按钮。');
    }

    // 现在重置注入标志
    controlsInjected = false;
    console.log('重置控件注入标志。');

    // 向后台脚本发送导航完成通知
    // 后台脚本会广播这个消息，让 Side Panel 能够更新其轨道列表
    chrome.runtime.sendMessage({ action: 'youtubeNavigationFinished' }, response => {
        if (chrome.runtime.lastError) {
            console.warn('发送页面导航消息时出错:', chrome.runtime.lastError);
        } else {
            console.log('页面导航消息发送成功，响应:', response);
        }
    });
    
    // 在页面导航后重新应用当前字幕模式，确保一致性
    if (currentSubtitleMode) {
        console.log(`[ContentScript] 页面导航后重新应用字幕模式: ${currentSubtitleMode}`);
        applySubtitleMode(currentSubtitleMode);
    } else {
        // 如果当前没有设置字幕模式，初始化它
        initializeSubtitleMode();
    }
}

/**
 * 辅助函数，用于设置翻译状态并更新存储和图标。
 * @param {boolean} active - 新的翻译状态。
 */
async function setTranslateActive(active: boolean): Promise<void> {
  // 获取之前的状态，以便执行适当的清理
  const wasActive = translateActive;
  translateActive = active;
  
  // 更新图标
  if (translateToggleButtonIcon) {
    translateToggleButtonIcon.src = active ? ON_ICON_URL : OFF_ICON_URL;
    // 更新 tooltip 文本
    const button = translateToggleButtonIcon.closest('button');
    if (button) {
        button.dataset.tooltipText = active ? '关闭翻译' : '开启翻译';
    }
  }
  
  // 如果是从开启状态切换到关闭状态，执行必要的清理
  if (wasActive && !active) {
    // 停止字幕更新循环
    stopSubtitleUpdates();
    // 清空字幕数据
    processedSubtitleEvents = [];
    console.log('翻译关闭，已清理字幕显示和数据');
  }
  
  // 保存到存储
  try {
    await chrome.storage.sync.set({ translateActive: active });
    console.log(`翻译状态已${active ? '激活' : '关闭'}并保存。`);
  } catch (error) {
    console.error('保存翻译状态到 chrome.storage.sync 时出错:', error);
    // 这里可以考虑是否回滚 UI 状态，或者只是记录错误
  }
}

// 在脚本加载时执行初始化
initialize(); 

/**
 * NEW: 合并源字幕数据和目标字幕/翻译数据。
 * 以源字幕的时间戳为基准。
 * @param sourceEvents - 解析后的源语言字幕事件数组。
 * @param targetEventsOrTranslations - 解析后的原生目标语言字幕事件数组 或 从后台获取的翻译结果对象。
 * @param targetLangCode - 目标语言代码。
 * @returns {SubtitleEvent[]} 合并后的字幕事件数组。
 */
function mergeSubtitleData(
    sourceEvents: { start: number; end: number; text: string; langCode: string }[],
    targetEventsOrTranslations: { start: number; end: number; text: string; langCode: string }[] | { [id: string]: string } | null,
    targetLangCode: string
): SubtitleEvent[] {
    console.log("开始合并字幕数据...");
    const mergedEvents: SubtitleEvent[] = [];

    // 如果源事件为空，直接返回空数组
    if (!sourceEvents || sourceEvents.length === 0) {
        console.warn("源字幕事件为空，无法合并");
        return [];
    }

    const isTargetNative = Array.isArray(targetEventsOrTranslations);
    const translations = isTargetNative ? null : targetEventsOrTranslations as { [id: string]: string } | null;

    // 添加日志输出
    if (!targetEventsOrTranslations) {
        console.warn("目标字幕/翻译为null，将只使用源字幕");
    }

    for (const sourceEvent of sourceEvents) {
        let targetText: string | null = null;

        if (isTargetNative && targetEventsOrTranslations) {
            // 查找时间上重叠的原生目标事件 (简单匹配：开始时间在源事件区间内)
            // A more robust approach might average timings or find the closest start time.
            const matchingTargetEvent = (targetEventsOrTranslations as { start: number; end: number; text: string; }[]).find(
                targetEvent => targetEvent.start >= sourceEvent.start && targetEvent.start < sourceEvent.end
            );
            targetText = matchingTargetEvent ? matchingTargetEvent.text : null;
        } else if (translations) {
            // 从翻译结果中查找 (使用 ID)
            // ID generation MUST match the one used when sending the request in startTranslationProcess
            const eventId = `${sourceEvent.start}-${sourceEvent.end}-${sourceEvents.indexOf(sourceEvent)}`;
            targetText = translations[eventId] || null;
            if (!targetText && Object.keys(translations).length > 0) { // Only warn if translations exist but ID missing
                console.warn(`未找到 ID ${eventId} 的翻译结果。`);
            }
        }

        // 无论是否有目标文本，都添加合并事件
        mergedEvents.push({
            start: sourceEvent.start,
            end: sourceEvent.end,
            sourceText: sourceEvent.text,
            targetText: targetText,
            sourceLangCode: sourceEvent.langCode,
            targetLangCode: targetLangCode
        });
    }

    // 确保合并后的数组不为空
    if (mergedEvents.length === 0) {
        console.warn("合并后的字幕事件为空，这可能是个异常情况");
        // 应当至少有源事件的转换
    }

    console.log(`合并完成，生成了 ${mergedEvents.length} 条双语字幕事件。`);
    return mergedEvents;
}


// Need to implement the findBestMatchingTrack helper function based on P1-P3 logic
/**
 * Finds the best matching track from available tracks based on target language code.
 * @param availableTracks - Array of raw tracks from cachedCaptionTracks.
 * @param targetLang - The desired target language code (e.g., 'en', 'zh-Hans').
 * @returns The full track object (including baseUrl) or null if no suitable match found.
 */
function findBestMatchingTrack(availableTracks: any[], targetLang: string): any | null {
     if (!availableTracks || availableTracks.length === 0 || !targetLang) {
         return null;
     }
     console.log(`[Matcher] Finding best match for target '${targetLang}' among ${availableTracks.length} tracks.`);

     let bestMatch: any = null;

     // P1: Exact Match (prefer non-ASR with baseUrl)
     bestMatch = availableTracks.find(t => t.languageCode === targetLang && t.kind !== 'asr' && t.baseUrl) ||
                 availableTracks.find(t => t.languageCode === targetLang && t.baseUrl);
     if (bestMatch) { console.log(`[Matcher P1] Found exact match:`, bestMatch); return bestMatch; }

    // P2 & P3: Combined Fuzzy Logic
    const targetBase = targetLang.split(/[-_]/)[0];
    const targetHasRegionOrScript = targetLang.includes('-') || targetLang.includes('_');
    const targetIsChineseScript = targetLang === 'zh-Hans' || targetLang === 'zh-Hant';

    // P2 (Target Specific -> Base or Region Mapping)
    if (targetIsChineseScript) {
        const hansMatches = ['zh-CN', 'zh-SG'];
        const hantMatches = ['zh-TW', 'zh-HK'];
        const regionMatches = targetLang === 'zh-Hans' ? hansMatches : hantMatches;
        bestMatch = availableTracks.find(t => regionMatches.includes(t.languageCode) && t.kind !== 'asr' && t.baseUrl) ||
                    availableTracks.find(t => regionMatches.includes(t.languageCode) && t.baseUrl);
        if (bestMatch) { console.log(`[Matcher P2 - zh region] Found match:`, bestMatch); return bestMatch; }
    } else if (targetHasRegionOrScript) { // Non-Chinese Specific Target -> Base Code
        bestMatch = availableTracks.find(t => t.languageCode === targetBase && t.kind !== 'asr' && t.baseUrl) ||
                    availableTracks.find(t => t.languageCode === targetBase && t.baseUrl);
        if (bestMatch) { console.log(`[Matcher P2 - Non-zh specific->base] Found match:`, bestMatch); return bestMatch; }
    }

     // P3 (Target General -> Specific or Generic zh)
     if (targetIsChineseScript) { // Target is zh-Hans/Hant -> Generic 'zh'
         bestMatch = availableTracks.find(t => t.languageCode === 'zh' && t.kind !== 'asr' && t.baseUrl) ||
                     availableTracks.find(t => t.languageCode === 'zh' && t.baseUrl);
          if (bestMatch) { console.log(`[Matcher P3 - zh script->generic] Found match:`, bestMatch); return bestMatch; }
     } else if (!targetHasRegionOrScript) { // Target is Base Code -> First Specific Variant
          bestMatch = availableTracks.find(t => (t.languageCode.startsWith(targetBase + '-') || t.languageCode.startsWith(targetBase + '_')) && t.kind !== 'asr' && t.baseUrl) ||
                      availableTracks.find(t => (t.languageCode.startsWith(targetBase + '-') || t.languageCode.startsWith(targetBase + '_')) && t.baseUrl);
          if (bestMatch) { console.log(`[Matcher P3 - Non-zh base->specific] Found match:`, bestMatch); return bestMatch; }
     }

     console.log(`[Matcher] No suitable match found for '${targetLang}' after all levels.`);
     return null; // No suitable match found
} 

/**
 * 根据播放器的大小更新字幕叠加层的字体大小。
 * 基于对 YouTube 原生字幕行为的测量数据进行调整。
 */
function updateOverlayFontSize(): void {
  if (!subtitleOverlayElement) return; // 如果叠加层不存在，则不执行任何操作

  // 尝试获取播放器容器 (如果尚未缓存)
  if (!playerContainerElement) {
    playerContainerElement = document.querySelector<HTMLElement>('.html5-video-player');
  }

  if (playerContainerElement) {
    const playerHeight = playerContainerElement.clientHeight;

    // --- 基于测量数据的线性计算 ---
    // 通过测量发现，原生字幕字体大小与播放器高度近似成正比
    // font-size ≈ playerHeight * 0.0444
    const calculatedPx = playerHeight * 0.0444;

    // 设置一个最小字体大小，防止过小 (基于测量到的最小值 12.44px)
    const minPx = 12;
    const finalPx = Math.max(minPx, calculatedPx);

    const newSize = finalPx.toFixed(1) + 'px'; // 保留一位小数

    // 仅在字体大小实际改变时更新，以减少不必要的 DOM 操作
    if (subtitleOverlayElement.style.fontSize !== newSize) {
      subtitleOverlayElement.style.fontSize = newSize;
       // console.log(`Player height: ${playerHeight.toFixed(1)}px, Updated font size: ${newSize}`); // Optional debug log
    }
  } else {
    // console.warn("updateOverlayFontSize: Player container not found."); // 调试日志
  }
}

/**
 * 创建字幕叠加层元素并附加到播放器容器。
 * @param {HTMLElement} playerContainer - YouTube 播放器容器元素。
 */

/**
 * 确保 ResizeObserver 正在监听播放器容器。
 * @param {HTMLElement} playerContainer - YouTube 播放器容器元素。
 */
function ensureResizeObserver(playerContainer: HTMLElement): void {
    // 如果已存在观察者，先断开连接
    if (playerResizeObserver) {
        playerResizeObserver.disconnect();
    } else {
        // 如果不存在，创建新的观察者
        playerResizeObserver = new ResizeObserver(() => {
            // 播放器大小变化时，同时更新字体大小和宽度
            updateOverlayFontSize();
            updateOverlayWidth();
        });
    }
    // 开始观察播放器容器
    playerResizeObserver.observe(playerContainer);
    console.log('ResizeObserver started observing player container.');
}

/**
 * 根据播放器宽度和字幕内容动态调整字幕容器宽度
 * 模拟YouTube原生字幕的宽度行为 - 宽度由内容决定
 */
function updateOverlayWidth(): void {
  if (!subtitleOverlayElement || !playerContainerElement) return;
  
  // 关键修改：移除最大宽度限制，让容器宽度完全由内容决定
  // 设置宽度为自动，让浏览器根据内容计算实际宽度
  subtitleOverlayElement.style.width = 'auto';
  subtitleOverlayElement.style.maxWidth = '93%'; // 移除最大宽度限制
  
  // 可选：强制重新计算布局
  void subtitleOverlayElement.offsetWidth;
  
  // console.log(`字幕容器宽度设为自动，无最大宽度限制`);
}

// --- 字幕模式处理逻辑 ---
/** 存储当前应用的字幕模式 */
let currentSubtitleMode: string | null = null;

/**
 * 根据指定的模式调整字幕的显示。
 * @param {string} mode - 字幕模式 ('bilingual' 或 'targetOnly')。
 */
function applySubtitleMode(mode: string): void {
    if (mode === currentSubtitleMode && document.body.classList.contains(`subtitle-mode-${mode}`)) {
        console.log(`[ContentScript] 字幕模式已经是 ${mode}，无需重复应用。`);
        return;
    }
    console.log(`[ContentScript] 应用字幕模式: ${mode}`);
    
    // 更新全局变量
    currentSubtitleMode = mode;
    
    // 更新文档类以支持可能的CSS样式调整
    if (mode === 'bilingual') {
        document.body.classList.add('subtitle-mode-bilingual');
        document.body.classList.remove('subtitle-mode-targetOnly');
    } else if (mode === 'targetOnly') {
        document.body.classList.remove('subtitle-mode-bilingual');
        document.body.classList.add('subtitle-mode-targetOnly');
    }
    
    // 如果当前有活动字幕，立即更新显示
    if (translateActive && subtitleOverlayElement) {
        handleSubtitleUpdate();
    }
}

/**
 * 初始化时加载并应用当前字幕模式。
 */
function initializeSubtitleMode(): void {
    chrome.storage.sync.get('subtitleMode', (data) => {
        if (chrome.runtime.lastError) {
            console.error('[ContentScript] 初始化字幕模式时无法读取存储:', chrome.runtime.lastError);
            applySubtitleMode('bilingual'); // 发生错误时默认使用双语
            return;
        }
        const initialMode = data.subtitleMode || 'bilingual'; // 如果未设置，默认为双语
        console.log(`[ContentScript] 从存储初始化字幕模式为: ${initialMode}`);
        applySubtitleMode(initialMode);
    });
}

// --- 结束字幕模式处理逻辑 ---


// --- 消息监听器应该在顶层作用域 --- 
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[ContentScript] 收到消息:', request);
    if (request.action === 'subtitleModeUpdated') {
        console.log(`[ContentScript] 收到字幕模式更新消息: ${request.mode}`);
        applySubtitleMode(request.mode);
        sendResponse({ status: '字幕模式已在内容脚本中接收并应用', newMode: request.mode });
        return true; // 指示异步响应
    }
    // ... 处理其他消息，例如 requestAvailableTracks
    if (request.action === 'requestAvailableTracks') {
        console.log('[CS] 收到了 requestAvailableTracks 请求');
        if (processedAvailableTracks) {
            console.log('[CS] 直接使用缓存的轨道信息响应', processedAvailableTracks);
            sendResponse({ availableTracks: processedAvailableTracks });
        } else {
            fetchAndProcessTracksInfo().then(tracks => {
                console.log('[CS] 异步获取轨道信息后响应', tracks);
                sendResponse({ availableTracks: tracks });
            }).catch(error => {
                console.error('[CS] 获取轨道信息失败:', error);
                sendResponse({ availableTracks: null, error: error.message });
            });
            return true; // 异步响应
        }
    }
    return false; // 对于同步消息，或者如果此监听器未处理该消息
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.subtitleMode) {
        const newMode = changes.subtitleMode.newValue;
        if (newMode) {
            console.log(`[ContentScript] 检测到存储中的 subtitleMode 变化: ${newMode}`);
            applySubtitleMode(newMode);
        }
    }
});


// 在 initialize 函数的末尾或者一个合适的早期阶段调用 initializeSubtitleMode
// 例如，在你的 initialize 函数找到后，可以这样修改：
/*
function initialize() {
  // ... 你现有的 initialize 代码 ...
  initializeSubtitleMode(); // 在这里初始化字幕模式
  console.log('内容脚本初始化完成。');
}
*/

// 确保 DOMContentLoaded 后或在 MutationObserver 发现播放器后调用 initialize
// (根据你现有逻辑)
// 如果 initialize 是通过 MutationObserver 调用的，那么 initializeSubtitleMode 也会在播放器准备好后执行

console.log('[ContentScript] YouTube 双字幕内容脚本逻辑已定义。');
// 确保 initializeSubtitleMode 在合适的时机被调用，例如在你的主初始化函数 initialize() 内部的末尾。
// 如果 initialize() 是在检测到播放器后才调用的，那就很好。
// 如果不是，你可能需要将 initializeSubtitleMode() 的调用移到 initialize() 函数内部的末尾，
// 或者确保它在 subtitleOverlayElement 可能被创建和访问之前执行。
// 伪代码：
// someInitializationFunctionThatEnsuresPlayerIsReady().then(() => {
//   initialize(); // 你现有的初始化
//   initializeSubtitleMode(); // 在播放器和你的UI元素初始化之后获取初始模式
// });

// 找到你的 initialize 函数，在其末尾调用 initializeSubtitleMode();
// 我将假设你的 initialize 函数在文件后面某处定义并被调用
// ... many lines of existing code ...

// 找到类似下面的 initialize 调用点，或者 initialize 函数定义本身
//  window.addEventListener('DOMContentLoaded', initialize);
//  OR in a MutationObserver that calls initialize()

// For now, I'll place the call here, but you should move it into your actual initialize() function
// or right after your initialize() is called.
// BEST PLACE: Inside your `initialize` function, towards the end.
// initializeSubtitleMode(); // TEMPORARY PLACEMENT - MOVE THIS

/**
 * 根据当前播放时间，识别需要优先翻译的字幕
 * @param sourceEvents 源字幕事件数组
 * @param currentTime 当前播放时间（秒）
 * @param contextSeconds 上下文范围（秒）
 * @returns 分组后的字幕：{ prioritySubtitles, remainingSubtitles }
 */
function groupSubtitlesByPriority(
  sourceEvents: { start: number; end: number; text: string; langCode: string }[],
  currentTime: number,
  contextSeconds: number = 90
): {
  prioritySubtitles: { id: string, text: string }[],
  remainingSubtitles: { id: string, text: string }[]
} {
  const prioritySubtitles: { id: string, text: string }[] = [];
  const remainingSubtitles: { id: string, text: string }[] = [];
  
  // 计算上下文时间范围
  const startContext = Math.max(0, currentTime - contextSeconds / 2);
  const endContext = currentTime + contextSeconds / 2;
  
  // 按照距离当前时间的远近，对字幕进行排序
  const sortedEvents = [...sourceEvents].sort((a, b) => {
    const midPointA = (a.start + a.end) / 2;
    const midPointB = (b.start + b.end) / 2;
    const distanceA = Math.abs(midPointA - currentTime);
    const distanceB = Math.abs(midPointB - currentTime);
    return distanceA - distanceB;
  });
  
  // 将字幕分为优先和剩余两组
  sortedEvents.forEach((event, index) => {
    const id = `${event.start}-${event.end}-${index}`;
    const subtitle = { id, text: event.text };
    
    // 如果字幕在当前上下文时间范围内，则优先处理
    if (event.start <= endContext && event.end >= startContext) {
      prioritySubtitles.push(subtitle);
    } else {
      remainingSubtitles.push(subtitle);
    }
  });
  
  console.log(`[分组] 当前时间 ${currentTime.toFixed(2)}s, 上下文范围 ±${contextSeconds/2}s`);
  console.log(`[分组] 优先字幕: ${prioritySubtitles.length}条, 剩余字幕: ${remainingSubtitles.length}条`);
  
  return { prioritySubtitles, remainingSubtitles };
}

/**
 * 翻译字幕并处理结果
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @param batchDescription 批次描述（用于日志）
 * @returns 翻译结果对象
 */
async function translateSubtitlesBatch(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string,
  batchDescription: string = "字幕"
): Promise<{ [id: string]: string }> {
  if (subtitles.length === 0) {
    console.log(`[翻译] ${batchDescription}批次为空，跳过翻译`);
    return {};
  }
  
  console.log(`[翻译] 开始翻译${batchDescription}批次，共 ${subtitles.length} 条 (${sourceLang} -> ${targetLang})`);
  
  try {
    // 获取当前的翻译API类型
    const apiSettings = await chrome.storage.sync.get(['translationApi']);
    const apiType = apiSettings.translationApi || 'google-free';
    
    // 根据API类型获取显示名称
    let apiDisplayName = "翻译服务";
    switch(apiType) {
      case 'google-free': apiDisplayName = "Google翻译"; break;
      case 'microsoft-free': apiDisplayName = "微软翻译"; break;
      case 'baidu-paid': apiDisplayName = "百度翻译"; break;
      case 'tencent-paid': apiDisplayName = "腾讯翻译"; break;
      case 'azure-paid': apiDisplayName = "Azure翻译"; break;
      case 'deepl-paid': apiDisplayName = "DeepL翻译"; break;
      case 'openai': apiDisplayName = "OpenAI翻译"; break;
      case 'custom': apiDisplayName = "自定义翻译"; break;
    }
    
    const response: any = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'translateSubtitles',
          payload: { subtitles: subtitles, targetLang: targetLang, sourceLang: sourceLang }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.status === 'success') {
            resolve(response);
          } else {
            reject(new Error(response?.message || 'Unknown translation error from background'));
          }
        }
      );
    });
    
    const translationResults = response.translatedSubtitles || {};
    console.log(`[翻译] ${batchDescription}批次翻译成功，收到 ${Object.keys(translationResults).length} 条结果`);
    return translationResults;
    
  } catch (error) {
    console.error(`[翻译] ${batchDescription}批次翻译失败:`, error);
    
    // 获取当前使用的翻译API名称
    const apiSettings = await chrome.storage.sync.get(['translationApi']);
    const apiType = apiSettings.translationApi || 'google-free';
    
    // 根据API类型获取显示名称
    let apiDisplayName = "翻译服务";
    switch(apiType) {
      case 'google-free': apiDisplayName = "Google翻译"; break;
      case 'microsoft-free': apiDisplayName = "微软翻译"; break;
      case 'openai': apiDisplayName = "OpenAI翻译"; break;
      default: apiDisplayName = "翻译服务"; break;
    }
    
    // 为每个字幕创建错误消息
    const errorMessage = `使用${apiDisplayName}翻译服务失败，请切换翻译服务`;
    const errorTranslations: { [id: string]: string } = {};
    
    subtitles.forEach(subtitle => {
      errorTranslations[subtitle.id] = errorMessage;
    });
    
    console.log(`[翻译错误] 为${batchDescription}批次创建了 ${Object.keys(errorTranslations).length} 条错误消息`);
    return errorTranslations;
  }
}

/**
 * 合并新翻译结果并更新字幕显示
 * @param sourceEvents 源字幕事件
 * @param translationResults 翻译结果
 * @param targetLang 目标语言
 * @param isFirstBatch 是否是第一批结果
 */
function updateWithTranslationResults(
  sourceEvents: { start: number; end: number; text: string; langCode: string }[],
  translationResults: { [id: string]: string },
  targetLang: string,
  isFirstBatch: boolean = false
): void {
  // 创建ID到源事件的映射
  const sourceEventMap = new Map();
  sourceEvents.forEach((event, index) => {
    const id = `${event.start}-${event.end}-${index}`;
    sourceEventMap.set(id, event);
  });
  
  // 准备要更新的字幕事件
  const newEvents: SubtitleEvent[] = [];
  
  // 处理这批翻译结果
  for (const [id, translation] of Object.entries(translationResults)) {
    const sourceEvent = sourceEventMap.get(id);
    if (sourceEvent) {
      newEvents.push({
        start: sourceEvent.start,
        end: sourceEvent.end,
        sourceText: sourceEvent.text,
        targetText: translation,
        sourceLangCode: sourceEvent.langCode,
        targetLangCode: targetLang
      });
    }
  }
  
  if (newEvents.length === 0) {
    console.log('[更新] 没有新的字幕事件需要更新');
    return;
  }
  
  console.log(`[更新] 处理了 ${newEvents.length} 条新翻译的字幕事件`);
  
  // 如果是第一批，直接替换；否则合并
  if (isFirstBatch) {
    processedSubtitleEvents = newEvents;
    console.log('[更新] 首批字幕已加载，开始显示循环');
    startSubtitleDisplayLoop();
  } else {
    // 合并现有的和新的字幕事件，避免重复
    const existingIds = new Set(processedSubtitleEvents.map(
      event => `${event.start}-${event.end}-${event.sourceText}`
    ));
    
    // 只添加不存在的事件
    for (const event of newEvents) {
      const eventId = `${event.start}-${event.end}-${event.sourceText}`;
      if (!existingIds.has(eventId)) {
        processedSubtitleEvents.push(event);
        existingIds.add(eventId);
      }
    }
    
    console.log(`[更新] 字幕事件合并完成，现有 ${processedSubtitleEvents.length} 条`);
    // 更新已在运行的显示循环会自动使用新的事件
  }
}

/**
 * 启动翻译流程的主要函数
 */
async function startTranslationProcess(): Promise<void> {
  console.log('启动渐进式翻译流程...');
  stopSubtitleUpdates(); // 停止任何正在运行的更新
  processedSubtitleEvents = []; // 清空旧数据

  // 确保 video 元素存在
  if (!videoElement) {
    videoElement = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!videoElement) {
      console.error('无法找到 video 元素。');
      await setTranslateActive(false); 
      return;
    }
  }

  // 1. 获取设置和可用轨道
  let settings: { sourceLang?: string; targetLang?: string; } = {};
  let allTracks: any[] | null = null;
  try {
    [settings, allTracks] = await Promise.all([
      chrome.storage.sync.get(['sourceLang', 'targetLang']),
      fetchAndProcessTracksInfo().then(() => cachedCaptionTracks)
    ]);

    if (!settings.targetLang) {
      console.error('未设置目标语言!');
      await setTranslateActive(false);
      return;
    }
    if (!settings.sourceLang) {
      console.error('未设置源语言!');
      await setTranslateActive(false); 
      return;
    }
    if (!allTracks || allTracks.length === 0) {
      console.error('无法获取视频的可用字幕轨道。');
      await setTranslateActive(false); 
      return;
    }
    console.log("获取设置与轨道信息成功:", settings, `找到 ${allTracks.length} 条轨道`);

  } catch (error) {
    console.error('从 chrome.storage.sync 获取设置失败:', error);
    await setTranslateActive(false);
    return;
  }
  const targetLang = settings.targetLang;
  const sourceLang = settings.sourceLang;

  let sourceTrackInfo: any = null;
  let nativeTargetTrackInfo: any = null;
  let needsTranslation = false; // Default to false

  // 2. 查找最佳源语言轨道
  console.log(`[源] 查找轨道 for: ${sourceLang}`);
  sourceTrackInfo = allTracks.find(track => track.languageCode === sourceLang && track.kind !== 'asr' && track.baseUrl) ||
                   allTracks.find(track => track.languageCode === sourceLang && track.baseUrl);
  
  if (!sourceTrackInfo) {
    const sourceBase = sourceLang.split(/[-_]/)[0];
    sourceTrackInfo = allTracks.find(track => track.languageCode === sourceBase && track.kind !== 'asr' && track.baseUrl) ||
                     allTracks.find(track => track.languageCode === sourceBase && track.baseUrl);
    if (!sourceTrackInfo) {
      sourceTrackInfo = allTracks.find(track => track.languageCode.startsWith(sourceBase + '-') && track.kind !== 'asr' && track.baseUrl) ||
                       allTracks.find(track => track.languageCode.startsWith(sourceBase + '-') && track.baseUrl);
    }
  }

  if (!sourceTrackInfo) {
    console.error(`[源] 无法找到有效的源语言轨道 (${sourceLang})`);
    await setTranslateActive(false);
    return;
  }

  // 3. 查找最佳原生目标语言轨道
  console.log(`[目标] 查找原生轨道 for: ${targetLang}`);
  const targetMatchResult = findBestMatchingTrack(allTracks, targetLang);
  nativeTargetTrackInfo = targetMatchResult;

  if (nativeTargetTrackInfo) {
    console.log('[Debug] 找到原生目标轨道:', {
      languageCode: nativeTargetTrackInfo.languageCode,
      name: nativeTargetTrackInfo.name?.simpleText || 'N/A',
      kind: nativeTargetTrackInfo.kind || 'N/A',
      baseUrl: nativeTargetTrackInfo.baseUrl
    });
    needsTranslation = false;
  } else {
    console.log(`[目标] 未找到原生轨道，需要翻译。`);
    needsTranslation = true;
  }

  // 4. 获取源字幕数据
  console.log(`[数据] 开始获取源字幕 (${sourceTrackInfo.languageCode}) from ${sourceTrackInfo.baseUrl}`);
  const sourceDataPromise = fetchSubtitleData(sourceTrackInfo.baseUrl)
    .then(data => data ? parseSubtitleData(data, sourceTrackInfo.languageCode) : null)
    .catch(error => {
      console.error(`获取或解析源字幕 (${sourceTrackInfo.languageCode}) 时出错:`, error);
      return null;
    });

  // 5. 如果有原生目标字幕，也获取它
  let targetDataPromise: Promise<{ start: number; end: number; text: string; langCode: string }[] | null> = Promise.resolve(null);
  if (!needsTranslation && nativeTargetTrackInfo) {
    console.log(`[数据] 开始获取原生目标字幕 (${nativeTargetTrackInfo.languageCode}) from ${nativeTargetTrackInfo.baseUrl}`);
    targetDataPromise = fetchSubtitleData(nativeTargetTrackInfo.baseUrl)
      .then(data => data ? parseSubtitleData(data, nativeTargetTrackInfo.languageCode) : null)
      .catch(error => {
        console.error(`获取或解析原生目标字幕 (${nativeTargetTrackInfo.languageCode}) 时出错:`, error);
        return null;
      });
  }

  // 6. 等待源字幕和可能的原生目标字幕数据
  const [sourceEvents, nativeTargetEvents] = await Promise.all([sourceDataPromise, targetDataPromise]);

  if (!sourceEvents || sourceEvents.length === 0) {
    console.error("未能获取或解析源字幕数据，无法继续。");
    await setTranslateActive(false);
    return;
  }
  console.log(`[数据] 源字幕事件处理完成 (${sourceEvents.length} 条)`);
  
  if (nativeTargetEvents && nativeTargetEvents.length > 0) {
    console.log(`[数据] 原生目标字幕事件处理完成 (${nativeTargetEvents.length} 条)`);
    // 处理原生目标字幕的情况
    processedSubtitleEvents = mergeSubtitleData(
      sourceEvents,
      nativeTargetEvents,
      targetLang
    );
    
    if (processedSubtitleEvents.length > 0) {
      console.log("[显示] 使用原生目标字幕，开始显示循环。");
      // 创建字幕覆盖层（如果尚未创建）
      if (!subtitleOverlayElement) {
        const playerContainer = document.querySelector('.html5-video-player');
        if (playerContainer) {
          createSubtitleOverlay(playerContainer as HTMLElement);
        }
      }
      startSubtitleDisplayLoop();
    } else {
      console.warn("处理后的原生字幕事件为空，无法显示。");
      await setTranslateActive(false);
    }
    return;
  }
  
  // 7. 需要翻译的情况 - 渐进式翻译
  if (needsTranslation) {
    // 创建字幕覆盖层（如果尚未创建）
    if (!subtitleOverlayElement) {
      const playerContainer = document.querySelector('.html5-video-player');
      if (playerContainer) {
        createSubtitleOverlay(playerContainer as HTMLElement);
      }
    }
    
    // 获取当前播放时间
    const currentTime = videoElement.currentTime;
    
    // 分组字幕，优先处理当前时间附近的
    const { prioritySubtitles, remainingSubtitles } = groupSubtitlesByPriority(
      sourceEvents,
      currentTime,
      120 // 当前时间前后各60秒的字幕优先翻译
    );
    
    // 先翻译优先字幕
    if (prioritySubtitles.length > 0) {
      console.log(`[翻译] 优先处理当前播放时间 ${currentTime.toFixed(2)}s 附近的 ${prioritySubtitles.length} 条字幕`);
      const priorityResults = await translateSubtitlesBatch(
        prioritySubtitles,
        sourceTrackInfo.languageCode,
        targetLang,
        "优先"
      );
      
      // 立即更新和显示结果
      updateWithTranslationResults(
        sourceEvents,
        priorityResults,
        targetLang,
        true // 这是第一批，直接启动显示
      );
    } else {
      console.log(`[翻译] 当前时间 ${currentTime.toFixed(2)}s 附近没有字幕需要优先处理`);
    }
    
    // 后台处理剩余字幕
    if (remainingSubtitles.length > 0) {
      console.log(`[翻译] 后台处理剩余的 ${remainingSubtitles.length} 条字幕`);
      
      // 不等待，后台处理
      translateSubtitlesBatch(
        remainingSubtitles,
        sourceTrackInfo.languageCode,
        targetLang,
        "剩余"
      ).then(remainingResults => {
        // 合并到现有字幕中
        updateWithTranslationResults(
          sourceEvents,
          remainingResults,
          targetLang,
          false // 不是第一批，合并到现有事件中
        );
      }).catch(error => {
        console.error('[翻译] 后台处理剩余字幕时出错:', error);
      });
    } else {
      console.log('[翻译] 没有剩余字幕需要后台处理');
    }
  }
}

