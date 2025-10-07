# YouTube字幕翻译扩展 - 项目上下文快照
> 最后更新：2025-10-07
> 用途：新Claude Code会话快速了解当前状态

## 🎯 当前状态

### 最近修复的Bug (2025-10-07)

**✅ 已修复：翻译失败处理优化**
- 问题原因：批量翻译有`fallback: []`导致失败不报错，继续执行使用紧急翻译结果
- 解决方案：
  - 紧急翻译失败：保留fallback，显示警告"快速翻译失败，正在执行完整翻译..."，继续批量
  - 批量翻译失败：去掉fallback，任何批次失败立即抛错，显示详细错误信息
  - 错误消息优化：添加"请重试"提示，显示时长统一5秒
  - 前端支持：添加SHOW_WARNING_MESSAGE处理
- 影响文件：
  - `src/background/handle-toggle-translate-v4.ts`
  - `src/background/components/two-phase-translator-v4.ts`
  - `src/content-scripts/content-script.ts`
- 架构文档已更新：
  - `docs/architecture/07-batch-translation-architecture.md`
  - `docs/architecture/08-abort-timeout-architecture.md`

### 之前修复的Bug (2025-09-26)

**✅ 已修复：紧急字幕模式切换未即时生效**
**✅ 已修复：源语言切换未更新播放器轨道**
- 问题原因：重新翻译流程仅依赖缓存语言，未再次调用 `setSubtitleTrackAPI`，控制栏停留在旧轨道
- 解决方案：
  - `ToggleTranslateRequest` 携带源语言字段，后台优先使用用户选择的语言
  - 无论轨道缓存是否命中都调用 `setSubtitleTrackAPI`，确认切轨后再触发字幕按钮
- 验证要点：popup 选择新源语言且翻译开关保持开启时，控制栏和拦截字幕均切换为该语言

- 问题原因：首次写入 `subtitleMode` 时缺少旧值，偏好监听不会触发 `SUBTITLE_MODE_CHANGED`
- 具体表现：popup 切换为“仅译文/双语”后，紧急翻译字幕保持旧模式，需等待批量字幕覆盖
- 优化方案：在 `UserPreferencesManager` 缺少旧值时回落默认偏好，确保首写也触发事件
- 影响文件：`src/shared/storage/user-preferences-manager.ts`
- 验证要点：触发紧急翻译后切换字幕模式，黄色字幕应立即切换展示布局

### 最近修复的Bug (2025-09-16)

**✅ 已修复：V4架构源语言缓存保存失败**
- 问题原因：VideoSourceLanguageCacheManager.set()调用参数格式错误
- 具体表现：第二次点击翻译开关时，源语言仍显示'auto'而非缓存值
- 解决方案：
  - 修正set()方法调用从set(videoId, data)改为set(data)
  - 移除不存在的lastUpdated字段
  - 同时修复V4架构和旧架构中的相同问题
- 修复位置：
  - `src/background/handle-toggle-translate-v4.ts` 第212-216行
  - `src/background/service-worker.ts` 第2426-2430行
- 提交记录：f2889e8

**✅ 已修复：V4架构缺少源语言轨道选择**
- 问题原因：V4架构跳过了字幕轨道获取和智能选择步骤，导致源语言一直是'auto'
- 解决方案：
  - 在Stage 3添加轨道获取（getSubtitleTracksAPI）
  - 使用selectBestSourceLanguage智能选择最佳源语言
  - 通过setSubtitleTrackAPI设置字幕轨道
  - 缓存轨道信息到VideoSourceLanguageCache
- 修复位置：`src/background/handle-toggle-translate-v4.ts` 第151-234行
- 符合架构文档：`docs/architecture/01-design-principles.md` 3.3.1节

**✅ 已修复：translateActive 状态日志重复打印**
- 问题原因：StorageManager 为 local/sync/session 重复注册 `chrome.storage.onChanged`，一次写入触发三次回调
- 解决方案：监听回调按 `areaName` 过滤，仅分发来源区域事件
- 影响范围：后台 translateActive 状态事件恢复单次触发，避免重复日志

### 之前修复的Bug (2025-09-11)
**✅ 已修复：Google免费翻译只翻译第一句**
- 问题原因：Google API在翻译长文本时会插入换行符，使用`\n`作为分隔符导致错误分割（3条变22条）
- 解决方案：
  - 改用特殊分隔符 `|SEP|` 替代单个换行符
  - 分割后增加 `trim()` 处理空格
  - 添加降级策略：分隔符失效时按长度比例分割
- 修复位置：`src/background/components/two-phase-translator-v4.ts` 第347-379行
- 提交记录：15c4367

### 今日任务 (2025-10-07)
- [x] 检查翻译失败处理逻辑
- [x] 修复批量翻译错误被吞掉的问题
- [x] 实现紧急翻译失败警告提示
- [x] 优化错误消息显示
- [x] 更新相关架构文档

## 📋 最近3天的重要改动

### 2025-10-07
- **优化翻译失败处理**：紧急失败显示警告继续，批量失败立即中断
- **修复批量翻译错误被吞问题**：去掉fallback让错误真正抛出
- **添加用户提示**：失败时明确提示原因和重试
- **更新架构文档**：同步失败处理策略到文档

### 2025-09-26
- **修复紧急字幕模式切换延迟问题**：首写偏好回落默认值，保证 `SUBTITLE_MODE_CHANGED` 事件触发

### 2025-09-22
- **发现批量翻译重复发送问题**：340条字幕被发送两次
- **更新架构文档**：明确两阶段翻译为完全覆盖模式
- **优化批量翻译时序**：每批次前延迟200ms（包括第一批）

### 2025-09-16
- **修复V4架构源语言缓存保存失败**
- **修复translateActive状态日志重复打印**

### 2025-09-11
- **修复Google翻译分割bug**：使用特殊分隔符解决
- **更新CLAUDE.md**：添加完整架构文档索引

### 2025-09-10
- 实现AbortController超时架构（V4）
- 集成Google免费翻译API
- 添加调试日志追踪翻译问题
- 创建分层文档体系

### 2025-09-09  
- 修复字幕获取超时问题（Content Script消息处理）
- 修复action字段不匹配问题（started→translated）
- 修复字段名问题（translatedText→translation）

### 2025-09-08
- 实现两阶段并行翻译架构
- 智能分段算法（基于时间间隔）
- 紧急翻译范围优化（前9后30）

## 🐛 已知问题

1. **用户偏好重复获取**（优先级：低）
   - 现象：user-preferences-manager被调用2次
   - 影响：轻微性能损耗
   - 原因：getAllState和handleToggleTranslateV4都在获取

## ✅ 本周完成

- AbortController替代SimpleWatchdog
- 时间间隔断句替代语言规则（1000行→200行）
- Google免费翻译API集成
- 消息处理bug修复系列
- **修复Google翻译分割问题**（2025-09-11）

## 📝 下一步计划

1. **立即**：清理所有调试日志
2. **本周**：继续推进V4架构实现
3. **下周**：性能优化（减少重复调用）
4. **待定**：添加更多翻译服务支持

## 💡 关键决策记录

- **为什么用V4架构**：AbortController可真正中断执行流
- **为什么改时间间隔断句**：代码量减少80%，更自然
- **为什么用特殊分隔符**：避免Google API插入的换行符干扰（已验证有效）
- **为什么批量翻译不合并紧急结果**：简化逻辑，批量翻译包含全部字幕且质量更高（2025-09-22）
- **为什么每批次前都延迟200ms**：避免API限流，包括第一批（2025-09-22）

---
*提示：这个文件应该每天更新，保持信息实时性*
