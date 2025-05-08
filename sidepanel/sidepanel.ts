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
// --- 新增: 翻译API相关元素 ---
const translationApiSelect = document.getElementById('translation-api') as HTMLSelectElement;
const apiKeyPanel = document.getElementById('api-key-panel') as HTMLDivElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const apiInfoLink = document.getElementById('api-info-link') as HTMLAnchorElement;
const customApiPanel = document.getElementById('custom-api-panel') as HTMLDivElement;
const customApiUrl = document.getElementById('custom-api-url') as HTMLInputElement;
const customApiMethod = document.getElementById('custom-api-method') as HTMLSelectElement;
const customApiHeaders = document.getElementById('custom-api-headers') as HTMLTextAreaElement;
const customApiBody = document.getElementById('custom-api-body') as HTMLTextAreaElement;
const customApiResponsePath = document.getElementById('custom-api-response-path') as HTMLInputElement;
// 新增: 测试按钮相关元素
const testApiKeyButton = document.getElementById('test-api-key') as HTMLButtonElement;
const testResultSpan = document.getElementById('test-result') as HTMLSpanElement;
// 新增: 服务类型选择相关元素
const serviceTypePanel = document.getElementById('service-type-panel') as HTMLDivElement;
const serviceTypeMembership = document.getElementById('service-type-membership') as HTMLInputElement;
const serviceTypeApiKey = document.getElementById('service-type-api-key') as HTMLInputElement;
// 新增: 会员登录相关元素
const membershipPanel = document.getElementById('membership-panel') as HTMLDivElement;
const socialLoginButtons = document.querySelectorAll('.social-login-btn') as NodeListOf<HTMLButtonElement>;
const loginResultSpan = document.getElementById('login-result') as HTMLSpanElement;
// --- End 新增: 翻译API元素 ---

/** 存储当前侧边栏关联的标签页 ID */
let currentTabId: number | null = null;
/** 缓存从存储加载的目标语言 */
let loadedTargetLang: string | null = null;
/** 跟踪当前选中的目标语言代码 */
let currentSelectedTargetLang: string | null = null;
/** 缓存浏览器 UI 语言 */
let uiLangCode: string | null = null;

// --- 新增: API相关信息 ---
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
    }
};
// --- End 新增: API相关信息 ---

// --- 新增: 会员登录相关函数和类型 ---

/**
 * 支持的第三方登录提供商
 */
type LoginProvider = 'google' | 'apple' | 'twitter' | 'facebook' | 'wechat';

/**
 * 第三方登录状态
 */
interface LoginState {
    loggedIn: boolean;
    provider?: LoginProvider;
    userId?: string;
}

/**
 * 处理第三方账号登录
 * @param provider 登录提供商
 */
async function handleSocialLogin(provider: LoginProvider): Promise<void> {
    if (!loginResultSpan) {
        return;
    }
    
    const apiType = translationApiSelect?.value || defaultSettings.translationApi;
    
    // 更新登录状态显示
    loginResultSpan.textContent = '正在登录...';
    loginResultSpan.className = 'result-text';
    
    try {
        // 发送登录请求到后台脚本
        const result = await new Promise<{success: boolean, message: string}>((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    action: 'testMembershipLogin',
                    payload: { 
                        apiType: apiType,
                        provider: provider
                    }
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                }
            );
        });
        
        if (result.success) {
            loginResultSpan.textContent = result.message || `已通过${getProviderDisplayName(provider)}登录`;
            loginResultSpan.className = 'result-text success';
            
            // 保存登录状态
            const loginState: LoginState = {
                loggedIn: true,
                provider: provider,
                userId: `user_${Math.floor(Math.random() * 10000)}` // 模拟用户ID
            };
            
            chrome.storage.sync.set({ 
                membershipCredentials: loginState
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('保存登录状态时出错:', chrome.runtime.lastError);
                } else {
                    console.log('登录状态已保存:', loginState);
                }
            });
        } else {
            loginResultSpan.textContent = result.message || '登录失败，请重试';
            loginResultSpan.className = 'result-text error';
        }
    } catch (error) {
        console.error('第三方登录出错:', error);
        loginResultSpan.textContent = error instanceof Error ? error.message : '登录过程中发生错误';
        loginResultSpan.className = 'result-text error';
    }
}

