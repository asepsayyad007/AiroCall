import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import Lobby from './components/Lobby';
import VideoCall from './components/VideoCall';
import TvReceiver from './components/TvReceiver';

export default function App() {
  const [mode, setMode] = useState('caller'); // 'caller' | 'tv'
  const [activeCallId, setActiveCallId] = useState(null);
  const [userName, setUserName] = useState('User');
  const wsRef = useRef(null);

  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  const callParam = urlParams.get('call');
  const isTvRoute = window.location.pathname.startsWith('/tv') || codeParam;

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = process.env.NODE_ENV === 'production' ? window.location.host : 'localhost:3000';
  const wsUrl = `${wsProtocol}//${wsHost}/ws`;

  useEffect(() => {
    if (isTvRoute) {
      setMode('tv');
      return;
    }

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'call-started' || data.type === 'call-joined') {
          setActiveCallId(data.callId);
        }
      } catch (e) {
        console.error(e);
      }
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [wsUrl, isTvRoute]);

  const handleStartInstantCall = (user) => {
    setUserName(user || 'Caller 1');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'start-instant-call',
          payload: { userName: user },
        })
      );
    }
  };

  const handleJoinCall = (targetCallId, user) => {
    setUserName(user || 'Caller 2');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'join-call',
          callId: targetCallId,
          payload: { userName: user },
        })
      );
    }
  };

  const handleLeaveCall = () => {
    window.history.replaceState({}, document.title, window.location.pathname);
    setActiveCallId(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Header Navbar */}
      <Navbar currentMode={mode} setMode={setMode} />

      {/* Main View Router */}
      <main style={{ flex: 1, paddingBottom: '40px' }}>
        {mode === 'caller' && (
          !activeCallId ? (
            <Lobby
              targetCallId={callParam}
              onStartInstantCall={handleStartInstantCall}
              onJoinCall={handleJoinCall}
            />
          ) : (
            <VideoCall
              callId={activeCallId}
              callerLabel={userName}
              ws={wsRef.current}
              onLeaveCall={handleLeaveCall}
            />
          )
        )}

        {mode === 'tv' && <TvReceiver initialCode={codeParam} wsUrl={wsUrl} />}
      </main>

    </div>
  );
}
