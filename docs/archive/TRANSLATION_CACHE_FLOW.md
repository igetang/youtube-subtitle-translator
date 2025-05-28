# 翻译设置按钮点击后的缓存处理流程

收到，菜鸟π同学  05.27

## 概述

这个文档详细说明了点击翻译设置按钮后，系统是如何处理原始字幕数据缓存和翻译设置数据缓存的。整个流程涉及多个组件之间的协调工作。

## 流程图

```
用户点击翻译设置按钮
          ↓
    [UIManager] 设置按钮点击事件
          ↓
    setSettingPanelOpen(true)
          ↓
    发送 openSidePanel 消息到 Background
          ↓
    [Background] 处理 openSidePanel 消息
          ↓
    调用 initializeSidePanel(tabId, videoId)
          ↓
    获取当前视频ID
          ↓
┌─────────────────── 三层缓存检查 ──────────────────┐
│                                               │
│  1. 检查视频设置缓存 (VideoSettingsCache)        │
│     - 存储位置: chrome.storage.local            │
│     - 缓存键格式: cache.videoSettings.[videoId]  │
│     - 包含: sourceLang, targetLang, hasSubtitles│
│                                               │
│  2. 检查全局设置缓存 (StorageManager)            │
│     - 存储位置: chrome.storage.local            │
│     - 缓存键: settings.* 系列                   │
│                                               │
│  3. 检查轨道信息缓存 (Memory Cache)              │
│     - 内存中的 cachedCaptionTracks              │
│     - 如果没有则调用 YouTube API 获取            │
└─────────────────────────────────────────────┘
          ↓
    合并设置数据和轨道信息
          ↓
    发送 initializeSidePanelUI 消息到 SidePanel
          ↓
    [SidePanel] 接收初始化数据
          ↓
    updateAllUI() 更新界面
          ↓
    用户修改设置并保存
          ↓
    saveSettings() 函数执行
          ↓
    发送 updateSettings 消息到 Background
          ↓
    [Background] 保存设置到双重缓存
          ↓
┌─────────────── 设置保存流程 ───────────────┐
│                                        │
│  1. 保存全局设置                         │
│     - 目标: chrome.storage.local         │
│     - 键: settings.sourceLang, etc.     │
│                                        │
│  2. 保存视频特定设置                      │
│     - 目标: VideoSettingsCache           │
│     - 键: cache.videoSettings.[videoId] │
│                                        │
│  3. 发送设置更新通知                      │
│     - 消息: settingsUpdated             │
│     - 目标: ContentScript               │
└────────────────────────────────────────┘
          ↓
    [ContentScript] 接收设置更新
          ↓
    检查翻译开关状态
          ↓
    如果翻译已开启，重新开始翻译流程
          ↓
┌─────────────── 翻译缓存检查 ──────────────┐
│                                        │
│  1. 检查翻译结果缓存                      │
│     - SubtitleCacheManager              │
│     - 键格式: subtitle_translation_     │
│       cache_[videoId]_[targetLang]_     │
│       [apiType]                        │
│                                        │
│  2. 如果有缓存，直接使用                   │
│     - 显示已缓存的翻译结果                │
│                                        │
│  3. 如果无缓存，发起新翻译                 │
│     - 调用翻译API                       │
│     - 保存翻译结果到缓存                  │
└────────────────────────────────────────┘
```

## 关键组件和函数

### 1. 翻译设置按钮点击处理

**文件**: `src/components/ui-manager.ts`

**关键函数**: 
```typescript
// 设置按钮点击处理
() => {
  const newState = !this.state.settingPanelOpen;
  console.log(`[UIManager] 设置按钮点击，切换状态为: ${newState}`);
  this.setSettingPanelOpen(newState);
}

// 设置面板状态更新
public setSettingPanelOpen(open: boolean): void {
  console.log(`[UIManager] 设置设置面板状态: ${open}`);
  this.state.settingPanelOpen = open;
  this.updateSettingsButtonState(open);
  
  // 保存状态到存储
  chrome.storage.sync.set({ settingPanelOpen: open });
  
  // 打开或关闭侧边栏
  if (open) {
    chrome.runtime.sendMessage({ action: 'openSidePanel' });
  }
}
```

### 2. 视频设置缓存管理

**文件**: `src/storage/video-settings-cache.ts`

**关键函数**:

