# YouTube 字幕翻译 Chrome 扩展 - 开发指南

本文档提供扩展项目的开发环境设置、工作流程和贡献指南，帮助开发者参与项目开发。

## 开发环境设置

### 前置要求

* Node.js (v14+)
* npm, yarn 或 pnpm
* Chrome浏览器（用于测试扩展）

### 项目获取与依赖安装

```bash
# 克隆仓库
git clone <repository-url>

# 进入项目目录
cd youtube-subtitle-translator

# 安装依赖
npm install
```

### 开发命令

```bash
# 开发模式构建（支持热重载）
npm run dev

# 生产模式构建
npm run build

# 代码检查
npm run lint
```

## 加载扩展进行测试

1. 运行 `npm run dev` 启动 Vite 开发服务器
2. 在 Chrome 地址栏输入：`chrome://extensions/`
3. 打开右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 目录
6. 访问任意 YouTube 视频页面进行测试
7. 每次修改代码后，点击扩展卡片上的"重新加载"按钮应用更改

## 项目结构

```
youtube-subtitle-translator/
├── background/               # 后台脚本
│   └── background.ts         # 服务工作者脚本
├── content/                  # 内容脚本
│   ├── content-script.ts     # 注入YouTube页面的主要脚本
│   └── main-world.ts         # 注入主世界的辅助脚本
├── sidepanel/                # 侧边栏
│   ├── sidepanel.html        # 侧边栏HTML
│   ├── sidepanel.css         # 侧边栏样式
│   └── sidepanel.ts          # 侧边栏脚本
├── icons/                    # 扩展图标
├── docs/                     # 文档
├── dist/                     # 构建输出目录
├── manifest.json             # 扩展清单文件
├── vite.config.ts            # Vite配置
├── package.json              # 项目依赖
└── tsconfig.json             # TypeScript配置
```

## 构建系统

项目使用 Vite 进行构建，配置了多入口点以生成所需的各个脚本：

```typescript
// vite.config.ts 主要配置
export default defineConfig(({ command, mode }) => {
  // 内容脚本配置 - 使用IIFE格式
  if (mode === 'content-script') {
    return mergeConfig(baseConfig, {
      build: {
        // ...内容脚本特定配置
        rollupOptions: {
          output: { format: 'iife' } // 使用IIFE格式
        }
      }
    });
  }
  
  // 默认配置 - 其他脚本使用ES模块
  return mergeConfig(baseConfig, {
    // ...ES模块脚本配置
  });
});
```

### 内容脚本特殊构建说明

由于Chrome扩展中内容脚本的特殊性，项目使用双重构建策略：

1. **为什么内容脚本需要特殊处理？**
   - 内容脚本直接注入到网页环境中，该环境可能不支持ES模块
   - 使用`import`语句会导致`Uncaught SyntaxError: Cannot use import statement outside a module`错误
   - 即使在manifest.json中设置`"type": "module"`也可能不完全兼容

2. **IIFE格式 vs ES模块格式**
   - 内容脚本使用IIFE（立即执行函数表达式）格式构建
   - 背景脚本和其他扩展部分使用ES模块格式
   - IIFE格式将所有代码和依赖打包在一个闭包中，避免使用`import`语句

3. **构建命令**
   - `npm run build:main` - 构建背景脚本、侧边栏等（ES模块格式）
   - `npm run build:content` - 构建内容脚本（IIFE格式）
   - `npm run build` - 依次执行上述两个命令

4. **注意事项**
   - 修改内容脚本后，必须重新运行构建命令
   - 不要在内容脚本中使用动态导入（`import()`）语法
   - 尽量避免内容脚本与其他脚本之间的复杂依赖关系

## 开发工作流

### 1. 功能开发流程

1. 从主分支创建新的功能分支：`feature/名称`
2. 实现功能并编写相关文档
3. 测试功能是否正常工作
4. 提交代码，遵循提交信息规范
5. 创建Pull Request，等待审核

### 2. Bug修复流程

1. 从主分支创建新的修复分支：`fix/问题名称`
2. 修复Bug并添加相关测试
3. 在本地验证修复是否有效
4. 提交代码，包含问题和解决方案的清晰描述
5. 创建Pull Request，等待审核

