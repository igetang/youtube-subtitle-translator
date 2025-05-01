/**
 * Chrome 扩展 内容脚本
 */

console.log('内容脚本已加载。');

// 移除或注释掉旧的后台通信示例
/*
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
});
*/

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

// --- 新增：用于和 Main World 通信的变量 ---
/** Promise 的 resolve 函数，用于在收到字幕轨道时解决等待 */
let resolveCaptionTracksPromise: ((tracks: any[] | null) => void) | null = null;
/** Promise 的 reject 函数，用于处理错误或超时 */
let rejectCaptionTracksPromise: ((reason?: any) => void) | null = null;
/** 标记是否已向主世界发送过请求 */
let captionTracksRequestSent = false;
/** Main World 脚本是否已准备就绪 */
let mainWorldReady = false;
// --- 结束新增 ---

/** 定义 ytInitialPlayerResponse 中我们关心的部分结构 (保持，虽然获取方式变了) */
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
/** 全局变量，用于引用 video 元素的引用 */
let videoElement: HTMLVideoElement | null = null;
/** 全局变量，用于存储 requestAnimationFrame 的 ID，方便取消 */
let animationFrameId: number | null = null;
/** 缓存找到的字幕轨道，避免重复查找 - 现在存储从 main-world 获取的原始轨道 */
let cachedCaptionTracks: any[] | null = null;

/** 标记当前视频的轨道信息是否已获取和处理 */
let tracksInfoFetched: boolean = false;
/** 存储处理后的可用轨道信息 (再次包含 kind) */
let processedAvailableTracks: { languageCode: string, languageName: string, kind: string }[] | null = null;


// --- Tooltip Functions (Keep as is) --- 

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

// --- Button Creation Functions (Keep as is) --- 

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
    pointer-events: none; /* 边框不应捕获鼠标事件 */
  `;
  return border;
}

/**
 * 为按钮创建图标图像元素。
 * @param {string} src - 图标的 URL。
 * @param {string} alt - 图标的替代文本。
 * @returns {HTMLImageElement} 图标图像元素。
 */
function createIconImage(src: string, alt: string): HTMLImageElement {
  const icon = document.createElement('img');
  icon.src = src;
  icon.alt = alt;
  icon.style.cssText = `
    position: relative; /* 使其在边框上方 */
    width: 24px;
    height: 24px;
    vertical-align: middle; /* 与按钮文本对齐 */
  `;
  return icon;
}

/**
 * 创建一个自定义控制按钮，包含图标和边框。
 * @param {string} id - 按钮的 ID。
 * @param {string} tooltipText - 悬停时显示的工具提示文本。
 * @param {string} initialIconSrc - 按钮图标的初始 URL。
 * @param {() => void} onClick - 按钮点击时的回调函数。
 * @returns {{ button: HTMLButtonElement; icon: HTMLImageElement }} 包含按钮元素和图标元素的对象。
 */
function createControlButton(
  id: string,
  tooltipText: string,
  initialIconSrc: string,
  onClick: () => void
): { button: HTMLButtonElement; icon: HTMLImageElement } {
  const button = document.createElement('button');
  button.id = id;
  button.className = 'ytp-button vid-translate-button'; // 使用 YouTube 类名和自定义类名
  button.setAttribute('aria-label', tooltipText);
  button.style.cssText = `
    position: relative; /* 使边框能够绝对定位 */
    overflow: visible; /* 确保边框可见 */
    width: 48px; /* 增加宽度以容纳边框 */
    height: 100%;
    display: inline-flex; /* 使用 flex 居中图标 */
    align-items: center;
    justify-content: center;
  `;

  const border = createBorderImage();
  const icon = createIconImage(initialIconSrc, tooltipText);

  button.appendChild(border); // 先添加边框
  button.appendChild(icon); // 再添加图标

  // 添加事件监听器
  button.addEventListener('click', onClick);
  button.addEventListener('mouseenter', () => showTooltip(button, tooltipText));
  button.addEventListener('mouseleave', hideTooltip);

  return { button, icon };
}


// --- Subtitle Fetching & Processing (Keep fetchSubtitleData, processAndStoreSubtitles) ---

/**
 * 根据 baseUrl 异步获取字幕数据。
 * @param {string} baseUrl - 字幕文件的 URL。
 * @returns {Promise<object | null>} 返回解析后的 JSON 或 XML 对象，如果失败则返回 null。
 */
async function fetchSubtitleData(baseUrl: string): Promise<object | null> {
  console.log('Fetching subtitle data from:', baseUrl);
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} while fetching ${baseUrl}`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/xml') || contentType?.includes('text/xml')) {
      const xmlText = await response.text();
      // 简单的 XML 解析 (仅示例，可能需要更健壮的库)
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      console.log('Fetched and parsed XML subtitle data.');
      // TODO: 将 XML 解析为与 JSON 结构兼容的对象
      // 这是一个占位符，实际需要实现 XML 到 { events: [...] } 的转换
      const events = Array.from(xmlDoc.getElementsByTagName('text')).map((el, index) => ({
          tStartMs: parseFloat(el.getAttribute('start') || '0') * 1000,
          dDurationMs: parseFloat(el.getAttribute('dur') || '0') * 1000,
          segs: [{ utf8: el.textContent?.trim() || '' }]
      }));
      return { events: events };
    } else {
      // 默认假设是 JSON 或 JSON 变体
      const jsonData = await response.json();
      console.log('Fetched JSON subtitle data.');
      return jsonData;
    }
  } catch (error) {
    console.error('Error fetching or parsing subtitle data:', error);
    return null;
  }
}

