/**
 * MessageBus数据传递调试脚本
 * 用于验证MAIN_WORLD_READY消息的完整传递链路
 */

(function debugMessageBusDataFlow() {
  console.clear();
  console.log('🔍 MessageBus数据传递调试\n');
  
  // 步骤1：检查MessageBus初始化
  console.log('=== 步骤1：MessageBus初始化检查 ===');
  const messageBusExists = typeof window.messageBus !== 'undefined';
  console.log(`MessageBus存在: ${messageBusExists ? '✅' : '❌'}`);
  
  if (messageBusExists) {
    console.log('MessageBus实例:', window.messageBus);
  }
  
  // 步骤2：检查主世界脚本
  console.log('\n=== 步骤2：主世界脚本检查 ===');
  const mainWorldScript = document.getElementById('yt-translator-main-world-script');
  console.log(`主世界脚本注入: ${mainWorldScript ? '✅' : '❌'}`);
  
  if (mainWorldScript) {
    console.log('脚本路径:', mainWorldScript.src);
  }
  
  // 步骤3：检查全局状态标志
  console.log('\n=== 步骤3：全局状态检查 ===');
  console.log(`UI管理器初始化: ${window.__uiManagerInitialized ? '✅' : '❌'}`);
  console.log(`事件系统初始化: ${window.__eventSystemInitialized ? '✅' : '❌'}`);
  
  // 步骤4：检查UI元素
  console.log('\n=== 步骤4：UI元素检查 ===');
  const translateBtn = document.querySelector('[data-yt-translate="translate-button"]') || 
                      document.getElementById('vid-translate-toggle-button');
  const settingsBtn = document.querySelector('[data-yt-translate="settings-button"]') ||
                      document.getElementById('vid-translate-settings-button');
  const rightControls = document.querySelector('.ytp-right-controls');
  
  console.log(`翻译按钮: ${translateBtn ? '✅' : '❌'}`);
  console.log(`设置按钮: ${settingsBtn ? '✅' : '❌'}`);
  console.log(`播放器控制栏: ${rightControls ? '✅' : '❌'}`);
  
  // 步骤5：模拟MAIN_WORLD_READY消息发送
  console.log('\n=== 步骤5：模拟消息发送测试 ===');
  
  // 监听MessageBus消息（如果可能）
  let messageReceived = false;
  
  // 尝试访问MessageBus的内部状态
  if (window.messageBus && typeof window.messageBus.sendMessage === 'function') {
    console.log('🧪 测试MessageBus消息发送...');
    
    try {
      // 模拟发送UI_STATE_UPDATE消息
      window.messageBus.sendMessage({
        type: 'ui_state_update',
        data: {
          type: 'MAIN_WORLD_READY',
          payload: undefined,
          source: 'main-world',
          eventType: 'main-world:ready',
          eventData: { timestamp: Date.now() }
        }
      });
      
      console.log('✅ MessageBus消息发送成功');
      messageReceived = true;
      
      // 等待一下看是否有UI初始化
      setTimeout(() => {
        const uiInitAfterTest = window.__uiManagerInitialized;
        console.log(`消息发送后UI管理器状态: ${uiInitAfterTest ? '✅ 已初始化' : '❌ 未初始化'}`);
        
        if (uiInitAfterTest && !translateBtn) {
          console.log('🔄 UI管理器已初始化但按钮未出现，检查DOM注入逻辑');
          
          // 检查UI管理器实例
          if (typeof UIManager !== 'undefined') {
            const uiManager = UIManager.getInstance();
            console.log('UI管理器实例:', uiManager);
            
            if (uiManager && typeof uiManager.injectControls === 'function') {
              console.log('🔧 手动触发控件注入...');
              uiManager.injectControls().then(success => {
                console.log(`手动注入结果: ${success ? '✅ 成功' : '❌ 失败'}`);
              }).catch(error => {
                console.error('手动注入失败:', error);
              });
            }
          }
        }
      }, 1000);
      
    } catch (error) {
      console.error('❌ MessageBus消息发送失败:', error);
    }
  } else {
    console.log('❌ MessageBus不可用或缺少sendMessage方法');
  }
  
  // 步骤6：手动触发主世界脚本重新发送消息
  console.log('\n=== 步骤6：触发主世界脚本重新发送消息 ===');
  
  try {
    window.postMessage({
      source: 'content-script',
      type: 'CHECK_MAIN_WORLD_READY'
    }, '*');
    
    console.log('✅ 已发送CHECK_MAIN_WORLD_READY请求');
    
    // 监听来自主世界的响应
    const messageListener = (event) => {
      if (event.source === window && event.data?.source === 'main-world') {
        console.log('📥 收到主世界脚本消息:', event.data);
        
        if (event.data.type === 'MAIN_WORLD_READY') {
          console.log('🎯 收到MAIN_WORLD_READY消息！');
          
          // 检查是否触发了UI初始化
          setTimeout(() => {
            const uiInitAfterMsg = window.__uiManagerInitialized;
            console.log(`收到消息后UI管理器状态: ${uiInitAfterMsg ? '✅' : '❌'}`);
          }, 500);
        }
      }
    };
    
    window.addEventListener('message', messageListener);
    
    // 5秒后移除监听器
    setTimeout(() => {
      window.removeEventListener('message', messageListener);
      console.log('🔇 消息监听器已移除');
    }, 5000);
    
  } catch (error) {
    console.error('❌ 触发主世界脚本失败:', error);
  }
  
  // 步骤7：总结和建议
  console.log('\n=== 📊 调试总结 ===');
  
  const issues = [];
  const successes = [];
  
  if (!messageBusExists) issues.push('MessageBus未初始化');
  else successes.push('MessageBus已初始化');
  
  if (!mainWorldScript) issues.push('主世界脚本未注入');
  else successes.push('主世界脚本已注入');
  
  if (!window.__uiManagerInitialized) issues.push('UI管理器未初始化');
  else successes.push('UI管理器已初始化');
  
  if (!translateBtn || !settingsBtn) issues.push('UI按钮未显示');
  else successes.push('UI按钮正常显示');
  
  console.log(`✅ 成功项目 (${successes.length}):`);
  successes.forEach(item => console.log(`  - ${item}`));
  
  if (issues.length > 0) {
    console.log(`\n❌ 问题项目 (${issues.length}):`);
    issues.forEach(item => console.log(`  - ${item}`));
    
    console.log('\n🔧 调试建议:');
    if (!messageBusExists) {
      console.log('  1. 检查content-script.ts是否正确加载');
      console.log('  2. 查看控制台是否有MessageBus初始化错误');
    }
    
    if (!window.__uiManagerInitialized) {
      console.log('  3. 检查handleUIStateUpdate()是否被正确调用');
      console.log('  4. 验证MessageBus数据传递是否正确');
    }
    
    if (!translateBtn || !settingsBtn) {
      console.log('  5. 检查UI管理器的injectControls()方法');
      console.log('  6. 验证DOM观察器是否正常工作');
    }
  } else {
    console.log('\n🎉 所有检查通过！MessageBus迁移成功！');
  }
  
  console.log('\n💡 提示：此脚本会持续监听5秒钟的消息，请观察后续日志');
  
})(); 