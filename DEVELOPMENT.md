# 开发文档 - YouTube 双语字幕 Chrome 扩展

本文档记录项目的开发过程、技术决策和实现细节。

## 1. 项目架构与技术选型

* **Chrome 扩展框架**：采用 Manifest V3 规范
* **开发语言**：TypeScript
* **构建工具**：Vite，配置多入口构建
* **扩展组件**：
  * 内容脚本 (`content-script.ts`)：负责与YouTube页面交互
  * 主世界脚本 (`main-world.ts`)：在页面主执行环境中运行，获取视频字幕轨道
  * 后台脚本 (`background.ts`)：处理扩展级别事件和侧边栏管理，处理翻译请求
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

### 2.5 多种翻译API实现

扩展实现了多种免费翻译API的支持：

1. **Google翻译API**：
   ```typescript
   async function translateWithGoogleFree(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
     const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t`;
     
     // 批处理文本，避免请求过大
     const batchResults = [];
     for (let i = 0; i < texts.length; i += BATCH_SIZE) {
       const batch = texts.slice(i, i + BATCH_SIZE);
       const batchTranslations = await translateBatchWithGoogleFree(batch, url);
       batchResults.push(...batchTranslations);
       
       // 添加延迟避免API限流
       if (i + BATCH_SIZE < texts.length) {
         await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
       }
     }
     
     return batchResults;
   }
   ```

2. **有道翻译API**：
   ```typescript
   async function translateWithYoudao(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
     // 将语言代码转换为有道支持的格式
     const mappedSourceLang = mapToYoudaoLangCode(sourceLang);
     const mappedTargetLang = mapToYoudaoLangCode(targetLang);
     
     const url = `https://fanyi.youdao.com/translate?&doctype=json&type=${mappedSourceLang}2${mappedTargetLang}`;
     
     // 批处理文本
     const batchResults = [];
     for (let i = 0; i < texts.length; i += BATCH_SIZE) {
       const batch = texts.slice(i, i + BATCH_SIZE);
       const batchTranslations = await translateBatchWithYoudao(batch, url);
       batchResults.push(...batchTranslations);
       
       // 添加延迟避免API限流
       if (i + BATCH_SIZE < texts.length) {
         await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
       }
     }
     
     return batchResults;
   }
   ```

3. **微软/Bing翻译API**：
   ```typescript
   async function translateWithMicrosoft(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
     const mappedSourceLang = mapToMicrosoftLangCode(sourceLang);
     const mappedTargetLang = mapToMicrosoftLangCode(targetLang);
     
     const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${mappedSourceLang}&to=${mappedTargetLang}`;
     
     // 批处理文本
     const batchResults = [];
     for (let i = 0; i < texts.length; i += BATCH_SIZE) {
       const batch = texts.slice(i, i + BATCH_SIZE);
       const batchTranslations = await translateBatchWithMicrosoft(batch, url);
       batchResults.push(...batchTranslations);
       
       if (i + BATCH_SIZE < texts.length) {
         await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
       }
     }
     
     return batchResults;
   }
   ```

4. **API测试功能实现**：
   ```typescript
   async function testApiKey(api: string): Promise<{ success: boolean; message: string }> {
     try {
       // 准备测试文本
       const testText = "Hello, this is a test message.";
       let result = "";
       
       // 根据API类型调用相应的翻译函数
       switch(api) {
         case 'google-free':
           result = await translateTestTextWithGoogleFree(testText);
           break;
         case 'youdao-free':
           result = await translateTestTextWithYoudao(testText);
           break;
         case 'microsoft-free':
           result = await translateTestTextWithMicrosoft(testText);
           break;
         default:
           return { success: false, message: "未知的API类型" };
       }
       
       return { 
         success: true, 
         message: `API测试成功！翻译结果: "${result}"` 
       };
     } catch (error) {
       return { 
         success: false, 
         message: `API测试失败: ${error.message}` 
       };
     }
   }
   ```

### 2.6 OpenAI模型选项更新 (2024-05)

为支持最新的AI翻译技术，我们对扩展中的OpenAI模型选项进行了全面更新：

#### 模型列表更新

基于最新OpenAI API文档和用户需求，我们更新了侧边栏中的模型选择列表：

```html
<select id="openai-model" name="openai-model">
  <option value="gpt-4.1">gpt-4.1</option>
  <option value="gpt-4.1-mini">gpt-4.1-mini</option>
  <option value="gpt-4.1-nano">gpt-4.1-nano</option>
  <option value="gpt-4o">gpt-4o</option>
  <option value="gpt-4o-mini">gpt-4o-mini</option>
  <option value="custom">自定义...</option>
</select>
```

- **移除** 过于昂贵或老旧模型：`gpt-4`、`gpt-o3` 系列、`o4-mini` 等
- **保留** 主力系列和精简版本：`gpt-4.1` / `gpt-4.1-mini` / `gpt-4.1-nano` / `gpt-4o` / `gpt-4o-mini`
- **自定义** 选项仍然可用，支持用户输入任意模型 ID

#### 技术实现细节

前端改动：
1. 更新 `sidepanel.html` 中 `<select id="openai-model">` 元素
2. 保持 `sidepanel.ts` 和 `background.ts` 中消息传递及处理逻辑不变

#### 用户体验与性能考量

1. **成本与性能平衡**：移除成本高且老旧的模型，保留通用性强、性能表现好的模型系列
2. **界面简洁化**：用户下拉列表更加精炼，无需在大量模型间选择
3. **灵活性保留**：`custom` 选项支持探索其他模型

### 2.7 错误处理优化

改进了翻译失败时的用户体验：

1. **错误提示与源字幕分离显示**：
   ```typescript
   function handleSubtitleUpdate(currentTime) {
     // ... 现有代码 ...
     
     if (translateError) {
       // 创建错误消息和源字幕的分离显示
       const errorElement = document.createElement('span');
       errorElement.style.color = 'red';
       errorElement.textContent = `翻译错误: ${translateError}`;
       
       const sourceElement = document.createElement('span');
       sourceElement.style.color = 'white';
       sourceElement.textContent = sourceText;
       
       overlayInner.innerHTML = '';
       overlayInner.appendChild(errorElement);
       overlayInner.appendChild(document.createElement('br'));
       overlayInner.appendChild(sourceElement);
     } else {
       // 正常显示逻辑
       overlayInner.textContent = textToShow;
     }
   }
   ```

2. **错误类型区分**：
   ```typescript
   try {
     translatedTexts = await translateFunction(textsToTranslate, sourceLang, targetLang);
   } catch (error) {
     console.error(`翻译失败: ${error.message}`);
     
     // 区分不同错误类型
     if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
       translateError = "网络连接错误，请检查网络连接";
     } else if (error.message.includes('rate limit')) {
       translateError = "API请求频率限制，请稍后重试";
     } else if (error.message.includes('403')) {
       translateError = "API访问被拒绝，可能需要更换IP或等待一段时间";
     } else {
       translateError = error.message;
     }
     
     // 使用源语言文本作为回退
     translatedTexts = textsToTranslate;
   }
   ```

### 2.8 Google翻译API优化

为提高Google免费翻译API的可靠性和成功率，实现了双路径请求策略：

1. **双路径策略**：
   - 路径A：使用 `/translate_a/single` 端点（主要路径）
   - 路径B：使用 `/translate_a/t` 端点（备选路径）

2. **关键问题修复**：
   ```typescript
   // 路径B实现优化前（有问题）
   const url = `https://translate.googleapis.com/translate_a/t?client=webapp&sl=${sourceLang}&tl=${targetLang}&hl=auto&dt=at&dt=bd&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&dt=t&source=bh&ssel=0&tsel=0&kc=1&tk=${generateGoogleTk(subtitle.text)}`;
   const options = {
     method: 'POST', // 错误：使用POST方法
     headers: {
       'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
       // ...其他头部
     },
     body: `q=${encodeURIComponent(subtitle.text)}` // 在请求体中传参
   };
   ```
   
   ```typescript  
   // 路径B实现优化后（修复）
   const url = `https://translate.googleapis.com/translate_a/t?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(subtitle.text)}`;
   const options = {
     method: 'GET', // 修正：使用GET方法
     headers: {
       'Accept': '*/*',
       // ...其他头部
     }
     // 无请求体，参数在URL中
   };
   ```

3. **主要改进**：
   - 修改请求方法：从 `POST` 改为 `GET`
   - 简化请求参数：仅保留必要参数
   - 修改client参数：从 `webapp` 改为 `gtx`
   - 移除自定义tk令牌：减少失败可能性

4. **自动故障转移**：
   ```typescript
   // 尝试双路径翻译，自动故障转移
   try {
     // 首先尝试路径A
     return await googleTranslatePathA(subtitles, sourceLang, targetLang);
   } catch (error) {
     console.warn(`Google翻译路径A失败: ${error.message}`);
     try {
       // 如果路径A失败，尝试路径B
       return await googleTranslatePathB(subtitles, sourceLang, targetLang);
     } catch (secondError) {
       throw new Error(`所有Google翻译路径均失败`);
     }
   }
   ```

5. **优化成效**：
   - 提高了API请求成功率
   - 增强了翻译过程的稳定性
   - 减少了由于API变化导致的失败

### 2.9 微软翻译API双路径实现与优化

为提高微软翻译服务的可靠性和稳定性，我们实现了双路径策略并解决了关键认证问题：

1. **认证问题分析与解决**：
   
   我们最初根据一些参考文档实现了微软翻译API的双路径策略，但路径B（使用`api-edge`端点）一直失败，返回401错误：
   ```
   {"error":{"code":401001,"message":"The request is not authorized because credentials are missing or invalid."}}
   ```
   
   通过系统性测试发现：
   - 路径A (`api.cognitive...`)：使用`Authorization: Bearer ${token}`认证方式成功
   - 路径B (`api-edge...`)：尝试使用`Ocp-Apim-Subscription-Key`和`Ocp-Apim-Subscription-Region`认证方式失败
   - 当尝试在路径B中也使用`Authorization: Bearer ${token}`认证方式时，成功了

2. **测试验证过程**：
   ```typescript
   // 伪代码：我们测试了三种方式
   // 方案1：Ocp-Apim-Subscription-Key + Region (失败401)
   // 方案2：Authorization Bearer (成功200)
   // 方案3：Ocp-Apim-Subscription-Key 无Region (失败401)
   ```

3. **最终实现差异**：
   
   两条路径的主要区别：
   ```typescript
   // 路径A
   const translationUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}`;
   
   // 路径B
   const translationUrl = `https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}&includeSentenceLength=true`;
   ```
   
   两条路径共同使用：
   ```typescript
   headers: {
     'Content-Type': 'application/json',
     'Authorization': `Bearer ${authToken}`,
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
     // ...其他请求头
   }
   ```
   
   批处理策略差异：
   ```typescript
   // 路径A
   const batchSize = 10;
   await new Promise(resolve => setTimeout(resolve, 500));
   
   // 路径B
   const batchSize = 3;
   await new Promise(resolve => setTimeout(resolve, 1500));
   ```

