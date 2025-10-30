/**
 * [popup] YouTube字幕翻译助手 - Popup界面
 * YouTube字幕翻译助手 - Popup设置界面
 */

// === 导入相同的依赖 ===
import { targetLanguages, Language } from '../shared/utils/languages';
import { VideoSettingsLocalStorage, VideoSettings } from '../shared/storage/video-settings-local-storage';
import { StorageManager, StorageKeys } from '../shared/storage/storage-manager';
import { isLanguageRelevantToUI } from '../shared/utils/language-processing';
import { 
  UserPreferencesManager
} from '../shared/storage';
import { SubtitleMode, TranslationServiceType, TranslationServiceComplete, TRANSLATION_SERVICE_TEMPLATES, UserPreferences, VideoSourceLanguageCache } from '../shared/types/user-preferences-types';
import { SimplifiedCaptionTrack, TrackMetadata } from '../shared/types/subtitle-types';

const userPreferencesManager = UserPreferencesManager.getInstance();

// 简化初始化日志

// 状态更新已通过Port连接机制自动处理，无需发送消息

// === 防抖工具函数 ===

/**
 * 防抖函数 - 延迟执行直到停止触发
 * @param func 需要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => func(...args), delay);
  };
}

// === 语言族互斥检测工具函数 ===

/**
 * 提取语言代码的基础部分
 * @param langCode 语言代码 (如: "en-US", "zh-CN")
 * @returns 基础语言代码 (如: "en", "zh")
 */
function getBaseLangCode(langCode: string): string {
  // 使用"-"分割语言代码，取第一部分
  const baseCode = langCode.split('-')[0];
  return baseCode;
}

// === 智能排序和搜索优化工具函数 ===

/**
 * 常用语言优先级定义
 * 数字越小优先级越高
 */
const COMMON_LANGUAGES_PRIORITY: Record<string, number> = {
  'zh-CN': 1,  // 中文简体
  'zh-TW': 2,  // 中文繁体
  'en': 3,     // 英语
  'ja': 4,     // 日语
  'ko': 5,     // 韩语
  'es': 6,     // 西班牙语
  'fr': 7,     // 法语
  'de': 8,     // 德语
  'ru': 9,     // 俄语
  'it': 10,    // 意大利语
  'pt': 11,    // 葡萄牙语
  'ar': 12,    // 阿拉伯语
  'th': 13,    // 泰语
  'vi': 14,    // 越南语
  'hi': 15,    // 印地语
};

// === 智能搜索系统 ===

/**
 * 语言代码映射表 - 支持多种语言代码标准
 */
const LANGUAGE_CODE_MAP: Record<string, string[]> = {
  // 中文
  'zh-CN': ['zh', 'zh-Hans', 'zh-CN', 'zh-CHS', 'cmn', 'chi', 'zho'],
  'zh-TW': ['zh-TW', 'zh-Hant', 'zh-CHT', 'zh-HK', 'zh-MO'],
  
  // 英语
  'en': ['en', 'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-NZ', 'en-IE', 'en-ZA', 'eng'],
  
  // 西班牙语
  'es': ['es', 'es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-PE', 'es-VE', 'es-CL', 'es-EC', 'es-UY', 'es-PY', 'es-BO', 'es-GT', 'es-HN', 'es-NI', 'es-CR', 'es-PA', 'es-DO', 'es-PR', 'es-SV', 'spa'],
  
  // 法语
  'fr': ['fr', 'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH', 'fr-LU', 'fr-MC', 'fre', 'fra'],
  
  // 德语
  'de': ['de', 'de-DE', 'de-AT', 'de-CH', 'de-LU', 'de-LI', 'ger', 'deu'],
  
  // 日语
  'ja': ['ja', 'ja-JP', 'jp', 'jpn'],
  
  // 韩语
  'ko': ['ko', 'ko-KR', 'ko-KP', 'kr', 'kor'],
  
  // 俄语
  'ru': ['ru', 'ru-RU', 'ru-BY', 'ru-KZ', 'ru-KG', 'ru-MD', 'ru-UA', 'rus'],
  
  // 意大利语
  'it': ['it', 'it-IT', 'it-SM', 'it-CH', 'it-VA', 'ita'],
  
  // 葡萄牙语
  'pt': ['pt', 'pt-PT', 'pt-BR', 'pt-AO', 'pt-MZ', 'pt-CV', 'pt-GW', 'pt-ST', 'pt-TL', 'por'],
  
  // 阿拉伯语
  'ar': ['ar', 'ar-SA', 'ar-EG', 'ar-DZ', 'ar-MA', 'ar-IQ', 'ar-SD', 'ar-SY', 'ar-TN', 'ar-JO', 'ar-LB', 'ar-KW', 'ar-OM', 'ar-QA', 'ar-BH', 'ar-AE', 'ar-YE', 'ar-LY', 'ara'],
  
  // 印地语
  'hi': ['hi', 'hi-IN', 'hin'],
  
  // 泰语
  'th': ['th', 'th-TH', 'tha'],
  
  // 越南语
  'vi': ['vi', 'vi-VN', 'vie'],
  
  // 荷兰语
  'nl': ['nl', 'nl-NL', 'nl-BE', 'nl-SR', 'dut', 'nld'],
  
  // 土耳其语
  'tr': ['tr', 'tr-TR', 'tr-CY', 'tur'],
  
  // 波兰语
  'pl': ['pl', 'pl-PL', 'pol'],
  
  // 瑞典语
  'sv': ['sv', 'sv-SE', 'sv-FI', 'swe'],
  
  // 挪威语
  'no': ['no', 'no-NO', 'nb', 'nb-NO', 'nn', 'nn-NO', 'nor'],
  
  // 丹麦语
  'da': ['da', 'da-DK', 'da-GL', 'dan'],
  
  // 芬兰语
  'fi': ['fi', 'fi-FI', 'fin'],
  
  // 希腊语
  'el': ['el', 'el-GR', 'el-CY', 'gre', 'ell'],
  
  // 希伯来语
  'he': ['he', 'he-IL', 'iw', 'heb'],
  
  // 匈牙利语
  'hu': ['hu', 'hu-HU', 'hun'],
  
  // 捷克语
  'cs': ['cs', 'cs-CZ', 'cze', 'ces'],
  
  // 斯洛伐克语
  'sk': ['sk', 'sk-SK', 'slo', 'slk'],
  
  // 罗马尼亚语
  'ro': ['ro', 'ro-RO', 'ro-MD', 'rum', 'ron'],
  
  // 保加利亚语
  'bg': ['bg', 'bg-BG', 'bul'],
  
  // 克罗地亚语
  'hr': ['hr', 'hr-HR', 'hr-BA', 'scr', 'hrv'],
  
  // 塞尔维亚语
  'sr': ['sr', 'sr-RS', 'sr-ME', 'sr-BA', 'sr-Cyrl', 'sr-Latn', 'scc', 'srp'],
  
  // 乌克兰语
  'uk': ['uk', 'uk-UA', 'ukr'],
  
  // 立陶宛语
  'lt': ['lt', 'lt-LT', 'lit'],
  
  // 拉脱维亚语
  'lv': ['lv', 'lv-LV', 'lav'],
  
  // 爱沙尼亚语
  'et': ['et', 'et-EE', 'est'],
  
  // 斯洛文尼亚语
  'sl': ['sl', 'sl-SI', 'slv'],
  
  // 马来语
  'ms': ['ms', 'ms-MY', 'ms-BN', 'ms-SG', 'may', 'msa'],
  
  // 印尼语
  'id': ['id', 'id-ID', 'in', 'ind'],
  
  // 他加禄语
  'tl': ['tl', 'tl-PH', 'fil', 'fil-PH', 'tgl'],
  
  // 缅甸语
  'my': ['my', 'my-MM', 'bur', 'mya'],
  
  // 乌尔都语
  'ur': ['ur', 'ur-PK', 'ur-IN', 'urd'],
  
  // 孟加拉语
  'bn': ['bn', 'bn-BD', 'bn-IN', 'ben'],
  
  // 泰米尔语
  'ta': ['ta', 'ta-IN', 'ta-LK', 'ta-SG', 'tam'],
  
  // 古吉拉特语
  'gu': ['gu', 'gu-IN', 'guj'],
  
  // 坎纳达语
  'kn': ['kn', 'kn-IN', 'kan'],
  
  // 马拉雅拉姆语
  'ml': ['ml', 'ml-IN', 'mal'],
  
  // 泰卢固语
  'te': ['te', 'te-IN', 'tel'],
  
  // 马拉地语
  'mr': ['mr', 'mr-IN', 'mar'],
  
  // 旁遮普语
  'pa': ['pa', 'pa-IN', 'pa-PK', 'pan'],
  
  // 尼泊尔语
  'ne': ['ne', 'ne-NP', 'ne-IN', 'nep'],
  
  // 僧伽罗语
  'si': ['si', 'si-LK', 'sin'],
  
  // 哈萨克语
  'kk': ['kk', 'kk-KZ', 'kaz'],
  
  // 吉尔吉斯语
  'ky': ['ky', 'ky-KG', 'kir'],
  
  // 塔吉克语
  'tg': ['tg', 'tg-TJ', 'tgk'],
  
  // 土库曼语
  'tk': ['tk', 'tk-TM', 'tuk'],
  
  // 乌兹别克语
  'uz': ['uz', 'uz-UZ', 'uzb'],
  
  // 蒙古语
  'mn': ['mn', 'mn-MN', 'mon'],
  
  // 波斯语
  'fa': ['fa', 'fa-IR', 'fa-AF', 'per', 'fas'],
  
  // 普什图语
  'ps': ['ps', 'ps-AF', 'ps-PK', 'pus'],
  
  // 库尔德语
  'ku': ['ku', 'ku-TR', 'ku-IQ', 'ku-IR', 'ku-SY', 'kur'],
  
  // 亚美尼亚语
  'hy': ['hy', 'hy-AM', 'arm', 'hye'],
  
  // 格鲁吉亚语
  'ka': ['ka', 'ka-GE', 'geo', 'kat'],
  
  // 阿塞拜疆语
  'az': ['az', 'az-AZ', 'aze']
};

/**
 * 国家代码到语言代码的映射表
 */
const COUNTRY_TO_LANGUAGE_MAP: Record<string, string[]> = {
  'CN': ['zh-CN', 'zh'],
  'TW': ['zh-TW', 'zh-Hant'],
  'HK': ['zh-HK', 'zh-TW'],
  'US': ['en', 'en-US'],
  'UK': ['en', 'en-GB'],
  'GB': ['en', 'en-GB'],
  'AU': ['en', 'en-AU'],
  'CA': ['en', 'en-CA', 'fr', 'fr-CA'],
  'JP': ['ja', 'ja-JP'],
  'KR': ['ko', 'ko-KR'],
  'ES': ['es', 'es-ES'],
  'MX': ['es', 'es-MX'],
  'AR': ['es', 'es-AR'],
  'FR': ['fr', 'fr-FR'],
  'DE': ['de', 'de-DE'],
  'IT': ['it', 'it-IT'],
  'PT': ['pt', 'pt-PT'],
  'BR': ['pt', 'pt-BR'],
  'RU': ['ru', 'ru-RU'],
  'IN': ['hi', 'hi-IN', 'en', 'en-IN'],
  'TH': ['th', 'th-TH'],
  'VN': ['vi', 'vi-VN'],
  'NL': ['nl', 'nl-NL'],
  'TR': ['tr', 'tr-TR'],
  'PL': ['pl', 'pl-PL'],
  'SE': ['sv', 'sv-SE'],
  'NO': ['no', 'no-NO'],
  'DK': ['da', 'da-DK'],
  'FI': ['fi', 'fi-FI'],
  'GR': ['el', 'el-GR'],
  'IL': ['he', 'he-IL'],
  'HU': ['hu', 'hu-HU'],
  'CZ': ['cs', 'cs-CZ'],
  'SK': ['sk', 'sk-SK'],
  'RO': ['ro', 'ro-RO'],
  'BG': ['bg', 'bg-BG'],
  'HR': ['hr', 'hr-HR'],
  'RS': ['sr', 'sr-RS'],
  'UA': ['uk', 'uk-UA'],
  'LT': ['lt', 'lt-LT'],
  'LV': ['lv', 'lv-LV'],
  'EE': ['et', 'et-EE'],
  'SI': ['sl', 'sl-SI'],
  'MY': ['ms', 'ms-MY'],
  'ID': ['id', 'id-ID'],
  'PH': ['tl', 'tl-PH'],
  'MM': ['my', 'my-MM'],
  'PK': ['ur', 'ur-PK'],
  'BD': ['bn', 'bn-BD'],
  'LK': ['si', 'si-LK'],
  'KZ': ['kk', 'kk-KZ'],
  'KG': ['ky', 'ky-KG'],
  'TJ': ['tg', 'tg-TJ'],
  'TM': ['tk', 'tk-TM'],
  'UZ': ['uz', 'uz-UZ'],
  'MN': ['mn', 'mn-MN'],
  'IR': ['fa', 'fa-IR'],
  'AF': ['fa', 'fa-AF', 'ps', 'ps-AF'],
  'AM': ['hy', 'hy-AM'],
  'GE': ['ka', 'ka-GE'],
  'AZ': ['az', 'az-AZ']
};

