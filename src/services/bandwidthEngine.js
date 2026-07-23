// Bandwidth Engine - Manual Data Saver & Video Quality Priority

export const BANDWIDTH_PROFILES = {
  HD: { id: 'HD', name: 'HD Quality', maxBitrate: 2500000, fps: 30, resolution: '720p/1080p @ 30fps' },
  SD: { id: 'SD', name: 'SD Balanced', maxBitrate: 800000, fps: 24, resolution: '480p @ 24fps' },
  LOW: { id: 'LOW', name: 'Low Bitrate', maxBitrate: 300000, fps: 15, resolution: '360p @ 15fps' },
  AUDIO: { id: 'AUDIO', name: 'Audio-Only Data Saver', maxBitrate: 40000, fps: 0, resolution: 'Audio Only' },
};

export class BandwidthEngine {
  constructor(peerConnection, onStatsUpdate) {
    this.pc = peerConnection;
    this.onStatsUpdate = onStatsUpdate;
    this.timer = null;
    this.lastBytesSent = 0;
    this.lastTimestamp = Date.now();
    this.currentProfile = 'HD';
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.checkStats(), 2000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async setManualProfile(profileId) {
    const profile = BANDWIDTH_PROFILES[profileId] || BANDWIDTH_PROFILES.HD;
    this.currentProfile = profile.id;
    if (!this.pc) return;

    const senders = this.pc.getSenders();
    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

    if (videoSender) {
      if (profile.id === 'AUDIO') {
        videoSender.track.enabled = false;
      } else {
        videoSender.track.enabled = true;
        try {
          const params = videoSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (profile.maxBitrate) {
            params.encodings[0].maxBitrate = profile.maxBitrate;
          }
          if (profile.fps) {
            params.encodings[0].maxFramerate = profile.fps;
          }
          await videoSender.setParameters(params);
        } catch (e) {
          console.warn('Could not update RTP sender parameters:', e);
        }
      }
    }

    this.checkStats();
  }

  async checkStats() {
    if (!this.pc) return;

    try {
      const stats = await this.pc.getStats();
      let currentBytes = 0;
      let rtt = 24;

      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && !report.isRemote) {
          currentBytes += report.bytesSent || 0;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = Math.round((report.currentRoundTripTime || 0.024) * 1000);
        }
      });

      const now = Date.now();
      const timeDiffSec = (now - this.lastTimestamp) / 1000;
      const bitrateKbps = Math.round(((currentBytes - this.lastBytesSent) * 8) / 1000 / (timeDiffSec || 1));

      this.lastBytesSent = currentBytes;
      this.lastTimestamp = now;

      const profileObj = BANDWIDTH_PROFILES[this.currentProfile] || BANDWIDTH_PROFILES.HD;

      if (this.onStatsUpdate) {
        this.onStatsUpdate({
          bitrateKbps: Math.max(30, bitrateKbps || 2200),
          rtt,
          activeProfile: profileObj,
        });
      }
    } catch (err) {
      console.warn('Error reading WebRTC stats:', err);
    }
  }
}
