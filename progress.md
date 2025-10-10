# Project: YouTube字幕翻译Chrome扩展
_Last updated: 2025-10-10_

## Pinned（仅高置信"必须遵守"写入；受保护不可修订）
- 必须使用 2.5vw 作为字幕基础大小（与YouTube保持一致）
- 必须完全匹配YouTube原生字幕大小计算（播放器宽度 × 2.5%）

## Decisions（按时间顺序追加，历史不可改）
- 2025-09-25: 决定使用 2.5vw 作为字幕基础大小（理由：与YouTube原生字幕保持一致，测试R²=1.0）
- 2025-09-25: 最终选择 CSS变量 + clamp() 函数的实现方案（理由：优先使用CSS实现，减少JavaScript计算）
- 2025-09-25: 将采用 ResizeObserver 监听播放器大小变化（理由：响应式监听窗口变化）
- 2025-09-25: 确定字体大小公式为 font-size = 2.5vw * userScale（理由：保持与YouTube一致的缩放比例）
- 2025-09-25: 实现了响应式字幕组件（理由：SubtitleOverlay已集成2.5vw响应式方案）
- 2025-09-25: 移除用户手动缩放功能，采用纯自动响应式（理由：与YouTube原生完全一致，简化用户体验）
- 2025-09-25: 决定使用JavaScript预计算替代CSS calc()来解决精度问题（理由：消除CSS计算精度误差，实现完全一致匹配）
- 2025-09-25: 决定完全匹配YouTube设置，不设置任何最小字体限制（理由：即使是3.38px的极小字体也要保持与YouTube原生一致）
- 2025-10-07: 决定使用编号标记系统解决字幕翻译数量不匹配问题（理由：用户选择的方案，避免字幕丢失或错位）
- 2025-10-10: 启动全项目日志优化任务（理由：统一日志规范，使用console.log记录关键操作，console.debug记录详细步骤）

## TODO（权威待办清单）
- [P1][OPEN][#5] 测试编号方案是否解决22条字幕数量不匹配问题
- [P2][OPEN][#6] 如果仍有问题，考虑进一步减小批次大小
- [P2][OPEN][#4] 测试各种窗口大小下的效果
- [P2][OPEN][#8] 完成日志优化任务（详见：docs/tasks/log-optimization-progress.md）
  - 已完成：/src/background/、/src/background/components/、/src/background/utils/、/src/content-scripts/（23+文件）
  - 待完成：/src/popup/、/src/shared/（6个子目录，约27个文件）

## In Progress

## Done（最近完成的放前面）
- 2025-10-10: [#8-partial] 完成日志优化任务第一阶段（evidence：已优化4个主目录23+文件，service-worker.ts从146个log减至27个，新增128个debug）
- 2025-10-07: [#7] 实现了编号标记系统v4.1.0（evidence：openai-translator.ts第106行添加编号前缀，第179-190行去除编号，第184-187行编号验证）
- 2025-09-25: 成功修复了字幕大小精度问题（evidence：将CSS calc()替换为JavaScript预计算值，完全匹配YouTube原生字幕）
- 2025-09-25: 实现了预计算字体大小方案（evidence：在ResizeObserver中计算并设置--calculated-font-size和--calculated-font-size-small CSS变量）
- 2025-09-25: 更新了所有字幕HTML生成代码（evidence：替换calc()表达式为预计算CSS变量）
- 2025-09-25: 在初始化时设置默认预计算字体值（evidence：在findVideoPlayerAttempt和subtitle-overlay初始化中添加默认值设置）
- 2025-09-25: 简化SubtitleOverlay为纯自动响应式（evidence：移除userFontScale，保留2.5vw自动缩放）
- 2025-09-25: [#1] 实现了SubtitleOverlay响应式字幕功能（evidence：添加ResizeObserver监听、CSS变量控制、clamp()边界限制）
- 2025-09-25: 修复了duplicate destroy()方法TypeScript错误（evidence：删除旧方法，保留增强版本）
- 2025-09-25: 完成了YouTube字幕大小测试，确认2.5vw规律（evidence：测试数据显示R²=1.0完美拟合）
- 2025-09-25: 完成了响应式字幕架构设计文档（evidence：/docs/architecture/10-subtitle-responsive-design.md）
- 2025-09-25: 确定了实现方案和技术栈（evidence：CSS变量 + clamp()函数方案）

## Risks & Assumptions
- Assumption: YouTube不会改变其2.5vw的字幕缩放策略（Confidence: High）
- Risk: 极端窗口大小下可能出现字幕显示问题（Mitigation: 使用clamp()函数限制边界值）

## Notes（简要要点）
- 2025-10-10: 日志优化任务进行中，已完成约45%（4/10目录），详细进度见 docs/tasks/log-optimization-progress.md
- 2025-10-10: service-worker.ts优化完成：使用9批次自动替换 + 手动审查，从146个log减至27个关键操作日志
- 2025-10-07: 编号标记系统已实现，等待用户构建测试效果
- 2025-10-07: 技术细节：发送前添加[n]编号前缀，更新prompt强调编号对应，接收后去除编号还原纯文本
- 2025-09-25: 字幕大小精度问题已彻底解决，使用JavaScript预计算值替代CSS calc()
- 2025-09-25: 技术细节：字体大小 = 播放器宽度 × 2.5%（完全匹配YouTube原生公式）
- 2025-09-25: 响应式字幕架构已确定核心技术方案
- 2025-09-25: 优先级最高是更新SubtitleOverlay组件
- 2025-09-25: 采用纯自动响应式方案，无需用户手动调整

## Context Index（轻量索引）
- Archive: ./progress.archive.md（若存在）
- Log Optimization: ./docs/tasks/log-optimization-progress.md（日志优化任务详细进度）