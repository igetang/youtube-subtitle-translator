// YouTube Ad Detection Test
console.log('========== YouTube Ad Detection Test ==========');

const player = document.getElementById('movie_player');

if (!player) {
  console.error('Player not found');
} else {
  console.log('Player found');

  // Method 1: Player API Ad State
  console.log('\n[Method 1: Player API Ad State]');
  try {
    const adState = player.getAdState?.();
    console.log('adState:', adState);
    console.log('Has ad:', adState !== undefined && adState !== -1);
  } catch (e) {
    console.warn('getAdState() failed:', e.message);
  }

  // Method 2: DOM Elements
  console.log('\n[Method 2: DOM Elements]');

  const adIndicators = {
    '.video-ads': document.querySelector('.video-ads'),
    '.ytp-ad-player-overlay': document.querySelector('.ytp-ad-player-overlay'),
    '.ytp-ad-text': document.querySelector('.ytp-ad-text'),
    '.ytp-ad-preview-container': document.querySelector('.ytp-ad-preview-container'),
    '.ytp-ad-overlay-container': document.querySelector('.ytp-ad-overlay-container'),
    '.ytp-ad-skip-button-container': document.querySelector('.ytp-ad-skip-button-container')
  };

  console.log('Ad DOM elements:');
  Object.entries(adIndicators).forEach(function(item) {
    const selector = item[0];
    const element = item[1];
    const exists = element !== null;
    const visible = exists && element.offsetParent !== null;
    console.log('  ' + selector + ':', {
      exists: exists,
      visible: visible,
      display: exists ? window.getComputedStyle(element).display : 'N/A'
    });
  });

  const hasVisibleAdElement = Object.values(adIndicators).some(function(el) {
    return el !== null && el.offsetParent !== null;
  });
  console.log('Has visible ad element:', hasVisibleAdElement);

  // Method 3: Player Class Names
  console.log('\n[Method 3: Player Class Names]');
  const playerClasses = player.className;
  console.log('Player classes:', playerClasses);

  const adRelatedClasses = [
    'ad-showing',
    'ad-interrupting',
    'playing-ad',
    'ad-playing'
  ];

  const hasAdClass = adRelatedClasses.some(function(cls) {
    return playerClasses.includes(cls);
  });
  console.log('Has ad class:', hasAdClass);
  if (hasAdClass) {
    console.log('  Matched classes:', adRelatedClasses.filter(function(cls) {
      return playerClasses.includes(cls);
    }));
  }

  // Method 4: PlayerResponse Data
  console.log('\n[Method 4: PlayerResponse Data]');
  try {
    const playerResponse = player.getPlayerResponse?.();
    if (playerResponse) {
      console.log('PlayerResponse videoId:', playerResponse.videoDetails?.videoId);
      console.log('URL videoId:', new URLSearchParams(window.location.search).get('v'));
      console.log('VideoId match:',
        playerResponse.videoDetails?.videoId === new URLSearchParams(window.location.search).get('v')
      );

      console.log('adPlacements:', playerResponse.adPlacements ? 'exists' : 'not exists');
      console.log('playerAds:', playerResponse.playerAds ? 'exists' : 'not exists');

      const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log('Caption tracks count:', captionTracks?.length || 0);
      if (captionTracks && captionTracks.length > 0) {
        console.log('Caption tracks sample:', captionTracks.slice(0, 2));
      }
    } else {
      console.warn('getPlayerResponse() returned null');
    }
  } catch (e) {
    console.warn('getPlayerResponse() failed:', e.message);
  }

  // Method 5: ytInitialPlayerResponse
  console.log('\n[Method 5: ytInitialPlayerResponse]');
  try {
    const ytInitialPlayerResponse = window.ytInitialPlayerResponse;
    if (ytInitialPlayerResponse) {
      console.log('ytInitialPlayerResponse videoId:', ytInitialPlayerResponse.videoDetails?.videoId);
      const initialCaptionTracks = ytInitialPlayerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log('Initial caption tracks count:', initialCaptionTracks?.length || 0);
      if (initialCaptionTracks && initialCaptionTracks.length > 0) {
        console.log('Initial caption tracks sample:', initialCaptionTracks.slice(0, 2));
      }
    } else {
      console.warn('window.ytInitialPlayerResponse not found');
    }
  } catch (e) {
    console.warn('ytInitialPlayerResponse access failed:', e.message);
  }

  // Method 6: Video Elements
  console.log('\n[Method 6: Video Elements]');
  const videoElements = document.querySelectorAll('video');
  console.log('Video element count:', videoElements.length);
  videoElements.forEach(function(video, index) {
    console.log('Video ' + (index + 1) + ':', {
      src: video.src?.substring(0, 100) + '...',
      className: video.className,
      isAdVideo: video.className.includes('ad') || video.closest('.ad-container, .video-ads') !== null
    });
  });

  // Final Result
  console.log('\n========== Final Result ==========');

  const isPlayingAd =
    (player.getAdState?.() !== undefined && player.getAdState?.() !== -1) ||
    hasVisibleAdElement ||
    hasAdClass;

  console.log('Is playing ad:', isPlayingAd);

  if (isPlayingAd) {
    console.log('WARNING: Ad is playing, should wait for ad to finish');
  } else {
    console.log('OK: No ad playing, safe to get caption data');
  }
}

console.log('========================================');
