/**
 * Side Panel Logic
 */

console.log('Side Panel Script Loaded.');

// --- DOM 元素引用 ---
const sourceLangSelect = document.getElementById('source-language') as HTMLSelectElement;
const targetLangSelect = document.getElementById('target-language') as HTMLSelectElement;
const subtitleTypeSwitch = document.getElementById('subtitle-type-switch') as HTMLInputElement;

/** 存储当前侧边栏关联的标签页 ID */
let currentTabId: number | null = null;

// --- 默认设置 ---
const defaultSettings = {
    sourceLang: 'en', // 默认源语言：英语
    targetLang: 'zh-CN', // 默认目标语言：中文简体
    subtitleMode: 'bilingual' // 默认模式：双语 ('bilingual' 或 'targetOnly')
};

// --- 加载设置 --- 
function loadSettings() {
    chrome.storage.sync.get(['sourceLang', 'targetLang', 'subtitleMode'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('加载设置时出错:', chrome.runtime.lastError);
            return;
        }
        
        const loadedSettings: Partial<typeof defaultSettings> = {};
        if (result.sourceLang && typeof result.sourceLang === 'string') {
             if (sourceLangSelect && Array.from(sourceLangSelect.options).some(opt => opt.value === result.sourceLang)) {
                 loadedSettings.sourceLang = result.sourceLang;
                 console.log(`[loadSettings] 加载到有效的 sourceLang: ${result.sourceLang}`);
             } else {
                 console.warn(`[loadSettings] 存储的 sourceLang (${result.sourceLang}) 不是有效选项，将忽略。`);
             }
        }
        if (result.targetLang) loadedSettings.targetLang = result.targetLang;
        if (result.subtitleMode) loadedSettings.subtitleMode = result.subtitleMode;

        console.log('[loadSettings] 准备传递给 updateUI 的已加载设置:', loadedSettings);
        updateUI(loadedSettings);
    });
}

// --- 更新 UI --- 
function updateUI(settings: Partial<typeof defaultSettings>) { 
    let sourceLangChanged = false;
    if (sourceLangSelect && settings.sourceLang !== undefined) {
        if (Array.from(sourceLangSelect.options).some(opt => opt.value === settings.sourceLang)) {
            if (sourceLangSelect.value !== settings.sourceLang) {
               console.log(`[updateUI] 正在将 sourceLangSelect.value 设置为: ${settings.sourceLang}`);
               sourceLangSelect.value = settings.sourceLang;
               sourceLangChanged = true;
            }
        } else {
             console.warn(`[updateUI] 尝试设置的 sourceLang (${settings.sourceLang}) 不是有效选项，跳过更新。`);
        }
    }
    if (targetLangSelect && settings.targetLang !== undefined) {
        targetLangSelect.value = settings.targetLang;
    }
    if (subtitleTypeSwitch && settings.subtitleMode !== undefined) {
        subtitleTypeSwitch.checked = settings.subtitleMode === 'bilingual';
    }

    console.log('[updateUI] Calling updateTargetLangOptionsState after UI potential update...');
    updateTargetLangOptionsState(); 
}

// --- 保存设置 --- 
function saveSettings() {
    const settingsToSave = {
        sourceLang: sourceLangSelect?.value || defaultSettings.sourceLang,
        targetLang: targetLangSelect?.value || defaultSettings.targetLang,
        subtitleMode: subtitleTypeSwitch?.checked ? 'bilingual' : 'targetOnly'
    };

    chrome.storage.sync.set(settingsToSave, () => {
        if (chrome.runtime.lastError) {
            console.error('保存设置时出错:', chrome.runtime.lastError);
        } else {
            console.log('设置已保存 (sourceLang 是 code):', settingsToSave);
        }
    });
}

/**
 * 根据当前选中的源语言，更新目标语言下拉列表中选项的禁用状态。
 */
function updateTargetLangOptionsState() {
    if (!sourceLangSelect || !targetLangSelect) return;

    const selectedSourceLangCode = sourceLangSelect.value;
    console.log(`[TargetLangState] Updating based on source: ${selectedSourceLangCode}`);

    for (let i = 0; i < targetLangSelect.options.length; i++) {
        const option = targetLangSelect.options[i];
        if (option.value === selectedSourceLangCode) {
            option.disabled = true;
            console.log(`[TargetLangState] Disabling target option: ${option.value}`);
        } else {
            option.disabled = false;
        }
    }
    targetLangSelect.style.display = 'none';
    targetLangSelect.offsetHeight;
    targetLangSelect.style.display = '';
}

/**
 * 向内容脚本请求当前视频可用的语言轨道，并填充源语言下拉列表。
 * @param tabId 要请求的标签页 ID。
 */