## 调试技巧

### Chrome DevTools调试

1. 在扩展卡片上点击"查看视图: 后台页面"打开Service Worker调试器
2. 在YouTube页面上打开开发者工具，在控制台中可以看到内容脚本日志
3. 使用"Elements"面板检查注入的UI元素
4. 使用"Network"面板监控API请求

### 常见调试方法

* 使用`console.log`和`console.error`输出调试信息
* 在关键位置添加断点，跟踪代码执行流程
* 使用Chrome的"存储"面板检查扩展的存储数据
* 查看扩展的错误日志：`chrome://extensions` -> 在扩展卡片上勾选"错误"

## 贡献指南

### 代码风格

* 使用TypeScript类型注解，确保类型安全
* 遵循功能模块化原则
* 使用异步/await处理异步操作
* 添加JSDoc注释说明函数用途和参数

### 提交要求

* 确保代码通过lint检查：`npm run lint`
* 编写清晰的提交信息，格式：`类型(范围): 描述`
  * 类型：feat, fix, docs, style, refactor, test, chore
  * 范围：影响的模块，如content, background, sidepanel
  * 描述：简明扼要的变更说明
* 保持提交内容小而集中，便于审核和回退

### 文档更新

* 代码变更需同步更新相关文档
* 新功能需添加用户文档和开发文档
* 遵循现有文档风格和组织结构

## 发布流程

### 发布前检查清单

- [ ] 确保所有功能正常工作
- [ ] 验证在不同YouTube视频上的兼容性
- [ ] 检查资源使用情况（内存、CPU）
- [ ] 确认错误处理机制正常
- [ ] 更新版本号和变更日志
- [ ] 准备Chrome Web Store说明和截图

### 打包与发布

1. 更新`manifest.json`中的版本号
2. 运行`npm run build`生成生产版本
3. 压缩`dist`目录为zip文件
4. 在Chrome Web Store开发者控制台上传新版本
5. 填写变更说明
6. 提交审核

## 参考资源

