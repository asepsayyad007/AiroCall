import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;
let ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'airocall-admin-2026'; // Set in production .env

const app = express();

// ─── TIER 1: CORS Lockdown ───
app.use(cors({
  origin: IS_PRODUCTION && ALLOWED_ORIGIN ? ALLOWED_ORIGIN : true,
  methods: ['GET', 'POST'],
  credentials: false,
}));

app.use(express.json({ limit: '1kb' }));

// ─── TIER 1: Comprehensive Security Headers (Helmet-equivalent) ───
app.use((req, res, next) => {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS — force HTTPS for 1 year (includes subdomains)
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  // Content Security Policy
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' wss: ws: https://stun.l.google.com https://global.stun.twilio.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  // Prevent browser from caching sensitive pages
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  // Disable DNS prefetching
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});

const server = createServer(app);

// ─── TIER 1: Rate Limiting (in-memory, no dependency) ───
const rateLimitMap = new Map(); // IP -> { count, resetTime }
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Clean rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// Apply rate limiting to API routes
app.use('/api', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  next();
});

// ─── TIER 1: PIN Attempt Throttling ───
const pinAttemptsMap = new Map(); // IP -> { attempts, blockedUntil }
const PIN_MAX_ATTEMPTS = 5;
const PIN_COOLDOWN = 60 * 1000; // 60 second cooldown after 5 fails

function checkPinThrottle(ip) {
  const now = Date.now();
  const entry = pinAttemptsMap.get(ip);
  if (!entry) return true;
  if (now > entry.blockedUntil) {
    pinAttemptsMap.delete(ip);
    return true;
  }
  return false; // Still blocked
}

function recordPinFailure(ip) {
  const now = Date.now();
  const entry = pinAttemptsMap.get(ip) || { attempts: 0, blockedUntil: 0 };
  entry.attempts++;
  if (entry.attempts >= PIN_MAX_ATTEMPTS) {
    entry.blockedUntil = now + PIN_COOLDOWN;
  }
  pinAttemptsMap.set(ip, entry);
}

function clearPinAttempts(ip) {
  pinAttemptsMap.delete(ip);
}

// Clean PIN attempts map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of pinAttemptsMap.entries()) {
    if (now > entry.blockedUntil) pinAttemptsMap.delete(ip);
  }
}, 5 * 60 * 1000);

// ─── WebSocket Server ───
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 64 * 1024,
  perMessageDeflate: false,
  // TIER 1: Origin validation
  verifyClient: (info, done) => {
    // In production, validate origin matches allowed domain
    if (IS_PRODUCTION && ALLOWED_ORIGIN) {
      const origin = info.origin || info.req.headers.origin;
      if (origin && !origin.startsWith(ALLOWED_ORIGIN)) {
        done(false, 403, 'Origin not allowed');
        return;
      }
    }
    // Connection flood protection: max 10 WS connections per IP
    const ip = info.req.socket.remoteAddress;
    let ipConnectionCount = 0;
    wss.clients.forEach((client) => {
      if (client._ip === ip) ipConnectionCount++;
    });
    if (ipConnectionCount >= 10) {
      done(false, 429, 'Too many connections');
      return;
    }
    done(true);
  },
});

// ─── In-Memory State ───
const calls = new Map();
const tvPairings = new Map();

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

