# PoornasreeAI — Deployment guide

Production: **https://poornasree.pydart.com**  
VPS: `168.231.121.19` · repo on server: `/root/poornasree-ai` · branch: `AIpoorna`

## Quick reference (use this daily — same as old server)

| What changed | Command | Typical time |
|--------------|---------|--------------|
| **UI / pages (most deploys)** | `.\scripts\deploy-quick.ps1` | **~8–15 min** |
| **API / HR / backend** | `.\scripts\deploy-quick.ps1 -Api` | **~3–6 min** |
| Both API and frontend | `.\deploy.ps1` (full) | ~15–26 min |
| Pre-built images from GitHub Actions (optional) | `.\scripts\deploy-pull.ps1` | ~1–3 min |
| SSH drops during build | Add `-Background` | Finishes on VPS |

**Workflow:** commit → `git push origin AIpoorna` → **`.\scripts\deploy-quick.ps1`**

### Old server vs now

| Old server (`redeploy-app.sh`) | New server (same habit) |
|--------------------------------|-------------------------|
| `git pull` + `docker compose build app` | `git pull` + `docker compose build web` |
| ~8–15 min for UI | `.\scripts\deploy-quick.ps1` — **same steps, no extra waits** |

Do **not** use plain `.\deploy.ps1` for small changes — that is the slow full rebuild.

## Why full deploy is slow

Full deploy runs **`docker compose build api web`** on the VPS:

- API: `npm ci` → `prisma generate` → `tsc`
- Web: `npm ci` → **`next build`** (largest step on a small VPS)

Extras (seed, Ollama checks) are skipped by default on `api`/`web` modes; they are not the main cost on a **full** deploy.

## Scripts

### From Windows (recommended)

```powershell
cd PoornasreeAI

# Daily deploy (old server speed) — USE THIS
.\scripts\deploy-quick.ps1
.\scripts\deploy-quick.ps1 -Background

# API-only quick
.\scripts\deploy-quick.ps1 -Api

# Aliases
.\scripts\deploy-web.ps1          # same as deploy-quick.ps1
bash redeploy-app.sh              # on VPS — same quick path

# Full stack (only when both api + web changed)
.\deploy.ps1 -Background

# Backend with extra prisma/nginx checks (slower than -Quick)
.\scripts\deploy-api.ps1 -Quick

# Run prisma seed on deploy (off by default)
.\deploy.ps1 -Seed
```

### On the VPS directly

```bash
cd /root/poornasree-ai
bash deploy.sh quick      # UI only — old server style (default habit)
bash deploy.sh quick-api  # API only — old server style
bash redeploy-app.sh      # alias → deploy.sh quick
bash deploy.sh            # full (slow)
bash deploy.sh pull       # pull GHCR images (optional CI path)
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
