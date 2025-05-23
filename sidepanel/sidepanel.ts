/**
 * Side Panel Logic
 */
import { targetLanguages, Language } from '../src/utils/languages'; // 导入语言列表
import { VideoSettingsCache, VideoSettings } from '../src/storage/video-settings-cache'; // 导入视频设置缓存
import { StorageManager, StorageKeys } from '../src/storage/storage-manager'; // 导入 StorageManager 和 StorageKeys
// 导入新的语言处理工具
import { isLanguageRelevantToUI } from '../src/utils/language-processing';

console.log('[sidepanel/sidepanel.ts] Side Panel Script Loaded.');

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
/** 缓存从存储加载的目标语言 */
let loadedTargetLang: string | null = null;
/** 跟踪当前选中的目标语言代码 */
let currentSelectedTargetLang: string | null = null;
/** 缓存浏览器 UI 语言 - Sidepanel不再自行获取和使用，将由background提供 */
let uiLangCode: string | null = null;
/** 缓存从内容脚本获取的可用视频轨道信息，用于填充源语言下拉列表 */
let availableTracksForSelect: { languageCode: string, languageName: string, kind: string }[] = [];

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
            
            // chrome.storage.sync.set({ 
            //     membershipCredentials: loginState
            // }, () => {
            //     if (chrome.runtime.lastError) {
            //         console.error('保存登录状态时出错:', chrome.runtime.lastError);
            //     } else {
            //         console.log('登录状态已保存:', loginState);
            //     }
            // });
            try {
              await StorageManager.getInstance().set(StorageKeys.SETTINGS.MEMBERSHIP_CREDENTIALS, loginState, 'local'); // 修改为 local
              console.log('登录状态已保存:', loginState);
            } catch (error) {
              console.error('保存登录状态时出错:', error);
            }
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

    console.log(`[sidepanel/sidepanel.ts] 尝试匹配语言代码: ${codeToMatch}`);
    let matchedLang: Language | undefined = undefined;
    const normalizedCodeToMatch = codeToMatch.toLowerCase(); // Normalize for comparison

    // Priority 1: Exact Match (case-insensitive)
    matchedLang = targetLanguages.find(lang => lang.code.toLowerCase() === normalizedCodeToMatch);
    if (matchedLang) {
        console.log(`[sidepanel/sidepanel.ts] 精确匹配: ${matchedLang.code}`);
        return matchedLang;
    }

    // Priority 2: Handle Chinese Script/Region Variants explicitly
    const baseLang = normalizedCodeToMatch.split(/[-_]/)[0];
    console.log(`[sidepanel/sidepanel.ts] 基础语言代码: ${baseLang}`);
    
    if (baseLang === 'zh') {
        console.log(`[sidepanel/sidepanel.ts] 处理中文变体. 完整代码: ${normalizedCodeToMatch}`);
        const regionOrScript = normalizedCodeToMatch.split(/[-_]/)[1];
        console.log(`[sidepanel/sidepanel.ts] 区域/脚本代码: ${regionOrScript}`);
        
        // 强化中文匹配: 所有中国大陆区域代码使用简体中文
        // Prefer Hans for CN/SG UI, Hant for TW/HK UI
        if (regionOrScript === 'cn' || regionOrScript === 'sg' || regionOrScript === 'hans') {
            console.log('[sidepanel/sidepanel.ts] 匹配简体中文 (zh-Hans)');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        } else if (regionOrScript === 'tw' || regionOrScript === 'hk' || regionOrScript === 'hant') {
            console.log('[sidepanel/sidepanel.ts] 匹配繁体中文 (zh-Hant)');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hant');
        }
        // If UI is just 'zh', default to Hans
        else if (normalizedCodeToMatch === 'zh') {
            console.log('[sidepanel/sidepanel.ts] 纯zh代码，默认使用简体中文');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans') || targetLanguages.find(lang => lang.code === 'zh-Hant');
        }
        // 添加默认中文处理
        else {
            console.log('[sidepanel/sidepanel.ts] 未知中文变体，默认使用简体中文');
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
        console.log(`[sidepanel/sidepanel.ts] 匹配前缀(特定到通用): ${matchedLang.code}`);
        return matchedLang;
    }

    // Priority 4: Target is General, List has Specific (e.g., target 'en', list has 'en-us')
    // Check if target code is a prefix of list code (followed by a separator)
    matchedLang = targetLanguages.find(lang =>
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '-') || 
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '_')
    );
    
    if (matchedLang) {
        console.log(`[sidepanel/sidepanel.ts] 匹配前缀(通用到特定): ${matchedLang.code}`);
    } else {
        console.log(`[sidepanel/sidepanel.ts] 未找到匹配`);
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

    console.log(`[sidepanel/sidepanel.ts] populateTargetLanguages 调用，当前 uiLangCode: ${uiLangCode}`);

    // 筛选语言（如果提供了搜索词）
    let filteredLanguages = targetLanguages;
    if (searchTerm && searchTerm.trim() !== '') {
        const lowerSearchTerm = searchTerm.toLowerCase().trim();
        console.log(`[sidepanel/sidepanel.ts] 搜索语言，关键词: "${lowerSearchTerm}"`);
        
        filteredLanguages = targetLanguages.filter(lang => {
            // 记录每个语言的匹配情况，便于调试
            const langCode = lang.code.toLowerCase();
            const langName = lang.name.toLowerCase();
            const langEnglishName = lang.englishName.toLowerCase();
            
            // 1. 精确匹配语言代码 (如"es", "en-US")
            if (langCode === lowerSearchTerm) {
                console.log(`[搜索] 精确匹配语言代码: ${lang.code} = ${lowerSearchTerm}`);
                return true;
            }
            
            // 2. 语言代码前缀匹配 (如"zh"匹配"zh-Hans")
            if (langCode.startsWith(lowerSearchTerm)) {
                console.log(`[搜索] 语言代码前缀匹配: ${lang.code} 以 ${lowerSearchTerm} 开头`);
                return true;
            }
            
            // 3. 语言代码中的国家/地区代码匹配 (如"cn"匹配"zh-CN")
            if (langCode.includes(`-${lowerSearchTerm}`)) {
                console.log(`[搜索] 国家/地区代码匹配: ${lang.code} 包含 -${lowerSearchTerm}`);
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
                console.log(`[搜索] 国家代码别名匹配: ${lowerSearchTerm} -> ${lang.code}`);
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
                console.log(`[搜索] 国际区号匹配: ${lowerSearchTerm} -> ${lang.code}`);
                return true;
            }
            
            // 6. 按语言名称处理 - 所有语言一律只匹配开头
            if (langName.startsWith(lowerSearchTerm)) {
                console.log(`[搜索] 名称前缀匹配: ${lang.name} 以 ${lowerSearchTerm} 开头`);
                return true;
            }
            
            // 7. 英文名称匹配开头
            if (langEnglishName.startsWith(lowerSearchTerm)) {
                console.log(`[搜索] 英文名称前缀匹配: ${lang.englishName} 以 ${lowerSearchTerm} 开头`);
                return true;
            }
            
            return false;
        });
        
        console.log(`[sidepanel/sidepanel.ts] 搜索结果: 找到 ${filteredLanguages.length} 个匹配语言`);
        filteredLanguages.forEach(lang => console.log(`- ${lang.code}: ${lang.name}`));
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
        
        // 如果与源语言相同，设为禁用状态
        const currentSourceLang = sourceLangSelectedValue?.getAttribute('data-value');
        if (currentSourceLang === lang.code) {
            option.classList.add('disabled');
        }
        
        targetLangOptions.appendChild(option);
    });
    
    // 如果没有匹配的语言
    if (filteredLanguages.length === 0) {
        const option = document.createElement('div');
        option.className = 'custom-select-option disabled';
        option.textContent = "无匹配语言";
        targetLangOptions.appendChild(option);
    }
    
    console.log("[sidepanel/sidepanel.ts] populateTargetLanguages: 目标语言列表已填充并排序。");
}

