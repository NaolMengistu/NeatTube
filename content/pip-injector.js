/**
 * NeatTube — Picture-in-Picture (PiP) Injector (Main World)
 */

(function () {
  var SCRIPT_ID = 'neattube-pip-injector';
  var scriptTag = document.getElementById(SCRIPT_ID);
  if (!scriptTag) return;

  var TAG = '[NeatTube PiP]';
  var debug = scriptTag.dataset.debug === 'true';

  function log() {
    if (debug) console.debug.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }

  function findBestVideo() {
    var videos = document.querySelectorAll('video');
    var best = null;
    var maxScore = -1;

    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      // We are more lenient here: readyState 1 (Metadata) is enough to prime the handler
      if (v.readyState === 0 || v.disablePictureInPicture) continue;
      
      var rect = v.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      var score = (rect.width * rect.height) + (v.paused ? 0 : 1000000);
      if (score > maxScore) {
        maxScore = score;
        best = v;
      }
    }
    return best;
  }

  /**
   * The Auto-PiP Handler.
   */
  function handleAutoPip() {
    log('>>> Browser triggered "enterpictureinpicture" action handler.');
    var video = findBestVideo();
    if (!video) {
      log('Auto-PiP Error: No active video found.');
      return;
    }

    if (document.pictureInPictureElement === video) return;

    video.requestPictureInPicture()
      .then(function () { log('Auto-PiP: Success'); })
      .catch(function (err) { 
        log('Auto-PiP: Rejected by browser.', err.message);
        // Fallback: If the browser rejected it, it's often due to lack of User Activation.
        // We can't fix that here, but we log the warning for the user.
      });
  }

  /**
   * RE-REGISTRATION LOGIC
   */
  function registerHandler() {
    if (!('mediaSession' in navigator)) return;

    try {
      // Re-apply the handler
      navigator.mediaSession.setActionHandler('enterpictureinpicture', handleAutoPip);
      
      // SYNC PLAYBACK STATE
      // Chrome's Auto-PiP heuristic requires the Media Session to be 'playing'.
      // If YouTube's internal manager sets it to 'none', Auto-PiP will break.
      var video = findBestVideo();
      if (video && !video.paused) {
        if (navigator.mediaSession.playbackState !== 'playing') {
          navigator.mediaSession.playbackState = 'playing';
          log('Playback state forced to "playing" for Auto-PiP eligibility.');
        }
      }
      
      log('Media Session handler reinforced.');
    } catch (err) {
      log('Registration failed:', err.message);
    }
  }

  // REINFORCEMENT CYCLE
  var registrationInterval = setInterval(registerHandler, 2000);

  // EVENT LISTENERS
  document.addEventListener('yt-navigate-finish', function() {
    log('Navigation detected, re-priming PiP...');
    setTimeout(registerHandler, 500); // Small delay to let YouTube's manager finish
    setTimeout(registerHandler, 2000);
  });

  window.addEventListener('play', registerHandler, true);

  // INITIAL RUN
  registerHandler();

  // Test Hook
  window.__NeatTube_TestPiP = handleAutoPip;

  /**
   * CLEANUP
   */
  document.addEventListener('neattube-pip-disable', function onDisable() {
    document.removeEventListener('neattube-pip-disable', onDisable);
    if (registrationInterval) clearInterval(registrationInterval);
    delete window.__NeatTube_TestPiP;

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('enterpictureinpicture', null);
      } catch (err) {}
    }
  });
})();
