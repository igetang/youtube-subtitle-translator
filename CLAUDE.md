# YouTube字幕翻译Chrome扩展 - 项目知识库

# 您是一位专业的 Chrome 扩展程序开发专家，精通 JavaScript/TypeScript、浏览器扩展程序 API 和 Web 开发。
# 对于我给你的指令和问题，以你资深开发专家的判断，如果有不合理和疑问，请你先结合项目说明文档和代码进行确认，如果还有疑问，先向我提出，确认后，你再继续执行任务。

## 🤝 对话规范（重要！必须严格遵守）

### 1. 对话风格要求
- **更幽默直白**：不要太正经枯燥，像朋友/同事聊天一样，可以开玩笑、吐槽、说粗话
- **带有互动感**：不只是逢迎附和，要主动干预并指出问题和错误
- **真实表达**：发现问题直接说"这里不对"、"这样不行"，不要客套

### 2. 问题处理流程（必须按此流程）
**第一步：理解并复述**
- 先理解用户的意思，然后用自己的话复述一遍
- 格式："让我理解一下，你是想XXX，对吧？"

**第二步：分析方案**
- 进行问题分析，提出解决方案
- 格式："我觉得可以这样搞..."、"问题在于XXX，我们可以..."

**第三步：等待确认**
- 等用户确认方案正确后，再进行代码修改
- 不要直接分析直接改代码，要等确认

### 3. 疑问处理原则
- **不理解立即询问**："等等，你说的XX是什么意思？"
- **信息不足要求补充**："这里信息不够，能说说XXX吗？"
- **有歧义马上澄清**："这个有两种理解，你是指哪种？"
- **绝不在半理解状态下分析问题**：宁可多问几句，也不瞎猜

### 示例对话风格
❌ 错误："好的，我将为您实现这个功能，以下是代码修改..."
✅ 正确："哦，你是想加个翻译按钮？等等，放在哪儿？YouTube控制栏里？"

❌ 错误："根据您的需求，我理解您想要..."
✅ 正确："兄弟，你这意思是不是说代码还没改完，跟文档不一致很正常？"

## 项目概述

### 基本信息
- **项目名称：** YouTube字幕翻译Chrome扩展
- **版本：** v3.0.0（新架构）
- **目标：** 为YouTube视频提供实时字幕翻译功能，支持多种翻译服务
- **用户价值：** 帮助用户跨语言观看YouTube视频，提升学习和娱乐体验
- **架构：** Chrome Extension Manifest V3 + TypeScript
# - **调试截图保存路径：** E:\picture\  # macOS可以通过对话框发送图片，无需固定路径

### 核心功能
1. **实时字幕翻译** - 捕获YouTube字幕并实时翻译
2. **多翻译服务支持** - 支持OpenAI、Google翻译等
3. **智能缓存** - 两层缓存架构，提升性能
4. **状态管理** - 分离运行时状态和用户偏好设置

## 项目目录结构

```
/Users/lizhe/vtc/8.19/
├── src/                        # 【新架构代码】主要开发目录
│   ├── background/             # Service Worker（原Background Script）
│   │   ├── service-worker.ts  # 核心后台服务，消息处理中心
│   │   └── components/         # 后台组件
│   │       ├── batch-processor.ts      # 批处理器
│   │       └── openai-translator.ts    # OpenAI翻译器
│   ├── content-scripts/        # 内容脚本
│   │   ├── content-script.ts           # 主内容脚本
│   │   ├── content-script-coordinator.ts # 状态协调器
│   │   └── subtitle-overlay.ts         # 字幕覆盖层
│   ├── popup/                  # Popup弹窗（当前方案）
│   │   ├── popup.html         
│   │   └── popup.ts           
│   ├── sidepanel/             # 【已废弃】已完全迁移到Popup
│   ├── shared/                # 共享模块
│   │   ├── types/             # TypeScript类型定义
│   │   │   ├── runtime-state-types.ts  # 运行时状态类型
│   │   │   └── user-preferences-types.ts # 用户偏好类型
│   │   ├── storage/           # 存储管理器
│   │   │   ├── runtime-state-manager.ts    # 运行时状态管理
│   │   │   ├── user-preferences-manager.ts # 用户偏好管理
│   │   │   └── translation-cache-manager.ts # 翻译缓存管理
│   │   ├── messages/          # 消息系统
│   │   │   └── message-bus.ts          # 统一消息总线
│   │   └── components/        # UI组件
│   │       ├── ui-manager.ts           # UI管理器
│   │       └── control-panel.ts        # 控制面板
│   └── options/               # 选项页面
│
├── legacy/                     # 【旧架构代码】已废弃，仅供参考
│   ├── background.js          # 旧的后台脚本
│   ├── content.js             # 旧的内容脚本
│   └── ...                    # 其他旧代码
│
├── backup/                     # 【备份目录】历史版本备份
│   └── architecture_*.md      # 架构文档历史版本
│
├── docs/                       # 【项目文档】
│   ├── architecture.md        # 主架构文档（最新）
│   ├── new/                   # 新架构设计文档
│   │   ├── architecture1.md   # 架构演进历史v1
│   │   ├── architecture2.md   # 架构演进历史v2
│   │   ├── architecture3.md   # 架构演进历史v3
│   │   ├── architecture4.md   # 架构演进历史v4
│   │   └── architecture5.md   # 最新架构设计v5
│   ├── migration-*.md         # 迁移相关文档
│   ├── performance.md         # 性能优化文档
│   └── troubleshooting.md    # 问题排查文档
│
├── dist/                       # 【构建输出】编译后的文件
├── icons/                      # 扩展图标资源
├── _metadata/                  # Chrome扩展元数据
│
├── manifest.json              # Chrome扩展清单文件（Manifest V3）
├── package.json               # Node.js项目配置
├── tsconfig.json              # TypeScript配置
├── webpack.config.js          # Webpack构建配置
│
├── CLAUDE.md                  # 【本文件】AI助手项目知识库
├── DEVELOPMENT.md             # 开发指南
├── CHANGELOG.md               # 更新日志
└── README.md                  # 项目说明
```

