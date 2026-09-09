#!/usr/bin/env bash
# ==============================================================================
# Poornasree AI - Localhost Live Development & Webhook Ingress Starter
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$ROOT_DIR/api"

echo "=========================================================="
echo "🚀 Starting Poornasree AI Local Development Environment"
echo "=========================================================="

# 1. Start Persistent SSH Tunnel to Production PostgreSQL if not already running
if ! lsof -i :5433 >/dev/null 2>&1; then
  echo "🔗 Establishing SSH Tunnel to VPS PostgreSQL (localhost:5433 -> 172.18.0.2:5432)..."
  ssh -f -N -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L 5433:172.18.0.2:5432 root@65.20.72.131
  echo "✅ SSH Tunnel active on port 5433."
else
  echo "✅ SSH Tunnel already running on port 5433."
fi

# 2. Check if port 4000 has stale processes
if lsof -i :4000 >/dev/null 2>&1; then
  echo "⚠️ Port 4000 in use. Cleaning up stale process..."
  lsof -ti :4000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# 3. Start Cloudflare Tunnel in Background
echo "🌐 Starting Cloudflare Webhook Tunnel..."
TMP_LOG=$(mktemp)
/opt/homebrew/bin/cloudflared tunnel --url http://localhost:4000 > "$TMP_LOG" 2>&1 &
CF_PID=$!

sleep 3
CF_URL=""
for i in {1..10}; do
  CF_URL=$(grep -o 'https://.*trycloudflare.com' "$TMP_LOG" | tail -n 1 || true)
  if [ -n "$CF_URL" ]; then
    break
  fi
  sleep 1
done

if [ -n "$CF_URL" ]; then
  echo "=========================================================="
  echo "🎉 ACTIVE WHATSAPP WEBHOOK DETAILS FOR META DASHBOARD"
  echo "=========================================================="
  echo "📍 Callback URL:  ${CF_URL}/api/whatsapp/webhook"
  echo "🔑 Verify Token:  poornasree_ai_webhook_secret_2026"
  echo "=========================================================="
else
  echo "⚠️ Cloudflare tunnel started (PID: $CF_PID). Check tunnel logs for URL."
fi

# 4. Start API Server
echo "🚀 Starting Node API Server..."
cd "$API_DIR"
npm run dev
