# PoornasreeAI — Project Memory

> Cline's running notes between sessions. Update at the end of any task
> that changes project facts (new role, new env var, new route, schema
> drift, deploy quirk, etc.).

## Project facts

- **Repo**: `pydart-hub/PoornasreeAI`  ·  **Branch**: `AIpoorna`
- **Live URL**: https://ai.poornasreecloud.com
- **SSH alias**: `poornasree-v4` (Ubuntu 24.04 VPS, IP 65.20.72.131)
- **VPS path**: `/root/poornasree-ai`
- **Nginx site**: `/etc/nginx/sites-available/poornasree-ai`
- **VPS port isolation** (other apps live here too):
  - web → 127.0.0.1:3002 (psr-v4 owns :3000, machine-detector owns :3001)
  - api → 127.0.0.1:4002
  - n8n → 127.0.0.1:5679

## Stack
- Frontend: Next.js 14.2.35, React 18, Tailwind 3, Recharts, Socket.IO client
- Backend: Express 5.2, Prisma 5.22, PostgreSQL 16 (db container), Qdrant,
  Ollama (mistral + nomic-embed-text), n8n
- WhatsApp: Meta Cloud API (templates: `poornasree_engineer_activation_v2`,
  `engineer_ticket_assigned`)

## Roles (canonical)
`customer | service | service_engineer | service_manager |
assistant_service_manager | dealer | admin | super_admin | sales |
customer_support | marketing | customer_service`

See `api/src/lib/permissions.ts` for the predicates.

## Ticket lifecycle
```
OPEN → ASSIGNED → IN_PROGRESS → PENDING_OTP → CLOSED
```
With owner-types `MANAGER | DEALER` and parallel
`dealerResponse: pending | accepted | rejected | completed`.

## Deploy commands

| OS | Command |
|---|---|
| Mac/Linux | `./scripts/deploy-quick.sh --full` |
| Windows | `.\scripts\deploy-quick.ps1 -Api ; .\scripts\deploy-quick.ps1` |
| Server (SSH) | `cd /root/poornasree-ai && git pull origin AIpoorna && cp -f docker-compose.v4.override.yml docker-compose.override.yml && bash deploy.sh quick-api && bash deploy.sh quick` |

## Local dev

- Tunnel to VPS API: `./scripts/dev-with-server-api.sh`
- Tunnel-less (public URL): `./scripts/dev-with-server-api.sh --public`
- Both local: `npm install && npm run dev` (web on :3000, api on :4000)

## Quirks / non-obvious things
- `next.config.mjs` skips ESLint/TS errors during builds (`ignoreDuringBuilds: true`)
- `webpack.cache = false` is intentional (OneDrive symlink issue)
- Webhook dedup TTL is 5 minutes (`processedIds` Set in `whatsapp.controller.ts`)
- `chatbotSettings.controller.ts` reads from `ChatbotSetting` (singleton `id="default"`)
- AI/RAG models: `GROQ_MODEL_FAST=llama-3.1-8b-instant`, `GROQ_MODEL_AGENT=llama-3.3-70b-versatile`
- Legacy models still in schema: `Conversation`, `Message`, `SupportRequest`, `SupportMessage`, `ConversationSession` — do not extend, only migrate off.
- FSM session state is in-memory `Map` in `simulate.service.ts` — lost on API restart. Agent sessions use DB (`ConversationSession`).
- `autoAssignEngineer()` in `ticket.service.ts` must be called after ticket creation — it does NOT run automatically. FSM ticket creation paths now call it explicitly.
- WhatsApp global commands: `MENU`, `HI`, `HELLO`, `START`, `RESTART` → bypass agent, return `null` to dispatcher → FSM main menu. `SKIP` → bypass agent outside `COMPLAINT_ASK_SERIAL` state.
- `chatbot-training.json` has customer-friendly responses (rewritten 2026-08-05). `customer-training.json` is the authoritative source; only keep unique intents in `chatbot-training.json`.
