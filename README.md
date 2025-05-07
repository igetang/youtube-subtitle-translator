# YT 字幕翻译 Chrome 扩展

## 项目目标

本扩展旨在为 YouTube 视频提供实时字幕翻译功能，允许用户选择可用的字幕轨道，并将其翻译（目前为直接显示所选字幕）显示在视频播放器上。

## 功能模块

*   **内容脚本 (`content/content-script.ts`)**: 主要逻辑实现的地方。
    *   使用 `injectControls` 和 `createControlButton` 向 YouTube 播放器右侧控件栏注入自定义按钮（翻译开关、设置）。
    *   通过 `injectMainWorldScript` 注入 Main World 脚本，并使用 `window.postMessage` 与之通信以获取原始字幕轨道信息 (`fetchAndProcessTracksInfo`)。
    *   获取 (`fetchSubtitleData`) 并处理 (`processAndStoreSubtitles`) 所选字幕轨道的字幕数据。
    *   在视频上叠加显示处理后的字幕 (`createSubtitleOverlay`, `updateSubtitleLoop`)。
    *   处理 YouTube 的页面导航 (`handleYoutubeNavigation`)，监听 `yt-navigate-finish` 事件，确保状态同步和 UI 清理（包括主动移除旧按钮）。
    *   提供工具提示 (Tooltip) 功能。
*   **Main World 脚本 (`content/main-world.ts`)**: 注入到页面主世界（通过 `web_accessible_resources` 配置），负责监听 Content Script 的请求，调用页面级 API (`document.getElementById('movie_player').getPlayerResponse()`) 获取字幕轨道信息，并通过 `window.postMessage` 将结果安全地传回 Content Script。
*   **背景脚本/Service Worker (`background/background.ts`)**: 
    *   监听 Content Script 的 `openSidePanel` 消息，调用 `chrome.sidePanel.open()` 打开侧边栏（需要用户手势上下文）。
    *   监听 Content Script 的 `youtubeNavigationFinished` 消息，并广播 `youtubeNavigationOccurred` 消息给所有上下文（尤其是 Side Panel），通知页面导航发生。
    *   使用 `chrome.tabs.onUpdated` 监听 YouTube 标签页加载完成事件，动态启用/禁用 Side Panel 并设置其路径。
*   **侧边栏 (`sidepanel/`)**: 使用 React 构建设置界面。
    *   初始化时及收到 `youtubeNavigationOccurred` 广播时，向 Content Script 发送 `requestAvailableTracks` 消息请求当前视频的可用轨道列表。
    *   填充并管理"源语言"等设置选项。
    *   监听用户设置更改，并通过 `chrome.storage.sync` 保存。
*   **图标 (`icons/`)**: 包含扩展所需的各种图标。
*   **Popup/Options**: (已创建基础文件，功能待实现)

## 技术栈

*   TypeScript
*   Manifest V3 (MV3)
*   React (用于 Sidepanel)
*   CSS / 内联样式
*   Web API (Fetch, DOMParser, postMessage, MutationObserver, requestAnimationFrame)
*   Chrome Extension APIs (runtime, storage, action, sidePanel, i18n, tabs, webNavigation - 虽然未使用，但曾考虑)
*   Vite (开发和构建工具，配置多入口构建)
*   `vite-plugin-static-copy` (用于复制 manifest 和 icons)

## 开发进度与关键节点

### 初期开发 (日期 TBC)

*   搭建项目基本结构 (Manifest V3, Vite, TS)。
*   实现内容脚本注入基本框架。
*   实现播放器按钮注入和 Tooltip。

### 字幕获取与显示 - 方式演进 (日期 TBC)

*   **尝试 V1 (失败)**: 最初尝试直接在 Content Script 中查找并解析包含 `ytInitialPlayerResponse` 的 `<script>` 标签。由于 YouTube 页面加载时机问题，此方法不稳定。
*   **参考与调研**: 分析了其他类似插件（如 Dualsub）的实现，注意到它们普遍采用注入 Main World 脚本调用 `getPlayerResponse()` API 的方式，并通过 `postMessage` 进行通信。部分插件还结合了 Polling 机制来检测变化。
*   **实现 V2 (当前方案)**: 决定采用注入 Main World 脚本 (`content/main-world.ts`) 的方式。
    *   Main World 脚本负责调用 `getPlayerResponse()`。
    *   Content Script 与 Main World Script 通过 `window.postMessage` 双向通信（请求轨道 `REQUEST_CAPTION_TRACKS`，响应轨道 `CAPTION_TRACKS_RESPONSE`，以及 Main World 就绪信号 `MAIN_WORLD_READY`）。
    *   Content Script 中 `fetchAndProcessTracksInfo` 函数被重构为基于 `Promise` 和 `postMessage` 的异步流程。
    *   配置 Vite 构建 `main-world.ts` 并通过 `web_accessible_resources` 使其可注入。
