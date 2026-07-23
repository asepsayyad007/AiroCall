import React, { useState } from 'react';
import { Video, Mic, MicOff, Camera, CameraOff, PhoneCall, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

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
    <div style={{ maxWidth: '480px', margin: '40px auto', padding: '0 20px' }}>
      
      <div className="glass-panel" style={{ padding: '36px 28px', textAlign: 'center' }}>
        
        {/* AiroCall Logo */}
        <div style={{ margin: '0 auto 20px', display: 'flex', justifyContent: 'center' }}>
          <img src="/AiroCall.svg" alt="AiroCall Logo" style={{ width: '84px', height: '84px', filter: 'drop-shadow(0 8px 24px rgba(255, 85, 0, 0.6))' }} />
        </div>

        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '6px', background: 'linear-gradient(90deg, #ffffff, #ffaa00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          AiroCall
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#a3969d', marginBottom: '28px' }}>
          Instant WebRTC Video Calls & Smart TV Streaming
        </p>

        {targetCallId ? (
          /* Workflow B: Joining via Shared Call Link (?call=XXXXXX) */
          <form onSubmit={handleJoin}>
            <div style={{ background: 'rgba(255, 85, 0, 0.15)', border: '1px solid rgba(255, 85, 0, 0.4)', padding: '16px', borderRadius: '16px', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.75rem', color: '#a3969d', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
                Incoming Call Invite
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffaa00', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                Call ID: {targetCallId}
              </div>
            </div>

            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ fontSize: '0.75rem', color: '#a3969d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your Display Name
              </label>
              <input
                type="text"
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                placeholder="e.g. Alex"
                style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: '#ffffff', padding: '14px 16px', borderRadius: '12px', fontSize: '1rem', marginTop: '6px' }}
              />
            </div>

            {/* Device Controls */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
              <button
                type="button"
                onClick={() => setMicEnabled(!micEnabled)}
                className={`glass-btn ${micEnabled ? '' : 'glass-btn-danger'}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                {micEnabled ? 'Mic On' : 'Mic Off'}
              </button>

              <button
                type="button"
                onClick={() => setVideoEnabled(!videoEnabled)}
                className={`glass-btn ${videoEnabled ? '' : 'glass-btn-danger'}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {videoEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
                {videoEnabled ? 'Cam On' : 'Cam Off'}
              </button>
            </div>

            <button type="submit" className="glass-btn glass-btn-primary pulse-glow" style={{ width: '100%', padding: '16px', justifyContent: 'center', fontSize: '1.1rem', borderRadius: '16px' }}>
              <PhoneCall size={20} /> Join Call Now <ArrowRight size={20} />
            </button>
          </form>
        ) : (
          /* Workflow A: Caller 1 Creating Instant Call */
          <form onSubmit={handleStart}>
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ fontSize: '0.75rem', color: '#a3969d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your Display Name
              </label>
              <input
                type="text"
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                placeholder="e.g. You"
                style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: '#ffffff', padding: '14px 16px', borderRadius: '12px', fontSize: '1rem', marginTop: '6px' }}
              />
            </div>

            {/* Device Controls */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
              <button
                type="button"
                onClick={() => setMicEnabled(!micEnabled)}
                className={`glass-btn ${micEnabled ? '' : 'glass-btn-danger'}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                {micEnabled ? 'Mic On' : 'Mic Off'}
              </button>

              <button
                type="button"
                onClick={() => setVideoEnabled(!videoEnabled)}
                className={`glass-btn ${videoEnabled ? '' : 'glass-btn-danger'}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {videoEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
                {videoEnabled ? 'Cam On' : 'Cam Off'}
              </button>
            </div>

            <button type="submit" className="glass-btn glass-btn-primary pulse-glow" style={{ width: '100%', padding: '16px', justifyContent: 'center', fontSize: '1.1rem', borderRadius: '16px' }}>
              <Sparkles size={20} /> Start Instant Call
            </button>
          </form>
        )}

        <div style={{ marginTop: '24px', fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <ShieldCheck size={14} /> End-to-End P2P Encrypted Call
        </div>

      </div>

    </div>
  );
}
