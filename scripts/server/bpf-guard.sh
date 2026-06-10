#!/bin/bash
# Removes hid_tail_call eBPF rootkit that kills Docker shims.
# Installed by scripts/server/install-hardening.sh

set -o pipefail

LOG_TAG=bpf-guard
command -v bpftool >/dev/null 2>&1 || exit 0

changed=0

for id in $(bpftool prog list 2>/dev/null | grep -E 'hid_tail|hid_jmp' | awk -F: '{print $1}'); do
  bpftool link list 2>/dev/null | grep -q "prog $id" && bpftool link detach id 1 2>/dev/null || true
  bpftool prog unload id "$id" 2>/dev/null && logger -t "$LOG_TAG" "Unloaded bpf prog id=$id" && changed=1
done

for id in $(bpftool map list 2>/dev/null | grep hid_jmp | awk -F: '{print $1}'); do
  bpftool map delete id "$id" 2>/dev/null && logger -t "$LOG_TAG" "Deleted bpf map id=$id" && changed=1
done

if [ "$changed" -eq 1 ]; then
  systemctl restart containerd docker 2>/dev/null || true
fi
