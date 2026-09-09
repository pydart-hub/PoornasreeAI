# poornasree-AI Server — Stage 01: Initial Setup & Security Hardening

---

**Stage:** 01 of 04  
**Provider:** Hostinger VPS  
**Server IP:** `168.231.121.19`  
**Domain:** `poornasree.pydart.com`  
**SSH alias:** `poornasree`  
**App:** `poornasree-AI`  
**Repo on VPS:** `/root/poornasree-ai`  
**OS:** Ubuntu 24.04.4 LTS  
**Local user:** `abhis` (Windows)  
**Status:** 🔲 IN PROGRESS  
**Depends on:** —

### Quick reference

| Item | Value |
|------|--------|
| Connect | `ssh poornasree` |
| Private key | `C:\Users\abhis\.ssh\poornasreeAI` |
| Public key | `C:\Users\abhis\.ssh\poornasreeAI.pub` |
| SSH config | `C:\Users\abhis\.ssh\config` |
| Server user | `root` |
| SSH port | `22` |
| Linux hostname | `poornasree-ai` (set in Step 1.3) |

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

Run on your **local Windows machine** (`abhis`).

**Private key:** `C:\Users\abhis\.ssh\poornasreeAI`  
**Public key:** `C:\Users\abhis\.ssh\poornasreeAI.pub`

**PowerShell:**

```powershell
Get-Content "$env:USERPROFILE\.ssh\poornasreeAI.pub"
```

**Command Prompt (cmd.exe):**
```cmd
type %USERPROFILE%\.ssh\poornasreeAI.pub
```

**Your key:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMkMZJuErCY6SZdJ03W2DGrTRmIDEXTxTK8Uomo+YKAM poornasreeAI
```

---

## Step 0.2 — Add Server to Local SSH Config

This allows `ssh poornasree` without specifying the key every time.

Check `C:\Users\abhis\.ssh\config` — it should already contain:
```
Host poornasree
    HostName 168.231.121.19
    User root
    Port 22
    IdentityFile ~/.ssh/poornasreeAI
    StrictHostKeyChecking no
```

Verify (PowerShell):
```powershell
Get-Content "$env:USERPROFILE\.ssh\config"
```

If the `poornasree` block is missing, add it:
```powershell
Add-Content "$env:USERPROFILE\.ssh\config" "`nHost poornasree`n    HostName 168.231.121.19`n    User root`n    Port 22`n    IdentityFile ~/.ssh/poornasreeAI`n    StrictHostKeyChecking no"
```

---

## Step 1.1 — Install SSH Public Key on Server

**Get your root password from Hostinger (one-time, if needed):**
1. Log in to [hPanel](https://hpanel.hostinger.com)
2. Go to **VPS** → select server `168.231.121.19`
3. Click **Overview** → copy the **Root Password**
   (or reset it under **OS & Panel** → **Reset Root Password**)

**Option A — Hostinger hPanel SSH Keys (recommended):**

1. hPanel → **VPS** → your server → **Settings** → **SSH keys**
2. Click **Add SSH key**
3. Paste this public key:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMkMZJuErCY6SZdJ03W2DGrTRmIDEXTxTK8Uomo+YKAM poornasreeAI
```

4. Save and attach the key to the VPS

**Option B — Hostinger browser terminal:**

hPanel → VPS → **Terminal**, then run as `root`:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
grep -qxF 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMkMZJuErCY6SZdJ03W2DGrTRmIDEXTxTK8Uomo+YKAM poornasreeAI' ~/.ssh/authorized_keys 2>/dev/null || echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMkMZJuErCY6SZdJ03W2DGrTRmIDEXTxTK8Uomo+YKAM poornasreeAI' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
```

**Option C — SSH with root password (one-time only):**

```powershell
ssh root@168.231.121.19
```

Or after Step 0.2 is done:

```powershell
ssh poornasree
```

Then run the same commands as Option B.

Expected output:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMkMZJuErCY6SZdJ03W2DGrTRmIDEXTxTK8Uomo+YKAM poornasreeAI
```

---

## Step 1.2 — Test Key-Based Login

> ⚠️ Do NOT close the current session yet.

Open a **new PowerShell terminal** on your local machine and run:

```powershell
ssh poornasree
```

✅ Expected: logs in with **no password prompt**  
❌ If still asks for password: see [SSH troubleshooting](#ssh-troubleshooting) below

All future connections:

```powershell
ssh poornasree
```

---

## Step 1.3 — Set Hostname & Timezone

> **Note:** Linux hostname is `poornasree-ai`. SSH alias `poornasree` is only on your local machine.

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
permitrootlogin prohibit-password
maxauthtries 3```

> ⚠️ **Test `ssh poornasree` still works in a new terminal before logging out!**

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

## SSH Troubleshooting

If `ssh poornasree` still asks for a password:

**1. Verify local config (PowerShell):**
```powershell
Get-Content "$env:USERPROFILE\.ssh\config"
ssh -v poornasree
```

**2. On the server (Hostinger terminal), check permissions:**
```bash
ls -la ~/.ssh/
ls -la ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
```

Expected:
- `~/.ssh` → `drwx------` (700)
- `authorized_keys` → `-rw-------` (600)

**3. Confirm SSH allows key auth:**
```bash
grep -E '^(PubkeyAuthentication|AuthorizedKeysFile|PermitRootLogin)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
```

**4. Re-add key if missing (server terminal):**
```bash
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMkMZJuErCY6SZdJ03W2DGrTRmIDEXTxTK8Uomo+YKAM poornasreeAI' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## Local SSH Config (Summary)

See **Step 0.2** for full setup. Your `C:\Users\abhis\.ssh\config` should contain:

```
Host poornasree
    HostName 168.231.121.19
    User root
    Port 22
    IdentityFile ~/.ssh/poornasreeAI
    StrictHostKeyChecking no
```

Connect:

```powershell
ssh poornasree
```

See also: [plan.md §13 Server & SSH Access](../plan.md)

---
## Next Stage

**→ [Stage 02: App Stack Installation (Node.js + MySQL + Nginx)](STAGE_02_APP_STACK.md)**
