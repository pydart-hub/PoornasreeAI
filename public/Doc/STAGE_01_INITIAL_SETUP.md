# poornasree-AI Server — Stage 01: Initial Setup & Security Hardening

---

**Stage:** 01 of 04
**Provider:** Hostinger VPS
**Server:** `187.77.188.63`
**App:** `poornasree-AI`
**OS:** Ubuntu 24.04.4 LTS
**Status:** 🔲 IN PROGRESS
**Depends on:** —

---

## Checklist

- [ ] 0.1 — Get local SSH public key
- [ ] 0.2 — Add server to local SSH config
- [ ] 1.1 — Install SSH public key on server
- [ ] 1.2 — Test key-based login (no password)
- [ ] 1.3 — Set hostname + timezone
- [ ] 1.4 — Harden SSH (disable password auth)
- [ ] 1.5 — Fix cloud-init override
- [ ] 1.6 — Configure UFW firewall
- [ ] 1.7 — Install and configure Fail2Ban
- [ ] 1.8 — Apply kernel sysctl hardening
- [ ] 1.9 — Enable automatic security updates
- [ ] 1.10 — Final verification

---

## Step 0.1 — Get Your Local SSH Public Key

Run on your **local Windows machine**.

**PowerShell:**
```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_vutr.pub"
```

**Command Prompt (cmd.exe):**
```cmd
type %USERPROFILE%\.ssh\id_ed25519_vutr.pub
```

**Your key:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHbIFbF1QtnyMiFtV5Ba7Sj+d4ZJqLPOMf30md6FLS3Q smartuplearningventures@gmail.com
```

---

## Step 0.2 — Add Server to Local SSH Config

This allows `ssh poornasree-ai` without specifying the key every time.

Check `C:\Users\offic\.ssh\config` — it should already contain:
```
Host poornasree-ai
    HostName 187.77.188.63
    User root
    IdentityFile ~/.ssh/id_ed25519_vutr
    IdentitiesOnly yes
```

Verify (PowerShell):
```powershell
Get-Content "$env:USERPROFILE\.ssh\config"
```

If the `poornasree-ai` block is missing, add it:
```powershell
Add-Content "$env:USERPROFILE\.ssh\config" "`nHost poornasree-ai`n    HostName 187.77.188.63`n    User root`n    IdentityFile ~/.ssh/id_ed25519_vutr`n    IdentitiesOnly yes"
```

---

## Step 1.1 — Install SSH Public Key on Server

**Get your root password from Hostinger:**
1. Log in to [hPanel](https://hpanel.hostinger.com)
2. Go to **VPS** → select your server
3. Click **Overview** → copy the **Root Password**
   (or reset it under **OS & Panel** → **Reset Root Password**)

Connect with password first (one-time only):

```bash
ssh root@187.77.188.63
```

Once logged in, run:
```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHbIFbF1QtnyMiFtV5Ba7Sj+d4ZJqLPOMf30md6FLS3Q smartuplearningventures@gmail.com" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
```

Expected output:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHbIFbF1QtnyMiFtV5Ba7Sj+d4ZJqLPOMf30md6FLS3Q smartuplearningventures@gmail.com
```

---

## Step 1.2 — Test Key-Based Login

> ⚠️ Do NOT close the current session yet.

Open a **new terminal** on your local machine and run:
```
ssh poornasree-ai
```

✅ Expected: logs in with **no password prompt** 
❌ If still asks for password: check Step 0.2 SSH config and Step 1.1 key

Once confirmed working, all future connections use:
```
ssh poornasree-ai
```

---

## Step 1.3 — Set Hostname & Timezone

```bash
hostnamectl set-hostname poornasree-ai
timedatectl set-timezone Asia/Kolkata
echo "127.0.1.1   poornasree-ai" >> /etc/hosts
```

Verify:
```bash
hostname && timedatectl | grep "Time zone"
```

Expected:
```
poornasree-ai
                 Time zone: Asia/Kolkata (IST, +0530)
```

---

## Step 1.4 — Harden SSH Configuration

Create the hardening config file:

```bash
cat > /etc/ssh/sshd_config.d/hardening.conf << 'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
```

Apply and verify:
```bash
systemctl restart sshd
sshd -T | grep -E "passwordauthentication|permitrootlogin|maxauthtries"
```

Expected:
```
passwordauthentication no
permitroottlogin prohibit-password
maxauthtries 3
```

> ⚠️ **Test `ssh poornasree-ai` still works in a new terminal before logging out!**

---

## Step 1.5 — Fix Cloud-Init Override

> **Hostinger VPS note:** Hostinger uses cloud-init on all VPS instances. This step is important — without it, password auth will be re-enabled after a reboot.

Cloud-init can re-enable password auth after reboot. Fix it:

