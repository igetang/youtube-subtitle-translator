# YouTube字幕翻译Chrome扩展 - 项目知识库

## 🚀 快速开始（新会话必读）

### 第一件事
1. **先读 PROJECT_CONTEXT.md** - 了解当前进度和正在解决的问题
2. **查看最近提交** - `git log --oneline -10` 了解最近改动
3. **检查当前分支** - `git status` 确认工作状态

### 📸 截图目录
- **截图保存位置**: `/picture` 目录
- **用途**: 保存开发过程中的沟通截图、bug截图、效果展示等
- **访问方式**: 项目根目录下的 `picture` 文件夹

### 你的角色
你是一位专业的 Chrome 扩展程序开发专家，精通 JavaScript/TypeScript、浏览器扩展程序 API 和 Web 开发。
对于我给你的指令和问题，以你资深开发专家的判断，如果有不合理和疑问，请你先结合项目说明文档和代码进行确认，如果还有疑问，先向我提出，确认后，你再继续执行任务。

## 🤝 对话规范（重要！必须严格遵守）

### 1. 对话风格要求
- **幽默直白**：像朋友/同事聊天一样，可以开玩笑、吐槽
- **带有互动感**：主动干预并指出问题和错误
- **真实表达**：发现问题直接说"这里不对"、"这样不行"

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

### 4. 代码修改自检原则（重要！）
- **每次修改代码完成后，必须自己核查一遍**
- **检查内容**：逻辑错误、边界条件、潜在bug、变量引用等
- **发现问题主动修复**：如果发现问题，主动继续修改直到正确
- **避免低级错误**：如变量未定义、逻辑不完整、边界处理遗漏等

### 示例对话风格
❌ 错误："好的，我将为您实现这个功能..."
✅ 正确："哦，你是想加个翻译按钮？等等，放在哪儿？"

## 项目概述

### 基本信息
- **项目名称：** YouTube字幕翻译Chrome扩展
- **版本：** v3.0.0（新架构）
- **架构：** Chrome Extension Manifest V3 + TypeScript
- **核心功能：** 实时字幕翻译、多翻译服务支持、智能缓存、状态管理

## 项目目录结构

```
/src/                        # 【新架构代码】主要开发目录
├── background/             # Service Worker（原Background Script）
│   ├── service-worker.ts  # 核心后台服务，消息处理中心
│   ├── handle-toggle-translate-v4.ts  # V4翻译主流程
│   └── components/         # 后台组件
│       ├── two-phase-translator-v4.ts  # 两阶段翻译器
│       ├── batch-processor.ts          # 批处理器
│       └── openai-translator.ts        # OpenAI翻译器
├── content-scripts/        # 内容脚本
│   ├── content-script.ts           # 主内容脚本
│   ├── content-script-coordinator.ts # 状态协调器
│   └── subtitle-overlay.ts         # 字幕覆盖层
├── popup/                  # Popup弹窗（当前方案）
│   ├── popup.html         
│   └── popup.ts           
├── shared/                # 共享模块
│   ├── types/             # TypeScript类型定义
│   ├── storage/           # 存储管理器
│   ├── messages/          # 消息系统
│   └── components/        # UI组件

/docs/                      # 项目文档
├── architecture/           # 架构设计文档（核心技术文档）
│   ├── 01-design-principles.md               # 技术架构与设计原则
│   ├── 02-core-implementation.md             # 数据结构与详细实现
│   ├── 03-component-design.md                # 存储与缓存架构
│   ├── 04-message-system.md                  # 消息系统架构
│   ├── 05-performance-optimization.md        # 性能优化策略
│   ├── 06-simplified-popup-architecture.md   # 简化的Popup架构设计
│   ├── 07-batch-translation-architecture.md  # 批量翻译架构（时间间隔断句）
│   └── 08-abort-timeout-architecture.md      # AbortController超时架构v4.0
└── troubleshooting.md      # 问题排查

/legacy/                    # 【旧架构代码】已废弃，仅供参考
/dist/                      # 【构建输出】编译后的文件

PROJECT_CONTEXT.md          # 当前状态快照（必读）
CLAUDE.md                   # 本文件
manifest.json               # Chrome扩展清单文件（Manifest V3）
```

