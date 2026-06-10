#!/bin/bash
# Blocks the rondo malware persistence chain and restores critical system tools.
# Installed by scripts/server/install-hardening.sh

set -euo pipefail

LOG_TAG=persistence-guard
CHATTR=/opt/chattr-bundle/chattr
[ -x "$CHATTR" ] || CHATTR=/usr/local/sbin/chattr
[ -x "$CHATTR" ] || CHATTR=/usr/bin/chattr

changed=0
MY_PID=$$

kill_rondo_processes() {
  for d in /proc/[0-9]*; do
    [ -r "$d/cmdline" ] || continue
    pid=${d##*/}
    [ "$pid" = "$MY_PID" ] && continue
    exe=$(readlink "$d/exe" 2>/dev/null || true)
    cmd=$(tr '\0' ' ' <"$d/cmdline" 2>/dev/null || true)
    case "$exe $cmd" in
      */etc/rondo/rondo*|*react.x86*|*/bin/softirq*|*vjevkhfxq*|*/tmp/udhcpc*|*/tmp/watchdog*|*45.125.66.100*|*45.94.31.89*)
        kill -9 "$pid" 2>/dev/null || true
        logger -t "$LOG_TAG" "Killed malware process pid=$pid"
        changed=1
        ;;
    esac
  done
}

strip_immutable() {
  local target=$1
  [ -e "$target" ] || return 0
  if [ -x "$CHATTR" ]; then
    "$CHATTR" -ia "$target" 2>/dev/null || true
  fi
}

remove_rondo_artifacts() {
  local paths=(
    /etc/rondo/rondo
    /etc/cron.d/rondo
    /etc/init.d/rondo
    /bin/softirq
    /usr/lib/systemd/vjevkhfxq
    /tmp/udhcpc
    /tmp/watchdog
  )

  for path in "${paths[@]}"; do
    if [ -e "$path" ]; then
      strip_immutable "$path"
      rm -rf "$path" 2>/dev/null || true
      logger -t "$LOG_TAG" "Removed $path"
      changed=1
    fi
  done

  for link in /etc/rc*.d/*rondo*; do
    [ -e "$link" ] || continue
    strip_immutable "$link"
    rm -f "$link" 2>/dev/null || true
    logger -t "$LOG_TAG" "Removed $link"
    changed=1
  done

  if [ -d /etc/rondo ]; then
    strip_immutable /etc/rondo
    rm -rf /etc/rondo 2>/dev/null || true
    logger -t "$LOG_TAG" "Removed /etc/rondo directory"
    changed=1
  fi

  for file in /etc/crontab /etc/rc.local; do
    [ -f "$file" ] || continue
    if grep -qE 'rondo|react\.x86|softirq|vjevkhfxq' "$file" 2>/dev/null; then
      strip_immutable "$file"
      sed -i -E '/rondo|react\.x86|softirq|vjevkhfxq/d' "$file"
      logger -t "$LOG_TAG" "Cleaned malware entry from $file"
      changed=1
    fi
  done

  for file in /var/spool/cron/crontabs/root /var/spool/cron/root; do
    [ -f "$file" ] || continue
    if grep -qE 'rondo|react\.x86|softirq|vjevkhfxq' "$file" 2>/dev/null; then
      strip_immutable "$file"
      sed -i -E '/rondo|react\.x86|softirq|vjevkhfxq/d' "$file"
      logger -t "$LOG_TAG" "Cleaned malware entry from $file"
      changed=1
    fi
  done
}

restore_system_tools() {
  if [ ! -x /usr/bin/chattr ] && [ -x /usr/local/sbin/chattr ]; then
    ln -sf /usr/local/sbin/chattr /usr/bin/chattr
    logger -t "$LOG_TAG" "Restored /usr/bin/chattr symlink"
    changed=1
  fi

  if [ ! -e /usr/sbin/iptables ]; then
    update-alternatives --set iptables /usr/sbin/iptables-nft >/dev/null 2>&1 || true
    logger -t "$LOG_TAG" "Restored iptables symlink"
    changed=1
  fi
}

block_rondo_path() {
  if [ ! -e /etc/rondo ]; then
    touch /etc/rondo
    if [ -x "$CHATTR" ]; then
      "$CHATTR" +i /etc/rondo 2>/dev/null || true
    fi
    logger -t "$LOG_TAG" "Blocked /etc/rondo path with immutable file"
    changed=1
  elif [ -d /etc/rondo ]; then
    strip_immutable /etc/rondo
    rm -rf /etc/rondo
    touch /etc/rondo
    if [ -x "$CHATTR" ]; then
      "$CHATTR" +i /etc/rondo 2>/dev/null || true
    fi
    logger -t "$LOG_TAG" "Replaced /etc/rondo directory with immutable blocker file"
    changed=1
  fi

  for blocker in /tmp/udhcpc /tmp/watchdog; do
    if [ -e "$blocker" ] && [ ! -f "$blocker" ] || [ -f "$blocker" ] && [ -s "$blocker" ]; then
      strip_immutable "$blocker"
      rm -f "$blocker" 2>/dev/null || true
    fi
    if [ ! -e "$blocker" ]; then
      touch "$blocker"
      if [ -x "$CHATTR" ]; then
        "$CHATTR" +i "$blocker" 2>/dev/null || true
      fi
      logger -t "$LOG_TAG" "Blocked $blocker with immutable file"
      changed=1
    fi
  done
}

ensure_docker_running() {
  if ! systemctl is-active --quiet docker; then
    update-alternatives --set iptables /usr/sbin/iptables-nft >/dev/null 2>&1 || true
    systemctl reset-failed docker 2>/dev/null || true
    systemctl start docker 2>/dev/null || true
    logger -t "$LOG_TAG" "Restarted docker.service"
    changed=1
  fi
}

remove_legacy_malware_units() {
  for unit in sys-health.timer sys-health.service; do
    if systemctl is-enabled --quiet "$unit" 2>/dev/null; then
      systemctl disable --now "$unit" >>/var/log/persistence-guard.log 2>&1 || true
      logger -t "$LOG_TAG" "Disabled legacy malware unit $unit"
      changed=1
    fi
  done
  for path in /etc/systemd/system/sys-health.service /etc/systemd/system/sys-health.timer; do
    if [ -f "$path" ]; then
      rm -f "$path"
      logger -t "$LOG_TAG" "Removed $path"
      changed=1
    fi
  done
  if [ "$changed" -eq 1 ]; then
    systemctl daemon-reload 2>/dev/null || true
  fi
}

kill_rondo_processes
remove_rondo_artifacts
remove_legacy_malware_units
restore_system_tools
block_rondo_path

if [ "$changed" -eq 1 ]; then
  ensure_docker_running
fi
