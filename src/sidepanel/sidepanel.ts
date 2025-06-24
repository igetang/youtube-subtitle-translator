/**
 * Side Panel Logic
 */
import { targetLanguages, Language } from '../shared/utils/languages'; // 导入语言列表
import { VideoSettingsLocalStorage, VideoSettings } from '../shared/storage/video-settings-local-storage'; // 导入视频设置本地存储
import { StorageManager, StorageKeys } from '../shared/storage/storage-manager'; // 导入 StorageManager 和 StorageKeys
// 导入新的语言处理工具
import { isLanguageRelevantToUI } from '../shared/utils/language-processing';

// === Imports ===
import { 
  VideoSourceLanguageCacheManager,
  UserPreferencesManager
} from '../shared/storage';

const videoSourceLanguageCacheManager = new VideoSourceLanguageCacheManager();
const userPreferencesManager = UserPreferencesManager.getInstance();

console.log('[sidepanel] Side Panel Script Loaded.');

// --- DOM 元素引用 ---
// 源语言自定义下拉菜单元素
const sourceLangContainer = document.getElementById('source-language-container') as HTMLDivElement;
const sourceLangTrigger = document.getElementById('source-language-trigger') as HTMLDivElement;
const sourceLangSelectedValue = sourceLangTrigger?.querySelector('.selected-value') as HTMLSpanElement;
const sourceLangPanel = document.getElementById('source-language-panel') as HTMLDivElement;
const sourceLangOptions = document.getElementById('source-language-options') as HTMLDivElement;

// --- Target Language Custom Select Elements ---
const targetLangContainer = document.getElementById('target-language-container') as HTMLDivElement;
const targetLangTrigger = document.getElementById('target-language-trigger') as HTMLDivElement;
const targetLangSelectedValue = targetLangTrigger?.querySelector('.selected-value') as HTMLSpanElement;
const targetLangPanel = document.getElementById('target-language-panel') as HTMLDivElement;
const targetLangSearch = document.getElementById('target-language-search') as HTMLInputElement;
const targetLangOptions = document.getElementById('target-language-options') as HTMLDivElement;
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
// 新增: OpenAI相关元素
const openaiBasicPanel = document.getElementById('openai-basic-panel') as HTMLDivElement;
const openaiModelSelect = document.getElementById('openai-model') as HTMLSelectElement;
const openaiCustomModel = document.getElementById('openai-custom-model') as HTMLInputElement;
const openaiTemperature = document.getElementById('openai-temperature') as HTMLInputElement;
const openaiTemperatureValue = document.getElementById('openai-temperature-value') as HTMLSpanElement;
// --- End 新增: 翻译API元素 ---

// OpenAI限流信息面板元素
const openaiRatelimitPanel = document.getElementById('openai-ratelimit-panel') as HTMLDivElement;
const ratelimitLimitRequests = document.getElementById('x-ratelimit-limit-requests') as HTMLSpanElement;
const ratelimitLimitTokens = document.getElementById('x-ratelimit-limit-tokens') as HTMLSpanElement;
const ratelimitRemainingRequests = document.getElementById('x-ratelimit-remaining-requests') as HTMLSpanElement;
const ratelimitRemainingTokens = document.getElementById('x-ratelimit-remaining-tokens') as HTMLSpanElement;
const ratelimitResetRequests = document.getElementById('x-ratelimit-reset-requests') as HTMLSpanElement;
const ratelimitResetTokens = document.getElementById('x-ratelimit-reset-tokens') as HTMLSpanElement;

// 密码显示/隐藏功能元素
const togglePasswordBtn = document.getElementById('toggle-password') as HTMLButtonElement;
const apiKeyPasswordInput = document.getElementById('api-key') as HTMLInputElement;
const eyeOpenIcon = togglePasswordBtn?.querySelector('.eye-open') as SVGElement;
const eyeClosedIcon = togglePasswordBtn?.querySelector('.eye-closed') as SVGElement;

/** 存储当前侧边栏关联的标签页 ID */
let currentTabId: number | null = null;
/** 存储当前侧边栏关联的视频 ID */
let currentVideoId: string | null = null;
/** Memory cache从存储加载的目标语言 */
let loadedTargetLang: string | null = null;
/** 跟踪当前选中的目标语言代码 */
let currentSelectedTargetLang: string | null = null;
/** 跟踪当前选中的源语言轨道类型 - 新增 */
let currentSelectedSourceTrackKind: string | null = null;
/** 跟踪上次保存的源语言轨道类型，用于变化检测 - 新增 */
let previousSavedSourceTrackKind: string | null = null;
/** Memory cache浏览器 UI 语言 - Sidepanel不再自行获取和使用，将由background提供 */
let uiLangCode: string | null = null;
/** Memory cache从内容脚本获取的可用视频轨道信息，用于填充源语言下拉列表 */
let uiTrackData: { languageCode: string, languageName: string, kind: string }[] = [];

/** 标志位，表示侧边栏UI是否正在通过后台数据进行初始化 */
let isInitializingSidePanelUI = false;

/** 事件监听器管理 - 用于临时移除和重新添加监听器 */
interface EventListenerInfo {
    element: HTMLElement;
    event: string;
    handler: EventListener;
    options?: boolean | AddEventListenerOptions;
}

let formEventListeners: EventListenerInfo[] = [];
let listenersAttached = false;

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
                    type: 'testMembershipLogin',
                    data: { 
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
            
            // chrome.storage.sync.set({ 
            //     membershipCredentials: loginState
            // }, () => {
            //     if (chrome.runtime.lastError) {
            //         console.error('[sidepanel] 保存登录状态时出错:', chrome.runtime.lastError);
            //     } else {
            //         console.log('[sidepanel] 登录状态已保存:', loginState);
            //     }
            // });
            try {
              await StorageManager.getInstance().set(StorageKeys.SETTINGS.MEMBERSHIP_CREDENTIALS, loginState, 'local'); // 修改为 local
              console.log('[sidepanel] 登录状态已保存:', loginState);
            } catch (error) {
              console.error('[sidepanel] 保存登录状态时出错:', error);
            }
        } else {
            loginResultSpan.textContent = result.message || '登录失败，请重试';
            loginResultSpan.className = 'result-text error';
        }
    } catch (error) {
        console.error('[sidepanel] 第三方登录出错:', error);
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
    translationApi: 'google-free', // 默认翻译API
    apiKey: '',
    serviceType: 'api-key', // 'api-key' 或 'membership'
    membershipCredentials: { loggedIn: false },
    customApiConfig: {
        url: '',
        method: 'POST',
        headers: '', // JSON string
        body: '', // JSON string template
        responsePath: ''
    },
    openaiConfig: {
        model: 'gpt-4o',
        customModel: '',
        temperature: 0.7
    }
};

// 在文件顶部（全局作用域）添加
let initialSettingsFromBackground: Partial<typeof defaultSettings> | null = null;
let isLoading = true;

/**
 * 查找与给定代码匹配的目标语言 (使用优先级匹配)。
 * @param codeToMatch 要匹配的语言代码。
 * @returns {Language | undefined} 匹配的语言对象或 undefined。
 */
function findMatchingTargetLanguage(codeToMatch: string): Language | undefined {
    if (!codeToMatch) return undefined;

    console.log(`[sidepanel] 尝试匹配语言代码: ${codeToMatch}`);
    let matchedLang: Language | undefined = undefined;
    const normalizedCodeToMatch = codeToMatch.toLowerCase(); // Normalize for comparison

    // Priority 1: Exact Match (case-insensitive)
    matchedLang = targetLanguages.find(lang => lang.code.toLowerCase() === normalizedCodeToMatch);
    if (matchedLang) {
        console.log(`[sidepanel] 精确匹配: ${matchedLang.code}`);
        return matchedLang;
    }

    // Priority 2: Handle Chinese Script/Region Variants explicitly
    const baseLang = normalizedCodeToMatch.split(/[-_]/)[0];
    console.log(`[sidepanel] 基础语言代码: ${baseLang}`);
    
    if (baseLang === 'zh') {
        console.log(`[sidepanel] 处理中文变体. 完整代码: ${normalizedCodeToMatch}`);
        const regionOrScript = normalizedCodeToMatch.split(/[-_]/)[1];
        console.log(`[sidepanel] 区域/脚本代码: ${regionOrScript}`);
        
        // 强化中文匹配: 所有中国大陆区域代码使用简体中文
        // Prefer Hans for CN/SG UI, Hant for TW/HK UI
        if (regionOrScript === 'Hans' || regionOrScript === 'sg' || regionOrScript === 'hans') {
            console.log('[sidepanel] 匹配简体中文 (zh-CN)');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        } else if (regionOrScript === 'tw' || regionOrScript === 'hk' || regionOrScript === 'hant') {
            console.log('[sidepanel] 匹配繁体中文 (zh-Hant)');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hant');
        }
        // If UI is just 'zh', default to Hans
        else if (normalizedCodeToMatch === 'zh') {
            console.log('[sidepanel] 纯zh代码，默认使用简体中文');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans') || targetLanguages.find(lang => lang.code === 'zh-Hant');
        }
        // 添加默认中文处理
        else {
            console.log('[sidepanel] 未知中文变体，默认使用简体中文');
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
        console.log(`[sidepanel] 匹配前缀(特定到通用): ${matchedLang.code}`);
        return matchedLang;
    }

    // Priority 4: Target is General, List has Specific (e.g., target 'en', list has 'en-us')
    // Check if target code is a prefix of list code (followed by a separator)
    matchedLang = targetLanguages.find(lang =>
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '-') || 
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '_')
    );
    
    if (matchedLang) {
        console.log(`[sidepanel] 匹配前缀(通用到特定): ${matchedLang.code}`);
    } else {
        console.log(`[sidepanel] 未找到匹配`);
    }
    
    return matchedLang; // Return whatever was found, or undefined
}

/**
 * 更新自定义下拉触发器显示的文本。
 * @param langCode - 选中的语言代码。
 */
function updateTargetLanguageTriggerDisplay(langCode: string | null) { /* */ }

/**
 * 更新目标语言显示
 * @param langCode 语言代码
 */
function updateTargetLanguageDisplay(langCode: string | null) {
    // 添加保护：如果正在初始化，则只设置显示值，不触发其他操作
    if (isInitializingSidePanelUI) {
        console.log('[sidepanel] updateTargetLanguageDisplay: 初始化模式，只更新显示');
        if (targetLangSelectedValue) {
            if (langCode) {
                const matchedLang = targetLanguages.find(lang => lang.code === langCode);
                if (matchedLang) {
                    const key = 'lang_' + matchedLang.code.replace(/-/g, '_');
                    const localizedName = chrome.i18n.getMessage(key);
                    targetLangSelectedValue.textContent = localizedName || 
                        (uiLangCode && uiLangCode.toLowerCase().startsWith('zh') ? matchedLang.name : matchedLang.englishName);
                    targetLangSelectedValue.setAttribute('data-value', langCode);
                }
            } else {
                targetLangSelectedValue.textContent = '选择语言...';
                targetLangSelectedValue.removeAttribute('data-value');
            }
        }
        return;
    }

    console.log(`[sidepanel] 更新目标语言显示: ${langCode}`);
    if (!targetLangSelectedValue) return;
    if (langCode) {
        const lang = findMatchingTargetLanguage(langCode);
        if (lang) {
            targetLangSelectedValue.textContent = lang.name;
            targetLangSelectedValue.setAttribute('data-value', lang.code);
        }
    } else {
        targetLangSelectedValue.textContent = '选择语言...';
        targetLangSelectedValue.removeAttribute('data-value');
    }
}

