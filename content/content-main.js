/**
 * NeatTube — Main Content Script
 *
 * The brain of the operation. This script boots up when you open YouTube,
 * figures out what settings you have enabled, and turns on the right modules.
 *
 * It also listens for YouTube's custom SPA (Single Page Application) events 
 * so it knows exactly when you click a video without the page actually reloading.
 */

/* global NeatTubeSettings, debugLog, ShortsModule, DislikesModule, MembersFilterModule, QualityModule, PipModule */

(function NeatTubeMain() {
  'use strict';

  let currentSettings = null;
  let mutationObserver = null;
  let debounceTimer = null;
  const DEBOUNCE_MS = 500;

  // ── Boot sequence ────────────────────────────────────────

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

  // ── Module orchestration ─────────────────────────────────

  // Reads the current settings and kicks off every feature module.
  // Each feature runs in its own try/catch so one broken module doesn't crash the rest.
  function applyAllModules(settings) {
    if (!settings.extensionEnabled) {
      disableAllModules();
      return;
    }

    // Shorts
    try {
      if (settings.shortsRemoval) {
        ShortsModule.enable(settings);
      } else {
        ShortsModule.disable();
      }
    } catch (err) {
      console.error('[NeatTube] Shorts apply error:', err);
    }

    // Dislikes
    try {
      if (settings.dislikeCount) {
        DislikesModule.enable(settings);
      } else {
        DislikesModule.disable();
      }
    } catch (err) {
      console.error('[NeatTube] Dislikes apply error:', err);
    }

    // Members filter
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

    // Quality
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

  // Hard-off switch. Called when the master "Extension ON" toggle is turned off.
  // We try to disable every module, but swallow errors silently so one bad
  // teardown doesn't leave others running.
  function disableAllModules() {
    try { ShortsModule.disable(); } catch (e) { /* silent */ }
    try { DislikesModule.disable(); } catch (e) { /* silent */ }
    try { MembersFilterModule.disable(); } catch (e) { /* silent */ }
    try { PipModule.disable(); } catch (e) { /* silent */ }
    try { QualityModule.disable(); } catch (e) { /* silent */ }
    debugLog(currentSettings, 'Main: all modules disabled');
  }

  // YouTube fires its own "navigate" events rather than full page reloads.
  // We hook into them so each module gets a chance to re-run when the URL changes.
  function onNavigate() {
    if (!currentSettings || !currentSettings.extensionEnabled) return;

    debugLog(currentSettings, 'Main: SPA navigation detected', window.location.href);

    try { ShortsModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { DislikesModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { MembersFilterModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { PipModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
    try { QualityModule.onNavigate(currentSettings); } catch (e) { console.error('[NeatTube]', e); }
  }

  // ── Navigation listeners ─────────────────────────────────

  function setupNavigationListeners() {
    // YouTube fires these custom events on SPA navigation
    document.addEventListener('yt-navigate-finish', () => {
      debugLog(currentSettings, 'Main: yt-navigate-finish');
      onNavigate();
    });

    document.addEventListener('yt-page-data-updated', () => {
      debugLog(currentSettings, 'Main: yt-page-data-updated');
      onNavigate();
    });
  }

  // The MutationObserver is our safety net for content that gets loaded outside  
  // YouTube's navigation events — stuff like lazy-loaded video cards scrolling in.
  // We debounce it (500ms) to avoid hammering the modules on every tiny DOM change.
  function setupMutationObserver() {
    if (mutationObserver) mutationObserver.disconnect();

    mutationObserver = new MutationObserver(() => {
      // Debounce to avoid excessive re-runs
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!currentSettings || !currentSettings.extensionEnabled) return;

        // Re-run modules that need to scan for newly inserted content
        try {
          if (currentSettings.membersOnlyFilter) {
            MembersFilterModule.enable(currentSettings);
          }
        } catch (err) {
          console.error('[NeatTube] MutationObserver members error:', err);
        }
      }, DEBOUNCE_MS);
    });

    // Observe body for child additions (YouTube dynamically inserts content)
    const target = document.body || document.documentElement;
    mutationObserver.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  // ── Settings change listener ─────────────────────────────

  function setupSettingsListener() {
    NeatTubeSettings.onChange((newSettings) => {
      debugLog(newSettings, 'Main: settings changed', newSettings);
      currentSettings = newSettings;
      applyAllModules(currentSettings);
    });
  }

  // ── Start ────────────────────────────────────────────────
  boot();
})();
