# YouTube字幕翻译扩展 - 项目上下文快照
> 最后更新：2025-09-22
> 用途：新Claude Code会话快速了解当前状态

## 🎯 当前状态

### 待优化问题 (2025-09-22)

**🔧 待修复：批量翻译重复发送问题**
- 问题原因：批量翻译结果被发送了两次（line 434-466 和 line 506-540）
- 具体表现：前端收到两次相同的340条完整字幕
- 优化方案：
  - 删除第一次发送（line 433-466）
  - 删除`allResults`合并逻辑（line 469）
  - 删除`translatedSubtitles`构建（line 471-482）
  - 保留最终发送，直接基于`batchResults`构建
- 架构调整：批量翻译完成后直接覆盖，无需合并
- 影响文件：`src/background/handle-toggle-translate-v4.ts`

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

### 今日任务 (2025-09-22)
- [x] 分析批量翻译重复发送问题
- [x] 更新架构文档（两阶段翻译策略）
- [ ] 修复批量翻译重复发送代码
- [ ] 清理调试日志
- [ ] 性能优化（减少重复调用）

## 📋 最近3天的重要改动

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