/**
 * 从缓存中获取当前视频的设置
 * @deprecated 已弃用 - 保留以便向后兼容，应避免直接调用。设置获取应通过 background 进行。
 * @param videoId 视频ID
 * @returns 缓存的视频设置或null
 */
async function getVideoSettingsFromCache(videoId: string): Promise<VideoSettings | null> {
  console.warn('[SidePanel] getVideoSettingsFromCache: 已弃用的函数被调用');
  if (!videoId) return null;
  
  // 直接返回null，应该通过 background 的 initializeSidePanel 流程获取设置
  return null;
}

/**
 * 将当前设置保存到视频缓存
 * @deprecated 已弃用 - 保留以便向后兼容，应避免直接调用。设置保存应通过 saveSettings 和 background 进行。
 * @param videoId 视频ID
 * @param hasSubtitles 是否有字幕
 * @param sourceTrackKind 源轨道类型（可选）
 */
async function saveCurrentSettingsToCache(videoId: string, hasSubtitles: boolean, sourceTrackKind?: string): Promise<void> {
  console.warn('[SidePanel] saveCurrentSettingsToCache: 已弃用的函数被调用');
  if (!videoId) return;

  // 简化为只记录日志，实际保存应通过 saveSettings 和 background 进行
  console.log(`[SidePanel] 不再直接保存设置到缓存。请使用 saveSettings() 函数。`);
}