*   实现 `fetchSubtitleData` (下载原始字幕) 和 `processAndStoreSubtitles` (处理为内部格式)。
*   实现基于 `requestAnimationFrame` 的字幕叠加显示 (`createSubtitleOverlay`, `updateSubtitleLoop`, `handleSubtitleUpdate`)。
*   实现翻译开关按钮状态持久化 (`chrome.storage.sync`)。

### Side Panel 与通信 (日期 TBC)

*   选择并实现 Chrome Side Panel API 作为设置界面。
*   实现 Background Script 动态管理 Side Panel (基于 YouTube URL 启用/禁用)。
*   实现 Content Script 请求 Background Script 打开 Side Panel。
*   实现 Side Panel 请求 Content Script 获取当前视频的可用字幕轨道，并填充 UI。
*   实现**导航时 Side Panel 自动更新机制**: Content Script (`yt-navigate-finish`) -> Background Script (广播 `youtubeNavigationOccurred`) -> Side Panel (接收广播并重新请求轨道)。

### 导航与稳定性修复 (近期完成)

#### Bug 1：导航后字幕不自动启动

*   **现象**: 在视频 A 开启翻译后，切换到视频 B。虽然翻译按钮的图标因状态从 `chrome.storage` 读取而保持"开启"，但视频 B 不会自动显示字幕，需要手动关闭再开启一次。
*   **分析**: `handleYoutubeNavigation` 在导航时正确重置了内部状态，但缺少一个机制在新页面加载完成后，根据已激活的 `translateActive` 状态自动触发新字幕的获取和显示流程。
*   **解决过程**: 
    1.  将核心的翻译启动逻辑（查找 video -> 获取轨道 -> 获取字幕 -> 处理 -> 启动循环）封装到新的异步函数 `startTranslationProcess`。
    2.  修改 `injectControls` 函数，让它在成功注入按钮**之后**，检查当前的 `translateActive` 状态，如果为 `true`，则调用 `startTranslationProcess`。
    3.  (遇到障碍) 上述修改后问题依旧。控制台日志显示，早期版本遗留在 `MutationObserver` 中的、尝试直接重启字幕循环的代码仍在运行，干扰了新流程。
    4.  移除 `MutationObserver` 中的旧逻辑，明确其职责仅为在需要时调用 `injectControls`。
*   **最终方案**: 通过 `startTranslationProcess` 封装启动逻辑，并在 `injectControls` 成功后根据状态自动调用，同时清理 `MutationObserver` 的冗余逻辑。

#### Bug 2：导航时按钮重复注入

*   **现象**: 解决了 Bug 1 后，切换视频时字幕能自动启动了，但每次导航都会在播放器控件栏上添加一对新的翻译和设置按钮。
*   **分析**: 控制台日志显示 `MutationObserver` 在导航后短时间内可能多次触发 `injectControls`。YouTube 的 SPA 特性导致旧页面的 DOM 元素可能不会立即被完全移除。
*   **解决过程**: 
    1.  (失败尝试) 尝试简化 `injectControls` 开头的检查，仅依赖 `controlsInjected` 标志（该标志在 `handleYoutubeNavigation` 中被重置）。此方法失败，因为即使标志被重置，`injectControls` 调用时旧按钮可能仍在 DOM 中，导致重复注入。
    2.  (导致 Bug 3 复现) 恢复 `injectControls` 的双重检查（检查 `controlsInjected` 标志 **和** `getElementById` 查找按钮）。但这导致 Bug 1 复现，因为 `getElementById` 总能找到未被清理的旧按钮，使得 `injectControls` 跳过执行，无法调用 `startTranslationProcess`。
    3.  **(最终方案)** 认识到必须主动清理旧按钮。修改 `handleYoutubeNavigation` 函数，在重置 `controlsInjected` 标志**之前**，增加通过 `getElementById` 查找并调用 `.remove()` 来移除旧按钮的代码。同时，保持 `injectControls` 的双重检查作为最终保障。
*   **最终方案**: 在导航处理函数中主动移除旧按钮，并结合注入函数入口处的双重检查（状态标志+DOM检查），彻底解决了重复注入问题，同时保证了字幕的自动启动。

