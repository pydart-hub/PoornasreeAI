#!/bin/bash
# Install PoornasreeAI server hardening on poornasree-v4.
# Run as root on the server from the repo root:
#   bash scripts/server/install-hardening.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "==> Installing watchdog, PM2 watchdog, and persistence-guard scripts"
install -m 755 "$SCRIPT_DIR/poornasree-ai-watchdog.sh" /usr/local/bin/poornasree-ai-watchdog.sh
install -m 755 "$SCRIPT_DIR/pm2-watchdog.sh" /usr/local/bin/pm2-watchdog.sh
install -m 755 "$SCRIPT_DIR/pm2-safe-start.sh" /usr/local/bin/pm2-safe-start.sh
install -m 755 "$SCRIPT_DIR/bpf-guard.sh" /usr/local/bin/bpf-guard.sh
install -m 755 "$SCRIPT_DIR/rondo-guard.sh" /usr/local/bin/persistence-guard.sh

echo "==> Installing protected chattr bundle (malware deletes /usr/bin/chattr)"
mkdir -p /opt/chattr-bundle
if [ ! -x /opt/chattr-bundle/chattr ]; then
  if [ -x /usr/bin/chattr ]; then
    install -m 755 /usr/bin/chattr /opt/chattr-bundle/chattr
  else
    apt-get download -q e2fsprogs >/dev/null 2>&1
    dpkg-deb -x e2fsprogs*.deb /tmp/e2fsprogs-extract
    install -m 755 /tmp/e2fsprogs-extract/usr/bin/chattr /opt/chattr-bundle/chattr
  fi
fi
ln -sf /opt/chattr-bundle/chattr /usr/bin/chattr
ln -sf /opt/chattr-bundle/chattr /usr/local/sbin/chattr

echo "==> Ensuring iptables symlink for Docker"
update-alternatives --set iptables /usr/sbin/iptables-nft >/dev/null 2>&1 || true

echo "==> Installing systemd units"
cat >/etc/systemd/system/poornasree-ai.service <<'EOF'
[Unit]
Description=PoornasreeAI Docker Stack
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/poornasree-ai
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/poornasree-ai-watchdog.service <<'EOF'
[Unit]
Description=PoornasreeAI stack health watchdog
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/poornasree-ai-watchdog.sh
EOF

cat >/etc/systemd/system/poornasree-ai-watchdog.timer <<'EOF'
[Unit]
Description=Run PoornasreeAI watchdog every 2 minutes

[Timer]
OnBootSec=90s
OnUnitActiveSec=2min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/persistence-guard.service <<'EOF'
[Unit]
Description=Malware persistence guard
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/persistence-guard.sh
EOF

cat >/etc/systemd/system/persistence-guard.timer <<'EOF'
[Unit]
Description=Run persistence guard every minute

[Timer]
OnBootSec=60s
OnUnitActiveSec=1min
AccuracySec=15s

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/pm2-watchdog.service <<'EOF'
[Unit]
Description=PM2 process recovery watchdog
After=network.target pm2-root.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/pm2-watchdog.sh
EOF

cat >/etc/systemd/system/pm2-watchdog.timer <<'EOF'
[Unit]
Description=Run PM2 watchdog every 2 minutes

[Timer]
OnBootSec=120s
OnUnitActiveSec=2min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

mkdir -p /etc/systemd/system/pm2-root.service.d
cat >/etc/systemd/system/pm2-root.service.d/override.conf <<'EOF'
[Service]
# Malware stops pm2-root explicitly; watchdog restarts it, but also recover on crash
Restart=always
RestartSec=30
EOF

cat >/etc/systemd/system/bpf-guard.service <<'EOF'
[Unit]
Description=Remove hid_tail_call eBPF rootkit
DefaultDependencies=no
After=local-fs.target
Before=docker.service containerd.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/bpf-guard.sh
RemainAfterExit=yes
EOF

cat >/etc/systemd/system/bpf-guard.timer <<'EOF'
[Unit]
Description=Run bpf-guard every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=1min
AccuracySec=15s

[Install]
WantedBy=timers.target
EOF

echo 'kernel.unprivileged_bpf_disabled = 2' >/etc/sysctl.d/99-disable-bpf.conf
sysctl -p /etc/sysctl.d/99-disable-bpf.conf 2>/dev/null || true

systemctl disable --now rondo-guard.timer 2>/dev/null || true
systemctl disable --now sys-health.timer 2>/dev/null || true
rm -f /etc/systemd/system/sys-health.service /etc/systemd/system/sys-health.timer
rm -f /etc/systemd/system/rondo-guard.service /etc/systemd/system/rondo-guard.timer
systemctl daemon-reload
systemctl enable poornasree-ai.service poornasree-ai-watchdog.timer persistence-guard.timer pm2-watchdog.timer bpf-guard.service bpf-guard.timer
systemctl start poornasree-ai-watchdog.timer persistence-guard.timer pm2-watchdog.timer bpf-guard.timer
systemctl start bpf-guard.service || true

echo "==> Setting Docker services to restart always"
cd /root/poornasree-ai
sed -i 's/restart: unless-stopped/restart: always/g' docker-compose.yml 2>/dev/null || true

echo "==> Bringing stack up"
docker compose up -d

echo "==> Running initial persistence guard pass"
/usr/local/bin/persistence-guard.sh || true

echo "==> Hardening installed."
systemctl is-active poornasree-ai-watchdog.timer persistence-guard.timer pm2-watchdog.timer docker
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep poornasree || true
