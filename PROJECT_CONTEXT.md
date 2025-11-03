# YouTube字幕翻译扩展 - 项目上下文快照
> 最后更新：2025-11-03
> 用途：新Claude Code会话快速了解当前状态

## 🎯 当前状态

### 最近完成的架构优化 (2025-11-03)

**✅ 已完成：视频源语言缓存单一数据源重构（v5.24.11）** ⭐

**问题背景**：
- 在v5.24.10及之前版本，视频源语言缓存被多次写入（3次）
- Popup通过getAvailableSourceLanguages()自己获取并保存轨道数据
- Service Worker通过handleGetPopupInitData()也获取并保存轨道数据
- Cache Manager的initialize()会主动创建空缓存并写入
- 导致性能浪费和职责混乱

**架构重构**：
- **核心原则**：单一数据源（Single Source of Truth）
- **职责划分**：
  - Popup = 纯消费者（不读缓存、不调用Content Script、不保存缓存）
  - Service Worker = 唯一写入者（唯一负责获取和保存轨道数据）
  - Cache Manager = 纯存储层（统一upsert接口，删除upsertFromPopup）
  - Content Script = 数据源（只响应请求，不操作缓存）
- **数据流**：单向流动（YouTube API → Service Worker → Cache Manager → chrome.storage.local → Popup）
- **架构约束**：
  1. 只有Service Worker可以调用Cache Manager的upsert()
  2. Popup不允许import VideoSourceLanguageCacheManager
  3. Content Script只响应消息，不主动操作缓存
  4. 所有缓存读写必须通过Service Worker

**效果**：
- ✅ 3次存储写入 → 1次存储写入
- ✅ 职责清晰，每层边界明确
- ✅ 数据流向单向，易于维护
- ✅ 性能优化，减少chrome.storage.onChanged触发

**影响文件**：
- `docs/architecture/03-component-design.md` - 新增6.1.1节
- `docs/architecture/06-simplified-popup-architecture.md` - 新增Popup职责边界章节
- `CLAUDE.md` - 新增2.1节视频源语言缓存架构
- `PROJECT_CONTEXT.md` - 本条记录

**下一步**：
- 实施代码重构（删除Popup中的getAvailableSourceLanguages和saveVideoSourceLanguageCache）
- 统一Cache Manager接口（合并set和upsertFromPopup为upsert）
- 修改initialize()不主动写入空数据

### 最近修复的Bug (2025-10-30)

**✅ 已修复：Popup源语言下拉框中英混合显示问题**
- 问题：源语言下拉框显示"Chinese"（英文）和"英语"（中文）混合，用户体验差
- 根本原因：
  - 构建配置从不完整的 `public/_locales` 复制i18n文件
  - `public/_locales/zh_CN/messages.json` 缺少3个关键条目：`lang_zh`、`lang_zh_CN`、`lang_zh_TW`
  - vite默认会将整个 `public` 目录复制到 `dist`，覆盖了viteStaticCopy的正确复制
- 解决方案：
  - 修改 `vite.config.ts:120` - 从完整的 `_locales` 复制而不是 `public/_locales`
  - 删除 `public/_locales` 目录 - 避免vite默认复制行为覆盖
  - 实现单一数据源，`_locales` 作为唯一i18n源文件
- 影响文件：
  - `vite.config.ts` (line 120)
  - `public/_locales/` (整个目录已删除)
- 技术细节：
  - popup.ts已实现智能语言显示（`generateLanguageDisplayName`函数）
  - 两级语言代码回退机制：`es-ES → lang_es_ES → lang_es`
  - Chrome i18n API：`chrome.i18n.getMessage()`
- 验证结果：
  - ✅ 源文件和dist文件完全一致（56行）
  - ✅ 所有语言显示为中文，不再出现英文
  - ✅ 避免未来 `_locales` 和 `public/_locales` 不同步问题

### 最近完成的优化 (2025-10-27)

**✅ 已完成：Popup UI布局修复和优化**
- 问题：API密钥输入框右边比模型选择框、API类型框短，未对齐
- 根本原因：`#api-key-panel` 设置 `align-items: flex-start` 导致 `.setting-row` 宽度由内容决定，未拉伸到100%
- 解决方案：
  - 添加 `#api-key-panel .setting-row { width: 100% }` 强制拉伸
  - 统一password输入框样式（`box-sizing: content-box`，背景色、边框与select保持一致）
  - 减少service-card高度20px（`padding: 16px 0 0 0`, `gap: 10px`）
- 影响文件：
  - `src/popup/popup.html` (line 220, 223, 420-422, 862-872)
- 提交记录：37348ef
- 排查过程：经历多次错误尝试（box-sizing、padding调整），最终发现是父容器flex布局的align-items导致

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

### 今日任务 (2025-10-30)
- [x] 修复popup源语言下拉框中英混合显示问题
- [x] 修改vite构建配置，从 `_locales` 复制i18n文件
- [x] 删除 `public/_locales` 避免vite默认复制覆盖
- [x] 实现语言代码映射修复方案（`docs/language-mapping-fix.md`）
- [x] 修复源语言数据流（从'auto'到实际语言名称如'English'）
- [x] 优化OpenAI翻译器Prompt（精简+明确输入输出格式）
- [x] 精简OpenAI翻译器错误日志（删除重复日志）

