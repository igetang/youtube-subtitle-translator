# Chrome 扩展 · YouTube 字幕翻译助手

实时翻译 YouTube 字幕的 Manifest V3 扩展。当前架构基于 AbortController V4 流程，整合两阶段翻译（紧急覆盖 + 批量完全覆盖）及统一的消息/存储体系。

## ✨ 核心能力
- 播放器控制栏一键开启/关闭翻译，Popup 面板可调目标语言、字幕模式与翻译服务。
- 支持多种翻译提供者（Google 免费、微软、OpenAI、DeepSeek、Gemini、Qwen 等），内置缓存与服务降级策略。
- YouTube Player API + 字幕拦截双通道获取字幕，自动选择最优源语言，兼容多语言界面。
- 两阶段翻译：紧急字幕 300ms 触达，批量翻译完成后自动覆盖；失败路径具备用户提示与状态回退。

## 🚀 快速体验
1. 确认本地 Node 版本与 `.nvmrc` 一致（当前为 22.12.0）：  
   ```bash
   nvm use
   npm install
   ```
2. 开发模式（建议分别监听主世界与内容脚本）：  
   ```bash
   npm run dev:main      # 主世界 / Service Worker
   npm run dev:content   # 内容脚本
   ```
3. 将 `dist/` 作为未打包扩展加载：`chrome://extensions` → 开发者模式 → “加载已解压的扩展程序”。  
4. 打开任意 YouTube 视频，点击控制栏翻译按钮即可体验实时翻译。  

> ⚠️ 默认不执行 `npm run build`，除非需要手动产出调试包；构建脚本会自动包含主世界、内容脚本与 Service Worker。

## 📁 目录总览
```
src/
  background/             # Service Worker 与翻译主流程
  content-scripts/        # DOM 注入、字幕覆盖层、Main World 联动
  popup/                  # Popup 面板
  shared/                 # 消息总线、存储、类型、工具
docs/                     # 架构/开发/指南文档（详见 docs/README.md）
scripts/                  # 构建与修补脚本
picture/                  # 调试/演示截图
backup/, debug/           # 历史归档与调试资源（审阅中）
```

## 🧰 常用命令
```bash
npm run dev              # 并行监听主世界与内容脚本
npm run dev:main         # 仅监听主世界（Service Worker / main-world）
npm run dev:content      # 仅监听内容脚本
npm run build            # 产出 dist/（含自动修补 Service Worker）
npx jest                 # 执行全部单测
npx jest path/to/test    # 定向测试
```

## 🏗️ 当前架构亮点
- **消息系统**：统一 MessageBus（单例）负责跨进程通信，`src/shared/messages/**` 管理类型与处理器。
- **状态与存储**：`RuntimeStateManager`（session）、`UserPreferencesManager`、`TranslationCacheManager` 分层管理，缓存键包含 `videoId + sourceLang + sourceKind + targetLang + service`。
- **翻译流程**：`handle-toggle-translate-v4.ts` 结合 `AbortTimeoutManager` 控制阶段超时；`TwoPhaseTranslatorV4` 调度翻译服务并动态配置批量参数。
- **字幕管控**：Main World 中的 `SubtitleAPIController` 与 `SubtitleInterceptor` 协同，保证 Player API 与拦截模式互为兜底。
- **错误体验**：紧急失败发出警告但继续批量；任何批量失败显式提示并回退状态，同时清理前端字幕。

## 📚 文档导航
- **项目上下文**：`PROJECT_CONTEXT.md`（每日更新） · `CHANGELOG.md`
- **总览入口**：`docs/README.md`
- **核心架构**：`docs/architecture/`（建议按 README 顺序阅读）
- **翻译服务实现**：`docs/guides/*-translate-implementation.md`
- **开发流程**：`docs/development/README.md` 与 `DEVELOPMENT.md`
- **进度追踪**：`docs/review-progress.md`（当前文档梳理计划）

## 🤝 贡献说明
1. 了解最新上下文：阅读 `PROJECT_CONTEXT.md` 与最近提交。  
2. 需求/问题沟通：首次响应需复述需求 → 给出方案 → 待确认后再改动。  
3. 修改遵循现有架构：统一通过 MessageBus 通信，避免引入旧版 EventBus 或 SidePanel 方案。  
4. 编码风格：TypeScript `strict`、两空格缩进、单引号、命名遵循文档规范。  
5. 提交规范：`CHANGELOG.md` 与必要文档需同步更新；提交信息使用 emoji 祈使句（详见 `AGENTS.md`）。

---

- **项目快照**：`PROJECT_CONTEXT.md`（Last Update: 2025‑10‑25）  
- **详细版本历史**：参见 [`CHANGELOG.md`](CHANGELOG.md)  
