#!/bin/bash
set -e
/usr/local/bin/persistence-guard.sh 2>&1 | tail -3 || true
pkill -9 -f softirq 2>/dev/null || true
pkill -9 -f vjevkhfxq 2>/dev/null || true
update-alternatives --set iptables /usr/sbin/iptables-nft 2>/dev/null || true
cd /root/poornasree-ai
docker compose down 2>/dev/null || true
systemctl stop docker docker.socket containerd 2>/dev/null || true
rm -rf /run/containerd/io.containerd.runtime.v2.task/moby/*
systemctl start containerd
sleep 2
systemctl start docker
sleep 4
docker compose up -d
sleep 12
echo "=== CONTAINERS ==="
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep poornasree || true
echo "=== WEB ==="
curl -sI http://127.0.0.1:3002/ | head -3 || true
echo "=== API ==="
curl -s http://127.0.0.1:4002/health || echo FAIL
