// Utility to create a synthetic MediaStream using HTML5 Canvas & Web Audio API
// This allows 100% reliable side-by-side multi-caller & TV testing on a single machine!

export function createSyntheticMediaStream(label = 'Caller 1', color = '#3b82f6') {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  let frameCount = 0;

  function renderFrame() {
    frameCount++;
    // Dark animated radial gradient background
    const gradient = ctx.createRadialGradient(
      320 + Math.sin(frameCount * 0.05) * 50,
      240 + Math.cos(frameCount * 0.05) * 40,
      10,
      320,
      240,
      400
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 480);

    // Bouncing sphere representing live video motion
    const x = 320 + Math.sin(frameCount * 0.03) * 200;
    const y = 240 + Math.cos(frameCount * 0.04) * 120;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // User Avatar Badge
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(20, 20, 260, 50);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, 260, 50);

    ctx.font = 'bold 20px Outfit, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`🎥 ${label}`, 35, 52);

    // Live frame ticker timestamp
    ctx.font = '14px JetBrains Mono, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Frame: ${frameCount} | 640x480`, 20, 450);

    requestAnimationFrame(renderFrame);
  }

  renderFrame();

  const videoTrack = canvas.captureStream(30).getVideoTracks()[0];

  // Create subtle synthetic audio tone track using Web Audio API
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const dst = audioCtx.createMediaStreamDestination();
  const gain = audioCtx.createGain();
  gain.gain.value = 0.01; // Ultra-quiet ambient background tone
  osc.frequency.value = 440;
  osc.connect(gain);
  gain.connect(dst);
  osc.start();

  const audioTrack = dst.stream.getAudioTracks()[0];

  return new MediaStream([videoTrack, audioTrack]);
}