4. **增强的错误处理**：
   ```typescript
   if (!response.ok) {
     // 尝试获取详细错误信息
     let errorDetail = '';
     try {
       errorDetail = await response.text();
     } catch (e) {
       errorDetail = '无法获取详细错误信息';
     }
     
     throw new Error(`微软翻译路径B请求失败，状态码: ${response.status}，错误详情: ${errorDetail}`);
   }
   ```

5. **关于DNR规则**：
   
   尽管一些参考资料建议使用DNR（Declarative Net Request）规则修改请求头以模拟Edge浏览器，但我们的测试表明通过直接设置合适的User-Agent和其他关键请求头，无需使用DNR规则也能成功调用两个端点。

通过这些优化，我们确保了微软翻译API的高可用性和稳定性。即使一条路径出现问题，系统会自动切换到另一条路径，为用户提供连续的翻译服务。

## 3. 问题排查与修复

### 3.1 翻译API测试后字幕不显示问题

#### 问题描述

在实现多种翻译API支持并提供测试功能后，发现当用户测试完谷歌和微软翻译API后，会出现视频字幕完全不显示的问题。具体表现为：

1. 翻译按钮保持"开启"状态（按钮图标显示正确）
2. 屏幕上没有任何字幕显示（即使视频中有对话）
3. 用户需要手动关闭后再开启翻译按钮才能恢复字幕显示

