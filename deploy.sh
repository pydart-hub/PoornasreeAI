#!/bin/bash
# ============================================================
# deploy.sh - Server-side deployment script
# Runs on the VPS: pulls latest code from GitHub and rebuilds
# ============================================================

set -e

REPO_DIR="/home/deploy/poornasree-ai"
BRANCH="AIpoorna"

cd "$REPO_DIR"

echo ""
echo "============================================"
echo " PoornasreeAI - Server Deployment"
echo "============================================"
echo " Directory: $REPO_DIR"
echo " Branch:    $BRANCH"
echo " Time:      $(date)"
echo ""

echo "[1/2] Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/$BRANCH
echo "  Done."

echo ""
echo "[2/3] Rebuilding Docker containers..."
docker compose down
docker compose up -d --build
echo "  Done."

echo ""
echo "[3/3] Applying Prisma schema changes..."
sleep 5  # wait for DB to be ready
docker compose exec -T api npx prisma db push || echo "  (schema push skipped or already up to date)"
echo "  Done."

echo ""
echo "============================================"
echo " Deployment complete - $(date)"
echo "============================================"
echo ""
