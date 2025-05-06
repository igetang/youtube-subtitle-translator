/**
 * Side Panel Logic
 */
import { targetLanguages, Language } from '../src/utils/languages'; // 导入语言列表

console.log('Side Panel Script Loaded.');

// --- DOM 元素引用 ---
const sourceLangSelect = document.getElementById('source-language') as HTMLSelectElement;
// --- Target Language Custom Select Elements ---
const targetLangContainer = document.getElementById('target-language-select') as HTMLDivElement; // Container
const targetLangTrigger = document.getElementById('target-language-trigger') as HTMLDivElement; // Trigger (clickable)
const targetLangTriggerValue = targetLangTrigger?.querySelector('.selected-value') as HTMLSpanElement; // Span to display selected value
const targetLangPanel = document.getElementById('target-language-panel') as HTMLDivElement; // Panel (hidden by default)
const targetLangSearch = document.getElementById('target-language-search') as HTMLInputElement; // Search input inside panel
const targetLangOptionsContainer = document.getElementById('target-language-options') as HTMLDivElement; // Container for language items
// --- End Target Language Elements ---
const subtitleTypeSwitch = document.getElementById('subtitle-type-switch') as HTMLInputElement;

/** 存储当前侧边栏关联的标签页 ID */
let currentTabId: number | null = null;
/** 缓存从存储加载的目标语言 */
let loadedTargetLang: string | null = null;
/** 跟踪当前选中的目标语言代码 */
let currentSelectedTargetLang: string | null = null;
/** 缓存浏览器 UI 语言 */
let uiLangCode: string | null = null;

// --- 默认设置 ---
const defaultSettings = {
    sourceLang: 'en', // 默认源语言：英语
    targetLang: 'en', // 默认目标语言：英语 (会尝试被 UI 语言覆盖)
    subtitleMode: 'bilingual' // 默认模式：双语 ('bilingual' 或 'targetOnly')
};

/**
 * 检查语言代码是否与 UI 语言相关 (精确或父/子关系)。
 * @param langCode 要检查的语言代码。
 * @param uiLangCode 浏览器 UI 语言代码。
 * @returns {boolean} 如果相关则返回 true。
 */
function isLanguageRelevantToUI(langCode: string, uiLangCode: string): boolean {
    if (langCode === uiLangCode) return true; // 精确匹配

    // 检查 langCode 是否是 uiLangCode 的通用版本 (e.g., lang='en', ui='en-US')
    if (uiLangCode.startsWith(langCode) && 
        uiLangCode.length > langCode.length && 
        (uiLangCode.charAt(langCode.length) === '-' || uiLangCode.charAt(langCode.length) === '_')) {
        return true;
    }

    // 检查 uiLangCode 是否是 langCode 的通用版本 (e.g., lang='en-US', ui='en')
    if (langCode.startsWith(uiLangCode) && 
        langCode.length > uiLangCode.length && 
        (langCode.charAt(uiLangCode.length) === '-' || langCode.charAt(uiLangCode.length) === '_')) {
        return true;
    }

    return false;
}

/**
 * 查找与给定代码匹配的目标语言 (使用优先级匹配)。
 * @param codeToMatch 要匹配的语言代码。
 * @returns {Language | undefined} 匹配的语言对象或 undefined。
 */
function findMatchingTargetLanguage(codeToMatch: string): Language | undefined {
    if (!codeToMatch) return undefined;

    let matchedLang: Language | undefined = undefined;
    const normalizedCodeToMatch = codeToMatch.toLowerCase(); // Normalize for comparison

    // Priority 1: Exact Match (case-insensitive)
    matchedLang = targetLanguages.find(lang => lang.code.toLowerCase() === normalizedCodeToMatch);
    if (matchedLang) return matchedLang;

    // Priority 2: Handle Chinese Script/Region Variants explicitly
    const baseLang = normalizedCodeToMatch.split(/[-_]/)[0];
    if (baseLang === 'zh') {
        const regionOrScript = normalizedCodeToMatch.split(/[-_]/)[1];
        // Prefer Hans for CN/SG UI, Hant for TW/HK UI
        if (regionOrScript === 'cn' || regionOrScript === 'sg') {
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        } else if (regionOrScript === 'tw' || regionOrScript === 'hk' || regionOrScript === 'hant') {
             matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hant');
        } else if (regionOrScript === 'hans') { // Explicit request for Hans
             matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        }
        // If UI is just 'zh', maybe default to Hans?
        else if (normalizedCodeToMatch === 'zh') {
             matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans') || targetLanguages.find(lang => lang.code === 'zh-Hant');
        }
        if (matchedLang) return matchedLang; 
    }

    // Priority 3: Target is Specific, List has General (e.g., target 'en-us', list has 'en')
    // Check if list code is a prefix of target code (followed by a separator)
    matchedLang = targetLanguages.find(lang => 
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '-') || 
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '_')
    );
     if (matchedLang) return matchedLang;

    // Priority 4: Target is General, List has Specific (e.g., target 'en', list has 'en-us')
    // Check if target code is a prefix of list code (followed by a separator)
     matchedLang = targetLanguages.find(lang =>
         lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '-') || 
         lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '_')
     );
    
    return matchedLang; // Return whatever was found, or undefined
}

