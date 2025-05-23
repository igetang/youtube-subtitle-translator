/**
 * @file language-processing.ts
 * @description Utilities for processing and matching language codes.
 */
import { targetLanguages, Language } from './languages'; // Assuming languages.ts is in the same directory

/**
 * Checks if a language code is relevant to the UI language (exact or parent/child relationship).
 * @param langCode The language code to check.
 * @param uiLangCode The browser UI language code.
 * @returns {boolean} True if relevant, false otherwise.
 */
export function isLanguageRelevantToUI(langCode: string, uiLangCode: string): boolean {
    if (!langCode || !uiLangCode) return false;
    const lc = langCode.toLowerCase();
    const uilc = uiLangCode.toLowerCase();

    if (lc === uilc) return true; // Exact match

    // Check if langCode is a general version of uiLangCode (e.g., lang='en', ui='en-us')
    if (uilc.startsWith(lc) &&
        uilc.length > lc.length &&
        (uilc.charAt(lc.length) === '-' || uilc.charAt(lc.length) === '_')) {
        return true;
    }

    // Check if uiLangCode is a general version of langCode (e.g., lang='en-us', ui='en')
    if (lc.startsWith(uilc) &&
        lc.length > uilc.length &&
        (lc.charAt(uilc.length) === '-' || lc.charAt(uilc.length) === '_')) {
        return true;
    }
    return false;
}

/**
 * Finds a matching target language from the predefined list based on the provided code.
 * Implements a prioritized matching logic:
 * P1: Exact match (case-insensitive).
 * P2: Chinese script/region variants (zh-Hans, zh-Hant, regional fallbacks).
 * P3: General to specific (e.g., 'en' in list matches 'en-us' input).
 * P4: Specific to general (e.g., 'en-us' in list matches 'en' input).
 * @param codeToMatch The language code to match (e.g., from UI language or user preference).
 * @returns {Language | undefined} The matched Language object or undefined if no suitable match.
 */
export function findMatchingTargetLanguage(codeToMatch: string): Language | undefined {
    if (!codeToMatch) return undefined;

    console.log(`[src/utils/language-processing.ts] 尝试匹配语言代码: ${codeToMatch}`);
    let matchedLang: Language | undefined = undefined;
    const normalizedCodeToMatch = codeToMatch.toLowerCase().trim(); // Normalize for comparison

    // Priority 1: Exact Match (case-insensitive)
    matchedLang = targetLanguages.find(lang => lang.code.toLowerCase() === normalizedCodeToMatch);
    if (matchedLang) {
        console.log(`[src/utils/language-processing.ts] P1 精确匹配: ${matchedLang.code}`);
        return matchedLang;
    }

    // Priority 2: Handle Chinese Script/Region Variants explicitly
    const baseLang = normalizedCodeToMatch.split(/[-_]/)[0];
    console.log(`[src/utils/language-processing.ts] P2/P3/P4 基础语言代码: ${baseLang}`);

    if (baseLang === 'zh') {
        console.log(`[src/utils/language-processing.ts] P2 处理中文变体. 标准化代码: ${normalizedCodeToMatch}`);
        const regionOrScript = normalizedCodeToMatch.split(/[-_]/)[1]; // e.g., 'cn', 'hans', 'hant', 'hk'
        console.log(`[src/utils/language-processing.ts] P2 中文区域/脚本: ${regionOrScript}`);

        if (regionOrScript === 'cn' || regionOrScript === 'sg' || regionOrScript === 'hans') {
            console.log('[src/utils/language-processing.ts] P2 匹配简体中文 (zh-Hans) 对应 cn/sg/hans.');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        } else if (regionOrScript === 'tw' || regionOrScript === 'hk' || regionOrScript === 'hant') {
            console.log('[src/utils/language-processing.ts] P2 匹配繁体中文 (zh-Hant) 对应 tw/hk/hant.');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hant');
        } else if (!regionOrScript && normalizedCodeToMatch === 'zh') { // Pure 'zh' from UI
            console.log('[src/utils/language-processing.ts] P2 UI语言是纯"zh"，默认使用简体中文 (zh-Hans).');
            matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans');
        }
        // If a specific variant like 'zh-CN' was input but not directly matched,
        // and we found a script (zh-Hans/zh-Hant), return that.
        if (matchedLang) {
            console.log(`[src/utils/language-processing.ts] P2 中文变体匹配结果: ${matchedLang.code}`);
            return matchedLang;
        }
    }

    // Priority 3: Target is General, List has Specific (e.g., target 'en', list has 'en-us')
    // Example: codeToMatch 'en', finds 'en-us' or 'en-gb' in targetLanguages.
    // We prefer a more specific version if the input is general.
    // This might be less common for UI language matching, more for user prefs.
    // For UI language, if UI is 'en', we'd prefer 'en' if available, or a close specific one.
    // Let's refine this: if codeToMatch is general (e.g. 'en'), and list has specifics ('en-US', 'en-GB')
    // This logic is actually: codeToMatch (e.g. en-us) search in list for 'en'
    // This means the list code is a prefix of the target code
    matchedLang = targetLanguages.find(lang =>
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '-') ||
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '_')
    );
    if (matchedLang) {
        console.log(`[src/utils/language-processing.ts] P3 匹配(列表通用->输入特定): 输入'${normalizedCodeToMatch}'匹配列表项'${matchedLang.code}'`);
        return matchedLang;
    }

    // Priority 4: Target is Specific, List has General (e.g., target 'en-us', list has 'en')
    // Example: codeToMatch 'en-us', finds 'en' in targetLanguages.
    matchedLang = targetLanguages.find(lang =>
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '-') || // This seems wrong, should be other way
        lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '_') || // This seems wrong
        baseLang === lang.code.toLowerCase() // Match base language if target is specific e.g. input 'en-us' matches 'en' in list
    );
    if (matchedLang && baseLang === matchedLang.code.toLowerCase()) { // Ensure it's a base match
         console.log(`[src/utils/language-processing.ts] P4 匹配(输入特定->列表通用): 输入'${normalizedCodeToMatch}'匹配列表项'${matchedLang.code}'(基础匹配)`);
         return matchedLang;
    }
    // Reset if previous P4 was not just a baseLang match
    matchedLang = undefined;


    // Final fallback if only baseLang is 'zh' and no script match found earlier, but list has 'zh-Hans' or 'zh-Hant'
    if (baseLang === 'zh' && !matchedLang) {
        console.log('[src/utils/language-processing.ts] P2 "zh"的备选方案: 默认使用zh-Hans(如果可用),然后是zh-Hant.');
        matchedLang = targetLanguages.find(lang => lang.code === 'zh-Hans') || targetLanguages.find(lang => lang.code === 'zh-Hant');
        if (matchedLang) return matchedLang;
    }
    
    console.log(`[src/utils/language-processing.ts] 经过所有检查后未找到${codeToMatch}的合适匹配.`);
    return undefined;
} 