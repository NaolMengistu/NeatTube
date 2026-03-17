/**
 * NeatTube — The Master Selectors List
 *
 * YouTube changes its CSS classes and DOM structure all the time.
 * Instead of hunting down broken selectors across 10 different files, 
 * we keep them all mapped out here. If YouTube updates its UI, we only have to fix it once.
 */

/* exported SELECTORS */
const SELECTORS = {
  // ── Shorts ───────────────────────────────────────────────
  // Sidebar "Shorts" navigation entry
  shortsSidebarEntry: 'ytd-guide-entry-renderer a[title="Shorts"], ytd-mini-guide-entry-renderer a[title="Shorts"]',

  // Shorts shelves on Home, Search, Subscriptions
  shortsShelves: [
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
  ].join(', '),

  // Individual shorts items in various layouts
  shortsItems: [
    'ytd-rich-item-renderer:has(a[href*="/shorts/"])',
    'ytd-video-renderer:has(a[href*="/shorts/"])',
    'ytd-grid-video-renderer:has(a[href*="/shorts/"])',
    'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
  ].join(', '),

  // Shorts tab/chip in channel pages
  shortsTab: 'yt-tab-shape[tab-title="Shorts"], tp-yt-paper-tab:has(.tab-title:contains("Shorts"))',

  // ── Dislike ──────────────────────────────────────────────
  // Container for like/dislike buttons (segmented button bar)
  dislikeButtonSegment: 'ytd-segmented-like-dislike-button-renderer',
  // The dislike button view model component
  dislikeViewModel: 'dislike-button-view-model',
  // The dislike button element within the view model
  dislikeButton: 'dislike-button-view-model button, ytd-segmented-like-dislike-button-renderer button[aria-label*="islike"]',
  // Text content span inside the button
  dislikeButtonText: '.yt-spec-button-shape-next__button-text-content',

  // ── Members Only ─────────────────────────────────────────
  membersBadges: [
    'ytd-badge-supported-renderer:has(.badge-style-type-members-only)',
    'ytd-badge-supported-renderer[aria-label*="Members only"]',
    'span.badge-style-type-members-only',
    '.ytd-badge-supported-renderer[aria-label*="embers"]',
  ].join(', '),

  // Shelf or card containers that hold members-only content
  membersShelves: [
    'ytd-item-section-renderer:has(ytd-badge-supported-renderer.badge-style-type-members-only)',
    'ytd-rich-item-renderer:has([aria-label*="Members only"])',
    'ytd-video-renderer:has([aria-label*="Members only"])',
    'ytd-compact-video-renderer:has([aria-label*="Members only"])',
    'ytd-grid-video-renderer:has([aria-label*="Members only"])',
    'ytd-shelf-renderer:has([aria-label*="Members only"])',
  ].join(', '),

  // Text markers for heuristic scanning
  membersTextMarkers: ['Members only', 'Members-only', 'members only'],

  // ── Quality ──────────────────────────────────────────────
  videoPlayer: '#movie_player',
  settingsButton: '.ytp-settings-button',
  qualityMenu: '.ytp-settings-menu .ytp-menuitem',

  // ── General ──────────────────────────────────────────────
  ytdApp: 'ytd-app',
};