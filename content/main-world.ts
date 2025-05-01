/**
 * Main World Script (injected into the page)
 * Responsible for accessing page-level APIs like getPlayerResponse()
 * and communicating back to the content script via postMessage.
 */
console.log('[Main World] Script loaded.');

// Listen for messages from the content script
window.addEventListener('message', (event) => {
  // Basic security: Check the source and message structure
  // We only accept messages from the window itself (same origin)
  // and specifically those requesting caption tracks.
  if (event.source !== window || event.data?.source !== 'content-script' || event.data?.type !== 'REQUEST_CAPTION_TRACKS') {
    return;
  }

  console.log('[Main World] Received message from content script:', event.data);

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
});

// Optional: Send a message indicating the main world script is ready
window.postMessage({ source: 'main-world', type: 'MAIN_WORLD_READY' }, '*'); 