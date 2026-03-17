/**
 * NeatTube — Popup Menu Logic
 *
 * Powers the small menu that appears when you click the extension icon.
 * Reads your saved settings from Chrome sync storage, checks the matching
 * toggle switches, then saves any changes you make immediately.
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

// The subset of toggle IDs that live in the popup.
// These map 1:1 to storage keys, making bind/read code trivially simple.
const TOGGLE_IDS = [
  'extensionEnabled',
  'shortsRemoval',
  'membersOnlyFilter',
  'pictureInPicture',
  'dislikeCount',
  'autoQuality',
];

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();
  applyToUI(settings);
  bindEvents();
});

// Grab everything from sync storage, filling in DEFAULTS for anything not yet saved.
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, resolve);
  });
}

// Push current settings values into the popup UI checkboxes and dropdown.
function applyToUI(settings) {
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!settings[id];
  });

  const selectEl = document.getElementById('preferredQuality');
  if (selectEl && settings.preferredQuality) {
    selectEl.value = settings.preferredQuality;
  }

  updateDisabledState(settings.extensionEnabled);
}

// When the master toggle is off, visually dim every other row so it's 
// obvious the extension isn't doing anything.
function updateDisabledState(enabled) {
  const section = document.getElementById('features-section');
  if (section) {
    section.classList.toggle('disabled', !enabled);
  }
}

// Wire up every toggle and the quality dropdown to save immediately on change.
function bindEvents() {
  // Toggle change handlers
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const update = { [id]: el.checked };
      chrome.storage.sync.set(update);

      if (id === 'extensionEnabled') {
        updateDisabledState(el.checked);
      }
    });
  });

  // Quality selector handler
  const selectEl = document.getElementById('preferredQuality');
  if (selectEl) {
    selectEl.addEventListener('change', () => {
      chrome.storage.sync.set({ preferredQuality: selectEl.value });
    });
  }

  // Open full options page
  const optionsLink = document.getElementById('open-options');
  if (optionsLink) {
    optionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }
}

// Keep the popup in sync if the options page (or another popup instance) changes something.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync') return;
  loadSettings().then(applyToUI);
});