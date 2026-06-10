#!/bin/bash
# Ensures the PoornasreeAI Docker stack (web + api) stays up.
# Installed by scripts/server/install-hardening.sh

set -euo pipefail

COMPOSE_DIR=/root/poornasree-ai
LOG_TAG=poornasree-ai-watchdog

cd "$COMPOSE_DIR" || exit 1

web_running=$(docker inspect -f '{{.State.Running}}' poornasree-ai-web-1 2>/dev/null || echo false)
api_running=$(docker inspect -f '{{.State.Running}}' poornasree-ai-api-1 2>/dev/null || echo false)

if [ "$web_running" = "true" ] && [ "$api_running" = "true" ]; then
  exit 0
fi

logger -t "$LOG_TAG" "Unhealthy stack (web=$web_running api=$api_running); starting docker compose"

if ! /usr/bin/docker info >/dev/null 2>&1; then
  update-alternatives --set iptables /usr/sbin/iptables-nft >/dev/null 2>&1 || true
  systemctl restart containerd docker >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  sleep 3
fi

if ! /usr/bin/docker run --rm hello-world >/dev/null 2>&1; then
  logger -t "$LOG_TAG" "Docker unhealthy; clearing stale containerd runtime state"
  systemctl stop docker docker.socket containerd >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  rm -rf /run/containerd/io.containerd.runtime.v2.task/moby/* >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  systemctl start containerd docker >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  sleep 3
fi

if ! /usr/bin/docker compose up -d >>/var/log/poornasree-ai-watchdog.log 2>&1; then
  logger -t "$LOG_TAG" "compose up failed; recreating stack with clean containerd state"
  /usr/bin/docker compose down >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  systemctl stop docker docker.socket containerd >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  rm -rf /run/containerd/io.containerd.runtime.v2.task/moby/* >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  systemctl start containerd docker >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
  sleep 3
  /usr/bin/docker compose up -d >>/var/log/poornasree-ai-watchdog.log 2>&1 || true
fi
