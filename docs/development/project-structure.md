# YouTube字幕翻译助手 - 项目结构文档

> **最后更新**: 2025-10-25（v4.0.0）

本文档概览当前仓库的目录布局，并说明各模块职责，便于新成员快速定位代码位置。

## 📁 目录概览

```
.
├── public/                      # 静态资源与扩展清单
│   ├── manifest.json            # Manifest V3 配置
│   ├── icons/                   # 扩展图标
│   └── _locales/                # 本地化文案（例如 zh_CN/messages.json）
├── src/                         # 主要源码
│   ├── background/              # Service Worker 与后台组件
│   │   ├── components/          # 翻译器、缓存、限流、Player API 控制器
│   │   ├── utils/               # 后台工具模块
│   │   ├── handle-toggle-translate-v4.ts
│   │   └── service-worker.ts
│   ├── content-scripts/         # 内容脚本
│   │   ├── content-script.ts    # 控制栏注入、消息桥接
│   │   ├── main-world.ts        # 与 YouTube Player API 交互
│   │   └── subtitle-overlay.ts  # 字幕覆盖层
│   ├── popup/                   # Popup UI 与逻辑
│   ├── options/                 # Options 页面（默认未启用）
│   └── shared/                  # 共享模块
│       ├── components/          # 共享 UI 控件/协调器
│       ├── messages/            # MessageBus、消息类型与处理器
│       ├── storage/             # RuntimeState、UserPreferences、缓存管理
│       ├── translation/         # 翻译调度与策略
│       ├── types/               # 类型定义
│       └── utils/               # 工具函数（语言处理、VTT 等）
├── docs/                        # 文档、归档与任务跟踪
├── scripts/                     # 帮助脚本（构建修补、调试工具）
├── debug/                       # 调试脚本与 Popup 预览
├── picture/                     # 调试截图、演示素材
├── dist/                        # `npm run build` 产物
└── 根级文档（如 `MCP_SETUP.md`、`PROJECT_CONTEXT.md` 等）
```

## 🌐 目录说明

### `public/`
- `manifest.json`：Chrome 扩展声明文件（Manifest V3）。
- `icons/`：扩展在不同尺寸下的图标。
- `_locales/`：本地化字符串，目前包含 `zh_CN/messages.json`。

### `src/background/`
- `service-worker.ts`：入口文件，负责消息路由、翻译状态管理。
- `handle-toggle-translate-v4.ts`：AbortController 会话驱动的翻译流程。
- `components/`：翻译器、限流器、缓存管理、播放器控制等后台组件。
- `utils/`：后台使用的工具函数。

### `src/content-scripts/`
- `content-script.ts`：注入控制栏、转发消息。
- `main-world.ts`：在页面主环境中与 YouTube Player API 交互。
- `subtitle-overlay.ts` 等：负责字幕覆盖与展示。

### `src/popup/` 与 `src/options/`
- Popup：主设置界面（默认加载），包含页面检测、服务配置和 UI 交互。
- Options：Chrome 扩展选项页（保留模板，按需启用）。

### `src/shared/`
- `components/`：共享 UI 控件、协调器。
- `messages/`：MessageBus 单例、消息类型与处理器。
- `storage/`：RuntimeState、UserPreferences、翻译缓存管理。
- `translation/`：翻译调度与策略实现。
- `types/`、`utils/`：类型定义与通用工具（语言处理、VTT 解析等）。

### 其他目录
- `scripts/`：构建后修补脚本或一次性任务脚本。
- `debug/`：浏览器控制台脚本、Popup UI 预览文件。
- `docs/`：架构 / 开发 / 指南文档，以及历史归档。
- `picture/`：调试截图、演示素材。
- `dist/`：生产构建输出。

> `tests/` 目录目前尚未启用。如需添加自动化测试，可在根目录创建并在本文档补充说明。

## 📌 开发提示

1. **依赖管理**：通过 `nvm use` 切换到 `.nvmrc` 指定的 Node 版本（22.12.0），再运行 `npm install` / `npm ci`。
2. **路径别名**：`src/shared` 已在 `tsconfig.json` / `vite.config.ts` 中配置别名（如 `@shared`），建议使用别名导入。
3. **目录职责**：在对应目录内新增模块时，请遵循单一职责原则，并同步更新本结构文档。
4. **历史代码**：旧的 SidePanel 代码已移到 `docs/archive/deprecated-sidepanel/`，仅作参考。