### 重要目录说明
- **`/src`** - ⚠️ 当前正在使用的新架构代码，所有开发都在这里进行
- **`/legacy`** - ❌ 旧架构代码，不要修改，仅供参考对比
- **`PROJECT_CONTEXT.md`** - 📖 记录当前进度、bug、任务的动态文档

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
  PENDING = 'pending',         // 翻译执行中（5秒超时保护）
  ACTIVE = 'active'            // 翻译激活（有字幕并显示翻译）
}
```

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
- **VideoSourceLanguageData** - 视频源语言数据（local存储）
- **TranslationCacheData** - 翻译缓存（local存储）

#### 4. 消息通信
- **MessageBus** - 统一消息总线
- **消息格式** - 使用 `type` 字段，废弃 `action`
- **通信流** - Content Script ↔ Service Worker ↔ Popup

#### 5. YouTube Player API集成
- **SubtitleAPIController** - 直接控制YouTube字幕
- **ISO 639-1标准** - 使用国际标准语言代码
- **智能降级** - API失败时自动回退到拦截器方案

## 架构文档索引

### 核心架构文档说明（必读）

项目包含8个核心架构设计文档，覆盖从设计原则到具体实现的各个方面：

#### 1. **01-design-principles.md** - 技术架构与设计原则
- 整体架构设计理念
- Chrome Extension Manifest V3架构
- 核心设计原则和约束条件
- 技术选型决策

#### 2. **02-core-implementation.md** - 数据结构与详细实现
- 核心数据结构定义
- 状态管理机制
- 关键算法实现
- 详细的代码实现方案

#### 3. **03-component-design.md** - 存储与缓存架构
- 三层存储架构（Memory/Session/Local）
- 缓存策略设计
- 数据持久化方案
- 存储容量优化

#### 4. **04-message-system.md** - 消息系统架构
- Chrome Extension消息通信机制
- MessageBus统一消息总线
- 消息类型定义和路由
- Content Script与Service Worker通信

#### 5. **05-performance-optimization.md** - 性能优化策略
- 性能瓶颈分析
- 优化策略和技术方案
- 内存管理和防泄漏
- API调用优化

#### 6. **06-simplified-popup-architecture.md** - 简化的Popup架构设计
- Popup方案选择理由
- 简化的UI交互设计
- 状态同步机制
- 用户体验优化

#### 7. **07-batch-translation-architecture.md** - 批量翻译架构（⭐当前生产方案）
- 时间间隔断句算法（v2.1，生产环境）
- 两阶段并行翻译机制
- 智能分段策略
- 无重试架构设计（v3.0）
- 看门狗机制演进历史

#### 8. **08-abort-timeout-architecture.md** - AbortController超时架构（🚧开发中）
- v4.0架构设计（基于AbortController）
- 真正的执行流中断机制
- 统一信号管理
- 精确超时控制
- 优雅降级策略

#### 9. **09-subtitle-data-format-architecture.md** - 字幕数据格式架构（⭐核心规范）
- 统一的字幕数据格式定义
- 各环节数据格式使用规范
- VTT格式与数组格式的使用边界
- 格式转换工具函数说明
- 性能与空间优化对比

### 架构演进路线图

```
v1.0 (已废弃) → v2.0 (SimpleWatchdog) → v3.0 (无重试/当前) → v4.0 (AbortController/开发中)
```

- **v1.0**: 基础实现，规则断句
- **v2.0**: SimpleWatchdog + 重试机制
- **v3.0**: 无重试 + Promise.race（当前生产版本）
- **v4.0**: AbortController架构（正在实现）

## 架构决策记录

### 关键技术决策

1. **为什么选择3状态系统？**
   - 简化状态管理复杂度
   - 提供更清晰的用户体验
   - 5秒超时保护防止卡死

2. **为什么使用缓存优先策略？**
   - 减少API调用，降低成本
   - 提升响应速度
   - 支持离线查看已翻译内容

3. **为什么选择Popup方案？**
   - 兼容性最好，所有Chrome版本支持
   - 更轻量，用户体验更好

4. **为什么用AbortController（V4架构）？**
   - SimpleWatchdog只能执行回调，无法中断执行流
   - AbortController可以真正取消Promise链
   - 支持用户手动取消和自动超时

## 代码规范

### 基本原则
- 使用 `type` 字段替代 `action` 字段进行消息通信
- 偏好 Promise.all 并发处理
- 重视性能优化和减少重复调用
- 简单优于复杂

### 日志格式规范
```javascript
// 基本格式
[组件名] 操作说明
[service-worker] 收到消息: toggleTranslate

