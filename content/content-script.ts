/**
 * Chrome 扩展 内容脚本
 */

console.log('内容脚本已加载。');

// 示例：与后台脚本通信
function fetchDataFromBackground() {
  chrome.runtime.sendMessage({ action: 'getData' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('发送消息时出错:', chrome.runtime.lastError);
      return;
    }
    if (response && response.status === 'success') {
      console.log('来自后台的数据:', response.data);
      // 在页面上使用获取的数据做些什么
    } else {
      console.error('从后台获取数据失败。', response);
    }
  });
}

// 页面加载完成后执行
window.addEventListener('load', () => {
  console.log('页面已加载。正在获取数据...');
  fetchDataFromBackground();

  // 可以在这里添加操作 DOM 的代码
});

/**
 * 用于向 YouTube 播放器注入控件的内容脚本
 */

/**
 * @fileoverview 将自定义控制按钮注入 YouTube 播放器。
 */

/**
 * 图标的 URL，使用 chrome.runtime.getURL 获取。
 * 假设图标位于扩展程序的 /icons/ 目录下。
 */
const OFF_ICON_URL = chrome.runtime.getURL('icons/off.svg');
const ON_ICON_URL = chrome.runtime.getURL('icons/on.svg');
const SETTING_ICON_URL = chrome.runtime.getURL('icons/l-setting.svg');
const SETTING_ACTIVE_ICON_URL = chrome.runtime.getURL('icons/l-setting-active.svg');
const NORMAL_BORDER_URL = chrome.runtime.getURL('icons/normal-border.svg');

/** 定义 ytInitialPlayerResponse 中我们关心的部分结构 */
interface YtPlayerCaptionsRenderer {
  captionTracks?: any[]; // 实际字幕轨道数组
}

interface YtPlayerCaptions {
  playerCaptionsTracklistRenderer?: YtPlayerCaptionsRenderer;
}

interface YtInitialPlayerResponse {
  captions?: YtPlayerCaptions;
}

/** 防止重复注入的标志位。 */
let controlsInjected = false;

/** 当前翻译状态。 */
let translateActive = false;

/** 所有自定义按钮共享的单个工具提示元素。 */
let tooltipContainer: HTMLDivElement | null = null;
/** 工具提示的内部文本元素。 */
let tooltipTextElement: HTMLDivElement | null = null;
/** 用于隐藏工具提示的超时 ID。 */
let hideTooltipTimeout: number | null = null;
/** 全局变量，用于引用字幕显示元素 */
let subtitleOverlayElement: HTMLDivElement | null = null;
/** 全局变量，用于存储处理后的字幕事件 */
let processedSubtitleEvents: { start: number; end: number; text: string }[] = [];
/** 全局变量，用于存储 video 元素的引用 */
let videoElement: HTMLVideoElement | null = null;
/** 全局变量，用于存储 requestAnimationFrame 的 ID，方便取消 */
let animationFrameId: number | null = null;

/**
 * 如果工具提示容器元素不存在，则创建它。
 * 将其附加到 document body。
 */
function ensureTooltipExists() {
  if (tooltipContainer) return;

  tooltipContainer = document.createElement('div');
  tooltipContainer.className = 'ytp-tooltip ytp-top vid-translate-tooltip'; // 使用提供的类名
  tooltipContainer.setAttribute('aria-hidden', 'true');
  tooltipContainer.style.cssText = `
    position: fixed; /* 使用 fixed 相对于视口定位 */
    max-width: 300px;
    display: none; /* 初始隐藏 */
    z-index: 2300;
    pointer-events: none;
    box-sizing: border-box;
    /* 模拟 YouTube 工具提示样式 */
    background-color: rgba(28, 28, 28, 0.9);
    color: #fff;
    padding: 6px 8px;
    border-radius: 5px;
    font-size: 1.2rem; /* 按要求 */
    font-weight: 500;
    white-space: nowrap; /* 防止文本换行 */
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    transition: opacity 0.1s cubic-bezier(0.4, 0, 1, 1);
    opacity: 0;
  `;

  // 用于文本的内部元素 (模拟 ytp-tooltip-text)
  tooltipTextElement = document.createElement('div');
  tooltipTextElement.className = 'ytp-tooltip-text'; // 如果需要，使用 YT 类名
  tooltipContainer.appendChild(tooltipTextElement);

  document.body.appendChild(tooltipContainer);
  console.log('工具提示容器已创建。');
}

