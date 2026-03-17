/**
 * NeatTube — Shared Settings Manager
 *
 * A simple wrapper around Chrome's storage API. 
 * This gives all our modules an easy way to read user preferences, 
 * save new ones, and react instantly when the user flips a toggle in the popup.
 */

/* exported NeatTubeSettings, debugLog, DEFAULTS */

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
  // Reads all settings from Chrome sync storage. Any keys missing from storage 
  // get filled in with values from DEFAULTS, so new settings always have a safe fallback.
  load() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (items) => {
        resolve(items);
      });
    });
  },

  // Write a chunk of settings back to Chrome sync. You only need to pass in
  // the keys you're changing — everything else is left alone.
  save(partial) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(partial, resolve);
    });
  },

  // Attach a listener that fires whenever the user saves something from the
  // popup or full settings page. We reload the full settings object before 
  // calling back so the caller always gets a fresh, complete settings snapshot.
  onChange(callback) {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area !== 'sync') return;
      NeatTubeSettings.load().then(callback);
    });
  },
};

/**
 * A handy debug logger.
 * Only spits out logs if the user actually turned on Debug Mode in the options.
 * Helps figure out what went wrong without cluttering the console normally.
 */
function debugLog(settings, ...args) {
  if (settings && settings.debugMode) {
    console.debug('[NeatTube]', ...args);
  }
}