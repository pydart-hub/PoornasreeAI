#!/bin/bash
# Patch security-monitor.js to never kill Docker/containerd processes.
MONITOR=/var/www/psr-v4/scripts/security-monitor.js
[ -f "$MONITOR" ] || exit 0
grep -q 'DOCKER_SAFE_WHITELIST' "$MONITOR" && exit 0

cp -a "$MONITOR" "${MONITOR}.bak.$(date +%s)"

python3 <<'PY'
from pathlib import Path
path = Path("/var/www/psr-v4/scripts/security-monitor.js")
text = path.read_text()
if "DOCKER_SAFE_WHITELIST" in text:
    raise SystemExit(0)

patch = """
// DOCKER_SAFE_WHITELIST — never kill Docker/containerd (patch-security-monitor.sh)
const DOCKER_SAFE_WHITELIST = [
  'dockerd', 'docker-proxy', 'containerd', 'containerd-shim',
  'containerd-shim-runc-v2', 'runc', 'docker compose', 'poornasree-ai'
];
function isDockerSafeProcess(cmdline, exePath) {
  const hay = `${exePath || ''} ${cmdline || ''}`.toLowerCase();
  return DOCKER_SAFE_WHITELIST.some((token) => hay.includes(token));
}
"""

text = patch + "\n" + text
text = text.replace(
    "async function scanProcesses() {",
    "async function scanProcesses() {\n  const dockerSafe = isDockerSafeProcess;",
)
# Guard kill sites
for old, new in [
    ("killProcess(pid", "if (!isDockerSafeProcess(cmdline, exePath)) killProcess(pid"),
    ("process.kill(pid", "if (!isDockerSafeProcess(cmdline, exePath)) process.kill(pid"),
    ("execSync(`kill -9 ${pid}`", "if (!isDockerSafeProcess(cmdline, exePath)) execSync(`kill -9 ${pid}`"),
]:
    if old in text and new not in text:
        text = text.replace(old, new)

path.write_text(text)
print("patched")
PY

# Add rondo patterns if missing
grep -q 'rondo' "$MONITOR" 2>/dev/null || sed -i "s/const MALWARE_PATTERNS = \[/const MALWARE_PATTERNS = [\n  'rondo', 'react.x86', 'softirq', 'vjevkhfxq',/" "$MONITOR" 2>/dev/null || true