/**
 * 显示工具提示，包含指定的文本，并定位在目标元素上方。
 * @param {HTMLElement} targetElement - 用于定位工具提示的目标元素。
 * @param {string} text - 要在工具提示中显示的文本。
 */
function showTooltip(targetElement: HTMLElement, text: string) {
  ensureTooltipExists(); // 确保容器存在
  if (!tooltipContainer || !tooltipTextElement) return;

  // 清除任何待处理的隐藏超时
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = null;
  }

  // 更新工具提示文本
  tooltipTextElement.textContent = text;

  // 设置为可见（但透明）以测量宽度
  tooltipContainer.style.visibility = 'hidden';
  tooltipContainer.style.display = 'block';
  tooltipContainer.style.opacity = '0';

  // 在设置文本后获取尺寸
  const tooltipWidth = tooltipContainer.offsetWidth;
  const targetRect = targetElement.getBoundingClientRect();

  // 计算位置（目标上方居中）
  const centerX = targetRect.left + targetRect.width / 2;
  const topY = targetRect.top;
  const left = centerX - tooltipWidth / 2;
  const top = topY - 40; // 使用提供的偏移量

  // 应用位置
  tooltipContainer.style.left = `${left}px`;
  tooltipContainer.style.top = `${top}px`;

  // 使其完全可见
  tooltipContainer.style.visibility = 'visible';
  tooltipContainer.style.opacity = '1';
}

/**
 * 短暂延迟后隐藏工具提示。
 */
function hideTooltip() {
  if (!tooltipContainer) return;

  tooltipContainer.style.opacity = '0';

  // 过渡结束后设置 display 为 none
  hideTooltipTimeout = window.setTimeout(() => {
    if (tooltipContainer) { // 检查它是否仍然存在
        tooltipContainer.style.display = 'none';
    }
    hideTooltipTimeout = null;
  }, 100); // 匹配过渡持续时间 (0.1s)
}

/**
 * 为按钮创建边框图像元素。
 * @returns {HTMLImageElement} 边框图像元素。
 */
function createBorderImage(): HTMLImageElement {
  const border = document.createElement('img');
  border.src = NORMAL_BORDER_URL;
  border.style.cssText = `
    position: absolute;
    width: 36px;
    height: 36px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    box-sizing: border-box;
  `;
  border.classList.add('ytp-custom-button-border');
  return border;
}

/**
 * 为按钮创建主图标图像元素。
 * @param {string} src - 图标的初始源 URL。
 * @param {string} alt - 图标的 alt 文本。
 * @returns {HTMLImageElement} 图标图像元素。
 */
