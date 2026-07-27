import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1kb' })); // Limit payload size

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 64 * 1024, // 64 KB max message size (SDP can be large)
  perMessageDeflate: false, // Disable compression to save CPU on 1-vCPU VPS
});

// In-Memory State
const calls = new Map(); // callId -> Set<wsClient>
const tvPairings = new Map(); // 6-digit code -> { callId, requesterId, createdAt }

function generateCallId() {
  return Math.random().toString(36).substring(2, 8);
}

function generatePairingCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (tvPairings.has(code));
  return code;
}

// ─── Heartbeat: detect dead connections every 25s ───
const HEARTBEAT_INTERVAL = 25000;
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// Clean up stale pairing codes (> 10 mins)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [code, data] of tvPairings.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      tvPairings.delete(code);
    }
  }
  // Also clean up empty call rooms
  for (const [callId, clients] of calls.entries()) {
    if (clients.size === 0) {
      calls.delete(callId);
    }
  }
}, 30000);

// ─── API Health Check ───
app.get('/api/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'online',
    version: '1.1.0',
    memory: {
      rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    },
    activeCalls: calls.size,
    activeConnections: wss.clients.size,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// ─── WebSocket Signaling Handler ───
wss.on('connection', (ws, req) => {
  ws.id = Math.random().toString(36).substring(2, 10);
  ws.isAlive = true;
  ws.role = 'caller';
  ws.connectedAt = Date.now();

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('error', (err) => {
    console.warn(`WS error [${ws.id}]:`, err.message);
  });

  ws.on('message', (rawData) => {
    try {
      const str = rawData.toString();
      if (str.length > 65536) return; // Drop oversized messages

      const message = JSON.parse(str);
      const { type, callId, payload } = message;
      const targetCallId = callId || payload?.callId || ws.callId;

      switch (type) {
        case 'start-instant-call': {
          const newCallId = generateCallId();
          const roomClients = new Set();
          ws.role = 'caller';
          ws.callId = newCallId;
          roomClients.add(ws);
          calls.set(newCallId, roomClients);

          safeSend(ws, {
            type: 'call-started',
            callId: newCallId,
            peerId: ws.id,
          });
          break;
        }

        case 'join-call': {
          let roomClients = calls.get(targetCallId);

          if (!roomClients) {
            roomClients = new Set();
            calls.set(targetCallId, roomClients);
          }

          const activeCallersCount = Array.from(roomClients).filter((c) => c.role === 'caller').length;

          if (activeCallersCount >= 2 && ws.role === 'caller') {
            safeSend(ws, { type: 'call-error', message: 'Call is full (2 participants max)' });
            return;
          }

          ws.role = payload?.role || 'caller';
          ws.callId = targetCallId;
          roomClients.add(ws);

          const existingPeers = Array.from(roomClients)
            .filter((c) => c.id !== ws.id)
            .map((c) => ({ id: c.id, role: c.role }));

          safeSend(ws, {
            type: 'call-joined',
            callId: targetCallId,
            peerId: ws.id,
            existingPeers,
          });

          broadcastToRoom(roomClients, ws, {
            type: 'peer-joined',
            peerId: ws.id,
            role: ws.role,
          });
          break;
        }

        case 'peer-ready': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            broadcastToRoom(roomClients, ws, {
              type: 'peer-ready-to-negotiate',
              peerId: ws.id,
              role: ws.role,
            });
          }
          break;
        }

        case 'end-call': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            const msg = { type: 'call-ended', byPeerId: ws.id };
            roomClients.forEach((client) => {
              safeSend(client, msg);
            });
            calls.delete(targetCallId);
          }
          break;
        }

        case 'tv-request-stream': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client.role === 'caller' && client.id === ws.pairedWithCallerId) {
                safeSend(client, {
                  type: 'tv-request-stream',
                  tvPeerId: ws.id,
                  callId: targetCallId,
                });
              }
            });
          }
          break;
        }

        case 'tv-disconnect': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client.role === 'tv' && client.pairedWithCallerId === ws.id) {
                safeSend(client, { type: 'tv-disconnected', callId: targetCallId });
                roomClients.delete(client);
              }
            });
          }
          break;
        }

        case 'generate-tv-code': {
          const code = generatePairingCode();
          tvPairings.set(code, {
            callId: targetCallId,
            requesterId: ws.id,
            createdAt: Date.now(),
          });
          safeSend(ws, { type: 'tv-code-generated', code, callId: targetCallId });
          break;
        }

        case 'verify-tv-code': {
          const { code } = payload;
          const pairing = tvPairings.get(code);

          if (!pairing) {
            safeSend(ws, { type: 'tv-pair-error', message: 'Invalid or expired TV PIN code' });
            return;
          }

          ws.role = 'tv';
          ws.callId = pairing.callId;
          ws.pairedWithCallerId = pairing.requesterId;
          let roomClients = calls.get(pairing.callId);

          if (!roomClients) {
            safeSend(ws, { type: 'tv-pair-error', message: 'Call is no longer active' });
            return;
          }

          roomClients.add(ws);

          safeSend(ws, {
            type: 'tv-pair-success',
            callId: pairing.callId,
            code,
          });

          // Notify only the paired caller
          roomClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.id === pairing.requesterId) {
              safeSend(client, {
                type: 'tv-connected',
                tvPeerId: ws.id,
                code,
              });
            }
          });

          // Consume the pairing code so it can't be reused
          tvPairings.delete(code);
          break;
        }

        case 'signal': {
          const { targetPeerId, signalData } = payload;
          if (!signalData) return; // Guard against malformed signals

          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            const msg = {
              type: 'signal',
              senderPeerId: ws.id,
              callId: targetCallId,
              signalData,
            };
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client !== ws) {
                if (targetPeerId === 'broadcast' || client.id === targetPeerId) {
                  safeSend(client, msg);
                }
              }
            });
          }
          break;
        }

        default:
          break; // Silently ignore unknown types
      }
    } catch (err) {
      // Malformed JSON or processing error — don't crash
      console.warn(`Message error [${ws.id}]:`, err.message);
    }
  });

  ws.on('close', () => {
    if (ws.callId && calls.has(ws.callId)) {
      const roomClients = calls.get(ws.callId);
      roomClients.delete(ws);

      if (roomClients.size === 0) {
        calls.delete(ws.callId);
      } else {
        broadcastToRoom(roomClients, ws, {
          type: 'peer-left',
          peerId: ws.id,
          role: ws.role,
        });
      }
    }
  });
});

// ─── Helper: safe send with error handling ───
function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (e) {
      // Socket closed between check and send — safe to ignore
    }
  }
}

// ─── Helper: broadcast to room excluding sender ───
function broadcastToRoom(roomClients, sender, data) {
  roomClients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      safeSend(client, data);
    }
  });
}

// ─── Static file serving (production) ───
if (process.env.NODE_ENV === 'production') {
  // Cache static assets aggressively (they have content hashes)
  app.use(express.static(path.join(__dirname, 'dist'), {
    maxAge: '30d',
    immutable: true,
    etag: true,
  }));
  // SPA fallback — no cache on HTML (so deploys take effect immediately)
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// ─── Graceful Shutdown ───
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInterval(heartbeatTimer);
  clearInterval(cleanupTimer);

  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });

  wss.close(() => {
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  });

  // Force exit after 5s if graceful fails
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 AiroCall Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint active at ws://localhost:${PORT}/ws`);
});