### 重要目录说明
- **`/src`** - ⚠️ 当前正在使用的新架构代码，所有开发都在这里进行
- **`/legacy`** - ❌ 旧架构代码，不要修改，仅供参考对比
- **`/backup`** - 📦 备份文件，包含历史版本
- **`/docs/new/architecture5.md`** - 📖 最新架构设计文档

## 技术架构

### 技术栈
- **前端：** TypeScript + Chrome Extension API
- **架构：** Manifest V3 + Service Worker
- **状态管理：** RuntimeStateManager + UserPreferencesManager
- **消息通信：** MessageBus（统一消息总线）
- **构建工具：** Webpack + TypeScript Compiler

### 核心模块

#### 1. 翻译系统（3状态机制）
```typescript
enum TranslateActiveState {
  INACTIVE = 'inactive',      // 翻译关闭
  PENDING = 'pending',         // 翻译执行中（过渡状态，5秒超时保护）
  ACTIVE = 'active'            // 翻译激活（有字幕并显示翻译）
}
```

**PENDING状态超时机制：**
- 设置5秒超时保护，防止状态卡死
- 超时后自动回退到INACTIVE状态
- 确保系统始终可恢复

#### 2. 缓存系统（两层架构）
- **本地存储** - 持久化，容量较大
- **API缓存** - 减少重复API调用

#### 3. 状态管理（三层分离设计）
- **RuntimeState** - 运行时状态（session存储、跨标签页共享）
  - translateActive（3状态翻译系统）
  - popupOpen（Popup开关状态）
- **UserPreferences** - 用户偏好（local存储、持久化）
  - targetLang（目标语言）
  - subtitleMode（字幕显示模式）
  - translationService（翻译服务完整配置）
- **VideoSourceLanguageData** - 视频源语言数据（local存储、按视频分散）
  - availableSourceLanguages（可用源语言列表）
  - lastSelectedLanguage（用户选择记录）
- **TranslationCacheData** - 翻译缓存（local存储、按翻译分散）
  - originalSubtitles（原始字幕）
  - translatedSubtitles（翻译结果）

#### 4. 消息通信
- **MessageBus** - 统一消息总线（已完全替代EventBus）
- **消息格式** - 使用 `type` 字段，废弃 `action`
- **通信流** - Content Script ↔ Service Worker ↔ Popup

#### 5. YouTube Player API集成
- **SubtitleAPIController** - 直接控制YouTube字幕
- **ISO 639-1标准** - 使用国际标准语言代码（en, fr, de, zh等）
- **API方法**：
  - `getAvailableTracks()` - 获取可用字幕轨道
  - `setSubtitleTrack(langCode)` - 设置字幕语言
  - `getCurrentTrack()` - 获取当前字幕语言
- **智能降级** - API失败时自动回退到拦截器方案

## 架构决策记录

### 关键技术决策

1. **为什么选择3状态系统？**
   - 简化状态管理复杂度
   - 通过消息处理错误情况
   - 提供更清晰的用户体验

