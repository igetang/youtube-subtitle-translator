# YouTube 字幕翻译扩展 - API参考

本文档详细介绍项目中使用的主要API和接口。

## 1. 内部模块API

### 1.1 字幕翻译API

#### translateSubtitles
```typescript
/**
 * 翻译字幕文本
 * @param sourceTexts 源语言文本数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @param translationApi 要使用的翻译API
 * @returns 翻译后的文本数组
 */
async function translateSubtitles(
  sourceTexts: string[],
  sourceLang: string,
  targetLang: string,
  translationApi: string
): Promise<{ [id: string]: string }>
```

#### processAndStoreSubtitles
```typescript
/**
 * 处理并存储字幕数据
 * @param useCache 是否使用缓存的翻译结果
 */
async function processAndStoreSubtitles(useCache: boolean): Promise<void>
```

### 1.2 字幕轨道API

#### fetchAndProcessTracksInfo
```typescript
/**
 * 获取并处理字幕轨道信息
 * @returns 处理后的字幕轨道数组
 */
async function fetchAndProcessTracksInfo(): Promise<CaptionTrack[]>
```

#### fetchSubtitleData
```typescript
/**
 * 获取字幕数据
 * @param trackInfo 字幕轨道信息
 * @returns 字幕事件数组
 */
async function fetchSubtitleData(trackInfo?: any): Promise<SubtitleEvent[]>
```

### 1.3 UI操作API

#### injectControls
```typescript
/**
 * 向YouTube播放器注入控制按钮
 */
function injectControls(): void
```

#### createControlButton
```typescript
/**
 * 创建控制按钮
 * @param id 按钮ID
 * @param tooltip 提示文本
 * @param iconUrl 图标URL
 * @param clickHandler 点击处理函数
 * @returns 按钮元素和图标元素
 */
function createControlButton(
  id: string, 
  tooltip: string, 
  iconUrl: string, 
  clickHandler: () => void
): { button: HTMLButtonElement; icon: HTMLImageElement }
```

## 2. 外部API接口

### 2.1 翻译API

#### Google翻译API
```
URL: https://translate.googleapis.com/translate_a/single
方法: GET
参数:
  - client: gtx
  - sl: 源语言代码
  - tl: 目标语言代码
  - dt: t
  - q: 待翻译文本
```

#### 有道翻译API
```
URL: https://fanyi.youdao.com/translate
方法: GET
参数:
  - doctype: json
  - type: <sourceLang>2<targetLang>
  - i: 待翻译文本
```

#### 微软翻译API
```
URL: https://api.cognitive.microsofttranslator.com/translate
方法: POST
参数:
  - api-version: 3.0
  - from: 源语言代码
  - to: 目标语言代码
请求体:
  - JSON数组，每项包含text字段
```

### 2.2 Chrome扩展API

#### chrome.storage
用于存储和检索用户设置和缓存数据。
**📋 项目架构**：统一使用 `chrome.storage.local` 存储所有数据
```typescript
// 保存设置
chrome.storage.local.set({ key: value });

// 获取设置
chrome.storage.local.get(['key'], (result) => {
  console.log(result.key);
});

// 监听设置变化（只监听local区域）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    // 处理变化
  }
});
```

#### chrome.runtime
用于组件间通信和管理扩展生命周期。
```typescript
// 发送消息（使用type字段）
chrome.runtime.sendMessage({ type: 'actionName', data: data });

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理消息
  sendResponse({ status: 'success' });
});
```

#### chrome.tabs
用于与标签页交互。
```typescript
// 向标签页发送消息（使用type字段）
chrome.tabs.sendMessage(tabId, { type: 'actionName', data: data });

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 处理标签页更新
});
```

#### chrome.action
用于管理扩展弹出窗口。
```typescript
// 设置弹出窗口
chrome.action.setPopup({
  popup: 'popup/popup.html'
});

// 设置徽章文本
chrome.action.setBadgeText({
  text: 'ON'
});
```

## 3. 消息通信接口

扩展使用一套标准的消息格式进行组件间通信：

```typescript
interface Message {
  type: string;      // 消息类型（替代action字段）
  data?: any;        // 消息数据
  source?: string;   // 消息源
  tabId?: number;    // 标签页ID
}
```

### 3.1 Content Script -> Background Script

| 消息动作 | 描述 | 数据 |
|---------|------|-----|
| `openPopup` | 请求打开弹出窗口 | 无 |
| `closePopup` | 请求关闭弹出窗口 | 无 |
| `getTranslationConfig` | 获取翻译配置 | `{ videoId, payload }` |
| `checkTranslationCache` | 检查翻译缓存 | `{ videoId, params: TranslationParams }` |
| `saveTrackCache` | 保存轨道缓存 | `{ videoId, tracks: CaptionTrack[] }` |
| `saveTranslationCache` | 保存翻译结果 | `{ videoId, params: TranslationParams, result: TranslationResult }` |
| `getAvailableTracks` | 获取可用字幕轨道（Popup专用） | `{ videoId }` |
| `translateTexts` | 请求翻译文本 | `{ texts, sourceLang, targetLang, api }` |
| `youtubeNavigationFinished` | 通知YouTube导航完成 | 无 |

### 3.2 Background Script -> Content Script

| 消息动作 | 描述 | 数据 |
|---------|------|-----|
| `translationConfigResult` | 返回翻译配置 | `{ config: TranslationConfig }` |
| `translationCacheResult` | 返回缓存查询结果 | `{ cacheData: any, cacheHit: boolean }` |
| `availableTracksResult` | 返回可用字幕轨道 | `{ tracks: CaptionTrack[] }` |
| `youtubeNavigationOccurred` | 广播YouTube导航事件 | 无 |
| `translationResults` | 返回翻译结果 | `{ results, error }` |

### 3.3 Popup -> Content Script

| 消息动作 | 描述 | 数据 |
|---------|------|-----|
| `requestAvailableTracks` | 请求字幕轨道列表 | 无 |
| `subtitleModeUpdated` | 通知字幕模式已更新 | `{ mode }` |
| `sourceLangUpdated` | 通知源语言已更新 | `{ lang }` |

### 3.4 Content Script -> Popup

| 消息动作 | 描述 | 数据 |
|---------|------|-----|
| `availableTracksResponse` | 返回字幕轨道列表 | `{ availableTracks }` |
| `translationError` | 通知翻译错误 | `{ error }` |

## 4. Main World通信协议

内容脚本与主世界脚本通过`window.postMessage`通信：

### 4.1 Content Script -> Main World

```json
{
  "source": "content-script",
  "type": "REQUEST_CAPTION_TRACKS"
}
```

### 4.2 Main World -> Content Script

```json
{
  "source": "main-world",
  "type": "CAPTION_TRACKS_RESPONSE",
  "payload": {
    "captionTracks": [/* 轨道数据 */]
  }
}
```

或

```json
{
  "source": "main-world",
  "type": "MAIN_WORLD_READY"
}
```

---

**📋 文档维护**: 2025-08-21  
**🔄 版本**: v3.0.0  
**📍 状态**: 已更新为Popup架构  
**📡 接口版本**: 基于Manifest V3和Popup架构的API参考 