/**
 * 更新自定义下拉触发器显示的文本。
 * @param langCode - 选中的语言代码。
 */
function updateTargetLanguageTriggerDisplay(langCode: string | null) {
    if (!targetLangTriggerValue) return;
    if (langCode) {
        const selectedLang = targetLanguages.find(l => l.code === langCode);
        targetLangTriggerValue.textContent = selectedLang ? selectedLang.name : '选择语言...';
        targetLangTriggerValue.dataset.value = langCode;
    } else {
        targetLangTriggerValue.textContent = '选择语言...';
        targetLangTriggerValue.removeAttribute('data-value');
    }
}

/**
 * 填充目标语言选项列表。
 * 实现新的排序逻辑：UI 相关语言优先，其余按名称字母排序。
 * @param searchTerm - 用于过滤语言的搜索词（可选）。
 */
function populateTargetLanguages(searchTerm: string = '') {
    if (!targetLangOptionsContainer || !uiLangCode) return; // 确保 uiLangCode 已获取

    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    const filteredLanguages = targetLanguages.filter(lang => {
        if (lowerSearchTerm === '') return true; 
        return (
            lang.name.toLowerCase().includes(lowerSearchTerm) ||
            lang.code.toLowerCase().includes(lowerSearchTerm) ||
            (lang.regionCode && lang.regionCode.toLowerCase().includes(lowerSearchTerm)) ||
            (lang.countryAlpha3 && lang.countryAlpha3.toLowerCase().includes(lowerSearchTerm)) || 
            (lang.callingCode && lang.callingCode.includes(lowerSearchTerm))
        );
    });

    // --- 新排序逻辑 ---
    filteredLanguages.sort((a, b) => {
        const aIsRelevant = isLanguageRelevantToUI(a.code, uiLangCode!);
        const bIsRelevant = isLanguageRelevantToUI(b.code, uiLangCode!);

        if (aIsRelevant && !bIsRelevant) return -1; // a 相关，排前面
        if (!aIsRelevant && bIsRelevant) return 1;  // b 相关，排前面
        
        // 如果相关性相同，按英文名称排序
        return a.englishName.localeCompare(b.englishName); 
    });
    // --- 结束新排序逻辑 ---

    // --- 填充 --- 
    targetLangOptionsContainer.innerHTML = ''; // 清空现有选项
    if (filteredLanguages.length === 0) {
        const noMatchDiv = document.createElement('div');
        noMatchDiv.className = 'custom-select-option disabled'; 
        noMatchDiv.textContent = '无匹配语言';
        targetLangOptionsContainer.appendChild(noMatchDiv);
    } else {
        filteredLanguages.forEach(lang => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'custom-select-option';
            optionDiv.dataset.value = lang.code; 
            optionDiv.textContent = lang.name;
            optionDiv.tabIndex = 0; 

            // 标记当前选中的项
            if (currentSelectedTargetLang === lang.code) {
                optionDiv.classList.add('selected');
            }

            // 根据源语言禁用选项
            if (sourceLangSelect && sourceLangSelect.value === lang.code) {
                optionDiv.classList.add('disabled');
            } 
            targetLangOptionsContainer.appendChild(optionDiv);
        });
    }
    // 更新禁用状态 (确保在填充后调用)
    updateTargetLangOptionsState(); 
}

