# PoornasreeAI

WhatsApp-driven service management platform for Poornasree Equipments — customer chat, tickets, engineer assignment, OTP verification, and admin dashboards.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (`src/`) |
| Backend | Express + Prisma (`api/`) |
| Database | MySQL 8 |
| WhatsApp | Meta Cloud API |
| Deploy | Docker Compose on VPS |

## Project layout

```
PoornasreeAI/
├── src/              Next.js frontend (dashboards, admin UI)
├── api/              Express API + Prisma + WhatsApp webhook
├── public/images/    Web assets (logos, product photos)
├── docs/             Documentation (not web-served)
├── data/             Training JSON, dealer Excel, reference files
├── ops/              Deploy, server setup, data import scripts
├── infra/nginx/      Nginx configs for production domains
├── tests/            E2E and simulation test scripts
├── scripts/          Deploy helpers (deploy-quick.sh)
├── deploy.sh         VPS deploy script (quick / quick-api)
└── deploy.ps1        Windows SSH deploy wrapper
```

## Quick start (local)

```bash
# Frontend + remote VPS API (SSH tunnel)
./scripts/dev-with-server-api.sh

# Frontend + remote API via public HTTPS (no tunnel)
./scripts/dev-with-server-api.sh --public

# Both local frontend and API
npm install && npm run dev
```

## Deploy

See **[docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md)**.

```bash
./scripts/deploy-quick.sh --full    # Mac/Linux
```

```powershell
.\scripts\deploy-quick.ps1 -Api; .\scripts\deploy-quick.ps1   # Windows
```

## Key docs

| Doc | Purpose |
|-----|---------|
| [docs/user-guides/README.md](docs/user-guides/README.md) | **User Guides** (Customer, Engineer, Manager, Support, Dealer, Admin) |
| [docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md) | Deployment runbook (only guide) |
| [docs/plan.md](docs/plan.md) | Architecture & WhatsApp flow |
| [docs/TICKET_INTEGRATION.md](docs/TICKET_INTEGRATION.md) | Public ticket API |
| [docs/API.md](docs/API.md) | API reference |

## WhatsApp code

Live customer chat logic: `api/src/services/simulate.service.ts`  
Webhook handler: `api/src/controllers/whatsapp.controller.ts`
