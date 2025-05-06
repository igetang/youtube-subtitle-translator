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
 * 并处理字幕的获取、处理和显示。
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
let processedSubtitleEvents: { start: number; end: number; originalText: string; translatedText: string }[] = [];
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
/** 全局变量，用于引用翻译切换按钮的图标元素，方便更新 */
let translateToggleButtonIcon: HTMLImageElement | null = null;


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

// --- REVERT to Button Creation Functions using IMG --- 

/**
 * 为按钮创建边框图像元素。
 * @returns {HTMLImageElement} 边框图像元素。
 */
function createBorderImage(): HTMLImageElement {
  const border = document.createElement('img');
  border.src = NORMAL_BORDER_URL;
  // 保持绝对定位居中
  border.style.cssText = `
    position: absolute;
    width: 36px;
    height: 36px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
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
  // 保持绝对定位居中
  icon.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
  `;
  return icon;
}

/**
 * 创建一个自定义控制按钮。
 * @param {string} id - 按钮的 ID。
 * @param {string} tooltipText - 悬停时显示的工具提示文本。
 * @param {string} initialIconSrc - 图标的初始 URL。
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
  button.className = 'ytp-button vid-translate-button'; // 继承 ytp-button 样式
  button.setAttribute('aria-label', tooltipText);
  // --- 重新应用关键的内联样式 --- 
  button.style.cssText = `
    position: relative; /* 保留，用于子元素绝对定位 */
    overflow: visible; /* 保留，确保边框可见 */
    width: 48px; /* 保留宽度 */
    display: inline-flex; /* <--- 重新添加，让父容器知道如何处理 */
    align-items: center; /* <--- 重新添加，垂直居中内部内容 (虽然是绝对定位) */
    justify-content: center; /* <--- 重新添加，水平居中内部内容 */
    /* 移除其他可能冲突的样式: height, padding, border, background, cursor */
  `;

  const border = createBorderImage(); // 绝对定位居中
  const icon = createIconImage(initialIconSrc, tooltipText); // 绝对定位居中

  button.appendChild(border);
  button.appendChild(icon);

  // 添加事件监听器
  button.addEventListener('click', onClick);
  button.addEventListener('mouseenter', () => showTooltip(button, tooltipText));
  button.addEventListener('mouseleave', hideTooltip);

  return { button, icon }; // 返回 icon (img) 而不是 iconSvg
}


// --- Subtitle Fetching & Processing (Keep as is) ---

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
 * 解析字幕 JSON 数据并存储结果。
 * 根据是原生轨道 ('native') 还是需要翻译的源轨道 ('original') 来填充字段。
 * @param subtitleJson 从 fetchSubtitleData 获取的字幕 JSON 对象。
 * @param type 指示字幕来源类型。
 */
function processAndStoreSubtitles(subtitleJson: any, type: 'original' | 'native') {
  processedSubtitleEvents = []; // 清空旧数据
  if (subtitleJson && subtitleJson.events) {
    subtitleJson.events.forEach((event: any) => {
      if (event.tStartMs !== undefined && event.segs) { // 检查 tStartMs 是否存在
        const start = event.tStartMs / 1000; // 转换为秒
        // 确保 duration 合理，避免负数或过大值，提供默认值
        const duration = event.dDurationMs > 0 ? event.dDurationMs / 1000 : 5; // 默认持续时间 5 秒
        const end = start + duration;
        // 将所有文本片段连接起来
        const text = event.segs.map((seg: any) => seg.utf8 || '').join('');
        if (text.trim()) { // 确保文本不为空
          const newEvent = {
              start: start,
              end: end,
              originalText: type === 'original' ? text : (type === 'native' ? text : ''), // 原文字段
              translatedText: type === 'native' ? text : '' // 译文字段 (native 时与原文相同, original 时暂时为空)
          };
          processedSubtitleEvents.push(newEvent);
        }
      }
    });
    console.log(`处理并存储了 ${processedSubtitleEvents.length} 条字幕事件 (类型: ${type})。`);
  } else {
    console.error('无效的字幕 JSON 数据:', subtitleJson);
  }
}

// --- Subtitle Display & Sync (Keep handleSubtitleUpdate, updateSubtitleLoop, stopSubtitleUpdates, createSubtitleOverlay) ---

/**
 * 根据当前视频时间、存储的字幕模式更新字幕叠加层。
 * 现在会处理原文和译文。
 */
async function handleSubtitleUpdate() { // 改为 async 以便获取设置
  if (!videoElement || !subtitleOverlayElement || processedSubtitleEvents.length === 0) {
    if (subtitleOverlayElement && subtitleOverlayElement.style.display !== 'none') {
      subtitleOverlayElement.style.display = 'none'; // 隐藏（如果没有视频或字幕）
      subtitleOverlayElement.innerText = ''; // 清空内容
    }
    return;
  }

  const currentTime = videoElement.currentTime;
  let textToShow = '';

  // 查找当前时间对应的字幕事件
  const activeEvent = processedSubtitleEvents.find(
    (event) => currentTime >= event.start && currentTime <= event.end
  );

  if (activeEvent) {
    // 从存储中获取当前的字幕显示模式
    let subtitleMode = 'bilingual'; // 默认值
    try {
      // 注意：storage.sync 可能有延迟，如果需要绝对实时，考虑用 message 或 storage.local
      const settings = await chrome.storage.sync.get(['subtitleMode']);
      subtitleMode = settings.subtitleMode || 'bilingual';
    } catch (e) {
      console.error("获取 subtitleMode 失败:", e);
      // 出错时继续使用默认值
    }

    // 根据模式组合要显示的文本
    const original = activeEvent.originalText || '';
    const translated = activeEvent.translatedText || ''; // 翻译可能尚未完成

    if (subtitleMode === 'bilingual') {
      // 双语模式：如果原文和译文都存在且不同，则都显示；否则显示可用的那个
      if (original && translated && original !== translated) {
        textToShow = `${original}\n${translated}`; // 用换行符分隔
      } else if (translated) {
        textToShow = translated; // 如果只有译文（例如原生轨道被视为译文）
      } else {
        textToShow = original; // 如果只有原文（例如翻译未完成）
      }
    } else if (subtitleMode === 'target') {
      // 目标语言模式：优先显示译文，如果译文不可用（包括未翻译），则显示原文
      textToShow = translated || original;
    } else { // 'source' 模式或未识别模式
      // 源语言模式：优先显示原文，如果原文不可用（理论上不应发生），则显示译文
      textToShow = original || translated;
    }

     // 使用 HTML 实体解码器，避免显示 &amp; 等
     if (textToShow) {
         const tempDiv = document.createElement('div');
         tempDiv.innerHTML = textToShow; // 利用浏览器的解析
         textToShow = tempDiv.textContent || tempDiv.innerText || '';
     }

  }

  // 更新叠加层内容和可见性
  // 使用 innerText 以便正确渲染换行符 \n
  if (textToShow) {
    if (subtitleOverlayElement.innerText !== textToShow) {
      subtitleOverlayElement.innerText = textToShow;
    }
    if (subtitleOverlayElement.style.display === 'none' || subtitleOverlayElement.style.visibility === 'hidden') {
      subtitleOverlayElement.style.display = 'block';
      subtitleOverlayElement.style.visibility = 'visible';
      subtitleOverlayElement.style.opacity = '1'; // 确保可见
    }
  } else {
    if (subtitleOverlayElement.style.display !== 'none') {
      subtitleOverlayElement.style.opacity = '0';
      // 在淡出动画后隐藏
       setTimeout(() => {
           if (subtitleOverlayElement && subtitleOverlayElement.style.opacity === '0') {
               subtitleOverlayElement.style.display = 'none';
               subtitleOverlayElement.style.visibility = 'hidden';
               subtitleOverlayElement.innerText = ''; // 清空内容
           }
       }, 200); // 匹配 CSS transition 时间
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
        bottom: 70px; /* 调整到底部距离 - 增大以向上移动 */
        left: 50%;   
        transform: translateX(-50%); 
        background-color: rgba(0, 0, 0, 0.7); 
        color: white; 
        padding: 5px 15px;
        border-radius: 5px; 
        font-size: 1.8rem; /* 字号调整 - 增大 */
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


// --- NEW: Translation Process Function ---
/**
 * 启动翻译流程：获取轨道、获取字幕、处理并启动显示循环。
 * 新增逻辑：优先检查目标语言轨道是否存在。
 */
async function startTranslationProcess(): Promise<void> {
  console.log('启动翻译流程...');

  // 确保 video 元素存在
  if (!videoElement) {
    videoElement = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!videoElement) {
      console.error('无法找到 video 元素。');
      await setTranslateActive(false); 
      return;
    }
     videoElement.removeEventListener('timeupdate', handleSubtitleUpdate); 
  }

  // 1. 获取设置 (sourceLang, targetLang, subtitleMode)
  let settings: { sourceLang?: string; targetLang?: string; subtitleMode?: string } = {};
  try {
    settings = await chrome.storage.sync.get(['sourceLang', 'targetLang', 'subtitleMode']);
    if (!settings.targetLang) {
        console.warn('未在设置中找到目标语言');
        await setTranslateActive(false);
        return;
    }
     if (!settings.sourceLang) {
       console.warn('未在设置中找到源语言。');
     }
  } catch (error) {
    console.error('从 chrome.storage.sync 获取设置失败:', error);
    await setTranslateActive(false);
    return;
  }
  const targetLang = settings.targetLang;
  const sourceLang = settings.sourceLang;

  let targetTrackInfo: { languageCode: string, languageName: string, kind: string } | undefined = undefined;
  let needsTranslation = true; // Assume translation is needed initially
  let trackToFetch: any | null = null; // Track info with baseUrl etc.

  if (processedAvailableTracks && targetLang) {
    console.log(`[Matcher] Starting multi-level match for target: ${targetLang}`);

    // --- Priority 1: Exact Match ---
    console.log(`[Matcher P1] Trying exact match for: ${targetLang}`);
    targetTrackInfo = processedAvailableTracks.find(track => track.languageCode === targetLang);

    // --- Priority 2: Related Variant Match ---
    if (!targetTrackInfo) {
        console.log(`[Matcher P1 Failed] Trying related variant match (P2)`);
        const targetIsChineseScript = targetLang === 'zh-Hans' || targetLang === 'zh-Hant';
        const targetBase = targetLang.split(/[-_]/)[0]; // "zh", "en", "es"
        const targetHasRegionOrScript = targetLang.includes('-') || targetLang.includes('_');

        if (targetIsChineseScript) {
            // P2 (Chinese): Region Code Mapping
            console.log(`[Matcher P2 - zh] Trying region mapping for: ${targetLang}`);
            const hansMatches = ['zh-CN', 'zh-SG'];
            const hantMatches = ['zh-TW', 'zh-HK'];
            const regionMatches = targetLang === 'zh-Hans' ? hansMatches : hantMatches;
            targetTrackInfo = processedAvailableTracks.find(track => regionMatches.includes(track.languageCode));
        } else if (targetHasRegionOrScript) {
            // P2 (Non-Chinese, Target Specific): Find Base Code Track
            console.log(`[Matcher P2 - Non-zh Specific] Trying to find base code track '${targetBase}' for target: ${targetLang}`);
            targetTrackInfo = processedAvailableTracks.find(track => track.languageCode === targetBase);
        }
        // If target is already a base code (e.g., "en"), P2 doesn't apply in this direction.
    }

    // --- Priority 3: Generic / Base Code Match ---
    if (!targetTrackInfo) {
        console.log(`[Matcher P1 & P2 Failed] Trying generic/base code match (P3)`);
        const targetIsChineseScript = targetLang === 'zh-Hans' || targetLang === 'zh-Hant';
        const targetBase = targetLang.split(/[-_]/)[0];
        const targetHasRegionOrScript = targetLang.includes('-') || targetLang.includes('_');

        if (targetIsChineseScript) {
            // P3 (Chinese): Match generic 'zh'
            console.log(`[Matcher P3 - zh] Trying generic 'zh' match for: ${targetLang}`);
            targetTrackInfo = processedAvailableTracks.find(track => track.languageCode === 'zh');
        } else if (!targetHasRegionOrScript) { // Target is a base code like "en", "es"
            // P3 (Non-Chinese, Target General): Find *First* Specific Variant
             console.log(`[Matcher P3 - Non-zh General] Trying to find first specific variant for base target: ${targetLang}`);
             targetTrackInfo = processedAvailableTracks.find(track =>
                track.languageCode.startsWith(targetBase + '-') || track.languageCode.startsWith(targetBase + '_')
             );
        }
        // If target is specific non-Chinese (e.g., en-US) and P1/P2 failed, P3 doesn't offer more matches in this logic.
    }
  }

  // --- Determine if translation is needed and find the full track info ---
  if (targetTrackInfo) {
    console.log(`[Matcher Result] Found native track (Code: ${targetTrackInfo.languageCode}) matching target '${targetLang}'. Using native track.`);
    needsTranslation = false;
    // Find the full track info (with baseUrl, kind) from cachedCaptionTracks
    // Prioritize non-ASR tracks if multiple tracks match the languageCode
    const potentialTracks = cachedCaptionTracks?.filter(t => t.languageCode === targetTrackInfo!.languageCode);
    if (potentialTracks && potentialTracks.length > 0) {
        trackToFetch = potentialTracks.find(t => t.kind !== 'asr') || potentialTracks[0];
        console.log(`[Matcher Result] Selected track to fetch:`, trackToFetch);
        if (!trackToFetch.baseUrl) {
             console.warn(`[Matcher Result] Found track but it's missing baseUrl. Cannot use native track.`, trackToFetch);
             needsTranslation = true; // Fallback to translation if track is unusable
             targetTrackInfo = undefined;
             trackToFetch = null;
        }
    } else {
        console.warn(`[Matcher Result] Matched languageCode ${targetTrackInfo.languageCode}, but couldn't find corresponding full track in cachedCaptionTracks.`);
        needsTranslation = true; // Fallback to translation if we can't find the full track info
        targetTrackInfo = undefined;
        trackToFetch = null;
    }
  } else {
    console.log(`[Matcher Result] No suitable native track found for target '${targetLang}' after all matching levels. Proceeding to translation.`);
    needsTranslation = true;
  }

  // --- If Translation Needed: Find Source Track ---
  if (needsTranslation) {
    if (!sourceLang) {
        console.error('Translation needed, but source language is not set!');
        await setTranslateActive(false); // Turn off translation state
        return;
    }
    console.log(`[Translation Path] Finding source track for language: ${sourceLang}`);
    // --- Use a multi-level approach to find the best SOURCE track ---
    let sourceTrackToFetch: any | null = null;

    if (cachedCaptionTracks) {
        // P1 Source: Exact Match (prefer non-ASR)
        sourceTrackToFetch = cachedCaptionTracks.find(track => track.languageCode === sourceLang && track.kind !== 'asr') ||
                             cachedCaptionTracks.find(track => track.languageCode === sourceLang);

        // P2/P3 Source: Fuzzy Match (more lenient for source)
        if (!sourceTrackToFetch) {
            const sourceBase = sourceLang.split(/[-_]/)[0];
            const sourceHasRegionOrScript = sourceLang.includes('-') || sourceLang.includes('_');

            // Try matching base code if source is specific
            if (sourceHasRegionOrScript) {
                 sourceTrackToFetch = cachedCaptionTracks.find(track => track.languageCode === sourceBase && track.kind !== 'asr') ||
                                      cachedCaptionTracks.find(track => track.languageCode === sourceBase);
            }

            // Try matching first specific if source is base
            if (!sourceTrackToFetch && !sourceHasRegionOrScript) {
                sourceTrackToFetch = cachedCaptionTracks.find(track => (track.languageCode.startsWith(sourceBase + '-') || track.languageCode.startsWith(sourceBase + '_')) && track.kind !== 'asr') ||
                                     cachedCaptionTracks.find(track => (track.languageCode.startsWith(sourceBase + '-') || track.languageCode.startsWith(sourceBase + '_')));
            }

            // Special case for source 'zh-Hans'/'zh-Hant' matching generic 'zh'
            if (!sourceTrackToFetch && (sourceLang === 'zh-Hans' || sourceLang === 'zh-Hant')) {
                 sourceTrackToFetch = cachedCaptionTracks.find(track => track.languageCode === 'zh' && track.kind !== 'asr') ||
                                      cachedCaptionTracks.find(track => track.languageCode === 'zh');
            }
        }
    }
    // --- End Source Track Finding ---


    if (!sourceTrackToFetch) {
        console.error(`[Translation Path] Cannot find specified source language track '${sourceLang}' (including fuzzy matches).`);
        await setTranslateActive(false); // Turn off translation state
        return;
    }
    trackToFetch = sourceTrackToFetch; // This is the track we'll fetch subtitles FROM
    console.log(`[Translation Path] Found source track to fetch for translation:`, trackToFetch);
  }

  // --- Fetch and Process ---
  if (!trackToFetch || !trackToFetch.baseUrl) {
    console.error('Could not determine a valid track with a baseUrl to fetch.');
    await setTranslateActive(false); // Turn off translation state
    return;
  }

  console.log(`Fetching subtitle data from: ${trackToFetch.baseUrl} (Lang: ${trackToFetch.languageCode}, Kind: ${trackToFetch.kind}, Needs Translation: ${needsTranslation})`);

  try {
    console.log(`正在从 ${trackToFetch.baseUrl} 获取字幕数据... (语言: ${trackToFetch.languageCode}, 类型: ${trackToFetch.kind})`);
    const subtitleJson = await fetchSubtitleData(trackToFetch.baseUrl);
    if (subtitleJson) {
        if (needsTranslation) {
            // --- 需要翻译的流程 --- 
            console.log('字幕数据已获取，处理源文本并发送进行翻译...');
            // 1. 处理源文本，存储到 originalText 字段
            processAndStoreSubtitles(subtitleJson, 'original');

            if (processedSubtitleEvents.length > 0) {
                console.log(`发送 ${processedSubtitleEvents.length} 条字幕到后台进行翻译 (目标: ${targetLang})...`);
                // 2. 发送消息到后台请求翻译
                chrome.runtime.sendMessage(
                    {
                        action: 'translateSubtitles',
                        payload: {
                            // 发送简化结构以减少数据量，包含 ID 以便匹配
                            subtitles: processedSubtitleEvents.map((e, index) => ({ 
                                id: `${e.start}-${e.end}-${index}`, // Use index for uniqueness if start/end collide
                                text: e.originalText 
                            })),
                            targetLang: targetLang, 
                            sourceLang: trackToFetch.languageCode // 发送实际获取的源语言代码
                        }
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('发送翻译请求到后台时出错:', chrome.runtime.lastError);
                            setTranslateActive(false); // 出错时回滚状态
                            return;
                        }
                        if (response?.status === 'success' && response.translatedSubtitles) {
                            console.log('收到来自后台的翻译结果:', response.translatedSubtitles);
                            // 3. 将翻译结果合并回 processedSubtitleEvents
                            updateStoredSubtitlesWithTranslation(response.translatedSubtitles);
                            // 4. 启动字幕显示循环
                            startSubtitleDisplayLoop();
                        } else {
                            console.error('后台翻译失败或返回无效数据:', response);
                            setTranslateActive(false); // 翻译失败也回滚状态
                        }
                    }
                );
            } else {
                console.warn("处理后的源字幕事件为空，无法进行翻译。");
                await setTranslateActive(false); // 处理后为空，回滚
            }
        } else {
            // --- 使用原生目标语言轨道的流程 --- 
            console.log('原生目标语言字幕数据已获取，正在处理...');
            // 直接处理并存储目标语言文本 (填充 original 和 translated)
            processAndStoreSubtitles(subtitleJson, 'native');
             if (processedSubtitleEvents.length > 0) {
                 startSubtitleDisplayLoop();
            } else {
                console.warn("处理后的原生目标语言字幕事件为空，无法启动显示。");
                 await setTranslateActive(false); // 处理后为空，回滚
            }
        }
    } else {
      console.error('获取字幕数据失败或数据无效。');
      await setTranslateActive(false);
    }
  } catch (error) {
    console.error('获取或处理字幕数据时发生错误:', error);
    await setTranslateActive(false);
  }
}

