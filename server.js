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
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

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

// Clean up stale pairing codes (> 10 mins)
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of tvPairings.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      tvPairings.delete(code);
    }
  }
}, 30000);

// API Health Check
app.get('/api/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'online',
    vpsSpecs: '1 vCPU | 1 GB RAM (Oracle Always Free)',
    memory: {
      rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapTotalMB: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    },
    activeCalls: calls.size,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// WebSocket Signaling Handler
wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).substring(2, 10);
  ws.isAlive = true;
  ws.role = 'caller';

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (rawData) => {
    try {
      const message = JSON.parse(rawData.toString());
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

          ws.send(
            JSON.stringify({
              type: 'call-started',
              callId: newCallId,
              peerId: ws.id,
            })
          );
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
            ws.send(JSON.stringify({ type: 'call-error', message: 'Call is full (2 participants max)' }));
            return;
          }

          ws.role = payload?.role || 'caller';
          ws.callId = targetCallId;
          roomClients.add(ws);

          const existingPeers = Array.from(roomClients)
            .filter((c) => c.id !== ws.id)
            .map((c) => ({ id: c.id, role: c.role }));

          ws.send(
            JSON.stringify({
              type: 'call-joined',
              callId: targetCallId,
              peerId: ws.id,
              existingPeers,
            })
          );

          roomClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: 'peer-joined',
                  peerId: ws.id,
                  role: ws.role,
                })
              );
            }
          });
          break;
        }

        case 'peer-ready': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            roomClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: 'peer-ready-to-negotiate',
                    peerId: ws.id,
                    role: ws.role,
                  })
                );
              }
            });
          }
          break;
        }

        case 'end-call': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            // Broadcast call-ended to ALL clients in room including TV receivers
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: 'call-ended',
                    byPeerId: ws.id,
                  })
                );
              }
            });
            calls.delete(targetCallId);
          }
          break;
        }

        // TV sends this after pairing to ask caller to re-send offer with live remote stream
        case 'tv-request-stream': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client.role === 'caller' && client.id !== ws.id) {
                client.send(
                  JSON.stringify({
                    type: 'tv-request-stream',
                    tvPeerId: ws.id,
                    callId: targetCallId,
                  })
                );
              }
            });
          }
          break;
        }

        // Caller disconnects TV stream
        case 'tv-disconnect': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client.role === 'tv') {
                client.send(
                  JSON.stringify({
                    type: 'tv-disconnected',
                    callId: targetCallId,
                  })
                );
                // Clean up TV client socket reference from room list
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
          ws.send(JSON.stringify({ type: 'tv-code-generated', code, callId: targetCallId }));
          break;
        }

        case 'verify-tv-code': {
          const { code } = payload;
          const pairing = tvPairings.get(code);

          if (!pairing) {
            ws.send(JSON.stringify({ type: 'tv-pair-error', message: 'Invalid or expired TV PIN code' }));
            return;
          }

          ws.role = 'tv';
          ws.callId = pairing.callId;
          let roomClients = calls.get(pairing.callId);

          if (!roomClients) {
            ws.send(JSON.stringify({ type: 'tv-pair-error', message: 'Call is no longer active' }));
            return;
          }

          roomClients.add(ws);

          ws.send(
            JSON.stringify({
              type: 'tv-pair-success',
              callId: pairing.callId,
              code,
            })
          );

          // Send tv-connected ONLY to the specific caller who requested the TV pair code!
          roomClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.id === pairing.requesterId) {
              client.send(
                JSON.stringify({
                  type: 'tv-connected',
                  tvPeerId: ws.id,
                  code,
                })
              );
            }
          });
          break;
        }

        case 'signal': {
          const { targetPeerId, signalData } = payload;
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client !== ws) {
                if (targetPeerId === 'broadcast' || client.id === targetPeerId) {
                  client.send(
                    JSON.stringify({
                      type: 'signal',
                      senderPeerId: ws.id,
                      callId: targetCallId,
                      signalData,
                    })
                  );
                }
              }
            });
          }
          break;
        }

        default:
          console.log('Unknown message type:', type);
      }
    } catch (err) {
      console.error('WebSocket Error:', err);
    }
  });

  ws.on('close', () => {
    if (ws.callId && calls.has(ws.callId)) {
      const roomClients = calls.get(ws.callId);
      roomClients.delete(ws);

      if (roomClients.size === 0) {
        calls.delete(ws.callId);
      } else {
        roomClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'peer-left',
                peerId: ws.id,
                role: ws.role,
              })
            );
          }
        });
      }
    }
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 AiroCall Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint active at ws://localhost:${PORT}/ws`);
});
