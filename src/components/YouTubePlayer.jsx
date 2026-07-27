import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, Square, Volume2 } from 'lucide-react';

// Load YouTube iframe API once
let ytApiLoaded = false;
let ytApiPromise = null;

function loadYouTubeAPI() {
  if (ytApiLoaded) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      ytApiLoaded = true;
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      resolve();
    };
  });
  return ytApiPromise;
}

export default function YouTubePlayer({ videoId, isHost, onSyncEvent, syncState }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const ignoreNextEvent = useRef(false);
  const syncIntervalRef = useRef(null);

  // Initialize YouTube player
  useEffect(() => {
    let mounted = true;

    loadYouTubeAPI().then(() => {
      if (!mounted || !containerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            setDuration(event.target.getDuration());
          },
          onStateChange: (event) => {
            if (ignoreNextEvent.current) {
              ignoreNextEvent.current = false;
              return;
            }
            const time = event.target.getCurrentTime();
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              onSyncEvent({ action: 'play', time });
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              onSyncEvent({ action: 'pause', time });
            }
          },
        },
      });

      // Periodic time update for progress bar
      syncIntervalRef.current = setInterval(() => {
        if (playerRef.current && playerRef.current.getCurrentTime) {
          setCurrentTime(playerRef.current.getCurrentTime());
          setDuration(playerRef.current.getDuration ? playerRef.current.getDuration() : 0);
        }
      }, 1000);

      // If host, send periodic sync pulse
      if (isHost) {
        const hostSync = setInterval(() => {
          if (playerRef.current && playerRef.current.getCurrentTime) {
            onSyncEvent({ action: 'sync-check', time: playerRef.current.getCurrentTime() });
          }
        }, 10000);
        return () => clearInterval(hostSync);
      }
    });

    return () => {
      mounted = false;
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // Handle incoming sync events from other participant
  useEffect(() => {
    if (!syncState || !playerRef.current) return;

    ignoreNextEvent.current = true;

    if (syncState.action === 'play') {
      playerRef.current.seekTo(syncState.time, true);
      playerRef.current.playVideo();
      setIsPlaying(true);
    } else if (syncState.action === 'pause') {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else if (syncState.action === 'seek') {
      playerRef.current.seekTo(syncState.time, true);
    } else if (syncState.action === 'sync-check') {
      // Drift correction: if more than 3s out of sync, auto-seek
      const myTime = playerRef.current.getCurrentTime();
      if (Math.abs(myTime - syncState.time) > 3) {
        playerRef.current.seekTo(syncState.time, true);
      }
    }
  }, [syncState]);

  const handlePlayPause = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handleSeek = (e) => {
    if (!playerRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const seekTime = pct * duration;
    playerRef.current.seekTo(seekTime, true);
    onSyncEvent({ action: 'seek', time: seekTime });
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#000', position: 'relative' }}>
      {/* YouTube Player Container */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
        <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      </div>

      {/* Custom Controls Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px',
        background: 'rgba(20, 18, 28, 0.9)',
        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
      }}>
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          className="btn-icon"
          style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.1)', border: 'none' }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        {/* Time */}
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', minWidth: '40px' }}>
          {formatTime(currentTime)}
        </span>

        {/* Progress Bar */}
        <div
          onClick={handleSeek}
          style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', cursor: 'pointer', position: 'relative' }}
        >
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--brand-primary)', borderRadius: '2px', transition: 'width 0.3s linear' }} />
        </div>

        {/* Duration */}
        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: '40px' }}>
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
