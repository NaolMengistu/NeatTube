/**
 * NeatTube — Shorts Hider & Video Redirector
 * 
 * This module is responsible for scrubbing YouTube Shorts from the interface. 
 * 
 * Why we use CSS injection instead of DOM removal:
 * YouTube is a Single Page Application (SPA). If we remove an element using 
 * JavaScript, YouTube's internal engine often re-renders it moments later. 
 * By injecting global CSS rules, we ensure that Shorts stay hidden even as 
 * YouTube dynamically updates the feed.
 */

/* exported ShortsModule */
/* global SELECTORS, debugLog */

const ShortsModule = (() => {
  const STYLE_ID = 'neattube-shorts-styles';
  let _settings = null;

  /**
   * Generates a complete CSS ruleset based on the user's specific hidden-content 
   * preferences (Sidebar, Shelves, etc.).
   */
  function buildCSS(settings) {
    const rules = [];

    // Scrub the "Shorts" button from both the expanded and mini sidebars
    if (settings.hideShortsInSidebar) {
      rules.push(`${SELECTORS.shortsSidebarEntry} { display: none !important; }`);

      // We also target the parent renderer to ensure no empty spacing is left behind
      rules.push(`
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-mini-guide-entry-renderer:has(a[title="Shorts"])
        { display: none !important; }
      `);
    }

    // Scrub Shorts buckets and shelves from the Home, Search, and Subscriptions feeds
    if (settings.hideShortsInShelves) {
      rules.push(`${SELECTORS.shortsShelves} { display: none !important; }`);
      rules.push(`${SELECTORS.shortsItems} { display: none !important; }`);
    }

    // Always hide the "Shorts" tab on individual channel pages
    rules.push(`${SELECTORS.shortsTab} { display: none !important; }`);

    return rules.join('\n');
  }

  /**
   * Injects or updates the global <style> tag in the document head.
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
    debugLog(settings, 'Shorts: CSS injection complete.');
  }

  /**
   * The Redirector.
   * 
   * If a user clicks a Shorts link from history or an external site, this 
   * function intercepts the load and "punts" them to the standard YouTube 
   * player (/watch?v=ID). This forces a consistent UI experience.
   */
  function handleRedirect(settings) {
    if (!settings.redirectShorts) return;

    const match = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const videoId = match[1];
      const newUrl = `/watch?v=${videoId}${window.location.search}`;
      debugLog(settings, `Shorts: intercepting redirect /shorts/${videoId} → ${newUrl}`);

      // .replace() is used so the user doesn't get stuck in a "back button loop"
      window.location.replace(newUrl);
    }
  }

  return {
    /**
     * Enable Shorts hiding with the given settings.
     * @param {Object} settings
     * Start the Shorts scrubbing process.
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
     * Restore Shorts visibility by disabling the injected styles.
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
     * Re-check for required redirects on every internal YouTube navigation.
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