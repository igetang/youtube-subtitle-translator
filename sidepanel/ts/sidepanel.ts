import { targetLanguages, Language } from '../../src/utils/languages'; // 导入语言列表

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
    // Ensure the list code is a prefix AND is followed by a separator
    matchedLang = targetLanguages.find(lang => 
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '-') || 
        normalizedCodeToMatch.startsWith(lang.code.toLowerCase() + '_')
    );
     if (matchedLang) return matchedLang;

    // Priority 4: Target is General, List has Specific (e.g., target 'en', list has 'en-us')
    // Find the first specific variant available for the general code
     matchedLang = targetLanguages.find(lang =>
         lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '-') || 
         lang.code.toLowerCase().startsWith(normalizedCodeToMatch + '_')
     );
    
    return matchedLang; // Return whatever was found, or undefined
} 