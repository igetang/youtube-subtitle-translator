/**
 * YouTube英语自动生成字幕选择器（修正版）
 *
 * 关键改进：
 * 1. 不依赖 player.getOption() 获取轨道（因为它获取不到ASR）
 * 2. 直接尝试设置，不管能否获取到
 * 3. 使用PlayerResponse作为信息来源
 */

(function selectEnglishASR() {
  console.clear();
  console.log('%c🎯 YouTube英语ASR字幕选择器（修正版）', 'color: #4CAF50; font-size: 16px; font-weight: bold');
  console.log('='.repeat(50));

  const player = document.getElementById('movie_player');
  if (!player) {
    console.error('❌ 找不到播放器');
    return;
  }

  // 加载字幕模块
  if (typeof player.loadModule === 'function') {
    player.loadModule("captions");
    player.loadModule("cc");
  }

  // ========== 开启请求监听 ==========
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0]?.toString() || '';
    if (url.includes('timedtext')) {
      const urlObj = new URL(url);
      const kind = urlObj.searchParams.get('kind');
      const lang = urlObj.searchParams.get('lang');

      console.log('%c🎯 捕获字幕请求:', 'color: #FF9800', {
        lang: lang,
        kind: kind,
        success: kind === 'asr' ? '✅ ASR字幕！' : '❌ 非ASR'
      });

      if (kind === 'asr') {
        console.log('%c✅ 成功选择了ASR字幕！', 'color: #4CAF50; font-size: 14px');
      }
    }
    return originalFetch.apply(this, args);
  };

  // ========== 获取ASR轨道信息（从PlayerResponse）==========
  function getASRInfo() {
    const response = player.getPlayerResponse();
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    console.log(`📊 PlayerResponse中有 ${tracks.length} 个轨道`);

    // 找出所有英语轨道
    const enTracks = tracks.filter(t => t.languageCode === 'en');
    const asrTrack = enTracks.find(t => t.kind === 'asr');
    const manualTrack = enTracks.find(t => !t.kind || t.kind !== 'asr');

    if (manualTrack) {
      console.log('  📝 英语手动字幕:', {
        name: manualTrack.name?.simpleText || manualTrack.name?.runs?.[0]?.text,
        vssId: manualTrack.vssId
      });
    }

    if (asrTrack) {
      console.log('  🤖 英语自动生成:', {
        name: asrTrack.name?.simpleText || asrTrack.name?.runs?.[0]?.text,
        vssId: asrTrack.vssId,
        kind: asrTrack.kind
      });
    }

    return asrTrack;
  }

  // ========== 测试方法集合 ==========
  const methods = {
    // 方法1：直接设置（不检查是否存在）
    directSet: function() {
      console.log('\n▶ 方法1: 直接设置 languageCode + kind（不检查是否存在）');

      // 不管API能否看到，直接尝试
      player.setOption('captions', 'track', {
        languageCode: "en",
        kind: "asr"
      });

      // 也设置cc模块
      player.setOption('cc', 'track', {
        languageCode: "en",
        kind: "asr"
      });

      console.log('  ✅ 已发送设置请求（不管API是否能看到ASR）');
    },

    // 方法2：使用vssId（从PlayerResponse获取）
    useVssId: function() {
      console.log('\n▶ 方法2: 使用vssId设置');

      const asrTrack = getASRInfo();

      if (asrTrack && asrTrack.vssId) {
        console.log('  设置vssId:', asrTrack.vssId);

        player.setOption('captions', 'track', {
          vssId: asrTrack.vssId
        });

        player.setOption('cc', 'track', {
          vssId: asrTrack.vssId
        });

        console.log('  ✅ 已使用vssId设置');
      } else {
        console.log('  ❌ PlayerResponse中没有ASR轨道');

        // 即使没有，也尝试直接设置
        console.log('  尝试直接设置...');
        methods.directSet();
      }
    },

    // 方法3：完整流程（推荐）
    complete: function() {
      console.log('\n▶ 方法3: 完整流程（关闭→设置→开启）');

      // Step 1: 先关闭字幕
      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') === 'true') {
        console.log('  Step 1: 关闭字幕');
        btn.click();
      }

      setTimeout(() => {
        // Step 2: 获取ASR信息
        const asrTrack = getASRInfo();

        // Step 3: 设置轨道（优先vssId，其次直接设置）
        if (asrTrack && asrTrack.vssId) {
          console.log('  Step 2: 使用vssId设置:', asrTrack.vssId);
          player.setOption('captions', 'track', {
            vssId: asrTrack.vssId
          });
        } else {
          console.log('  Step 2: 直接设置 en + asr');
          player.setOption('captions', 'track', {
            languageCode: "en",
            kind: "asr"
          });
        }

        // Step 4: 重新开启字幕
        setTimeout(() => {
          if (btn) {
            console.log('  Step 3: 开启字幕');
            btn.click();
          }

          // Step 5: 验证
          setTimeout(() => {
            console.log('\n📊 验证结果:');
            const current = player.getOption('captions', 'track');
            console.log('  API返回的当前轨道:', current);
            console.log('  💡 请查看上方是否捕获到 kind=asr 的请求');
          }, 1000);
        }, 500);
      }, 500);
    },

    // 方法4：UI点击（最可靠的后备方案）
    uiClick: function() {
      console.log('\n▶ 方法4: UI菜单点击');

      const settingsBtn = document.querySelector('.ytp-settings-button');
      if (!settingsBtn) {
        console.error('  ❌ 找不到设置按钮');
        return;
      }

      settingsBtn.click();

      setTimeout(() => {
        // 找字幕菜单
        const menuItems = document.querySelectorAll('.ytp-settings-menu .ytp-menuitem');
        let subtitleItem = null;

        menuItems.forEach(item => {
          const label = item.querySelector('.ytp-menuitem-label');
          if (label && (label.textContent.includes('字幕') ||
                       label.textContent.includes('Subtitle') ||
                       label.textContent.includes('Caption'))) {
            subtitleItem = item;
          }
        });

        if (subtitleItem) {
          console.log('  进入字幕菜单');
          subtitleItem.click();

          setTimeout(() => {
            // 找ASR选项
            const options = document.querySelectorAll('.ytp-panel-menu .ytp-menuitem');
            let asrOption = null;

            options.forEach(opt => {
              const label = opt.querySelector('.ytp-menuitem-label');
              if (label) {
                const text = label.textContent;
                if ((text.includes('英语') || text.includes('English')) &&
                    (text.includes('自动') || text.includes('auto'))) {
                  asrOption = opt;
                  console.log('  找到ASR选项:', text);
                }
              }
            });

            if (asrOption) {
              console.log('  点击选择ASR');
              asrOption.click();

              // 关闭菜单
              setTimeout(() => {
                document.querySelector('.ytp-panel-back-button')?.click();
                setTimeout(() => settingsBtn.click(), 100);
              }, 300);
            } else {
              console.log('  ❌ 未找到ASR选项');
              settingsBtn.click();
            }
          }, 300);
        } else {
          console.log('  ❌ 未找到字幕菜单');
          settingsBtn.click();
        }
      }, 300);
    }
  };

  // ========== 交互接口 ==========
  window.asr = {
    // 测试各个方法
    test1: methods.directSet,
    test2: methods.useVssId,
    test3: methods.complete,
    test4: methods.uiClick,

    // 运行所有
    all: function() {
      console.log('%c🚀 测试所有方法', 'color: #00BCD4; font-weight: bold');
      let index = 0;
      const methodList = [methods.directSet, methods.useVssId, methods.complete];

      function runNext() {
        if (index >= methodList.length) {
          console.log('\n✅ 测试完成，如果都失败请尝试 asr.test4() (UI方法)');
          return;
        }
        methodList[index]();
        index++;
        setTimeout(runNext, 3000);
      }
      runNext();
    },

    // 显示当前状态
    status: function() {
      console.log('\n📊 当前状态:');

      // API看到的
      const tracks = player.getOption('captions', 'tracklist') || [];
      console.log('  API可见轨道数:', tracks.length);
      tracks.forEach(t => {
        console.log(`    - ${t.languageCode} (${t.kind || 'manual'})`);
      });

      // PlayerResponse看到的
      const response = player.getPlayerResponse();
      const prTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      console.log('  PlayerResponse轨道数:', prTracks.length);

      // 当前选中
      const current = player.getOption('captions', 'track');
      console.log('  当前轨道:', current);

      // 按钮状态
      const btn = document.querySelector('.ytp-subtitles-button');
      console.log('  字幕按钮:', btn?.getAttribute('aria-pressed') === 'true' ? '开启' : '关闭');
    }
  };

  // ========== 使用说明 ==========
  console.log('\n📌 核心改进:');
  console.log('  • 不依赖 getOption 获取轨道（因为它看不到ASR）');
  console.log('  • 直接尝试设置，不管API是否能看到');
  console.log('  • 使用PlayerResponse获取ASR信息');

  console.log('\n📌 使用方法:');
  console.log('  asr.test1() - 直接设置（最简单）');
  console.log('  asr.test2() - vssId方法');
  console.log('  asr.test3() - 完整流程（推荐）');
  console.log('  asr.test4() - UI点击（最可靠）');
  console.log('  asr.all()   - 测试前3种方法');
  console.log('  asr.status() - 查看状态');
  console.log('='.repeat(50));

  // 显示初始状态
  asr.status();

  // 自动运行推荐方法
  console.log('\n%c⚡ 3秒后自动运行方法3（完整流程）...', 'color: #4CAF50');
  setTimeout(() => {
    methods.complete();
  }, 3000);

})();