/**
 * 电话国家代码到语言代码的映射表
 */
const PHONE_COUNTRY_TO_LANGUAGE_MAP: Record<string, string[]> = {
  '86': ['zh-CN', 'zh'],
  '886': ['zh-TW', 'zh-Hant'],
  '852': ['zh-HK', 'zh-TW'],
  '853': ['zh-MO', 'zh-TW'],
  '1': ['en', 'en-US'],
  '44': ['en', 'en-GB'],
  '61': ['en', 'en-AU'],
  '64': ['en', 'en-NZ'],
  '81': ['ja', 'ja-JP'],
  '82': ['ko', 'ko-KR'],
  '34': ['es', 'es-ES'],
  '52': ['es', 'es-MX'],
  '54': ['es', 'es-AR'],
  '33': ['fr', 'fr-FR'],
  '49': ['de', 'de-DE'],
  '39': ['it', 'it-IT'],
  '351': ['pt', 'pt-PT'],
  '55': ['pt', 'pt-BR'],
  '7': ['ru', 'ru-RU'],
  '91': ['hi', 'hi-IN'],
  '66': ['th', 'th-TH'],
  '84': ['vi', 'vi-VN'],
  '31': ['nl', 'nl-NL'],
  '90': ['tr', 'tr-TR'],
  '48': ['pl', 'pl-PL'],
  '46': ['sv', 'sv-SE'],
  '47': ['no', 'no-NO'],
  '45': ['da', 'da-DK'],
  '358': ['fi', 'fi-FI'],
  '30': ['el', 'el-GR'],
  '972': ['he', 'he-IL'],
  '36': ['hu', 'hu-HU'],
  '420': ['cs', 'cs-CZ'],
  '421': ['sk', 'sk-SK'],
  '40': ['ro', 'ro-RO'],
  '359': ['bg', 'bg-BG'],
  '385': ['hr', 'hr-HR'],
  '381': ['sr', 'sr-RS'],
  '380': ['uk', 'uk-UA'],
  '370': ['lt', 'lt-LT'],
  '371': ['lv', 'lv-LV'],
  '372': ['et', 'et-EE'],
  '386': ['sl', 'sl-SI'],
  '60': ['ms', 'ms-MY'],
  '62': ['id', 'id-ID'],
  '63': ['tl', 'tl-PH'],
  '95': ['my', 'my-MM'],
  '92': ['ur', 'ur-PK'],
  '880': ['bn', 'bn-BD'],
  '94': ['si', 'si-LK'],
  '76': ['kk', 'kk-KZ'],
  '996': ['ky', 'ky-KG'],
  '992': ['tg', 'tg-TJ'],
  '993': ['tk', 'tk-TM'],
  '998': ['uz', 'uz-UZ'],
  '976': ['mn', 'mn-MN'],
  '98': ['fa', 'fa-IR'],
  '93': ['ps', 'ps-AF'],
  '374': ['hy', 'hy-AM'],
  '995': ['ka', 'ka-GE'],
  '994': ['az', 'az-AZ']
};

/**
 * 语言缩写映射表
 */
const LANGUAGE_ABBREVIATION_MAP: Record<string, string[]> = {
  'zh-CN': ['中文', '中', '简体', '简', 'Chinese', 'CN', 'Simplified', 'ZH'],
  'zh': ['中文', '中', '简体', '简', 'Chinese', 'CN', 'Simplified', 'ZH'],
  'zh-TW': ['繁体', '繁', 'Traditional', 'TW', 'Hant'],
  'en': ['英文', '英', 'English', 'Eng', 'EN'],
  'en-US': ['英文', '英', 'English', 'Eng', 'EN', 'US'],
  'en-GB': ['英文', '英', 'English', 'Eng', 'EN', 'GB'],
  'ja': ['日文', '日', 'Japanese', 'JP'],
  'ko': ['韩文', '韩', '朝鲜文', 'Korean', 'KR'],
  'es': ['西班牙文', '西', 'Spanish', 'Español', 'ES'],
  'es-ES': ['西班牙文', '西', 'Spanish', 'Español', 'ES'],
  'es-419': ['西班牙文', '西', 'Spanish', 'Español', 'ES'],
  'fr': ['法文', '法', 'French', 'Français', 'FR'],
  'fr-FR': ['法文', '法', 'French', 'Français', 'FR'],
  'de': ['德文', '德', 'German', 'Deutsch', 'DE'],
  'de-DE': ['德文', '德', 'German', 'Deutsch', 'DE'],
  'ru': ['俄文', '俄', 'Russian', 'Русский'],
  'it': ['意大利文', '意', 'Italian', 'Italiano'],
  'pt': ['葡萄牙文', '葡', 'Portuguese', 'Português'],
  'ar': ['阿拉伯文', '阿', 'Arabic', 'العربية'],
  'hi': ['印地文', '印', 'Hindi', 'हिन्दी'],
  'th': ['泰文', '泰', 'Thai', 'ไทย'],
  'vi': ['越南文', '越', 'Vietnamese', 'Tiếng Việt'],
  'nl': ['荷兰文', '荷', 'Dutch', 'Nederlands'],
  'tr': ['土耳其文', '土', 'Turkish', 'Türkçe'],
  'pl': ['波兰文', '波', 'Polish', 'Polski'],
  'sv': ['瑞典文', '瑞', 'Swedish', 'Svenska'],
  'no': ['挪威文', '挪', 'Norwegian', 'Norsk'],
  'da': ['丹麦文', '丹', 'Danish', 'Dansk'],
  'fi': ['芬兰文', '芬', 'Finnish', 'Suomi'],
  'el': ['希腊文', '希', 'Greek', 'Ελληνικά'],
  'he': ['希伯来文', '希伯来', 'Hebrew', 'עברית'],
  'hu': ['匈牙利文', '匈', 'Hungarian', 'Magyar'],
  'cs': ['捷克文', '捷', 'Czech', 'Čeština'],
  'sk': ['斯洛伐克文', '斯洛伐克', 'Slovak', 'Slovenčina'],
  'ro': ['罗马尼亚文', '罗马尼亚', 'Romanian', 'Română'],
  'bg': ['保加利亚文', '保加利亚', 'Bulgarian', 'Български'],
  'hr': ['克罗地亚文', '克罗地亚', 'Croatian', 'Hrvatski'],
  'sr': ['塞尔维亚文', '塞尔维亚', 'Serbian', 'Српски'],
  'uk': ['乌克兰文', '乌克兰', 'Ukrainian', 'Українська'],
  'lt': ['立陶宛文', '立陶宛', 'Lithuanian', 'Lietuvių'],
  'lv': ['拉脱维亚文', '拉脱维亚', 'Latvian', 'Latviešu'],
  'et': ['爱沙尼亚文', '爱沙尼亚', 'Estonian', 'Eesti'],
  'sl': ['斯洛文尼亚文', '斯洛文尼亚', 'Slovenian', 'Slovenščina'],
  'ms': ['马来文', '马来', 'Malay', 'Bahasa Melayu'],
  'id': ['印尼文', '印尼', 'Indonesian', 'Bahasa Indonesia'],
  'tl': ['他加禄文', '他加禄', 'Tagalog', 'Filipino'],
  'my': ['缅甸文', '缅甸', 'Myanmar', 'Burmese'],
  'ur': ['乌尔都文', '乌尔都', 'Urdu', 'اردو'],
  'bn': ['孟加拉文', '孟加拉', 'Bengali', 'বাংলা'],
  'ta': ['泰米尔文', '泰米尔', 'Tamil', 'தமிழ்'],
  'gu': ['古吉拉特文', '古吉拉特', 'Gujarati', 'ગુજરાતી'],
  'kn': ['坎纳达文', '坎纳达', 'Kannada', 'ಕನ್ನಡ'],
  'ml': ['马拉雅拉姆文', '马拉雅拉姆', 'Malayalam', 'മലയാളം'],
  'te': ['泰卢固文', '泰卢固', 'Telugu', 'తెలుగు'],
  'mr': ['马拉地文', '马拉地', 'Marathi', 'मराठी'],
  'pa': ['旁遮普文', '旁遮普', 'Punjabi', 'ਪੰਜਾਬੀ'],
  'ne': ['尼泊尔文', '尼泊尔', 'Nepali', 'नेपाली'],
  'si': ['僧伽罗文', '僧伽罗', 'Sinhala', 'සිංහල'],
  'kk': ['哈萨克文', '哈萨克', 'Kazakh', 'Қазақша'],
  'ky': ['吉尔吉斯文', '吉尔吉斯', 'Kyrgyz', 'Кыргызча'],
  'tg': ['塔吉克文', '塔吉克', 'Tajik', 'Тоҷикӣ'],
  'tk': ['土库曼文', '土库曼', 'Turkmen', 'Türkmençe'],
  'uz': ['乌兹别克文', '乌兹别克', 'Uzbek', 'Oʻzbekcha'],
  'mn': ['蒙古文', '蒙古', 'Mongolian', 'Монгол'],
  'fa': ['波斯文', '波斯', 'Persian', 'فارسی'],
  'ps': ['普什图文', '普什图', 'Pashto', 'پښتو'],
  'ku': ['库尔德文', '库尔德', 'Kurdish', 'Kurdî'],
  'hy': ['亚美尼亚文', '亚美尼亚', 'Armenian', 'Հայերեն'],
  'ka': ['格鲁吉亚文', '格鲁吉亚', 'Georgian', 'ქართული'],
  'az': ['阿塞拜疆文', '阿塞拜疆', 'Azerbaijani', 'Azərbaycan']
};

/**
 * 简化的语言搜索系统
 * 为每个语言生成完整的搜索关键词列表，然后进行逐字母匹配
 */
