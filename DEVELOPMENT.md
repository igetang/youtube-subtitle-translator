# Development Log - YouTube Subtitle Translator (Project 4.17)

This document tracks the development process, key decisions, and technical implementation details.

## Phase 1: Initial Setup & Core Functionality

1.  **Project Initialization:**
    *   Set up project structure with `manifest.json`, `package.json`, `tsconfig.json`, and `vite.config.ts`.
    *   Established Vite for building TypeScript code into JavaScript for Chrome (MV3).

2.  **Button Injection (Content Script):**
    *   Created `content/content-script.ts`.
    *   Targeted YouTube player controls (`.ytp-right-controls`).
    *   Injected two custom buttons ("Translate Toggle", "Settings") with SVG icons and tooltips using DOM manipulation (`createElement`, `insertBefore`).
    *   Added basic click listeners for visual state toggling.
    *   Configured `manifest.json` for content script injection on `youtube.com/*`.

3.  **Fetching Caption Tracks (Content Script):**
    *   **Goal:** Get available subtitle tracks for the current video.
    *   **Challenge:** Unreliable timing for accessing `window.ytInitialPlayerResponse`.
    *   **Solution:** Implemented `findInitialPlayerResponse` function to:
        *   Find `<script>` tags containing `var ytInitialPlayerResponse =`.
        *   Use regex to extract the JSON string.
        *   Parse the JSON to get `captions.playerCaptionsTracklistRenderer.captionTracks`.
    *   Stored the fetched `captionTracks` array (containing `baseUrl`, language info, etc.) in a content script variable.

4.  **Fetching Subtitle Content (Content Script):**
    *   Implemented `fetchSubtitleData(baseUrl)` using `fetch` API to download the actual subtitle XML/JSON based on the selected track's `baseUrl`.
    *   Implemented `processAndStoreSubtitles(jsonData)` to parse the downloaded data (`events` array with `tStartMs`, `dDurationMs`, `segs`) into a structured format: `Array<{ start: number; end: number; text: string }>`. Stored in `processedSubtitleEvents`.

5.  **Displaying Subtitles (Content Script):**
    *   Created `subtitleOverlayElement` (`div`) styled with CSS for positioning at the bottom-center of the player.
    *   Appended the overlay to the player container (`.html5-video-player`).
    *   **Synchronization:** Initially considered `video.ontimeupdate`, but switched to `requestAnimationFrame` for smoother updates.
    *   Implemented `updateSubtitleLoop` and `handleSubtitleUpdate`:
        *   Loop gets current video time (`video.currentTime`).
        *   Finds the matching subtitle text in `processedSubtitleEvents` based on time.
        *   Updates `subtitleOverlayElement.textContent` and visibility (`display`).
    *   Added `stopSubtitleUpdates` to clear the animation frame and hide the overlay.

## Phase 2: Settings Interface & Communication

