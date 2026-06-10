#!/bin/bash
# Safely start all PM2 services without breaking Docker.
# Run as root on poornasree-v4:
#   bash /root/poornasree-ai/scripts/server/pm2-safe-start.sh

set -euo pipefail

PSR_ROOT=/var/www/psr-v4
MONITOR_JS="$PSR_ROOT/scripts/security-monitor.js"
PM2=/usr/lib/node_modules/pm2/bin/pm2
LOG=/var/log/pm2-safe-start.log

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

docker_ok() {
  docker run --rm hello-world >/dev/null 2>&1
}

patch_security_monitor() {
  [ -f "$MONITOR_JS" ] || { log "WARN: $MONITOR_JS missing"; return 0; }

  if grep -q 'DOCKER_SAFE_WHITELIST' "$MONITOR_JS"; then
    log "security-monitor already patched"
    return 0
  fi

  cp -a "$MONITOR_JS" "${MONITOR_JS}.bak.$(date +%s)"

  python3 <<'PY'
from pathlib import Path
path = Path("/var/www/psr-v4/scripts/security-monitor.js")
text = path.read_text()
marker = "DOCKER_SAFE_WHITELIST"
if marker in text:
    raise SystemExit(0)

patch = """
// DOCKER_SAFE_WHITELIST — never kill Docker/containerd (added by pm2-safe-start.sh)
const DOCKER_SAFE_WHITELIST = [
  'dockerd', 'docker-proxy', 'containerd', 'containerd-shim',
  'containerd-shim-runc-v2', 'runc', 'docker compose', 'docker-compose',
  'poornasree-ai', 'hello-world'
];
function isDockerSafeProcess(cmdline, exePath) {
  const hay = `${exePath || ''} ${cmdline || ''}`.toLowerCase();
  return DOCKER_SAFE_WHITELIST.some((token) => hay.includes(token));
}
"""

insert_at = text.find("const MALWARE_PATTERNS")
if insert_at == -1:
    insert_at = text.find("MALWARE_PATTERNS")
if insert_at == -1:
    text = patch + "\n" + text
else:
    text = text[:insert_at] + patch + "\n" + text[:insert_at]

# Guard common kill sites
for needle, repl in [
    (
        "function shouldKill(",
        "function shouldKill(cmdline, exePath) {\n  if (isDockerSafeProcess(cmdline, exePath)) return false;\n",
    ),
    (
        "async function scanProcesses(",
        "async function scanProcesses() {\n  // docker-safe guard injected below\n",
    ),
]:
    if needle in text and "isDockerSafeProcess" not in text.split(needle, 1)[1][:400]:
        pass

# Inject before any killProcess / process.kill usage in scan loop
if "isDockerSafeProcess(cmdline, exePath)" not in text:
    text = text.replace(
        "killProcess(pid",
        "if (!isDockerSafeProcess(cmdline, exePath)) killProcess(pid",
    )
    text = text.replace(
        "process.kill(pid",
        "if (!isDockerSafeProcess(cmdline, exePath)) process.kill(pid",
    )

path.write_text(text)
print("patched")
PY

  log "Patched security-monitor.js with Docker whitelist"
}

fix_ssh_if_needed() {
  if ! ss -tln | grep -q ':22 '; then
    log "SSH not listening; starting ssh"
    systemctl start ssh 2>/dev/null || systemctl start sshd 2>/dev/null || true
    DEBIAN_FRONTEND=noninteractive apt-get install --reinstall -y openssh-server 2>/dev/null || true
    systemctl enable --now ssh 2>/dev/null || systemctl enable --now sshd 2>/dev/null || true
  fi
}

start_pm2_stack() {
  systemctl start pm2-root 2>/dev/null || true
  sleep 2
  "$PM2" ping >/dev/null 2>&1 || systemctl restart pm2-root

  cd "$PSR_ROOT"
  if [ -f ecosystem.config.js ]; then
    log "Starting from ecosystem.config.js"
    "$PM2" start ecosystem.config.js --update-env 2>>"$LOG" || true
  else
    log "Resurrecting from dump.pm2"
    "$PM2" resurrect 2>>"$LOG" || true
  fi

  # Core apps first
  for app in psr-v4 pulse-scheduler machine-detector; do
    "$PM2" restart "$app" 2>>"$LOG" || "$PM2" start "$app" 2>>"$LOG" || log "WARN: could not start $app"
    sleep 2
    if ! docker_ok; then
      log "ERROR: Docker broken after starting $app — stopping PM2 apps"
      "$PM2" stop all
      exit 1
    fi
  done

  # security-monitor last (after docker whitelist patch)
  "$PM2" restart security-monitor 2>>"$LOG" || "$PM2" start security-monitor 2>>"$LOG" || true
  sleep 5
  if ! docker_ok; then
    log "ERROR: security-monitor broke Docker — stopping it"
    "$PM2" stop security-monitor
    exit 1
  fi

  # sftp-watcher often crash-loops; start only if error log is quiet
  restarts=$("$PM2" jlist 2>/dev/null | python3 -c "
import json,sys
apps=json.load(sys.stdin)
for a in apps:
    if a.get('name')=='sftp-watcher':
        print(a.get('pm2_env',{}).get('restart_time',0))
        break
" 2>/dev/null || echo 99999)

  if [ "${restarts:-0}" -lt 50 ]; then
    "$PM2" restart sftp-watcher 2>>"$LOG" || true
  else
    log "sftp-watcher has $restarts restarts — leaving stopped (fix config first)"
    "$PM2" stop sftp-watcher 2>>"$LOG" || true
    "$PM2" delete sftp-watcher 2>>"$LOG" || true
  fi

  "$PM2" save
}

log "=== pm2-safe-start ==="
fix_ssh_if_needed
/usr/local/bin/persistence-guard.sh 2>/dev/null || true

if ! docker_ok; then
  log "Docker unhealthy before PM2 — recovering"
  systemctl restart containerd docker
  sleep 4
  docker_ok || { log "FATAL: Docker still broken"; exit 1; }
fi

patch_security_monitor
start_pm2_stack

log "=== PM2 status ==="
"$PM2" list | tee -a "$LOG"

log "=== Docker test ==="
docker_ok && log "Docker OK" || log "Docker FAILED"

log "=== PoornasreeAI stack ==="
cd /root/poornasree-ai
docker compose up -d 2>>"$LOG" || true
curl -s -o /dev/null -w "api:%{http_code} web:%{http_code}\n" http://127.0.0.1:4002/health http://127.0.0.1:3002/ | tee -a "$LOG"

log "Done."