2. **为什么使用缓存优先策略？**
   - 减少API调用，降低成本
   - 提升响应速度，改善用户体验
   - 支持离线查看已翻译内容

3. **为什么采用三层存储架构？**
   - RuntimeState：会话级别，跨标签页共享
   - UserPreferences：全局设置，持久化存储
   - VideoSourceLanguageData + TranslationCacheData：按视频分散存储，优化性能

4. **为什么选择Popup方案？**
   - 兼容性最好，所有Chrome版本支持
   - Popup更轻量，用户体验更好
   - 符合Chrome扩展最佳实践

## 开发进度

### ✅ 已完成
- [x] 3状态翻译系统实现
- [x] 缓存优先的翻译流程
- [x] MessageBus统一消息系统
- [x] Popup作为设置界面
- [x] Boolean → Enum状态迁移
- [x] 日志格式统一和优化
- [x] TypeScript类型安全
- [x] 消息重复发送问题修复
- [x] tabs.onUpdated重复执行优化
- [x] 批量翻译架构设计v2（2025.09）

### 🚧 进行中
- [ ] 批量翻译系统实现（基于时间间隔断句）
- [ ] 性能优化（减少重复调用）
- [ ] 清理旧代码
- [ ] 数据迁移优化

### 📋 待办事项
- [ ] 添加数据迁移版本标记
- [ ] 优化getAllState和getTranslateState
- [ ] 减少数据迁移日志输出
- [ ] 完善错误处理机制
- [ ] 添加单元测试

## 最近完成的工作
- 修复 action → type 消息格式问题
- 优化 ui-manager.ts 中的重复状态调用
- 实现统一状态同步机制 (refreshAllStates)
- 减少 service worker 中的冗余消息调用
- 修复日志重复打印问题
- 优化tabs.onUpdated避免重复执行
- 实现统一的源语言选择规则系统
- 修复异步响应错误问题
- **移除baseUrl存储**：不再缓存会过期的YouTube字幕URL，改为实时获取
- **集成YouTube Player API**：使用官方API直接控制字幕，支持ISO 639-1标准
- **实现PENDING超时机制**：5秒超时保护，确保状态不会卡死
- **修复`type is not defined`错误**：解决main-world.ts中的变量解构问题
- **设计新的批量翻译方案**（2025.09）：
  - 诊断分隔符bug：`\n---SEPARATOR---\n`被Google API改变格式
  - 改用Unicode私有区域字符作为分隔符（`\uE000-\uF8FF`）
  - 实现智能断句避免切断语义
  - 采用顺序批量翻译避免API限流
  - 优化为渐进式更新和延迟存储

## 代码规范

### 基本原则
- 使用 `type` 字段替代 `action` 字段进行消息通信
- 偏好 Promise.all 并发处理
- 重视性能优化和减少重复调用
- 使用统一状态同步机制

### 设计原则
- **简单优于复杂：** 避免过度设计，优先考虑简单可行方案
- **Chrome插件最佳实践：** Service Worker作为状态中心，消息驱动而非事件驱动
- **场景化设计：** 根据使用场景选择全量同步vs单一状态同步
- **性能优先：** 最小网络请求，智能缓存，避免重复调用

### 状态同步策略
- **全量同步：** 页面刷新/导航/标签切换时使用 getAllState()
- **单一同步：** 按钮操作/popup操作时使用 getSingleState(key)
- **无防重复限制：** 尊重用户每次操作，不设时间限制

## 日志格式规范

### 基本格式
- **组件前缀：** 使用 `[文件名]` 格式，不带扩展名和行号
  - 示例：`[service-worker]`, `[content-script]`, `[runtime-state-manager]`
  - 注意：使用实际文件名，如 `service-worker` 而非过时的 `background`

### 消息日志
```javascript
// 接收消息
console.log(`[service-worker] 收到消息: ${message.type} (来自${sender.tab?.id ? `标签页:${sender.tab.id}` : '扩展内部'})`);
// 输出: [service-worker] 收到消息: getRuntimeState (来自标签页:699429904)

// 处理成功
console.log(`[service-worker] ✓ ${message.type}:`, result);
// 输出: [service-worker] ✓ getRuntimeState: {translateActive: 'inactive'}

// 处理失败
console.error(`[service-worker] ✗ ${message.type}: ${error.message}`);
// 输出: [service-worker] ✗ toggleTranslate: 非法状态转换
```

### 状态变更日志
```javascript
console.log(`[runtime-state-manager] 状态变更: ${key} [${oldValue} → ${newValue}]`);
// 输出: [runtime-state-manager] 状态变更: translateActive [inactive → pending]
```

