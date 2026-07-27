# AiroCall

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-orange.svg)](./package.json)

Ultra-lightweight WebRTC video calling with built-in Smart TV streaming. Designed to run on minimal infrastructure (Oracle Free Tier VPS: 1 vCPU, 1 GB RAM, ~60 MB memory footprint).

---

## Features

- **1-on-1 Video Calls** — Peer-to-peer WebRTC audio/video with shareable invite links
- **Smart TV Streaming** — Generate a 6-digit PIN, enter it on any TV browser, and stream the call to the big screen
- **Split-Screen TV Layout** — Both callers displayed side-by-side (Teams/Zoom-style grid)
- **Chromecast / Presentation API** — 1-click native casting via W3C Presentation API (desktop only)
- **Bandwidth Adaptation** — Real-time quality switching (HD → SD → Low → Audio-Only) based on `getStats()` every 2s
- **Echo Prevention** — Smart audio routing sends only remote peer's audio to TV speakers; aggressive mobile echo cancellation
- **Camera Switching** — Toggle front/rear camera on mobile with seamless track replacement
- **Proper Call Cleanup** — Disconnecting fully releases camera/mic on both devices
- **Minimal Footprint** — Signaling server uses <60 MB RAM; all media flows P2P
- **Production UI** — Dark-themed design system with accessibility, responsive layout, and smooth animations

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5 |
| Icons | Lucide React |
| Real-time | WebSocket (`ws`), WebRTC |
| Backend | Node.js, Express |
| Deployment | Docker, PM2, Nginx |

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

---

## Deployment (Oracle Free Tier VPS)

### 1. Server Setup

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

### 2. Clone & Build

```bash
git clone https://github.com/your-username/airocall.git
cd airocall
npm install
npm run build
```

### 3. Start with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 4. Nginx & SSL

Copy `nginx.conf.example` to `/etc/nginx/sites-available/airocall`, update the `server_name`, then:

```bash
sudo certbot --nginx -d yourdomain.com
sudo systemctl reload nginx
```

### Docker (Alternative)

```bash
docker compose up -d
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | Server port |
| `COTURN_URL` | — | Optional TURN server URL for strict NATs |
| `COTURN_USERNAME` | — | TURN server username |
| `COTURN_CREDENTIAL` | — | TURN server password |

---

## Architecture

```
Caller 1  ←── WebRTC P2P ──→  Caller 2
    │                              │
    └──── WebSocket Signaling ─────┘
                   │
          Node.js server.js
         (room mgmt + TV pairing)
                   │
    Smart TV  ←── WebRTC ──→  Caller
```

The signaling server only relays SDP offers/answers and ICE candidates. All audio/video flows directly between peers — the server never touches media data.

---

## Project Structure

```
├── server.js              # Express + WebSocket signaling server
├── src/
│   ├── App.jsx            # Main router (caller vs TV mode)
│   ├── components/
│   │   ├── VideoCall.jsx  # WebRTC call UI & peer connection logic
│   │   ├── TvReceiver.jsx # Smart TV receiver with PIN pairing
│   │   ├── TvPairModal.jsx# In-call TV pairing modal
│   │   ├── Lobby.jsx      # Pre-call lobby
│   │   └── Navbar.jsx     # Header with VPS health monitor
│   └── services/
│       ├── bandwidthEngine.js   # Quality profile switching
│       ├── mediaDevice.js       # Camera/mic access + fallback
│       ├── presentationCast.js  # W3C Presentation API integration
│       └── videoSimulator.js    # Synthetic streams for testing
├── docker-compose.yml
├── Dockerfile
├── ecosystem.config.cjs   # PM2 config
├── nginx.conf.example     # Nginx reverse proxy template
└── vite.config.js
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

[GPL v3](./LICENSE)