function generateSearchKeywords(language: Language): string[] {
  const keywords: string[] = [];
  const langCode = language.code.toLowerCase();
  
  // 1. 语言代码
  keywords.push(langCode);
  
  // 2. 基础语言代码 (zh-CN → zh)
  const baseLangCode = getBaseLangCode(langCode);
  if (baseLangCode !== langCode) {
    keywords.push(baseLangCode);
  }
  
  // 3. 去掉分隔符的语言代码 (zh-CN → zhcn)
  const normalizedCode = langCode.replace('-', '');
  if (normalizedCode !== langCode) {
    keywords.push(normalizedCode);
  }
  
  // 4. 语言名称
  keywords.push(language.name.toLowerCase());
  
  // 5. 英文名称
  if (language.englishName) {
    keywords.push(language.englishName.toLowerCase());
  }
  
  // 6. 缩写和别名
  const abbreviations = LANGUAGE_ABBREVIATION_MAP[langCode] || [];
  for (const abbr of abbreviations) {
    keywords.push(abbr.toLowerCase());
  }
  
  // 7. 多标准语言代码
  const allCodes = LANGUAGE_CODE_MAP[langCode] || [];
  for (const code of allCodes) {
    keywords.push(code.toLowerCase());
  }
  
  // 8. 国家代码 (从 regionCode 获取)
  if (language.regionCode) {
    keywords.push(language.regionCode.toLowerCase());
  }
  
  // 9. 电话国家代码 (从 callingCode 获取)
  if (language.callingCode) {
    const phoneCode = language.callingCode.replace('+', '');
    keywords.push(phoneCode);
  }
  
  // 10. 从国家代码映射表中获取相关国家代码
  for (const [countryCode, languages] of Object.entries(COUNTRY_TO_LANGUAGE_MAP)) {
    for (const countryLang of languages) {
      if (getBaseLangCode(countryLang) === baseLangCode) {
        keywords.push(countryCode.toLowerCase());
      }
    }
  }
  
  // 11. 从电话国家代码映射表中获取相关代码
  for (const [phoneCode, languages] of Object.entries(PHONE_COUNTRY_TO_LANGUAGE_MAP)) {
    for (const phoneLang of languages) {
      if (getBaseLangCode(phoneLang) === baseLangCode) {
        keywords.push(phoneCode);
      }
    }
  }

  // 去重并返回
  return Array.from(new Set(keywords));
}

/**
 * 主流语言搜索函数 - 模仿Google/VS Code的前缀匹配体验
 * 严格前缀匹配：输入即显示，不匹配即隐藏
 */
function matchLanguageMainstream(language: Language, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  
  const term = searchTerm.toLowerCase().trim();
  const keywords = generateSearchKeywords(language);
  
  // 核心逻辑：只要有任何关键词从开头匹配就返回true
  // 输入"zh" → 匹配"zh-cn", "zh-tw"等
  // 输入"中" → 匹配"中文"等
  return keywords.some(keyword => keyword.startsWith(term));
}

/**
 * 获取语言的优先级权重
 * @param langCode 语言代码
 * @returns 优先级权重，数字越小优先级越高
 */
function getLanguagePriority(langCode: string): number {
  const baseCode = getBaseLangCode(langCode);
  const priority = COMMON_LANGUAGES_PRIORITY[langCode] || COMMON_LANGUAGES_PRIORITY[baseCode] || 1000;
  
  // 调试日志
  if (langCode === 'auto') {
    console.log(`[DEBUG] getLanguagePriority(${langCode}): baseCode=${baseCode}, priority=${priority}`);
  }
  
  return priority;
}

/**
 * 获取本地化的语言名称
 * @param langCode 语言代码
 * @param fallbackName 后备名称
 * @returns 本地化的语言名称
 */
function getLocalizedLanguageName(langCode: string, fallbackName: string): string {
  // 尝试获取本地化语言名称
  const i18nKey = 'lang_' + langCode.replace(/-/g, '_');
  const localizedName = chrome.i18n.getMessage(i18nKey);
  
  if (localizedName && localizedName.trim() !== '') {
    return localizedName;
  }
  
  // 如果没有找到本地化名称，使用后备名称
  return fallbackName;
}

/**
 * 增强的目标语言显示名称生成
 * @param language 语言对象
 * @returns 优化后的显示名称
 */
function generateTargetLanguageDisplayName(language: Language): string {
  // 获取本地化名称，统一不显示语言代码，保持界面简洁
  const localizedName = getLocalizedLanguageName(language.code, language.name);
  return localizedName;
}

/**
 * 简化的语言匹配函数 - 保持向后兼容
 */
function matchLanguage(language: Language, searchTerm: string): { match: boolean; score: number } {
  const match = matchLanguageMainstream(language, searchTerm);
  return { match, score: match ? 100 : 0 };
}

/**
 * 主流语言排序 - 相关性 + 常用性 + 字母顺序
 * 简化排序策略，符合主流产品体验
 */
function sortLanguagesMainstream(languages: Language[], searchTerm: string = ''): Language[] {
  return languages
    .filter(lang => matchLanguageMainstream(lang, searchTerm)) // 匹配→显示，不匹配→隐藏
    .sort((a, b) => {
      if (!searchTerm.trim()) {
        // 无搜索：按预设优先级（中文>英语>日语...）
        const priorityA = getLanguagePriority(a.code);
        const priorityB = getLanguagePriority(b.code);
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.name.localeCompare(b.name);
      }
      
      // 有搜索：代码匹配优先 + 常用性微调 + 字母顺序
      const term = searchTerm.toLowerCase();
      const aCodeMatch = a.code.toLowerCase().startsWith(term);
      const bCodeMatch = b.code.toLowerCase().startsWith(term);
      
      if (aCodeMatch && !bCodeMatch) return -1;
      if (!aCodeMatch && bCodeMatch) return 1;
      
      // 优先级微调
      const priorityDiff = getLanguagePriority(a.code) - getLanguagePriority(b.code);
      return priorityDiff !== 0 ? priorityDiff : a.name.localeCompare(b.name);
    });
}

/**
 * 轨道数据搜索匹配函数 - 使用主流匹配方式
 */
function matchTrackData(trackInfo: any, searchTerm: string): { match: boolean; score: number } {
  // 将轨道数据转换为Language对象以使用主流搜索
  const languageObj: Language = {
    code: trackInfo.languageCode,
    name: trackInfo.languageName || trackInfo.name || trackInfo.languageCode,
    englishName: trackInfo.languageName || trackInfo.name || trackInfo.languageCode
  };
  
  const match = matchLanguageMainstream(languageObj, searchTerm);
  return { match, score: match ? 100 : 0 };
}

/**
 * 轨道数据主流排序 - 简化版本
 */
function sortTrackData(trackData: any[], searchTerm: string = ''): any[] {
  return trackData
    .filter(track => matchTrackData(track, searchTerm).match) // 匹配→显示，不匹配→隐藏
    .sort((a, b) => {
      if (!searchTerm.trim()) {
        // 没有搜索词时，保持API返回的原始顺序
        return 0;
      }
      
      // 有搜索：代码匹配优先 + 常用性微调 + 字母顺序
      const term = searchTerm.toLowerCase();
      const aCodeMatch = a.languageCode.toLowerCase().startsWith(term);
      const bCodeMatch = b.languageCode.toLowerCase().startsWith(term);
      
      if (aCodeMatch && !bCodeMatch) return -1;
      if (!aCodeMatch && bCodeMatch) return 1;
      
      // 优先级微调
      const priorityDiff = getLanguagePriority(a.languageCode) - getLanguagePriority(b.languageCode);
      return priorityDiff !== 0 ? priorityDiff : generateLanguageDisplayName(a).localeCompare(generateLanguageDisplayName(b));
    });
}

/**
 * 检查两个语言是否属于同一语言族
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns true表示属于同一语言族（应该互斥），false表示可以配对使用
 */
function isSameLanguageFamily(sourceLang: string, targetLang: string): boolean {
  // 提取两个语言的基础代码
  const sourceBase = getBaseLangCode(sourceLang);
  const targetBase = getBaseLangCode(targetLang);
  
  // 比较基础代码是否相同
  const isSame = sourceBase === targetBase;
  
  // 只在发生互斥时打印日志
  if (isSame) {
    console.log(`[popup] 语言族互斥检测: ${sourceLang} (${sourceBase}) 与 ${targetLang} (${targetBase}) 属于同一语言族`);
  }
  
  return isSame;
}

/**
 * 获取当前选中的目标语言代码
 * @returns 目标语言代码或null
 */
function getCurrentTargetLanguage(): string | null {
  if (!targetLangSelectedValue) return null;
  
  // 从显示文本反向查找目标语言代码
  const displayText = targetLangSelectedValue.textContent;
  if (!displayText || displayText === '选择语言...') return null;
  
  // 在targetLanguages中查找匹配的语言
  const targetLang = targetLanguages.find(lang => lang.name === displayText);
  return targetLang ? targetLang.code : null;
}

// === API相关接口和配置 ===
interface ApiInfo {
  name: string;
  infoUrl: string;
  requiresKey: boolean;
  customConfig: boolean;
  description: string;
  badgeType: 'free' | 'key';
}

/** API配置和信息映射 */
const apiInfoMap: Record<string, ApiInfo> = {
  'google-free': {
    name: 'Google翻译',
    infoUrl: 'https://cloud.google.com/translate/docs/getting-started',
    requiresKey: false,
    customConfig: false,
    description: '无需额外配置，直接使用内置免费额度。',
    badgeType: 'free'
  },
  'microsoft-free': {
    name: '微软翻译',
    infoUrl: 'https://www.microsoft.com/zh-cn/translator/',
    requiresKey: false,
    customConfig: false,
    description: '无需配置，自动调用微软免费接口。',
    badgeType: 'free'
  },
  'deepl': {
    name: 'DeepL API',
    infoUrl: 'https://www.deepl.com/pro-api',
    requiresKey: true,
    customConfig: false,
    description: '',
    badgeType: 'key'
  },
  'openai': {
    name: 'OpenAI API',
    infoUrl: 'https://platform.openai.com/docs/guides/text-generation',
    requiresKey: true,
    customConfig: false,
    description: '',
    badgeType: 'key'
  },
  'gemini': {
    name: 'Gemini API',
    infoUrl: 'https://ai.google.dev/docs',
    requiresKey: true,
    customConfig: false,
    description: '',
    badgeType: 'key'
  },
  'deepseek': {
    name: 'DeepSeek API',
    infoUrl: 'https://platform.deepseek.com/',
    requiresKey: true,
    customConfig: false,
    description: '',
    badgeType: 'key'
  }
};

// === 全局变量 ===
let currentTabId: number | null = null;
let currentVideoId: string | null = null;
let sidePanelInitialized = false;
let isYouTubePage = false;
let currentTargetLang = 'en';
let currentSourceLang = '';
let currentSourceTrackKind: 'asr' | 'forced' | undefined = undefined;
let uiTrackData: Array<{ languageCode: string; languageName: string; kind?: 'asr' | 'forced' }> = [];
let uiLangCode: string | null = null;
let serviceCardTitle: HTMLSpanElement | null = null;
let serviceCardBadge: HTMLSpanElement | null = null;

// === Port连接管理 ===
const port = chrome.runtime.connect({ name: 'popup-lifecycle' });
console.log('[popup] Port连接已建立');

// 发送标签页ID给service-worker（用于关闭时的UI更新）
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.id) {
    port.postMessage({ type: 'init', tabId: tabs[0].id });
    console.log(`[popup] 已发送标签页ID: ${tabs[0].id}`);
  }
});

// === 生命周期管理 ===
// 关闭和失焦事件已通过Port断开机制处理，无需额外消息

