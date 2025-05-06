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

## Phase 4: Bug Fixing & Refinements

11. **Fix: Side Panel Opening Permission Denied:**
    *   **Problem:** Clicking the settings button resulted in a console error: "`sidePanel.open()` may only be called in response to a user gesture."
    *   **Cause:** The `chrome.runtime.sendMessage({ action: 'openSidePanel' })` call happened *after* an `await fetchAndProcessTracksInfo()` in the button's click handler. The `await` broke the direct chain from the user click to the API call.
    *   **Solution:** Modified the settings button click handler in `content-script.ts` to immediately send the `openSidePanel` message, and *then* asynchronously call `fetchAndProcessTracksInfo` (using `.then().catch()`) to ensure track info is ready for the panel later.

12. **Fix: Native YouTube Buttons Disappearing:**
    *   **Problem:** After injecting the custom translation and settings buttons, the native YouTube buttons in the right control bar (`.ytp-right-controls`) disappeared.
    *   **Debugging:**
        *   Initially suspected CSS conflicts caused by adding a flex container (`customControlsPanel`) inside the native flex container.
        *   Removing the flex styles from the custom panel didn't fix it.
        *   Suspected that simply injecting an extra `div` wrapper disrupted YouTube's layout logic.
    *   **Solution:** Refactored `injectControls` in `content-script.ts` to remove the intermediate `customControlsPanel` div. Instead, the two custom buttons (`<button>`) are now directly inserted into the `.ytp-right-controls` container using `insertBefore()`, minimizing DOM structure changes.

13. **Fix: Custom Button Vertical Alignment:**
    *   **Problem:** The injected custom buttons were not vertically centered within the YouTube control bar, appearing lower than the native buttons.
    *   **Debugging:**
        *   Confirmed internal icon/border were centered within the button using absolute positioning.
        *   Tried removing `vertical-align` from the icon `<img>` - no effect.
        *   Tried removing `display: inline-flex` and `height: 100%` from the button `<button>` - still misaligned.
        *   Compared our button's structure and CSS with the native settings button. Noticed native buttons use SVG directly and rely heavily on CSS classes (`ytp-button`, `ytp-settings-button`) with minimal inline styles.
    *   **Solution:** Simplified the button's inline styles in `createControlButton`, removing `padding`, `border`, `background` etc. Crucially, **restored `display: inline-flex` and `align-items: center`** on the `<button>` element itself. This combination, along with inheriting styles from `ytp-button`, allowed the button (as a flex item) to be correctly aligned by the parent `.ytp-right-controls` container.

14. **Fix: Side Panel Source Language Not Updating on Navigation:**
    *   **Problem:** When the Side Panel was open and the user navigated to a new YouTube video (SPA navigation), the "Source Language" dropdown in the Side Panel did not update with the languages for the new video. It only updated if the panel was closed and reopened.
    *   **Cause:** The Side Panel (`sidepanel.ts`) only requested the available language tracks from the Content Script (`content-script.ts`) once when its `DOMContentLoaded` event fired. YouTube's SPA navigation doesn't re-trigger this event.
    *   **Solution:** Implemented a messaging flow to inform the Side Panel about navigation:
        *   **Content Script (`content-script.ts`):** In the `handleYoutubeNavigation` function (triggered by `yt-navigate-finish`), added a `chrome.runtime.sendMessage({ action: 'youtubeNavigationFinished' })` call to notify the background script.
        *   **Background Script (`background.ts`):** Added a listener for the `youtubeNavigationFinished` message. Upon receiving it, it broadcasts a new message `chrome.runtime.sendMessage({ action: 'youtubeNavigationOccurred', navigatedTabId: sender.tab.id })` to all extension contexts.
        *   **Side Panel Script (`sidepanel.ts`):**
            *   Added a `currentTabId` variable to store the ID of the tab it's associated with (obtained during `DOMContentLoaded`).
            *   Extracted the logic for requesting and filling the source language dropdown into an async function `requestAndFillSourceLanguages(tabId)`.
            *   Added a `chrome.runtime.onMessage.addListener` to listen for the `youtubeNavigationOccurred` message from the background script.
            *   If the `navigatedTabId` in the message matches the `currentTabId` of the side panel, it calls `requestAndFillSourceLanguages(currentTabId)` again to refresh the language list.

15. **Fix: Custom Subtitle Overlay Style Matching:**
    *   **Problem:** The custom subtitle overlay (`#yt-translator-subtitle-overlay`) did not match YouTube's native subtitle styling, particularly in width and text wrapping behavior. The native subtitle container's width adapts to the content length, while our custom overlay had a fixed width ratio.
    *   **Investigation:**
        *   Inspected YouTube's native subtitle CSS using browser dev tools, capturing the computed styles in a 1280x720 player.
        *   Key findings:
            *   Font size: 32px in 720p player (scaling proportionally with player height)
            *   Text alignment: center
            *   White space: pre-wrap (preserves line breaks)
            *   Width: Auto-adjusts based on content length
            *   Max-width: None (but effectively ~93% of player width for long content)
            *   Background: rgba(8, 8, 8, 0.75)
            *   Border radius: 8px
            *   Padding: 0px 8px
    *   **Solution Evolution:**
        *   **Attempt 1 - Fixed Ratio Width:**
            *   Initially tried using a fixed ratio width (max-width: 85%) with transform for centering
            *   Issue: Container width was always the same regardless of text length
        *   **Attempt 2 - Calculated Width:**
            *   Implemented `updateOverlayWidth()` function to calculate width based on player size
            *   Used the formula: `playerWidth * 0.53` (based on 680px/1280px ratio)
            *   Added content-length-based adjustments for short subtitles
            *   Issue: Still not truly content-based, just better approximations
        *   **Final Solution - Content-Based Width:**
            *   Implemented a two-layer structure:
                *   Outer wrapper (absolute positioned with Flexbox layout for centering)
                *   Inner subtitle container (using `display: inline-block` with `width: auto`)
            *   Set `max-width: 93%` to match YouTube's behavior
            *   Added dynamic font size calculation: `playerHeight * 0.0444`
            *   Used ResizeObserver to update both font size and container properties on player resize
            *   Result: Subtitle container now behaves like YouTube's native subtitles, with width automatically adjusting to content length

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