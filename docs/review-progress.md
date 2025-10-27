# 文档 / 归档梳理进度

> 目的：记录逐项审阅与清理的进度，便于阶段性中断后继续。

## 约定
- 按目录名称、文件名首字母顺序处理。
- 状态枚举：`✅ 已审阅`、`🕗 进行中`、`⏭️ 待开始`。
- 如发现问题，记录类型（冗余/冲突/过期/待确认）与后续动作。

## 根目录文档
| 文件 | 状态 | 备注 / 后续动作 |
| --- | --- | --- |
| `AGENTS.md` | ✅ 已审阅 | `.nvmrc` 已补充（Node 22.12.0）。内容其余部分与现状一致。|
| `CHANGELOG.md` | ✅ 已审阅 | 现已补充 v4.0.0（2025-10-07）条目，统一版本体系并指向 `docs/archive/`; Legacy 段保留历史摘要 |
| `CLAUDE.md` | ⏭️ 待开始 | 由 Claude Code 使用者维护，当前未调整 |
| `MCP_SETUP.md` | ✅ 已审阅 | 合并 Context7 / Spec Workflow 配置，标注为 VS Code + Claude Code 可选历史指南 |
| `DEBUG_MICROSOFT_OPTIMIZER.md` | ✅ 已审阅 | 内容已合并至微软翻译实现指南，文件删除 |
| `PROJECT_CONTEXT.md` | ✅ 已审阅 | 更新至 2025-10-25，持续作为会话快照使用；梳理计划同步记录 |
| `README.md` | ✅ 已审阅 | 已重写为 2025 架构概述与快速开始，链接至核心文档与进度表 |
| `TEST_CHECKLIST.md` | ✅ 已审阅 | 已确认内容过期并删除，后续需重新整理统一测试清单 |
| `TODO.md` | ✅ 已审阅 | 内容为已完成的监听器重构说明，已删除以免重复记录 |
| `progress.md` | ✅ 已审阅 | 保留为历史决策/待办清单（最后更新时间 2025-10-10）；后续可视情况迁移到新的进度管理方式 |
| `spec-source-language-realtime-change.md` | ✅ 已审阅 | 内容已与现状重复，独立文件删除，后续以实际实现与上下文记录为准 |

## 其它目录（待展开）
- `_locales/`：✅ 已审阅（仅 zh_CN/messages.json，包含语言名称映射，符合现状）
- `assets/`：✅ 已审阅（删除未使用的旧构建产物 `storage-manager.js(.map)`）
- `backup/`：⏭️ 待开始
- `debug/`：🕗 进行中（调试相关文档/脚本已集中至此目录，例如 `check-reference-subtitle-css.md` 等）
- `docs/`（含子目录）：🕗 进行中（`docs/README.md` 已修正指向；更新 `development/DEVELOPMENT.md`、`README.md`、`project-structure.md`、`naming-conventions.md`，归档 `analysis/deepseek-implementation-comparison.md` 至 `docs/archive/reports/`，并删除或归档 2025-08-21 的历史报告；`architecture/02`、`architecture/03` 已完成对齐；`architecture/04` 已完成差异盘点，待根据 V4 消息流重新撰写；下一步继续梳理 guides、tasks 等子目录）
- `docs/architecture/`：🕗 进行中
  - `01-design-principles.md` | ✅ 已审阅 | 与 V4 设计原则一致，无需改动
  - `02-core-implementation.md` | ✅ 已审阅 | 已重写为 V4 Popup + AbortController 流程
  - `03-component-design.md` | ✅ 已审阅 | 同步最新缓存/存储实现，删除过时 SidePanel 流程
  - `04-message-system.md` | 🕗 进行中 | 已核对与代码差异：Service Worker 仍用 `routeMessage`，MessageBus 需描述 SharedMessageSystem 初始化，翻译编排/限流章节待更新；暂缓改动，后续重写
- `picture/`：⏭️ 待开始
- `scripts/`：⏭️ 待开始
- `src/`：⏭️ 待开始
- 其余零散文件（如 `build-project.sh`、`install-node.sh` 等脚本）：🕗 进行中（`install-node.sh`、`build-project.sh` 均已改为读取 `.nvmrc`，后续视需要补充使用说明）

> 更新指引：完成某项审阅后，立即在本表中标记状态、补充发现及后续动作。
