/**
 * NeatTube — Quality Injector Script
 *
 * Because Chrome extensions run in an "isolated world", they can't directly 
 * touch the variables on the actual webpage. 
 * 
 * We inject this file directly into the page's DOM (via web_accessible_resources)
 * so it can reach into YouTube's internal `movie_player` object and force the resolution.
 */

(function () {
  var SCRIPT_ID = 'neattube-quality-script';
  var scriptTag = document.getElementById(SCRIPT_ID);
  if (!scriptTag) return;

  var TAG = '[NeatTube Quality]';
  var debug = scriptTag.dataset.debug === 'true';
  var preferred = scriptTag.dataset.preferred;
  var qualityOrder = JSON.parse(scriptTag.dataset.order || '[]');
  var attempts = 0;
  var maxAttempts = 20;

  function log() {
    if (debug) console.debug.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }

  // Walk down the quality preference list starting at the user's choice.
  // If their exact quality isn't available (e.g. stream only goes up to 1080p),
  // we settle for the next best thing rather than doing nothing.
  function findBestAvailable(preferred, available) {
    if (preferred === 'auto') return null;
    var prefIndex = qualityOrder.indexOf(preferred);
    if (prefIndex === -1) return null;
    for (var i = prefIndex; i < qualityOrder.length; i++) {
      if (available.indexOf(qualityOrder[i]) !== -1) return qualityOrder[i];
    }
    return null;
  }

  // The main quality-setting attempt. Called on a tight loop until it sticks.
  // The YouTube player API isn't always ready the moment the page fires an event,
  // so we just keep polling until we can get our hands on it.
  function trySetQuality() {
    attempts++;
    try {
      var player = document.getElementById('movie_player');
      if (!player) return false;
      if (typeof player.getAvailableQualityLevels !== 'function') return false;

      var available = player.getAvailableQualityLevels();
      if (!available || available.length === 0) return false;

      if (preferred === 'auto') return true;

      var target = findBestAvailable(preferred, available);
      if (!target) return true;

      var current = player.getPlaybackQuality();
      if (current === target) return true; // already set

      if (typeof player.setPlaybackQualityRange === 'function') {
        player.setPlaybackQualityRange(target, target);
      }
      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(target);
      }

      log('set quality to', target, 'on attempt', attempts);
      return true;
    } catch (e) {
      log('error:', e.message);
      return false;
    }
  }

  // Poll every 200ms until the player is ready or we hit the max attempt limit.
  // This handles the common case where the video starts loading but the player
  // object isn't fully initialized yet.
  var interval = setInterval(function () {
    if (attempts >= maxAttempts) {
      clearInterval(interval);
      log('gave up after', maxAttempts, 'attempts');
      return;
    }
    if (trySetQuality()) {
      clearInterval(interval);
    }
  }, 200);

  // Belt-and-suspenders fallback: also hook the player's state change event.
  // This kicks in for videos that start playing AFTER our polling window closed,
  // like when buffering resolves slowly.
  var playerObj = document.getElementById('movie_player');
  if (playerObj && typeof playerObj.addEventListener === 'function') {
    playerObj.addEventListener('onStateChange', function (state) {
      if (state === 1 || state === 3) { // Playing or Buffering
        trySetQuality();
      }
    });
  }
})();