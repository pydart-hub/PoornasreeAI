# Workflow: New Cline session onboarding (read this first)

> If you're a Cline agent picking up this repo cold, read these
> files in order before doing anything else. Total time: ~5 min.
> You'll come up to speed with zero trial-and-error.

## Phase 1 — Project facts (2 min)

1. `.clinerules/MEMORY.md` — branch, live URL, SSH alias, ports,
   roles, deploy commands, quirks.
2. `README.md` — one-screen overview of the stack and layout.

## Phase 2 — Always-on rules (2 min)

3. `.clinerules/main.md` — the 10 sections. Skim the repo layout,
   the 10 core domain rules (DO NOT VIOLATE), the 8 hard
   guardrails, and the decision tree for "where does this code go?"

## Phase 3 — Domain rules on demand (1 min, when relevant)

- Touching the WhatsApp FSM? Read `.clinerules/rules/whatsapp-fsm.md`.
- Adding/changing a route? Read `.clinerules/rules/api-routes.md`.
- Editing `schema.prisma`? Read `.clinerules/rules/prisma-schema.md`.
- Building a page or component? Read `.clinerules/rules/frontend.md`.
- Deploying? Read `.clinerules/rules/deploy.md`.

## Phase 4 — Workflows on demand (when relevant)

- `.clinerules/workflows/add-whatsapp-flow.md`
- `.clinerules/workflows/add-api-route.md`
- `.clinerules/workflows/schema-change.md`
- `.clinerules/workflows/frontend-page.md`
- `.clinerules/workflows/deploy.md`
- `.clinerules/workflows/bug-investigation.md`

## What you already know without reading

- Express 5 + Prisma + PostgreSQL: standard patterns.
- Next.js 14 App Router: standard patterns.
- JWT auth via cookie or Bearer: standard patterns.
- React + Tailwind: standard patterns.

## What you should NOT skip

- The 7-language `TRANSLATIONS` map in `simulate.service.ts` — every
  user-facing string change must update all 7 keys.
- The route mount order in `api/src/index.ts` — public routers MUST
  be mounted before the broad `app.use("/api", chatRoutes)`.
- The webhook dedup Set in `whatsapp.controller.ts` — never bypass.
- OTP lifecycle — never skip on ticket close.
- Pincode-based routing — never custom geocode.

## If you're about to push to a branch

Default branch is `AIpoorna`. Default deploy command:
`./scripts/deploy-quick.sh --full` (Mac/Linux) or the PowerShell
variant. See `.clinerules/workflows/deploy.md`.