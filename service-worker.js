/**
 * NeatTube — Background Service Worker
 *
 * This runs silently in the background. In Manifest V3, service workers 
 * sleep most of the time. Its one main job is to initialize default settings
 * the first time the extension is installed, so nothing is ever undefined.
 */

const DEFAULTS = {
  extensionEnabled: true,
  shortsRemoval: true,
  hideShortsInSidebar: true,
  hideShortsInShelves: true,
  redirectShorts: false,
  pictureInPicture: true,
  autoPip: false,
  membersOnlyFilter: true,
  hideMembersBadges: true,
  hideMembersShelves: true,
  dislikeCount: true,
  autoQuality: true,
  preferredQuality: '1080p',
  reapplyQuality: true,
  debugMode: false,
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULTS);
  }
});

// Allow other parts of the extension to open the options page.
// The popup uses this since it can't call openOptionsPage() directly from there.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});