/** 辅助函数：启动字幕显示循环 */
function startSubtitleDisplayLoop() {
    stopSubtitleUpdates(); 
    if (videoElement && processedSubtitleEvents.length > 0) {
        console.log("启动字幕显示循环 (requestAnimationFrame)");
        animationFrameId = requestAnimationFrame(updateSubtitleLoop);
    } else {
         console.warn("无法启动字幕显示循环，videoElement 或 processedSubtitleEvents 不可用。");
    }
}

/**
 * 辅助函数：将后台返回的翻译结果合并到 processedSubtitleEvents 中。
 * @param translatedData - 后台返回的翻译结果对象 { [id: string]: string }。
 */
function updateStoredSubtitlesWithTranslation(translatedData: { [id: string]: string }) {
    let updatedCount = 0;
    processedSubtitleEvents = processedSubtitleEvents.map((event, index) => {
        const id = `${event.start}-${event.end}-${index}`; // 使用与发送时相同的 ID 生成逻辑
        const translatedText = translatedData[id];
        if (translatedText !== undefined) {
            updatedCount++;
            return { ...event, translatedText: translatedText };
        }
        console.warn(`未找到 ID ${id} 的翻译结果。`);
        return event; // 保持原样
    });
    console.log(`已将 ${updatedCount} 条翻译结果合并到 processedSubtitleEvents`);
}