port.onDisconnect.addListener(() => {
  console.log('[popup] Port连接断开');
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
  console.log('[popup] 显示使用说明界面');
  
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
let sourceLangSearch: HTMLInputElement | null = null;
let sourceLangOptions: HTMLDivElement | null = null;
let targetLangContainer: HTMLDivElement | null = null;
let targetLangTrigger: HTMLDivElement | null = null;
let targetLangSelectedValue: HTMLSpanElement | null = null;
let targetLangPanel: HTMLDivElement | null = null;
let targetLangSearch: HTMLInputElement | null = null;
let targetLangOptions: HTMLDivElement | null = null;
let subtitleTypeTranslate: HTMLInputElement | null = null;
let subtitleTypeBilingual: HTMLInputElement | null = null;
let translationApiSelect: HTMLSelectElement | null = null;
let apiKeyInput: HTMLInputElement | null = null;
let apiInfoLink: HTMLAnchorElement | null = null;
let customApiPanel: HTMLDivElement | null = null;
let testApiKeyButton: HTMLButtonElement | null = null;
let modelSelect: HTMLSelectElement | null = null;
let togglePasswordButton: HTMLButtonElement | null = null;

// === Gemini相关元素引用（仍需要用于事件监听和状态读取） ===
let geminiModelSelect: HTMLSelectElement | null = null;
let geminiTierFree: HTMLInputElement | null = null;
let geminiTierPaid: HTMLInputElement | null = null;

// === DeepL相关元素引用（仍需要用于事件监听和状态读取） ===
let deeplModelSelect: HTMLSelectElement | null = null;
let deeplTierFree: HTMLInputElement | null = null;
let deeplTierPaid: HTMLInputElement | null = null;

// === OpenAI格式开关（实验性功能） ===
let useImmersiveFormatCheckbox: HTMLInputElement | null = null;
let openaiFormatSwitchContainer: HTMLDivElement | null = null;

/**
 * 初始化DOM元素引用（仅在YouTube页面调用）
 */
function initializeDOMElements(): void {
  sourceLangContainer = document.getElementById('source-language-container') as HTMLDivElement;
  sourceLangTrigger = document.getElementById('source-language-trigger') as HTMLDivElement;
  sourceLangSelectedValue = sourceLangTrigger?.querySelector('.selected-value') as HTMLSpanElement;
  sourceLangPanel = document.getElementById('source-language-panel') as HTMLDivElement;
  sourceLangSearch = document.getElementById('source-language-search') as HTMLInputElement;
  sourceLangOptions = document.getElementById('source-language-options') as HTMLDivElement | null;
  
  // 调试：检查DOM元素是否正确获取
  console.log('[popup] DOM元素获取状态:', {
    sourceLangContainer: !!sourceLangContainer,
    sourceLangTrigger: !!sourceLangTrigger,
    sourceLangSelectedValue: !!sourceLangSelectedValue,
    sourceLangPanel: !!sourceLangPanel,
    sourceLangSearch: !!sourceLangSearch,
    sourceLangOptions: !!sourceLangOptions
  });
  
  targetLangContainer = document.getElementById('target-language-container') as HTMLDivElement;
  targetLangTrigger = document.getElementById('target-language-trigger') as HTMLDivElement;
  targetLangSelectedValue = targetLangTrigger?.querySelector('.selected-value') as HTMLSpanElement;
  targetLangPanel = document.getElementById('target-language-panel') as HTMLDivElement;
  targetLangSearch = document.getElementById('target-language-search') as HTMLInputElement;
  targetLangOptions = document.getElementById('target-language-options') as HTMLDivElement;
  
  subtitleTypeTranslate = document.getElementById('subtitle-type-translate') as HTMLInputElement;
  subtitleTypeBilingual = document.getElementById('subtitle-type-bilingual') as HTMLInputElement;
  translationApiSelect = document.getElementById('translation-api') as HTMLSelectElement;
  apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  apiInfoLink = document.getElementById('api-info-link') as HTMLAnchorElement;
  customApiPanel = document.getElementById('custom-api-panel') as HTMLDivElement;
  testApiKeyButton = document.getElementById('test-api-key') as HTMLButtonElement;
  modelSelect = document.getElementById('openai-model') as HTMLSelectElement;
  togglePasswordButton = document.getElementById('toggle-password') as HTMLButtonElement;
  serviceCardTitle = document.getElementById('service-card-title') as HTMLSpanElement;
  serviceCardBadge = document.getElementById('service-card-badge') as HTMLSpanElement;

  // === Gemini/DeepL 元素引用（用于事件监听和状态读取） ===
  geminiModelSelect = document.getElementById('gemini-model') as HTMLSelectElement;
  geminiTierFree = document.getElementById('gemini-tier-free') as HTMLInputElement;
  geminiTierPaid = document.getElementById('gemini-tier-paid') as HTMLInputElement;
  deeplModelSelect = document.getElementById('deepl-model') as HTMLSelectElement;
  deeplTierFree = document.getElementById('deepl-tier-free') as HTMLInputElement;
  deeplTierPaid = document.getElementById('deepl-tier-paid') as HTMLInputElement;

  // === OpenAI格式开关 ===
  useImmersiveFormatCheckbox = document.getElementById('use-immersive-format') as HTMLInputElement;
  openaiFormatSwitchContainer = document.getElementById('openai-format-switch') as HTMLDivElement;

}

/**
 * 根据选择的API类型更新界面显示的面板
 * @param apiType 当前选择的API类型
 */
function updateApiPanels(apiType: string): void {
  console.log(`[popup] 更新API面板（固定布局）: ${apiType}`);

  // 获取新的统一面板
  const apiKeyPanel = document.getElementById('api-key-panel');
  const unifiedModelPanel = document.getElementById('unified-model-panel');
  const unifiedTierPanel = document.getElementById('unified-tier-panel');

  // 移除所有 active 类
  document.querySelectorAll('.model-select').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tier-switch-container').forEach(el => el.classList.remove('active'));

  // 移除所有 hidden-but-occupy 类（默认显示所有行）
  apiKeyPanel?.classList.remove('hidden-but-occupy');
  unifiedModelPanel?.classList.remove('hidden-but-occupy');
  unifiedTierPanel?.classList.remove('hidden-but-occupy');

  // 默认隐藏OpenAI格式开关（仅OpenAI服务时显示）
  if (openaiFormatSwitchContainer) {
    openaiFormatSwitchContainer.style.display = 'none';
  }

  // 根据API类型显示相应面板
  const apiInfo = apiInfoMap[apiType];
  if (serviceCardTitle) {
    serviceCardTitle.textContent = apiInfo ? apiInfo.name : '翻译服务';
  }
  if (serviceCardBadge) {
    const isFree = apiInfo?.badgeType === 'free';
    serviceCardBadge.textContent = isFree ? '免费' : '自有密钥';
    serviceCardBadge.classList.toggle('is-free', isFree);
  }

  // 非付费API，不显示任何面板
  if (!apiInfo) {
    console.log(`[popup] 未找到API信息: ${apiType}`);
    return;
  }

  // === 根据服务类型决定显示/隐藏哪些元素 ===

  if (apiType === 'google-free' || apiType === 'microsoft-free') {
    // Google/Microsoft免费：隐藏所有配置行（但保持占位）
    apiKeyPanel?.classList.add('hidden-but-occupy');
    unifiedModelPanel?.classList.add('hidden-but-occupy');
    unifiedTierPanel?.classList.add('hidden-but-occupy');
  }
  else if (apiType === 'deepseek') {
    // DeepSeek：只显示API密钥，隐藏模型和tier
    unifiedModelPanel?.classList.add('hidden-but-occupy');
    unifiedTierPanel?.classList.add('hidden-but-occupy');

    // 更新API密钥提示链接
    if (apiInfoLink && apiInfo.infoUrl) {
      apiInfoLink.href = apiInfo.infoUrl;
      apiInfoLink.textContent = `如何获取${apiInfo.name}API密钥？`;
    }
  }
  else if (apiType === 'openai') {
    // OpenAI：显示API密钥 + 模型，隐藏tier
    const openaiModelSelect = document.getElementById('openai-model');
    openaiModelSelect?.classList.add('active');
    unifiedTierPanel?.classList.add('hidden-but-occupy');

    // 显示OpenAI格式开关
    if (openaiFormatSwitchContainer) {
      openaiFormatSwitchContainer.style.display = 'block';
    }

    // 更新API密钥提示链接
    if (apiInfoLink && apiInfo.infoUrl) {
      apiInfoLink.href = apiInfo.infoUrl;
      apiInfoLink.textContent = `如何获取${apiInfo.name}API密钥？`;
    }
  }
  else if (apiType === 'gemini') {
    // Gemini：显示所有（API密钥 + 模型 + tier）
    const geminiModelSelect = document.getElementById('gemini-model');
    const geminiTierSwitch = document.querySelector('.tier-switch-container[data-service="gemini"]');
    geminiModelSelect?.classList.add('active');
    geminiTierSwitch?.classList.add('active');

    // 更新API密钥提示链接
    if (apiInfoLink && apiInfo.infoUrl) {
      apiInfoLink.href = apiInfo.infoUrl;
      apiInfoLink.textContent = `如何获取${apiInfo.name}API密钥？`;
    }
  }
  else if (apiType === 'deepl') {
    // DeepL：显示所有（API密钥 + 模型 + tier）
    const deeplModelSelect = document.getElementById('deepl-model');
    const deeplTierSwitch = document.querySelector('.tier-switch-container[data-service="deepl"]');
    deeplModelSelect?.classList.add('active');
    deeplTierSwitch?.classList.add('active');

    // 更新API密钥提示链接
    if (apiInfoLink && apiInfo.infoUrl) {
      apiInfoLink.href = apiInfo.infoUrl;
      apiInfoLink.textContent = `如何获取${apiInfo.name}API密钥？`;
    }
  }

  // 处理自定义API（如果需要）
  if (apiInfo.customConfig && customApiPanel) {
    customApiPanel.style.display = 'block';
    customApiPanel.classList.add('visible');
  }

  console.log(`[popup] 固定布局更新完成: ${apiType}`);
}

/**
 * 清空测试结果显示
 */
function resetTestResult(): void {
  const testResult = document.getElementById('test-result') as HTMLSpanElement | null;
  if (!testResult) {
    return;
  }
  testResult.textContent = '';
  testResult.className = 'test-result';
}
    
/**
 * 初始化目标语言列表
 */
function populateTargetLanguages(searchTerm: string = ''): void {
  if (!targetLangOptions) return;
  
  targetLangOptions.innerHTML = '';
  
  // 使用主流搜索系统过滤和排序目标语言
  const filteredLanguages = sortLanguagesMainstream(targetLanguages, searchTerm);
  
  filteredLanguages.forEach(lang => {
    const option = document.createElement('div');
    option.className = 'custom-select-option';
    const displayName = generateTargetLanguageDisplayName(lang);

    // 应用语言族互斥逻辑：如果与源语言属于同一语言族，设为禁用状态
    if (currentSourceLang && currentSourceLang !== 'auto' && isSameLanguageFamily(currentSourceLang, lang.code)) {
      option.classList.add('disabled');
      option.setAttribute('data-disabled-reason', 'same-language-family');
      option.title = `无法选择同语言族的语言：${lang.name} 与源语言冲突`;

      // 创建语言名称元素
      const nameSpan = document.createElement('span');
      nameSpan.textContent = displayName;

      // 创建提示文字元素
      const hintSpan = document.createElement('span');
      hintSpan.className = 'disabled-hint';
      hintSpan.textContent = '（与源语言相同）';

      option.appendChild(nameSpan);
      option.appendChild(hintSpan);

      console.log(`[popup] populateTargetLanguages: 目标语言 ${lang.code} 因与源语言 ${currentSourceLang} 冲突而被禁用`);
    } else {
      option.textContent = displayName;
    }

    option.dataset.value = lang.code;

    // 高亮当前选中的目标语言
    if (currentTargetLang && lang.code === currentTargetLang) {
      option.classList.add('selected');
    }

    // 不再在这里绑定事件，改用事件委托（见 addEventListeners 函数）

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
    await userPreferencesManager.updateUserPreferences({ targetLang: langCode });
    console.log('[popup] 目标语言已保存:', langCode);

    // 更新全局变量（关键！让源语言互斥检测能用到最新值）
    currentTargetLang = langCode;

    // 重新填充源语言列表以应用语言族互斥逻辑
    populateSourceLanguages();

    console.log('[popup] 目标语言已保存:', langCode, '，源语言列表已更新');
    console.log(`[popup] 语言族互斥检测已应用，当前目标语言: ${langCode}`);
  } catch (error) {
    console.error('[popup] 保存目标语言失败:', error);
    }
}

// 创建防抖版本的保存函数，避免快速连续触发
const debouncedSaveTargetLanguage = debounce(saveTargetLanguage, 300);

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

  // 测试API连接按钮
  if (testApiKeyButton) {
    testApiKeyButton.addEventListener('click', () => handleTestApiConnection());
  }

  // 密码显示/隐藏切换按钮
  if (togglePasswordButton && apiKeyInput) {
    togglePasswordButton.addEventListener('click', () => {
      if (!togglePasswordButton || !apiKeyInput) return;

      const eyeOpen = togglePasswordButton.querySelector('.eye-open') as SVGElement;
      const eyeClosed = togglePasswordButton.querySelector('.eye-closed') as SVGElement;

      if (apiKeyInput.type === 'password') {
        // 切换到显示密码 → 显示睁眼图标（能看到了）
        apiKeyInput.type = 'text';
        if (eyeOpen) eyeOpen.style.display = 'block';
        if (eyeClosed) eyeClosed.style.display = 'none';
      } else {
        // 切换到隐藏密码 → 显示闭眼图标（看不到了）
        apiKeyInput.type = 'password';
        if (eyeOpen) eyeOpen.style.display = 'none';
        if (eyeClosed) eyeClosed.style.display = 'block';
      }
    });
  }

  if (apiKeyInput) {
    apiKeyInput.addEventListener('input', () => resetTestResult());
  }

  // 源语言下拉菜单
  if (sourceLangTrigger) {
    sourceLangTrigger.addEventListener('click', () => {
      if (sourceLangPanel) {
        const isVisible = sourceLangPanel.style.display === 'block';
        sourceLangPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
          console.log('[popup] 源语言下拉菜单点击，uiTrackData:', uiTrackData);
          populateSourceLanguages();
          if (sourceLangSearch) {
            sourceLangSearch.focus();
          }
        }
      }
    });
  }
  
  // 源语言搜索
  if (sourceLangSearch) {
    sourceLangSearch.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value;
      populateSourceLanguages(searchTerm);
    });
  }

  // === 目标语言选项的事件委托 ===
  // 使用事件委托处理所有目标语言选项的点击，避免重复绑定
  if (targetLangOptions) {
    targetLangOptions.addEventListener('click', (e) => {
      // 使用closest找到被点击的option元素
      const option = (e.target as HTMLElement).closest('.custom-select-option') as HTMLElement;
      if (!option) return;

      // 检查是否被禁用
      if (option.classList.contains('disabled')) {
        console.log('[popup] 尝试选择被禁用的目标语言:', option.dataset.value);
        return;
      }

      const langCode = option.dataset.value;
      if (!langCode) return;

      const lang = targetLanguages.find(l => l.code === langCode);
      if (!lang) return;

      console.log('[popup] 事件委托 - 选择目标语言:', langCode);

      // 更新显示文本
      if (targetLangSelectedValue) {
        targetLangSelectedValue.textContent = generateTargetLanguageDisplayName(lang);
      }

      // 关闭下拉面板
      if (targetLangPanel) {
        targetLangPanel.style.display = 'none';
      }

      // 保存语言设置（使用防抖版本，避免快速连续触发）
      debouncedSaveTargetLanguage(langCode);
    });
  }

  // === 源语言选项的事件委托 ===
  // 使用事件委托处理所有源语言选项的点击，避免重复绑定
  if (sourceLangOptions) {
    sourceLangOptions.addEventListener('click', async (e) => {
      // 使用closest找到被点击的option元素
      const option = (e.target as HTMLElement).closest('.custom-select-option') as HTMLElement;
      if (!option) return;

      // 检查是否被禁用
      if (option.classList.contains('disabled')) {
        console.log('[popup] 尝试选择被禁用的源语言:', option.dataset.value);
        return;
      }

      const languageCode = option.dataset.value;
      const trackKind = option.dataset.kind as 'asr' | 'forced' | undefined;

      if (!languageCode) return;

      // 从uiTrackData找到完整的track信息
      const trackInfo = uiTrackData?.find(t =>
        t.languageCode === languageCode && t.kind === trackKind
      );

      if (!trackInfo) {
        console.warn('[popup] 未找到对应的track信息:', { languageCode, trackKind });
        return;
      }

      console.log('[popup] 事件委托 - 选择源语言:', {
        videoId: currentVideoId,
        languageCode,
        trackKind: trackKind ?? 'manual'
      });

      // 更新当前选中状态
      currentSourceLang = languageCode;
      currentSourceTrackKind = trackKind;

      // 更新UI显示
      updateSourceLanguageDisplay(languageCode, trackKind);

      // 关闭下拉面板
      if (sourceLangPanel) {
        sourceLangPanel.style.display = 'none';
      }

      // 保存设置（使用防抖版本，避免快速连续触发）
      console.log('[popup] 事件委托 - 准备保存源语言:', {
        languageCode,
        trackKind,
        videoId: currentVideoId
      });
      debouncedSaveSourceLanguage(languageCode, trackKind);

      // 重新填充目标语言列表以应用语言族互斥
      populateTargetLanguages();

      console.log(`[popup] 源语言已选择: ${languageCode} (${trackKind ?? 'manual'})，目标语言列表已更新`);
    });
  }

  // 点击外部关闭下拉菜单
  document.addEventListener('click', (e) => {
    if (!targetLangContainer?.contains(e.target as Node)) {
      if (targetLangPanel) {
        targetLangPanel.style.display = 'none';
      }
    }
    if (!sourceLangContainer?.contains(e.target as Node)) {
      if (sourceLangPanel) {
        sourceLangPanel.style.display = 'none';
      }
    }
  });
}

