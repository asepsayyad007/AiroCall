import React from 'react';
import { Shield, Lock, Eye, Server, Trash2 } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 20px' }}>
      <div className="glass-panel" style={{ padding: '40px 32px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <Shield size={28} color="var(--brand-primary)" />
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Privacy Policy</h1>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.85rem' }}>
          Last updated: July 2026
        </p>

        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Lock size={18} color="var(--brand-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>End-to-End Encryption</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            All audio and video calls on AiroCall use WebRTC with DTLS-SRTP encryption. This means your call content (voice, video) is encrypted directly between participants. Our server never has access to decryption keys and cannot intercept, record, or view your calls.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Server size={18} color="var(--brand-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>What Our Server Does</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            Our signaling server only facilitates connection setup between peers. It relays connection metadata (ICE candidates, SDP offers) required to establish the peer-to-peer link. Once connected, all media flows directly between devices — our server is not involved.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Trash2 size={18} color="var(--brand-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No Data Storage</h2>
          </div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.8', paddingLeft: '20px' }}>
            <li>We do not record calls</li>
            <li>We do not store chat messages</li>
            <li>We do not collect personal information</li>
            <li>We do not require account creation</li>
            <li>We do not use cookies for tracking</li>
            <li>Call room data exists only in server memory and is deleted when the call ends</li>
          </ul>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Eye size={18} color="var(--brand-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>What We Cannot See</h2>
          </div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.8', paddingLeft: '20px' }}>
            <li>Your video or audio content</li>
            <li>What you say or show on camera</li>
            <li>Who you are calling (no accounts = no identity)</li>
            <li>Your location (we do not request geolocation)</li>
          </ul>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>Camera & Microphone</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            AiroCall requires camera and microphone access to function. These permissions are requested by your browser and can be revoked at any time. Media from your camera/mic is sent directly to the other participant via encrypted P2P — never through our servers.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>Smart TV Streaming</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            When streaming to a TV, the video/audio is sent via an additional WebRTC peer connection directly from the caller's device to the TV browser. The server facilitates the pairing (via a 6-digit PIN) but never receives or processes the media stream.
          </p>
        </section>

        <section style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>Contact</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            For privacy concerns or grievances, contact us at: <strong style={{ color: 'var(--text-primary)' }}>privacy@airocall.app</strong>
          </p>
        </section>

      </div>
    </div>
  );
}
