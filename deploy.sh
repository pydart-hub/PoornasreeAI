#!/bin/bash
# ============================================================
# deploy.sh - Server-side deployment script
# Runs on the VPS: pulls latest code from GitHub and rebuilds
#
# Usage:
#   bash deploy.sh          # rebuild api + web (keeps db/qdrant/ollama/n8n up)
#   bash deploy.sh api      # rebuild api only (fast path for backend changes)
#   bash deploy.sh quick    # OLD SERVER STYLE: pull + build web + restart (~8-15 min)
#   bash deploy.sh quick-api # OLD STYLE for API: pull + build api + restart (~3-6 min)
#   bash deploy.sh web      # web + prisma/nginx checks (slower than quick)
#   bash deploy.sh pull     # pull pre-built GHCR images (fast; requires CI images)
#   bash deploy.sh full     # same as default
#
# Env (optional):
#   SEED_ON_DEPLOY=1       # run prisma db seed (skipped by default — saves time)
#   SKIP_OLLAMA=1          # skip Ollama model check (auto-set for api/web modes)
# ============================================================

set -e

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

REPO_DIR="/root/poornasree-ai"
BRANCH="AIpoorna"
MODE="${1:-full}"
DEPLOY_START=$(date +%s)
DEPLOY_LOG="${DEPLOY_LOG:-/tmp/deploy.log}"

# api/web/pull/quick deploys skip heavy Ollama step unless explicitly requested
if [ "$MODE" = "api" ] || [ "$MODE" = "web" ] || [ "$MODE" = "pull" ] || [ "$MODE" = "quick" ] || [ "$MODE" = "quick-api" ]; then
  SKIP_OLLAMA="${SKIP_OLLAMA:-1}"
fi

set_compose_base() {
  COMPOSE_BASE=( -f docker-compose.yml )
  if [ "$MODE" = "pull" ]; then
    COMPOSE_BASE+=( -f docker-compose.images.yml )
    SKIP_NGINX="${SKIP_NGINX:-1}"
  fi
  if [ -f docker-compose.override.yml ]; then
    COMPOSE_BASE+=( -f docker-compose.override.yml )
  fi
}

set_compose_base

compose() {
  docker compose "${COMPOSE_BASE[@]}" "$@"
}

ghcr_login() {
  if docker pull ghcr.io/pydart-hub/poornasree-ai-api:AIpoorna >/dev/null 2>&1; then
    return 0
  fi
  if [ -f .env ] && grep -q '^GHCR_TOKEN=' .env 2>/dev/null; then
    # shellcheck disable=SC1091
    source .env
    if [ -n "${GHCR_TOKEN:-}" ]; then
      echo "  Logging in to GHCR..."
      echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-pydart-hub}" --password-stdin
    fi
  fi
}

