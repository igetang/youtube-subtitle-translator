# 存储键使用指南

> **基于 architecture.md 存储规范** - 新架构存储键使用说明

## 🎯 核心存储键（已规范化）

### 1. UserPreferences - 用户偏好设置
```typescript
// 存储键：StorageKeys.USER_PREFERENCES = 'user_preferences'
// 存储区域：chrome.storage.local
// 管理器：UserPreferencesManager
// 数据类型：UserPreferences（整体存储）

import { UserPreferencesManager } from '@shared/storage';
const manager = UserPreferencesManager.getInstance();
const prefs = await manager.getAllPreferences();
```

### 2. RuntimeState - 运行时状态
```typescript
// 存储键：专用键（不使用StorageKeys中的前缀）
// - 'runtime_state_translateActive'
// - 'runtime_state_popupOpen'  
// - 'runtime_state_version'
// - 'runtime_state_lastUpdated'
// 存储区域：chrome.storage.session（跨标签页共享）
// 管理器：RuntimeStateManager

import { RuntimeStateManager } from '@shared/storage';
const manager = RuntimeStateManager.getInstance();
const state = await manager.getAllState();
```

### 3. VideoSourceLanguageData - 视频源语言数据
```typescript
// 存储键：StorageKeys.VIDEO_SOURCE_PREFIX + videoId = 'video_source_' + videoId
// 存储区域：chrome.storage.local（分散存储）
// 管理器：VideoSourceLanguageDataManager
// 包含：完整的源语言列表 + 用户选择记录

import { VideoSourceLanguageDataManager } from '@shared/storage';
const manager = VideoSourceLanguageDataManager.getInstance();
const data = await manager.getVideoSourceData(videoId);
// data.availableSourceLanguages - 完整列表
// data.lastSelectedLanguage - 用户选择
```

### 4. TranslationCacheData - 翻译缓存
```typescript
// 存储键：'translation_' + videoId + '_' + srcLang + '_' + tgtLang + '_' + serviceType[_model][_temperature]
// 存储区域：chrome.storage.local（分散存储）
// 包含：originalSubtitles + translatedSubtitles

import { TranslationCacheManager } from '@shared/storage';
const manager = TranslationCacheManager.getInstance();

// 获取完全匹配的缓存
const cache = await manager.getTranslation(videoId, srcLang, tgtLang, service);

// 查找可复用的原始字幕（相同源语言）
const partialCaches = await manager.findByVideoAndSourceLang(videoId, srcLang);
if (partialCaches.length > 0) {
  const originalSubtitles = partialCaches[0].originalSubtitles;
  // 可以复用原始字幕，只需重新翻译
}
```

### 5. MemoryCache - 内存缓存（Service Worker）
```typescript
// 存储位置：Service Worker内存（非chrome.storage）
// 数据类型：Map<videoId, OriginalSubtitleData>
// 用途：临时缓存字幕轨道信息，避免重复API调用

// 在Service Worker中管理
const memoryCache = new Map();
memoryCache.set(videoId, subtitleData);
```

## 🗑️ 已弃用的存储键

### ❌ 不要使用这些旧键
```typescript
// 🚫 已弃用：StorageKeys.SETTINGS.*
// 🚫 已弃用：StorageKeys.SETTINGS_PREFIX
// 🚫 已弃用：StorageKeys.GLOBAL_SETTINGS_PREFIX
// 🚫 已弃用：StorageKeys.RUNTIME_STATE_PREFIX

// ✅ 正确方式：使用专门的管理器
```

## 📋 迁移指南

### 从旧架构迁移
```typescript
// ❌ 旧方式
const sourceLang = await chrome.storage.local.get('video_source_language_cache');

// ✅ 新方式
const manager = VideoSourceLanguageDataManager.getInstance();
const data = await manager.getVideoSourceData(videoId);
const sourceLang = data.lastSelectedLanguage;

// ❌ 旧方式
const translateActive = await chrome.storage.local.get('settings.translateActive');

// ✅ 新方式  
const stateManager = RuntimeStateManager.getInstance();
const translateState = await stateManager.getTranslateState();
```

## 🎯 最佳实践

1. **使用专门的管理器**：不要直接访问chrome.storage
2. **遵循新架构设计**：UserPreferences整体存储，RuntimeState分字段存储
3. **注意存储区域**：Local vs Session Storage的正确使用
4. **类型安全**：使用TypeScript类型定义，避免类型错误

## 📚 相关文档

- `docs/architecture.md` - 存储架构设计规范
- `src/shared/types/` - 类型定义
- `src/shared/storage/` - 管理器实现 