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
 * 将自定义控制面板注入 YouTube 播放器控件。
 */
function injectControls() {
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
      translateActive = !translateActive;
      translateIcon.src = translateActive ? ON_ICON_URL : OFF_ICON_URL;
      // 保存状态到存储
      chrome.storage.sync.set({ translateActive });
      console.log('翻译状态:', translateActive);
      // TODO: 添加实际执行翻译操作的逻辑
    }
  );

  // --- 创建设置按钮 ---
  const settingsTooltipText = '翻译设置';
  const { button: settingsButton, icon: settingsIcon } = createControlButton(
    'custom-settings-button',
    settingsTooltipText,
    SETTING_ICON_URL, // 初始状态
    () => {
      console.log('设置按钮已点击');
      // 切换激活状态和图标 (示例)
      const isActive = settingsIcon.src === SETTING_ACTIVE_ICON_URL;
      settingsIcon.src = isActive ? SETTING_ICON_URL : SETTING_ACTIVE_ICON_URL;
      // TODO: 实现设置操作 (例如，打开选项页面)
      // chrome.runtime.sendMessage({ action: 'openOptionsPage' });
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

  // 观察 DOM 变化以查找播放器控件
  const observer = new MutationObserver((mutationsList, observer) => {
    // 优化：检查是否已注入
    if (controlsInjected) {
        observer.disconnect(); // 一旦注入则停止观察
        return;
    }
    // 检查目标节点是否存在
    if (document.querySelector('.ytp-left-controls')) {
      console.log('观察者找到 .ytp-left-controls。');
      injectControls(); // 如果由观察者注入，这会确保工具提示存在
      // 一旦注入，如果控件加载后不常被销毁/重新创建，则可以停止观察
      // observer.disconnect(); // 如果控件加载后稳定，取消此行注释
    }
     // 更健壮的检查：如果需要，迭代遍历 mutations
     /*
     for (const mutation of mutationsList) {
         if (mutation.type === 'childList') {
             mutation.addedNodes.forEach(node => {
                 if ((node as Element).querySelector?.('.ytp-left-controls')) {
                     injectControls();
                     observer.disconnect();
                     return;
                 }
                 if ((node as Element).matches?.('.ytp-left-controls')) {
                      injectControls();
                      observer.disconnect();
                      return;
                 }
             });
         }
     }
     */
  });

  // 开始观察 document body 的子节点添加
  observer.observe(document.body, { childList: true, subtree: true });
  console.log('MutationObserver 已启动。');
}

// 运行初始化逻辑
initialize(); 