#### 排查过程

1. **问题复现**：首先确认了问题的可复现性，通过以下步骤可稳定复现：
   - 打开YouTube视频并开启翻译功能（字幕正常显示）
   - 打开侧边栏并测试微软翻译API
   - 测试谷歌翻译API
   - 返回视频，发现字幕不再显示，但翻译开关仍为开启状态

2. **日志分析**：检查控制台日志，发现以下关键信息：
   ```
   [Debug] Processed 0 subtitle events. Listing below:
   字幕数据处理和合并完成，启动显示循环。
   启动字幕显示循环 (requestAnimationFrame)
   ```
   
   这表明系统确实试图启动字幕显示循环，但处理后的字幕事件列表为空。

3. **代码检查**：检查了关键函数的实现，发现了几个潜在问题点：
   
   a. `startTranslationProcess` 函数中获取翻译结果后处理：
   ```typescript
   try {
     // API调用代码...
     translationResults = response.translatedSubtitles;
   } catch (error) {
     // 设置错误信息，但translationResults维持为null
     translationError = `使用${apiDisplayName}翻译服务失败，请切换翻译服务`;
   }
   
   // 后续直接使用可能为null的translationResults
   processedSubtitleEvents = mergeSubtitleData(
     sourceEvents,
     needsTranslation ? translationResults : nativeTargetEvents,
     targetLang
   );
   ```

   b. `mergeSubtitleData` 函数缺少对null输入的严格处理：
   ```typescript
   function mergeSubtitleData(sourceEvents, targetEventsOrTranslations, targetLangCode) {
     // 没有检查sourceEvents是否为空
     // 没有检查targetEventsOrTranslations是否为null
     
     const isTargetNative = Array.isArray(targetEventsOrTranslations);
     const translations = isTargetNative ? null : targetEventsOrTranslations;
     
     // 如果translations为null，这里会出现问题
   }
   ```

   c. `setTranslateActive` 函数在切换状态时缺乏清理机制：
   ```typescript
   async function setTranslateActive(active: boolean): Promise<void> {
     translateActive = active;
     // 更新图标...
     // 保存到存储...
     // 缺少对processedSubtitleEvents的清理
   }
   ```