/**
 * 处理从 API 获取的原始字幕 JSON 数据，并将其存储在全局变量中。
 * @param {any} subtitleJson - 包含字幕事件的 JSON 对象。
 */
function processAndStoreSubtitles(subtitleJson: any) {
  if (!subtitleJson || !Array.isArray(subtitleJson.events)) {
    console.error('Invalid subtitle JSON data received:', subtitleJson);
    processedSubtitleEvents = [];
    return;
  }

  processedSubtitleEvents = subtitleJson.events.map((event: any) => {
    const start = event.tStartMs;
    const duration = event.dDurationMs;
    // 处理可能存在的多个 segs
    const text = (event.segs || [])
      .map((seg: any) => seg?.utf8 || '')
      .join('') // 将所有片段连接起来
      .trim(); // 去除首尾空格

    return {
      start: start / 1000, // 转换为秒
      end: (start + duration) / 1000, // 计算结束时间（秒）
      text: text,
    };
  }).filter((event: { start: number; end: number; text: string }) => event.text); // 过滤掉没有文本的事件

  console.log(`Processed ${processedSubtitleEvents.length} subtitle events.`);
  // 可选：打印前几个事件进行调试
  // console.log('First few processed events:', processedSubtitleEvents.slice(0, 5));
}

// --- Subtitle Display & Sync (Keep handleSubtitleUpdate, updateSubtitleLoop, stopSubtitleUpdates, createSubtitleOverlay) ---

/**
 * 字幕更新的核心逻辑：根据当前视频时间查找并显示字幕。
 */
function handleSubtitleUpdate() {
    if (!videoElement || !subtitleOverlayElement) {
        // console.log('Video or overlay not found, skipping subtitle update.');
        return; // 如果元素丢失，则不执行更新
    }

    const currentTime = videoElement.currentTime;
    let currentSubtitle = '';

    // 查找当前时间对应的字幕
    const activeEvent = processedSubtitleEvents.find(
        (event) => currentTime >= event.start && currentTime < event.end
    );

    if (activeEvent) {
        currentSubtitle = activeEvent.text;
        // 处理 HTML 实体（例如 &amp; -> &）
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = currentSubtitle;
        currentSubtitle = tempDiv.textContent || tempDiv.innerText || '';
    }

    // 更新字幕内容和可见性
    if (subtitleOverlayElement.textContent !== currentSubtitle) {
        subtitleOverlayElement.textContent = currentSubtitle;
    }

    const shouldShow = !!currentSubtitle;
    const currentOpacity = parseFloat(subtitleOverlayElement.style.opacity || '0');
    const targetOpacity = shouldShow ? 1 : 0;

    if (currentOpacity !== targetOpacity) {
        // 添加简单的淡入淡出效果
        subtitleOverlayElement.style.opacity = targetOpacity.toString();
        // 如果需要立即隐藏而不是淡出，可以设置 visibility
        if (!shouldShow) {
            // 在淡出动画结束后隐藏
            setTimeout(() => {
                if (subtitleOverlayElement && parseFloat(subtitleOverlayElement.style.opacity) === 0) {
                    subtitleOverlayElement.style.visibility = 'hidden';
                }
            }, 200); // 稍大于 transition 时间
        } else {
            subtitleOverlayElement.style.visibility = 'visible';
        }
    }
}

