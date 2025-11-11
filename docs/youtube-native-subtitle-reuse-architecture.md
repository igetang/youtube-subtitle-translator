# YouTube原生字幕复用功能 - 架构设计文档

## 1. 功能概述

当用户通过**内容脚本里的翻译开关按钮**触发翻译时，如果YouTube已经提供了目标语言的手动字幕，直接复用YouTube原生字幕，无需调用翻译API，从而节省API成本并提升响应速度。Popup 仍然只负责配置，不会直接触发该流程。

## 2. 核心约束条件

### 2.1 必须满足的硬约束

1. **源语言必须是手动字幕（非ASR）**
   - 原因：ASR字幕和手动字幕的时间轴不对齐
   - 检查：`sourceKind !== 'asr'`

2. **目标语言字幕必须存在**
   - 检查：在 `availableTracks` 中能找到目标语言字幕轨道
   - 匹配规则：语言族匹配（zh-CN、zh-TW、zh-Hans 都视为中文）

3. **目标语言字幕必须是手动字幕（非ASR）**
   - 原因：保证翻译质量
   - 检查：`targetTrack.kind !== 'asr'`

### 2.2 前置条件

在执行复用检查前，以下数据必须已经确定：
- ✅ 源语言代码（`sourceLanguageCode`）
- ✅ 源语言类型（`sourceKind`）
- ✅ 目标语言代码（`preferences.targetLang`）
- ✅ 可用字幕轨道列表（`availableTracks`）
- ✅ 源语言 ≠ 目标语言（已通过语言验证）

### 2.3 与既有流程保持一致的约束

- ✅ **TranslationCache 写入沿用原有 schema**：`translationService` 字段继续保存用户选择的服务（例如 deepseek、google），即便字幕来自 YouTube 原生轨迹。
- ✅ **UI 表现保持一致**：Popup、按钮、字幕覆盖层都不额外显示“使用原生字幕”的字样，用户无感知差异。

## 3. 执行流程架构

### 3.1 整体执行顺序

```
Stage 2: 获取源语言缓存信息
         ↓
Stage 3: 确定源语言（缓存命中/调用YouTube API）
         ↓
Stage 3.5: 验证语言互斥（source ≠ target）
         ↓
Stage 4.7: 检查并执行YouTube翻译复用 ← 新增阶段
         ↓ (如果不能复用)
Stage 4: 获取源语言字幕（原有流程）
         ↓
Stage 5: 执行API翻译（原有流程）
```

> 📌 **说明**：当前代码尚未包含 Stage 4.7，本章节描述的是待实现的目标流程。实现完成前，Service Worker 仍会在 Stage 4 之后直接进入翻译阶段。

### 3.2 Stage 4.7 详细流程