/**
 * 填充目标语言选项列表。
 * 实现新的排序逻辑：UI 相关语言优先，其余按名称字母排序。
 * @param searchTerm - 用于过滤语言的搜索词（可选）。
 */
function populateTargetLanguages(searchTerm: string = '') {
    if (!targetLangOptions) return;

    // 添加保护：如果正在初始化，则跳过可能触发事件的操作
    if (isInitializingSidePanelUI) {
        console.log('[sidepanel] populateTargetLanguages: 跳过，正在初始化UI');
        return;
    }

    console.log(`[sidepanel] populateTargetLanguages 调用，当前 uiLangCode: ${uiLangCode}`);

    // 筛选语言（如果提供了搜索词）
    let filteredLanguages = targetLanguages;
    if (searchTerm && searchTerm.trim() !== '') {
        const lowerSearchTerm = searchTerm.toLowerCase().trim();
        console.log(`[sidepanel] 搜索语言，关键词: "${lowerSearchTerm}"`);
        
        filteredLanguages = targetLanguages.filter(lang => {
            // 记录每个语言的匹配情况，便于调试
            const langCode = lang.code.toLowerCase();
            const langName = lang.name.toLowerCase();
            const langEnglishName = lang.englishName.toLowerCase();
            
            // 1. 精确匹配语言代码 (如"es", "en-US")
            if (langCode === lowerSearchTerm) {
                console.log(`[sidepanel] 精确匹配语言代码: ${lang.code} = ${lowerSearchTerm}`);
                return true;
            }
            
            // 2. 语言代码前缀匹配 (如"zh"匹配"zh-Hans")
            if (langCode.startsWith(lowerSearchTerm)) {
                console.log(`[sidepanel] 语言代码前缀匹配: ${lang.code} 以 ${lowerSearchTerm} 开头`);
                return true;
            }
            
            // 3. 语言代码中的国家/地区代码匹配 (如"cn"匹配"zh-CN")
            if (langCode.includes(`-${lowerSearchTerm}`)) {
                console.log(`[sidepanel] 国家/地区代码匹配: ${lang.code} 包含 -${lowerSearchTerm}`);
                    return true;
                }
            
            // 4. 特殊国家/地区代码别名匹配
            const countryCodeMap: Record<string, string[]> = {
                // 东亚语言
                'jp': ['ja', 'jpn'],            // 日本
                'cn': ['zh-hans', 'zh-cn'],     // 中国
                'tw': ['zh-hant', 'zh-tw'],     // 台湾
                'hk': ['zh-hant', 'zh-hk'],     // 香港
                'kr': ['ko'],                    // 韩国

                // 欧洲语言
                'us': ['en', 'en-us'],          // 美国(英语)
                'uk': ['en-gb'],                 // 英国(英语)
                'gb': ['en-gb'],                 // 英国
                'ca': ['en-ca', 'fr-ca'],       // 加拿大
                'au': ['en-au'],                 // 澳大利亚
                'nz': ['en-nz'],                 // 新西兰
                'fr': ['fr'],                    // 法国
                'de': ['de'],                    // 德国
                'es': ['es'],                    // 西班牙
                'it': ['it'],                    // 意大利
                'pt': ['pt'],                    // 葡萄牙
                'br': ['pt-br'],                 // 巴西
                'ru': ['ru'],                    // 俄罗斯
                'nl': ['nl'],                    // 荷兰
                'be': ['nl-be', 'fr-be'],       // 比利时
                'pl': ['pl'],                    // 波兰
                'se': ['sv'],                    // 瑞典
                'dk': ['da'],                    // 丹麦
                'no': ['no'],                    // 挪威
                'fi': ['fi'],                    // 芬兰
                'gr': ['el'],                    // 希腊
                'cz': ['cs'],                    // 捷克
                'hu': ['hu'],                    // 匈牙利
                'ro': ['ro'],                    // 罗马尼亚
                'ch': ['de-ch', 'fr-ch', 'it-ch'], // 瑞士
                'at': ['de-at'],                 // 奥地利
                'ie': ['en-ie'],                 // 爱尔兰
                'ua': ['uk'],                    // 乌克兰

                // 亚洲语言
                'in': ['hi', 'en-in'],          // 印度
                'th': ['th'],                    // 泰国
                'vn': ['vi'],                    // 越南
                'id': ['id'],                    // 印度尼西亚
                'my': ['ms'],                    // 马来西亚
                'ph': ['fil', 'en-ph'],         // 菲律宾
                'sg': ['zh-sg', 'en-sg', 'ms-sg', 'ta-sg'], // 新加坡

                // 中东和非洲语言
                'sa': ['ar-sa'],                 // 沙特阿拉伯
                'ae': ['ar-ae'],                 // 阿联酋
                'eg': ['ar-eg'],                 // 埃及
                'il': ['he'],                    // 以色列
                'za': ['en-za', 'af'],          // 南非
                'ng': ['en-ng'],                 // 尼日利亚

                // 拉丁美洲语言
                'mx': ['es-mx'],                 // 墨西哥
                'ar': ['es-ar'],                 // 阿根廷
                'cl': ['es-cl'],                 // 智利
                'co': ['es-co'],                 // 哥伦比亚
                'pe': ['es-pe'],                 // 秘鲁
                've': ['es-ve']                  // 委内瑞拉
            };
            
            if (countryCodeMap[lowerSearchTerm] && countryCodeMap[lowerSearchTerm].some(code => langCode.startsWith(code) || langCode.includes(`-${code}`))) {
                console.log(`[sidepanel] 国家代码别名匹配: ${lowerSearchTerm} -> ${lang.code}`);
                return true;
            }
            
            // 5. 国际电话区号匹配
            const countryCallingCodeMap: Record<string, string[]> = {
                '1': ['en-us', 'en-ca'],         // 美国、加拿大
                '44': ['en-gb'],                 // 英国
                '61': ['en-au'],                 // 澳大利亚
                '64': ['en-nz'],                 // 新西兰
                '33': ['fr'],                    // 法国
                '49': ['de'],                    // 德国
                '34': ['es'],                    // 西班牙
                '39': ['it'],                    // 意大利
                '351': ['pt'],                   // 葡萄牙
                '55': ['pt-br'],                 // 巴西
                '7': ['ru'],                     // 俄罗斯
                '31': ['nl'],                    // 荷兰
                '48': ['pl'],                    // 波兰
                '46': ['sv'],                    // 瑞典
                '45': ['da'],                    // 丹麦
                '47': ['no'],                    // 挪威
                '358': ['fi'],                   // 芬兰
                '30': ['el'],                    // 希腊
                '420': ['cs'],                   // 捷克
                '36': ['hu'],                    // 匈牙利
                '40': ['ro'],                    // 罗马尼亚
                '380': ['uk'],                   // 乌克兰
                '86': ['zh-hans', 'zh-cn'],     // 中国
                '886': ['zh-hant', 'zh-tw'],    // 台湾
                '852': ['zh-hk'],                // 香港
                '81': ['ja'],                    // 日本
                '82': ['ko'],                    // 韩国
                '91': ['hi', 'en-in'],           // 印度
                '66': ['th'],                    // 泰国
                '84': ['vi'],                    // 越南
                '62': ['id'],                    // 印度尼西亚
                '60': ['ms'],                    // 马来西亚
                '63': ['fil'],                   // 菲律宾
                '65': ['zh-sg', 'en-sg'],        // 新加坡
                '966': ['ar-sa'],                // 沙特阿拉伯
                '971': ['ar-ae'],                // 阿联酋
                '20': ['ar-eg'],                 // 埃及
                '972': ['he'],                   // 以色列
                '27': ['en-za', 'af'],           // 南非
                '234': ['en-ng'],                // 尼日利亚
                '52': ['es-mx'],                 // 墨西哥
                '54': ['es-ar'],                 // 阿根廷
                '56': ['es-cl'],                 // 智利
                '57': ['es-co'],                 // 哥伦比亚
                '51': ['es-pe'],                 // 秘鲁
                '58': ['es-ve']                  // 委内瑞拉
            };
            
            if (countryCallingCodeMap[lowerSearchTerm] && countryCallingCodeMap[lowerSearchTerm].some(code => langCode.startsWith(code) || langCode.includes(`-${code}`))) {
                console.log(`[sidepanel] 国际区号匹配: ${lowerSearchTerm} -> ${lang.code}`);
                return true;
            }
            
            // 6. 按语言名称处理 - 所有语言一律只匹配开头
            if (langName.startsWith(lowerSearchTerm)) {
                console.log(`[sidepanel] 名称前缀匹配: ${lang.name} 以 ${lowerSearchTerm} 开头`);
                return true;
            }
            
            // 7. 英文名称匹配开头
            if (langEnglishName.startsWith(lowerSearchTerm)) {
                console.log(`[sidepanel] 英文名称前缀匹配: ${lang.englishName} 以 ${lowerSearchTerm} 开头`);
                return true;
            }
            
            return false;
        });
        
        console.log(`[sidepanel] 搜索结果: 找到 ${filteredLanguages.length} 个匹配语言`);
        filteredLanguages.forEach(lang => console.log(`[sidepanel] - ${lang.code}: ${lang.name}`));
    }

    // --- 排序逻辑 ---
    filteredLanguages.sort((a, b) => {
        // 如果 uiLangCode 尚未从 background 获取，则不进行相关性排序
        const aIsRelevant = uiLangCode ? isLanguageRelevantToUI(a.code, uiLangCode) : false;
        const bIsRelevant = uiLangCode ? isLanguageRelevantToUI(b.code, uiLangCode) : false;

        if (aIsRelevant && !bIsRelevant) return -1; // a 相关，排前面
        if (!aIsRelevant && bIsRelevant) return 1;  // b 相关，排前面
        
        // 如果相关性相同（或 uiLangCode 不可用），按英文名称排序
        return a.englishName.localeCompare(b.englishName); 
    });

    // 清空当前选项
    targetLangOptions.innerHTML = '';
    
    // 填充选项
    filteredLanguages.forEach(lang => {
        const option = document.createElement('div');
        option.className = 'custom-select-option';
        option.setAttribute('data-value', lang.code);
        // 使用 Chrome i18n 消息适配语言名，若存在消息则使用之，否则根据UI语言回退
        const key = 'lang_' + lang.code.replace(/-/g, '_');
        const localizedName = chrome.i18n.getMessage(key);
        if (localizedName) {
            option.textContent = localizedName;
        } else {
            // 回退：中文界面显示本地化名称，否则显示英文名称
            option.textContent = uiLangCode && uiLangCode.toLowerCase().startsWith('zh') ? lang.name : lang.englishName;
        }
        
        // 如果是当前选中的语言，设为选中状态
        if (currentSelectedTargetLang === lang.code) {
            option.classList.add('selected');
        }
        
        // 应用语言族互斥逻辑：如果与源语言属于同一语言族，设为禁用状态
        const currentSourceLang = sourceLangSelectedValue?.getAttribute('data-value');
        if (currentSourceLang && isSameLanguageFamily(currentSourceLang, lang.code)) {
            option.classList.add('disabled');
            option.setAttribute('data-disabled-reason', 'same-language-family');
            option.title = `无法选择同语言族的语言：${option.textContent} 与源语言冲突`;
            console.log(`[sidepanel] populateTargetLanguages: 目标语言 ${lang.code} 因与源语言 ${currentSourceLang} 冲突而被禁用`);
        }
        
        // 步骤2.6: 将选项添加到DOM
        targetLangOptions.appendChild(option);
    });
    
    // 如果没有匹配的语言
    if (filteredLanguages.length === 0) {
        const option = document.createElement('div');
        option.className = 'custom-select-option disabled';
        option.textContent = "无匹配语言";
        targetLangOptions.appendChild(option);
    }
    
    console.log("[sidepanel] populateTargetLanguages: 目标语言列表已填充并排序。");
}

