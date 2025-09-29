/**
 * YouTube英语自动生成字幕选择器
 *
 * 功能：通过languageCode + kind方式选择英语ASR字幕
 * 使用：复制全部内容到F12控制台运行
 *
 * 提供8种不同的方法尝试选择ASR轨道
 */

// ========== YouTube英语自动生成字幕选择器 (code+kind方式) ==========
(function selectEnglishASR() {
  console.clear();
  console.log('%c🎯 选择英语自动生成字幕 (languageCode + kind)', 'color: #4CAF50; font-size: 16px; font-weight: bold');
  console.log('='.repeat(50));

  const player = document.getElementById('movie_player');
  if (!player) {
    console.error('❌ 找不到播放器');
    return;
  }

  // 加载字幕模块
  console.log('📦 加载字幕模块...');
  if (typeof player.loadModule === 'function') {
    player.loadModule("captions");
    player.loadModule("cc");
  }

  // 获取可用的字幕轨道
  const trackList = player.getOption('captions', 'tracklist') ||
                   player.getOption('cc', 'tracklist') || [];

  console.log(`📋 找到 ${trackList.length} 个字幕轨道:`);

  // 显示所有轨道
  trackList.forEach((track, index) => {
    const lang = track.languageCode || track.language_code;
    const kind = track.kind || 'manual';
    const name = track.name || track.displayName || '';
    console.log(`  [${index}] ${lang} - ${name} (${kind})`);
  });

  // 查找英语轨道
  const enTracks = trackList.filter(t =>
    (t.languageCode || t.language_code) === 'en'
  );

  const enASR = enTracks.find(t => t.kind === 'asr');
  const enManual = enTracks.find(t => !t.kind || t.kind !== 'asr');

  console.log('\n📊 英语轨道分析:');
  if (enManual) console.log('  ✅ 手动字幕:', enManual);
  if (enASR) console.log('  ✅ 自动生成:', enASR);

  if (!enASR) {
    console.error('❌ 没有找到英语自动生成轨道');
    return;
  }

  console.log('\n' + '='.repeat(50));
  console.log('%c🧪 开始测试选择方法', 'color: #FF5722; font-weight: bold');

  // 测试方法集合
  const methods = {
    // 方法1: 标准参数
    method1: function() {
      console.log('\n📍 方法1: 标准参数 {languageCode: "en", kind: "asr"}');
      player.setOption('captions', 'track', {
        languageCode: "en",
        kind: "asr"
      });
    },

    // 方法2: 添加引号的kind
    method2: function() {
      console.log('\n📍 方法2: kind加引号 {languageCode: "en", "kind": "asr"}');
      player.setOption('captions', 'track', {
        "languageCode": "en",
        "kind": "asr"
      });
    },

    // 方法3: 使用原始轨道对象，但指定kind
    method3: function() {
      console.log('\n📍 方法3: 完整轨道对象覆盖kind');
      const trackCopy = {...enASR, kind: "asr"};
      player.setOption('captions', 'track', trackCopy);
    },

    // 方法4: 同时设置captions和cc模块
    method4: function() {
      console.log('\n📍 方法4: 同时设置captions和cc模块');
      const params = {
        languageCode: "en",
        kind: "asr"
      };
      player.setOption('captions', 'track', params);
      player.setOption('cc', 'track', params);
    },

    // 方法5: 使用索引选择
    method5: function() {
      console.log('\n📍 方法5: 使用轨道索引');
      const asrIndex = trackList.findIndex(t =>
        (t.languageCode || t.language_code) === 'en' && t.kind === 'asr'
      );
      if (asrIndex >= 0) {
        console.log(`  找到ASR轨道索引: ${asrIndex}`);
        // 尝试用索引设置
        player.setOption('captions', 'track', asrIndex);
      }
    },

    // 方法6: 先关闭字幕再设置
    method6: function() {
      console.log('\n📍 方法6: 先关闭字幕 -> 设置轨道 -> 开启字幕');

      // 关闭字幕
      player.setOption('captions', 'track', {});

      setTimeout(() => {
        // 设置ASR轨道
        player.setOption('captions', 'track', {
          languageCode: "en",
          kind: "asr"
        });

        // 触发字幕按钮
        setTimeout(() => {
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn && btn.getAttribute('aria-pressed') !== 'true') {
            btn.click();
          }
        }, 300);
      }, 300);
    },

    // 方法7: 使用name字段辅助
    method7: function() {
      console.log('\n📍 方法7: 添加name字段辅助');
      player.setOption('captions', 'track', {
        languageCode: "en",
        kind: "asr",
        name: enASR.name || "English (auto-generated)"
      });
    },

    // 方法8: 模拟完整的轨道选择流程
    method8: function() {
      console.log('\n📍 方法8: 完整选择流程');

      // Step 1: 确保字幕按钮是关闭的
      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') === 'true') {
        console.log('  关闭字幕...');
        btn.click();
      }

      setTimeout(() => {
        // Step 2: 设置轨道参数
        console.log('  设置ASR轨道...');
        player.setOption('captions', 'track', {
          languageCode: "en",
          kind: "asr"
        });

        // Step 3: 重新开启字幕
        setTimeout(() => {
          console.log('  开启字幕...');
          if (btn) btn.click();

          // Step 4: 验证
          setTimeout(() => {
            const current = player.getOption('captions', 'track');
            console.log('  当前轨道:', current);
          }, 500);
        }, 300);
      }, 300);
    }
  };

  // 执行单个方法的函数
  function runMethod(methodName) {
    if (methods[methodName]) {
      methods[methodName]();

      // 检查结果
      setTimeout(() => {
        const current = player.getOption('captions', 'track');
        console.log('  → 结果:', current);

        if (current) {
          const success = current.kind === 'asr' ||
                         (current.languageCode === 'en' && !current.kind && enASR);
          console.log(success ? '  ✅ 可能成功了' : '  ❌ 未选中ASR');
        }

        // 检查字幕按钮状态
        const btn = document.querySelector('.ytp-subtitles-button');
        if (btn) {
          const isOn = btn.getAttribute('aria-pressed') === 'true';
          console.log(`  字幕按钮: ${isOn ? '开启' : '关闭'}`);
        }
      }, 1000);
    }
  }

  // 运行所有方法
  function runAll() {
    console.log('\n%c🚀 运行所有方法（间隔2秒）', 'color: #00BCD4; font-weight: bold');
    const methodNames = Object.keys(methods);
    let index = 0;

    function runNext() {
      if (index >= methodNames.length) {
        console.log('\n✅ 所有方法测试完成');
        console.log('%c💡 请检查Network标签，查看timedtext请求的URL参数', 'color: #FFC107');
        return;
      }

      runMethod(methodNames[index]);
      index++;
      setTimeout(runNext, 2000);
    }

    runNext();
  }

  // 提供交互接口
  window.asrSelector = {
    // 单独测试每个方法
    test1: () => runMethod('method1'),
    test2: () => runMethod('method2'),
    test3: () => runMethod('method3'),
    test4: () => runMethod('method4'),
    test5: () => runMethod('method5'),
    test6: () => runMethod('method6'),
    test7: () => runMethod('method7'),
    test8: () => runMethod('method8'),

    // 运行所有测试
    runAll: runAll,

    // 检查当前状态
    check: function() {
      console.log('\n📊 当前状态:');
      const current = player.getOption('captions', 'track');
      console.log('当前轨道:', current);

      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn) {
        console.log('字幕按钮:', btn.getAttribute('aria-pressed') === 'true' ? '开启' : '关闭');
      }

      // 监听下一个字幕请求
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0]?.toString() || '';
        if (url.includes('timedtext')) {
          const urlObj = new URL(url);
          console.log('%c🎯 字幕请求捕获:', 'color: #FF9800');
          console.log('  lang:', urlObj.searchParams.get('lang'));
          console.log('  kind:', urlObj.searchParams.get('kind'));
        }
        return originalFetch.apply(this, args);
      };
      console.log('✅ 已开启请求监听');
    }
  };

  console.log('\n' + '='.repeat(50));
  console.log('%c📌 使用方法:', 'color: #673AB7; font-weight: bold');
  console.log('  asrSelector.test1() 到 test8() - 测试各个方法');
  console.log('  asrSelector.runAll() - 运行所有测试');
  console.log('  asrSelector.check() - 检查当前状态和监听请求');
  console.log('='.repeat(50));

  // 自动运行方法4（最可能成功的）
  console.log('\n自动运行方法4（同时设置两个模块）...');
  runMethod('method4');

})();