/**
 * NeatTube — Picture-in-Picture (PiP) Module
 *
 * This module handles two distinct ways to trigger Picture-in-Picture:
 *
 * 1. Manual Toggle (Alt+P): 
 *    Triggered via a keyboard listener. Since a keypress counts as a valid 
 *    "user gesture," we can call requestPictureInPicture() directly from this 
 *    content script without the browser blocking it.
 *
 * 2. Automatic PiP (Tab Switching): 
 *    This is trickier. Modern browsers require a "Media Session" handler to 
 *    allow PiP without a direct click/keypress. Because extensions run in an 
 *    "isolated world," their navigator.mediaSession object is invisible to 
 *    the browser's native PiP logic. 
 * 
 *    To fix this, we inject 'pip-injector.js' into the page's "Main World" 
 *    (the actual YouTube JS context).
 */

/* exported PipModule */
/* global debugLog */

const PipModule = (() => {
  let _settings = null;
  let _keydownBound = false;

  const INJECTOR_ID = 'neattube-pip-injector';

  /**
   * Scans the page for the most relevant video to pop out.
   * It calculates a surface-area score and gives a massive bonus to 
   * videos that are actually playing.
   */
  function findTargetVideo() {
    const candidate = { video: null, score: -1 };

    document.querySelectorAll('video').forEach(v => {
      // Skip videos that aren't loaded or have PiP explicitly blocked by the site
      if (v.readyState === 0 || v.disablePictureInPicture) return;

      const rect = v.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Prioritize the playing video above all else
      const playingBonus = v.paused ? 0 : 100000;
      const score = (rect.width * rect.height) + playingBonus;

      if (score > candidate.score) {
        candidate.score = score;
        candidate.video = v;
      }
    });

    return candidate.video;
  }

  /**
   * The core manual toggle logic. If we're already in PiP, we close it.
   * Otherwise, we find the best video on screen and request PiP entry.
   */
  async function togglePip() {
    if (!_settings || !_settings.pictureInPicture) return;

    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        debugLog(_settings, 'PiP: Exited');
      } catch (err) {
        debugError(_settings, 'PiP: Failed to exit', err.message);
      }
      return;
    }

    const video = findTargetVideo();
    if (!video) {
      debugLog(_settings, 'PiP: No eligible video found');
      return;
    }

    try {
      await video.requestPictureInPicture();
      debugLog(_settings, 'PiP: Entered');
    } catch (err) {
      debugError(_settings, 'PiP: Failed to enter', err.message);
    }
  }

  /**
   * Listener for the Alt+P shortcut. We use the 'capture' phase (true)
   * to ensure we catch the key combination before YouTube's own 
   * internal keyboard shortcuts can interfere.
   */
  function handleKeydown(e) {
    if (e.altKey && (e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      togglePip();
    }
  }

  /**
   * Injects 'pip-injector.js' into YouTube's main JavaScript context.
   * This is necessary because the native 'enterpictureinpicture' action 
   * MUST be registered in the same JS world as the player to work for 
   * automatic tab-switch PiP.
   */
  function injectAutoPipScript(enableDebug) {
    // If the extension context is lost (e.g., after an update), bail safe
    if (!chrome.runtime?.id) return;

    const existing = document.getElementById(INJECTOR_ID);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = INJECTOR_ID;
    script.src = chrome.runtime.getURL('content/pip-injector.js');
    script.dataset.debug = enableDebug ? 'true' : 'false';

    document.documentElement.appendChild(script);
  }

  /**
   * Cleans up the injector and explicitly nulls the handler in the 
   * main world. This ensures the feature turns off immediately when 
   * toggled in settings, without requiring a page refresh.
   *
   * We can't use an inline <script> here — YouTube's CSP blocks it.
   * Instead, we fire a CustomEvent that the already-injected pip-injector.js
   * is listening for. It lives in the main world and can safely clear the
   * Media Session handler from there.
   */
  function removeAutoPipScript() {
    const existing = document.getElementById(INJECTOR_ID);
    if (existing) existing.remove();

    // Signal the main-world injector to clear its Media Session handler.
    // This is CSP-safe: no inline scripts, just a DOM event.
    document.dispatchEvent(new CustomEvent('neattube-pip-disable'));
  }

  return {
    enable(settings) {
      try {
        _settings = settings;

        // Initialize keyboard shortcut (Alt+P)
        if (!_keydownBound) {
          document.addEventListener('keydown', handleKeydown, true);
          _keydownBound = true;
        }

        // Handle the Auto-PiP state
        if (settings.autoPip) {
          injectAutoPipScript(settings.debugMode);
          debugLog(settings, 'PiP: Auto-PiP injector loaded (Media Session)');
        } else {
          removeAutoPipScript();
        }

        debugLog(settings, 'PiP: Module enabled');
      } catch (err) {
        console.error('[NeatTube] PiP module error:', err);
      }
    },

    disable() {
      try {
        if (_keydownBound) {
          document.removeEventListener('keydown', handleKeydown, true);
          _keydownBound = false;
        }
        removeAutoPipScript();
        _settings = null;
      } catch (err) {
        console.error('[NeatTube] PiP disable error:', err);
      }
    },

    /**
     * Called by content-main.js on YouTube SPA navigation events.
     */
    onNavigate(settings) {
      _settings = settings;
      if (settings.pictureInPicture) {
        this.enable(settings);
      } else {
        this.disable();
      }
    },
  };
})();