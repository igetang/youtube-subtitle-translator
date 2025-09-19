# Spec: 源语言实时变更机制 v2.0（最大化复用版）
## Source Language Realtime Change - Maximized Reuse Version

**创建时间**: 2025-09-19
**更新时间**: 2025-09-19
**状态**: 设计阶段
**优先级**: 高
**版本**: 2.0

---

## 📋 Overview

实现YouTube字幕翻译扩展中的"源语言实时变更机制"功能，允许用户在翻译激活状态下实时切换字幕源语言。**本版本最大化复用现有代码，减少开发工作量。**

---

## 🎯 Phase 1: Requirements (需求阶段)

### 1.1 用户故事

**作为用户，我希望能够**：
- 在翻译激活时实时切换字幕源语言
- 有缓存时立即看到新语言的翻译结果
- 无缓存时看到清晰的加载状态提示
- 获得5秒内的响应时间保证

### 1.2 功能需求

#### 1.2.1 核心功能
- **实时切换**: 用户在Popup中选择不同源语言时，字幕立即切换
- **智能缓存**: 优先使用已有的翻译缓存，避免重复API调用
- **状态反馈**: 提供清晰的UI状态反馈（PENDING/ACTIVE/ERROR）
- **容错处理**: 5秒超时保护，失败时优雅降级

#### 1.2.2 性能需求
- **响应时间**:
  - 有缓存：< 100ms 瞬间切换
  - 无缓存：< 5秒 完成重新翻译
- **缓存命中率**: 目标 > 60%（多源语言场景）
- **内存占用**: 增量 < 2MB（缓存数据结构）

---

## 🏗️ Phase 2: Design (设计阶段) - 复用现有架构

### 2.1 复用现有功能总览

| 功能类别 | 现有函数/组件 | 位置 | 复用方式 |
|---------|--------------|------|---------|
| **存储监听** | `StorageManager.addChangeListener()` | storage-manager.ts:208 | 直接使用 |
| **视频ID获取** | `getVideoId()` | content-script.ts:39 | 直接使用 |
| **状态管理** | `stateManager.getState/updateState` | content-script.ts:283 | 直接使用 |
| **缓存检查** | `translationCacheManager.get()` | Service Worker | 通过消息调用 |
| **字幕显示** | `subtitleOverlay.show/hide` | subtitle-overlay.ts | 直接使用 |
| **字幕容器** | `subtitleOverlay.subtitleContainer` | subtitle-overlay.ts | 复用显示PENDING |
| **翻译切换** | `toggleTranslation()` | content-script.ts:276 | 加参数复用 |
| **用户偏好** | `UserPreferencesManager.getUserPreferences()` | user-preferences-manager.ts | 直接使用 |
| **消息发送** | `chrome.runtime.sendMessage()` | Chrome API | 直接使用 |

### 2.2 最小化新增代码

#### 2.2.1 SubtitleOverlay只需添加一个方法
```typescript
// subtitle-overlay.ts - 只需添加这一个简单方法
public showPendingMessage(message: string): void {
  // 复用现有的subtitleContainer显示黄色文字
  if (this.subtitleContainer) {
    this.subtitleContainer.innerHTML = `
      <div style="color: #ffeb3b; font-size: 20px; animation: pulse 1.5s infinite;">
        ${message}
      </div>
    `;
    this.subtitleContainer.style.display = 'block';
  }
}

// CSS动画（添加到现有样式中）
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

#### 2.2.2 Service Worker完善一个空函数
```typescript
// service-worker.ts:1989 - 原本是空函数，只需实现
async function handleCheckTranslationCache(data: any): Promise<any> {
  // 复用现有的translationCacheManager
  const cached = await translationCacheManager.get(
    data.videoId,
    data.sourceLang,
    data.targetLang,
    data.service
  );
  return {
    success: !!cached,
    data: cached
  };
}
```

#### 2.2.3 Content Script添加监听器（复用现有架构）
```typescript
// content-script.ts - 添加到initialize()函数中
function setupSourceLanguageChangeListener(): void {
  // 复用现有的StorageManager监听机制
  StorageManager.getInstance().addChangeListener(
    StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE,
    handleSourceLanguageCacheChange
  );
}

// 处理存储变化
async function handleSourceLanguageCacheChange(
  changes: { [key: string]: chrome.storage.StorageChange },
  area: string
): Promise<void> {
  // 复用现有函数
  const currentVideoId = getVideoId();
  const newCache = changes[StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE]?.newValue;
  const oldCache = changes[StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE]?.oldValue;

  const newVideoData = newCache?.items?.find(item => item.videoId === currentVideoId);
  const oldVideoData = oldCache?.items?.find(item => item.videoId === currentVideoId);

  // 复用stateManager获取状态
  const translateState = stateManager?.getState('translateActive');
  const isActive = translateState === TranslateActiveState.ACTIVE;

  if (newVideoData?.lastSelectedLanguage !== oldVideoData?.lastSelectedLanguage && isActive) {
    await handleSourceLanguageChange(newVideoData.lastSelectedLanguage);
  }
}

