/**
 * NeatTube — Members-Only Filter
 *
 * Keeps your feed clean by hiding videos locked behind channel memberships.
 *
 * It uses a mix of generic CSS hiding for obvious stuff (like the official badges) 
 * and a heuristic text scanner as a backup. We keep the scanner relatively conservative 
 * so it doesn't accidentally nuke regular videos that just happen to use similar words.
 */

/* exported MembersFilterModule */
/* global SELECTORS, debugLog */

const MembersFilterModule = (() => {
  const STYLE_ID = 'neattube-members-styles';
  const HIDDEN_CLASS = 'neattube-members-hidden';

  /**
   * Build CSS rules for hiding known members-only selectors.
   */
  function buildCSS(settings) {
    const rules = [];

    if (settings.hideMembersBadges) {
      rules.push(`${SELECTORS.membersBadges} { display: none !important; }`);
    }

    if (settings.hideMembersShelves) {
      rules.push(`${SELECTORS.membersShelves} { display: none !important; }`);
    }

    // Generic hidden class for heuristic matches
    rules.push(`.${HIDDEN_CLASS} { display: none !important; }`);

    return rules.join('\n');
  }

  /**
   * Inject or update the members-only filtering stylesheet.
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
   * The fallback scanner. 
   * Sometimes YouTube uses weird, unmarked text overlays instead of proper HTML badges. 
   * This crawls through video cards looking for explicit "Members only" text 
   * and kills the whole card if it's a confirmed match.
   */
  function scanAndHide(settings) {
    if (!settings.hideMembersShelves) return;

    const containerSelectors = [
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-shelf-renderer',
      'ytd-reel-item-renderer',
    ];

    let hiddenCount = 0;

    containerSelectors.forEach((containerSel) => {
      document.querySelectorAll(containerSel).forEach((container) => {
        // Skip if already hidden
        if (container.classList.contains(HIDDEN_CLASS)) return;

        // Check for known badge selectors within this container
        const hasBadge = container.querySelector(SELECTORS.membersBadges);
        if (hasBadge) {
          container.classList.add(HIDDEN_CLASS);
          hiddenCount++;
          return;
        }

        // Heuristic: check inner text for members-only markers
        // Only check badge-like elements and overlay text, not the full container
        const badgeElements = container.querySelectorAll(
          'ytd-badge-supported-renderer, .badge, [class*="badge"], [class*="overlay-text"], [aria-label]'
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
     * Enable members-only filtering.
     * @param {Object} settings
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
     * Disable members-only filtering — disable styles and remove hidden classes.
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
     * Re-scan on navigation (called by content-main).
     * @param {Object} settings
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