/**
 * 从local storage中获取当前视频的设置
 * @deprecated 已弃用 - 保留以便向后兼容，应避免直接调用。设置获取应通过 background 进行。
 * @param videoId 视频ID
 * @returns local storage的视频设置或null
 */
async function getVideoSettingsFromCache(videoId: string): Promise<VideoSettings | null> {
  console.warn('[SidePanel] getVideoSettingsFromCache: 已弃用的函数被调用');
  if (!videoId) return null;
  
  // 直接返回null，应该通过 background 的 initializeSidePanel 流程获取设置
  return null;
}

/**
 * 将当前设置保存到视频local storage
 * @deprecated 已弃用 - 保留以便向后兼容，应避免直接调用。设置保存应通过 saveSettings 和 background 进行。
 * @param videoId 视频ID
 * @param hasSubtitles 是否有字幕
 * @param sourceTrackKind 源轨道类型（可选）
 */
async function saveCurrentSettingsToCache(videoId: string, hasSubtitles: boolean, sourceTrackKind?: string): Promise<void> {
  console.warn('[SidePanel] saveCurrentSettingsToCache: 已弃用的函数被调用');
  if (!videoId) return;

  // 简化为只记录日志，实际保存应通过 saveSettings 和 background 进行
  console.log(`[sidepanel] 不再直接保存设置到local storage。请使用 saveSettings() 函数。`);
}

/**
 * 显示local storage的视频设置到界面
 * @param settings 视频设置
 */
function displayCachedVideoSettings(settings: VideoSettings): void {
    console.log('[sidepanel] 显示local storage的视频特定设置:', settings);
    if (settings.sourceLang) {
        updateSourceLanguageDisplay(settings.sourceLang);
        // 同时更新VideoSourceLanguageCache
        if (currentVideoId) {
            setSourceLanguageForVideo(currentVideoId, settings.sourceLang);
        }
    }
    if (settings.targetLang) {
        currentSelectedTargetLang = settings.targetLang;
        updateTargetLanguageDisplay(settings.targetLang);
    }
    // 全局设置 subtitleMode 和 translationApi 不应在这里处理
    // UI更新应该依赖于从 background 接收的合并后的设置，或者全局设置的单独加载
}

/**
 * 禁用翻译功能并显示提示
 * @param message 提示消息
 */
function disableTranslationFeatures(message: string): void {
  // 禁用源语言选择
  if (sourceLangTrigger) {
    sourceLangTrigger.classList.add('disabled');
    sourceLangTrigger.style.pointerEvents = 'none';
    if (sourceLangSelectedValue) {
      sourceLangSelectedValue.textContent = message;
    }
  }
  
  // 禁用目标语言选择
  if (targetLangTrigger) {
    targetLangTrigger.classList.add('disabled');
    targetLangTrigger.style.pointerEvents = 'none';
    if (targetLangSelectedValue) {
      targetLangSelectedValue.textContent = message;
    }
  }
  
  // 禁用字幕类型切换
  if (subtitleTypeSwitch) {
    subtitleTypeSwitch.disabled = true;
  }
  
  // 可以在界面添加一个提示
  console.log(`[sidepanel] 禁用翻译功能: ${message}`);
}

/**
 * 从YouTube URL提取视频ID
 * @param url YouTube视频URL
 * @returns 视频ID或null
 */
function extractVideoIdFromUrl(url: string): string | null {
      return VideoSettingsLocalStorage.extractVideoId(url);
}

/**
 * 为给定的源语言选择一个合适的备选目标语言
 * 功能：使用语言族互斥逻辑，确保备选语言与源语言不冲突
 * 新增功能：基于语言族而非精确匹配进行互斥判断
 * 
 * @param sourceLangCode 源语言代码
 * @returns 备选目标语言代码
 * 
 * @example
 * getFallbackTargetLang("en-US") // 返回: "zh-Hans" (避免所有英语变种)
 * getFallbackTargetLang("zh-Hans") // 返回: "fr" (避免所有中文变种)
 */
function getFallbackTargetLang(sourceLangCode: string): string {
    console.log(`[sidepanel] getFallbackTargetLang: 为源语言 ${sourceLangCode} 选择备选目标语言`);
    
    // 不同语言族的代表语言优先级列表
    // 按照使用频率和翻译质量排序
    const fallbackPriorities = [
        'zh-CN',    // 中文简体 - 全球第二大语言
        'fr',       // 法语 - 国际通用语言
        'ja',       // 日语 - 东亚重要语言
        'de',       // 德语 - 欧洲重要语言
        'es',       // 西班牙语 - 拉美通用语言
        'ru',       // 俄语 - 东欧通用语言
        'ar',       // 阿拉伯语 - 中东通用语言
        'ko',       // 韩语 - 东亚语言
        'pt',       // 葡萄牙语 - 巴西等地使用
        'it',       // 意大利语 - 欧洲语言
        'en'        // 英语 - 作为最后备选（如果源语言不是英语族）
    ];
    
    console.log(`[sidepanel] getFallbackTargetLang: 开始遍历备选语言列表，共 ${fallbackPriorities.length} 个选项`);
    
    // 遍历备选语言列表，找到第一个与源语言不属于同一语言族的语言
    for (let i = 0; i < fallbackPriorities.length; i++) {
        const candidateLang = fallbackPriorities[i];
        
        // 使用语言族互斥逻辑进行判断
        if (!isSameLanguageFamily(sourceLangCode, candidateLang)) {
            console.log(`[sidepanel] getFallbackTargetLang: 找到合适的备选语言 ${candidateLang} (与源语言 ${sourceLangCode} 不冲突)`);
            return candidateLang;
        } else {
            console.log(`[sidepanel] getFallbackTargetLang: 跳过 ${candidateLang} (与源语言 ${sourceLangCode} 属于同一语言族)`);
        }
    }
    
    // 极端情况下的最终备选（理论上不应该到达这里）
    // 如果所有备选都与源语言冲突，返回法语作为安全备选
    console.warn(`[sidepanel] getFallbackTargetLang: 警告 - 所有备选语言都与源语言 ${sourceLangCode} 冲突，使用法语作为最终备选`);
    return 'fr';
}

/**
 * 根据选择的API类型更新界面显示的面板
 * @param apiType 当前选择的API类型
 */
function updateApiPanels(apiType: string) {
    console.log(`[sidepanel] 更新API面板: ${apiType}`);
    
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
        console.log(`[sidepanel] 未找到API信息: ${apiType}`);
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
        updateAuthPanels();
    }
    // 处理OpenAI相关面板
    else if (apiType === 'openai') {
        if (openaiBasicPanel) openaiBasicPanel.style.display = 'block';
        // 确保API密钥面板也显示
        if (apiKeyPanel) apiKeyPanel.style.display = 'block';
    }
}

/**
 * 根据当前选择的服务类型更新会员登录和API密钥面板的显示状态
 */
function updateAuthPanels() {
    const apiType = translationApiSelect?.value || defaultSettings.translationApi;
    
    // 处理API密钥面板
    if (apiKeyPanel) {
        const needsApiKey = apiInfoMap[apiType]?.requiresKey || apiType === 'custom';
        
        if (needsApiKey) {
            apiKeyPanel.classList.add('visible');
            apiKeyPanel.style.display = 'flex';
        } else {
            apiKeyPanel.classList.remove('visible');
            setTimeout(() => {
                const currentApiType = translationApiSelect?.value || defaultSettings.translationApi;
                const shouldHide = !(apiInfoMap[currentApiType]?.requiresKey || currentApiType === 'custom');
                
                if (shouldHide) {
                    apiKeyPanel.style.display = 'none';
                }
            }, 300);
        }
    }
}

/**
 * 加载设置（兼容旧代码，现在只是请求 background 提供设置）
 * 注意：此函数保留以保持向后兼容，但应尽量避免直接调用。
 * 设置加载应该通过 background 的 initializeSidePanel 流程完成。
 */
