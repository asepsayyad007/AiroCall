import React, { useState } from 'react';
import { X, Tv, CheckCircle2, Copy, RefreshCw, Search, Check, Cast } from 'lucide-react';
import { triggerPresentationCast } from '../services/presentationCast';

export default function TvPairModal({ isOpen, onClose, callId, ws, tvConnected, remoteVideoRef, pairCode, onDisconnectTv }) {
  const [copied, setCopied] = useState(false);
  const [castStatus, setCastStatus] = useState('');

  if (!isOpen) return null;

  const handleScanChromecast = async () => {
    if (!pairCode) return;
    setCastStatus('Opening casting request...');
    const result = await triggerPresentationCast(pairCode);
    if (result.success) {
      setCastStatus(`Connected via ${result.method}`);
    } else {
      setCastStatus(result.error || 'Casting failed. Use PIN code below on TV browser.');
    }
  };

  const tvLink = `${window.location.origin}/tv?code=${pairCode || ''}`;

  const copyLink = () => {
    navigator.clipboard.writeText(tvLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(12, 5, 8, 0.88)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '28px', position: 'relative' }}>
        
        {/* Close Button */}
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#a3969d', cursor: 'pointer' }}>
          <X size={20} />
        </button>

        {/* Modal Title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <img src="/AiroCall.svg" alt="AiroCall" style={{ width: '48px', height: '48px' }} />
            <div style={{ background: 'rgba(255, 85, 0, 0.2)', padding: '10px', borderRadius: '50%', display: 'flex', color: '#ffaa00' }}>
              <Cast size={24} />
            </div>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Stream Call on TV</h2>
          <p style={{ fontSize: '0.8rem', color: '#a3969d', marginTop: '4px' }}>
            Scan Chromecasts on Wi-Fi or enter PIN on TV browser
          </p>
        </div>

        {/* Connection Status Indicator */}
        {tvConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.18)', border: '1px solid rgba(16, 185, 129, 0.35)', color: '#34d399', padding: '12px', borderRadius: '12px', textAlign: 'center', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <CheckCircle2 size={20} /> TV Receiver Connected - Streaming Live
            </div>
            <button
              onClick={() => {
                onDisconnectTv();
                onClose();
              }}
              className="glass-btn glass-btn-danger"
              style={{ width: '100%', padding: '14px', justifyContent: 'center', fontSize: '0.95rem', borderRadius: '14px', background: '#ff0044', borderColor: '#ff3366', color: '#ffffff' }}
            >
              Disconnect TV Stream
            </button>
          </div>
        ) : (
          <>
            {/* Option 1: Mobile Chromecast Scanner & Direct Cast Button */}
            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={handleScanChromecast}
                className="glass-btn glass-btn-primary pulse-glow"
                style={{ width: '100%', padding: '14px', justifyContent: 'center', fontSize: '0.95rem', borderRadius: '14px', gap: '10px' }}
              >
                <Search size={20} /> Scan for Nearby Chromecasts / TV
              </button>
              {castStatus && (
                <span style={{ display: 'block', textAlign: 'center', fontSize: '0.75rem', color: '#ffaa00', marginTop: '6px' }}>
                  {castStatus}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0', opacity: 0.5 }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }} />
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#a3969d' }}>OR MANUAL PAIR</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }} />
            </div>

            {/* Option 2: PIN Code without QR Code */}
            <div style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '20px', borderRadius: '14px', marginBottom: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#a3969d', fontWeight: 600 }}>
                TV PIN Code
              </span>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '4px', color: '#ffaa00', marginTop: '6px', marginBottom: '6px' }}>
                {pairCode ? `${pairCode.substring(0, 3)}-${pairCode.substring(3)}` : <RefreshCw size={24} className="pulse-glow" />}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Enter code on {window.location.host}/tv</span>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#a3969d', textAlign: 'center', marginBottom: '16px', lineHeight: '1.4' }}>
              <strong>Tip:</strong> For a split-screen video call layout, open the TV URL below in your TV's web browser app.
            </div>

            <button onClick={copyLink} className="glass-btn" style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem' }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Link Copied!' : 'Copy Direct TV URL'}
            </button>
          </>
        )}

      </div>
    </div>
  );
}