api_health_url() {
  if [ -f docker-compose.override.yml ]; then
    echo "http://127.0.0.1:4002/health"
  else
    echo "${API_HEALTH_URL:-http://127.0.0.1:4000/health}"
  fi
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
echo " Seed:      ${SEED_ON_DEPLOY:-0 (skipped)}"
echo " Ollama:    ${SKIP_OLLAMA:+skipped}${SKIP_OLLAMA:-check on full deploy}"
echo " Log:       $DEPLOY_LOG"
echo ""

echo "[1/6] Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/$BRANCH
if [ -f docker-compose.v4.override.yml ]; then
  cp docker-compose.v4.override.yml docker-compose.override.yml
  echo "  Applied docker-compose.v4.override.yml (shared-server ports)."
fi
set_compose_base
echo "  Compose: ${COMPOSE_BASE[*]}"
echo "  Done."

# Re-run with the freshly pulled script (otherwise step 2+ use stale deploy logic).
if [ "${DEPLOY_REEXEC:-}" != "1" ]; then
  export DEPLOY_REEXEC=1
  exec bash "$0" "$@"
fi

# ── Quick path (same as old server redeploy-app.sh) ─────────────────────────
# git pull → docker compose build → up. No health loop, seed, Ollama, or nginx.
if [ "$MODE" = "quick" ] || [ "$MODE" = "quick-api" ]; then
  QUICK_SVC="web"
  [ "$MODE" = "quick-api" ] && QUICK_SVC="api"
  echo ""
  echo " Quick deploy (old-server style) — service: $QUICK_SVC"
  echo ""
  echo "[2/3] Building $QUICK_SVC..."
  compose build "$QUICK_SVC" 2>&1 | tee /tmp/compose-build.log
  echo "[3/3] Restarting $QUICK_SVC..."
  compose up -d --no-deps "$QUICK_SVC" 2>&1 | tee -a /tmp/compose-build.log
  if [ "$QUICK_SVC" = "api" ]; then
    echo " Applying schema (API only)..."
    compose exec -T api npx prisma db push --accept-data-loss \
      || echo "  (schema push skipped)"
  fi
  DEPLOY_END=$(date +%s)
  DEPLOY_SEC=$((DEPLOY_END - DEPLOY_START))
  echo ""
  echo "============================================"
  echo " Quick deployment complete - $(date)"
  echo "  Duration: ${DEPLOY_SEC}s (~$((DEPLOY_SEC / 60))m $((DEPLOY_SEC % 60))s)"
  echo "============================================"
  compose ps "$QUICK_SVC"
  exit 0
fi

set -o pipefail
{
echo ""
case "$MODE" in
  pull)
    echo "[2/6] Pulling pre-built images (no compile on VPS)..."
    echo "  API: ${API_IMAGE:-ghcr.io/pydart-hub/poornasree-ai-api:${IMAGE_TAG:-AIpoorna}}"
    echo "  Web: ${WEB_IMAGE:-ghcr.io/pydart-hub/poornasree-ai-web:${IMAGE_TAG:-AIpoorna}}"
    ghcr_login || true
    if ! compose pull api web 2>&1 | tee /tmp/compose-build.log; then
      echo "  WARN: GHCR pull failed — building api + web on VPS (slower)..."
      compose build api web 2>&1 | tee -a /tmp/compose-build.log
      compose up -d --no-deps api web 2>&1 | tee -a /tmp/compose-build.log
    else
      compose up -d --no-build --no-deps api web 2>&1 | tee -a /tmp/compose-build.log
    fi
    ;;
  api)
    echo "[2/6] Rebuilding API container only (db/qdrant/ollama/n8n stay up)..."
    compose build api 2>&1 | tee /tmp/compose-build.log
    compose up -d --no-deps api 2>&1 | tee -a /tmp/compose-build.log
    ;;
  web)
    echo "[2/6] Rebuilding web container only..."
    compose build web 2>&1 | tee /tmp/compose-build.log
    compose up -d --no-deps web 2>&1 | tee -a /tmp/compose-build.log
    ;;
  full)
    echo "[2/6] Rebuilding app containers (api + web; infra stays up)..."
    compose build api web 2>&1 | tee /tmp/compose-build.log
    compose up -d --no-deps api web 2>&1 | tee -a /tmp/compose-build.log
    ;;
  *)
    echo "Unknown mode: $MODE (use 'quick', 'quick-api', 'full', 'api', 'web', or 'pull')"
    exit 1
    ;;
esac
echo "  Build finished."

echo ""
HEALTH_MAX=30
[ "$MODE" = "api" ] && HEALTH_MAX=18
[ "$MODE" = "pull" ] && HEALTH_MAX=12
HEALTH_URL=$(api_health_url)
echo "[3/6] Waiting for API to become healthy ($HEALTH_URL)..."
for i in $(seq 1 $HEALTH_MAX); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1 \
       || compose exec -T api curl -sf http://localhost:4000/health > /dev/null 2>&1; then
        echo "  API healthy."
        break
    fi
    if [ "$i" -eq "$HEALTH_MAX" ]; then
        echo "  WARN: API health check timed out — continuing anyway."
    else
        echo "  Waiting for API... ($i/$HEALTH_MAX)"
        sleep 5
    fi
