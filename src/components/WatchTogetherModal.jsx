import React, { useState } from 'react';
import { X, Play, Youtube, Link2 } from 'lucide-react';

function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
    /youtube\.com\/shorts\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export default function WatchTogetherModal({ isOpen, onClose, onStart }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleStart = () => {
    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setError('Please paste a valid YouTube URL');
      return;
    }
    setError('');
    setUrl('');
    onStart(videoId);
    onClose();
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
      aria-label="Watch Together"
    >
      <div className="glass-panel animate-fade-in-scale" style={{ width: '100%', maxWidth: '420px', padding: '28px', position: 'relative' }}>

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
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.12)', marginBottom: '14px' }}>
            <Youtube size={28} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>Watch Together</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Paste a YouTube link to watch in sync with your friend
          </p>
        </div>

        {/* URL Input */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ position: 'relative' }}>
            <Link2 size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="url"
              className="input"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(''); }}
              placeholder="https://youtube.com/watch?v=..."
              style={{ paddingLeft: '40px' }}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
            />
          </div>
          {error && (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: '6px' }}>{error}</p>
          )}
        </div>

        {/* Preview thumbnail if valid */}
        {extractVideoId(url) && (
          <div style={{ marginBottom: '16px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <img
              src={`https://img.youtube.com/vi/${extractVideoId(url)}/mqdefault.jpg`}
              alt="Video preview"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStart}
          className="glass-btn glass-btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: '0.95rem', fontWeight: 600, borderRadius: 'var(--radius-lg)' }}
        >
          <Play size={18} /> Start Watching
        </button>

        <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '14px' }}>
          Both participants will see the video in sync. If casting to TV, YouTube plays full-screen.
        </p>
      </div>
    </div>
  );
}
