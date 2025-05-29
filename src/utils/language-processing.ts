/**
 * @file language-processing.ts
 * @description 简化的语言处理工具，使用BCP-47映射表进行快速匹配
 */
import { targetLanguages, Language } from './languages';

/**
 * 完整的BCP-47语言代码到目标语言的映射表
 * 严格遵循RFC 5646标准，地区代码使用大写
 * 映射到targetLanguages中实际存在的语言代码
 */
const UI_LANGUAGE_MAPPING: Record<string, string> = {
  // ===== 英语变种 =====
  'en': 'en',                    // 英语（通用）
  'en-US': 'en-US',              // 美式英语
  'en-GB': 'en-GB',              // 英式英语
  'en-AU': 'en',                 // 澳大利亚英语 → 通用英语
  'en-CA': 'en',                 // 加拿大英语 → 通用英语
  'en-NZ': 'en',                 // 新西兰英语 → 通用英语
  'en-IE': 'en-GB',              // 爱尔兰英语 → 英式英语
  'en-ZA': 'en',                 // 南非英语 → 通用英语
  'en-IN': 'en',                 // 印度英语 → 通用英语
  'en-SG': 'en',                 // 新加坡英语 → 通用英语
  'en-PH': 'en',                 // 菲律宾英语 → 通用英语
  'en-JM': 'en',                 // 牙买加英语 → 通用英语
  'en-BZ': 'en',                 // 伯利兹英语 → 通用英语
  'en-TT': 'en',                 // 特立尼达英语 → 通用英语
  
  // ===== 中文变种 =====
  'zh': 'zh-CN',                 // 中文（默认简体，映射到zh-CN匹配YouTube字幕轨道）
  'zh-CN': 'zh-CN',              // 中国大陆（简体）
  'zh-Hans': 'zh-CN',            // 简体中文 → zh-CN
  'zh-Hans-CN': 'zh-CN',         // 简体中文（中国）
  'zh-Hans-SG': 'zh-CN',         // 简体中文（新加坡）
  'zh-SG': 'zh-CN',              // 新加坡中文 → zh-CN
  'zh-MY': 'zh-CN',              // 马来西亚中文 → zh-CN
  
  'zh-TW': 'zh-Hant',            // 台湾（繁体）
  'zh-Hant': 'zh-Hant',          // 繁体中文
  'zh-Hant-TW': 'zh-Hant',       // 繁体中文（台湾）
  'zh-HK': 'zh-Hant',            // 香港 → 繁体
  'zh-Hant-HK': 'zh-Hant',       // 繁体中文（香港）
  'zh-MO': 'zh-Hant',            // 澳门 → 繁体
  'zh-Hant-MO': 'zh-Hant',       // 繁体中文（澳门）
  
  // ===== 西班牙语变种 =====
  'es': 'es',                    // 西班牙语（西班牙）
  'es-ES': 'es',                 // 西班牙（欧洲）
  'es-MX': 'es-419',             // 墨西哥 → 拉美西班牙语
  'es-AR': 'es-419',             // 阿根廷 → 拉美西班牙语
  'es-CO': 'es-419',             // 哥伦比亚 → 拉美西班牙语
  'es-CL': 'es-419',             // 智利 → 拉美西班牙语
  'es-PE': 'es-419',             // 秘鲁 → 拉美西班牙语
  'es-VE': 'es-419',             // 委内瑞拉 → 拉美西班牙语
  'es-US': 'es-419',             // 美国西班牙语 → 拉美西班牙语
  'es-CR': 'es-419',             // 哥斯达黎加 → 拉美西班牙语
  'es-PA': 'es-419',             // 巴拿马 → 拉美西班牙语
  'es-GT': 'es-419',             // 危地马拉 → 拉美西班牙语
  'es-EC': 'es-419',             // 厄瓜多尔 → 拉美西班牙语
  'es-UY': 'es-419',             // 乌拉圭 → 拉美西班牙语
  'es-PY': 'es-419',             // 巴拉圭 → 拉美西班牙语
  'es-BO': 'es-419',             // 玻利维亚 → 拉美西班牙语
  'es-SV': 'es-419',             // 萨尔瓦多 → 拉美西班牙语
  'es-HN': 'es-419',             // 洪都拉斯 → 拉美西班牙语
  'es-NI': 'es-419',             // 尼加拉瓜 → 拉美西班牙语
  'es-DO': 'es-419',             // 多米尼加 → 拉美西班牙语
  'es-PR': 'es-419',             // 波多黎各 → 拉美西班牙语
  'es-CU': 'es-419',             // 古巴 → 拉美西班牙语
  
  // ===== 葡萄牙语变种 =====
  'pt': 'pt',                    // 葡萄牙语（葡萄牙）
  'pt-PT': 'pt',                 // 葡萄牙
  'pt-BR': 'pt-BR',              // 巴西葡萄牙语
  'pt-AO': 'pt',                 // 安哥拉 → 葡萄牙语
  'pt-MZ': 'pt',                 // 莫桑比克 → 葡萄牙语
  
  // ===== 法语变种 =====
  'fr': 'fr',                    // 法语（法国）
  'fr-FR': 'fr',                 // 法国
  'fr-CA': 'fr',                 // 加拿大法语
  'fr-BE': 'fr',                 // 比利时法语
  'fr-CH': 'fr',                 // 瑞士法语
  'fr-LU': 'fr',                 // 卢森堡法语
  'fr-MC': 'fr',                 // 摩纳哥法语
  'fr-SN': 'fr',                 // 塞内加尔法语
  'fr-CI': 'fr',                 // 科特迪瓦法语
  'fr-ML': 'fr',                 // 马里法语
  'fr-BF': 'fr',                 // 布基纳法索法语
  'fr-NE': 'fr',                 // 尼日尔法语
  'fr-TG': 'fr',                 // 多哥法语
  'fr-BJ': 'fr',                 // 贝宁法语
  'fr-MG': 'fr',                 // 马达加斯加法语
  'fr-KM': 'fr',                 // 科摩罗法语
  'fr-DZ': 'fr',                 // 阿尔及利亚法语
  'fr-MA': 'fr',                 // 摩洛哥法语
  'fr-TN': 'fr',                 // 突尼斯法语
  
  // ===== 德语变种 =====
  'de': 'de',                    // 德语（德国）
  'de-DE': 'de',                 // 德国
  'de-AT': 'de',                 // 奥地利德语
  'de-CH': 'de',                 // 瑞士德语
  'de-LU': 'de',                 // 卢森堡德语
  'de-LI': 'de',                 // 列支敦士登德语
  'de-BE': 'de',                 // 比利时德语
  
  // ===== 意大利语变种 =====
  'it': 'it',                    // 意大利语
  'it-IT': 'it',                 // 意大利
  'it-CH': 'it',                 // 瑞士意大利语
  'it-SM': 'it',                 // 圣马力诺意大利语
  'it-VA': 'it',                 // 梵蒂冈意大利语
  
  // ===== 荷兰语变种 =====
  'nl': 'nl',                    // 荷兰语
  'nl-NL': 'nl',                 // 荷兰
  'nl-BE': 'nl',                 // 比利时荷兰语（弗拉芒语）
  'nl-SR': 'nl',                 // 苏里南荷兰语
  
  // ===== 俄语变种 =====
  'ru': 'ru',                    // 俄语
  'ru-RU': 'ru',                 // 俄罗斯
  'ru-BY': 'ru',                 // 白俄罗斯俄语
  'ru-KZ': 'ru',                 // 哈萨克斯坦俄语
  'ru-KG': 'ru',                 // 吉尔吉斯斯坦俄语
  'ru-UA': 'ru',                 // 乌克兰俄语
  'ru-MD': 'ru',                 // 摩尔多瓦俄语
  
  // ===== 日语变种 =====
  'ja': 'ja',                    // 日语
  'ja-JP': 'ja',                 // 日本
  
  // ===== 韩语变种 =====
  'ko': 'ko',                    // 韩语
  'ko-KR': 'ko',                 // 韩国
  'ko-KP': 'ko',                 // 朝鲜韩语
  
  // ===== 阿拉伯语变种 =====
  'ar': 'ar',                    // 阿拉伯语（现代标准阿拉伯语）
  'ar-SA': 'ar',                 // 沙特阿拉伯
  'ar-EG': 'ar',                 // 埃及阿拉伯语
  'ar-AE': 'ar',                 // 阿联酋阿拉伯语
  'ar-KW': 'ar',                 // 科威特阿拉伯语
  'ar-QA': 'ar',                 // 卡塔尔阿拉伯语
  'ar-BH': 'ar',                 // 巴林阿拉伯语
  'ar-OM': 'ar',                 // 阿曼阿拉伯语
  'ar-YE': 'ar',                 // 也门阿拉伯语
  'ar-IQ': 'ar',                 // 伊拉克阿拉伯语
  'ar-SY': 'ar',                 // 叙利亚阿拉伯语
  'ar-LB': 'ar',                 // 黎巴嫩阿拉伯语
  'ar-JO': 'ar',                 // 约旦阿拉伯语
  'ar-PS': 'ar',                 // 巴勒斯坦阿拉伯语
  'ar-DZ': 'ar',                 // 阿尔及利亚阿拉伯语
  'ar-MA': 'ar',                 // 摩洛哥阿拉伯语
  'ar-TN': 'ar',                 // 突尼斯阿拉伯语
  'ar-LY': 'ar',                 // 利比亚阿拉伯语
  'ar-SD': 'ar',                 // 苏丹阿拉伯语
  
  // ===== 其他欧洲语言 =====
  'pl': 'pl',                    // 波兰语
  'pl-PL': 'pl',                 // 波兰
  'sv': 'sv',                    // 瑞典语
  'sv-SE': 'sv',                 // 瑞典
  'sv-FI': 'sv',                 // 芬兰瑞典语
  'no': 'no',                    // 挪威语
  'no-NO': 'no',                 // 挪威
  'nb': 'no',                    // 挪威语（书面语）
  'nb-NO': 'no',                 // 挪威书面语
  'nn': 'no',                    // 挪威语（新挪威语）
  'nn-NO': 'no',                 // 新挪威语
  'da': 'da',                    // 丹麦语
  'da-DK': 'da',                 // 丹麦
  'da-GL': 'da',                 // 格陵兰丹麦语
  'fi': 'fi',                    // 芬兰语
  'fi-FI': 'fi',                 // 芬兰
  'el': 'el',                    // 希腊语
  'el-GR': 'el',                 // 希腊
  'el-CY': 'el',                 // 塞浦路斯希腊语
  'cs': 'cs',                    // 捷克语
  'cs-CZ': 'cs',                 // 捷克
  'hu': 'hu',                    // 匈牙利语
  'hu-HU': 'hu',                 // 匈牙利
  'ro': 'ro',                    // 罗马尼亚语
  'ro-RO': 'ro',                 // 罗马尼亚
  'ro-MD': 'ro',                 // 摩尔多瓦罗马尼亚语
  'uk': 'uk',                    // 乌克兰语
  'uk-UA': 'uk',                 // 乌克兰
  'bg': 'bg',                    // 保加利亚语
  'bg-BG': 'bg',                 // 保加利亚
  'hr': 'hr',                    // 克罗地亚语
  'hr-HR': 'hr',                 // 克罗地亚
  'hr-BA': 'hr',                 // 波黑克罗地亚语
  'sr': 'sr',                    // 塞尔维亚语
  'sr-RS': 'sr',                 // 塞尔维亚
  'sr-BA': 'sr',                 // 波黑塞尔维亚语
  'sr-ME': 'sr',                 // 黑山塞尔维亚语
  'sr-Latn': 'sr',               // 塞尔维亚语（拉丁字母）
  'sr-Cyrl': 'sr',               // 塞尔维亚语（西里尔字母）
  'sk': 'sk',                    // 斯洛伐克语
  'sk-SK': 'sk',                 // 斯洛伐克
  'sl': 'sl',                    // 斯洛文尼亚语
  'sl-SI': 'sl',                 // 斯洛文尼亚
  'et': 'et',                    // 爱沙尼亚语
  'et-EE': 'et',                 // 爱沙尼亚
  'lv': 'lv',                    // 拉脱维亚语
  'lv-LV': 'lv',                 // 拉脱维亚
  'lt': 'lt',                    // 立陶宛语
  'lt-LT': 'lt',                 // 立陶宛
  
  // ===== 亚洲语言 =====
  'vi': 'vi',                    // 越南语
  'vi-VN': 'vi',                 // 越南
  'th': 'th',                    // 泰语
  'th-TH': 'th',                 // 泰国
  'id': 'id',                    // 印尼语
  'id-ID': 'id',                 // 印尼
  'ms': 'ms',                    // 马来语
  'ms-MY': 'ms',                 // 马来西亚马来语
  'ms-BN': 'ms',                 // 文莱马来语
  'ms-SG': 'ms',                 // 新加坡马来语
  'hi': 'hi',                    // 印地语
  'hi-IN': 'hi',                 // 印度印地语
  'bn': 'bn',                    // 孟加拉语
  'bn-BD': 'bn',                 // 孟加拉国孟加拉语
  'bn-IN': 'bn',                 // 印度孟加拉语
  'ta': 'ta',                    // 泰米尔语
  'ta-IN': 'ta',                 // 印度泰米尔语
  'ta-LK': 'ta',                 // 斯里兰卡泰米尔语
  'ta-SG': 'ta',                 // 新加坡泰米尔语
  'ta-MY': 'ta',                 // 马来西亚泰米尔语
  'te': 'te',                    // 泰卢固语
  'te-IN': 'te',                 // 印度泰卢固语
  'ur': 'ur',                    // 乌尔都语
  'ur-PK': 'ur',                 // 巴基斯坦乌尔都语
  'ur-IN': 'ur',                 // 印度乌尔都语
  'fa': 'fa',                    // 波斯语（法尔西语）
  'fa-IR': 'fa',                 // 伊朗波斯语
  'fa-AF': 'fa',                 // 阿富汗波斯语（达里语）
  'fa-TJ': 'fa',                 // 塔吉克斯坦波斯语
  'he': 'he',                    // 希伯来语
  'he-IL': 'he',                 // 以色列希伯来语
  'tr': 'tr',                    // 土耳其语
  'tr-TR': 'tr',                 // 土耳其
  'tr-CY': 'tr',                 // 塞浦路斯土耳其语
  'tl': 'tl',                    // 他加禄语（菲律宾语）
  'tl-PH': 'tl',                 // 菲律宾他加禄语
  'fil': 'tl',                   // 菲律宾语 → 他加禄语
  'fil-PH': 'tl',                // 菲律宾菲律宾语 → 他加禄语
  
  // ===== 非洲语言 =====
  'af': 'af',                    // 南非荷兰语
  'af-ZA': 'af',                 // 南非南非荷兰语
  'af-NA': 'af',                 // 纳米比亚南非荷兰语
  'sw': 'sw',                    // 斯瓦希里语
  'sw-TZ': 'sw',                 // 坦桑尼亚斯瓦希里语
  'sw-KE': 'sw',                 // 肯尼亚斯瓦希里语
  'sw-UG': 'sw',                 // 乌干达斯瓦希里语
  'sw-CD': 'sw',                 // 刚果民主共和国斯瓦希里语
  'am': 'am',                    // 阿姆哈拉语
  'am-ET': 'am',                 // 埃塞俄比亚阿姆哈拉语
  'zu': 'zu',                    // 祖鲁语
  'zu-ZA': 'zu',                 // 南非祖鲁语
};

