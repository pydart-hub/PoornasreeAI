# PoornasreeAI — Always-On Agent Rules

These rules are loaded for **every** Cline task in this repository. They encode
the project's architecture, conventions, and hard guardrails so you can
produce high-quality output without re-deriving context each turn.

> Repository: `pydart-hub/PoornasreeAI` (branch: `AIpoorna`)
> App URL: https://ai.poornasreecloud.com   ·   SSH alias: `poornasree-v4`
> Stack: Next.js 14 · Express 5 · Prisma · PostgreSQL 16 · Qdrant · Ollama · n8n · Meta WhatsApp Cloud API

---

## 1. Repo layout (memorize this)

| Path | Purpose |
|---|---|
| `src/app/**` | Next.js 14 App Router pages (role-grouped: `(admin)`, `(dealer)`, `(service-manager)`, etc.) |
| `src/components/**` | React components (admin / service-manager / ui / providers) |
| `src/lib/**` | Browser-side API client (`api.ts`), stores, hooks |
| `api/src/index.ts` | Express bootstrap — **route mount order matters here** |
| `api/src/routes/**` | Express routers (mounted under `/api/*`) |
| `api/src/controllers/**` | HTTP handlers |
| `api/src/services/**` | Business logic (WhatsApp FSM, tickets, RAG, notifications, OTP) |
| `api/src/middleware/auth.ts` | `protect` (JWT) + `authorize(...roles)` |
| `api/src/lib/permissions.ts` | Canonical role list + access predicates |
| `api/src/config/env.ts` | Validated env (throws at boot if missing) |
| `api/prisma/schema.prisma` | Single source of truth for DB schema |
| `docker-compose.yml` | Production stack (web, api, db, qdrant, ollama, n8n) |
| `scripts/dev-with-server-api.sh` | Local dev: web on `:5000`, API via SSH tunnel to VPS |
| `docs/` | Source-of-truth documentation (DEPLOY-RUNBOOK.md, plan.md, user-guides/) |

Two npm workspaces:
- **Frontend** (`package.json` at root): Next.js 14, React 18, Tailwind, Recharts, Socket.IO client
- **Backend** (`api/package.json`): Express 5, Prisma 5, bcrypt, jwt, socket.io, axios, sharp, gtts, pdf-parse

---

## 2. Core domain rules (DO NOT VIOLATE)

1. **Ticket is the source of truth — not Conversation.** `Conversation` /
   `Message` / `SupportRequest` are legacy. Do not introduce new flows on
   top of `Conversation`. New customer-side flows go through `Ticket` and
   the WhatsApp FSM in `api/src/services/simulate.service.ts`.

2. **The WhatsApp FSM (`simulate.service.ts`) is bilingual EN/हिंदी.** Every
   new user-facing prompt string MUST be added to the `TRANSLATIONS` map
   for **all 7 supported languages** (`en | hi | ta | kn | mr | te | bn`).
   Missing translations are a regression — do not ship.

3. **Route mount order in `api/src/index.ts` is load-bearing.**
   `whatsappRoutes`, `ticketRoutes`, `publicRoutes`, `simulateRoutes` MUST
   be registered before the broad `app.use("/api", chatRoutes)` mount,
   because `chatRoutes` runs `protect` on everything. Read the file
   before touching it.

4. **`/api/whatsapp/webhook` MUST stay unauthenticated** (Meta verifies it).
   Do not add `protect` or `authorize` anywhere upstream of this route.

5. **Auth model**: JWT in HTTP-only cookie (web) **or** `Authorization:
   Bearer` (mobile/external). Both share the same JWT. The single helper
   is `getAuthToken(req)` in `api/src/middleware/auth.ts`.

6. **Roles** are a string column (`User.role`). The canonical list lives in
   `api/src/lib/permissions.ts`. When you add a new role, update that
   file **and** `prisma/schema.prisma` comment block **and** every
   `authorize(...)` call that should include it.

7. **Pincode-based routing** is the canonical assignment strategy. New
   ticket routing should route via `Pincode` + `User.engineerPincodes`
   (`@relation("EngineerPincodes")`) — not custom geocoding.

8. **OTP lifecycle** (`generate → requestOTP → verifyOTP → CLOSED`) is
   `TicketStatus.PENDING_OTP`. Do not skip the OTP step on close.

9. **WhatsApp dedup**: `processedIds` Set in `whatsapp.controller.ts` is
   the only dedup layer. Webhook handlers MUST call `isDuplicate(messageId)`
   before any side effects.

10. **Media uploads**: stored under `api/uploads/` and served at
    `/uploads/*` (proxied by Next.js). Use `path.resolve(__dirname,
    "../uploads")` — never re-derive the path.

---

## 3. Conventions

### Code style
- **TypeScript everywhere.** `tsconfig.json` has `ignoreBuildErrors: true`
  in `next.config.mjs` for Next.js only — the API build runs `tsc`.
- **Express 5** (not 4). Use `async` handlers, return promises, no
  `next()` callbacks for async errors.
- **Bilingual strings** in simulate service use the `TRANSLATIONS` map —
  never inline user-facing copy in a handler.
- **Logging**: `console.log` / `console.error` is the convention. Do not
  introduce winston/pino without explicit request.
- **Imports**: relative paths inside `api/src/**` (`../lib/prisma`).
- **Tailwind**: brand colors live in `tailwind.config.ts` as `primary.*`,
  `accent.*`, `surface.*`. Use them — don't hard-code hex codes.

