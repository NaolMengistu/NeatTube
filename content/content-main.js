/**
 * NeatTube — Core Orchestrator
 *
 * This is the entry point for the extension. Its role is to:
 * 1. Load the user's saved preferences.
 * 2. Initialize and toggle features (Shorts, Dislikes, PiP, etc.) based on those settings.
 * 3. Keep everything in sync as the user navigates YouTube's Single Page App (SPA).
 */

/* global NeatTubeSettings, debugLog, ShortsModule, DislikesModule, MembersFilterModule, QualityModule, PipModule */

(function NeatTubeMain() {
  'use strict';

  let currentSettings = null;
  let mutationObserver = null;
  let debounceTimer = null;
  const DEBOUNCE_MS = 500;

  // ── Initialization ────────────────────────────────────────

  /**
   * Boots the extension. We grab the settings first, then wire up 
   * the modules and listeners that keep the extension alive.
   */
  async function boot() {
    try {
      currentSettings = await NeatTubeSettings.load();
      debugLog(currentSettings, 'Main: booted with settings', currentSettings);

      applyAllModules(currentSettings);
      setupNavigationListeners();
      setupMutationObserver();
      setupSettingsListener();
    } catch (err) {
      console.error('[NeatTube] Boot error:', err);
    }
  }

  // ── Module Management ────────────────────────────────────

  /**
   * Evaluates each feature module against current settings.
   * We wrap each module in a try/catch block so a single bug in 
   * one feature (like Dislikes) doesn't crash the entire extension.
   */
  function applyAllModules(settings) {
    if (!settings.extensionEnabled) {
      disableAllModules();
      return;
    }

    // Shorts Removal
    try {
      if (settings.shortsRemoval) {
        ShortsModule.enable(settings);
      } else {
        ShortsModule.disable();
      }
    } catch (err) {
      console.error('[NeatTube] Shorts apply error:', err);
    }

    // Dislike Counts
    try {
      if (settings.dislikeCount) {
        DislikesModule.enable(settings);
      } else {
        DislikesModule.disable();
      }
    } catch (err) {
      console.error('[NeatTube] Dislikes apply error:', err);
    }

    // Members Filter
    try {
      if (settings.membersOnlyFilter) {
        MembersFilterModule.enable(settings);
      } else {
        MembersFilterModule.disable();
      }
    } catch (err) {
      console.error('[NeatTube] MembersFilter apply error:', err);
    }

    // Picture-in-Picture
    try {
      if (settings.pictureInPicture) {
        PipModule.enable(settings);
      } else {
        PipModule.disable();
      }
    } catch (err) {
      console.error('[NeatTube] PiP apply error:', err);
    }

    // Video Quality
    try {
      if (settings.autoQuality) {
        QualityModule.enable(settings);
      } else {
        QualityModule.disable();
      }
    } catch (err) {
      console.error('[NeatTube] Quality apply error:', err);
    }
  }

  /**
   * The "emergency stop." Used when the user disables the 
   * extension globally via the master toggle.
   */
  function disableAllModules() {
    try { ShortsModule.disable(); } catch (e) { /* suppressed */ }
    try { DislikesModule.disable(); } catch (e) { /* suppressed */ }
    try { MembersFilterModule.disable(); } catch (e) { /* suppressed */ }
    try { PipModule.disable(); } catch (e) { /* suppressed */ }
    try { QualityModule.disable(); } catch (e) { /* suppressed */ }
    debugLog(currentSettings, 'Main: all modules disabled');
  }

  /**
   * Navigation handler for YouTube's SPA transitions.
   * Since YouTube updates the URL without a full page reload, we 
   * manually notify modules when the "page" has changed.
   */
  function onNavigate() {
    if (!currentSettings || !currentSettings.extensionEnabled) return;

    debugLog(currentSettings, 'Main: SPA navigation detected', window.location.href);

    try { ShortsModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { DislikesModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { MembersFilterModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { PipModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { QualityModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
  }

  // ── Event Listeners ──────────────────────────────────────

  /**
   * Listens for YouTube's custom internal events.
   * 'yt-navigate-finish' is the standard way to detect an SPA page change.
   */
  function setupNavigationListeners() {
    document.addEventListener('yt-navigate-finish', () => {
      debugLog(currentSettings, 'Main: yt-navigate-finish');
      onNavigate();
    });

    document.addEventListener('yt-page-data-updated', () => {
      debugLog(currentSettings, 'Main: yt-page-data-updated');
      onNavigate();
    });
  }

  /**
   * Safety net for dynamic content injections.
   * YouTube often injects items (like new video rows) as you scroll.
   * We use a debounced observer to scan the DOM for these elements 
   * without killing performance.
   */
  function setupMutationObserver() {
    if (mutationObserver) mutationObserver.disconnect();

    mutationObserver = new MutationObserver(() => {
      // We debounce the run to avoid a performance hit during rapid DOM changes
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!currentSettings || !currentSettings.extensionEnabled) return;

        // Currently, only the Members Filter needs to react to scrolling/lazy-loading
        try {
          if (currentSettings.membersOnlyFilter) {
            MembersFilterModule.enable(currentSettings);
          }
        } catch (err) {
          console.error('[NeatTube] MutationObserver members error:', err);
        }
      }, DEBOUNCE_MS);
    });

    // Subtree: true ensures we catch injections deep inside the app container
    const target = document.body || document.documentElement;
    mutationObserver.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Listens for real-time setting changes from the popup or options page.
   * This allows the UI to stay perfectly in sync without a refresh.
   */
  function setupSettingsListener() {
    NeatTubeSettings.onChange((newSettings) => {
      debugLog(newSettings, 'Main: settings changed', newSettings);
      currentSettings = newSettings;
      applyAllModules(currentSettings);
    });
  }

  // Kick everything off
  boot();
})();