```bash
grep -n "PasswordAuthentication" /etc/ssh/sshd_config.d/50-cloud-init.conf 2>/dev/null || echo "File not found or no override"
```

If the file exists and has `PasswordAuthentication yes`, override it:

```bash
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf
systemctl restart sshd
```

Verify the full config is applied:

```bash
sshd -T | grep -E "passwordauthentication|permitrootlogin|maxauthtries"
```

Expected output:
```
passwordauthentication no
permitrootlogin prohibit-password
maxauthtries 3
```

---

## Step 1.6 — Configure UFW Firewall

```bash
apt install -y ufw

# Reset to defaults
ufw --force reset

# Default deny all incoming, allow all outgoing
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (rate-limited)
ufw limit 22/tcp comment 'SSH rate-limited'

# Allow HTTP and HTTPS
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable firewall
ufw --force enable

# Verify
ufw status verbose
```

Expected output:
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     LIMIT IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
```

---

## Step 1.7 — Install & Configure Fail2Ban

```bash
apt install -y fail2ban
```

Create the local jail configuration:

```bash
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 86400
findtime = 600
maxretry = 3
backend  = systemd

[sshd]
enabled  = true
port     = ssh
maxretry = 3
bantime  = 86400

[sshd-ddos]
enabled  = true
port     = ssh
filter   = sshd
maxretry = 10
findtime = 60
bantime  = 86400

[nginx-http-auth]
enabled  = true
port     = http,https

[nginx-botsearch]
enabled  = true
port     = http,https
maxretry = 2
EOF
```

Enable and start Fail2Ban:

```bash
systemctl enable fail2ban
systemctl restart fail2ban
```

Verify jails are active:

```bash
fail2ban-client status
```

Expected:
```
Jail list: nginx-botsearch, nginx-http-auth, sshd, sshd-ddos
```

---

## Step 1.8 — Kernel Security Hardening (sysctl)

```bash
cat > /etc/sysctl.d/99-security.conf << 'EOF'
# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP broadcast requests
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# SYN cookie protection
net.ipv4.tcp_syncookies = 1

# Log Martians (spoofed packets)
net.ipv4.conf.all.log_martians = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Increase connection queue
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
EOF
```

Apply immediately:

```bash
sysctl -p /etc/sysctl.d/99-security.conf
```

---

## Step 1.9 — Enable Automatic Security Updates

```bash
apt install -y unattended-upgrades apt-listchanges

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF
```

Enable and test:

```bash
systemctl enable unattended-upgrades
systemctl start unattended-upgrades
unattended-upgrade --dry-run --debug 2>&1 | tail -5
```

---

## Step 1.10 — Final Verification

Run all checks at once:

```bash
echo "=== Hostname ===" && hostname
echo "=== Timezone ===" && timedatectl | grep "Time zone"
echo "=== SSH Config ===" && sshd -T | grep -E "passwordauthentication|permitrootlogin|maxauthtries"
echo "=== UFW Status ===" && ufw status
echo "=== Fail2Ban Jails ===" && fail2ban-client status
echo "=== Sysctl ===" && sysctl net.ipv4.tcp_syncookies net.core.somaxconn
echo "=== Auto-Updates ===" && systemctl is-active unattended-upgrades
```

---

## Security Configuration Summary

### SSH Hardening — `/etc/ssh/sshd_config.d/hardening.conf`
- `PasswordAuthentication no`
- `PermitRootLogin prohibit-password`
- `MaxAuthTries 3`, `LoginGraceTime 20`
- Cloud-init override fixed in `50-cloud-init.conf`

### UFW Firewall
| Rule | Action |
|------|--------|
| 22/tcp | LIMIT (rate-limited) |
| 80/tcp | ALLOW |
| 443/tcp | ALLOW |
| All other | DENY |

### Fail2Ban — 4 jails active
- `sshd` — max 3 retries, 24h ban
- `sshd-ddos` — max 10/60s, 24h ban
- `nginx-http-auth` — active
- `nginx-botsearch` — max 2 retries

### Kernel Sysctl — `/etc/sysctl.d/99-security.conf`
- IP spoofing protection, SYN cookie protection
- ICMP broadcast ignore, source routing disabled
- `net.core.somaxconn = 65535`

---

## Add SSH Config Alias (Local Machine)

Add this to `C:\Users\offic\.ssh\config` on your local machine for easy access:

> **Note:** Reusing the existing `id_ed25519_vutr` key (originally created for the Vultr/smartup server). This is fine — the key works on any server, it's just a local filename.

```
Host poornasree-ai
    HostName 187.77.188.63
    User root
    IdentityFile ~/.ssh/id_ed25519_vutr
```

Then connect with:
```powershell
ssh poornasree-ai
```

---

## Next Stage

**→ [Stage 02: App Stack Installation (Node.js + MySQL + Nginx)](STAGE_02_APP_STACK.md)**
