# YouTube 字幕翻译扩展 - 技术架构

本文档详细描述了YouTube字幕翻译扩展的技术架构、组件交互和数据流设计。

## 1. 整体架构

扩展采用Manifest V3规范，主要由以下核心组件构成：

```
┌───────────────────────────────┐    ┌───────────────────────────┐
│                               │    │                           │
│     Content Script            │◄───┤   Main World Script       │
│   (content-script.ts)         │    │   (main-world.ts)         │
│                               │    │                           │
└───────────┬───────────────────┘    └───────────────────────────┘
            │
            ▼
┌───────────────────────────────┐    ┌───────────────────────────┐
│                               │    │                           │
│     Background Script         │◄───┤       Side Panel          │
│   (background.ts)             │    │   (sidepanel/*)           │
│                               │    │                           │
└───────────────────────────────┘    └───────────────────────────┘
```

### 1.1 组件职责

#### Content Script (`content/content-script.ts`)
- 与YouTube页面直接交互
- 注入自定义按钮（翻译开关、设置）
- 监听用户操作和YouTube导航事件
- 创建字幕显示叠加层
- 处理字幕更新和显示
- 与Background Script和Main World Script通信
- 如果需要访问或修改持久化数据（如用户设置），通过向 Background Script 发送消息来进行。

#### Main World Script (`content/main-world.ts`)
- 在页面的主执行环境（而非隔离环境）中运行
- 访问YouTube播放器API获取字幕轨道信息
- 通过`window.postMessage`与Content Script通信

#### Background Script (`background/background.ts`)
- 管理扩展级别事件
- 控制Side Panel显示与隐藏
- 处理翻译请求（调用翻译API）
- **统一管理所有对 `chrome.storage.local` 的直接读写操作**，作为持久化数据的唯一来源和"守门人"。
- 广播重要事件（如导航事件）
- 管理应用缓存，例如字幕轨道信息（在内存中及 `chrome.storage.local` 中）。

#### Side Panel (`sidepanel/`)
- 提供用户友好的设置界面
- 显示可用字幕轨道列表（数据通常从Background Script或Content Script获取）
- 允许选择源语言、目标语言
- 提供翻译API选择和字幕模式切换
- 提供API测试功能
- **通过向 Background Script 发送消息**来请求读取或保存用户设置及其他需要持久化的数据。

## 2. 数据流与通信

### 2.1 字幕获取流程

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Content Script │     │ Main World     │     │  YouTube       │
│                 │     │ Script         │     │  Player API    │
└────────┬────────┘     └────────┬───────┘     └───────┬────────┘
         │                       │                     │
         │ 1. Inject script      │                     │
         ├──────────────────────►│                     │
         │                       │                     │
         │ 2. Request tracks     │                     │
         │ (postMessage)         │                     │
         ├──────────────────────►│                     │
         │                       │ 3. Call API         │
         │                       ├────────────────────►│
         │                       │                     │
         │                       │ 4. Return tracks    │
         │                       │◄────────────────────┤
         │ 5. Response tracks    │                     │
         │ (postMessage)         │                     │
         │◄──────────────────────┤                     │
         │                       │                     │
         │ 6. Process tracks     │                     │
         ├─────┐                 │                     │
         │     │                 │                     │
         │◄────┘                 │                     │
         │                       │                     │
```

### 2.2 翻译请求流程

> 详细的翻译流程文档请参阅 [翻译流程文档](translation-flow.md)

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Content Script │     │  Background    │     │  Translation   │
│                 │     │  Script        │     │  API           │
└────────┬────────┘     └────────┬───────┘     └───────┬────────┘
         │                       │                     │
         │ 1. Send texts         │                     │
         │ to translate          │                     │
         ├──────────────────────►│                     │
         │                       │                     │
         │                       │ 2. Translate API    │
         │                       │ request             │
         │                       ├────────────────────►│
         │                       │                     │
         │                       │ 3. API response     │
         │                       │◄────────────────────┤
         │                       │                     │
         │ 4. Return             │                     │
         │ translations          │                     │
         │◄──────────────────────┤                     │
         │                       │                     │
         │ 5. Process &          │                     │
         │ display subtitles     │                     │
         ├─────┐                 │                     │
         │     │                 │                     │
         │◄────┘                 │                     │
         │                       │                     │
```

