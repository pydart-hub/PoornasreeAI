#!/bin/bash
# ============================================================
# deploy.sh - Server-side deployment script
# Runs on the VPS: pulls latest code from GitHub and rebuilds
#
# Usage:
#   bash deploy.sh          # rebuild api + web (keeps db/qdrant/ollama/n8n up)
#   bash deploy.sh api      # rebuild api only (fast path for backend changes)
#   bash deploy.sh web      # rebuild web only (redeploy-app.sh calls this)
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

# api/web/pull deploys skip heavy Ollama step unless explicitly requested
if [ "$MODE" = "api" ] || [ "$MODE" = "web" ] || [ "$MODE" = "pull" ]; then
  SKIP_OLLAMA="${SKIP_OLLAMA:-1}"
fi

COMPOSE_BASE=( -f docker-compose.yml )
if [ "$MODE" = "pull" ]; then
  COMPOSE_BASE=( -f docker-compose.yml -f docker-compose.images.yml )
fi

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
echo "  Done."

# Re-run with the freshly pulled script (otherwise step 2+ use stale deploy logic).
if [ "${DEPLOY_REEXEC:-}" != "1" ]; then
  export DEPLOY_REEXEC=1
  exec bash "$0" "$@"
fi

set -o pipefail
{
echo ""
case "$MODE" in
  pull)
    echo "[2/6] Pulling pre-built images (no compile on VPS)..."
    echo "  API: ${API_IMAGE:-ghcr.io/pydart-hub/poornasree-ai-api:${IMAGE_TAG:-AIpoorna}}"
    echo "  Web: ${WEB_IMAGE:-ghcr.io/pydart-hub/poornasree-ai-web:${IMAGE_TAG:-AIpoorna}}"
    docker compose "${COMPOSE_BASE[@]}" pull api web 2>&1 | tee /tmp/compose-build.log
    docker compose "${COMPOSE_BASE[@]}" up -d --no-build --no-deps api web 2>&1 | tee -a /tmp/compose-build.log
    ;;
  api)
    echo "[2/6] Rebuilding API container only (db/qdrant/ollama/n8n stay up)..."
    docker compose build api 2>&1 | tee /tmp/compose-build.log
    docker compose up -d --no-deps api 2>&1 | tee -a /tmp/compose-build.log
    ;;
  web)
    echo "[2/6] Rebuilding web container only..."
    docker compose build web 2>&1 | tee /tmp/compose-build.log
    docker compose up -d --no-deps web 2>&1 | tee -a /tmp/compose-build.log
    ;;
  full)
    echo "[2/6] Rebuilding app containers (api + web; infra stays up)..."
    docker compose build api web 2>&1 | tee /tmp/compose-build.log
    docker compose up -d --no-deps api web 2>&1 | tee -a /tmp/compose-build.log
    ;;
  *)
    echo "Unknown mode: $MODE (use 'full', 'api', 'web', or 'pull')"
    exit 1
    ;;
esac
echo "  Build finished."

echo ""
HEALTH_MAX=30
[ "$MODE" = "api" ] && HEALTH_MAX=18
echo "[3/6] Waiting for API to become healthy..."
for i in $(seq 1 $HEALTH_MAX); do
    if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
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
docker compose exec -T api npx prisma db push --accept-data-loss || echo "  (schema push skipped or already up to date)"
if [ "${SEED_ON_DEPLOY}" = "1" ]; then
    docker compose exec -T api npx prisma db seed || echo "  (seed failed or already up to date)"
else
    echo "  Skipping db seed (set SEED_ON_DEPLOY=1 or deploy.ps1 -Seed to run)."
fi
echo "  Done."

echo ""
if [ "${SKIP_OLLAMA}" = "1" ]; then
    echo "[5/6] Skipping Ollama check ($MODE deploy)."
else
echo "[5/6] Ensuring Ollama models are present..."
OLLAMA_CONTAINER=$(docker compose ps -q ollama)
if [ -z "$OLLAMA_CONTAINER" ]; then
    echo "  Ollama container not running — starting..."
    docker compose up -d ollama
    OLLAMA_CONTAINER=$(docker compose ps -q ollama)
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
