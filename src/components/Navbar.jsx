import React, { useState, useEffect } from 'react';
import { Video, Tv, Activity } from 'lucide-react';

export default function Navbar({ currentMode, setMode }) {
  const [serverHealth, setServerHealth] = useState(null);

  useEffect(() => {
    const fetchHealth = () => {
      fetch('/api/health')
        .then((res) => res.json())
        .then((data) => setServerHealth(data))
        .catch(() => setServerHealth(null));
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid var(--border-subtle)', background: 'rgba(10, 10, 15, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>

        {/* Brand */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          onClick={() => setMode('caller')}
          role="button"
          tabIndex={0}
          aria-label="Go to home"
        >
          <img src="/AiroCall.svg" alt="" style={{ width: '36px', height: '36px' }} />
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.1, color: 'var(--text-primary)' }}>
              AiroCall
            </h1>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
              Video &middot; TV Stream
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setMode('caller')}
            className={currentMode === 'caller' ? 'glass-btn glass-btn-primary' : 'glass-btn glass-btn-ghost'}
            style={{ padding: '7px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)' }}
            aria-current={currentMode === 'caller' ? 'page' : undefined}
          >
            <Video size={15} /> Calls
          </button>

          <button
            onClick={() => setMode('tv')}
            className={currentMode === 'tv' ? 'glass-btn glass-btn-primary' : 'glass-btn glass-btn-ghost'}
            style={{ padding: '7px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)' }}
            aria-current={currentMode === 'tv' ? 'page' : undefined}
          >
            <Tv size={15} /> TV
          </button>
        </nav>

        {/* Server Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          <div className="status-dot" style={{ width: '6px', height: '6px' }} />
          <span style={{ display: 'none' }}>{/* Hidden on mobile via CSS if needed */}</span>
          <span>
            {serverHealth ? `${serverHealth.memory.rssMB} MB` : 'Online'}
          </span>
        </div>

      </div>
    </header>
  );
}