### 2.3 设置变更流程

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   Side Panel   │     │  Chrome         │     │  Content       │
│                 │     │  Storage        │     │  Script        │
└────────┬────────┘     └────────┬───────┘     └───────┬────────┘
         │                       │                     │
         │ 1. Save setting       │                     │
         ├──────────────────────►│                     │
         │                       │                     │
         │ 2. Direct notify      │                     │
         │ (optional)            │                     │
         ├─────────────────────────────────────────────►
         │                       │                     │
         │                       │ 3. storage.onChanged│
         │                       │ event               │
         │                       ├────────────────────►│
         │                       │                     │
         │                       │                     │ 4. Apply
         │                       │                     │ setting
         │                       │                     ├─────┐
         │                       │                     │     │
         │                       │                     │◄────┘
         │                       │                     │
```

### 2.4 Side Panel 参数加载流程 (用户打开 Side Panel 时)

当用户点击翻译设置按钮打开 Side Panel 时，插件会执行以下一系列操作来初始化 Side Panel 的用户界面和功能。这个过程涉及到 Background Script, Content Script, 以及各种存储机制 (全局设置和视频特定设置缓存)。

**核心逻辑顺序:**

1. **SidePanel 打开并通知 Background Script：**
   - SidePanel UI (`sidepanel/sidepanel.ts`) 被用户打开
   - SidePanel 获取当前标签页ID和URL，解析视频ID（如果是YouTube页面）
   - 向 Background Script 发送消息：`{'action': 'sidePanelOpened', 'tabId': currentTabId, 'videoId': videoId}`

2. **Background Script 收到消息并调用初始化函数：**
   - 接收`sidePanelOpened`消息并提取`tabId`和`videoId`参数
   - 调用`initializeSidePanel(tabId, videoIdFromSidePanel)`函数处理初始化

3. **Background Script 加载全局设置：**
   - 调用`loadAndApplyGlobalSettings()`获取所有全局设置
   - 获取浏览器UI语言(`uiLang = chrome.i18n.getUILanguage()`)
   - 确定视频ID（使用传入的`videoIdFromSidePanel`或通过`getVideoIdForTab(tabId)`获取）

4. **Background Script 检查视频特定设置缓存：**
   - 通过`VideoSettingsCache.getInstance().getVideoSettings(currentVideoId)`加载视频设置
   - **如果缓存命中：**
     - 读取缓存的`hasSubtitles`值
     - **如果视频有字幕(`hasSubtitles=true`)：**
       - 从缓存加载字幕轨道信息(`availableTracks`)
       - 使用缓存的源语言(`sourceLang`)和目标语言(`targetLang`)
       - 跳到步骤7（组合数据）
     - **如果视频无字幕(`hasSubtitles=false`)：**
       - 设置`availableTracks = []`
       - 跳到步骤7（组合数据）
   - **如果缓存未命中：** 继续到步骤5

5. **Background Script 请求Content Script获取字幕信息：**
   - 向SidePanel发送`loadingTracks`状态
   - 向Content Script发送消息：`{'action': 'getAvailableTracks', 'videoId': currentVideoId}`
   - 设置Promise等待响应，监听`availableTracksResult`消息
   - 如果超时（10秒），抛出错误

6. **Background Script 处理Content Script返回的字幕信息：**
   - **如果成功获取字幕轨道数据：**
     - 设置`hasSubtitles = true`
     - 调用`selectBestSourceLanguage(availableTracks)`选择合适的源语言。优先级如下：
       1.  **非ASR英语轨道 (Non-ASR English)**: `languageCode`以`en`开头 (如 'en', 'en-US', 'en-GB') 且 `kind` 不是 `'asr'`。
       2.  **ASR英语轨道 (ASR English)**: `languageCode`以`en`开头 且 `kind` 是 `'asr'`。
       3.  **列表中的第一个轨道**: 如果以上都未找到，则选择 `availableTracks` 列表中的第一个轨道。
       4.  **无字幕**: 如果 `availableTracks` 为空，则表示无字幕，源语言为空字符串。
     - 将轨道数据保存到缓存：`StorageKeys.CACHE.VIDEO_TRACKS_PREFIX + currentVideoId`
   - **如果未获取到字幕轨道或出错：**
     - 设置`hasSubtitles = false`
     - 设置`availableTracks = []`

7. **Background Script 组合最终数据：**
   - 确保`determinedSourceLang`有值：
     - 如果之前步骤已设置，则使用该值
     - 否则使用全局设置或默认"en"
   - 确保`determinedTargetLang`有值：
     - 优先使用之前步骤中的值
     - 其次使用全局设置中的目标语言
     - 如果全局设置中没有，则基于浏览器UI语言匹配适当的目标语言
     - 最后使用默认值"en"
   - 组装最终数据对象：`settingsForSidePanel` 包含：
     - `globalSettings`：全局设置
     - `videoSettings`：视频特定设置
     - `determinedSourceLang`：确定的源语言
     - `determinedTargetLang`：确定的目标语言
     - `hasSubtitles`：是否有字幕
     - `uiLangCode`：浏览器UI语言

8. **Background Script 更新缓存并发送数据到 SidePanel：**
   - 如果需要，更新视频设置缓存：
     ```javascript
     VideoSettingsCache.getInstance().saveVideoSettings({
       videoId: currentVideoId,
       sourceLang: determinedSourceLang,
       targetLang: determinedTargetLang,
       lastUsed: Date.now(),
       hasSubtitles: hasSubtitles,
       sourceTrackKind: availableTracks.find(t => t.languageCode === determinedSourceLang)?.kind
     });
     ```
   - 发送初始化消息到SidePanel：
     ```javascript
     console.log(`[background/background.ts] 向Sidepanel发送初始化数据: hasSubtitles=${hasSubtitles}, tracks=${availableTracks.length}`);
     
     chrome.runtime.sendMessage({
       action: 'initializeSidePanelUI',
       tabId: tabId,
       data: {
         state: hasSubtitles ? 'ready' : 'noTracks',
         videoId: currentVideoId,
         availableTracks: availableTracks,
         settings: settingsForSidePanel
       }
     }).catch(e => console.warn("[background/background.ts] 发送到Sidepanel失败:", e));
     ```

9. **SidePanel 接收数据并更新 UI：**
   - 接收`initializeSidePanelUI`消息并提取数据
   - 检查是否有字幕轨道，如有则填充源语言选择列表
   - 应用确定的源语言和目标语言设置
   - 根据全局设置配置其他UI元素（字幕模式、翻译API、API密钥等）
   - 显示相应的状态（正常、无字幕等）

这个流程确保了 Side Panel 在打开时基于当前视频的信息和用户偏好正确初始化。缓存机制减少了重复请求，提高了用户体验，同时确保数据的一致性。

### 2.5 Side Panel 交互与状态管理详解

本节详细阐述了用户与侧边栏（Side Panel）交互时的具体流程、`chrome.sidePanel` API 的使用关键点以及在开发过程中遇到的问题和解决方案。

#### 2.5.1 Manifest V3 配置 (`manifest.json`)

-   **`side_panel.default_path` 的必要性**:
    *   即使计划为特定标签页动态设置侧边栏的路径和启用状态 (`chrome.sidePanel.setOptions()`)，也 **必须** 在 `manifest.json` 中提供一个全局的 `side_panel.default_path`。
        ```json
        "side_panel": {
          "default_path": "sidepanel/sidepanel.html"
        }
        ```
    *   缺少此配置，即使特定标签页的侧边栏被 `setOptions()` 设置为 `enabled: true`，`chrome.sidePanel.open()` 调用也可能因找不到"活动的"或"默认的"侧边栏定义而失败，并报错 "No active side panel for tabId..."。

#### 2.5.2 用户手势限制与 `chrome.sidePanel.open()`

-   `chrome.sidePanel.open()` API **必须** 在被浏览器认为是直接响应用户操作（如点击按钮）的上下文中调用。
-   任何导致其在异步回调链深处执行的逻辑（例如，在 `setOptions()` 的回调中再调用 `open()`），都可能导致 "may only be called in response to a user gesture" 错误。
-   **解决方案**: 后台脚本 (`background.ts`) 在收到来自内容脚本的 `openSidePanel` 消息后（此消息直接源于用户点击），应直接尝试调用 `chrome.sidePanel.open({ tabId })`。

#### 2.5.3 侧边栏启用状态 (`enabled`) 管理

-   **主动维护启用状态**:
    *   对于希望展示侧边栏的特定页面（如本项目中的YouTube页面），`background.ts` 中的 `updateSidePanelState(tabId)` 函数负责主动确保这些页面的侧边栏是 `enabled: true` 并且 `path` 被正确设置。
    *   `updateSidePanelState` 会在标签页更新 (`chrome.tabs.onUpdated`) 和激活 (`chrome.tabs.onActivated`) 时被调用。
-   **关闭后立即重置状态**:
    *   当用户通过UI关闭侧边栏（对应到后台的 `closeSidePanel` 消息处理），后台脚本会调用 `chrome.sidePanel.setOptions({ tabId, enabled: false })` 来禁用它。
    *   **关键处理**: 在成功禁用侧边栏后，`closeSidePanel` 处理器会**立即再次调用 `updateSidePanelState(tabId)`**。
    *   **原因**: 如果当前标签页仍然符合显示侧边栏的条件（例如，用户关闭了YouTube页面的侧边栏但仍停留在该YouTube页面），`updateSidePanelState` 会再次将其设置为 `enabled: true`（但侧边栏不会被打开）。这为下一次用户点击"打开"按钮做好了准备，解决了之前连续点击开关按钮导致第三次无法打开的问题。

#### 2.5.4 核心交互流程 (打开/关闭 Side Panel)

1.  **用户操作 (在 `content/content-script.ts` 中的 `UIManager`)**:
    *   用户点击"翻译设置"按钮。
    *   `UIManager` 根据当前侧边栏的打开/关闭状态，向后台脚本发送相应的消息：
        *   若要打开：`chrome.runtime.sendMessage({ action: 'openSidePanel' })`
        *   若要关闭：`chrome.runtime.sendMessage({ action: 'closeSidePanel' })`

2.  **后台处理 (在 `background/background.ts`中)**:
    *   **`openSidePanel` 消息处理器**:
        *   接收到消息后，直接调用 `chrome.sidePanel.open({ tabId })`。
        *   此操作依赖于 `updateSidePanelState` 函数已提前将该标签页的侧边栏设置为 `enabled: true` 和正确的 `path`。
    *   **`closeSidePanel` 消息处理器**:
        *   调用 `chrome.sidePanel.setOptions({ tabId, enabled: false })` 来禁用侧边栏。
        *   在 `setOptions` 成功的回调中，立即调用 `updateSidePanelState(tabId)`，以便为下一次用户尝试打开侧边栏时，其 `enabled` 状态能被正确重置为 `true`。

通过上述机制，确保了侧边栏的打开和关闭行为符合预期，并遵循了 `chrome.sidePanel` API 的相关限制和要求。

## 3. 核心数据结构

### 3.1 字幕轨道信息

```typescript
interface CaptionTrack {
  baseUrl: string;          // 字幕数据URL
  name: {                   // 字幕名称
    simpleText: string;
  };
  vssId: string;            // 字幕标识符
  languageCode: string;     // 语言代码
  isTranslatable: boolean;  // 是否可翻译
}
```

### 3.2 字幕事件

```typescript
interface SubtitleEvent {
  start: number;           // 开始时间(秒)
  end: number;             // 结束时间(秒)
  text: string;            // 文本内容
  langCode: string;        // 语言代码
}
```

### 3.3 处理后的字幕事件

```typescript
interface ProcessedSubtitleEvent {
  start: number;           // 开始时间(秒)
  end: number;             // 结束时间(秒)
  sourceText: string;      // 源语言文本
  targetText: string|null; // 目标语言文本
  sourceLangCode: string;  // 源语言代码
  targetLangCode: string;  // 目标语言代码
}
```

### 3.4 用户设置

```typescript
interface UserSettings {
  targetLang: string;        // 目标语言
  sourceLang: string;        // 源语言
  subtitleMode: string;      // 字幕模式(bilingual/targetOnly)
  translationApi: string;    // 翻译API选择
  translateActive: boolean;  // 翻译开关状态
  // 其他设置...
}
```

## 4. 存储设计

为了确保职责清晰、数据管理的集中化以及遵循"关注点分离"原则，**所有对 `chrome.storage.local` (本项目中统一使用的存储区域) 的直接API调用（例如 `get`, `set`, `remove` 等）都应封装在 Background Script 中**，或由Background Script调用的专用存储管理模块（例如 `background/storage-manager.ts`）中。

其他组件（如Side Panel、Content Script）如果需要访问或修改持久化数据，**必须通过向 Background Script 发送定义好的消息来进行**，而不是直接调用 `chrome.storage.*` API。Background Script 作为数据的"守门人"，负责处理这些消息并执行相应的存储操作。

### 4.1 存储区域分离

扩展**统一使用 `chrome.storage.local`** 区域存储所有类型的数据。本项目**不使用 `chrome.storage.sync`**，以简化存储逻辑并保持单台设备上数据的独立性（即用户设置不会在不同设备间自动同步）。

Background Script 负责所有对 `chrome.storage.local` 的直接读写，并推荐使用**键名前缀**来清晰地组织不同类型的数据，例如：

*   `settings_*`：用于用户全局设置 (如 `settings_targetLanguage`)
*   `videoCache_*`：用于特定视频的缓存数据 (如 `videoCache_VIDEOID_availableTracks`)
*   `translationCache_*`：用于翻译结果的缓存
*   `temp_*`：用于其他临时会话数据

这种方式有助于维护数据结构和避免键名冲突。

```
┌────────────────────────────────────────────────────┐
│ chrome.storage.local                               │
│ (所有数据：用户设置、缓存数据、临时数据，本地存储)    │
│                                                    │
│ - settings_targetLanguage                          │
│ - settings_translationApi                          │
│ - settings_apiKey_openai                           │
│ - videoCache_VIDEOID_availableTracks               │
│ - videoCache_VIDEOID_lastSourceLang                │
│ - translationCache_API_SOURCE_TARGET_TEXTHASH      │
│ - temp_currentVideoId                              │
│ - temp_activeTabId                                 │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 4.2 翻译缓存结构

