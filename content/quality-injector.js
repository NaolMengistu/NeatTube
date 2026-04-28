/**
 * NeatTube — Quality Injector Script (Main World)
 */

(function () {
  var SCRIPT_ID = 'neattube-quality-script';
  var scriptTag = document.getElementById(SCRIPT_ID);
  if (!scriptTag) return;

  var TAG = '[NeatTube Quality]';
  var debug = scriptTag.dataset.debug === 'true';
  var preferred = scriptTag.dataset.preferred;
  var qualityOrder = JSON.parse(scriptTag.dataset.order || '[]');
  
  var _attempts = 0;
  var _maxAttempts = 30;
  var _interval = null;

  function log() {
    if (debug) console.debug.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }

  function findBestAvailable(pref, available) {
    if (pref === 'auto') return null;
    var idx = qualityOrder.indexOf(pref);
    if (idx === -1) return null;
    for (var i = idx; i < qualityOrder.length; i++) {
      if (available.indexOf(qualityOrder[i]) !== -1) return qualityOrder[i];
    }
    return null;
  }

  function trySetQuality() {
    _attempts++;
    try {
      var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (!player || typeof player.getAvailableQualityLevels !== 'function') return false;

      var available = player.getAvailableQualityLevels();
      if (!available || available.length === 0) return false;

      if (preferred === 'auto') return true;

      var target = findBestAvailable(preferred, available);
      if (!target) return true;

      var current = player.getPlaybackQuality();
      if (current === target) {
        log('Quality already matched:', target);
        return true; 
      }

      // Aggressive application across multiple API versions
      if (typeof player.setPlaybackQualityRange === 'function') {
        player.setPlaybackQualityRange(target, target);
      }
      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(target);
      }
      
      // Update internal player state if possible
      if (player.setOption) {
        player.setOption('video-quality-selection', target);
      }

      log('Quality applied:', target, '(Attempt ' + _attempts + ')');
      return true;
    } catch (e) {
      log('Execution error:', e.message);
      return false;
    }
  }

  function startPolling() {
    _attempts = 0;
    if (_interval) clearInterval(_interval);
    _interval = setInterval(function () {
      if (_attempts >= _maxAttempts) {
        clearInterval(_interval);
        return;
      }
      if (trySetQuality()) {
        // We continue polling for a few more frames to ensure it sticks
        if (_attempts > 5) clearInterval(_interval);
      }
    }, 250);
  }

  // Lifecycle 1: Initial load
  startPolling();

  // Lifecycle 2: State changes (Buffering/Playing)
  document.addEventListener('onStateChange', function(e) {
    var state = e.detail; // External events often wrap data in detail
    if (state === 1 || state === 3) trySetQuality();
  }, true);

  // Lifecycle 3: SPA Navigations (Main World context)
  window.addEventListener('yt-navigate-finish', function() {
    log('SPA Navigation detected in main world.');
    startPolling();
  });

  // Safety net: Intercept player initialization via Event Bus if available
  window.addEventListener('yt-player-updated', function() {
    trySetQuality();
  });

})();