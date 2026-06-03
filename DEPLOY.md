# PoornasreeAI — Deployment guide

Production: **https://poornasree.pydart.com**  
VPS: `168.231.121.19` · repo on server: `/root/poornasree-ai` · branch: `AIpoorna`

## Quick reference

| What changed | Command | Typical time |
|--------------|---------|--------------|
| API only (controllers, Prisma, HR sync, webhooks) | `.\scripts\deploy-api.ps1` | ~3–8 min |
| Frontend only (Next.js pages/components) | `.\scripts\deploy-web.ps1` | ~8–15 min |
| Both API and frontend | `.\deploy.ps1` | ~15–26 min |
| Pre-built images from GitHub Actions (optional) | `.\scripts\deploy-pull.ps1` | ~1–3 min |
| SSH drops during build | Add `-Background` to any script above | Same duration; finishes on VPS |

**Workflow:** commit → `git push origin AIpoorna` → run the matching deploy script.

## Why full deploy is slow

Full deploy runs **`docker compose build api web`** on the VPS:

- API: `npm ci` → `prisma generate` → `tsc`
- Web: `npm ci` → **`next build`** (largest step on a small VPS)

Extras (seed, Ollama checks) are skipped by default on `api`/`web` modes; they are not the main cost on a **full** deploy.

## Scripts

### From Windows (recommended)

```powershell
cd PoornasreeAI

# Backend
.\scripts\deploy-api.ps1
.\scripts\deploy-api.ps1 -Background

# Frontend (replaces old redeploy-app.sh)
.\scripts\deploy-web.ps1

# Full stack
.\deploy.ps1
.\deploy.ps1 -Background

# Run prisma seed on deploy (off by default)
.\deploy.ps1 -Seed
```

### On the VPS directly

```bash
cd /root/poornasree-ai
bash deploy.sh api      # API only
bash deploy.sh web      # web only (same as redeploy-app.sh)
bash deploy.sh          # full
bash deploy.sh pull     # pull GHCR images (optional CI path)
bash redeploy-app.sh    # alias → deploy.sh web
```

Logs: `/tmp/deploy.log` · build log: `/tmp/compose-build.log`

## One-time server cache warm-up

After a fresh VPS or wiped Docker cache:

```bash
cd /root/poornasree-ai && bash scripts/prewarm-server.sh
```

## Optional: fast deploy via GitHub Actions images

Build happens in CI; the VPS only **pulls** images (~1–3 min).

### Setup (once)

1. Push workflow in [`.github/workflows/publish-images.yml`](.github/workflows/publish-images.yml) (runs on push to `AIpoorna`).
2. In GitHub: **Settings → Actions → General** — allow workflows to write packages.
3. After first run, open **Packages** on the repo and set **poornasree-ai-api** and **poornasree-ai-web** visibility to **Public** (or log in on the VPS with a `read:packages` PAT).
4. On VPS (only if packages are private):

   ```bash
   echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
   ```

### Deploy with pulled images

```powershell
.\scripts\deploy-pull.ps1
# optional tag (default: AIpoorna)
.\scripts\deploy-pull.ps1 -ImageTag AIpoorna
```

Or on VPS: `IMAGE_TAG=AIpoorna bash deploy.sh pull`

Override image names in [`.env`](.env) if needed:

```env
API_IMAGE=ghcr.io/pydart-hub/poornasree-ai-api:AIpoorna
WEB_IMAGE=ghcr.io/pydart-hub/poornasree-ai-web:AIpoorna
```

## Do not use (old server habit)

```bash
docker compose down && docker compose up -d --build   # stops DB/Ollama; more downtime
```

Current scripts use `docker compose build` + `up -d --no-deps` so **db, qdrant, ollama, n8n** stay running.

## Troubleshooting

| Issue | Action |
|-------|--------|
| SSH `Connection reset` during build | Re-run with `-Background` or check `tail -f /tmp/deploy.log` on VPS |
| Deploy “done” but old UI | You may need `deploy-web.ps1` or full `deploy.ps1`, not API-only |
| API unhealthy after deploy | `ssh poornasree` → `docker compose logs api --tail 50` |
| Pull deploy 401 | `docker login ghcr.io` on VPS or make GHCR packages public |
