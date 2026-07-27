import { createSyntheticMediaStream } from './videoSimulator';

/**
 * Gets real camera and microphone MediaStream from navigator.mediaDevices.
 * Supports facingMode: 'user' (Front Selfie) vs 'environment' (Rear Camera)
 *
 * Audio constraints are tuned aggressively for mobile devices where the
 * loudspeaker output can bleed back into the microphone, causing echo/feedback.
 */
export async function getMediaStream(audio = true, video = true, label = 'User', color = '#3b82f6', facingMode = 'user') {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const constraints = {
        audio: audio
          ? {
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: true },
              autoGainControl: { ideal: true },
              // Chrome-specific: suppress loopback from speaker → mic on mobile
              googEchoCancellation: { ideal: true },
              googAutoGainControl: { ideal: true },
              googNoiseSuppression: { ideal: true },
              googHighpassFilter: { ideal: true },
              googEchoCancellation2: { ideal: true },
              googDAEchoCancellation: { ideal: true },
            }
          : false,
        video: video ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
      };
      const realStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`🎥 Connected to real media device (${facingMode} camera)`);
      return { stream: realStream, isSynthetic: false };
    }
  } catch (err) {
    console.warn('Real camera/mic unavailable or permission denied. Falling back to synthetic stream:', err.message);
  }

  const syntheticStream = createSyntheticMediaStream(label, color);
  return { stream: syntheticStream, isSynthetic: true };
}