async function loadSettings() {
    console.log("[sidepanel] loadSettings: 已弃用的直接加载方法被调用");
    
    if (currentTabId === null) {
        console.warn("[sidepanel] loadSettings: 没有当前标签页ID，无法请求设置");
        return;
    }
    
    try {
        // 🔧 移除重复的初始化消息，由新的标准机制统一处理
        // requestSidePanelInitialization('loadSettings'); // 已移除
        
        // background 将通过 sidePanelActuallyOpened 消息返回数据，在新的标准机制中处理
        console.log("[sidepanel] loadSettings: 等待新的标准初始化机制处理数据请求");
    } catch (error) {
        console.error("[sidepanel] loadSettings: 请求设置失败", error);
    }
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
    // 更新源语言 - 直接信任从Background传来的数据，无需验证
    // 🔄 兼容性处理：逐步迁移到VideoSourceLanguageCache
    if ((settings as any).sourceLang !== undefined) {
        const sourceLang = (settings as any).sourceLang;
        updateSourceLanguageDisplay(sourceLang);
        // 同时更新VideoSourceLanguageCache
        if (currentVideoId) {
            setSourceLanguageForVideo(currentVideoId, sourceLang);
        }
        // 源语言改变后，需要重新填充目标语言选项以更新禁用状态和选中状态
        populateTargetLanguages(); 
    } else {
        // 如果没有加载的源语言设置，也要根据当前选中的源语言更新目标语言状态
        populateTargetLanguages(); 
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
async function saveSettings() { 
    // 双重保护 - 检查是否正在初始化
    if (isInitializingSidePanelUI) {
        console.log('[sidepanel] saveSettings: 由于UI正在初始化，跳过保存和通知。');
        return;
    }

    if (isLoading) {
        console.log("[sidepanel] saveSettings: 正在加载初始设置，跳过保存。");
        return;
    }

    // 额外保护 - 如果事件监听器还没有完全添加，也跳过
    if (!listenersAttached) {
        console.log("[sidepanel] saveSettings: 事件监听器尚未完全添加，跳过保存。");
        return;
    }

    console.log("[sidepanel] saveSettings: 开始保存设置...");
    console.log("[sidepanel] saveSettings: 开始收集设置。");

    // 🔄 兼容性处理：优先从UI获取，fallback到VideoSourceLanguageCache
    const uiSourceLang = sourceLangSelectedValue?.getAttribute('data-value') || 
                        (await getSourceLanguageForVideo(currentVideoId || undefined)) || 
                        defaultSettings.sourceLang;
    const uiSourceTrackKind = sourceLangSelectedValue?.getAttribute('data-kind') || 'standard'; // 新增：获取源语言轨道类型
    const uiTargetLang = targetLangSelectedValue?.getAttribute('data-value') || currentSelectedTargetLang || initialSettingsFromBackground?.targetLang || defaultSettings.targetLang;
    const uiSubtitleMode = subtitleTypeSwitch ? (subtitleTypeSwitch.checked ? 'bilingual' : 'targetOnly') : (initialSettingsFromBackground?.subtitleMode || defaultSettings.subtitleMode);
    const uiTranslationApi = translationApiSelect?.value || initialSettingsFromBackground?.translationApi || defaultSettings.translationApi;
    const uiApiKey = apiKeyInput?.value || initialSettingsFromBackground?.apiKey || defaultSettings.apiKey;
    const uiServiceType = serviceTypeMembership?.checked ? 'membership' : 'api-key';
    
    const uiCustomApiConfig = {
        url: customApiUrl?.value || initialSettingsFromBackground?.customApiConfig?.url || defaultSettings.customApiConfig.url,
        method: customApiMethod?.value || initialSettingsFromBackground?.customApiConfig?.method || defaultSettings.customApiConfig.method,
        headers: customApiHeaders?.value || initialSettingsFromBackground?.customApiConfig?.headers || defaultSettings.customApiConfig.headers,
        body: customApiBody?.value || initialSettingsFromBackground?.customApiConfig?.body || defaultSettings.customApiConfig.body,
        responsePath: customApiResponsePath?.value || initialSettingsFromBackground?.customApiConfig?.responsePath || defaultSettings.customApiConfig.responsePath
    };
    const uiOpenaiConfig = {
        model: openaiModelSelect?.value || initialSettingsFromBackground?.openaiConfig?.model || defaultSettings.openaiConfig.model,
        customModel: openaiCustomModel?.value || initialSettingsFromBackground?.openaiConfig?.customModel || defaultSettings.openaiConfig.customModel,
        temperature: openaiTemperature ? parseFloat(openaiTemperature.value) : (initialSettingsFromBackground?.openaiConfig?.temperature ?? defaultSettings.openaiConfig.temperature)
    };

    const settingsToSave = {
        sourceLang: uiSourceLang,
        targetLang: uiTargetLang,
        subtitleMode: uiSubtitleMode,
        translationApi: uiTranslationApi,
        apiKey: uiApiKey,
        serviceType: uiServiceType,
        customApiConfig: uiCustomApiConfig,
        openaiConfig: uiOpenaiConfig
    };

    // 检查是否有实际更改（包括sourceTrackKind检查）
    let hasChanges = false;
    if (!initialSettingsFromBackground) {
        hasChanges = true; // 如果没有初始设置记录，则认为有更改
        console.log("[sidepanel] saveSettings: 没有 initialSettingsFromBackground，强制保存。");
    } else {
        // 首先检查常规设置的变化
        for (const key in settingsToSave) {
            const k = key as keyof typeof settingsToSave;
            if (typeof settingsToSave[k] === 'object' && settingsToSave[k] !== null) {
                // 比较对象内部
                const initialObj = initialSettingsFromBackground[k] as any;
                const currentObj = settingsToSave[k] as any;
                if (JSON.stringify(initialObj) !== JSON.stringify(currentObj)) {
                    console.log(`[sidepanel] saveSettings: 检测到对象更改 - ${k}: 从`, initialObj, '到', currentObj);
                    hasChanges = true;
                    break;
                }
            } else if (settingsToSave[k] !== initialSettingsFromBackground[k]) {
                console.log(`[sidepanel] saveSettings: 检测到更改 - ${k}: 从 '${initialSettingsFromBackground[k]}' 到 '${settingsToSave[k]}'`);
                hasChanges = true;
                break;
            }
        }
        
        // 新增：检查源语言轨道类型的变化
        if (!hasChanges) {
            // 如果常规设置没有变化，检查轨道类型是否有变化
            if (uiSourceTrackKind !== previousSavedSourceTrackKind) {
                console.log(`[sidepanel] saveSettings: 检测到源语言轨道类型变化: 从 '${previousSavedSourceTrackKind}' 到 '${uiSourceTrackKind}'`);
                hasChanges = true;
            }
        }
    }

    if (!hasChanges) {
        console.log("[sidepanel] saveSettings: 未检测到实际设置更改，跳过发送消息。");
        return;
    }

    console.log("[sidepanel] saveSettings: 检测到更改，准备发送消息。新的设置:", settingsToSave);

    try {
        const updateMessage = {
            action: 'updateSettings',
            settings: settingsToSave
        } as any; // 类型断言以允许添加额外属性

        if (currentVideoId && currentTabId !== null) {
            const sourceTrackKind = sourceLangSelectedValue?.getAttribute('data-kind') || undefined;
            updateMessage.videoId = currentVideoId;
            updateMessage.tabId = currentTabId;
            updateMessage.sourceTrackKind = sourceTrackKind;
        }

        console.log("[sidepanel] 向background发送设置更新请求:", updateMessage);
        
        const response = await new Promise<{success: boolean, message?: string}>((resolve, reject) => {
            chrome.runtime.sendMessage(updateMessage, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result || {success: false, message: "无响应"});
                }
            });
        });

        if (response.success) {
            console.log("[sidepanel] 设置已成功保存:", response.message);
            // 更新 initialSettingsFromBackground 为最新保存的设置
            initialSettingsFromBackground = { ...settingsToSave }; 
            // 更新之前的轨道类型记录 - 新增
            previousSavedSourceTrackKind = uiSourceTrackKind;
        } else {
            console.error("[sidepanel] 设置保存失败:", response.message);
        }

    } catch (error) {
        console.error('[sidepanel] 保存设置过程中出错:', error);
    }
}

/**
 * 请求并填充源语言下拉列表。
 * 注意：此函数保留以保持向后兼容，但实际的数据加载已移至 background initializeSidePanel 流程。
 * @param tabId 要请求的标签页 ID。
 */
async function requestAndFillSourceLanguages(tabId: number): Promise<void> {
  if (!sourceLangTrigger || !sourceLangOptions) {
    console.error("[SidePanel] Source language select element not found.");
    return;
  }
  
  console.log(`[sidepanel] 正在等待字幕轨道数据，标签页ID: ${tabId}`);
  // 显示加载状态
  if (sourceLangSelectedValue) {
    sourceLangSelectedValue.textContent = '加载中...';
  }
  if (sourceLangTrigger) {
    sourceLangTrigger.classList.add('disabled');
    sourceLangTrigger.style.pointerEvents = 'none';
  }
  
  try {
    // 简化为直接通知 background 需要初始化数据
    console.log('[sidepanel] 请求 background 初始化数据');
    
    // 获取当前视频ID (用于通知 background)
    let videoId = null;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url) {
        videoId = extractVideoIdFromUrl(tab.url);
        currentVideoId = videoId; // 更新全局变量
      }
    } catch (error) {
      console.error(`[SidePanel] 获取视频ID失败:`, error);
    }
    
    // 🔧 移除重复的初始化消息，由新的标准机制统一处理
    // 注意：这里不需要再发送消息，新的标准机制已经处理了初始化
    if (tabId && videoId) {
      // 仅设置全局变量
      if (!currentTabId) currentTabId = tabId;
      if (!currentVideoId) currentVideoId = videoId;
      // requestSidePanelInitialization('requestAndFillSourceLanguages'); // 已移除
    }
    
    // background 将通过 sidePanelActuallyOpened 消息返回数据，在新的标准机制中处理
  } catch (error) {
    console.error(`[SidePanel] 请求初始化数据失败:`, error);
    handleEmptyOrErrorResponse('初始化失败');
  }
}

/**
 * 测试API连接
 * @param forceTest 是否强制进行测试，即使是免费API
 * @param model 仅当选择OpenAI模型时使用，特定模型名称
 */