/**
 * 获取登录提供商的显示名称
 */
function getProviderDisplayName(provider: LoginProvider): string {
    const nameMap: Record<LoginProvider, string> = {
        'google': '谷歌账号',
        'apple': '苹果账号',
        'twitter': '推特账号',
        'facebook': '脸书账号',
        'wechat': '微信账号'
    };
    
    return nameMap[provider] || provider;
}

// --- 默认设置 ---
const defaultSettings = {
    sourceLang: 'en', // 默认源语言：英语
    targetLang: 'en', // 默认目标语言：英语 (会尝试被 UI 语言覆盖)
    subtitleMode: 'bilingual', // 默认模式：双语 ('bilingual' 或 'targetOnly')
    translationApi: 'google-free', // 默认翻译API: Google翻译
    apiKey: '', // 新增: API密钥默认为空
    serviceType: 'api-key', // 新增: 默认服务类型为自有API密钥
    membershipCredentials: { // 新增: 会员登录状态默认为未登录
        loggedIn: false,
        provider: undefined as LoginProvider | undefined,
        userId: ''
    },
    customApiConfig: { // 新增: 自定义API配置默认值
        url: '',
        method: 'POST',
        headers: '{"Content-Type": "application/json"}',
        body: '{"text": "{text}", "source": "{source}", "target": "{target}"}',
        responsePath: 'data.translations[0].text'
    }
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

    console.log(`[findMatchingTargetLanguage] 尝试匹配语言代码: ${codeToMatch}`);
    let matchedLang: Language | undefined = undefined;
    const normalizedCodeToMatch = codeToMatch.toLowerCase(); // Normalize for comparison

    // Priority 1: Exact Match (case-insensitive)
    matchedLang = targetLanguages.find(lang => lang.code.toLowerCase() === normalizedCodeToMatch);
    if (matchedLang) {
        console.log(`[findMatchingTargetLanguage] 精确匹配: ${matchedLang.code}`);
        return matchedLang;
    }

    // Priority 2: Handle Chinese Script/Region Variants explicitly
    const baseLang = normalizedCodeToMatch.split(/[-_]/)[0];
    console.log(`[findMatchingTargetLanguage] 基础语言代码: ${baseLang}`);
    
    if (baseLang === 'zh') {
        console.log(`[findMatchingTargetLanguage] 处理中文变体. 完整代码: ${normalizedCodeToMatch}`);
        const regionOrScript = normalizedCodeToMatch.split(/[-_]/)[1];
        console.log(`[findMatchingTargetLanguage] 区域/脚本代码: ${regionOrScript}`);
        
        // 强化中文匹配: 所有中国大陆区域代码使用简体中文
        // Prefer Hans for CN/SG UI, Hant for TW/HK UI
        if (regionOrScript === 'cn' || regionOrScript === 'sg' || regionOrScript === 'hans') {
            console.log('[findMatchingTargetLanguage] 匹配简体中文 (zh-Hans)');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        } else if (regionOrScript === 'tw' || regionOrScript === 'hk' || regionOrScript === 'hant') {
            console.log('[findMatchingTargetLanguage] 匹配繁体中文 (zh-Hant)');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hant');
        }
        // If UI is just 'zh', default to Hans
        else if (normalizedCodeToMatch === 'zh') {
            console.log('[findMatchingTargetLanguage] 纯zh代码，默认使用简体中文');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans') || targetLanguages.find(lang => lang.code === 'zh-Hant');
        }
        // 添加默认中文处理
        else {
            console.log('[findMatchingTargetLanguage] 未知中文变体，默认使用简体中文');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        }
        
        if (matchedLang) return matchedLang; 
    }

    // Priority 3: Target is Specific, List has General (e.g., target 'en-us', list has 'en')
    // Check if list code is a prefix of target code (followed by a separator)
    matchedLang = targetLanguages.find(lang => 
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '-') || 
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '_')
    );
    if (matchedLang) {
        console.log(`[findMatchingTargetLanguage] 匹配前缀(特定到通用): ${matchedLang.code}`);
        return matchedLang;
    }

    // Priority 4: Target is General, List has Specific (e.g., target 'en', list has 'en-us')
    // Check if target code is a prefix of list code (followed by a separator)
    matchedLang = targetLanguages.find(lang =>
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '-') || 
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '_')
    );
    
    if (matchedLang) {
        console.log(`[findMatchingTargetLanguage] 匹配前缀(通用到特定): ${matchedLang.code}`);
    } else {
        console.log(`[findMatchingTargetLanguage] 未找到匹配`);
    }
    
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

