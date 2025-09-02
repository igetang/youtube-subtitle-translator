// YouTube字幕获取测试工具 - 调试版
(async function() {
  console.log('=== YouTube字幕获取测试（调试版）===');
  console.log('时间:', new Date().toLocaleString());
  
  // 1. 获取播放器响应数据
  function getPlayerResponse() {
    // 方法1: 从全局变量获取
    if (window.ytInitialPlayerResponse) {
      console.log('✅ 方法1: 从ytInitialPlayerResponse获取成功');
      return window.ytInitialPlayerResponse;
    }
    
    // 方法2: 从ytplayer.config获取
    if (window.ytplayer?.config?.args?.raw_player_response) {
      console.log('✅ 方法2: 从ytplayer.config获取成功');
      return JSON.parse(window.ytplayer.config.args.raw_player_response);
    }
    
    // 方法3: 从播放器API获取
    const player = document.getElementById('movie_player');
    if (player && typeof player.getPlayerResponse === 'function') {
      console.log('✅ 方法3: 从播放器API获取成功');
      return player.getPlayerResponse();
    }
    
    console.error('❌ 无法获取播放器响应数据');
    return null;
  }
  
  // 2. 提取字幕轨道信息
  function extractCaptionTracks(playerResponse) {
    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) {
      console.warn('⚠️ 未找到字幕轨道');
      return [];
    }
    console.log(`✅ 找到 ${tracks.length} 条字幕轨道`);
    return tracks;
  }
  
  // 3. 调试版获取字幕 - 查看实际返回内容
  async function debugFetchSubtitles(baseUrl, trackName, format = 'json3') {
    try {
      const url = new URL(baseUrl);
      url.searchParams.set('fmt', format);
      
      console.log(`\n📥 测试格式: ${format}`);
      console.log(`   轨道: ${trackName}`);
      console.log(`   完整URL:`, url.toString());
      
      const response = await fetch(url.toString());
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      console.log(`   状态码: ${response.status} ${response.statusText}`);
      console.log(`   响应头:`, headers);
      
      const text = await response.text();
      console.log(`   响应长度: ${text.length} 字符`);
      
      if (text.length > 0) {
        console.log(`   前500字符:`, text.substring(0, 500));
        console.log(`   后500字符:`, text.substring(Math.max(0, text.length - 500)));
        
        // 尝试不同的解析方式
        if (format === 'json3' || format === 'srv3') {
          try {
            const data = JSON.parse(text);
            console.log(`   ✅ JSON解析成功`);
            console.log(`   数据结构:`, Object.keys(data));
            if (data.events) {
              console.log(`   事件数: ${data.events.length}`);
              console.log(`   第一个事件:`, data.events[0]);
            }
            return data;
          } catch (e) {
            console.log(`   ❌ JSON解析失败:`, e.message);
          }
        }
        
        // 检查是否是XML
        if (text.startsWith('<?xml') || text.includes('<transcript>')) {
          console.log(`   📄 可能是XML格式`);
          try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');
            const texts = xmlDoc.getElementsByTagName('text');
            console.log(`   XML解析: 找到 ${texts.length} 个text节点`);
            if (texts.length > 0) {
              console.log(`   第一个字幕:`, texts[0].textContent);
            }
          } catch (e) {
            console.log(`   XML解析失败:`, e.message);
          }
        }
        
        // 检查是否是VTT格式
        if (text.includes('WEBVTT')) {
          console.log(`   📄 这是WebVTT格式`);
          const lines = text.split('\n').slice(0, 20);
          console.log(`   前20行:`, lines);
        }
      } else {
        console.log(`   ⚠️ 响应为空`);
        
        // 检查是否需要认证
        if (response.status === 200 && text.length === 0) {
          console.log(`   🔒 可能需要额外的认证参数`);
        }
      }
      
      return text;
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
      console.error(`   错误详情:`, error);
      return null;
    }
  }
  
  // 4. 主测试流程
  async function runTest() {
    console.log('\n📋 步骤1: 获取播放器数据...');
    const playerResponse = getPlayerResponse();
    if (!playerResponse) {
      console.error('测试终止: 无法获取播放器数据');
      return false;
    }
    
    console.log('\n📋 步骤2: 提取字幕轨道...');
    const tracks = extractCaptionTracks(playerResponse);
    if (tracks.length === 0) {
      console.error('测试终止: 没有可用的字幕轨道');
      return false;
    }
    
    // 显示所有可用轨道
    console.log('\n📋 可用字幕轨道:');
    tracks.forEach((track, index) => {
      console.log(`  ${index + 1}. [${track.languageCode}] ${track.name.simpleText || track.name.runs?.[0]?.text || '未知'}`);
      console.log(`     类型: ${track.kind || '普通'}`);
      console.log(`     ${track.isTranslatable ? '✅ 可翻译' : '❌ 不可翻译'}`);
    });
    
    // 保存轨道信息供分析
    window.__testTracks = tracks;
    console.log('\n💡 轨道信息已保存到 window.__testTracks');
    
    // 选择要测试的轨道（优先英文，否则第一个）
    const testTrack = tracks.find(t => t.languageCode === 'en') || tracks[0];
    const trackName = testTrack.name.simpleText || testTrack.name.runs?.[0]?.text || testTrack.languageCode;
    
    console.log(`\n📋 步骤3: 详细测试 [${testTrack.languageCode}] ${trackName}...`);
    
    // 测试不同格式
    const formats = ['json3', 'srv3', 'srv2', 'srv1', 'ttml', 'vtt'];
    let successFormat = null;
    
    for (const fmt of formats) {
      const result = await debugFetchSubtitles(testTrack.baseUrl, trackName, fmt);
      if (result && result.length > 0) {
        successFormat = fmt;
        console.log(`   ✅ 格式 ${fmt} 返回了数据`);
        break;
      }
    }
    
    if (successFormat) {
      console.log(`\n✅ 发现可用格式: ${successFormat}`);
      return true;
    } else {
      console.log('\n❌ 所有格式都返回空数据');
      console.log('\n分析结果:');
      console.log('1. YouTube已经限制了直接访问baseUrl');
      console.log('2. 需要额外的认证参数（如cookies、session等）');
      console.log('3. 建议使用方案2（拦截器方法）');
      return false;
    }
  }
  
  // 5. 方案2测试 - 拦截器方法（带自动语言切换）
  async function testInterceptorWithLanguageSwitch(targetLang = 'en') {
    console.log('\n=== 测试方案2：智能拦截器方法 ===');
    console.log('目标语言:', targetLang);
    
    // 检查是否已有拦截的字幕
    if (window.__capturedSubtitles && window.__capturedSubtitlesLang === targetLang) {
      console.log('✅ 已有目标语言的字幕:', window.__capturedSubtitles.length, '条');
      return true;
    }
    
    // 1. 设置拦截器
    console.log('\n📋 步骤1: 设置字幕拦截器...');
    
    // 保存原始fetch（如果还没保存）
    if (!window.__originalFetch) {
      window.__originalFetch = window.fetch;
    }
    
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      
      if (url && url.includes('timedtext')) {
        console.log('🎯 拦截到字幕请求:', url);
        
        // 解析URL获取语言信息
        const urlObj = new URL(url);
        const lang = urlObj.searchParams.get('lang') || urlObj.searchParams.get('tlang');
        console.log('   请求的语言:', lang);
        
        const response = await window.__originalFetch(...args);
        const clone = response.clone();
        
        // 异步处理
        clone.text().then(text => {
          console.log(`📝 拦截到 [${lang}] 字幕数据，长度:`, text.length);
          
          if (text.length === 0) {
            console.warn('   ⚠️ 字幕数据为空');
            return;
          }
          
          try {
            const data = JSON.parse(text);
            if (data.events) {
              const subtitles = data.events
                .filter(e => e.segs)
                .map(e => ({
                  start: (e.tStartMs || 0) / 1000,
                  duration: (e.dDurationMs || 0) / 1000,
                  text: e.segs.map(s => s.utf8).join('').trim()
                }))
                .filter(s => s.text);
              
              window.__capturedSubtitles = subtitles;
              window.__capturedSubtitlesLang = lang;
              console.log(`✅ 成功解析 [${lang}] 字幕:`, subtitles.length, '条');
              console.log('   前3条示例:', subtitles.slice(0, 3));
            }
          } catch (e) {
            console.error('解析失败:', e);
          }
        });
        
        return response;
      }
      
      return window.__originalFetch(...args);
    };
    
    // 2. 获取当前字幕设置
    console.log('\n📋 步骤2: 检查当前字幕设置...');
    const getCurrentSubtitleLanguage = () => {
      // 方法1: 从设置面板获取
      const settingsMenu = document.querySelector('.ytp-settings-menu');
      if (settingsMenu && settingsMenu.style.display !== 'none') {
        const subtitleMenuItem = Array.from(settingsMenu.querySelectorAll('.ytp-menuitem'))
          .find(item => item.textContent.includes('字幕') || item.textContent.includes('Subtitles'));
        if (subtitleMenuItem) {
          const langText = subtitleMenuItem.querySelector('.ytp-menuitem-content')?.textContent;
          console.log('   当前字幕设置:', langText);
          return langText;
        }
      }
      
      // 方法2: 从字幕按钮获取状态
      const subtitleBtn = document.querySelector('.ytp-subtitles-button');
      const isOn = subtitleBtn?.getAttribute('aria-pressed') === 'true';
      console.log('   字幕按钮状态:', isOn ? '开启' : '关闭');
      return isOn ? 'unknown' : 'off';
    };
    
    const currentLang = getCurrentSubtitleLanguage();
    
    // 3. 自动切换到目标语言
    console.log('\n📋 步骤3: 切换到目标语言...');
    
    // 打开设置菜单
    const settingsBtn = document.querySelector('.ytp-settings-button');
    if (!settingsBtn) {
      console.error('❌ 未找到设置按钮');
      return false;
    }
    
    // 点击设置按钮
    settingsBtn.click();
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 找到字幕选项
    const findAndClickMenuItem = (text) => {
      const menuItems = document.querySelectorAll('.ytp-menuitem');
      for (const item of menuItems) {
        if (item.textContent.includes(text)) {
          console.log(`   点击菜单项: ${text}`);
          item.click();
          return true;
        }
      }
      return false;
    };
    
    // 点击字幕菜单
    if (findAndClickMenuItem('字幕') || findAndClickMenuItem('Subtitles') || findAndClickMenuItem('Captions')) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 获取所有可用的字幕选项
      const subtitleOptions = document.querySelectorAll('.ytp-menuitem');
      console.log('   可用字幕选项:', subtitleOptions.length);
      
      // 创建语言映射表
      const languageMap = {
        // 语言代码映射
        'en': ['english', '英语', '英文'],
        'zh': ['chinese', '中文', '汉语', '中国'],
        'zh-CN': ['chinese (simplified)', '中文（简体）', '简体中文'],
        'zh-TW': ['chinese (traditional)', '中文（繁体）', '繁体中文'],
        'es': ['spanish', '西班牙语', '西语'],
        'es-ES': ['spanish (spain)', '西班牙语（西班牙）'],
        'fr': ['french', '法语', '法文'],
        'de': ['german', '德语', '德文'],
        'it': ['italian', '意大利语', '意语'],
        'ja': ['japanese', '日语', '日文', '日本語'],
        'ko': ['korean', '韩语', '韩文', '한국어'],
        'pt': ['portuguese', '葡萄牙语', '葡语'],
        'pt-BR': ['portuguese (brazil)', '葡萄牙语（巴西）'],
        'ru': ['russian', '俄语', '俄文', 'русский'],
        'ar': ['arabic', '阿拉伯语', 'العربية'],
        'hi': ['hindi', '印地语', 'हिन्दी'],
        'nl': ['dutch', '荷兰语', 'nederlands'],
        'pl': ['polish', '波兰语', 'polski'],
        'tr': ['turkish', '土耳其语', 'türkçe'],
        'vi': ['vietnamese', '越南语', 'tiếng việt'],
        'th': ['thai', '泰语', 'ไทย'],
        'id': ['indonesian', '印尼语', '印度尼西亚语', 'bahasa indonesia'],
        'sv': ['swedish', '瑞典语', 'svenska'],
        'da': ['danish', '丹麦语', 'dansk'],
        'no': ['norwegian', '挪威语', 'norsk'],
        'fi': ['finnish', '芬兰语', 'suomi'],
        'he': ['hebrew', '希伯来语', 'עברית'],
        'uk': ['ukrainian', '乌克兰语', 'українська'],
        'cs': ['czech', '捷克语', 'čeština'],
        'hu': ['hungarian', '匈牙利语', 'magyar'],
        'el': ['greek', '希腊语', 'ελληνικά'],
        'ro': ['romanian', '罗马尼亚语', 'română'],
        'bg': ['bulgarian', '保加利亚语', 'български'],
        'hr': ['croatian', '克罗地亚语', 'hrvatski'],
        'sr': ['serbian', '塞尔维亚语', 'српски'],
        'sk': ['slovak', '斯洛伐克语', 'slovenčina'],
        'sl': ['slovenian', '斯洛文尼亚语', 'slovenščina'],
        'et': ['estonian', '爱沙尼亚语', 'eesti'],
        'lv': ['latvian', '拉脱维亚语', 'latviešu'],
        'lt': ['lithuanian', '立陶宛语', 'lietuvių'],
        'fa': ['persian', '波斯语', 'فارسی'],
        'ur': ['urdu', '乌尔都语', 'اردو'],
        'bn': ['bengali', '孟加拉语', 'বাংলা'],
        'ta': ['tamil', '泰米尔语', 'தமிழ்'],
        'te': ['telugu', '泰卢固语', 'తెలుగు'],
        'mr': ['marathi', '马拉地语', 'मराठी'],
        'gu': ['gujarati', '古吉拉特语', 'ગુજરાતી'],
        'kn': ['kannada', '卡纳达语', 'ಕನ್ನಡ'],
        'ml': ['malayalam', '马拉雅拉姆语', 'മലയാളം'],
        'pa': ['punjabi', '旁遮普语', 'ਪੰਜਾਬੀ'],
        'ne': ['nepali', '尼泊尔语', 'नेपाली'],
        'si': ['sinhala', '僧伽罗语', 'සිංහල'],
        'my': ['burmese', '缅甸语', 'မြန်မာ'],
        'km': ['khmer', '高棉语', 'ខ្មែរ'],
        'lo': ['lao', '老挝语', 'ລາວ'],
        'ka': ['georgian', '格鲁吉亚语', 'ქართული'],
        'am': ['amharic', '阿姆哈拉语', 'አማርኛ'],
        'sw': ['swahili', '斯瓦希里语', 'kiswahili'],
        'zu': ['zulu', '祖鲁语', 'isizulu'],
        'xh': ['xhosa', '科萨语', 'isixhosa'],
        'af': ['afrikaans', '南非荷兰语', 'afrikaans'],
        'is': ['icelandic', '冰岛语', 'íslenska'],
        'ga': ['irish', '爱尔兰语', 'gaeilge'],
        'eu': ['basque', '巴斯克语', 'euskara'],
        'ca': ['catalan', '加泰罗尼亚语', 'català'],
        'gl': ['galician', '加利西亚语', 'galego'],
        'mt': ['maltese', '马耳他语', 'malti'],
        'sq': ['albanian', '阿尔巴尼亚语', 'shqip'],
        'mk': ['macedonian', '马其顿语', 'македонски'],
        'hy': ['armenian', '亚美尼亚语', 'հայերեն'],
        'az': ['azerbaijani', '阿塞拜疆语', 'azərbaycan'],
        'kk': ['kazakh', '哈萨克语', 'қазақ'],
        'ky': ['kyrgyz', '吉尔吉斯语', 'кыргыз'],
        'tg': ['tajik', '塔吉克语', 'тоҷикӣ'],
        'tk': ['turkmen', '土库曼语', 'türkmen'],
        'uz': ['uzbek', '乌兹别克语', "o'zbek"],
        'mn': ['mongolian', '蒙古语', 'монгол']
      };
      
      // 查找目标语言
      let targetFound = false;
      const targetLangLower = targetLang.toLowerCase();
      
      for (const option of subtitleOptions) {
        const optionText = option.textContent.trim();
        const optionTextLower = optionText.toLowerCase();
        console.log('   检查选项:', optionText);
        
        // 跳过"关闭"和"自动翻译"选项
        if (optionText.includes('关闭') || optionText.includes('Off') || 
            optionText.includes('自动') || optionText.includes('Auto')) {
          continue;
        }
        
        // 方法1: 直接匹配用户输入（支持直接输入中文或英文语言名）
        if (optionTextLower.includes(targetLangLower) || optionText.includes(targetLang)) {
          console.log(`   ✅ 找到匹配选项（直接匹配）: ${optionText}`);
          option.click();
          targetFound = true;
          break;
        }
        
        // 方法2: 通过语言代码映射表匹配
        let matched = false;
        for (const [code, names] of Object.entries(languageMap)) {
          // 检查是否匹配语言代码
          if (targetLangLower === code.toLowerCase()) {
            // 检查选项文本是否包含该语言的任何名称
            for (const name of names) {
              if (optionTextLower.includes(name.toLowerCase())) {
                console.log(`   ✅ 找到匹配选项（通过代码 ${code}）: ${optionText}`);
                option.click();
                targetFound = true;
                matched = true;
                break;
              }
            }
          }
          if (matched) break;
        }
        if (targetFound) break;
      }
      
      if (!targetFound) {
        console.warn(`   ⚠️ 未找到目标语言 ${targetLang}，使用第一个可用选项`);
        if (subtitleOptions.length > 1) {
          subtitleOptions[1].click(); // 跳过"关闭"选项
        }
      }
      
      // 等待字幕加载
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 关闭设置菜单
      const closeBtn = document.querySelector('.ytp-settings-button');
      if (closeBtn) closeBtn.click();
      
    } else {
      console.error('❌ 未找到字幕菜单项');
      settingsBtn.click(); // 关闭设置
      return false;
    }
    
    // 4. 确保字幕开启
    console.log('\n📋 步骤4: 确保字幕开启...');
    const subtitleBtn = document.querySelector('.ytp-subtitles-button');
    if (subtitleBtn) {
      const isOn = subtitleBtn.getAttribute('aria-pressed') === 'true';
      if (!isOn) {
        console.log('   开启字幕按钮');
        subtitleBtn.click();
      } else {
        console.log('   字幕已开启，触发刷新');
        // 切换一下以触发新请求
        subtitleBtn.click();
        await new Promise(resolve => setTimeout(resolve, 300));
        subtitleBtn.click();
      }
    }
    
    // 5. 等待拦截结果
    console.log('\n📋 步骤5: 等待拦截结果...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (window.__capturedSubtitles && window.__capturedSubtitles.length > 0) {
      console.log(`\n✅ 成功拦截 [${window.__capturedSubtitlesLang}] 字幕:`, window.__capturedSubtitles.length, '条');
      console.log('前3条字幕:');
      window.__capturedSubtitles.slice(0, 3).forEach((sub, i) => {
        console.log(`  ${i + 1}. [${sub.start.toFixed(2)}s] ${sub.text.substring(0, 80)}`);
      });
      return true;
    } else {
      console.error('\n❌ 未能拦截到字幕');
      return false;
    }
  }
  
  // 保留原始的简单拦截器函数
  function testInterceptor() {
    console.log('\n=== 测试方案2：基础拦截器方法 ===');
    
    // 检查是否已有拦截的字幕
    if (window.__capturedSubtitles) {
      console.log('✅ 发现已拦截的字幕:', window.__capturedSubtitles.length, '条');
      console.log('前3条示例:', window.__capturedSubtitles.slice(0, 3));
      return true;
    }
    
    console.log('开始设置字幕拦截器...');
    
    // 劫持fetch
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      
      if (url && url.includes('timedtext')) {
        console.log('🎯 拦截到字幕请求:', url);
        
        const response = await originalFetch(...args);
        const clone = response.clone();
        
        // 异步处理
        clone.text().then(text => {
          console.log('📝 拦截到字幕数据，长度:', text.length);
          try {
            const data = JSON.parse(text);
            if (data.events) {
              const subtitles = data.events
                .filter(e => e.segs)
                .map(e => ({
                  start: (e.tStartMs || 0) / 1000,
                  duration: (e.dDurationMs || 0) / 1000,
                  text: e.segs.map(s => s.utf8).join('').trim()
                }))
                .filter(s => s.text);
              
              window.__capturedSubtitles = subtitles;
              console.log('✅ 成功解析字幕:', subtitles.length, '条');
            }
          } catch (e) {
            console.error('解析失败:', e);
          }
        });
        
        return response;
      }
      
      return originalFetch(...args);
    };
    
    // 触发字幕按钮
    console.log('尝试触发字幕按钮...');
    const subtitleBtn = document.querySelector('.ytp-subtitles-button');
    if (subtitleBtn) {
      const isOn = subtitleBtn.getAttribute('aria-pressed') === 'true';
      console.log('字幕按钮状态:', isOn ? '开启' : '关闭');
      
      if (!isOn) {
        subtitleBtn.click();
        console.log('已开启字幕');
      } else {
        // 切换一下触发请求
        subtitleBtn.click();
        setTimeout(() => subtitleBtn.click(), 500);
        console.log('已切换字幕');
      }
      
      // 等待拦截
      setTimeout(() => {
        if (window.__capturedSubtitles) {
          console.log('✅ 方案2成功！拦截到', window.__capturedSubtitles.length, '条字幕');
        } else {
          console.log('⚠️ 未拦截到字幕，可能需要手动切换字幕语言');
        }
      }, 2000);
    } else {
      console.error('未找到字幕按钮');
    }
  }
  
  // 6. 执行测试
  console.log('开始执行测试...\n');
  
  // 直接测试智能拦截器方案
  console.log('=== 跳过方案1（已确认不可行）===');
  console.log('=== 直接测试智能拦截器方案 ===\n');
  
  // 测试智能拦截器（自动切换语言）
  const interceptorSuccess = await testInterceptorWithLanguageSwitch('en');
  
  console.log('\n=== 测试总结 ===');
  console.log('方案1（baseUrl直接访问）: ❌ 不可行（YouTube已限制）');
  console.log('方案2（智能拦截器）: ' + (interceptorSuccess ? '✅ 成功' : '❌ 需要手动调试'));
  console.log('\n建议: 使用智能拦截器方案，自动切换到需要的语言');
  
  // 7. 提供便捷函数
  window.testYouTubeSubtitles = {
    getPlayerResponse,
    extractCaptionTracks,
    debugFetchSubtitles,
    runTest,
    testInterceptor,
    testInterceptorWithLanguageSwitch,
    // 查看轨道详情
    showTrackDetails: function() {
      const playerResponse = getPlayerResponse();
      const tracks = extractCaptionTracks(playerResponse);
      console.log('=== 字幕轨道详细信息 ===');
      tracks.forEach((track, i) => {
        console.log(`\n轨道 ${i + 1}:`);
        console.log('  语言代码:', track.languageCode);
        console.log('  名称:', track.name);
        console.log('  baseUrl:', track.baseUrl);
        console.log('  vssId:', track.vssId);
        console.log('  可翻译:', track.isTranslatable);
        console.log('  类型:', track.kind);
      });
    },
    // 手动测试URL
    testUrl: async function(url) {
      console.log('测试URL:', url);
      try {
        const response = await fetch(url);
        const text = await response.text();
        console.log('状态码:', response.status);
        console.log('响应长度:', text.length);
        console.log('前200字符:', text.substring(0, 200));
        return text;
      } catch (e) {
        console.error('请求失败:', e);
        return null;
      }
    },
    // 切换到指定语言
    switchToLanguage: async function(lang) {
      console.log(`\n手动切换到语言: ${lang}`);
      return await testInterceptorWithLanguageSwitch(lang);
    },
    // 获取当前拦截的字幕
    getCurrentSubtitles: function() {
      if (window.__capturedSubtitles) {
        console.log(`当前字幕 [${window.__capturedSubtitlesLang}]:`, window.__capturedSubtitles.length, '条');
        return window.__capturedSubtitles;
      } else {
        console.log('尚未拦截到字幕');
        return null;
      }
    },
    // 分析YouTube字幕菜单 - 获取所有语言选项的详细信息
    analyzeSubtitleMenu: async function() {
      console.log('\n=== 分析YouTube字幕菜单 ===');
      
      // 打开设置菜单
      const settingsBtn = document.querySelector('.ytp-settings-button');
      if (!settingsBtn) {
        console.error('❌ 未找到设置按钮');
        return null;
      }
      
      console.log('1. 打开设置菜单...');
      settingsBtn.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 找到并点击字幕选项
      const findMenuItem = (texts) => {
        const menuItems = document.querySelectorAll('.ytp-menuitem');
        for (const item of menuItems) {
          for (const text of texts) {
            if (item.textContent.includes(text)) {
              return item;
            }
          }
        }
        return null;
      };
      
      const subtitleMenuItem = findMenuItem(['字幕', 'Subtitles', 'Captions', 'CC']);
      if (!subtitleMenuItem) {
        console.error('❌ 未找到字幕菜单项');
        settingsBtn.click(); // 关闭菜单
        return null;
      }
      
      console.log('2. 进入字幕菜单...');
      subtitleMenuItem.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 获取所有字幕选项
      const subtitleOptions = document.querySelectorAll('.ytp-menuitem');
      const languages = [];
      
      console.log(`\n3. 找到 ${subtitleOptions.length} 个字幕选项:`);
      console.log('=' .repeat(60));
      
      subtitleOptions.forEach((option, index) => {
        // 获取完整文本
        const fullText = option.textContent.trim();
        
        // 获取标签文本（主要显示的语言名称）
        const labelElement = option.querySelector('.ytp-menuitem-label');
        const labelText = labelElement ? labelElement.textContent.trim() : '';
        
        // 获取内容文本（可能包含额外信息）
        const contentElement = option.querySelector('.ytp-menuitem-content');
        const contentText = contentElement ? contentElement.textContent.trim() : '';
        
        // 检查是否被选中
        const isSelected = option.getAttribute('aria-checked') === 'true';
        
        // 尝试提取data属性或其他标识
        const dataValue = option.getAttribute('data-value') || 
                         option.getAttribute('data-id') || 
                         option.getAttribute('value') || '';
        
        // 分析并提取可能的语言代码
        let possibleLangCode = '';
        
        // 从fullText中提取括号内的代码
        const codeMatch = fullText.match(/\[([^\]]+)\]|\(([^)]+)\)/);
        if (codeMatch) {
          possibleLangCode = codeMatch[1] || codeMatch[2];
        }
        
        // 尝试从类名中提取
        const classList = Array.from(option.classList);
        const langClass = classList.find(cls => cls.includes('lang-') || cls.includes('cc-'));
        
        const langInfo = {
          index,
          fullText,
          labelText,
          contentText,
          isSelected,
          dataValue,
          possibleLangCode,
          langClass,
          element: option
        };
        
        languages.push(langInfo);
        
        // 打印详细信息
        console.log(`\n选项 ${index + 1}: ${isSelected ? '✅ [当前选中]' : ''}`);
        console.log(`  完整文本: "${fullText}"`);
        console.log(`  标签文本: "${labelText}"`);
        console.log(`  内容文本: "${contentText}"`);
        if (dataValue) console.log(`  data属性: "${dataValue}"`);
        if (possibleLangCode) console.log(`  可能的语言代码: "${possibleLangCode}"`);
        if (langClass) console.log(`  语言类名: "${langClass}"`);
      });
      
      console.log('\n' + '=' .repeat(60));
      
      // 尝试匹配YouTube API中的语言代码
      console.log('\n4. 与API轨道信息对比:');
      const playerResponse = getPlayerResponse();
      const tracks = extractCaptionTracks(playerResponse);
      
      console.log('\nAPI中的语言代码:');
      tracks.forEach(track => {
        const name = track.name.simpleText || track.name.runs?.[0]?.text || track.languageCode;
        console.log(`  [${track.languageCode}] ${name}`);
      });
      
      // 关闭菜单
      console.log('\n5. 关闭菜单...');
      // 点击返回按钮或ESC
      const backBtn = document.querySelector('.ytp-panel-back-button');
      if (backBtn) {
        backBtn.click();
      } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      settingsBtn.click(); // 关闭设置菜单
      
      // 保存结果
      window.__subtitleMenuLanguages = languages;
      console.log('\n✅ 分析完成！语言选项已保存到 window.__subtitleMenuLanguages');
      
      // 提供语言代码映射建议
      console.log('\n6. 语言代码映射建议:');
      console.log('根据菜单文本匹配语言代码:');
      languages.forEach((lang, i) => {
        if (i === 0 && lang.fullText.includes('关闭')) return; // 跳过关闭选项
        
        const text = lang.fullText.toLowerCase();
        let suggestedCode = '';
        
        // 常见语言映射
        if (text.includes('english') || text.includes('英语') || text.includes('英文')) suggestedCode = 'en';
        else if (text.includes('chinese') || text.includes('中文') || text.includes('汉语')) suggestedCode = 'zh';
        else if (text.includes('spanish') || text.includes('西班牙语')) suggestedCode = 'es';
        else if (text.includes('french') || text.includes('法语') || text.includes('français')) suggestedCode = 'fr';
        else if (text.includes('german') || text.includes('德语') || text.includes('deutsch')) suggestedCode = 'de';
        else if (text.includes('italian') || text.includes('意大利语')) suggestedCode = 'it';
        else if (text.includes('japanese') || text.includes('日语') || text.includes('日本語')) suggestedCode = 'ja';
        else if (text.includes('korean') || text.includes('韩语') || text.includes('한국어')) suggestedCode = 'ko';
        else if (text.includes('portuguese') || text.includes('葡萄牙语')) suggestedCode = 'pt';
        else if (text.includes('russian') || text.includes('俄语') || text.includes('русский')) suggestedCode = 'ru';
        else if (text.includes('arabic') || text.includes('阿拉伯语')) suggestedCode = 'ar';
        else if (text.includes('hindi') || text.includes('印地语')) suggestedCode = 'hi';
        else if (text.includes('dutch') || text.includes('荷兰语')) suggestedCode = 'nl';
        else if (text.includes('polish') || text.includes('波兰语')) suggestedCode = 'pl';
        else if (text.includes('turkish') || text.includes('土耳其语')) suggestedCode = 'tr';
        else if (text.includes('vietnamese') || text.includes('越南语')) suggestedCode = 'vi';
        else if (text.includes('thai') || text.includes('泰语')) suggestedCode = 'th';
        else if (text.includes('indonesian') || text.includes('印尼语')) suggestedCode = 'id';
        else if (text.includes('swedish') || text.includes('瑞典语')) suggestedCode = 'sv';
        else if (text.includes('danish') || text.includes('丹麦语')) suggestedCode = 'da';
        else if (text.includes('norwegian') || text.includes('挪威语')) suggestedCode = 'no';
        else if (text.includes('finnish') || text.includes('芬兰语')) suggestedCode = 'fi';
        
        if (suggestedCode) {
          console.log(`  "${lang.fullText}" → 建议代码: ${suggestedCode}`);
        }
      });
      
      return languages;
    }
  };
  
  console.log('\n💡 工具函数已添加到 window.testYouTubeSubtitles:');
  console.log('  - showTrackDetails()         查看轨道详情');
  console.log('  - analyzeSubtitleMenu()      🔍 分析YouTube字幕菜单，获取完整语言列表');
  console.log('  - testInterceptor()          测试基础拦截器');
  console.log('  - testInterceptorWithLanguageSwitch("en")  智能切换语言并拦截');
  console.log('  - switchToLanguage("zh")     切换到中文字幕');
  console.log('  - getCurrentSubtitles()      获取当前拦截的字幕');
  console.log('\n💡 首先运行分析命令获取语言代码:');
  console.log('  await window.testYouTubeSubtitles.analyzeSubtitleMenu()  // 分析字幕菜单');
  console.log('\n💡 然后测试切换语言:');
  console.log('  window.testYouTubeSubtitles.switchToLanguage("zh")  // 中文');
  console.log('  window.testYouTubeSubtitles.switchToLanguage("fr")  // 法语');
  console.log('  window.testYouTubeSubtitles.switchToLanguage("de")  // 德语');
  
})();