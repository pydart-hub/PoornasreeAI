# Operations & Development Scripts

This directory contains operational tools, deployment runners, local development helpers, and server watchdog daemons for PoornasreeAI.

---

## 📂 Directory Layout

```
scripts/
├── deploy/                  # Production VPS deployment scripts
│   ├── deploy-quick.sh      # Bash deployment script (API / Web / Full)
│   ├── deploy-quick.ps1     # PowerShell deployment wrapper
│   └── deploy-config.ps1    # VPS server endpoint configuration
├── dev/                     # Local development and tunneling helpers
│   ├── dev-with-server-api.sh # Run local frontend against remote VPS API
│   ├── start-dev-tunnel.sh  # Cloudflare / SSH tunnel runner
│   ├── reconnect.sh         # Live reconnect & webhook tunnel script (Bash)
│   └── reconnect.ps1        # Live reconnect script (PowerShell)
├── maintenance/             # Operational maintenance utilities
│   ├── clear-chat-history.sh  # Purge old WhatsApp chat logs (Bash)
│   └── clear-chat-history.ps1 # Purge old WhatsApp chat logs (PowerShell)
└── server/                  # VPS host security, memory guards & PM2 daemons
    ├── bpf-guard.sh         # eBPF / socket security monitor
    ├── install-hardening.sh # Linux VPS system hardening installer
    ├── malware-purge.sh     # Threat detection and process sanitizer
    ├── patch-security-monitor.sh # System alert cron patcher
    ├── pm2-safe-start.sh    # Resilient PM2 process restarter
    ├── pm2-watchdog.sh      # Node memory leak & crash detector
    ├── poornasree-ai-watchdog.sh # Service health check loop
    └── rondo-guard.sh       # Reverse proxy watchdog
```

---

## 🚀 Quick Usage

### 1. Deploying to Production VPS
```bash
# Web only
./scripts/deploy/deploy-quick.sh

# API only
./scripts/deploy/deploy-quick.sh --api

# Full stack (API + Web)
./scripts/deploy/deploy-quick.sh --full
```
*(On Windows: `.\scripts\deploy\deploy-quick.ps1 -Full` or root wrappers)*

### 2. Local Frontend with Remote API
```bash
# Connect local UI (localhost:3000) with remote production API via SSH tunnel
./scripts/dev/dev-with-server-api.sh

# Or directly via public HTTPS:
./scripts/dev/dev-with-server-api.sh --public
```

### 3. Clear Chat History / Test Sessions
```bash
./scripts/maintenance/clear-chat-history.sh
```
