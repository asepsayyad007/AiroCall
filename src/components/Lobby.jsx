import React, { useState } from 'react';
import { Video, Mic, MicOff, Camera, CameraOff, PhoneCall, ArrowRight, Shield, Sparkles } from 'lucide-react';

export default function Lobby({ targetCallId, onStartInstantCall, onJoinCall }) {
  const [userNameInput, setUserNameInput] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const handleStart = (e) => {
    e.preventDefault();
    const finalUserName = userNameInput.trim() || 'Caller 1';
    onStartInstantCall(finalUserName);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    const finalUserName = userNameInput.trim() || 'Caller 2';
    onJoinCall(targetCallId, finalUserName);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)', padding: '24px 16px' }}>
      <div className="animate-fade-in-scale" style={{ width: '100%', maxWidth: '420px' }}>

        {/* Main Card */}
        <div className="glass-panel" style={{ padding: '40px 32px' }}>

          {/* Logo & Brand */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '72px', height: '72px', borderRadius: '20px', background: 'var(--brand-primary-muted)', marginBottom: '16px' }}>
              <img src="/AiroCall.svg" alt="AiroCall" style={{ width: '44px', height: '44px' }} />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '6px', color: 'var(--text-primary)' }}>
              AiroCall
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Video calls. Instant. On any screen.
            </p>
          </div>

          {/* Join Call Invite Banner */}
          {targetCallId && (
            <div className="animate-slide-down" style={{ background: 'var(--brand-primary-muted)', border: '1px solid rgba(255, 92, 0, 0.25)', padding: '14px 18px', borderRadius: 'var(--radius-md)', marginBottom: '24px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Incoming Call Invite
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-primary-hover)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {targetCallId}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={targetCallId ? handleJoin : handleStart}>

            {/* Name Input */}
            <div style={{ marginBottom: '20px' }}>
              <label className="input-label" htmlFor="display-name">
                Display Name
              </label>
              <input
                id="display-name"
                type="text"
                className="input"
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                placeholder={targetCallId ? 'Enter your name' : 'Your name'}
                autoComplete="off"
              />
            </div>

            {/* Device Controls */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '28px' }}>
              <button
                type="button"
                onClick={() => setMicEnabled(!micEnabled)}
                className={`glass-btn ${!micEnabled ? 'glass-btn-danger' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                <span style={{ fontSize: '0.8rem' }}>{micEnabled ? 'Mic On' : 'Mic Off'}</span>
              </button>

              <button
                type="button"
                onClick={() => setVideoEnabled(!videoEnabled)}
                className={`glass-btn ${!videoEnabled ? 'glass-btn-danger' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
              >
                {videoEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
                <span style={{ fontSize: '0.8rem' }}>{videoEnabled ? 'Cam On' : 'Cam Off'}</span>
              </button>
            </div>

            {/* CTA Button */}
            <button
              type="submit"
              className="glass-btn glass-btn-primary"
              style={{ width: '100%', padding: '16px', fontSize: '1rem', fontWeight: 600, borderRadius: 'var(--radius-lg)' }}
            >
              {targetCallId ? (
                <>
                  <PhoneCall size={20} />
                  Join Call
                  <ArrowRight size={18} />
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Start Instant Call
                </>
              )}
            </button>
          </form>

          {/* Trust Signal */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '24px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
            <Shield size={14} />
            <span>End-to-end encrypted P2P connection</span>
          </div>

        </div>
      </div>
    </div>
  );
}
