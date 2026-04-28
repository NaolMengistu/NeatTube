/**
 * NeatTube — Quality Auto-Selector
 * 
 * Forces YouTube to playback videos at the user's preferred resolution.
 */

/* exported QualityModule */
/* global debugLog */

const QualityModule = (() => {
  const SCRIPT_ID = 'neattube-quality-script';

  // Map user-friendly labels to YouTube's internal quality identifiers
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

  function prefToQuality(pref) {
    return QUALITY_MAP[pref] || 'hd1080';
  }

  function getCurrentVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v') || null;
  }

  /**
   * Hardened LocalStorage Persistence.
   * 
   * Mimics YouTube's internal data structures to "pre-set" quality and bandwidth 
   * before the player even initializes.
   */
  function setLocalStorageQuality(preferredQuality, settings) {
    try {
      if (preferredQuality === 'auto') {
        window.localStorage.removeItem('yt-player-quality');
        return;
      }

      // Modern YouTube expects the 'data' field to be a stringified JSON object
      const qualityPayload = JSON.stringify({
        quality: preferredQuality,
        previousQuality: preferredQuality,
        timestamp: Date.now()
      });

      const qualityData = {
        data: qualityPayload,
        expiration: Date.now() + (30 * 24 * 60 * 60 * 1000),
        creation: Date.now()
      };

      window.localStorage.setItem('yt-player-quality', JSON.stringify(qualityData));

      // Force high bandwidth detection to bypass pessimistic quality heuristics
      const bandwidthData = {
        data: {
          exponential: 50000000,
          linear: 50000000
        },
        expiration: Date.now() + (30 * 24 * 60 * 60 * 1000),
        creation: Date.now()
      };

      window.localStorage.setItem('yt-player-bandwidth', JSON.stringify(bandwidthData));
      debugLog(settings, `Quality: Hardened localStorage for ${preferredQuality}`);
    } catch (err) {
      debugError(settings, 'Quality: localStorage write failed', err.message);
    }
  }

  function injectQualityScript(preferredQuality, enableDebug) {
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

        // "Reapply on navigation" check
        if (videoId === _lastAppliedVideoId && !settings.reapplyQuality) return;
        _lastAppliedVideoId = videoId;

        const preferred = prefToQuality(settings.preferredQuality);

        setLocalStorageQuality(preferred, settings);
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
        _lastAppliedVideoId = null; // Clear cache to force re-application
        if (settings.autoQuality) {
          this.enable(settings);
        }
      } catch (err) {
        console.error('[NeatTube] Quality navigate error:', err);
      }
    },
  };
})();