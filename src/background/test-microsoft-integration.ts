/**
 * @file test-microsoft-integration.ts
 * @description 微软翻译优化器集成测试
 * 测试完整的翻译流程：优化 → 翻译 → 映射
 */

import { MicrosoftTextOptimizer, SubtitleEntry } from './components/microsoft-text-optimizer';
import { MicrosoftTranslator } from './components/microsoft-translator';

// 生成真实的字幕数据（模拟YouTube字幕）
function generateRealSubtitles(): SubtitleEntry[] {
  return [
    { id: '1', start: 0.5, end: 2.5, text: "Hello everyone, welcome to this tutorial" },
    { id: '2', start: 2.5, end: 5.0, text: "Today we're going to learn about Chrome extensions" },
    { id: '3', start: 5.0, end: 8.0, text: "Chrome extensions are powerful tools that enhance your browser" },
    { id: '4', start: 8.0, end: 11.0, text: "They can modify web pages, add new features, and automate tasks" },
    { id: '5', start: 11.0, end: 14.0, text: "Let's start by understanding the basic architecture" },
    { id: '6', start: 14.0, end: 17.0, text: "Every extension needs a manifest file" },
    { id: '7', start: 17.0, end: 20.0, text: "The manifest describes your extension's capabilities" },
    { id: '8', start: 20.0, end: 23.0, text: "It also declares the permissions your extension needs" },
    { id: '9', start: 23.0, end: 26.0, text: "Next, we have the service worker for background tasks" },
    { id: '10', start: 26.0, end: 29.0, text: "Service workers run independently of web pages" },
    { id: '11', start: 29.0, end: 32.0, text: "They handle events and manage extension state" },
    { id: '12', start: 32.0, end: 35.0, text: "Content scripts are another important component" },
    { id: '13', start: 35.0, end: 38.0, text: "They run in the context of web pages" },
    { id: '14', start: 38.0, end: 41.0, text: "Content scripts can read and modify the DOM" },
    { id: '15', start: 41.0, end: 44.0, text: "But they have limited access to Chrome APIs" },
    { id: '16', start: 44.0, end: 47.0, text: "For full API access, you need the service worker" },
    { id: '17', start: 47.0, end: 50.0, text: "Communication between components uses message passing" },
    { id: '18', start: 50.0, end: 53.0, text: "You can send messages using chrome.runtime.sendMessage" },
    { id: '19', start: 53.0, end: 56.0, text: "And receive them with chrome.runtime.onMessage" },
    { id: '20', start: 56.0, end: 59.0, text: "This creates a robust communication system" }
  ];
}

// 模拟微软API响应（返回翻译后的文本）
function mockMicrosoftApiResponse(texts: string[]): string[] {
  return texts.map(text => {
    // 模拟翻译：保持换行符结构，但修改内容
    const lines = text.split('\n');
    const translatedLines = lines.map(line => {
      // 简单的模拟翻译（添加[已翻译]前缀）
      return `[已翻译] ${line}`;
    });
    return translatedLines.join('\n');
  });
}