/**
 * 显示缓存的视频设置到界面
 * @param settings 视频设置
 */
function displayCachedVideoSettings(settings: VideoSettings): void {
    console.log('[SidePanel] 显示缓存的视频特定设置:', settings);
    if (settings.sourceLang) {
        updateSourceLanguageDisplay(settings.sourceLang);
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
  console.log(`[SidePanel] 禁用翻译功能: ${message}`);
}

/**
 * 从YouTube URL提取视频ID
 * @param url YouTube视频URL
 * @returns 视频ID或null
 */
function extractVideoIdFromUrl(url: string): string | null {
  return VideoSettingsCache.extractVideoId(url);
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
    console.log(`[sidepanel/sidepanel.ts] 更新API面板: ${apiType}`);
    
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
        console.log(`[updateApiPanels] 未找到API信息: ${apiType}`);
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
    console.log("[sidepanel/sidepanel.ts] loadSettings: 已弃用的直接加载方法被调用");
    
    if (currentTabId === null) {
        console.warn("[sidepanel/sidepanel.ts] loadSettings: 没有当前标签页ID，无法请求设置");
        return;
    }
    
    try {
        // 向 background 请求初始化数据
        console.log("[sidepanel/sidepanel.ts] loadSettings: 请求 background 提供设置");
        chrome.runtime.sendMessage({
            action: 'sidePanelOpened',
            tabId: currentTabId,
            videoId: currentVideoId
        });
        
        // background 将通过 initializeSidePanelUI 消息返回数据，在消息监听器中处理
    } catch (error) {
        console.error("[sidepanel/sidepanel.ts] loadSettings: 请求设置失败", error);
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
    // 更新源语言
    if (settings.sourceLang !== undefined) {
        // 查找是否在可用的轨道中
        const trackExists = availableTracksForSelect.some(track => track.languageCode === settings.sourceLang);
        if (trackExists) {
            updateSourceLanguageDisplay(settings.sourceLang);
               // 源语言改变后，需要重新填充目标语言选项以更新禁用状态和选中状态
               populateTargetLanguages(); 
        } else {
             console.warn(`[updateUI] Saved sourceLang (${settings.sourceLang}) not in options, skipping update.`);
             // 如果加载的源语言无效，也要确保目标语言状态更新
             populateTargetLanguages(); 
        }
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
        console.log('[sidepanel/sidepanel.ts] saveSettings: 由于UI正在初始化，跳过保存和通知。');
        return;
    }

    if (isLoading) {
        console.log("[sidepanel/sidepanel.ts] saveSettings: 正在加载初始设置，跳过保存。");
        return;
    }

    // 额外保护 - 如果事件监听器还没有完全添加，也跳过
    if (!listenersAttached) {
        console.log("[sidepanel/sidepanel.ts] saveSettings: 事件监听器尚未完全添加，跳过保存。");
        return;
    }

    console.log("[sidepanel/sidepanel.ts] saveSettings: 开始保存设置...");
    console.log("[sidepanel/sidepanel.ts] saveSettings: 开始收集设置。");

    const uiSourceLang = sourceLangSelectedValue?.getAttribute('data-value') || initialSettingsFromBackground?.sourceLang || defaultSettings.sourceLang;
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

    // 检查是否有实际更改
    let hasChanges = false;
    if (!initialSettingsFromBackground) {
        hasChanges = true; // 如果没有初始设置记录，则认为有更改
        console.log("[sidepanel/sidepanel.ts] saveSettings: 没有 initialSettingsFromBackground，强制保存。");
    } else {
        for (const key in settingsToSave) {
            const k = key as keyof typeof settingsToSave;
            if (typeof settingsToSave[k] === 'object' && settingsToSave[k] !== null) {
                // 比较对象内部
                const initialObj = initialSettingsFromBackground[k] as any;
                const currentObj = settingsToSave[k] as any;
                if (JSON.stringify(initialObj) !== JSON.stringify(currentObj)) {
                    console.log(`[sidepanel/sidepanel.ts] saveSettings: 检测到对象更改 - ${k}: 从`, initialObj, '到', currentObj);
                    hasChanges = true;
                    break;
                }
            } else if (settingsToSave[k] !== initialSettingsFromBackground[k]) {
                console.log(`[sidepanel/sidepanel.ts] saveSettings: 检测到更改 - ${k}: 从 '${initialSettingsFromBackground[k]}' 到 '${settingsToSave[k]}'`);
                hasChanges = true;
                break;
            }
        }
    }

    if (!hasChanges) {
        console.log("[sidepanel/sidepanel.ts] saveSettings: 未检测到实际设置更改，跳过发送消息。");
        return;
    }

    console.log("[sidepanel/sidepanel.ts] saveSettings: 检测到更改，准备发送消息。新的设置:", settingsToSave);

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

        console.log("[sidepanel/sidepanel.ts] 向background发送设置更新请求:", updateMessage);
        
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
            console.log("[sidepanel/sidepanel.ts] 设置已成功保存:", response.message);
            // 更新 initialSettingsFromBackground 为最新保存的设置
            initialSettingsFromBackground = { ...settingsToSave }; 
        } else {
            console.error("[sidepanel/sidepanel.ts] 设置保存失败:", response.message);
        }

    } catch (error) {
        console.error('[sidepanel/sidepanel.ts] 保存设置过程中出错:', error);
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
  
  console.log(`[SidePanel] 正在等待字幕轨道数据，标签页ID: ${tabId}`);
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
    console.log('[SidePanel] 请求 background 初始化数据');
    
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
    
    // 通知 background 侧边栏已打开，请求初始化数据
    chrome.runtime.sendMessage({
      action: 'sidePanelOpened',
      tabId: tabId,
      videoId: videoId
    });
    
    // background 将通过 initializeSidePanelUI 消息返回数据，在消息监听器中处理
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
            if (value) {
                updateSourceLanguageDisplay(value);
                
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
            console.log(`[事件] API类型更改为: ${apiType}`);
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
    console.log('[sidepanel/sidepanel.ts] 事件监听器添加完成，共管理', formEventListeners.length, '个表单事件监听器');
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
        console.log('[ensureApiKeyPanelVisible] 强制显示API密钥输入框');
        apiKeyPanel.style.display = 'flex';
        apiKeyPanel.classList.add('visible'); // 添加visible类以确保面板真正可见
    }
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[sidepanel/sidepanel.ts] ===== 侧边栏DOMContentLoaded开始 ======");
    
    // 1. UI 语言获取和匹配逻辑已移除，将由 background 处理
    // uiLangCode = chrome.i18n.getUILanguage();
    // console.log(`[sidepanel/sidepanel.ts] 获取UI语言: ${uiLangCode}`); // 移至background
    
    // --- 打印所有受支持的语言 (可以保留，因为它不依赖 uiLangCode 的直接匹配结果) ---
    console.log(`[sidepanel/sidepanel.ts] 支持的目标语言列表 (来自languages.ts):`, targetLanguages.map(l => `${l.code}:${l.name}`).join(', '));
    
    // --- 诊断信息：测试UI语言匹配 (移除) ---
    // const uiLangMatch = findMatchingTargetLanguage(uiLangCode); // 移除
    // console.log(`[sidepanel/sidepanel.ts] UI语言(${uiLangCode})匹配结果:`, uiLangMatch ? `找到匹配 - ${uiLangMatch.code}: ${uiLangMatch.name}` : "没有找到匹配"); // 移除
    
    // 2. 添加事件监听器 (包括自定义下拉框的)
    console.log("[sidepanel/sidepanel.ts] 添加事件监听器");
    addEventListeners();
    
    // 3. 初步填充目标语言列表 (修改)
    // populateTargetLanguages() 将依赖从 background 获取的 uiLangCode 或预处理的列表。
    // 现在可以先进行一次不依赖 uiLangCode 的填充，或者等待 background 的消息。
    // 为了避免UI空白，可以先用无特定排序的方式填充。
    console.log("[sidepanel/sidepanel.ts] 初步填充目标语言列表 (无特定UI语言排序，将在收到background数据后可能刷新)");
    populateTargetLanguages(); // 调用时不传入searchTerm，也不依赖全局uiLangCode
    
    // 4. 获取当前标签页 ID 并通知 background
    console.log("[sidepanel/sidepanel.ts] 开始查询当前标签页");
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("[Error] 查询标签页失败:", chrome.runtime.lastError);
            if (sourceLangTrigger) {
                sourceLangTrigger.classList.add('disabled');
                sourceLangTrigger.style.pointerEvents = 'none';
                if (sourceLangSelectedValue) {
                    sourceLangSelectedValue.textContent = 'Error';
                }
            }
            console.log("[sidepanel/sidepanel.ts] 查询标签页失败，不发送 sidePanelOpened 通知。");
            return;
        }
        
        if (tabs.length > 0 && tabs[0].id !== undefined && tabs[0].id !== null) {
            currentTabId = tabs[0].id;
            const tabUrl = tabs[0].url;
            let videoId: string | null = null;
            if (tabUrl) {
                videoId = extractVideoIdFromUrl(tabUrl);
                currentVideoId = videoId; // 更新全局变量
            }
            
            console.log(`[sidepanel/sidepanel.ts] 关联标签页ID ${currentTabId}，URL: ${tabUrl}, Video ID: ${videoId}。通知 Background。`);
            if (typeof currentTabId === 'number') {
                console.log(`[sidepanel/sidepanel.ts] 侧边栏打开，通知 Background。Tab ID: ${currentTabId}, Video ID: ${videoId}`);
                chrome.runtime.sendMessage({
                    action: 'sidePanelOpened',
                    tabId: currentTabId,
                    videoId: videoId // 新增 videoId
                });

            } else {
                console.error("[Debug] currentTabId不是有效的数字，无法通知 background。");
            }
        } else {
            console.error("[Error] 无法确定活动标签页ID");
            if (sourceLangTrigger) {
                sourceLangTrigger.classList.add('disabled');
                sourceLangTrigger.style.pointerEvents = 'none';
                if (sourceLangSelectedValue) {
                    sourceLangSelectedValue.textContent = 'Error';
                }
            }
        }
    });
    console.log("[sidepanel/sidepanel.ts] ===== 侧边栏DOMContentLoaded完成 ======");
});