// --- Control Injection Logic ---

/**
 * 将自定义控件注入到 YouTube 播放器。
 * @returns {void}
 */
function injectControls(): void { 
  console.log(`[injectControls] Function called. controlsInjected = ${controlsInjected}`);

  // --- Restore combined check: Use flag AND check for existing elements ---
  if (controlsInjected ||
      document.getElementById('vid-translate-toggle-button') ||
      document.getElementById('vid-translate-settings-button')) {
    console.log(`[injectControls] Skipping injection.`);
    controlsInjected = true; 
    return;
  }
  // --- End of combined check ---

  /* // Keep the previous flag-only check commented out for reference
  // --- Use ONLY controlsInjected flag to prevent re-injection in the same context ---
  if (controlsInjected) {
    console.log('[injectControls] Skipping because controlsInjected is already true.'); // Add log for clarity
    return;
  }
  // --- Removed the check for existing element IDs ---
  */

  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) {
    console.log('[injectControls] .ytp-right-controls not found, retrying later...');
    return; // 稍后由 MutationObserver 重试
  }

  // 确保字幕叠加层存在
  const playerContainer = document.querySelector('.html5-video-player');
  if (playerContainer && !subtitleOverlayElement) {
    createSubtitleOverlay(playerContainer as HTMLElement);
  }

  const firstNativeButton = rightControls.firstChild; // 获取插入参照点

  // --- 1. 创建设置按钮 ---
  const { button: settingsButton } = createControlButton(
    'vid-translate-settings-button',
    '翻译设置',
    SETTING_ICON_URL, // 初始图标
    () => { // 点击回调
      console.log('Settings button clicked.');
      // 打开 Side Panel
      chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
         if (chrome.runtime.lastError) {
           console.error('[CS - SettingsClick] Error sending openSidePanel:', chrome.runtime.lastError.message);
         } else if (response?.status === 'success') {
           console.log('[CS - SettingsClick] Background confirmed Side Panel open.');
         } else {
           console.warn('[CS - SettingsClick] Unexpected response for openSidePanel:', response);
         }
       });
       // 确保轨道信息可用 (如果尚未获取)
       fetchAndProcessTracksInfo()
         .then(() => console.log('[CS - SettingsClick] Track info fetched/confirmed for Side Panel.'))
         .catch(error => console.error('[CS - SettingsClick] Failed to fetch track info for Side Panel:', error));
    }
  );
  rightControls.insertBefore(settingsButton, firstNativeButton);
  console.log('[injectControls] Settings button injected.');

  // --- 2. 创建翻译按钮 ---
  const { button: translateButton, icon: toggleIcon } = createControlButton(
    'vid-translate-toggle-button',
    translateActive ? '关闭翻译' : '开启翻译', // 更新初始 tooltip
    translateActive ? ON_ICON_URL : OFF_ICON_URL,
    async () => { // 改为 async 以便调用 setTranslateActive
       const newState = !translateActive; 
       console.log(`Translate button clicked. Attempting state change to: ${newState}`);

       if (newState) {
           // 尝试启动翻译
           // 先更新状态和图标（乐观更新），startTranslationProcess 失败时会回滚
           await setTranslateActive(true);
           startTranslationProcess(); // 异步启动，不阻塞 UI
       } else {
           // 停止翻译
           console.log('Stopping translation process...');
           stopSubtitleUpdates();
           await setTranslateActive(false); // 更新状态、图标、存储
       }
    }
  );
  translateToggleButtonIcon = toggleIcon; 
  translateButton.dataset.tooltipText = translateActive ? '关闭翻译' : '开启翻译'; // 设置初始data-* 属性

  rightControls.insertBefore(translateButton, settingsButton);
  console.log('[injectControls] Translate toggle button injected.');

  // --- 标记注入完成 ---
  controlsInjected = true;
  console.log('[injectControls] Custom controls injected successfully.');
  console.log(`[injectControls] Checking auto-start condition: translateActive = ${translateActive}`); 
  if (translateActive) {
      console.log('[injectControls] Controls injected and translateActive is true, initiating auto-start...');
      startTranslationProcess().catch((error: unknown) => { 
          console.error('[injectControls] Auto-start after injection failed:', error);
      });
  }
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
         console.log('[MutationObserver] Detected right controls, attempting injectControls...'); // <--- 新增日志
         // injectControls 会检查 controlsInjected 标志，避免重复调用实际注入逻辑
         // 并且它现在包含了自动启动的逻辑
         injectControls();
       }
       // 如果叠加层需要播放器容器，也在这里检查
       if (playerContainer && !subtitleOverlayElement) {
           // console.log('[MutationObserver] Detected player container, ensuring overlay exists...'); // 可选日志
           createSubtitleOverlay(playerContainer as HTMLElement);
       }
    }
    // 注意：移除了之前在这里重新查找 video 元素并尝试重启循环的逻辑。
    // 现在这个逻辑由 injectControls -> startTranslationProcess 处理。
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('MutationObserver 已设置。');


  // --- 处理来自 Side Panel 或 Background 的消息 ---
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
      } else if (message.type === 'GET_TRANSLATABLE_LANGUAGES') {
          console.log('[CS] Received GET_TRANSLATABLE_LANGUAGES request.');
          // --- 使用正确的函数获取轨道信息 ---
          fetchAndProcessTracksInfo()
            .then(tracks => {
                console.log('[CS] Fetched Tracks for GET_TRANSLATABLE_LANGUAGES:', JSON.stringify(tracks, null, 2));
                // Send back the processed tracks (which have the desired structure)
                sendResponse({ success: true, availableTracks: tracks || [] });
            })
            .catch(error => {
                console.error('[CS] Error fetching tracks for GET_TRANSLATABLE_LANGUAGES:', error);
                sendResponse({ success: false, error: error.message || 'Failed to fetch track info.' });
            });
          // --- 结束修改 ---
          return true; // Indicate asynchronous response
      }
      return false; // Indicate synchronous response or no response needed for other messages
  });

  // --- 新增：监听存储变化 ---
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.targetLang) {
      const newTargetLang = changes.targetLang.newValue;
      const oldTargetLang = changes.targetLang.oldValue;
      console.log(`[CS Storage Listener] 检测到 targetLang 变化: 从 ${oldTargetLang} 到 ${newTargetLang}`);

      // 检查翻译功能是否处于激活状态
      if (translateActive) {
        console.log('[CS Storage Listener] 翻译功能已激活，将使用新的目标语言重新启动翻译流程...');
        // 重新执行翻译流程
        // 需要确保 startTranslationProcess 能够安全地被重复调用
        // 它应该停止之前的字幕更新、清除状态，然后再开始新的流程
        startTranslationProcess().catch(error => {
          console.error('[CS Storage Listener] 重新启动翻译流程时出错:', error);
          // 考虑是否需要通知用户或回滚状态
        });
      } else {
        console.log('[CS Storage Listener] 翻译功能未激活，无需操作。');
      }
    }
    // 可以添加对 sourceLang 或 subtitleMode 变化的监听（如果需要）
    if (namespace === 'sync' && changes.subtitleMode) {
        const newMode = changes.subtitleMode.newValue;
        const oldMode = changes.subtitleMode.oldValue;
        console.log(`[CS Storage Listener] 检测到 subtitleMode 变化: 从 ${oldMode} 到 ${newMode}`);
        // 字幕模式的改变不需要重新获取或翻译，只需要在下一次 handleSubtitleUpdate 时生效
        // 但如果希望立即看到效果（虽然可能不明显），可以强制调用一次
        if (translateActive && videoElement) {
             console.log('[CS Storage Listener] 翻译已激活，强制更新字幕显示以应用新模式...');
             handleSubtitleUpdate(); // 强制更新一次显示
        }
    }
     if (namespace === 'sync' && changes.sourceLang) {
         const newSourceLang = changes.sourceLang.newValue;
         const oldSourceLang = changes.sourceLang.oldValue;
         console.log(`[CS Storage Listener] 检测到 sourceLang 变化: 从 ${oldSourceLang} 到 ${newSourceLang}`);
         // 如果翻译激活且确实需要翻译（即没有找到原生目标轨道）
         // 则可能需要重新启动流程
         if (translateActive) {
              // 需要更复杂的检查：只有当上次执行 startTranslationProcess 确实进入了"需要翻译"的分支时，
              // sourceLang 的改变才需要重启。如果上次是直接用了原生轨道，则 sourceLang 改变无影响。
              // 为了简化，暂时也触发重启，让 startTranslationProcess 内部逻辑判断是否需要重新获取源轨道。
              console.log('[CS Storage Listener] 翻译功能已激活，将使用新的源语言重新启动翻译流程（如果需要）...');
              // 同样确保 startTranslationProcess 可以安全地被重复调用
              startTranslationProcess().catch(error => {
                  console.error('[CS Storage Listener] 因 sourceLang 改变重新启动翻译流程时出错:', error);
              });
         }
     }
  });
  // --- 结束监听存储变化 ---

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
function handleYoutubeNavigation(): void {
    console.log('YouTube navigation detected (yt-navigate-finish). Resetting state...');

    // 1. 停止当前字幕并清除状态
    stopSubtitleUpdates();
    processedSubtitleEvents = [];
    if (subtitleOverlayElement) {
        subtitleOverlayElement.textContent = '';
        subtitleOverlayElement.style.opacity = '0';
        subtitleOverlayElement.style.visibility = 'hidden';
    }

    // 2. 重置与轨道获取和处理相关的状态
    tracksInfoFetched = false;
    processedAvailableTracks = null;
    cachedCaptionTracks = null;
    captionTracksRequestSent = false; // <--- 允许为新页面重新请求
    // 如果有正在进行的请求，取消它
    if (rejectCaptionTracksPromise) {
        console.log('[Navigation] Aborting pending caption track request due to navigation.');
        rejectCaptionTracksPromise(new Error('Navigation occurred')); // 会触发 Promise 的 catch 和清理
    }
    resolveCaptionTracksPromise = null; // 确保清理
    rejectCaptionTracksPromise = null; // 确保清理

    // 3. 重置 video 元素引用
    videoElement = null;
    // 重置按钮图标引用 (它会在 injectControls 中重新获取)
    translateToggleButtonIcon = null;

    // --- 4. NEW: Explicitly remove old button elements --- 
    try {
        const oldTranslateButton = document.getElementById('vid-translate-toggle-button');
        if (oldTranslateButton) {
            console.log('[Navigation] Removing old translate button element.');
            oldTranslateButton.remove();
        }
        const oldSettingsButton = document.getElementById('vid-translate-settings-button');
        if (oldSettingsButton) {
            console.log('[Navigation] Removing old settings button element.');
            oldSettingsButton.remove();
        }
    } catch (error: unknown) {
        console.error('[Navigation] Error removing old buttons:', error);
    }
    // --- End button removal ---

    // 5. 重置注入标志，允许 MutationObserver 重新注入控件
    controlsInjected = false;

    // 6. 通知背景脚本 (如果需要)
    console.log('[Navigation] Notifying background script...');
    chrome.runtime.sendMessage({ action: 'youtubeNavigationFinished' });

    console.log('Video state reset complete. Waiting for DOM updates to potentially re-inject controls.');
    // 注意：这里不再需要手动调用 injectControls 或 startTranslationProcess
    // MutationObserver 会检测到变化并调用 injectControls，
    // 而 injectControls 会根据 translateActive 状态决定是否调用 startTranslationProcess
}

/**
 * 辅助函数，用于设置翻译状态并更新存储和图标。
 * @param {boolean} active - 新的翻译状态。
 */
async function setTranslateActive(active: boolean): Promise<void> {
  translateActive = active;
  // 更新图标
  if (translateToggleButtonIcon) {
    translateToggleButtonIcon.src = active ? ON_ICON_URL : OFF_ICON_URL;
    // 更新 tooltip 文本
    const button = translateToggleButtonIcon.closest('button');
    if (button) {
        button.dataset.tooltipText = active ? '关闭翻译' : '开启翻译';
    }
  }
  // 保存到存储
  try {
    await chrome.storage.sync.set({ translateActive: active });
    console.log(`翻译状态已${active ? '激活' : '关闭'}并保存。`);
  } catch (error) {
    console.error('保存翻译状态到 chrome.storage.sync 时出错:', error);
    // 这里可以考虑是否回滚 UI 状态，或者只是记录错误
  }
}

// 在脚本加载时执行初始化
initialize(); 