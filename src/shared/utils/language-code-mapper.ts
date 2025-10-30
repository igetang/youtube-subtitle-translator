/**
 * 语言代码映射工具
 *
 * 用途：将BCP-47语言代码转换为英文语言名称
 * 使用场景：Chat APIs (OpenAI/DeepSeek/Gemini) 需要英文语言名称而非代码
 *
 * 技术实现：
 * - 使用浏览器原生 Intl.DisplayNames API (Chrome 81+)
 * - 零维护成本（浏览器内置，覆盖8000+语言组合）
 * - 自动处理变体（zh-CN → Chinese, zh-TW → Chinese）
 *
 * @example
 * LanguageCodeMapper.toEnglishName('zh-CN')  // => 'Chinese'
 * LanguageCodeMapper.toEnglishName('ru')     // => 'Russian'
 * LanguageCodeMapper.toEnglishName('ja')     // => 'Japanese'
 * LanguageCodeMapper.toEnglishName('en-US')  // => 'English'
 */
export class LanguageCodeMapper {
  private static displayNames: Intl.DisplayNames | null = null;

  /**
   * 将语言代码转换为英文名称
   *
   * @param code - BCP-47语言代码 (如: zh-CN, ru, ja, en-US)
   * @returns 英文语言名称 (如: Chinese, Russian, Japanese, English)
   *
   * 注意事项：
   * - 如果代码无效或不支持，返回原始代码
   * - 变体代码会被标准化（zh-CN/zh-TW 都返回 Chinese）
   * - 使用单例模式避免重复创建 DisplayNames 实例
   */
  static toEnglishName(code: string): string {
    if (!code) {
      console.warn('[LanguageCodeMapper] 空语言代码，返回空字符串');
      return '';
    }

    try {
      // 延迟初始化 DisplayNames（单例模式）
      if (!this.displayNames) {
        this.displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      }

      const name = this.displayNames.of(code);

      if (!name) {
        console.warn(`[LanguageCodeMapper] 无法解析语言代码: ${code}，返回原始代码`);
        return code;
      }

      console.debug(`[debug][LanguageCodeMapper] ${code} → ${name}`);
      return name;

    } catch (error) {
      console.error(`[LanguageCodeMapper] 转换失败: ${code}`, error);
      return code; // 降级处理：返回原始代码
    }
  }
}
