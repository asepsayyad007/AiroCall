import React, { useState, useEffect } from 'react';
import { Video, Tv, Cpu, Activity } from 'lucide-react';

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
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header style={{ borderBottom: '1px solid var(--border-glass)' }} className="glass-panel">
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        
        {/* Brand Logo with AiroCall.svg (Increased Size to match AiroCall text) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setMode('caller')}>
          <img src="/AiroCall.svg" alt="AiroCall Logo" style={{ width: '48px', height: '48px', filter: 'drop-shadow(0 4px 12px rgba(255, 85, 0, 0.7))' }} />
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(90deg, #ffffff, #ffaa00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: '1.1' }}>
              AiroCall
            </h1>
            <p style={{ fontSize: '0.7rem', color: '#a3969d', fontWeight: 500 }}>
              Smart TV WebRTC Streamer
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 0, 0, 0.4)', padding: '4px', borderRadius: '14px', border: '1px solid var(--border-glass)' }}>
          <button
            onClick={() => setMode('caller')}
            className={`glass-btn ${currentMode === 'caller' ? 'glass-btn-primary' : ''}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Video size={16} /> WebRTC Calls
          </button>

          <button
            onClick={() => setMode('tv')}
            className={`glass-btn ${currentMode === 'tv' ? 'glass-btn-primary' : ''}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Tv size={16} /> Smart TV Receiver
          </button>
        </nav>

        {/* VPS Footprint Monitor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(20, 10, 14, 0.8)', padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border-glass)' }}>
          <Cpu size={16} color="#ffaa00" />
          <div style={{ fontSize: '0.75rem' }}>
            <span style={{ color: '#a3969d' }}>Oracle VPS:</span>{' '}
            <strong style={{ color: '#34d399' }}>
              {serverHealth ? `${serverHealth.memory.rssMB} MB RAM` : 'Online (~58MB)'}
            </strong>
          </div>
          <Activity size={14} className="pulse-glow" color="#ff5500" />
        </div>

      </div>
    </header>
  );
}