### 其他 Bug 修复 (近期完成)

*   **Side Panel 打开权限错误**: 修复了因 `await` 阻塞导致丢失用户手势上下文，无法调用 `chrome.sidePanel.open()` 的问题。调整为先发送消息再异步获取数据。
*   **原生按钮消失问题**: 修复了因注入自定义按钮时使用了额外 `div` 容器，干扰 YouTube 布局导致原生按钮消失的问题。改为直接注入 `<button>` 元素。
*   **按钮垂直对齐问题**: 修复了自定义按钮在控制栏中垂直位置偏低的问题。通过调整按钮 `<button>` 的 CSS (`display: inline-flex`, `align-items: center`) 并移除冲突样式解决。
*   **字幕容器样式匹配问题**: 解决了自定义字幕叠加层在宽度和换行行为上与YouTube原生字幕不一致的问题。采用双层结构（包装容器+内容容器）并精确匹配原生字幕样式（`max-width: 93%`、`white-space: pre-wrap`等），使字幕容器能够根据字幕内容长度自动伸缩。

### 最近完成的字幕模式功能优化

在实现"双语显示"与"仅目标语言显示"功能过程中，我们完成了以下优化：

1. **统一模式命名**：
   - 在整个代码库中统一使用 `bilingual` 和 `targetOnly` 作为模式名称
   - 确保侧边栏、内容脚本和存储中的命名一致性

2. **改进字幕渲染逻辑**：
   - 重构 `handleSubtitleUpdate` 函数使用全局变量而不是每次读取存储
   - 确保切换模式时字幕能立即更新显示
   - **优化字幕显示顺序**：调整为目标语言（用户理解的语言）在上，源语言在下的布局，提升阅读体验

3. **加强模式同步机制**：
   - 通过 Chrome 消息传递和存储变化监听实现双重同步
   - 确保模式变化在多个组件之间保持一致

4. **处理导航场景**：
   - 在页面导航后正确重新应用字幕模式
   - 保证用户在切换视频后保持设置的一致性

5. **优化初始化流程**：
   - 在适当的时机初始化字幕模式
   - 确保模式能在播放器UI加载后正确应用

这些优化确保了字幕模式设置能在YouTube视频导航和播放过程中保持一致，提升了用户体验。

### 字幕显示顺序优化详情

为提升用户观看体验，我们对双语字幕的显示顺序进行了重要优化：

#### 优化前后对比
- **优化前**：源语言（原视频语言）在上，目标语言（翻译后语言）在下
- **优化后**：目标语言（用户理解的语言）在上，源语言（原视频语言）在下

#### 优化理由
1. **认知流畅性**：将用户熟悉的语言放在上方，减少认知负担，让用户可以快速理解内容
2. **符合阅读习惯**：自上而下的阅读顺序意味着用户首先接触到的是最重要的信息
3. **专注度分配**：用户可以选择只阅读上方文本获取理解，或向下查看原文进行对比学习
4. **提高效率**：在快速观看时，减少眼球移动和认知切换的次数

#### 技术实现
优化通过修改`handleSubtitleUpdate`函数中的文本组合逻辑实现：
```typescript
// 优化前
textToShow = `${sourceText}\n${targetText}`;

// 优化后
textToShow = `${targetText}\n${sourceText}`;
```

#### 用户体验提升
- **即时理解**：首先阅读能理解的语言，不必先经过陌生语言的干扰
- **语言学习**：在理解内容后，可以参考下方原文进行语言学习
- **减少认知负担**：避免在不熟悉的语言和熟悉的语言之间来回切换注意力

这项改进虽然看似简单，但对整体用户体验有显著提升，特别是在快速浏览或需要同时理解内容与学习语言的场景中。

### 最近更新：字幕模式切换功能

已实现侧边栏中"双语显示"与"仅目标语言显示"模式切换与实际字幕呈现的同步：

1. **字幕模式实现原理**：
   - 使用全局变量 `currentSubtitleMode` 在内容脚本中跟踪当前模式
   - 通过 `chrome.storage.sync` 在侧边栏与内容脚本间同步模式设置
   - 实现了两种模式：`bilingual`（双语显示）和 `targetOnly`（仅目标语言）

2. **侧边栏交互**：
   - 用户可通过侧边栏中的切换开关选择字幕显示模式
   - `saveSettings` 函数将设置保存到存储并向内容脚本发送消息