async function requestAndFillSourceLanguages(tabId: number) {
    if (!sourceLangSelect) {
        console.error("[SP] Source language select element not found.");
        return;
    }

    console.log(`[SP] Requesting available tracks for Tab ${tabId}...`);
    // 显示加载状态
    sourceLangSelect.innerHTML = '<option value="" disabled>Loading tracks...</option>';
    sourceLangSelect.disabled = true;

    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'requestAvailableTracks' });
        console.log("[SP] Received tracks response:", response);

        sourceLangSelect.innerHTML = ''; // 清空现有选项（包括加载状态）

        if (response && Array.isArray(response.availableTracks)) {
            const availableTracks: { languageCode: string, languageName: string, kind: string }[] = response.availableTracks;

            if (availableTracks.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No subtitles available';
                option.disabled = true;
                sourceLangSelect.appendChild(option);
            } else {
                // --- 实现默认语言选择优先级 ---
                let defaultSelectedLangCode: string | null = null;
                const englishNonAsrTrack = availableTracks.find(t => t.languageCode.startsWith('en') && t.kind !== 'asr');
                if (englishNonAsrTrack) {
                    defaultSelectedLangCode = englishNonAsrTrack.languageCode;
                } else if (availableTracks.length > 0) {
                    defaultSelectedLangCode = availableTracks[0].languageCode;
                }
                // --- 填充选项 ---
                availableTracks.forEach((trackInfo) => {
                    const option = document.createElement('option');
                    option.value = trackInfo.languageCode;
                    option.textContent = trackInfo.languageName;
                    sourceLangSelect.appendChild(option);
                });
                // 设置默认选中
                if (defaultSelectedLangCode) {
                     if (Array.from(sourceLangSelect.options).some(opt => opt.value === defaultSelectedLangCode)) {
                        sourceLangSelect.value = defaultSelectedLangCode;
                     } else {
                         console.warn(`[SP] Default language code ${defaultSelectedLangCode} not found in options. Selecting first available.`);
                         if(sourceLangSelect.options.length > 0) {
                             sourceLangSelect.selectedIndex = 0; // 选择第一个作为备用
                         }
                     }
                } else if (sourceLangSelect.options.length > 0) {
                     sourceLangSelect.selectedIndex = 0; // 如果没有默认逻辑选中的，选第一个
                }
            }
             sourceLangSelect.disabled = false; // 填充完毕，启用下拉菜单
        } else {
            console.error("[SP] Invalid response received:", response);
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Error loading tracks';
            option.disabled = true;
            sourceLangSelect.appendChild(option);
             sourceLangSelect.disabled = true; // 出错时保持禁用
        }
        // 在填充和设置好源语言后，加载并应用用户保存的设置
         console.log('[SP] Calling loadSettings() after filling languages...');
        loadSettings(); // loadSettings 内部会调用 updateUI, 进而调用 updateTargetLangOptionsState

    } catch (error) {
        console.error(`[SP] Error sending/receiving requestAvailableTracks for Tab ${tabId}:`, error);
        sourceLangSelect.innerHTML = ''; // 清空
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Error loading tracks';
        option.disabled = true;
        sourceLangSelect.appendChild(option);
         sourceLangSelect.disabled = true; // 出错时保持禁用
        // 即使获取轨道出错，仍然尝试加载其他设置
        loadSettings();
    }
}

// --- 添加事件监听器 --- 
function addEventListeners() {
    sourceLangSelect?.addEventListener('change', () => {
        saveSettings();
        updateTargetLangOptionsState();
    });
    targetLangSelect?.addEventListener('change', saveSettings);
    subtitleTypeSwitch?.addEventListener('change', saveSettings);
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    addEventListeners();
    
    // 获取当前标签页 ID 并进行首次加载
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (chrome.runtime.lastError) {
            console.error("[SP] Error querying tabs on load:", chrome.runtime.lastError);
            if (sourceLangSelect) {
                sourceLangSelect.innerHTML = '<option value="" disabled>Error</option>';
                sourceLangSelect.disabled = true;
            }
            return;
        }
        if (tabs.length > 0 && tabs[0].id) {
            currentTabId = tabs[0].id; // 存储标签页 ID
            console.log(`[SP] Side panel loaded for Tab ${currentTabId}`);
            requestAndFillSourceLanguages(currentTabId); // 首次请求轨道
        } else {
            console.error("[SP] Could not determine current active tab ID on load.");
             if (sourceLangSelect) {
                sourceLangSelect.innerHTML = '<option value="" disabled>Error</option>';
                sourceLangSelect.disabled = true;
             }
        }
    });
});

// --- 新增：监听来自背景脚本的导航通知 ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'youtubeNavigationOccurred' && message.navigatedTabId) {
        console.log(`[SP] Received navigation notification for Tab ${message.navigatedTabId}. Current associated tab is ${currentTabId}.`);
        // 检查事件是否与当前侧边栏关联的标签页匹配
        if (currentTabId !== null && message.navigatedTabId === currentTabId) {
            console.log(`[SP] Navigation matches current tab. Re-requesting tracks...`);
            // 重新请求语言列表
            requestAndFillSourceLanguages(currentTabId);
        }
         // 不需要异步响应
        return false;
    }
});

// TODO:
// 5. (可选) 向 Content Script 或 Background Script 发送消息通知设置更改
// 6. 动态填充语言列表 