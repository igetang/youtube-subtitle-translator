/**
 * [popup] YouTube字幕翻译助手 - Popup界面
 * 基于sidepanel.ts的完整功能实现，支持Fallback模式
 */

// === 导入相同的依赖 ===
import { targetLanguages, Language } from '../shared/utils/languages';
import { VideoSettingsLocalStorage, VideoSettings } from '../shared/storage/video-settings-local-storage';
import { StorageManager, StorageKeys } from '../shared/storage/storage-manager';
import { isLanguageRelevantToUI } from '../shared/utils/language-processing';
import { 
  VideoSourceLanguageCacheManager,
  UserPreferencesManager
} from '../shared/storage';

const videoSourceLanguageCacheManager = new VideoSourceLanguageCacheManager();
const userPreferencesManager = UserPreferencesManager.getInstance();

console.log('[Popup] 初始化开始...');

// === API相关接口和配置 ===
interface ApiInfo {
  name: string;
  infoUrl: string;
  requiresKey: boolean;
  customConfig: boolean;
}

/** API配置和信息映射 */
const apiInfoMap: Record<string, ApiInfo> = {
  'google-free': {
    name: 'Google翻译',
    infoUrl: 'https://cloud.google.com/translate/docs/getting-started',
    requiresKey: false,
    customConfig: false
  },
  'microsoft-free': {
    name: '微软翻译',
    infoUrl: 'https://www.microsoft.com/zh-cn/translator/',
    requiresKey: false,
    customConfig: false
  },
  'deepl': {
    name: 'DeepL API',
    infoUrl: 'https://www.deepl.com/pro-api',
    requiresKey: true,
    customConfig: false
  },
  'openai': {
    name: 'OpenAI API',
    infoUrl: 'https://platform.openai.com/docs/guides/text-generation',
    requiresKey: true,
    customConfig: false
  },
  'gemini': {
    name: 'Gemini API',
    infoUrl: 'https://ai.google.dev/docs',
    requiresKey: true,
    customConfig: false
  },
  'deepseek': {
    name: 'DeepSeek API',
    infoUrl: 'https://platform.deepseek.com/',
    requiresKey: true,
    customConfig: false
  },
  'qwen': {
    name: '阿里Qwen API',
    infoUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference/api-details',
    requiresKey: true,
    customConfig: false
  }
};

// === 全局变量 ===
let currentTabId: number | null = null;
let currentVideoId: string | null = null;
let sidePanelInitialized = false;
let isYouTubePage = false;

// === Port连接管理 ===
const port = chrome.runtime.connect({ name: 'popup-lifecycle' });
console.log('[Popup] Port连接已建立');

// === 生命周期管理 ===
window.addEventListener('beforeunload', () => {
  console.log('[Popup] 发送关闭通知...');
  chrome.runtime.sendMessage({ type: 'popupClosed' });
});

window.addEventListener('blur', () => {
  console.log('[Popup] 失去焦点...');
  chrome.runtime.sendMessage({ type: 'popupBlurred' });
});

port.onDisconnect.addListener(() => {
  console.log('[Popup] Port连接断开');
});

// === 核心功能函数 ===

/**
 * 检查URL是否为YouTube页面
 */
function isYoutubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(urlObj.hostname);
  } catch {
    return false;
  }
  }

/**
 * 从URL中提取视频ID
 */
function extractVideoIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname === '/watch') {
      return urlObj.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 显示使用说明界面（非YouTube页面时使用）
 */
function showUsageGuide(): void {
  console.log('[Popup] 显示使用说明界面');
  
  document.body.innerHTML = `
    <div style="
      width: 400px;
      min-height: 300px;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      margin: 0;
      box-sizing: border-box;
    ">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 48px; margin-bottom: 12px;">🎯</div>
        <h1 style="
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          line-height: 1.3;
        ">YouTube字幕翻译助手</h1>
        <p style="
          margin: 0;
          font-size: 14px;
          opacity: 0.9;
          line-height: 1.4;
        ">让YouTube视频观看更轻松</p>
      </div>
      
      <div style="
        background: rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        backdrop-filter: blur(10px);
      ">
        <h2 style="
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <span style="font-size: 20px;">💡</span>
          使用说明
        </h2>
        <div style="
          font-size: 14px;
          line-height: 1.6;
          opacity: 0.95;
        ">
          <div style="margin-bottom: 12px;">
            <strong>1.</strong> 打开 <span style="
              background: rgba(255, 255, 255, 0.2);
              padding: 2px 6px;
              border-radius: 4px;
              font-family: monospace;
            ">youtube.com</span> 网站
          </div>
          <div style="margin-bottom: 12px;">
            <strong>2.</strong> 播放任意视频
          </div>
          <div style="margin-bottom: 12px;">
            <strong>3.</strong> 点击扩展图标打开翻译设置
          </div>
          <div>
            <strong>4.</strong> 享受实时字幕翻译功能
          </div>
        </div>
      </div>
      
      <div style="
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 20px;
        border-left: 4px solid rgba(255, 255, 255, 0.3);
      ">
        <div style="
          font-size: 13px;
          line-height: 1.5;
          opacity: 0.9;
        ">
          <strong>⚠️ 注意：</strong>此扩展仅在YouTube视频页面工作，其他网站无法使用翻译功能。
        </div>
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button onclick="window.open('https://youtube.com', '_blank')" style="
          flex: 1;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(10px);
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.25)'" 
           onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
          打开YouTube
        </button>
        <button onclick="window.close()" style="
          flex: 1;
          background: rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        " onmouseover="this.style.background='rgba(0, 0, 0, 0.15)'" 
           onmouseout="this.style.background='rgba(0, 0, 0, 0.1)'">
          关闭
        </button>
      </div>
      
      <div style="
        margin-top: 20px;
        text-align: center;
        font-size: 12px;
        opacity: 0.7;
        line-height: 1.4;
      ">
        <div>当前页面：非YouTube网站</div>
        <div style="margin-top: 4px;">
          <span id="current-url" style="
            font-family: monospace;
            background: rgba(0, 0, 0, 0.1);
            padding: 2px 4px;
            border-radius: 3px;
          "></span>
        </div>
      </div>
    </div>
  `;

  // 显示当前URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      const urlElement = document.getElementById('current-url');
      if (urlElement) {
        try {
          const domain = new URL(tabs[0].url).hostname;
          urlElement.textContent = domain;
        } catch {
          urlElement.textContent = '未知网站';
        }
      }
    }
  });
}

// === DOM 元素引用（仅在YouTube页面使用）===
let sourceLangContainer: HTMLDivElement | null = null;
let sourceLangTrigger: HTMLDivElement | null = null;
let sourceLangSelectedValue: HTMLSpanElement | null = null;
let sourceLangPanel: HTMLDivElement | null = null;
let sourceLangOptions: HTMLDivElement | null = null;
let targetLangContainer: HTMLDivElement | null = null;
let targetLangTrigger: HTMLDivElement | null = null;
let targetLangSelectedValue: HTMLSpanElement | null = null;
let targetLangPanel: HTMLDivElement | null = null;
let targetLangSearch: HTMLInputElement | null = null;
let targetLangOptions: HTMLDivElement | null = null;
let subtitleTypeSwitch: HTMLInputElement | null = null;
let translationApiSelect: HTMLSelectElement | null = null;
let apiKeyPanel: HTMLDivElement | null = null;
let apiKeyInput: HTMLInputElement | null = null;
let apiInfoLink: HTMLAnchorElement | null = null;
let customApiPanel: HTMLDivElement | null = null;
let testApiKeyButton: HTMLButtonElement | null = null;

// === 新增: API面板相关元素引用 ===
let serviceTypePanel: HTMLDivElement | null = null;
let membershipPanel: HTMLDivElement | null = null;
let openaiBasicPanel: HTMLDivElement | null = null;

/**
 * 初始化DOM元素引用（仅在YouTube页面调用）
 */