```typescript
// ========== Stage 4.7: 检查并执行YouTube翻译复用 ==========

// 1. 检查是否可以复用
const reuseCheck = canReuseYouTubeTranslation(
  availableTracks,           // 可用字幕轨道列表
  sourceLanguageCode,        // 源语言代码
  sourceKind,                // 源语言类型
  preferences.targetLang     // 目标语言代码
);

if (reuseCheck.canReuse && reuseCheck.targetTrack) {
  console.log('[service-worker-v4] 🎯 复用YouTube翻译: ' +
              sourceLanguageCode + ' → ' + reuseCheck.targetTrack.languageCode);

  // 2. 先切换到目标语言轨道
  await sendSetSubtitleTrack(
    reuseCheck.targetTrack.languageCode,
    reuseCheck.targetTrack.kind
  );

  // 3. 触发并获取目标语言字幕（通过XHR拦截）
  await TRIGGER_SUBTITLE_LOAD({
    languageCode: reuseCheck.targetTrack.languageCode,
    languageName: reuseCheck.targetTrack.name,
    kind: reuseCheck.targetTrack.kind
  });
  const targetSubtitleData = await 接收SUBTITLE_DATA消息;

  // 4. 再切换回源语言轨道（最终停留在源语言）
  await sendSetSubtitleTrack(sourceLanguageCode, sourceKind);

  // 5. 触发并获取源语言字幕（通过XHR拦截）
  await TRIGGER_SUBTITLE_LOAD({
    languageCode: sourceLanguageCode,
    languageName: sourceLanguageName,
    kind: sourceKind
  });
  const sourceSubtitleData = await 接收SUBTITLE_DATA消息;

  // 6. 转换为VTT格式字符串
  const originalVtt = convertToVttString(sourceSubtitleData.subtitles);
  const translatedVtt = convertToVttString(targetSubtitleData.subtitles);

  // 7. 保存到TranslationCache（与API翻译结果格式一致，translationService仍为用户首选）
  await translationCacheManager.set({
    videoId,
    sourceLang: sourceLanguageName,
    sourceKind,
    targetLang: preferences.targetLang,
    translationService: preferences.translationService, // 使用用户配置的服务
    originalSubtitles: originalVtt,      // VTT格式字符串
    translatedSubtitles: translatedVtt,  // VTT格式字符串
    lastUsed: Date.now(),
    dataHash: ''  // 自动计算
  });

  // 8. 通知前端显示双语字幕
  notifyStateChange(tabId, {
    translateActive: TranslateActiveState.ACTIVE,
    videoId,
    sourceLanguage: sourceLanguageCode
  });

  // 9. 更新状态为ACTIVE
  await runtimeStateManager.setTranslateActiveState(
    videoId,
    TranslateActiveState.ACTIVE
  );

  // 10. 返回成功，跳过Stage 4和Stage 5
  return {
    success: true,
    message: 'YouTube原生字幕已启用',
    usingYouTubeNative: true
  };
}

// 如果不能复用，继续执行原有的Stage 4和Stage 5
```

## 4. 核心函数设计

### 4.1 canReuseYouTubeTranslation()

**位置**: `src/shared/utils/youtube-subtitle-utils.ts`

**功能**: 检查是否可以复用YouTube原生翻译

**接口**:
```typescript
export function canReuseYouTubeTranslation(
  captionTracks: CaptionTrack[],
  sourceLanguage: string,
  sourceKind: 'asr' | 'forced' | undefined,
  targetLanguage: string
): ReuseCheckResult {
  // 约束1: 源语言必须是手动字幕（非ASR）
  if (sourceKind === 'asr') {
    return { canReuse: false };
  }

  // 约束2: captionTracks中必须存在目标语言字幕（语言族匹配）
  const targetBase = targetLanguage.split('-')[0].toLowerCase();
  const targetTrack = captionTracks.find(track => {
    const trackBase = track.languageCode.split('-')[0].toLowerCase();
    return trackBase === targetBase;
  });

  if (!targetTrack) {
    return { canReuse: false };
  }

  // 约束3: 目标语言字幕必须是手动字幕（非ASR）
  if (targetTrack.kind === 'asr') {
    return { canReuse: false };
  }

  return { canReuse: true, targetTrack };
}
```

### 4.2 字幕获取辅助函数（待封装）

**功能**: 封装"切换轨道 → 触发加载 → 接收数据"的重复逻辑

**建议接口**:
```typescript
async function fetchSubtitlesByTrack(
  tabId: number,
  videoId: string,
  track: { languageCode: string; name: string; kind?: string },
  session: AbortTimeoutSession
): Promise<SubtitleData> {
  // 1. 切换轨道
  await sendSetSubtitleTrack(track.languageCode, track.kind);

  // 2. 触发加载
  await session.executeStage('trigger_load', async (signal) => {
    await chrome.tabs.sendMessage(tabId, {
      type: 'TRIGGER_SUBTITLE_LOAD',
      sourceLanguageCode: track.languageCode,
      sourceLanguageName: track.name,
      sourceKind: track.kind
    });
  });

  // 3. 接收数据
  return await session.executeStage('subtitle_fetch', async (signal) => {
    return new Promise((resolve, reject) => {
      // ... 监听SUBTITLE_DATA消息
    });
  });
}
```

### 4.3 VTT转换函数