## 📋 最近3天的重要改动

### 2025-10-30
- **修复popup语言显示bug**：解决源语言下拉框中英混合问题
- **优化构建配置**：改用 `_locales` 作为单一i18n数据源
- **删除冗余目录**：移除 `public/_locales` 避免文件不同步
- **✅ 实现语言代码映射修复**：完成 `docs/language-mapping-fix.md` 方案
  - 创建 `LanguageCodeMapper` 工具类（使用浏览器内置Intl.DisplayNames API）
  - 修复源语言数据流：统一使用YouTube API的 `languageCode` + `name` 字段
  - 优化Chat API Prompt：从"zh-CN to ru"改为"Chinese to Russian"
  - 修改文件：handle-toggle-translate-v4.ts, openai-translator.ts, deepseek-translator.ts, gemini-translator.ts
- **优化OpenAI翻译器**：
  - 精简Prompt（21行→14行），明确INPUT/OUTPUT格式
  - 精简错误日志（5条→3条），删除重复信息
  - 合并初始化日志为单行

### 2025-10-27
- **Popup UI布局修复**：解决API密钥输入框右边比其他框短的问题（根本原因：flex布局的align-items）
- **卡片高度优化**：service-card减少20px（padding和gap调整）
- **样式统一**：password输入框与select保持一致的box-sizing和背景色

### 2025-10-25
- **文档梳理推进**：根目录与 `docs/` 部分资料已完成审阅登记，待继续深入子目录
- **开发环境对齐**：新增 `.nvmrc` 锁定 Node 22.12.0，防止版本偏差
- **文档精简**：移除 `DEBUG_MICROSOFT_OPTIMIZER.md`（内容已整合到微软翻译实现指南）

### 2025-10-24
- **CLAUDE 协同策略复核**：确认 `CLAUDE.md` 由 Claude Code 维护，记录当前说明尚未更新
- **归档策略讨论**：评估 MCP 相关文档是否保留，暂定保留 `CONTEXT7_MCP_SETUP.md`

### 2025-10-23
- **翻译失败处理回顾**：核对 handle-toggle-translate V4 近期改动，确认日志/提示逻辑正常
- **资料盘点准备**：统计 `docs/`、`backup/`、`debug/` 等目录体量，规划梳理顺序

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

1. **OpenAI翻译数量不匹配**（优先级：高）
   - 现象：15条字幕输入，返回13-14条翻译
   - 影响：翻译失败，用户无法看到字幕
   - 原因分析：GPT-5模型可能"智能"合并重复字幕内容
   - 解决尝试：
     - ✅ 已强化Prompt（明确INPUT/OUTPUT格式、禁止合并duplicate items）
     - ⏳ 观察新Prompt效果
   - 状态：持续监控中

2. **用户偏好重复获取**（优先级：低）
   - 现象：user-preferences-manager被调用2次
   - 影响：轻微性能损耗
   - 原因：getAllState和handleToggleTranslateV4都在获取

## ✅ 本周完成

- **语言代码映射修复**（2025-10-30）
  - 创建LanguageCodeMapper工具类
  - 修复源语言数据流（auto→实际语言名）
  - 优化Chat API Prompt（代码→英文名称）
- **OpenAI翻译器优化**（2025-10-30）
  - Prompt精简（21行→14行）
  - 错误日志优化（删除重复）
- **Popup UI修复**（2025-10-27/10-30）
  - API密钥输入框对齐
  - 源语言下拉框中英混合问题
- AbortController替代SimpleWatchdog
- 时间间隔断句替代语言规则（1000行→200行）
- Google免费翻译API集成
- 消息处理bug修复系列
- **修复Google翻译分割问题**（2025-09-11）

## 📝 下一步计划

1. **立即**：监控OpenAI翻译数量不匹配问题，评估新Prompt效果
2. **本周**：
   - 如果数量不匹配问题持续，考虑减小批次大小（20→10）
   - 完成文档与归档目录的审阅标注
3. **下周**：评估翻译流程性能（减少重复调用与日志开销），补充缺失的自动化测试
4. **待定**：扩展额外翻译服务支持（保持架构兼容）

## 💡 关键决策记录

- **为什么用V4架构**：AbortController可真正中断执行流
- **为什么改时间间隔断句**：代码量减少80%，更自然
- **为什么用特殊分隔符**：避免Google API插入的换行符干扰（已验证有效）
- **为什么批量翻译不合并紧急结果**：简化逻辑，批量翻译包含全部字幕且质量更高（2025-09-22）
- **为什么每批次前都延迟200ms**：避免API限流，包括第一批（2025-09-22）
- **为什么使用Intl.DisplayNames**：浏览器内置API，零维护成本，支持8000+语言组合（2025-10-30）
- **为什么Chat API用英文名称**：官方最佳实践，避免AI误解语言代码（2025-10-30）

---
*提示：这个文件应该每天更新，保持信息实时性*
