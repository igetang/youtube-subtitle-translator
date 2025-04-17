# 开发文档 (DEVELOPMENT.md)

本文档记录了本项目在开发过程中的技术细节、设计决策和注意事项，旨在帮助开发者理解代码实现和项目架构。

## 架构概述

(简要描述项目的整体架构，例如各部分 (Content Script, Background, Popup, Options) 的职责和交互方式。)

*   **Content Script (`content/content-script.ts`):** 主要负责与 YouTube 页面的 DOM 交互，实现按钮的注入、状态管理和 UI 更新。通过 `MutationObserver` 动态监听播放器加载。
*   **Background Service Worker (`background/service-worker.ts`):** (当前功能较少) 未来可能用于处理需要长期运行或跨页面协调的任务，例如与外部 API 通信、管理复杂状态或监听浏览器级事件。
*   **Popup (`popup/popup.html`, `popup/popup.ts`):** (待实现) 提供快速操作入口或信息展示。
*   **Options Page (`options/options.html`, `options/options.ts`):** (待实现) 提供用户配置项。
*   **共享状态:** 当前主要通过 `chrome.storage.sync` 在 Content Script 和 Background Script (未来可能包括 Popup/Options) 之间共享简单的状态 (如 `translateActive`)。

## 关键实现细节

### YouTube 按钮注入与交互 (`content/content-script.ts`)

*   **目标选择器:** 使用 `.ytp-left-controls` 定位 YouTube 播放器左侧控制栏。
*   **动态注入:** 由于播放器是动态加载的，必须使用 `MutationObserver` 监听 DOM 变化，在目标元素出现后才执行注入，并设置标志位 (`controlsInjected`) 防止重复注入。
*   **面板布局:**
    *   包含两个按钮的 `div` 面板被注入到 `.ytp-left-controls`。
    *   通过设置 `panel.style.marginLeft = 'auto'` 使面板在左侧控制栏中靠右显示。
    *   通过设置 `panel.style.marginRight = '8px'` 确保与右侧元素有间距。
*   **按钮结构:**
    *   采用 `<button>` 元素作为容器和交互区域。
    *   内部嵌套两个 `<img>` 元素：
        *   一个用于显示 SVG 边框 (`icons/normal-border.svg`)。
        *   一个用于显示 SVG 图标 (`icons/off.svg`, `icons/on.svg`, etc.)。
    *   通过绝对定位将边框和图标居中叠加。
*   **图标资源:**
    *   所有图标 (SVG) 必须在 `manifest.json` 的 `web_accessible_resources` 中声明。
    *   在 Content Script 中使用 `chrome.runtime.getURL('icons/...')` 获取实际访问路径。
*   **状态同步 (翻译按钮):** 开关状态 (`translateActive`) 使用 `chrome.storage.sync.get` 读取初始值，并通过 `chrome.storage.sync.set` 在点击时更新。
*   **自定义提示框:**
    *   **移除默认提示:** 在 `createControlButton` 中不再设置 `button.title` 属性。
    *   **全局提示元素:** 使用 `ensureTooltipExists` 函数创建并管理一个全局唯一的 `div.ytp-tooltip` 元素 (`tooltipContainer`)，添加到 `document.body`。
    *   **样式模拟:** 通过内联 CSS 设置提示框样式 (背景色、字体、圆角、`z-index: 2300` 等) 以模仿 YouTube 原生外观。
    *   **显示逻辑 (`showTooltip`):**
        *   更新 `tooltipTextElement.textContent`。
        *   计算位置：获取目标按钮 `getBoundingClientRect`，计算提示框中心点使其与按钮中心对齐，并向上偏移 40px (`topY - 40`)。
        *   通过 `opacity` 过渡实现淡入效果。
    *   **隐藏逻辑 (`hideTooltip`):**
        *   通过 `opacity` 过渡实现淡出效果。
        *   使用 `setTimeout` 在动画结束后设置 `display: none`。
    *   **事件绑定:** 在 `createControlButton` 中为按钮添加 `mouseenter` (调用 `showTooltip`) 和 `mouseleave` (调用 `hideTooltip`) 事件监听器。

### 构建配置 (`vite.config.ts`)

*   **多入口:** 配置了多个 Rollup 输入点，分别对应 Popup HTML, Options HTML, Service Worker TS 和 Content Script TS。
*   **输出路径:** JS/TS 入口文件被编译到 `dist/src/` 目录下，并使用固定文件名 (无哈希)，以便 `manifest.json` 引用。
*   **静态资源:** 使用 `vite-plugin-static-copy` 插件将 `manifest.json` 和 `icons/` 目录完整复制到 `dist` 目录的根下。
*   **路径别名:** 配置了 `@` 别名，指向项目根目录。

## 开发注意事项

*   **重新加载扩展:** 修改代码后（尤其是在 `dev` 模式下），通常需要手动在 `chrome://extensions/` 页面点击"重新加载"按钮才能看到 Content Script 或 Service Worker 的更新。Popup 的更新有时会自动生效，有时也需要手动重载。
*   **调试:**
    *   **Content Script:** 在 YouTube 页面的开发者工具 Console 中查看日志和错误。
    *   **Service Worker:** 在 `chrome://extensions/` 页面点击扩展对应的"服务工作线程"链接打开专用调试窗口。
    *   **Popup:** 右键点击浏览器工具栏的扩展图标，选择"检查弹出式窗口"。
    *   **Options Page:** 直接在打开的选项页面使用开发者工具。
*   **Manifest 路径:** `manifest.json` 中引用的脚本和页面路径是相对于**扩展根目录**（即 `dist` 目录）的。 