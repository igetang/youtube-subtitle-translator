# 您是一位专业的 Chrome 扩展程序开发专家，精通 JavaScript/TypeScript、浏览器扩展程序 API 和 Web 开发。
# 对于我给你的指令和问题，以你资深开发专家的判断，如果有不合理和疑问，请你先结合项目说明文档和代码进行确认，如果还有疑问，先向我提出，确认后，你再继续执行任务。
# 项目Memory - YouTube字幕翻译Chrome扩展

## 项目基本信息
- **项目名称：** YouTube字幕翻译Chrome扩展
- **架构：** Chrome Extension Manifest V3  
- **代码路径：** \legacy 和 \backup 为旧架构代码路径
                \src 为新代码路径，但是重构时未清理旧代码，里面新旧代码有重复地方，还未完整迁移重构完成。
- **截图保存路径：** E:\picture\

## 技术栈
- TypeScript + Chrome Extension API + Service Worker
- Runtime State Manager 和 User Preferences Manager 进行状态管理
- 新架构的消息通信系统

## 架构重构状态
- **进行中：** EventBus → MessageBus 架构迁移
- **目标：** 统一消息通信机制，分离UserPreferences和RuntimeState管理
- **重点：** 消除重复调用，优化性能

## 代码规范和偏好
- 使用 `type` 字段替代 `action` 字段进行消息通信
- 偏好 Promise.all 并发处理
- 重视性能优化和减少重复调用
- 使用统一状态同步机制

## 关键组件
- **SharedMessageSystem：** 统一消息系统
- **ControlPanel：** 控制面板管理
- **UIManager：** 界面管理
- **content-script.ts：** 页面注入处理
- **service-worker.ts：** 后台逻辑处理

## 状态同步策略
- **fullStateSync：** 用于页面导航/刷新/标签切换场景
- **partialStateSync：** 用于按钮/sidepanel操作场景
- **原则：** 优先使用统一状态获取机制减少重复调用

## 设计原则（来自architecture.md）
- **简单优于复杂：** 避免过度设计，优先考虑简单可行方案
- **Chrome插件最佳实践：** Background Script作为状态中心，消息驱动而非事件驱动
- **场景化设计：** 根据使用场景选择全量同步vs单一状态同步
- **性能优先：** 最小网络请求，智能缓存，避免重复调用

## 最近完成的工作
- 修复 action → type 消息格式问题
- 优化 ui-manager.ts 中的重复状态调用
- 实现统一状态同步机制 (refreshAllStates)
- 减少 service worker 中的冗余消息调用
- 确定场景化状态管理策略：既支持全量获取又支持单一变量操作

## 当前优化方案
- **全量同步：** 页面刷新/导航/标签切换时使用 getAllState()
- **单一同步：** 按钮操作/sidepanel操作时使用 getSingleState(key)
- **无防重复限制：** 尊重用户每次操作，不设时间限制
- **Chrome规范合规：** 符合Manifest V3最佳实践，需后续加强错误处理和类型安全

## 日志格式规范
### 基本格式
- **组件前缀：** 使用 `[文件名]` 格式，不带扩展名和行号
  - 示例：`[service-worker]`, `[content-script]`, `[runtime-state-manager]`
  - 注意：使用实际文件名，如 `service-worker` 而非过时的 `background`

### 消息日志
```javascript
// 接收消息
console.log(`[service-worker] <- ${message.type} (Tab:${sender.tab?.id || '扩展'})`);
// 输出: [service-worker] <- getRuntimeState (Tab:699429904)

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
- **使用符号：** `<-` 表示接收，`→` 表示发送，`✓` 表示成功，`✗` 表示失败
- **包含关键信息：** 消息类型、来源、关键参数值
- **简洁清晰：** 信息完整但不冗余，便于grep搜索和分析
- **敏感信息：** 不记录API密钥、用户隐私数据等敏感信息