#!/bin/bash
# Server-side deploy — used by deploy-quick.sh / deploy-quick.ps1 on the VPS.
# See docs/DEPLOY-RUNBOOK.md for the full procedure.
#
# Usage:
#   bash deploy.sh quick-api   # rebuild API (~1–6 min)
#   bash deploy.sh quick       # rebuild web (~2–15 min)

set -e

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

REPO_DIR="/root/poornasree-ai"
BRANCH="AIpoorna"
MODE="${1:-}"
DEPLOY_START=$(date +%s)

if [ "$MODE" != "quick" ] && [ "$MODE" != "quick-api" ]; then
  echo "Usage: bash deploy.sh quick-api | quick"
  echo "See docs/DEPLOY-RUNBOOK.md"
  exit 1
fi

set_compose_base() {
  COMPOSE_BASE=( -f docker-compose.yml )
  if [ -f docker-compose.override.yml ]; then
    COMPOSE_BASE+=( -f docker-compose.override.yml )
  fi
}

compose() {
  docker compose "${COMPOSE_BASE[@]}" "$@"
}

cd "$REPO_DIR"

echo ""
echo "============================================"
echo " PoornasreeAI - Server Deployment"
echo "============================================"
echo " Directory: $REPO_DIR"
echo " Branch:    $BRANCH"
echo " Mode:      $MODE"
echo " Time:      $(date)"
echo ""

echo "[1/3] Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/$BRANCH
if [ -f docker-compose.v4.override.yml ]; then
  cp docker-compose.v4.override.yml docker-compose.override.yml
  echo "  Applied docker-compose.v4.override.yml (shared-server ports)."
fi
set_compose_base
echo "  Done."

if [ "${DEPLOY_REEXEC:-}" != "1" ]; then
  export DEPLOY_REEXEC=1
  exec bash "$0" "$@"
fi

QUICK_SVC="web"
[ "$MODE" = "quick-api" ] && QUICK_SVC="api"

echo ""
echo "[2/3] Building $QUICK_SVC..."
compose build "$QUICK_SVC" 2>&1 | tee /tmp/compose-build.log

echo "[3/3] Restarting $QUICK_SVC..."
compose up -d --no-deps "$QUICK_SVC" 2>&1 | tee -a /tmp/compose-build.log

if [ "$QUICK_SVC" = "api" ]; then
  echo " Applying migrations..."
  compose exec -T api npx prisma migrate deploy \
    || compose exec -T api npx prisma db push --accept-data-loss --skip-generate \
    || echo "  ⚠️  Migration failed — check schema before proceeding"
fi

DEPLOY_END=$(date +%s)
DEPLOY_SEC=$((DEPLOY_END - DEPLOY_START))
echo ""
echo "============================================"
echo " Deployment complete - $(date)"
echo "  Duration: ${DEPLOY_SEC}s (~$((DEPLOY_SEC / 60))m $((DEPLOY_SEC % 60))s)"
echo "============================================"
compose ps "$QUICK_SVC"