function testApiKey(forceTest: boolean = false, model?: string) {
    if (!testResultSpan) return;
    
    // 重置测试结果
    testResultSpan.textContent = '';
    testResultSpan.className = 'test-result';
    
    // 获取当前API类型和密钥
    const apiType = translationApiSelect?.value || defaultSettings.translationApi;
    const apiKey = apiKeyInput?.value || '';
    
    // 免费API不需要密钥，除非强制测试
    if (!apiInfoMap[apiType]?.requiresKey && !forceTest) {
        testResultSpan.textContent = '正在测试免费API连接...';
        testResultSpan.className = 'test-result in-progress';
        
        // 测试API连接
        chrome.runtime.sendMessage({
            action: 'testFreeTranslation', 
            apiType: apiType
        }, (response) => {
            if (response.success) {
                testResultSpan.textContent = '连接测试成功！';
                testResultSpan.className = 'test-result success';
            } else {
                testResultSpan.textContent = `测试失败: ${response.message}`;
                testResultSpan.className = 'test-result error';
            }
        });
        return;
    }
    
    // 特殊处理OpenAI模型选择
    if (apiType === 'openai' && model) {
        if (apiKey.trim() === '') {
            testResultSpan.textContent = '请输入API密钥';
            testResultSpan.className = 'test-result error';
            return;
        }
        
        // 显示测试中
        testResultSpan.textContent = '正在测试OpenAI模型连接...';
        testResultSpan.className = 'test-result in-progress';
        
        // 发送测试请求到后台脚本，包含模型信息
        chrome.runtime.sendMessage({
            action: 'testOpenAIModel',
            apiKey: apiKey,
            model: model
        }, (response) => {
            if (response.success) {
                testResultSpan.textContent = '连接测试成功！';
                testResultSpan.className = 'test-result success';
                
                // 更新界面显示的限制信息
                if (response.limits) {
                    // 更新限流信息面板
                    updateOpenAIRateLimitInfo(response.limits);
                }
            } else {
                // 自定义处理组织未验证错误
                if (response.message.includes('must be verified')) {
                    testResultSpan.textContent = '测试失败: 组织未验证，请前往 https://platform.openai.com/settings/organization/general 验证组织，验证后可能需15分钟生效';
                } else {
                    testResultSpan.textContent = `测试失败: ${response.message}`;
                }
                testResultSpan.className = 'test-result error';
            }
        });
        return;
    }
    
    // 需要API密钥的服务
    if (apiKey.trim() === '') {
        testResultSpan.textContent = '请输入API密钥';
        testResultSpan.className = 'test-result error';
        return;
    }
    
    // 显示测试中
    testResultSpan.textContent = '正在测试API连接...';
    testResultSpan.className = 'test-result in-progress';
    
    // 发送测试请求到后台脚本
    chrome.runtime.sendMessage({
        action: 'testApiKey',
        apiType: apiType,
        apiKey: apiKey
    }, (response) => {
        if (response.success) {
            testResultSpan.textContent = '连接测试成功！';
            testResultSpan.className = 'test-result success';
        } else {
            testResultSpan.textContent = `测试失败: ${response.message}`;
            testResultSpan.className = 'test-result error';
        }
    });
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
    // 清空之前的监听器记录
    formEventListeners = [];
    
    // 源语言选择
    if (sourceLangTrigger && sourceLangOptions) {
        sourceLangTrigger.addEventListener('click', () => {
            sourceLangContainer?.classList.toggle('open');
            if (sourceLangContainer?.classList.contains('open')) {
                sourceLangPanel.style.display = 'block';
                populateSourceLanguages();
            } else {
                sourceLangPanel.style.display = 'none';
            }
        });
        
        // 点击选项时选择语言
        sourceLangOptions.addEventListener('click', (e) => {
            const option = (e.target as HTMLElement).closest('.custom-select-option') as HTMLElement;
            if (!option || option.classList.contains('disabled')) return;
            
            const value = option.getAttribute('data-value');
            const kind = option.getAttribute('data-kind');
            if (value) {
                // 更新源语言显示，同时传递轨道类型信息
                updateSourceLanguageDisplay(value, kind || 'standard');
                
                // 关闭下拉菜单
                sourceLangContainer?.classList.remove('open');
                sourceLangPanel.style.display = 'none';
                
                // 源语言改变后，需要重新填充目标语言列表以更新禁用状态
                populateTargetLanguages();
                
                // 保存设置
                saveSettings();
            }
        });
        
        // 点击外部区域关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (sourceLangContainer?.classList.contains('open')) {
                const isClickInside = sourceLangContainer.contains(e.target as Node);
                if (!isClickInside) {
                    sourceLangContainer.classList.remove('open');
                    sourceLangPanel.style.display = 'none';
                }
            }
        });
    }

    // 目标语言选择
    if (targetLangTrigger && targetLangOptions) {
        targetLangTrigger.addEventListener('click', () => {
            targetLangContainer?.classList.toggle('open');
            if (targetLangContainer?.classList.contains('open')) {
                targetLangPanel.style.display = 'block';
                populateTargetLanguages('');
            } else {
                targetLangPanel.style.display = 'none';
            }
        });
        
        // 点击选项时选择语言
        targetLangOptions.addEventListener('click', (e) => {
            const option = (e.target as HTMLElement).closest('.custom-select-option') as HTMLElement;
            if (!option || option.classList.contains('disabled')) return;
            
            const value = option.getAttribute('data-value');
            if (value) {
                // 更新选中的值
                currentSelectedTargetLang = value;
                updateTargetLanguageDisplay(value);
                
                // 关闭下拉菜单
                targetLangContainer?.classList.remove('open');
                targetLangPanel.style.display = 'none';
                
                // 保存设置
                saveSettings();
            }
        });
        
        // 点击外部区域关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (targetLangContainer?.classList.contains('open')) {
                const isClickInside = targetLangContainer.contains(e.target as Node);
                if (!isClickInside) {
                    targetLangContainer.classList.remove('open');
                    targetLangPanel.style.display = 'none';
                }
            }
        });
    }
    
    // 字幕类型切换 - 使用管理的监听器
    if (subtitleTypeSwitch) {
        addManagedEventListener(subtitleTypeSwitch, 'change', saveSettings);
    }

    // 监听API选择变化 - 使用管理的监听器
    if (translationApiSelect) {
        addManagedEventListener(translationApiSelect, 'change', () => {
            const apiType = translationApiSelect.value;
            console.log(`[sidepanel] API类型更改为: ${apiType}`);
            updateApiPanels(apiType);
            // 通过调用saveSettings保存变化
            saveSettings();
        });
    }
    
    // 监听所有输入字段变化，自动保存 - 使用管理的监听器
    if (apiKeyInput) {
        addManagedEventListener(apiKeyInput, 'change', saveSettings);
    }
    
    // 添加密码显示/隐藏按钮事件
    if (togglePasswordBtn && apiKeyPasswordInput) {
        togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    }
    
    // 测试API连接按钮
    if (testApiKeyButton) {
        testApiKeyButton.addEventListener('click', () => testApiKey());
    }
    
    // 监听OpenAI模型选择变化 - 使用管理的监听器
    if (openaiModelSelect) {
        addManagedEventListener(openaiModelSelect, 'change', () => {
            // 检查是否选择了"自定义"选项
            if (openaiModelSelect.value === 'custom' && openaiCustomModel) {
                openaiCustomModel.style.display = 'block';
            } else if (openaiCustomModel) {
                openaiCustomModel.style.display = 'none';
                
                // 当选择非自定义模型且有API密钥时，自动测试该模型的API
                const apiKey = apiKeyInput?.value || '';
                if (apiKey.trim() !== '') {
                    // 自动测试所选模型
                    testApiKey(true, openaiModelSelect.value);
                }
            }
            saveSettings();
        });
    }
    
    // 监听自定义模型输入变化 - 使用管理的监听器
    if (openaiCustomModel) {
        addManagedEventListener(openaiCustomModel, 'change', saveSettings);
    }
    
    // 监听Temperature控件变化 - 使用管理的监听器
    if (openaiTemperature && openaiTemperatureValue) {
        openaiTemperature.addEventListener('input', () => {
            // 更新显示的值
            openaiTemperatureValue.textContent = openaiTemperature.value;
        });
        
        addManagedEventListener(openaiTemperature, 'change', saveSettings);
    }
    
    // 标记监听器已添加
    listenersAttached = true;
    console.log('[sidepanel] 事件监听器添加完成，共管理', formEventListeners.length, '个表单事件监听器');
}

/**
 * 切换API密钥输入框的密码显示/隐藏状态
 */
function togglePasswordVisibility() {
    if (!apiKeyPasswordInput || !eyeOpenIcon || !eyeClosedIcon) return;
    
    if (apiKeyPasswordInput.type === 'password') {
        // 显示密码
        apiKeyPasswordInput.type = 'text';
        eyeOpenIcon.style.display = 'none';
        eyeClosedIcon.style.display = 'block';
    } else {
        // 隐藏密码
        apiKeyPasswordInput.type = 'password';
        eyeOpenIcon.style.display = 'block';
        eyeClosedIcon.style.display = 'none';
    }
}

/**
 * 强制显示API密钥输入框
 * 确保API密钥面板在所有情况下都可见
 */
function ensureApiKeyPanelVisible() {
    if (apiKeyPanel) {
        console.log('[sidepanel] 强制显示API密钥输入框');
        apiKeyPanel.style.display = 'flex';
        apiKeyPanel.classList.add('visible'); // 添加visible类以确保面板真正可见
    }
}

// 🔧 旧的DOMContentLoaded监听器已移除
// 统一使用新的标准机制（在文件末尾）

// 🔧 旧的消息处理器已移除，统一使用新的标准DOMContentLoaded机制
// --- 监听来自背景脚本的导航通知 --- 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 🔧 已移除过时的initializeSidePanelUI消息处理器
    // 现在统一使用新的标准DOMContentLoaded机制进行初始化
    
    if ((message.type || message.action) === 'youtubeNavigationOccurred' && message.navigatedTabId) {
        console.log(`[sidepanel] Received navigation notification for Tab ${message.navigatedTabId}. Current: ${currentTabId}.`);
        if (currentTabId !== null && currentTabId !== undefined && message.navigatedTabId === currentTabId) {
            console.log(`[sidepanel] Navigation matches. Notifying background to re-initialize... Tab ID: ${currentTabId}`);
            
            // 清理旧的UI状态，准备接收新数据
            // 🔧 优化：移除重复的UI语言调用，等待新的Background数据
            // uiLangCode = chrome.i18n.getUILanguage(); // ❌ 已移除：统一由UserPreferencesManager处理
            if (sourceLangTrigger) {
                if (sourceLangSelectedValue) {
                    sourceLangSelectedValue.textContent = '加载中...';
                }
                sourceLangTrigger.classList.add('disabled');
                sourceLangTrigger.style.pointerEvents = 'none';
            }
            if (targetLangSelectedValue) { // 重置目标语言显示
                targetLangSelectedValue.textContent = '选择语言...';
                targetLangSelectedValue.removeAttribute('data-value');
            }
            currentSelectedTargetLang = null; // 重置跟踪的选中语言
            currentVideoId = null; // 重置当前视频ID，等待新值
            
            // 通知 background 重新发送初始化数据
            // 当发生导航时，也需要发送 videoId
            const currentTabUrl = sender.tab?.url; // 尝试从 sender 获取最新的 URL
            let navigatedVideoId: string | null = null;
            if (currentTabUrl) {
                navigatedVideoId = extractVideoIdFromUrl(currentTabUrl);
            }
            console.log(`[sidepanel] YouTube navigation detected. Current URL: ${currentTabUrl}, Video ID: ${navigatedVideoId}`);

            // 🔧 移除重复的初始化消息，YouTube导航由新的标准机制自动处理
            // resetInitializationFlag(); // 已移除，标记机制已废弃
            if (!currentVideoId) currentVideoId = navigatedVideoId;
            // requestSidePanelInitialization('youtubeNavigationOccurred'); // 已移除
        }
        return false; // 表示同步处理完成
    }
    return false; // 对其他消息不处理
});

// TODO:
// 5. (可选) 向 Content Script 或 Background Script 发送消息通知设置更改
// 6. 动态填充语言列表 

/**
 * 显示API设置到UI
 */
function displayApiSettings(settings: {
    translationApi: string;
    apiKey: string;
    serviceType: string;
    membershipCredentials: typeof defaultSettings.membershipCredentials;
    customApiConfig: typeof defaultSettings.customApiConfig;
    openaiConfig: typeof defaultSettings.openaiConfig;
}) {
    console.log('[sidepanel] displayApiSettings: 开始设置API相关UI，使用静默模式');
    
    // 设置翻译API下拉框 - 使用静默模式
    if (translationApiSelect) {
        setValueSilently(translationApiSelect, settings.translationApi);
    }
    
    // 更新API面板（这个不会触发事件）
    updateApiPanels(settings.translationApi);
    
    // 设置API密钥 - 使用静默模式
    if (apiKeyInput) {
        setValueSilently(apiKeyInput, settings.apiKey);
    }
    
    // 设置服务类型单选框 - 使用静默模式
    if (serviceTypeMembership && serviceTypeApiKey) {
        if (settings.serviceType === 'membership') {
            setCheckedSilently(serviceTypeMembership, true);
            setCheckedSilently(serviceTypeApiKey, false);
        } else {
            setCheckedSilently(serviceTypeMembership, false);
            setCheckedSilently(serviceTypeApiKey, true);
        }
    }
    
    // 设置自定义API配置 - 使用静默模式
    if (customApiUrl) setValueSilently(customApiUrl, settings.customApiConfig.url);
    if (customApiMethod) setValueSilently(customApiMethod, settings.customApiConfig.method);
    if (customApiHeaders) setValueSilently(customApiHeaders, settings.customApiConfig.headers);
    if (customApiBody) setValueSilently(customApiBody, settings.customApiConfig.body);
    if (customApiResponsePath) setValueSilently(customApiResponsePath, settings.customApiConfig.responsePath);
    
    // 设置OpenAI配置 - 使用静默模式
    if (openaiModelSelect) {
        setValueSilently(openaiModelSelect, settings.openaiConfig.model);
        // 如果是自定义模型，显示输入框
        if (settings.openaiConfig.model === 'custom' && openaiCustomModel) {
            openaiCustomModel.style.display = 'block';
            setValueSilently(openaiCustomModel, settings.openaiConfig.customModel);
        } else if (openaiCustomModel) {
            openaiCustomModel.style.display = 'none';
        }
    }
    
    if (openaiTemperature) {
        setValueSilently(openaiTemperature, settings.openaiConfig.temperature.toString());
        if (openaiTemperatureValue) {
            openaiTemperatureValue.textContent = settings.openaiConfig.temperature.toString();
        }
    }
    
    console.log('[sidepanel] displayApiSettings: API设置UI更新完成');
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
    console.log('[sidepanel] displaySettings: 开始设置基本UI，使用静默模式');
    
    // 设置源语言选择器
    updateSourceLanguageDisplay(settings.sourceLang);
    
    // 设置目标语言显示
    currentSelectedTargetLang = settings.targetLang;
    updateTargetLanguageDisplay(currentSelectedTargetLang);
    // 注意：不在这里调用 populateTargetLanguages，将在初始化完成后调用
    
    // 设置字幕模式 - 使用静默模式
    if (subtitleTypeSwitch) {
        setCheckedSilently(subtitleTypeSwitch, settings.subtitleMode === 'bilingual');
    }
    
    console.log('[sidepanel] displaySettings: 基本设置UI更新完成');
}

