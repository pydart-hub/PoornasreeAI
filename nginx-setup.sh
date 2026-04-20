#!/bin/bash
# ============================================================
# nginx-setup.sh - One-shot Nginx reverse proxy setup
# Run once on the VPS to install and configure Nginx.
# ============================================================

set -e

REPO_DIR="/home/deploy/poornasree-ai"
NGINX_CONF="/etc/nginx/sites-available/poornasree"
SUDO_PASS="Poornasree@2026"

echo ""
echo "============================================"
echo " PoornasreeAI - Nginx Setup"
echo "============================================"
echo ""

# ── Step 1: Stop Docker containers to free port 80 ───────────────────────
echo "[1/5] Stopping Docker containers to free port 80..."
cd "$REPO_DIR"
docker compose down
echo "  Done."

# ── Step 2: Install Nginx ─────────────────────────────────────────────────
echo ""
echo "[2/5] Installing Nginx..."
echo "$SUDO_PASS" | sudo -S apt-get update -qq
echo "$SUDO_PASS" | sudo -S apt-get install -y nginx
echo "$SUDO_PASS" | sudo -S systemctl enable nginx
echo "  Done."

# ── Step 3: Write Nginx site config ──────────────────────────────────────
echo ""
echo "[3/5] Writing Nginx configuration..."

echo "$SUDO_PASS" | sudo -S tee "$NGINX_CONF" > /dev/null << 'NGINX_CONF_CONTENT'
server {
    listen 80;
    server_name poornasree.pydart.com;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    # Request size limit (for file uploads)
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

    # Uploaded files (product images, logos, etc.) — proxied to Express
    location /uploads/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;

        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Frontend — proxied to Next.js
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support (Next.js HMR / real-time features)
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
NGINX_CONF_CONTENT

echo "  Config written to $NGINX_CONF"

# ── Step 4: Enable site, remove default, test, start Nginx ───────────────
echo ""
echo "[4/5] Enabling site and starting Nginx..."

# Enable our site
echo "$SUDO_PASS" | sudo -S ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/poornasree

# Remove default site if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    echo "$SUDO_PASS" | sudo -S rm /etc/nginx/sites-enabled/default
    echo "  Removed default site."
fi

# Test config
echo "$SUDO_PASS" | sudo -S nginx -t

# Start / restart Nginx
echo "$SUDO_PASS" | sudo -S systemctl restart nginx
echo "  Nginx running on port 80."

# ── Step 5: Pull latest code and restart Docker ───────────────────────────
echo ""
echo "[5/5] Pulling latest code and restarting Docker containers..."
cd "$REPO_DIR"
git fetch origin
git reset --hard origin/AIpoorna
docker compose up -d --build
echo "  Done."

echo ""
echo "============================================"
echo " Setup complete!"
echo " http://poornasree.pydart.com        -> Next.js"
echo " http://poornasree.pydart.com/api/*  -> Express API"
echo "============================================"
echo ""
