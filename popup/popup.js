/**
 * NeatTube — Quick-Toggle Popup Logic
 * 
 * This script powers the "Quick Actions" menu. It allows users to flip 
 * the most common switches without leaving their current YouTube tab. 
 * 
 * It synchronizes 1:1 with Chrome's synced storage, ensuring that 
 * changes made here are immediately reflected in the main options page 
 * and across all active YouTube tabs.
 */

/**
 * Baseline configuration. 
 * IMPORTANT: These must match the keys in C:\Users\Legion\Documents\GitHub\NeatTube\content\settings.js
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
  theme: 'system',
};

/**
 * The specific subset of toggles exposed in the popup. 
 * We use a loop-based approach to bind these to their storage counterparts.
 */
const TOGGLE_IDS = [
  'extensionEnabled',
  'shortsRemoval',
  'membersOnlyFilter',
  'pictureInPicture',
  'dislikeCount',
  'autoQuality',
];

/**
 * Initialization Sequence
 */
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();

  // Hydrate the UI with current saved state
  applyToUI(settings);

  // Connect listeners for user interactions
  bindEvents();
});

/**
 * Promise-based wrapper for fetching user configuration.
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, resolve);
  });
}

/**
 * applyTheme — mirrors the selected theme onto <html> so CSS variables
 * automatically pull the right colour palette.
 * @param {'dark'|'light'|'system'} theme
 */
function applyTheme(theme) {
  const valid = ['dark', 'light', 'system'];
  document.documentElement.setAttribute(
    'data-theme',
    valid.includes(theme) ? theme : 'system'
  );
}

/**
 * UI Hydration logic. 
 * Sets checkboxes, dropdowns, and theme-attributes based on the 
 * current snapshot of the configuration.
 */
function applyToUI(settings) {
  // Set the theme first to avoid visual flickering
  applyTheme(settings.theme || DEFAULTS.theme);

  // Flip the specific toggle switches
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!settings[id];
  });

  // Set the resolution dropdown value
  const selectEl = document.getElementById('preferredQuality');
  if (selectEl && settings.preferredQuality) {
    selectEl.value = settings.preferredQuality;
  }

  // Update the visual enabled/disabled state of the feature list
  updateDisabledState(settings.extensionEnabled);
}

/**
 * Master Switch Feedback
 * If the extension is turned off globally, we "dim" the entire 
 * feature section to clearly signal it's inactive.
 */
function updateDisabledState(enabled) {
  const section = document.getElementById('features-section');
  if (section) {
    section.classList.toggle('disabled', !enabled);
  }
}

/**
 * Interaction Event Binding
 */
function bindEvents() {
  // Handle Toggle Switch clicks
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const update = { [id]: el.checked };
      chrome.storage.sync.set(update);

      // Special case: Master Switch affects UI dimming instantly
      if (id === 'extensionEnabled') {
        updateDisabledState(el.checked);
      }
    });
  });

  // Handle Quality Dropdown changes
  const selectEl = document.getElementById('preferredQuality');
  if (selectEl) {
    selectEl.addEventListener('change', () => {
      chrome.storage.sync.set({ preferredQuality: selectEl.value });
    });
  }

  // Handle the "Full Settings" deep-link
  const optionsLink = document.getElementById('open-options');
  if (optionsLink) {
    optionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
      window.close(); // Close popup after opening options
    });
  }
}

/**
 * Cross-Context Synchronization
 * If settings change (e.g., from an open Options tab), we refresh 
 * the popup UI in real-time.
 */
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync') return;
  loadSettings().then(applyToUI);
});