// --- 加载设置 --- 
function loadSettings() {
    // 获取 UI 语言，如果尚未获取
    if (!uiLangCode) {
        uiLangCode = chrome.i18n.getUILanguage();
        console.log(`[Diag] Fetched UI Language Code: ${uiLangCode}`); 
    }

    chrome.storage.sync.get(['sourceLang', 'targetLang', 'subtitleMode'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('加载设置时出错:', chrome.runtime.lastError);
            // 出错时使用默认值
            currentSelectedTargetLang = defaultSettings.targetLang;
            updateTargetLanguageTriggerDisplay(currentSelectedTargetLang);
            populateTargetLanguages(); // 填充列表
            updateUI({ subtitleMode: defaultSettings.subtitleMode }); // 更新其他UI
            return;
        }
        
        const loadedSettings: Partial<typeof defaultSettings> = {};
        // 处理 sourceLang (逻辑不变)
        if (result.sourceLang && typeof result.sourceLang === 'string') {
            loadedSettings.sourceLang = result.sourceLang;
        }

        // --- 处理 targetLang (实现默认匹配 UI 语言) ---
        if (result.targetLang) {
            // 用户已保存设置，使用它
            loadedTargetLang = result.targetLang;
            console.log(`[loadSettings] Using saved targetLang: ${loadedTargetLang}`);
        } else {
            // 没有保存的值，尝试匹配 UI 语言
            console.log(`[loadSettings] No saved targetLang. Trying to match UI lang: ${uiLangCode}`);
            const matchedLang = findMatchingTargetLanguage(uiLangCode!);
            if (matchedLang) {
                loadedTargetLang = matchedLang.code;
                console.log(`[Diag] Matched UI lang (${uiLangCode}) to targetLanguage code: ${matchedLang.code}`, matchedLang);
            } else {
                // 找不到匹配的 UI 语言，使用硬编码的默认值
                loadedTargetLang = defaultSettings.targetLang;
                console.log(`[Diag] UI lang (${uiLangCode}) did NOT match any targetLanguage entry. Using default: ${loadedTargetLang}`);
            }
            // 将首次确定的默认值存起来，避免每次都重新计算
             chrome.storage.sync.set({ targetLang: loadedTargetLang }, () => {
                if (chrome.runtime.lastError) {
                    console.error('保存初始默认目标语言时出错:', chrome.runtime.lastError);
                } else {
                    console.log('初始默认目标语言已保存:', loadedTargetLang);
                }
            });
        }
        // --- 结束 targetLang 处理 ---

        currentSelectedTargetLang = loadedTargetLang; // 设置当前选中状态
        updateTargetLanguageTriggerDisplay(currentSelectedTargetLang); // 更新触发器显示
        // 注意：populateTargetLanguages 现在依赖 uiLangCode，会在 requestAndFillSourceLanguages 成功后或出错时被调用

        // 处理 subtitleMode
        if (result.subtitleMode) loadedSettings.subtitleMode = result.subtitleMode;

        console.log('[loadSettings] Calling updateUI with initial source/mode settings:', loadedSettings);
        updateUI(loadedSettings); // 更新源语言和开关
    });
}

// --- 更新 UI (除了目标语言显示) --- 
function updateUI(settings: Partial<typeof defaultSettings>) { 
    // 更新源语言
    if (sourceLangSelect && settings.sourceLang !== undefined) {
        if (Array.from(sourceLangSelect.options).some(opt => opt.value === settings.sourceLang)) {
            if (sourceLangSelect.value !== settings.sourceLang) {
               console.log(`[updateUI] Setting sourceLangSelect.value to: ${settings.sourceLang}`);
               sourceLangSelect.value = settings.sourceLang;
               // 源语言改变后，需要重新填充目标语言选项以更新禁用状态和选中状态
               populateTargetLanguages(targetLangSearch?.value || ''); 
            }
        } else {
             console.warn(`[updateUI] Saved sourceLang (${settings.sourceLang}) not in options, skipping update.`);
             // 如果加载的源语言无效，也要确保目标语言状态更新
             populateTargetLanguages(targetLangSearch?.value || ''); 
        }
    } else if (sourceLangSelect) {
        // 如果没有加载的源语言设置，也要根据当前选中的源语言更新目标语言状态
        populateTargetLanguages(targetLangSearch?.value || ''); 
    }
    
    // 更新开关
    if (subtitleTypeSwitch && settings.subtitleMode !== undefined) {
        subtitleTypeSwitch.checked = settings.subtitleMode === 'bilingual';
    }
}

// --- 保存设置 --- 
function saveSettings() {
    const selectedTargetValue = currentSelectedTargetLang || defaultSettings.targetLang;
    const settingsToSave = {
        sourceLang: sourceLangSelect?.value || defaultSettings.sourceLang,
        targetLang: selectedTargetValue,
        subtitleMode: subtitleTypeSwitch?.checked ? 'bilingual' : 'targetOnly'
    };
    chrome.storage.sync.set(settingsToSave, () => {
        if (chrome.runtime.lastError) {
            console.error('保存设置时出错:', chrome.runtime.lastError);
        } else {
            console.log('设置已保存:', settingsToSave);
        }
    });
}