// 源语言变更处理（最大化复用）
async function handleSourceLanguageChange(newSourceLang: string): Promise<void> {
  // 1. 复用hide()清除字幕，复用updateState设置PENDING
  subtitleOverlay.hide();
  stateManager?.updateState('translateActive', 'pending');

  // 2. 使用新添加的showPendingMessage方法
  subtitleOverlay.showPendingMessage('源语言切换，重新进行字幕翻译...');

  // 3. 复用UserPreferencesManager获取偏好
  const userPrefs = await UserPreferencesManager.getInstance().getUserPreferences();

  // 4. 通过消息调用Service Worker的缓存检查
  const cacheResponse = await chrome.runtime.sendMessage({
    type: 'checkTranslationCache',
    data: {
      videoId: getVideoId(),
      sourceLang: newSourceLang,
      targetLang: userPrefs.targetLang,
      service: userPrefs.translationService
    }
  });

  if (cacheResponse.success && cacheResponse.data) {
    // 5A. 有缓存：复用show()方法显示
    await subtitleOverlay.show(cacheResponse.data);
    stateManager?.updateState('translateActive', 'active');
  } else {
    // 5B. 无缓存：复用现有的TOGGLE_TRANSLATE消息
    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_TRANSLATE',
      data: {
        videoId: getVideoId(),
        newState: true,
        currentTime: document.querySelector('video')?.currentTime || 0,
        isRestart: true,  // 标识是重新翻译
        sourceLang: newSourceLang  // 指定新源语言
      }
    });

    // 复用现有的响应处理
    if (response.action === 'translated' || response.action === 'cached') {
      displayTranslatedSubtitles(response.data);
    }
  }
}
```

---

## ✅ Phase 3: Tasks (任务阶段) - 精简版

### 3.1 最小化实现任务

#### Task 1: SubtitleOverlay添加showPendingMessage方法
**预估时间**: 0.5小时
**工作内容**:
- 在SubtitleOverlay类添加一个showPendingMessage方法
- 复用现有的subtitleContainer
- 添加简单的CSS动画

#### Task 2: 完善handleCheckTranslationCache函数
**预估时间**: 0.5小时
**工作内容**:
- 在service-worker.ts:1989实现空函数
- 调用现有的translationCacheManager.get()
- 返回标准格式响应

#### Task 3: Content Script添加源语言监听
**预估时间**: 1.5小时
**工作内容**:
- 添加setupSourceLanguageChangeListener函数
- 添加handleSourceLanguageCacheChange函数
- 添加handleSourceLanguageChange函数
- 全部复用现有功能

#### Task 4: Service Worker处理重新翻译请求
**预估时间**: 0.5小时
**工作内容**:
- 在TOGGLE_TRANSLATE处理中识别isRestart标识
- 使用指定的sourceLang参数
- 复用现有翻译流程

#### Task 5: 集成测试
**预估时间**: 2小时
**工作内容**:
- 测试有缓存时的切换速度
- 测试无缓存时的重新翻译
- 测试PENDING状态显示
- 测试错误处理

---

## 📊 进度跟踪

### 时间估算对比

| 任务 | 原估算 | 新估算（复用） | 节省时间 |
|------|--------|---------------|----------|
| 存储监听器 | 2小时 | 0.5小时 | 1.5小时 |
| 智能切换逻辑 | 4小时 | 1小时 | 3小时 |
| PENDING UI | 3小时 | 0.5小时 | 2.5小时 |
| Service Worker | 3小时 | 1小时 | 2小时 |
| 测试 | 6小时 | 2小时 | 4小时 |
| **总计** | **18小时** | **5小时** | **13小时（节省72%）** |

### 代码改动统计

| 文件 | 新增行数 | 说明 |
|------|---------|------|
| subtitle-overlay.ts | ~10行 | 只添加showPendingMessage方法 |
| service-worker.ts | ~8行 | 实现handleCheckTranslationCache |
| content-script.ts | ~50行 | 添加3个函数，全部复用现有功能 |
| **总计** | **~68行** | 极少的代码改动 |

---

## 🎯 关键优势

1. **最大化代码复用**
   - 90%以上功能使用现有代码
   - 仅添加约68行新代码

2. **保持架构一致性**
   - 使用相同的存储监听机制
   - 使用相同的消息通信模式
   - 使用相同的状态管理

3. **降低测试风险**
   - 大部分代码已经过生产验证
   - 新增代码极少，易于测试

4. **快速交付**
   - 开发时间从2周缩短到1天
   - 可立即开始实施

---

## 📝 实施步骤（建议顺序）

1. **第一步**：在SubtitleOverlay添加showPendingMessage（10分钟）
2. **第二步**：完善Service Worker的handleCheckTranslationCache（10分钟）
3. **第三步**：Content Script添加监听器和处理函数（30分钟）
4. **第四步**：测试验证（1小时）

---

**创建者**: Claude Code Assistant
**最后更新**: 2025-09-19
**文档版本**: 2.0 - 最大化复用版