/**
 * 为给定的源语言选择一个合适的备选目标语言。
 * @param sourceLangCode 源语言代码。
 * @returns 备选目标语言代码。
 */
function getFallbackTargetLang(sourceLangCode: string): string {
    // 不同语言族的代表语言优先级
    const fallbackPriorities = [
        'zh-Hans',  // 中文简体
        'fr',       // 法语
        'ja',       // 日语
        'de',       // 德语
        'es',       // 西班牙语
        'ru',       // 俄语
        'ar',       // 阿拉伯语
        'en-GB'     // 英国英语 (如果源语言是美式英语)
    ];
    
    // 返回第一个不与源语言相同的语言
    for (const langCode of fallbackPriorities) {
        if (langCode !== sourceLangCode) {
            return langCode;
        }
    }
    
    // 极端情况下的最终备选
    return 'fr';
}

/**
 * 根据选择的API类型更新界面显示的面板
 * @param apiType 当前选择的API类型
 */
function updateApiPanels(apiType: string) {
    // 获取API信息
    const apiInfo = apiInfoMap[apiType] || {
        name: '未知API',
        infoUrl: '',
        requiresKey: false,
        customConfig: false
    };
    
    // 隐藏所有API相关面板
    if (apiKeyPanel) apiKeyPanel.style.display = 'none';
    if (serviceTypePanel) serviceTypePanel.style.display = 'none';
    if (membershipPanel) membershipPanel.style.display = 'none';
    if (customApiPanel) customApiPanel.style.display = 'none';
    
    // 设置API信息链接
    if (apiInfoLink && apiInfo.infoUrl) {
        apiInfoLink.href = apiInfo.infoUrl;
        apiInfoLink.parentElement!.style.display = 'block';
    } else if (apiInfoLink) {
        apiInfoLink.parentElement!.style.display = 'none';
    }
    
    // 对于当前只保留的免费API选项，不需要显示API密钥或服务类型面板
    // 只有模拟翻译、Google翻译、微软翻译
    
    // 更新测试按钮文本
    if (testApiKeyButton) {
        testApiKeyButton.textContent = `测试连接`;
    }
    
    // 清除测试结果
    if (testResultSpan) {
        testResultSpan.textContent = '';
        testResultSpan.className = 'test-result';
    }
}

/**
 * 根据当前选择的服务类型更新会员登录和API密钥面板的显示状态
 */
function updateAuthPanels() {
    const apiType = translationApiSelect?.value || defaultSettings.translationApi;
    const isPaidService = apiType.endsWith('-paid');
    const currentServiceType = serviceTypeMembership?.checked ? 'membership' : 'api-key';
    
    // 处理会员登录面板
    if (membershipPanel) {
        if (isPaidService && currentServiceType === 'membership') {
            membershipPanel.classList.add('visible');
            membershipPanel.style.display = 'flex';
        } else {
            membershipPanel.classList.remove('visible');
            setTimeout(() => {
                if (!isPaidService || currentServiceType !== 'membership') {
                    membershipPanel.style.display = 'none';
                }
            }, 300);
        }
    }
    
    // 处理API密钥面板
    if (apiKeyPanel) {
        const needsApiKey = (isPaidService && currentServiceType === 'api-key') || 
                           apiType === 'custom' || 
                           (apiInfoMap[apiType]?.requiresKey && !isPaidService);
        
        if (needsApiKey) {
            apiKeyPanel.classList.add('visible');
            apiKeyPanel.style.display = 'flex';
        } else {
            apiKeyPanel.classList.remove('visible');
            setTimeout(() => {
                const currentApiType = translationApiSelect?.value || defaultSettings.translationApi;
                const currentIsPaidService = currentApiType.endsWith('-paid');
                const currentServiceTypeValue = serviceTypeMembership?.checked ? 'membership' : 'api-key';
                
                const shouldHide = !(
                    (currentIsPaidService && currentServiceTypeValue === 'api-key') || 
                    currentApiType === 'custom' || 
                    (apiInfoMap[currentApiType]?.requiresKey && !currentIsPaidService)
                );
                
                if (shouldHide) {
                    apiKeyPanel.style.display = 'none';
                }
            }, 300);
        }
    }
}

