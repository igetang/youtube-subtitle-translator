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

### 2.6 错误处理优化

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

### 2.7 Google翻译API优化

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

### 2.8 微软翻译API双路径实现与优化

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

### 3.4 翻译API切换问题

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

### 3.5 侧边栏UI简化

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

2. 更新JS代码，仅保留免费API的处理逻辑：
```typescript
const defaultSettings = {
  translationApi: 'google-free', // 设置Google为默认选项
  // ... 其他设置 ...
};

const apiInfoMap = {
  'google-free': { name: 'Google翻译', infoUrl: 'https://translate.google.com/' },
  'youdao-free': { name: '有道翻译', infoUrl: 'https://fanyi.youdao.com/' },
  'microsoft-free': { name: '微软翻译', infoUrl: 'https://www.bing.com/translator' },
  'mock': { name: '模拟翻译', infoUrl: '#' }
};
```

3. 移除了所有API密钥相关的面板和处理，简化界面：
```typescript
function updateApiPanels() {
  // 所有面板都隐藏，因为免费API不需要密钥
  document.querySelectorAll('.api-key-panel').forEach(panel => {
    panel.classList.add('hidden');
  });
}
```

## 4. 翻译API详细说明

### 4.1 Google翻译 (google-free)

**优点**：
* 无需API密钥，可直接调用
* 支持大量语言对
* 翻译质量稳定

**实现细节**：
* 使用非官方API端点 `translate.googleapis.com/translate_a/single`
* 支持批处理翻译，每批最多10条文本
* 添加500ms批次间延迟，避免限流

**限制**：
* 可能存在IP请求频率限制
* 单次请求文本长度限制
* 不保证长期可用性

### 4.2 有道翻译 (youdao-free)

**优点**：
* 无需API密钥
* 对中文翻译质量较好
* 响应速度快

**实现细节**：
* 使用端点 `fanyi.youdao.com/translate`
* 通过自定义语言代码映射处理有道特殊的语言格式
* 实现批处理和请求延迟

**限制**：
* 支持的语言对比Google少
* 较为严格的IP请求限制

### 4.3 微软/Bing翻译 (microsoft-free)

**优点**：
* 无需API密钥，使用Edge浏览器认证令牌
* 翻译质量优秀
* 双路径实现提供高可靠性

**实现细节**：
* 路径A使用`api.cognitive.microsofttranslator.com`端点
* 路径B使用`api-edge.cognitive.microsofttranslator.com`端点
* 两条路径均通过`Authorization: Bearer`方式传递令牌
* 模拟Edge浏览器用户代理和请求头
* 差异化批处理策略增强整体稳定性

**认证流程**：
* 通过`https://edge.microsoft.com/translate/auth`获取临时令牌
* 令牌有效期较短，每次请求前重新获取
* 设置合适的Origin和Referer头部减少被拒风险

**限制**：
* 令牌获取可能受到地区和网络环境影响
* 未记录的API，微软可能随时更改
* 批量请求有数量和频率限制

**错误处理**：
* 详细的错误信息捕获和日志记录
* 自动路径切换机制，提高整体成功率
* 处理各种常见错误情况（认证失败、格式异常等）

### 4.4 模拟翻译 (mock)

**用途**：
* 开发测试使用
* 离线调试
* 性能基准测试

**实现细节**：
* 简单添加"[已翻译]"前缀
* 无网络请求，立即返回
* 支持所有语言代码组合

## 5. 后续开发计划

### 5.1 功能增强
* **字幕样式自定义**：允许用户调整字体、大小、颜色、背景透明度等
* **字幕位置调整**：提供控件调整字幕在屏幕上的位置
* **翻译缓存机制**：保存已翻译内容，减少API调用，提升性能
* **离线翻译功能**：基于WebAssembly实现本地翻译能力

### 5.2 用户体验优化
* **键盘快捷键**：添加快捷键控制翻译开关和设置面板
* **字幕预览**：在侧边栏中提供翻译效果预览
* **历史记录**：保存近期观看的视频和使用的翻译设置
* **导出/导入设置**：允许用户备份和恢复自定义设置

### 5.3 技术优化
* **性能监控**：添加性能指标收集，监测资源使用情况
* **代码模块化**：进一步拆分大文件，提高代码可维护性
* **自动化测试**：实现单元测试和E2E测试
* **国际化支持**：使用Chrome i18n API支持多语言界面

### 5.4 发布准备
* **用户文档**：创建详细的使用指南
* **隐私政策**：编写符合Chrome商店要求的隐私政策
* **宣传材料**：准备商店截图和演示视频
* **收集反馈**：建立用户反馈渠道 