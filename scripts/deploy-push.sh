#!/usr/bin/env bash
# Commit, push AIpoorna, wait for CI images, then fast pull deploy on VPS.
# Usage:
#   ./scripts/deploy-push.sh "feat: my change"
#   ./scripts/deploy-push.sh --skip-commit "fix: x"
#   ./scripts/deploy-push.sh --skip-push --skip-wait   # deploy only

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

MESSAGE="chore: deploy sync"
SKIP_COMMIT=0
SKIP_PUSH=0
SKIP_WAIT=0
SKIP_DEPLOY=0
SSH_HOST="${DEPLOY_SSH_HOST:-poornasree-v4}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-commit) SKIP_COMMIT=1; shift ;;
    --skip-push)   SKIP_PUSH=1; shift ;;
    --skip-wait)   SKIP_WAIT=1; shift ;;
    --skip-deploy) SKIP_DEPLOY=1; shift ;;
    *) MESSAGE="$1"; shift ;;
  esac
done

if [[ "$SKIP_COMMIT" -eq 0 ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Committing changes..."
    git add -A
    git reset HEAD .tmp-recover.sh 2>/dev/null || true
    git commit -m "$MESSAGE"
  else
    echo "Nothing to commit."
  fi
fi

if [[ "$SKIP_PUSH" -eq 0 ]]; then
  echo "Pushing AIpoorna..."
  git push origin AIpoorna
fi

if [[ "$SKIP_WAIT" -eq 0 ]]; then
  echo "Waiting for Publish Docker images workflow..."
  RUN_ID="$(gh run list --workflow "Publish Docker images" --branch AIpoorna --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  if [[ -n "$RUN_ID" && "$RUN_ID" != "null" ]]; then
    gh run watch "$RUN_ID" --exit-status || echo "WARN: CI did not succeed — deploy may build on VPS."
  fi
fi

if [[ "$SKIP_DEPLOY" -eq 0 ]]; then
  echo "Fast deploy on VPS (deploy.sh pull)..."
  ssh "$SSH_HOST" 'cd /root/poornasree-ai && bash deploy.sh pull'
fi

echo ""
echo "Done. Check https://ai.poornasreecloud.com"
