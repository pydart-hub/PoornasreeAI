#!/bin/bash
# ============================================================
# redeploy-app.sh — Frontend-only fast deploy (legacy name kept)
# Same as: bash deploy.sh quick  (old server: git pull + build web + restart)
#
# Use after UI-only changes. Does NOT rebuild the API image.
# From Windows: .\scripts\deploy-quick.ps1  or  .\scripts\deploy-web.ps1
# ============================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/deploy.sh" quick
