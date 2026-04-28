/**
 * NeatTube — Members-Only Content Filter
 * 
 * This module keeps your feed clean by hiding videos that are locked behind 
 * channel memberships. 
 * 
 * We use a "Double Layer" defense:
 * 1. CSS Layer: Fast, broad hiding of known badge elements and shelf containers.
 * 2. Heuristic Layer: A text-based scanner that looks for "Members only" strings 
 *    in overlays and labels, catching content that isn't properly marked in 
 *    the HTML structure.
 */

/* exported MembersFilterModule */
/* global SELECTORS, debugLog */

const MembersFilterModule = (() => {
  const STYLE_ID = 'neattube-members-styles';
  const HIDDEN_CLASS = 'neattube-members-hidden';

  /**
   * Generates dynamic CSS rules based on the user's current settings.
   */
  function buildCSS(settings) {
    const rules = [];

    // Hide the actual "Members only" badges visible on thumbnails
    if (settings.hideMembersBadges) {
      rules.push(`${SELECTORS.membersBadges} { display: none !important; }`);
    }

    // Hide entire video rows or shelves marked as membership-only
    if (settings.hideMembersShelves) {
      rules.push(`${SELECTORS.membersShelves} { display: none !important; }`);
    }

    // A generic hidden class we apply to containers caught by the heuristic scanner
    rules.push(`.${HIDDEN_CLASS} { display: none !important; }`);

    return rules.join('\n');
  }

  /**
   * Injects the filtering stylesheet into the document head.
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
    debugLog(settings, 'MembersFilter: styles injected');
  }

  /**
   * The Fallback Scanner.
   * 
   * YouTube sometimes uses non-standard text overlays instead of proper HTML 
   * badges for membership videos. This function crawls through visible video 
   * cards and checks their badges, labels, and ARIA text for "Members only" 
   * keywords. If a match is confirmed, we hide the entire container.
   */
  function scanAndHide(settings) {
    if (!settings.hideMembersShelves) return;

    // We check all potential card/shelf containers in the YouTube DOM
    const containerSelectors = [
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-shelf-renderer',
      'ytd-reel-item-renderer',
      'yt-lockup-view-model',
      'ytd-rich-grid-media',
    ];

    let hiddenCount = 0;

    containerSelectors.forEach((containerSel) => {
      document.querySelectorAll(containerSel).forEach((container) => {
        // Skip if this container is already hidden to save cycles
        if (container.classList.contains(HIDDEN_CLASS)) return;

        // First check: Does this container have a known "Members" badge element?
        const hasBadge = container.querySelector(SELECTORS.membersBadges);
        if (hasBadge) {
          container.classList.add(HIDDEN_CLASS);
          hiddenCount++;
          return;
        }

        // Second check: Heuristic text scan.
        // We look specifically at badges and overlays where "Members only" text 
        // usually hides. We don't check the *entire* container to avoid 
        // accidentally hiding a video just because a user mentioned it in a title.
        const badgeElements = container.querySelectorAll(
          'ytd-badge-supported-renderer, .badge, badge-shape, [class*="badge"], [class*="overlay-text"], [aria-label]'
        );
        for (const badge of badgeElements) {
          const text = badge.textContent || badge.getAttribute('aria-label') || '';
          const hasMatch = SELECTORS.membersTextMarkers.some(
            (marker) => text.toLowerCase().includes(marker.toLowerCase())
          );
          if (hasMatch) {
            container.classList.add(HIDDEN_CLASS);
            hiddenCount++;
            break;
          }
        }
      });
    });

    if (hiddenCount > 0) {
      debugLog(settings, `MembersFilter: heuristic scan hid ${hiddenCount} containers`);
    }
  }

  return {
    /**
     * Boot up the members filter.
     */
    enable(settings) {
      try {
        injectStyles(settings);
        scanAndHide(settings);
      } catch (err) {
        console.error('[NeatTube] MembersFilter module error:', err);
      }
    },

    /**
     * Disable the filter and restore visibility to all membership videos.
     */
    disable() {
      try {
        const style = document.getElementById(STYLE_ID);
        if (style) style.disabled = true;

        document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => {
          el.classList.remove(HIDDEN_CLASS);
        });
      } catch (err) {
        console.error('[NeatTube] MembersFilter disable error:', err);
      }
    },

    /**
     * Re-runs the filter on navigation events.
     */
    onNavigate(settings) {
      try {
        if (settings.membersOnlyFilter) {
          this.enable(settings);
        }
      } catch (err) {
        console.error('[NeatTube] MembersFilter navigate error:', err);
      }
    },
  };
})();