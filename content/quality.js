/**
 * NeatTube — Quality Auto-Selector
 * 
 * This module forces YouTube to playback videos at your preferred resolution.
 * 
 * We use a "Two-Pronged" strategy for maximum reliability:
 * 1. Persistent Layer (localStorage): We inject your preference into YouTube's 
 *    own settings storage. This ensures the player picks the right quality 
 *    natively on the very first frame of a cold page load.
 * 2. Active Layer (Injection): We bridge into the page's main world to talk 
 *    directly to the 'movie_player' API. This is critical for SPA navigations 
 *    where the page doesn't reload, but the video changes.
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

  // Preference order for "Next Best" fallback logic
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
   * The LocalStorage Persistence Hack.
   * 
   * YouTube checks 'yt-player-quality' during its boot sequence. By mimicking 
   * their internal object structure (including timestamps and expiration), we 
   * can "pre-set" the quality before the player even starts.
   * 
   * We also spoof 'yt-player-bandwidth' to a high value. This prevents YouTube's 
   * "Auto" logic from downscaling the video based on its initial (and often 
   * pessimistic) connection test.
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
        expiration: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 day shelf-life
        creation: Date.now()
      };

      window.localStorage.setItem('yt-player-quality', JSON.stringify(qualityData));

      // Force high bandwidth detection (50Mbps linear/exponential)
      window.localStorage.setItem('yt-player-bandwidth', JSON.stringify({
        data: {
          "exponential": 50000000,
          "linear": 50000000
        },
        expiration: Date.now() + (30 * 24 * 60 * 60 * 1000),
        creation: Date.now()
      }));

      debugLog(settings, `Quality: persisted preference "${preferredQuality}" and spoofed bandwidth.`);
    } catch (err) {
      debugLog(settings, 'Quality: localStorage access failed.', err.message);
    }
  }

  /**
   * The Main-World Injector.
   * 
   * Because our extension lives in an "Isolated World," it cannot touch the 
   * 'movie_player' object directly. We get around this by creating a <script> 
   * tag that points to our 'quality-injector.js' file. 
   * 
   * This bridges the gap and allows the injector to call the internal Player 
   * API methods while bypassing Content Security Policy (CSP) restrictions.
   */
  function injectQualityScript(preferredQuality, enableDebug) {
    // Safety check: If the extension was updated/reloaded, our current 
    // runtime context is dead. We bail here to avoid throwing errors.
    if (!chrome.runtime?.id) return;

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = chrome.runtime.getURL('content/quality-injector.js');

    // Pass current configuration to the injector via data attributes
    script.dataset.preferred = preferredQuality;
    script.dataset.debug = enableDebug ? 'true' : 'false';
    script.dataset.order = JSON.stringify(QUALITY_ORDER);

    document.documentElement.appendChild(script);
  }

  return {
    /**
     * Start the quality enforcement process.
     */
    enable(settings) {
      try {
        if (!window.location.pathname.startsWith('/watch')) return;

        const videoId = getCurrentVideoId();
        if (!videoId) return;

        // Skip if we've already handled this specific video instance
        if (videoId === _lastAppliedVideoId && !settings.reapplyQuality) return;
        _lastAppliedVideoId = videoId;

        const preferred = prefToQuality(settings.preferredQuality);

        // Apply both prongs of the strategy
        setLocalStorageQuality(preferred, settings);
        injectQualityScript(preferred, settings.debugMode);
      } catch (err) {
        console.error('[NeatTube] Quality module error:', err);
      }
    },

    /**
     * Stop quality enforcement and cleanup.
     */
    disable() {
      try {
        _lastAppliedVideoId = null;
        const existing = document.getElementById(SCRIPT_ID);
        if (existing) existing.remove();
      } catch (err) {
        console.error('[NeatTube] Quality disable error:', err);
      }
    },

    /**
     * Handle transitions between videos on YouTube.
     */
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