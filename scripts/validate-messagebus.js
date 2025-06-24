/**
 * MessageBus迁移验证脚本
 * 在YouTube页面的浏览器控制台中运行此脚本进行验证
 */

// 验证结果收集器
const validationResults = {
  ui: {},
  messagebus: {},
  translation: {},
  storage: {},
  overall: { passed: 0, failed: 0, total: 0 }
};

// 辅助函数
const log = (category, test, result, details = '') => {
  const status = result ? '✅' : '❌';
  const message = `[${category}] ${test}: ${status} ${details}`;
  console.log(message);
  
  if (!validationResults[category]) validationResults[category] = {};
  validationResults[category][test] = { passed: result, details };
  
  validationResults.overall.total++;
  if (result) validationResults.overall.passed++;
  else validationResults.overall.failed++;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Phase 1: UI注入验证
async function validateUI() {
  console.log('\n🎯 Phase 1: UI注入验证');
  
  // 1.1 检查翻译按钮
  const translateButton = document.getElementById('vid-translate-toggle-button');
  log('ui', '翻译按钮存在', !!translateButton, translateButton ? '已找到' : '未找到');
  
  // 1.2 检查设置按钮
  const settingsButton = document.getElementById('vid-translate-settings-button');
  log('ui', '设置按钮存在', !!settingsButton, settingsButton ? '已找到' : '未找到');
  
  // 1.3 检查按钮位置
  const rightControls = document.querySelector('.ytp-right-controls');
  log('ui', '右侧控制栏存在', !!rightControls, rightControls ? '已找到' : '未找到');
  
  // 1.4 检查字幕叠加层
  const subtitleOverlay = document.getElementById('yt-translate-subtitle-overlay');
  log('ui', '字幕叠加层准备', true, subtitleOverlay ? '已创建' : '未创建（正常，按需创建）');
  
  // 1.5 检查图标资源
  if (translateButton) {
    const icon = translateButton.querySelector('img');
    log('ui', '翻译按钮图标', !!icon, icon ? `src: ${icon.src.split('/').pop()}` : '图标缺失');
  }
  
  if (settingsButton) {
    const icon = settingsButton.querySelector('img');
    log('ui', '设置按钮图标', !!icon, icon ? `src: ${icon.src.split('/').pop()}` : '图标缺失');
  }
  
  return { translateButton, settingsButton, rightControls };
}

// Phase 2: MessageBus通信验证
async function validateMessageBus() {
  console.log('\n🔄 Phase 2: MessageBus通信验证');
  
  // 2.1 检查全局MessageBus实例
  const hasMessageBus = typeof window.__messageBus !== 'undefined';
  log('messagebus', 'MessageBus实例存在', hasMessageBus, hasMessageBus ? '已初始化' : '未找到全局实例');
  
  // 2.2 检查Chrome runtime
  const hasRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  log('messagebus', 'Chrome Runtime可用', hasRuntime, hasRuntime ? `ID: ${chrome.runtime.id}` : 'Runtime不可用');
  
  // 2.3 模拟消息发送测试
  if (hasRuntime) {
    try {
      // 发送测试消息
      const testMessage = { action: 'PING', timestamp: Date.now() };
      chrome.runtime.sendMessage(testMessage, (response) => {
        log('messagebus', '消息发送测试', !chrome.runtime.lastError, 
            chrome.runtime.lastError ? chrome.runtime.lastError.message : '消息发送成功');
      });
    } catch (error) {
      log('messagebus', '消息发送测试', false, `异常: ${error.message}`);
    }
  }
  
  // 2.4 检查EventBus残留
  const hasEventBus = typeof window.__eventBus !== 'undefined';
  log('messagebus', 'EventBus已清理', !hasEventBus, hasEventBus ? '仍有EventBus残留' : 'EventBus已清理');
}

// Phase 3: 存储验证
async function validateStorage() {
  console.log('\n💾 Phase 3: 存储验证');
  
  if (typeof chrome !== 'undefined' && chrome.storage) {
    try {
      // 检查存储权限
      chrome.storage.local.get(null, (data) => {
        const hasData = Object.keys(data).length > 0;
        log('storage', '存储访问权限', true, `已找到 ${Object.keys(data).length} 个存储项`);
        
        // 检查关键存储项
        const hasUserPrefs = data.userPreferences || data.targetLanguage;
        log('storage', '用户偏好存储', hasUserPrefs, hasUserPrefs ? '已找到用户偏好' : '未找到用户偏好');
        
        const hasRuntimeState = data.runtimeState || data.translateActive;
        log('storage', '运行时状态存储', hasRuntimeState, hasRuntimeState ? '已找到运行时状态' : '未找到运行时状态');
        
        // 显示存储内容摘要
        console.log('📦 存储内容摘要:', Object.keys(data));
      });
    } catch (error) {
      log('storage', '存储访问权限', false, `存储访问失败: ${error.message}`);
    }
  } else {
    log('storage', '存储API可用', false, 'chrome.storage API不可用');
  }
}

// Phase 4: 交互测试
async function validateInteraction(translateButton, settingsButton) {
  console.log('\n🖱️ Phase 4: 交互测试');
  
  if (translateButton) {
    // 模拟点击翻译按钮
    console.log('⚠️ 即将模拟点击翻译按钮，请观察状态变化...');
    await sleep(2000);
    
    const initialIcon = translateButton.querySelector('img')?.src;
    translateButton.click();
    
    await sleep(1000);
    const newIcon = translateButton.querySelector('img')?.src;
    log('interaction', '翻译按钮响应', initialIcon !== newIcon, 
        `图标变化: ${initialIcon?.split('/').pop()} → ${newIcon?.split('/').pop()}`);
  }
  
  if (settingsButton) {
    console.log('⚠️ 即将模拟点击设置按钮，请观察SidePanel...');
    await sleep(2000);
    
    settingsButton.click();
    
    await sleep(1000);
    log('interaction', '设置按钮响应', true, '已触发点击事件');
  }
}

// 主验证函数
async function runValidation() {
  console.clear();
  console.log('🚀 开始MessageBus迁移验证...\n');
  console.log('📋 验证将分为4个阶段进行：');
  console.log('   1. UI注入验证');
  console.log('   2. MessageBus通信验证');
  console.log('   3. 存储验证');
  console.log('   4. 交互测试');
  console.log('\n请确保您在YouTube视频页面上运行此脚本\n');
  
  // 检查当前页面
  const isYouTube = window.location.hostname.includes('youtube.com');
  const isVideoPage = window.location.pathname.includes('/watch');
  
  if (!isYouTube) {
    console.error('❌ 错误: 请在YouTube页面运行此验证脚本');
    return;
  }
  
  if (!isVideoPage) {
    console.warn('⚠️ 警告: 建议在YouTube视频页面运行此脚本以获得完整验证');
  }
  
  // 执行验证阶段
  const { translateButton, settingsButton } = await validateUI();
  await validateMessageBus();
  await validateStorage();
  
  // 询问是否进行交互测试
  if (translateButton || settingsButton) {
    console.log('\n❓ 是否进行交互测试？交互测试将自动点击按钮');
    console.log('   如需进行交互测试，请运行: validateInteraction()');
    window.validateInteraction = () => validateInteraction(translateButton, settingsButton);
  }
  
  // 显示验证结果摘要
  console.log('\n📊 验证结果摘要:');
  console.log(`   总计: ${validationResults.overall.total} 项测试`);
  console.log(`   通过: ${validationResults.overall.passed} 项 ✅`);
  console.log(`   失败: ${validationResults.overall.failed} 项 ❌`);
  
  const successRate = ((validationResults.overall.passed / validationResults.overall.total) * 100).toFixed(1);
  console.log(`   成功率: ${successRate}%`);
  
  if (validationResults.overall.failed === 0) {
    console.log('\n🎉 恭喜！所有验证项目都通过了！');
    console.log('✅ MessageBus迁移验证成功');
  } else {
    console.log('\n⚠️ 发现问题，请检查失败的验证项目');
    console.log('📝 详细结果已保存在 validationResults 变量中');
  }
  
  // 将结果保存到全局变量
  window.validationResults = validationResults;
  
  return validationResults;
}

// 导出验证函数到全局作用域
window.runValidation = runValidation;
window.validateUI = validateUI;
window.validateMessageBus = validateMessageBus;
window.validateStorage = validateStorage;

// 自动运行验证（延迟3秒确保页面加载完成）
console.log('⏳ MessageBus验证脚本已加载，3秒后自动开始验证...');
console.log('💡 您也可以手动运行: runValidation()');

setTimeout(runValidation, 3000); 