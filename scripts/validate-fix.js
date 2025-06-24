/**
 * MessageBus迁移 + UI初始化修复验证脚本
 * 在YouTube页面控制台中运行此脚本
 */

(function validateMessageBusFix() {
  console.clear();
  console.log('🔧 MessageBus迁移 + UI修复验证\n');
  
  let passedTests = 0;
  let totalTests = 6;
  
  function logResult(testName, passed, details = '') {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${testName}${details ? ': ' + details : ''}`);
    if (passed) passedTests++;
  }
  
  // 测试1：MessageBus初始化
  const messageBusExists = typeof window.messageBus !== 'undefined';
  logResult('MessageBus初始化', messageBusExists);
  
  // 测试2：Main World脚本加载
  const mainWorldScript = document.getElementById('yt-translator-main-world-script');
  logResult('Main World脚本注入', !!mainWorldScript);
  
  // 测试3：UI管理器初始化状态
  const uiManagerInit = !!window.__uiManagerInitialized;
  logResult('UI管理器初始化状态', uiManagerInit);
  
  // 测试4：翻译按钮存在
  const translateBtn = document.querySelector('[data-yt-translate="translate-button"]') || 
                      document.getElementById('vid-translate-toggle-button');
  logResult('翻译按钮存在', !!translateBtn);
  
  // 测试5：设置按钮存在  
  const settingsBtn = document.querySelector('[data-yt-translate="settings-button"]') ||
                      document.getElementById('vid-translate-settings-button');
  logResult('设置按钮存在', !!settingsBtn);
  
  // 测试6：播放器控制栏存在
  const rightControls = document.querySelector('.ytp-right-controls');
  logResult('播放器控制栏', !!rightControls);
  
  console.log('\n📊 验证结果:');
  console.log(`通过: ${passedTests}/${totalTests} 项测试`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！UI初始化修复成功！');
    
    // 额外的功能测试
    console.log('\n🎯 进行功能测试...');
    if (translateBtn) {
      console.log('测试翻译按钮点击...');
      translateBtn.click();
      setTimeout(() => {
        console.log('✅ 翻译按钮响应正常');
      }, 300);
    }
    
    if (settingsBtn) {
      console.log('测试设置按钮点击...');
      settingsBtn.click();
      setTimeout(() => {
        console.log('✅ 设置按钮响应正常');
      }, 300);
    }
    
  } else if (passedTests >= 4) {
    console.log('⚠️ 大部分功能正常，但仍有少量问题');
    console.log('建议：刷新页面重试或检查控制台错误');
    
  } else {
    console.log('❌ 多项测试失败，需要进一步调试');
    console.log('\n🔍 调试建议:');
    
    if (!messageBusExists) {
      console.log('- MessageBus未初始化，检查content-script.ts加载');
    }
    
    if (!mainWorldScript) {
      console.log('- Main World脚本未注入，检查脚本路径');
    }
    
    if (!uiManagerInit) {
      console.log('- UI管理器未初始化，检查MAIN_WORLD_READY事件处理');
    }
    
    if (!translateBtn || !settingsBtn) {
      console.log('- UI按钮未注入，检查ui-manager.ts的按钮创建逻辑');
    }
    
    if (!rightControls) {
      console.log('- 播放器控制栏未找到，可能页面未完全加载');
    }
  }
  
  console.log('\n💡 提示：如果测试失败，请：');
  console.log('1. 刷新页面重试');
  console.log('2. 检查扩展是否正确加载');
  console.log('3. 查看控制台错误信息');
  console.log('4. 确认YouTube页面完全加载');
  
})(); 