// Clean up stale pairing codes (> 10 mins) and empty rooms
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [code, data] of tvPairings.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      tvPairings.delete(code);
    }
  }
  for (const [callId, clients] of calls.entries()) {
    if (clients.size === 0) calls.delete(callId);
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
  ws._ip = req.socket.remoteAddress; // Track IP for connection limiting

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  logAccess('ws-connected', { ip: ws._ip, peerId: ws.id });

  ws.on('error', (err) => {
    console.warn(`WS error [${ws.id}]:`, err.message);
  });

  ws.on('message', (rawData) => {
    try {
      const str = rawData.toString();
      if (str.length > 65536) return;

      const message = JSON.parse(str);
      const { type, callId, payload } = message;

      // Validate message type is a known string
      if (typeof type !== 'string' || type.length > 30) return;

      const targetCallId = callId || payload?.callId || ws.callId;

      switch (type) {
        case 'start-instant-call': {
          const newCallId = generateCallId();
          const roomClients = new Set();
          ws.role = 'caller';
          ws.callId = newCallId;
          roomClients.add(ws);
          calls.set(newCallId, roomClients);

          logAccess('call-started', { callId: newCallId, ip: ws._ip, peerId: ws.id });

          safeSend(ws, {
            type: 'call-started',
            callId: newCallId,
            peerId: ws.id,
          });
          break;
        }

        case 'join-call': {
          // Validate callId format
          if (targetCallId && typeof targetCallId !== 'string') return;

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

          logAccess('call-joined', { callId: targetCallId, ip: ws._ip, peerId: ws.id, role: ws.role });

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
            logAccess('call-ended', { callId: targetCallId, ip: ws._ip, peerId: ws.id });
            const msg = { type: 'call-ended', byPeerId: ws.id };
            roomClients.forEach((client) => safeSend(client, msg));
            calls.delete(targetCallId);
          }
          break;
        }

        case 'tv-request-stream': {
          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            roomClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client.role === 'caller' && client.id === ws.pairedWithCallerId) {
                safeSend(client, { type: 'tv-request-stream', tvPeerId: ws.id, callId: targetCallId });
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
          const { code } = payload || {};

          // TIER 1: PIN attempt throttling
          const clientIp = ws._ip;
          if (!checkPinThrottle(clientIp)) {
            safeSend(ws, { type: 'tv-pair-error', message: 'Too many attempts. Please wait 60 seconds.' });
            return;
          }

          // Validate code format
          if (!code || typeof code !== 'string' || code.length !== 6 || !/^\d{6}$/.test(code)) {
            safeSend(ws, { type: 'tv-pair-error', message: 'Invalid PIN format' });
            recordPinFailure(clientIp);
            return;
          }

          const pairing = tvPairings.get(code);

          if (!pairing) {
            safeSend(ws, { type: 'tv-pair-error', message: 'Invalid or expired TV PIN code' });
            recordPinFailure(clientIp);
            return;
          }

          // Success — clear throttle
          clearPinAttempts(clientIp);
          logAccess('tv-paired', { callId: pairing.callId, ip: clientIp, code });

          ws.role = 'tv';
          ws.callId = pairing.callId;
          ws.pairedWithCallerId = pairing.requesterId;
          let roomClients = calls.get(pairing.callId);

          if (!roomClients) {
            safeSend(ws, { type: 'tv-pair-error', message: 'Call is no longer active' });
            return;
          }

          roomClients.add(ws);

          safeSend(ws, { type: 'tv-pair-success', callId: pairing.callId, code });

          roomClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.id === pairing.requesterId) {
              safeSend(client, { type: 'tv-connected', tvPeerId: ws.id, code });
            }
          });

          // Consume code — single use
          tvPairings.delete(code);
          break;
        }

        case 'signal': {
          const { targetPeerId, signalData } = payload || {};
          if (!signalData || !targetPeerId) return;

          const roomClients = calls.get(targetCallId);
          if (roomClients) {
            const msg = { type: 'signal', senderPeerId: ws.id, callId: targetCallId, signalData };
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

        case 'ping': {
          // Keep-alive from TV receivers — just acknowledge
          safeSend(ws, { type: 'pong' });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.warn(`Message error [${ws.id}]:`, err.message);
    }
  });

  ws.on('close', () => {
    logAccess('ws-disconnected', { ip: ws._ip, peerId: ws.id, role: ws.role, callId: ws.callId });

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

// ─── Helpers ───
function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(data)); } catch (e) {}
  }
}

function broadcastToRoom(roomClients, sender, data) {
  roomClients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      safeSend(client, data);
    }
  });
}

// ─── ADMIN API (protected by token) ───
// Access: admin.call.bootstrapx007.online or /api/admin/* with Authorization header

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Admin: Server overview
app.get('/api/admin/status', adminAuth, (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'online',
    version: '1.1.0',
    environment: IS_PRODUCTION ? 'production' : 'development',
    memory: {
      rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapTotalMB: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
      externalMB: (memoryUsage.external / 1024 / 1024).toFixed(2),
    },
    activeCalls: calls.size,
    activeConnections: wss.clients.size,
    activePairingCodes: tvPairings.size,
    rateLimitEntries: rateLimitMap.size,
    pinThrottleEntries: pinAttemptsMap.size,
    uptimeSeconds: Math.floor(process.uptime()),
    uptimeFormatted: formatUptime(process.uptime()),
    serverTime: new Date().toISOString(),
  });
});

