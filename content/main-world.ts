/**
 * Main World Script (injected into the page)
 * Responsible for accessing page-level APIs like getPlayerResponse()
 * and communicating back to the content script via postMessage.
 */
console.log('[Main World] 脚本开始加载');

// 定义一个变量跟踪就绪状态，防止重复发送
let readyMessageSent = false;

// 函数：发送就绪消息
function sendReadyMessage() {
  if (!readyMessageSent) {
    console.log('[Main World] 发送就绪消息');
    window.postMessage({ source: 'main-world', type: 'MAIN_WORLD_READY' }, '*');
    readyMessageSent = true;
  }
}

// 立即发送就绪消息，不等待其他代码执行
sendReadyMessage();

// Listen for messages from the content script
window.addEventListener('message', (event) => {
  // 基本安全检查
  if (event.source !== window || event.data?.source !== 'content-script') return;
  
  // 响应就绪状态请求（新增）
  if (event.data?.type === 'CHECK_MAIN_WORLD_READY') {
    console.log('[Main World] 收到就绪检查请求，重新发送就绪消息');
    sendReadyMessage();
    return;
  }
  
  // 处理轨道请求
  if (event.data?.type === 'REQUEST_CAPTION_TRACKS') {
    console.log('[Main World] 收到字幕轨道请求');
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof (player as any).getPlayerResponse === 'function') {
        const playerResponse = (player as any).getPlayerResponse();
        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        console.log('[Main World] Got captionTracks:', captionTracks);

        // Send the caption tracks back to the content script
        window.postMessage({
          source: 'main-world',
          type: 'CAPTION_TRACKS_RESPONSE',
          payload: {
            captionTracks: captionTracks || null // Send null if not found
          }
        }, '*'); // Use '*' for targetOrigin initially, can be refined if needed

      } else {
        console.warn('[Main World] Could not find movie_player or getPlayerResponse function.');
        window.postMessage({
          source: 'main-world',
          type: 'CAPTION_TRACKS_RESPONSE',
          error: 'Player or API not found'
        }, '*');
      }
    } catch (error) {
      console.error('[Main World] Error accessing getPlayerResponse:', error);
      window.postMessage({
        source: 'main-world',
        type: 'CAPTION_TRACKS_RESPONSE',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, '*');
    }
  }
});

// 确保页面加载完成后也发送就绪消息
window.addEventListener('load', () => {
  console.log('[Main World] 页面加载完成，确保就绪消息已发送');
  sendReadyMessage();
});

// 最后再次发送就绪消息，作为保险措施
setTimeout(sendReadyMessage, 100); 