/**
 * 从chrome.storage加载设置
 */
function loadSettings() {
    console.log('[Debug] 开始从storage加载设置...');
    chrome.storage.sync.get(['sourceLang', 'targetLang', 'subtitleMode', 'translationApi', 'apiKey', 'serviceType', 'membershipCredentials', 'customApiConfig'], (result) => {
        console.log('[Debug] storage.get回调执行, 结果:', result);
        if (chrome.runtime.lastError) {
            console.error('[Error] 从storage加载设置时出错:', chrome.runtime.lastError);
            return;
        }

        // 合并获取的设置与默认值
        let loadedSettings = {
            sourceLang: result.sourceLang || defaultSettings.sourceLang,
            targetLang: result.targetLang || defaultSettings.targetLang,
            subtitleMode: result.subtitleMode || defaultSettings.subtitleMode
        };

        // 加载API相关设置
        const loadedApiSettings = {
            translationApi: defaultSettings.translationApi,
            apiKey: defaultSettings.apiKey,
            serviceType: defaultSettings.serviceType,
            membershipCredentials: defaultSettings.membershipCredentials,
            customApiConfig: defaultSettings.customApiConfig
        };

        if (result.translationApi) {
            loadedApiSettings.translationApi = result.translationApi;
            console.log(`[Debug] 从storage加载翻译API: ${result.translationApi}`);
        }

        if (result.apiKey) {
            loadedApiSettings.apiKey = result.apiKey;
            console.log(`[Debug] 从storage加载API密钥`);
        }

        if (result.serviceType) {
            loadedApiSettings.serviceType = result.serviceType;
            console.log(`[Debug] 从storage加载服务类型: ${result.serviceType}`);
        }

        if (result.membershipCredentials) {
            loadedApiSettings.membershipCredentials = result.membershipCredentials;
            console.log(`[Debug] 从storage加载会员登录凭据`);
        }

        if (result.customApiConfig) {
            loadedApiSettings.customApiConfig = result.customApiConfig;
            console.log(`[Debug] 从storage加载自定义API配置`);
        }

        // 显示设置到UI
        currentSelectedTargetLang = loadedSettings.targetLang; // 记录当前选择的目标语言
        displaySettings(loadedSettings);
        
        // 显示API设置到UI
        displayApiSettings(loadedApiSettings);
    });
}

/**
 * 更新API相关UI元素
 */
function updateApiUI(settings: {
    translationApi: string;
    apiKey: string;
    serviceType: string;
    membershipCredentials: typeof defaultSettings.membershipCredentials;
    customApiConfig: typeof defaultSettings.customApiConfig;
}) {
    // 更新翻译API选择
    if (translationApiSelect && settings.translationApi) {
        translationApiSelect.value = settings.translationApi;
        // 根据选择更新面板显示
        updateApiPanels(settings.translationApi);
    }

    // 更新API密钥
    if (apiKeyInput && settings.apiKey) {
        apiKeyInput.value = settings.apiKey;
    }

    // 更新自定义API配置
    if (settings.customApiConfig) {
        if (customApiUrl) customApiUrl.value = settings.customApiConfig.url;
        if (customApiMethod) customApiMethod.value = settings.customApiConfig.method;
        if (customApiHeaders) customApiHeaders.value = settings.customApiConfig.headers;
        if (customApiBody) customApiBody.value = settings.customApiConfig.body;
        if (customApiResponsePath) customApiResponsePath.value = settings.customApiConfig.responsePath;
    }
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

    // 新增：更新API相关设置
    if (settings.translationApi !== undefined) {
        if (translationApiSelect) {
            translationApiSelect.value = settings.translationApi;
            updateApiPanels(settings.translationApi);
        }
    }
}

