# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# YouTube字幕翻译Chrome扩展 - 项目知识库

## 🚀 快速开始（新会话必读）

### 第一件事
1. **先读 PROJECT_CONTEXT.md** - 了解当前进度和正在解决的问题
2. **查看最近提交** - `git log --oneline -10` 了解最近改动
3. **检查当前分支** - `git status` 确认工作状态

### 📸 截图目录
- **截图保存位置**: `/picture` 目录
- **用途**: 保存开发过程中的沟通截图、bug截图、效果展示等

### 你的角色
你是一位专业的 Chrome 扩展程序开发专家，精通 JavaScript/TypeScript、浏览器扩展程序 API 和 Web 开发。
对于我给你的指令和问题，以你资深开发专家的判断，如果有不合理和疑问，请你先结合项目说明文档和代码进行确认，如果还有疑问，先向我提出，确认后，你再继续执行任务。

## 📝 项目记忆与进度管理

### 项目记忆规则
- **必须主动调用** progress-recorder agent 来记录重要决策、任务变更、完成事项等关键信息到 progress.md
- **自动触发条件**（检测到以下情况时立即自动触发 progress-recorder）：
  • 出现"决定使用/最终选择/将采用"等决策语言
  • 出现"必须/不能/要求"等约束语言
  • 出现"完成了/实现了/修复了"等完成标识
  • 出现"需要/应该/计划"等新任务
- **归档管理**：当 progress.md 的 Notes/Done 条目过多（>100条）影响阅读时，应归档到 progress.archive.md

### 指令集（前缀 "/"）
- **/record** - 使用 progress-recorder 执行增量合并任务
- **/archive** - 使用 progress-recorder 执行快照归档任务
- **/recap** - 阅读 progress.md，回顾项目当前状态（包括但不仅限于关键约束、待办事项、完成进度等）

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

## 📁 项目目录结构

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
│   ├── 08-abort-timeout-architecture.md      # AbortController超时架构v4.0
│   ├── 09-subtitle-data-format-architecture.md # 字幕数据格式架构
│   └── 10-asr-subtitle-selection-solution.md # ASR字幕轨道选择解决方案 ⭐
└── troubleshooting.md      # 问题排查

/legacy/                    # 【旧架构代码】已废弃，仅供参考
/dist/                      # 【构建输出】编译后的文件
/picture/                   # 【截图目录】保存开发过程截图

PROJECT_CONTEXT.md          # 当前状态快照（必读）
CLAUDE.md                   # 本文件
manifest.json               # Chrome扩展清单文件（Manifest V3）
```

## 🏗️ 技术架构

### 技术栈
- **前端：** TypeScript + Chrome Extension API
- **架构：** Manifest V3 + Service Worker
- **状态管理：** RuntimeStateManager + UserPreferencesManager
- **消息通信：** MessageBus（统一消息总线）
- **构建工具：** Vite + TypeScript Compiler

### 核心概念

#### 1. 翻译系统（3状态机制）
```typescript
enum TranslateActiveState {
  INACTIVE = 'inactive',      // 翻译关闭
  PENDING = 'pending',         // 翻译执行中（5秒超时保护）
  ACTIVE = 'active'            // 翻译激活（有字幕并显示翻译）
}
```

#### 2. 存储架构（三层分离）
- **RuntimeState** - 运行时状态（session存储、跨标签页共享）
- **UserPreferences** - 用户偏好（local存储、持久化）
- **VideoSourceLanguageData** - 视频源语言数据（local存储）
- **TranslationCacheData** - 翻译缓存（local存储）

#### 3. 翻译架构（V4 - AbortController）
- **两阶段并行翻译**：紧急翻译（前9后30）+ 批量翻译（全部）
- **时间间隔断句**：最大间隔>最小间隔+400ms才断句
- **无重试架构**：Fail Fast原则，5秒内必有结果
- **AbortController**：真正的执行流中断机制

## 🔨 开发命令

### 构建命令
```bash
npm run build          # 完整构建（包含所有模块）
npm run build:main     # 构建popup
npm run build:content  # 构建content script
npm run build:mainworld # 构建main world script
npm run build:worker   # 构建service worker
npm run dev           # 开发模式（监听文件变化）
npm run dev:main      # 监听popup变化
npm run dev:content   # 监听content script变化
```

### 调试方法
1. **Service Worker控制台**：chrome://extensions → 查看视图 → Service Worker
2. **Content Script控制台**：F12 在YouTube页面
3. **Popup控制台**：右键Popup → 检查

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

## 🔄 翻译开关执行流程（V4架构）

1. **用户点击** → ControlPanel发送`toggleTranslate`消息
2. **状态转换** → Service Worker设置PENDING状态（5秒超时保护）
3. **获取偏好** → 从UserPreferencersManager获取用户设置
4. **获取字幕** → 优先从缓存，否则从YouTube
5. **API控制** → 通过Player API控制字幕语言
6. **执行翻译** → 两阶段并行翻译
7. **保存缓存** → 两层缓存架构
8. **状态更新** → 成功ACTIVE，失败INACTIVE
9. **显示字幕** → 实时同步双语字幕

## 📋 核心架构文档

1. **01-design-principles.md** - 技术架构与设计原则
2. **02-core-implementation.md** - 数据结构与详细实现
3. **03-component-design.md** - 存储与缓存架构
4. **04-message-system.md** - 消息系统架构
5. **05-performance-optimization.md** - 性能优化策略
6. **06-simplified-popup-architecture.md** - 简化的Popup架构设计
7. **07-batch-translation-architecture.md** - 批量翻译架构（⭐当前生产方案）
8. **08-abort-timeout-architecture.md** - AbortController超时架构（🚧开发中）
9. **09-subtitle-data-format-architecture.md** - 字幕数据格式架构（⭐核心规范）
10. **10-asr-subtitle-selection-solution.md** - ASR字幕轨道选择解决方案（⭐重要发现）

## 🎯 代码规范

### 基本原则
- 使用 `type` 字段替代 `action` 字段进行消息通信
- 偏好 Promise.all 并发处理
- 重视性能优化和减少重复调用
- 简单优于复杂

### 开发注意事项
1. **不要修改 `/legacy` 目录** - 这是旧代码，仅供参考
2. **主要开发在 `/src` 目录** - 所有新功能和修复都在这里
3. **先读 PROJECT_CONTEXT.md** - 了解当前状态
4. **遵循对话规范** - 先确认再改代码
5. **测试状态迁移** - 确保旧数据能正确迁移

### 如何添加新的消息类型
1. 在 `shared/types/messages.ts` 定义消息类型
2. 在 `service-worker.ts` 的 `routeMessage` 添加处理
3. 在发送端使用 `chrome.runtime.sendMessage`

### 如何使用缓存系统
1. 翻译缓存：使用 `TranslationCacheManager`
2. 遵循缓存键规则：`videoId + sourceLang + targetLang + service`
3. 先查缓存，miss时才调用API

## 🐛 常见问题和解决方案

### 问题1：tabs.onUpdated重复触发
**解决：** 添加 `info.url && info.status === 'complete'` 检查

### 问题2：消息重复打印
**解决：** 统一在消息入口处打印

### 问题3：方法名不匹配
**解决：** 统一使用新方法名，如 getUserPreferences

### 问题4：Google翻译只翻译第一句
**解决：** 使用特殊分隔符 `|SEP|` 替代换行符

---
*版本：v3.0.0 | 架构：V4 (AbortController) | 更新：2025-09*