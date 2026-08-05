# Rule: Deploy

> Source of truth: `docs/DEPLOY-RUNBOOK.md`. This rule is a quick-reference.

## Default deploy

**Branch**: `AIpoorna`
**Server**: `poornasree-v4` → `/root/poornasree-ai`
**Live URL**: https://ai.poornasreecloud.com

### Mac / Linux
```bash
./scripts/deploy-quick.sh --full
```

### Windows (PowerShell)
```powershell
.\scripts\deploy-quick.ps1 -Api
.\scripts\deploy-quick.ps1
```

### Manually on the server (SSH)
```bash
ssh poornasree-v4
cd /root/poornasree-ai
git pull origin AIpoorna
cp -f docker-compose.v4.override.yml docker-compose.override.yml
bash deploy.sh quick-api    # rebuild + restart API container
bash deploy.sh quick        # rebuild + restart web container
```

## What the scripts actually do

`deploy-quick.sh`:
1. `git pull origin AIpoorna` on the server.
2. Copy `docker-compose.v4.override.yml` → `docker-compose.override.yml`
   (this is what gives us isolated ports `:3002`/`:4002`).
3. `docker compose build` the changed service(s).
4. `docker compose up -d` only the changed service(s) — db, qdrant,
   ollama, n8n stay up.

`deploy.sh` (the on-server script):
- `quick` → web only.
- `quick-api` → api only (runs `prisma migrate deploy` first).

## Pre-deploy checklist
- [ ] On branch `AIpoorna`. (`git branch --show-current`)
- [ ] No uncommitted changes. (`git status`)
- [ ] No `.env*` files in `git status`.
- [ ] `npm run lint` clean on the frontend.
- [ ] `npx tsc --noEmit -p api` clean on the backend.
- [ ] If you changed `schema.prisma`: migration is committed.
- [ ] If you added env vars: they are in `.env.example` AND on the
      server's `.env`.

## Post-deploy verification
```bash
# From local
curl -sS https://ai.poornasreecloud.com | head
curl -sS https://ai.poornasreecloud.com/api/health
# (API proxied behind Next.js)
ssh poornasree-v4 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

## Rollback
```bash
ssh poornasree-v4
cd /root/poornasree-ai
git log --oneline -10            # pick a good SHA
git checkout <good-sha> -- .
docker compose up -d --build api web
# If schema migration is involved: restore from
# /root/poornasree-ai/db-backups/<timestamp>.sql
```

## Don't do
- ❌ Don't deploy from any branch other than `AIpoorna` without
  explicit user confirmation.
- ❌ Don't `docker compose down -v` (wipes PostgreSQL volume).
- ❌ Don't edit `docker-compose.override.yml` directly — it's a
  copy of `docker-compose.v4.override.yml` and gets overwritten
  every deploy.
- ❌ Don't run `prisma migrate reset` on the server.

## Emergency contacts / context
- See `docs/STAFF-SSH-SETUP-WINDOWS.md` for Windows SSH setup.
- See `docs/DEPLOY-RUNBOOK.md` for the canonical runbook.
- See `docs/plan.md §13` for SSH config and key paths.