function initializeDOMElements(): void {
  sourceLangContainer = document.getElementById('source-language-container') as HTMLDivElement;
  sourceLangTrigger = document.getElementById('source-language-trigger') as HTMLDivElement;
  sourceLangSelectedValue = sourceLangTrigger?.querySelector('.selected-value') as HTMLSpanElement;
  sourceLangPanel = document.getElementById('source-language-panel') as HTMLDivElement;
  sourceLangOptions = document.getElementById('source-language-options') as HTMLDivElement;
  
  targetLangContainer = document.getElementById('target-language-container') as HTMLDivElement;
  targetLangTrigger = document.getElementById('target-language-trigger') as HTMLDivElement;
  targetLangSelectedValue = targetLangTrigger?.querySelector('.selected-value') as HTMLSpanElement;
  targetLangPanel = document.getElementById('target-language-panel') as HTMLDivElement;
  targetLangSearch = document.getElementById('target-language-search') as HTMLInputElement;
  targetLangOptions = document.getElementById('target-language-options') as HTMLDivElement;
  
  subtitleTypeSwitch = document.getElementById('subtitle-type-switch') as HTMLInputElement;
  translationApiSelect = document.getElementById('translation-api') as HTMLSelectElement;
  apiKeyPanel = document.getElementById('api-key-panel') as HTMLDivElement;
  apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  apiInfoLink = document.getElementById('api-info-link') as HTMLAnchorElement;
  customApiPanel = document.getElementById('custom-api-panel') as HTMLDivElement;
  testApiKeyButton = document.getElementById('test-api-key') as HTMLButtonElement;

  // === 新增: API面板元素引用 ===
  serviceTypePanel = document.getElementById('service-type-panel') as HTMLDivElement;
  membershipPanel = document.getElementById('membership-panel') as HTMLDivElement;
  openaiBasicPanel = document.getElementById('openai-basic-panel') as HTMLDivElement;
    }

/**
 * 根据选择的API类型更新界面显示的面板
 * @param apiType 当前选择的API类型
 */
function updateApiPanels(apiType: string): void {
  console.log(`[Popup] 更新API面板: ${apiType}`);
  
  // 重置所有面板为隐藏
  if (apiKeyPanel) apiKeyPanel.style.display = 'none';
  if (serviceTypePanel) serviceTypePanel.style.display = 'none';
  if (membershipPanel) membershipPanel.style.display = 'none';
  if (customApiPanel) customApiPanel.style.display = 'none';
  if (openaiBasicPanel) openaiBasicPanel.style.display = 'none';
  
  // 根据API类型显示相应面板
  const apiInfo = apiInfoMap[apiType];
  
  // 测试按钮显示与否
  if (testApiKeyButton) {
    testApiKeyButton.style.display = apiInfo?.requiresKey || apiType.includes('-free') ? 'block' : 'none';
  }
  
  // 非付费API，不显示任何面板
  if (!apiInfo) {
    console.log(`[Popup] 未找到API信息: ${apiType}`);
    return;
  }
  
  // 对于免费API（google-free和microsoft-free）不显示API密钥输入框
  if (apiType === 'google-free' || apiType === 'microsoft-free') {
    if (apiKeyPanel) apiKeyPanel.style.display = 'none';
    return;
  }
  
  // 显示API密钥输入面板，对于所有需要密钥的API
  if (apiInfo.requiresKey && apiKeyPanel) {
    apiKeyPanel.style.display = 'block';
    
    // 更新提示链接
    if (apiInfoLink && apiInfo.infoUrl) {
      apiInfoLink.href = apiInfo.infoUrl;
      apiInfoLink.textContent = `如何获取${apiInfo.name}API密钥？`;
    }
  }
  
  // 自定义API
  if (apiInfo.customConfig && customApiPanel) {
    customApiPanel.style.display = 'block';
  }
  
  // 需要选择服务类型的API
  if (apiType === 'deepl') {
    if (serviceTypePanel) serviceTypePanel.style.display = 'block';
  }
  // 处理OpenAI相关面板
  else if (apiType === 'openai') {
    if (openaiBasicPanel) openaiBasicPanel.style.display = 'block';
    // 确保API密钥面板也显示
    if (apiKeyPanel) apiKeyPanel.style.display = 'block';
  }
}
    