/**
 * 更新OpenAI限流信息面板可见性
 */
function updateOpenAIRateLimitPanelVisibility() {
    if (!openaiRatelimitPanel) return;
    
    // 确保限流信息面板始终显示
    openaiRatelimitPanel.style.display = 'block';
}

/**
 * 更新OpenAI API限流信息显示
 * @param limits API限流信息
 */
function updateOpenAIRateLimitInfo(limits: {
    maxTokens?: number;
    maxRequests?: number;
    remainingTokens?: number;
    remainingRequests?: number;
    resetTokens?: string;
    resetRequests?: string;
}) {
    if (!openaiRatelimitPanel) return;
    
    // 仅显示每分钟请求限制 (RPM) 和每分钟令牌限制 (TPM)
    if (ratelimitLimitRequests && limits.maxRequests !== undefined) {
        ratelimitLimitRequests.textContent = `${limits.maxRequests} RPM`;
    }
    if (ratelimitLimitTokens && limits.maxTokens !== undefined) {
        ratelimitLimitTokens.textContent = `${limits.maxTokens} TPM`;
    }
    
    // 显示限流信息面板
    openaiRatelimitPanel.style.display = 'block';
}

/**
 * 格式化日期时间为更友好的显示
 * @param date 日期对象
 * @returns 格式化后的字符串
 */
function formatDateTime(date: Date): string {
    // 如果时间在一小时内，显示相对时间
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    
    if (diffMinutes < 60) {
        return `${diffMinutes} 分钟后`;
    }
    
    // 否则显示具体时间
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 从后台服务工作器获取local storage的轨道数据
 * @deprecated 已弃用 - 保留以便向后兼容，应避免直接调用。轨道数据应通过 background 的 initializeSidePanelUI 消息获取。
 * @returns Promise<轨道数据数组 | null>
 */
async function getTracksFromBackground(): Promise<{ languageCode: string, languageName: string, kind: string }[] | null> {
  console.warn('[SidePanel] getTracksFromBackground: 已弃用的函数被调用');
  
  // 🔧 移除重复的初始化消息，由新的标准机制统一处理
  // requestSidePanelInitialization('getTracksFromBackground'); // 已移除
  
  // 直接返回null，数据将通过 sidePanelActuallyOpened 消息异步获取
  return null;
}

/**
 * 从标签页获取视频ID
 * @deprecated 已弃用 - 保留以便向后兼容，应避免直接调用。视频ID应在处理标签页时一次性提取并保存到全局变量。
 * @param tabId 标签页ID
 * @returns Promise<视频ID | null>
 */
async function getVideoIdFromTab(tabId: number): Promise<string | null> {
  console.warn('[SidePanel] getVideoIdFromTab: 已弃用的函数被调用');
  
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url) {
      const videoId = extractVideoIdFromUrl(tab.url);
      if (videoId) {
        currentVideoId = videoId; // 更新全局变量
      }
      return videoId;
    }
  } catch (error) {
    console.error('[SidePanel] 获取视频ID出错:', error);
  }
  return null;
}

/**
 * 辅助函数：处理获取到的轨道信息并更新UI
 */
function processTracksAndUpdateUI(availableTracks: { languageCode: string, languageName: string, kind: string }[], determinedSourceLangFromBg: string | null) {
    let initialSourceLangToSave: string | null = null;
    
    if (availableTracks.length === 0) {
        handleEmptyOrErrorResponse('No subtitles available');
        return;
    }
    
    console.log('[sidepanel] 处理获取到的轨道信息，共', availableTracks.length, '条');
    
    // Memory cache轨道信息供未来使用
    uiTrackData = [...availableTracks];
    console.log(`[sidepanel] 轨道信息已保存到sidepanel memory cache: ${uiTrackData.length}条记录`);
    
    // 填充源语言选项 (这必须在设置选中项之前完成)
    populateSourceLanguages();
        
    // 使用 background 传递过来的 determinedSourceLangFromBg (如果有效)
    // 否则，作为备选，使用列表中的第一个轨道 (如果列表不为空)
    let langToSet = determinedSourceLangFromBg;
    if (!langToSet && uiTrackData.length > 0) {
        langToSet = uiTrackData[0].languageCode;
        console.log(`[sidepanel] Background 未提供有效源语言，自动选择列表第一个: ${langToSet}`);
    }
    
    if (langToSet) {
        updateSourceLanguageDisplay(langToSet);
        console.log(`[sidepanel] 设置源语言 (来自Background或备选): ${langToSet}`);
    } else {
        // 如果 langToSet 还是 null/undefined (理论上不应发生，因为有备选逻辑)，则显示提示
        updateSourceLanguageDisplay(null); 
        console.warn('[SidePanel] 未能确定要设置的源语言。');
    }
    
    // 确保选择器已启用
    if (sourceLangTrigger) {
        sourceLangTrigger.classList.remove('disabled');
        sourceLangTrigger.style.pointerEvents = 'auto';
    }
    if (targetLangTrigger) { // 目标语言选择器也应在源语言可用后启用
        targetLangTrigger.classList.remove('disabled');
        targetLangTrigger.style.pointerEvents = 'auto';
    }
    
    // 保存初始源语言（仅用于日志记录）
    const currentSourceLang = sourceLangSelectedValue?.getAttribute('data-value');
    if (currentSourceLang) {
        initialSourceLangToSave = currentSourceLang;
        console.log(`[sidepanel] 初始源语言: ${initialSourceLangToSave}.`);
    }
}

/**
 * 辅助函数：处理空响应或错误情况
 */
function handleEmptyOrErrorResponse(message: string) {
    // 禁用源语言选择器
    if (sourceLangTrigger) {
        sourceLangTrigger.classList.add('disabled');
        sourceLangTrigger.style.pointerEvents = 'none';
        if (sourceLangSelectedValue) {
            sourceLangSelectedValue.textContent = message;
        }
    }
    
    // 禁用目标语言选择器
    if (targetLangTrigger) {
        targetLangTrigger.classList.add('disabled');
        targetLangTrigger.style.pointerEvents = 'none';
        if (targetLangSelectedValue) {
            targetLangSelectedValue.textContent = message;
        }
    }
    
    console.log(`[sidepanel] ${message}.`);
}

/**
 * 更新源语言显示
 * 功能：更新源语言选择器的显示文本和数据属性
 * 新增功能：为ASR轨道添加"（自动生成）"标识
 * 
 * @param langCode 语言代码
 * @param trackKind 轨道类型（可选），如果提供则直接使用，否则查找轨道数据
 */
function updateSourceLanguageDisplay(langCode: string | null, trackKind?: string) {
    console.log(`[sidepanel] updateSourceLanguageDisplay: 更新源语言显示为 ${langCode}, kind: ${trackKind}`);
    
    // 安全检查：确保DOM元素存在
    if (!sourceLangSelectedValue) {
        console.warn('[sidepanel] updateSourceLanguageDisplay: sourceLangSelectedValue元素不存在');
        return;
    }
    
    if (langCode) {
        // 步骤1: 查找或使用提供的轨道信息
        let trackInfo: { languageCode: string, languageName: string, kind: string } | undefined;
        
        if (trackKind) {
            // 如果提供了kind参数，优先查找匹配的轨道
            trackInfo = uiTrackData.find(track => 
                track.languageCode === langCode && 
                (track.kind || 'standard') === trackKind
            );
        }
        
        // 如果没有找到匹配的轨道，使用第一个匹配语言代码的轨道作为备选
        if (!trackInfo) {
            trackInfo = uiTrackData.find(track => track.languageCode === langCode);
        }
        
        console.log(`[sidepanel] updateSourceLanguageDisplay: 查找轨道 ${langCode}，结果:`, trackInfo);
        
        if (trackInfo) {
            // 步骤2: 使用新的工具函数生成显示名称（包含ASR标识）
            const displayName = generateLanguageDisplayName(trackInfo);
            
            // 步骤3: 更新UI显示
            sourceLangSelectedValue.textContent = displayName;
            sourceLangSelectedValue.setAttribute('data-value', trackInfo.languageCode);
            sourceLangSelectedValue.setAttribute('data-kind', trackInfo.kind || 'standard');
            
            // 步骤4: 更新全局轨道类型变量 - 新增
            currentSelectedSourceTrackKind = trackInfo.kind || 'standard';
            
            console.log(`[sidepanel] updateSourceLanguageDisplay: 源语言显示已更新为 "${displayName}" (${trackInfo.kind})`);
        } else {
            // 步骤4: 如果找不到轨道信息，使用基础显示（向后兼容）
            console.warn(`[sidepanel] updateSourceLanguageDisplay: 未找到轨道信息 ${langCode}，使用基础显示`);
            sourceLangSelectedValue.textContent = langCode;
            sourceLangSelectedValue.setAttribute('data-value', langCode);
            sourceLangSelectedValue.setAttribute('data-kind', trackKind || 'standard');
            
            // 更新全局轨道类型变量 - 新增
            currentSelectedSourceTrackKind = trackKind || 'standard';
        }
    } else {
        // 步骤5: 重置为默认状态
        sourceLangSelectedValue.textContent = '选择语言...';
        sourceLangSelectedValue.removeAttribute('data-value');
        sourceLangSelectedValue.removeAttribute('data-kind');
        
        // 重置全局轨道类型变量 - 新增
        currentSelectedSourceTrackKind = null;
        
        console.log('[sidepanel] updateSourceLanguageDisplay: 源语言显示已重置');
    }
}

/**
 * 填充源语言选项列表
 * 功能：根据可用轨道数据生成源语言下拉菜单选项
 * 特性：
 * 1. 为ASR轨道添加"（自动生成）"标识
 * 2. 允许用户选择任何可用轨道，包括同语言族的不同变种
 * 注意：源语言选择不应用互斥逻辑，用户可以在不同轨道间自由切换
 */
function populateSourceLanguages() {
    // 安全检查：确保DOM元素存在
    if (!sourceLangOptions) {
        console.warn('[sidepanel] populateSourceLanguages: sourceLangOptions元素不存在');
        return;
    }
    
    // 清空现有选项
    sourceLangOptions.innerHTML = '';
    
    // 遍历所有可用轨道，为每个轨道创建选项
    uiTrackData.forEach((trackInfo) => {
        // 创建选项DOM元素
        const option = document.createElement('div');
        option.className = 'custom-select-option';
        
        // 设置选项的数据属性
        option.setAttribute('data-value', trackInfo.languageCode);
        option.setAttribute('data-kind', trackInfo.kind || 'standard');
        
        // 生成显示文本（关键功能：为ASR轨道添加标识）
        const displayName = generateLanguageDisplayName(trackInfo);
        option.textContent = displayName;
        
        // 标记当前选中的源语言（需要同时匹配语言代码和轨道类型）
        const currentSourceLang = sourceLangSelectedValue?.getAttribute('data-value');
        const currentSourceKind = sourceLangSelectedValue?.getAttribute('data-kind') || 'standard';
        
        if (currentSourceLang === trackInfo.languageCode && 
            currentSourceKind === (trackInfo.kind || 'standard')) {
            option.classList.add('selected');
        }
        
        // 将选项添加到DOM
        sourceLangOptions.appendChild(option);
    });
    
    console.log(`[sidepanel] populateSourceLanguages: 已填充 ${uiTrackData.length} 个源语言选项`);
}

