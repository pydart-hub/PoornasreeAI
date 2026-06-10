# PoornasreeAI

WhatsApp-driven service management platform for Poornasree Equipments — customer chat, tickets, engineer assignment, OTP verification, and admin dashboards.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (`src/`) |
| Backend | Express + Prisma (`api/`) |
| Database | MySQL 8 |
| WhatsApp | Meta Cloud API |
| Deploy | Docker Compose + GHCR images |

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
├── scripts/          Thin wrappers → ops/deploy/ (backward compatible)
├── deploy.sh         Main VPS deploy script (used by CI)
└── deploy.ps1        Windows SSH deploy wrapper
```

## Quick start (local)

```bash
# Frontend
npm install && npm run dev

# API (separate terminal)
cd api && npm install && npm run dev
```

## Deploy

See **[docs/DEPLOY.md](docs/DEPLOY.md)**.

```powershell
git push origin AIpoorna          # CI builds + auto deploys
.\scripts\deploy-pull.ps1           # Manual fast pull (~1–3 min)
```

## Key docs

| Doc | Purpose |
|-----|---------|
| [docs/DEPLOY.md](docs/DEPLOY.md) | VPS deployment guide |
| [docs/plan.md](docs/plan.md) | Architecture & WhatsApp flow |
| [docs/TICKET_INTEGRATION.md](docs/TICKET_INTEGRATION.md) | Public ticket API |
| [docs/API.md](docs/API.md) | API reference |

## WhatsApp code

Live customer chat logic: `api/src/services/simulate.service.ts`  
Webhook handler: `api/src/controllers/whatsapp.controller.ts`