**需要找到或实现**:
```typescript
function convertToVttString(subtitles: SubtitleEntry[]): string {
  // 将 SubtitleEntry[] 数组转换为VTT格式字符串
  // 参考现有的 parseVttString() 函数逆向实现
}
```

**参考位置**:
- 现有的 `parseVttString()` 函数
- 现有的翻译流程中生成VTT的代码

## 5. 数据格式规范

### 5.1 SubtitleData 格式

**来源**: 从 `SUBTITLE_DATA` 消息接收

**结构**:
```typescript
interface SubtitleData {
  subtitles: SubtitleEntry[];
  sourceLanguageName: string;
  sourceLanguageCode?: string;
  currentTime: number;
}
```

### 5.2 VTT 字符串格式

**存储格式**: 完整的WebVTT格式字符串

**示例**:
```
WEBVTT

00:00:00.000 --> 00:00:05.000
Hello, world

00:00:05.000 --> 00:00:10.000
This is a test
```

**用途**:
- 保存到 `TranslationCacheData.originalSubtitles`
- 保存到 `TranslationCacheData.translatedSubtitles`

### 5.3 TranslationCacheData 格式

**存储位置**: `chrome.storage.local`

**完整结构**:
```typescript
{
  videoId: string;
  sourceLang: string;              // 源语言name（如 "English"）
  sourceKind?: 'asr' | 'forced';
  targetLang: string;              // 目标语言code（如 "zh-CN"）
  translationService: TranslationServiceForStorage;
  originalSubtitles: string;       // VTT格式字符串
  translatedSubtitles: string;     // VTT格式字符串
  lastUsed: number;
  dataHash: string;
}
```

## 6. 技术难点与解决方案

### 6.1 变量作用域问题

**现状**：`availableTracks` 只在缓存命中分支内声明，对 Stage 3 “Player API 获取轨道” 分支不可见，导致缓存未命中时无法执行语言复用判断。

**待办**：
1. 在函数顶层声明 `let availableTracks: CaptionTrack[] | undefined`。
2. 在缓存命中与实时轨道获取两个分支里分别赋值。
3. 作为 Stage 4.7 的输入进行空值防护，避免再次回退到一次性变量。

### 6.2 重复代码消除

**现状**：切换轨道 + 触发 `TRIGGER_SUBTITLE_LOAD` + 监听 `SUBTITLE_DATA` 的逻辑分散在多个 Stage。未来需要执行两次（目标/源）时，直接复制会增加复杂度。

**待办**：抽象 `fetchSubtitlesByTrack(tabId, videoId, trackInfo, session)`，内部封装“设置轨道→触发加载→等待消息→超时处理”，供 Stage 4 与 Stage 4.7 共同调用。

### 6.3 VTT格式转换

**现状**：现有流程只提供 `parseVttString()`（字符串→`SubtitleEntry[]`），没有反向 `convertToVttString()`。要把 YouTube 原生字幕写入缓存，必须生成合法的 WebVTT 字符串。

**待办**：
1. 在 `src/shared/utils` 新增 `convertToVttString()`，确保毫秒精度与现有 VTT parser 一致。
2. Stage 4.7 在写入缓存时调用该工具，把源/目标 `SubtitleEntry[]` 转为 `originalSubtitles` / `translatedSubtitles`。

## 7. 用户体验

### 7.1 显示效果

- **与当前翻译效果完全一致**
- 根据Popup设置显示双语字幕或仅译文
- 用户无感知是API翻译还是YouTube原生字幕

### 7.2 性能优势

- ✅ 无API调用延迟（YouTube字幕已缓存在浏览器）
- ✅ 节省API费用
- ✅ 翻译质量有保证（YouTube官方手动字幕）

### 7.3 降级策略

如果复用过程中出现任何错误：
```typescript
try {
  // ... Stage 4.7 复用逻辑
} catch (error) {
  console.warn('[service-worker-v4] ⚠️ YouTube字幕复用失败，降级到API翻译', error);
  // 继续执行 Stage 4 和 Stage 5（原有流程）
}
```

## 8. 实施步骤（待执行）

