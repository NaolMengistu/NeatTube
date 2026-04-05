/**
 * NeatTube — Dislike Count Restorer
 * 
 * This module restores the community dislike count using the Return YouTube Dislike (RYD) API.
 * 
 * Technical Challenges:
 * 1. DOM Surgery: YouTube's modern UI uses "view-models" that frequently wipe or reset 
 *    button contents. We use a MutationObserver to catch these resets and re-inject.
 * 2. Visual Parity: To ensure the injected count looks native, we clone the internal 
 *    HTML structure of the existing Like button.
 * 3. Race Conditions: YouTube's SPA navigation is fast. We use AbortControllers and 
 *    Video ID tracking to ensure we don't inject stale data into the wrong video.
 * 4. Geometry: The "Ratio Bar" is mapped to the exact pixel boundaries of the Like/Dislike 
 *    pills so it remains perfectly aligned through window resizes.
 */

/* exported DislikesModule */
/* global debugLog */

const DislikesModule = (() => {
  const API_BASE = 'https://returnyoutubedislikeapi.com/votes';
  const RYD_LABEL_ATTR = 'data-neattube-ryd-label';
  const RYD_VALUE_ATTR = 'data-neattube-ryd-value';
  const BAR_ID = 'neattube-ratio-bar-container';
  const STYLE_ID = 'neattube-dislike-styles';

  // ── Internal State ───────────────────────────────────────
  let _currentVideoId = null;
  let _abortController = null;
  let _domObserver = null;
  let _cachedLikes = null;
  let _cachedDislikes = null;
  let _boundLikeBtn = null;
  let _boundDislikeBtn = null;

  // We track the user's interaction state locally so the UI 
  // responds instantly to clicks (optimistic updates).
  const STATE = { NEUTRAL: 0, LIKED: 1, DISLIKED: 2 };
  let _userState = STATE.NEUTRAL;

  // ── CSS Injection ────────────────────────────────────────

  /**
   * Injects the required CSS for the ratio bar and click animations.
   * We use !important on overflow to prevent YouTube's container clipping.
   */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ytd-segmented-like-dislike-button-renderer,
      ytd-menu-renderer.ytd-watch-metadata,
      #top-level-buttons-computed,
      .slim-video-action-bar-actions {
        overflow: visible !important;
      }

      .neattube-ratio-host {
        position: relative !important;
        overflow: visible !important;
      }

      #${BAR_ID} {
        position: absolute;
        left: 0;
        right: 0;
        bottom: -8px;
        height: 2px;
        border-radius: 999px;
        background: var(--yt-spec-icon-disabled, #909090);
        overflow: hidden;
        pointer-events: none;
        z-index: 1;
      }

      #${BAR_ID} .neattube-ratio-fill {
        height: 100%;
        width: 50%;
        border-radius: inherit;
        background: var(--yt-spec-text-primary, #fff);
        transition: width 0.18s ease-out;
        will-change: width;
      }

      /* Native-feeling pulse animations for interaction feedback */
      @keyframes neattube-dislike-pulse {
        0%   { transform: scale(1); }
        30%  { transform: scale(1.25); }
        60%  { transform: scale(0.92); }
        100% { transform: scale(1); }
      }
      @keyframes neattube-like-pulse {
        0%   { transform: scale(1); }
        30%  { transform: scale(1.25); }
        60%  { transform: scale(0.92); }
        100% { transform: scale(1); }
      }
      .neattube-dislike-animate {
        animation: neattube-dislike-pulse 0.35s ease-out;
      }
      .neattube-like-animate {
        animation: neattube-like-pulse 0.35s ease-out;
      }
    `;
    document.head.appendChild(style);
  }

  function removeStyles() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
  }

  // ── Utility Helpers ──────────────────────────────────────

  /**
   * Extracts the unique video ID from either standard watch URLs or Shorts handles.
   */
  function getVideoId() {
    const watchMatch = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    const shortsMatch = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    return null;
  }

  /**
   * Formats numbers into a clean "10.5K" or "1.2M" format.
   * Leverages Intl.NumberFormat for locale-aware short form.
   */
  function formatCount(num) {
    if (num === null || num === undefined) return '';
    if (num < 0) num = 0; // Sanity check for rapid toggling
    try {
      return new Intl.NumberFormat('en', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      }).format(num);
    } catch (_e) {
      // Manual fallback if Intl is unsupported (very old browser versions)
      if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
      if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
      return String(num);
    }
  }

  // ── Data Fetching ────────────────────────────────────────

  /**
   * Retrieves data from the RYD API.
   * We use an AbortController to cancel any in-flight requests if 
   * the user navigates to another video before we finish.
   */
  async function fetchVotes(videoId, settings) {
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
      return { likes: data.likes, dislikes: data.dislikes };
    } catch (err) {
      if (err.name === 'AbortError') return null;
      return null;
    }
  }

  // ── DOM Traversal ────────────────────────────────────────

  /**
   * Locates the Like/Dislike buttons. YouTube has multiple button variants
   * (Standard, ViewModels, Legacy Actions). This function walks through 
   * them in order of priority.
   */
  function findButtons() {
    // Priority 1: Modern Segmented Buttons (found on most current Watch pages)
    const segments = document.querySelectorAll('ytd-segmented-like-dislike-button-renderer');
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.offsetParent) { // Skip hidden/unrendered panels
        const dislikeVM = seg.querySelector('dislike-button-view-model');
        const likeVM = seg.querySelector('like-button-view-model');

        if (dislikeVM && likeVM) {
          return {
            dislikeBtn: dislikeVM.querySelector('button'),
            likeBtn: likeVM.querySelector('button'),
            dislikeContainer: dislikeVM,
            segmentContainer: seg,
          };
        }

        // Fallback for segmented layouts that don't use VM wrappers
        const buttons = seg.querySelectorAll('button');
        if (buttons.length >= 2) {
          return {
            likeBtn: buttons[0],
            dislikeBtn: buttons[1],
            dislikeContainer: buttons[1],
            segmentContainer: seg,
          };
        }
      }
    }

    // Priority 2: Legacy Actions/Menu (Mobile or old UI versions)
    const ariaBtns = document.querySelectorAll('#actions button[aria-label*="islike"]');
    for (let i = 0; i < ariaBtns.length; i++) {
      const btn = ariaBtns[i];
      if (btn.offsetParent) {
        const parent = btn.closest('#actions, ytd-menu-renderer');
        if (parent) {
          const allActionBtns = parent.querySelectorAll('button[aria-label*="like" i]');
          if (allActionBtns.length >= 2) {
            return {
              likeBtn: allActionBtns[0],
              dislikeBtn: allActionBtns[1],
              dislikeContainer: allActionBtns[1].parentElement,
              segmentContainer: parent,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Checks YouTube's internal state to see if the user has already 
   * interacted with the Like/Dislike buttons.
   */
  function detectState() {
    const buttons = findButtons();
    if (!buttons) return STATE.NEUTRAL;

    const { likeBtn, dislikeBtn } = buttons;

    // Check for ARIA attributes (most reliable)
    if (likeBtn?.getAttribute('aria-pressed') === 'true') return STATE.LIKED;
    if (dislikeBtn?.getAttribute('aria-pressed') === 'true') return STATE.DISLIKED;

    // Last-ditch check for CSS active classes
    if (likeBtn?.classList.contains('style-default-active')) return STATE.LIKED;
    if (dislikeBtn?.classList.contains('style-default-active')) return STATE.DISLIKED;

    return STATE.NEUTRAL;
  }

  // ── DOM Injection ────────────────────────────────────────

  function removeDislikeCount() {
    document.querySelectorAll(`[${RYD_LABEL_ATTR}]`).forEach((el) => {
      el.remove();
    });
    const buttons = findButtons();
    if (buttons?.dislikeBtn) {
      buttons.dislikeBtn.removeAttribute(RYD_VALUE_ATTR);
      buttons.dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-leading');
      buttons.dislikeBtn.classList.add('yt-spec-button-shape-next--icon-button');
    }
  }

  /**
   * Surgical injection of the dislike count.
   * 1. Swaps the button's class to the 'leading-icon' variant to allow text rendering.
   * 2. Clones the precisely formatted internal structure of the Like button.
   * 3. Syncs the text content.
   */
  function injectCount(dislikes, settings) {
    const buttons = findButtons();
    if (!buttons || !buttons.dislikeBtn || !buttons.likeBtn) return false;

    const { dislikeBtn, likeBtn, dislikeContainer } = buttons;
    const formatted = formatCount(dislikes);

    // Skip if we've already injected this exact value properly
    if (dislikeBtn.getAttribute(RYD_VALUE_ATTR) === formatted) {
      if (dislikeBtn.querySelector(`[${RYD_LABEL_ATTR}]`)) return true;
    }

    const existing = dislikeBtn.querySelector(`[${RYD_LABEL_ATTR}]`);
    if (existing) existing.remove();

    // Transform from "icon button" (square) to "text button" (rectangle with icon)
    dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-button');
    dislikeBtn.classList.add('yt-spec-button-shape-next--icon-leading');

    // Force layouts to collapse empty flags so the button expands properly
    if (dislikeBtn.hasAttribute('is-empty')) dislikeBtn.removeAttribute('is-empty');
    if (dislikeContainer && dislikeContainer.hasAttribute('is-empty')) dislikeContainer.removeAttribute('is-empty');

    // We clone the like button's text wrapper. This ensures we inherit all of 
    // YouTube's complex typography classes and role attributes.
    const likeTextNode = likeBtn.querySelector('.yt-spec-button-shape-next__button-text-content, [class*="button-text"]');

    if (likeTextNode) {
      const textNodeClone = likeTextNode.cloneNode(true);
      textNodeClone.setAttribute(RYD_LABEL_ATTR, 'true');

      // Ensure the clone has a standard text span
      if (textNodeClone.querySelector("span[role='text']") === null) {
        const span = document.createElement('span');
        span.setAttribute('role', 'text');
        while (textNodeClone.firstChild) {
          textNodeClone.removeChild(textNodeClone.firstChild);
        }
        textNodeClone.appendChild(span);
      }

      const innerSpan = textNodeClone.querySelector("span[role='text']");
      if (innerSpan) {
        innerSpan.textContent = formatted;
      } else {
        textNodeClone.textContent = formatted;
      }

      dislikeBtn.appendChild(textNodeClone);
      dislikeBtn.setAttribute(RYD_VALUE_ATTR, formatted);
      debugLog(settings, `Dislikes: injected "${formatted}"`);
      return true;
    }

    return false;
  }

  // ── Ratio Bar Geometry ───────────────────────────────────

  function removeRatioBar() {
    document.querySelectorAll(`#${BAR_ID}`).forEach((bar) => bar.remove());
    document.querySelectorAll('.neattube-ratio-host').forEach((el) => {
      el.classList.remove('neattube-ratio-host');
    });
  }

  /**
   * Locates the optimal parent element to host our ratio bar.
   * We look for the tight internal wrapper that moves with the buttons.
   */
  function ensureRatioBarHost(buttons) {
    let host = buttons?.segmentContainer;
    if (!host) return null;

    const innerWrapper = host.querySelector('#segmented-buttons-wrapper') || host.querySelector('yt-smartimation');
    if (innerWrapper) {
      host = innerWrapper;
    }
    else if (host.matches('ytd-menu-renderer') || host.id === 'actions') {
      host = host.querySelector('#top-level-buttons-computed, .slim-video-action-bar-actions') || host;
    }

    host.classList.add('neattube-ratio-host');
    return host;
  }

  function ensureRatioBar(host) {
    let container = host.querySelector(`#${BAR_ID}`);
    if (container) return container;

    container = document.createElement('div');
    container.id = BAR_ID;

    const fill = document.createElement('div');
    fill.className = 'neattube-ratio-fill';
    container.appendChild(fill);

    host.appendChild(container);
    return container;
  }

  /**
   * Measures and aligns the ratio bar.
   * Strategy: We measure the absolute pixel boundaries of the Like and Dislike 
   * pills, then map those coordinates onto our relative host. This ensures 
   * the bar perfectly spans the visual gap between the two pills.
   */
  function renderRatioBar(likes, dislikes) {
    const buttons = findButtons();
    if (!buttons?.segmentContainer) return;

    const host = ensureRatioBarHost(buttons);
    if (!host) return;

    const total = (likes || 0) + (dislikes || 0);
    const percent = total > 0 ? (likes / total) * 100 : 50;

    const container = ensureRatioBar(host);

    // Map visual bounds to relative CSS positioning
    const likeEl = buttons.segmentContainer.querySelector('like-button-view-model') || buttons.likeBtn.closest('button') || buttons.likeBtn;
    const dislikeEl = buttons.segmentContainer.querySelector('dislike-button-view-model') || buttons.dislikeBtn.closest('button') || buttons.dislikeBtn;

    const likeRect = likeEl.getBoundingClientRect();
    const dislikeRect = dislikeEl.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();

    if (likeRect.width > 0 && dislikeRect.width > 0 && hostRect.width > 0) {
      const exactWidth = dislikeRect.right - likeRect.left;
      const exactLeft = likeRect.left - hostRect.left;

      container.style.width = exactWidth + 'px';
      container.style.left = exactLeft + 'px';
      container.style.right = 'auto';
    }

    const fill = container.querySelector('.neattube-ratio-fill');
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  }

  // ── Interaction Logic ────────────────────────────────────

  function playAnimation(button, type) {
    if (!button) return;
    const cls = type === 'dislike' ? 'neattube-dislike-animate' : 'neattube-like-animate';
    const icon = button.querySelector('yt-icon, .yt-spec-button-shape-next__icon') || button;
    icon.classList.remove(cls);
    void icon.offsetWidth; // Force reflow
    icon.classList.add(cls);
    icon.addEventListener('animationend', () => icon.classList.remove(cls), { once: true });
  }

  /**
   * Optimistic update: When the user clicks Dislike, we calculate the 
   * new counts instantly based on the current state, rather than 
   * waiting for a fresh API call.
   */
  function onDislikeClicked(settings) {
    if (_cachedDislikes === null || _cachedLikes === null) return;

    const prevState = _userState;
    _userState = detectState();

    if (_userState === STATE.DISLIKED && prevState !== STATE.DISLIKED) {
      _cachedDislikes++;
      if (prevState === STATE.LIKED) _cachedLikes--;
      playAnimation(findButtons()?.dislikeBtn, 'dislike');
    }
    else if (_userState === STATE.NEUTRAL && prevState === STATE.DISLIKED) {
      _cachedDislikes--;
    }

    updateDOM(settings);
  }

  function onLikeClicked(settings) {
    if (_cachedDislikes === null || _cachedLikes === null) return;

    const prevState = _userState;
    _userState = detectState();

    if (_userState === STATE.LIKED && prevState !== STATE.LIKED) {
      _cachedLikes++;
      if (prevState === STATE.DISLIKED) _cachedDislikes--;
      playAnimation(findButtons()?.likeBtn, 'like');
    } else if (_userState === STATE.NEUTRAL && prevState === STATE.LIKED) {
      _cachedLikes--;
    }

    updateDOM(settings);
  }

  function updateDOM(settings) {
    injectCount(_cachedDislikes, settings);
    renderRatioBar(_cachedLikes, _cachedDislikes);
  }

  /**
   * Timing helper. We wait through two animation frames to ensure 
   * YouTube's internal state updates (like aria-pressed) finish before 
   * we try to read them.
   */
  function afterYoutubeSettles(fn) {
    requestAnimationFrame(() => {
      requestAnimationFrame(fn);
    });
  }

  function bindClickListeners(settings) {
    const buttons = findButtons();
    if (!buttons || !buttons.likeBtn || !buttons.dislikeBtn) return;

    const { likeBtn, dislikeBtn } = buttons;

    if (_boundLikeBtn === likeBtn && _boundDislikeBtn === dislikeBtn) return;

    unbindClickListeners();

    dislikeBtn._neattubeDislike = () => afterYoutubeSettles(() => onDislikeClicked(settings));
    likeBtn._neattubeLike = () => afterYoutubeSettles(() => onLikeClicked(settings));

    dislikeBtn.addEventListener('click', dislikeBtn._neattubeDislike);
    likeBtn.addEventListener('click', likeBtn._neattubeLike);

    _boundLikeBtn = likeBtn;
    _boundDislikeBtn = dislikeBtn;
    debugLog(settings, 'Dislikes: click listeners bound');
  }

  function unbindClickListeners() {
    if (_boundDislikeBtn?._neattubeDislike) {
      _boundDislikeBtn.removeEventListener('click', _boundDislikeBtn._neattubeDislike);
      delete _boundDislikeBtn._neattubeDislike;
    }
    if (_boundLikeBtn?._neattubeLike) {
      _boundLikeBtn.removeEventListener('click', _boundLikeBtn._neattubeLike);
      delete _boundLikeBtn._neattubeLike;
    }

    _boundLikeBtn = null;
    _boundDislikeBtn = null;
  }

  // ── DOM Observer (The Safety Net) ─────────────────────────

  let _pendingInjectionFrame = 0;

  function stopObserver() {
    if (_domObserver) {
      _domObserver.disconnect();
      _domObserver = null;
    }
    cancelAnimationFrame(_pendingInjectionFrame);
  }

  /**
   * Debounced re-injection. We use requestAnimationFrame to ensure 
   * we don't hammer the DOM during rapid changes.
   */
  function scheduleInjection(settings) {
    cancelAnimationFrame(_pendingInjectionFrame);

    _pendingInjectionFrame = requestAnimationFrame(() => {
      if (_cachedDislikes === null) return;

      if (injectCount(_cachedDislikes, settings)) {
        renderRatioBar(_cachedLikes, _cachedDislikes);
        bindClickListeners(settings);
        stopObserver(); // Success - we can stop watching until the next navigation
      }
    });
  }

  function setupObserverForInjection(settings) {
    stopObserver();

    _domObserver = new MutationObserver(() => {
      scheduleInjection(settings);
    });

    const target = document.querySelector('ytd-app') || document.body;
    _domObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['is-empty', 'class'] });
  }

  // ── Orchestration ────────────────────────────────────────

  async function startDislikeFlow(videoId, settings) {
    // Reset local state for the new video
    _cachedLikes = null;
    _cachedDislikes = null;
    _userState = STATE.NEUTRAL;
    stopObserver();
    unbindClickListeners();
    removeDislikeCount();
    removeRatioBar();
    injectStyles();

    const votes = await fetchVotes(videoId, settings);
    if (votes === null || videoId !== _currentVideoId) return;

    _cachedLikes = votes.likes;
    _cachedDislikes = votes.dislikes;
    _userState = detectState();

    // Fast injection: Try to hit the DOM immediately
    if (injectCount(_cachedDislikes, settings)) {
      renderRatioBar(_cachedLikes, _cachedDislikes);
      bindClickListeners(settings);
      return;
    }

    // Long-tail strategy: If the button isn't ready yet, start the observer
    setupObserverForInjection(settings);
  }

  // ── Public Interface ──────────────────────────────────────

  return {
    enable(settings) {
      try {
        const videoId = getVideoId();
        if (!videoId) return;

        // Skip if we're already locked into this video and everything is rendered
        if (videoId === _currentVideoId) {
          const buttons = findButtons();
          const btn = buttons?.dislikeBtn;

          const hasValue = !!btn?.getAttribute(RYD_VALUE_ATTR);
          const hasLabel = !!btn?.querySelector(`[${RYD_LABEL_ATTR}]`);
          const hasBar = !!document.getElementById(BAR_ID);
          const listenersLive = _boundLikeBtn === buttons?.likeBtn && _boundDislikeBtn === buttons?.dislikeBtn;

          if (hasValue && hasLabel && hasBar && listenersLive) return;
        }

        _currentVideoId = videoId;
        startDislikeFlow(videoId, settings);
      } catch (err) {
        console.error('[NeatTube] Dislikes error:', err);
      }
    },

    disable() {
      stopObserver();
      unbindClickListeners();
      _currentVideoId = null;
      _cachedLikes = null;
      _cachedDislikes = null;
      _userState = STATE.NEUTRAL;
      if (_abortController) _abortController.abort();
      removeDislikeCount();
      removeRatioBar();
      removeStyles();
    },

    onNavigate(settings) {
      stopObserver();
      unbindClickListeners();
      _currentVideoId = null;
      _cachedLikes = null;
      _cachedDislikes = null;
      _userState = STATE.NEUTRAL;
      if (settings.dislikeCount) {
        this.enable(settings);
      } else {
        this.disable();
      }
    },
  };
})();