/**
 * 处理目标语言选项的点击事件 (事件委托)。
 * @param event - 点击事件对象。
 */
function handleTargetLanguageSelect(event: Event) {
    const target = event.target as HTMLElement;
    if (target && target.classList.contains('custom-select-option') && !target.classList.contains('disabled')) {
        const selectedValue = target.dataset.value;
        if (selectedValue) {
            currentSelectedTargetLang = selectedValue; 
            updateTargetLanguageTriggerDisplay(selectedValue); 
            saveSettings(); 
            document.querySelectorAll('#target-language-options .custom-select-option.selected').forEach(el => el.classList.remove('selected'));
            target.classList.add('selected');
            closeTargetLanguagePanel();
        }
    }
}

/** 打开目标语言下拉面板 */
function openTargetLanguagePanel() {
    if (!targetLangPanel || !targetLangContainer) return;
    targetLangPanel.style.display = 'block';
    targetLangContainer.classList.add('open');
    targetLangSearch?.focus(); 
    document.addEventListener('click', handleClickOutsideTargetLangPanel, true); 
}

/** 关闭目标语言下拉面板 */
function closeTargetLanguagePanel() {
    if (!targetLangPanel || !targetLangContainer) return;
    targetLangPanel.style.display = 'none';
    targetLangContainer.classList.remove('open');
    document.removeEventListener('click', handleClickOutsideTargetLangPanel, true);
}

/** 切换目标语言下拉面板的显示状态 */
function toggleTargetLanguagePanel() {
    if (!targetLangPanel || !targetLangContainer) return;
    const isOpen = targetLangPanel.style.display === 'block';
    if (isOpen) {
        closeTargetLanguagePanel();
    } else {
        openTargetLanguagePanel();
    }
}

/**
 * 处理页面点击事件，如果点击发生在自定义下拉框外部，则关闭面板。
 * @param event - 点击事件对象。
 */
function handleClickOutsideTargetLangPanel(event: MouseEvent) {
    if (targetLangContainer && !targetLangContainer.contains(event.target as Node)) {
        closeTargetLanguagePanel();
    }
}

// --- 根据源语言更新目标语言选项禁用状态 (逻辑不变，但现在操作 .disabled 类) ---
/**
 * 根据当前选中的源语言，更新目标语言选项列表中的禁用样式。
 */
function updateTargetLangOptionsState() {
    if (!sourceLangSelect || !targetLangOptionsContainer) return;
    const selectedSourceLangCode = sourceLangSelect.value;
    console.log(`[TargetLangState] Updating option styles based on source: ${selectedSourceLangCode}`);
    const options = targetLangOptionsContainer.querySelectorAll<HTMLDivElement>('.custom-select-option');
    options.forEach(option => {
        if (option.dataset.value === selectedSourceLangCode) {
            option.classList.add('disabled');
        } else {
            option.classList.remove('disabled');
        }
    });
}

// --- 请求并填充源语言 (逻辑基本不变，但在成功后会调用 loadSettings) ---
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
    sourceLangSelect.innerHTML = '<option value="" disabled>Loading tracks...</option>';
    sourceLangSelect.disabled = true;
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'requestAvailableTracks' });
        console.log("[SP] Received tracks response:", response);
        sourceLangSelect.innerHTML = '';
        if (response && Array.isArray(response.availableTracks)) {
            const availableTracks: { languageCode: string, languageName: string, kind: string }[] = response.availableTracks;
            if (availableTracks.length === 0) {
                 const option = document.createElement('option');
                 option.value = '';
                 option.textContent = 'No subtitles available';
                 option.disabled = true;
                 sourceLangSelect.appendChild(option);
            } else {
                let defaultSelectedLangCode: string | null = null;
                const englishNonAsrTrack = availableTracks.find(t => t.languageCode.startsWith('en') && t.kind !== 'asr');
                if (englishNonAsrTrack) {
                    defaultSelectedLangCode = englishNonAsrTrack.languageCode;
                } else if (availableTracks.length > 0) {
                    defaultSelectedLangCode = availableTracks[0].languageCode;
                }
                availableTracks.forEach((trackInfo) => {
                    const option = document.createElement('option');
                    option.value = trackInfo.languageCode;
                    option.textContent = trackInfo.languageName;
                    sourceLangSelect.appendChild(option);
                });
                if (defaultSelectedLangCode) {
                     if (Array.from(sourceLangSelect.options).some(opt => opt.value === defaultSelectedLangCode)) {
                        sourceLangSelect.value = defaultSelectedLangCode;
                     } else {
                         console.warn(`[SP] Default language code ${defaultSelectedLangCode} not found. Selecting first available.`);
                         if(sourceLangSelect.options.length > 0) sourceLangSelect.selectedIndex = 0;
                     }
                } else if (sourceLangSelect.options.length > 0) {
                     sourceLangSelect.selectedIndex = 0;
                }
            }
             sourceLangSelect.disabled = false;

            // --- 新增：立即保存初始默认源语言 --- 
            console.log(`[SP] Initial source language selected: ${sourceLangSelect.value}. Saving settings...`);
            saveSettings();
            // --- 结束新增 ---

        } else {
            console.error("[SP] Invalid response received:", response);
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Error loading tracks';
            option.disabled = true;
            sourceLangSelect.appendChild(option);
             sourceLangSelect.disabled = true; // 出错时保持禁用
        }
         // 加载并应用用户保存的设置（现在应该能正确读取或覆盖刚保存的默认源语言）
         console.log('[SP] Calling loadSettings() after filling languages and potentially saving default source...');
        loadSettings(); 

    } catch (error) {
        console.error(`[SP] Error requesting tracks for Tab ${tabId}:`, error);
        sourceLangSelect.innerHTML = ''; 
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Error loading tracks';
        option.disabled = true;
        sourceLangSelect.appendChild(option);
         sourceLangSelect.disabled = true; 
        loadSettings(); // 即使出错也加载其他设置
    }
}

