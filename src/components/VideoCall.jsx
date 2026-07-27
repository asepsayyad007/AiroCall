import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Camera, CameraOff, Tv, Cast, PhoneOff, Link, Copy, Users, RefreshCw, AlertTriangle, SwitchCamera, Check, MoreVertical } from 'lucide-react';
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
  const [stats, setStats] = useState(null);

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
              // Stop all media and close connections immediately
              if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
              }
              if (tvPcRef.current) {
                tvPcRef.current.close();
                tvPcRef.current = null;
              }
              if (bwEngineRef.current) {
                bwEngineRef.current.stop();
                bwEngineRef.current = null;
              }
              if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((t) => t.stop());
                localStreamRef.current = null;
              }
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
              }
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
              }
            } else if (data.type === 'tv-code-generated') {
              setTvCode(data.code);
            } else if (data.type === 'tv-connected') {
              setTvConnected(true);
              activeTvPeerIdRef.current = data.tvPeerId;
            } else if (data.type === 'tv-request-stream') {
              const tvPeerId = data.tvPeerId;
              if (tvPeerId) {
                activeTvPeerIdRef.current = tvPeerId;
                setTvConnected(true);
              }
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
      setPeerConnected(true);
      setConnectionState('connected');

      if (remoteVideoRef.current) {
        if (event.streams && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        } else {
          if (!remoteVideoRef.current.srcObject) {
            remoteVideoRef.current.srcObject = new MediaStream();
          }
          remoteVideoRef.current.srcObject.addTrack(event.track);
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

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        tvPc.addTrack(track, localStreamRef.current);
      });
    }

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

    // Replace track on the caller-to-caller peer connection
    if (pcRef.current) {
      const newVideoTrack = stream.getVideoTracks()[0];
      const videoSender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (videoSender && newVideoTrack) {
        await videoSender.replaceTrack(newVideoTrack);
      }
    }

    // Also replace track on the caller-to-TV peer connection to prevent TV stream from freezing
    if (tvPcRef.current && activeTvPeerIdRef.current) {
      const newVideoTrack = stream.getVideoTracks()[0];
      const tvVideoSender = tvPcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (tvVideoSender && newVideoTrack) {
        await tvVideoSender.replaceTrack(newVideoTrack);
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
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 1000 }}>

      {/* ─── Top Bar ─── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '14px 20px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Left: Call Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/AiroCall.svg" alt="" style={{ width: '28px', height: '28px', opacity: 0.9 }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {peerConnected ? callerLabel : 'AiroCall'}
              </span>
              {tvConnected && (
                <span className="badge badge-brand" style={{ fontSize: '0.6rem', padding: '2px 7px' }}>
                  <Tv size={10} /> TV
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {peerConnected ? formatTimer(callDuration) : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={copyCallInviteLink}
            className="glass-btn"
            style={{ padding: '7px 12px', fontSize: '0.75rem', borderRadius: 'var(--radius-full)', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
            aria-label="Copy invite link"
          >
            {copiedLink ? <Check size={14} /> : <Link size={14} />}
            <span style={{ display: 'none' }}>{/* icon-only on mobile */}</span>
            {copiedLink ? 'Copied' : 'Invite'}
          </button>
        </div>
      </div>

      {/* ─── Connection Failed Banner ─── */}
      {connectionState === 'failed' && !callEndedByPeer && (
        <div className="animate-slide-down" style={{
          position: 'absolute', top: '64px', left: '16px', right: '16px', zIndex: 60,
          background: 'var(--color-danger-muted)', border: '1px solid rgba(239,68,68,0.3)',
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 500, color: '#fca5a5' }}>
            <AlertTriangle size={16} /> Connection interrupted
          </div>
          <button onClick={handleReconnectCall} className="glass-btn" style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: 'var(--radius-full)' }}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* ─── Call Ended Overlay ─── */}
      {callEndedByPeer && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'var(--bg-overlay)', backdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '24px', textAlign: 'center',
        }}>
          <div className="animate-fade-in-scale" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--color-danger-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <PhoneOff size={36} color="#fca5a5" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>Call Ended</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '28px' }}>
              The other participant has left the call.
            </p>
            <button onClick={onLeaveCall} className="glass-btn glass-btn-primary" style={{ padding: '14px 32px', fontSize: '0.95rem', borderRadius: 'var(--radius-lg)' }}>
              Return Home
            </button>
          </div>
        </div>
      )}

      {/* ─── Main Video Area ─── */}
      <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Remote Video */}
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

        {/* Waiting for Peer Overlay */}
        {!peerConnected && !callEndedByPeer && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 4,
            background: 'var(--bg-overlay)', backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '24px', textAlign: 'center',
          }}>
            <div className="animate-fade-in-scale" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--brand-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <Users size={36} color="var(--brand-primary)" className="pulse-glow" />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '8px' }}>Waiting for participant</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '300px', marginBottom: '24px' }}>
                Share the invite link so your friend can join.
              </p>
              <button onClick={copyCallInviteLink} className="glass-btn glass-btn-primary" style={{ padding: '12px 24px', fontSize: '0.9rem', borderRadius: 'var(--radius-lg)' }}>
                {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                {copiedLink ? 'Link Copied' : 'Copy Invite Link'}
              </button>
            </div>
          </div>
        )}

        {/* Audio-Only Data Saver Overlay */}
        {isDataSaver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5,
            background: 'var(--bg-main)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <Mic size={32} color="#c084fc" className="pulse-glow" />
            </div>
            <h3 style={{ fontSize: '1.1rem', color: '#c084fc', fontWeight: 600 }}>Audio Only</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>Data saver active. Video is paused.</p>
          </div>
        )}

        {/* ─── PiP Local Preview ─── */}
        <div style={{
          position: 'absolute', top: '72px', right: '14px', zIndex: 20,
          width: '120px', height: '160px',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.15)',
          boxShadow: 'var(--shadow-lg)',
          background: '#111',
        }}>
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: videoEnabled ? 'block' : 'none' }} />
          {!videoEnabled && (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}>
              <CameraOff size={22} />
              <span style={{ fontSize: '0.6rem', marginTop: '4px', fontWeight: 500 }}>Off</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Toolbar ─── */}
      <div style={{
        position: 'absolute', bottom: '0', left: 0, right: 0, zIndex: 50,
        padding: '16px 0 32px',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          {/* Mic Toggle */}
          <button
            onClick={toggleMic}
            className={`btn-icon btn-icon-lg ${!micEnabled ? 'btn-icon-muted' : ''}`}
            aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
            title={micEnabled ? 'Mute' : 'Unmute'}
          >
            {micEnabled ? <Mic size={22} /> : <MicOff size={22} />}
          </button>

          {/* Camera Toggle */}
          <button
            onClick={toggleVideo}
            className={`btn-icon btn-icon-lg ${!videoEnabled ? 'btn-icon-muted' : ''}`}
            aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            title={videoEnabled ? 'Camera Off' : 'Camera On'}
          >
            {videoEnabled ? <Camera size={22} /> : <CameraOff size={22} />}
          </button>

          {/* Switch Camera */}
          <button
            onClick={toggleCameraFacingMode}
            className="btn-icon btn-icon-lg"
            aria-label="Switch camera"
            title="Switch Camera"
          >
            <SwitchCamera size={22} />
          </button>

          {/* TV Stream */}
          <button
            onClick={() => setIsTvModalOpen(true)}
            className={`btn-icon btn-icon-lg ${tvConnected ? 'btn-icon-active' : ''}`}
            aria-label="Stream to TV"
            title="Stream to TV"
          >
            <Tv size={22} />
          </button>

          {/* End Call */}
          <button
            onClick={handleEndCallClick}
            className="btn-icon btn-icon-lg btn-icon-danger"
            aria-label="End call"
            title="End Call"
          >
            <PhoneOff size={22} />
          </button>

        </div>
      </div>

      {/* ─── TV Pairing Modal ─── */}
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
