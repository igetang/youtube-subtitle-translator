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
            // 出错时，不要强制更新 UI，保留当前状态（可能是智能默认值）
            // updateUI(defaultSettings); 
            return;
        }
        
        // --- 修改这里：只传递存储中实际存在的值给 updateUI --- 
        const loadedSettings: Partial<typeof defaultSettings> = {}; // 创建一个部分类型
        if (result.sourceLang && typeof result.sourceLang === 'string') {
             // 只有当 sourceLang 存在且是字符串时才加载它
             // 并且检查这个值是否是当前下拉列表的有效选项
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
        updateUI(loadedSettings); // 只用加载到的值更新 UI
    });
}

// --- 更新 UI --- 
function updateUI(settings: Partial<typeof defaultSettings>) { 
    let sourceLangChanged = false; // 标记 sourceLang 是否被更新
    if (sourceLangSelect && settings.sourceLang !== undefined) {
        if (Array.from(sourceLangSelect.options).some(opt => opt.value === settings.sourceLang)) {
            if (sourceLangSelect.value !== settings.sourceLang) { // 仅在值实际改变时标记
               console.log(`[updateUI] 正在将 sourceLangSelect.value 设置为: ${settings.sourceLang}`);
               sourceLangSelect.value = settings.sourceLang;
               sourceLangChanged = true; // 标记已改变
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

    // --- 如果源语言被更新了，或者这是初始加载（settings 为空对象时也可能需要更新），则调用 --- 
    // 更简单的方式：无论如何，只要 updateUI 被调用，就更新目标语言状态
    // 这样可以覆盖初始加载和设置加载的情况
    console.log('[updateUI] Calling updateTargetLangOptionsState after UI potential update...');
    updateTargetLangOptionsState(); 
}

// --- 保存设置 --- 
function saveSettings() {
    const settingsToSave = {
        sourceLang: sourceLangSelect?.value || defaultSettings.sourceLang, // 保存的是 languageCode
        targetLang: targetLangSelect?.value || defaultSettings.targetLang,
        subtitleMode: subtitleTypeSwitch?.checked ? 'bilingual' : 'targetOnly'
    };

    chrome.storage.sync.set(settingsToSave, () => {
        if (chrome.runtime.lastError) {
            console.error('保存设置时出错:', chrome.runtime.lastError);
        } else {
            console.log('设置已保存 (sourceLang 是 code):', settingsToSave);
            // (可选) 通知其他部分设置已更改
            // chrome.runtime.sendMessage({ action: 'settingsUpdated', data: settingsToSave });
        }
    });
}

/**
 * 根据当前选中的源语言，更新目标语言下拉列表中选项的禁用状态。
 */
function updateTargetLangOptionsState() {
    if (!sourceLangSelect || !targetLangSelect) return; // 确保元素存在

    const selectedSourceLangCode = sourceLangSelect.value;
    console.log(`[TargetLangState] Updating based on source: ${selectedSourceLangCode}`);

    // 遍历目标语言选项
    for (let i = 0; i < targetLangSelect.options.length; i++) {
        const option = targetLangSelect.options[i];
        if (option.value === selectedSourceLangCode) {
            // 如果目标语言和源语言相同，禁用它
            option.disabled = true;
            console.log(`[TargetLangState] Disabling target option: ${option.value}`);
            // 可选：如果当前选中的目标语言被禁用了，需要处理一下，比如选回默认值
            // if (targetLangSelect.value === option.value) { 
            //    console.log(`[TargetLangState] Currently selected target (${targetLangSelect.value}) is now disabled. Resetting...`);
            //    targetLangSelect.value = defaultSettings.targetLang; // 或者选第一个可用的？
            //    saveSettings(); // 如果重置了，可能需要保存状态
            // }
        } else {
            // 否则，确保它是启用的
            option.disabled = false;
        }
    }
    // 强制浏览器重绘下拉列表以反映禁用状态 (在某些浏览器上可能需要)
    targetLangSelect.style.display = 'none';
    targetLangSelect.offsetHeight; // Trigger reflow
    targetLangSelect.style.display = '';
}

// --- 添加事件监听器 --- 
function addEventListeners() {
    sourceLangSelect?.addEventListener('change', () => { // 修改监听器
        saveSettings(); // 先保存
        updateTargetLangOptionsState(); // 再更新目标语言状态
    });
    targetLangSelect?.addEventListener('change', saveSettings);
    subtitleTypeSwitch?.addEventListener('change', saveSettings);
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    addEventListeners();
    
    // 请求并填充源语言列表
    chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.youtube.com/watch*" }, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("查询 YouTube 标签页时出错:", chrome.runtime.lastError);
            return;
        }
        if (tabs.length > 0 && tabs[0].id) {
            const activeTabId = tabs[0].id;
            console.log(`向标签页 ${activeTabId} 发送 requestAvailableTracks 消息...`);
            chrome.tabs.sendMessage(activeTabId, { action: 'requestAvailableTracks' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("发送 requestAvailableTracks 消息时出错:", chrome.runtime.lastError.message);
                    loadSettings(); // 即使出错，也尝试加载设置
                    return;
                }
                
                console.log("收到来自 Content Script 的响应 (含 kind):", response); 
                
                // --- 处理包含 kind 的数据，并实现新优先级 ---
                if (response && Array.isArray(response.availableTracks)) {
                    // 注意：类型定义现在包含 kind
                    const availableTracks: { languageCode: string, languageName: string, kind: string }[] = response.availableTracks;
                    console.log("收到的可用轨道列表 (含 kind):", availableTracks);

                    if (sourceLangSelect) {
                       sourceLangSelect.innerHTML = ''; // 清空

                       if (availableTracks.length === 0) {
                           // 如果没有可用轨道，可以显示提示
                           const option = document.createElement('option');
                           option.value = '';
                           option.textContent = '无可用字幕';
                           option.disabled = true;
                           sourceLangSelect.appendChild(option);
                       } else {
                           // --- 实现新的默认语言选择优先级 --- 
                           let defaultSelectedLangCode: string | null = null;
                           
                           // 1. 查找非 ASR 英语
                           const englishNonAsrTrack = availableTracks.find(t => t.languageCode.startsWith('en') && t.kind !== 'asr');
                           
                           if (englishNonAsrTrack) {
                               // 找到非 ASR 英语，设为默认
                               defaultSelectedLangCode = englishNonAsrTrack.languageCode;
                               console.log("默认语言：选中非 ASR 英语");
                           } else if (availableTracks.length > 0) {
                               // 没找到非 ASR 英语，选中列表第一个
                               defaultSelectedLangCode = availableTracks[0].languageCode;
                               console.log("默认语言：选中列表第一个 (", availableTracks[0].languageName, ")");
                           } else {
                               // 列表为空 (理论上不会到这里，因为前面有判断)
                               console.log("默认语言：列表为空");
                           }
                           // --- 默认逻辑结束 ---

                           // --- 填充逻辑不变：value 用 code, text 用 name ---
                           availableTracks.forEach((trackInfo) => {
                               const option = document.createElement('option');
                               option.value = trackInfo.languageCode; // 值用 Code
                               option.textContent = trackInfo.languageName; // 显示 Name
                               sourceLangSelect.appendChild(option);
                           });

                           // 设置默认选中项 (如果找到了)
                           if (defaultSelectedLangCode) {
                               console.log(`[DEBUG] Before setting default: sourceLangSelect.value = ${sourceLangSelect.value}`);
                               console.log(`[DEBUG] Attempting to set default value to: ${defaultSelectedLangCode}`);
                               sourceLangSelect.value = defaultSelectedLangCode;
                               // Check if the value was actually set
                               if (sourceLangSelect.value === defaultSelectedLangCode) {
                                   console.log(`[DEBUG] Successfully set default value to: ${sourceLangSelect.value}`);
                               } else {
                                   console.error(`[DEBUG] Failed to set default value. Expected: ${defaultSelectedLangCode}, Got: ${sourceLangSelect.value}. Options available:`, Array.from(sourceLangSelect.options).map(opt => opt.value));
                               }
                           }
                       }
                    } else {
                        console.error('找不到 sourceLangSelect 元素。');
                    }

                    // 在填充并设置好默认值之后，再加载用户保存的设置
                    console.log('[DEBUG] Calling loadSettings()...');
                    loadSettings(); 
                    // Add a small delay to check value after loadSettings potentially updates UI asynchronously
                    setTimeout(() => {
                         console.log(`[DEBUG] After loadSettings() (async check): sourceLangSelect.value = ${sourceLangSelect.value}`);
                    }, 100); 

                } else {
                    console.error("从 Content Script 收到的响应无效或缺少 availableTracks 数组:", response);
                    loadSettings(); 
                }
            });
        } else {
            console.warn("未找到活动的 YouTube 观看页面标签页。无法请求字幕轨道。");
            loadSettings();
        }
    });
});

// TODO:
// 5. (可选) 向 Content Script 或 Background Script 发送消息通知设置更改
// 6. 动态填充语言列表 