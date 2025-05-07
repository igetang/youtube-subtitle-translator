# 开发文档 - YouTube 双语字幕 Chrome 扩展

本文档记录项目的开发过程、技术决策和实现细节。

## 1. 项目架构与技术选型

* **Chrome 扩展框架**：采用 Manifest V3 规范
* **开发语言**：TypeScript
* **构建工具**：Vite，配置多入口构建
* **扩展组件**：
  * 内容脚本 (`content-script.ts`)：负责与YouTube页面交互
  * 主世界脚本 (`main-world.ts`)：在页面主执行环境中运行，获取视频字幕轨道
  * 后台脚本 (`background.ts`)：处理扩展级别事件和侧边栏管理
  * 侧边栏 (`sidepanel/`)：用户设置界面，基于HTML/CSS/TS实现

## 2. 核心功能实现

### 2.1 字幕轨道数据获取

YouTube页面动态加载特性使从内容脚本直接获取字幕轨道数据变得不稳定。为解决此问题：

1. 注入主世界脚本访问YouTube播放器API：
```typescript
// 主世界脚本中
const player = document.getElementById('movie_player');
const playerResponse = player.getPlayerResponse();
const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
```

2. 通过`window.postMessage`建立隔离世界与主世界间通信：
```typescript
// 内容脚本发送请求
window.postMessage({
    source: 'content-script',
    type: 'REQUEST_CAPTION_TRACKS'
}, '*');

// 主世界脚本响应
window.postMessage({
    source: 'main-world',
    type: 'CAPTION_TRACKS_RESPONSE',
    payload: { captionTracks }
}, '*');
```

3. 在内容脚本中基于Promise处理异步请求和响应，包含超时处理

### 2.2 YouTube导航处理

YouTube作为单页应用，页面导航不会重新加载整个页面，导致按钮重复注入、字幕状态不同步等问题。解决方案：

1. 监听YouTube自定义事件`yt-navigate-finish`
2. 在导航事件触发时执行状态重置和DOM清理：
```typescript
function handleYoutubeNavigation() {
    // 停止字幕更新循环
    stopSubtitleUpdates();
    
    // 重置轨道和字幕数据
    cachedCaptionTracks = null;
    tracksInfoFetched = false;
    processedSubtitleEvents = [];
    
    // 主动清理旧DOM元素
    const existingButtons = document.querySelectorAll('.vid-translate-button');
    existingButtons.forEach(button => button.remove());
    
    // 重置注入标志
    controlsInjected = false;
    
    // 通知其他组件导航事件
    chrome.runtime.sendMessage({ action: 'youtubeNavigationFinished' });
    
    // 重新应用字幕模式
    if (currentSubtitleMode) {
        applySubtitleMode(currentSubtitleMode);
    } else {
        initializeSubtitleMode();
    }
}
```

3. 实现导航广播机制，通知侧边栏等组件更新状态

### 2.3 字幕模式切换与同步

为在多个组件间（侧边栏、内容脚本）保持字幕模式设置的一致性：

1. 使用`chrome.storage.sync`作为持久化存储
2. 实现双重同步机制：

   侧边栏保存设置并通知内容脚本：
   ```typescript
   // 保存到storage
   chrome.storage.sync.set({ subtitleMode: mode });
   
   // 直接通知当前标签页
   chrome.tabs.sendMessage(tabId, {
      action: 'subtitleModeUpdated',
      mode: mode
   });
   ```

   内容脚本通过两种方式接收更新：
   ```typescript
   // 直接消息监听
   chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'subtitleModeUpdated') {
         applySubtitleMode(request.mode);
      }
   });
   
   // 存储变化监听（备用路径）
   chrome.storage.onChanged.addListener((changes) => {
      if (changes.subtitleMode) {
         applySubtitleMode(changes.subtitleMode.newValue);
      }
   });
   ```

3. 使用全局变量`currentSubtitleMode`缓存当前模式，减少存储读取

### 2.4 字幕显示顺序优化

为提升用户体验，改变双语字幕的显示顺序：

1. **优化前**：源语言（原视频语言）在上，目标语言（翻译后语言）在下
2. **优化后**：目标语言（用户熟悉的语言）在上，源语言在下

实现方式简单但效果显著：
```typescript
// 优化前
textToShow = `${sourceText}\n${targetText}`;

// 优化后
textToShow = `${targetText}\n${sourceText}`;
```

优化理由：
* 符合自上而下的阅读习惯，先看到熟悉的语言
* 减少认知负担，即使不了解源语言也能立即理解内容
* 提高内容浏览效率

## 3. 问题排查与修复

### 3.1 构建错误：非法HTML标记

**问题**：构建时出现错误，文件末尾存在非法HTML标记`</rewritten_file>`。
**解决**：使用命令行工具提取有效内容并覆盖原文件。
```bash
head -n 1720 content/content-script.ts > content/content-script-fixed.ts && 
mv content/content-script-fixed.ts content/content-script.ts
```

### 3.2 按钮注入和重复问题

**问题**：页面导航后，控制按钮会重复注入。
**解决**：
* 在导航处理函数中主动查找并移除旧按钮
* 保持`injectControls`中的双重检查（状态标志 + DOM检查）

### 3.3 字幕自动恢复问题

**问题**：在视频间导航时，即使翻译开关为"开启"状态，也不会自动显示字幕。
**解决**：
* 将核心翻译启动逻辑封装到`startTranslationProcess`函数
* 在按钮注入成功后根据`translateActive`状态自动调用此函数
* 清理观察者中的冗余逻辑

## 4. 后续开发计划

### 4.1 翻译功能增强
* 接入更多翻译API选项
* 优化翻译缓存机制减少API调用
* 实现离线翻译功能

### 4.2 用户界面优化
* 完善侧边栏设置界面
* 添加更多字幕样式自定义选项
* 实现字幕位置调整功能

### 4.3 性能优化
* 减少DOM操作频率
* 优化字幕渲染算法
* 实现更高效的缓存机制

### 4.4 测试与质量保证
* 添加单元测试和集成测试
* 实现自动化测试流程
* 扩展浏览器兼容性测试 