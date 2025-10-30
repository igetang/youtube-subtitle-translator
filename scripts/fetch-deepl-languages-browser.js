/**
 * DeepL API语言列表获取工具 - 浏览器版本
 *
 * 使用方法：
 * 1. 打开Chrome浏览器控制台（F12）
 * 2. 复制这整个文件的内容
 * 3. 粘贴到控制台
 * 4. 执行：fetchDeepLLanguages('your-api-key')
 *
 * 示例：
 * fetchDeepLLanguages('your-deepl-api-key-here')
 */

async function fetchDeepLLanguages(apiKey) {
  if (!apiKey) {
    console.error('❌ 错误：请提供DeepL API密钥');
    console.log('使用方法：fetchDeepLLanguages("your-api-key")');
    return;
  }

  // 判断是Free还是Pro API
  const apiHost = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';

  console.log('='.repeat(60));
  console.log('DeepL API 语言列表获取工具');
  console.log('='.repeat(60));
  console.log(`API Host: ${apiHost}`);
  console.log('');

  try {
    // 获取源语言列表
    console.log('📥 正在获取源语言列表...');
    const sourceRes = await fetch(`${apiHost}/v2/languages?type=source`, {
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`
      }
    });

    if (!sourceRes.ok) {
      throw new Error(`HTTP ${sourceRes.status}: ${await sourceRes.text()}`);
    }

    const sourceLanguages = await sourceRes.json();
    console.log(`✅ 成功获取 ${sourceLanguages.length} 种源语言\n`);

    // 获取目标语言列表
    console.log('📥 正在获取目标语言列表...');
    const targetRes = await fetch(`${apiHost}/v2/languages?type=target`, {
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`
      }
    });

    if (!targetRes.ok) {
      throw new Error(`HTTP ${targetRes.status}: ${await targetRes.text()}`);
    }

    const targetLanguages = await targetRes.json();
    console.log(`✅ 成功获取 ${targetLanguages.length} 种目标语言\n`);

    // 打印源语言列表
    console.log('='.repeat(60));
    console.log('源语言列表 (Source Languages)');
    console.log('='.repeat(60));
    console.table(sourceLanguages.map(lang => ({
      '代码': lang.language,
      '名称': lang.name,
      '支持formality': lang.supports_formality ? '✓' : '-'
    })));

    // 打印目标语言列表
    console.log('\n='.repeat(60));
    console.log('目标语言列表 (Target Languages)');
    console.log('='.repeat(60));
    console.table(targetLanguages.map(lang => ({
      '代码': lang.language,
      '名称': lang.name,
      '支持formality': lang.supports_formality ? '✓' : '-'
    })));

    // 生成TypeScript源语言映射表代码
    console.log('\n='.repeat(60));
    console.log('TypeScript源语言映射表代码（可直接复制）');
    console.log('='.repeat(60));

    let sourceCode = 'private mapSourceLanguage(ytCode: string): string {\n';
    sourceCode += '  const mapping: Record<string, string> = {\n';

    // 提取基础语言代码（去掉变体）
    const uniqueSourceCodes = [...new Set(sourceLanguages.map(lang => {
      const code = lang.language.split('-')[0];
      return code.toLowerCase();
    }))].sort();

    uniqueSourceCodes.forEach(code => {
      const deeplCode = code.toUpperCase();
      sourceCode += `    '${code}': '${deeplCode}',\n`;
    });

    // 添加常见的YouTube中文变体
    sourceCode += `    'zh-cn': 'ZH',\n`;
    sourceCode += `    'zh-hans': 'ZH',\n`;
    sourceCode += `    'zh-hant': 'ZH',\n`;
    sourceCode += `    'zh-tw': 'ZH',\n`;

    sourceCode += '  };\n';
    sourceCode += '  return mapping[ytCode] || ytCode.toUpperCase();\n';
    sourceCode += '}\n';

    console.log(sourceCode);

    // 生成TypeScript目标语言映射表代码
    console.log('\n='.repeat(60));
    console.log('TypeScript目标语言映射表代码（可直接复制）');
    console.log('='.repeat(60));

    let targetCode = 'private mapTargetLanguage(ytCode: string): string {\n';
    targetCode += '  const mapping: Record<string, string> = {\n';

    // 处理目标语言（包含变体）
    const targetMapping = {};
    targetLanguages.forEach(lang => {
      const code = lang.language;
      const ytCode = code.toLowerCase().replace('_', '-');
      targetMapping[ytCode] = code;
    });

    // 添加常见的YouTube变体映射
    targetMapping['zh-cn'] = targetMapping['zh-hans'] || 'ZH-HANS';
    targetMapping['zh-hans'] = targetMapping['zh-hans'] || 'ZH-HANS';
    targetMapping['zh-tw'] = targetMapping['zh-hant'] || 'ZH-HANT';
    targetMapping['zh-hant'] = targetMapping['zh-hant'] || 'ZH-HANT';
    targetMapping['en'] = targetMapping['en-us'] || 'EN-US';
    targetMapping['pt'] = targetMapping['pt-br'] || 'PT-BR';

    // 排序并生成代码
    Object.keys(targetMapping).sort().forEach(ytCode => {
      const deeplCode = targetMapping[ytCode];
      targetCode += `    '${ytCode}': '${deeplCode}',\n`;
    });

    targetCode += '  };\n';
    targetCode += '  return mapping[ytCode] || ytCode.toUpperCase();\n';
    targetCode += '}\n';

    console.log(targetCode);

    // 生成formality支持列表
    console.log('\n='.repeat(60));
    console.log('支持Formality的语言列表（可直接复制）');
    console.log('='.repeat(60));

    const formalityLanguages = targetLanguages
      .filter(lang => lang.supports_formality)
      .map(lang => lang.language.toLowerCase());

    let formalityCode = 'private isFormalitySupported(targetLang: string): boolean {\n';
    formalityCode += '  const supportedLangs = [\n';
    formalityLanguages.forEach(code => {
      formalityCode += `    '${code}',\n`;
    });
    formalityCode += '  ];\n';
    formalityCode += '  return supportedLangs.includes(targetLang.toLowerCase());\n';
    formalityCode += '}\n';

    console.log(formalityCode);

    // 对比分析
    console.log('\n='.repeat(60));
    console.log('与当前代码的对比分析');
    console.log('='.repeat(60));

    const currentSourceCodes = [
      'zh-cn', 'zh-hans', 'zh-hant', 'en', 'ja', 'ko', 'es', 'fr', 'de',
      'pt', 'ru', 'ar', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'cs',
      'da', 'el', 'et', 'fi', 'hu', 'lt', 'lv', 'nb', 'ro', 'sk', 'sl',
      'sv', 'uk', 'bg'
    ];

    const apiSourceCodes = sourceLanguages.map(lang => lang.language.toLowerCase());

    // 去掉中文变体，只比较基础代码
    const currentBaseCodes = [...new Set(currentSourceCodes.map(code => code.split('-')[0]))];
    const apiBaseCodes = [...new Set(apiSourceCodes.map(code => code.split('-')[0]))];

    const missing = apiBaseCodes.filter(code => !currentBaseCodes.includes(code));
    const extra = currentBaseCodes.filter(code => !apiBaseCodes.includes(code));

    console.log('\n📊 对比结果：');
    console.log(`当前代码：${currentBaseCodes.length} 种语言`);
    console.log(`DeepL API：${apiBaseCodes.length} 种语言`);

    if (missing.length > 0) {
      console.log('\n⚠️  当前代码缺失的语言：');
      missing.forEach(code => {
        const lang = sourceLanguages.find(l => l.language.toLowerCase().startsWith(code));
        if (lang) {
          console.log(`   - ${code.toUpperCase()}: ${lang.name}`);
        }
      });
    } else {
      console.log('\n✅ 当前代码已覆盖所有源语言');
    }

    if (extra.length > 0) {
      console.log('\n⚠️  当前代码中多余的语言（API可能不支持）：');
      extra.forEach(code => {
        console.log(`   - ${code.toUpperCase()}`);
      });
    }

    // 返回数据供进一步分析
    console.log('\n='.repeat(60));
    console.log('✅ 完成！数据已保存到变量中');
    console.log('='.repeat(60));
    console.log('可用变量：');
    console.log('  - window.deeplSourceLanguages (源语言列表)');
    console.log('  - window.deeplTargetLanguages (目标语言列表)');

    // 保存到全局变量
    window.deeplSourceLanguages = sourceLanguages;
    window.deeplTargetLanguages = targetLanguages;

    return {
      source: sourceLanguages,
      target: targetLanguages
    };

  } catch (error) {
    console.error('\n❌ 错误：', error.message);
    if (error.message.includes('401')) {
      console.error('\n💡 提示：API密钥无效，请检查密钥是否正确');
    } else if (error.message.includes('403')) {
      console.error('\n💡 提示：无权访问，请检查API密钥权限');
    } else if (error.message.includes('456')) {
      console.error('\n💡 提示：配额已用尽');
    } else if (error.message.includes('CORS')) {
      console.error('\n💡 提示：遇到CORS跨域问题');
      console.error('   解决方案：');
      console.error('   1. 使用Node.js脚本（scripts/fetch-deepl-languages.js）');
      console.error('   2. 或者在DeepL API网站的控制台测试页面运行');
    }
  }
}

// 使用说明
console.log('%c='.repeat(60), 'color: blue; font-weight: bold');
console.log('%cDeepL API语言列表获取工具 - 浏览器版本', 'color: green; font-size: 16px; font-weight: bold');
console.log('%c='.repeat(60), 'color: blue; font-weight: bold');
console.log('\n使用方法：');
console.log('%cfetchDeepLLanguages("your-api-key")', 'background: #f0f0f0; padding: 5px; border-radius: 3px; font-family: monospace');
console.log('\n示例：');
console.log('%cfetchDeepLLanguages("a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx")', 'background: #f0f0f0; padding: 5px; border-radius: 3px; font-family: monospace; color: #666');
console.log('\n%c⚠️ 注意：如果遇到CORS错误，请使用Node.js版本的脚本', 'color: orange; font-weight: bold');
