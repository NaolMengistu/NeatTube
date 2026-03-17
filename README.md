# NeatTube

A clean Manifest V3 Chrome/Chromium extension for YouTube that combines multiple features in one lightweight package.

## Features

### Shorts Removal
- Hides Shorts shelves on Home, Search, and Subscriptions pages
- Hides the Shorts entry in the sidebar navigation
- Optional: redirect `/shorts/{id}` URLs to regular `/watch?v={id}` player

### Members-Only Filtering
- Hides "Members only" badges, shelves, and cards from the YouTube UI
- Uses conservative heuristic matching to avoid false positives
- Does not access or reveal any restricted content

### Dislike Count
- Shows dislike counts on YouTube videos using the [Return YouTube Dislike](https://returnyoutubedislikeapi.com/) public API
- Counts may not be exact, accuracy varies significantly by video age and popularity.
- Toggle on/off from popup or settings

### Picture-in-Picture
- Instantly pop out the active video into a floating window using `Alt+P`
- Intelligently finds the main playing video, ignoring suspended or background players
- Uses native Chrome PiP functionality for maximum performance and zero overhead
- Works seamlessly across YouTube's internal SPA page loads

### Auto Quality Selection
- Automatically sets your preferred video resolution when a video loads
- Supports: 144p, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p (4K), 4320p (8K)
- **Fallback logic**: if your preferred resolution is unavailable, the nearest lower available resolution is used. If no lower resolution exists, YouTube's default is used
- Re-applies quality on SPA navigation (optional)

## Installation (Unpacked / Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `NeatTube` project folder (the one containing `manifest.json`)
6. The extension icon will appear in your toolbar
7. Navigate to [youtube.com](https://www.youtube.com) to see it in action

## Usage

- **Popup**: Click the extension icon for quick on/off toggles
- **Options**: Right-click the icon → Options, or click "Full Settings" in the popup for all configuration options
- **Settings sync**: All settings are saved to `chrome.storage.sync` and persist across browser restarts

## Permissions

This extension requests only the minimum permissions needed:

| Permission | Reason |
|---|---|
| `storage` | Save user settings via `chrome.storage.sync` |
| `*://*.youtube.com/*` (host) | Run content scripts on YouTube pages |
| `*://returnyoutubedislikeapi.com/*` (host) | Fetch dislike counts from the public API |

No `tabs`, `webNavigation`, `webRequest`, or other broad permissions are requested.

## Structure

```
NeatTube/
├── manifest.json              ← MV3 manifest
├── service-worker.js          ← Minimal background script
├── content/
│   ├── selectors.js           ← Centralized DOM selectors
│   ├── settings.js            ← Shared settings access layer
│   ├── shorts.js              ← Shorts hiding + redirect
│   ├── dislikes.js            ← Dislike count fetch + injection
│   ├── members-filter.js      ← Members-only hiding
│   ├── pip.js                 ← Picture-in-Picture & shortcut handling
│   ├── quality.js             ← Resolution preference + reapply
│   └── content-main.js        ← Entry point, SPA nav, module orchestration
├── popup/                     ← Quick-access popup UI
├── options/                   ← Full settings page
└── icons/                     ← Extension icons
```

### Design Principles

- **CSS-first hiding**: uses injected `<style>` tags instead of DOM removal for resilience against YouTube re-rendering
- **Centralized selectors**: all CSS selectors defined in `selectors.js` — single-file change when YouTube updates its DOM
- **Fault isolation**: each feature module wrapped in `try/catch` so one failure doesn't break others
- **SPA-aware**: listens for `yt-navigate-finish` and `yt-page-data-updated` events, plus `MutationObserver` fallback

## Quality Selection — Best Effort

YouTube may override your preferred quality based on:
- Available bandwidth and connection speed
- Codec availability (VP9, AV1, H.264)
- Device capabilities
- Stream availability (not all videos have all resolutions)

The extension uses YouTube's player API (`setPlaybackQualityRange`) when available. This is a best-effort approach — it works in most cases but YouTube retains ultimate control over playback quality.

## Known Limitations

1. **YouTube DOM changes**: YouTube frequently updates its interface. If selectors break, update `content/selectors.js`. The extension is designed to fail gracefully when selectors don't match.
2. **Members-only heuristics**: The members-only filter uses text and attribute matching. It may occasionally miss content with unusual markup or over-match in edge cases.
3. **Dislike counts**: Accuracy varies significantly by video age and popularity and may not be accurate.

## Design & Security Principles

- ✅ Manifest V3
- ✅ No remote code execution, no `eval`
- ✅ Minimal permissions
- ✅ No `externally_connectable`
- ✅ All code bundled locally

## Debug Mode

Enable debug mode from the Options page to see detailed logs in the browser console:
- Open DevTools (F12) → Console
- Look for messages prefixed with `[NeatTube]`
- Logs include module activation, selector matches, API responses, and quality attempts


## License

MIT — See: [LICENSE](LICENSE)

© 2026 [@NaolMengistu](https://github.com/naolmengistu) | [naol.dev](https://naol.dev)