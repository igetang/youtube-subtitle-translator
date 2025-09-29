/**
 * @file test-microsoft-optimizer.ts
 * @description 测试微软翻译5000字符窗口优化器
 * 用于验证优化算法的正确性和效果
 */

import { MicrosoftTextOptimizer, SubtitleEntry } from './components/microsoft-text-optimizer';

// 模拟生成测试字幕数据
function generateTestSubtitles(count: number, avgLength: number = 50): SubtitleEntry[] {
  const subtitles: SubtitleEntry[] = [];
  const sampleTexts = [
    "Hello, welcome to this video",
    "Today we're going to learn about Chrome extensions",
    "This is a very interesting topic",
    "Let's start with the basics",
    "Chrome extensions are small programs",
    "They can enhance your browsing experience",
    "You can build them using JavaScript",
    "The manifest file is very important",
    "Service workers handle background tasks",
    "Content scripts run in web pages"
  ];

  for (let i = 0; i < count; i++) {
    const baseText = sampleTexts[i % sampleTexts.length];
    // 添加一些变化，模拟不同长度
    const variation = Math.random() > 0.5 ? " and this is additional content" : "";

    subtitles.push({
      id: `subtitle_${i}`,
      start: i * 2,
      end: (i + 1) * 2 - 0.1,
      text: `${baseText}${variation} [${i + 1}]`
    });
  }

  return subtitles;
}

// 测试超长字幕的处理
function generateLongSubtitle(): SubtitleEntry {
  const longText = "This is an extremely long subtitle that exceeds the 5000 character limit. ".repeat(100);
  return {
    id: 'long_subtitle',
    start: 0,
    end: 10,
    text: longText
  };
}

// 运行测试
async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 微软翻译5000字符窗口优化器测试');
  console.log('='.repeat(80));

  const optimizer = new MicrosoftTextOptimizer();

  // 测试1：小批量字幕（10条）
  console.log('\n📝 测试1：小批量字幕（10条）');
  console.log('-'.repeat(40));
  const smallBatch = generateTestSubtitles(10);
  const smallResult = optimizer.optimizeBatches(smallBatch);
  console.log(`输入：${smallBatch.length} 条字幕`);
  console.log(`输出：${smallResult.length} 个批次`);
  console.log(`第一批包含：${smallResult[0]?.texts.length || 0} 个Text对象`);

  // 测试2：中等批量字幕（100条）
  console.log('\n📝 测试2：中等批量字幕（100条）');
  console.log('-'.repeat(40));
  const mediumBatch = generateTestSubtitles(100);
  const mediumResult = optimizer.optimizeBatches(mediumBatch);
  console.log(`输入：${mediumBatch.length} 条字幕`);
  console.log(`输出：${mediumResult.length} 个批次`);

  // 计算优化率
  const originalRequests = Math.ceil(100 / 10); // 原始方案
  const optimizedRequests = mediumResult.length;
  const reduction = Math.round(((originalRequests - optimizedRequests) / originalRequests) * 100);
  console.log(`请求减少：${reduction}%（${originalRequests} → ${optimizedRequests}）`);

  // 测试3：大批量字幕（500条）
  console.log('\n📝 测试3：大批量字幕（500条）');
  console.log('-'.repeat(40));
  const largeBatch = generateTestSubtitles(500);
  const largeResult = optimizer.optimizeBatches(largeBatch);
  console.log(`输入：${largeBatch.length} 条字幕`);
  console.log(`输出：${largeResult.length} 个批次`);

  const originalRequests2 = Math.ceil(500 / 10);
  const optimizedRequests2 = largeResult.length;
  const reduction2 = Math.round(((originalRequests2 - optimizedRequests2) / originalRequests2) * 100);
  console.log(`请求减少：${reduction2}%（${originalRequests2} → ${optimizedRequests2}）`);

  // 测试4：超长字幕处理
  console.log('\n📝 测试4：超长字幕处理');
  console.log('-'.repeat(40));
  const longSubtitle = generateLongSubtitle();
  const mixedBatch = [...generateTestSubtitles(5), longSubtitle, ...generateTestSubtitles(5)];
  const mixedResult = optimizer.optimizeBatches(mixedBatch);
  console.log(`输入：${mixedBatch.length} 条字幕（包含1条超长）`);
  console.log(`输出：${mixedResult.length} 个批次`);

  // 测试5：结果映射
  console.log('\n📝 测试5：结果映射测试');
  console.log('-'.repeat(40));
  const testBatch = generateTestSubtitles(20);
  const testResult = optimizer.optimizeBatches(testBatch);

  // 模拟翻译结果（每个Text返回相同数量的翻译，用换行符分隔）
  const mockTranslations = testResult[0].texts.map(text => {
    const lines = text.split('\n');
    return lines.map(line => `[翻译] ${line}`).join('\n');
  });

  const mappedResults = optimizer.mapResults(
    mockTranslations,
    testResult[0].indexMapping,
    testBatch.length
  );

  console.log(`映射测试：${mappedResults.filter(r => r !== '').length}/${testBatch.length} 条成功映射`);

  // 测试6：预估优化效果
  console.log('\n📝 测试6：预估优化效果');
  console.log('-'.repeat(40));
  optimizer.estimateOptimization(1000, 50);  // 1000条字幕，平均50字符
  optimizer.estimateOptimization(2000, 80);  // 2000条字幕，平均80字符

  // 测试7：验证批次组装
  console.log('\n📝 测试7：批次组装验证');
  console.log('-'.repeat(40));
  const detailBatch = generateTestSubtitles(150);
  const detailResult = optimizer.optimizeBatches(detailBatch);

  let totalSubtitles = 0;
  detailResult.forEach((batch, batchIdx) => {
    let batchSubtitleCount = 0;
    batch.indexMapping.forEach(indices => {
      batchSubtitleCount += indices.length;
    });
    totalSubtitles += batchSubtitleCount;
    console.log(
      `批次${batchIdx + 1}: ${batch.texts.length} 个Text对象，` +
      `包含 ${batchSubtitleCount} 条字幕`
    );
  });

  console.log(`\n验证：总计 ${totalSubtitles} 条字幕（应为 ${detailBatch.length} 条）`);
  const isValid = totalSubtitles === detailBatch.length;
  console.log(isValid ? '✅ 批次组装正确' : '❌ 批次组装有误');

  console.log('\n' + '='.repeat(80));
  console.log('✅ 所有测试完成！');
  console.log('='.repeat(80));
}

// 执行测试
runTests().catch(error => {
  console.error('❌ 测试失败:', error);
});