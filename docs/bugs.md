# YouTube 字幕翻译扩展 - 错误日志

本文档记录项目中已发现和已解决的Bug，以及待解决的问题。

## 已解决的Bug

### Bug #1: 导航后字幕不自动启动 (2025-05-15)

**问题描述**：
在视频A开启翻译后，切换到视频B。虽然翻译按钮的图标因状态从`chrome.storage`读取而保持"开启"，但视频B不会自动显示字幕，需要手动关闭再开启一次。

**问题原因**：
`handleYoutubeNavigation`在导航时正确重置了内部状态，但缺少一个机制在新页面加载完成后，根据已激活的`translateActive`状态自动触发新字幕的获取和显示流程。

**解决方案**：
1. 将核心的翻译启动逻辑（查找video -> 获取轨道 -> 获取字幕 -> 处理 -> 启动循环）封装到新的异步函数`startTranslationProcess`
2. 修改`injectControls`函数，让它在成功注入按钮之后，检查当前的`translateActive`状态，如果为`true`，则调用`startTranslationProcess`
3. 移除`MutationObserver`中的旧逻辑，明确其职责仅为在需要时调用`injectControls`

**涉及的文件**：
- `content/content-script.ts`

### Bug #2: 导航时按钮重复注入 (2025-05-15)

**问题描述**：
解决了Bug #1后，切换视频时字幕能自动启动了，但每次导航都会在播放器控件栏上添加一对新的翻译和设置按钮。

**问题原因**：
`MutationObserver`在导航后短时间内可能多次触发`injectControls`。YouTube的SPA特性导致旧页面的DOM元素可能不会立即被完全移除。

**解决方案**：
1. 修改`handleYoutubeNavigation`函数，在重置`controlsInjected`标志之前，增加通过`getElementById`查找并调用`.remove()`来移除旧按钮的代码
2. 保持`injectControls`的双重检查（检查`controlsInjected`标志和`getElementById`查找按钮）作为最终保障

**涉及的文件**：
- `content/content-script.ts`

### Bug #3: 侧边栏打开权限错误 (2025-05-15)

**问题描述**：
点击设置按钮后，侧边栏无法打开，控制台出现错误：`Error: This function must be called during a user gesture`。

**问题原因**：
因为`await`阻塞导致丢失用户手势上下文，无法调用`chrome.sidePanel.open()`。Chrome扩展API要求某些功能必须在用户交互（如点击）的直接响应中调用。

**解决方案**：
重新设计消息传递顺序，确保在用户手势上下文中调用`chrome.sidePanel.open()`：
1. 设置按钮点击事件中，立即发送消息到背景脚本请求打开侧边栏
2. 背景脚本接收消息后立即调用`chrome.sidePanel.open()`
3. 之后再异步获取可用轨道数据

**涉及的文件**：
- `content/content-script.ts`
- `background/background.ts`

### Bug #4: 原生按钮消失问题 (2025-05-15)

**问题描述**：
注入自定义按钮后，播放器控制栏中的某些原生按钮（如画中画、全屏等）有时会消失。

**问题原因**：
注入自定义按钮时使用了额外`div`容器，干扰了YouTube布局。

**解决方案**：
改为直接注入`<button>`元素，不使用额外的容器，并确保CSS样式与YouTube原生按钮一致。

**涉及的文件**：
- `content/content-script.ts`

### Bug #5: 按钮垂直对齐问题 (2025-05-15)

**问题描述**：
自定义按钮在控制栏中垂直位置偏低，与其他按钮不对齐。

**问题原因**：
按钮CSS样式与YouTube原生按钮不一致，特别是在垂直对齐方面。

**解决方案**：
通过调整按钮`<button>`的CSS：
1. 设置`display: inline-flex`
2. 添加`align-items: center`
3. 移除可能导致冲突的样式

**涉及的文件**：
- `content/content-script.ts`

### Bug #6: 字幕容器样式匹配问题 (2025-05-15)

**问题描述**：
自定义字幕叠加层在宽度和换行行为上与YouTube原生字幕不一致，导致显示效果差异。

**问题原因**：
字幕容器CSS样式未完全匹配YouTube原生字幕样式。

