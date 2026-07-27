import React, { useState } from 'react';
import { X, CheckCircle2, Copy, RefreshCw, Search, Check, Cast } from 'lucide-react';
import { triggerPresentationCast, isPresentationSupported } from '../services/presentationCast';

// Detect mobile/touch devices where Presentation API doesn't work
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 1024);
};

export default function TvPairModal({ isOpen, onClose, callId, ws, tvConnected, remoteVideoRef, pairCode, onDisconnectTv }) {
  const [copied, setCopied] = useState(false);
  const [castStatus, setCastStatus] = useState('');

  if (!isOpen) return null;

  const handleScanChromecast = async () => {
    if (!pairCode) return;
    setCastStatus('Opening casting dialog...');
    const result = await triggerPresentationCast(pairCode);
    if (result.success) {
      setCastStatus(`Connected via ${result.method}`);
    } else {
      setCastStatus(result.error || 'Use PIN code on TV browser instead.');
    }
  };

  const tvLink = `${window.location.origin}/tv?code=${pairCode || ''}`;

  const copyLink = () => {
    navigator.clipboard.writeText(tvLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--bg-overlay)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Stream to TV"
    >
      <div className="glass-panel animate-fade-in-scale" style={{ width: '100%', maxWidth: '400px', padding: '28px', position: 'relative' }}>

        {/* Close */}
        <button
          onClick={onClose}
          className="btn-icon"
          style={{ position: 'absolute', top: '12px', right: '12px', width: '36px', height: '36px', background: 'transparent', border: 'none' }}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '16px', background: 'var(--brand-primary-muted)', marginBottom: '14px' }}>
            <Cast size={26} color="var(--brand-primary)" />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>Stream to TV</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Cast via Chromecast or enter PIN on TV browser
          </p>
        </div>

        {/* Connected State */}
        {tvConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'var(--color-success-muted)', border: '1px solid rgba(34,197,94,0.25)', padding: '12px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-success)' }}>
              <CheckCircle2 size={18} /> TV Connected — Streaming Live
            </div>
            <button
              onClick={() => { onDisconnectTv(); onClose(); }}
              className="glass-btn glass-btn-danger"
              style={{ width: '100%', padding: '13px', justifyContent: 'center', fontSize: '0.9rem', borderRadius: 'var(--radius-md)' }}
            >
              Disconnect TV
            </button>
          </div>
        ) : (
          <>
            {/* Scan Chromecast — Desktop only (Presentation API not supported on mobile) */}
            {!isMobileDevice() && (
              <>
                <button
                  onClick={handleScanChromecast}
                  className="glass-btn glass-btn-primary"
                  style={{ width: '100%', padding: '13px', justifyContent: 'center', fontSize: '0.9rem', borderRadius: 'var(--radius-md)', marginBottom: '6px' }}
                >
                  <Search size={18} /> Scan for Chromecast / TV
                </button>

                {castStatus && (
                  <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-warning)', marginBottom: '12px' }}>
                    {castStatus}
                  </p>
                )}

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.05em' }}>or manual</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                </div>
              </>
            )}

            {/* PIN Code Display */}
            <div style={{ background: 'var(--bg-main)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                TV PIN Code
              </span>
              <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '6px', color: 'var(--brand-primary)', marginTop: '8px', marginBottom: '8px' }}>
                {pairCode ? `${pairCode.substring(0, 3)} ${pairCode.substring(3)}` : <RefreshCw size={22} className="pulse-glow" />}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                Enter on {window.location.host}/tv
              </span>
            </div>

            {/* Tip */}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '16px', lineHeight: '1.5' }}>
              Open the TV URL in your Smart TV's web browser for a split-screen video call layout.
            </p>

            {/* Copy Link */}
            <button
              onClick={copyLink}
              className="glass-btn"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', padding: '11px', borderRadius: 'var(--radius-md)' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy TV Link'}
            </button>
          </>
        )}

      </div>
    </div>
  );
}