4. **根本原因确认**：通过插入调试日志，确认当翻译API测试失败时，`translationResults`变量为null，导致`mergeSubtitleData`无法正确合并字幕数据，生成的`processedSubtitleEvents`数组为空，即便有可用的源字幕也不会显示。

#### 解决方案

实现了多层次的防护机制，确保即使翻译失败也能保持字幕显示：

1. **确保翻译结果不为null**：
```typescript
// 确保translationResults变量不为null
if (needsTranslation && !translationResults) {
  console.warn('[警告] translationResults为null，创建空对象避免后续处理错误');
  translationResults = {};
}
```

2. **添加字幕数据保底机制**：
```typescript
// 添加额外检查以确保字幕事件有效
if (processedSubtitleEvents.length === 0 && sourceEvents.length > 0) {
  console.warn('[警告] 合并后的字幕事件为空但源字幕存在，直接使用源字幕');
  // 如果合并后的事件为空但源事件存在，直接使用源事件
  processedSubtitleEvents = sourceEvents.map(event => ({
    start: event.start,
    end: event.end,
    sourceText: event.text,
    targetText: null,
    sourceLangCode: event.langCode,
    targetLangCode: targetLang
  }));
}
```

3. **优化合并函数代码**：
```typescript
function mergeSubtitleData(
  sourceEvents: { start: number; end: number; text: string; langCode: string }[],
  targetEventsOrTranslations: { start: number; end: number; text: string; langCode: string }[] | { [id: string]: string } | null,
  targetLangCode: string
): SubtitleEvent[] {
  // 如果源事件为空，直接返回空数组
  if (!sourceEvents || sourceEvents.length === 0) {
    console.warn("源字幕事件为空，无法合并");
    return [];
  }

  // 添加日志输出
  if (!targetEventsOrTranslations) {
    console.warn("目标字幕/翻译为null，将只使用源字幕");
  }
  
  // 其余合并逻辑...
}
```

