/**
 * 语言代码映射工具
 *
 * 用途：将BCP-47语言代码转换为各翻译服务所需格式
 * 使用场景：
 * - Chat APIs (OpenAI/DeepSeek/Gemini) 需要英文语言名称
 * - DeepL API 需要特定的大写语言代码（需要映射）
 *
 * 技术实现：
 * - 使用浏览器原生 Intl.DisplayNames API (Chrome 81+)
 * - 零维护成本（浏览器内置，覆盖8000+语言组合）
 * - 自动处理变体（zh-CN → Chinese, zh-TW → Chinese）
 *
 * @example
 * LanguageCodeMapper.toEnglishName('zh-CN')       // => 'Chinese'
 * LanguageCodeMapper.toDeepLSourceCode('en')      // => 'EN'
 * LanguageCodeMapper.toDeepLTargetCode('zh-CN')   // => 'ZH-HANS'
 */
export class LanguageCodeMapper {
  private static displayNames: Intl.DisplayNames | null = null;

  /**
   * 将语言代码转换为英文名称
   *
   * @param code - BCP-47语言代码 (如: zh-CN, ru, ja, en-US)
   * @param silent - 是否静默模式（不打印debug日志），默认false
   * @returns 英文语言名称 (如: Chinese, Russian, Japanese, English)
   *
   * 注意事项：
   * - 如果代码无效或不支持，返回原始代码
   * - 变体代码会被标准化（zh-CN/zh-TW 都返回 Chinese）
   * - 使用单例模式避免重复创建 DisplayNames 实例
   */
  static toEnglishName(code: string, silent: boolean = false): string {
    if (!code) {
      console.debug('[debug][LanguageCodeMapper] 空语言代码，返回空字符串');
      return '';
    }

    try {
      // 延迟初始化 DisplayNames（单例模式）
      if (!this.displayNames) {
        this.displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      }

      const name = this.displayNames.of(code);

      if (!name) {
        console.debug(`[debug][LanguageCodeMapper] 无法解析语言代码: ${code}，返回原始代码`);
        return code;
      }

      // ✅ 去掉括号内的地区信息（如 "Chinese (China)" → "Chinese"）
      const cleanName = name.replace(/\s*\([^)]*\)/g, '').trim();

      if (!silent) {
        console.debug(`[debug][LanguageCodeMapper] ${code} → ${cleanName}`);
      }
      return cleanName;

    } catch (error) {
      console.debug(`[debug][LanguageCodeMapper] 转换失败: ${code}`, error);
      return code; // 降级处理：返回原始代码
    }
  }

  /**
   * 将YouTube语言代码转换为DeepL源语言代码
   *
   * 基于DeepL官方文档设计
   *
   * @param ytCode - YouTube标准语言代码（如 'en', 'zh-CN', 'ja'）
   * @returns DeepL源语言代码（大写，如 'EN', 'ZH', 'JA'）
   */
  static toDeepLSourceCode(ytCode: string): string {
    const mapping: Record<string, string> = {
      'zh-CN': 'ZH',
      'zh-Hans': 'ZH',
      'zh-Hant': 'ZH',
      'en': 'EN',
      'ja': 'JA',
      'ko': 'KO',
      'es': 'ES',
      'fr': 'FR',
      'de': 'DE',
      'pt': 'PT',
      'ru': 'RU',
      'ar': 'AR',
      'it': 'IT',
      'nl': 'NL',
      'pl': 'PL',
      'tr': 'TR',
      'vi': 'VI',
      'th': 'TH',
      'id': 'ID',
      'cs': 'CS',
      'da': 'DA',
      'el': 'EL',
      'et': 'ET',
      'fi': 'FI',
      'hu': 'HU',
      'lt': 'LT',
      'lv': 'LV',
      'nb': 'NB',
      'ro': 'RO',
      'sk': 'SK',
      'sl': 'SL',
      'sv': 'SV',
      'uk': 'UK',
      'bg': 'BG'
    };

    return mapping[ytCode] || ytCode.toUpperCase();
  }

  /**
   * 将YouTube语言代码转换为DeepL目标语言代码
   *
   * 基于DeepL官方文档设计
   * 注意：DeepL目标语言有更细的变体（如 EN-US/EN-GB, ZH-HANS/ZH-HANT）
   *
   * @param ytCode - YouTube标准语言代码（如 'zh-CN', 'en', 'pt'）
   * @returns DeepL目标语言代码（大写，如 'ZH-HANS', 'EN-US', 'PT-BR'）
   */
  static toDeepLTargetCode(ytCode: string): string {
    const mapping: Record<string, string> = {
      'zh-CN': 'ZH-HANS',      // 简体中文
      'zh-Hans': 'ZH-HANS',
      'zh-TW': 'ZH-HANT',      // 繁体中文
      'zh-Hant': 'ZH-HANT',
      'en': 'EN-US',           // 默认美式英语
      'en-US': 'EN-US',
      'en-GB': 'EN-GB',
      'pt': 'PT-BR',           // 默认巴西葡萄牙语
      'pt-BR': 'PT-BR',
      'pt-PT': 'PT-PT',
      'ja': 'JA',
      'ko': 'KO',
      'es': 'ES',
      'fr': 'FR',
      'de': 'DE',
      'ru': 'RU',
      'ar': 'AR',
      'it': 'IT',
      'nl': 'NL',
      'pl': 'PL',
      'tr': 'TR',
      'id': 'ID',
      'cs': 'CS',
      'da': 'DA',
      'el': 'EL',
      'et': 'ET',
      'fi': 'FI',
      'hu': 'HU',
      'lt': 'LT',
      'lv': 'LV',
      'nb': 'NB',
      'ro': 'RO',
      'sk': 'SK',
      'sl': 'SL',
      'sv': 'SV',
      'uk': 'UK',
      'bg': 'BG'
    };

    return mapping[ytCode] || ytCode.toUpperCase();
  }
}