```typescript
/**
 * 获取视频设置缓存
 * 存储格式: cache.videoSettings.[videoId]
 */
public async getVideoSettings(videoId: string): Promise<VideoSettings | null> {
  const cacheKey = `${StorageKeys.CACHE.VIDEO_SETTINGS_PREFIX}${videoId}`;
  const settings = await StorageManager.getInstance().get<VideoSettings | null>(cacheKey, null, 'local');
  
  if (settings) {
    console.log(`[video-settings-cache] 找到视频 ${videoId} 的缓存设置`);
    return settings;
  }
  return null;
}

/**
 * 保存视频设置缓存
 */
public async saveVideoSettings(settings: VideoSettings): Promise<void> {
  const cacheKey = `${StorageKeys.CACHE.VIDEO_SETTINGS_PREFIX}${settings.videoId}`;
  const settingsToSave = {
    ...settings,
    lastUsed: settings.lastUsed || Date.now()
  };
  
  await StorageManager.getInstance().set(cacheKey, settingsToSave, 'local');
  console.log(`[video-settings-cache] 已保存视频 ${settings.videoId} 的设置缓存`);
  
  // 更新最近使用的视频列表并管理缓存大小
  await this.updateLastUsedVideos(settings.videoId);
  await this.manageCacheSize();
}
```

### 3. 原始字幕翻译缓存管理

**文件**: `background/subtitle-cache-manager.ts`

**关键函数**:

```typescript
/**
 * 获取字幕翻译缓存
 * 缓存键格式: subtitle_translation_cache_[videoId]_[targetLang]_[apiType]
 */
public async getSubtitleCache(
  videoId: string, 
  targetLang: string, 
  apiType: string
): Promise<{timestamp: number, translations: Record<string, string>} | null> {
  const cacheKey = this.generateCacheKey(videoId, targetLang, apiType);
  
  const result = await chrome.storage.local.get(cacheKey);
  const cache = result[cacheKey];
  
  if (cache) {
    console.log(`[SubtitleCache] 视频 ${videoId} 的翻译缓存命中，包含 ${Object.keys(cache.translations || {}).length} 条字幕翻译`);
    return cache;
  }
  return null;
}

/**
 * 保存字幕翻译缓存
 */
public async saveSubtitleCache(
  videoId: string, 
  targetLang: string, 
  apiType: string, 
  translations: Record<string, string>
): Promise<void> {
  const cacheKey = this.generateCacheKey(videoId, targetLang, apiType);
  
  const cacheData = {
    timestamp: Date.now(),
    translations
  };
  
  await chrome.storage.local.set({ [cacheKey]: cacheData });
  console.log(`[SubtitleCache] 已保存视频 ${videoId} 的翻译缓存，包含 ${Object.keys(translations).length} 条翻译`);
  
  // 管理缓存大小，清理旧缓存
  await this.manageCacheSize();
}
```

### 4. SidePanel 设置保存处理

**文件**: `sidepanel/sidepanel.ts`

**关键函数**:

```typescript
/**
 * 保存设置到chrome.storage
 */
async function saveSettings() { 
  // 多重保护机制，防止在初始化期间误触发
  if (isInitializingSidePanelUI || isLoading || !listenersAttached) {
    console.log('[sidepanel] saveSettings: 跳过保存，系统正在初始化');
    return;
  }

  // 收集界面上的所有设置
  const settingsToSave = {
    sourceLang: uiSourceLang,
    targetLang: uiTargetLang,
    subtitleMode: uiSubtitleMode,
    translationApi: uiTranslationApi,
    apiKey: uiApiKey,
    serviceType: uiServiceType,
    customApiConfig: uiCustomApiConfig,
    openaiConfig: uiOpenaiConfig
  };

  // 检查是否有实际更改
  let hasChanges = false;
  if (!initialSettingsFromBackground) {
    hasChanges = true;
  } else {
    // 逐项比较检测更改
    for (const key in settingsToSave) {
      if (settingsToSave[k] !== initialSettingsFromBackground[k]) {
        hasChanges = true;
        break;
      }
    }
  }

  if (!hasChanges) {
    console.log("[sidepanel] saveSettings: 未检测到实际设置更改，跳过发送消息");
    return;
  }

  // 发送设置更新消息到 Background
  const updateMessage = {
    action: 'updateSettings',
    settings: settingsToSave,
    videoId: currentVideoId,
    tabId: currentTabId
  };

  const response = await chrome.runtime.sendMessage(updateMessage);
  if (response.success) {
    console.log("[sidepanel] 设置已成功保存");
    initialSettingsFromBackground = { ...settingsToSave }; 
  }
}
```

### 5. Background 统一缓存管理

**文件**: `background/background.ts`

**关键函数**:

```typescript
// CacheService 类 - 统一缓存管理
class CacheService {
  /**
   * 获取翻译配置（检查视频设置缓存）
   */
  async getTranslationConfig(videoId: string, payload?: any): Promise<any> {
    console.log(`[background] 获取翻译配置: videoId=${videoId}`);
    
    // 检查视频特定设置缓存 (VideoSettingsCache -> chrome.storage.local)
    const videoSettings = await VideoSettingsCache.getInstance().getVideoSettings(videoId);
    
    if (videoSettings) {
      console.log(`[background] 找到视频设置缓存 (local storage):`, videoSettings);
      return {
        success: true,
        hasCache: true,
        config: {
          sourceLang: videoSettings.sourceLang,
          targetLang: videoSettings.targetLang,
          hasSubtitles: videoSettings.hasSubtitles,
          sourceTrackKind: videoSettings.sourceTrackKind
        }
      };
    } else {
      console.log(`[background] 未找到视频设置缓存 (local storage)，使用默认配置`);
      
      // 获取全局设置作为默认配置
      const globalSettings = await loadAndApplyGlobalSettings();
      return {
        success: true,
        hasCache: false,
        config: {
          sourceLang: globalSettings[StorageKeys.SETTINGS.SOURCE_LANG] || 'en',
          targetLang: globalSettings[StorageKeys.SETTINGS.TARGET_LANG] || 'zh-CN'
        }
      };
    }
  }

  /**
   * 检查翻译结果缓存
   */
  async checkTranslationCache(videoId: string, params: any): Promise<any> {
    console.log(`[background] 检查翻译缓存 (local storage): videoId=${videoId}`, params);
    
    const { SubtitleCacheManager } = await import('./subtitle-cache-manager');
    const subtitleCacheManager = SubtitleCacheManager.getInstance();
    
    const cache = await subtitleCacheManager.getSubtitleCache(
      videoId, 
      params.targetLang, 
      params.apiType || 'google-free'
    );
    
    if (cache && cache.translations) {
      console.log(`[background] 找到翻译缓存 (local storage)，${Object.keys(cache.translations).length}条记录`);
      return {
        success: true,
        hasCache: true,
        data: cache.translations
      };
    } else {
      console.log(`[background] 未找到翻译缓存 (local storage)`);
      return {
        success: true,
        hasCache: false,
        data: null
      };
    }
  }
}

// 设置更新消息处理
else if (message.action === 'updateSettings') {
  console.log('[background] 收到设置更新请求:', message);
  const { settings, videoId, tabId: msgTabId, sourceTrackKind } = message;
  
  // 保存全局设置到 chrome.storage.local
  const globalSettingsToSave = {
    [StorageKeys.SETTINGS.SUBTITLE_MODE]: settings.subtitleMode,
    [StorageKeys.SETTINGS.TRANSLATION_API]: settings.translationApi,
    [StorageKeys.SETTINGS.API_KEY]: settings.apiKey,
    // ... 其他设置
  };
  await StorageManager.getInstance().setBatch(globalSettingsToSave, 'local');
  
  // 如果有视频ID，保存视频特定设置
  if (videoId) {
    const videoSpecificSettings = {
      videoId: videoId,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
      lastUsed: Date.now(),
      hasSubtitles: true,
      sourceTrackKind: sourceTrackKind
    };
    await VideoSettingsCache.getInstance().saveVideoSettings(videoSpecificSettings);
  }
  
  sendResponse({ success: true, message: '设置已保存' });
}
```

## 缓存存储结构

### 1. 视频设置缓存
- **存储位置**: `chrome.storage.local`
- **键格式**: `cache.videoSettings.[videoId]`
- **数据结构**:
```typescript
interface VideoSettings {
  videoId: string;           // 视频ID
  sourceLang: string;        // 源语言
  targetLang: string;        // 目标语言
  lastUsed: number;          // 最后使用时间戳
  hasSubtitles: boolean;     // 视频是否有字幕
  sourceTrackKind?: string;  // 源语言轨道类型
}
```

### 2. 翻译结果缓存
- **存储位置**: `chrome.storage.local`
- **键格式**: `subtitle_translation_cache_[videoId]_[targetLang]_[apiType]`
- **数据结构**:
```typescript
interface TranslationCache {
  timestamp: number;                        // 缓存时间戳
  translations: Record<string, string>;     // 字幕ID到翻译文本的映射
}
```

### 3. 全局设置缓存
- **存储位置**: `chrome.storage.local`
- **键格式**: `settings.[settingName]`
- **包含**: `sourceLang`, `targetLang`, `subtitleMode`, `translationApi`, `apiKey` 等

## 流程总结

1. **用户点击翻译设置按钮** → UIManager 处理点击事件
2. **打开SidePanel** → Background 初始化侧边栏数据
3. **检查三层缓存** → 视频设置缓存 → 全局设置缓存 → 轨道信息缓存
4. **发送初始化数据** → SidePanel 更新界面
5. **用户修改设置** → SidePanel 收集并保存设置
6. **双重缓存保存** → 全局设置 + 视频特定设置
7. **通知ContentScript** → 检查翻译状态，如需要则重新翻译
8. **翻译缓存检查** → 有缓存直接使用，无缓存发起新翻译并保存结果

这个流程确保了设置的快速加载、智能缓存和高效的数据管理，提升了用户体验。 