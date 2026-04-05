/**
 * NeatTube — Central DOM Selectors
 * 
 * YouTube is a moving target. They frequently update their CSS classes and 
 * Component structure (moving from standard HTML to ViewModels). 
 * 
 * Instead of hunting for broken selectors across every individual module, 
 * we map them all here. If a feature breaks because YouTube updated their 
 * UI, this is the first (and usually only) place we need to make a fix.
 */

/* exported SELECTORS */
const SELECTORS = {
  // ── Shorts Filtering ─────────────────────────────────────

  // The "Shorts" button in the left-hand navigation sidebar (Normal and Mini)
  shortsSidebarEntry: 'ytd-guide-entry-renderer a[title="Shorts"], ytd-mini-guide-entry-renderer a[title="Shorts"]',

  // Rows and "Section" shelves dedicated exclusively to Shorts on Home/Search feeds
  shortsShelves: [
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
  ].join(', '),

  // Individual Shorts cards that appear mixed within general search results/recommendations
  shortsItems: [
    'ytd-rich-item-renderer:has(a[href*="/shorts/"])',
    'ytd-video-renderer:has(a[href*="/shorts/"])',
    'ytd-grid-video-renderer:has(a[href*="/shorts/"])',
    'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
  ].join(', '),

  // The "Shorts" tab on a Creator's channel page
  shortsTab: 'yt-tab-shape[tab-title="Shorts"], tp-yt-paper-tab:has(.tab-title:contains("Shorts"))',

  // ── Dislike Restoration ──────────────────────────────────

  // The modern segmented button bar containing both Like and Dislike
  dislikeButtonSegment: 'ytd-segmented-like-dislike-button-renderer',

  // YouTube's internal ViewModel container for the dislike button
  dislikeViewModel: 'dislike-button-view-model',

  // The actual interactive button element for Disliking
  dislikeButton: 'dislike-button-view-model button, ytd-segmented-like-dislike-button-renderer button[aria-label*="islike"]',

  // The specific span where we inject our restored dislike count
  dislikeButtonText: '.yt-spec-button-shape-next__button-text-content',

  // ── Members-Only Filtering ───────────────────────────────

  // The "Members only" badges displayed directly on video thumbnails
  membersBadges: [
    'ytd-badge-supported-renderer:has(.badge-style-type-members-only)',
    'ytd-badge-supported-renderer[aria-label*="Members only"]',
    'span.badge-style-type-members-only',
    '.ytd-badge-supported-renderer[aria-label*="embers"]',
  ].join(', '),

  // Parent containers (rows, shelves, cards) that host member-locked content
  membersShelves: [
    'ytd-item-section-renderer:has(ytd-badge-supported-renderer.badge-style-type-members-only)',
    'ytd-rich-item-renderer:has([aria-label*="Members only"])',
    'ytd-video-renderer:has([aria-label*="Members only"])',
    'ytd-compact-video-renderer:has([aria-label*="Members only"])',
    'ytd-grid-video-renderer:has([aria-label*="Members only"])',
    'ytd-shelf-renderer:has([aria-label*="Members only"])',
  ].join(', '),

  // Text strings we scan for during our heuristic fallback phase
  membersTextMarkers: ['Members only', 'Members-only', 'members only'],

  // ── Quality Selection ────────────────────────────────────

  // The main YouTube player element used for API calls
  videoPlayer: '#movie_player',

  // The gear icon/settings button in the player chrome
  settingsButton: '.ytp-settings-button',

  // Individual menu items inside the quality/settings popup
  qualityMenu: '.ytp-settings-menu .ytp-menuitem',

  // ── Core Application ─────────────────────────────────────

  // The root YouTube application element (useful for MutationObservers)
  ytdApp: 'ytd-app',
};