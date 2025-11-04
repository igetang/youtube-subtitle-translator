// Test: Fetch captions directly using videoId
(() => {
  console.log('========== Test: Fetch Captions by VideoId ==========');

  // Get real video ID from URL
  const urlVideoId = new URLSearchParams(window.location.search).get('v');
  console.log('URL videoId:', urlVideoId);

  if (!urlVideoId) {
    return console.error('No videoId found in URL');
  }

  // Method 1: Try to get caption tracks from page data
  console.log('\n[Method 1: Extract tracks from page HTML/scripts]');

  // Check ytInitialPlayerResponse but match videoId
  const ytInitial = window.ytInitialPlayerResponse;
  if (ytInitial) {
    console.log('ytInitialPlayerResponse videoId:', ytInitial.videoDetails?.videoId);
    console.log('Matches URL videoId:', ytInitial.videoDetails?.videoId === urlVideoId);

    if (ytInitial.videoDetails?.videoId === urlVideoId) {
      const tracks = ytInitial.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log('Caption tracks count:', tracks?.length ?? 0);
      if (tracks?.length > 0) {
        console.log('SUCCESS: Found tracks in ytInitialPlayerResponse');
        console.log('Tracks:', tracks);
        return { success: true, source: 'ytInitialPlayerResponse', tracks };
      }
    }
  }

  // Method 2: Try to construct timedtext URL manually
  console.log('\n[Method 2: Construct timedtext URL manually]');

  // YouTube's timedtext API endpoint format:
  // https://www.youtube.com/api/timedtext?v={VIDEO_ID}&lang={LANG_CODE}

  // Common language codes to try
  const commonLangs = ['en', 'zh', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de'];

  console.log('Trying common language codes...');

  const testLang = async (langCode) => {
    const url = `https://www.youtube.com/api/timedtext?v=${urlVideoId}&lang=${langCode}`;
    try {
      const response = await fetch(url);
      const text = await response.text();

      if (response.ok && text && text.length > 0 && !text.includes('error')) {
        console.log(`  SUCCESS: ${langCode} - got ${text.length} bytes`);
        return { langCode, success: true, size: text.length, preview: text.substring(0, 100) };
      } else {
        console.log(`  FAILED: ${langCode} - ${response.status} or empty/error`);
        return { langCode, success: false };
      }
    } catch (error) {
      console.log(`  ERROR: ${langCode} - ${error.message}`);
      return { langCode, success: false, error: error.message };
    }
  };

  // Test all languages
  Promise.all(commonLangs.map(lang => testLang(lang)))
    .then(results => {
      console.log('\n[Results Summary]');
      const successful = results.filter(r => r.success);
      console.log('Successful languages:', successful.map(r => r.langCode));

      if (successful.length > 0) {
        console.log('\nFirst successful result:');
        console.log(successful[0]);
      } else {
        console.log('No captions found with common language codes');
      }
    });

  // Method 3: Try to get track list from a special API endpoint
  console.log('\n[Method 3: Try YouTube track list API]');

  // YouTube has an internal API that returns available tracks
  // Format: https://www.youtube.com/api/timedtext?type=list&v={VIDEO_ID}
  const trackListUrl = `https://www.youtube.com/api/timedtext?type=list&v=${urlVideoId}`;

  fetch(trackListUrl)
    .then(response => response.text())
    .then(xml => {
      console.log('Track list API response length:', xml.length);

      if (xml.length > 0) {
        console.log('Track list XML preview:', xml.substring(0, 500));

        // Parse XML to extract language codes
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'text/xml');
        const tracks = xmlDoc.getElementsByTagName('track');

        console.log('Number of tracks found:', tracks.length);

        const trackList = [];
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          trackList.push({
            langCode: track.getAttribute('lang_code'),
            langOriginal: track.getAttribute('lang_original'),
            langTranslated: track.getAttribute('lang_translated'),
            langDefault: track.getAttribute('lang_default'),
            kind: track.getAttribute('kind'),
            name: track.getAttribute('name')
          });
        }

        console.log('Parsed tracks:', trackList);

        if (trackList.length > 0) {
          console.log('\nSUCCESS: Found track list!');
          console.log('First track langCode:', trackList[0].langCode);

          // Try to fetch first track
          const firstLang = trackList[0].langCode;
          const captionUrl = `https://www.youtube.com/api/timedtext?v=${urlVideoId}&lang=${firstLang}`;
          console.log('\nFetching first track:', captionUrl);

          return fetch(captionUrl)
            .then(res => res.text())
            .then(captionText => {
              console.log('Caption fetch result:', captionText.length, 'bytes');
              console.log('Caption preview:', captionText.substring(0, 200));
            });
        }
      } else {
        console.log('Track list API returned empty response');
      }
    })
    .catch(error => {
      console.error('Track list API error:', error.message);
    });

  // Method 4: Check if there's a way to get tracks from player API
  console.log('\n[Method 4: Player API getOption tracklist]');

  const player = document.getElementById('movie_player');
  if (player) {
    try {
      // Try to load captions module
      if (typeof player.loadModule === 'function') {
        player.loadModule('captions');
        player.loadModule('cc');
      }

      // Try to get options
      if (typeof player.getOptions === 'function') {
        const options = player.getOptions();
        console.log('Player options:', options);

        // Try both captions and cc modules
        ['captions', 'cc'].forEach(module => {
          if (options && options.includes(module)) {
            try {
              const tracklist = player.getOption(module, 'tracklist');
              console.log(`${module} tracklist:`, tracklist);

              if (tracklist && tracklist.length > 0) {
                console.log('SUCCESS: Found tracks via player API');
                console.log('Tracks:', tracklist.map(t => ({
                  languageCode: t.languageCode,
                  languageName: t.languageName,
                  kind: t.kind
                })));
              }
            } catch (e) {
              console.log(`Failed to get ${module} tracklist:`, e.message);
            }
          }
        });
      }
    } catch (error) {
      console.error('Player API error:', error.message);
    }
  }

  console.log('\n========================================');
})();
