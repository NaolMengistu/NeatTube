/**
 * NeatTube — Background Service Worker
 * 
 * In Manifest V3, the service worker is ephemeral; it sleeps when idle 
 * and wakes up only to handle specific events. Its primary role is to:
 * - Initialize default configuration on the first install.
 * - Act as a centralized bridge for tasks that require background context.
 */

/**
 * Baseline configuration. 
 * These values are persisted to storage ONLY when the extension is first installed 
 * to ensure that subsequent scripts (Content Scripts & Popup) find a valid state.
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

/**
 * Installation Event Handler
 * Ensures that storage is NEVER empty upon a fresh start.
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULTS);
  }
});

/**
 * Centralized Messaging Hub
 * Listens for requests from the Popup or Content Scripts. 
 * Currently handles:
 * - 'openOptions': Redirects the user to the full extension settings page.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});