```typescript
// 存储在chrome.storage.local中
interface SubtitleCache {
  [cacheKey: string]: {  // 缓存键: videoId + apiType + targetLang
    translatedSubtitles: {
      [id: string]: string;  // 字幕ID到翻译文本的映射
    };
    timestamp: number;    // 缓存时间戳
  };
}
```

### 4.5 UI组件设计优化

UI组件设计采用了职责分离的模式，遵循以下原则：

#### 4.5.1 UI结构与功能逻辑分离

```
┌───────────────────────┐     ┌───────────────────────┐
│                       │     │                       │
│     UI Manager        │     │   Content Script      │
│  (结构创建与管理)      │     │  (功能逻辑与交互)      │
│                       │     │                       │
└───────────┬───────────┘     └───────────┬───────────┘
            │                             │
            │        事件总线通信          │
            ├─────────────────────────────┤
            │                             │
            ▼                             ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│               DOM 元素 & 用户界面                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- **UIManager职责**：
  - 创建和管理UI元素的DOM结构
  - 提供一致的样式和布局
  - 监听DOM变化，保持UI元素的存在性
  - 预先创建必要的UI元素（如Tooltip）

- **Content Script职责**：
  - 处理UI元素的交互逻辑
  - 填充内容和处理内容更新
  - 管理UI状态和显示逻辑
  - 实现业务功能（如翻译处理）

#### 4.5.2 优化后的字幕容器管理

字幕容器经过优化，实现了以下改进：

- **统一容器ID**：使用`yt-translate-subtitle-overlay`作为唯一标识符
- **结构优化**：
  ```html
  <div id="yt-translate-subtitle-overlay">
    <div class="translated-subtitles-container">
      <div class="translated-text">翻译文本</div>
      <div class="original-text">原文文本</div>
    </div>
  </div>
  ```
- **创建与显示分离**：
  - UIManager负责创建容器结构和应用基础样式
  - 内容脚本负责处理字幕内容填充和可见性控制
  - 只在翻译功能启用时才创建字幕容器

- **事件驱动协作**：
  - 内容脚本通过`request:subtitle_overlay`事件请求创建字幕容器
  - UIManager响应事件并创建容器，发出`ui.overlayCreated`事件
  - 内容脚本监听`ui.overlayCreated`事件获取容器引用

- **性能优化**：
  - 默认字幕容器设置为隐藏状态（`visibility: hidden`）
  - 只在有字幕内容时才显示容器
  - 避免了空字幕容器造成的黑色区块问题

#### 4.5.3 UI组件初始化优化

UI组件初始化采用了预加载策略：

- Tooltip元素在UIManager初始化时创建，而非首次鼠标悬停时
- 使用标准化的DOM操作流程，减少重复的元素创建检查
- 优化DOM操作顺序，减少页面重排和重绘
- 统一使用事件驱动模式，降低组件间耦合度

## 5. 模块化架构设计

### 5.1 计划中的模块化状态管理架构

```
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│                   │  │                   │  │                   │
│    UI Module      │◄─┼─►  Translation    │◄─┼─►  Cache Module   │
│                   │  │     Module        │  │                   │
└─────────┬─────────┘  └────────┬──────────┘  └─────────┬─────────┘
          │                     │                       │           
          ▼                     ▼                       ▼          