/**
 * 检查语言代码是否与UI语言相关
 * @param langCode 要检查的语言代码
 * @param uiLangCode 浏览器UI语言代码
 * @returns 是否相关
 */
export function isLanguageRelevantToUI(langCode: string, uiLangCode: string): boolean {
    if (!langCode || !uiLangCode) return false;
  
  // 保持BCP-47标准格式，只进行基础语言比较时转小写
  const normalizedLang = langCode.toLowerCase();
  const normalizedUI = uiLangCode.toLowerCase();
  
  // 精确匹配
  if (normalizedLang === normalizedUI) return true;
  
  // 基础语言匹配（例如：en 和 en-US）
  const baseLang = normalizedLang.split('-')[0];
  const baseUI = normalizedUI.split('-')[0];
  
  return baseLang === baseUI;
}

/**
 * 根据UI语言代码查找匹配的目标语言
 * 严格遵循BCP-47标准，保持原始格式
 * @param uiLangCode 浏览器UI语言代码（标准BCP-47格式）
 * @returns 匹配的Language对象，如果没有找到则返回undefined
 */
export function findMatchingTargetLanguage(uiLangCode: string): Language | undefined {
  if (!uiLangCode) return undefined;
  
  const inputCode = uiLangCode.trim();
  console.log(`[language-processing] 尝试匹配UI语言: ${inputCode}`);
  
  // 首先尝试精确匹配（标准BCP-47格式）
  const targetCode = UI_LANGUAGE_MAPPING[inputCode];
  if (targetCode) {
    const matchedLang = targetLanguages.find(lang => lang.code === targetCode);
    if (matchedLang) {
      console.log(`[language-processing] 精确匹配: ${inputCode} → ${targetCode}`);
            return matchedLang;
        }
    }

  // 如果没有精确匹配，尝试基础语言匹配
  const baseLang = inputCode.split('-')[0];
  const baseTargetCode = UI_LANGUAGE_MAPPING[baseLang];
  if (baseTargetCode) {
    const matchedLang = targetLanguages.find(lang => lang.code === baseTargetCode);
    if (matchedLang) {
      console.log(`[language-processing] 基础语言匹配: ${inputCode} → ${baseLang} → ${baseTargetCode}`);
         return matchedLang;
    }
  }
  
  console.log(`[language-processing] ❌ 未找到匹配的目标语言: ${inputCode}`);
    return undefined;
} 