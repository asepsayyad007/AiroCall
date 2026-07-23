import React, { useState, useEffect, useRef } from 'react';
import { Tv, AlertCircle, Wifi, Volume2, ShieldCheck, PhoneOff, RefreshCw } from 'lucide-react';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

function TvVideoPlayer({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) => {
        console.warn('TV Autoplay blocked unmuted audio, retrying muted:', e);
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch((err) => console.error('Muted autoplay also blocked:', err));
        }
      });
    }
  }, [stream]);

  return (
    <div style={{ position: 'relative', background: '#000000', width: '100%', height: '100%', borderRadius: '16px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
  const pcRef = useRef(null);
  const wsRef = useRef(null);

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
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      setShowHeader(false);
    }, 4000);
  };

  useEffect(() => {
    if (status === 'connected') {
      resetHideTimer();
      window.addEventListener('mousemove', resetHideTimer);
      window.addEventListener('keydown', resetHideTimer);
      window.addEventListener('click', resetHideTimer);
      
      return () => {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        window.removeEventListener('mousemove', resetHideTimer);
        window.removeEventListener('keydown', resetHideTimer);
        window.removeEventListener('click', resetHideTimer);
      };
    }
  }, [status]);

  useEffect(() => {
    if (initialCode) {
      setPinCode(initialCode);
      handlePair(initialCode);
    }
  }, [initialCode]);

  const handlePair = (codeToUse) => {
    const targetCode = codeToUse || pinCode;
    if (!targetCode || targetCode.length < 6) {
      setErrorMsg('Please enter a valid 6-digit PIN code.');
      return;
    }

    setStatus('pairing');
    setErrorMsg('');
    setIsCallEnded(false);
    cleanupStreams();

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'verify-tv-code',
          payload: { code: targetCode },
        })
      );
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'tv-pair-success') {
          const currentCallId = data.callId;
          activeCallIdRef.current = currentCallId;
          setActiveCallId(currentCallId);
          setStatus('connected');
          setupWebRTC(socket, currentCallId);
          
          socket.send(
            JSON.stringify({
              type: 'tv-request-stream',
              callId: currentCallId,
            })
          );
        } else if (data.type === 'tv-disconnected') {
          if (pcRef.current) pcRef.current.close();
          cleanupStreams();
          setStatus('idle');
          setErrorMsg('Casting session disconnected.');
        } else if (data.type === 'tv-pair-error') {
          setStatus('error');
          setErrorMsg(data.message || 'Invalid PIN code');
        } else if (data.type === 'call-ended' || data.type === 'peer-left') {
          setIsCallEnded(true);
          cleanupStreams();
        } else if (data.type === 'signal') {
          if (data.signalData.resetConnection) {
            console.log('TV resetting WebRTC connection for renegotiation...');
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
      } catch (err) {
        console.error('TV Receiver error:', err);
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
      console.log('TV Receiver media track received:', event.track.kind);
      const stream = event.streams[0];
      if (!stream) return;

      if (!streamsMapRef.current.has(stream.id)) {
        streamsMapRef.current.set(stream.id, stream);
        setStreamIds(Array.from(streamsMapRef.current.keys()));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: 'signal',
            callId: targetCallId,
            payload: { targetPeerId: 'broadcast', signalData: { candidate: event.candidate } },
          })
        );
      }
    };
  };

  return (
    <div style={{ minHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      
      {status === 'connected' ? (
        <div style={{ width: '100%', maxWidth: '1100px', position: 'relative' }}>
          
          {/* Call Ended Fullscreen Overlay for TV */}
          {isCallEnded && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(12, 5, 8, 0.95)', backdropFilter: 'blur(16px)', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', textAlign: 'center' }}>
              <div style={{ background: 'rgba(244, 63, 94, 0.2)', padding: '24px', borderRadius: '50%', marginBottom: '20px' }}>
                <PhoneOff size={56} color="#fda4af" />
              </div>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '8px', color: '#ffffff' }}>Call Disconnected</h2>
              <p style={{ fontSize: '1.1rem', color: '#a3969d', maxWidth: '420px', marginBottom: '28px' }}>
                The video call stream has ended. Enter a new PIN code to pair another stream.
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="glass-btn glass-btn-primary"
                style={{ padding: '16px 32px', fontSize: '1rem', borderRadius: '16px' }}
              >
                <RefreshCw size={18} /> Enter New TV PIN
              </button>
            </div>
          )}

          {/* TV Top Header Overlay */}
          <div 
            className="glass-panel" 
            style={{ 
              position: 'absolute', 
              top: '20px', 
              left: '20px', 
              right: '20px', 
              zIndex: 10, 
              padding: '12px 20px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: showHeader ? 1 : 0,
              transform: showHeader ? 'translateY(0)' : 'translateY(-20px)',
              pointerEvents: showHeader ? 'auto' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Tv size={24} color="#ffaa00" />
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AiroCall Smart TV Receiver</h2>
                <span style={{ fontSize: '0.75rem', color: '#a3969d' }}>Call ID: {activeCallId} | 1080p Live WebRTC Stream</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="badge badge-hd">
                <Wifi size={14} /> LIVE STREAMING
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#34d399' }}>
                <Volume2 size={16} /> TV Audio Output Active
              </div>
            </div>
          </div>

          {/* Video Stream Receiver Split Canvas Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: streamIds.length > 1 ? '1fr 1fr' : '1fr', 
            gap: '20px',
            height: '620px', 
            borderRadius: '24px', 
            border: '2px solid var(--border-glass)',
            background: '#0c0508',
            padding: '16px',
            boxSizing: 'border-box'
          }}>
            {streamIds.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a3969d', width: '100%', height: '100%', gap: '16px' }}>
                <RefreshCw size={36} className="pulse-glow" color="#ffaa00" />
                <span>Waiting for caller streams...</span>
              </div>
            ) : (
              streamIds.map((id) => (
                <TvVideoPlayer key={id} stream={streamsMapRef.current.get(id)} />
              ))
            )}
          </div>

          {/* TV Footer Bar */}
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.8rem', color: '#a3969d' }}>
            AiroCall Smart TV Receiver Active • Ultra Low Latency P2P WebRTC
          </div>

        </div>
      ) : (
        /* Pairing Entry Screen for TV Screen */
        <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ margin: '0 auto 20px', display: 'flex', justifyContent: 'center' }}>
            <img src="/AiroCall.svg" alt="AiroCall Logo" style={{ width: '84px', height: '84px', filter: 'drop-shadow(0 8px 24px rgba(255, 85, 0, 0.6))' }} />
          </div>

          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px', background: 'linear-gradient(90deg, #ffffff, #ffaa00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AiroCall Smart TV
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#a3969d', marginBottom: '32px' }}>
            Enter the 6-digit PIN code displayed on your phone or tablet to project the live call.
          </p>

          <div style={{ marginBottom: '24px' }}>
            <input
              type="text"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              style={{ width: '100%', textAlign: 'center', fontSize: '2.5rem', fontWeight: 800, letterSpacing: '12px', fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.5)', border: '2px solid var(--border-glass)', color: '#ffaa00', padding: '16px', borderRadius: '16px' }}
            />
          </div>

          {errorMsg && (
            <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}

          <button
            onClick={() => handlePair()}
            disabled={status === 'pairing'}
            className={`glass-btn glass-btn-primary ${pinCode.length === 6 && status !== 'pairing' ? 'pulse-glow' : ''}`}
            style={{ width: '100%', padding: '16px', justifyContent: 'center', fontSize: '1.1rem', borderRadius: '14px' }}
          >
            <Tv size={20} /> {status === 'pairing' ? 'Connecting to Call Stream...' : 'Connect TV Receiver'}
          </button>

          <div style={{ marginTop: '24px', fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <ShieldCheck size={14} /> Zero Server Transcoding Footprint (Ultra-fast P2P WebRTC)
          </div>
        </div>
      )}

    </div>
  );
}
