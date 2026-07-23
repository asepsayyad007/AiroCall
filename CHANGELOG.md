# Changelog

## [1.0.0] - 2024

### Features
- 1-on-1 WebRTC peer-to-peer video calling with instant invite links
- Smart TV companion streaming via 6-digit PIN pairing
- Teams-style split-screen layout on TV (side-by-side caller grid)
- 1-click Chromecast/Smart TV casting via W3C Presentation API
- Dynamic bandwidth adaptation engine (HD / SD / Low / Audio-Only)
- Front/rear camera switching on mobile devices
- Echo & howling prevention (smart audio routing to TV)
- Auto-hiding TV receiver header overlay
- Auto-pairing via URL parameters (`/tv?code=XXXXXX`)
- Autoplay bypass with muted fallback for strict browsers
- Real-time VPS health monitor in navbar

### Technical
- WebRTC connection renegotiation with `resetConnection` flag for reliable TV handshakes
- Synthetic canvas-based video streams for local testing without cameras
- Multi-stage Docker build (Node 20 Alpine)
- PM2 process management with 150 MB memory restart limit
- Nginx reverse proxy config with SSL and WebSocket upgrade
- Production bundle optimized to ~195 KB JS assets
- Server memory footprint under 60 MB RAM
