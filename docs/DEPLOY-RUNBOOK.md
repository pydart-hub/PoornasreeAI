# PoornasreeAI — Deployment Runbook

Use this checklist **every time** you deploy to production.

| | |
|---|---|
| **Live site** | https://ai.poornasreecloud.com |
| **GitHub** | https://github.com/pydart-hub/PoornasreeAI |
| **Branch** | `AIpoorna` |
| **Server** | `65.20.72.131` (SSH alias: `poornasree-v4`) |
| **SSH key** | `~/.ssh/poornasree-v4-new` (Windows: `%USERPROFILE%\.ssh\poornasree-v4-new`) |
| **SSH passphrase** | `stibe` |
| **Repo on server** | `/root/poornasree-ai` |

---

## Step 1 — Push your code to GitHub

On your PC, in the project folder:

```bash
git checkout AIpoorna
git add .
git commit -m "describe your change"
git push origin AIpoorna
```

Confirm the push succeeded on GitHub:  
https://github.com/pydart-hub/PoornasreeAI/commits/AIpoorna

---

## Step 2 — Choose what to deploy

| You changed… | Deploy command |
|--------------|----------------|
| **API / backend only** | API quick deploy (~1–6 min) |
| **UI / frontend only** | Web quick deploy (~2–15 min) |
| **Both, or not sure** | Full quick deploy — API then web (~3–20 min) |

---

## Step 3 — Deploy from your PC

### Mac / Linux

**One-time per terminal session** (unlocks SSH key):

```bash
ssh-add --apple-use-keychain ~/.ssh/poornasree-v4-new
```

When prompted for the passphrase, enter: **`stibe`**

**Then run one of:**

```bash
cd PoornasreeAI

# Both API + web (most common after a full push)
./scripts/deploy-quick.sh --full

# UI / frontend only
./scripts/deploy-quick.sh

# API / backend only
./scripts/deploy-quick.sh --api
```

If SSH might drop (slow network), run in background on the VPS:

```bash
./scripts/deploy-quick.sh --background --full
ssh poornasree-v4 'tail -f /tmp/deploy.log'
```

---

### Windows (PowerShell)

```powershell
cd PoornasreeAI

# Both API + web
.\scripts\deploy-quick.ps1 -Api
.\scripts\deploy-quick.ps1

# UI only
.\scripts\deploy-quick.ps1

# API only
.\scripts\deploy-quick.ps1 -Api

# If SSH drops mid-build
.\scripts\deploy-quick.ps1 -Background
```

SSH key path (default): `%USERPROFILE%\.ssh\poornasree-v4-new`  
SSH passphrase: **`stibe`** (enter when SSH or `ssh-add` prompts you)  
See [STAFF-SSH-SETUP-WINDOWS.md](STAFF-SSH-SETUP-WINDOWS.md) if SSH is not set up yet.

---

### On the server directly (alternative)

SSH in (passphrase: **`stibe`**):

```bash
ssh poornasree-v4
```

Paste and run:

```bash
cd /root/poornasree-ai
git remote set-url origin https://github.com/pydart-hub/PoornasreeAI.git
git pull origin AIpoorna
cp -f docker-compose.v4.override.yml docker-compose.override.yml

# Pick ONE block:

# --- Full deploy (API + web) ---
bash deploy.sh quick-api
bash deploy.sh quick

# --- API only ---
# bash deploy.sh quick-api

# --- Web only ---
# bash deploy.sh quick
```

---

## Step 4 — Verify deployment

Run on the server (or from your PC via SSH):

```bash
curl -sf http://127.0.0.1:4002/health && echo " API OK"
curl -sf -o /dev/null -w "web:%{http_code}\n" http://127.0.0.1:3002/
docker compose -f /root/poornasree-ai/docker-compose.yml \
  -f /root/poornasree-ai/docker-compose.override.yml ps api web
```

**Expected:**

| Check | Expected |
|-------|----------|
| API health | `{"status":"ok",...}` |
| Web local | `web:200` |
| Public site | https://ai.poornasreecloud.com loads (hard-refresh: `Ctrl+Shift+R`) |

From your PC (no SSH):

```bash
curl -sf -o /dev/null -w "site:%{http_code}\n" https://ai.poornasreecloud.com/
```

Expected: `site:200`

---

## Step 5 — Done checklist

- [ ] Code pushed to `pydart-hub/PoornasreeAI` → `AIpoorna`
- [ ] Deploy command finished without errors
- [ ] API health OK (`4002`)
- [ ] Web returns 200 (`3002`)
- [ ] Live site loads in browser

---

## What the deploy actually does

Old-style **quick** deploy (same as the original server process):

1. `git pull` latest `AIpoorna` from GitHub
2. Apply v4 port override (`3002` web, `4002` api)
3. `docker compose build` the service(s)
4. `docker compose up -d --no-deps` restart only api/web
5. API deploy runs `prisma db push` (schema sync)

**Does not** restart db, qdrant, ollama, or n8n.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Permission denied (publickey)` | Run `ssh-add --apple-use-keychain ~/.ssh/poornasree-v4-new` (passphrase: `stibe`) or check key path on Windows |
| SSH drops during build | Use `--background` (Mac) or `-Background` (Windows); watch `/tmp/deploy.log` on VPS |
| Web shows `000` right after deploy | Wait 10–20 seconds; web container is still starting |
| Old UI in browser | Hard refresh (`Ctrl+Shift+R`) or incognito |
| API unhealthy | `ssh poornasree-v4` → `docker compose logs api --tail 80` |
| Build failed | `ssh poornasree-v4` → `tail -100 /tmp/compose-build.log` |
| Wrong GitHub repo on server | `git remote set-url origin https://github.com/pydart-hub/PoornasreeAI.git` |

**Logs on VPS:**

```bash
tail -f /tmp/deploy.log          # deploy script
tail -f /tmp/compose-build.log   # docker build output
```

---

## Do not use

```bash
docker compose down && docker compose up -d --build
```

That can take down **db, qdrant, ollama, n8n**. Always use `deploy.sh quick`, `deploy.sh quick-api`, or the scripts above.

---

## Quick copy-paste (full deploy)

**Mac/Linux** — unlock key first (`ssh-add`, passphrase `stibe`), then:

```bash
./scripts/deploy-quick.sh --full
```

**Server SSH session:**

```bash
cd /root/poornasree-ai && git pull origin AIpoorna && bash deploy.sh quick-api && bash deploy.sh quick && curl -sf http://127.0.0.1:4002/health && curl -sf -o /dev/null -w "web:%{http_code}\n" http://127.0.0.1:3002/
```
