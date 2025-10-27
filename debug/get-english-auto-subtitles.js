// 获取YouTube指定语言字幕的测试工具
(async function() {
  
  // ========== 配置参数 ==========
  // 修改这里来选择要获取的字幕类型
  const SUBTITLE_CONFIG = {
    // 选项1: 'english' - 原生英语字幕
    // 选项2: 'english-auto' - 英语（自动生成）
    // 选项3: 'chinese' - 中文字幕
    // 选项4: 'chinese-simplified' - 中文（简体）
    // 选项5: 'custom' - 自定义（在下面填写关键词）
    type: 'english-auto',  // 👈 修改这里选择字幕类型
    
    // 如果选择custom，在这里填写自定义关键词
    customKeywords: {
      include: ['english'],  // 必须包含的关键词
      exclude: []            // 必须排除的关键词
    }
  };
  // ==============================
  
  const subtitleTypeMap = {
    'english': {
      name: '原生英语字幕',
      include: ['english', '英语', '英文'],
      exclude: ['auto', '自动', 'automatic']
    },
    'english-auto': {
      name: '英语（自动生成）',
      include: ['english', '英语', '英文'],
      mustInclude: ['auto', '自动', 'automatic']
    },
    'chinese': {
      name: '中文字幕',
      include: ['chinese', '中文', '汉语'],
      exclude: ['auto', '自动', 'automatic']
    },
    'chinese-simplified': {
      name: '中文（简体）',
      include: ['简体', 'simplified', '中文'],
      exclude: ['繁体', 'traditional']
    },
    'custom': {
      name: '自定义字幕',
      include: SUBTITLE_CONFIG.customKeywords.include,
      exclude: SUBTITLE_CONFIG.customKeywords.exclude
    }
  };
  
  const selectedType = subtitleTypeMap[SUBTITLE_CONFIG.type] || subtitleTypeMap['english'];
  
  console.log(`\n=== 获取${selectedType.name} ===\n`);
  console.log('时间:', new Date().toLocaleString());
  console.log('配置:', SUBTITLE_CONFIG.type);
  console.log('=' .repeat(80));
  
  // 1. 设置拦截器
  console.log('\n1. 设置字幕拦截器...');
  
  // 保存原始的fetch（与项目代码保持一致）
  const originalFetch = window.fetch;
  
  let subtitlesReceived = false;
  
  // 拦截fetch请求
  window.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    
    if (url && url.includes('timedtext')) {
      console.log('\n🎯 拦截到字幕请求(Fetch):', url.substring(0, 100) + '...');
      
      const response = await originalFetch(...args);
      const clone = response.clone();
      
      clone.text().then(text => {
        try {
          const data = JSON.parse(text);
          if (data.events && !subtitlesReceived) {
            subtitlesReceived = true;
            
            const subtitles = data.events
              .filter(e => e.segs)
              .map(e => ({
                index: data.events.indexOf(e),
                start: (e.tStartMs || 0) / 1000,
                duration: (e.dDurationMs || 0) / 1000,
                text: e.segs.map(s => s.utf8).join('').trim()
              }))
              .filter(s => s.text);
            
            window.__subtitles = subtitles;
            
            // 打印字幕分析
            console.log(`\n✅ 成功获取 ${subtitles.length} 条${selectedType.name}(通过Fetch)\n`);
            console.log('=' .repeat(80));
            console.log('\n📝 字幕内容分析:\n');
            
            // 调用统一的分析函数
            analyzeSubtitles(subtitles);
          }
        } catch (e) {
          console.error('解析失败:', e);
        }
      });
      
      return response;
    }
    
    return originalFetch(...args);
  };
  
  // 添加XMLHttpRequest拦截（与项目代码保持一致）
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (url && url.includes('timedtext')) {
      console.log('\n🎯 拦截到字幕请求(XHR):', url.substring(0, 100) + '...');
      
      this.addEventListener('load', function() {
        if (!subtitlesReceived) {
          try {
            const data = JSON.parse(this.responseText);
            if (data.events) {
              subtitlesReceived = true;
              
              const subtitles = data.events
                .filter(e => e.segs)
                .map(e => ({
                  index: data.events.indexOf(e),
                  start: (e.tStartMs || 0) / 1000,
                  duration: (e.dDurationMs || 0) / 1000,
                  text: e.segs.map(s => s.utf8).join('').trim()
                }))
                .filter(s => s.text);
              
              window.__subtitles = subtitles;
              
              // 打印字幕分析
              console.log(`\n✅ 成功获取 ${subtitles.length} 条${selectedType.name}(通过XHR)\n`);
              console.log('=' .repeat(80));
              console.log('\n📝 字幕内容分析:\n');
              
              // 分析字幕结构（代码与fetch部分相同）
              analyzeSubtitles(subtitles);
            }
          } catch (e) {
            console.error('XHR解析失败:', e);
          }
        }
      });
    }
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  
  // 简化分析函数 - 一次性打印所有字幕文本
  function analyzeSubtitles(subtitles) {
    console.log('\n=== 英语字幕内容 ===\n');
    
    // 打印前10条看看原始格式
    console.log('【前10条字幕原始内容】：');
    subtitles.slice(0, 10).forEach((sub, i) => {
      console.log(`字幕${i+1}: "${sub.text}"`);
    });
    
    // 字幕间用双换行符分隔，便于区分每条字幕
    const mergedText = subtitles.map(sub => sub.text).join('\n\n');
    
    // 打印合并后的完整文本
    console.log('\n【合并后的完整字幕（双换行分隔）】：');
    console.log(mergedText);
    
    console.log('\n=== 字幕内容结束 ===\n');
    console.log(`总计: ${subtitles.length} 条字幕`);
    console.log(`合并后总长度: ${mergedText.length} 字符`);
    
    // 保存到全局变量
    window.__englishAutoSubtitles = subtitles;
    window.__mergedSubtitleText = mergedText;
    console.log('\n💡 完整字幕数据已保存到: window.__englishAutoSubtitles');
    console.log('💡 合并文本已保存到: window.__mergedSubtitleText');
    console.log('💡 可以使用 copy(window.__mergedSubtitleText) 复制合并后的文本');
  }
  
  // 2. 查找并点击指定字幕选项
  console.log(`\n2. 正在切换到${selectedType.name}...`);
  
  // 打开设置
  const settingsBtn = document.querySelector('.ytp-settings-button');
  if (!settingsBtn) {
    console.error('❌ 未找到设置按钮');
    return;
  }
  
  settingsBtn.click();
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 点击字幕菜单
  const menuItems = document.querySelectorAll('.ytp-menuitem');
  let subtitleMenuFound = false;
  for (const item of menuItems) {
    if (item.textContent.includes('字幕') || 
        item.textContent.includes('Subtitles') || 
        item.textContent.includes('Captions') ||
        item.textContent.includes('CC')) {
      item.click();
      subtitleMenuFound = true;
      break;
    }
  }
  
  if (!subtitleMenuFound) {
    console.error('❌ 未找到字幕菜单');
    settingsBtn.click(); // 关闭设置
    return;
  }
  
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 查找配置指定的字幕
  const subtitleOptions = document.querySelectorAll('.ytp-menuitem');
  let found = false;
  
  console.log(`\n3. 查找${selectedType.name}选项...`);
  console.log(`   找到 ${subtitleOptions.length} 个字幕选项`);
  
  // 根据配置查找字幕
  for (const option of subtitleOptions) {
    const text = option.textContent.toLowerCase();
    
    // 检查是否匹配配置的条件
    const hasIncludeKeyword = selectedType.include.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    const hasExcludeKeyword = selectedType.exclude && selectedType.exclude.length > 0 ? 
      selectedType.exclude.some(keyword => text.includes(keyword.toLowerCase())) : false;
    
    const hasMustIncludeKeyword = selectedType.mustInclude ? 
      selectedType.mustInclude.some(keyword => text.includes(keyword.toLowerCase())) : true;
    
    if (hasIncludeKeyword && !hasExcludeKeyword && hasMustIncludeKeyword) {
      console.log(`   ✅ 找到: ${option.textContent}`);
      option.click();
      found = true;
      break;
    }
  }
  
  // 如果没找到，列出所有可用选项
  if (!found) {
    console.log(`   ⚠️ 未找到${selectedType.name}`);
    console.log('   可用的字幕选项：');
    for (const option of subtitleOptions) {
      console.log(`     - ${option.textContent}`);
    }
  }
  
  // 关闭设置菜单
  await new Promise(resolve => setTimeout(resolve, 100));
  const closeBtn = document.querySelector('.ytp-panel-back-button');
  if (closeBtn) closeBtn.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  settingsBtn.click();
  
  if (!found) {
    console.error('❌ 未找到英语字幕选项');
    return;
  }
  
  // 3. 确保字幕开启
  console.log('\n4. 确保字幕开启...');
  const subtitleBtn = document.querySelector('.ytp-subtitles-button');
  if (subtitleBtn) {
    const isOn = subtitleBtn.getAttribute('aria-pressed') === 'true';
    if (!isOn) {
      console.log('   开启字幕...');
      subtitleBtn.click();
    } else {
      console.log('   字幕已开启，触发刷新...');
      // 关闭再开启以触发新请求
      subtitleBtn.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      subtitleBtn.click();
    }
  }
  
  // 4. 等待拦截
  console.log('\n5. 等待字幕加载...');
  console.log('   请稍候，正在拦截字幕数据...');
  
  // 等待最多5秒
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (window.__englishAutoSubtitles) {
      console.log('\n✅ 字幕获取成功！');
      break;
    }
    if (i === 9) {
      console.error('\n❌ 超时：未能拦截到字幕');
      console.log('   可能原因：');
      console.log('   1. 视频没有英语字幕');
      console.log('   2. 网络加载较慢');
      console.log('   3. 需要手动刷新页面重试');
    }
  }
  
})();