/**
 * 初始化YouTube功能界面
 */
async function initializeYouTubeUI(): Promise<void> {
  try {
    // 步骤4：统一初始化流程
    await initializeUnifiedStorage();
    
  } catch (error) {
    console.error('[popup] YouTube界面初始化失败:', error);
    throw error;
  }
}

/**
 * 步骤4：统一初始化流程 - 整合两套存储的读取和UI更新
 */
async function initializeUnifiedStorage(): Promise<void> {
  // 简化初始化流程日志
  
  try {
    // 1. 基础设置
    initializeDOMElements();
    addEventListeners();
    
    // 2. 初始化UserPreferencesManager并加载用户偏好设置
    console.log('[popup] 2/6 - 加载用户偏好设置 (UserPreferencesManager)');
    await userPreferencesManager.initialize();
    const userPreferences = await userPreferencesManager.getUserPreferences();
    console.log('[popup] 用户偏好设置已加载:', userPreferences);
    
    // 3. 更新用户偏好设置相关的UI
    console.log('[popup] 3/6 - 更新用户偏好设置UI');
    await updateUserPreferencesUI(userPreferences);
    
    // 4. 获取PopupContext数据（包含源语言信息）
    console.log('[popup] 4/6 - 获取PopupContext数据');
    const popupContext = await requestPopupContextData();
    
    // 5. 加载源语言数据并更新UI
    console.log('[popup] 5/6 - 加载源语言数据 (VideoSourceLanguageCache)');
    await loadSourceLanguageData(popupContext);
    
    // 6. 设置统一事件监听器
    console.log('[popup] 6/6 - 设置统一事件监听器');
    setupUnifiedSettingsListener();
    
    console.log('[popup] ✓ 初始化完成');
    
  } catch (error) {
    console.error('[popup] ✗ 统一初始化流程失败:', error);
    throw error;
  }
}

/**
 * 更新用户偏好设置UI
 */
async function updateUserPreferencesUI(userPreferences: UserPreferences): Promise<void> {
  try {
    // 更新目标语言显示
    if (userPreferences.targetLang) {
      currentTargetLang = userPreferences.targetLang;
      if (targetLangSelectedValue) {
        const lang = targetLanguages.find(l => l.code === userPreferences.targetLang);
        if (lang) {
          targetLangSelectedValue.textContent = generateTargetLanguageDisplayName(lang);
        }
      }
    }
    
    // 更新字幕模式
    if (subtitleTypeTranslate && subtitleTypeBilingual) {
      if (userPreferences.subtitleMode === SubtitleMode.BILINGUAL) {
        subtitleTypeBilingual.checked = true;
      } else {
        subtitleTypeTranslate.checked = true;
      }
    }
    
    // 更新翻译服务配置
    if (userPreferences.translationService) {
      const service = userPreferences.translationService;
      console.log('[popup] 正在设置翻译服务UI:', service);
      
      // 设置翻译API选择器
      if (translationApiSelect) {
        console.log('[popup] 设置翻译API选择器:', service.type);
        translationApiSelect.value = service.type;
        updateApiPanels(service.type);
        console.log('[popup] 翻译API选择器设置完成，当前值:', translationApiSelect.value);
      } else {
        console.warn('[popup] translationApiSelect 元素未找到');
      }
      
      // 设置API密钥
      if (apiKeyInput) {
        apiKeyInput.value = service.apiKey || '';
        if (service.apiKey) {
          console.log('[popup] API密钥已设置');
        }
      }
      
      // 设置模型选择
      if (modelSelect && service.model && service.type !== 'gemini') {
        modelSelect.value = service.model;
        console.log('[popup] 模型选择已设置:', service.model);
      }

      // 设置Gemini设置 (Phase 1)
      if (service.type === 'gemini') {
        if (geminiModelSelect && service.model) {
          geminiModelSelect.value = service.model;
          console.log('[popup] Gemini模型选择已设置:', service.model);
        }
        if (geminiTierFree && geminiTierPaid && service.tier) {
          if (service.tier === 'paid') {
            geminiTierPaid.checked = true;
          } else {
            geminiTierFree.checked = true;
          }
          console.log('[popup] Gemini tier已设置:', service.tier);
        }
      }

      // 设置DeepL设置 (Phase 1)
      if (service.type === 'deepl') {
        if (deeplModelSelect && service.model) {
          deeplModelSelect.value = service.model;
          console.log('[popup] DeepL模型选择已设置:', service.model);
        }
        if (deeplTierFree && deeplTierPaid && service.tier) {
          if (service.tier === 'pro') {
            deeplTierPaid.checked = true;
          } else {
            deeplTierFree.checked = true;
          }
          console.log('[popup] DeepL tier已设置:', service.tier);
        }
      }

      // 设置OpenAI格式开关（实验性功能）
      if (service.type === 'openai' && useImmersiveFormatCheckbox) {
        useImmersiveFormatCheckbox.checked = service.useImmersiveFormat || false;
        console.log('[popup] OpenAI格式开关已设置:', service.useImmersiveFormat);
      }
    }

    // 填充目标语言列表
    populateTargetLanguages();
    
    console.log('[popup] 用户偏好设置UI更新完成');
    
  } catch (error) {
    console.error('[popup] 更新用户偏好设置UI失败:', error);
    throw error;
  }
}

/**
 * 请求PopupContext数据
 */
async function requestPopupContextData(): Promise<any> {
  if (!currentTabId) {
    console.log('[popup] 无法请求PopupContext: 缺少标签页ID');
    return null;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getPopupInitData',
      tabId: currentTabId
    });
    
    if (response && response.type === 'popupInitDataResponse') {
      const popupContext = response.popupContext;
      console.log('[popup] PopupContext数据已获取:', popupContext);

      // 更新全局变量
      if (popupContext) {
        console.log('[DEBUG-INIT] 从popupContext更新currentVideoId:', popupContext.videoId);
        currentVideoId = popupContext.videoId;
        console.log('[DEBUG-INIT] currentVideoId更新后的值:', currentVideoId);
      } else {
        console.log('[DEBUG-INIT] popupContext为空，currentVideoId未更新');
      }
      
      return popupContext;
    } else {
      console.log('[popup] 无效的PopupContext响应:', response);
      return null;
    }
  } catch (error) {
    console.error('[popup] 请求PopupContext数据失败:', error);
    return null;
  }
}

