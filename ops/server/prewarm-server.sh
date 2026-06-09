#!/bin/bash
# ============================================================
# prewarm-server.sh - One-time cache warm-up on the VPS
# Pulls base images, pre-builds api/web layers, ensures Ollama models.
# Run after a fresh server setup or when Docker cache was wiped.
#
# Usage (on VPS):
#   cd /root/poornasree-ai && bash ops/server/prewarm-server.sh
# ============================================================

set -e

REPO_DIR="/root/poornasree-ai"
cd "$REPO_DIR"

echo ""
echo "============================================"
echo " PoornasreeAI - Server Pre-warm"
echo "============================================"
echo " Time: $(date)"
echo ""

echo "[1/4] Pulling base images (ollama skipped if models already cached)..."
docker compose pull db qdrant n8n

OLLAMA_CONTAINER=$(docker compose ps -q ollama 2>/dev/null || true)
if [ -n "$OLLAMA_CONTAINER" ] && docker exec "$OLLAMA_CONTAINER" ollama list 2>/dev/null | grep -q mistral; then
    echo "  Ollama models already cached — skipping ollama image pull."
else
    echo "  Pulling ollama image (first-time setup)..."
    docker compose pull ollama
fi
echo "  Done."

echo ""
echo "[2/4] Pre-building api + web images (populates Docker layer cache)..."
docker compose build api web
echo "  Done."

echo ""
echo "[3/4] Ensuring infra containers are up..."
docker compose up -d db qdrant ollama
OLLAMA_CONTAINER=$(docker compose ps -q ollama)
echo "  Done."

echo ""
echo "[4/4] Ensuring Ollama models are present..."
for i in $(seq 1 12); do
    if docker exec "$OLLAMA_CONTAINER" ollama list > /dev/null 2>&1; then
        break
    fi
    echo "  Waiting for Ollama... ($i/12)"
    sleep 5
done

for MODEL in nomic-embed-text mistral; do
    if docker exec "$OLLAMA_CONTAINER" ollama list | grep -q "^${MODEL}"; then
        echo "  $MODEL already present."
    else
        echo "  Pulling $MODEL..."
        docker exec "$OLLAMA_CONTAINER" ollama pull "$MODEL"
    fi
done
echo "  Done."

echo ""
echo "============================================"
echo " Pre-warm complete - $(date)"
echo " Subsequent deploys will reuse cached layers."
echo "============================================"
echo ""