3. **内容脚本处理**：
   - `applySubtitleMode` 函数根据指定模式更新文档类和全局状态
   - `handleSubtitleUpdate` 函数根据当前模式决定字幕文本的组合方式
   - 通过两种方式响应模式变化：
     - 监听来自侧边栏的 `subtitleModeUpdated` 消息
     - 监听 `chrome.storage.onChanged` 事件

4. **页面导航处理**：
   - 在页面导航后通过 `handleYoutubeNavigation` 函数重新应用字幕模式
   - 确保在导航到新视频时保持用户选择的字幕模式

5. **初始化流程**：
   - `initializeSubtitleMode` 函数在内容脚本加载时从存储读取初始模式
   - 在 `initialize` 函数的末尾调用，确保在播放器UI加载后应用字幕模式

### 代码架构和数据流

1.  **Content Script 初始化 (`initialize`):**
    *   从 `chrome.storage.sync` 读取 `translateActive` 状态。
    *   注入 Main World Script (`content/main-world.ts`) 到页面。
    *   设置 `MutationObserver` 监听 DOM 变化，等待播放器控件加载。
    *   设置 `message` 监听器以接收来自 Main World Script (`CAPTION_TRACKS_RESPONSE`, `MAIN_WORLD_READY`) 和 Background Script (`youtubeNavigationOccurred`) 的响应/广播。
    *   设置 `yt-navigate-finish` 监听器处理页面导航。
    *   调用 `initializeSubtitleMode` 初始化字幕模式。

2.  **字幕模式初始化和应用:**
    *   `initializeSubtitleMode` 从 `chrome.storage.sync` 读取 `subtitleMode` 设置。
    *   如果存在，调用 `applySubtitleMode` 应用该模式；如果不存在，默认使用 `bilingual` 模式。
    *   `applySubtitleMode` 设置 `currentSubtitleMode` 全局变量，并更新文档类以便CSS样式调整。
    *   如果翻译功能已激活，立即调用 `handleSubtitleUpdate` 更新当前字幕显示。

3.  **字幕显示处理 (`handleSubtitleUpdate`):**
    *   根据 `currentSubtitleMode` 全局变量决定如何组合源语言和目标语言字幕。
    *   `bilingual` 模式：如果源字幕和目标字幕不同，显示 `${sourceText}\n${targetText}`；否则显示可用的那一个。
    *   `targetOnly` 模式：优先显示目标语言字幕，如果不可用则回退到源语言字幕。

4.  **侧边栏设置保存 (`saveSettings` in sidepanel.ts):**
    *   根据切换开关状态设置 `subtitleMode`：开启时为 `bilingual`，关闭时为 `targetOnly`。
    *   将设置保存到 `chrome.storage.sync`。
    *   向当前标签页的内容脚本发送 `subtitleModeUpdated` 消息，包含新模式。

5.  **内容脚本响应模式变化:**
    *   监听 `chrome.runtime.onMessage`，处理 `subtitleModeUpdated` 消息。
    *   监听 `chrome.storage.onChanged`，监测 `subtitleMode` 变化。
    *   两种方式都会调用 `applySubtitleMode` 应用新模式。

6.  **导航时保持一致性:**
    *   `handleYoutubeNavigation` 在页面导航后重新应用当前字幕模式或初始化模式。
    *   确保用户在切换视频时保持选择的字幕显示偏好。

### 后续计划

## 依赖库

*   `vite`: 开发和构建工具。
*   `typescript`: 提供类型检查和现代 JavaScript 特性。
*   `@types/chrome`: Chrome 扩展 API 的 TypeScript 类型定义。
*   `@types/node`: Node.js API 的 TypeScript 类型定义 (用于 `vite.config.ts`)。
*   `@types/react`, `@types/react-dom`: React 类型定义 (用于 Sidepanel)。
*   `react`, `react-dom`: React 库 (用于 Sidepanel)。
*   `vite-plugin-static-copy`: Vite 插件，用于在构建时复制静态资源。

## 开发计划与进度

