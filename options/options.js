/**
 * NeatTube — Options Page Logic
 * 
 * This script orchestrates the full Settings UI. It manages:
 * - Persisting user preferences to Chrome's synced storage.
 * - Dynamic theme cycling (Dark, Light, System).
 * - UI state management (dimming sub-options when parent features are off).
 * - Universal "Reset to Defaults" functionality.
 */

/**
 * The baseline state for a fresh install. 
 * These keys must match the ones defined in DEFAULTS inside settings.js.
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

// Selection order for the theme cycling button
const THEME_ORDER = ['system', 'light', 'dark'];

/**
 * SVG icons for the theme switcher. 
 * We use stroke="currentColor" so they automatically adapt to the text colors 
 * defined in our CSS variables.
 */
const THEME_ICONS = {
  system: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`,
  light: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  dark: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
};

/**
 * Automated Mapping
 * These IDs correspond exactly to IDs in options.html and keys in storage. 
 * This allows us to loop-bind all events without manual boilerplate.
 */
const TOGGLE_IDS = [
  'extensionEnabled',
  'shortsRemoval',
  'hideShortsInSidebar',
  'hideShortsInShelves',
  'redirectShorts',
  'membersOnlyFilter',
  'hideMembersBadges',
  'hideMembersShelves',
  'pictureInPicture',
  'autoPip',
  'dislikeCount',
  'autoQuality',
  'reapplyQuality',
  'debugMode',
];

const SELECT_IDS = ['preferredQuality'];

/**
 * Parent-Child Visual Hierarchy
 * Maps master features to their card containers. When a master toggle 
 * is flipped off, we dim the nested sub-options in that card.
 */
const PARENT_CHILD_MAP = {
  shortsRemoval: 'shorts-card',
  membersOnlyFilter: 'members-card',
  pictureInPicture: 'pip-card',
  autoQuality: 'quality-card',
};

/**
 * Entry Point
 */
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();

  // Hydrate the form, apply themes, and set up listeners
  applyToUI(settings);
  applyTheme(settings.theme);
  bindEvents();

  // Initialize the dynamic footer year
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }
});

/**
 * Fetch the current configuration snapshot from Chrome storage.
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, resolve);
  });
}

/**
 * Synchronizes the HTML elements with the state found in storage.
 */
function applyToUI(settings) {
  // Update all binary checkboxes
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!settings[id];

  });

  // Update dropdown menus
  SELECT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = settings[id] || DEFAULTS[id];
  });

  // Ensure the theme icon/attribute matches the setting
  applyTheme(settings.theme || DEFAULTS.theme);

  // Re-calculate which sections should be dimmed
  updateDisabledStates(settings);
}

/**
 * applyTheme — sets the data-theme attribute on <html> and updates
 * the icon in the header cycle button.
 * @param {'dark'|'light'|'system'} theme
 */
function applyTheme(theme) {
  const resolved = THEME_ORDER.includes(theme) ? theme : 'system';

  // CSS triggers theme changes based on this attribute
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
 * Manages the "Grayed Out" state of the UI.
 * - If the Extension is disabled globally, everything fades.
 * - Otherwise, individual sub-option panels fade if their main feature is off.
 */
function updateDisabledStates(settings) {
  const allCards = document.querySelectorAll('.card');

  // Handle Master Toggle (Extension Level)
  if (!settings.extensionEnabled) {
    allCards.forEach((card, index) => {
      // Index 0 is the Master Card itself; we don't disable that!
      if (index > 0) card.classList.add('disabled');
    });
    return;
  }

  // Restore interaction to all cards
  allCards.forEach((card) => card.classList.remove('disabled'));

  // Handle Feature-Level Dimming (Sub-Options)
  Object.entries(PARENT_CHILD_MAP).forEach(([parentKey, cardId]) => {
    const card = document.getElementById(cardId);
    if (!card) return;
    const subOptions = card.querySelector('.sub-options');
    if (subOptions) {
      // We use opacity + pointer-events for a smooth but functional disabled state
      subOptions.style.opacity = settings[parentKey] ? '1' : '0.4';
      subOptions.style.pointerEvents = settings[parentKey] ? 'auto' : 'none';
    }
  });
}

/**
 * Connects DOM interactions to Chrome Storage.
 */
function bindEvents() {
  // Listen for Toggle switches
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const update = { [id]: el.checked };
      chrome.storage.sync.set(update, () => {
        showSaveStatus();
        // Update UI visibility immediately after state change
        loadSettings().then(updateDisabledStates);
      });
    });
  });

  // Listen for Dropdown changes
  SELECT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      chrome.storage.sync.set({ [id]: el.value }, showSaveStatus);
    });
  });

  // Core Theme Cycling Logic
  const themeBtn = document.getElementById('theme-cycle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', async () => {
      const settings = await loadSettings();
      const currentTheme = settings.theme || 'system';
      const currentIndex = THEME_ORDER.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
      const nextTheme = THEME_ORDER[nextIndex];

      applyTheme(nextTheme);
      chrome.storage.sync.set({ theme: nextTheme }, showSaveStatus);
    });
  }

  // Factory Reset Logic
  const resetBtn = document.getElementById('reset-defaults');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to revert all settings to factory defaults?')) {
        chrome.storage.sync.set(DEFAULTS, () => {
          applyToUI(DEFAULTS);
          showSaveStatus('Defaults restored');
        });
      }
    });
  }
}

/**
 * Visual confirmation that settings were persisted.
 */
function showSaveStatus(message = 'Saved') {
  const status = document.getElementById('save-status');
  if (!status) return;
  status.textContent = message;
  status.classList.add('visible');
  setTimeout(() => status.classList.remove('visible'), 2000);
}

/**
 * External Synchronization
 * If settings are changed from another context (like the quick-popup), 
 * we refresh this page instantly to match.
 */
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync') return;
  loadSettings().then(applyToUI);
});