6.  **Settings UI - Side Panel API:**
    *   **Decision:** Chose Chrome Side Panel API over player injection or popups for a balance of integration and stability.
    *   **Manifest:** Added `"sidePanel"`, `"tabs"` permissions. Removed top-level `"side_panel"` key (following site-specific example).
    *   **Background Script (`background/background.ts`):**
        *   Listens for `openSidePanel` message from Content Script (triggered by Settings button).
        *   Calls `chrome.sidePanel.open()` to show the panel.
        *   Uses `chrome.tabs.onUpdated` (checking `status === 'complete'` and `tab.url`) to dynamically enable/disable the side panel and set its path (`sidepanel/sidepanel.html`) specifically for YouTube tabs using `chrome.sidePanel.setOptions()`.
        *   Set `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
    *   **Side Panel Files:** Created `sidepanel/sidepanel.html`, `sidepanel.css`, `sidepanel/sidepanel.ts`.
    *   **HTML:** Contains `<select>` for Source/Target Language, `<input type="checkbox">` for Bilingual/Target mode.
    *   **TypeScript (`sidepanel.ts`):**
        *   Loads settings (`sourceLang`, `targetLang`, `subtitleMode`) from `chrome.storage.sync` on initialization.
        *   Updates UI elements based on loaded settings.
        *   Adds event listeners to UI elements to save changes back to `chrome.storage.sync`.

7.  **Dynamic Source Language Population:**
    *   **Goal:** Populate the "Source Language" dropdown in the Side Panel with tracks available for the *current* video.
    *   **Workflow:**
        *   Caption track fetching (using `findInitialPlayerResponse` and storing results) is triggered in the Content Script only *once* per video, on the first click of either the "Translate Toggle" or "Settings" button.
        *   Side Panel (`sidepanel.ts`) on load:
            *   Uses `chrome.tabs.query` to find the active YouTube tab ID.
            *   Sends a `requestAvailableTracks` message to that specific Content Script using `chrome.tabs.sendMessage(tabId, ...)`.
        *   Content Script (`content-script.ts`):
            *   Listens for `requestAvailableTracks`.
            *   If tracks are already fetched, sends back a simplified list (`{ languageCode, languageName }`).
            *   If not fetched yet, fetches them first, stores the full data, then sends back the simplified list.
            *   Uses the `sendResponse` callback for asynchronous reply.
        *   Side Panel receives the list and populates the "Source Language" `<select>` options.

## Phase 3: Handling SPA Navigation & Data Fetching Refinement (Completed - Core Mechanism)

8.  **Challenge: SPA Navigation:** Initial implementation using `yt-navigate-finish` event listener showed issues where cached data from the previous video might still be present or accessed immediately after navigation (due to relying on parsing `<script>` tags).

9.  **Reference Plugin Analysis (e.g., Dualsub):**
    *   **Navigation Detection:** Relies on **Polling** mechanism instead of `yt-navigate-finish`.
        *   *Main World Script:* Polls `document.getElementById('movie_player').getPlayerResponse()` every ~3 seconds and compares the returned object reference to detect video data changes.
        *   *Content Script (Isolated World):* Polls URL and player DOM elements every ~3 seconds to detect context changes.
    *   **Data Fetching:** Primarily uses `getPlayerResponse()` called from the **main world script** to get reliable player data, including `captionTracks`. This confirms the viability and likely stability of accessing the player API.
    *   **Communication:** Uses `window.postMessage` to transfer processed subtitle list data from the main world script to the isolated content script.
    *   **`kind` Handling:** Distinguishes ASR tracks by appending a suffix (`-x-ytbasr`) to the `languageCode`, rather than using a separate `kind` field.

10. **Decision & Implementation (方案 B - getPlayerResponse via Main World):** Based on the analysis and successful testing, implemented the approach combining `yt-navigate-finish` event listening with accessing the `getPlayerResponse()` API via an injected main world script.
    *   **Created `content/main-world.ts`:** This script runs in the page's main execution context.
        *   Listens for `REQUEST_CAPTION_TRACKS` messages from the content script via `window.addEventListener('message', ...)`. 
        *   Calls `document.getElementById('movie_player').getPlayerResponse()`. 
        *   Extracts `captionTracks` from the response.
        *   Sends the tracks (or error) back to the content script using `window.postMessage({ source: 'main-world', type: 'CAPTION_TRACKS_RESPONSE', ... })`.
        *   Sends a `MAIN_WORLD_READY` message upon initialization.
    *   **Updated Build Configuration:**
        *   Added `content/main-world.ts` as an entry point in `vite.config.ts`.
        *   Added the built `src/main-world.js` to `web_accessible_resources` in `manifest.json`.
    *   **Refactored `content/content-script.ts`:**
        *   Added `injectMainWorldScript()` function to inject `src/main-world.js` into the page during initialization.
        *   Added `window.addEventListener('message', ...)` to listen for responses (`CAPTION_TRACKS_RESPONSE`) and the ready signal (`MAIN_WORLD_READY`) from the main world script.
        *   Rewritten `fetchAndProcessTracksInfo()`:
            *   It now returns a `Promise`.
            *   When called, it sends the `REQUEST_CAPTION_TRACKS` message to the main world script via `window.postMessage`.
            *   Uses `resolveCaptionTracksPromise` and `rejectCaptionTracksPromise` to handle the asynchronous response or timeout.
            *   Caches the raw tracks received from the main world.
            *   Processes the raw tracks, mapping `languageCode`, `languageName`, and `kind` (preserving the original `kind` value).
            *   Sets `tracksInfoFetched` flag upon successful completion.
        *   Removed the old `findInitialPlayerResponse()` function.
        *   Updated `handleYoutubeNavigation()` to reset `postMessage` related states (`captionTracksRequestSent`, promise resolvers).

## Build & Configuration Notes

*   **Vite:** Used for building TypeScript, handling multiple entry points (background, content, sidepanel), and managing assets.
*   **Manifest V3:** Adhered to MV3 requirements (Service Worker for background, stricter permissions, etc.).
*   **Paths:** Ensured paths in `manifest.json` correctly point to the built files relative to the extension's root directory after the Vite build (e.g., `src/background.js`, `sidepanel/sidepanel.html`).
*   **(Implemented) Main World Injection:** Added `content/main-world.ts` script, configured it in Vite and Manifest for injection, enabling access to `getPlayerResponse`.

## Next Steps / ToDo

*   [x] Implement main world script injection.
*   [x] Implement communication channel (`postMessage`) between content script and main world script.
*   [x] Refactor `fetchAndProcessTracksInfo` to request data from the main world script via `postMessage`.
*   Implement actual translation logic using a translation API.
*   Refine bilingual display mode based on selected source/target languages and subtitle mode setting.
*   Implement subtitle fetching (`fetchSubtitleData`) based on the chosen track from `cachedCaptionTracks`.
*   Integrate translation results into the `subtitleOverlayElement`.
*   Add robust error handling for `postMessage` communication, `fetch` requests, and translation API calls.
*   Implement user feedback mechanisms (e.g., loading states during fetch/translation).
*   Add tests (Unit/Integration).
*   Improve UI/UX styling (Buttons, Overlay, Side Panel). 