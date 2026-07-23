import { createSyntheticMediaStream } from './videoSimulator';

/**
 * Gets real camera and microphone MediaStream from navigator.mediaDevices.
 * Supports facingMode: 'user' (Front Selfie) vs 'environment' (Rear Camera)
 */
export async function getMediaStream(audio = true, video = true, label = 'User', color = '#3b82f6', facingMode = 'user') {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const constraints = {
        audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
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
