/**
 * YouTube字幕轨道调试工具
 *
 * 使用方法：
 * 1. 打开YouTube视频页面
 * 2. 按F12打开开发者工具
 * 3. 复制整个文件内容到Console控制台
 * 4. 按回车运行
 *
 * 功能：
 * - 显示所有可用的字幕轨道
 * - 监听字幕网络请求
 * - 测试多种轨道选择方式
 * - 特别用于调试ASR（自动生成）轨道选择问题
 */

// ========== YouTube字幕轨道选择调试工具 ==========
// 直接复制粘贴到F12控制台运行

(function() {
  console.clear();
  console.log('%c🔧 YouTube字幕轨道调试工具启动', 'font-size: 16px; color: #4CAF50; font-weight: bold');
  console.log('='.repeat(50));

  // ========== 1. 监听字幕请求 ==========
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0]?.toString() || '';
    if (url.includes('timedtext')) {
      console.log('%c🎯 捕获字幕请求:', 'color: #FF9800', url);

      try {
        const urlObj = new URL(url);
        const params = {};
        urlObj.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        console.log('📊 请求参数:', {
          lang: params.lang,
          kind: params.kind,
          v: params.v,
          tlang: params.tlang
        });
      } catch (e) {
        console.error('解析URL失败:', e);
      }
    }
    return originalFetch.apply(this, args);
  };

  // ========== 2. 获取播放器信息 ==========
  const player = document.getElementById('movie_player');
  if (!player) {
    console.error('❌ 找不到播放器');
    return;
  }

  // 加载模块
  if (typeof player.loadModule === 'function') {
    player.loadModule("captions");
    player.loadModule("cc");
  }

  // 检测可用模块
  let captionsModule = null;
  if (typeof player.getOptions === 'function') {
    const options = player.getOptions();
    if (options && options.includes('captions')) {
      captionsModule = 'captions';
    } else if (options && options.includes('cc')) {
      captionsModule = 'cc';
    }
  }

  if (!captionsModule) {
    console.error('❌ 未找到字幕模块');
    return;
  }

  console.log('✅ 使用模块:', captionsModule);

  // ========== 3. 显示所有可用轨道 ==========
  const trackList = player.getOption(captionsModule, 'tracklist') || [];
  console.log('%c📋 可用轨道列表 (共' + trackList.length + '个):', 'color: #2196F3; font-weight: bold');

  const enTracks = [];
  trackList.forEach((track, index) => {
    const lang = track.languageCode || track.language_code;
    const info = {
      index: index,
      lang: lang,
      kind: track.kind || 'manual',
      name: track.name,
      vssId: track.vssId || track.vss_id
    };

    if (lang === 'en') {
      enTracks.push({...info, track});
      console.log(`  %c[${index}] 英语轨道:`, 'color: #4CAF50', info);
    } else {
      console.log(`  [${index}]`, info);
    }
  });

  if (enTracks.length === 0) {
    console.error('❌ 没有找到英语轨道');
    return;
  }

  // 查找ASR轨道
  const enAsrTrack = enTracks.find(t => t.kind === 'asr');
  const enManualTrack = enTracks.find(t => t.kind !== 'asr');

  console.log('='.repeat(50));
  console.log('%c找到的英语轨道:', 'color: #9C27B0; font-weight: bold');
  if (enManualTrack) console.log('  ✅ 手动字幕:', enManualTrack);
  if (enAsrTrack) console.log('  ✅ 自动生成(ASR):', enAsrTrack);

  // ========== 4. 测试函数 ==========
  const tests = {
    // 测试A：只用languageCode
    testA: function() {
      console.log('\n%c▶ 测试A: 只设置 languageCode="en"', 'color: #FF5722; font-weight: bold');
      player.setOption(captionsModule, 'track', {
        "languageCode": "en"
      });
      setTimeout(() => {
        const current = player.getOption(captionsModule, 'track');
        console.log('结果:', current);
        console.log('是否ASR:', current?.kind === 'asr' ? '✅ 是' : '❌ 否');
      }, 500);
    },

    // 测试B：languageCode + kind
    testB: function() {
      console.log('\n%c▶ 测试B: 设置 languageCode="en" + kind="asr"', 'color: #FF5722; font-weight: bold');
      player.setOption(captionsModule, 'track', {
        "languageCode": "en",
        "kind": "asr"
      });
      setTimeout(() => {
        const current = player.getOption(captionsModule, 'track');
        console.log('结果:', current);
        console.log('是否ASR:', current?.kind === 'asr' ? '✅ 是' : '❌ 否');
      }, 500);
    },

    // 测试C：使用vssId
    testC: function() {
      if (!enAsrTrack) {
        console.log('\n%c▶ 测试C: 无ASR轨道，跳过vssId测试', 'color: #9E9E9E');
        return;
      }
      console.log('\n%c▶ 测试C: 使用vssId', 'color: #FF5722; font-weight: bold');
      const vssId = enAsrTrack.track.vssId || enAsrTrack.track.vss_id;
      console.log('vssId:', vssId);
      player.setOption(captionsModule, 'track', {
        "vssId": vssId
      });
      setTimeout(() => {
        const current = player.getOption(captionsModule, 'track');
        console.log('结果:', current);
        console.log('是否ASR:', current?.kind === 'asr' ? '✅ 是' : '❌ 否');
      }, 500);
    },

    // 测试D：完整轨道对象
    testD: function() {
      if (!enAsrTrack) {
        console.log('\n%c▶ 测试D: 无ASR轨道，跳过', 'color: #9E9E9E');
        return;
      }
      console.log('\n%c▶ 测试D: 使用完整轨道对象', 'color: #FF5722; font-weight: bold');
      player.setOption(captionsModule, 'track', enAsrTrack.track);
      setTimeout(() => {
        const current = player.getOption(captionsModule, 'track');
        console.log('结果:', current);
        console.log('是否ASR:', current?.kind === 'asr' ? '✅ 是' : '❌ 否');
      }, 500);
    },

    // 测试E：字幕按钮
    testE: function() {
      console.log('\n%c▶ 测试E: 字幕按钮点击', 'color: #FF5722; font-weight: bold');

      // 先通过API设置
      if (enAsrTrack) {
        player.setOption(captionsModule, 'track', {
          "languageCode": "en",
          "kind": "asr"
        });
        console.log('已预设API为ASR轨道');
      }

      const btn = document.querySelector('.ytp-subtitles-button');
      if (!btn) {
        console.error('❌ 未找到字幕按钮');
        return;
      }

      const isPressed = btn.getAttribute('aria-pressed') === 'true';
      console.log('按钮状态:', isPressed ? '开启' : '关闭');

      if (isPressed) {
        console.log('关闭字幕...');
        btn.click();
        setTimeout(() => {
          console.log('重新开启字幕...');
          btn.click();
          setTimeout(() => {
            const current = player.getOption(captionsModule, 'track');
            console.log('结果:', current);
            console.log('是否ASR:', current?.kind === 'asr' ? '✅ 是' : '❌ 否');
            console.log('%c⚠️ 请检查Network标签中的timedtext请求', 'color: #FFC107');
          }, 1000);
        }, 500);
      } else {
        console.log('开启字幕...');
        btn.click();
        setTimeout(() => {
          const current = player.getOption(captionsModule, 'track');
          console.log('结果:', current);
          console.log('是否ASR:', current?.kind === 'asr' ? '✅ 是' : '❌ 否');
          console.log('%c⚠️ 请检查Network标签中的timedtext请求', 'color: #FFC107');
        }, 1000);
      }
    },

    // 测试F：先设置ASR，再点击按钮（组合测试）
    testF: function() {
      console.log('\n%c▶ 测试F: 组合测试 - API设置ASR + 按钮触发', 'color: #FF5722; font-weight: bold');

      if (!enAsrTrack) {
        console.log('❌ 无ASR轨道，跳过测试');
        return;
      }

      // 步骤1：通过API设置为ASR
      console.log('步骤1: 设置API为ASR轨道...');
      player.setOption(captionsModule, 'track', {
        "languageCode": "en",
        "kind": "asr"
      });

      // 也设置cc模块
      player.setOption('cc', 'track', {
        "languageCode": "en",
        "kind": "asr"
      });

      setTimeout(() => {
        const apiResult = player.getOption(captionsModule, 'track');
        console.log('API设置结果:', apiResult);

        // 步骤2：关闭字幕按钮
        const btn = document.querySelector('.ytp-subtitles-button');
        if (btn) {
          console.log('步骤2: 关闭字幕按钮...');
          if (btn.getAttribute('aria-pressed') === 'true') {
            btn.click();
          }

          setTimeout(() => {
            // 步骤3：重新开启字幕按钮
            console.log('步骤3: 开启字幕按钮...');
            btn.click();

            setTimeout(() => {
              const finalResult = player.getOption(captionsModule, 'track');
              console.log('最终结果:', finalResult);
              console.log('是否成功选中ASR:', finalResult?.kind === 'asr' ? '✅ 是' : '❌ 否');
              console.log('%c💡 查看Network标签验证实际请求', 'color: #FFC107');
            }, 1000);
          }, 500);
        }
      }, 500);
    },

    // 显示当前状态
    showStatus: function() {
      console.log('\n%c📊 当前状态:', 'color: #00BCD4; font-weight: bold');
      const current = player.getOption(captionsModule, 'track');
      console.log('当前轨道:', current);

      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn) {
        console.log('字幕按钮:', btn.getAttribute('aria-pressed') === 'true' ? '开启' : '关闭');
      }

      // 显示所有可用的英语轨道
      console.log('可用英语轨道:');
      enTracks.forEach(t => {
        const isCurrent = current &&
                         current.languageCode === t.lang &&
                         current.kind === t.kind;
        console.log(`  ${isCurrent ? '→' : ' '} ${t.lang} (${t.kind})${isCurrent ? ' [当前]' : ''}`);
      });
    },

    // 运行所有测试
    runAll: function() {
      console.log('\n%c🚀 运行所有测试（间隔2秒）', 'color: #00BCD4; font-size: 14px; font-weight: bold');
      let delay = 0;

      ['testA', 'testB', 'testC', 'testD', 'testE', 'testF'].forEach(testName => {
        setTimeout(() => {
          tests[testName]();
        }, delay);
        delay += 2500;
      });
    }
  };

  // ========== 5. 提供交互界面 ==========
  window.ytSubtitleDebug = tests;

  console.log('='.repeat(50));
  console.log('%c📌 使用方法:', 'color: #673AB7; font-size: 14px; font-weight: bold');
  console.log('  ytSubtitleDebug.testA() - 测试只用languageCode');
  console.log('  ytSubtitleDebug.testB() - 测试languageCode + kind');
  console.log('  ytSubtitleDebug.testC() - 测试vssId');
  console.log('  ytSubtitleDebug.testD() - 测试完整轨道对象');
  console.log('  ytSubtitleDebug.testE() - 测试字幕按钮');
  console.log('  ytSubtitleDebug.testF() - 组合测试(API+按钮)');
  console.log('  ytSubtitleDebug.showStatus() - 显示当前状态');
  console.log('  ytSubtitleDebug.runAll() - 运行所有测试');
  console.log('='.repeat(50));
  console.log('%c💡 提示:', 'color: #FFC107');
  console.log('  1. 打开Network标签，过滤"timedtext"查看实际请求');
  console.log('  2. 观察URL中的lang和kind参数');
  console.log('  3. 如果ASR轨道无法选中，可能是YouTube的限制');
  console.log('='.repeat(50));

  // 显示当前状态
  tests.showStatus();

  // 自动运行测试B
  console.log('\n%c自动运行测试B（ASR轨道）...', 'color: #4CAF50');
  setTimeout(() => {
    tests.testB();
  }, 500);

})();