// 运行集成测试
async function runIntegrationTest() {
  console.log('='.repeat(80));
  console.log('🚀 微软翻译优化器集成测试');
  console.log('='.repeat(80));

  // 1. 准备测试数据
  const subtitles = generateRealSubtitles();
  console.log(`\n📋 测试数据：${subtitles.length} 条真实字幕`);

  // 2. 创建优化器实例
  const optimizer = new MicrosoftTextOptimizer();

  // 3. 优化批次
  console.log('\n🔄 步骤1：优化批次');
  console.log('-'.repeat(40));
  const optimizedBatches = optimizer.optimizeBatches(subtitles);

  console.log(`✅ 优化完成：`);
  console.log(`  - 原始：${Math.ceil(subtitles.length / 10)} 个请求`);
  console.log(`  - 优化后：${optimizedBatches.length} 个请求`);

  // 打印每个批次的详细信息
  optimizedBatches.forEach((batch, batchIdx) => {
    console.log(`  - 批次${batchIdx + 1}：${batch.texts.length} 个Text对象`);
    batch.texts.forEach((text, textIdx) => {
      const lineCount = text.split('\n').length;
      console.log(`    - Text${textIdx + 1}：${lineCount} 条字幕，${text.length} 字符`);
    });
  });

  // 4. 模拟翻译调用
  console.log('\n🔄 步骤2：模拟翻译调用');
  console.log('-'.repeat(40));

  const allTranslatedTexts: string[] = [];
  const allIndexMappings: number[][] = [];

  for (let i = 0; i < optimizedBatches.length; i++) {
    const batch = optimizedBatches[i];

    console.log(`📤 发送批次${i + 1}：${batch.texts.length} 个Text对象`);

    // 模拟API调用
    const translatedTexts = mockMicrosoftApiResponse(batch.texts);

    console.log(`📥 收到响应：${translatedTexts.length} 个翻译结果`);

    // 收集结果
    allTranslatedTexts.push(...translatedTexts);
    allIndexMappings.push(...batch.indexMapping);
  }

  // 5. 映射回原始字幕
  console.log('\n🔄 步骤3：映射翻译结果');
  console.log('-'.repeat(40));

  const finalResults = optimizer.mapResults(
    allTranslatedTexts,
    allIndexMappings,
    subtitles.length
  );

  // 验证结果
  const successCount = finalResults.filter(r => r !== '').length;
  console.log(`✅ 映射完成：${successCount}/${subtitles.length} 条成功`);

  // 6. 展示部分结果
  console.log('\n📝 翻译结果示例（前5条）：');
  console.log('-'.repeat(40));
  for (let i = 0; i < Math.min(5, subtitles.length); i++) {
    console.log(`字幕${i + 1}:`);
    console.log(`  原文：${subtitles[i].text}`);
    console.log(`  译文：${finalResults[i]}`);
  }

  // 7. 性能分析
  console.log('\n📊 性能分析：');
  console.log('-'.repeat(40));
  const originalApiCalls = Math.ceil(subtitles.length / 10);
  const optimizedApiCalls = optimizedBatches.length;
  const reduction = Math.round(((originalApiCalls - optimizedApiCalls) / originalApiCalls) * 100);

  console.log(`API调用减少：${reduction}%`);
  console.log(`原始方案：${originalApiCalls} 次API调用`);
  console.log(`优化方案：${optimizedApiCalls} 次API调用`);

  // 计算字符利用率
  let totalChars = 0;
  let totalCapacity = 0;
  optimizedBatches.forEach(batch => {
    batch.texts.forEach(text => {
      totalChars += text.length;
      totalCapacity += 5000; // 每个Text的容量
    });
  });
  const utilization = Math.round((totalChars / totalCapacity) * 100);
  console.log(`字符利用率：${utilization}%（${totalChars}/${totalCapacity}）`);

  // 8. 测试实际翻译器（如果需要）
  console.log('\n🔬 测试实际翻译器集成：');
  console.log('-'.repeat(40));

  try {
    const translator = new MicrosoftTranslator();
    console.log('✅ MicrosoftTranslator 实例创建成功');
    console.log('✅ 已准备好进行实际API调用（需要网络连接）');

    // 注意：实际调用需要：
    // 1. 有效的网络连接
    // 2. 正确的CORS设置（在浏览器环境）
    // 3. 有效的认证令牌

    // 如果要测试实际调用，取消下面的注释：
    /*
    const testBatch = optimizedBatches[0];
    if (testBatch) {
      const actualTranslations = await translator.translateOptimized(
        testBatch.texts,
        'en',
        'zh-Hans',
        'urgent'
      );
      console.log(`实际翻译返回：${actualTranslations.length} 个结果`);
    }
    */
  } catch (error) {
    console.log('⚠️ 跳过实际API调用测试（需要在Chrome扩展环境中运行）');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ 集成测试完成！');
  console.log('='.repeat(80));
}

// 运行测试
runIntegrationTest().catch(error => {
  console.error('❌ 集成测试失败:', error);
});