*   [x] 初始化项目结构 (manifest.json, 基本目录, npm init)
*   [x] 配置 TypeScript (`tsconfig.json`) 和 Vite (`vite.config.ts`)
*   [x] 配置 Vite 静态资源复制 (`vite-plugin-static-copy`)
*   [x] 实现核心功能: YouTube 播放器按钮注入 (Content Script, 翻译/设置按钮基础)
*   [x] 实现自定义提示框并移除默认提示框
*   [x] 调整注入面板布局 (靠右对齐 -> 改为注入到右侧控件)
*   [x] **实现字幕轨道信息获取 (演进: script 解析 -> Main World + postMessage)**
*   [x] 实现字幕数据显示 (叠加层和时间同步)
*   [x] 实现翻译按钮状态持久化 (`chrome.storage`)
*   [x] 实现 Side Panel 基本框架和打开逻辑
*   [x] 实现 Side Panel 获取并显示可用字幕轨道
*   [x] **修复 Side Panel 打开权限错误**
*   [x] **修复 原生按钮消失问题**
*   [x] **修复 按钮垂直对齐问题**
*   [x] **修复 Side Panel 导航后自动更新轨道列表**
*   [x] **修复 YouTube 页面导航后字幕不自动启动问题 (详细见"导航与稳定性修复"部分)**
*   [x] **修复 YouTube 页面导航时按钮重复注入问题 (详细见"导航与稳定性修复"部分)**
*   [x] **优化字幕容器样式，精确匹配YouTube原生字幕 (使用Flexbox布局+动态宽度)**
*   [x] **实现字幕显示模式切换功能 (双语/仅目标语言)**
*   [x] **优化字幕显示顺序 (目标语言在上，源语言在下)**
*   [x] **修复构建问题：删除文件末尾非法HTML标记**
*   [ ] 完善 Sidepanel 功能 (选择目标语言, 保存设置等)
*   [ ] 接入实际的翻译 API
*   [ ] UI 开发 (Popup)
*   [ ] UI 开发 (Options Page)
*   [ ] 添加键盘快捷键支持
*   [ ] 优化错误处理和日志
*   [ ] 添加测试 (单元/集成)
*   [ ] 国际化 (i18n)
*   [ ] 打包与发布

## 如何开发

1.  确保已安装 Node.js 和 npm/pnpm/yarn。
2.  克隆仓库。
3.  在项目根目录运行 `npm install` (或相应包管理器的安装命令) 安装依赖。
4.  运行 `npm run dev` (或相应命令) 启动 Vite 开发服务器。
5.  在 Chrome/Edge 中打开 `chrome://extensions/`。
6.  启用"开发者模式"。
7.  点击"加载已解压的扩展程序"，选择项目根目录下的 `dist` 文件夹。
8.  打开 YouTube 页面查看效果。修改代码后，Vite 会自动重新构建，通常只需在 `chrome://extensions/` 页面点击扩展的"重新加载"按钮即可看到更新。

## 关键变更记录

*   **YYYY-MM-DD:** 初始化项目，选择 Vite + TypeScript 技术栈。
*   **YYYY-MM-DD:** 配置 `vite.config.ts` 支持多入口构建。
*   **YYYY-MM-DD:** 引入 `vite-plugin-static-copy` 复制静态资源。
*   **YYYY-MM-DD:** 修正 `manifest.json` 脚本路径。
*   **YYYY-MM-DD:** 实现 Content Script 按钮注入和状态同步。
*   **YYYY-MM-DD:** 更新按钮边框实现。
*   **YYYY-MM-DD:** 实现自定义提示框。
*   **YYYY-MM-DD:** 调整注入控制按钮到右侧控件栏。
*   **YYYY-MM-DD:** **重构字幕轨道获取方式**: 从解析 `<script>` 标签改为注入 Main World Script 调用 `getPlayerResponse()` 并通过 `postMessage` 通信。
*   **YYYY-MM-DD:** 修复 Side Panel 打开权限错误 (保留用户手势)。
*   **YYYY-MM-DD:** 修复按钮注入导致原生按钮消失的问题 (移除额外 wrapper div)。
*   **YYYY-MM-DD:** 修复自定义按钮垂直对齐问题 (调整 CSS)。
*   **YYYY-MM-DD:** 实现 Side Panel 在 YouTube 导航后自动更新源语言列表 (通过 Background 广播)。
*   **YYYY-MM-DD:** **详细修复导航相关的稳定性问题** (字幕自动启动 & 按钮重复注入，涉及 `startTranslationProcess`, `handleYoutubeNavigation` 主动清理旧按钮, `injectControls` 双重检查)。
*   **YYYY-MM-DD:** **优化字幕容器样式** (采用双层结构与自动宽度计算，确保字幕容器行为与YouTube原生字幕一致)。
*   **2023-07-01:** 实现字幕显示模式切换功能（双语/仅目标语言）。
*   **2023-07-07:** 优化双语字幕显示顺序（目标语言在上，源语言在下），提升阅读体验。
*   **2023-07-07:** 修复构建问题：删除文件末尾非法HTML标记 