# 12. YouTube原生字幕注入架构（Hook XHR方案）

> **状态**: 🚀 实现方案确定（方案C：阻塞式紧急翻译）
> **版本**: v2.0
> **创建日期**: 2025-10-08
> **更新日期**: 2025-10-08
> **目标**: 通过拦截XHR请求，将翻译文本注入到YouTube原生字幕系统，实现完美融合的双语字幕

---

## 📋 目录

1. [技术背景](#技术背景)
2. [方案对比](#方案对比)
3. [核心原理](#核心原理)
4. [架构设计](#架构设计)
5. [数据流程](#数据流程)
6. [关键技术点](#关键技术点)
7. [与现有架构整合](#与现有架构整合)
8. [实现细节](#实现细节)
9. [技术挑战与解决方案](#技术挑战与解决方案)
10. [性能与稳定性](#性能与稳定性)
11. 🆕 [基于V4架构的实现方案（方案C：阻塞式紧急翻译）](#基于v4架构的实现方案方案c阻塞式紧急翻译)
12. [测试计划](#测试计划)
13. [风险评估](#风险评估)
14. [里程碑](#里程碑)
15. [参考资料](#参考资料)
16. [总结](#总结)

---

## 技术背景

### 问题描述

当前方案使用独立的字幕覆盖层（SubtitleOverlay）显示翻译，存在以下问题：

1. **样式同步困难** - 需要手动复制YouTube原生字幕的所有样式
2. **定位跟随问题** - 用户拖动原生字幕时，翻译字幕无法自动跟随
3. **响应式适配** - 全屏/剧场模式切换需要手动调整位置
4. **用户设置隔离** - YouTube用户的字幕设置（大小、透明度等）无法影响翻译字幕

### 目标

通过拦截YouTube的字幕数据请求，将翻译文本直接注入到原生字幕数据中，使YouTube的原生字幕系统渲染包含翻译的双语字幕。

---

## 方案对比

### 方案一：独立覆盖层（当前方案）

**实现方式：**
```
YouTube渲染原生字幕 → Content Script监听 → 创建独立覆盖层 → 显示翻译
```

**优点：**
- ✅ 实现简单，逻辑清晰
- ✅ 完全掌控，不受YouTube更新影响

**缺点：**
- ❌ 样式需手动同步，容易不一致
- ❌ 定位需持续监听和调整
- ❌ 用户设置不生效（字幕大小、透明度等）
- ❌ 性能开销大（MutationObserver + ResizeObserver）

---

### 方案二：DOM注入（测试方案）

**实现方式：**
```
YouTube渲染字幕 → MutationObserver监听DOM → 在.caption-window中插入翻译div
```

**优点：**
- ✅ 样式继承原生字幕CSS
- ✅ 定位自动跟随

**缺点：**
- ❌ YouTube频繁重新渲染DOM，需持续劫持
- ❌ MutationObserver性能开销大
- ❌ YouTube可能随时移除注入的元素
- ❌ 用户设置仍不生效

---

### 方案三：Hook XHR（推荐方案）⭐

**实现方式：**
```
YouTube请求字幕 → Hook XHR拦截 → 修改JSON数据 → YouTube渲染（包含翻译）
```

**优点：**
- ✅ **完美融合** - 翻译成为"假的原生字幕"，100%样式一致
- ✅ **零性能开销** - 只在请求时修改一次数据，无需持续监听
- ✅ **用户设置生效** - 字幕大小、颜色、透明度等完全支持
- ✅ **自动跟随** - 拖动、缩放、全屏等自动适配
- ✅ **稳定性高** - 不依赖DOM结构，YouTube更新不影响

**缺点：**
- ⚠️ 需要Main World执行环境（不能在Content Script的Isolated World）
- ⚠️ 需要设计数据通信机制（Main World ↔ Content Script ↔ Service Worker）
- ⚠️ 实现复杂度较高

---

## 核心原理

### 关键发现：YouTube字幕请求是XHR

通过调试发现，YouTube使用 `XMLHttpRequest` 请求字幕数据，而不是 `fetch`：

```javascript
// YouTube字幕请求示例
GET https://www.youtube.com/api/timedtext?v=VIDEO_ID&lang=en&fmt=json3
```

### JSON3字幕格式

YouTube字幕数据采用JSON3格式：

```json
{
  "events": [
    {
      "tStartMs": 5280,      // 开始时间（毫秒）
      "dDurationMs": 4920,   // 持续时间（毫秒）
      "segs": [              // 字幕片段数组
        {
          "utf8": "Hello"    // ⭐ 字幕文本
        }
      ]
    },
    {
      "tStartMs": 10200,
      "dDurationMs": 3500,
      "segs": [
        {
          "utf8": "How are you"
        }
      ]
    }
  ]
}
```

### 核心思路：响应拦截与内容替换

```
┌─────────────────────────────────────────────────────────────┐
│                      YouTube播放器                           │
└───────────────────────┬─────────────────────────────────────┘
                        │ 发起XHR请求
                        ▼
┌─────────────────────────────────────────────────────────────┐
│             [拦截层] Hook XMLHttpRequest                     │
│  - 检测URL包含"timedtext"                                     │
│  - 监听readystatechange事件                                   │
└───────────────────────┬─────────────────────────────────────┘
                        │ 获取原始字幕JSON
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   修改JSON3数据结构                           │
│  events.forEach(event => {                                   │
│    event.segs.forEach(seg => {                               │
│      seg.utf8 = original + "\n" + translation                │
│    })                                                         │
│  })                                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │ 替换xhr.responseText
                        ▼
┌─────────────────────────────────────────────────────────────┐
│            YouTube播放器收到修改后的字幕                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         YouTube原生字幕系统渲染（包含翻译）✅                  │
│  - 样式：YouTube负责                                          │
│  - 定位：YouTube负责                                          │
│  - 时间轴：YouTube负责                                        │
│  - 用户设置：YouTube负责                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 架构设计

### 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                          YouTube页面                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Main World Script (新增)                     │    │
│  │  - Hook XMLHttpRequest.prototype                         │    │
│  │  - 拦截timedtext请求                                       │    │
│  │  - 修改字幕响应数据                                         │    │
│  └─────────────┬───────────────────────────────────────────┘    │
│                │ window.postMessage                              │
│                │ (字幕事件、原始字幕数据)                          │
│                ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Content Script (修改)                        │    │
│  │  - 监听Main World消息                                      │    │
│  │  - 请求翻译数据                                            │    │
│  │  - 回传翻译数据到Main World                                │    │
│  └─────────────┬───────────────────────────────────────────┘    │
│                │ chrome.runtime.sendMessage                      │
│                ▼                                                 │
└────────────────┼──────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Service Worker (现有)                          │
│  - 接收翻译请求                                                    │
│  - 调用翻译API                                                    │
│  - 返回翻译结果                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 三层通信架构

| 层级 | 环境 | 职责 | 通信方式 |
|------|------|------|----------|
| **Main World** | 页面全局上下文 | Hook XHR，拦截字幕请求 | `window.postMessage` → Content Script |
| **Content Script** | Isolated World | 消息中转、状态管理 | `chrome.runtime.sendMessage` ↔ Service Worker |
| **Service Worker** | 后台进程 | 翻译API调用、缓存管理 | `chrome.runtime.onMessage` ← Content Script |

---

## 数据流程

### 完整流程图

```
1. 用户点击CC字幕按钮
   │
   ▼
2. YouTube发起XHR请求字幕
   GET /api/timedtext?v=xxx&lang=en&fmt=json3
   │
   ▼
3. [Main World] Hook触发
   - 检测URL匹配 /timedtext|caption/i
   - 监听readystatechange事件
   │
   ▼
4. [Main World] XHR响应完成 (readyState=4)
   - 解析JSON3格式
   - 提取所有字幕文本
   │
   ▼
5. [Main World] 发送消息到Content Script
   window.postMessage({
     type: 'SUBTITLE_RECEIVED',
     subtitles: [{text: "Hello", startMs: 5280}, ...]
   })
   │
   ▼
6. [Content Script] 接收字幕数据
   - 检查是否已有翻译缓存
   - 如果没有，请求Service Worker翻译
   │
   ▼
7. [Service Worker] 执行翻译
   - 批量翻译API调用
   - 保存到TranslationCache
   - 返回翻译结果
   │
   ▼
8. [Content Script] 回传翻译数据
   window.postMessage({
     type: 'TRANSLATION_READY',
     translations: {"Hello": "你好", ...}
   })
   │
   ▼
9. [Main World] 修改XHR响应
   events.forEach(event => {
     event.segs.forEach(seg => {
       const translation = translations[seg.utf8];
       seg.utf8 = `${seg.utf8}\n${translation}`;
     })
   })
   │
   ▼
10. [Main World] 替换响应内容
    Object.defineProperty(xhr, 'responseText', {
      value: JSON.stringify(modifiedData)
    })
   │
   ▼
11. YouTube渲染双语字幕 ✅
```

### 时序图

```
Main World          Content Script        Service Worker        YouTube
    │                      │                      │                 │
    │                      │                      │   XHR请求字幕    │
    │◄─────────────────────────────────────────────────────────────┤
    │ Hook拦截             │                      │                 │
    ├──────────────────────┼──────────────────────┼─────────────────┤
    │  提取字幕文本         │                      │                 │
    ├─ postMessage ───────►│                      │                 │
    │  (原始字幕)           │                      │                 │
    │                      ├─ sendMessage ───────►│                 │
    │                      │  (请求翻译)           │                 │
    │                      │                      ├─ 调用翻译API     │
    │                      │◄─ sendMessage ───────┤                 │
    │                      │  (翻译结果)           │                 │
    │◄─ postMessage ───────┤                      │                 │
    │  (翻译数据)           │                      │                 │
    ├──────────────────────┼──────────────────────┼─────────────────┤
    │  修改JSON            │                      │                 │
    │  替换responseText     │                      │                 │
    ├──────────────────────────────────────────────────────────────►│
    │                      │                      │  返回修改后数据  │
    │                      │                      │                 ├─ 渲染双语字幕
```

---

## 关键技术点

### 1. Hook XMLHttpRequest

**目标：** 拦截所有XHR请求，识别字幕请求并修改响应

```javascript
// 保存原始方法
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

// 重写open方法，记录URL
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._url = url;  // 保存URL供后续判断
  this._method = method;
  return originalOpen.call(this, method, url, ...rest);
};

// 重写send方法，拦截响应
XMLHttpRequest.prototype.send = function(...args) {
  const xhr = this;

  // 判断是否是字幕请求
  if (isSubtitleRequest(this._url)) {
    console.log('[XHR Hook] 检测到字幕请求:', this._url);

    // 监听响应完成
    const originalOnReadyStateChange = xhr.onreadystatechange;

    xhr.addEventListener('readystatechange', function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        // 异步修改响应（等待翻译数据）
        handleSubtitleResponse(xhr);
      }

      // 调用原始回调
      if (originalOnReadyStateChange) {
        originalOnReadyStateChange.call(xhr);
      }
    });
  }

  return originalSend.apply(this, args);
};

// 判断是否是字幕请求
function isSubtitleRequest(url) {
  return url && /timedtext|caption/i.test(url) && /fmt=json3/.test(url);
}
```

**注意事项：**
- ⚠️ 必须在Main World中执行（页面的全局上下文）
- ⚠️ Hook代码必须在YouTube加载之前注入
- ⚠️ 需要保留原始方法的调用，避免破坏YouTube功能

---

### 2. 解析JSON3格式

**数据结构：**

```typescript
interface JSON3Subtitle {
  events: SubtitleEvent[];
}

interface SubtitleEvent {
  tStartMs: number;        // 开始时间（毫秒）
  dDurationMs?: number;    // 持续时间（毫秒）
  segs?: SubtitleSegment[]; // 字幕片段
}

interface SubtitleSegment {
  utf8: string;            // ⭐ 字幕文本
  // 可能还有其他字段，如 ac（自动字幕置信度）等
}
```

**解析逻辑：**

```javascript
function parseJSON3Subtitle(responseText) {
  try {
    const data = JSON.parse(responseText);

    if (!data.events || !Array.isArray(data.events)) {
      console.warn('[XHR Hook] 无效的JSON3格式');
      return null;
    }

    // 提取所有字幕文本
    const subtitles = [];
    data.events.forEach(event => {
      if (event.segs && Array.isArray(event.segs)) {
        event.segs.forEach(seg => {
          if (seg.utf8) {
            subtitles.push({
              text: seg.utf8,
              startMs: event.tStartMs,
              durationMs: event.dDurationMs
            });
          }
        });
      }
    });

    return { data, subtitles };
  } catch (error) {
    console.error('[XHR Hook] JSON解析失败:', error);
    return null;
  }
}
```

---

### 3. 修改响应内容

**关键：** 替换 `xhr.responseText` 和 `xhr.response` 属性

```javascript
function modifySubtitleResponse(xhr, translations) {
  const parsed = parseJSON3Subtitle(xhr.responseText);
  if (!parsed) return;

  const { data } = parsed;

  // 遍历修改字幕文本
  data.events.forEach(event => {
    if (event.segs) {
      event.segs.forEach(seg => {
        if (seg.utf8) {
          const original = seg.utf8;
          const translation = translations[original];

          if (translation) {
            // 使用换行符实现双行显示
            // 双语模式：原文 + 换行 + 译文
            seg.utf8 = `${original}\n${translation}`;
          }
          // 如果是仅译文模式，直接替换
          // seg.utf8 = translation || original;
        }
      });
    }
  });

  // 转回JSON字符串
  const modifiedText = JSON.stringify(data);

  // 替换响应内容
  Object.defineProperty(xhr, 'responseText', {
    writable: true,
    configurable: true,
    value: modifiedText
  });

  Object.defineProperty(xhr, 'response', {
    writable: true,
    configurable: true,
    value: modifiedText
  });

  console.log('[XHR Hook] 字幕已修改，翻译条数:', Object.keys(translations).length);
}
```

**为什么可以修改只读属性？**

虽然 `responseText` 和 `response` 通常是只读的，但在请求完成前，我们可以使用 `Object.defineProperty` 重新定义这些属性。YouTube读取响应时，会获取到我们修改后的值。

---

### 4. Main World Script注入

**Manifest V3配置：**

```json
{
  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*"],
      "js": ["mainworld-script.js"],
      "run_at": "document_start",
      "world": "MAIN"
    }
  ]
}
```

**关键配置说明：**
- `"run_at": "document_start"` - 在页面加载前执行，确保Hook早于YouTube代码
- `"world": "MAIN"` - 在页面的全局上下文执行，而不是Isolated World

---

### 5. 消息通信机制

#### Main World → Content Script

```javascript
// Main World
window.postMessage({
  type: 'YT_SUBTITLE_EXTENSION_SUBTITLE_RECEIVED',
  subtitles: extractedSubtitles,
  videoId: getVideoId()
}, '*');
```

```javascript
// Content Script
window.addEventListener('message', (event) => {
  // 验证消息来源
  if (event.source !== window) return;

  if (event.data.type === 'YT_SUBTITLE_EXTENSION_SUBTITLE_RECEIVED') {
    handleSubtitleReceived(event.data.subtitles);
  }
});
```

#### Content Script ↔ Service Worker

```javascript
// Content Script → Service Worker
const response = await chrome.runtime.sendMessage({
  type: 'REQUEST_TRANSLATION',
  subtitles: subtitles,
  sourceLang: 'en',
  targetLang: 'zh-CN'
});

// Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_TRANSLATION') {
    translateSubtitles(message.subtitles).then(translations => {
      sendResponse({ success: true, translations });
    });
    return true; // 异步响应
  }
});
```

#### Content Script → Main World

```javascript
// Content Script
window.postMessage({
  type: 'YT_SUBTITLE_EXTENSION_TRANSLATION_READY',
  translations: translationMap
}, '*');

// Main World
window.addEventListener('message', (event) => {
  if (event.data.type === 'YT_SUBTITLE_EXTENSION_TRANSLATION_READY') {
    applyTranslations(event.data.translations);
  }
});
```

---

## 与现有架构整合

### 现有架构回顾

**当前翻译流程：**
```
1. 用户点击翻译按钮
   ↓
2. Service Worker: handleToggleTranslate
   ↓
3. 获取字幕（从YouTube API）
   ↓
4. 调用翻译API
   ↓
5. SubtitleOverlay显示翻译
```

### 整合后的新架构

**新翻译流程：**
```
1. 用户点击翻译按钮
   ↓
2. Service Worker: 设置translateActive=true
   ↓
3. 通知Content Script启用字幕注入模式
   ↓
4. Content Script: 通知Main World开始拦截
   ↓
5. Main World: Hook已激活，等待字幕请求
   ↓
6. 用户打开YouTube字幕（或自动打开）
   ↓
7. YouTube发起字幕请求
   ↓
8. Main World: 拦截字幕响应
   ↓
9. Main World → Content Script: 发送原始字幕
   ↓
10. Content Script → Service Worker: 请求翻译
   ↓
11. Service Worker: 翻译API调用（复用现有逻辑）
   ↓
12. Service Worker → Content Script: 返回翻译
   ↓
13. Content Script → Main World: 回传翻译数据
   ↓
14. Main World: 修改XHR响应
   ↓
15. YouTube渲染双语字幕 ✅
```

### 复用现有组件

| 现有组件 | 新架构中的角色 | 修改程度 |
|----------|---------------|---------|
| **Service Worker** | 翻译API调用、缓存管理 | 🟢 无需修改（复用现有翻译逻辑） |
| **TranslationCacheManager** | 缓存翻译结果 | 🟢 无需修改 |
| **UserPreferencesManager** | 读取用户设置（源语言、目标语言） | 🟢 无需修改 |
| **Content Script** | 消息中转、状态同步 | 🟡 小幅修改（添加消息监听） |
| **SubtitleOverlay** | 保留作为降级方案 | 🔵 保留但不激活 |

### 降级策略

如果Hook XHR方案失败（如浏览器限制、YouTube更新等），自动降级到SubtitleOverlay方案：

```typescript
// Content Script
class SubtitleInjectionCoordinator {
  private useNativeInjection: boolean = true; // 默认使用Hook方案

  async initialize() {
    // 尝试启用Hook方案
    const hookEnabled = await this.enableXHRHook();

    if (!hookEnabled) {
      console.warn('[降级] Hook方案失败，使用SubtitleOverlay');
      this.useNativeInjection = false;
      this.fallbackToOverlay();
    }
  }

  private fallbackToOverlay() {
    // 激活SubtitleOverlay（现有方案）
    subtitleOverlay.initialize();
  }
}
```

---

## 实现细节

### Main World Script完整实现

```javascript
/**
 * @file mainworld-subtitle-hook.js
 * @description YouTube字幕XHR Hook - 在Main World中执行
 */

(function() {
  'use strict';

  console.log('[Main World Hook] 字幕注入脚本已加载');

  // ========================================
  // 配置
  // ========================================

  const CONFIG = {
    SUBTITLE_URL_PATTERN: /timedtext|caption/i,
    JSON3_FORMAT_PATTERN: /fmt=json3/,
    MESSAGE_PREFIX: 'YT_SUBTITLE_EXTENSION_'
  };

  // ========================================
  // 状态管理
  // ========================================

  let isHookEnabled = false;
  let pendingTranslations = {}; // 待注入的翻译数据
  let pendingXHRs = [];          // 等待翻译的XHR对象

  // ========================================
  // Hook XMLHttpRequest
  // ========================================

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    this._method = method;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;

    if (isSubtitleRequest(this._url)) {
      console.log('[XHR Hook] 拦截字幕请求:', this._url);

      xhr.addEventListener('readystatechange', function handler() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          handleSubtitleResponse(xhr);
          xhr.removeEventListener('readystatechange', handler);
        }
      });
    }

    return originalSend.apply(this, args);
  };

  // ========================================
  // 工具函数
  // ========================================

  function isSubtitleRequest(url) {
    return url &&
           CONFIG.SUBTITLE_URL_PATTERN.test(url) &&
           CONFIG.JSON3_FORMAT_PATTERN.test(url);
  }

  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  function extractSubtitles(data) {
    const subtitles = [];

    if (!data.events || !Array.isArray(data.events)) {
      return subtitles;
    }

    data.events.forEach(event => {
      if (event.segs && Array.isArray(event.segs)) {
        event.segs.forEach(seg => {
          if (seg.utf8) {
            subtitles.push({
              text: seg.utf8,
              startMs: event.tStartMs,
              durationMs: event.dDurationMs
            });
          }
        });
      }
    });

    return subtitles;
  }

  // ========================================
  // 字幕处理
  // ========================================

  function handleSubtitleResponse(xhr) {
    if (!isHookEnabled) {
      console.log('[XHR Hook] Hook未启用，跳过处理');
      return;
    }

    try {
      const data = JSON.parse(xhr.responseText);
      const subtitles = extractSubtitles(data);

      console.log('[XHR Hook] 提取字幕条数:', subtitles.length);

      // 发送字幕数据到Content Script请求翻译
      window.postMessage({
        type: CONFIG.MESSAGE_PREFIX + 'SUBTITLE_RECEIVED',
        subtitles: subtitles,
        videoId: getVideoId(),
        xhrId: Date.now() // 用于关联XHR对象
      }, '*');

      // 暂存XHR对象，等待翻译数据
      pendingXHRs.push({ xhr, data, timestamp: Date.now() });

    } catch (error) {
      console.error('[XHR Hook] 处理字幕响应失败:', error);
    }
  }

  function applyTranslations(translations, subtitleMode) {
    console.log('[XHR Hook] 应用翻译，模式:', subtitleMode);

    // 处理所有等待的XHR
    pendingXHRs.forEach(({ xhr, data }) => {
      modifySubtitleData(data, translations, subtitleMode);

      const modifiedText = JSON.stringify(data);

      // 替换响应内容
      Object.defineProperty(xhr, 'responseText', {
        writable: true,
        configurable: true,
        value: modifiedText
      });

      Object.defineProperty(xhr, 'response', {
        writable: true,
        configurable: true,
        value: modifiedText
      });
    });

    // 清空待处理队列
    pendingXHRs = [];

    console.log('[XHR Hook] 翻译应用完成');
  }

  function modifySubtitleData(data, translations, subtitleMode) {
    data.events.forEach(event => {
      if (event.segs) {
        event.segs.forEach(seg => {
          if (seg.utf8) {
            const original = seg.utf8;
            const translation = translations[original];

            if (translation) {
              if (subtitleMode === 'bilingual') {
                // 双语模式：原文\n译文
                seg.utf8 = `${original}\n${translation}`;
              } else if (subtitleMode === 'targetOnly') {
                // 仅译文模式：只显示译文
                seg.utf8 = translation;
              }
            }
          }
        });
      }
    });
  }

  // ========================================
  // 消息监听
  // ========================================

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const { type, data } = event.data;

    switch (type) {
      case CONFIG.MESSAGE_PREFIX + 'ENABLE_HOOK':
        isHookEnabled = true;
        console.log('[XHR Hook] Hook已启用');
        break;

      case CONFIG.MESSAGE_PREFIX + 'DISABLE_HOOK':
        isHookEnabled = false;
        pendingXHRs = [];
        console.log('[XHR Hook] Hook已禁用');
        break;

      case CONFIG.MESSAGE_PREFIX + 'TRANSLATION_READY':
        applyTranslations(data.translations, data.subtitleMode);
        break;
    }
  });

  console.log('[Main World Hook] 初始化完成');
})();
```

### Content Script修改

```typescript
/**
 * Content Script中的字幕注入协调器
 */
class NativeSubtitleInjectionCoordinator {
  private isEnabled: boolean = false;
  private userPreferencesManager: UserPreferencesManager;

  constructor() {
    this.userPreferencesManager = UserPreferencesManager.getInstance();
    this.setupMessageListener();
  }

  /**
   * 启用原生字幕注入
   */
  public async enable(): Promise<void> {
    this.isEnabled = true;

    // 通知Main World启用Hook
    window.postMessage({
      type: 'YT_SUBTITLE_EXTENSION_ENABLE_HOOK'
    }, '*');

    console.log('[Native Injection] 已启用');
  }

  /**
   * 禁用原生字幕注入
   */
  public disable(): void {
    this.isEnabled = false;

    // 通知Main World禁用Hook
    window.postMessage({
      type: 'YT_SUBTITLE_EXTENSION_DISABLE_HOOK'
    }, '*');

    console.log('[Native Injection] 已禁用');
  }

  /**
   * 监听Main World消息
   */
  private setupMessageListener(): void {
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;

      const { type, subtitles, videoId } = event.data;

      if (type === 'YT_SUBTITLE_EXTENSION_SUBTITLE_RECEIVED') {
        await this.handleSubtitleReceived(subtitles, videoId);
      }
    });
  }

  /**
   * 处理收到的字幕数据
   */
  private async handleSubtitleReceived(
    subtitles: Array<{text: string, startMs: number}>,
    videoId: string
  ): Promise<void> {
    console.log('[Native Injection] 收到字幕数据:', subtitles.length);

    // 获取用户设置
    const userPrefs = await this.userPreferencesManager.getUserPreferences();

    // 请求Service Worker翻译
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_SUBTITLE_TEXTS',
      texts: subtitles.map(s => s.text),
      videoId: videoId,
      sourceLang: userPrefs.sourceLang,
      targetLang: userPrefs.targetLang,
      translationService: userPrefs.translationService
    });

    if (response.success) {
      // 回传翻译数据到Main World
      window.postMessage({
        type: 'YT_SUBTITLE_EXTENSION_TRANSLATION_READY',
        data: {
          translations: response.translations,
          subtitleMode: userPrefs.subtitleMode
        }
      }, '*');

      console.log('[Native Injection] 翻译数据已回传');
    } else {
      console.error('[Native Injection] 翻译失败:', response.error);
    }
  }
}

