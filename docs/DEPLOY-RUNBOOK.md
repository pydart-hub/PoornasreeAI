# PoornasreeAI Deployment Runbook

## GitHub Branch Details
- **Repository:** https://github.com/pydart-hub/PoornasreeAI
- **Branch:** `AIpoorna`

## Commit and Push Commands
```bash
git add .
git commit -m "Update"
git push origin AIpoorna
```

## Server Details
- **SSH Alias:** `poornasree-v4`
- **IP Address:** `65.20.72.131`
- **Remote App Directory:** `/root/poornasree-ai`
- **App URL:** https://ai.poornasreecloud.com

## Deploy Commands

**Local (Windows PowerShell):**
```powershell
# Web / UI deployment
.\scripts\deploy-quick.ps1

# API deployment
.\scripts\deploy-quick.ps1 -Api

# Full (API + Web)
.\scripts\deploy-quick.ps1 -Api
.\scripts\deploy-quick.ps1
```

**Local (Mac/Linux):**
```bash
# Web / UI deployment
./scripts/deploy-quick.sh

# API deployment
./scripts/deploy-quick.sh --api

# Full Deploy
./scripts/deploy-quick.sh --full
```

**Directly on Server (via SSH Alias):**
```bash
# SSH into the server using alias
ssh poornasree-v4

# Pull changes and deploy
cd /root/poornasree-ai
git pull origin AIpoorna
cp -f docker-compose.v4.override.yml docker-compose.override.yml
bash deploy.sh quick-api
bash deploy.sh quick
```

