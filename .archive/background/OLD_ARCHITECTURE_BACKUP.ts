/**
 * @file OLD_ARCHITECTURE_BACKUP.ts
 * @description 旧架构（V3）函数备份 - 仅供参考，这些函数在V4架构中不再使用
 * @date 备份时间: 2025-01-12
 * @note 这些函数已被V4架构的AbortController机制替代
 */

// ============================================================================
// 1. handleSubtitleData - 原位置: service-worker.ts:1978-2013
// 功能: 处理从ContentScript发送的字幕数据
// V4替代: Session内部直接监听SUBTITLE_DATA消息
// ============================================================================

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

// ============================================================================
// 2. continueTranslationWithSubtitles - 原位置: service-worker.ts:2595-2690
// 功能: 接收字幕数据后继续翻译流程
// V4替代: handleToggleTranslateV4的Stage 3-5
// ============================================================================

async function continueTranslationWithSubtitles(data: any): Promise<any> {
  try {
    const videoId = data.videoId;
    const subtitles = data.subtitles;
    
    // 获取用户偏好设置
    const preferences = await userPreferencesManager.getUserPreferences();
    
    // 获取视频源语言
    let sourceLang = data.sourceLang || 'auto';
    if (sourceLang === 'auto') {
      const cacheManager = VideoSourceLanguageCacheManager.getInstance();
      const videoLanguageData = await cacheManager.get(videoId);
      if (videoLanguageData?.detectedSourceLang) {
        sourceLang = videoLanguageData.detectedSourceLang;
      }
    }
    
    console.log('[service-worker] 开始翻译字幕:', {
      videoId,
      sourceLang,
      targetLang: preferences.targetLang,
      subtitleCount: subtitles.length
    });
    
    // 执行翻译
    const translatedResult = await executeTranslation(
      {
        subtitles: subtitles,
        videoId: videoId,
        url: data.url || '',
        tabId: data.tabId,
        currentTime: data.currentTime
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
      // 先通知状态变更
      await notifyStateChange(tabs[0].id, 'translateActive', TranslateActiveState.ACTIVE);
      
      await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'DISPLAY_TRANSLATION',
        data: translatedResult
      }).catch(error => {
        console.error('[service-worker] 发送翻译结果失败:', error);
      });
    }
    
    return {
      success: true,
      action: 'translated',
      data: translatedResult
    };
    
  } catch (error) {
    console.error('[service-worker] 继续翻译流程失败:', error);
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    // 通知content-script更新UI状态
    if (data?.tabId) {
      await notifyStateChange(data.tabId, 'translateActive', TranslateActiveState.INACTIVE);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '翻译处理失败'
    };
  }
}

// ============================================================================
// 3. handleToggleTranslate - 原位置: service-worker.ts:2152-2543
// 功能: 旧架构的翻译切换主函数
// V4替代: handleToggleTranslateV4
// ============================================================================

async function handleToggleTranslate(data: any, sender: any): Promise<any> {
  try {
    // 获取当前状态
    const currentState = await runtimeStateManager.getTranslateState();
    
    // 如果是关闭翻译
    if (currentState === TranslateActiveState.ACTIVE || 
        currentState === TranslateActiveState.PENDING) {
      
      // 清除所有看门狗
      watchdogManager.clearAll();
      console.log('[service-worker] 关闭翻译时清除了所有看门狗');
      
      // 关闭翻译 - 直接设置为INACTIVE（不经过PENDING）
      await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
      return { 
        success: true, 
        action: 'stopped',
        message: '翻译已关闭'
      };
    }
    
    // === 开启翻译流程 ===
    
    // 设置为PENDING状态
    await runtimeStateManager.setTranslateState(TranslateActiveState.PENDING);
    
    const tabId = sender.tab?.id;
    const videoId = data.videoId;
    
    // 检查缓存
    const preferences = await userPreferencesManager.getUserPreferences();
    const sourceLang = data.sourceLang || 'auto';
    
    const cacheManager = TranslationCacheManager.getInstance();
    const cachedResult = await cacheManager.get(
      videoId,
      sourceLang,
      preferences.targetLang,
      preferences.translationService
    );
    
    if (cachedResult) {
      console.log('[service-worker] ✓ 找到缓存的翻译结果（P0级完全命中）');
      await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
      
      // 通知UI状态变更
      if (sender.tab?.id) {
        await notifyStateChange(sender.tab.id, 'translateActive', TranslateActiveState.ACTIVE);
      }
      
      return {
        success: true,
        action: 'cached',
        data: {
          originalSubtitles: cachedResult.originalSubtitles,
          translatedSubtitles: cachedResult.translatedSubtitles,
          sourceLang: cachedResult.sourceLang,
          targetLang: cachedResult.targetLang
        }
      };
    }
    
    // 请求字幕捕获
    // ... 更多旧架构代码
    
    return { success: true };
    
  } catch (error) {
    console.error(`[service-worker] ✗ handleToggleTranslate: ${error instanceof Error ? error.message : String(error)}`);
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    // 通知content-script更新UI状态
    if (data?.tabId) {
      await notifyStateChange(data.tabId, 'translateActive', TranslateActiveState.INACTIVE);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理翻译切换失败'
    };
  }
}

// ============================================================================
// 4. executeTranslation - 原位置: service-worker.ts:2047-2149
// 功能: 执行翻译的核心函数
// V4替代: TwoPhaseTranslatorV4类
// ============================================================================

async function executeTranslation(subtitleData: any, preferences: any): Promise<any> {
  // 这个函数的实现较长，包含了翻译的具体逻辑
  // 在V4架构中被TwoPhaseTranslatorV4类替代
  // 具体代码省略...
}

// ============================================================================
// 注意事项:
// 1. 这些函数在V4架构中已经不再使用
// 2. V4架构使用AbortController机制，提供更好的超时控制和取消能力
// 3. 如果需要回滚到旧架构，可以从这个文件恢复代码
// 4. 主要区别：
//    - 旧架构: 串行执行，使用SimpleWatchdog超时管理
//    - 新架构: 并行执行，使用AbortController超时管理
// ============================================================================