// 使用符号
→ 发送  ✓ 成功  ✗ 失败

// 状态变更
[runtime-state-manager] 状态变更: translateActive [inactive → pending]
```

### 日志原则
- **避免重复：** 同一个消息只记录一次
- **使用中文说明：** 增强可读性
- **包含关键信息：** 消息类型、来源、关键参数值
- **简洁清晰：** 信息完整但不冗余

## 翻译开关执行流程（V4架构）

1. **用户点击** → ControlPanel发送`toggleTranslate`消息
2. **状态转换** → Service Worker设置PENDING状态（5秒超时保护）
3. **获取偏好** → 从UserPreferencersManager获取用户设置
4. **获取字幕** → 优先从缓存，否则从YouTube
5. **API控制** → 通过Player API控制字幕语言
6. **执行翻译** → 两阶段并行翻译：
   - 紧急翻译：前9后30共40条（5秒超时）
   - 批量翻译：全部字幕分批执行
7. **保存缓存** → 两层缓存架构
8. **状态更新** → 成功ACTIVE，失败INACTIVE
9. **显示字幕** → 实时同步双语字幕

### 批量翻译架构（v3.0）
- **时间间隔断句**：最大间隔>最小间隔+400ms才断句
- **两阶段并行**：紧急与批量同时开始
- **无重试架构**：Fail Fast原则，5秒内必有结果
- 详见：`/docs/architecture/07-batch-translation-architecture.md`

## 常见问题和解决方案

### 问题1：tabs.onUpdated重复触发
**解决：** 添加 `info.url && info.status === 'complete'` 检查

### 问题2：消息重复打印
**解决：** 统一在消息入口处打印

### 问题3：方法名不匹配
**解决：** 统一使用新方法名，如 getUserPreferences

## 开发指南

### 如何添加新的消息类型
1. 在 `shared/types/messages.ts` 定义消息类型
2. 在 `service-worker.ts` 的 `routeMessage` 添加处理
3. 在发送端使用 `chrome.runtime.sendMessage`

### 如何使用缓存系统
1. 翻译缓存：使用 `TranslationCacheManager`
2. 遵循缓存键规则：`videoId + sourceLang + targetLang + service`
3. 先查缓存，miss时才调用API

### 如何调试
1. Service Worker控制台：chrome://extensions → 查看视图
2. Content Script控制台：F12 在YouTube页面
3. 使用日志格式规范输出调试信息

## 开发注意事项

### ⚠️ 重要提醒
1. **不要修改 `/legacy` 目录** - 这是旧代码，仅供参考
2. **主要开发在 `/src` 目录** - 所有新功能和修复都在这里
3. **先读 PROJECT_CONTEXT.md** - 了解当前状态
4. **遵循对话规范** - 先确认再改代码
5. **测试状态迁移** - 确保旧数据能正确迁移

### 性能优化建议
1. 使用缓存优先策略
2. 避免重复的API调用
3. 合理使用Promise.all并发
4. 注意内存泄漏问题

## 联系和支持

如有问题，请查阅：
- 当前状态：`PROJECT_CONTEXT.md`
- 架构文档：`/docs/architecture/`
- 问题排查：`/docs/troubleshooting.md`
- 更新日志：`CHANGELOG.md`

---
*版本：v3.0.0 | 架构：V4 (AbortController) | 更新：2025-09*