/**
 * 使用 requestAnimationFrame 的字幕更新循环。
 */
function updateSubtitleLoop() {
    handleSubtitleUpdate();
    // 继续请求下一帧
    if (translateActive) { // 仅当翻译激活时继续循环
       animationFrameId = requestAnimationFrame(updateSubtitleLoop);
    } else {
        animationFrameId = null; // 确保 ID 被清除
    }
}

/**
 * 停止字幕更新循环并隐藏叠加层。
 */
function stopSubtitleUpdates() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        console.log('Subtitle update loop stopped.');
    }
    if (subtitleOverlayElement) {
        subtitleOverlayElement.style.opacity = '0';
        subtitleOverlayElement.style.visibility = 'hidden';
        subtitleOverlayElement.textContent = ''; // 清空内容
    }
}

/**
 * 创建字幕叠加层元素并附加到播放器容器。
 * @param {HTMLElement} playerContainer - YouTube 播放器容器元素。
 */
function createSubtitleOverlay(playerContainer: HTMLElement) {
    if (subtitleOverlayElement) return; // 防止重复创建

    subtitleOverlayElement = document.createElement('div');
    subtitleOverlayElement.id = 'yt-translator-subtitle-overlay';
    subtitleOverlayElement.style.cssText = `
        position: absolute;
        bottom: 60px; /* 调整到底部距离 */
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 5px 15px;
        border-radius: 5px;
        font-size: 1.6rem; /* 字号调整 */
        text-align: center;
        z-index: 2000; /* 确保在控件之上 */
        pointer-events: none; /* 允许点击穿透 */
        max-width: 80%;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease-in-out;
        text-shadow: 1px 1px 2px black;
    `;

    playerContainer.appendChild(subtitleOverlayElement);
    console.log('Subtitle overlay created and appended.');
}


// --- Control Injection Logic (Keep as is) ---

/**
 * 将自定义控件注入到 YouTube 播放器。
 * 此函数现在依赖于新的 `fetchAndProcessTracksInfo`。
 */