**解决方案**：
采用双层结构（包装容器+内容容器）并精确匹配原生字幕样式：
1. 设置`max-width: 93%`限制最大宽度
2. 添加`white-space: pre-wrap`保持换行
3. 使用`text-align: center`居中显示
4. 设置合适的字体大小和行高

**涉及的文件**：
- `content/content-script.ts`

### Bug #7: 翻译API测试后字幕不显示 (2025-05-15)

**问题描述**：
在使用谷歌或微软翻译API的测试功能后，视频字幕不再显示。翻译按钮仍显示为"开启"状态，但屏幕上没有字幕出现。需要用户手动关闭后再开启翻译才能恢复显示。

**问题原因**：
翻译API测试过程中可能出现错误，导致翻译结果为null。字幕合并逻辑(`mergeSubtitleData`函数)缺少对空值和异常情况的处理。当错误情况未被妥善处理时，导致最终处理后的字幕事件数组为空。

**解决方案**：
1. 完善空值处理：确保`translationResults`变量即使在翻译失败时也不会为null
   ```typescript
   if (needsTranslation && !translationResults) {
     translationResults = {}; // 使用空对象代替null
   }
   ```

2. 添加保底机制：当合并后的字幕事件为空但源字幕存在时，直接使用源字幕
   ```typescript
   if (processedSubtitleEvents.length === 0 && sourceEvents.length > 0) {
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

3. 添加翻译失败用户提示：翻译失败时显示友好提示，告知用户切换翻译服务
   ```typescript
   translationError = `使用${apiDisplayName}翻译服务失败，请切换翻译服务`;
   ```

**涉及的文件**：
- `content/content-script.ts`
- `background/background.ts`

### Bug #16: TypeScript类型错误和编译警告 (2025-05-24)

**问题描述**：
项目中存在大量TypeScript类型错误和编译警告，特别是EventBus相关代码中的隐式any类型、可能为undefined的变量使用和类型冲突问题。这些警告在构建过程中不会导致失败，但会影响代码质量和稳定性。

**问题原因**：
1. EventBus类未定义属性和方法的明确类型
2. 在content-script.ts中多处直接使用eventBus而没有检查其是否为undefined
3. main-world.ts和content-script.ts中存在重复声明的变量（EventTypes和eventBus）
4. 全局Window接口扩展方式不符合TypeScript模块规范

**解决方案**：
1. 为EventBus类添加完整的TypeScript类型声明：
   - 为属性添加明确类型（如Map<string, Array<{...}>）
   - 为方法添加参数和返回值类型签名
   - 添加非空断言（!）处理可能为null的情况

2. 改进eventBus使用安全性：
   - 在所有直接使用eventBus的地方添加非空断言（eventBus!）
   - 使用safeEmit函数代替直接调用eventBus.emit
   - 始终通过getEventBus()函数检查可用性

3. 解决重复声明问题：
   - 重命名接口为EventTypesConstType避免冲突
   - 将变量名从EventTypes改为EventTypesConst
   - 在main-world.ts中将eventBus改名为eventBusInstance

4. 修复Window接口扩展：
   - 创建EventBusModule接口描述模块结构
   - 使用正确的TypeScript模块语法
   - 添加export {}确保文件被视为模块

**涉及的文件**：
- `content/main-world.ts`
- `content/content-script.ts`

### Bug #15: EventBus模块未加载或不可用问题 (2025-05-23)

**问题描述**：
在控制台中频繁出现"EventBus模块未加载或不可用"的错误，导致许多基于事件的功能失效，包括导航状态追踪、初始化流程和DOM元素创建等关键功能。

**问题原因**：
EventBus模块的初始化和共享机制存在设计缺陷：
1. content-script.ts尝试从window.eventBusModule获取eventBus和EventTypes
2. main-world.ts只创建了空对象`(window as any).eventBusModule = {}`但未实际初始化eventBus实例和EventTypes常量
3. event-bus.ts中有EventBus和EventTypes定义，但未被正确导出并挂载到window.eventBusModule
4. 动态导入存在问题，ES模块无法在content-script环境中正常工作

**解决方案**：
1. 将EventBus类和EventTypes常量的定义直接内联到main-world.ts中，避免依赖模块导入
2. 在main-world.ts中立即创建并初始化EventBus实例
3. 将初始化好的实例立即挂载到window.eventBusModule全局对象上
4. 在content-script.ts中添加getEventBus()辅助函数，提供可靠的可用性检查机制
5. 创建safeEmit()包装函数，确保即使EventBus不可用也不会导致脚本错误
6. 替换所有直接eventBus调用为安全调用方式，增强应用健壮性
7. 在脚本加载后添加验证步骤，确保EventBus初始化成功

**验证方法**：
确保编译后的dist/src/main-world.js包含内联的EventBus实现，并在YouTube页面加载时能够正确初始化并挂载到window对象。

### Bug #17: 内容脚本ES模块导入错误（彻底解决方案）(2025-05-27)

**问题描述**：
在Chrome扩展中加载内容脚本时，控制台显示错误：`Uncaught SyntaxError: Cannot use import statement outside a module (at content-script.js:1:165)`。这导致扩展功能无法正常加载，播放器上没有显示翻译按钮和设置按钮。

**问题原因**：
尽管在manifest.json中将content_scripts配置为`"type": "module"`，但内容脚本环境的模块处理与常规网页不同。当使用Vite等打包工具生成的代码可能仍然包含ES模块风格的import语句，这在内容脚本环境中不被正确解析。关键问题在于：

1. 构建配置默认使用ES模块格式输出所有脚本
2. 内容脚本编译后保留了对其他模块的`import`引用
3. 即使添加了`"type": "module"`，Chrome的内容脚本环境对模块加载仍有限制

**解决方案**：
采用双重构建策略，为内容脚本和其他脚本使用不同的构建配置：

1. **调整构建系统**：
   - 修改vite.config.ts，创建条件构建策略
   - 使用`--mode content-script`参数区分内容脚本构建
   - 为内容脚本指定IIFE格式（立即执行函数表达式）
   - 为背景脚本、主世界脚本等保留ES模块格式

2. **修改manifest.json**：
   - 移除content_scripts中的`"type": "module"`属性
   - 让内容脚本作为常规脚本加载，而不是模块

3. **更新构建脚本**：
   - 将构建过程分为两个阶段：
     ```json
     "build": "npm run build:main && npm run build:content",
     "build:main": "vite build",
     "build:content": "vite build --mode content-script"
     ```
   - 确保内容脚本以IIFE格式独立构建，避免覆盖其他文件

**效果**：
- 完全解决了内容脚本的ES模块导入错误
- 保留了背景脚本等组件的ES模块优势
- 构建产生的内容脚本不再包含`import`语句，而是使用闭包包装所有依赖
- 扩展功能正常工作，播放器控件能正确显示

**技术背景**：
IIFE（立即执行函数表达式）格式将所有代码包装在闭包内，避免全局命名空间污染，不需要ES模块支持。这种格式更适合注入到任意网页的内容脚本，而ES模块格式更适合在扩展自己的上下文（如背景脚本、扩展页面）中使用。

### Bug #14: 按钮工具提示显示Unicode编码文本 (2025-05-22)

**问题描述**：
鼠标悬停在视频播放器控制按钮上时，工具提示(tooltip)显示的是Unicode编码文本(如"u5f00u542fu7ffbu8bd1")，而不是预期的中文文字("开启翻译")。

**问题原因**：
在修复ES模块导入问题时，部分中文字符被错误转换为Unicode编码形式。此外，工具提示显示逻辑使用的是按钮创建时传入的初始文本，而非dataset.tooltipText属性值，导致即使更新了属性值，显示的仍是初始传入的(被编码的)文本。

**解决方案**：
1. 修改createControlButton函数的mouseenter事件处理函数，优先使用dataset.tooltipText属性获取最新文本：
   ```typescript
   // 修改前
   button.addEventListener('mouseenter', () => showTooltip(button, tooltipText));
   
   // 修改后
   button.addEventListener('mouseenter', () => {
     // 使用dataset.tooltipText而不是传入的tooltipText参数，确保显示最新的文本
     const currentTooltip = button.dataset.tooltipText || tooltipText;
     showTooltip(button, currentTooltip);
   });
   ```

2. 确保所有涉及工具提示文本的地方都使用了正确的中文字符，包括按钮创建和状态更新时：
   ```typescript
   button.dataset.tooltipText = active ? '关闭翻译' : '开启翻译';
   ```

**涉及的文件**：
- `content/content-script.ts`

### Bug #18: 控件嵌入按钮失败问题 (2025-05-25)

**问题描述**：
在部分用户环境中，YouTube播放器控件栏中的翻译按钮和设置按钮无法正确注入或显示，导致用户无法使用翻译功能。即使按钮成功注入，悬停显示的工具提示也会显示Unicode编码文本而非正确的中文提示，且位置显示在按钮下方而非原生YouTube按钮那样显示在上方。

**问题原因**：
通过对比之前能正常工作的代码和当前代码版本，发现几个关键差异：
1. 按钮样式设置不完整：`overflow: visible`属性缺失，且使用了`display: flex`而非更符合YouTube原生按钮的`display: inline-flex`
2. 工具提示处理机制不符合YouTube原生实现：
   - 位置计算错误，显示在按钮下方而非上方
   - 缺少YouTube原生的类名和样式
   - 工具提示样式与YouTube原生工具提示不一致
3. 没有使用CSS类`vid-translate-button`而是使用了`yt-translate-button`

**解决方案**：
1. 完全重构工具提示实现，采用与YouTube一致的方式：
   ```typescript
   private ensureTooltipExists(): void {
     if (this.tooltipContainer && this.tooltipTextElement) return;
     
     // 创建容器
     this.tooltipContainer = document.createElement('div');
     this.tooltipContainer.className = 'ytp-tooltip ytp-top vid-translate-tooltip'; // 使用YouTube原生类名
     this.tooltipContainer.setAttribute('aria-hidden', 'true');
     this.tooltipContainer.style.cssText = `
       position: fixed; /* 使用fixed相对于视口定位 */
       max-width: 300px;
       display: none; /* 初始隐藏 */
       z-index: 2300;
       pointer-events: none;
       box-sizing: border-box;
       /* 模拟YouTube工具提示样式 */
       background-color: rgba(28, 28, 28, 0.9);
       color: #fff;
       padding: 6px 8px;
       border-radius: 5px;
       font-size: 1.2rem;
       font-weight: 500;
       white-space: nowrap; /* 防止文本换行 */
       text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
       transition: opacity 0.1s cubic-bezier(0.4, 0, 1, 1);
       opacity: 0;
     `;
     
     // 用于文本的内部元素 (模拟ytp-tooltip-text)
     this.tooltipTextElement = document.createElement('div');
     this.tooltipTextElement.className = 'ytp-tooltip-text'; // 使用YouTube类名
     this.tooltipContainer.appendChild(this.tooltipTextElement);
     
     // 添加到文档
     document.body.appendChild(this.tooltipContainer);
   }
   ```

2. 修改工具提示显示逻辑，确保位置在按钮上方：
   ```typescript
   private showTooltip(targetElement: HTMLElement, text: string): void {
     this.ensureTooltipExists();
     
     // 更新文本 - 优先使用dataset.tooltipText，以确保显示最新的文本
     const tooltipText = targetElement.dataset.tooltipText || text;
     this.tooltipTextElement.textContent = tooltipText;
     
     // 技巧: 先设为可见但透明，用于测量尺寸
     this.tooltipContainer.style.visibility = 'hidden';
     this.tooltipContainer.style.display = 'block';
     this.tooltipContainer.style.opacity = '0';
     
     // 计算尺寸和位置
     const tooltipWidth = this.tooltipContainer.offsetWidth;
     const targetRect = targetElement.getBoundingClientRect();
     
     // 计算位置（目标元素上方居中）
     const centerX = targetRect.left + targetRect.width / 2;
     const topY = targetRect.top;
     const left = centerX - tooltipWidth / 2;
     const top = topY - 40; // 固定偏移量，确保显示在按钮上方
     
     // 应用位置
     this.tooltipContainer.style.left = `${left}px`;
     this.tooltipContainer.style.top = `${top}px`;
     
     // 显示并设置为可见
     this.tooltipContainer.style.visibility = 'visible';
     this.tooltipContainer.style.opacity = '1';
   }
   ```

3. 修复按钮样式和类名:
   ```typescript
   private createControlButton(
     id: string,
     tooltipText: string,
     iconSrc: string,
     onClick: () => void
   ): { button: HTMLButtonElement; icon: HTMLImageElement } {
     const button = document.createElement('button');
     button.id = id;
     button.className = 'ytp-button vid-translate-button'; // 使用YouTube原生的ytp-button类
     button.setAttribute('aria-label', tooltipText);
     // 应用关键的内联样式
     button.style.cssText = `
       position: relative; /* 用于子元素绝对定位 */
       overflow: visible; /* 确保边框可见 */
       width: 48px; /* 保持宽度 */
       display: inline-flex; /* 让父容器知道如何处理 */
       align-items: center; /* 垂直居中内部内容 */
       justify-content: center; /* 水平居中内部内容 */
     `;
     
     // 创建边框和图标
     const border = this.createBorderImage();
     const icon = this.createIconImage(iconSrc, tooltipText);
     
     // 添加到按钮
     button.appendChild(border);
     button.appendChild(icon);
     
     // 设置点击事件
     button.addEventListener('click', onClick);
     
     // 添加tooltip数据属性，用于状态更新时更新提示文本
     button.dataset.tooltipText = tooltipText;
     
     // 添加工具提示专用事件处理
     button.addEventListener('mouseenter', () => this.showTooltip(button, tooltipText));
     button.addEventListener('mouseleave', () => this.hideTooltip());
     
     return { button, icon };
   }
   ```

**涉及的文件**：
- `src/components/ui-manager.ts`

**验证方法**：
在不同YouTube版本和浏览器环境中验证按钮注入成功率和工具提示显示正确性。确认悬停时显示的是正确的中文提示而非Unicode编码文本，并且工具提示位于按钮上方。

### Bug #19: 侧边栏样式修改无效 (2025-05-21)

**问题描述**：
开发者在 `sidepanel/sidepanel.css` 中对侧边栏 UI 样式进行了调整，但页面实际应用的却是静态拷贝至 `assets/sidepanel.css` 的旧版样式，因此新样式未生效。

**问题原因**：
项目中存在两个同名 CSS 文件：根目录 `assets/sidepanel.css`（通过构建插件拷贝并加载）和 `sidepanel/sidepanel.css`（未经过构建管道处理）。HTML 中引用的是前者，导致后者的修改未被加载。

**解决方案**：
将 `sidepanel/sidepanel.css` 中的全部更新合并到 `assets/sidepanel.css`，替换原始文件，并重新构建扩展。

**涉及的文件**：
- `sidepanel/sidepanel.css`
- `assets/sidepanel.css`
- `sidepanel/sidepanel.html`
- `vite.config.ts`

**验证方法**：
1. 重建后打开侧边栏，确认新样式（如自定义下拉面板边框、选项高度等）生效。
2. 在 `dist/assets/sidepanel.css` 中确认包含最新样式代码。

## 导航与状态重置问题

### Bug 8: 页面导航时重复执行操作

**状态**: 🔴 待修复

**描述**: 
在YouTube视频之间导航时，会出现重复执行初始化操作的问题，导致多次创建DOM元素、绑定事件监听器和进行翻译请求。

**影响**:
- 内存泄漏和性能下降
- UI元素重复出现
- 可能导致翻译API请求过于频繁

**排查步骤**:
1. 检查导航事件处理逻辑
2. 监控DOM元素创建过程
3. 跟踪事件监听器绑定情况
4. 分析Service Worker消息流

**修复计划**:
- 实现全局导航状态追踪
- 在导航事件处理中添加清理逻辑
- 使用事件总线统一协调导航事件
- 为创建的DOM元素添加唯一标识符，防止重复创建

### Bug 9: 通信错误与状态同步问题

**状态**: 🔴 待修复

**描述**:
内容脚本、主世界脚本和背景脚本之间的通信在页面导航或刷新时可能出现状态不同步，导致翻译设置或字幕状态无法正确应用。

**影响**:
- 用户设置丢失
- 字幕状态不一致
- 翻译功能无法正常工作

**排查步骤**:
1. 跟踪消息传递过程
2. 监控存储读写操作
3. 检查Service Worker生命周期
4. 分析导航事件处理时序

**修复计划**:
- 使用StorageManager统一管理状态
- 实现基于事件总线的状态同步机制
- 添加消息重试和确认机制
- 完善导航事件处理流程

### Bug 10: 插件过早初始化问题

**状态**: ✅ 已修复 (2025-05-21)

**描述**: 
插件在页面加载时立即初始化并注入DOM元素，而不是在用户首次交互（如点击翻译按钮）时才初始化。这导致即使用户不使用翻译功能，也会执行不必要的处理和DOM操作。

**影响**:
- 增加页面初始加载时的资源消耗
- 可能影响YouTube原生功能的性能
- 造成不必要的网络请求和存储访问

**排查步骤**:
1. 分析content-script.js的初始化流程
2. 检查所有在页面加载时立即执行的操作
3. 评估哪些功能可以延迟到用户交互时再执行

**解决方案**:
实现了InitializationManager类，将初始化分为基础初始化和完整初始化两个阶段：
- 基础初始化：页面加载时执行，只包含必要的监听和准备工作
- 完整初始化：仅在用户首次交互时执行，包括所有功能组件的初始化

新的初始化流程显著减少了对未使用翻译功能用户的资源占用，同时保证了功能的完整性。

### Bug 11: 冗余事件监听器问题

**状态**: ✅ 已修复 (2025-05-21)

**描述**:
每次导航都添加新的事件监听器（如'yt-navigate-finish'、click事件等），而没有移除旧的监听器，导致事件处理函数被多次调用，造成性能下降和潜在的逻辑错误。

**影响**:
- 同一事件被多次处理，导致重复操作
- 内存使用随浏览时间线性增长
- 事件处理逻辑可能混乱导致不可预期的行为

**排查步骤**:
1. 审查所有事件监听器的添加位置
2. 使用Chrome DevTools的Performance和Memory工具跟踪事件监听器数量
3. 检查导航后的事件触发次数

**解决方案**:
实现了EventListenerManager类，统一管理所有事件监听器：
- 所有事件监听器注册时都记录在特定的分组中
- 导航时可以按分组清理相关监听器
- 提供了对外部添加监听器的记录功能
- 添加了监听器数量统计功能，方便调试

通过这一优化，解决了长时间使用导致的内存泄漏问题，并确保事件处理的一致性。

### Bug 12: 初始化状态检查不足

**状态**: ✅ 已修复 (2025-05-21)

**描述**:
缺少对插件当前状态的有效检查，在某些场景下（如页面刷新、视频切换）会不必要地重复完整初始化流程，即使插件已经正确初始化。

**影响**:
- 重复执行不必要的初始化代码
- 相同的DOM元素被多次创建或修改
- 存储操作和API调用效率低下

**排查步骤**:
1. 跟踪初始化流程的执行路径和频率
2. 分析导航时的状态重置逻辑
3. 检查DOM元素创建和注入流程
4. 监控存储访问模式

**解决方案**:
在InitializationManager类中添加了明确的状态标志和检查点：
- 使用_basicInitDone和_fullInitDone标志跟踪初始化状态
- 实现resetInitializationState方法，在导航时重置特定状态
- 为每个初始化阶段添加清晰的日志记录
- 在DOM元素创建前添加多重状态检查

同时改进了DOM元素创建逻辑：
- 同时使用状态标志和DOM检查来避免重复创建
- 确保导航后正确移除和重置旧元素
- 添加唯一标识符便于跟踪

这些改进确保了插件只在必要时执行初始化，显著提高了性能和稳定性。

## 待解决的Bug

### Issue #1: 字幕显示偶尔延迟

**问题描述**：
有时在视频开始播放或导航到新视频后，字幕显示会有几秒钟的延迟。

**复现步骤**：
1. 开启翻译功能
2. 播放视频几分钟
3. 导航到新视频
4. 观察字幕显示时间与实际视频内容

**可能原因**：
- 字幕轨道获取和翻译过程过慢
- YouTube字幕事件触发时机不稳定
- 复杂的字幕处理逻辑导致延迟

**建议解决方向**：
- 优化字幕获取和处理流程
- 考虑使用预加载机制
- 添加字幕加载指示器提升用户体验

### Issue #2: 某些视频字幕样式异常

**问题描述**：
在某些视频（特别是具有特殊字幕格式的视频）中，翻译后的字幕样式可能不一致，例如大小、位置或颜色异常。

**复现步骤**：
1. 访问带有特殊字幕的视频（如音乐视频、带有样式化字幕的视频）
2. 开启翻译功能
3. 观察字幕显示异常

**可能原因**：
- YouTube原生字幕样式多样化
- 样式继承问题
- 字幕容器定位逻辑不完善

**建议解决方向**：
- 增强字幕样式检测和适配
- 开发更稳健的自适应样式系统
- 考虑添加自定义样式选项

### Issue #3: 高内存使用

**问题描述**：
长时间使用扩展（特别是观看多个视频后）可能导致内存使用量增加。

**可能原因**：
- 字幕数据未及时清理
- 存在内存泄漏
- 缓存策略不够优化

**建议解决方向**：
- 审计并优化内存使用
- 实现更积极的垃圾回收
- 完善缓存大小限制和清理策略

### Issue #4: 强制回流问题

**问题描述**：
浏览器控制台中出现警告："[Violation] Forced reflow while executing JavaScript took 34ms/30ms"，表明扩展中的某些JavaScript操作强制浏览器在JavaScript执行期间重新计算布局，这可能导致性能问题。

**复现步骤**：
1. 打开YouTube视频
2. 开启翻译功能
3. 打开开发者工具
4. 观察控制台中的Forced reflow警告

**可能原因**：
- 在DOM变更后立即查询布局信息（如offsetWidth、clientHeight等）
- 频繁交替进行DOM读取和写入操作
- 对大量DOM元素进行连续修改而不使用批处理

**建议解决方向**：
- 优化DOM操作，分离读取和写入操作
- 使用requestAnimationFrame统一处理可视化更新
- 减少不必要的布局计算
- 考虑使用虚拟DOM或文档片段减少回流
- 利用CSS transform代替直接修改布局属性

### Issue #5: 非被动事件监听器

**问题描述**：
浏览器控制台中出现警告："[Violation] Added non-passive event listener to a scroll-blocking <某些> 事件"，表明扩展添加了不带{passive: true}选项的触摸/滚动事件监听器，这可能延迟滚动响应。

**复现步骤**：
1. 打开YouTube视频
2. 开启翻译功能
3. 打开开发者工具
4. 滚动页面或使用触摸操作
5. 观察控制台中的非被动事件监听器警告

**可能原因**：
- 在处理滚动/触摸事件时没有使用{passive: true}选项
- 事件监听器可能调用preventDefault()阻止默认行为

**建议解决方向**：
- 为滚动、触摸和滚轮事件添加{passive: true}选项
- 重构事件处理函数，避免使用preventDefault()
- 审查所有事件监听器的添加代码，确保适当使用被动选项
- 考虑创建通用的事件添加包装函数，自动添加适当的选项

## 待实现功能

### Feature #1: 离线翻译支持

**描述**：
添加基于WebAssembly的本地翻译引擎，支持在没有网络连接时进行基本翻译。

**优先级**：中等

**涉及组件**：
- 背景脚本
- 内容脚本
- 侧边栏设置

### Feature #2: 自定义字幕样式

**描述**：
允许用户自定义字幕的样式，包括字体、大小、颜色、背景和位置。

**优先级**：低

**涉及组件**：
- 侧边栏设置
- 内容脚本
- 存储机制

### Feature #3: 字幕导出功能

**描述**：
添加导出当前视频双语字幕的功能，支持SRT、VTT等常见格式。

**优先级**：低

**涉及组件**：
- 内容脚本
- 侧边栏UI
- 文件处理 