done

echo ""
echo "[4/6] Applying Prisma schema changes..."
compose exec -T api npx prisma db push --accept-data-loss || echo "  (schema push skipped or already up to date)"
if [ "${SEED_ON_DEPLOY}" = "1" ]; then
    compose exec -T api npx prisma db seed || echo "  (seed failed or already up to date)"
else
    echo "  Skipping db seed (set SEED_ON_DEPLOY=1 or deploy.ps1 -Seed to run)."
fi
echo "  Done."

echo ""
if [ "${SKIP_OLLAMA}" = "1" ]; then
    echo "[5/6] Skipping Ollama check ($MODE deploy)."
else
echo "[5/6] Ensuring Ollama models are present..."
OLLAMA_CONTAINER=$(compose ps -q ollama)
if [ -z "$OLLAMA_CONTAINER" ]; then
    echo "  Ollama container not running — starting..."
    compose up -d ollama
    OLLAMA_CONTAINER=$(compose ps -q ollama)
fi

for i in $(seq 1 12); do
    if docker exec "$OLLAMA_CONTAINER" ollama list > /dev/null 2>&1; then
        break
    fi
    echo "  Waiting for Ollama to start... ($i/12)"
    sleep 5
done

MODELS_NEEDED=("nomic-embed-text" "mistral")
for MODEL in "${MODELS_NEEDED[@]}"; do
    if docker exec "$OLLAMA_CONTAINER" ollama list | grep -q "^${MODEL}"; then
        echo "  $MODEL already present — skipping."
    else
        echo "  Pulling $MODEL..."
        docker exec "$OLLAMA_CONTAINER" ollama pull "$MODEL"
        echo "  $MODEL pulled."
    fi
done
echo "  Done."
fi

echo ""
if [ "${SKIP_NGINX}" = "1" ]; then
    echo "[6/6] Skipping Nginx sync ($MODE deploy)."
else
echo "[6/6] Syncing Nginx socket.io proxy rule..."
cat > /tmp/poornasree-nginx.conf << 'NGINXEOF'
server {
    listen 80;
    server_name poornasree.pydart.com;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    client_max_body_size 50M;

    # Socket.IO — must be before the catch-all / block
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # API — proxied to Express backend
    location /api/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
        send_timeout          300s;
    }

    # Frontend — proxied to Next.js
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }
}
NGINXEOF

if grep -q "location /socket.io/" /etc/nginx/sites-available/poornasree 2>/dev/null; then
    echo "  Nginx socket.io block already present — skipping."
else
    cp /tmp/poornasree-nginx.conf /etc/nginx/sites-available/poornasree
    ln -sf /etc/nginx/sites-available/poornasree /etc/nginx/sites-enabled/poornasree 2>/dev/null || true
    nginx -t && systemctl reload nginx
    echo "  Nginx config updated and reloaded."
fi
echo "  Done."
fi

echo ""
echo "============================================"
DEPLOY_END=$(date +%s)
DEPLOY_SEC=$((DEPLOY_END - DEPLOY_START))
echo " Deployment complete - $(date)"
echo "  Mode: $MODE"
echo "  Duration: ${DEPLOY_SEC}s (~$((DEPLOY_SEC / 60))m $((DEPLOY_SEC % 60))s)"
echo "  Tip: deploy.ps1 -ApiOnly / -WebOnly; -PullOnly for GHCR images; -Background if SSH drops"
echo "  Seed: deploy.ps1 -Seed  or  SEED_ON_DEPLOY=1 bash deploy.sh"
echo "============================================"
echo ""

} 2>&1 | tee -a "$DEPLOY_LOG"
DEPLOY_EXIT=${PIPESTATUS[0]}
exit $DEPLOY_EXIT