### 组件通信日志
```javascript
console.log(`[content-script] → service-worker: ${message.type}`);
console.log(`[service-worker] → content-script: ${response.type}`);
```

### 重要操作日志
```javascript
console.log(`[service-worker] 处理翻译请求: videoId=${videoId}`);
console.log(`[translation-cache-manager] 缓存命中: 42条字幕`);
```

### 日志原则
- **避免重复：** 同一个消息只记录一次，避免在多个处理层重复输出
- **使用中文说明：** 用"收到消息"代替符号，增强可读性
- **使用符号：** `→` 表示发送，`✓` 表示成功，`✗` 表示失败
- **包含关键信息：** 消息类型、来源、关键参数值
- **简洁清晰：** 信息完整但不冗余，便于grep搜索和分析
- **敏感信息：** 不记录API密钥、用户隐私数据等敏感信息
- **性能优化：** 对于可能重复触发的事件（如tabs.onUpdated），添加适当的条件判断避免重复执行

### 日志优化规范（2025.08更新）

#### 1. 避免前后确认型冗余
```javascript
// ❌ 不好的做法
console.log(`[storage-manager] 准备设置存储键 ${key} 到 ${area} 区域:`, value);
await storage.set({ [key]: value });
console.log(`[storage-manager] ✅ 成功设置存储键 ${key} 到 ${area} 区域`);

// ✅ 推荐做法 - 只在操作完成后输出一条
await storage.set({ [key]: value });
console.log(`[storage-manager] ✅ ${key} → ${area}:`, value);
```

#### 2. 避免操作链路型冗余
```javascript
// ❌ 不好的做法 - 每个环节都打印
await runtimeStateManager.setPopupState(true);  // 内部打印: 状态变更日志
console.log('[service-worker] ✓ popupOpened: 状态已更新');
console.log('[service-worker] ✓ Popup已打开');
return { success: true, status: 'opened' };  // 外部再打印响应

// ✅ 推荐做法 - 合并相关操作日志
await runtimeStateManager.setPopupState(true);  // 内部打印一条状态变更
// 外部通用响应日志自动处理，无需重复
```

#### 3. 简化中间层日志
```javascript
// ❌ 不好的做法 - 每层都详细输出
[video-source-cache] ✓ 缓存命中[Local/VideoSourceLanguageData]: XJ6JhB8wOPU, 6个轨道
[service-worker] ✓ 缓存命中[Local Storage]: 6个轨道

// ✅ 推荐做法 - 中间层静默或注释，只在最终层输出
// [video-source-cache] 内部日志注释掉
[service-worker] ✓ 缓存命中[Local Storage]: 6个轨道
```

#### 4. 智能响应日志
```javascript
// 对于简单成功响应，只输出状态
if (response && response.success === true && response.status) {
  console.log(`[service-worker] ✓ ${message.type}: ${response.status}`);
} else {
  console.log(`[service-worker] ✓ ${message.type}:`, response);
}
```

#### 5. 单行数据展示
```javascript
// ❌ 不好的做法 - 数据分行显示
console.log('[runtime-state-manager] ✓ 保存到session:');
console.log(storageData);

// ✅ 推荐做法 - 数据内联显示
console.log(`[runtime-state-manager] ✓ 保存到session:`, storageData);
```

## 常见问题和解决方案

### 问题1：tabs.onUpdated重复触发
**原因：** Chrome在页面加载过程中多次触发该事件  
**解决：** 添加 `info.url && info.status === 'complete'` 检查

### 问题2：消息重复打印
**原因：** 多个处理层都打印了相同消息  
**解决：** 统一在消息入口处打印，其他地方删除

### 问题3：布尔值迁移到枚举
**原因：** 旧代码使用布尔值，新架构使用枚举  
**解决：** 实现数据迁移逻辑，自动转换

### 问题4：方法名不匹配
**原因：** 重构过程中方法名变更  
**解决：** 统一使用新方法名，如 getUserPreferences

## 开发指南

### 如何添加新的消息类型
1. 在 `shared/types/messages.ts` 定义消息类型
2. 在 `service-worker.ts` 的 `routeMessage` 添加处理
3. 在发送端使用 `chrome.runtime.sendMessage`

### 如何处理状态变更
1. 运行时状态：使用 `RuntimeStateManager`
2. 用户偏好：使用 `UserPreferencesManager`
3. 记得处理异步和错误情况

### 如何使用缓存系统
1. 翻译缓存：使用 `TranslationCacheManager`
2. 遵循缓存键规则：`videoId + sourceLang + targetLang + service`
3. 先查缓存，miss时才调用API