/**
 * 加载源语言数据并更新UI
 */
async function loadSourceLanguageData(popupContext: any): Promise<void> {
  console.log('[DEBUG-LOAD] loadSourceLanguageData开始，currentVideoId:', currentVideoId);
  console.log('[DEBUG-LOAD] 收到的popupContext:', popupContext);

  try {
    if (!currentVideoId) {
      console.log('[popup] 无法加载源语言数据: 缺少视频ID');
      console.log('[DEBUG-LOAD] currentVideoId确实为空，无法继续');
      return;
    }
    
    // 优先使用 popupContext 中的数据，如果没有则从本地缓存获取
    let availableLanguages = [];
    
    // 先尝试使用 popupContext 中的数据
    if (popupContext && popupContext.availableSourceLanguages && popupContext.availableSourceLanguages.length > 0) {
      availableLanguages = popupContext.availableSourceLanguages;
      console.log('[popup] 使用 PopupContext 中的源语言数据:', availableLanguages);
    } else {
      // 如果 popupContext 中没有数据，则从本地缓存获取
      availableLanguages = await getAvailableSourceLanguages(currentVideoId);
      console.log('[popup] 从本地缓存获取源语言数据:', availableLanguages);
    }
    
    if (availableLanguages.length > 0) {
      // 转换为UI格式
      uiTrackData = availableLanguages.map((track: any) => {
        const rawKind = track.kind;
        const normalizedKind: 'asr' | 'forced' | undefined = rawKind === 'asr' || rawKind === 'forced' ? rawKind : undefined;
        return {
          languageCode: track.languageCode,
          languageName: track.name,
          kind: normalizedKind
        };
      });
      console.log('[popup] 源语言列表已获取:', uiTrackData);
    }
    
    // 先加载用户之前选择的源语言，设置全局变量
    console.log('[DEBUG-LOAD-1] 准备加载用户之前的源语言选择, videoId:', currentVideoId);
    const selectedTrack = await getSelectedSourceTrack(currentVideoId);
    console.log('[DEBUG-LOAD-2] getSelectedSourceTrack 返回:', selectedTrack);

    if (selectedTrack) {
      currentSourceLang = selectedTrack.languageCode;
      currentSourceTrackKind = selectedTrack.kind === 'asr' || selectedTrack.kind === 'forced'
        ? selectedTrack.kind
        : undefined;
      console.log('[popup] 已恢复用户选择的源语言:', selectedTrack);
      console.log('[popup] 当前全局变量 - currentSourceLang:', currentSourceLang, 'currentSourceTrackKind:', currentSourceTrackKind);
    } else {
      console.log('[popup] 未找到用户之前选择的源语言，保持默认值 auto');
    }
    
    // 然后填充源语言选择器（此时 currentSourceLang 已经设置正确）
    if (availableLanguages.length > 0) {
      populateSourceLanguages();
    }
    
    // 最后更新显示
    if (selectedTrack) {
      updateSourceLanguageDisplay(
        selectedTrack.languageCode,
        selectedTrack.kind === 'asr' || selectedTrack.kind === 'forced' ? selectedTrack.kind : undefined
      );
    }
    
    // 处理自动检测的源语言（仅在用户未手动选择时）
    if (popupContext && popupContext.detectedSourceLang && !selectedTrack) {
      await handleDetectedSourceLanguage(popupContext.detectedSourceLang);
    }
    
    console.log('[popup] 源语言数据加载完成');
    
  } catch (error) {
    console.error('[popup] 加载源语言数据失败:', error);
  }
}


/**
 * 处理检测到的源语言
 */
async function handleDetectedSourceLanguage(detectedLang: string): Promise<void> {
  try {
    console.log('[popup] 处理检测到的源语言:', detectedLang);
    
    // 自动设置源语言（如果用户没有手动选择过）
    // 使用与loadSourceLanguageData相同的检查机制
    const savedSourceTrack = await getSelectedSourceTrack(currentVideoId || '');
    
    if (!savedSourceTrack && detectedLang !== 'auto') {
      // 在uiTrackData中查找对应的轨道
      const detectedTrack = uiTrackData.find(track => track.languageCode === detectedLang);
      
      if (detectedTrack) {
        console.log('[popup] 自动设置智能选择的源语言:', detectedLang);
        const trackKind: 'asr' | 'forced' | undefined =
          detectedTrack.kind === 'asr' || detectedTrack.kind === 'forced'
            ? detectedTrack.kind
            : undefined;

        await saveSourceLanguage(detectedLang, trackKind);
        // 更新全局变量
        currentSourceLang = detectedLang;
        currentSourceTrackKind = trackKind;
        // 重新填充源语言选择器以更新选中状态
        populateSourceLanguages();
        updateSourceLanguageDisplay(detectedLang, trackKind);
      } else {
        console.warn('[popup] 智能选择的语言不在可用轨道列表中:', detectedLang);
      }
    } else if (savedSourceTrack) {
      console.log('[popup] 用户已选择源语言，跳过自动设置:', savedSourceTrack);
    }
    
  } catch (error) {
    console.error('[popup] 处理检测到的源语言失败:', error);
  }
}



/**
 * 生成语言显示名称
 */
function generateLanguageDisplayName(trackInfo: {
  languageCode: string,
  languageName: string,
  kind?: 'asr' | 'forced'
}): string {
  // 智能获取本地化语言名称
  // 1. 尝试完整语言代码（如 es-ES → lang_es_ES）
  const fullKey = 'lang_' + trackInfo.languageCode.replace(/-/g, '_');
  let localizedName = chrome.i18n.getMessage(fullKey);

  // 2. 如果找不到，尝试基础语言代码（如 es-ES → es → lang_es）
  if (!localizedName || localizedName.trim() === '') {
    const baseLangCode = trackInfo.languageCode.split('-')[0];
    const baseKey = 'lang_' + baseLangCode;
    localizedName = chrome.i18n.getMessage(baseKey);
  }

  // 3. 确定最终显示名称
  let baseName: string;
  if (localizedName && localizedName.trim() !== '') {
    baseName = localizedName;
  } else {
    // 如果i18n也找不到，使用YouTube返回的原始名称
    baseName = trackInfo.languageName
      .replace(/\s*\(自动生成\)/g, '')
      .replace(/\s*\(auto-generated\)/g, '')
      .replace(/\s*\(自動生成\)/g, '')
      .trim();
  }

  // 根据轨道类型决定是否添加ASR标识
  if (trackInfo.kind === 'asr') {
    return `${baseName}（自动生成）`;
  } else {
    return baseName;
  }
}

/**
 * 填充源语言选项
 */
function populateSourceLanguages(searchTerm: string = ''): void {
  if (!sourceLangOptions) {
    console.warn('[popup] populateSourceLanguages: sourceLangOptions元素不存在');
    return;
  }
  
  // 清空现有选项
  sourceLangOptions.innerHTML = '';
  
  // 使用智能排序和搜索处理轨道数据（现在包含"自动检测"选项）
  if (uiTrackData && Array.isArray(uiTrackData)) {
    console.log('[DEBUG] 排序前的 uiTrackData:', uiTrackData.map(t => `${t.languageCode}(${t.languageName})`));
    const sortedTracks = sortTrackData(uiTrackData, searchTerm);
    console.log('[DEBUG] 排序后的 sortedTracks:', sortedTracks.map(t => `${t.languageCode}(${t.languageName})`));
    
    // 如果有搜索词但没有匹配结果，显示提示
    if (sortedTracks.length === 0 && searchTerm.trim()) {
      const noResultOption = document.createElement('div');
      noResultOption.className = 'custom-select-option disabled';
      noResultOption.textContent = `未找到匹配 "${searchTerm}" 的语言`;
      noResultOption.style.textAlign = 'center';
      noResultOption.style.fontStyle = 'italic';
      noResultOption.style.color = '#999';
      sourceLangOptions.appendChild(noResultOption);
      return;
    }
    
    sortedTracks.forEach((trackInfo) => {
      const option = document.createElement('div');
      option.className = 'custom-select-option';
      option.setAttribute('data-value', trackInfo.languageCode);
      if (trackInfo.kind) {
        option.setAttribute('data-kind', trackInfo.kind);
      }

      // 生成显示文本
      const displayName = generateLanguageDisplayName(trackInfo);

      // 应用语言族互斥逻辑：检查是否与当前目标语言冲突
      if (currentTargetLang && isSameLanguageFamily(trackInfo.languageCode, currentTargetLang)) {
        option.classList.add('disabled');
        option.setAttribute('data-disabled-reason', 'same-language-family');
        option.title = `无法选择同语言族的语言：${displayName} 与目标语言冲突`;

        // 创建语言名称元素
        const nameSpan = document.createElement('span');
        nameSpan.textContent = displayName;

        // 创建提示文字元素
        const hintSpan = document.createElement('span');
        hintSpan.className = 'disabled-hint';
        hintSpan.textContent = '（与目标语言相同）';

        option.appendChild(nameSpan);
        option.appendChild(hintSpan);

        console.log(`[popup] populateSourceLanguages: 源语言 ${trackInfo.languageCode} 因与目标语言 ${currentTargetLang} 冲突而被禁用`);
      } else {
        option.textContent = displayName;
      }
      
      // 如果有搜索词，高亮匹配的部分
      if (searchTerm.trim()) {
        const matchResult = matchTrackData(trackInfo, searchTerm);
        if (matchResult.match) {
          option.style.fontWeight = 'bold';
        }
      }

      // 标记当前选中的源语言
      if (currentSourceLang === trackInfo.languageCode &&
          currentSourceTrackKind === trackInfo.kind) {
        option.classList.add('selected');
      }

      // 不再在这里绑定事件，改用事件委托（见 addEventListeners 函数）

      sourceLangOptions!.appendChild(option);
    });
  }
  
  console.log(`[DEBUG] populateSourceLanguages 完成: 显示 ${uiTrackData?.length || 0} 个源语言选项 (搜索: "${searchTerm}")`);
  console.log('[DEBUG] sourceLangOptions 元素:', sourceLangOptions);
  console.log('[DEBUG] sourceLangOptions 子元素数量:', sourceLangOptions?.children.length);
}

/**
 * 更新源语言显示
 */
function updateSourceLanguageDisplay(languageCode: string, trackKind: 'asr' | 'forced' | undefined): void {
  console.log('[popup] updateSourceLanguageDisplay 被调用:', { languageCode, trackKind });
  
  if (!sourceLangSelectedValue) {
    console.warn('[popup] sourceLangSelectedValue 元素不存在');
    return;
  }
  
  let displayText: string;

  // 查找对应的轨道信息
  const trackInfo = uiTrackData.find(track =>
    track.languageCode === languageCode &&
    track.kind === trackKind
  );

  if (trackInfo) {
    displayText = generateLanguageDisplayName(trackInfo);
  } else {
    displayText = languageCode;
    console.warn('[popup] 未找到匹配的轨道信息:', { languageCode, trackKind, uiTrackData });
  }

  console.log('[popup] 设置源语言显示文本:', displayText);
  sourceLangSelectedValue.textContent = displayText;
  sourceLangSelectedValue.setAttribute('data-value', languageCode);
  if (trackKind) {
    sourceLangSelectedValue.setAttribute('data-kind', trackKind);
  } else {
    sourceLangSelectedValue.removeAttribute('data-kind');
  }
}

/**
 * 保存源语言设置（新架构）
 */
