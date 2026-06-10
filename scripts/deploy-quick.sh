#!/usr/bin/env bash
# Old-server VPS build deploy (git pull → docker compose build → restart).
# Usage:
#   ./scripts/deploy-quick.sh           # web only (~8-15 min)
#   ./scripts/deploy-quick.sh --api     # API only (~3-6 min)
#   ./scripts/deploy-quick.sh --full    # API then web (~12-20 min)
#   ./scripts/deploy-quick.sh --background --full

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_HOST="${DEPLOY_SSH_HOST:-poornasree-v4}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/root/poornasree-ai}"
MODE="quick"
BACKGROUND=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api)        MODE="quick-api"; shift ;;
    --full)       FULL=1; shift ;;
    --background) BACKGROUND=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

run_deploy() {
  local m="$1"
  local cmd="cd '$REMOTE_DIR' && git remote set-url origin https://github.com/pydart-hub/PoornasreeAI.git && env SKIP_OLLAMA=1 bash deploy.sh $m"
  if [[ "$BACKGROUND" -eq 1 ]]; then
    ssh "$SSH_HOST" "cd '$REMOTE_DIR' && : > /tmp/deploy.log && nohup bash -c \"$cmd\" >> /tmp/deploy.log 2>&1 & echo started; sleep 2; tail -5 /tmp/deploy.log"
    echo "Background deploy ($m). Watch: ssh $SSH_HOST 'tail -f /tmp/deploy.log'"
  else
    ssh "$SSH_HOST" "$cmd"
  fi
}

echo "Old-style VPS deploy → $SSH_HOST ($MODE${FULL:+ + quick})"
if [[ "${FULL:-0}" -eq 1 ]]; then
  run_deploy quick-api
  run_deploy quick
else
  run_deploy "$MODE"
fi

if [[ "$BACKGROUND" -eq 0 ]]; then
  ssh "$SSH_HOST" "curl -sf http://127.0.0.1:4002/health && echo ' API OK' || echo ' API check failed'"
  ssh "$SSH_HOST" "curl -sf -o /dev/null -w 'web:%{http_code}\n' http://127.0.0.1:3002/"
fi

echo "Done — https://ai.poornasreecloud.com"
