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

## Build & Configuration Notes

*   **Vite:** Used for building TypeScript, handling multiple entry points (background, content, sidepanel), and managing assets.
*   **Manifest V3:** Adhered to MV3 requirements (Service Worker for background, stricter permissions, etc.).
*   **Paths:** Ensured paths in `manifest.json` correctly point to the built files relative to the extension's root directory after the Vite build (e.g., `src/background.js`, `sidepanel/sidepanel.html`).

## Next Steps / ToDo

*   Implement actual translation logic using a translation API.
*   Refine bilingual display mode.
*   Add error handling for fetch requests and API calls.
*   Implement user feedback mechanisms (e.g., loading states).
*   Add tests.
*   Improve UI/UX styling. 