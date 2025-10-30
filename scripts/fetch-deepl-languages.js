#!/usr/bin/env node
/**
 * DeepL API语言列表获取脚本
 *
 * 使用方法：
 * 1. 设置环境变量：export DEEPL_API_KEY="your-api-key"
 * 2. 运行脚本：node scripts/fetch-deepl-languages.js
 *
 * 或者直接传入API密钥：
 * node scripts/fetch-deepl-languages.js your-api-key
 */

const https = require('https');

// 从命令行参数或环境变量获取API密钥
const apiKey = process.argv[2] || process.env.DEEPL_API_KEY;

if (!apiKey) {
  console.error('错误：缺少API密钥');
  console.error('使用方法：');
  console.error('  方法1: node scripts/fetch-deepl-languages.js YOUR_API_KEY');
  console.error('  方法2: export DEEPL_API_KEY="YOUR_API_KEY" && node scripts/fetch-deepl-languages.js');
  process.exit(1);
}

// 判断是Free还是Pro API
const apiHost = apiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';

/**
 * 调用DeepL API获取语言列表
 */
function fetchLanguages(type) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: apiHost,
      port: 443,
      path: `/v2/languages?type=${type}`,
      method: 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('DeepL API 语言列表获取工具');
  console.log('='.repeat(60));
  console.log(`API Host: ${apiHost}`);
  console.log('');

  try {
    // 获取源语言列表
    console.log('📥 正在获取源语言列表...');
    const sourceLanguages = await fetchLanguages('source');
    console.log(`✓ 成功获取 ${sourceLanguages.length} 种源语言\n`);

    // 获取目标语言列表
    console.log('📥 正在获取目标语言列表...');
    const targetLanguages = await fetchLanguages('target');
    console.log(`✓ 成功获取 ${targetLanguages.length} 种目标语言\n`);

    // 打印源语言列表
    console.log('='.repeat(60));
    console.log('源语言列表 (Source Languages)');
    console.log('='.repeat(60));
    console.log('代码\t名称\t\t\t支持formality');
    console.log('-'.repeat(60));
    sourceLanguages.forEach(lang => {
      const nameDisplay = lang.name.padEnd(24, ' ');
      const formality = lang.supports_formality ? '✓' : '-';
      console.log(`${lang.language}\t${nameDisplay}${formality}`);
    });

    console.log('\n');

    // 打印目标语言列表
    console.log('='.repeat(60));
    console.log('目标语言列表 (Target Languages)');
    console.log('='.repeat(60));
    console.log('代码\t\t名称\t\t\t\t支持formality');
    console.log('-'.repeat(60));
    targetLanguages.forEach(lang => {
      const codeDisplay = lang.language.padEnd(8, ' ');
      const nameDisplay = lang.name.padEnd(32, ' ');
      const formality = lang.supports_formality ? '✓' : '-';
      console.log(`${codeDisplay}${nameDisplay}${formality}`);
    });

    console.log('\n');

    // 生成TypeScript映射表代码
    console.log('='.repeat(60));
    console.log('TypeScript源语言映射表代码');
    console.log('='.repeat(60));
    console.log('private mapSourceLanguage(ytCode: string): string {');
    console.log('  const mapping: Record<string, string> = {');

    // 提取基础语言代码（去掉变体）
    const uniqueSourceCodes = [...new Set(sourceLanguages.map(lang => {
      const code = lang.language.split('-')[0];
      return code.toLowerCase();
    }))].sort();

    uniqueSourceCodes.forEach(code => {
      const deeplCode = code.toUpperCase();
      console.log(`    '${code}': '${deeplCode}',`);
    });
    console.log('  };');
    console.log('  return mapping[ytCode] || ytCode.toUpperCase();');
    console.log('}');

    console.log('\n');

    // 生成目标语言映射表代码
    console.log('='.repeat(60));
    console.log('TypeScript目标语言映射表代码');
    console.log('='.repeat(60));
    console.log('private mapTargetLanguage(ytCode: string): string {');
    console.log('  const mapping: Record<string, string> = {');

    // 处理目标语言（包含变体）
    const targetMapping = {};
    targetLanguages.forEach(lang => {
      const code = lang.language;
      const ytCode = code.toLowerCase().replace('_', '-');
      targetMapping[ytCode] = code;
    });

    // 添加常见的YouTube变体映射
    targetMapping['zh-cn'] = 'ZH-HANS';
    targetMapping['zh-hans'] = 'ZH-HANS';
    targetMapping['zh-tw'] = 'ZH-HANT';
    targetMapping['zh-hant'] = 'ZH-HANT';
    targetMapping['en-us'] = 'EN-US';
    targetMapping['en-gb'] = 'EN-GB';
    targetMapping['pt-br'] = 'PT-BR';
    targetMapping['pt-pt'] = 'PT-PT';

    // 排序并打印
    Object.keys(targetMapping).sort().forEach(ytCode => {
      const deeplCode = targetMapping[ytCode];
      console.log(`    '${ytCode}': '${deeplCode}',`);
    });

    console.log('  };');
    console.log('  return mapping[ytCode] || ytCode.toUpperCase();');
    console.log('}');

    console.log('\n');

    // 生成formality支持列表
    console.log('='.repeat(60));
    console.log('支持Formality的语言列表');
    console.log('='.repeat(60));
    const formalityLanguages = targetLanguages
      .filter(lang => lang.supports_formality)
      .map(lang => lang.language.toLowerCase());
    console.log('private isFormalitySupported(targetLang: string): boolean {');
    console.log('  const supportedLangs = [');
    formalityLanguages.forEach(code => {
      console.log(`    '${code}',`);
    });
    console.log('  ];');
    console.log('  return supportedLangs.includes(targetLang.toLowerCase());');
    console.log('}');

    console.log('\n');

    // 对比分析
    console.log('='.repeat(60));
    console.log('与当前代码的对比分析');
    console.log('='.repeat(60));

    const currentSourceCodes = [
      'zh-cn', 'zh-hans', 'zh-hant', 'en', 'ja', 'ko', 'es', 'fr', 'de',
      'pt', 'ru', 'ar', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'cs',
      'da', 'el', 'et', 'fi', 'hu', 'lt', 'lv', 'nb', 'ro', 'sk', 'sl',
      'sv', 'uk', 'bg'
    ];

    const apiSourceCodes = sourceLanguages.map(lang => lang.language.toLowerCase());

    const missing = apiSourceCodes.filter(code => !currentSourceCodes.includes(code));
    const extra = currentSourceCodes.filter(code => !apiSourceCodes.includes(code) && !code.includes('-'));

    if (missing.length > 0) {
      console.log('⚠️  当前代码缺失的语言：');
      missing.forEach(code => {
        const lang = sourceLanguages.find(l => l.language.toLowerCase() === code);
        console.log(`   - ${code.toUpperCase()}: ${lang.name}`);
      });
    } else {
      console.log('✓ 当前代码已覆盖所有源语言');
    }

    if (extra.length > 0) {
      console.log('\n⚠️  当前代码中多余的语言（API不支持）：');
      extra.forEach(code => {
        console.log(`   - ${code.toUpperCase()}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ 完成！');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 错误：', error.message);
    if (error.message.includes('401')) {
      console.error('\n提示：API密钥无效，请检查密钥是否正确');
    } else if (error.message.includes('403')) {
      console.error('\n提示：无权访问，请检查API密钥权限');
    } else if (error.message.includes('456')) {
      console.error('\n提示：配额已用尽');
    }
    process.exit(1);
  }
}

// 运行主函数
main();
