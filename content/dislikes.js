/**
 * NeatTube — Dislike Count Restorer
 */

/* exported DislikesModule */
/* global debugLog, SELECTORS */

const DislikesModule = (() => {
  const API_BASE = 'https://returnyoutubedislikeapi.com/votes';
  const RYD_LABEL_ATTR = 'data-neattube-ryd-label';
  const RYD_VALUE_ATTR = 'data-neattube-ryd-value';
  const BAR_ID = 'neattube-ratio-bar-container';
  const STYLE_ID = 'neattube-dislike-styles';

  let _currentVideoId = null;
  let _abortController = null;
  let _domObserver = null;
  let _cachedLikes = null;
  let _cachedDislikes = null;
  let _boundLikeBtn = null;
  let _boundDislikeBtn = null;

  const STATE = { NEUTRAL: 0, LIKED: 1, DISLIKED: 2 };
  let _userState = STATE.NEUTRAL;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      segmented-like-dislike-button-view-model,
      ytd-segmented-like-dislike-button-renderer,
      ytd-menu-renderer.ytd-watch-metadata,
      #top-level-buttons-computed,
      .slim-video-action-bar-actions,
      yt-smartimation,
      .ytSmartImationsContent {
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
        z-index: 10;
      }

      #${BAR_ID} .neattube-ratio-fill {
        height: 100%;
        width: 50%;
        border-radius: inherit;
        background: var(--yt-spec-text-primary, #fff);
        transition: width 0.18s ease-out;
        will-change: width;
      }

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
      .neattube-dislike-animate { animation: neattube-dislike-pulse 0.35s ease-out; }
      .neattube-like-animate { animation: neattube-like-pulse 0.35s ease-out; }
    `;
    document.head.appendChild(style);
  }

  function formatCount(num) {
    if (num === null || num === undefined) return '';
    try {
      return new Intl.NumberFormat('en', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      }).format(num);
    } catch { return String(num); }
  }

  function queryDeep(root, selector) {
    if (!root) return null;
    let found = root.querySelector(selector);
    if (found) return found;
    const children = root.querySelectorAll('*');
    for (const child of children) {
      if (child.shadowRoot) {
        found = queryDeep(child.shadowRoot, selector);
        if (found) return found;
      }
    }
    return null;
  }

  function findButtons() {
    const segments = document.querySelectorAll(SELECTORS.dislikeButtonSegment);
    for (const seg of segments) {
      if (seg.offsetParent || seg.getClientRects().length > 0) {
        const dislikeVM = queryDeep(seg, SELECTORS.dislikeViewModel);
        const likeVM = queryDeep(seg, 'like-button-view-model');
        if (dislikeVM && likeVM) {
          return {
            dislikeBtn: queryDeep(dislikeVM, 'button'),
            likeBtn: queryDeep(likeVM, 'button'),
            dislikeContainer: dislikeVM,
            segmentContainer: seg,
          };
        }
      }
    }
    return null;
  }

  function detectState() {
    const buttons = findButtons();
    if (!buttons) return STATE.NEUTRAL;
    if (buttons.likeBtn?.getAttribute('aria-pressed') === 'true') return STATE.LIKED;
    if (buttons.dislikeBtn?.getAttribute('aria-pressed') === 'true') return STATE.DISLIKED;
    return STATE.NEUTRAL;
  }

  function removeDislikeCount() {
    document.querySelectorAll(`[${RYD_LABEL_ATTR}]`).forEach(el => el.remove());
    const buttons = findButtons();
    if (buttons?.dislikeBtn) {
      buttons.dislikeBtn.removeAttribute(RYD_VALUE_ATTR);
      buttons.dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-leading', 'ytSpecButtonShapeNextIconLeading');
      buttons.dislikeBtn.classList.add('yt-spec-button-shape-next--icon-button', 'ytSpecButtonShapeNextIconButton');
    }
  }

  function injectCount(dislikes, settings) {
    const buttons = findButtons();
    if (!buttons || !buttons.dislikeBtn || !buttons.likeBtn) return false;

    const { dislikeBtn, likeBtn, dislikeContainer } = buttons;
    const formatted = formatCount(dislikes);

    if (dislikeBtn.getAttribute(RYD_VALUE_ATTR) === formatted && dislikeBtn.querySelector(`[${RYD_LABEL_ATTR}]`)) return true;

    const existing = dislikeBtn.querySelector(`[${RYD_LABEL_ATTR}]`);
    if (existing) existing.remove();

    dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-button', 'ytSpecButtonShapeNextIconButton');
    dislikeBtn.classList.add('yt-spec-button-shape-next--icon-leading', 'ytSpecButtonShapeNextIconLeading');

    const likeTextNode = likeBtn.querySelector(SELECTORS.dislikeButtonText);
    if (likeTextNode) {
      const textNodeClone = likeTextNode.cloneNode(true);
      textNodeClone.setAttribute(RYD_LABEL_ATTR, 'true');
      let innerSpan = textNodeClone.querySelector("span[role='text']") || textNodeClone.querySelector('span');
      if (!innerSpan) {
        innerSpan = document.createElement('span');
        textNodeClone.innerHTML = '';
        textNodeClone.appendChild(innerSpan);
      }
      innerSpan.textContent = formatted;
      dislikeBtn.appendChild(textNodeClone);
      dislikeBtn.setAttribute(RYD_VALUE_ATTR, formatted);
      return true;
    }
    return false;
  }

  function renderRatioBar(likes, dislikes) {
    const buttons = findButtons();
    if (!buttons) return;
    const host = buttons.segmentContainer.querySelector('.ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper') || 
                 buttons.segmentContainer.querySelector('.ytSmartImationsContent') ||
                 buttons.segmentContainer;
    
    host.classList.add('neattube-ratio-host');
    const total = (likes || 0) + (dislikes || 0);
    const percent = total > 0 ? (likes / total) * 100 : 50;

    let container = host.querySelector(`#${BAR_ID}`);
    if (!container) {
      container = document.createElement('div');
      container.id = BAR_ID;
      container.innerHTML = '<div class="neattube-ratio-fill"></div>';
      host.appendChild(container);
    }

    const likeEl = buttons.likeBtn.closest('like-button-view-model') || buttons.likeBtn;
    const dislikeEl = buttons.dislikeBtn.closest('dislike-button-view-model') || buttons.dislikeBtn;
    const likeRect = likeEl.getBoundingClientRect();
    const dislikeRect = dislikeEl.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();

    if (likeRect.width > 0 && hostRect.width > 0) {
      const exactWidth = (dislikeRect.right || (likeRect.right + 100)) - likeRect.left;
      const exactLeft = likeRect.left - hostRect.left;
      container.style.width = exactWidth + 'px';
      container.style.left = exactLeft + 'px';
    }
    container.querySelector('.neattube-ratio-fill').style.width = `${percent}%`;
  }

  function playAnimation(button, type) {
    if (!button) return;
    const cls = type === 'dislike' ? 'neattube-dislike-animate' : 'neattube-like-animate';
    const icon = queryDeep(button, 'yt-icon, .yt-spec-button-shape-next__icon, [class*="icon" i]') || button;
    icon.classList.remove(cls);
    void icon.offsetWidth;
    icon.classList.add(cls);
    icon.addEventListener('animationend', () => icon.classList.remove(cls), { once: true });
  }

  function onInteraction(settings) {
    if (_cachedDislikes === null || _cachedLikes === null) return;
    const prevState = _userState;
    _userState = detectState();

    if (_userState === STATE.DISLIKED && prevState !== STATE.DISLIKED) {
      _cachedDislikes++;
      if (prevState === STATE.LIKED) _cachedLikes--;
      playAnimation(_boundDislikeBtn, 'dislike');
    } else if (_userState === STATE.LIKED && prevState !== STATE.LIKED) {
      _cachedLikes++;
      if (prevState === STATE.DISLIKED) _cachedDislikes--;
      playAnimation(_boundLikeBtn, 'like');
    } else if (_userState === STATE.NEUTRAL) {
      if (prevState === STATE.LIKED) _cachedLikes--;
      if (prevState === STATE.DISLIKED) _cachedDislikes--;
    }
    injectCount(_cachedDislikes, settings);
    renderRatioBar(_cachedLikes, _cachedDislikes);
  }

  function bindListeners(settings) {
    const buttons = findButtons();
    if (!buttons || (_boundLikeBtn === buttons.likeBtn && _boundDislikeBtn === buttons.dislikeBtn)) return;
    _boundLikeBtn?.removeEventListener('click', _boundLikeBtn._nt);
    _boundDislikeBtn?.removeEventListener('click', _boundDislikeBtn._nt);
    const handler = () => setTimeout(() => onInteraction(settings), 50);
    buttons.likeBtn._nt = handler;
    buttons.dislikeBtn._nt = handler;
    buttons.likeBtn.addEventListener('click', handler);
    buttons.dislikeBtn.addEventListener('click', handler);
    _boundLikeBtn = buttons.likeBtn;
    _boundDislikeBtn = buttons.dislikeBtn;
  }

  return {
    enable(settings) {
      const videoId = (window.location.href.match(/[?&]v=([a-zA-Z0-9_-]+)/) || [])[1];
      if (!videoId) return;
      _currentVideoId = videoId;
      injectStyles();
      fetch(`${API_BASE}?videoId=${videoId}`).then(r => r.ok ? r.json() : null).then(data => {
        if (!data || videoId !== _currentVideoId) return;
        _cachedLikes = data.likes;
        _cachedDislikes = data.dislikes;
        _userState = detectState();
        if (injectCount(_cachedDislikes, settings)) {
          renderRatioBar(_cachedLikes, _cachedDislikes);
          bindListeners(settings);
        }
        if (_domObserver) _domObserver.disconnect();
        _domObserver = new MutationObserver(() => {
          if (_cachedDislikes !== null && injectCount(_cachedDislikes, settings)) {
            renderRatioBar(_cachedLikes, _cachedDislikes);
            bindListeners(settings);
          }
        });
        _domObserver.observe(document.body, { childList: true, subtree: true });
      });
    },
    disable() {
      if (_domObserver) _domObserver.disconnect();
      _boundLikeBtn?.removeEventListener('click', _boundLikeBtn._nt);
      _boundDislikeBtn?.removeEventListener('click', _boundDislikeBtn._nt);
      _boundLikeBtn = _boundDislikeBtn = null;
      removeDislikeCount();
      document.querySelectorAll(`#${BAR_ID}`).forEach(el => el.remove());
    },
    onNavigate(settings) { this.enable(settings); }
  };
})();