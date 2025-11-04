// Test: Can we get video captions during ad playback?
(() => {
  console.log('========== Test: Get Video Captions During Ad ==========');

  const player = document.getElementById('movie_player');
  if (!player) {
    return console.error('Player not found');
  }

  // Get URL videoId (this is always the real video ID)
  const urlVideoId = new URLSearchParams(window.location.search).get('v');
  console.log('URL videoId:', urlVideoId);

  // Check if ad is playing
  const videoData = player.getVideoData?.() ?? {};
  const adState = player.getAdState?.() ?? -1;
  const isAdPlaying = adState !== -1 || videoData?.isAdPlaying === true;
  console.log('Is ad playing:', isAdPlaying);
  console.log('adState:', adState);

  // Source 1: player.getPlayerResponse()
  console.log('\n[Source 1: player.getPlayerResponse()]');
  try {
    const playerResponse = player.getPlayerResponse?.();
    if (playerResponse) {
      console.log('  videoId:', playerResponse.videoDetails?.videoId);
      console.log('  videoId matches URL:', playerResponse.videoDetails?.videoId === urlVideoId);
      const tracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log('  caption tracks count:', tracks?.length ?? 0);
      if (tracks?.length > 0) {
        console.log('  caption tracks sample:', tracks.slice(0, 2));
      }
    }
  } catch (e) {
    console.error('  Error:', e.message);
  }

  // Source 2: window.ytInitialPlayerResponse
  console.log('\n[Source 2: window.ytInitialPlayerResponse]');
  try {
    const ytInitial = window.ytInitialPlayerResponse;
    if (ytInitial) {
      console.log('  videoId:', ytInitial.videoDetails?.videoId);
      console.log('  videoId matches URL:', ytInitial.videoDetails?.videoId === urlVideoId);
      const tracks = ytInitial.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log('  caption tracks count:', tracks?.length ?? 0);
      if (tracks?.length > 0) {
        console.log('  caption tracks sample:', tracks.slice(0, 2));
      }
    } else {
      console.warn('  window.ytInitialPlayerResponse not found');
    }
  } catch (e) {
    console.error('  Error:', e.message);
  }

  // Source 3: window.ytInitialData
  console.log('\n[Source 3: window.ytInitialData]');
  try {
    const ytData = window.ytInitialData;
    if (ytData) {
      console.log('  ytInitialData exists');
      // Try to find captions in ytInitialData
      const playerOverlays = ytData?.playerOverlays?.playerOverlayRenderer;
      console.log('  playerOverlays exists:', Boolean(playerOverlays));
    } else {
      console.warn('  window.ytInitialData not found');
    }
  } catch (e) {
    console.error('  Error:', e.message);
  }

  // Source 4: Directly fetch timedtext API
  console.log('\n[Source 4: Fetch timedtext API directly]');
  console.log('  Can we construct timedtext URL from ytInitialPlayerResponse?');
  try {
    const ytInitial = window.ytInitialPlayerResponse;
    if (ytInitial) {
      const tracks = ytInitial.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length > 0) {
        const firstTrack = tracks[0];
        console.log('  First track baseUrl:', firstTrack.baseUrl?.substring(0, 100) + '...');
        console.log('  Can directly fetch:', Boolean(firstTrack.baseUrl));

        // Try to fetch
        if (firstTrack.baseUrl) {
          console.log('  Attempting to fetch...');
          fetch(firstTrack.baseUrl)
            .then(res => res.text())
            .then(text => {
              console.log('  Fetch SUCCESS! Got', text.length, 'bytes');
              console.log('  Content preview:', text.substring(0, 200));
            })
            .catch(err => {
              console.error('  Fetch FAILED:', err.message);
            });
        }
      }
    }
  } catch (e) {
    console.error('  Error:', e.message);
  }

  // Source 5: Check if ytplayer.config exists
  console.log('\n[Source 5: window.ytplayer.config]');
  try {
    if (window.ytplayer?.config) {
      console.log('  ytplayer.config exists');
      const args = window.ytplayer.config.args;
      if (args) {
        console.log('  args.video_id:', args.video_id);
        console.log('  args.player_response exists:', Boolean(args.player_response));
        if (args.player_response) {
          try {
            const parsed = typeof args.player_response === 'string'
              ? JSON.parse(args.player_response)
              : args.player_response;
            const tracks = parsed.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            console.log('  caption tracks count:', tracks?.length ?? 0);
            console.log('  videoId:', parsed.videoDetails?.videoId);
          } catch (e) {
            console.error('  Failed to parse player_response:', e.message);
          }
        }
      }
    } else {
      console.warn('  window.ytplayer.config not found');
    }
  } catch (e) {
    console.error('  Error:', e.message);
  }

  console.log('\n========== Summary ==========');
  console.log('QUESTION: During ad playback, which source has the REAL video captions?');
  console.log('- Check if ytInitialPlayerResponse videoId matches URL videoId');
  console.log('- Check if ytInitialPlayerResponse has caption tracks');
  console.log('- Check if we can directly fetch from baseUrl');
  console.log('========================================');
})();