/**
 * 初始化目标语言列表
 */
function populateTargetLanguages(searchTerm: string = ''): void {
  if (!targetLangOptions) return;
  
  targetLangOptions.innerHTML = '';
  
  const filteredLanguages = targetLanguages.filter(lang => 
    lang.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lang.code.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  filteredLanguages.forEach(lang => {
    const option = document.createElement('div');
    option.className = 'custom-select-option';
    option.textContent = lang.name;
    option.dataset.value = lang.code;
    
    option.addEventListener('click', () => {
      if (targetLangSelectedValue) {
        targetLangSelectedValue.textContent = lang.name;
    }
      if (targetLangPanel) {
        targetLangPanel.style.display = 'none';
      }
      saveTargetLanguage(lang.code);
    });
    
    if (targetLangOptions) {
      targetLangOptions.appendChild(option);
    }
  });
}

/**
 * 保存目标语言设置
 */
async function saveTargetLanguage(langCode: string): Promise<void> {
  try {
    await chrome.storage.local.set({ targetLanguage: langCode });
    console.log('[Popup] 目标语言已保存:', langCode);
  } catch (error) {
    console.error('[Popup] 保存目标语言失败:', error);
    }
}

/**
 * 加载设置
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      'targetLanguage',
      'subtitleType',
      'translationApi',
      'apiKey'
    ]);
    
    // 加载目标语言
    if (result.targetLanguage && targetLangSelectedValue) {
      const lang = targetLanguages.find(l => l.code === result.targetLanguage);
      if (lang) {
        targetLangSelectedValue.textContent = lang.name;
    }
    }
    
    // 加载字幕类型
    if (result.subtitleType && subtitleTypeSwitch) {
      subtitleTypeSwitch.checked = result.subtitleType === 'dual';
    }
    
    // 加载翻译API
    if (result.translationApi && translationApiSelect) {
      translationApiSelect.value = result.translationApi;
      // === 新增: 加载设置后立即更新面板显示 ===
      updateApiPanels(result.translationApi);
    }
    
    // 加载API密钥
    if (result.apiKey && apiKeyInput) {
      apiKeyInput.value = result.apiKey;
    }
    
    console.log('[Popup] 设置加载完成');
  } catch (error) {
    console.error('[Popup] 加载设置失败:', error);
  }
}

/**
 * 添加事件监听器
 */
function addEventListeners(): void {
  // 目标语言下拉菜单
  if (targetLangTrigger) {
    targetLangTrigger.addEventListener('click', () => {
      if (targetLangPanel) {
        const isVisible = targetLangPanel.style.display === 'block';
        targetLangPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
          populateTargetLanguages();
          if (targetLangSearch) {
            targetLangSearch.focus();
          }
        }
      }
    });
  }
  
  // 目标语言搜索
  if (targetLangSearch) {
    targetLangSearch.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value;
      populateTargetLanguages(searchTerm);
    });
  }
  
  // 字幕类型切换
  if (subtitleTypeSwitch) {
    subtitleTypeSwitch.addEventListener('change', async () => {
      const subtitleType = subtitleTypeSwitch?.checked ? 'dual' : 'target';
      try {
        await chrome.storage.local.set({ subtitleType });
        console.log('[Popup] 字幕类型已保存:', subtitleType);
      } catch (error) {
        console.error('[Popup] 保存字幕类型失败:', error);
      }
    });
  }

  // === 修改: 翻译API选择事件监听器 ===
  if (translationApiSelect) {
    translationApiSelect.addEventListener('change', async () => {
      const apiType = translationApiSelect?.value;
      try {
        await chrome.storage.local.set({ translationApi: apiType });
        console.log('[Popup] 翻译API已保存:', apiType);
        
        // === 新增: 更新面板显示 ===
        if (apiType) {
          updateApiPanels(apiType);
        }
      } catch (error) {
        console.error('[Popup] 保存翻译API失败:', error);
      }
    });
  }

  // API密钥输入
  if (apiKeyInput) {
    apiKeyInput.addEventListener('change', async () => {
      const apiKey = apiKeyInput?.value;
      try {
        await chrome.storage.local.set({ apiKey });
        console.log('[Popup] API密钥已保存');
      } catch (error) {
        console.error('[Popup] 保存API密钥失败:', error);
      }
    });
  }
  
  // 点击外部关闭下拉菜单
  document.addEventListener('click', (e) => {
    if (!targetLangContainer?.contains(e.target as Node)) {
      if (targetLangPanel) {
        targetLangPanel.style.display = 'none';
      }
    }
  });
}

