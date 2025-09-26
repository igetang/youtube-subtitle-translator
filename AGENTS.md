# Repository Guidelines

## Session Checklist
- 打开 `PROJECT_CONTEXT.md` 了解最新迭代目标与阻塞，5 分钟内获取上下文。
- 运行 `git status`、`git log --oneline -5` 确认分支和提交风格，留意本地未提交变更。
- 确保有一个 `*.youtube.com` 标签页用于调试；扩展构建产物位于 `dist/`，通过 `chrome://extensions` 以未打包方式加载。

## Communication Protocol
1. **先复述**：以“让我确认一下，你是想…”重述需求与假设。
2. **再给方案**：列出可行做法、风险与所需信息，必要时提供选项。
3. **等待指示**：未经确认不落地代码改动或执行破坏性命令。
4. **执行后回报**：总结改动、自检结果，并说明未覆盖的测试面。

## Project Structure & Key Modules
- Manifest V3 Chrome 扩展，目标是翻译并覆盖 YouTube 字幕。
- `src/content-scripts/` 集成 DOM、渲染翻译 UI，并转发用户操作；`main-world.ts` 注入页面上下文，通过 `window.postMessage` 与 YouTube Player API 建立 `_requestId` 协议。
- `src/background/service-worker.ts` 单点路由 `ExtensionMessage`，驱动 `inactive → pending → active` 流程，串联翻译提供者与源语言缓存。
- 共享逻辑集中在 `src/shared/`（消息总线、存储、UI 组件、翻译策略）；构建修补脚本位于 `scripts/`，架构文档存放 `docs/`，调试截图在 `picture/`。

## Build, Test, and Debug Commands
- `npm install` 安装依赖；`package-lock.json` 更新后务必重新安装并对齐 `.nvmrc` Node 版本。
- `npm run dev` 并行监听主世界与内容脚本；使用 `npm run dev:main` 或 `npm run dev:content` 定向排查 postMessage 流量。
- `npm run build` 生成生产包并触发 `npm run fix:worker`；可用 `npm run build:content|mainworld|worker` 缩短反馈周期。
- `npx jest` 运行全部单测；指定路径（如 `npx jest src/content-scripts/test-content-script.ts`）聚焦回归，配合 `--watch` 快速验证。

## Coding Style & Naming
- TypeScript 处于 `strict` 模式：使用接口建模数据，避免 `any`，异步函数显式返回 `Promise` 并处理超时。
- 两空格缩进、单引号、允许尾随逗号；导入遵循 `@/*`、`@shared/*` 别名，导出集中在文件底部。
- 类名 PascalCase，函数/变量 camelCase，常量 UPPER_SNAKE_CASE；日志需描述触发条件，避免重复输出。

## Workflow & Testing Notes
- 翻译流程：内容脚本发送 `TOGGLE_TRANSLATE` → 后台切换 `translateActive`、获取字幕轨道并选择源语言 → 快速/批量翻译并缓存 → 通过 `STATE_CHANGED` 回传覆盖渲染，失败时回退为 inactive。
- 所有扩展消息必须通过 `src/shared/messages/message-bus.ts`，新增通道需登记并使用 `_requestId` 追踪响应。
- 测试使用 Jest + `ts-jest`，测试文件与实现同目录（如 `storage-test.ts`）；调用 `MessageBus.resetInstance()` 避免单例串扰，必要时启用假定时器模拟超时与重试。
- 调整后台或 Player API 时在真实 YouTube 页面手动演练 SPA 路由切换，结合 service worker 日志确认状态流转与缓存命中。

## Commit & Pull Request Checklist
- 提交信息使用 emoji + 祈使句（示例：`🔧 修复参数传递`），正文记录风险、降级策略与日志/遥测变更。
- PR 需包含：变更概览、验证步骤（参考 `TEST_CHECKLIST.md`）、相关文档链接（`docs/`、`PROJECT_CONTEXT.md`）、UI 变更截图或录屏，并明确未覆盖的测试项。
- 权限或后台行为更新时同步修改 `manifest.json`、`CHANGELOG.md`，并提醒评审关注缓存语义（`videoId + sourceLang + targetLang + provider`）。
