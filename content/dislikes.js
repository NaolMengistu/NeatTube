/**
 * NeatTube — Dislike Count Restorer
 *
 * Grabs the community dislike estimate from the Return YouTube Dislike API 
 * and surgically injects it back into the dislike button.
 *
 * The tricky part: YouTube's SPA navigation and weird web components 
 * (like dislike-button-view-model) meant we had to use a MutationObserver to 
 * catch the exact millisecond the button renders. We also have to clone the like 
 * button's text node and mess with the CSS classes, otherwise YouTube's styling 
 * just hides our injected text entirely.
 */

/* exported DislikesModule */
/* global debugLog */

const DislikesModule = (() => {
  const API_BASE = 'https://returnyoutubedislikeapi.com/votes';
  const RYD_ATTR = 'data-neattube-ryd';

  let _currentVideoId = null;
  let _abortController = null;
  let _domObserver = null;
  let _cachedDislikes = null;
  let _injectionDebounceTimer = null;

  function getVideoId() {
    const watchMatch = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    const shortsMatch = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    return null;
  }

  function formatCount(num) {
    if (num === null || num === undefined) return '';
    try {
      return new Intl.NumberFormat('en', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      }).format(num);
    } catch (_e) {
      if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
      if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
      return String(num);
    }
  }

  async function fetchDislikes(videoId, settings) {
    if (_abortController) _abortController.abort();
    _abortController = new AbortController();

    try {
      debugLog(settings, `Dislikes: fetching for ${videoId}...`);
      const response = await fetch(`${API_BASE}?videoId=${videoId}`, {
        signal: _abortController.signal,
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.dislikes;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      return null;
    }
  }

  function findButtons() {
    // Primary approach: Segmented buttons in new UI
    const segments = document.querySelectorAll('ytd-segmented-like-dislike-button-renderer');
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.offsetParent) { // Must be visible
        const dislikeVM = seg.querySelector('dislike-button-view-model');
        const likeVM = seg.querySelector('like-button-view-model');

        if (dislikeVM && likeVM) {
          return {
            dislikeBtn: dislikeVM.querySelector('button'),
            likeBtn: likeVM.querySelector('button'),
            dislikeContainer: dislikeVM
          };
        }

        // Fallback for segmented without view-model
        const buttons = seg.querySelectorAll('button');
        if (buttons.length >= 2) {
          return {
            likeBtn: buttons[0],
            dislikeBtn: buttons[1],
            dislikeContainer: buttons[1]
          };
        }
      }
    }

    // Secondary fallback: Old UI actions menu
    const ariaBtns = document.querySelectorAll('#actions button[aria-label*="islike"]');
    for (let i = 0; i < ariaBtns.length; i++) {
      const btn = ariaBtns[i];
      if (btn.offsetParent) {
        // If we find exactly two buttons with 'islike' in aria-label, assume [0]=like, [1]=dislike
        const parent = btn.closest('#actions, ytd-menu-renderer');
        if (parent) {
          const allActionBtns = parent.querySelectorAll('button[aria-label*="like" i]');
          if (allActionBtns.length >= 2) {
            return {
              likeBtn: allActionBtns[0],
              dislikeBtn: allActionBtns[1],
              dislikeContainer: allActionBtns[1].parentElement
            };
          }
        }
      }
    }

    return null;
  }

  function removeDislikeCount() {
    document.querySelectorAll(`[${RYD_ATTR}]`).forEach((el) => {
      el.remove();
    });
  }

  function injectCount(dislikes, settings) {
    const buttons = findButtons();
    if (!buttons || !buttons.dislikeBtn || !buttons.likeBtn) return false;

    const { dislikeBtn, likeBtn, dislikeContainer } = buttons;
    const formatted = formatCount(dislikes);

    // Same count, same node still in place — nothing to do.
    if (dislikeBtn.getAttribute(RYD_ATTR) === formatted) {
      // If YouTube's re-render wiped our node, we still need to re-inject even if the count matches
      if (dislikeBtn.querySelector(`[${RYD_ATTR}]`)) return true;
    }

    // Remove our previous injection if one exists (handles re-renders and count updates)
    const existing = dislikeBtn.querySelector(`[${RYD_ATTR}]`);
    if (existing) existing.remove();

    // YouTube's default dislike button is icon-only. We need to switch its class
    // to the icon+label variant, otherwise there's nowhere for our text to render.
    dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-button');
    dislikeBtn.classList.add('yt-spec-button-shape-next--icon-leading');

    // YouTube uses an "is-empty" attribute to collapse button padding when there's no text.
    // Remove it so the button expands to fit our injected count.
    if (dislikeBtn.hasAttribute('is-empty')) dislikeBtn.removeAttribute('is-empty');
    if (dislikeContainer && dislikeContainer.hasAttribute('is-empty')) dislikeContainer.removeAttribute('is-empty');

    // Clone the text node structure from the like button rather than building from scratch.
    // YouTube changes its internal HTML layout frequently, so copying from the like button
    // guarantees we always get the exact same structure they're using right now.
    const likeTextNode = likeBtn.querySelector('.yt-spec-button-shape-next__button-text-content, [class*="button-text"]');

    if (likeTextNode) {
      const textNodeClone = likeTextNode.cloneNode(true);
      textNodeClone.setAttribute(RYD_ATTR, formatted);

      // If there's no existing span[role=text] in the clone, make one.
      // YouTube sometimes omits it for icon-only buttons, so we add our own.
      if (textNodeClone.querySelector("span[role='text']") === null) {
        const span = document.createElement("span");
        span.setAttribute("role", "text");
        while (textNodeClone.firstChild) {
          textNodeClone.removeChild(textNodeClone.firstChild);
        }
        textNodeClone.appendChild(span);
      }

      // Write the formatted count into the span (or the container if no span was found)
      const innerSpan = textNodeClone.querySelector("span[role='text']");
      if (innerSpan) {
        innerSpan.textContent = formatted;
      } else {
        textNodeClone.textContent = formatted;
      }

      // Append to the dislike button and stamp our attribute so we can track it later
      dislikeBtn.appendChild(textNodeClone);
      dislikeBtn.setAttribute(RYD_ATTR, formatted);
      debugLog(settings, `Dislikes: successfully injected cloned node "${formatted}"`);
      return true;
    }

    return false;
  }

  function stopObserver() {
    if (_domObserver) {
      _domObserver.disconnect();
      _domObserver = null;
    }
    if (_injectionDebounceTimer) {
      clearTimeout(_injectionDebounceTimer);
      _injectionDebounceTimer = null;
    }
  }

  function setupObserver(settings) {
    stopObserver();

    _domObserver = new MutationObserver(() => {
      if (_cachedDislikes !== null) {
        clearTimeout(_injectionDebounceTimer);
        _injectionDebounceTimer = setTimeout(() => {
          const success = injectCount(_cachedDislikes, settings);
          if (success) {
            stopObserver();
          }
        }, 150);
      }
    });

    const target = document.querySelector('ytd-app') || document.body;
    _domObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['is-empty', 'class'] });

    // Attempt immediate injection
    if (_cachedDislikes !== null) {
      setTimeout(() => {
        if (injectCount(_cachedDislikes, settings)) {
          stopObserver();
        }
      }, 150);
    }
  }

  async function startDislikeFlow(videoId, settings) {
    _cachedDislikes = null;
    stopObserver();
    removeDislikeCount();

    setupObserver(settings);

    const dislikes = await fetchDislikes(videoId, settings);

    if (dislikes !== null && videoId === _currentVideoId) {
      _cachedDislikes = dislikes;
      setTimeout(() => {
        if (injectCount(dislikes, settings)) {
          stopObserver();
        }
      }, 150);
    }
  }

  return {
    enable(settings) {
      try {
        const videoId = getVideoId();
        if (!videoId) return;

        if (videoId === _currentVideoId) {
          const btn = findButtons()?.dislikeBtn;
          // Only skip if the injection element is actually in the DOM
          if (btn && btn.querySelector(`[${RYD_ATTR}]`)) return;
        }

        _currentVideoId = videoId;
        startDislikeFlow(videoId, settings);
      } catch (err) {
        console.error('[NeatTube] Dislikes error:', err);
      }
    },

    disable() {
      stopObserver();
      _currentVideoId = null;
      _cachedDislikes = null;
      if (_abortController) _abortController.abort();
      removeDislikeCount();
    },

    onNavigate(settings) {
      stopObserver();
      _currentVideoId = null;
      _cachedDislikes = null;
      if (settings.dislikeCount) {
        this.enable(settings);
      } else {
        this.disable();
      }
    },
  };
})();