// 导出单例
export const nativeSubtitleInjection = new NativeSubtitleInjectionCoordinator();
```

### Service Worker修改

```typescript
/**
 * Service Worker中添加新的消息处理
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_SUBTITLE_TEXTS') {
    handleBatchTranslation(message).then(sendResponse);
    return true; // 异步响应
  }

  // ... 其他消息处理
});

async function handleBatchTranslation(message: {
  texts: string[];
  videoId: string;
  sourceLang: string;
  targetLang: string;
  translationService: TranslationService;
}) {
  try {
    // 检查缓存
    const cacheKey = buildCacheKey(
      message.videoId,
      message.sourceLang,
      message.targetLang,
      message.translationService.type
    );

    const cachedTranslations = await TranslationCacheManager.getInstance()
      .getTranslations(cacheKey);

    if (cachedTranslations) {
      console.log('[Service Worker] 使用缓存的翻译');
      return {
        success: true,
        translations: cachedTranslations
      };
    }

    // 调用翻译API（复用现有逻辑）
    const translator = createTranslator(message.translationService);
    const translations = await translator.translateBatch(
      message.texts,
      message.sourceLang,
      message.targetLang
    );

    // 保存缓存
    await TranslationCacheManager.getInstance().saveTranslations(
      cacheKey,
      translations
    );

    return {
      success: true,
      translations: translations
    };

  } catch (error) {
    console.error('[Service Worker] 批量翻译失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

---

## 技术挑战与解决方案

### 挑战1：时序问题 ⚠️

**问题：** XHR响应可能在翻译完成前就返回给YouTube

**分析：**
```
XHR请求完成 (t=0ms)
  ↓
提取字幕 (t=5ms)
  ↓
请求翻译 (t=10ms)
  ↓
等待翻译API... (t=10ms ~ t=2000ms) ← 可能很慢
  ↓
翻译完成 (t=2000ms)
  ↓
❌ 但YouTube可能在t=100ms就读取了responseText！
```

**解决方案：延迟XHR回调**

```javascript
XMLHttpRequest.prototype.send = function(...args) {
  const xhr = this;

  if (isSubtitleRequest(this._url)) {
    // 暂存原始回调
    const originalCallback = xhr.onload;

    // 拦截onload
    xhr.onload = null;

    xhr.addEventListener('readystatechange', async function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        // ⭐ 关键：等待翻译完成再触发回调
        await handleSubtitleResponseAsync(xhr);

        // 现在触发原始回调，YouTube读到的是修改后的数据
        if (originalCallback) {
          originalCallback.call(xhr);
        }
      }
    });
  }

  return originalSend.apply(this, args);
};

async function handleSubtitleResponseAsync(xhr) {
  return new Promise((resolve) => {
    // 请求翻译...
    // 收到翻译后修改xhr.responseText
    // resolve()
  });
}
```

---

### 挑战2：翻译数据传递

**问题：** Main World无法直接访问chrome.storage和chrome.runtime API

**解决方案：** 三层消息桥接

```
Main World ←→ Content Script ←→ Service Worker
(window.postMessage) (chrome.runtime.sendMessage)
```

**安全性考虑：**
- 使用唯一的消息前缀（`YT_SUBTITLE_EXTENSION_`）
- 验证消息来源（`event.source === window`）
- 避免敏感数据通过postMessage传递

---

### 挑战3：字幕模式切换

**问题：** 用户切换双语/仅译文模式时，如何重新渲染？

**方案A：刷新字幕**
```typescript
// Content Script
userPreferencesManager.addChangeListener(
  UserPreferenceChangeEvent.SUBTITLE_MODE_CHANGED,
  async (newMode: SubtitleMode) => {
    // 通知YouTube重新请求字幕
    await refreshYouTubeSubtitle();
  }
);

function refreshYouTubeSubtitle() {
  // 模拟用户关闭再打开字幕
  const player = getYouTubePlayer();
  player.unloadModule('captions');
  player.loadModule('captions');
}
```

**方案B：缓存修改后的数据**
```typescript
// Main World
let lastModifiedData = null;
let lastSubtitleMode = 'bilingual';

// 监听模式变更
window.addEventListener('message', (event) => {
  if (event.data.type === 'YT_SUBTITLE_EXTENSION_MODE_CHANGED') {
    const newMode = event.data.mode;

    if (lastModifiedData) {
      // 重新修改数据
      modifySubtitleData(lastModifiedData, translations, newMode);
      // ... 触发重新渲染
    }
  }
});
```

---

### 挑战4：多语言字幕支持

**问题：** YouTube可能同时加载多个语言的字幕

**解决方案：** 根据URL参数识别语言

```javascript
function parseSubtitleLanguage(url) {
  const urlObj = new URL(url);
  const lang = urlObj.searchParams.get('lang');
  const tlang = urlObj.searchParams.get('tlang'); // YouTube自动翻译

  return {
    sourceLang: lang,
    targetLang: tlang
  };
}

// 只处理匹配用户设置的字幕
if (isSubtitleRequest(this._url)) {
  const { sourceLang } = parseSubtitleLanguage(this._url);

  // 检查是否匹配用户设置
  if (sourceLang === userPrefs.sourceLang) {
    // 处理字幕
  }
}
```

---

## 性能与稳定性

### 性能优化

| 优化点 | 方法 | 效果 |
|-------|------|------|
| **减少Hook开销** | 只在URL匹配时处理 | ✅ 不影响其他XHR请求 |
| **翻译缓存** | 复用TranslationCacheManager | ✅ 相同视频秒开 |
| **批量翻译** | 一次请求翻译所有字幕 | ✅ 减少API调用次数 |
| **异步处理** | 使用Promise避免阻塞 | ✅ 不影响页面响应 |

### 稳定性保障

#### 1. 错误处理

```javascript
function handleSubtitleResponse(xhr) {
  try {
    const data = JSON.parse(xhr.responseText);
    // ... 处理逻辑
  } catch (error) {
    console.error('[XHR Hook] 处理失败，使用原始响应:', error);
    // 不修改响应，YouTube正常显示原始字幕
    return;
  }
}
```

#### 2. 降级策略

```typescript
class SubtitleInjectionManager {
  private strategy: 'native' | 'overlay' = 'native';

  async initialize() {
    try {
      await this.enableNativeInjection();
      this.strategy = 'native';
    } catch (error) {
      console.warn('[降级] Native Injection失败，使用Overlay');
      this.enableOverlay();
      this.strategy = 'overlay';
    }
  }
}
```

#### 3. 超时保护

```javascript
async function waitForTranslation(subtitles, timeout = 5000) {
  return Promise.race([
    requestTranslation(subtitles),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('翻译超时')), timeout)
    )
  ]);
}
```

---

## 基于V4架构的实现方案（方案C：阻塞式紧急翻译）⭐

> **实施状态**: 📋 设计完成，待实现
> **优先级**: 高
> **预计工作量**: 3-5天

### 11.1 方案选择

基于对当前V4翻译架构的深入理解，我们选择了**方案C：阻塞式紧急翻译**作为最终实现方案。

#### 三种方案对比

| 维度 | 方案A：等待紧急翻译 | 方案B：等待完整翻译 | 方案C：阻塞式紧急翻译 ⭐ |
|------|-------------------|-------------------|----------------------|
| **拦截次数** | 3次 | 2次 | **2次** ✅ |
| **首次显示时间** | ~10秒 | ~30-60秒 | **~10秒** ✅ |
| **用户体验** | 先部分后完整（会闪烁） | 直接完整 | **先部分后完整（平滑）** ✅ |
| **实现复杂度** | 高（需管理3次拦截） | 低 | **中等** ✅ |
| **降级策略** | 复杂 | 简单 | **中等** ✅ |

#### 选择方案C的原因

✅ **平衡速度和体验**
- 10秒内显示紧急翻译（前9+后30=40条核心内容）
- 后台继续完成批量翻译，自动升级为完整版本
- 用户无感知地从"快速版"升级到"完整版"

✅ **只需2次拦截**
- 第1次：阻塞等待紧急翻译（10秒），注入并显示
- 第2次：批量翻译完成后重载，注入完整翻译

✅ **复用现有V4架构**
- TwoPhaseTranslatorV4（两阶段翻译器）
- AbortController超时机制
- TranslationCacheManager缓存管理
- 最小改动，最大复用

---

### 11.2 核心流程设计

#### 完整流程图（2次拦截）

```
用户点击翻译
  ↓
Service Worker: handleToggleTranslateV4
  ↓
检查缓存
  ├─ ✅ 有完整缓存
  │   ├─ 预加载到会话缓存
  │   ├─ 触发字幕加载（Hook模式）
  │   └─ 第1次拦截 → 立即注入完整翻译 → 完成 ✨
  │
  └─ ❌ 无缓存
      ↓
      发送 TRIGGER_SUBTITLE_LOAD_HOOK (mode: 'wait-urgent')
      ↓
      ┌─────────────────────────────────────────┐
      │  Main World: 拦截器初始化                 │
      │  • hookMode: true                       │
      │  • waitMode: 'urgent'                   │
      │  • 劫持 Fetch/XHR                        │
      │  • triggerSubtitleButton()              │
      └───────────┬─────────────────────────────┘
                  │
                  ▼
      ┌─────────────────────────────────────────┐
      │  🔥 第1次拦截（阻塞）                     │
      │  • YouTube 请求字幕                      │
      │  • hookSubtitleResponse() 被调用         │
      │  • 解析原始字幕                          │
      │  • 检查缓存 → ❌ 无缓存                  │
      │  • 🚨 创建 Promise 并等待                │
      │  • 发送 REQUEST_URGENT_TRANSLATION      │
      │  • ⏱️ 阻塞等待（最多30秒）                │
      └───────────┬─────────────────────────────┘
                  │
                  ▼
      ┌─────────────────────────────────────────┐
      │  Service Worker: 紧急翻译                │
      │  • 收到 REQUEST_URGENT_TRANSLATION      │
      │  • 执行紧急翻译（前9+后30=40条）          │
      │  • 30秒超时                              │
      │  • 发送 URGENT_TRANSLATION_READY        │
      └───────────┬─────────────────────────────┘
                  │
                  ▼
      ┌─────────────────────────────────────────┐
      │  Main World: 收到紧急翻译                 │
      │  • 更新会话缓存                          │
      │  • resolve(translations)                │
      │  • 🔥 解除阻塞                           │
      │  • 注入紧急翻译到JSON3                   │
      │  • 返回修改后的响应                       │
      └───────────┬─────────────────────────────┘
                  │
                  ▼
      YouTube 显示双语字幕（40条紧急翻译）✨
                  │
                  ▼
      ┌─────────────────────────────────────────┐
      │  Service Worker: 批量翻译（后台）         │
      │  • 等待5秒                               │
      │  • 执行批量翻译（全部）                   │
      │  • 保存到持久化缓存                       │
      │  • 发送 UPDATE_HOOK_CACHE               │
      │  • 发送 RELOAD_SUBTITLE_HOOK            │
      └───────────┬─────────────────────────────┘
                  │
                  ▼
      ┌─────────────────────────────────────────┐
      │  Main World: 触发重载                     │
      │  • 更新会话缓存（完整翻译）               │
      │  • triggerSubtitleButton()              │
      │    (toggle-off → toggle-on)             │
      └───────────┬─────────────────────────────┘
                  │
                  ▼
      ┌─────────────────────────────────────────┐
      │  🔥 第2次拦截                             │
      │  • YouTube 再次请求字幕                   │
      │  • 检查缓存 → ✅ 有完整缓存               │
      │  • 注入完整翻译                          │
      │  • 立即返回（不阻塞）                     │
      └───────────┬─────────────────────────────┘
                  │
                  ▼
      YouTube 显示完整双语字幕 ✨
                  │
                  ▼
      销毁拦截器 → 完成
```

#### 时间线分析

```
T+0s:   用户点击翻译，设置PENDING
T+1s:   第1次拦截，发送紧急翻译请求，阻塞等待
T+1~10s: Service Worker 执行紧急翻译（40条）
T+10s:  紧急翻译完成，解除阻塞，注入翻译
T+10s:  YouTube 显示双语字幕（40条）✨
T+15s:  等待5秒
T+15~45s: 批量翻译（剩余所有）
T+45s:  批量翻译完成，更新缓存，触发重载
T+46s:  第2次拦截，注入完整翻译
T+46s:  YouTube 显示完整双语字幕 ✨
```

**用户体验**：
- ⚡ **10秒**后看到部分翻译（40条核心内容）
- 🎯 **46秒**后自动升级为完整翻译
- 🚀 **总共只需2次拦截**

---

### 11.3 关键技术实现

#### 11.3.1 Main World: 阻塞等待机制

```typescript
class SubtitleInterceptor {
  private hookMode: boolean = false;
  private waitMode: 'none' | 'urgent' | 'complete' = 'none';
  private translationPromises: Map<string, {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeout: number;
  }> = new Map();

  initialize(sourceLang, sourceKind, originalSubtitleState, options = {}) {
    this.hookMode = options.hookMode || false;
    this.waitMode = options.waitMode || 'none';

    // 劫持 Fetch（阻塞版）
    window.fetch = async function(...args) {
      const url = ...;

      if (url && url.includes('timedtext')) {
        if (self.hookMode) {
          const response = await originalFetch(...args);
          const originalText = await response.text();

          // 🔥 核心：可能阻塞等待翻译
          const modifiedText = await self.hookSubtitleResponse(originalText, url);

          return new Response(modifiedText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
        // ... 旧模式
      }
      return originalFetch(...args);
    };

    // XHR 劫持同理
  }

  // 🔥 核心Hook方法（支持阻塞）
  private async hookSubtitleResponse(originalText: string, url: string): Promise<string> {
    const cacheKey = this.getCacheKey(url);
    const cache = (window as any).__translationCache?.[cacheKey];

    try {
      const data = JSON.parse(originalText);

      if (cache && cache.length > 0) {
        // ✅ 有缓存：立即注入
        console.log('[Hook] ✅ 缓存命中，立即注入:', cache.length, '条');
        return this.injectTranslation(data, cache);
      } else {
        // ❌ 无缓存
        if (this.waitMode === 'urgent') {
          // 🔥 阻塞等待紧急翻译
          console.log('[Hook] ⏱️ 无缓存，阻塞等待紧急翻译...');

          const subtitles = this.parseJson3Subtitles(data);
          const translations = await this.waitForUrgentTranslation(subtitles, url, cacheKey);

          if (translations && translations.length > 0) {
            console.log('[Hook] ✅ 紧急翻译完成，注入:', translations.length, '条');
            return this.injectTranslation(data, translations);
          } else {
            console.warn('[Hook] ⚠️ 紧急翻译超时/失败，返回原文');
            return originalText;
          }
        } else {
          return originalText;
        }
      }
    } catch (e) {
      console.error('[Hook] 处理失败:', e);
      return originalText;
    }
  }

  // 🆕 等待紧急翻译完成
  private async waitForUrgentTranslation(
    subtitles: any[],
    url: string,
    cacheKey: string
  ): Promise<any[] | null> {
    return new Promise((resolve, reject) => {
      // 设置30秒超时
      const timeoutId = window.setTimeout(() => {
        this.translationPromises.delete(cacheKey);
        console.error('[Hook] ⏱️ 紧急翻译超时（30秒）');
        resolve(null);
      }, 30000);

      // 保存 Promise 控制器
      this.translationPromises.set(cacheKey, {
        resolve,
        reject,
        timeout: timeoutId
      });

      // 🚀 发送翻译请求到 Service Worker
      window.postMessage({
        source: 'main-world',
        type: 'REQUEST_URGENT_TRANSLATION',
        payload: {
          subtitles: subtitles,
          url: url,
          cacheKey: cacheKey
        }
      }, '*');

      console.log('[Hook] 📤 已发送紧急翻译请求，等待响应...');
    });
  }

  // 🆕 接收紧急翻译结果（由消息触发）
  public resolveUrgentTranslation(cacheKey: string, translations: any[]): void {
    const promise = this.translationPromises.get(cacheKey);
    if (promise) {
      clearTimeout(promise.timeout);
      this.translationPromises.delete(cacheKey);

      // 更新会话缓存
      if (!(window as any).__translationCache) {
        (window as any).__translationCache = {};
      }
      (window as any).__translationCache[cacheKey] = translations;

      console.log('[Hook] ✅ 紧急翻译就绪，解除阻塞');
      promise.resolve(translations);
    }
  }

  // 注入翻译到JSON3格式
  private injectTranslation(data: any, cache: any[]): string {
    if (!data.events) return JSON.stringify(data);

    data.events.forEach((event: any, index: number) => {
      if (cache[index] && cache[index].translation) {
        event.segs.forEach((seg: any) => {
          // 双语格式：原文 + 换行 + 翻译
          seg.utf8 = seg.utf8 + '\n' + cache[index].translation;
        });
      }
    });

    return JSON.stringify(data);
  }

  private getCacheKey(url: string): string {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v') || getCurrentVideoId();
    const lang = urlObj.searchParams.get('lang') || this.targetSourceLang;
    const targetLang = getUserTargetLang();
    return `${videoId}_${lang}_${targetLang}`;
  }
}
```

#### 11.3.2 Main World: 消息监听

```typescript
// main-world.ts 全局消息监听

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const { source, type, data } = event.data;

  // 🆕 处理紧急翻译就绪
  if (source === 'content-script' && type === 'URGENT_TRANSLATION_READY') {
    const { cacheKey, translations } = data;
    const interceptor = SubtitleInterceptor.getInstance();
    if (interceptor) {
      interceptor.resolveUrgentTranslation(cacheKey, translations);
    }
  }

  // 🆕 处理完整翻译缓存更新
  if (source === 'content-script' && type === 'UPDATE_HOOK_CACHE') {
    const { cacheKey, translations } = data;
    if (!(window as any).__translationCache) {
      (window as any).__translationCache = {};
    }
    (window as any).__translationCache[cacheKey] = translations;
    console.log('[Main World] Hook缓存已更新:', translations.length, '条');
  }

  // 🆕 处理重载请求
  if (source === 'content-script' && type === 'RELOAD_SUBTITLE_HOOK') {
    const interceptor = SubtitleInterceptor.getInstance();
    if (interceptor) {
      interceptor.reloadSubtitle();  // 调用现有的 triggerSubtitleButton()
    }
  }
});
```

#### 11.3.3 Content Script: 消息转发

```typescript
// content-script.ts

// 转发 Main World → Service Worker
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const { source, type, payload } = event.data;

  // 🆕 转发紧急翻译请求
  if (source === 'main-world' && type === 'REQUEST_URGENT_TRANSLATION') {
    chrome.runtime.sendMessage({
      type: 'REQUEST_URGENT_TRANSLATION',
      data: payload
    });
  }
});

// 转发 Service Worker → Main World
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 🆕 转发紧急翻译就绪
  if (message.type === 'URGENT_TRANSLATION_READY') {
    window.postMessage({
      source: 'content-script',
      type: 'URGENT_TRANSLATION_READY',
      data: message.data
    }, '*');
    sendResponse({ success: true });
  }

  // 🆕 转发完整翻译缓存
  if (message.type === 'UPDATE_HOOK_CACHE') {
    window.postMessage({
      source: 'content-script',
      type: 'UPDATE_HOOK_CACHE',
      data: message.data
    }, '*');
    sendResponse({ success: true });
  }

  // 🆕 转发重载请求
  if (message.type === 'RELOAD_SUBTITLE_HOOK') {
    window.postMessage({
      source: 'content-script',
      type: 'RELOAD_SUBTITLE_HOOK'
    }, '*');
    sendResponse({ success: true });
  }
});
```

#### 11.3.4 Service Worker: 翻译流程改动

```typescript
// handle-toggle-translate-v4.ts

export async function handleToggleTranslateV4(...) {
  // Stage 1-3: 获取配置、源语言、轨道（不变）

  // 检查缓存
  const cachedResult = await translationCacheManager.get(...);

  if (cachedResult) {
    // ✅ 有完整缓存：预加载并触发
    console.log('[service-worker-v4] ✓ 命中完整缓存');

    await chrome.tabs.sendMessage(tabId, {
      type: 'PRELOAD_TRANSLATION_CACHE',
      data: {
        cacheKey: getCacheKey(videoId, sourceLang, targetLang, service),
        translations: parseVttToArray(cachedResult)
      }
    });

    await chrome.tabs.sendMessage(tabId, {
      type: 'TRIGGER_SUBTITLE_LOAD_HOOK',
      sourceLang: sourceLang,
      sourceKind: sourceKind,
      hookMode: true,
      waitMode: 'none'  // 有缓存，不需要等待
    });

    await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
    return { success: true, action: 'cached_hook' };
  }

  // ❌ 无缓存：需要翻译
  console.log('[service-worker-v4] 无缓存，触发Hook模式（阻塞紧急翻译）');

  // 🆕 发送 Hook 加载请求（等待紧急翻译）
  await chrome.tabs.sendMessage(tabId, {
    type: 'TRIGGER_SUBTITLE_LOAD_HOOK',
    sourceLang: sourceLang,
    sourceKind: sourceKind,
    hookMode: true,
    waitMode: 'urgent'  // 🔥 等待紧急翻译
  });

  // 🆕 等待紧急翻译请求
  const urgentRequest = await session.executeStage(
    'wait_urgent_request',
    async (signal) => {
      return new Promise((resolve) => {
        const messageListener = (message: any, msgSender: any) => {
          if (message.type === 'REQUEST_URGENT_TRANSLATION' &&
              msgSender.tab?.id === tabId) {
            chrome.runtime.onMessage.removeListener(messageListener);
            resolve(message.data);
          }
        };
        chrome.runtime.onMessage.addListener(messageListener);

        signal.addEventListener('abort', () => {
          chrome.runtime.onMessage.removeListener(messageListener);
        });
      });
    },
    { timeoutMs: 10000 }
  );

  const { subtitles, cacheKey } = urgentRequest;

  // 🆕 执行紧急翻译（30秒超时）
  const translator = new TwoPhaseTranslatorV4();
  translator.setTranslationService(preferences.translationService);

  const urgentResults = await session.executeStage(
    'urgent_translate',
    async (signal) => {
      return await translator.translateUrgent(
        subtitles,
        urgentRequest.currentTime || 0,
        preferences,
        signal
      );
    },
    { timeoutMs: 30000, fallback: [] }
  );

  // 🆕 立即发送紧急翻译结果（解除阻塞）
  if (urgentResults.length > 0) {
    const urgentSubtitles = buildTranslationArray(subtitles, urgentResults);

    await chrome.tabs.sendMessage(tabId, {
      type: 'URGENT_TRANSLATION_READY',
      data: {
        cacheKey: cacheKey,
        translations: urgentSubtitles
      }
    });
  }

  // 🆕 等待5秒后执行批量翻译
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 🆕 批量翻译（全部）
  const batchResults = await session.executeStage(
    'batch_translate',
    async (signal) => {
      return await translator.translateBatch(
        subtitles,
        urgentResults,
        preferences,
        signal
      );
    },
    { timeoutMs: calculateBatchTimeout(subtitles.length, service) }
  );

  // 🆕 构建完整翻译并保存
  const finalSubtitles = buildTranslationArray(subtitles, batchResults);

  // 保存到持久化缓存
  await translationCacheManager.set(...);

  // 🆕 更新会话缓存（完整翻译）
  await chrome.tabs.sendMessage(tabId, {
    type: 'UPDATE_HOOK_CACHE',
    data: {
      cacheKey: cacheKey,
      translations: finalSubtitles
    }
  });

  // 🆕 触发重载（第2次拦截）
  await chrome.tabs.sendMessage(tabId, {
    type: 'RELOAD_SUBTITLE_HOOK'
  });

  await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);

  return {
    success: true,
    action: 'hook_completed',
    message: '翻译已通过Hook XHR完成'
  };
}

// 辅助函数
function buildTranslationArray(subtitles: any[], results: any[]): any[] {
  return subtitles.map((sub, idx) => {
    const result = results.find(r => r.index === idx);
    return {
      text: sub.text,
      translation: result?.translatedText || sub.text,
      start: sub.start,
      end: sub.end || (sub.start + sub.duration)
    };
  });
}

function getCacheKey(videoId: string, sourceLang: string, targetLang: string, service: any): string {
  return `${videoId}_${sourceLang}_${targetLang}_${service.type}`;
}
```

---

### 11.4 会话缓存机制

#### 双层缓存架构

```typescript
// 1. 会话缓存（Main World - 立即可用）
window.__translationCache = {
  'videoId_en_zh-CN_google': [
    {
      text: 'Hello',
      translation: '你好',
      start: 0,
      end: 2
    },
    // ...
  ]
};

// 2. 持久化缓存（chrome.storage - Content Script/Service Worker管理）
chrome.storage.local.set({
  'translationCache_videoId_en_zh-CN_google': 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\n你好\n\n...'
});
```

#### 缓存键规则

```typescript
function getCacheKey(videoId: string, sourceLang: string, targetLang: string, service: string): string {
  return `${videoId}_${sourceLang}_${targetLang}_${service}`;
}

// 示例：
// videoId: 'dQw4w9WgXcQ'
// sourceLang: 'en'
// targetLang: 'zh-CN'
// service: 'google'
// → cacheKey: 'dQw4w9WgXcQ_en_zh-CN_google'
```

#### 缓存生命周期

```
第1次翻译（无缓存）:
  ↓
紧急翻译完成 → 保存到会话缓存
  ↓
批量翻译完成 → 保存到会话缓存 + 持久化缓存
  ↓
第2次打开同视频:
  ↓
检查持久化缓存 → 命中
  ↓
预加载到会话缓存
  ↓
第1次拦截 → 立即注入 → 完成（秒开）
```

---

### 11.5 与现有V4架构的集成点

#### 11.5.1 复用的组件

| 组件 | 用途 | 改动程度 |
|------|------|---------|
| **TwoPhaseTranslatorV4** | 两阶段翻译器 | ✅ 无需改动 |
| **AbortController机制** | 超时管理 | ✅ 无需改动 |
| **TranslationCacheManager** | 持久化缓存 | 🔧 需扩展会话缓存支持 |
| **RuntimeStateManager** | 状态管理 | ✅ 无需改动 |
| **triggerSubtitleButton()** | 字幕重载 | ✅ 无需改动（已有） |

#### 11.5.2 需要新增的组件

| 组件 | 位置 | 功能 |
|------|------|------|
| **hookSubtitleResponse()** | Main World | 拦截并修改响应 |
| **waitForUrgentTranslation()** | Main World | 阻塞等待机制 |
| **resolveUrgentTranslation()** | Main World | Promise解析 |
| **injectTranslation()** | Main World | 注入翻译到JSON3 |
| **会话缓存管理** | Main World | window.__translationCache |

#### 11.5.3 需要改动的消息类型

| 消息类型 | 方向 | 用途 |
|---------|------|------|
| `TRIGGER_SUBTITLE_LOAD_HOOK` | SW → CS → MW | 触发Hook模式字幕加载 |
| `REQUEST_URGENT_TRANSLATION` | MW → CS → SW | 请求紧急翻译 |
| `URGENT_TRANSLATION_READY` | SW → CS → MW | 紧急翻译完成 |
| `UPDATE_HOOK_CACHE` | SW → CS → MW | 更新会话缓存 |
| `RELOAD_SUBTITLE_HOOK` | SW → CS → MW | 触发字幕重载 |
| `PRELOAD_TRANSLATION_CACHE` | SW → CS → MW | 预加载缓存（有缓存时） |

---

### 11.6 实现优先级与步骤

#### Phase 1: 会话缓存机制（1天）

- [ ] Main World: 实现 `window.__translationCache`
- [ ] Content Script: 实现缓存预加载消息转发
- [ ] Service Worker: 实现缓存预加载逻辑
- [ ] 测试：缓存命中场景

#### Phase 2: 阻塞等待机制（1-2天）

- [ ] Main World: 实现 `waitForUrgentTranslation()`
- [ ] Main World: 实现 `resolveUrgentTranslation()`
- [ ] Main World: 实现 Promise 管理逻辑
- [ ] Content Script: 实现消息转发（REQUEST_URGENT_TRANSLATION / URGENT_TRANSLATION_READY）
- [ ] 测试：阻塞等待流程

#### Phase 3: 响应修改与注入（1天）

- [ ] Main World: 实现 `hookSubtitleResponse()`
- [ ] Main World: 实现 `injectTranslation()`
- [ ] Main World: 修改 Fetch/XHR 劫持逻辑
- [ ] 测试：响应修改和双语显示

#### Phase 4: Service Worker 集成（1天）

- [ ] Service Worker: 修改 `handleToggleTranslateV4()`
- [ ] Service Worker: 实现紧急翻译请求监听
- [ ] Service Worker: 实现批量翻译后重载
- [ ] 测试：完整流程（2次拦截）

#### Phase 5: 完整测试与优化（1天）

- [ ] E2E测试：首次翻译（无缓存）
- [ ] E2E测试：再次翻译（有缓存）
- [ ] E2E测试：超时和错误场景
- [ ] 性能测试：阻塞时间、内存占用
- [ ] 降级测试：SubtitleOverlay fallback

---

### 11.7 优势总结

#### vs 当前 SubtitleOverlay 方案

| 维度 | SubtitleOverlay | Hook XHR（方案C） |
|------|-----------------|------------------|
| **样式一致性** | ❌ 自定义样式，需手动同步 | ✅ YouTube原生样式 |
| **用户设置** | ❌ 不支持YouTube字幕设置 | ✅ 完全支持（大小、颜色等） |
| **维护成本** | ⭐⭐⭐ 需适配YouTube更新 | ⭐ YouTube自动适配 |
| **性能** | ⚠️ 额外DOM + MutationObserver | ✅ 无额外DOM开销 |
| **首次显示** | 立即（有字幕数据后） | 10秒（等紧急翻译） |
| **完整显示** | 立即 | 46秒（批量翻译完成） |
| **兼容性** | ⚠️ 可能被YouTube变更影响 | ✅ 劫持API稳定 |
| **实现复杂度** | ⭐⭐ 中等 | ⭐⭐⭐ 较高 |

#### 核心优势

✅ **完美融合**：翻译成为"假的原生字幕"，100%样式一致
✅ **用户设置生效**：字幕大小、颜色、透明度等完全支持
✅ **自动跟随**：拖动、缩放、全屏等自动适配
✅ **零性能开销**：只在请求时修改一次数据，无需持续监听
✅ **稳定性高**：不依赖DOM结构，YouTube更新不影响
✅ **快速响应**：10秒显示核心翻译，46秒自动升级完整版

---

## 测试计划

### 单元测试

- [ ] JSON3解析器测试
- [ ] 字幕文本提取测试
- [ ] 翻译数据注入测试
- [ ] 消息通信测试

### 集成测试

- [ ] Main World ↔ Content Script 通信测试
- [ ] Content Script ↔ Service Worker 通信测试
- [ ] 完整翻译流程测试

### E2E测试

- [ ] 字幕显示测试（双语模式）
- [ ] 字幕显示测试（仅译文模式）
- [ ] 字幕样式一致性测试
- [ ] 用户拖动字幕测试
- [ ] 全屏/剧场模式测试
- [ ] 窗口缩放测试
- [ ] 多语言切换测试

### 兼容性测试

- [ ] Chrome最新版测试
- [ ] Chrome稳定版测试
- [ ] 不同视频类型测试（直播、录播、Shorts）
- [ ] 不同字幕类型测试（手动字幕、自动字幕、社区字幕）

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| YouTube更新XHR逻辑 | 高 | 中 | 保留Overlay降级方案 |
| Manifest V3限制 | 高 | 低 | 已验证MAIN world支持 |
| 翻译API超时 | 中 | 中 | 超时保护 + 缓存 |
| 浏览器安全策略 | 高 | 低 | 测试验证 |
| 内存泄漏 | 中 | 低 | 及时清理pendingXHRs |

---

## 里程碑

### Phase 1: 原型验证（1-2天）
- [x] 控制台测试Hook XHR方案
- [ ] 验证JSON3格式解析
- [ ] 验证响应修改可行性

### Phase 2: 核心实现（3-5天）
- [ ] 实现Main World Script
- [ ] 实现消息通信机制
- [ ] 集成现有翻译逻辑

### Phase 3: 功能完善（2-3天）
- [ ] 支持双语/仅译文模式
- [ ] 实现降级策略
- [ ] 错误处理与日志

### Phase 4: 测试与优化（2-3天）
- [ ] 单元测试
- [ ] E2E测试
- [ ] 性能优化

### Phase 5: 发布（1天）
- [ ] 文档更新
- [ ] 版本发布
- [ ] 用户测试反馈

---

## 参考资料

### 技术文档
- [Chrome Extension Manifest V3 - Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Chrome Extension - Isolated Worlds](https://developer.chrome.com/docs/extensions/mv3/content_scripts/#isolated_world)
- [MDN - XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)
- [YouTube Player API](https://developers.google.com/youtube/iframe_api_reference)

### 相关Issue
- [YouTube字幕格式研究](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube.py)
- [Chrome Extension API限制](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-overview/)

---

## 总结

Hook XHR方案通过拦截YouTube的字幕数据请求，将翻译文本注入到原生字幕系统，实现了完美融合的双语字幕效果。

**核心优势：**
- ✅ 100%样式一致（YouTube负责渲染）
- ✅ 零性能开销（无需持续监听DOM）
- ✅ 用户设置生效（字幕大小、颜色等）
- ✅ 自动适配（拖动、缩放、全屏）

**实现要点：**
1. Main World Script执行Hook
2. 三层消息通信（Main ↔ Content ↔ Service）
3. 复用现有翻译逻辑
4. 保留Overlay作为降级方案

**下一步：**
开始Phase 1原型验证，确认技术可行性后进入实现阶段。

---

*文档版本: v1.0*
*最后更新: 2025-10-08*
*作者: Claude Code*
