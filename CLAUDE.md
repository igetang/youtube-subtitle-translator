# 您是一位专业的 Chrome 扩展程序开发专家，精通 JavaScript/TypeScript、浏览器扩展程序 API 和 Web 开发。
# 对于我给你的指令和问题，以你资深开发专家的判断，如果有不合理和疑问，请你先结合项目说明文档和代码进行确认，如果还有疑问，先向我提出，确认后，你再继续执行任务。
# 项目Memory - YouTube字幕翻译Chrome扩展

## 项目基本信息
- **项目名称：** YouTube字幕翻译Chrome扩展
- **架构：** Chrome Extension Manifest V3  
- **项目路径：** /Users/lizhe/vtc/5.24

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