function injectControls() {
  if (controlsInjected) {
    console.log('控件已注入，跳过。');
    return;
  }

  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) {
    console.log('未找到 .ytp-right-controls，稍后重试...');
    return;
  }

  const playerContainer = document.querySelector('.html5-video-player');
  if (playerContainer && !subtitleOverlayElement) {
    createSubtitleOverlay(playerContainer as HTMLElement);
  }

  // 创建按钮容器
  const customControlsPanel = document.createElement('div');
  customControlsPanel.className = 'ytp-chrome-controls vid-translator-panel';
  customControlsPanel.style.display = 'flex';
  customControlsPanel.style.alignItems = 'center';

  // 创建翻译按钮
  const { button: translateButton, icon: translateIcon } = createControlButton(
    'vid-translate-toggle-button',
    '开启/关闭翻译',
    translateActive ? ON_ICON_URL : OFF_ICON_URL,
    async () => {
      translateActive = !translateActive;
      console.log('翻译按钮点击，新状态:', translateActive);
      translateIcon.src = translateActive ? ON_ICON_URL : OFF_ICON_URL;
      // 将状态保存到存储
      chrome.storage.sync.set({ translateActive: translateActive });

      if (translateActive) {
        // 确保视频元素存在
        if (!videoElement) {
            videoElement = document.querySelector('video');
            if (!videoElement) {
                console.error('未能找到 video 元素，无法开始翻译。');
                return;
            }
        }
        // 确保字幕轨道信息已获取 (如果尚未获取)
        if (!tracksInfoFetched) {
            console.log('翻译开启，需要获取字幕轨道信息...');
            try {
                 await fetchAndProcessTracksInfo(); // 等待获取完成
                 if (!processedAvailableTracks || processedAvailableTracks.length === 0) {
                     console.warn('没有可用的字幕轨道，无法进行翻译。');
                     // 可以给用户提示
                     translateActive = false; // 无法翻译，状态改回去
                     translateIcon.src = OFF_ICON_URL;
                     chrome.storage.sync.set({ translateActive: translateActive });
                     return;
                 }
            } catch (error) {
                console.error('获取轨道信息失败，无法开启翻译。', error);
                translateActive = false; // 获取失败，状态改回去
                translateIcon.src = OFF_ICON_URL;
                chrome.storage.sync.set({ translateActive: translateActive });
                return;
            }
        }

        // TODO: 在这里添加实际选择轨道、获取字幕内容、翻译和显示的逻辑
        // 暂时只启动/停止原始字幕显示循环
        console.log('启动字幕更新循环...');
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(updateSubtitleLoop);
        }
      } else {
        console.log('停止字幕更新循环...');
        stopSubtitleUpdates();
      }
    }
  );

  // 创建设置按钮
  const { button: settingsButton } = createControlButton(
    'vid-translate-settings-button',
    '翻译设置',
    SETTING_ICON_URL,
    () => {
      console.log('设置按钮点击');
      // 确保轨道信息已获取 (打开设置面板需要源语言列表)
      fetchAndProcessTracksInfo().then(() => {
          console.log('轨道信息已确认，发送打开 Side Panel 消息...');
          // 向后台脚本发送消息以打开侧边栏
          chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('发送 openSidePanel 消息时出错:', chrome.runtime.lastError.message);
            } else if (response && response.status === 'success') {
              console.log('Side Panel 打开成功。');
            } else {
              console.warn('打开 Side Panel 失败或收到意外响应:', response);
            }
          });
      }).catch(error => {
           console.error('获取轨道信息以打开设置失败:', error);
      });
    }
  );

  // 将按钮添加到面板
  customControlsPanel.appendChild(translateButton);
  customControlsPanel.appendChild(settingsButton);

  // 将面板注入到右侧控件
  rightControls.insertBefore(customControlsPanel, rightControls.firstChild);

  controlsInjected = true;
  console.log('自定义控件注入成功。');
}


// --- Initialization and Navigation Handling --- 

/**
 * 注入主世界脚本到页面中。
 */
