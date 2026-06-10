#!/usr/bin/env bash
# Point VPS git remote at stibe-labs/PoornasreeAI (run once after GitHub migration).
set -euo pipefail
REPO_DIR="${REPO_DIR:-/root/poornasree-ai}"
NEW_URL="https://github.com/stibe-labs/PoornasreeAI.git"

cd "$REPO_DIR"
git remote set-url origin "$NEW_URL"
git fetch origin
echo "Remote: $(git remote get-url origin)"
git pull origin AIpoorna