/**
 * 保存设置到chrome.storage
 */
function saveSettings() {
    // 获取自定义API配置
    const customApiConfigValue = {
        url: customApiUrl?.value || defaultSettings.customApiConfig.url,
        method: customApiMethod?.value || defaultSettings.customApiConfig.method,
        headers: customApiHeaders?.value || defaultSettings.customApiConfig.headers,
        body: customApiBody?.value || defaultSettings.customApiConfig.body,
        responsePath: customApiResponsePath?.value || defaultSettings.customApiConfig.responsePath
    };

    // 获取当前登录状态
    const currentLoginState: LoginState = chrome.storage.sync.get('membershipCredentials')
        .then(result => result.membershipCredentials) 
        .catch(() => defaultSettings.membershipCredentials) as unknown as LoginState;

    const selectedTargetValue = currentSelectedTargetLang || defaultSettings.targetLang;
    const settingsToSave = {
        sourceLang: sourceLangSelect?.value || defaultSettings.sourceLang,
        targetLang: selectedTargetValue,
        subtitleMode: subtitleTypeSwitch?.checked ? 'bilingual' : 'targetOnly',
        // 新增：保存API相关设置
        translationApi: translationApiSelect?.value || defaultSettings.translationApi,
        apiKey: apiKeyInput?.value || '',
        serviceType: serviceTypeMembership?.checked ? 'membership' : 'api-key',
        membershipCredentials: currentLoginState,
        customApiConfig: customApiConfigValue
    };
    chrome.storage.sync.set(settingsToSave, () => {
        if (chrome.runtime.lastError) {
            console.error('保存设置时出错:', chrome.runtime.lastError);
        } else {
            console.log('设置已保存:', settingsToSave);
            // 当设置保存成功后，向内容脚本发送消息更新字幕模式
            if (currentTabId) { //确保 currentTabId 有效
                chrome.tabs.sendMessage(
                    currentTabId,
                    {
                        action: 'subtitleModeUpdated',
                        mode: settingsToSave.subtitleMode
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            // 在这里处理错误，例如目标标签页不存在或内容脚本没有监听
                            // 对于 "Could not establish connection..." 错误，这通常意味着内容脚本没有对应的 listener
                            // 或者 currentTabId 指向的标签页没有成功注入内容脚本或已关闭
                            console.warn('向内容脚本发送字幕模式更新消息失败:', chrome.runtime.lastError.message);
                        } else {
                            // 处理来自内容脚本的成功响应 (可选)
                            console.log('内容脚本响应subtitleModeUpdated:', response);
                        }
                    }
                );
            }
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
        // 即使 sourceLangSelect 为空，也应该尝试加载用户可能已保存的其他设置
        loadSettings();
        return;
    }
    console.log(`[SP] Requesting available tracks for Tab ${tabId}...`);
    sourceLangSelect.innerHTML = '<option value="" disabled>Loading tracks...</option>';
    sourceLangSelect.disabled = true;
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'requestAvailableTracks' });
        console.log("[SP] Received tracks response:", response);
        sourceLangSelect.innerHTML = ''; // 清空 "Loading tracks..."

        let initialSourceLangToSave: string | null = null;

        if (response && Array.isArray(response.availableTracks)) {
            const availableTracks: { languageCode: string, languageName: string, kind: string }[] = response.availableTracks;
            if (availableTracks.length === 0) {
                 const option = document.createElement('option');
                 option.value = '';
                 option.textContent = 'No subtitles available';
                 option.disabled = true;
                 sourceLangSelect.appendChild(option);
                 sourceLangSelect.disabled = true; // 保持禁用，因为没有可选轨道
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
                     sourceLangSelect.selectedIndex = 0; // 确保有选中项
                }
                // 只有在成功填充并选择了有效轨道后，才认为它是可以保存的初始源语言
                if (sourceLangSelect.value) {
                    initialSourceLangToSave = sourceLangSelect.value;
                }
                sourceLangSelect.disabled = false;
            }
        } else {
            console.error("[SP] Invalid response received or no availableTracks array:", response);
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Error loading tracks';
            option.disabled = true;
            sourceLangSelect.appendChild(option);
            sourceLangSelect.disabled = true; // 出错时保持禁用
        }

        // 现在决定是否以及如何调用 loadSettings
        if (initialSourceLangToSave) {
            // 检查存储中是否已有源语言设置，如果与当前推荐的不同或不存在，则保存
            // 这一步是为了确保 loadSettings 能拿到最新的"推荐"源语言
            // 但更核心的逻辑是让 loadSettings 自己去决定最终用哪个源语言并保存
            console.log(`[SP] Initial source language selected: ${initialSourceLangToSave}. Ensuring it is considered by loadSettings.`);
            // 我们不再在这里直接保存源语言，而是让 loadSettings 去处理默认源语言的逻辑。
            // loadSettings 将会检查 storage，如果 sourceLang 未设置，
            // 它会参考 sourceLangSelect.value (我们在这里已经设置好了)
        }
        
        // 无论是否成功获取轨道，都调用 loadSettings 来加载或初始化所有设置
        console.log('[SP] Calling loadSettings() after processing available tracks...');
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
        console.log('[SP] Error requesting tracks. Calling loadSettings() to load other settings...');
        loadSettings(); // 即使出错也加载其他设置
    }
}

