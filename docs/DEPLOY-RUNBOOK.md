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
- **IP Address:** `65.20.72.131`
- **SSH Key:** `~/.ssh/poornasree-v4-new` (Windows: `%USERPROFILE%\.ssh\poornasree-v4-new`)
- **Passphrase:** `stibe`

## Deploy Commands

**Local (Windows PowerShell):**
```powershell
# UI only
.\scripts\deploy-quick.ps1

# API only
.\scripts\deploy-quick.ps1 -Api

# Full (API + Web)
.\scripts\deploy-quick.ps1 -Api
.\scripts\deploy-quick.ps1
```

**Local (Mac/Linux):**
```bash
# Unlock SSH key first
ssh-add ~/.ssh/poornasree-v4-new

# Full Deploy
./scripts/deploy-quick.sh --full
```

**Directly on Server:**
```bash
# SSH into the server
ssh root@65.20.72.131 -i ~/.ssh/poornasree-v4-new

# Pull changes and deploy
cd /root/poornasree-ai
git pull origin AIpoorna
cp -f docker-compose.v4.override.yml docker-compose.override.yml
bash deploy.sh quick-api
bash deploy.sh quick
```
