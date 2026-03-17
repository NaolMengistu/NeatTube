/**
 * NeatTube — Shorts Hider & Redirector
 *
 * Scours the page and nukes YouTube Shorts from existence. 
 * Whether it's the sidebar, homepage shelves, or search results, they're gone.
 *
 * Why CSS injection? Because YouTube's SPA (Single Page Application) approach 
 * constantly re-renders the DOM. If we just remove elements via JS, they'll pop right 
 * back up a second later. Injecting a global `<style>` tag guarantees they stay dead.
 */

/* exported ShortsModule */
/* global SELECTORS, debugLog */

const ShortsModule = (() => {
  const STYLE_ID = 'neattube-shorts-styles';
  let _settings = null;

  /**
   * Build the CSS rules string for hiding Shorts elements.
   */
  function buildCSS(settings) {
    const rules = [];

    // Hide Shorts sidebar entry
    if (settings.hideShortsInSidebar) {
      rules.push(`${SELECTORS.shortsSidebarEntry} { display: none !important; }`);
      // Also hide the parent guide entry if the link itself is targeted
      rules.push(`
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-mini-guide-entry-renderer:has(a[title="Shorts"])
        { display: none !important; }
      `);
    }

    // Hide Shorts shelves on home, search, subscriptions
    if (settings.hideShortsInShelves) {
      rules.push(`${SELECTORS.shortsShelves} { display: none !important; }`);
      rules.push(`${SELECTORS.shortsItems} { display: none !important; }`);
    }

    // Hide Shorts tab on channel pages
    rules.push(`${SELECTORS.shortsTab} { display: none !important; }`);

    return rules.join('\n');
  }

  /**
   * Slaps our custom `<style>` tag into the document head.
   */
  function injectStyles(settings) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = buildCSS(settings);
    style.disabled = false;
    debugLog(settings, 'Shorts: styles injected');
  }

  /**
   * Catches anyone accidentally clicking a Shorts link or loading one directly,
   * and punts them over to the normal YouTube video player interface instead.
   */
  function handleRedirect(settings) {
    if (!settings.redirectShorts) return;

    const match = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const videoId = match[1];
      const newUrl = `/watch?v=${videoId}${window.location.search}`;
      debugLog(settings, `Shorts: redirecting /shorts/${videoId} → ${newUrl}`);
      window.location.replace(newUrl);
    }
  }

  return {
    /**
     * Enable Shorts hiding with the given settings.
     * @param {Object} settings
     */
    enable(settings) {
      try {
        _settings = settings;
        injectStyles(settings);
        handleRedirect(settings);
      } catch (err) {
        console.error('[NeatTube] Shorts module error:', err);
      }
    },

    /**
     * Disable Shorts hiding — hides the style tag.
     */
    disable() {
      try {
        const style = document.getElementById(STYLE_ID);
        if (style) style.disabled = true;
      } catch (err) {
        console.error('[NeatTube] Shorts disable error:', err);
      }
    },

    /**
     * Re-check redirect on navigation (called by content-main).
     * @param {Object} settings
     */
    onNavigate(settings) {
      try {
        _settings = settings;
        if (settings.shortsRemoval) {
          handleRedirect(settings);
        }
      } catch (err) {
        console.error('[NeatTube] Shorts navigate error:', err);
      }
    },
  };
})();