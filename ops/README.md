# Operations scripts

## deploy/

| Script | Purpose |
|--------|---------|
| `deploy-quick.ps1` | VPS build web or API — see [docs/DEPLOY-RUNBOOK.md](../docs/DEPLOY-RUNBOOK.md) |

**VPS script:** `deploy.sh` at repo root (`quick` / `quick-api`).

## server/

| Script | Purpose |
|--------|---------|
| `nginx-setup.sh` | Install nginx reverse proxy |
| `ssl-setup.sh` | Let's Encrypt HTTPS |
| `server-setup.sh` | Fresh VPS bootstrap |
| `install-docker.sh` | Install Docker CE |
| `migrate-v4-remote.sh` | v4 server migration |
| `retarget-github-remote.sh` | Point VPS git remote at pydart-hub |
| `patch-vps-wa-env.sh` | Append WhatsApp template env vars |
| `check-users.sh` | List DB users via Prisma |
| `test-login.sh` | Login smoke test |

## data/

| Script | Purpose |
|--------|---------|
| `import-dealers-v2.ps1` | Bulk dealer import |
| `clear-customer-data.ps1` | Wipe test customer tickets + chat state |
| `clear-customer-data.sql` | SQL version of customer wipe |
| `create-users.ps1` | Seed users via Admin API |

## archive/

Old one-off scripts kept for reference. Not used in normal workflow.

## Usage

```powershell
.\scripts\deploy-quick.ps1
.\ops\data\clear-customer-data.ps1 -Vps
```
