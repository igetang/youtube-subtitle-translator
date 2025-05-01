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

*   **Content Script (`content/content-script.ts`):** 核心逻辑，注入并控制 YouTube 页面上的按钮，处理字幕显示，与 Background 和 Side Panel 通信，并注入和协调 Main World Script。
*   **Main World Script (`content/main-world.ts`):** 注入到 YouTube 页面主环境，负责调用页面级 API (`getPlayerResponse()`) 并通过 `postMessage` 将数据传回 Content Script。
*   **Background Service Worker (`background/background.ts`):** 管理 Side Panel 的动态启用/禁用，并响应来自 Content Script 的打开 Side Panel 请求。
*   **Side Panel (`sidepanel/`):** 设置界面 (HTML, CSS, TS)，负责显示和保存用户设置，并与 Content Script 通信获取可用字幕轨道。
*   **Popup:** (已创建 `popup.html` 和 `popup.ts`，功能待实现)
*   **Options Page:** (已创建 `options.html` 和 `options.ts`，功能待实现)

## 数据流

1.  **Content Script 初始化 (`initialize`):**
    *   从 `chrome.storage.sync` 读取 `translateActive` 状态。
    *   注入 Main World Script (`content/main-world.js`) 到页面。
    *   设置 `MutationObserver` 监听 DOM 变化，等待播放器控件加载。
    *   设置 `message` 监听器以接收来自 Main World Script 的响应。
    *   设置 `yt-navigate-finish` 监听器处理页面导航。
2.  **控件注入 (`injectControls` - 由 `MutationObserver` 触发):**
    *   找到播放器右侧控件 (`.ytp-right-controls`)。
    *   创建按钮面板和按钮（翻译、设置）。
    *   将面板注入到控件栏。
    *   创建字幕叠加层 (`subtitleOverlayElement`)。
3.  **获取字幕轨道信息 (首次点击按钮或 Side Panel 请求时触发 - `fetchAndProcessTracksInfo`):**
    *   Content Script 向 Main World Script 发送 `REQUEST_CAPTION_TRACKS` 消息 (`window.postMessage`)。
    *   Main World Script 监听到消息，调用 `getPlayerResponse()` 获取播放器数据。
    *   Main World Script 将 `captionTracks` 数组（或错误）通过 `CAPTION_TRACKS_RESPONSE` 消息 (`window.postMessage`) 发回。
    *   Content Script 监听到响应，解析 Promise，处理并缓存轨道信息 (`processedAvailableTracks`, `cachedCaptionTracks`)。
4.  **Side Panel 请求可用轨道:**
    *   Side Panel 打开时，向 Content Script 发送 `requestAvailableTracks` 消息 (`chrome.tabs.sendMessage`)。
    *   Content Script 收到消息，调用 `fetchAndProcessTracksInfo` (如果需要获取) 或直接返回缓存的 `processedAvailableTracks`。
    *   Side Panel 收到轨道列表并填充"源语言"下拉框。
5.  **翻译按钮点击:**
    *   更新 `translateActive` 状态和图标。
    *   保存状态到 `chrome.storage.sync`。
    *   如果开启翻译且轨道信息未获取，调用 `fetchAndProcessTracksInfo`。
    *   (待实现) 选择目标字幕轨道，调用 `fetchSubtitleData` 获取字幕内容。
    *   (待实现) 调用翻译 API。
    *   (当前) 启动/停止原始字幕显示循环 (`updateSubtitleLoop`/`stopSubtitleUpdates`)。
6.  **设置按钮点击:**
    *   确保轨道信息已获取 (`fetchAndProcessTracksInfo`)。
    *   向 Background Script 发送 `openSidePanel` 消息 (`chrome.runtime.sendMessage`)。
    *   Background Script 收到消息，调用 `chrome.sidePanel.open()`。
7.  **设置更改 (Side Panel):**
    *   用户在 Side Panel 中更改设置。
    *   Side Panel 将新设置保存到 `chrome.storage.sync`。
8.  **字幕显示 (`updateSubtitleLoop` -> `handleSubtitleUpdate`):**
    *   获取当前视频时间。
    *   在 `processedSubtitleEvents` (待实现获取和翻译逻辑后填充) 中查找匹配的字幕文本。
    *   更新 `subtitleOverlayElement` 的内容和可见性。
9.  **页面导航 (`yt-navigate-finish` 触发 `handleYoutubeNavigation`):**
    *   重置与视频相关的状态（轨道缓存、字幕数据、注入标志等）。
    *   `MutationObserver` 会在内容加载后再次触发 `injectControls`。

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
*   **YYYY-MM-DD:** **重构字幕轨道获取:** 引入主世界脚本 (`main-world.ts`) 通过 `getPlayerResponse()` 获取数据；Content Script (`content-script.ts`) 使用 `window.postMessage` 与主世界脚本通信，并通过 `Promise` 处理异步响应，替换了之前解析 `<script>` 标签的方法。
*   **YYYY-MM-DD:** **修复 Side Panel 打开权限错误:** 调整设置按钮点击逻辑，先**立即**发送 `openSidePanel` 消息给 Background Script，再**异步** (`then/catch`) 获取轨道信息，以保留用户手势上下文。
*   **YYYY-MM-DD:** **修复原生按钮消失问题:** 修改 `injectControls` 函数，移除包裹按钮的 `div` 容器，改为直接将两个 `<button>` 元素使用 `insertBefore` 注入到 `.ytp-right-controls` 容器的开头。
*   **YYYY-MM-DD:** **修复按钮垂直对齐:** 调整 `createControlButton` 函数，为按钮 `<button>` 重新添加 `display: inline-flex` 和 `align-items: center` 样式，同时移除其他可能冲突的内联样式，使其能被父容器正确对齐。 