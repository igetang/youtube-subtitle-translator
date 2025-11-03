# YouTube字幕翻译助手 - 技术架构文档 Part 2（核心数据结构与实现）

> **最后更新**: 2025-11-03
> **版本**: v5.24.11
> **当前方案**: ✅ **Popup + AbortController V4 两阶段翻译架构 + 单一数据源原则**

本文档记录当前生产环境所使用的核心数据模型、翻译流程和 UI 数据结构。旧版 SidePanel / EventBus 数据结构已经归档，仅保留为历史参考。

---

## 1. 主要数据结构概览

| 场景 | 类型定义位置 | 说明 |
|------|--------------|------|
| **UserPreferences** | `src/shared/types/user-preferences-types.ts` | 描述翻译服务配置、语言偏好、字幕模式等；`DEFAULT_USER_PREFERENCES` 提供默认值，`calculateUserPreferencesHash` 用于一致性校验。 |
| **RuntimeState** | `src/shared/storage/runtime-state-manager.ts` | 管理翻译状态（`TranslateActiveState` 枚举：INACTIVE/PENDING/ACTIVE）、当前视频信息等；通过 MessageBus 在各进程间同步。 |
| **字幕轨道** | `src/shared/types/subtitle-types.ts` | `CaptionTrack`（原始）、`TrackMetadata`/`TrackWithUrl`（新版建议使用）、`SimplifiedCaptionTrack`（兼容用途，已标记 @deprecated）。 |
| **翻译结果** | `SubtitleEntry`（`subtitle-data-manager.ts`）、`createVttString` / `parseVttString`（`utils/vtt-utils.ts`） | 两阶段翻译最终生成 `SubtitleEntry[]`，缓存时写入 VTT 字符串。 |
| **翻译服务配置** | `TranslationServiceComplete` 等（`user-preferences-types.ts`） | 描述 Google/Microsoft/OpenAI/DeepSeek 等翻译服务的参数。 |

---

## 2. 翻译流程与会话架构

### 2.1 AbortController V4 会话

- **入口**：`src/background/handle-toggle-translate-v4.ts::handleToggleTranslateV4()`
- **会话管理**：`AbortTimeoutManager` / `TranslationSession`
  - 创建会话：`createSession(sessionId)` 返回 `TranslationSession`
  - 阶段执行：`executeStage(stageName, operation, { timeoutMs, fallback, critical })`
  - 信号组合：`AbortSignal.any([手动取消, AbortSignal.timeout])`
- **阶段划分**（关键阶段及对应实现）：
  1. **配置加载**：读取 `UserPreferencesManager.getUserPreferences()`；缺失配置直接终止。
  2. **源语言信息**：`VideoSourceLanguageCacheManager.get/upsert` / `selectBestSourceLanguage` ⭐
     - **单一数据源原则（v5.24.11）**: Service Worker是视频源语言数据的唯一写入者
     - 缓存未命中时，Service Worker通过Content Script获取轨道数据并写入缓存
     - Popup通过`getPopupInitData`消息从Service Worker获取数据，不直接操作缓存
  3. **轨道获取**：通过 `chrome.tabs.sendMessage` 调用 main-world（先尝试 `playerResponse`，再 fallback 到 Player API）。
  4. **字幕抓取**：`triggerSubtitleLoadWithSignal` → 等待 `SUBTITLE_DATA`，必要时复用缓存字幕（`findByVideoAndSourceLang`）。
  5. **两阶段翻译**：`TwoPhaseTranslatorV4`
     - 紧急阶段：`translateUrgent`（300ms 内展示；失败显示 warning 接续批量）。
     - 批量阶段：`translateBatch`（动态估算批次数与超时；失败立即终止）。
  6. **缓存与状态**：生成原/译 VTT（`createVttString`），异步写入 `TranslationCacheManager`；更新 `TranslateActiveState` 并通知前端（MessageBus / `notifyStateChange`）。

### 2.2 翻译缓存键

