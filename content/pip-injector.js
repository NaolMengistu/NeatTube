/**
 * NeatTube — Picture-in-Picture (PiP) Injector
 * 
 * Crucial Context: 
 * This script runs in the page's "Main World" (YouTube's actual JavaScript context).
 * 
 * Why this is necessary:
 * Content scripts run in an "isolated world." While they share the DOM, they 
 * have separate JavaScript objects (like 'navigator'). Chrome's native 
 * Auto-PiP feature only checks the "Main World" for Media Session handlers. 
 * 
 * This script registers the 'enterpictureinpicture' handler that Chrome invokes 
 * when a user switches tabs, allowing us to bypass the standard "user gesture" 
 * requirement and pop the video out automatically.
 */

(function () {
  var SCRIPT_ID = 'neattube-pip-injector';
  var scriptTag = document.getElementById(SCRIPT_ID);
  if (!scriptTag) return;

  var TAG = '[NeatTube PiP]';
  var debug = scriptTag.dataset.debug === 'true';

  /**
   * Internal logger that respects the debug flag passed from the content script.
   */
  function log() {
    if (debug) console.debug.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }

  // Check if the browser supports the Media Session API
  if ('mediaSession' in navigator) {
    try {
      /**
       * We register the 'enterpictureinpicture' action handler. 
       * When Chrome detects the user is switching tabs while a video is playing, 
       * it looks for this specific handler to decide if it should trigger 
       * automatic Picture-in-Picture.
       */
      navigator.mediaSession.setActionHandler('enterpictureinpicture', function () {
        var video = document.querySelector('video.html5-main-video');
        if (!video) {
          log('Auto-PiP triggered, but no video found on page.');
          return;
        }

        video.requestPictureInPicture()
          .then(function () {
            log('PiP window opened (via Media Session).');
          })
          .catch(function (err) {
            log('Failed to open PiP window:', err.name, err.message);
          });
      });
      log('Media Session handler registered successfully.');
    } catch (err) {
      log('Could not register Media Session handler:', err.message);
    }
  } else {
    log('Media Session API is not supported in this browser.');
  }
})();
