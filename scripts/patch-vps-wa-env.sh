#!/bin/bash
# Append engineer WhatsApp template env vars on VPS (idempotent).
set -e
REPO_DIR="${1:-/root/poornasree-ai}"
BLOCK='
# Engineer WhatsApp templates (Poornasree)
WA_ENGINEER_SETUP_TEMPLATE=engineer_account_setup
WA_ENGINEER_SETUP_TEMPLATE_LANG=en
WA_ENGINEER_TICKET_TEMPLATE=engineer_ticket_assigned
WA_ENGINEER_TICKET_TEMPLATE_LANG=en
'

patch_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  if grep -q 'WA_ENGINEER_TICKET_TEMPLATE=' "$f" 2>/dev/null; then
    echo "  OK (already set): $f"
    return 0
  fi
  echo "$BLOCK" >> "$f"
  echo "  Patched: $f"
}

cd "$REPO_DIR"
echo "Patching env files in $REPO_DIR ..."
patch_file ".env"
patch_file "api/.env"
echo "Done."
