#!/bin/bash
# Ensures PM2 daemon and saved apps stay running (malware/scripts stop pm2-root).
# Installed by scripts/server/install-hardening.sh

set -euo pipefail

LOG_TAG=pm2-watchdog
PM2=/usr/lib/node_modules/pm2/bin/pm2

if ! systemctl is-active --quiet pm2-root; then
  logger -t "$LOG_TAG" "pm2-root inactive; starting service"
  systemctl start pm2-root >>/var/log/pm2-watchdog.log 2>&1 || true
  sleep 3
fi

if ! "$PM2" ping >/dev/null 2>&1; then
  logger -t "$LOG_TAG" "PM2 daemon not responding; starting pm2-root"
  systemctl start pm2-root >>/var/log/pm2-watchdog.log 2>&1 || true
  sleep 3
fi

online_count=$("$PM2" jlist 2>/dev/null | python3 -c "import sys,json; print(sum(1 for p in json.load(sys.stdin) if p.get('pm2_env',{}).get('status')=='online'))" 2>/dev/null || echo 0)

if [ "${online_count:-0}" -eq 0 ]; then
  logger -t "$LOG_TAG" "No PM2 apps online; resurrecting from dump"
  "$PM2" resurrect >>/var/log/pm2-watchdog.log 2>&1 || true
  "$PM2" restart all >>/var/log/pm2-watchdog.log 2>&1 || true
  "$PM2" save >>/var/log/pm2-watchdog.log 2>&1 || true
fi
