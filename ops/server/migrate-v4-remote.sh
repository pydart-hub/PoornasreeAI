#!/bin/bash
# Server-side migration helper — run on poornasree-v4 after backups are in /tmp/poornasree-migrate/
set -euo pipefail

REPO_DIR="/root/poornasree-ai"
DOMAIN="ai.poornasreecloud.com"
WEB_PORT=3002
API_PORT=4002
N8N_PORT=5679
BRANCH="AIpoorna"
MIGRATE_DIR="/tmp/poornasree-migrate"

echo "=== PoornasreeAI migration to $DOMAIN ==="

# ── 1. Clone repo if missing ───────────────────────────────────────────────
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone -b "$BRANCH" https://github.com/pydart-hub/PoornasreeAI.git "$REPO_DIR"
fi
cd "$REPO_DIR"
git fetch origin
git reset --hard "origin/$BRANCH"

# ── 2. Port override (3000 taken by psr-v4) ────────────────────────────────
cat > docker-compose.override.yml << EOF
# Auto-generated for poornasree-v4 — avoids conflict with psr-v4 on :3000
services:
  web:
    ports:
      - "127.0.0.1:${WEB_PORT}:3000"
  api:
    ports:
      - "127.0.0.1:${API_PORT}:4000"
  n8n:
    ports:
      - "127.0.0.1:${N8N_PORT}:5678"
EOF

# ── 3. .env from old server ─────────────────────────────────────────────────
if [ ! -f .env ] && [ -f /tmp/poornasree-ai.env ]; then
  cp /tmp/poornasree-ai.env .env
fi
if [ ! -f .env ]; then
  echo "ERROR: .env not found in $REPO_DIR — copy from old server first"
  exit 1
fi
sed -i "s|https://poornasree.pydart.com|https://${DOMAIN}|g" .env
sed -i "s|http://poornasree.pydart.com|https://${DOMAIN}|g" .env

# ── 4. Start infra only ────────────────────────────────────────────────────
docker compose up -d db qdrant ollama n8n
echo "Waiting for postgres..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U poorna_user >/dev/null 2>&1; then break; fi
  sleep 2
done

# ── 5. Restore postgres ────────────────────────────────────────────────────
if [ -f "$MIGRATE_DIR/poornasree_ai.dump" ]; then
  docker compose exec -T db dropdb -U poorna_user --if-exists poornasree_ai
  docker compose exec -T db createdb -U poorna_user poornasree_ai
  cat "$MIGRATE_DIR/poornasree_ai.dump" | docker compose exec -T db pg_restore -U poorna_user -d poornasree_ai --no-owner --no-acl 2>/dev/null || true
  echo "Postgres restored."
fi

# ── 6. Restore volumes ─────────────────────────────────────────────────────
restore_vol() {
  local vol="$1" tgz="$2"
  if [ -f "$tgz" ]; then
    local vpath
    vpath=$(docker volume inspect "$vol" --format '{{ .Mountpoint }}' 2>/dev/null || true)
    if [ -z "$vpath" ]; then
      docker compose up -d db qdrant n8n api 2>/dev/null || true
      docker compose down api web 2>/dev/null || true
      vpath=$(docker volume inspect "$vol" --format '{{ .Mountpoint }}')
    fi
    rm -rf "${vpath:?}/"*
    tar xzf "$tgz" -C "$vpath" --strip-components=1
    echo "Restored $vol"
  fi
}

# Create volumes by starting services briefly
docker compose up -d qdrant n8n 2>/dev/null || true
sleep 2

restore_vol "poornasree-ai_api_uploads" "$MIGRATE_DIR/uploads.tgz"
restore_vol "poornasree-ai_qdrant_data" "$MIGRATE_DIR/qdrant.tgz"
restore_vol "poornasree-ai_n8n_data" "$MIGRATE_DIR/n8n.tgz"

# ── 7. Pull images and start app ───────────────────────────────────────────
export IMAGE_TAG=AIpoorna
export SKIP_OLLAMA=1
bash deploy.sh pull

# ── 8. Ollama models ───────────────────────────────────────────────────────
OLLAMA=$(docker compose ps -q ollama)
for m in nomic-embed-text mistral; do
  docker exec "$OLLAMA" ollama pull "$m" || true
done

# ── 9. Nginx site (isolated — does not touch psr-v4 / machine-detector) ────
NGINX_SITE="/etc/nginx/sites-available/poornasree-ai"
cat > "$NGINX_SITE" << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;
    client_max_body_size 50M;

    location /socket.io/ {
        proxy_pass         http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
        send_timeout          300s;
    }

    location /uploads/ {
        proxy_pass         http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass         http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 90s;
    }
}
NGINXEOF

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/poornasree-ai
nginx -t && systemctl reload nginx

# ── 10. SSL ────────────────────────────────────────────────────────────────
if ! certbot certificates 2>/dev/null | grep -q "$DOMAIN"; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@poornasreecloud.com --redirect || echo "SSL: run certbot manually if DNS not ready"
fi

echo ""
echo "=== Migration complete ==="
echo "  https://${DOMAIN}"
curl -sf "http://127.0.0.1:${API_PORT}/health" && echo " API healthy on :${API_PORT}" || echo " WARN: API health check failed"
docker compose ps