// --- 添加事件监听器 --- 
function addEventListeners() {
    // 源语言选择
    sourceLangSelect?.addEventListener('change', () => {
        saveSettings();
        populateTargetLanguages(targetLangSearch?.value || '');
    });
    // 目标语言 - 触发器点击
    targetLangTrigger?.addEventListener('click', toggleTargetLanguagePanel);
    // 目标语言 - 选项点击 (使用事件委托)
    targetLangOptionsContainer?.addEventListener('click', handleTargetLanguageSelect);
    // 目标语言 - 搜索框输入
    targetLangSearch?.addEventListener('input', (event) => {
        const searchTerm = (event.target as HTMLInputElement).value;
        populateTargetLanguages(searchTerm); 
    });
    // 字幕类型切换
    subtitleTypeSwitch?.addEventListener('change', saveSettings);
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired.");
    // 1. 获取 UI 语言
    uiLangCode = chrome.i18n.getUILanguage();
    console.log(`[Init] Fetched UI Language: ${uiLangCode}`);
    // 2. 添加事件监听器 (包括自定义下拉框的)
    addEventListeners();
    // 3. 先填充目标语言列表 (使用 UI 语言排序)
    populateTargetLanguages(); 
    // 4. 获取当前标签页 ID 并请求源语言轨道 (成功后调用 loadSettings)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (chrome.runtime.lastError) {
            console.error("[SP] Error querying tabs:", chrome.runtime.lastError);
            if (sourceLangSelect) {
                sourceLangSelect.innerHTML = '<option value="" disabled>Error</option>';
                sourceLangSelect.disabled = true;
            }
            loadSettings(); 
            return;
        }
        if (tabs.length > 0 && tabs[0].id) {
            currentTabId = tabs[0].id;
            console.log(`[SP] Associated with Tab ${currentTabId}`);
            requestAndFillSourceLanguages(currentTabId); // 请求轨道，成功后调用 loadSettings
        } else {
            console.error("[SP] Could not determine active tab ID.");
              if (sourceLangSelect) {
                sourceLangSelect.innerHTML = '<option value="" disabled>Error</option>';
                sourceLangSelect.disabled = true;
             }
             loadSettings(); 
        }
    });
});

// --- 监听来自背景脚本的导航通知 --- 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'youtubeNavigationOccurred' && message.navigatedTabId) {
        console.log(`[SP] Received navigation notification for Tab ${message.navigatedTabId}. Current: ${currentTabId}.`);
        if (currentTabId !== null && message.navigatedTabId === currentTabId) {
            console.log(`[SP] Navigation matches. Resetting and re-requesting...`);
            closeTargetLanguagePanel();
            if (targetLangSearch) targetLangSearch.value = '';
            // 获取最新的 UI 语言以防改变 (虽然不太可能在会话中改变)
            uiLangCode = chrome.i18n.getUILanguage(); 
            populateTargetLanguages(); 
            requestAndFillSourceLanguages(currentTabId);
        }
        return false;
    }
    return false; // 其他消息不处理
});

// TODO:
// 5. (可选) 向 Content Script 或 Background Script 发送消息通知设置更改
// 6. 动态填充语言列表 