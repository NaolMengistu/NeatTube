/**
 * NeatTube — Central Settings Manager
 * 
 * This module acts as the "Source of Truth" for the extension. It wraps 
 * Chrome's Storage API to provide all other modules with a consistent way 
 * to read and write user preferences. 
 * 
 * It ensures that even if storage is empty (like after a first install), 
 * every module receives a complete set of configuration values via the 
 * DEFAULTS fallback system.
 */

/* exported NeatTubeSettings, debugLog, DEFAULTS */

/**
 * The baseline configuration for the extension. 
 * This is the ONLY place where default values should be defined.
 */
const DEFAULTS = Object.freeze({
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
});

const NeatTubeSettings = {
  /**
   * Reads all settings from Chrome's synced storage.
   * If a setting hasn't been modified by the user yet, the value from the 
   * DEFAULTS object is used instead.
   */
  load() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (items) => {
        resolve(items);
      });
    });
  },

  /**
   * Persists a partial set of settings back to synced storage.
   * You only need to pass the keys that are actually changing.
   */
  save(partial) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(partial, resolve);
    });
  },

  /**
   * Listens for changes to settings (e.g. from the Popup or Options page).
   * When any 'sync' area setting changes, we reload the entire configuration 
   * and fire the callback with a fresh snapshot.
   */
  onChange(callback) {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area !== 'sync') return;
      NeatTubeSettings.load().then(callback);
    });
  },
};

/**
 * Global technical logger.
 * Only outputs to the console if 'Debug Mode' is manually enabled in the 
 * extension options. This keeps the user's console clean unless they are 
 * actively troubleshooting.
 */
function debugLog(settings, ...args) {
  if (settings && settings.debugMode) {
    console.debug('[NeatTube]', ...args);
  }
}