// Admin: Active calls with connection details
app.get('/api/admin/calls', adminAuth, (req, res) => {
  const callsList = [];
  for (const [callId, clients] of calls.entries()) {
    const participants = Array.from(clients).map((c) => ({
      peerId: c.id,
      role: c.role,
      ip: c._ip || 'unknown',
      connectedAt: c.connectedAt ? new Date(c.connectedAt).toISOString() : null,
      durationSeconds: c.connectedAt ? Math.floor((Date.now() - c.connectedAt) / 1000) : 0,
    }));
    callsList.push({ callId, participants, participantCount: participants.length });
  }
  res.json({ totalCalls: callsList.length, calls: callsList });
});

// Admin: Active WebSocket connections
app.get('/api/admin/connections', adminAuth, (req, res) => {
  const connections = [];
  wss.clients.forEach((ws) => {
    connections.push({
      peerId: ws.id,
      role: ws.role,
      callId: ws.callId || null,
      ip: ws._ip || 'unknown',
      connectedAt: ws.connectedAt ? new Date(ws.connectedAt).toISOString() : null,
      isAlive: ws.isAlive,
      pairedWithCaller: ws.pairedWithCallerId || null,
    });
  });
  res.json({ totalConnections: connections.length, connections });
});

// Admin: Rate limit & throttle status
app.get('/api/admin/security', adminAuth, (req, res) => {
  const rateLimits = [];
  for (const [ip, entry] of rateLimitMap.entries()) {
    rateLimits.push({ ip, count: entry.count, resetsAt: new Date(entry.resetTime).toISOString() });
  }
  const pinThrottles = [];
  for (const [ip, entry] of pinAttemptsMap.entries()) {
    pinThrottles.push({ ip, attempts: entry.attempts, blockedUntil: new Date(entry.blockedUntil).toISOString() });
  }
  res.json({ rateLimits, pinThrottles });
});

// Admin: Server access log (last 100 entries, in-memory)
const accessLog = [];
const MAX_LOG_ENTRIES = 200;

function logAccess(action, details) {
  accessLog.push({
    timestamp: new Date().toISOString(),
    action,
    ...details,
  });
  if (accessLog.length > MAX_LOG_ENTRIES) {
    accessLog.splice(0, accessLog.length - MAX_LOG_ENTRIES);
  }
}

// Admin: Change token
app.post('/api/admin/change-token', adminAuth, (req, res) => {
  const { newToken } = req.body || {};
  if (!newToken || typeof newToken !== 'string' || newToken.length < 8) {
    return res.status(400).json({ error: 'Token must be at least 8 characters' });
  }
  ADMIN_TOKEN = newToken;
  logAccess('token-changed', { ip: req.ip });
  res.json({ success: true, message: 'Admin token updated. Use new token for next login.' });
});

app.get('/api/admin/logs', adminAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ total: accessLog.length, logs: accessLog.slice(-limit).reverse() });
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ─── Static file serving (production) ───
if (IS_PRODUCTION) {
  app.use(express.static(path.join(__dirname, 'dist'), {
    maxAge: '30d',
    immutable: true,
    etag: true,
  }));

  // Admin dashboard — served on admin subdomain or /admin path
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });

  app.get('*', (req, res) => {
    // If request is to admin subdomain, serve admin page
    if (req.hostname && req.hostname.startsWith('admin.')) {
      return res.sendFile(path.join(__dirname, 'admin.html'));
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// ─── Graceful Shutdown ───
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInterval(heartbeatTimer);
  clearInterval(cleanupTimer);
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
  wss.close(() => {
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 AiroCall Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint active at ws://localhost:${PORT}/ws`);
  console.log(`🔒 Security: CSP, HSTS, Rate-limit, PIN-throttle, Origin-check active`);
});
