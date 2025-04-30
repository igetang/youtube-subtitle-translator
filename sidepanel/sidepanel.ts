/**
 * Side Panel Logic
 */

console.log('Side Panel Script Loaded.');

// --- DOM 元素引用 ---
const sourceLangSelect = document.getElementById('source-language') as HTMLSelectElement;
const targetLangSelect = document.getElementById('target-language') as HTMLSelectElement;
const subtitleTypeSwitch = document.getElementById('subtitle-type-switch') as HTMLInputElement;

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
            // 使用默认值初始化 UI (以防万一)
            updateUI(defaultSettings);
            return;
        }
        
        // 合并加载的设置和默认设置
        const settings = { ...defaultSettings, ...result };
        console.log('加载的设置:', settings);
        updateUI(settings);
    });
}

// --- 更新 UI --- 
function updateUI(settings: typeof defaultSettings) {
    if (sourceLangSelect) {
        sourceLangSelect.value = settings.sourceLang;
        // 如果选项是动态加载的，需要确保此时选项已存在
    }
    if (targetLangSelect) {
        targetLangSelect.value = settings.targetLang;
    }
    if (subtitleTypeSwitch) {
        subtitleTypeSwitch.checked = settings.subtitleMode === 'bilingual'; // 双语时选中
    }
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
            console.log('设置已保存:', settingsToSave);
            // (可选) 通知其他部分设置已更改
            // chrome.runtime.sendMessage({ action: 'settingsUpdated', data: settingsToSave });
        }
    });
}

// --- 添加事件监听器 --- 
function addEventListeners() {
    sourceLangSelect?.addEventListener('change', saveSettings);
    targetLangSelect?.addEventListener('change', saveSettings);
    subtitleTypeSwitch?.addEventListener('change', saveSettings);
}

// --- 初始化 --- 
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    addEventListeners();
    // TODO: 动态填充语言列表
});

// TODO:
// 5. (可选) 向 Content Script 或 Background Script 发送消息通知设置更改
// 6. 动态填充语言列表 