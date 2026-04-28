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
  hideMembersBadges: false,
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

// Selection order for the theme cycling button
const THEME_ORDER = ['system', 'light', 'dark'];

/**
 * SVG icons for the theme switcher.
 */
const THEME_ICONS = {
  system: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`,
  light: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  dark: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
};

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
  const resolved = THEME_ORDER.includes(theme) ? theme : 'system';
  document.documentElement.setAttribute('data-theme', resolved);

  // Update the UI icon and dynamic tooltip
  const iconEl = document.getElementById('header-theme-icon');
  const btnEl = document.getElementById('theme-cycle-btn');

  if (iconEl) {
    iconEl.innerHTML = THEME_ICONS[resolved];
  }

  if (btnEl) {
    // Calculate the next theme in the cycle for the tooltip
    const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(resolved) + 1) % THEME_ORDER.length];
    btnEl.title = `Current: ${resolved.charAt(0).toUpperCase() + resolved.slice(1)} (Click to switch to ${nextTheme})`;
  }
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

  // Handle Theme Cycling
  const themeBtn = document.getElementById('theme-cycle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', async () => {
      const settings = await loadSettings();
      const currentTheme = settings.theme || 'system';
      const currentIndex = THEME_ORDER.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
      const nextTheme = THEME_ORDER[nextIndex];

      applyTheme(nextTheme);
      chrome.storage.sync.set({ theme: nextTheme });
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