/**
 * 测试API连接是否有效
 * @param apiType API类型
 * @param apiKey API密钥（对于免费API不需要）
 * @param customConfig 自定义API配置（不需要）
 * @returns 测试结果
 */
async function testApiKey(
    apiType: string, 
    apiKey: string = '', 
    customConfig?: typeof defaultSettings.customApiConfig
): Promise<{success: boolean, message: string}> {
    try {
        // 准备测试数据
        const testText = "Hello, world!"; // 简单测试文本
        
        // 获取源语言和目标语言
        const language = sourceLangSelect?.value || 'en';
        const targetLang = currentSelectedTargetLang || loadedTargetLang || 'zh-Hans';
        
        console.log(`[Test API] Testing ${apiType} with source=${language}, target=${targetLang}`);
        
        // 显示测试中状态
        if (testResultSpan) {
            testResultSpan.textContent = '正在测试连接...';
            testResultSpan.className = 'test-result';
        }
        
        // 发送测试请求到后台脚本
        return await new Promise<{success: boolean, message: string}>((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    action: 'testApiKey',
                    payload: {
                        apiType,
                        apiKey,
                        testText,
                        sourceLang: language,
                        targetLang: targetLang,
                        customConfig
                    }
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    } catch (error) {
        console.error('测试API时出错:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : '未知错误'
        };
    }
}

/**
 * 显示测试结果
 * @param result 测试结果对象
 */
function displayTestResult(result: {success: boolean, message: string}) {
    if (!testResultSpan) return;
    
    testResultSpan.textContent = result.message;
    if (result.success) {
        testResultSpan.className = 'test-result success';
    } else {
        testResultSpan.className = 'test-result error';
    }
}

// --- 添加事件监听器 --- 
function addEventListeners() {
    // 源语言选择
    sourceLangSelect?.addEventListener('change', () => {
        // 检查当前选中的目标语言是否与新的源语言相同
        if (currentSelectedTargetLang === sourceLangSelect?.value) {
            console.log(`[Event] Source language changed to match current target language (${currentSelectedTargetLang}). Selecting a different target.`);
            
            // 选择一个不同的目标语言
            currentSelectedTargetLang = getFallbackTargetLang(sourceLangSelect.value);
            
            // 更新UI显示
            updateTargetLanguageTriggerDisplay(currentSelectedTargetLang);
        }
        
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

    // 新增: 翻译API选择更改事件
    if (translationApiSelect) {
        translationApiSelect.addEventListener('change', () => {
            updateApiPanels(translationApiSelect.value);
            saveSettings();
        });
    }

    // 新增: API密钥输入变化事件 (使用防抖)
    if (apiKeyInput) {
        let apiKeyTimeout: number | null = null;
        apiKeyInput.addEventListener('input', () => {
            if (apiKeyTimeout) clearTimeout(apiKeyTimeout);
            apiKeyTimeout = window.setTimeout(() => {
                saveSettings();
                apiKeyTimeout = null;
            }, 500); // 500ms防抖
        });
    }
    
    // 初始化测试API密钥按钮事件
    if (testApiKeyButton) {
        testApiKeyButton.addEventListener('click', async () => {
            // 对于免费API，不需要API密钥，直接测试连接
            const apiType = translationApiSelect?.value || 'google-free';
            
            try {
                testApiKeyButton.textContent = '测试中...';
                testApiKeyButton.disabled = true;
                
                // 测试API连接
                const result = await testApiKey(apiType);
                
                // 显示测试结果
                displayTestResult(result);
            } catch (error) {
                console.error('测试API连接失败:', error);
                displayTestResult({
                    success: false,
                    message: error instanceof Error ? error.message : '未知错误'
                });
            } finally {
                testApiKeyButton.textContent = '测试连接';
                testApiKeyButton.disabled = false;
            }
        });
    }

    // 新增: 服务类型单选按钮变化事件
    if (serviceTypeMembership && serviceTypeApiKey) {
        serviceTypeMembership.addEventListener('change', () => {
            updateAuthPanels();
            saveSettings();
        });
        
        serviceTypeApiKey.addEventListener('change', () => {
            updateAuthPanels();
            saveSettings();
        });
    }
    
    // 新增: 社交登录按钮点击事件
    if (socialLoginButtons) {
        socialLoginButtons.forEach(button => {
            const provider = button.dataset.provider as LoginProvider;
            if (provider) {
                button.addEventListener('click', async () => {
                    await handleSocialLogin(provider);
                });
            }
        });
    }

    // 新增: 自定义API配置变化事件 (使用防抖)
    const customApiInputs = [customApiUrl, customApiMethod, customApiHeaders, customApiBody, customApiResponsePath];
    customApiInputs.forEach(input => {
        if (!input) return;
        
        let timeout: number | null = null;
        input.addEventListener('input', () => {
            if (timeout) clearTimeout(timeout);
            timeout = window.setTimeout(() => {
                saveSettings();
                timeout = null;
            }, 500); // 500ms防抖
        });
    });
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("===== 侧边栏DOMContentLoaded开始 =====");
    // 1. 获取 UI 语言
    uiLangCode = chrome.i18n.getUILanguage();
    console.log(`[Debug] 获取UI语言: ${uiLangCode}`);
    
    // --- 打印所有受支持的语言 ---
    console.log(`[Debug] 支持的目标语言列表:`, targetLanguages.map(l => `${l.code}:${l.name}`).join(', '));
    
    // --- 诊断信息：测试UI语言匹配 ---
    const uiLangMatch = findMatchingTargetLanguage(uiLangCode);
    console.log(`[Debug] UI语言(${uiLangCode})匹配结果:`, uiLangMatch ? `找到匹配 - ${uiLangMatch.code}: ${uiLangMatch.name}` : "没有找到匹配");
    
    // --- 诊断信息：各种中文变体匹配测试 ---
    console.log("===== 各种中文变体匹配测试 =====");
    const chineseVariants = ['zh-CN', 'zh-Hans', 'zh-TW', 'zh-Hant', 'zh'];
    chineseVariants.forEach(code => {
        const match = findMatchingTargetLanguage(code);
        console.log(`测试'${code}'匹配结果:`, match ? `找到匹配 - ${match.code}: ${match.name}` : "没有找到匹配");
    });
    
    // 2. 添加事件监听器 (包括自定义下拉框的)
    console.log("[Debug] 添加事件监听器");
    addEventListeners();
    
    // 3. 先填充目标语言列表 (使用 UI 语言排序)
    // 这一步现在会在 loadSettings 内部被再次调用，以确保基于最终的源语言更新禁用状态
    console.log("[Debug] 初步填充目标语言列表 (将在loadSettings后根据源语言刷新状态)");
    populateTargetLanguages(); 
    
    // 4. 获取当前标签页 ID 并请求源语言轨道 (成功后调用 loadSettings)
    console.log("[Debug] 开始查询当前标签页");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("[Error] 查询标签页失败:", chrome.runtime.lastError);
            if (sourceLangSelect) {
                sourceLangSelect.innerHTML = '<option value="" disabled>Error</option>';
                sourceLangSelect.disabled = true;
            }
            console.log("[Debug] 查询标签页失败，直接调用loadSettings");
            loadSettings(); 
            return;
        }
        if (tabs.length > 0 && tabs[0].id) {
            currentTabId = tabs[0].id;
            console.log(`[Debug] 关联标签页ID ${currentTabId}，开始请求轨道信息`);
            requestAndFillSourceLanguages(currentTabId); // 此函数内部会调用 loadSettings
        } else {
            console.error("[Error] 无法确定活动标签页ID");
            if (sourceLangSelect) {
                sourceLangSelect.innerHTML = '<option value="" disabled>Error</option>';
                sourceLangSelect.disabled = true;
            }
            console.log("[Debug] 无法确定标签页ID，直接调用loadSettings");
            loadSettings(); 
        }
    });
    console.log("===== 侧边栏DOMContentLoaded完成 =====");
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
            // populateTargetLanguages(); // loadSettings 会处理这个
            requestAndFillSourceLanguages(currentTabId); // 这会重新填充源并调用 loadSettings
        }
        return false;
    }
    return false; // 其他消息不处理
});

