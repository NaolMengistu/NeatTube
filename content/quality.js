/**
 * NeatTube — Quality Auto-Selector
 *
 * Forces YouTube to load videos in your preferred quality.
 *
 * We hit it from two sides:
 * 1. Sneak our preference into localStorage so YouTube picks it up natively on a fresh load.
 * 2. Inject a script right into the page's world to call the internal player API directly 
 *    (super useful for SPA navigations where the page doesn't actually reload).
 */

/* exported QualityModule */
/* global debugLog */

const QualityModule = (() => {
  const SCRIPT_ID = 'neattube-quality-script';

  const QUALITY_MAP = {
    '4320p': 'hd2160',
    '2160p': 'hd2160',
    '1440p': 'hd1440',
    '1080p': 'hd1080',
    '720p': 'hd720',
    '480p': 'large',
    '360p': 'medium',
    '240p': 'small',
    '144p': 'tiny',
    'Auto': 'auto',
  };

  const QUALITY_ORDER = [
    'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny',
  ];

  let _lastAppliedVideoId = null;
  let _retryTimer = null;

  function prefToQuality(pref) {
    return QUALITY_MAP[pref] || 'hd1080';
  }

  function getCurrentVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v') || null;
  }

  /**
   * The localStorage hack. 
   * YouTube reads 'yt-player-quality' when it boots up. By mimicking their data structure, 
   * we can trick it into using our quality right off the bat before the player even initializes.
   */
  function setLocalStorageQuality(preferredQuality, settings) {
    try {
      if (preferredQuality === 'auto') {
        window.localStorage.removeItem('yt-player-quality');
        debugLog(settings, 'Quality: removed yt-player-quality from localStorage (set to auto)');
        return;
      }

      const qualityData = {
        data: preferredQuality,
        expiration: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
        creation: Date.now()
      };

      window.localStorage.setItem('yt-player-quality', JSON.stringify(qualityData));

      // Spoof a high available bandwidth so YouTube doesn't downscale based on connection detection
      window.localStorage.setItem('yt-player-bandwidth', JSON.stringify({
        data: {
          "exponential": 50000000,
          "linear": 50000000
        },
        expiration: Date.now() + (30 * 24 * 60 * 60 * 1000),
        creation: Date.now()
      }));

      debugLog(settings, `Quality: set localStorage yt-player-quality to ${preferredQuality}`);
    } catch (err) {
      debugLog(settings, 'Quality: failed to set localStorage', err.message);
    }
  }

  /**
   * The dynamic injector.
   * Since our extension runs in an isolated world, we can't talk to the `movie_player` API directly.
   * To get around CSP blocks, we load an external file (quality-injector.js) as a script tag so it 
   * executes in the page's main world context.
   */
  function injectQualityScript(preferredQuality, enableDebug) {
    // If the extension was reloaded while this tab was still open, the runtime 
    // context becomes "invalidated". Calling chrome.runtime.getURL() on a dead 
    // context throws. We check for it here and bail silently instead of crashing.
    if (!chrome.runtime?.id) return;

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = chrome.runtime.getURL('content/quality-injector.js');
    script.dataset.preferred = preferredQuality;
    script.dataset.debug = enableDebug ? 'true' : 'false';
    script.dataset.order = JSON.stringify(QUALITY_ORDER);

    document.documentElement.appendChild(script);
  }

  return {
    enable(settings) {
      try {
        if (!window.location.pathname.startsWith('/watch')) return;

        const videoId = getCurrentVideoId();
        if (!videoId) return;

        if (videoId === _lastAppliedVideoId && !settings.reapplyQuality) return;
        _lastAppliedVideoId = videoId;

        const preferred = prefToQuality(settings.preferredQuality);

        // Step 1: stamp the preference into localStorage so fresh page loads pick it up natively
        setLocalStorageQuality(preferred, settings);

        // Step 2: inject the injector script to apply quality to whatever's already playing
        injectQualityScript(preferred, settings.debugMode);
      } catch (err) {
        console.error('[NeatTube] Quality module error:', err);
      }
    },

    disable() {
      try {
        _lastAppliedVideoId = null;
        const existing = document.getElementById(SCRIPT_ID);
        if (existing) existing.remove();
      } catch (err) {
        console.error('[NeatTube] Quality disable error:', err);
      }
    },

    onNavigate(settings) {
      try {
        _lastAppliedVideoId = null;
        if (settings.autoQuality) {
          this.enable(settings);
        }
      } catch (err) {
        console.error('[NeatTube] Quality navigate error:', err);
      }
    },
  };
})();