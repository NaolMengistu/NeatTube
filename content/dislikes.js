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
 *
 * We also map a clean CSS ratio bar that tracks exact pixel boundaries
 * of the Like/Dislike pills to survive window resizes securely.
 */

/* exported DislikesModule */
/* global debugLog */

const DislikesModule = (() => {
  const API_BASE = 'https://returnyoutubedislikeapi.com/votes';
  const RYD_LABEL_ATTR = 'data-neattube-ryd-label';
  const RYD_VALUE_ATTR = 'data-neattube-ryd-value';
  const BAR_ID = 'neattube-ratio-bar-container';
  const STYLE_ID = 'neattube-dislike-styles';

  // ── State ─────────────────────────────────────────────────
  let _currentVideoId = null;
  let _abortController = null;
  let _domObserver = null;
  let _cachedLikes = null;
  let _cachedDislikes = null;
  let _boundLikeBtn = null;
  let _boundDislikeBtn = null;
  // User's local interaction state for the current video.
  // We track this so clicking like/dislike updates the count immediately
  // without waiting for another API round-trip.
  const STATE = { NEUTRAL: 0, LIKED: 1, DISLIKED: 2 };
  let _userState = STATE.NEUTRAL;

  // ── Styles (injected once) ────────────────────────────────

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

      /* Dislike button click animation */
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

  // ── Helpers ───────────────────────────────────────────────

  function getVideoId() {
    const watchMatch = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    const shortsMatch = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    return null;
  }

  function formatCount(num) {
    if (num === null || num === undefined) return '';
    // Clamp to 0 if something goes negative from rapid toggling
    if (num < 0) num = 0;
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

  // ── API ───────────────────────────────────────────────────

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

  // ── DOM: Finding buttons ──────────────────────────────────

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
            dislikeContainer: dislikeVM,
            segmentContainer: seg,
          };
        }

        // Fallback for segmented without view-model
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
              dislikeContainer: allActionBtns[1].parentElement,
              segmentContainer: parent,
            };
          }
        }
      }
    }

    return null;
  }

  // ── DOM: Detect current YouTube like/dislike state ─────────

  function detectState() {
    const buttons = findButtons();
    if (!buttons) return STATE.NEUTRAL;

    const { likeBtn, dislikeBtn } = buttons;

    // YouTube uses aria-pressed="true" on the active button
    if (likeBtn?.getAttribute('aria-pressed') === 'true') return STATE.LIKED;
    if (dislikeBtn?.getAttribute('aria-pressed') === 'true') return STATE.DISLIKED;

    // Fallback: class-based detection
    if (likeBtn?.classList.contains('style-default-active')) return STATE.LIKED;
    if (dislikeBtn?.classList.contains('style-default-active')) return STATE.DISLIKED;

    return STATE.NEUTRAL;
  }

  // ── DOM: Dislike count injection ──────────────────────────

  function removeDislikeCount() {
    document.querySelectorAll(`[${RYD_LABEL_ATTR}]`).forEach((el) => {
      el.remove();
    });
    // Clean up our style overrides so the button returns to normal
    const buttons = findButtons();
    if (buttons?.dislikeBtn) {
      buttons.dislikeBtn.removeAttribute(RYD_VALUE_ATTR);
      buttons.dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-leading');
      buttons.dislikeBtn.classList.add('yt-spec-button-shape-next--icon-button');
    }
  }

  function injectCount(dislikes, settings) {
    const buttons = findButtons();
    if (!buttons || !buttons.dislikeBtn || !buttons.likeBtn) return false;

    const { dislikeBtn, likeBtn, dislikeContainer } = buttons;
    const formatted = formatCount(dislikes);

    // Same count, same node still in place — nothing to do.
    if (dislikeBtn.getAttribute(RYD_VALUE_ATTR) === formatted) {
      // If YouTube wiped our DOM node during a partial render, we must re-inject 
      // even if the value attribute is ostensibly correct.
      if (dislikeBtn.querySelector(`[${RYD_LABEL_ATTR}]`)) return true;
    }

    // Remove our previous injection if one exists (handles re-renders and count updates)
    const existing = dislikeBtn.querySelector(`[${RYD_LABEL_ATTR}]`);
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
      textNodeClone.setAttribute(RYD_LABEL_ATTR, 'true');

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

  // ── DOM: Ratio bar ────────────────────────────────────────

  function removeRatioBar() {
    document.querySelectorAll(`#${BAR_ID}`).forEach((bar) => bar.remove());

    document.querySelectorAll('.neattube-ratio-host').forEach((el) => {
      el.classList.remove('neattube-ratio-host');
    });
  }

  function ensureRatioBarHost(buttons) {
    let host = buttons?.segmentContainer;
    if (!host) return null;

    // Prefer the tight visual wrapper so the bar doesn't bleed too wide
    const innerWrapper = host.querySelector('#segmented-buttons-wrapper') || host.querySelector('yt-smartimation');
    if (innerWrapper) {
      host = innerWrapper;
    } 
    // Fallback block specific to the old sprawling action menu layout
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

  function renderRatioBar(likes, dislikes) {
    const buttons = findButtons();
    if (!buttons?.segmentContainer) return;

    const host = ensureRatioBarHost(buttons);
    if (!host) return;

    const total = (likes || 0) + (dislikes || 0);
    const percent = total > 0 ? (likes / total) * 100 : 50;

    const container = ensureRatioBar(host);

    // ── Snap to visual bounds ──
    // Measure strictly to the visual buttons and map absolute CSS coordinates ONCE.
    // Because we anchor to a relative wrapper, those static coordinates will elegantly
    // ride along any window resizes without ever forcing another JS recalculation.
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

  // ── Click handling ────────────────────────────────────────

  function playAnimation(button, type) {
    if (!button) return;
    const cls = type === 'dislike' ? 'neattube-dislike-animate' : 'neattube-like-animate';
    // Find the icon inside the button to animate
    const icon = button.querySelector('yt-icon, .yt-spec-button-shape-next__icon') || button;
    icon.classList.remove(cls);
    // Force reflow so re-adding the class restarts the animation
    void icon.offsetWidth;
    icon.classList.add(cls);
    icon.addEventListener('animationend', () => icon.classList.remove(cls), { once: true });
  }

  function onDislikeClicked(settings) {
    if (_cachedDislikes === null || _cachedLikes === null) return;

    const prevState = _userState;
    _userState = detectState();

    // If YouTube flipped to DISLIKED state, the user just pressed dislike
    if (_userState === STATE.DISLIKED && prevState !== STATE.DISLIKED) {
      _cachedDislikes++;
      if (prevState === STATE.LIKED) _cachedLikes--;
      playAnimation(findButtons()?.dislikeBtn, 'dislike');
    }
    // If YouTube went from DISLIKED back to NEUTRAL, user un-disliked
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

  // We use requestAnimationFrame to let YouTube's own handler
  // update the aria-pressed attribute before we read the state.
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

    // Store handler refs for cleanup
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
  // ── Observer ──────────────────────────────────────────────

  let _pendingInjectionFrame = 0;

  function stopObserver() {
    if (_domObserver) {
      _domObserver.disconnect();
      _domObserver = null;
    }
    cancelAnimationFrame(_pendingInjectionFrame);
  }

  function scheduleInjection(settings) {
    cancelAnimationFrame(_pendingInjectionFrame);

    _pendingInjectionFrame = requestAnimationFrame(() => {
      if (_cachedDislikes === null) return;

      if (injectCount(_cachedDislikes, settings)) {
        renderRatioBar(_cachedLikes, _cachedDislikes);
        bindClickListeners(settings);
        stopObserver();
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

  // ── Main flow ─────────────────────────────────────────────

  async function startDislikeFlow(videoId, settings) {
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

    // Try the fastest possible zero-latency injection first
    if (injectCount(_cachedDislikes, settings)) {
      renderRatioBar(_cachedLikes, _cachedDislikes);
      bindClickListeners(settings);
      return;
    }

    // If the DOM is lagging behind the API call, boot up the observer
    setupObserverForInjection(settings);
  }

  // ── Public API ────────────────────────────────────────────

  return {
    enable(settings) {
      try {
        const videoId = getVideoId();
        if (!videoId) return;

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