async function saveSourceLanguage(languageCode: string, trackKind: 'asr' | 'forced' | undefined): Promise<void> {
  console.log('[popup][source] saveSourceLanguage 调用', {
    languageCode,
    trackKind: trackKind ?? 'manual',
    videoId: currentVideoId
  });
  try {
    if (!currentVideoId) {
      console.error('[popup] currentVideoId为空，无法保存源语言');
      return;
    }

    if (languageCode === 'auto') {
      const allTracks: TrackMetadata[] = uiTrackData
        .filter(track => track.languageCode !== 'auto')
        .map(track => ({
          languageCode: track.languageCode,
          name: track.languageName,
          kind: track.kind === 'asr' || track.kind === 'forced' ? track.kind : undefined
        }));

      await saveVideoSourceLanguageCache(currentVideoId, allTracks, null);
      console.log('[popup] 保存自动侦测设置，已清除选中源语言');
      return;
    }

    // 在uiTrackData中查找匹配的轨道（现在包含"自动检测"选项）
    const selectedTrack = uiTrackData.find(track => 
      track.languageCode === languageCode && 
      (track.kind === trackKind)
    );

    if (selectedTrack) {
      // 将uiTrackData格式转换为TrackMetadata格式（不含baseUrl）
      const trackMetadata: TrackMetadata = {
        languageCode: selectedTrack.languageCode,
        name: selectedTrack.languageName,
        kind: selectedTrack.kind === 'asr' || selectedTrack.kind === 'forced' ? selectedTrack.kind : undefined
        // 注意：不包含 baseUrl
      };
      
      // 保存轨道信息（只保存元数据）
      console.log('[popup][source] saveSourceLanguage 准备写入缓存', {
        videoId: currentVideoId,
        trackMetadata
      });
      await saveSelectedSourceTrack(currentVideoId, trackMetadata);
      console.log('[popup] 源语言设置已保存:', trackMetadata);
    } else {
      console.warn('[popup] 未找到匹配的源语言轨道:', { languageCode, trackKind, uiTrackData });
    }
  } catch (error) {
    console.error('[popup] 保存源语言设置失败:', error);
  }
}

// 创建防抖版本的保存函数，避免快速连续触发
const debouncedSaveSourceLanguage = debounce(saveSourceLanguage, 300);

// 注意：setTargetLanguage、setSubtitleMode、setTranslationServiceConfig 函数已删除
// 这些功能现在直接通过saveTargetLanguage和loadSettings中的UserPreferencesManager处理
// 统一的事件监听器将在步骤3中实现

// === 步骤3：统一监听器函数 ===

/**
 * 设置统一的设置修改监听器
 * 处理：源语言、目标语言、字幕类型、翻译服务 4大项
 */
function setupUnifiedSettingsListener(): void {
  document.addEventListener('change', async (event) => {
    const target = event.target as HTMLElement;

    // 只处理我们关心的元素
    switch (target.id) {
      case 'source-language-select':
        await handleSourceLanguageChange(target as HTMLSelectElement);
        break;

      case 'target-language-select':
        await handleTargetLanguageChange(target as HTMLSelectElement);
        break;

      case 'subtitle-type-translate':
      case 'subtitle-type-bilingual':
        await handleSubtitleModeChange(target as HTMLInputElement);
        break;

      // 翻译服务相关的所有字段统一处理
      case 'translation-api':
      case 'api-key':
      case 'openai-model':
      case 'gemini-model':
      case 'gemini-tier-free':
      case 'gemini-tier-paid':
      case 'deepl-model':
      case 'deepl-tier-free':
      case 'deepl-tier-paid':
      case 'use-immersive-format':
        await handleTranslationServiceChange();
        break;

      default:
        // 不是我们关心的元素，忽略
        return;
    }
  });
}

/**
 * 处理源语言变更
 */
async function handleSourceLanguageChange(selectElement: HTMLSelectElement): Promise<void> {
  try {
    const selectedOption = selectElement.selectedOptions[0];
    if (!selectedOption) return;
    
    const languageCode = selectedOption.value;
    const trackKindAttr = selectedOption.dataset.kind;
    const trackKind: 'asr' | 'forced' | undefined =
      trackKindAttr === 'asr' || trackKindAttr === 'forced' ? trackKindAttr : undefined;

    console.log('[popup] 统一监听器 - 源语言变更:', {
      languageCode,
      trackKind: trackKind ?? 'manual'
    });

    // 使用步骤2实现的新缓存机制
    await saveSourceLanguage(languageCode, trackKind);

    // 更新UI显示
    updateSourceLanguageDisplay(languageCode, trackKind);
    
    // 重新填充目标语言列表以应用语言族互斥逻辑
    populateTargetLanguages();
    
  } catch (error) {
    console.error('[popup] 统一监听器 - 源语言变更失败:', error);
  }
}

/**
 * 处理目标语言变更
 */
async function handleTargetLanguageChange(selectElement: HTMLSelectElement): Promise<void> {
  try {
    const langCode = selectElement.value;
    console.log('[popup] 统一监听器 - 目标语言变更:', langCode);
    
    // 使用步骤1实现的UserPreferencesManager
    await userPreferencesManager.updateUserPreferences({ targetLang: langCode });
    
    // 更新UI显示
    const targetLangSelectedValue = document.getElementById('target-language-selected-value');
    if (targetLangSelectedValue) {
      const lang = targetLanguages.find(l => l.code === langCode);
      if (lang) {
        targetLangSelectedValue.textContent = generateTargetLanguageDisplayName(lang);
      }
    }
    
    // 重新填充源语言列表以应用语言族互斥逻辑
    populateSourceLanguages();
    
  } catch (error) {
    console.error('[popup] 统一监听器 - 目标语言变更失败:', error);
  }
}

/**
 * 处理字幕模式变更
 */
async function handleSubtitleModeChange(radioElement: HTMLInputElement): Promise<void> {
  try {
    // 从 radio button 的 value 确定字幕模式
    const subtitleMode = radioElement.value === 'bilingual' ? SubtitleMode.BILINGUAL : SubtitleMode.TARGET_ONLY;
    console.log('[popup] 统一监听器 - 字幕模式变更:', subtitleMode);

    // 使用步骤1实现的UserPreferencesManager
    await userPreferencesManager.updateUserPreferences({ subtitleMode });

  } catch (error) {
    console.error('[popup] 统一监听器 - 字幕模式变更失败:', error);
  }
}

/**
 * 处理翻译服务变更（智能判断变更类型）
 */
async function handleTranslationServiceChange(): Promise<void> {
  try {
    console.log('[popup] 统一监听器 - 翻译服务变更');
    resetTestResult();

    // 从UI读取当前值
    const translationApiSelect = document.getElementById('translation-api') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const modelSelect = document.getElementById('openai-model') as HTMLSelectElement;

    // Gemini相关字段 (Phase 1)
    const geminiModelSelect = document.getElementById('gemini-model') as HTMLSelectElement;
    const geminiTierFree = document.getElementById('gemini-tier-free') as HTMLInputElement;
    const geminiTierPaid = document.getElementById('gemini-tier-paid') as HTMLInputElement;

    // DeepL相关字段 (Phase 1)
    const deeplModelSelect = document.getElementById('deepl-model') as HTMLSelectElement;
    const deeplTierFree = document.getElementById('deepl-tier-free') as HTMLInputElement;
    const deeplTierPaid = document.getElementById('deepl-tier-paid') as HTMLInputElement;

    // OpenAI格式开关
    const useImmersiveFormatCheckbox = document.getElementById('use-immersive-format') as HTMLInputElement;

    const newType = (translationApiSelect?.value as TranslationServiceType);
    const newApiKey = apiKeyInput?.value;
    const newModel = modelSelect?.value;

    // Gemini相关值
    const newGeminiModel = geminiModelSelect?.value;
    const newGeminiTier = geminiTierPaid?.checked ? 'paid' : 'free';

    // DeepL相关值
    const newDeeplModel = deeplModelSelect?.value;
    const newDeeplTier = deeplTierPaid?.checked ? 'pro' : 'free';

    // OpenAI格式值
    const newUseImmersiveFormat = useImmersiveFormatCheckbox?.checked || false;

    // 获取当前用户设置
    const userPreferences = await userPreferencesManager.getUserPreferences();
    const oldConfig = userPreferences.translationService;

    // 🎯 智能判断：服务类型或模型是否变更？
    const serviceTypeChanged = newType !== oldConfig.type;
    const modelChanged = (newType === 'openai' && newModel && newModel !== oldConfig.model) ||
                         (newType === 'gemini' && newGeminiModel && newGeminiModel !== oldConfig.model) ||
                         (newType === 'deepl' && newDeeplModel && newDeeplModel !== oldConfig.model);
    const geminiTierChanged = newType === 'gemini' && newGeminiTier && newGeminiTier !== oldConfig.tier;
    const deeplTierChanged = newType === 'deepl' && newDeeplTier && newDeeplTier !== oldConfig.tier;

    let updatedService: TranslationServiceComplete;

    if (serviceTypeChanged) {
      // 场景1：切换服务 → 完全使用新模板（不读取旧UI的model值）
      console.log('[popup] 检测到服务类型变更，从模板重建配置');
      updatedService = {
        ...TRANSLATION_SERVICE_TEMPLATES[newType],  // ✅ 完整使用新模板
        apiKey: newApiKey || undefined  // 只取当前输入的apiKey
      };
    } else if (modelChanged || geminiTierChanged || deeplTierChanged) {
      // 场景2：只改模型或tier → 使用新模型/tier，优先使用新API key
      console.log('[popup] 检测到模型/tier变更，更新配置');
      updatedService = {
        ...TRANSLATION_SERVICE_TEMPLATES[newType],
        apiKey: newApiKey || oldConfig.apiKey,  // 优先使用新输入的，否则保留旧的
        model: newModel || newGeminiModel || newDeeplModel || oldConfig.model  // 使用新模型
      };

      // Gemini特殊处理：更新tier和batchDelay
      if (newType === 'gemini' && newGeminiModel && newGeminiTier) {
        const batchDelay = calculateGeminiBatchDelay(newGeminiModel, newGeminiTier);
        updatedService.tier = newGeminiTier;
        updatedService.batchDelay = batchDelay;
        updatedService.model = newGeminiModel;
      }

      // DeepL特殊处理：更新tier和batchDelay
      if (newType === 'deepl' && newDeeplModel && newDeeplTier) {
        const batchDelay = calculateDeepLBatchDelay(newDeeplTier);
        updatedService.tier = newDeeplTier;
        updatedService.batchDelay = batchDelay;
        updatedService.model = newDeeplModel;
      }

      // OpenAI特殊处理：更新useImmersiveFormat
      if (newType === 'openai') {
        updatedService.useImmersiveFormat = newUseImmersiveFormat;
      }
    } else {
      // 场景3：只修改apiKey或格式开关 → 保留原配置
      console.log('[popup] 只修改apiKey/格式开关，保留原配置');
      updatedService = {
        ...oldConfig,
        apiKey: newApiKey || oldConfig.apiKey || undefined
      };

      // OpenAI特殊处理：更新useImmersiveFormat
      if (newType === 'openai') {
        updatedService.useImmersiveFormat = newUseImmersiveFormat;
      }
    }

    // 一次性更新整个翻译服务配置
    await userPreferencesManager.updateUserPreferences({ translationService: updatedService });

    // 更新UI面板显示
    if (translationApiSelect?.value) {
      updateApiPanels(translationApiSelect.value);
    }

    // 更新model下拉框的值（如果有默认值）
    if (modelSelect && updatedService.model && newType !== 'gemini') {
      modelSelect.value = updatedService.model;
      console.log('[popup] 模型选择已更新为:', updatedService.model);
    }

    // 更新Gemini UI (Phase 1)
    if (newType === 'gemini') {
      if (geminiModelSelect && updatedService.model) {
        geminiModelSelect.value = updatedService.model;
      }
      if (geminiTierFree && geminiTierPaid && updatedService.tier) {
        if (updatedService.tier === 'paid') {
          geminiTierPaid.checked = true;
        } else {
          geminiTierFree.checked = true;
        }
      }
      console.log('[popup] Gemini设置已更新:', {
        model: updatedService.model,
        tier: updatedService.tier,
        batchDelay: updatedService.batchDelay
      });
    }

    // 更新DeepL UI (Phase 1)
    if (newType === 'deepl') {
      if (deeplModelSelect && updatedService.model) {
        deeplModelSelect.value = updatedService.model;
      }
      if (deeplTierFree && deeplTierPaid && updatedService.tier) {
        if (updatedService.tier === 'pro') {
          deeplTierPaid.checked = true;
        } else {
          deeplTierFree.checked = true;
        }
      }
      console.log('[popup] DeepL设置已更新:', {
        model: updatedService.model,
        tier: updatedService.tier,
        batchDelay: updatedService.batchDelay
      });
    }

    console.log('[popup] 翻译服务配置已更新:', updatedService);

  } catch (error) {
    console.error('[popup] 翻译服务变更失败:', error);
  }
}