// --- 事件监听器管理辅助函数 ---

/**
 * 添加事件监听器并记录到管理列表中
 */
function addManagedEventListener(
    element: HTMLElement, 
    event: string, 
    handler: EventListener, 
    options?: boolean | AddEventListenerOptions
): void {
    if (!element) return;
    
    element.addEventListener(event, handler, options);
    formEventListeners.push({ element, event, handler, options });
}

/**
 * 临时移除所有表单事件监听器
 */
function temporarilyRemoveFormListeners(): void {
    console.log('[sidepanel] 临时移除表单事件监听器');
    formEventListeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
    });
}

/**
 * 重新添加所有表单事件监听器
 */
function reattachFormListeners(): void {
    console.log('[sidepanel] 重新添加表单事件监听器');
    formEventListeners.forEach(({ element, event, handler, options }) => {
        element.addEventListener(event, handler, options);
    });
}

/**
 * 静默设置表单元素的值（不触发事件）
 */
function setValueSilently(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
    if (!element) return;
    
    // 临时移除该元素的所有监听器
    const elementListeners = formEventListeners.filter(item => item.element === element);
    elementListeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
    });
    
    // 设置值
    element.value = value;
    
    // 重新添加监听器
    elementListeners.forEach(({ element, event, handler, options }) => {
        element.addEventListener(event, handler, options);
    });
}

/**
 * 静默设置checkbox的值（不触发事件）
 */
function setCheckedSilently(element: HTMLInputElement, checked: boolean): void {
    if (!element || element.type !== 'checkbox') return;
    
    // 临时移除该元素的所有监听器
    const elementListeners = formEventListeners.filter(item => item.element === element);
    elementListeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
    });
    
    // 设置值
    element.checked = checked;
    
    // 重新添加监听器
    elementListeners.forEach(({ element, event, handler, options }) => {
        element.addEventListener(event, handler, options);
    });
}

// --- 解决方案验证代码 ---
        console.log('[sidepanel] 双重保护解决方案已加载：');
console.log('[sidepanel] 1. 事件监听器管理系统 - 可以临时移除和重新添加');
console.log('[sidepanel] 2. 静默设置函数 - setValueSilently, setCheckedSilently');
console.log('[sidepanel] 3. 改进的初始化标志管理 - 同步重置 isInitializingSidePanelUI');
console.log('[sidepanel] 4. 增强的saveSettings保护 - 多重检查防止误触发');
console.log('[sidepanel] 🎯 问题：初始化时误发送updateSettings消息 - 预期已解决');

/**
 * 统一的UI更新函数 - 一次性更新所有UI元素
 * @param data 包含所有UI更新所需的数据
 */
function updateAllUI(data: {
    availableTracks?: { languageCode: string, languageName: string, kind: string }[];
    determinedSourceLang?: string;
    settings?: {
        sourceLang: string;
        targetLang: string;
        subtitleMode: string;
        translationApi: string;
        apiKey: string;
        serviceType: string;
        membershipCredentials: typeof defaultSettings.membershipCredentials;
        customApiConfig: typeof defaultSettings.customApiConfig;
        openaiConfig: typeof defaultSettings.openaiConfig;
    };
    videoId?: string;
}) {
    console.log('[sidepanel] updateAllUI: 开始统一更新所有UI，使用静默模式');
    
    // 确保在初始化保护期间
    if (!isInitializingSidePanelUI) {
        console.warn('[sidepanel] updateAllUI: 当前不在初始化状态，设置保护标志');
        isInitializingSidePanelUI = true;
    }
    
    try {
        // 1. 更新视频ID
        if (data.videoId) {
            currentVideoId = data.videoId;
            console.log(`[sidepanel] 更新当前视频ID: ${currentVideoId}`);
        }
        
        // 2. 处理轨道数据和源语言
        if (data.availableTracks && data.availableTracks.length > 0) {
            console.log('[sidepanel] 更新轨道数据，共', data.availableTracks.length, '条');
            
            // Memory cache轨道信息
            uiTrackData = [...data.availableTracks];
            console.log(`[sidepanel] updateAllUI: 轨道信息已更新到sidepanel memory cache: ${uiTrackData.length}条记录`);
            
            // 填充源语言选项 (静默模式)
            if (sourceLangOptions) {
                sourceLangOptions.innerHTML = '';
                data.availableTracks.forEach(track => {
                    const option = document.createElement('div');
                    option.className = 'custom-select-option';
                    option.setAttribute('data-value', track.languageCode);
                    option.setAttribute('data-kind', track.kind || 'standard');
                    option.textContent = track.languageName;
                    sourceLangOptions.appendChild(option);
                });
            }
            
            // 设置源语言显示
            if (data.determinedSourceLang && sourceLangSelectedValue) {
                const matchedTrack = data.availableTracks.find(t => t.languageCode === data.determinedSourceLang);
                if (matchedTrack) {
                    sourceLangSelectedValue.textContent = matchedTrack.languageName;
                    sourceLangSelectedValue.setAttribute('data-value', data.determinedSourceLang);
                }
            }
            
            // 启用源语言选择器
            if (sourceLangTrigger) {
                sourceLangTrigger.classList.remove('disabled');
                sourceLangTrigger.style.pointerEvents = 'auto';
            }
        } else {
            // 处理无轨道情况
            if (sourceLangSelectedValue) {
                sourceLangSelectedValue.textContent = '无可用字幕';
            }
            if (sourceLangTrigger) {
                sourceLangTrigger.classList.add('disabled');
                sourceLangTrigger.style.pointerEvents = 'none';
            }
        }
        
        // 3. 更新所有设置相关UI
        if (data.settings) {
            const settings = data.settings;
            
            // 3.1 基本语言设置
            currentSelectedTargetLang = settings.targetLang;
            if (targetLangSelectedValue) {
                const matchedLang = targetLanguages.find(lang => lang.code === settings.targetLang);
                if (matchedLang) {
                    const key = 'lang_' + matchedLang.code.replace(/-/g, '_');
                    const localizedName = chrome.i18n.getMessage(key);
                    targetLangSelectedValue.textContent = localizedName || 
                        (uiLangCode && uiLangCode.toLowerCase().startsWith('zh') ? matchedLang.name : matchedLang.englishName);
                    targetLangSelectedValue.setAttribute('data-value', settings.targetLang);
                }
            }
            
            // 3.2 字幕模式设置
            if (subtitleTypeSwitch) {
                setCheckedSilently(subtitleTypeSwitch, settings.subtitleMode === 'bilingual');
            }
            
            // 3.3 翻译API设置
            if (translationApiSelect) {
                setValueSilently(translationApiSelect, settings.translationApi);
            }
            updateApiPanels(settings.translationApi);
            
            // 3.4 API密钥设置
            if (apiKeyInput) {
                setValueSilently(apiKeyInput, settings.apiKey);
            }
            
            // 3.5 服务类型设置
            if (serviceTypeMembership && serviceTypeApiKey) {
                if (settings.serviceType === 'membership') {
                    setCheckedSilently(serviceTypeMembership, true);
                    setCheckedSilently(serviceTypeApiKey, false);
                } else {
                    setCheckedSilently(serviceTypeMembership, false);
                    setCheckedSilently(serviceTypeApiKey, true);
                }
            }
            
            // 3.6 自定义API配置
            if (customApiUrl) setValueSilently(customApiUrl, settings.customApiConfig.url);
            if (customApiMethod) setValueSilently(customApiMethod, settings.customApiConfig.method);
            if (customApiHeaders) setValueSilently(customApiHeaders, settings.customApiConfig.headers);
            if (customApiBody) setValueSilently(customApiBody, settings.customApiConfig.body);
            if (customApiResponsePath) setValueSilently(customApiResponsePath, settings.customApiConfig.responsePath);
            
            // 3.7 OpenAI配置
            if (openaiModelSelect) {
                setValueSilently(openaiModelSelect, settings.openaiConfig.model);
                if (settings.openaiConfig.model === 'custom' && openaiCustomModel) {
                    openaiCustomModel.style.display = 'block';
                    setValueSilently(openaiCustomModel, settings.openaiConfig.customModel);
                } else if (openaiCustomModel) {
                    openaiCustomModel.style.display = 'none';
                }
            }
            
            if (openaiTemperature) {
                setValueSilently(openaiTemperature, settings.openaiConfig.temperature.toString());
                if (openaiTemperatureValue) {
                    openaiTemperatureValue.textContent = settings.openaiConfig.temperature.toString();
                }
            }
            
            // 3.8 更新目标语言列表（在保护期内）
            if (targetLangOptions && data.availableTracks) {
                // 清空当前选项
                targetLangOptions.innerHTML = '';
                
                // 排序目标语言
                const sortedLanguages = [...targetLanguages].sort((a, b) => {
                    const aIsRelevant = uiLangCode ? isLanguageRelevantToUI(a.code, uiLangCode) : false;
                    const bIsRelevant = uiLangCode ? isLanguageRelevantToUI(b.code, uiLangCode) : false;
                    if (aIsRelevant && !bIsRelevant) return -1;
                    if (!aIsRelevant && bIsRelevant) return 1;
                    return a.englishName.localeCompare(b.englishName);
                });
                
                // 填充选项
                sortedLanguages.forEach(lang => {
                    const option = document.createElement('div');
                    option.className = 'custom-select-option';
                    option.setAttribute('data-value', lang.code);
                    
                    // 使用本地化名称
                    const key = 'lang_' + lang.code.replace(/-/g, '_');
                    const localizedName = chrome.i18n.getMessage(key);
                    option.textContent = localizedName || 
                        (uiLangCode && uiLangCode.toLowerCase().startsWith('zh') ? lang.name : lang.englishName);
                    
                    // 设置选中状态
                    if (settings.targetLang === lang.code) {
                        option.classList.add('selected');
                    }
                    
                    // 应用语言族互斥逻辑：如果与源语言属于同一语言族，设为禁用状态
                    if (data.determinedSourceLang && isSameLanguageFamily(data.determinedSourceLang, lang.code)) {
                        option.classList.add('disabled');
                        option.setAttribute('data-disabled-reason', 'same-language-family');
                        option.title = `无法选择同语言族的语言：${option.textContent} 与源语言冲突`;
                        console.log(`[sidepanel] updateAllUI: 目标语言 ${lang.code} 因与源语言 ${data.determinedSourceLang} 冲突而被禁用`);
                    }
                    
                    targetLangOptions.appendChild(option);
                });
            }
            
            // 启用目标语言选择器
            if (targetLangTrigger) {
                targetLangTrigger.classList.remove('disabled');
                targetLangTrigger.style.pointerEvents = 'auto';
            }
            
            // 4. 保存初始设置状态
            initialSettingsFromBackground = { ...settings };
            isLoading = false;
            
            console.log('[sidepanel] updateAllUI: 所有UI更新完成');
        }
        
    } finally {
        // 5. 重置初始化标志（确保在所有操作完成后）
        isInitializingSidePanelUI = false;
        console.log('[sidepanel] updateAllUI: 重置初始化标志，UI更新流程完成');
    }
}

