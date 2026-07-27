import React, { useState, useEffect, useRef } from 'react';
import { Tv, Wifi, Volume2, PhoneOff, RefreshCw, AlertCircle } from 'lucide-react';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  iceCandidatePoolSize: 4,
};

function TvVideoPlayer({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = false;
      videoRef.current.play().catch((e) => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().then(() => {
            setTimeout(() => {
              if (videoRef.current) videoRef.current.muted = false;
            }, 500);
          }).catch(() => {});
        }
      });
    }
  }, [stream]);

  useEffect(() => {
    const unmute = () => {
      if (videoRef.current && videoRef.current.muted) {
        videoRef.current.muted = false;
      }
    };
    window.addEventListener('click', unmute, { once: true });
    window.addEventListener('touchstart', unmute, { once: true });
    window.addEventListener('keydown', unmute, { once: true });
    return () => {
      window.removeEventListener('click', unmute);
      window.removeEventListener('touchstart', unmute);
      window.removeEventListener('keydown', unmute);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, background: '#000', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}

export default function TvReceiver({ initialCode, wsUrl }) {
  const [pinCode, setPinCode] = useState(initialCode || '');
  const [status, setStatus] = useState(initialCode ? 'pairing' : 'idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeCallId, setActiveCallId] = useState(null);
  const activeCallIdRef = useRef(null);
  const [isCallEnded, setIsCallEnded] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const keepAliveRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pairedCodeRef = useRef(null);

  const [streamIds, setStreamIds] = useState([]);
  const streamsMapRef = useRef(new Map());

  const [showHeader, setShowHeader] = useState(true);
  const hideTimeoutRef = useRef(null);

  const cleanupStreams = () => {
    streamsMapRef.current.clear();
    setStreamIds([]);
  };

  const resetHideTimer = () => {
    setShowHeader(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => setShowHeader(false), 4000);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pcRef.current) pcRef.current.close();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000);
      }
    };
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      resetHideTimer();
      const handler = resetHideTimer;
      window.addEventListener('mousemove', handler);
      window.addEventListener('keydown', handler);
      window.addEventListener('click', handler);

      return () => {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        window.removeEventListener('mousemove', handler);
        window.removeEventListener('keydown', handler);
        window.removeEventListener('click', handler);
      };
    }
  }, [status]);

  useEffect(() => {
    if (initialCode) {
      setPinCode(initialCode);
      pairedCodeRef.current = initialCode;
      handlePair(initialCode);
    }
  }, [initialCode]);

  // ─── WebSocket keep-alive: ping every 20s to prevent server timeout ───
  const startKeepAlive = (socket) => {
    if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    keepAliveRef.current = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  };

  const stopKeepAlive = () => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  };

  // ─── Auto-retry: reconnect TV stream when WebSocket/peer drops ───
  const attemptReconnect = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    setReconnecting(true);
    reconnectTimerRef.current = setTimeout(() => {
      const callId = activeCallIdRef.current;
      if (callId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Re-request stream from caller
        cleanupStreams();
        if (pcRef.current) pcRef.current.close();
        setupWebRTC(wsRef.current, callId);
        wsRef.current.send(JSON.stringify({ type: 'tv-request-stream', callId }));
        setReconnecting(false);
      } else {
        // WebSocket is dead — full reconnect
        setReconnecting(false);
        setStatus('idle');
        setErrorMsg('Connection lost. Please re-enter the PIN.');
      }
    }, 2000);
  };

  const handlePair = (codeToUse) => {
    const targetCode = codeToUse || pinCode;
    if (!targetCode || targetCode.length < 6) {
      setErrorMsg('Please enter a valid 6-digit PIN code.');
      return;
    }

    pairedCodeRef.current = targetCode;
    setStatus('pairing');
    setErrorMsg('');
    setIsCallEnded(false);
    setReconnecting(false);
    cleanupStreams();
    stopKeepAlive();

    // Close existing WS if any
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000);
    }

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'verify-tv-code', payload: { code: targetCode } }));
      startKeepAlive(socket);
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'tv-pair-success') {
          const currentCallId = data.callId;
          activeCallIdRef.current = currentCallId;
          setActiveCallId(currentCallId);
          setStatus('connected');
          setReconnecting(false);
          setupWebRTC(socket, currentCallId);
          socket.send(JSON.stringify({ type: 'tv-request-stream', callId: currentCallId }));
        } else if (data.type === 'tv-disconnected') {
          if (pcRef.current) pcRef.current.close();
          cleanupStreams();
          stopKeepAlive();
          setStatus('idle');
          setErrorMsg('Casting session disconnected by caller.');
        } else if (data.type === 'tv-pair-error') {
          setStatus('error');
          setErrorMsg(data.message || 'Invalid PIN code');
        } else if (data.type === 'call-ended') {
          stopKeepAlive();
          setIsCallEnded(true);
          cleanupStreams();
          if (pcRef.current) pcRef.current.close();
        } else if (data.type === 'peer-left') {
          // A caller left but call might still be active — don't fully end, just clean streams
          cleanupStreams();
        } else if (data.type === 'signal') {
          if (data.signalData.resetConnection) {
            if (pcRef.current) pcRef.current.close();
            cleanupStreams();
            setupWebRTC(wsRef.current, activeCallIdRef.current);
          }
          if (pcRef.current) {
            if (data.signalData.sdp) {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.signalData.sdp));
              if (data.signalData.sdp.type === 'offer') {
                const answer = await pcRef.current.createAnswer();
                await pcRef.current.setLocalDescription(answer);
                const resolvedCallId = data.callId || activeCallIdRef.current;
                socket.send(
                  JSON.stringify({
                    type: 'signal',
                    callId: resolvedCallId,
                    payload: { targetPeerId: data.senderPeerId, signalData: { sdp: answer } },
                  })
                );
              }
            } else if (data.signalData.candidate) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(data.signalData.candidate));
            }
          }
        }
        // Ignore 'pong' or unknown types silently
      } catch (err) {
        console.error('TV Receiver error:', err);
      }
    };

    socket.onclose = (event) => {
      stopKeepAlive();
      // If we were connected and it wasn't intentional, try to reconnect
      if (status === 'connected' && event.code !== 1000 && !isCallEnded) {
        setReconnecting(true);
        // Attempt to re-establish full connection after 3s
        reconnectTimerRef.current = setTimeout(() => {
          handlePair(pairedCodeRef.current);
        }, 3000);
      }
    };

    socket.onerror = () => {
      setStatus('error');
      setErrorMsg('Could not connect to signaling server.');
    };
  };

  const setupWebRTC = (socket, targetCallId) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      if (!streamsMapRef.current.has(stream.id)) {
        streamsMapRef.current.set(stream.id, stream);
        setStreamIds(Array.from(streamsMapRef.current.keys()));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'signal',
            callId: targetCallId,
            payload: { targetPeerId: 'broadcast', signalData: { candidate: event.candidate } },
          })
        );
      }
    };

    // Auto-retry when peer connection fails
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        attemptReconnect();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        attemptReconnect();
      }
    };
  };

  // ─── Idle / Pairing Screen ───
  if (status === 'idle' || status === 'pairing' || status === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)', padding: '24px 16px' }}>
        <div className="animate-fade-in-scale" style={{ width: '100%', maxWidth: '400px' }}>
          <div className="glass-panel" style={{ padding: '40px 32px', textAlign: 'center' }}>

            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '72px', height: '72px', borderRadius: '20px', background: 'var(--brand-primary-muted)', marginBottom: '20px' }}>
              <Tv size={32} color="var(--brand-primary)" />
            </div>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '6px' }}>Smart TV Receiver</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '28px' }}>
              Enter the 6-digit PIN shown on the caller's screen.
            </p>

            {errorMsg && (
              <div className="animate-fade-in" style={{ background: 'var(--color-danger-muted)', border: '1px solid rgba(239,68,68,0.25)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#fca5a5' }}>
                <AlertCircle size={16} />
                {errorMsg}
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <input
                type="text"
                className="input"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '8px', padding: '18px' }}
                aria-label="TV pairing PIN code"
              />
            </div>

            <button
              onClick={() => handlePair()}
              className="glass-btn glass-btn-primary"
              disabled={status === 'pairing'}
              style={{ width: '100%', padding: '14px', fontSize: '0.95rem', fontWeight: 600, borderRadius: 'var(--radius-lg)', opacity: status === 'pairing' ? 0.7 : 1 }}
            >
              {status === 'pairing' ? (
                <><RefreshCw size={18} className="pulse-glow" /> Connecting...</>
              ) : (
                <><Wifi size={18} /> Connect to Call</>
              )}
            </button>

          </div>
        </div>
      </div>
    );
  }

  // ─── Connected: Streaming View ───
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 1000 }}>

      {/* Call Ended Overlay */}
      {isCallEnded && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'var(--bg-overlay)', backdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '32px', textAlign: 'center',
        }}>
          <div className="animate-fade-in-scale" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: 'var(--color-danger-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <PhoneOff size={40} color="#fca5a5" />
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>Call Ended</h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '380px', marginBottom: '28px' }}>
              The video call has ended.
            </p>
            <button
              onClick={() => { setStatus('idle'); setIsCallEnded(false); stopKeepAlive(); }}
              className="glass-btn glass-btn-primary"
              style={{ padding: '14px 28px', fontSize: '1rem', borderRadius: 'var(--radius-lg)' }}
            >
              <RefreshCw size={18} /> New PIN
            </button>
          </div>
        </div>
      )}

      {/* Reconnecting Banner */}
      {reconnecting && !isCallEnded && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 90,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
          padding: '20px 32px', borderRadius: 'var(--radius-lg)', textAlign: 'center',
          border: '1px solid var(--border-subtle)',
        }}>
          <RefreshCw size={24} className="pulse-glow" style={{ marginBottom: '8px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Reconnecting stream...</p>
        </div>
      )}

      {/* Auto-Hiding Top Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '16px 24px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out)',
        opacity: showHeader ? 1 : 0,
        transform: showHeader ? 'translateY(0)' : 'translateY(-10px)',
        pointerEvents: showHeader ? 'auto' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Tv size={22} color="var(--brand-primary)" />
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>AiroCall TV</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Call {activeCallId} &middot; Live Stream
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
            <div className="status-dot" style={{ width: '6px', height: '6px' }} />
            LIVE
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Volume2 size={14} /> Audio
          </div>
        </div>
      </div>

      {/* Video Grid */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: streamIds.length > 1 ? '1fr 1fr' : '1fr',
        gridTemplateRows: '1fr',
        gap: streamIds.length > 1 ? '2px' : '0',
        background: '#000',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {streamIds.map((id) => (
          <TvVideoPlayer key={id} stream={streamsMapRef.current.get(id)} />
        ))}

        {streamIds.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
            <div className="animate-fade-in" style={{ textAlign: 'center' }}>
              <Wifi size={36} className="pulse-glow" style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ fontSize: '0.9rem' }}>Waiting for video stream...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