function createIconImage(src: string, alt: string): HTMLImageElement {
  const icon = document.createElement('img');
  icon.src = src;
  icon.width = 24;
  icon.height = 24;
  icon.alt = alt;
  icon.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  `;
  icon.classList.add('ytp-custom-button-icon'); // 添加类名以便样式化
  return icon;
}

/**
 * 创建带有自定义工具提示的自定义控制按钮。
 * @param {string} id - 按钮元素的唯一 ID。
 * @param {string} tooltipText - 要在自定义工具提示中显示的文本。
 * @param {string} initialIconSrc - 初始显示的图标 URL。
 * @param {() => void} onClick - 按钮点击时执行的函数。
 * @returns {{button: HTMLButtonElement, icon: HTMLImageElement}} 包含创建的按钮元素及其内部图标元素的对象。
 */
function createControlButton(
  id: string,
  tooltipText: string, // 为清晰起见重命名参数
  initialIconSrc: string,
  onClick: () => void
): { button: HTMLButtonElement; icon: HTMLImageElement } {
  const button = document.createElement('button');
  button.id = id;
  // 不再设置 button.title
  button.style.cssText = `
    position: relative;
    width: 48px;
    height: 48px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    vertical-align: top;
    outline: none;
  `;
  button.classList.add('ytp-button');

  const border = createBorderImage();
  const icon = createIconImage(initialIconSrc, tooltipText); // 使用 tooltipText 作为 alt 文本

  button.appendChild(border);
  button.appendChild(icon);

  // 为自定义工具提示添加事件监听器
  button.addEventListener('mouseenter', () => {
    showTooltip(button, tooltipText);
  });
  button.addEventListener('mouseleave', hideTooltip);

  button.addEventListener('click', onClick);

  return { button, icon };
}

/**
 * 查找并尝试解析 ytInitialPlayerResponse 对象。
 * 优先尝试直接访问 window.ytInitialPlayerResponse，如果失败则查找并解析相关 <script> 标签。
 * @returns {YtInitialPlayerResponse | null} 解析后的对象，如果找不到则返回 null。
 */
function findInitialPlayerResponse(): YtInitialPlayerResponse | null {
  // 直接尝试查找并解析 <script> 标签
  console.log('尝试查找并解析包含 ytInitialPlayerResponse 的 <script> 标签...');

  // 2. 备用：查找并解析 <script> 标签
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
      const scriptContent = script.textContent;
      // 寻找包含关键变量定义的脚本 (更精确地匹配)
      if (scriptContent?.includes('var ytInitialPlayerResponse = {') || scriptContent?.includes('window["ytInitialPlayerResponse"] = {')) {
          try {
              // 尝试更健壮地提取 JSON 对象
              let potentialJsonString = '';
              const startIndex = scriptContent.indexOf('{');
              // 需要找到匹配的结束大括号，而不是最后一个
              // 这是一个简化方法，可能对复杂的脚本无效
              let braceCount = 0;
              let endIndex = -1;
              if (startIndex !== -1) {
                  for (let i = startIndex; i < scriptContent.length; i++) {
                      if (scriptContent[i] === '{') {
                          braceCount++;
                      } else if (scriptContent[i] === '}') {
                          braceCount--;
                      }
                      if (braceCount === 0) {
                          endIndex = i;
                          break;
                      }
                  }
              }

              if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
                  potentialJsonString = scriptContent.substring(startIndex, endIndex + 1);
                  
                  // 简单的验证
                  if (potentialJsonString.trim().startsWith('{') && potentialJsonString.trim().endsWith('}')) {
                      // @ts-ignore - We assume the structure after parsing
                      const playerResponse: YtInitialPlayerResponse = JSON.parse(potentialJsonString);

                      // 再次检查解析后的对象是否包含所需数据 (使用 Optional Chaining)
                      if (playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                          console.log('成功：通过解析 <script> 标签获取。');
                          return playerResponse;
                      } else {
                          console.warn('解析出的 JSON 对象不包含 captions 数据。脚本内容可能已更改。');
                      }
                  } else {
                      console.warn('提取的字符串不是有效的 JSON 对象格式。');
                  }
              } else {
                   console.warn('在 script 标签中未能定位有效的 JSON 起始/结束大括号。脚本格式可能不支持此解析方法。');
              }

          } catch (parseError) {
              console.error('解析 <script> 标签中的 ytInitialPlayerResponse JSON 时出错:', parseError);
              console.error('Script content snippet (first 500 chars):', scriptContent?.substring(0, 500)); 
              // 继续尝试下一个 script 标签
          }
      }
  }

  // 如果循环结束仍未找到
  console.error('失败：未能从 <script> 标签中找到有效的 ytInitialPlayerResponse 数据。');
  return null;
}

// --- Function to get subtitle data using baseUrl ---
/**
 * @description 使用给定的 `baseUrl` 从 YouTube 服务器异步获取字幕数据。
 *              会自动添加 `fmt=json3` 参数以请求 JSON 格式的数据。
 * @param {string} baseUrl - 从 `captionTracks` 中获取的特定字幕轨道的 URL。
 * @returns {Promise<object | null>} 一个 Promise，解析为包含字幕事件的 JSON 对象，
 *                                   如果请求失败或发生错误则解析为 null。
 */
async function fetchSubtitleData(baseUrl: string): Promise<object | null> {
    if (!baseUrl) {
        console.error("没有提供 baseUrl 来获取字幕数据。");
        return null;
    }
    try {
        // 确保 URL 格式正确并添加必要的参数
        // 使用 URL 对象来健壮地处理 URL 和参数
        const url = new URL(baseUrl);
        url.searchParams.set('fmt', 'json3'); // 请求 json3 格式
        url.searchParams.set('lang', url.searchParams.get('lang') || 'en'); // 确保有 lang 参数，可能影响返回内容

        console.log(`正在从此 URL 获取字幕数据: ${url.toString()}`);
        
        // 使用 fetch API 发起网络请求
        const response = await fetch(url.toString());

        if (!response.ok) {
            // 处理 HTTP 错误状态
            console.error(`获取字幕数据时出错: ${response.status} ${response.statusText}`);
            try {
                // 尝试读取并记录错误响应体
                const errorText = await response.text();
                console.error("字幕获取错误响应体:", errorText);
            } catch (e) { 
                console.error("无法读取错误响应体"); 
            }
            return null;
        }
        // 解析 JSON 数据
        const data = await response.json();
        console.log("成功获取字幕数据 (JSON):", data); // 打印获取到的数据
        return data; // 返回获取到的 JSON 字幕数据

    } catch (error) {
        // 处理网络错误或其他 fetch 过程中的异常
        console.error("获取字幕数据时发生网络错误或异常:", error);
        return null;
    }
}

/**
 * 处理从 API 获取的原始字幕 JSON 数据。
 * @param {any} subtitleJson - 包含字幕事件的 JSON 对象。
 */
function processAndStoreSubtitles(subtitleJson: any) {
    if (!subtitleJson || !Array.isArray(subtitleJson.events)) {
        console.error('无效的字幕 JSON 数据或缺少 events 数组:', subtitleJson);
        processedSubtitleEvents = []; // 清空旧数据
        return false;
    }

    processedSubtitleEvents = []; // 清空旧数据
    const events = subtitleJson.events;

    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        // 确保 tStartMs 存在
        if (typeof event.tStartMs !== 'number') continue;

        let text = '';
        // 组合 segs 文本
        if (Array.isArray(event.segs)) {
            text = event.segs.map((seg: any) => seg.utf8 || '').join('');
        }
        // 去除文本中的 HTML 标签 (简单处理)
        text = text.replace(/<[^>]*>/g, '').trim(); 
        // 解码 HTML 实体 (简单处理常见的)
        text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

        if (!text) continue; // 跳过空字幕

        const start = event.tStartMs;
        // 确定结束时间：优先使用 dDurationMs，否则用下一个事件的开始时间，最后加一个默认时长
        let end = start + (event.dDurationMs || 3000); // 默认显示 3 秒
        if (i + 1 < events.length && typeof events[i + 1].tStartMs === 'number') {
            // 如果提供了 dDurationMs，则使用它，否则用下一个字幕的开始时间
            if (!event.dDurationMs) {
               end = events[i + 1].tStartMs;
            }
        }

        processedSubtitleEvents.push({ start, end, text });
    }

    console.log(`处理完成 ${processedSubtitleEvents.length} 条字幕事件。`);
    // 按开始时间排序，以防万一数据不是有序的
    processedSubtitleEvents.sort((a, b) => a.start - b.start);
    return true;
}

/**
 * 处理视频时间更新事件，查找并显示当前时间的字幕。
 * (现在由 requestAnimationFrame 循环调用)
 */
function handleSubtitleUpdate() { // 重命名以反映其目的
    // 尝试获取 video 元素 (如果尚未获取或丢失)
    if (!videoElement) {
        videoElement = document.querySelector('video');
    }
    
    // 如果元素不存在或翻译未激活，则不执行
    if (!videoElement || !subtitleOverlayElement || !translateActive) {
        // 确保字幕在非激活状态下是隐藏的
        if (subtitleOverlayElement && subtitleOverlayElement.style.opacity !== '0') {
            subtitleOverlayElement.textContent = '';
            subtitleOverlayElement.style.opacity = '0';
            subtitleOverlayElement.style.visibility = 'hidden';
        }
        return; 
    }

    const currentTimeMs = videoElement.currentTime * 1000;
    let currentSubtitleText = '';

    // 查找当前时间对应的字幕
    const currentEvent = processedSubtitleEvents.find(
        event => currentTimeMs >= event.start && currentTimeMs < event.end
    );

    if (currentEvent) {
        currentSubtitleText = currentEvent.text;
    }

    // 更新字幕内容和可见性
    if (currentSubtitleText) {
        if (subtitleOverlayElement.textContent !== currentSubtitleText) {
           subtitleOverlayElement.textContent = currentSubtitleText;
        }
        if (subtitleOverlayElement.style.opacity !== '1') {
           subtitleOverlayElement.style.visibility = 'visible';
           subtitleOverlayElement.style.opacity = '1';
        }
    } else {
        if (subtitleOverlayElement.style.opacity !== '0') {
           subtitleOverlayElement.textContent = ''; 
           subtitleOverlayElement.style.opacity = '0';
           // 延迟隐藏 visibility 以配合过渡 (requestAnimationFrame 可能不需要这个了，但保留以防万一)
           setTimeout(() => {
               if (subtitleOverlayElement && subtitleOverlayElement.style.opacity === '0') {
                   subtitleOverlayElement.style.visibility = 'hidden';
               }
           }, 200); 
        }
    }
}

/**
 * requestAnimationFrame 循环，用于持续更新字幕。
 */
function updateSubtitleLoop() {
    if (!translateActive) { // 如果翻译被关闭，停止循环
        console.log('停止字幕更新循环。');
        // 确保 video 引用被清除 (如果需要)
        // videoElement = null; 
        // 清理最后的字幕显示
        handleSubtitleUpdate(); 
        animationFrameId = null;
        return;
    }

    handleSubtitleUpdate(); // 执行当前的字幕更新检查

    // 请求下一帧继续循环
    animationFrameId = requestAnimationFrame(updateSubtitleLoop);
}

/**
 * 停止字幕更新循环并隐藏字幕。
 */
function stopSubtitleUpdates() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    // 确保 video 引用被清除
    videoElement = null; 
    // 确保字幕最终被隐藏
    if (subtitleOverlayElement) {
        subtitleOverlayElement.textContent = '';
        subtitleOverlayElement.style.opacity = '0';
        subtitleOverlayElement.style.visibility = 'hidden';
    }
    console.log('已手动停止字幕更新并隐藏。');
}

/**
 * 创建并添加用于显示字幕的叠加层元素。
 * @param {HTMLElement} playerContainer - YouTube 播放器的主容器元素。
 */
function createSubtitleOverlay(playerContainer: HTMLElement) {
    if (subtitleOverlayElement) {
        // 如果已存在，确保它在正确的容器内
        if (!playerContainer.contains(subtitleOverlayElement)) {
            playerContainer.appendChild(subtitleOverlayElement);
        }
        return; // 防止重复创建
    }

    console.log('正在创建字幕叠加层...');
    subtitleOverlayElement = document.createElement('div');
    subtitleOverlayElement.id = 'custom-subtitle-overlay';
    // 恢复样式为初始隐藏
    subtitleOverlayElement.style.cssText = `
        position: absolute;
        bottom: 25%; 
        left: 50%;   
        transform: translateX(-50%); 
        z-index: 9999; 
        background-color: rgba(0, 0, 0, 0.7); 
        color: white; 
        padding: 10px 20px; 
        border-radius: 5px; 
        font-size: 18px; 
        text-align: center; 
        max-width: 80%; 
        pointer-events: none; 
        line-height: 1.4; 
        white-space: pre-line; 
        /* 恢复初始隐藏 */
        visibility: hidden; 
        opacity: 0;
        transition: opacity 0.2s ease-in-out, visibility 0s linear 0.2s; /* 恢复过渡 */
        /* text-shadow 样式可以保留或移除，根据需要 */
        text-shadow: 0px 0px 2px rgba(0,0,0,0.8), 
                     0px 0px 3px rgba(0,0,0,0.8), 
                     1px 1px 3px rgba(0,0,0,0.8);
    `;

    // 移除临时占位文本
    // subtitleOverlayElement.textContent = '[ 字幕显示区 ]';

    // 将叠加层添加到播放器容器中
    playerContainer.appendChild(subtitleOverlayElement);
    console.log('字幕叠加层已创建并添加到播放器容器 (初始隐藏)。');
}

/**
 * 将自定义控制面板注入 YouTube 播放器控件。
 */
function injectControls() {
  // --- 尝试创建字幕叠加层 --- 
  const playerContainer = document.querySelector('.html5-video-player') as HTMLElement;
  if (playerContainer) {
      createSubtitleOverlay(playerContainer);
  } else {
      console.warn('injectControls 时未能找到播放器容器 .html5-video-player');
      // MutationObserver 应该稍后会处理
  }
  // --- 结束 --- 

  if (controlsInjected) {
    console.log('控件已注入。');
    return;
  }

  const leftControls = document.querySelector('.ytp-left-controls') as HTMLElement;
  if (!leftControls) {
    console.log('尚未找到 .ytp-left-controls。');
    return;
  }

  console.log('正在注入自定义控件...');
  ensureTooltipExists(); // 确保在创建按钮前工具提示 DOM 已准备好

  const panel = document.createElement('div');
  panel.id = 'ytp-custom-controls-panel';
  panel.style.cssText = `
    display: flex;
    align-items: center;
    height: 48px;
    /* margin-right is already set below */
    /* order: 99; Might be unnecessary with marginLeft: auto */
  `;
  // 将 panel 推到左侧控制栏的最右边
  panel.style.marginLeft = 'auto';
  // 确保与右侧控件有间距
  panel.style.marginRight = '8px';

  // --- 创建翻译按钮 ---
  const translateTooltipText = '翻译开关';
  const { button: translateButton, icon: translateIcon } = createControlButton(
    'custom-translate-button',
    translateTooltipText,
    translateActive ? ON_ICON_URL : OFF_ICON_URL,
    () => {
      const wasActive = translateActive; // 记录之前的状态
      translateActive = !translateActive;
      translateIcon.src = translateActive ? ON_ICON_URL : OFF_ICON_URL;
      // 保存状态到存储
      chrome.storage.sync.set({ translateActive });
      console.log('翻译状态:', translateActive);
      showTooltip(translateButton, translateActive ? '关闭翻译' : '开启翻译'); // 更新 tooltip 文本
      console.log('翻译状态切换:', translateActive);
      
      if (translateActive) { 
          console.log('开启翻译，尝试获取并显示字幕...');
          const playerResponse: YtInitialPlayerResponse | null = findInitialPlayerResponse(); // 调用封装的函数并指定类型
          const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

          if (captionTracks && captionTracks.length > 0) { 
              // --- 这部分代码是正确的，保留 --- 
              console.log('原始 captionTracks:', captionTracks);
              const availableTracks = captionTracks.map((track: any) => ({
                languageCode: track.languageCode,
                languageName: track.name?.simpleText || track.languageCode, 
                baseUrl: track.baseUrl,
                isTranslatable: track.isTranslatable,
                kind: track.kind || 'standard' 
              }));
              console.log('提取到的字幕轨道:', availableTracks);
              
              let targetTrack: any = null;
              targetTrack = availableTracks.find(track => track.languageCode.startsWith('en') && track.kind !== 'asr');
              if (!targetTrack) {
                  targetTrack = availableTracks.find(track => track.languageCode.startsWith('en') && track.kind === 'asr');
              }
              if (!targetTrack) {
                  targetTrack = availableTracks[0];
              }
              // --- 结束正确部分 ---

              if (targetTrack && targetTrack.baseUrl) {
                  console.log(`已选择字幕轨道: ${targetTrack.languageName} (${targetTrack.languageCode}, ${targetTrack.kind})`);
                  (async () => {
                      console.log(`准备使用 baseUrl 获取字幕: ${targetTrack.baseUrl}`);
                      const subtitleJson = await fetchSubtitleData(targetTrack.baseUrl);
                      if (subtitleJson) {
                          console.log('最终获取到的字幕 JSON 数据:', subtitleJson);
                          if (processAndStoreSubtitles(subtitleJson)) {
                              console.log('字幕数据处理成功，启动更新循环。');
                              // --- 启动 requestAnimationFrame 循环 ---
                              if (!animationFrameId) { 
                                 // 确保 video 元素可用
                                 if (!videoElement) videoElement = document.querySelector('video');
                                 if(videoElement){
                                    animationFrameId = requestAnimationFrame(updateSubtitleLoop);
                                 } else {
                                     console.error("无法找到 video 元素，无法启动字幕更新循环。");
                                     stopSubtitleUpdates(); // 找不到 video 元素也停止
                                 }
                              }
                          } else {
                              console.error("处理字幕数据失败。");
                              stopSubtitleUpdates(); // 处理失败则停止
                          }
                      } else {
                          console.error('未能获取到选定轨道的字幕数据。');
                          stopSubtitleUpdates(); // 获取失败则停止
                      }
                  })();
              } else {
                  console.error('未能根据优先级选择有效的字幕轨道或 baseUrl。');
                  stopSubtitleUpdates(); // 选择失败则停止
              }
          } else {
             console.error('未能从 playerResponse 获取有效或非空的 captionTracks 数据。');
             stopSubtitleUpdates(); // 获取列表失败则停止
          }
      } else if (wasActive) { // 仅在之前是激活状态时执行关闭逻辑
         // 翻译关闭时的逻辑
         console.log('翻译已关闭，停止字幕更新循环并隐藏。');
         stopSubtitleUpdates(); // 关闭开关时停止循环并隐藏
      }
    }
  );

  // --- 创建设置按钮 ---
  const settingsTooltipText = '翻译设置';
  const { button: settingsButton, icon: settingsIcon } = createControlButton(
    'custom-settings-button',
    settingsTooltipText,
    SETTING_ICON_URL, // 初始状态
    () => {
      // 切换激活状态和图标 (可选，如果需要视觉反馈)
      // const isActive = settingsIcon.src === SETTING_ACTIVE_ICON_URL;
      // settingsIcon.src = isActive ? SETTING_ICON_URL : SETTING_ACTIVE_ICON_URL;
      
      console.log('设置按钮已点击，发送消息打开 Side Panel...');
      
      // --- 发送消息给 Background Script --- 
      chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送 openSidePanel 消息时出错:', chrome.runtime.lastError.message);
          alert('无法打开设置面板，请检查扩展或稍后重试。'); // 简单的用户反馈
        } else {
          console.log('打开 Side Panel 的消息已发送，后台响应:', response);
          // 可以根据后台响应做进一步处理，例如更新图标状态
        }
      });
      // --- 消息发送结束 ---
    }
  );

  panel.appendChild(translateButton);
  panel.appendChild(settingsButton);

  // 将面板附加到左侧控件
  leftControls.appendChild(panel);

  controlsInjected = true;
  console.log('自定义控件注入成功。');
}

/**
 * 初始化内容脚本。
 * 读取初始状态并设置 MutationObserver。
 */
function initialize() {
  // 从存储中读取初始翻译状态
  chrome.storage.sync.get(['translateActive'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('读取存储时出错:', chrome.runtime.lastError);
    } else {
      translateActive = !!result.translateActive; // 确保是布尔值
      console.log('初始翻译状态:', translateActive);
    }
    // 尝试立即注入控件
    injectControls(); // 这也会确保工具提示存在
  });

  // 观察 DOM 变化以查找播放器控件和容器
  const observer = new MutationObserver((mutationsList, observer) => {
    let playerContainerFound = document.querySelector('.html5-video-player') as HTMLElement;
    let controlsFound = document.querySelector('.ytp-left-controls');

    // 优先尝试创建叠加层，因为它可能比控件先出现
    if (playerContainerFound && !subtitleOverlayElement) {
        console.log('Observer 找到播放器容器，创建叠加层...');
        createSubtitleOverlay(playerContainerFound);
    }

    // 检查是否可以注入控件
    if (playerContainerFound && controlsFound && !controlsInjected) {
      console.log('Observer 找到播放器容器和控件，注入控件...');
      injectControls(); // 这会再次尝试创建叠加层（如果之前失败了）
      // 如果我们假设播放器和控件一旦加载就不会消失，可以停止观察
      // observer.disconnect(); 
      // console.log('MutationObserver 已停止。');
      return; // 注入后可以退出当前回调
    }
    
    // 如果只注入了控件但还没停止观察 (例如动态加载场景)
    if (controlsInjected) {
       // 理论上可以停止了，除非控件会被销毁重建
       // observer.disconnect(); 
       // console.log('MutationObserver 已停止 (控件已注入)。');
        return;
    }

  });

  // 开始观察 document body 的子节点添加
  observer.observe(document.body, { childList: true, subtree: true });
  console.log('MutationObserver 已启动，监视播放器和控件。');
}

// 运行初始化逻辑
initialize(); 