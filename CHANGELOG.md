# Changelog

All notable changes to the Headscale Management Web Tool will be documented in this file.

## [2.2.0] - 2026-03-16

### Added
- **🔔 Phase 3: WeChat Work (企业微信) Push Notifications**
  - Node online/offline status change notifications
  - Configurable monitoring interval (default 60 seconds)
  - Markdown formatted notification messages
  - Test message sending from UI
  - WeChat Work configuration integrated into config.json
  - Auto-start monitoring when server starts (if enabled)
- **🌙 Dark Mode Support**
  - Theme toggle button in header (🌙/☀️)
  - Full dark theme with CSS variables
  - User preference saved to localStorage
  - Persists across page reloads
- **🌐 Multi-language Support (i18n)**
  - Language toggle button in header (EN/中文)
  - Complete Chinese/English translations for all UI elements
  - User preference saved to localStorage
  - Auto-applies translations on page load
- **🖥️ Service Control Script** (`headscale-ctl.ps1`)
  - Commands: start, stop, restart, status
  - Background execution by default
  - PID file tracking for process management
  - `-Foreground` flag for debugging
  - `-Force` flag to replace existing process

### Changed
- Unified configuration in config.json (WeChat Work credentials)
- UI language consistency - all labels in English
- Checkbox alignment improved with flexbox
- Topology stats now include local probe node in count
- Local node display changed to ellipse with name centered

### Fixed
- 404 errors for WeChat API routes (route ordering issue)
- Node count in topology showing 1 instead of 2

## [2.1.0] - 2026-03-16

### Added
- **🌐 Network Topology Visualization** - New topology tab with interactive network graph
  - Real-time node status display (online/offline)
  - Node grouping by namespace
  - DERP relay visualization (virtual center)
  - Click-to-view node details panel
  - Auto-refresh every 30 seconds (configurable)
  - Zoom and pan support with fit view button
- **Phase 2: Real P2P Connection Detection**
  - `tailscale ping` integration for real latency measurement
  - Direct vs DERP relay connection type detection
  - Latency color coding (green <30ms / yellow 30-80ms / orange 80-150ms / red >150ms)
  - New `/api/topology` endpoint for connection discovery
  - Probe node visualization (this machine as center)
- vis.js integration for network visualization

### Changed
- Updated documentation with topology feature description
- Enhanced README.md with new feature highlight

### Fixed
- Fixed duplicate display of local machine node (probe node now correctly represents local machine)
- Local machine is excluded from node list to avoid confusion
- All nodes now display hostname + IP address in labels
- Updated legend to Chinese
- Changed local node shape from star to hexagon
- Fixed local hostname detection using tailscale status

## [2.0.0] - 2026-03-14

### Added
- Complete project reorganization as an independent project
- Comprehensive README.md with installation and usage instructions
- package.json for Node.js dependency management
- .gitignore for version control
- Start scripts for Windows (start.bat) and Linux/Mac (start.sh)
- Stop script for Linux/Mac (stop.sh)
- Official API documentation references
- Swagger documentation access instructions
- Detailed API endpoint reference
- Node renaming limitation documentation
- Alternative methods for node renaming (CLI and gRPC)

### Changed
- Updated documentation to use port 3306 instead of 8080 for HTTP server
- Improved API proxy server with better error handling
- Enhanced configuration management
- Updated P2P network deployment guide with official API references

### Fixed
- Load Config functionality - now works correctly
- API endpoint routing for configuration endpoints
- JSON parsing errors in API responses
- CORS issues through improved proxy server

### Known Limitations
- Node renaming is not supported via REST API (returns "Not Implemented")
- Use CLI command or gRPC interface for node renaming

## [1.0.0] - 2026-03-13

### Initial Release
- Web-based management interface for Headscale
- Node management (view, delete)
- User management (create, view, delete)
- PreAuth Key management (create, view, delete)
- Configuration management (save, load)
- API proxy server to handle CORS
- Multiple tool versions (db, rest, ssh, proxy, dashboard)
- Tailscale configuration and diagnostic tools
- Headscale deployment scripts
- Configuration templates

### Features
- Modern responsive UI
- Real-time status display
- Secure API Key management
- Docker deployment support
- Automated configuration updates