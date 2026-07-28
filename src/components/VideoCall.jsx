import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Camera, CameraOff, Tv, Cast, PhoneOff, Link, Copy, Users, RefreshCw, AlertTriangle, SwitchCamera, Check, MoreVertical, Youtube, Square } from 'lucide-react';
import TvPairModal from './TvPairModal';
import WatchTogetherModal from './WatchTogetherModal';
import YouTubePlayer from './YouTubePlayer';
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
  iceCandidatePoolSize: 4, // Pre-gather ICE candidates for faster connection
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
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [isWatchModalOpen, setIsWatchModalOpen] = useState(false);
  const [watchVideoId, setWatchVideoId] = useState(null);
  const [watchSyncState, setWatchSyncState] = useState(null);
  const isWatchHost = useRef(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const tvPcRef = useRef(null);
  const activeTvPeerIdRef = useRef(null);
  const bwEngineRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const pipRef = useRef(null);
  const pipDragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

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

  // Mute mobile speaker when TV is connected (audio plays from TV instead)
  // This prevents echo: TV speaker audio won't be picked up by mobile mic
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = tvConnected;
      remoteVideoRef.current.volume = tvConnected ? 0 : 1;
    }
  }, [tvConnected]);

  // Auto Picture-in-Picture when user switches away from tab/app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        // Enter PiP when user leaves
        if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
          remoteVideoRef.current.requestPictureInPicture().catch(() => {});
        }
      }
    };

    const handlePipExit = () => {
      // When PiP closes and page is visible, do nothing (already back)
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.addEventListener('leavepictureinpicture', handlePipExit);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.removeEventListener('leavepictureinpicture', handlePipExit);
      }
      // Exit PiP on component unmount
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    };
  }, [hasRemoteStream]);

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
            } else if (data.type === 'watch-sync') {
              // Incoming Watch Together event from other participant
              if (data.action === 'start' && data.videoId) {
                setWatchVideoId(data.videoId);
                isWatchHost.current = false;
              } else if (data.action === 'stop') {
                setWatchVideoId(null);
                setWatchSyncState(null);
              } else {
                setWatchSyncState({ action: data.action, time: data.time });
              }
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

    localStream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, localStream);
      // Set encoding priority for low latency
      if (track.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          params.degradationPreference = 'maintain-framerate';
          sender.setParameters(params).catch(() => {});
        } catch (e) {}
      }
    });

    pc.ontrack = (event) => {
      setPeerConnected(true);
      setHasRemoteStream(true);
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

    // Add local video (no audio — echo prevention)
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        const sender = tvPc.addTrack(track, localStreamRef.current);
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          params.degradationPreference = 'maintain-framerate';
          sender.setParameters(params).catch(() => {});
        } catch (e) {}
      });
    }

    // Add remote tracks (video + audio from the other caller)
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

    // Only stop and replace the VIDEO track — keep audio track alive to avoid connection instability
    const oldVideoTracks = localStreamRef.current ? localStreamRef.current.getVideoTracks() : [];
    oldVideoTracks.forEach((t) => t.stop());

    try {
      // Request only video with new facing mode (keep existing audio)
      const videoConstraints = {
        video: { facingMode: nextFacingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false, // Don't request new audio — reuse existing
      };
      const newStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (!newVideoTrack) return;

      // Update local stream: remove old video track, add new one
      if (localStreamRef.current) {
        oldVideoTracks.forEach((t) => localStreamRef.current.removeTrack(t));
        localStreamRef.current.addTrack(newVideoTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      // Replace track on caller-to-caller peer connection
      if (pcRef.current) {
        const videoSender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      // Replace track on caller-to-TV peer connection
      if (tvPcRef.current && activeTvPeerIdRef.current) {
        const tvVideoSender = tvPcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (tvVideoSender) {
          await tvVideoSender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.warn('Camera switch failed:', err.message);
      // Fallback: try full stream replacement
      const { stream } = await getMediaStream(
        micEnabled, videoEnabled, callerLabel,
        callerLabel === 'Caller 1' ? '#3b82f6' : '#06b6d4',
        nextFacingMode
      );
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      if (pcRef.current) {
        const newVideoTrack = stream.getVideoTracks()[0];
        const videoSender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (videoSender && newVideoTrack) await videoSender.replaceTrack(newVideoTrack);
      }
      if (tvPcRef.current && activeTvPeerIdRef.current) {
        const newVideoTrack = stream.getVideoTracks()[0];
        const tvVideoSender = tvPcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (tvVideoSender && newVideoTrack) await tvVideoSender.replaceTrack(newVideoTrack);
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

    // Generate a new TV code for next pairing (old one was consumed)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'generate-tv-code', callId }));
    }
  };

  // ─── Watch Together ───
  const handleStartWatch = (videoId) => {
    setWatchVideoId(videoId);
    isWatchHost.current = true;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'watch-sync', callId,
        payload: { action: 'start', videoId },
      }));
    }
  };

  const handleStopWatch = () => {
    setWatchVideoId(null);
    setWatchSyncState(null);
    isWatchHost.current = false;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'watch-sync', callId,
        payload: { action: 'stop' },
      }));
    }
  };

  const handleWatchSyncEvent = (event) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'watch-sync', callId,
        payload: { action: event.action, time: event.time, videoId: watchVideoId },
      }));
    }
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
      <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, background: '#000', display: 'flex', flexDirection: 'column' }}>

        {/* Remote Video — always rendered, positioned based on mode */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            position: watchVideoId ? 'absolute' : 'relative',
            width: watchVideoId ? '100%' : '100%',
            height: watchVideoId ? '40%' : '100%',
            bottom: watchVideoId ? '0' : 'auto',
            left: 0,
            objectFit: 'contain',
            zIndex: 1,
            borderTop: watchVideoId ? '1px solid rgba(255,255,255,0.08)' : 'none',
          }}
        />

        {/* Watch Together: YouTube Player — top section */}
        {watchVideoId && (
          <div style={{ position: 'relative', width: '100%', height: '60%', zIndex: 2 }}>
            <YouTubePlayer
              videoId={watchVideoId}
              isHost={isWatchHost.current}
              onSyncEvent={handleWatchSyncEvent}
              syncState={watchSyncState}
            />
            <button
              onClick={handleStopWatch}
              style={{
                position: 'absolute', top: '10px', right: '10px', zIndex: 5,
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600,
                background: 'rgba(239, 68, 68, 0.85)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Square size={12} /> Stop
            </button>
          </div>
        )}

        {/* Waiting for Peer Overlay — only show if truly no remote stream */}
        {!peerConnected && !callEndedByPeer && !hasRemoteStream && (
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

        {/* ─── PiP Local Preview (FaceTime-style, draggable) ─── */}
        <div
          ref={pipRef}
          onMouseDown={(e) => {
            const d = pipDragRef.current;
            d.dragging = true;
            d.startX = e.clientX - (pipRef.current.offsetLeft || 0);
            d.startY = e.clientY - (pipRef.current.offsetTop || 0);
            const onMove = (ev) => {
              if (!d.dragging) return;
              const x = Math.max(0, Math.min(window.innerWidth - 140, ev.clientX - d.startX));
              const y = Math.max(0, Math.min(window.innerHeight - 184, ev.clientY - d.startY));
              pipRef.current.style.left = x + 'px';
              pipRef.current.style.top = y + 'px';
              pipRef.current.style.right = 'auto';
            };
            const onUp = () => { d.dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            const d = pipDragRef.current;
            d.dragging = true;
            d.startX = touch.clientX - (pipRef.current.offsetLeft || 0);
            d.startY = touch.clientY - (pipRef.current.offsetTop || 0);
            const onMove = (ev) => {
              if (!d.dragging) return;
              const t = ev.touches[0];
              const x = Math.max(0, Math.min(window.innerWidth - 140, t.clientX - d.startX));
              const y = Math.max(0, Math.min(window.innerHeight - 184, t.clientY - d.startY));
              pipRef.current.style.left = x + 'px';
              pipRef.current.style.top = y + 'px';
              pipRef.current.style.right = 'auto';
            };
            const onUp = () => { d.dragging = false; window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
            window.addEventListener('touchmove', onMove, { passive: true });
            window.addEventListener('touchend', onUp);
          }}
          style={{
            position: 'absolute', top: '72px', right: '14px', zIndex: 20,
            width: '130px', height: '174px',
            borderRadius: '20px',
            overflow: 'hidden',
            border: '3px solid rgba(255,255,255,0.2)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
            background: '#111',
            cursor: 'grab',
            touchAction: 'none',
            transition: 'box-shadow 0.2s',
            userSelect: 'none',
          }}
        >
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: videoEnabled ? 'block' : 'none', pointerEvents: 'none' }} />
          {!videoEnabled && (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}>
              <CameraOff size={24} />
              <span style={{ fontSize: '0.65rem', marginTop: '6px', fontWeight: 500 }}>Paused</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Toolbar (iOS glass) ─── */}
      <div style={{
        position: 'absolute', bottom: '28px', left: '50%', transform: 'translateX(-50%)', zIndex: 50,
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '16px 28px',
        background: 'rgba(30, 28, 40, 0.55)',
        backdropFilter: 'blur(24px) saturate(150%)', WebkitBackdropFilter: 'blur(24px) saturate(150%)',
        borderRadius: 'var(--radius-full)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      }}>

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

          {/* Watch Together */}
          <button
            onClick={() => watchVideoId ? handleStopWatch() : setIsWatchModalOpen(true)}
            className={`btn-icon btn-icon-lg ${watchVideoId ? 'btn-icon-active' : ''}`}
            aria-label="Watch Together"
            title={watchVideoId ? 'Stop Watching' : 'Watch Together'}
            style={watchVideoId ? { background: '#ef4444', borderColor: '#ef4444' } : {}}
          >
            <Youtube size={22} />
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

      {/* ─── Watch Together Modal ─── */}
      <WatchTogetherModal
        isOpen={isWatchModalOpen}
        onClose={() => setIsWatchModalOpen(false)}
        onStart={handleStartWatch}
      />
    </div>
  );
}