### 阶段1：基础准备
1. 在 `handle-toggle-translate-v4.ts` 顶层定义 `availableTracks` 并在缓存/实时分支赋值。
2. 移除旧版 Stage 4.7（仅在缓存数据基础上直接 `setSubtitleTrack` 的实现），避免与新流程冲突。

### 阶段2：公共能力
3. 在 `src/shared/utils/youtube-subtitle-utils.ts` 实现 `canReuseYouTubeTranslation()` 与语言族匹配逻辑。
4. 在 `src/shared/utils` 新增 `convertToVttString()`，实现 `SubtitleEntry[] → WebVTT`。
5. 封装 `fetchSubtitlesByTrack()`，统一处理“切轨→触发→接收→超时”。

### 阶段3：核心流程
6. 在 Stage 4 前插入新的 Stage 4.7，按本章所述执行判定、双轨抓取、缓存写入与消息下发。
7. 确保降级路径能平滑回退到现有 Stage 4/5。

### 阶段4：验证 & 回归
8. 缓存命中 / 未命中 / 降级的端到端回归（含转换、多字幕设置）。
9. 覆盖 ASR/语言族等边界场景，确认按钮状态与 UI 文案保持一致。
10. 更新 `translator-logging-overview.md`、`translation-flow.md` 等文档中相关流程图（如有必要）。

## 9. 测试场景

### 9.1 正常复用场景
- ✅ 源语言：英语（手动）
- ✅ 目标语言：中文（YouTube有手动字幕）
- ✅ 预期：复用成功，显示双语字幕

### 9.2 无法复用场景

**场景A**: 源语言是ASR
- ❌ 源语言：英语（ASR）
- ✅ 目标语言：中文（手动）
- ❌ 预期：无法复用，调用API翻译

**场景B**: 目标语言不存在
- ✅ 源语言：英语（手动）
- ❌ 目标语言：法语（YouTube无此字幕）
- ❌ 预期：无法复用，调用API翻译

**场景C**: 目标语言是ASR
- ✅ 源语言：英语（手动）
- ❌ 目标语言：中文（ASR）
- ❌ 预期：无法复用，调用API翻译

## 10. 相关文件清单

### 核心文件
- `src/background/handle-toggle-translate-v4.ts` - 主执行流程
- `src/shared/utils/youtube-subtitle-utils.ts` - 复用检查函数

### 依赖文件
- `src/shared/storage/translation-cache-manager.ts` - 缓存管理
- `src/shared/types/storage-types.ts` - 数据类型定义
- `src/content-scripts/content-script.ts` - XHR拦截和字幕触发

### 文档
- `docs/implementation-plan-youtube-native-subtitle-reuse.md` - 最新实施计划
- `docs/youtube-native-subtitle-reuse-architecture.md` - 本架构文档

---

## 11. 版本历史

### v1.1（2025-01-12）
- ✏️ 同步“入口限定为翻译按钮”“translationService 字段沿用原值”“Popup 无额外 UI”的约束
- ✏️ 补充 Stage 4.7 仍待实现的说明，新增“当前实现 vs 目标”提示
- ✏️ 将技术难点与实施步骤改为“待办”状态，便于跟踪
- ✏️ 更新相关文档引用，指向新的实施计划

### v1.0（2025-01-11）
- ✅ 完成初版架构设计
- ✅ 明确3个硬约束条件
- ✅ 确定执行流程（Stage 4.7 在 Stage 4 之前）
- ✅ 定义数据格式和接口
- ✅ 识别5个技术难点并提供解决方案
- ✅ 制定4阶段实施计划

### 与v1.0初版计划的差异
初版实施计划存在以下问题（已归档）：
1. ❌ 只切换轨道不获取字幕内容
2. ❌ 不支持双语显示
3. ❌ Stage位置错误（放在Stage 4之后）
4. ❌ 未考虑变量作用域问题
5. ❌ 缺少VTT格式转换

本架构文档已修正所有问题。

---

**文档版本**: v1.1
**创建日期**: 2025-01-11
**更新日期**: 2025-01-12
**状态**: 架构设计完成，待实施
**负责人**: Claude Code
