# Deployment guide

Production: **https://ai.poornasreecloud.com**  
VPS: `65.20.72.131` (`poornasree-v4`) · repo on server: `/root/poornasree-ai` · branch: `AIpoorna`

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for the full deployment documentation.

Quick commands:

```bash
# Mac / Linux — commit + push + CI + fast deploy
./scripts/deploy-push.sh "feat: my change"
ssh poornasree-v4 'cd /root/poornasree-ai && bash deploy.sh pull'
```

```powershell
.\scripts\deploy-push.ps1 -Message "feat: my change"   # Windows: commit + push + CI + deploy
git push origin AIpoorna                              # CI build + auto deploy
.\scripts\deploy-pull.ps1                             # Manual pull deploy (~1–3 min)
.\deploy.ps1 -Quick                                   # VPS build web (~8–15 min)
.\deploy.ps1 -QuickApi                                # VPS build API (~3–6 min)
```

**CI / GHCR:** GitHub Actions must be enabled on `pydart-hub` (billing unlocked). If CI fails, `deploy.sh pull` falls back to building on the VPS. For private GHCR packages, set `GHCR_TOKEN` in server `.env`.

Operational scripts live under `ops/` — see [ops/README.md](ops/README.md).
