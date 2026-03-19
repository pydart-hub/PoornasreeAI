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
echo "[3/4] Applying Prisma schema changes..."
sleep 5  # wait for DB to be ready
docker compose exec -T api npx prisma db push --accept-data-loss || echo "  (schema push skipped or already up to date)"
docker compose exec -T api npx prisma db seed || echo "  (seed skipped or already up to date)"
echo "  Done."

echo ""
echo "[4/4] Syncing Nginx socket.io proxy rule..."
# Write the full nginx config to a temp file (no sudo needed)
cat > /tmp/poornasree-nginx.conf << 'NGINXEOF'
server {
    listen 80;
    server_name poornasree.pydart.com 187.77.188.63;

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

# Check whether the socket.io block is already present in the live config
if grep -q "location /socket.io/" /etc/nginx/sites-available/poornasree 2>/dev/null; then
    echo "  Nginx socket.io block already present — skipping."
else
    # Attempt to apply without password (NOPASSWD sudoers rule)
    if sudo -n cp /tmp/poornasree-nginx.conf /etc/nginx/sites-available/poornasree 2>/dev/null \
       && sudo -n nginx -t 2>/dev/null \
       && sudo -n systemctl reload nginx 2>/dev/null; then
        echo "  Nginx config updated and reloaded (passwordless sudo)."
    else
        echo ""
        echo "  !! Nginx config needs manual update — sudo password required."
        echo "  !! Run the following two commands on the VPS to fix Socket.IO:"
        echo ""
        echo "       sudo cp /tmp/poornasree-nginx.conf /etc/nginx/sites-available/poornasree"
        echo "       sudo nginx -t && sudo systemctl reload nginx"
        echo ""
        echo "  (The updated config is already written to /tmp/poornasree-nginx.conf)"
    fi
fi
echo "  Done."

echo ""
echo "============================================"
echo " Deployment complete - $(date)"
echo "============================================"
echo ""