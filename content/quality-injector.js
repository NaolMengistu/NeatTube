/**
 * NeatTube — Quality Injector Script
 * 
 * Context: 
 * Chrome extensions run in an "Isolated World." This means they can't access 
 * the internal JavaScript variables of the website (YouTube's 'movie_player').
 * 
 * Solution:
 * We inject this script directly into the page's "Main World." This allows us 
 * to talk directly to YouTube's internal API and force the playback resolution.
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

  /**
   * Internal logger that respects the debug setting from the extension.
   */
  function log() {
    if (debug) console.debug.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }

  /**
   * The "Next Best Quality" Logic.
   * If a user wants 4K but the video only goes up to 1080p, we "fall down" 
   * the priority list until we find the highest resolution the video 
   * actually supports.
   */
  function findBestAvailable(preferred, available) {
    if (preferred === 'auto') return null;
    var prefIndex = qualityOrder.indexOf(preferred);
    if (prefIndex === -1) return null;
    for (var i = prefIndex; i < qualityOrder.length; i++) {
      if (available.indexOf(qualityOrder[i]) !== -1) return qualityOrder[i];
    }
    return null;
  }

  /**
   * The Core API Call.
   * We attempt to find YouTube's 'movie_player' object and invoke its 
   * setPlaybackQuality methods. 
   */
  function trySetQuality() {
    attempts++;
    try {
      var player = document.getElementById('movie_player');
      if (!player) return false;

      // Ensure the player is fully initialized and API methods are live
      if (typeof player.getAvailableQualityLevels !== 'function') return false;

      var available = player.getAvailableQualityLevels();
      if (!available || available.length === 0) return false;

      if (preferred === 'auto') return true;

      var target = findBestAvailable(preferred, available);
      if (!target) return true;

      var current = player.getPlaybackQuality();
      if (current === target) return true; // Quality is already correct

      // Call both methods for maximum compatibility across player versions
      if (typeof player.setPlaybackQualityRange === 'function') {
        player.setPlaybackQualityRange(target, target);
      }
      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(target);
      }

      log('Applied quality:', target, 'on attempt', attempts);
      return true;
    } catch (e) {
      log('Application error:', e.message);
      return false;
    }
  }

  /**
   * The Polling Loop.
   * YouTube's player is a complex object that takes time to load. We poll 
   * every 200ms until the API becomes responsive or we hit our limit.
   */
  var interval = setInterval(function () {
    if (attempts >= maxAttempts) {
      clearInterval(interval);
      log('Stopping after', maxAttempts, 'attempts.');
      return;
    }
    if (trySetQuality()) {
      clearInterval(interval);
    }
  }, 200);

  /**
   * The Safety Net.
   * Sometimes a video starts playing late (e.g. after buffering). We hook into 
   * the player's state change event to re-apply the quality whenever the 
   * video begins playing or buffering.
   */
  var playerObj = document.getElementById('movie_player');
  if (playerObj && typeof playerObj.addEventListener === 'function') {
    playerObj.addEventListener('onStateChange', function (state) {
      if (state === 1 || state === 3) { // 1 = Playing, 3 = Buffering
        trySetQuality();
      }
    });
  }
})();