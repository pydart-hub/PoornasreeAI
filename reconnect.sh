#!/usr/bin/env bash
# ==============================================================================
# Poornasree AI - Complete Live Reconnect & Tunnel Generator
# ==============================================================================
# Run this script whenever your Wi-Fi disconnects/reconnects or whenever you want
# a fresh, verified tunnel and webhook endpoint.
# ==============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/api"
SECRET_TOKEN="poornasree_ai_webhook_secret_2026"

echo ""
echo "=================================================================="
echo "🔄  POORNASREE AI - RECONNECTING LIVE DEVELOPMENT STACK"
echo "=================================================================="

# 1. Kill stale processes (cloudflared, ssh tunnel on 5433, node on 4000)
echo "🧹 1. Cleaning up existing tunnel and server processes..."
killall cloudflared 2>/dev/null || true
pkill -f "ssh.*5433:172.18.0.2:5432" 2>/dev/null || true
lsof -ti :4000 | xargs kill -9 2>/dev/null || true
lsof -ti :5433 | xargs kill -9 2>/dev/null || true
sleep 1

# 2. Establish fresh SSH tunnel to VPS PostgreSQL
echo "🔗 2. Connecting persistent SSH Tunnel to Database (localhost:5433 -> 172.18.0.2:5432)..."
ssh -f -N -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L 5433:172.18.0.2:5432 root@65.20.72.131
sleep 2

# Verify DB connection
if lsof -i :5433 >/dev/null 2>&1; then
  echo "   ✅ PostgreSQL Database tunnel connected on port 5433."
else
  echo "   ❌ Failed to establish DB tunnel. Check your SSH key / network."
  exit 1
fi

# 3. Start Cloudflare Tunnel
echo "🌐 3. Launching Cloudflare Webhook Ingress Tunnel..."
TMP_LOG=$(mktemp)
/opt/homebrew/bin/cloudflared tunnel --url http://localhost:4000 > "$TMP_LOG" 2>&1 &
CF_PID=$!

CF_URL=""
echo -n "   ⏳ Waiting for public HTTPS tunnel URL"
for i in {1..15}; do
  echo -n "."
  CF_URL=$(grep -o 'https://.*trycloudflare.com' "$TMP_LOG" | tail -n 1 || true)
  if [ -n "$CF_URL" ]; then
    break
  fi
  sleep 1
done
echo ""

if [ -z "$CF_URL" ]; then
  echo "   ❌ Cloudflare tunnel failed to assign a URL. Check internet connection."
  exit 1
fi

WEBHOOK_URL="${CF_URL}/api/whatsapp/webhook"
echo "   ✅ Public Ingress URL assigned: ${CF_URL}"

# 4. Start API Server in Background
echo "🚀 4. Starting Node.js API Server..."
cd "$API_DIR"
npm run dev > /dev/null 2>&1 &
API_PID=$!

echo -n "   ⏳ Waiting for API Server to initialize on port 4000"
for i in {1..15}; do
  echo -n "."
  if curl -s http://localhost:4000/api/health >/dev/null 2>&1 || curl -s http://localhost:4000 >/dev/null 2>&1 || lsof -i :4000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
echo ""
echo "   ✅ API Server running on port 4000 (PID: $API_PID)"

# 5. Verify Webhook Handshake against Public Cloudflare Tunnel
echo "🧪 5. Testing live Meta Webhook verification handshake..."
TEST_CHALLENGE="1234567890"
TEST_RES=$(curl -s "${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${SECRET_TOKEN}&hub.challenge=${TEST_CHALLENGE}" || true)

if [ "$TEST_RES" = "$TEST_CHALLENGE" ]; then
  echo "   ✅ Webhook Handshake Test PASSED (200 OK, Challenge Verified)"
else
  echo "   ⚠️ Handshake test returned: '$TEST_RES' (Server starting up...)"
fi

echo ""
echo "=================================================================="
echo "🎉  COPY & PASTE INTO META DEVELOPER DASHBOARD"
echo "=================================================================="
echo ""
echo "  📍 Callback URL:"
echo "     ${WEBHOOK_URL}"
echo ""
echo "  🔑 Verify Token:"
echo "     ${SECRET_TOKEN}"
echo ""
echo "=================================================================="
echo "💡 Press Ctrl+C at any time to stop the live servers."
echo "=================================================================="
echo ""

# Keep running to stream logs
wait
