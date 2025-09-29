/**
 * YouTube直接选择英语自动生成字幕
 *
 * 重要：不依赖Player API获取轨道，直接尝试切换到ASR
 * 使用：复制全部内容到F12控制台运行
 */

(function directSelectASR() {
  console.clear();
  console.log('%c🎯 直接切换到英语自动生成字幕（不依赖获取）', 'color: #FF5722; font-size: 16px; font-weight: bold');
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

  // ========== 方法集合 ==========
  const methods = {
    // 方法1: 基础设置 - languageCode + kind
    method1: function() {
      console.log('\n📍 方法1: 基础设置 {languageCode: "en", kind: "asr"}');
      player.setOption('captions', 'track', {
        languageCode: "en",
        kind: "asr"
      });
    },

    // 方法2: 同时设置两个模块
    method2: function() {
      console.log('\n📍 方法2: 同时设置captions和cc模块');
      const params = {
        languageCode: "en",
        kind: "asr"
      };
      player.setOption('captions', 'track', params);
      player.setOption('cc', 'track', params);
    },

    // 方法3: 使用PlayerResponse的vssId
    method3: function() {
      console.log('\n📍 方法3: 使用PlayerResponse的vssId');

      const response = player.getPlayerResponse();
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

      console.log(`  PlayerResponse中有 ${tracks.length} 个轨道`);

      const asrTrack = tracks.find(t => t.languageCode === 'en' && t.kind === 'asr');

      if (asrTrack) {
        console.log(`  ✅ 找到ASR轨道:`, {
          lang: asrTrack.languageCode,
          kind: asrTrack.kind,
          vssId: asrTrack.vssId,
          name: asrTrack.name?.simpleText || asrTrack.name?.runs?.[0]?.text
        });

        // 使用vssId设置
        console.log('  使用vssId设置:', asrTrack.vssId);
        player.setOption('captions', 'track', {
          vssId: asrTrack.vssId
        });

        // 也尝试cc模块
        player.setOption('cc', 'track', {
          vssId: asrTrack.vssId
        });
      } else {
        console.log('  ❌ PlayerResponse中没有找到英语ASR轨道');
      }
    },

    // 方法4: 使用完整的轨道对象（从PlayerResponse）
    method4: function() {
      console.log('\n📍 方法4: 使用PlayerResponse的完整轨道对象');

      const response = player.getPlayerResponse();
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const asrTrack = tracks.find(t => t.languageCode === 'en' && t.kind === 'asr');

      if (asrTrack) {
        console.log('  找到ASR轨道，使用完整对象设置');
        player.setOption('captions', 'track', asrTrack);
      } else {
        console.log('  ❌ 未找到ASR轨道');
      }
    },

    // 方法5: 先关闭再设置
    method5: function() {
      console.log('\n📍 方法5: 先关闭字幕 -> 设置ASR -> 重新开启');

      // Step 1: 关闭字幕
      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') === 'true') {
        console.log('  关闭字幕...');
        btn.click();
      }

      setTimeout(() => {
        // Step 2: 设置ASR轨道
        console.log('  设置ASR轨道...');
        player.setOption('captions', 'track', {
          languageCode: "en",
          kind: "asr"
        });

        // Step 3: 重新开启字幕
        setTimeout(() => {
          console.log('  重新开启字幕...');
          if (btn) btn.click();
        }, 300);
      }, 300);
    },

    // 方法6: 通过UI菜单选择
    method6: function() {
      console.log('\n📍 方法6: 模拟UI菜单点击选择');

      const settingsBtn = document.querySelector('.ytp-settings-button');
      if (!settingsBtn) {
        console.error('  ❌ 找不到设置按钮');
        return;
      }

      console.log('  打开设置菜单...');
      settingsBtn.click();

      setTimeout(() => {
        // 找到字幕菜单项
        const menuItems = document.querySelectorAll('.ytp-settings-menu .ytp-menuitem');
        let subtitleMenuItem = null;

        menuItems.forEach(item => {
          const label = item.querySelector('.ytp-menuitem-label');
          if (label && (label.textContent.includes('字幕') ||
                       label.textContent.includes('Subtitle') ||
                       label.textContent.includes('Caption'))) {
            subtitleMenuItem = item;
          }
        });

        if (!subtitleMenuItem) {
          console.error('  ❌ 未找到字幕菜单');
          settingsBtn.click();
          return;
        }

        console.log('  进入字幕菜单...');
        subtitleMenuItem.click();

        setTimeout(() => {
          // 查找英语自动生成选项
          const subtitleOptions = document.querySelectorAll('.ytp-panel-menu .ytp-menuitem');
          let asrOption = null;

          subtitleOptions.forEach(option => {
            const label = option.querySelector('.ytp-menuitem-label');
            if (label) {
              const text = label.textContent.trim();
              if ((text.includes('英语') || text.includes('English')) &&
                  (text.includes('自动生成') || text.includes('auto-generated') || text.includes('(auto)'))) {
                asrOption = option;
                console.log('  ✅ 找到ASR选项:', text);
              }
            }
          });

          if (asrOption) {
            console.log('  点击选择ASR...');
            asrOption.click();

            // 关闭菜单
            setTimeout(() => {
              const backBtn = document.querySelector('.ytp-panel-back-button');
              if (backBtn) backBtn.click();
              setTimeout(() => settingsBtn.click(), 100);
            }, 300);
          } else {
            console.error('  ❌ 未找到英语自动生成选项');
            settingsBtn.click();
          }
        }, 300);
      }, 300);
    },

    // 方法7: 盲设vssId（猜测格式）
    method7: function() {
      console.log('\n📍 方法7: 盲设vssId（尝试常见格式）');

      const possibleVssIds = [
        'a.en',           // 常见ASR格式
        'asr.en',         // 可能的格式
        '.en.asr',        // 另一种可能
        'en.asr',         // 简单格式
        'a.en.US',        // 带地区码
        '.en.a',          // 变体
      ];

      console.log('  尝试以下vssId:', possibleVssIds);

      let index = 0;
      function tryNext() {
        if (index >= possibleVssIds.length) {
          console.log('  所有格式尝试完毕');
          return;
        }

        const vssId = possibleVssIds[index];
        console.log(`  尝试 [${index + 1}]: ${vssId}`);

        player.setOption('captions', 'track', {
          vssId: vssId
        });

        index++;
        setTimeout(tryNext, 500);
      }

      tryNext();
    },

    // 方法8: 组合方法（推荐）
    method8: function() {
      console.log('\n📍 方法8: 组合方法（先尝试vssId，失败则UI）');

      // Step 1: 从PlayerResponse获取vssId
      const response = player.getPlayerResponse();
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const asrTrack = tracks.find(t => t.languageCode === 'en' && t.kind === 'asr');

      if (asrTrack && asrTrack.vssId) {
        console.log('  ✅ 获取到vssId:', asrTrack.vssId);

        // 使用vssId设置
        player.setOption('captions', 'track', {
          vssId: asrTrack.vssId
        });

        // 触发字幕按钮
        setTimeout(() => {
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn && btn.getAttribute('aria-pressed') !== 'true') {
            console.log('  开启字幕显示...');
            btn.click();
          } else if (btn) {
            // Toggle刷新
            console.log('  刷新字幕显示...');
            btn.click();
            setTimeout(() => btn.click(), 300);
          }
        }, 500);
      } else {
        console.log('  ❌ 无法获取vssId，回退到UI方法');
        // 调用UI方法
        methods.method6();
      }
    }
  };

  // ========== 执行和验证函数 ==========
  function runMethod(methodName) {
    if (methods[methodName]) {
      methods[methodName]();

      // 验证结果
      setTimeout(() => {
        console.log('\n📊 验证结果:');

        // 检查当前轨道
        const current = player.getOption('captions', 'track');
        console.log('  当前轨道:', current);

        // 检查字幕按钮
        const btn = document.querySelector('.ytp-subtitles-button');
        if (btn) {
          console.log('  字幕按钮:', btn.getAttribute('aria-pressed') === 'true' ? '开启' : '关闭');
        }

        console.log('  💡 请查看Network标签，检查timedtext请求是否包含 kind=asr');
      }, 1500);
    }
  }

  // ========== 请求监听 ==========
  function startMonitoring() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0]?.toString() || '';
      if (url.includes('timedtext')) {
        console.log('%c🎯 捕获字幕请求:', 'color: #FF9800', url);
        const urlObj = new URL(url);
        const params = {
          lang: urlObj.searchParams.get('lang'),
          kind: urlObj.searchParams.get('kind'),  // 关键：检查这个参数
          v: urlObj.searchParams.get('v')
        };
        console.log('  参数:', params);

        if (params.kind === 'asr') {
          console.log('  ✅ 成功！请求包含 kind=asr');
        }
      }
      return originalFetch.apply(this, args);
    };
    console.log('✅ 已开启请求监听');
  }

  // ========== 提供交互接口 ==========
  window.asrDirect = {
    // 单独测试每个方法
    test1: () => runMethod('method1'),  // 基础设置
    test2: () => runMethod('method2'),  // 双模块
    test3: () => runMethod('method3'),  // vssId
    test4: () => runMethod('method4'),  // 完整对象
    test5: () => runMethod('method5'),  // 关闭再设置
    test6: () => runMethod('method6'),  // UI点击
    test7: () => runMethod('method7'),  // 盲设vssId
    test8: () => runMethod('method8'),  // 组合方法

    // 运行所有测试
    runAll: function() {
      console.log('\n%c🚀 运行所有方法（间隔3秒）', 'color: #00BCD4; font-weight: bold');
      const methodNames = Object.keys(methods);
      let index = 0;

      function runNext() {
        if (index >= methodNames.length) {
          console.log('\n✅ 所有方法测试完成');
          return;
        }

        runMethod(methodNames[index]);
        index++;
        setTimeout(runNext, 3000);
      }

      runNext();
    },

    // 监听请求
    monitor: startMonitoring,

    // 快速测试（推荐）
    quick: function() {
      console.log('\n%c⚡ 快速测试（vssId方法）', 'color: #4CAF50; font-weight: bold');
      startMonitoring();
      runMethod('method3');
    }
  };

  // ========== 启动 ==========
  console.log('\n' + '='.repeat(50));
  console.log('%c📌 使用方法:', 'color: #673AB7; font-weight: bold');
  console.log('  asrDirect.test1() - 基础设置（languageCode + kind）');
  console.log('  asrDirect.test2() - 双模块设置');
  console.log('  asrDirect.test3() - vssId方法（推荐）');
  console.log('  asrDirect.test4() - 完整对象');
  console.log('  asrDirect.test5() - 关闭再设置');
  console.log('  asrDirect.test6() - UI点击');
  console.log('  asrDirect.test7() - 盲设vssId');
  console.log('  asrDirect.test8() - 组合方法');
  console.log('  ------------------------------------');
  console.log('  asrDirect.runAll() - 运行所有测试');
  console.log('  asrDirect.monitor() - 开启请求监听');
  console.log('  asrDirect.quick() - 快速测试（推荐）');
  console.log('='.repeat(50));

  // 开启监听
  startMonitoring();

  // 自动运行推荐方法
  console.log('\n%c自动运行方法3（vssId方法）...', 'color: #4CAF50');
  runMethod('method3');

})();