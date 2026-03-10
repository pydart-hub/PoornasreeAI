#!/bin/bash
# ============================================================
# ssl-setup.sh - One-shot Let's Encrypt HTTPS setup
# Run ONCE on the VPS after nginx-setup.sh has been executed.
# Requires: DNS for poornasree.pydart.com already pointing to this server.
# ============================================================

set -e

DOMAIN="poornasree.pydart.com"
EMAIL="admin@pydart.com"
SUDO_PASS="Poornasree@2026"

echo ""
echo "============================================"
echo " PoornasreeAI - SSL / HTTPS Setup"
echo " Domain: $DOMAIN"
echo "============================================"
echo ""

# ── Step 1: Install certbot + nginx plugin ────────────────────────────────
echo "[1/3] Installing certbot..."
echo "$SUDO_PASS" | sudo -S apt-get update -qq
echo "$SUDO_PASS" | sudo -S apt-get install -y certbot python3-certbot-nginx
echo "  Done."

# ── Step 2: Obtain certificate (certbot edits nginx automatically) ────────
echo ""
echo "[2/3] Obtaining SSL certificate for $DOMAIN..."
echo "$SUDO_PASS" | sudo -S certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --redirect
echo "  Certificate obtained and nginx updated with HTTPS + HTTP→HTTPS redirect."

# ── Step 3: Verify nginx and set up auto-renewal ──────────────────────────
echo ""
echo "[3/3] Testing nginx and enabling auto-renewal..."
echo "$SUDO_PASS" | sudo -S nginx -t
echo "$SUDO_PASS" | sudo -S systemctl reload nginx

# Certbot installs a systemd timer for auto-renewal; verify it
echo "$SUDO_PASS" | sudo -S systemctl status certbot.timer --no-pager || true
echo "  Auto-renewal timer is active (renews every 60 days)."

echo ""
echo "============================================"
echo " SSL setup complete!"
echo " https://$DOMAIN       -> Next.js (HTTPS)"
echo " https://$DOMAIN/api/* -> Express API (HTTPS)"
echo ""
echo " Voice input (microphone) will now work in Chrome."
echo "============================================"
echo ""
