# Workflow: Deploy

> Used when the user asks to deploy, push, or "ship" the app.
> Source of truth: `docs/DEPLOY-RUNBOOK.md`. This workflow is a
> quick-reference checklist.

## Pre-deploy checklist (always)

- [ ] On branch `AIpoorna`. (`git branch --show-current`)
- [ ] No uncommitted changes. (`git status`)
- [ ] No `.env*` files staged. (`git status --ignored`)
- [ ] `npm run lint` clean on the frontend (cd root, `npm run lint`).
- [ ] `cd api && npx tsc --noEmit` clean on the backend.
- [ ] If you changed `schema.prisma`: migration is committed.
- [ ] If you added env vars: they are in `.env.example` AND on the
      server's `.env` (the deploy script does NOT copy `.env`).

## Quick commands

### Mac / Linux (preferred — one command)
```bash
./scripts/deploy-quick.sh --full
```

### Windows (PowerShell)
```powershell
.\scripts\deploy-quick.ps1 -Api
.\scripts\deploy-quick.ps1
```

### Manual on the server
```bash
ssh poornasree-v4
cd /root/poornasree-ai
git pull origin AIpoorna
cp -f docker-compose.v4.override.yml docker-compose.override.yml
bash deploy.sh quick-api    # rebuild + restart API container
bash deploy.sh quick        # rebuild + restart web container
```

## Post-deploy verification (always)

```bash
# From local — these go through nginx → Next.js → API
curl -sS https://ai.poornasreecloud.com | head
curl -sS https://ai.poornasreecloud.com/api/health

# Container status on the server
ssh poornasree-v4 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

You should see:
- `api` → `Up` (no restarts).
- `web` → `Up` (no restarts).
- `/health` → `{ "status": "ok", "env": "production" }`.
- `/` → HTML containing `<title>PoornasreeAI</title>`.

## When the deploy goes wrong

1. **502 Bad Gateway** — usually a container didn't start. Check:
   ```bash
   ssh poornasree-v4 "docker compose logs --tail=200 api"
   ```
2. **Old schema errors** — migration didn't apply. Run manually:
   ```bash
   ssh poornasree-v4
   cd /root/poornasree-ai
   docker compose exec api npx prisma migrate deploy
   docker compose restart api
   ```
3. **Need to roll back** — see `.clinerules/rules/deploy.md` §
   "Rollback". Pick a good SHA, `git checkout <sha> -- .`,
   rebuild, restart. If schema migration is involved, restore from
   `/root/poornasree-ai/db-backups/<timestamp>.sql`.

## Hard rules
- ❌ Don't deploy from any branch other than `AIpoorna` without
  explicit user confirmation.
- ❌ Don't `docker compose down -v` (wipes the PostgreSQL volume).
- ❌ Don't edit `docker-compose.override.yml` directly — it's
  regenerated every deploy from `docker-compose.v4.override.yml`.
- ❌ Don't run `prisma migrate reset` on the server.