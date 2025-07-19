/**
 * 定义语言接口
 */
export interface Language {
  code: string; // BCP 47 language code (YouTube compatible, e.g., 'zh-Hans', 'en-US')
  name: string; // Language name (including native script)
  englishName: string; // English name for sorting
  regionCode?: string; // ISO 3166-1 alpha-2 (extracted if available, e.g., 'GB', 'US', 'CN')
  countryAlpha3?: string; // ISO 3166-1 alpha-3 (e.g., 'GBR', 'USA', 'CHN') - Placeholder for future addition
  callingCode?: string; // International dialing code (e.g., '+44', '+1', '+86') - Placeholder for future addition
  // Add other potential fields for search later, e.g., nativeName, iso639_1
}

/**
 * 预定义的目标语言列表 (初步版本)
 * 代码采用 YouTube languageCode 兼容格式 (BCP 47)
 * TODO: 扩展此列表，覆盖更多主流语言和翻译服务支持的语言
 * TODO: 添加多语言名称以便根据 UI 语言排序
 * TODO: 填充 countryAlpha3 和 callingCode 数据
 */
export const targetLanguages: Language[] = [
  // 主要欧洲语言
  { code: 'en', name: 'English', englishName: 'English' },
  { code: 'en-GB', name: 'English (UK)', englishName: 'English (UK)', regionCode: 'GB', callingCode: '+44' },
  { code: 'en-US', name: 'English (US)', englishName: 'English (US)', regionCode: 'US', callingCode: '+1' },
  { code: 'fr', name: 'Français (French)', englishName: 'French', regionCode: 'FR', callingCode: '+33' }, 
  { code: 'de', name: 'Deutsch (German)', englishName: 'German', regionCode: 'DE', callingCode: '+49' }, 
  { code: 'es', name: 'Español (Spanish - Spain)', englishName: 'Spanish (Spain)', regionCode: 'ES', callingCode: '+34' },
  { code: 'es-419', name: 'Español (Latin America)', englishName: 'Spanish (Latin America)', regionCode: '419' }, 
  { code: 'pt', name: 'Português (Portuguese - Portugal)', englishName: 'Portuguese (Portugal)', regionCode: 'PT', callingCode: '+351'},
  { code: 'pt-BR', name: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', regionCode: 'BR', callingCode: '+55' },
  { code: 'it', name: 'Italiano (Italian)', englishName: 'Italian', regionCode: 'IT', callingCode: '+39' }, 
  { code: 'nl', name: 'Nederlands (Dutch)', englishName: 'Dutch', regionCode: 'NL', callingCode: '+31' }, // Assuming NL
  { code: 'ru', name: 'Русский (Russian)', englishName: 'Russian', regionCode: 'RU', callingCode: '+7' }, 
  { code: 'pl', name: 'Polski (Polish)', englishName: 'Polish', regionCode: 'PL', callingCode: '+48' }, // Assuming PL
  { code: 'sv', name: 'Svenska (Swedish)', englishName: 'Swedish', regionCode: 'SE', callingCode: '+46' }, // Assuming SE
  { code: 'no', name: 'Norsk (Norwegian)', englishName: 'Norwegian', regionCode: 'NO', callingCode: '+47' }, // Assuming NO
  { code: 'da', name: 'Dansk (Danish)', englishName: 'Danish', regionCode: 'DK', callingCode: '+45' }, // Assuming DK
  { code: 'fi', name: 'Suomi (Finnish)', englishName: 'Finnish', regionCode: 'FI', callingCode: '+358' }, // Assuming FI
  { code: 'el', name: 'Ελληνικά (Greek)', englishName: 'Greek', regionCode: 'GR', callingCode: '+30' }, // Assuming GR
  { code: 'cs', name: 'Čeština (Czech)', englishName: 'Czech', regionCode: 'CZ', callingCode: '+420' }, // Assuming CZ
  { code: 'hu', name: 'Magyar (Hungarian)', englishName: 'Hungarian', regionCode: 'HU', callingCode: '+36' }, // Assuming HU
  { code: 'ro', name: 'Română (Romanian)', englishName: 'Romanian', regionCode: 'RO', callingCode: '+40' }, // Assuming RO
  { code: 'uk', name: 'Українська (Ukrainian)', englishName: 'Ukrainian', regionCode: 'UA', callingCode: '+380' }, // Assuming UA
  { code: 'bg', name: 'Български (Bulgarian)', englishName: 'Bulgarian', regionCode: 'BG', callingCode: '+359' }, // Assuming BG
  { code: 'hr', name: 'Hrvatski (Croatian)', englishName: 'Croatian', regionCode: 'HR', callingCode: '+385' }, // Assuming HR
  { code: 'sr', name: 'Српски (Serbian)', englishName: 'Serbian', callingCode: '+381' }, // Consider Cyrillic/Latin script variants if needed
  { code: 'sk', name: 'Slovenčina (Slovak)', englishName: 'Slovak', regionCode: 'SK', callingCode: '+421' }, // Assuming SK
  { code: 'sl', name: 'Slovenščina (Slovenian)', englishName: 'Slovenian', regionCode: 'SI', callingCode: '+386' }, // Assuming SI
  { code: 'et', name: 'Eesti (Estonian)', englishName: 'Estonian', regionCode: 'EE', callingCode: '+372' }, // Assuming EE
  { code: 'lv', name: 'Latviešu (Latvian)', englishName: 'Latvian', regionCode: 'LV', callingCode: '+371' }, // Assuming LV
  { code: 'lt', name: 'Lietuvių (Lithuanian)', englishName: 'Lithuanian', regionCode: 'LT', callingCode: '+370' }, // Assuming LT
  
  // 主要亚洲语言
  { code: 'zh-CN', name: '简体中文', englishName: 'Chinese (Simplified)', regionCode: 'CN', callingCode: '+86' }, 
  { code: 'zh-TW', name: '繁體中文', englishName: 'Chinese (Traditional)', regionCode: 'TW', callingCode: '+886' }, 
  { code: 'ja', name: '日本語 (Japanese)', englishName: 'Japanese', regionCode: 'JP', callingCode: '+81' }, 
  { code: 'ko', name: '한국어 (Korean)', englishName: 'Korean', regionCode: 'KR', callingCode: '+82' }, 
  { code: 'vi', name: 'Tiếng Việt (Vietnamese)', englishName: 'Vietnamese', regionCode: 'VN', callingCode: '+84' }, 
  { code: 'th', name: 'ไทย (Thai)', englishName: 'Thai', regionCode: 'TH', callingCode: '+66' }, 
  { code: 'id', name: 'Bahasa Indonesia (Indonesian)', englishName: 'Indonesian', regionCode: 'ID', callingCode: '+62' }, 
  { code: 'ms', name: 'Bahasa Melayu (Malay)', englishName: 'Malay', regionCode: 'MY', callingCode: '+60' }, // Assuming MY
  { code: 'hi', name: 'हिन्दी (Hindi)', englishName: 'Hindi', regionCode: 'IN', callingCode: '+91' }, 
  { code: 'bn', name: 'বাংলা (Bengali)', englishName: 'Bengali', regionCode: 'BD', callingCode: '+880' }, // Also IN +91
  { code: 'ta', name: 'தமிழ் (Tamil)', englishName: 'Tamil' }, // India, Sri Lanka, Singapore...
  { code: 'te', name: 'తెలుగు (Telugu)', englishName: 'Telugu', regionCode: 'IN', callingCode: '+91' }, // Assuming IN
  { code: 'ur', name: 'اردو (Urdu)', englishName: 'Urdu', regionCode: 'PK', callingCode: '+92' }, // Assuming PK
  { code: 'fa', name: 'فارسی (Persian)', englishName: 'Persian', regionCode: 'IR', callingCode: '+98' }, // Assuming IR
  { code: 'ar', name: 'العربية (Arabic)', englishName: 'Arabic' }, 
  { code: 'he', name: 'עברית (Hebrew)', englishName: 'Hebrew', regionCode: 'IL', callingCode: '+972' }, // Assuming IL
  { code: 'tr', name: 'Türkçe (Turkish)', englishName: 'Turkish', regionCode: 'TR', callingCode: '+90' }, // Assuming TR
  { code: 'tl', name: 'Tagalog (Filipino)', englishName: 'Filipino', regionCode: 'PH', callingCode: '+63' }, // Assuming PH (tl is often used for Filipino)

  // 其他地区语言 (示例)
  { code: 'af', name: 'Afrikaans', englishName: 'Afrikaans', regionCode: 'ZA', callingCode: '+27' }, // Assuming ZA
  { code: 'sw', name: 'Kiswahili (Swahili)', englishName: 'Swahili' }, // Eastern Africa
  { code: 'am', name: 'አማርኛ (Amharic)', englishName: 'Amharic', regionCode: 'ET', callingCode: '+251' }, // Assuming ET
  { code: 'zu', name: 'isiZulu (Zulu)', englishName: 'Zulu', regionCode: 'ZA', callingCode: '+27' }, // Assuming ZA
  
  // 可以根据需要继续添加...
]; 