// TODO:
// 5. (可选) 向 Content Script 或 Background Script 发送消息通知设置更改
// 6. 动态填充语言列表 

/**
 * 将API设置显示到表单中
 * @param settings API设置对象
 */
function displayApiSettings(settings: {
    translationApi: string;
    apiKey: string;
    serviceType: string;
    membershipCredentials: typeof defaultSettings.membershipCredentials;
    customApiConfig: typeof defaultSettings.customApiConfig;
}) {
    // 设置翻译API选择器
    if (translationApiSelect) {
        translationApiSelect.value = settings.translationApi;
        // 根据选择更新面板显示
        updateApiPanels(settings.translationApi);
    }
    
    // 设置API密钥
    if (apiKeyInput) {
        apiKeyInput.value = settings.apiKey;
    }
    
    // 设置服务类型单选按钮
    if (serviceTypeMembership && serviceTypeApiKey) {
        if (settings.serviceType === 'membership') {
            serviceTypeMembership.checked = true;
            serviceTypeApiKey.checked = false;
        } else {
            serviceTypeMembership.checked = false;
            serviceTypeApiKey.checked = true;
        }
        // 更新相关面板
        updateAuthPanels();
    }
    
    // 设置会员登录状态
    if (loginResultSpan && settings.membershipCredentials) {
        // 如果是第三方登录
        if (settings.membershipCredentials.loggedIn && settings.membershipCredentials.provider) {
            loginResultSpan.textContent = `已通过${getProviderDisplayName(settings.membershipCredentials.provider as LoginProvider)}登录`;
            loginResultSpan.className = 'result-text success';
        }
        // 兼容旧数据结构
        else if (settings.membershipCredentials.loggedIn) {
            loginResultSpan.textContent = '已登录';
            loginResultSpan.className = 'result-text success';
        }
    }
    
    // 设置自定义API配置
    if (settings.customApiConfig) {
        if (customApiUrl) customApiUrl.value = settings.customApiConfig.url;
        if (customApiMethod) customApiMethod.value = settings.customApiConfig.method;
        if (customApiHeaders) customApiHeaders.value = settings.customApiConfig.headers;
        if (customApiBody) customApiBody.value = settings.customApiConfig.body;
        if (customApiResponsePath) customApiResponsePath.value = settings.customApiConfig.responsePath;
    }
}

/**
 * 将基本设置显示到表单中
 * @param settings 基本设置对象
 */
function displaySettings(settings: {
    sourceLang: string;
    targetLang: string;
    subtitleMode: string;
}) {
    // 设置源语言选择器
    if (sourceLangSelect) {
        sourceLangSelect.value = settings.sourceLang;
    }
    
    // 设置目标语言显示
    currentSelectedTargetLang = settings.targetLang;
    updateTargetLanguageTriggerDisplay(currentSelectedTargetLang);
    populateTargetLanguages(''); // 更新目标语言列表
    
    // 设置字幕模式
    if (subtitleTypeSwitch) {
        subtitleTypeSwitch.checked = settings.subtitleMode === 'bilingual';
    }
} 