#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IMPORTANT: This script NEVER touches /root/poornasree-ai/.env on the server.
# The production .env is managed manually on the VPS only.
# See docs/DEPLOY-RUNBOOK.md → "CRITICAL: Production .env Rules"
# ─────────────────────────────────────────────────────────────────────────────
# Old-server VPS build deploy (commit+push → git pull → docker compose build → restart).
# Usage:
#   ./scripts/deploy-quick.sh                 # web only (~8-15 min)
#   ./scripts/deploy-quick.sh --api           # API only (~3-6 min)
#   ./scripts/deploy-quick.sh --full          # API then web (~12-20 min)
#   ./scripts/deploy-quick.sh --background --full
#   ./scripts/deploy-quick.sh --skip-commit   # deploy without local commit/push
#   ./scripts/deploy-quick.sh --message "msg" # custom commit message

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_HOST="${DEPLOY_SSH_HOST:-poornasree-v4}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/root/poornasree-ai}"
MODE="quick"
BACKGROUND=0
SKIP_COMMIT=0
COMMIT_MESSAGE=""
FULL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api)         MODE="quick-api"; shift ;;
    --full)        FULL=1; shift ;;
    --background)  BACKGROUND=1; shift ;;
    --skip-commit) SKIP_COMMIT=1; shift ;;
    --message|-m)
      COMMIT_MESSAGE="${2:-}"
      shift 2
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Guard: detect if local .env looks like a dev file ────────────────────────
# The production server .env must NEVER be overwritten with local dev values.
# This check catches accidental dev→prod env copy by looking for localhost URLs.
check_local_env_is_not_dev_only() {
  local env_file="$REPO_ROOT/.env"
  if [[ ! -f "$env_file" ]]; then return 0; fi

  local cors_val
  cors_val=$(grep -E '^CORS_ORIGIN=' "$env_file" | cut -d= -f2- | tr -d '"')
  local jwt_val
  jwt_val=$(grep -E '^JWT_SECRET=' "$env_file" | cut -d= -f2- | tr -d '"')

  local warned=0
  if echo "$cors_val" | grep -qi 'localhost'; then
    echo ""
    echo "⚠️  WARNING: Your local .env has CORS_ORIGIN=$cors_val"
    echo "   This looks like a LOCAL DEV environment file."
    echo "   The server's production .env should have CORS_ORIGIN=https://ai.poornasreecloud.com"
    warned=1
  fi

  # Known dev JWT_SECRET (the one that ships with the local .env template)
  local dev_jwt="36bb67b0d739464ae4d982e671113d97652a896f5e58b57e99b35a170f84fdbe"
  if [[ "$jwt_val" == "$dev_jwt" ]]; then
    echo ""
    echo "⚠️  WARNING: Your local .env contains the DEVELOPMENT JWT_SECRET."
    echo "   The production server uses a different JWT_SECRET that encrypts DB secrets."
    echo "   NEVER overwrite the server .env with this file."
    warned=1
  fi

  if [[ "$warned" -eq 1 ]]; then
    echo ""
    echo "   This deploy script does NOT copy .env to the server — you are safe."
    echo "   But if you have recently run any command that synced .env to the server,"
    echo "   verify with: ssh $SSH_HOST 'grep JWT_SECRET /root/poornasree-ai/.env'"
    echo "   Expected value: RF9JUeGQjKo2EzrnDB1Ipiyh4APVWgMS"
    echo ""
  fi
}

check_local_env_is_not_dev_only

commit_and_push() {
  cd "$REPO_ROOT"
  echo ""
  echo "Git: commit + push latest before deploy"

  git add -A
  # Never stage local env secrets if present
  git reset HEAD -- .env .env.local api/.env 2>/dev/null || true

  if [[ -n "$(git status --porcelain)" ]]; then
    local msg="${COMMIT_MESSAGE:-Deploy: sync latest changes $(date '+%Y-%m-%d %H:%M')}"
    git commit -m "$msg"
    echo "Committed: $msg"
  else
    echo "Nothing new to commit."
  fi

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git push -u origin HEAD
  echo "Pushed $branch → origin"
  echo ""
}

# VPS /bin/bash is occasionally wiped (0 bytes + immutable). Restore before deploy.
repair_remote_bash_if_needed() {
  ssh "$SSH_HOST" "dash -c '
    if /bin/bash --version >/dev/null 2>&1; then
      exit 0
    fi
    echo \"⚠️  /bin/bash broken on server — restoring from apt package...\"
    cd /root
    chattr -i /bin/bash /usr/bin/bash 2>/dev/null || true
    apt-get update -qq
    apt-get download -qq bash || exit 1
    deb=\$(ls -t bash_*.deb 2>/dev/null | head -1)
    rm -rf /tmp/bash-fix
    dpkg-deb -x \"\$deb\" /tmp/bash-fix
    cp -f /tmp/bash-fix/usr/bin/bash /bin/bash
    cp -f /tmp/bash-fix/usr/bin/bash /usr/bin/bash
    chmod 755 /bin/bash /usr/bin/bash
    /bin/bash --version | head -1
  '"
}

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

if [[ "$SKIP_COMMIT" -eq 0 ]]; then
  commit_and_push
else
  echo "Skipping commit/push (--skip-commit)."
fi

echo "Old-style VPS deploy → $SSH_HOST ($MODE$([ "$FULL" -eq 1 ] && echo ' + quick'))"
repair_remote_bash_if_needed
if [[ "$FULL" -eq 1 ]]; then
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
