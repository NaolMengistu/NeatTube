/**
 * NeatTube — Picture-in-Picture Module
 *
 * Pops videos out into a floating PiP window. Press Alt+P and the
 * best candidate video detaches itself — scored by visible area,
 * with priority given to actively playing video over paused ones.
 * Press Alt+P again and it snaps back.
 *
 * We listen for the keyboard shortcut directly here in the content world rather 
 * than routing it through the background service worker. Going through the service 
 * worker caused "Receiving end does not exist" crashes whenever YouTube navigated 
 * between pages (SPA behavior) and the old content script context was torn down.
 */

/* exported PipModule */
/* global debugLog */

const PipModule = (() => {
  let _settings = null;
  let _keydownBound = false;

  /**
   * Finds the best candidate video on the page to pop into PiP.
   * Does a single pass scoring videos by their visible screen area,
   * while giving a massive priority boost to videos that are actively playing.
   * This ensures we always grab the main active player, not a paused ad or background tile.
   */
  function findTargetVideo() {
    const candidate = { video: null, score: -1 };

    document.querySelectorAll('video').forEach(v => {
      // Skip videos that haven't loaded or explicitly block PiP
      if (v.readyState === 0 || v.disablePictureInPicture) return;

      const rect = v.getBoundingClientRect();

      // Must be visible in the viewport
      if (rect.width === 0 || rect.height === 0) return;

      // Prefer videos that are actually playing over paused ones
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
   * The main PiP toggle. If PiP is already active, exit it. Otherwise, find the 
   * primary video and pop it out. We check document.pictureInPictureElement first 
   * so pressing Alt+P always does the intuitive thing regardless of state.
   */
  async function togglePip() {
    if (!_settings || !_settings.pictureInPicture) return;

    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        debugLog(_settings, 'PiP: Exited');
      } catch (err) {
        debugLog(_settings, 'PiP: Failed to exit', err.message);
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
      debugLog(_settings, 'PiP: Failed to enter', err.message);
    }
  }

  /**
   * Listens for Alt+P using a capture-phase handler so we intercept it before 
   * YouTube's own keyboard shortcuts get a chance to fire.
   */
  function handleKeydown(e) {
    if (e.altKey && (e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      togglePip();
    }
  }

  /**
   * Registers (or clears) the mediaSession 'enterpictureinpicture' handler.
   * When enabled, the browser will auto-PiP the main video when you switch tabs. 
   * This is opt-in and off by default since it changes tab-switching behavior.
   */
  function setupAutoPip(enable) {
    if (!('mediaSession' in navigator)) return;
    try {
      if (enable) {
        navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
          const video = findTargetVideo();
          if (video && !document.pictureInPictureElement) {
            video.requestPictureInPicture().catch(e => debugLog(_settings, 'Auto PiP error', e.message));
          }
        });
        debugLog(_settings, 'PiP: Auto-PiP enabled');
      } else {
        navigator.mediaSession.setActionHandler('enterpictureinpicture', null);
        debugLog(_settings, 'PiP: Auto-PiP disabled');
      }
    } catch (err) {
      // mediaSession API isn't available everywhere, silently skip
      debugLog(_settings, 'PiP: mediaSession unavailable', err.message);
    }
  }

  return {
    enable(settings) {
      try {
        _settings = settings;
        // Only attach the listener once — it survives SPA navigations fine
        if (!_keydownBound) {
          document.addEventListener('keydown', handleKeydown, true);
          _keydownBound = true;
        }
        setupAutoPip(settings.autoPip);
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
        setupAutoPip(false);
        _settings = null;
      } catch (err) {
        console.error('[NeatTube] PiP disable error:', err);
      }
    },

    onNavigate(settings) {
      // Refresh the settings reference on every navigation so the hotkey keeps working
      _settings = settings;
      if (settings.pictureInPicture) {
        this.enable(settings);
      } else {
        this.disable();
      }
    },
  };
})();