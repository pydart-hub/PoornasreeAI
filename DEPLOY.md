# Deployment guide

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for the full deployment documentation.

Quick commands:

```powershell
git push origin AIpoorna          # CI build + auto deploy
.\scripts\deploy-pull.ps1         # Manual pull deploy (~1–3 min)
.\deploy.ps1 -Quick               # VPS build web (~8–15 min)
.\deploy.ps1 -QuickApi            # VPS build API (~3–6 min)
```

Operational scripts live under `ops/` — see [ops/README.md](ops/README.md).
