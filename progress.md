# Project: YouTube字幕翻译Chrome扩展
_Last updated: 2025-09-25_

## Pinned（仅高置信"必须遵守"写入；受保护不可修订）
- 必须使用 2.5vw 作为字幕基础大小（与YouTube保持一致）
- 严格要求用户缩放范围在 50%-200% 之间
- 必须设置字体大小边界：最小12px，最大48px

## Decisions（按时间顺序追加，历史不可改）
- 2025-09-25: 决定使用 2.5vw 作为字幕基础大小（理由：与YouTube原生字幕保持一致，测试R²=1.0）
- 2025-09-25: 最终选择 CSS变量 + clamp() 函数的实现方案（理由：优先使用CSS实现，减少JavaScript计算）
- 2025-09-25: 将采用 ResizeObserver 监听播放器大小变化（理由：响应式监听窗口变化）
- 2025-09-25: 确定字体大小公式为 font-size = 2.5vw * userScale（理由：保持与YouTube一致的缩放比例）

## TODO（权威待办清单）
- [P0][OPEN][#1] 更新 SubtitleOverlay 组件支持响应式（Context：/src/content-scripts/subtitle-overlay.ts）
- [P1][OPEN][#2] 添加用户缩放设置到Popup（Context：/src/popup/popup.ts）
- [P1][OPEN][#3] 实现 ResponsiveSubtitleManager 管理类（Context：/src/shared/components/）
- [P2][OPEN][#4] 测试各种窗口大小下的效果

## In Progress

## Done（最近完成的放前面）
- 2025-09-25: 完成了YouTube字幕大小测试，确认2.5vw规律（evidence：测试数据显示R²=1.0完美拟合）
- 2025-09-25: 完成了响应式字幕架构设计文档（evidence：/docs/architecture/10-subtitle-responsive-design.md）
- 2025-09-25: 确定了实现方案和技术栈（evidence：CSS变量 + clamp()函数方案）

## Risks & Assumptions
- Assumption: YouTube不会改变其2.5vw的字幕缩放策略（Confidence: High）
- Risk: 极端窗口大小下可能出现字幕显示问题（Mitigation: 使用clamp()函数限制边界值）

## Notes（简要要点）
- 2025-09-25: 响应式字幕架构已确定核心技术方案
- 2025-09-25: 优先级最高是更新SubtitleOverlay组件

## Context Index（轻量索引）
- Archive: ./progress.archive.md（若存在）