缓存键包含：`videoId + sourceLang + sourceKind + targetLang + translationService`。
- **原字幕复用**：`findByVideoAndSourceLang(videoId, sourceLang)` 返回历史记录，解析 VTT 后直接构造 `SubtitleEntry[]`。
- **翻译结果复用**：`translationCacheManager.get()` 命中后跳过翻译流程，仅切换字幕轨道并推送缓存结果。
- **缓存写入**：`saveTranslationCacheAsync()` 在批量翻译结束后写入，以 VTT 字符串形式存储原文和译文。

---

## 3. 字幕与轨道类型（详见 `subtitle-types.ts`）

```typescript
// YouTube API 原始格式
interface CaptionTrack {
  baseUrl: string;
  name: { simpleText: string };
  vssId: string;
  languageCode: string;
  isTranslatable: boolean;
  kind?: string; // 'asr'、'forced' 等
}

// 推荐使用的元数据（存储时去除会过期的 baseUrl）
interface TrackMetadata {
  languageCode: string;
  name: string;
  kind?: 'asr' | 'forced' | undefined;
}

// 临时包含 baseUrl 的结构（请求字幕内容时使用）
interface TrackWithUrl extends TrackMetadata {
  baseUrl: string;
}

// @deprecated：旧结构，仍用于向后兼容
interface SimplifiedCaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: string;
  kind?: 'asr' | 'forced' | undefined;
}
```

转换函数：
- `extractTrackMetadata(track: CaptionTrack): TrackMetadata`
- `trackToTrackWithUrl(track: CaptionTrack): TrackWithUrl`
- `simplifyCaption` / `simplifyCaptions`（@deprecated）

### 字幕条目结构

```typescript
interface SubtitleEntry {
  start: number;        // 秒
  duration: number;     // 秒
  text: string;         // 原文
  translation?: string; // 译文（紧急/批量阶段写入）
  id?: string;          // 通常使用 start 作为唯一标识
  isUrgent?: boolean;   // 紧急字幕标记
}
```

---

## 4. Popup 与 UI 数据

- **Popup架构原则（v5.24.11）** ⭐：
  - Popup = 纯UI层，只负责展示和用户交互
  - 数据获取：通过`getPopupInitData`消息从Service Worker获取完整上下文数据
  - 数据更新：通过`updateVideoSourceLanguage`消息通知Service Worker保存
  - **禁止操作**：不直接读取/写入`VideoSourceLanguageCache`，不直接调用Content Script获取轨道数据
- Popup 相关逻辑集中在 `src/popup/popup.ts`；数据类型使用 `UserPreferences`、`TrackMetadata` 等。
- UI 注入逻辑：`src/shared/components/ui-manager.ts`
  - 优先通过 `chrome.action.openPopup()` 打开设置；失败则 fallback 到背景消息。
  - 控制栏按钮注入与状态更新通过 DOM 观察器 + MessageBus。
- Popup 页面根据当前标签页类型动态输出配置界面或使用说明。

---

## 5. 历史结构（存档）

以下结构已迁移或废弃，仅供回溯：
- SidePanel 数据结构与 UI 逻辑：已存放于 `docs/archive/deprecated-sidepanel/`。
- 旧版两阶段翻译接口（无 AbortController）：可在 `docs/archive/reports/` 相关报告中查阅。
- 旧 `PopupContext` 等接口：当前代码不再维护统一的上下文接口，改用模块化函数。

---

## 6. 参考实现

| 功能 | 代码位置 |
|------|----------|
| 翻译开关流程 (V4) | `src/background/handle-toggle-translate-v4.ts` |
| Abort 会话管理 | `src/background/components/abort-timeout-manager.ts` / `translation-session.ts` |
| 两阶段翻译器 | `src/background/components/two-phase-translator-v4.ts` |
| 字幕缓存管理 | `src/shared/storage/translation-cache-manager.ts` |
| 字幕类型/工具 | `src/shared/types/subtitle-types.ts` / `src/shared/utils/vtt-utils.ts` |
| Popup UI | `src/popup/popup.ts` |
| MessageBus | `src/shared/messages/message-bus.ts` |
| UI 注入与状态管理 | `src/shared/components/ui-manager.ts` |

如需更详细的流程图和阶段说明，请参阅《docs/guides/translation-flow.md》和《handle-toggle-translate-v4.ts》中的阶段日志。EOF
