#!/bin/bash
# ============================================================
# redeploy-app.sh — Frontend-only fast deploy (legacy name kept)
# Same as: bash deploy.sh web
#
# Use after UI-only changes. Does NOT rebuild the API image.
# From Windows: .\scripts\deploy-web.ps1
# ============================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/deploy.sh" web