### Files you must read before editing
- `api/src/services/simulate.service.ts` — before touching customer flows
- `api/src/index.ts` — before adding/removing routes
- `api/prisma/schema.prisma` — before changing data model
- `api/src/lib/permissions.ts` — before adding roles or auth checks
- `docs/plan.md` — before proposing architecture changes
- `docs/DEPLOY-RUNBOOK.md` — before recommending a deploy command

### Naming
- Services: `*.service.ts` — exported as `* as FooService` (see
  `ticket.service.ts`, `whatsapp.service.ts`).
- Controllers: `*.controller.ts` — named exports (`export async function
  handleFoo`).
- Routes: `*.routes.ts` — default-export a configured Express `Router`.

---

## 4. Hard guardrails

- **Never** delete `api/prisma/migrations/` or run `prisma migrate reset`
  against production.
- **Never** commit `.env`, `.env.local`, `.env.production`, real SSH
  keys, or `api/prisma/dev.db` (all in `.gitignore`).
- **Never** push to a branch other than `AIpoorna` without explicit
  user confirmation. Default deploy branch is `AIpoorna`.
- **Never** run `docker compose down -v` against the VPS (wipes the
  PostgreSQL volume).
- **Never** edit `docker-compose.v4.override.yml` to change published
  ports without confirming with the user (other services share the VPS
  on `:3000`, `:3001`).
- **Never** log a JWT, OTP code, or `WA_ACCESS_TOKEN` to console.
- **Never** add a new dependency to the root `package.json` that the
  API also needs (or vice-versa) — install in the correct workspace.
- **Never** modify the legacy `Conversation` / `SupportRequest` schema
  in `schema.prisma` — they're frozen.

---

## 5. Testing rules

- **Unit tests**: there is no formal unit-test framework. Use
  `api/src/test-*.ts` ad-hoc scripts (run with `npx ts-node`).
- **E2E / simulation tests**: PowerShell only — `tests/simulation-tests.ps1`
  and `tests/e2e/test-stage-*.ps1`. Invoke via `npm run test:stages` from
  `api/`.
- **Smoke check**: `curl http://localhost:4000/health` (API) and
  `curl http://localhost:3000/` (web) before declaring a task done.

---

## 6. Deploy rules

- **Default deploy branch**: `AIpoorna` (see `docs/DEPLOY-RUNBOOK.md`).
- **Default deploy command**: `./scripts/deploy-quick.sh --full` (Mac/Linux)
  or `.\scripts\deploy-quick.ps1 -Api; .\scripts\deploy-quick.ps1` (Windows).
- **Live URL**: https://ai.poornasreecloud.com
- **Server SSH alias**: `poornasree-v4` (Ubuntu 24.04 VPS at 65.20.72.131).
- **First deploy of the day**: `git pull origin AIpoorna &&
  cp -f docker-compose.v4.override.yml docker-compose.override.yml &&
  bash deploy.sh quick-api && bash deploy.sh quick`.

---

## 7. Output quality bar (what "maximum output" means here)

For every task you produce:

1. **Read first, edit second** — use `read_file` / `search_files` to
   locate the exact file before changing it. Never edit blind.
2. **Cite file paths** as `api/src/...` or `src/...` so the user can
   jump there.
3. **Match existing style** — match indentation, naming, and imports
   in the file you're editing.
4. **Touch only what's needed** — if a task is about tickets, don't
   refactor the auth layer.
5. **Verify** — `curl /health`, `npm run lint` (frontend),
   `npx tsc --noEmit` (api), or run the relevant simulation test before
   claiming success.
6. **Surface side effects** — if a Prisma change is needed, also list
   the migration command. If an env var is needed, also list the
   `.env.example` line to add.
7. **Bilingual / role coverage** — for any user-facing copy change in
   `simulate.service.ts`, list the 7 language keys that must be added.

---

## 8. Decision tree for "where does this code go?"

```
Is it reachable from a browser?
├─ YES → src/app/(role-group)/.../page.tsx   (UI)
│       src/lib/api.ts                        (typed client)
└─ NO  → Is it called by the WhatsApp webhook?
        ├─ YES → api/src/services/simulate.service.ts   (FSM step)
        │       api/src/services/whatsapp-*.service.ts  (WhatsApp flows)
        │       api/src/controllers/whatsapp.controller.ts
        └─ NO  → Is it auth-protected?
                ├─ YES → api/src/controllers/*.controller.ts
                │        api/src/routes/*.routes.ts
                └─ NO  → api/src/routes/public.routes.ts (or .vps.ts)
```

---

## 9. Quick-reference: the file Cline touches most

If you only ever read one file in this repo, read
**`api/src/services/simulate.service.ts`** (~3,276 lines). It contains
the entire customer WhatsApp FSM: greeting, registration, complaint
capture, pincode routing, OTP flows, feedback, dealer handoff, and the
7-language `TRANSLATIONS` map. Most "small fixes" actually live here.

---

## 10. See also

- `.clinerules/rules/whatsapp-fsm.md` — deep dive on the FSM
- `.clinerules/rules/api-routes.md` — route mount order + auth patterns
- `.clinerules/rules/prisma-schema.md` — how to evolve the schema safely
- `.clinerules/rules/frontend.md` — Next.js App Router conventions
- `.clinerules/rules/deploy.md` — deploy commands by OS
- `.clinerules/workflows/` — repeatable task playbooks
- `.clinerules/MEMORY.md` — running notes Cline keeps between sessions