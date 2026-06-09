# Operations scripts

All operational scripts live here. Root-level and `scripts/` wrappers forward here for backward compatibility.

## deploy/

| Script | Purpose |
|--------|---------|
| `deploy-pull.ps1` | Pull pre-built GHCR images (fast, ~1–3 min) |
| `deploy-quick.ps1` | VPS build web or API (legacy fast path) |
| `deploy-api.ps1` | API-only deploy |
| `prewarm-server.ps1` | Warm Docker/Ollama cache on fresh VPS |

**Canonical VPS script stays at repo root:** `deploy.sh` (used by GitHub Actions).

## server/

| Script | Purpose |
|--------|---------|
| `nginx-setup.sh` | Install nginx reverse proxy |
| `ssl-setup.sh` | Let's Encrypt HTTPS |
| `server-setup.sh` | Fresh VPS bootstrap |
| `install-docker.sh` | Install Docker CE |
| `prewarm-server.sh` | Server-side cache warm-up |
| `migrate-v4-remote.sh` | v4 server migration |
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

Old debug scripts kept for reference (`do-seed2`–`6`, `run-seed.sh`, legacy imports, one-time fixes). Not used in normal workflow.

## Usage examples

```powershell
.\ops\deploy\deploy-pull.ps1
.\ops\data\clear-customer-data.ps1 -Vps
.\ops\data\import-dealers-v2.ps1
```

Or use root wrappers: `.\scripts\deploy-pull.ps1`, `.\clear-customer-data.ps1`, etc.
