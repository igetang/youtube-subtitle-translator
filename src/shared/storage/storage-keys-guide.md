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
// - 'runtime_state_settingPanelOpen'  
// - 'runtime_state_version'
// - 'runtime_state_lastUpdated'
// 存储区域：chrome.storage.local
// 管理器：RuntimeStateManager

import { RuntimeStateManager } from '@shared/storage';
const manager = RuntimeStateManager.getInstance();
const state = await manager.getAllState();
```

### 3. VideoSourceLanguageCache - 视频源语言缓存
```typescript
// 存储键：StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE = 'video_source_language_cache'
// 存储区域：chrome.storage.local
// 管理器：VideoSourceLanguageCacheManager

import { VideoSourceLanguageCacheManager } from '@shared/storage';
const manager = VideoSourceLanguageCacheManager.getInstance();
const sourceLang = await manager.getSourceLanguage(videoId);
```

### 4. OriginalSubtitleData - 原字幕数据
```typescript
// 存储键模板：StorageKeys.SESSION_SUBTITLES_PREFIX + videoId
// 实际键：'session_subtitles_' + videoId
// 存储区域：chrome.storage.session
// 数据类型：OriginalSubtitleData

const storageKey = `${StorageKeys.SESSION_SUBTITLES_PREFIX}${videoId}`;
await chrome.storage.session.set({ [storageKey]: subtitleData });
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
const sourceLang = await chrome.storage.local.get('settings.sourceLang');

// ✅ 新方式
const manager = VideoSourceLanguageCacheManager.getInstance();
const sourceLang = await manager.getSourceLanguage(videoId);

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