4. **完善状态切换函数**：
```typescript
async function setTranslateActive(active: boolean): Promise<void> {
  // 获取之前的状态，以便执行适当的清理
  const wasActive = translateActive;
  translateActive = active;
  
  // 更新图标...
  
  // 如果是从开启状态切换到关闭状态，执行必要的清理
  if (wasActive && !active) {
    // 停止字幕更新循环
    stopSubtitleUpdates();
    // 清空字幕数据
    processedSubtitleEvents = [];
    console.log('翻译关闭，已清理字幕显示和数据');
  }
  
  // 保存到存储...
}
```

5. **优化字幕显示逻辑**：
```typescript
// 非错误情况下，使用普通文本
subtitleOverlayElement.innerHTML = '';
if (textToShow) { // 添加空字符串检查
  subtitleOverlayElement.innerText = textToShow;
}
```

#### 验证结果

优化后再次进行测试，确认了以下改进：

1. 即使翻译API测试失败，字幕功能也能继续工作
2. 当翻译服务出现问题时，会自动降级到显示原始字幕
3. 翻译开关状态变化时能正确清理旧状态
4. 添加了详细的日志输出，便于问题排查
5. 提高了整个字幕系统的鲁棒性

通过这次问题修复，不仅解决了特定场景下的字幕显示问题，也提升了整个字幕处理流程的容错能力，为用户提供了更稳定的体验。

### 3.2 构建错误：非法HTML标记

**问题**：构建时出现错误，文件末尾存在非法HTML标记`</rewritten_file>`。
**解决**：使用命令行工具提取有效内容并覆盖原文件。
```bash
head -n 1720 content/content-script.ts > content/content-script-fixed.ts && 
mv content/content-script-fixed.ts content/content-script.ts
```

### 3.3 按钮注入和重复问题

**问题**：页面导航后，控制按钮会重复注入。
**解决**：
* 在导航处理函数中主动查找并移除旧按钮
* 保持`injectControls`中的双重检查（状态标志 + DOM检查）

### 3.4 字幕自动恢复问题

**问题**：在视频间导航时，即使翻译开关为"开启"状态，也不会自动显示字幕。
**解决**：
* 将核心翻译启动逻辑封装到`startTranslationProcess`函数
* 在按钮注入成功后根据`translateActive`状态自动调用此函数
* 清理观察者中的冗余逻辑

### 3.5 翻译API切换问题

**问题**：切换翻译API后，字幕不会自动更新使用新API。
**解决**：
```typescript
// 在内容脚本的storage.onChanged监听器中添加处理
chrome.storage.onChanged.addListener((changes) => {
  // ... 现有代码 ...
  
  // 处理API变化
  if (changes.translationApi && translateActive) {
    console.log('翻译API变更，重新启动翻译流程');
    startTranslationProcess();
  }
});
```

### 3.6 侧边栏UI简化

**问题**：侧边栏中显示了太多API选项，包括付费和自定义API，使界面复杂且混乱。
**解决**：
1. 简化HTML结构，移除所有付费API选项：
```html
<select id="translation-api">
  <option value="google-free">Google翻译</option>
  <option value="youdao-free">有道翻译</option>
  <option value="microsoft-free">微软翻译</option>
  <option value="mock">模拟翻译</option>
</select>
```