// --- 新增: 语言处理工具函数 ---

/**
 * 生成语言显示名称
 * 主要功能：为ASR轨道添加（自动生成）标识，同时优先使用chrome.i18n的本地化名称
 * 
 * @param trackInfo 轨道信息对象
 * @param trackInfo.languageCode 语言代码，如"en-US"
 * @param trackInfo.languageName 原始语言名称，如"英语（自动生成）"或"英语"
 * @param trackInfo.kind 轨道类型，"asr"表示自动生成，"standard"表示手动字幕
 * @returns 格式化后的显示名称
 * 
 * @example
 * // ASR轨道示例
 * generateLanguageDisplayName({
 *   languageCode: "en-US", 
 *   languageName: "English (auto-generated)", 
 *   kind: "asr"
 * })
 * // 返回: "英语（自动生成）" (如果UI语言是中文)
 * 
 * // 手动轨道示例  
 * generateLanguageDisplayName({
 *   languageCode: "en-US",
 *   languageName: "English", 
 *   kind: "standard"
 * })
 * // 返回: "英语" (如果UI语言是中文)
 */
function generateLanguageDisplayName(trackInfo: { 
    languageCode: string, 
    languageName: string, 
    kind: string 
}): string {
    // 步骤1: 尝试获取chrome.i18n的本地化语言名称
    // 将语言代码转换为i18n消息键，如"en-US" -> "lang_en_US"
    const i18nKey = 'lang_' + trackInfo.languageCode.replace(/-/g, '_');
    const localizedName = chrome.i18n.getMessage(i18nKey);
    
    // 步骤2: 确定基础语言名称
    let baseName: string;
    
    if (localizedName && localizedName.trim() !== '') {
        // 如果找到了本地化名称，直接使用（如"英语"）
        baseName = localizedName;
    } else {
        // 如果没有本地化名称，从原始名称中提取基础名称
        // 移除各种可能的自动生成标识
        baseName = trackInfo.languageName
            .replace(/\s*\(自动生成\)/g, '')           // 中文标识
            .replace(/\s*\(auto-generated\)/g, '')      // 英文标识
            .replace(/\s*\(自動生成\)/g, '')            // 繁体中文标识
            .trim();
    }
    
    // 步骤3: 根据轨道类型决定是否添加ASR标识
    if (trackInfo.kind === 'asr') {
        // ASR轨道：添加"（自动生成）"标识
        return `${baseName}（自动生成）`;
    } else {
        // 手动轨道：直接返回基础名称
        return baseName;
    }
}

/**
 * 提取基础语言代码
 * 功能：从完整的BCP 47语言代码中提取基础语言部分
 * 
 * @param langCode 完整语言代码
 * @returns 基础语言代码
 * 
 * @example
 * getBaseLangCode("en-US") // 返回: "en"
 * getBaseLangCode("zh-Hans") // 返回: "zh" 
 * getBaseLangCode("fr") // 返回: "fr"
 */
function getBaseLangCode(langCode: string): string {
    // 使用"-"分割语言代码，取第一部分
    // 例如："en-US" -> ["en", "US"] -> "en"
    const baseCode = langCode.split('-')[0];
    return baseCode;
}

/**
 * 检查两个语言是否属于同一语言族
 * 功能：通过比较基础语言代码判断是否互斥
 * 互斥原则：基础代码相同的语言不能同时作为源语言和目标语言
 * 
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码  
 * @returns true表示属于同一语言族（应该互斥），false表示可以配对使用
 * 
 * @example
 * isSameLanguageFamily("en-US", "en-GB") // 返回: true（都是英语族，应该互斥）
 * isSameLanguageFamily("zh-Hans", "zh-Hant") // 返回: true（都是中文族，应该互斥）
 * isSameLanguageFamily("en-US", "fr") // 返回: false（英语和法语，可以配对）
 */
function isSameLanguageFamily(sourceLang: string, targetLang: string): boolean {
    // 提取两个语言的基础代码
    const sourceBase = getBaseLangCode(sourceLang);
    const targetBase = getBaseLangCode(targetLang);
    
    // 比较基础代码是否相同
    const isSame = sourceBase === targetBase;
    
    // 只在发生互斥时打印日志
    if (isSame) {
        console.log(`[sidepanel] 语言族互斥: "${sourceLang}"(${sourceBase}) 与 "${targetLang}"(${targetBase}) 属于同一语言族，禁用选择`);
    }
    
    return isSame;
}

// --- End 新增: 语言处理工具函数 ---

// 🔄 临时兼容性层：逐步迁移源语言管理到VideoSourceLanguageCache
/**
 * 兼容性函数：获取当前视频的源语言
 * 优先从VideoSourceLanguageCache获取，fallback到UI状态
 */
async function getSourceLanguageForVideo(videoId?: string): Promise<string> {
  try {
    // 优先从VideoSourceLanguageCache获取
    if (videoId) {
      const cached = await videoSourceLanguageCacheManager.getVideoSourceLanguage(videoId);
      if (cached) {
        console.log(`[sidepanel] 从VideoSourceLanguageCache获取源语言: ${cached}`);
        return cached;
      }
    }
    
    // Fallback: 从UI当前状态获取
    const uiSourceLang = sourceLangSelectedValue?.getAttribute('data-value');
    if (uiSourceLang) {
      console.log(`[sidepanel] 从UI状态获取源语言: ${uiSourceLang}`);
      return uiSourceLang;
    }
    
    // 最终默认值
    console.log('[sidepanel] 使用默认源语言: en');
    return 'en';
  } catch (error) {
    console.warn('[sidepanel] 获取源语言失败，使用默认值:', error);
    return 'en';
  }
}

/**
 * 兼容性函数：设置当前视频的源语言
 * 同时更新VideoSourceLanguageCache和UI
 */
async function setSourceLanguageForVideo(videoId: string | null, sourceLang: string): Promise<void> {
  try {
    // 更新VideoSourceLanguageCache
    if (videoId) {
      await videoSourceLanguageCacheManager.updateVideoSourceLanguage(videoId, sourceLang);
      console.log(`[sidepanel] 已更新VideoSourceLanguageCache: ${videoId} -> ${sourceLang}`);
    }
    
    // 更新UI显示
    updateSourceLanguageDisplay(sourceLang);
    console.log(`[sidepanel] 已更新UI显示: ${sourceLang}`);
  } catch (error) {
    console.error('[sidepanel] 设置源语言失败:', error);
  }
}

// 🔧 修复：防止重复初始化的全局标志
let sidePanelInitialized = false;

/**
 * 🚀 官方标准：SidePanel初始化流程
 * 基于Google官方示例和Chrome扩展最佳实践
 * 🔧 修复：防止重复初始化
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 🔧 修复：防止重复初始化
  if (sidePanelInitialized) {
    console.log('[sidepanel] SidePanel已初始化，跳过重复初始化');
    return;
  }
  
  console.log('[sidepanel] 🎯 SidePanel初始化开始...');
  sidePanelInitialized = true;
  
  try {
    // 1. 建立生命周期监控连接
    const port = chrome.runtime.connect({ name: 'sidepanel-lifecycle' });
    console.log('[sidepanel] ✅ Port连接已建立');
    
    // 2. 获取当前标签页信息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('无法获取当前标签页信息');
    }
    
    currentTabId = tab.id;
    console.log(`[sidepanel] ✅ 当前标签页ID: ${currentTabId}`);
    
    // 3. 验证YouTube页面
    if (!tab.url || !isYoutubeUrl(tab.url)) {
      console.warn('[sidepanel] ⚠️ 当前页面不是YouTube，SidePanel可能无法正常工作');
    }
    
    // 4. 获取视频ID
    if (tab.url) {
      currentVideoId = extractVideoIdFromUrl(tab.url);
      console.log(`[sidepanel] 视频ID: ${currentVideoId || '未检测到'}`);
    }
    
    // 5. 初始化UI组件
    await initializeSidePanelUI();
    
    // 6. 🔧 优化：不再发送额外消息，Port连接已经足以通知Background
    console.log('[sidepanel] ✅ SidePanel初始化完成，状态同步由Port连接处理');
    
    console.log('[sidepanel] 🎉 SidePanel初始化完成');
    
  } catch (error) {
    console.error('[sidepanel] ❌ SidePanel初始化失败:', error);
    sidePanelInitialized = false; // 重置标志，允许重试
    handleInitializationError(error);
  }
});

/**
 * 🚀 官方标准：SidePanel清理流程
 */
window.addEventListener('beforeunload', () => {
  console.log('[sidepanel] 🔄 SidePanel即将关闭，执行清理...');
  // Port连接会自动断开，Background能检测到断开事件
});

/**
 * 🔧 新增：初始化UI组件
 * 整合了旧监听器中的所有必要初始化步骤
 */
async function initializeSidePanelUI(): Promise<void> {
  console.log('[sidepanel] 开始初始化UI组件...');
  
  // 1. 等待从Background获取UI语言信息
  console.log(`[sidepanel] 等待从Background获取UI语言信息...`);
  
  // 2. 打印所有受支持的语言
  console.log(`[sidepanel] 支持的目标语言列表 (来自languages.ts):`, targetLanguages.map(l => `${l.code}:${l.name}`).join(', '));
  
  // 3. 添加事件监听器 (包括自定义下拉框的)
  console.log("[sidepanel] 添加事件监听器");
  addEventListeners();
  
  // 4. 初步填充目标语言列表
  console.log("[sidepanel] 初步填充目标语言列表 (无特定UI语言排序，将在收到background数据后可能刷新)");
  populateTargetLanguages(); // 调用时不传入searchTerm，也不依赖全局uiLangCode
  
  // 5. 如果有标签页ID，加载数据
  if (currentTabId) {
    // 🔧 移除重复的初始化消息，统一使用新的标准机制
    await requestAndFillSourceLanguages(currentTabId);
    await loadSettings();
  }
  
  console.log('[sidepanel] UI组件初始化完成');
}

/**
 * 🔧 新增：处理初始化错误
 */
function handleInitializationError(error: any): void {
  console.error('[sidepanel] 初始化错误详情:', error);
  
  // 显示错误信息给用户
  const errorMessage = error instanceof Error ? error.message : '初始化失败';
  
  // 尝试基础UI初始化
  try {
    populateTargetLanguages();
    addEventListeners();
    
    // 显示错误状态给源语言选择器
    if (sourceLangTrigger) {
      sourceLangTrigger.classList.add('disabled');
      sourceLangTrigger.style.pointerEvents = 'none';
      if (sourceLangSelectedValue) {
        sourceLangSelectedValue.textContent = 'Error';
      }
    }
    
    // 显示错误状态给目标语言选择器
    if (targetLangSelectedValue) {
      targetLangSelectedValue.textContent = `错误: ${errorMessage}`;
    }
  } catch (uiError) {
    console.error('[sidepanel] 连基础UI都无法初始化:', uiError);
  }
}

/**
 * 🔧 辅助函数：检查是否为YouTube URL
 */
function isYoutubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const youtubeOrigins = [
      'https://www.youtube.com',
      'https://youtube.com', 
      'https://m.youtube.com'
    ];
    return youtubeOrigins.includes(urlObj.origin);
  } catch (error) {
    return false;
  }
}

// 🔧 旧的初始化机制已移除
// 现在统一使用新的标准机制：DOMContentLoaded 中直接发送 sidePanelActuallyOpened 消息