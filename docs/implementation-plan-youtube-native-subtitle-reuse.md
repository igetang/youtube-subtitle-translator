# YouTube 原生字幕复用功能 - 实施计划（v2）

> 🤝 本计划与 `docs/youtube-native-subtitle-reuse-architecture.md v1.1` 保持同步，目标是让翻译开关按钮在检测到目标语言手动字幕时直接复用 YouTube 数据，同时维持现有缓存/UI 行为。

---

## 🧭 需求基线

1. **入口限定**：仅由内容脚本内的“翻译开/关”按钮（或同等快捷键）触发；Popup 仍只负责配置。
2. **缓存/存储保持不变**：`translationCacheManager` 继续使用用户选择的 `translationService` 作为键值组成部分，不新增 `youtube-native` 标识。
3. **UI 无感知**：Popup、按钮、字幕覆盖层均不显示“原生字幕”文案，复用路径与普通翻译路径在界面上完全一致。

---

## 🧩 现状评估

| 模块 | 现状 | 影响 |
|------|------|------|
| `handle-toggle-translate-v4.ts` | Stage 4.7 尚未实现；Stage 4 之后直接进入翻译 | 无法在源字幕抓取前复用原生字幕 |
| `availableTracks` | 只在缓存命中分支声明 | 缓存未命中时无法判断目标轨道 |
| 字幕抓取逻辑 | 仅支持抓取一次源语言字幕 | 无法在不中断流程的情况下抓取目标语言字幕 |
| VTT 工具 | 只有 `parseVttString`（VTT → Entries） | 无法把原生字幕写回缓存 |
| UI/消息流 | 不区分原生 vs 翻译数据 | 需要确保 Stage 4.7 的输出沿用现有 `TRANSLATION_UPDATE` 协议 |

---

## 🛠️ 任务拆解

### Phase 1 – 基础能力
1. **Hoist `availableTracks`**  
   - 在 `handle-toggle-translate-v4.ts` 顶层声明 `let availableTracks: CaptionTrack[] | undefined`。  
   - 在缓存命中与 Player API 两条路径赋值，确保 Stage 4.7 能获取全量轨道。
2. **实现 `canReuseYouTubeTranslation()`**  
   - 位置：`src/shared/utils/youtube-subtitle-utils.ts`。  
   - 内容：语言族匹配、ASR 过滤、日志输出。  
   - 由 Service Worker 导入使用，避免循环依赖。
3. **实现 `convertToVttString()`**  
   - 位置：`src/shared/utils/convert-vtt.ts`（或与 parser 同目录）。  
   - 约定：毫秒精度、UTF-8、兼容 `parseVttString()` 现有格式。
4. **封装 `fetchSubtitlesByTrack()`**  
   - 位置：`handle-toggle-translate-v4.ts` 内部或 `src/background/helpers`.  
   - 功能：设置轨道 → 触发 `TRIGGER_SUBTITLE_LOAD` → 监听 `SUBTITLE_DATA` → 超时/abort 处理。  
   - 供 Stage 4.7（目标+源）和现有 Stage 4（源）复用。

### Phase 2 – Stage 4.7 核心实现
5. **插入 Stage 4.7（语言验证之后、抓源字幕之前）**  
   - 调用 `canReuseYouTubeTranslation(availableTracks, sourceLanguageCode, sourceKind, preferences.targetLang)`。  
   - 若不满足条件直接跳出，继续 Stage 4。
6. **双轨抓取与缓存写入**  
   - 若命中：  
     1. `fetchSubtitlesByTrack(targetTrack)` → 获取译文。  
     2. `fetchSubtitlesByTrack(sourceTrack)` → 获取原文。  
     3. `convertToVttString()` 生成 `originalSubtitles` / `translatedSubtitles`。  
     4. 调用 `translationCacheManager.set()`，`translationService` 仍为 `preferences.translationService`。  
     5. 发送 `TRANSLATION_UPDATE`（或沿用现有 `progressive` 路径）让内容脚本覆盖渲染。  
     6. 更新 `runtimeStateManager`、`notifyStateChange()`，与普通成功路径一致。
7. **降级与日志**  
   - 任何步骤失败：`warn` 日志 + `return { canReuse: false }`，然后继续 Stage 4/5。  
   - 确保切轨失败时恢复到源轨，避免打断后续翻译。

### Phase 3 – 集成与验证
8. **端到端测试**  
   - 缓存命中（直接渲染 VTT）  
   - 缓存未命中但命中原生字幕  
   - 缓存未命中且需要翻译  
   - 降级（setSubtitleTrack 失败 / TRIGGER_TIMEOUT 等）  
   - ASR / 语言族等边界
9. **文档与日志同步**  
   - 更新 `translation-flow.md`、`translator-logging-overview.md`。  
   - 增补 `CHECKLIST`：按钮状态、广告检测协同等。
10. **回归**  
    - 确认 translation cache 命中后依旧能直接渲染。  
    - 验证双语 / 仅译文模式在原生复用场景下表现一致。

---

## 🔍 验证矩阵

| 场景 | 条件 | 预期 |
|------|------|------|
| 正常复用 | 源=手动、目标轨存在且手动 | 按照 Stage 4.7 流程渲染双语字幕，无翻译 API 调用 |
| 源 ASR | `sourceKind==='asr'` | 日志提示无法复用 → Stage 4/5 |
| 目标缺失 | `availableTracks` 无匹配语言族 | 直接进入 Stage 4/5 |
| 目标 ASR | 匹配轨道但 `kind==='asr'` | 继续 Stage 4/5 |
| Player 失败 | `setSubtitleTrack` / `TRIGGER_SUBTITLE_LOAD` 失败 | Warn + 降级，流程不中断 |
| 缓存复用 | 先命中 translation cache | 仍按现有缓存逻辑渲染，与 Stage 4.7 无冲突 |

---

## 📝 文档 & 日志要求

1. **Service Worker 日志**  
   - `log`: 命中复用（含语言对、轨道信息）  
   - `warn`: 降级原因（setSubtitleTrack 失败、TRIGGER_TIMEOUT 等）  
   - `debug`: `availableTracks` 数量、语言族匹配细节
2. **文档**  
   - 架构：已更新至 v1.1（见上）。  
   - Flow/Logging：按 Phase 3 任务更新，引用新的 Stage 4.7。

---

## 📎 交付清单

- [ ] 代码：`handle-toggle-translate-v4.ts`、`src/shared/utils/*`、内容脚本消息监听等改动。  
- [ ] 文档：`docs/youtube-native-subtitle-reuse-architecture.md`、`docs/translation-flow.md`、`docs/translator-logging-overview.md`。  
- [ ] 测试：附上手动验证步骤（参考 `docs/guides/ad-detection-test.md` 的写法）。  
- [ ] 变更说明：PR 中强调“入口为翻译按钮、translationService 不变、Popup 无额外 UI”。  
- [ ] 风险/降级：描述 setSubtitleTrack 不可用、字幕抓取超时等 fallback 行为。

---

**版本**：v2（2025-01-12）  
**负责人**：待定  
**状态**：进行中（Phase 1-3 未完成）
