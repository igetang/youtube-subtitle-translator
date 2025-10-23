// 检查YouTube字幕容器结构和CSS参数

console.log('=== 检查字幕容器结构 ===\n');

// 1. #movie_player (YouTube播放器容器)
const player = document.querySelector('#movie_player');
if (player) {
  console.log('1. #movie_player (YouTube播放器):');
  const rect = player.getBoundingClientRect();
  console.log('  高度:', rect.height);
  console.log('  位置:', { top: rect.top, bottom: rect.bottom });
  console.log('  style.bottom:', player.style.bottom || '(无)');
  console.log('  computed bottom:', getComputedStyle(player).bottom);
  console.log('');
}

// 2. 我们的字幕容器 #youtube-subtitle-overlay
const overlay = document.querySelector('#youtube-subtitle-overlay');
if (overlay) {
  console.log('2. #youtube-subtitle-overlay (我们的第一层):');
  const rect = overlay.getBoundingClientRect();
  console.log('  高度:', rect.height);
  console.log('  位置:', { top: rect.top, bottom: rect.bottom });
  console.log('  style.bottom:', overlay.style.bottom || '(无)');
  console.log('  computed bottom:', getComputedStyle(overlay).bottom);
  console.log('  computed transition:', getComputedStyle(overlay).transition);

  // 检查父元素
  console.log('  父元素:', overlay.parentElement?.id || overlay.parentElement?.className);
  console.log('');

  // 3. 第二层 #subtitle-window
  const window = overlay.querySelector('#subtitle-window');
  if (window) {
    console.log('3. #subtitle-window (我们的第二层):');
    const rect = window.getBoundingClientRect();
    console.log('  高度:', rect.height);
    console.log('  位置:', { top: rect.top, bottom: rect.bottom });
    console.log('  style.bottom:', window.style.bottom || '(无)');
    console.log('  style.paddingBottom:', window.style.paddingBottom || '(无)');
    console.log('  computed bottom:', getComputedStyle(window).bottom);
    console.log('');
  }

  // 4. 第三层 #subtitle-container
  const container = overlay.querySelector('#subtitle-container');
  if (container) {
    console.log('4. #subtitle-container (我们的第三层):');
    const rect = container.getBoundingClientRect();
    console.log('  高度:', rect.height);
    console.log('  位置:', { top: rect.top, bottom: rect.bottom });
    console.log('  visibility:', getComputedStyle(container).visibility);
    console.log('');
  }
}

// 5. YouTube原生字幕容器
const captionContainer = document.querySelector('.ytp-caption-window-container');
if (captionContainer) {
  console.log('5. .ytp-caption-window-container (YouTube原生容器):');
  const rect = captionContainer.getBoundingClientRect();
  console.log('  高度:', rect.height);
  console.log('  位置:', { top: rect.top, bottom: rect.bottom });
  console.log('  style.bottom:', captionContainer.style.bottom || '(无)');
  console.log('  computed bottom:', getComputedStyle(captionContainer).bottom);
  console.log('');
}

const captionWindow = document.querySelector('.caption-window');
if (captionWindow) {
  console.log('6. .caption-window (YouTube原生字幕窗口):');
  const rect = captionWindow.getBoundingClientRect();
  console.log('  高度:', rect.height);
  console.log('  位置:', { top: rect.top, bottom: rect.bottom });
  console.log('  style.bottom:', captionWindow.style.bottom || '(无)');
  console.log('  computed bottom:', getComputedStyle(captionWindow).bottom);
  console.log('');
}

console.log('=== 现在请暂停/播放视频，观察字幕是否跟随控制栏浮动 ===');
console.log('提示: 暂停时控制栏出现，播放并移走鼠标时控制栏消失');
