/**
 * W3C Presentation API & Remote Playback API Integration
 * Provides native 1-tap Chromecast / Android TV / Smart TV screen mirroring & URL projection.
 */

if (typeof window !== 'undefined') {
  window.__onGCastApiAvailable = function (isAvailable) {
    if (isAvailable && window.cast && window.cast.framework && window.chrome && window.chrome.cast) {
      try {
        const castContext = window.cast.framework.CastContext.getInstance();
        castContext.setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        console.log('✅ Built-in Native Google Cast Launcher ready');
      } catch (e) {
        console.warn('Cast Context setup:', e);
      }
    }
  };
}

/**
 * Checks if the W3C Presentation API is supported in the current browser
 */
export function isPresentationSupported() {
  return typeof window !== 'undefined' && 'PresentationRequest' in window;
}

/**
 * 1-Click project call URL directly onto TV screen/Chromecast
 */
export async function triggerPresentationCast(pairCode) {
  if (!pairCode) {
    console.error('Presentation Cast requires a valid TV PIN code.');
    return { success: false, error: 'No TV PIN Code generated yet.' };
  }

  const tvUrl = `${window.location.origin}/tv?code=${pairCode}`;

  if (isPresentationSupported()) {
    try {
      console.log('Initiating Presentation Cast to:', tvUrl);
      const request = new window.PresentationRequest([tvUrl]);
      
      // Request display availability monitoring
      request.addEventListener('connectionavailable', (event) => {
        console.log('Presentation API connection established:', event.connection.id);
      });

      // Start the casting session. This launches the native browser Cast/AirPlay dialog
      const connection = await request.start();
      return { success: true, method: 'Presentation API', connection };
    } catch (err) {
      console.warn('Presentation API Cast failed/cancelled:', err);
      return { success: false, error: err.message || 'Casting cancelled or failed' };
    }
  }

  return { 
    success: false, 
    error: 'W3C Presentation API not supported by this browser. Use PIN code or scan QR code on TV Browser.' 
  };
}

/**
 * Android Chrome Native Remote Playback scanner (fallback/alternative)
 */
export async function promptRemotePlayback(videoElement) {
  if (videoElement && videoElement.remote && typeof videoElement.remote.prompt === 'function') {
    try {
      await videoElement.remote.prompt();
      return { success: true, method: 'Remote Playback API' };
    } catch (err) {
      console.warn('Remote Playback Prompt error:', err);
    }
  }
  return { success: false };
}