// --- 监听来自背景脚本的导航通知 --- 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'initializeSidePanelUI') {
        isInitializingSidePanelUI = true; // 在处理开始时设置标志
        console.log('[sidepanel/sidepanel.ts] initializeSidePanelUI 消息收到，数据:', message.data);
        console.log('[sidepanel/sidepanel.ts] 设置 isInitializingSidePanelUI = true，开始初始化流程');
        
        // 更新UI语言，确保后续列表显示本地化名称
        uiLangCode = chrome.i18n.getUILanguage();
        console.log(`[sidepanel/sidepanel.ts] initializeSidePanelUI - 浏览器UI语言: ${uiLangCode}`);
        console.log('[SidePanel] 收到 Background 的初始化数据:', message.data);
        const { availableTracks, settings, videoId: bgVideoId, tabId: bgTabId } = message.data;

        // 确保这个消息是针对当前侧边栏实例的tabId (如果background发送了tabId)
        if (bgTabId && currentTabId !== bgTabId) {
            console.warn(`[SidePanel] 收到 tab ${bgTabId} 的初始化数据，但当前是 tab ${currentTabId}，忽略。`);
            // 重置标志并返回
            isInitializingSidePanelUI = false;
            return false;
        }

        // 更新当前视频ID
        if (bgVideoId) {
            currentVideoId = bgVideoId;
            console.log(`[SidePanel] 更新当前视频ID: ${currentVideoId}`);
        }

        // 从 settings 中获取 background 决定的源语言
        const determinedSourceLangFromBg = settings?.determinedSourceLang;

        if (availableTracks) {
            console.log('[SidePanel] 使用 Background 提供的轨道数据更新UI。');
            // 将 determinedSourceLangFromBg 传递给 processTracksAndUpdateUI
            processTracksAndUpdateUI(availableTracks, determinedSourceLangFromBg);
        } else {
            handleEmptyOrErrorResponse('正在等待轨道数据...');
        }

        if (settings) {
            console.log('[SidePanel] 使用 Background 提供的设置更新UI。');
            const globalSettings = settings.globalSettings || {};

            // 使用已经从 background 获取并可能被 processTracksAndUpdateUI 使用的 determinedSourceLangFromBg
            const finalSourceLang = determinedSourceLangFromBg; 
            const finalTargetLang = settings.determinedTargetLang;
            loadedTargetLang = finalTargetLang;

            displaySettings({
                sourceLang: finalSourceLang, 
                targetLang: finalTargetLang, 
                subtitleMode: globalSettings[StorageKeys.SETTINGS.SUBTITLE_MODE] || defaultSettings.subtitleMode
            });
            displayApiSettings({ 
                translationApi: globalSettings[StorageKeys.SETTINGS.TRANSLATION_API] || defaultSettings.translationApi,
                apiKey: globalSettings[StorageKeys.SETTINGS.API_KEY] || defaultSettings.apiKey,
                serviceType: globalSettings[StorageKeys.SETTINGS.SERVICE_TYPE] || defaultSettings.serviceType,
                membershipCredentials: globalSettings[StorageKeys.SETTINGS.MEMBERSHIP_CREDENTIALS] || defaultSettings.membershipCredentials,
                customApiConfig: globalSettings[StorageKeys.SETTINGS.CUSTOM_API_CONFIG] || defaultSettings.customApiConfig,
                openaiConfig: globalSettings[StorageKeys.SETTINGS.OPENAI_CONFIG] || defaultSettings.openaiConfig
            });
            
            // currentSelectedTargetLang = finalTargetLang; // 已在 displaySettings 中处理
            // updateTargetLanguageDisplay(finalTargetLang); // 已在 displaySettings 中处理
            // populateTargetLanguages(); // 已在 displaySettings 中处理

            // 所有UI更新完成后，记录初始设置并标记加载完成
            const effectiveSettings = {
                sourceLang: finalSourceLang,
                targetLang: finalTargetLang,
                subtitleMode: globalSettings[StorageKeys.SETTINGS.SUBTITLE_MODE] || defaultSettings.subtitleMode,
                translationApi: globalSettings[StorageKeys.SETTINGS.TRANSLATION_API] || defaultSettings.translationApi,
                apiKey: globalSettings[StorageKeys.SETTINGS.API_KEY] || defaultSettings.apiKey,
                serviceType: globalSettings[StorageKeys.SETTINGS.SERVICE_TYPE] || defaultSettings.serviceType,
                customApiConfig: globalSettings[StorageKeys.SETTINGS.CUSTOM_API_CONFIG] || defaultSettings.customApiConfig,
                openaiConfig: globalSettings[StorageKeys.SETTINGS.OPENAI_CONFIG] || defaultSettings.openaiConfig,
                membershipCredentials: globalSettings[StorageKeys.SETTINGS.MEMBERSHIP_CREDENTIALS] || defaultSettings.membershipCredentials,
            };
            initialSettingsFromBackground = { ...effectiveSettings };
            isLoading = false;
            console.log("[sidepanel/sidepanel.ts] initializeSidePanelUI: 初始化完成, isLoading 设置为 false");

        } else {
            // 清理旧的UI状态，准备接收新数据
            uiLangCode = chrome.i18n.getUILanguage(); 
            if (sourceLangTrigger) {
                if (sourceLangSelectedValue) {
                    sourceLangSelectedValue.textContent = '加载中...';
                }
                sourceLangTrigger.classList.add('disabled');
                sourceLangTrigger.style.pointerEvents = 'none';
            }
            if (targetLangSelectedValue) { 
                targetLangSelectedValue.textContent = '选择语言...';
                targetLangSelectedValue.removeAttribute('data-value');
            }
            currentSelectedTargetLang = null; 
            currentVideoId = null; 
        }
        
        // 同步重置初始化标志，不使用setTimeout
        isInitializingSidePanelUI = false;
        console.log('[sidepanel/sidepanel.ts] initializeSidePanelUI: 初始化流程完成，同步重置 isInitializingSidePanelUI = false');
        return true; 
    }
    else if (message.action === 'youtubeNavigationOccurred' && message.navigatedTabId) {
        console.log(`[SidePanel] Received navigation notification for Tab ${message.navigatedTabId}. Current: ${currentTabId}.`);
        if (currentTabId !== null && currentTabId !== undefined && message.navigatedTabId === currentTabId) {
            console.log(`[SidePanel] Navigation matches. Notifying background to re-initialize... Tab ID: ${currentTabId}`);
            
            // 清理旧的UI状态，准备接收新数据
            uiLangCode = chrome.i18n.getUILanguage(); // 重新获取UI语言以防万一
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
            console.log(`[SidePanel] YouTube navigation detected. Current URL: ${currentTabUrl}, Video ID: ${navigatedVideoId}`);

            chrome.runtime.sendMessage({
                action: 'sidePanelOpened', // 重新发送打开通知，让 background 重新加载数据
                tabId: currentTabId,
                videoId: navigatedVideoId // 新增 videoId
            });
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
    console.log('[sidepanel/sidepanel.ts] displayApiSettings: 开始设置API相关UI，使用静默模式');
    
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
    
    console.log('[sidepanel/sidepanel.ts] displayApiSettings: API设置UI更新完成');
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
    console.log('[sidepanel/sidepanel.ts] displaySettings: 开始设置基本UI，使用静默模式');
    
    // 设置源语言选择器
    updateSourceLanguageDisplay(settings.sourceLang);
    
    // 设置目标语言显示
    currentSelectedTargetLang = settings.targetLang;
    updateTargetLanguageDisplay(currentSelectedTargetLang);
    populateTargetLanguages(''); // 更新目标语言列表
    
    // 设置字幕模式 - 使用静默模式
    if (subtitleTypeSwitch) {
        setCheckedSilently(subtitleTypeSwitch, settings.subtitleMode === 'bilingual');
    }
    
    console.log('[sidepanel/sidepanel.ts] displaySettings: 基本设置UI更新完成');
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
 * 从后台服务工作器获取缓存的轨道数据
 * @deprecated 已弃用 - 保留以便向后兼容，应避免直接调用。轨道数据应通过 background 的 initializeSidePanelUI 消息获取。
 * @returns Promise<轨道数据数组 | null>
 */
async function getTracksFromBackground(): Promise<{ languageCode: string, languageName: string, kind: string }[] | null> {
  console.warn('[SidePanel] getTracksFromBackground: 已弃用的函数被调用');
  
  // 简化为直接通过 sidePanelOpened 消息请求数据
  if (currentTabId !== null) {
    chrome.runtime.sendMessage({
      action: 'sidePanelOpened',
      tabId: currentTabId,
      videoId: currentVideoId
    });
  }
  
  // 直接返回null，数据将通过 initializeSidePanelUI 消息异步获取
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
    
    console.log('[SidePanel] 处理获取到的轨道信息，共', availableTracks.length, '条');
    
    // 缓存轨道信息供未来使用
    availableTracksForSelect = [...availableTracks];
    
    // 填充源语言选项 (这必须在设置选中项之前完成)
    populateSourceLanguages();
        
    // 使用 background 传递过来的 determinedSourceLangFromBg (如果有效)
    // 否则，作为备选，使用列表中的第一个轨道 (如果列表不为空)
    let langToSet = determinedSourceLangFromBg;
    if (!langToSet && availableTracksForSelect.length > 0) {
        langToSet = availableTracksForSelect[0].languageCode;
        console.log(`[SidePanel] Background 未提供有效源语言，自动选择列表第一个: ${langToSet}`);
    }
    
    if (langToSet) {
        updateSourceLanguageDisplay(langToSet);
        console.log(`[SidePanel] 设置源语言 (来自Background或备选): ${langToSet}`);
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
        console.log(`[SidePanel] 初始源语言: ${initialSourceLangToSave}.`);
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
    
    console.log(`[SidePanel] ${message}.`);
}

/**
 * 更新源语言显示
 * @param langCode 语言代码
 */
function updateSourceLanguageDisplay(langCode: string | null) {
    if (!sourceLangSelectedValue) return;
    if (langCode) {
        // 查找匹配的轨道信息
        const trackInfo = availableTracksForSelect.find(track => track.languageCode === langCode);
        if (trackInfo) {
            sourceLangSelectedValue.textContent = trackInfo.languageName;
            sourceLangSelectedValue.setAttribute('data-value', trackInfo.languageCode);
        }
    } else {
        sourceLangSelectedValue.textContent = '选择语言...';
        sourceLangSelectedValue.removeAttribute('data-value');
    }
}

/**
 * 填充源语言选项列表
 */
function populateSourceLanguages() {
    if (!sourceLangOptions) return;
    
    // 清空当前选项
    sourceLangOptions.innerHTML = '';
    
    // 填充选项
    availableTracksForSelect.forEach((trackInfo) => {
        const option = document.createElement('div');
        option.className = 'custom-select-option';
        option.setAttribute('data-value', trackInfo.languageCode);
        option.setAttribute('data-kind', trackInfo.kind); // 保存轨道类型为数据属性
        // 使用 Chrome i18n 消息适配语言名，若存在消息则使用之，否则使用 trackInfo.languageName
        const srcKey = 'lang_' + trackInfo.languageCode.replace(/-/g, '_');
        const srcLocalized = chrome.i18n.getMessage(srcKey);
        option.textContent = srcLocalized || trackInfo.languageName;
        
        // 如果与当前选中的目标语言相同，设为禁用状态
        if (currentSelectedTargetLang === trackInfo.languageCode) {
            option.classList.add('disabled');
        }
        
        // 如果是当前选中的语言，设为选中状态
        const currentSourceLang = sourceLangSelectedValue?.getAttribute('data-value');
        if (currentSourceLang === trackInfo.languageCode) {
            option.classList.add('selected');
        }
        
        sourceLangOptions.appendChild(option);
    });
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
    console.log('[sidepanel/sidepanel.ts] 临时移除表单事件监听器');
    formEventListeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
    });
}

/**
 * 重新添加所有表单事件监听器
 */
function reattachFormListeners(): void {
    console.log('[sidepanel/sidepanel.ts] 重新添加表单事件监听器');
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
console.log('[sidepanel/sidepanel.ts] ✅ 双重保护解决方案已加载：');
console.log('[sidepanel/sidepanel.ts] 1. 事件监听器管理系统 - 可以临时移除和重新添加');
console.log('[sidepanel/sidepanel.ts] 2. 静默设置函数 - setValueSilently, setCheckedSilently');
console.log('[sidepanel/sidepanel.ts] 3. 改进的初始化标志管理 - 同步重置 isInitializingSidePanelUI');
console.log('[sidepanel/sidepanel.ts] 4. 增强的saveSettings保护 - 多重检查防止误触发');
console.log('[sidepanel/sidepanel.ts] 🎯 问题：初始化时误发送updateSettings消息 - 预期已解决');