### 翻译开关执行流程（优化版 2025.09）
点击翻译按钮后的完整执行流程：

1. **用户点击** → ControlPanel发送`toggleTranslate`消息
2. **状态转换** → Service Worker设置PENDING状态（5秒超时保护）
3. **获取偏好** → 从UserPreferencersManager获取用户设置
4. **获取字幕** → 优先从缓存，否则从YouTube
5. **API控制** → 五个子步骤：
   - 5.1: 通过Player API获取轨道列表（ISO 639-1）
   - 5.2: 智能选择源语言（用户历史/英语优先/手动优先）
   - 5.3: 通过API设置字幕语言
   - 5.4: 异步缓存轨道信息
   - 5.5: API失败时降级到拦截器
6. **执行翻译** → 优化的渐进式批量翻译：
   - 6.1: 紧急翻译 - 当前位置5-10条立即翻译（300ms内显示）
   - 6.2: 顺序批量 - 剩余字幕30-50条分批，智能断句
   - 6.3: 使用Unicode私有区域字符（`\uE000-\uF8FF`）作为分隔符
   - 6.4: 每批完成后立即更新显示（渐进式）
7. **保存缓存** → 两层缓存架构，全部完成后才存储
8. **状态更新** → 成功设PENDING→ACTIVE，失败设PENDING→INACTIVE
9. **显示字幕** → 实时同步双语字幕
10. **错误处理** → 超时回退、智能降级、用户提示

**翻译流程优化重点**（2025.09）：
- 修复分隔符bug：弃用`\n---SEPARATOR---\n`，改用Unicode私有区域
- 智能断句：检测句子结束标点、时间间隔、大写开头
- 顺序批量：避免并行请求导致API限流（200ms间隔）
- 延迟存储：减少IO操作，提升性能

**批量翻译架构设计v2**（2025.09）：
- 时间间隔断句：取代复杂的语言规则，使用自然的时间间隔
- 动态阈值优化：自适应不同视频节奏
- 两阶段翻译：紧急41条+完整40条批次
- 简化实现：从1000行规则简化到200行核心代码
- 详见：[批量翻译架构文档](docs/architecture/07-batch-translation-architecture.md)

### Popup数据获取流程
点击翻译设置按钮后的数据获取流程：

1. **用户偏好设置** - 直接从`chrome.storage.local`读取
   - 键：`user_preferences`
   - 内容：targetLang, subtitleMode, translationService

2. **视频上下文** - 通过消息向Background获取
   - 消息：`{type: 'getPopupInitData'}`
   - 返回：videoId, tabId, isYouTube

3. **源语言列表** - 两层缓存机制
   - L1缓存：`chrome.storage.local.get('video_source_${videoId}')`
   - L2获取：`{type: 'getVideoTrackData'}` → Content Script → YouTube API
   
4. **初始化顺序**
   - 步骤1：初始化DOM元素
   - 步骤2：并行获取三类数据（Promise.all）
   - 步骤3：渲染UI组件
   - 步骤4：设置事件监听器

### 如何调试
1. 查看Service Worker控制台：chrome://extensions → 查看视图
2. 查看Content Script控制台：F12 在YouTube页面
3. 使用日志格式规范输出调试信息

## 测试和验证

### 功能测试
1. **翻译功能**：在YouTube视频页面点击翻译按钮
2. **缓存验证**：重复翻译相同视频，检查是否命中缓存
3. **状态同步**：切换标签页，检查状态是否正确

### 性能测试
1. 检查消息是否重复发送
2. 监控缓存命中率
3. 检查内存使用情况

## 开发注意事项

### ⚠️ 重要提醒
1. **不要修改 `/legacy` 目录** - 这是旧代码，仅供参考
2. **主要开发在 `/src` 目录** - 所有新功能和修复都在这里
3. **查看 `/docs/new/architecture5.md`** - 了解最新架构设计
4. **遵循日志格式规范** - 保持日志一致性
5. **测试状态迁移** - 确保旧数据能正确迁移

### 性能优化建议
1. 使用缓存优先策略
2. 避免重复的API调用
3. 合理使用Promise.all并发
4. 注意内存泄漏问题

## 联系和支持

如有问题，请查阅：
- 架构文档：`/docs/new/architecture5.md`
- 性能优化：`/docs/performance.md`
- 问题排查：`/docs/troubleshooting.md`
- 更新日志：`CHANGELOG.md`

---

*最后更新时间：2025年8月*  
*版本：v3.0.0*  
*架构：Manifest V3 + TypeScript*