import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Camera, CameraOff, Tv, Cast, PhoneOff, Activity, Link, Copy, Users, RefreshCw, AlertTriangle, SwitchCamera, Check } from 'lucide-react';
import TvPairModal from './TvPairModal';
import { BandwidthEngine } from '../services/bandwidthEngine';
import { getMediaStream } from '../services/mediaDevice';
import { triggerPresentationCast } from '../services/presentationCast';

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

export default function VideoCall({ callId, callerLabel = 'Caller 1', ws, onLeaveCall }) {
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState('user');
  const [isTvModalOpen, setIsTvModalOpen] = useState(false);
  const [tvCode, setTvCode] = useState(null);
  const [tvConnected, setTvConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [callEndedByPeer, setCallEndedByPeer] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');
  const [callDuration, setCallDuration] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDataSaver, setIsDataSaver] = useState(false);
  const [castStatus, setCastStatus] = useState('');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const tvPcRef = useRef(null);
  const activeTvPeerIdRef = useRef(null);
  const bwEngineRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);

  // Call Timer Counter
  useEffect(() => {
    if (peerConnected) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [peerConnected]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  useEffect(() => {
    async function initCall() {
      // 1. Get Local Camera & Microphone
      const { stream } = await getMediaStream(
        true,
        true,
        callerLabel,
        callerLabel === 'Caller 1' ? '#3b82f6' : '#06b6d4',
        facingMode
      );

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 2. Attach WebSocket Listener
      if (ws) {
        setupWebRTC(ws, stream);

        const handleMessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'peer-joined' || data.type === 'peer-ready-to-negotiate') {
              if (data.role === 'caller') {
                setPeerConnected(true);
              }
              if (pcRef.current) {
                const offer = await pcRef.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
                await pcRef.current.setLocalDescription(offer);
                ws.send(
                  JSON.stringify({
                    type: 'signal',
                    callId,
                    payload: { targetPeerId: data.peerId || 'broadcast', signalData: { sdp: offer } },
                  })
                );
              }
            } else if (data.type === 'peer-left') {
              if (data.role === 'caller') {
                setPeerConnected(false);
                setConnectionState('disconnected');
              }
            } else if (data.type === 'call-ended') {
              setCallEndedByPeer(true);
              setPeerConnected(false);
            } else if (data.type === 'tv-code-generated') {
              setTvCode(data.code);
            } else if (data.type === 'tv-connected') {
              setTvConnected(true);
              activeTvPeerIdRef.current = data.tvPeerId;
            } else if (data.type === 'tv-request-stream') {
              // TV actively asked for a fresh stream offer (sent right after pairing).
              // This fires even if TV joined before the remote peer connected.
              const tvPeerId = data.tvPeerId;
              if (tvPeerId) {
                activeTvPeerIdRef.current = tvPeerId;
                setTvConnected(true);
              }
              // Always re-run setupTvReceiverConnection here — by this point the
              // remote stream is either already flowing or we send local stream as fallback.
              setupTvReceiverConnection(ws, activeTvPeerIdRef.current || tvPeerId);
            } else if (data.type === 'signal') {
              const { senderPeerId, signalData } = data;

              if (tvPcRef.current && (signalData?.isTvSignal || senderPeerId === activeTvPeerIdRef.current)) {
                handleTvSignal(signalData);
              } else if (pcRef.current) {
                if (signalData.sdp) {
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                  if (signalData.sdp.type === 'offer') {
                    const answer = await pcRef.current.createAnswer();
                    await pcRef.current.setLocalDescription(answer);
                    ws.send(
                      JSON.stringify({
                        type: 'signal',
                        callId,
                        payload: { targetPeerId: senderPeerId, signalData: { sdp: answer } },
                      })
                    );
                  }
                } else if (signalData.candidate) {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                }
              }
            }
          } catch (err) {
            console.error('Signaling error:', err);
          }
        };

        ws.addEventListener('message', handleMessage);
        ws.send(JSON.stringify({ type: 'peer-ready', callId }));
        ws.send(JSON.stringify({ type: 'generate-tv-code', callId }));

        return () => ws.removeEventListener('message', handleMessage);
      }
    }

    initCall();

    return () => {
      if (bwEngineRef.current) bwEngineRef.current.stop();
      if (pcRef.current) pcRef.current.close();
      if (tvPcRef.current) tvPcRef.current.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [callId, callerLabel, ws]);

  const setupWebRTC = (socket, localStream) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
      console.log('Received remote media track from friend:', event.track.kind);
      setPeerConnected(true);
      setConnectionState('connected');

      let remoteStream = null;
      if (remoteVideoRef.current) {
        if (event.streams && event.streams[0]) {
          remoteStream = event.streams[0];
          remoteVideoRef.current.srcObject = remoteStream;
        } else {
          if (!remoteVideoRef.current.srcObject) {
            remoteVideoRef.current.srcObject = new MediaStream();
          }
          remoteVideoRef.current.srcObject.addTrack(event.track);
          remoteStream = remoteVideoRef.current.srcObject;
        }
        remoteVideoRef.current.play().catch((e) => console.warn('Autoplay warning:', e));
      }

      if (activeTvPeerIdRef.current && socket) {
        setupTvReceiverConnection(socket, activeTvPeerIdRef.current);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: 'signal',
            callId,
            payload: { targetPeerId: 'broadcast', signalData: { candidate: event.candidate } },
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectionState('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionState('failed');
      }
    };

    const bwEngine = new BandwidthEngine(pc, (newStats) => setStats(newStats));
    bwEngine.start();
    bwEngineRef.current = bwEngine;
  };

  const setupTvReceiverConnection = async (socket, tvPeerId) => {
    if (tvPcRef.current) tvPcRef.current.close();

    const tvPc = new RTCPeerConnection(ICE_CONFIG);
    tvPcRef.current = tvPc;

    // 1. Add local caller video track (exclude local audio to prevent feedback howling)
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        tvPc.addTrack(track, localStreamRef.current);
      });
    }

    // 2. Add remote caller video & audio tracks (from the friend)
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      const remoteStream = remoteVideoRef.current.srcObject;
      remoteStream.getTracks().forEach((track) => {
        tvPc.addTrack(track, remoteStream);
      });
    }

    tvPc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: 'signal',
            callId,
            payload: { targetPeerId: tvPeerId, signalData: { candidate: event.candidate, isTvSignal: true } },
          })
        );
      }
    };

    const offer = await tvPc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await tvPc.setLocalDescription(offer);

    socket.send(
      JSON.stringify({
        type: 'signal',
        callId,
        payload: { targetPeerId: tvPeerId, signalData: { sdp: offer, isTvSignal: true, resetConnection: true } },
      })
    );
  };

  const handleTvSignal = async (signalData) => {
    if (tvPcRef.current) {
      if (signalData.sdp) {
        await tvPcRef.current.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      } else if (signalData.candidate) {
        await tvPcRef.current.addIceCandidate(new RTCIceCandidate(signalData.candidate));
      }
    }
  };

  const toggleCameraFacingMode = async () => {
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacingMode);

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
    }

    const { stream } = await getMediaStream(
      micEnabled,
      videoEnabled,
      callerLabel,
      callerLabel === 'Caller 1' ? '#3b82f6' : '#06b6d4',
      nextFacingMode
    );

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    if (pcRef.current) {
      const newVideoTrack = stream.getVideoTracks()[0];
      const videoSender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (videoSender && newVideoTrack) {
        videoSender.replaceTrack(newVideoTrack);
      }
    }
  };

  const handleEndCallClick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end-call', callId }));
    }
    onLeaveCall();
  };

  const handleReconnectCall = async () => {
    setConnectionState('connecting');
    if (pcRef.current && ws && ws.readyState === WebSocket.OPEN) {
      try {
        const offer = await pcRef.current.createOffer({ iceRestart: true });
        await pcRef.current.setLocalDescription(offer);
        ws.send(
          JSON.stringify({
            type: 'signal',
            callId,
            payload: { targetPeerId: 'broadcast', signalData: { sdp: offer } },
          })
        );
      } catch (err) {
        console.error('Reconnect failed:', err);
      }
    }
  };

  const copyCallInviteLink = () => {
    const inviteUrl = `${window.location.origin}/?call=${encodeURIComponent(callId)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micEnabled;
        setMicEnabled(!micEnabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoEnabled;
        setVideoEnabled(!videoEnabled);
      }
    }
  };

  const toggleDataSaverMode = () => {
    const newSaverState = !isDataSaver;
    setIsDataSaver(newSaverState);
    if (bwEngineRef.current) {
      bwEngineRef.current.setManualProfile(newSaverState ? 'AUDIO' : 'HD');
    }
  };

  const handlePresentationCastClick = async () => {
    if (!tvCode) {
      setCastStatus('Generating TV PIN Code...');
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'generate-tv-code', callId }));
      }
      return;
    }
    setCastStatus('Opening Smart TV Cast Dialog...');
    const result = await triggerPresentationCast(tvCode);
    if (result.success) {
      setCastStatus('Casting successfully started!');
    } else {
      setCastStatus(result.error || 'Casting failed. Opening manual pairing menu.');
      setIsTvModalOpen(true);
    }
  };

  const handleDisconnectTvClick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tv-disconnect', callId }));
    }
    if (tvPcRef.current) {
      tvPcRef.current.close();
      tvPcRef.current = null;
    }
    setTvConnected(false);
    activeTvPeerIdRef.current = null;
    setCastStatus('Casting stopped.');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000', display: 'flex', flexDirection: 'column', zIndex: 1000, overflow: 'hidden' }}>
      
      {/* WhatsApp-Style Top Header Bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, padding: '16px 20px', background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/AiroCall.svg" alt="AiroCall" style={{ width: '36px', height: '36px' }} />
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>AiroCall Video</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '0.75rem', color: peerConnected ? '#34d399' : '#ffaa00', fontWeight: 600 }}>
                {peerConnected ? formatTimer(callDuration) : 'Waiting for friend...'}
              </span>
              {tvConnected && (
                <span style={{ fontSize: '0.7rem', background: 'rgba(255,85,0,0.25)', color: '#ffaa00', padding: '2px 8px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Tv size={12} /> TV Streaming
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {castStatus && (
            <span style={{ fontSize: '0.7rem', color: '#ffaa00', marginRight: '6px' }}>
              {castStatus}
            </span>
          )}

          <button
            onClick={handlePresentationCastClick}
            className={`glass-btn ${tvConnected ? 'glass-btn-primary pulse-glow' : ''}`}
            style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, justifyContent: 'center', background: tvConnected ? 'linear-gradient(135deg, #ff0044, #ff5500)' : 'rgba(255, 255, 255, 0.1)' }}
            title="Smart TV split-screen stream"
          >
            <Cast size={18} color={tvConnected ? '#ffffff' : '#ffaa00'} />
          </button>

          <button
            onClick={copyCallInviteLink}
            className="glass-btn glass-btn-primary"
            style={{ padding: '8px 14px', fontSize: '0.75rem', borderRadius: '20px' }}
          >
            {copiedLink ? <Check size={14} /> : <Link size={14} />}
            {copiedLink ? 'Link Copied' : 'Copy Invite'}
          </button>
        </div>
      </div>

      {/* Connection Stuck / Interrupted Retry Banner Overlay */}
      {connectionState === 'failed' && !callEndedByPeer && (
        <div style={{ position: 'absolute', top: '70px', left: '16px', right: '16px', zIndex: 60, background: 'rgba(244, 63, 94, 0.9)', backdropFilter: 'blur(10px)', color: '#ffffff', padding: '12px 18px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', fontWeight: 600 }}>
            <AlertTriangle size={20} /> Connection stuck or interrupted.
          </div>
          <button
            onClick={handleReconnectCall}
            className="glass-btn"
            style={{ background: '#ffffff', color: '#0f172a', border: 'none', padding: '6px 14px', fontSize: '0.8rem', borderRadius: '10px', fontWeight: 700 }}
          >
            <RefreshCw size={14} /> Reconnect Now
          </button>
        </div>
      )}

      {/* Call Ended by Friend Overlay */}
      {callEndedByPeer && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(12, 5, 8, 0.95)', backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', zIndex: 100 }}>
          <div style={{ background: 'rgba(244, 63, 94, 0.2)', padding: '24px', borderRadius: '50%', marginBottom: '20px' }}>
            <PhoneOff size={48} color="#fda4af" />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>Call Ended</h2>
          <p style={{ fontSize: '0.95rem', color: '#a3969d', marginBottom: '24px' }}>
            Your friend has ended the video call.
          </p>
          <button onClick={onLeaveCall} className="glass-btn glass-btn-primary" style={{ padding: '14px 28px', fontSize: '1rem', borderRadius: '16px' }}>
            Return to Home
          </button>
        </div>
      )}

      {/* Main Video View Display */}
      <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        
        {/* Remote Caller Video Stream (object-fit: contain for portrait vs landscape) */}
        <video ref={remoteVideoRef} autoPlay playsInline disableRemotePlayback={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

        {/* Waiting for Friend Banner overlay when alone */}
        {!peerConnected && !callEndedByPeer && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(12, 5, 8, 0.88)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', zIndex: 4 }}>
            <div style={{ background: 'rgba(255, 85, 0, 0.2)', padding: '24px', borderRadius: '50%', marginBottom: '20px' }}>
              <Users size={52} color="#ffaa00" className="pulse-glow" />
            </div>
            <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '8px' }}>Waiting for Friend</h3>
            <p style={{ fontSize: '0.9rem', color: '#a3969d', maxWidth: '340px', marginBottom: '24px' }}>
              Share your instant call link with a friend to start video calling!
            </p>
            <button onClick={copyCallInviteLink} className="glass-btn glass-btn-primary" style={{ padding: '14px 28px', fontSize: '1rem', borderRadius: '16px' }}>
              {copiedLink ? <Check size={18} /> : <Copy size={18} />}
              {copiedLink ? 'Link Copied to Clipboard' : 'Copy Call Invite Link'}
            </button>
          </div>
        )}

        {/* Audio Only Overlay if Manual Data Saver Activated */}
        {isDataSaver && (
          <div style={{ position: 'absolute', inset: 0, background: '#090d16', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            <div style={{ background: 'rgba(168, 85, 247, 0.2)', padding: '24px', borderRadius: '50%', marginBottom: '12px' }}>
              <Mic size={48} color="#c084fc" className="pulse-glow" />
            </div>
            <h3 style={{ fontSize: '1.2rem', color: '#c084fc', fontWeight: 700 }}>Audio-Only Data Saver Active</h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>Video paused. Tap Data Saver button below to resume video.</p>
          </div>
        )}

        {/* Floating PiP Local Preview */}
        <div className="pip-preview" style={{ position: 'absolute', top: '80px', right: '16px', width: '110px', height: '150px', borderRadius: '16px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.25)', boxShadow: '0 12px 32px rgba(0,0,0,0.8)', zIndex: 20, background: '#000' }}>
          <video ref={localVideoRef} autoPlay playsInline muted disableRemotePlayback={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: videoEnabled ? 'block' : 'none' }} />
          {!videoEnabled && (
            <div style={{ width: '100%', height: '100%', background: '#1e1b1d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a3969d' }}>
              <CameraOff size={24} color="#ffaa00" />
              <span style={{ fontSize: '0.65rem', marginTop: '4px', fontWeight: 600 }}>Camera Off</span>
            </div>
          )}
        </div>

      </div>

      {/* Floating Bottom Action Toolbar */}
      <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(28, 12, 18, 0.88)', backdropFilter: 'blur(20px)', padding: '12px 20px', borderRadius: '40px', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
        <button
          onClick={toggleMic}
          className={`glass-btn ${micEnabled ? '' : 'glass-btn-danger'}`}
          style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, justifyContent: 'center' }}
          title={micEnabled ? 'Mute Mic' : 'Unmute Mic'}
        >
          {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Camera On / Camera Off Toggle Button */}
        <button
          onClick={toggleVideo}
          className={`glass-btn ${videoEnabled ? '' : 'glass-btn-danger'}`}
          style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, justifyContent: 'center' }}
          title={videoEnabled ? 'Turn Camera Off' : 'Turn Camera On'}
        >
          {videoEnabled ? <Camera size={20} /> : <CameraOff size={20} />}
        </button>

        {/* Camera Switcher (Front <-> Rear) */}
        <button
          onClick={toggleCameraFacingMode}
          className="glass-btn"
          style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, justifyContent: 'center' }}
          title="Switch Camera (Front/Rear)"
        >
          <SwitchCamera size={20} />
        </button>

        {/* Stream to TV Button */}
        <button
          onClick={() => setIsTvModalOpen(true)}
          className={`glass-btn ${tvConnected ? 'glass-btn-primary pulse-glow' : ''}`}
          style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, justifyContent: 'center', background: tvConnected ? 'linear-gradient(135deg, #ff0044, #ff5500)' : 'rgba(255, 85, 0, 0.2)' }}
          title="Stream to TV / Scan Chromecasts"
        >
          <Tv size={20} color={tvConnected ? '#ffffff' : '#ffaa00'} />
        </button>

        {/* ICE Reconnect & Retry Button */}
        <button
          onClick={handleReconnectCall}
          className="glass-btn"
          style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, justifyContent: 'center' }}
          title="Reconnect / Retry Call"
        >
          <RefreshCw size={18} />
        </button>

        {/* End Call Button */}
        <button
          onClick={handleEndCallClick}
          className="glass-btn glass-btn-danger"
          style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, justifyContent: 'center', background: '#ff0044', borderColor: '#ff3366' }}
          title="End Call"
        >
          <PhoneOff size={20} color="#ffffff" />
        </button>
      </div>

      {/* TV Pairing Modal */}
      <TvPairModal
        isOpen={isTvModalOpen}
        onClose={() => setIsTvModalOpen(false)}
        callId={callId}
        ws={ws}
        tvConnected={tvConnected}
        remoteVideoRef={remoteVideoRef}
        pairCode={tvCode}
        onDisconnectTv={handleDisconnectTvClick}
      />

    </div>
  );
}