// === Gemini辅助函数 (Phase 1) ===

/**
 * 计算Gemini批次延迟（内部使用，不显示给用户）
 * @param model 模型名称
 * @param tier 账户类型 ('free' | 'paid')
 * @returns 批次延迟（毫秒）
 */
function calculateGeminiBatchDelay(model: string, tier: 'free' | 'paid'): number {
  const delayMap: Record<string, Record<'free' | 'paid', number>> = {
    'gemini-2.5-flash': {
      free: 6000,   // 10 RPM → 6秒/次
      paid: 60      // 假设1000 RPM → 60ms/次
    },
    'gemini-2.5-flash-lite': {
      free: 4000,   // 15 RPM → 4秒/次
      paid: 15      // 假设4000 RPM → 15ms/次
    }
  };

  return delayMap[model]?.[tier] ?? 6000;  // 默认6秒
}

/**
 * 根据DeepL tier计算批次延迟
 * @param tier 账户类型 ('free' | 'pro')
 * @returns 批次延迟（毫秒）
 */
function calculateDeepLBatchDelay(tier: 'free' | 'pro'): number {
  const delayMap: Record<'free' | 'pro', number> = {
    free: 1000,   // 免费层建议1秒
    pro: 200      // 付费层建议200ms
  };

  return delayMap[tier] ?? 1000;  // 默认1秒
}

// === 步骤2：源语言缓存管理函数 ===

/**
 * 获取视频的可用源语言列表（Local Storage → API）
 * 只返回元数据，不包含baseUrl
 */
async function getAvailableSourceLanguages(videoId: string): Promise<TrackMetadata[]> {
  try {
    // 1. 检查Local Storage缓存
    const result = await chrome.storage.local.get('video_source_language_cache');
    const cache: VideoSourceLanguageCache = result.video_source_language_cache || { items: [], maxSize: 10 };
    
    // 查找该视频的缓存
    const cachedItem = cache.items.find(item => item.videoId === videoId);
    if (cachedItem && cachedItem.availableSourceLanguages.length > 0) {
      console.log('[popup] 使用缓存的源语言列表:', cachedItem.availableSourceLanguages);
      return cachedItem.availableSourceLanguages;
    }
    
    // 2. Local Storage没有，调用API获取
    console.log('[popup] 缓存未命中，从API获取源语言列表...');
    
    if (!currentTabId) {
      console.error('[popup] currentTabId为空，无法发送消息');
      return [];
    }
    
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'getVideoTrackData',
      videoId
    });
    
    const trackList = response?.tracks ?? response?.trackData;

    if (response && response.success && Array.isArray(trackList)) {
      // 3. 转换为TrackMetadata格式（不含baseUrl）
      const availableSourceLanguages: TrackMetadata[] = trackList.map((track: any) => ({
        languageCode: track.languageCode || 'unknown',
        name: track.languageName || track.name || 'Unknown',
        kind: track.kind
        // 注意：不存储 baseUrl
      }));
      
      // 4. 存储到缓存（只存储元数据）
      await saveVideoSourceLanguageCache(videoId, availableSourceLanguages, null);
      
      console.log('[popup] API获取源语言列表成功:', availableSourceLanguages);
      return availableSourceLanguages;
    }
    
    console.warn('[popup] API返回数据无效:', response);
    return [];
    
  } catch (error) {
    console.error('[popup] 获取源语言列表失败:', error);
    return [];
  }
}

/**
 * 获取用户选择的源语言轨道
 * 只返回元数据，不包含baseUrl
 */
async function getSelectedSourceTrack(videoId: string): Promise<TrackMetadata | null> {
  console.log('[DEBUG-READ-1] getSelectedSourceTrack 被调用, videoId:', videoId);
  try {
    const result = await chrome.storage.local.get('video_source_language_cache');
    console.log('[DEBUG-READ-2] 从 chrome.storage.local 读取到的原始数据:', result);
    const cache: VideoSourceLanguageCache = result.video_source_language_cache || { items: [], maxSize: 10 };

    console.log('[DEBUG-READ-3] 解析后的缓存对象:', cache);
    console.log('[DEBUG-READ-4] 缓存中的所有项:', cache.items);

    const cachedItem = cache.items.find(item => item.videoId === videoId);
    console.log('[DEBUG-READ-5] 找到的缓存项:', cachedItem);

    const selectedTrack = cachedItem?.selectedSourceTrack || null;
    console.log('[DEBUG-READ-6] 提取的 selectedSourceTrack:', selectedTrack);
    return selectedTrack;
  } catch (error) {
    console.error('[popup] 获取选中源语言失败:', error);
    return null;
  }
}

/**
 * 保存源语言缓存（FIFO策略）
 * 只存储元数据，不包含baseUrl
 */
async function saveVideoSourceLanguageCache(
  videoId: string,
  availableSourceLanguages: TrackMetadata[],
  selectedSourceTrack: TrackMetadata | null
): Promise<void> {
  console.log('[popup][source] saveVideoSourceLanguageCache 调用', {
    videoId,
    availableCount: availableSourceLanguages.length,
    selectedSourceTrack
  });

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'updateVideoSourceLanguage',
      data: {
        videoId,
        availableSourceLanguages,
        selectedSourceTrack
      }
    });

    if (response && response.success) {
      console.log('[popup][source] saveVideoSourceLanguageCache 后台同步成功', {
        videoId,
        availableCount: availableSourceLanguages.length
      });
    } else {
      console.warn('[popup][source] saveVideoSourceLanguageCache 后台返回失败', response);
    }
  } catch (error) {
    console.error('[popup] 保存源语言缓存失败:', error);
  }
}

/**
 * 保存用户选择的源语言轨道
 * 只保存元数据，不包含baseUrl
 */
async function saveSelectedSourceTrack(videoId: string, selectedTrack: TrackMetadata): Promise<void> {
  try {
    // 获取当前缓存
    let availableLanguages = await getAvailableSourceLanguages(videoId);

    // 如果通过API/缓存未能获取到列表，退化为使用当前UI数据（剔除自动检测项）
    if (!availableLanguages || availableLanguages.length === 0) {
      availableLanguages = uiTrackData
        .filter(track => track.languageCode !== 'auto')
        .map(track => ({
          languageCode: track.languageCode,
          name: track.languageName,
          kind: track.kind === 'asr' || track.kind === 'forced' ? track.kind : undefined
        }));
      console.log('[popup] saveSelectedSourceTrack: 使用UI数据回填源语言列表');
    }
    
    console.log('[popup][source] saveSelectedSourceTrack 入参', {
      videoId,
      selectedTrack,
      availableCount: availableLanguages.length,
      availableLanguages
    });

    // 更新选中的轨道
    const sanitizedSelected: TrackMetadata = {
      ...selectedTrack,
      kind: selectedTrack.kind === 'asr' || selectedTrack.kind === 'forced' ? selectedTrack.kind : undefined
    };

    await saveVideoSourceLanguageCache(videoId, availableLanguages, sanitizedSelected);
    
    console.log('[popup] 用户选择的源语言已保存:', selectedTrack);
  } catch (error) {
    console.error('[popup] 保存用户选择失败:', error);
  }
}

/**
 * 初始化Popup UI
 */
async function initializePopupUI(): Promise<void> {
  try {
    // 1. 获取当前标签页信息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('无法获取当前标签页信息');
    }
    
    currentTabId = tab.id;
    console.log(`[popup] 当前标签页ID: ${currentTabId}`);
    
    // 2. 检查是否为YouTube页面
    console.log('[DEBUG-INIT] 检查URL:', tab.url);
    console.log('[DEBUG-INIT] isYoutubeUrl结果:', tab.url ? isYoutubeUrl(tab.url) : 'URL为空');
    if (tab.url && isYoutubeUrl(tab.url)) {
      isYouTubePage = true;
      currentVideoId = extractVideoIdFromUrl(tab.url);
      console.log('[DEBUG-INIT] extractVideoIdFromUrl返回:', currentVideoId);
      console.log(`[popup] YouTube页面，视频ID: ${currentVideoId || '未检测到'}`);
      
      // 初始化YouTube功能界面
      await initializeYouTubeUI();
} else {
      isYouTubePage = false;
      console.log(`[popup] 非YouTube页面: ${tab.url}`);
      
      // 显示使用说明界面
      showUsageGuide();
    }
    
  } catch (error) {
    console.error('[popup] UI初始化失败:', error);
    throw error;
  }
}

/**
 * 处理测试API连接
 */
async function handleTestApiConnection(): Promise<void> {
  const testResult = document.getElementById('test-result') as HTMLSpanElement;
  if (!testResult) return;

  // 重置测试结果
  resetTestResult();

  // 获取当前API配置
  const apiType = translationApiSelect?.value || 'google-free';
  const apiKey = apiKeyInput?.value || '';

  // 获取model参数（针对不同服务）
  let model: string | undefined = undefined;
  if (apiType === 'openai' && modelSelect) {
    model = modelSelect.value;
  } else if (apiType === 'gemini' && geminiModelSelect) {
    model = geminiModelSelect.value;
  } else if (apiType === 'deepl' && deeplModelSelect) {
    model = deeplModelSelect.value;
  }

  // 显示测试中状态
  testResult.textContent = '正在测试API连接...';
  testResult.className = 'test-result in-progress';

  console.log('[popup] 测试API连接:', { apiType, model, hasApiKey: !!apiKey });

  try {
    // 发送测试消息（使用新的消息格式）
    const response = await chrome.runtime.sendMessage({
      type: 'API_CONNECTION_TEST',
      data: {
        apiType: apiType,
        apiKey: apiKey,
        model: model,  // 传递model参数
        forceTest: !apiType.includes('-free') // 免费API强制测试
      }
    });

    if (response?.success) {
      testResult.textContent = '连接测试成功！';
      testResult.className = 'test-result success';
    } else {
      testResult.textContent = `测试失败: ${response?.message || '未知错误'}`;
      testResult.className = 'test-result error';
    }
  } catch (error) {
    console.error('[popup] API连接测试失败:', error);
    testResult.textContent = `测试失败: ${error instanceof Error ? error.message : '未知错误'}`;
    testResult.className = 'test-result error';
  }
}

/**
 * 处理初始化错误
 */
function handleInitializationError(error: any): void {
  console.error('[popup] 初始化发生错误:', error);
  
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
    console.log('[popup] 已初始化，跳过重复初始化');
    return;
  }
  
  console.log('[popup] 初始化...');
  sidePanelInitialized = true;
  
  try {
    await initializePopupUI();
    console.log('[popup] 🎉 初始化完成');
  } catch (error) {
    console.error('[popup] ✗ 初始化失败:', error);
    sidePanelInitialized = false; // 重置标志，允许重试
    handleInitializationError(error);
  }
}); 
