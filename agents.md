# YouTube Subtitle Translator — Codex Agent Briefing

## 1. Session Checklist (read first)
- Open `PROJECT_CONTEXT.md` for the latest sprint status, blockers, and decisions.
- Run `git status` to confirm branch, staged files, and local edits.
- Optionally scan recent history with `git log --oneline -5` to anchor context.
- Verify the active YouTube tab when testing; the extension targets `*.youtube.com` pages.

## 2. Role & Interaction Norms
- You are a pragmatic Chrome-extension engineer working alongside the user; respond concisely, surface assumptions, and avoid ceremony.
- If a request is ambiguous, restate your interpretation before changing code; ask clarifying questions instead of guessing.
- Highlight risks, regressions, or coupling issues up front; propose alternatives when trade-offs appear.
- Perform a quick self-review after edits (logic, state transitions, resource cleanup) and mention any untested areas.

### Communication Protocol (必须遵守)
1. **先复述**：用“让我确认一下，你是想…”的形式总结需求，确保理解一致。
2. **再给方案**：说明可行做法、潜在风险或需要的信息，必要时列出选项等待确认。
3. **等待指示**：在用户确认之前不落地代码改动；若信息不足，先提出问题。
4. **执行后回报**：完成修改后，主动说明改动点、自检结果和尚未覆盖的测试。

## 3. Project Snapshot
- Manifest V3 Chrome extension that injects UI onto YouTube to translate and display subtitles in real time.
- Core capabilities: content-script UI controls, popup settings page, background translation pipeline, subtitle caching, and multi-provider translation support.
- Architectural direction: single Shared Message System, three-state (inactive/pending/active) runtime flag, Player API integration for language control, and aggressive logging hygiene.

## 4. Key Modules & Responsibilities
- `src/content-scripts/content-script.ts`: orchestrates YouTube page integration, manages UI renderers/state managers, relays messages, and coordinates subtitle overlays.
- `src/content-scripts/main-world.ts` (bundled as `main-world.js`): injected into the page context; uses the YouTube Player API to capture subtitle tracks, set languages (ISO 639-1), and forward results via `postMessage`.
- `src/background/service-worker.ts`: central message router; toggles translation, manages caches, enforces the pending timeout, and calls translation providers (`src/background/components/`).
- `src/shared/messages/message-bus.ts`: singleton message bus with typed routes, logging, and async response handling; all new messaging must flow through this.
- `src/shared/components/`: UI helpers (`UIRenderer`, `StateManager`, control panel) shared across content script and popup.
- `src/shared/translation/`: translation providers, batching strategy, cache coordinators.

## 5. Messaging & State Contracts
- All extension messages follow `MessageType` enums with metadata `{ messageId, sender, timestamp, data }`.
- `translateActive` uses the three-state cycle (`inactive` → `pending` → `active` or back to `inactive` on failure/timeout) and is the canonical switch for UI and background logic.
- Content script listens to: `STATE_CHANGED`, `TRIGGER_SUBTITLE_LOAD`, `TOGGLE_TRANSLATE` responses, and API control messages; service worker is the only source of truth for state mutations.
- Window `postMessage` bridge between content script and main world uses `_requestId` tokens to correlate responses; always install a timeout fallback when waiting for main-world replies.

## 6. Translation Flow (happy path)
1. User clicks the translate button (`UIRenderer` → `handleUserAction`).
2. Content script sends `TOGGLE_TRANSLATE` to the service worker with videoId + currentTime.
3. Service worker flips `translateActive` to pending, determines source/target languages, checks cache, and drives subtitle retrieval (Player API first, interceptor fallback).
4. Subtitle payload is translated (fast lane for on-screen lines, batch lane for backlog) and cached.
5. Background emits `STATE_CHANGED` + translation results back to the content script; overlay renders via `subtitleOverlay.show`.
6. Deactivation clears overlay and resets state to inactive.

## 7. Build, Test, and Debug
- `npm run build` for full production bundle; `npm run build:dev` / `npm run build:watch` for faster iteration.
- Dist output lives in `dist/`; load as an unpacked extension in Chrome via `chrome://extensions`.
- Use YouTube DevTools console for content-script logging; inspect service worker logs through the extension background page.
- Tests: Jest tooling is configured (`npm test`), but coverage is sparse—validate critical flows manually after changes.

## 8. Active Themes & Cautions
- Preserve the unified message bus—do not reintroduce multiple initialization paths or ad-hoc `chrome.runtime` listeners.
- Keep logs meaningful but restrained; avoid duplicate statements that clutter DevTools.
- Guard for SPA navigation quirks on YouTube (videoId changes, DOM not ready); reuse existing helper hooks when adding features.
- Respect cache semantics (`videoId + sourceLang + targetLang + provider`) to prevent redundant translation costs.
- When touching overlay or Player API logic, ensure graceful degradation back to the interceptor path.

## 9. Useful References
- High-level context: `PROJECT_CONTEXT.md`, `README.md`.
- Architectural deep dives: `docs/architecture/*.md` (message system, batching, timeout strategy, etc.).
- Decision log & MCP notes: `docs/` and `CONTEXT7_MCP_SETUP.md`.
- Prior agent guidance: `CLAUDE.md` (tone differs, but historical info is relevant).

## 10. Updating This Brief
- Update this file whenever architecture shifts, message contracts change, or new workflows are introduced.
- Keep sections concise; the goal is a 2-minute read that enables Codex to contribute safely and effectively each session.

## 11. Environment Customizations
- 本会话调整了`.claude/settings.local.json` 与 `.vscode/settings.json` 以适配本地工具提示，这些改动仅用于本地环境，提交代码时保持不纳入版本控制。