┌─────────────────────────────────────────────────────────────────┐
│                            Event Bus                            │
└─────────────────────────────────────────────────────────────────┘
                              │                                    
                              ▼                                    
┌─────────────────────────────────────────────────────────────────┐
│                         Storage Access Layer                     │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 翻译优化架构

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│                     │     │                     │     │                     │
│ RateLimitManager    │◄────┤ OpenAITranslator    │────►│ CacheManager        │
│ - 追踪API限流信息    │     │ - 主翻译逻辑        │     │ - 缓存翻译结果      │
│ - 动态调整请求策略   │     │ - 调度批处理        │     │ - 智能缓存管理      │
│                     │     │ - 优先级处理        │     │                     │
└─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │                     │
                            │ BatchProcessor      │
                            │ - 智能批处理分组    │
                            │ - 令牌感知排序      │
                            │ - 错误处理和重试    │
                            │                     │
                            └─────────────────────┘
```

## 6. 错误处理策略

### 6.1 多层错误处理

扩展实现了多层错误处理策略，确保在各种错误情况下仍提供良好的用户体验：

1. **API调用错误处理**：
   - 实现翻译API双路径调用
   - 自动故障转移机制
   - 详细错误日志

2. **字幕处理错误处理**：
   - 空值检查和默认值处理
   - 显示错误提示同时保留源字幕
   - 明确的视觉区分（错误信息为红色）

3. **网络错误处理**：
   - 请求超时处理
   - 自动重试机制
   - 指数退避策略

4. **导航错误处理**：
   - 清理旧DOM元素
   - 重置内部状态
   - 广播导航事件

## 7. 性能优化策略

1. **字幕缓存**：
   - 基于视频ID、目标语言和API类型的缓存键
   - LRU清理策略
   - 持久化存储

2. **渐进式翻译**：
   - 优先翻译当前播放位置附近字幕
   - 后台处理其余字幕
   - 即时显示已翻译内容

3. **批处理优化**：
   - 智能批量分组
   - 令牌感知排序
   - 动态调整批处理大小

4. **限流管理**：
   - 基于API响应头动态调整请求策略
   - 实现请求计数跟踪
   - 自适应延迟计算

5. **事件去抖动**：
   - 减少频繁触发的事件处理
   - 合并短时间内的多次更新
   - 优化存储变化监听器 