function injectMainWorldScript() {
  try {
    const scriptId = 'yt-translator-main-world-script';
    if (document.getElementById(scriptId)) {
      console.log('[Content Script] Main world script already injected.');
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('src/main-world.js');
    script.type = 'module'; // 如果 main-world.js 使用了 ES 模块特性
    (document.head || document.documentElement).appendChild(script);
    console.log('[Content Script] Injected main world script:', script.src);
    script.onload = () => {
      console.log('[Content Script] Main world script loaded.');
      // 可选：如果需要明确知道脚本何时准备好，可以在这里设置一个标志，或等待 'MAIN_WORLD_READY' 消息
    };
    script.onerror = (e) => {
       console.error('[Content Script] Failed to load main world script:', e);
    };
  } catch (error) {
    console.error('[Content Script] Error injecting main world script:', error);
  }
}

/**
 * 初始化内容脚本，包括按钮注入、DOM 监听和主世界脚本注入。
 */
function initialize() {
  console.log('初始化内容脚本 (v2 - PostMessage)...');

  // --- 注入主世界脚本 ---
  injectMainWorldScript();
  // --- 结束注入 ---

  // 从存储中读取初始翻译状态
  chrome.storage.sync.get('translateActive', (result) => {
    translateActive = !!result.translateActive; // 使用 !! 确保是布尔值
    console.log('从存储加载的初始翻译状态:', translateActive);
    // 尝试立即注入（如果控件已存在）
    injectControls();
  });

  // 使用 MutationObserver 监听 DOM 变化以确保注入
  const observer = new MutationObserver((mutations) => {
    // 优化：检查是否有相关节点变化，以及控件是否尚未注入
    if (!controlsInjected) {
       const rightControls = document.querySelector('.ytp-right-controls'); // 改为检查右侧控件
       const playerContainer = document.querySelector('.html5-video-player'); // 同时检查播放器容器
       if (rightControls) {
         injectControls(); // 如果找到右侧控件，尝试注入
       }
       // 如果叠加层需要播放器容器，也在这里检查
       if (playerContainer && !subtitleOverlayElement) {
           createSubtitleOverlay(playerContainer as HTMLElement);
       }
    }
    // 如果 video 元素丢失了（例如页面导航），尝试重新获取
    if (translateActive && !videoElement) {
        videoElement = document.querySelector('video');
        if (videoElement && !animationFrameId) {
            // 如果翻译激活且有 video 元素，但循环未运行，启动它
            console.log('在 MutationObserver 中重新找到 video 元素，尝试重启字幕循环。');
            // 需要确保字幕数据已加载才能启动
            // if (processedSubtitleEvents.length > 0) {
            //    animationFrameId = requestAnimationFrame(updateSubtitleLoop);
            // }
        }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('MutationObserver 已设置。');


  // --- 处理来自 Side Panel 的消息 ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'requestAvailableTracks') {
          console.log('收到来自 Side Panel 的 requestAvailableTracks 请求');
          // --- 调用新的核心函数获取轨道信息 ---
          fetchAndProcessTracksInfo().then(tracks => {
              console.log('发送给 Side Panel 的可用轨道信息 (来自 Main World):', tracks);
              sendResponse({ availableTracks: tracks || [] });
          }).catch(error => {
              console.error('处理 requestAvailableTracks 时出错 (Main World):', error);
              sendResponse({ availableTracks: [] });
          });
          return true; // 异步响应
      }
      return false;
  });

  // --- 新增：监听来自 Main World 的消息 ---
  window.addEventListener('message', (event) => {
    // 验证消息来源和类型
    if (event.source !== window || event.data?.source !== 'main-world') {
      return;
    }

    const { type, payload, error } = event.data;

    if (type === 'MAIN_WORLD_READY') {
        console.log('[Content Script] Received MAIN_WORLD_READY signal.');
        mainWorldReady = true;
        // 如果有等待发送的请求，可以在这里发送 (可能不需要，因为请求只在需要时触发)
        // if (captionTracksRequestSent && !resolveCaptionTracksPromise) {
        //      console.log('[Content Script] Main world ready, re-attempting request...');
        // }
    } else if (type === 'CAPTION_TRACKS_RESPONSE') {
      console.log('[Content Script] Received CAPTION_TRACKS_RESPONSE:', event.data);
      if (error) {
        console.error('[Content Script] Error from main world script:', error);
        if (rejectCaptionTracksPromise) {
          rejectCaptionTracksPromise(new Error(error));
        }
      } else if (payload && resolveCaptionTracksPromise) {
        // 成功收到轨道数据，解决 Promise
        resolveCaptionTracksPromise(payload.captionTracks || null);
      } else {
          console.warn('[Content Script] Received caption tracks response but no pending promise.');
      }
      // 清理 Promise 回调
      resolveCaptionTracksPromise = null;
      rejectCaptionTracksPromise = null;
    }
  });
  // --- 结束监听 Main World 消息 ---

  // --- 处理 YouTube 页面内导航 ---
  // 确保只添加一次监听器
  if (!(document as any).__yt_navigate_listener_added__) {
      document.addEventListener('yt-navigate-finish', handleYoutubeNavigation);
      (document as any).__yt_navigate_listener_added__ = true;
      console.log('已添加 yt-navigate-finish 监听器。');
  } else {
       console.log('yt-navigate-finish 监听器已存在，跳过添加。');
  }
}

/**
 * 获取并处理当前视频的可用字幕轨道信息 (通过 Main World)。
 * 使用 Promise 来处理异步通信。
 * 只在首次调用时实际请求，之后返回缓存结果。
 * @returns {Promise<{ languageCode: string, languageName: string, kind: string }[] | null>} 处理后的轨道信息数组，或 null 表示获取失败。
 */
async function fetchAndProcessTracksInfo(): Promise<{ languageCode: string, languageName: string, kind: string }[] | null> {
    if (tracksInfoFetched) {
        console.log('[CS-fetch] 轨道信息已获取，返回缓存的处理结果。');
        return processedAvailableTracks;
    }

    console.log('[CS-fetch] 首次请求轨道信息 (向 Main World)...');

    // 如果请求已发送且正在等待响应，避免重复请求
    if (captionTracksRequestSent && (resolveCaptionTracksPromise || rejectCaptionTracksPromise)) {
        console.warn('[CS-fetch] 请求已发送，正在等待响应，请勿重复调用。');
        // 返回一个永远 pending 的 Promise 或 null，或者等待现有 Promise
        // 等待现有 Promise 的简化方式：
        if (resolveCaptionTracksPromise && rejectCaptionTracksPromise) {
             console.log('[CS-fetch] 等待现有 Promise 完成...');
             return new Promise((res, rej) => {
                 const originalResolve = resolveCaptionTracksPromise;
                 const originalReject = rejectCaptionTracksPromise;
                 // @ts-ignore possible null assignment
                 resolveCaptionTracksPromise = (value) => { originalResolve(value); res(processedAvailableTracks); }; // 解决时返回处理后的结果
                 // @ts-ignore possible null assignment
                 rejectCaptionTracksPromise = (reason) => { originalReject(reason); rej(reason); };
             });
        }
        return null; // 如果无法附加到现有 Promise，返回 null
    }

    // --- 创建 Promise 来等待 Main World 的响应 ---
    const captionTracksPromise = new Promise<any[] | null>((resolve, reject) => {
        resolveCaptionTracksPromise = resolve;
        rejectCaptionTracksPromise = reject;

        // 设置超时，例如 10 秒
        const timeoutId = setTimeout(() => {
            if (rejectCaptionTracksPromise) {
                console.error('[CS-fetch] 获取字幕轨道超时。');
                rejectCaptionTracksPromise(new Error('Timeout waiting for caption tracks from main world'));
                resolveCaptionTracksPromise = null; // 清理引用
                rejectCaptionTracksPromise = null; // 清理引用
                captionTracksRequestSent = false; // 允许下次重试
            }
        }, 10000);

        // 包装 resolve/reject 以清理超时
        const wrapPromiseCallback = <T extends (...args: any[]) => void>(callback: T | null): T | null => {
            if (!callback) return null;
            return ((...args: any[]) => {
                clearTimeout(timeoutId);
                callback(...args);
            }) as T;
        };

        resolveCaptionTracksPromise = wrapPromiseCallback(resolveCaptionTracksPromise);
        rejectCaptionTracksPromise = wrapPromiseCallback(rejectCaptionTracksPromise);

        // --- 发送消息到 Main World (如果已就绪) ---
        const sendMessageToMainWorld = () => {
            console.log('[CS-fetch] 发送 REQUEST_CAPTION_TRACKS 消息到 Main World...');
            window.postMessage({
                source: 'content-script',
                type: 'REQUEST_CAPTION_TRACKS'
            }, '*'); // Target origin '*' can be refined
            captionTracksRequestSent = true; // 标记请求已发送
        };

        // 检查 Main World 是否已就绪
        if (mainWorldReady) {
            sendMessageToMainWorld();
        } else {
            // 如果 Main World 尚未就绪，等待 'MAIN_WORLD_READY' 消息
            console.log('[CS-fetch] Main World 尚未就绪，等待 MAIN_WORLD_READY 消息...');
            const readyListener = (event: MessageEvent) => {
                if (event.source === window && event.data?.source === 'main-world' && event.data?.type === 'MAIN_WORLD_READY') {
                    console.log('[CS-fetch] 在等待期间收到 MAIN_WORLD_READY，发送消息...');
                    window.removeEventListener('message', readyListener);
                    sendMessageToMainWorld();
                }
            };
            window.addEventListener('message', readyListener);
            // 额外超时：如果在一定时间内未收到 READY 信号，也视为失败
            const readyTimeoutId = setTimeout(() => {
                window.removeEventListener('message', readyListener);
                if (rejectCaptionTracksPromise) {
                    console.error('[CS-fetch] 等待 MAIN_WORLD_READY 超时。');
                     rejectCaptionTracksPromise(new Error('Timeout waiting for main world script to be ready'));
                     resolveCaptionTracksPromise = null;
                     rejectCaptionTracksPromise = null;
                     captionTracksRequestSent = false;
                }
            }, 5000); // 例如 5 秒
            // 包装 resolve/reject 以清理 readyTimeoutId
             const wrapPromiseCallbackForReady = <T extends (...args: any[]) => void>(callback: T | null): T | null => {
                 if (!callback) return null;
                 return ((...args: any[]) => {
                     clearTimeout(readyTimeoutId);
                     window.removeEventListener('message', readyListener); // 确保监听器被移除
                     callback(...args);
                 }) as T;
            };
            resolveCaptionTracksPromise = wrapPromiseCallbackForReady(resolveCaptionTracksPromise);
            rejectCaptionTracksPromise = wrapPromiseCallbackForReady(rejectCaptionTracksPromise);
        }
    });
    // --- 结束 Promise 创建 ---

    try {
        // 等待 Main World 的响应
        const rawTracks = await captionTracksPromise;
        console.log('[CS-fetch] 从 Main World 收到原始轨道:', rawTracks);

        if (rawTracks && Array.isArray(rawTracks) && rawTracks.length > 0) {
            cachedCaptionTracks = rawTracks; // 缓存原始数据
            console.log('[CS-fetch] 处理收到的原始轨道数据...');

            // --- 处理逻辑：直接映射所有轨道，保持原始 kind --- 
             processedAvailableTracks = rawTracks.map((track: any) => {
                // 直接使用原始的 kind 值，不做任何修改或默认赋值
                return {
                    languageCode: track.languageCode,
                    languageName: track.name?.simpleText || track.languageCode, // 使用 name.simpleText，回退到 code
                    kind: track.kind // 直接使用原始 kind (可能为 undefined, null, 'asr', etc.)
                };
            });
            console.log(`[CS-fetch] 处理完成的轨道信息:`, processedAvailableTracks);

        } else {
            console.warn('[CS-fetch] 从 Main World 收到的轨道数据无效或为空。');
            cachedCaptionTracks = null;
            processedAvailableTracks = [];
        }

        tracksInfoFetched = true;
        // 清理请求发送标志，以便下次导航可以重新请求
        // captionTracksRequestSent = false; // 移动到 finally 或 navigation handler

    } catch (error) {
        console.error('[CS-fetch] 获取或处理轨道信息时出错:', error);
        tracksInfoFetched = false; // 获取失败，标记为未获取
        cachedCaptionTracks = null;
        processedAvailableTracks = null;
        // return null; // 错误时将在 finally 后返回
        throw error; // 重新抛出错误，让调用者知道失败了
    } finally {
        // 清理回调引用，无论成功或失败
        resolveCaptionTracksPromise = null;
        rejectCaptionTracksPromise = null;
        // 不在这里重置 captionTracksRequestSent，由导航处理器负责
        console.log('[CS-fetch] Promise 处理完成 (finally)。');
    }
     // 只有在成功时返回处理结果
     return processedAvailableTracks;
}


/**
 * 处理 YouTube 页面内导航完成事件。
 * 重置与特定视频相关的状态。
 */
function handleYoutubeNavigation() {
    console.log('检测到 YouTube 导航 (yt-navigate-finish) v2...');

    console.log('重置视频状态 (v2)...');
    // 1. 重置注入标志（允许下次重新注入控件）
    controlsInjected = false;

    // 2. 重置字幕轨道信息状态和缓存
    tracksInfoFetched = false;
    processedAvailableTracks = null;
    cachedCaptionTracks = null;
    captionTracksRequestSent = false; // 允许为新页面发送请求
    // 清理可能未完成的 Promise 回调
    if (rejectCaptionTracksPromise) {
        rejectCaptionTracksPromise(new Error('Navigation occurred'));
    }
    resolveCaptionTracksPromise = null;
    rejectCaptionTracksPromise = null;

    // 3. 停止并清理当前字幕显示
    stopSubtitleUpdates();
    processedSubtitleEvents = [];
    if (subtitleOverlayElement) {
        subtitleOverlayElement.textContent = '';
        subtitleOverlayElement.style.opacity = '0';
        subtitleOverlayElement.style.visibility = 'hidden';
    }

    // 4. 重置 video 元素引用
    videoElement = null;

    // 5. 主世界脚本通常不需要重新注入，因为它已在页面上
    // MutationObserver 会负责重新调用 injectControls 来添加按钮

    console.log('视频状态已重置 (v2)。等待用户操作或页面加载触发后续逻辑。');
}

// 在脚本加载时执行初始化
initialize(); 