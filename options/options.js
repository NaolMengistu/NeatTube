/**
 * NeatTube — Options Page Logic
 *
 * This runs the full settings page. It handles all the toggles, the resolution picker,
 * debug mode, and the big red "Reset to Defaults" button. It also grays out sub-options 
 * when you turn off their main feature toggle so it's clear they are disabled.
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

// All the toggle element IDs on this page, in display order.
// These match chrome.storage keys 1:1 so we can auto-bind them without custom handling per-toggle.
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

// Which feature cards should dim their sub-options when their master toggle is off.
// The key is a storage setting name, the value is the DOM id of the card container.
const PARENT_CHILD_MAP = {
  shortsRemoval: 'shorts-card',
  membersOnlyFilter: 'members-card',
  pictureInPicture: 'pip-card',
  autoQuality: 'quality-card',
};

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();
  applyToUI(settings);
  bindEvents();
});

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, resolve);
  });
}

// Applies the fresh toggles/dropdowns from the UI.
function applyToUI(settings) {
  // Check every toggle based on what's in storage
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!settings[id];
  });

  // Set the value of each <select> input
  SELECT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = settings[id] || DEFAULTS[id];
  });

  updateDisabledStates(settings);
}

function updateDisabledStates(settings) {
  const allCards = document.querySelectorAll('.card');

  if (!settings.extensionEnabled) {
    // Master switch is off — gray out every card below it
    allCards.forEach((card, index) => {
      if (index > 0) card.classList.add('disabled');
    });
    return;
  }

  // Re-enable everything first, then selectively dim sub-option panels
  allCards.forEach((card) => card.classList.remove('disabled'));

  // Fade and block pointer events on sub-option panels when their parent feature is disabled
  Object.entries(PARENT_CHILD_MAP).forEach(([parentKey, cardId]) => {
    const card = document.getElementById(cardId);
    if (!card) return;
    const subOptions = card.querySelector('.sub-options');
    if (subOptions) {
      subOptions.style.opacity = settings[parentKey] ? '1' : '0.4';
      subOptions.style.pointerEvents = settings[parentKey] ? 'auto' : 'none';
    }
  });
}

function bindEvents() {
  // Toggle change handlers
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const update = { [id]: el.checked };
      chrome.storage.sync.set(update, () => {
        showSaveStatus();
        // Re-evaluate disabled states after any toggle changes
        loadSettings().then(updateDisabledStates);
      });
    });
  });

  // Select change handlers
  SELECT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      chrome.storage.sync.set({ [id]: el.value }, showSaveStatus);
    });
  });

  // Reset to defaults
  const resetBtn = document.getElementById('reset-defaults');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        chrome.storage.sync.set(DEFAULTS, () => {
          applyToUI(DEFAULTS);
          showSaveStatus('Defaults restored');
        });
      }
    });
  }
}

function showSaveStatus(message = 'Saved') {
  const status = document.getElementById('save-status');
  if (!status) return;
  status.textContent = message;
  status.classList.add('visible');
  setTimeout(() => status.classList.remove('visible'), 2000);
}

// If settings change from another context (e.g. the popup), refresh the page
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync') return;
  loadSettings().then(applyToUI);
});