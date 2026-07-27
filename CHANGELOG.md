# Changelog

## [1.1.0] - 2026-07-27

### UI Overhaul
- Complete production-quality redesign of all components
- New CSS design system with custom properties, typography scale, and animation library
- Redesigned Lobby with centered card layout and branded form
- Minimal sticky Navbar with blurred backdrop and pill-shaped navigation
- Redesigned VideoCall with gradient overlays, circular icon toolbar, and refined PiP preview
- Redesigned TvReceiver with separated idle/streaming views and fullscreen grid
- Redesigned TvPairModal with accessible dialog semantics and click-outside-to-close

### Bug Fixes
- Fixed: call disconnect now fully stops camera/mic on the remote device and shows "Call Ended" overlay
- Fixed: mobile audio echo — added aggressive Chrome echo cancellation constraints (googDAEchoCancellation, googHighpassFilter)
- Fixed: Chromecast scan button now hidden on mobile (only shown on desktop where Presentation API works)
- Fixed: hardcoded domain reference replaced with dynamic `window.location.host`

### Technical
- Bundle size reduced to 192 KB JS (gzip: 58 KB)
- Added accessibility: aria-labels, focus-visible outlines, role="dialog" on modals
- Added `.gitignore`, MIT→GPL v3 license, CHANGELOG, proper `.env.example` docs

---

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
