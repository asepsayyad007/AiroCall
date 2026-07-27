import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import Lobby from './components/Lobby';
import VideoCall from './components/VideoCall';
import TvReceiver from './components/TvReceiver';

export default function App() {
  const [mode, setMode] = useState('caller');
  const [activeCallId, setActiveCallId] = useState(null);
  const [userName, setUserName] = useState('User');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

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

    function connect() {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'call-started' || data.type === 'call-joined') {
            setActiveCallId(data.callId);
          }
        } catch (e) {
          // Malformed message — ignore
        }
      };

      socket.onclose = (event) => {
        // Don't reconnect if close was intentional
        if (event.code === 1000) return;

        // Exponential backoff reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // Will trigger onclose
      };
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000);
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
      <Navbar currentMode={mode} setMode={setMode} />

      <main style={{ flex: 1 }}>
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