* [Chrome扩展开发文档](https://developer.chrome.com/docs/extensions/)
* [Manifest V3指南](https://developer.chrome.com/docs/extensions/mv3/intro/)
* [YouTube Player API参考](https://developers.google.com/youtube/iframe_api_reference)
* [TypeScript文档](https://www.typescriptlang.org/docs/)
* [Vite文档](https://vitejs.dev/guide/)

## 常见问题

### Q: 我的扩展无法获取字幕轨道，可能是什么原因？
A: 检查main-world.js是否正确注入，以及YouTube播放器API是否发生变化。可以在控制台中检查是否有相关错误信息。

### Q: 为什么我的翻译按钮在导航后消失了？
A: 导航处理是扩展的关键挑战之一。检查MutationObserver是否正常工作，以及导航后的重新注入逻辑是否执行。

### Q: 如何查看存储的翻译缓存数据？
A: 在Chrome扩展页面点击"查看视图: 后台页面"，然后在控制台中输入`chrome.storage.local.get(null, console.log)`查看所有本地存储数据。

## 核心数据流：侧边栏初始化

当用户打开扩展的侧边栏 (Side Panel) 时，会触发以下初始化数据流：

1.  **侧边栏 (`sidepanel.ts`) 启动**:
    *   当侧边栏的 DOM 内容加载完成后 (`DOMContentLoaded`)。
    *   它会通过 `chrome.tabs.query({ active: true, currentWindow: true })` 获取当前活动标签页的 `tabId` 和 `url`。
    *   如果 `url` 存在，它会调用 `extractVideoIdFromUrl(url)` (该函数来自 `src/storage/video-settings-cache.ts`) 来尝试提取 YouTube 页面的 `videoId`。
    *   `sidepanel.ts` 随后向后台脚本 (`background.ts`) 发送一条 `sidePanelOpened` 消息，该消息包含获取到的 `tabId` 和 `videoId` (如果 `videoId` 存在，否则为 `null`)。

2.  **后台脚本 (`background.ts`) 响应**:
    *   `background.ts` 监听 `sidePanelOpened` 消息。
    *   收到消息后，它会调用内部的 `initializeSidePanel(tabId, videoIdFromSidePanel)` 函数。
    *   **获取数据**: 
        *   使用 `StorageManager.getInstance().getBatch()` 从 `chrome.storage.local` 加载全局设置 (例如默认源语言、目标语言、API配置等)。
        *   **`videoId` 处理**: 优先使用从 `sidepanel.ts` 传递过来的 `videoIdFromSidePanel`。如果此 `videoId` 不存在，`background.ts` 会尝试通过传入的 `tabId` 调用 `chrome.tabs.get(tabId)` 获取标签页的 `url`，然后再次调用 `VideoSettingsCache.extractVideoId(tabUrl)` 来提取 `videoId`。
        *   如果最终获得了有效的 `currentVideoId`，则会调用 `VideoSettingsCache.getInstance().getVideoSettings(currentVideoId)` 来获取该视频的特定缓存设置。
        *   使用 `tabId` (通过 `chrome.tabs.sendMessage(tabId, { action: 'requestAvailableTracks' })`) 向当前标签页的内容脚本发送消息，请求该视频可用的字幕轨道列表。
    *   **数据整合与发送**: 
        *   `background.ts` 会合并全局设置和视频特定设置（视频特定设置具有较高优先级，但通常不覆盖账户相关的全局API密钥等）。
        *   最后，`background.ts` 将包含最终合并后的设置对象 (`combinedSettings`)、获取到的字幕轨道列表 (`availableTracks`)、实际使用的 `videoId` 以及 `tabId` 打包，通过 `chrome.runtime.sendMessage({ action: 'initializeSidePanelUI', data: { ... } })` 消息发送回侧边栏。

3.  **侧边栏 (`sidepanel.ts`) 更新UI**:
    *   `sidepanel.ts` 监听 `initializeSidePanelUI` 消息。
    *   收到数据后，它会使用提供的数据 (设置、轨道信息) 来渲染和更新侧边栏的用户界面元素 (如填充语言下拉列表、设置开关状态等)。
    *   此流程确保了侧边栏显示的是最新的、与当前视频和用户配置相关的正确信息。

4.  **页面内导航处理**:
    *   如果用户在已打开侧边栏的 YouTube 标签页内导航到新的视频页面，内容脚本会检测到此变化并通知后台脚本 (`youtubeNavigationFinished` 消息)。
    *   后台脚本再将此导航事件广播为 `youtubeNavigationOccurred` 消息。
    *   侧边栏接收到 `youtubeNavigationOccurred` 消息后，会重新从当前标签页的 `sender.tab.url` 提取 `videoId`，并再次向后台脚本发送 `sidePanelOpened` 消息 (包含新的 `videoId` 和 `tabId`)，从而触发上述数据加载和UI更新流程，以确保侧边栏内容与新视频同步。

这个集中的数据初始化流程，由 `background.ts` 主导，简化了侧边栏的逻辑，并确保了数据来源的一致性。

## 数据存储策略

为了确保扩展的性能、数据的持久性和安全性，本项目采用以下数据存储策略：

| 信息类型                     | 主要存储位置                                 | 管理方式/类                                     | 主要原因                                                                |
| :--------------------------- | :------------------------------------------- | :---------------------------------------------- | :---------------------------------------------------------------------- |
| **用户全局设置**             | `chrome.storage.local`                       | `StorageManager`                                | 持久性、全局性。用于存储默认源/目标语言、字幕模式、选择的翻译API等。          |
| **用户API密钥**              | `chrome.storage.local`                       | `StorageManager`                                | 持久性。用户提供的API密钥需长期保存。需注意`chrome.storage.local`本身未加密。 |
| **视频的特定设置**           | `chrome.storage.local` (通过缓存类管理)      | `VideoSettingsCache`                            | 持久性、特定性、缓存优化。例如，用户为特定视频选择的源/目标语言。             |
| **翻译后的字幕**             | `chrome.storage.local` (通过缓存类管理)      | `SubtitleCacheManager` (或类似字幕缓存管理类) | 性能优化、API成本节约、持久化用户体验。避免对相同字幕重复翻译。             |
| **原始字幕 (YouTube源字幕)** | 内存缓存 (Service Worker中) / 按需从页面获取 | 主要在内存中临时持有，或按需直接从内容脚本获取    | 快速访问 (短期), 保证数据新鲜度, 避免占用过多本地存储空间。                 |

**详细说明:**

*   **`chrome.storage.local`**: 这是扩展主要的持久化存储方案，通过 `StorageManager` 类进行统一的异步读写操作。用于存储需要长期保留的用户配置和缓存数据。
*   **`chrome.storage.sync`**: 目前项目主要使用 `chrome.storage.local`。如果未来需要跨设备同步某些核心设置，可以考虑使用 `chrome.storage.sync`，但需注意其更严格的配额限制。
*   **API密钥安全性**: 虽然API密钥存储在 `chrome.storage.local` 中，但需要告知用户此存储未加密，并建议用户保护好自己的设备。扩展本身会遵循最小权限原则，仅在必要时由后台脚本访问密钥。
*   **缓存管理**:
    *   `VideoSettingsCache`: 负责管理每个视频的个性化设置，其数据最终也通过 `StorageManager` 持久化到 `chrome.storage.local`。
    *   `SubtitleCacheManager`: 负责缓存翻译后的字幕文本，以视频ID、目标语言、API服务商等作为组合键，数据也持久化到 `chrome.storage.local`。需要考虑缓存的清理策略（如LRU）以管理存储空间。
*   **原始字幕**: 考虑到数据的新鲜度和潜在的存储空间占用，原始字幕文本通常不建议大规模持久化存储。优先在内存中进行短期缓存，或在需要时由内容脚本从页面实时获取并传递给后台处理。

这种分层和分类的存储方式，旨在平衡持久性、性能、数据安全性和存储空间占用的需求。

## 待办任务与重构计划 (YYYY-MM-DD)

### I. 代码一致性与冗余

1.  **统一 EventBus 实现与事件类型定义：**
    *   **状态**: 进行中
    *   **分析**:
        *   `content/content-script.ts` 已确认使用 `src/events/event-bus.ts` (主 EventBus 类)。
        *   `content/event-bus.ts` (340行版本) 与 `src/events/event-bus.ts` 功能相似但有差异，目前未发现被项目主逻辑直接导入，疑似冗余。
        *   `EventTypes` (事件名常量) 在 `content/content-script.ts` (旧的内部定义), `content/event-bus.ts` (导出的定义), 和 `content/main-world.ts` (内部定义) 中存在多个版本。
    *   **已完成**:
        *   已创建统一的事件定义文件 `src/events/event-types.ts`。
        *   `content/content-script.ts` 已修改为导入并使用 `src/events/event-types.ts`。
    *   **待办行动**:
        *   仔细检查并确保 `content/content-script.ts` 中所有事件监听和触发点都已正确更新为使用 `src/events/event-types.ts` 中定义的新事件名/值 (尤其是 `UI_CONTROLS_INJECTED`, `UI_OVERLAY_CREATED`)。
        *   审查并更新 `content/main-world.ts`，使其内部 `EventTypesConst` 与 `src/events/event-types.ts` 对齐，或在通过 `postMessage` 转发事件时使用标准化的事件名。
        *   审查其他可能使用事件名的模块 (如 `background.ts`, `sidepanel/sidepanel.ts`)，确保它们也使用统一的 `EventTypes`。
        *   在确认 `content/event-bus.ts` 文件无任何其他间接引用或特殊用途后，可计划从项目中移除或归档。
    *   **备注**: `content/main-world.ts` 中的内联 EventBus 类本身因其特殊通信机制，暂不更改其类实现，但其使用的事件名需与标准统一。

2.  **统一 `findMatchingTargetLanguage` 函数：**
    *   **状态**: 未开始
    *   **任务**: 对比 `sidepanel/ts/sidepanel.ts` 中的 `findMatchingTargetLanguage` 函数与 `sidepanel/sidepanel.ts` (72KB 版本) 中的同名函数。
    *   **目标**: 确认两者逻辑是否一致。
    *   **行动**: 若逻辑一致，确定一个标准版本，移除另一个副本，并更新调用点。

### II. 主要功能模块的重叠与统一

3.  **梳理并统一侧边栏 (Side Panel) 实现：**
    *   **状态**: 未开始
    *   **任务**: 明确 `src/pages/sidepanel/SidePanel.tsx` (React 版本) 与 `sidepanel/sidepanel.html` + `sidepanel/sidepanel.ts` (传统 DOM 操作版本) 的未来。
    *   **目标**: 选择一个作为主要的、长期维护的实现方案。
    *   **行动建议**: 当前 `sidepanel/sidepanel.html` + `sidepanel/sidepanel.ts` (72KB) 功能更完整。若以此为基础，可考虑移除/归档 React 版本，或明确其不同用途。若选择 React 版本，则需大量迁移功能。

4.  **整合 OpenAI 翻译逻辑：**
    *   **状态**: 未开始
    *   **任务**: 审阅 `background/openai-translator.ts` (`OpenAITranslator` 类) 与 `background/background.ts` 中直接实现的 OpenAI 调用函数。
    *   **目标**: 统一 OpenAI API 的调用方式。
    *   **行动建议**: 推荐以 `OpenAITranslator` 类作为标准。修改 `background/background.ts` 中的 `translateWithAPI` 函数，确保在选择 OpenAI 作为翻译API时，调用 `OpenAITranslator` 实例的方法。逐步移除 `background.ts` 中冗余的 OpenAI 直接实现函数。

### III. 代码规范和构建优化

5.  **路径别名统一：**
    *   **状态**: 未开始
    *   **任务**: 检查项目中 `import` 语句的路径。
    *   **目标**: 尽可能统一使用 `tsconfig.json` 中定义的路径别名 (如 `@/*`) 替代相对路径 (`../`)。

6.  **Vite 构建配置确认 (侧边栏脚本)**：
    *   **状态**: 未开始
    *   **任务**: 明确 `sidepanel/sidepanel.html` 引用的 `sidepanel.js` 是如何由哪个 TypeScript 文件（特别是 `sidepanel/sidepanel.ts` 的 72KB 版本）编译而来的。
    *   **目标**: 确保 Vite 配置能够清晰、正确地处理当前功能更完整的侧边栏脚本的构建。

7.  **清理未使用或废弃的文件：**
    *   **状态**: 未开始
    *   **任务**: 识别并评估项目中可能不再使用的文件 (如 `content/content-script-external.js`, `content/content-script-new-event.ts`, 各种 `.bak` 和 `.original` 文件)。
    *   **目标**: 保持代码库整洁。

### IV. 当前主要问题追踪

8.  **插件加载失败 - "Cannot use import statement outside a module" 错误：**
    *   **状态**: 进行中
    *   **任务**: 持续监控并解决此错误。
    *   **行动**: 在尝试调整输出路径后，若问题依旧，需更细致地审查 Chrome 加载扩展时的实际请求、文件内容以及是否有意外的脚本注入或加载流程。

### V. UI 优化与冗余消除（2024-05-25更新）

9.  **优化UI组件的初始化和管理：**
    *   **状态**: 已完成
    *   **任务**: 解决UI组件初始化时的冗余问题。
    *   **改进内容**:
        *   将Tooltip元素的创建从"鼠标悬停事件触发"移至"UI Manager初始化阶段"，避免首次使用时的DOM操作延迟
        *   修改了`showTooltip`方法，移除了重复的元素创建检查，确保代码流程更清晰

10. **合并并优化字幕容器管理：**
    *   **状态**: 已完成
    *   **任务**: 解决两个独立字幕容器系统的冗余问题。
    *   **改进内容**:
        *   统一字幕容器ID为`yt-translate-subtitle-overlay`
        *   采用UIManager创建的DOM结构（结构更合理）
        *   使用内容脚本负责填充内容和处理显示逻辑
        *   通过事件系统`request:subtitle_overlay`实现两者之间的通信
        *   默认将字幕容器设为隐藏状态，只在有内容时显示，解决了播放器上黑块问题
        *   在字幕容器创建时增加条件判断，只有在翻译功能开启时才会创建

11. **UI元素加载优化：**
    *   **状态**: 已完成
    *   **任务**: 提高UI元素加载的性能和用户体验。
    *   **改进内容**:
        *   预先创建UI组件，避免按需延迟创建带来的界面闪烁
        *   优化了DOM操作，减少重排重绘
        *   明确区分了UI结构创建和功能逻辑处理的职责