/**
 * 初始化YouTube功能界面
 */
async function initializeYouTubeUI(): Promise<void> {
  console.log('[Popup] 初始化YouTube功能界面...');
  
  try {
    // 初始化DOM元素引用
    initializeDOMElements();
    
    // 初始化UI组件
    addEventListeners();
    await loadSettings();
    populateTargetLanguages();
    
    console.log('[Popup] YouTube功能界面初始化完成');
    
  } catch (error) {
    console.error('[Popup] YouTube界面初始化失败:', error);
    throw error;
  }
}

/**
 * 初始化Popup UI
 */
async function initializePopupUI(): Promise<void> {
  console.log('[Popup] 开始初始化UI组件...');
  
  try {
    // 1. 获取当前标签页信息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('无法获取当前标签页信息');
    }
    
    currentTabId = tab.id;
    console.log(`[Popup] 当前标签页ID: ${currentTabId}`);
    
    // 2. 检查是否为YouTube页面
    if (tab.url && isYoutubeUrl(tab.url)) {
      isYouTubePage = true;
      currentVideoId = extractVideoIdFromUrl(tab.url);
      console.log(`[Popup] YouTube页面，视频ID: ${currentVideoId || '未检测到'}`);
      
      // 初始化YouTube功能界面
      await initializeYouTubeUI();
} else {
      isYouTubePage = false;
      console.log(`[Popup] 非YouTube页面: ${tab.url}`);
      
      // 显示使用说明界面
      showUsageGuide();
    }
    
    console.log('[Popup] UI组件初始化完成');
    
  } catch (error) {
    console.error('[Popup] UI初始化失败:', error);
    throw error;
  }
}

/**
 * 处理初始化错误
 */
function handleInitializationError(error: any): void {
  console.error('[Popup] 初始化发生错误:', error);
  
  // 显示错误信息给用户
  document.body.innerHTML = `
    <div style="
      width: 400px;
      min-height: 200px;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      margin: 0;
      box-sizing: border-box;
    ">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <h2 style="margin: 0 0 8px 0; color: #d32f2f;">初始化失败</h2>
      </div>
      
      <div style="
        background: white;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
        border-left: 4px solid #d32f2f;
      ">
        <p style="margin: 0 0 8px 0; font-weight: 500;">错误信息：</p>
        <p style="
          margin: 0;
          font-family: monospace;
          font-size: 12px;
          background: #f5f5f5;
          padding: 8px;
          border-radius: 4px;
          word-break: break-word;
        ">${error.message || error}</p>
      </div>
      
      <div style="text-align: center;">
        <button onclick="location.reload()" style="
          background: #1976d2;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          margin-right: 12px;
        ">重新加载</button>
        <button onclick="window.close()" style="
          background: #666;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        ">关闭</button>
      </div>
    </div>
  `;
}

/**
 * 🚀 主初始化函数
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 防止重复初始化
  if (sidePanelInitialized) {
    console.log('[Popup] 已初始化，跳过重复初始化');
    return;
  }
  
  console.log('[Popup] 🎯 开始初始化...');
  sidePanelInitialized = true;
  
  try {
    await initializePopupUI();
    console.log('[Popup] 🎉 初始化完成');
  } catch (error) {
    console.error('[Popup] ❌ 初始化失败:', error);
    sidePanelInitialized = false; // 重置标志，允许重试
    handleInitializationError(error);
  }
}); 