● YouTube字幕获取 - 控制台调试方案

  工作原理

  通过拦截YouTube页面的timedtext API网络请求来获取字幕数据，无需处理POT Token验证。

  核心代码（直接在控制台执行）

  // 完整的字幕获取方案 - 直接从网络请求获取
  (async function() {
      console.log('=== YouTube字幕拦截器启动 ===');

      let capturedUrl = null;
      let subtitleData = null;

      // 1. 劫持XMLHttpRequest
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
          if (url && url.includes('timedtext')) {
              console.log('🎯 捕获到字幕URL (XHR):', url);
              capturedUrl = url;

              // 立即请求这个URL
              fetchSubtitle(url);
          }
          return originalOpen.apply(this, arguments);
      };

      // 2. 劫持fetch
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
          const url = args[0];
          if (typeof url === 'string' && url.includes('timedtext')) {
              console.log('🎯 捕获到字幕URL (Fetch):', url);
              capturedUrl = url;

              // 立即请求这个URL
              fetchSubtitle(url);
          }
          return originalFetch.apply(this, args);
      };

      // 3. 获取并解析字幕
      async function fetchSubtitle(url) {
          try {
              // 确保是完整URL
              if (!url.startsWith('http')) {
                  url = 'https://www.youtube.com' + url;
              }

              console.log('正在获取字幕:', url);
              const response = await originalFetch(url);
              const text = await response.text();

              // 尝试解析为JSON
              try {
                  const data = JSON.parse(text);
                  console.log('✅ 字幕数据（JSON）:', data);

                  // 如果是json3格式，解析它
                  if (data.events) {
                      subtitleData = parseJson3Subtitles(data);
                      console.log('📝 解析后的字幕（前10条）:', subtitleData.slice(0, 10));

                      // 保存到全局变量供后续使用
                      window.__capturedSubtitles = subtitleData;
                  }
              } catch (e) {
                  // 可能是XML格式
                  console.log('✅ 字幕数据（XML/文本）:', text.substring(0, 500));
                  subtitleData = parseXmlSubtitles(text);
                  window.__capturedSubtitles = subtitleData;
              }
          } catch (error) {
              console.error('获取字幕失败:', error);
          }
      }

      // 4. 解析JSON3格式字幕
      function parseJson3Subtitles(data) {
          const subtitles = [];
          data.events.forEach(event => {
              if (event.segs) {
                  const text = event.segs.map(seg => seg.utf8).join('');
                  if (text.trim()) {
                      subtitles.push({
                          start: (event.tStartMs || 0) / 1000,
                          duration: (event.dDurationMs || 0) / 1000,
                          end: ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000,
                          text: text.trim()
                      });
                  }
              }
          });
          return subtitles;
      }

      // 5. 解析XML格式字幕
      function parseXmlSubtitles(xmlText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
          const texts = xmlDoc.getElementsByTagName('text');

          const subtitles = [];
          for (let text of texts) {
              subtitles.push({
                  start: parseFloat(text.getAttribute('start')),
                  duration: parseFloat(text.getAttribute('dur')),
                  text: text.textContent
              });
          }
          return subtitles;
      }

      // 6. 触发字幕切换以捕获URL
      console.log('\n请执行以下操作来触发字幕请求：');
      console.log('1. 点击字幕按钮关闭再打开');
      console.log('2. 或者在设置中切换字幕语言');
      console.log('3. 或者刷新页面');

      // 7. 尝试自动触发
      setTimeout(() => {
          const subtitleBtn = document.querySelector('.ytp-subtitles-button');
          if (subtitleBtn) {
              console.log('尝试自动切换字幕...');
              subtitleBtn.click(); // 关闭
              setTimeout(() => {
                  subtitleBtn.click(); // 打开
              }, 500);
          }
      }, 1000);
  })();

  使用步骤

  1. 打开YouTube视频页面
  2. 按F12打开开发者工具
  3. 切换到Console（控制台）标签
  4. 复制粘贴上面的代码
  5. 按Enter执行
  6. 切换一下字幕（开关或切换语言）
  7. 查看控制台输出的字幕数据

  导出字幕功能

  执行上面的代码后，可以使用以下代码导出字幕：

  // 导出为SRT格式
  (function exportSRT() {
      const subtitles = window.__capturedSubtitles;
      if (!subtitles) {
          console.error('请先执行字幕获取代码');
          return;
      }

      let srt = '';
      subtitles.forEach((sub, index) => {
          srt += `${index + 1}\n`;
          srt += `${formatTime(sub.start)} --> ${formatTime(sub.end || sub.start +
  sub.duration)}\n`;
          srt += `${sub.text}\n\n`;
      });

      // 下载文件
      const blob = new Blob([srt], {type: 'text/plain'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'subtitle.srt';
      a.click();

      console.log('✅ SRT字幕已下载');

      function formatTime(seconds) {
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const s = Math.floor(seconds % 60);
          const ms = Math.floor((seconds % 1) * 1000);
          return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
      }

      function pad(num, size = 2) {
          return String(num).padStart(size, '0');
      }
  })();

  // 导出为纯文本
  (function exportText() {
      const subtitles = window.__capturedSubtitles;
      if (!subtitles) {
          console.error('请先执行字幕获取代码');
          return;
      }

      const text = subtitles.map(s => s.text).join('\n');

      // 下载文件
      const blob = new Blob([text], {type: 'text/plain'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'subtitle.txt';
      a.click();

      console.log('✅ 文本已下载');
  })();

  实现原理说明

  1. 请求拦截

  - 劫持XMLHttpRequest.prototype.open
  - 劫持window.fetch
  - 监听包含timedtext的URL

  2. 字幕API格式

  https://www.youtube.com/api/timedtext?
      v={videoId}          # 视频ID
      &lang={language}     # 语言代码
      &fmt=json3          # 格式

  3. 数据格式

  - JSON3格式：包含events数组，每个事件有tStartMs、dDurationMs和segs
  - XML格式：包含<text>标签，有start和dur属性

  4. 触发时机

  - 用户开启/关闭字幕
  - 切换字幕语言
  - 页面初始加载（如果默认开启字幕）

  注意事项

  1. 必须在YouTube视频页面执行
  2. 需要视频有字幕轨道
  3. 首次执行需要触发字幕切换
  4. 字幕数据保存在window.__capturedSubtitles

  项目集成建议

  1. 将拦截逻辑封装成独立模块
  2. 添加事件监听机制
  3. 实现字幕缓存
  4. 提供多种导出格式
  5. 添加错误处理

  成功标志

  控制台出现以下信息表示成功：
  - 🎯 捕获到字幕URL
  - ✅ 字幕数据（JSON）
  - 📝 解析后的字幕

  调试技巧

  如果没有捕获到字幕：
  1. 确认视频有字幕
  2. 手动切换字幕开关
  3. 在设置中切换字幕语言
  4. 检查Network面板是否有timedtext请求

  ---
  最后更新：2025年8月测试环境：Chrome浏览器验证状态：✅ 已验证可用