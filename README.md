# YouTube 控制增强器 (暂定名)

## 简介

此 Chrome 扩展旨在通过向 YouTube 播放器界面注入自定义控件来增强用户体验。当前版本专注于在播放器左侧控制栏末尾（靠右对齐）添加翻译开关和设置按钮，并提供模拟 YouTube 原生风格的自定义提示框。

## 功能模块

*   **YouTube 播放器控件注入:**
    *   使用 Content Script 动态检测并定位 YouTube 播放器的左侧控制栏 (`.ytp-left-controls`)。
    *   在控制栏末尾注入一个包含自定义按钮的面板，通过 `marginLeft: 'auto'` 使其靠右对齐。
*   **自定义按钮:**
    *   **翻译开关按钮:** 显示当前翻译状态 (开/关)，点击可切换状态并更新图标。状态通过 `chrome.storage.sync` 持久化。
    *   **设置按钮:** 提供访问扩展设置的入口 (具体功能待实现)。
    *   按钮外观通过嵌套 `img` 元素实现 (SVG 边框 + SVG 图标)。
*   **自定义提示框:**
    *   移除了按钮的默认 HTML `title` 提示框。
    *   实现了自定义提示框，鼠标悬停在按钮上时显示，样式和行为模仿 YouTube 原生提示框。

*   **(未来功能):** (待添加，例如实际翻译逻辑、设置页面实现等)

## 技术栈

*   **Manifest Version:** 3
*   **核心语言:** TypeScript
*   **框架/库:** 无特定 UI 框架 (直接操作 DOM)
*   **构建工具:** Vite
*   **样式:** 内联样式 + 少量 CSS 类 (自定义提示框样式在 TS 中定义)
*   **类型定义:** `@types/chrome`, `@types/node`

## 页面结构

*   **Content Script:** 核心逻辑，注入并控制 YouTube 页面上的按钮。
*   **Background Service Worker:** (当前仅包含示例代码，未来可能用于处理后台任务)
*   **Popup:** (已创建 `popup.html` 和 `popup.ts`，功能待实现)
*   **Options Page:** (已创建 `options.html` 和 `options.ts`，功能待实现)

## 数据流

1.  **Content Script 初始化:** 从 `chrome.storage.sync` 读取 `translateActive` 状态。
2.  **DOM 监听:** 使用 `MutationObserver` 监听 `document.body`，等待 `.ytp-left-controls` 出现。
3.  **控件注入:** 创建按钮面板和按钮 (包含 SVG 边框和图标)，根据初始状态设置翻译按钮图标，然后将面板注入到 `.ytp-left-controls`，并设置 `marginLeft: 'auto', marginRight: '8px'`。
4.  **翻译按钮点击:** 更新 `translateActive` 状态 -> 更新图标 `src` -> 将新状态写入 `chrome.storage.sync`。
5.  **按钮悬停 (mouseenter):** 调用 `showTooltip` 函数，显示包含按钮文本的自定义提示框。
6.  **按钮移出 (mouseleave):** 调用 `hideTooltip` 函数，隐藏自定义提示框。
7.  **设置按钮点击:** (当前仅输出日志，未来可能触发消息传递或页面跳转)。

## 依赖库

*   `vite`: 开发和构建工具。
*   `typescript`: 提供类型检查和现代 JavaScript 特性。
*   `@types/chrome`: Chrome 扩展 API 的 TypeScript 类型定义。
*   `@types/node`: Node.js API (例如 `path`) 的 TypeScript 类型定义 (用于 `vite.config.ts`)。
*   `vite-plugin-static-copy`: Vite 插件，用于在构建时复制 `manifest.json` 和 `icons` 等静态资源。

## 开发计划与进度

*   [x] 初始化项目结构 (manifest.json, 基本目录, npm init)
*   [x] 配置 TypeScript (`tsconfig.json`) 和 Vite (`vite.config.ts`)
*   [x] 配置 Vite 静态资源复制 (`vite-plugin-static-copy`)
*   [x] 实现核心功能: YouTube 播放器按钮注入 (Content Script, 翻译/设置按钮基础)
*   [x] 实现自定义提示框并移除默认提示框
*   [x] 调整注入面板布局 (靠右对齐)
*   [ ] 实现设置按钮功能 (例如，打开 Options 页面)
*   [ ] 实现翻译按钮的实际翻译逻辑
*   [ ] UI 开发 (Popup)
*   [ ] UI 开发 (Options Page)
*   [ ] 添加键盘快捷键支持
*   [ ] 测试与打包
*   [ ] 发布

## 如何开发

(保持不变)

## 关键变更记录

*   **YYYY-MM-DD:** 初始化项目，选择 Vite + TypeScript 技术栈。
*   **YYYY-MM-DD:** 配置 `vite.config.ts` 以支持多入口构建 (Popup, Options, Service Worker, Content Script)。
*   **YYYY-MM-DD:** 引入 `vite-plugin-static-copy` 解决 `manifest.json` 和 `icons` 未复制到构建目录的问题。
*   **YYYY-MM-DD:** 修正 `manifest.json` 中的脚本路径，使其指向 Vite 构建后的 `.js` 文件而不是原始 `.ts` 文件。
*   **YYYY-MM-DD:** 实现 Content Script 将自定义按钮注入 YouTube 播放器控制栏，并使用 `chrome.storage` 同步翻译按钮状态。
*   **YYYY-MM-DD:** 更新按钮边框实现，使用指定的 `normal-border.svg` 文件。
*   **YYYY-MM-DD:** 移除按钮默认 HTML 提示框，实现模拟 YouTube 风格的自定义提示框系统。
*   **YYYY-MM-DD:** 调整注入控制面板的 CSS，使用 `marginLeft: auto` 使其在左侧控制栏靠右显示。 