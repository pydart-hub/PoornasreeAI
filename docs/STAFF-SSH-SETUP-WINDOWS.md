# Poornasree Server — SSH Key Setup (Windows)

Follow these steps on **your Windows PC** to get SSH access to the Poornasree server.

**Important:** You will create two files. Only send the **`.pub`** file to your admin. **Never share the file without `.pub` in the name** — that is your private key.

---

## Step 1 — Open PowerShell

1. Press `Win + X`
2. Click **Terminal** or **Windows PowerShell**

---

## Step 2 — Check SSH is installed

```powershell
ssh -V
```

If you see a version number (e.g. `OpenSSH_for_Windows_...`), continue to Step 3.

If you get an error, install OpenSSH:

1. Open **Settings** → **Apps** → **Optional features**
2. Click **Add a feature**
3. Search for **OpenSSH Client**
4. Click **Install**
5. Close PowerShell and open it again
6. Run `ssh -V` again to confirm

---

## Step 3 — Generate your SSH key

Replace `YOUR-NAME` with your actual name (e.g. `abhishek`):

```powershell
ssh-keygen -t ed25519 -C "YOUR-NAME-poornasree-2026" -f $env:USERPROFILE\.ssh\poornasree-staff
```

When prompted:

- **Enter passphrase** — choose a password for your key (recommended). Remember it.
- **Enter same passphrase again** — confirm it.

This creates:

| File | Safe to share? |
|------|----------------|
| `C:\Users\<You>\.ssh\poornasree-staff` | **NO — private key, keep secret** |
| `C:\Users\<You>\.ssh\poornasree-staff.pub` | **YES — send this to admin** |

---

## Step 4 — Copy your public key

```powershell
Get-Content $env:USERPROFILE\.ssh\poornasree-staff.pub
```

You will see **one line** like:

```
ssh-ed25519 AAAA...YOUR-NAME-poornasree-2026
```

**Send this entire line** (or the `poornasree-staff.pub` file) to your admin on WhatsApp, Slack, or email.

Do **not** send the file named `poornasree-staff` (without `.pub`).

---

## Step 5 — Wait for admin confirmation

Your admin will add your key to the server and tell you when you can connect.

---

## Step 6 — Test SSH connection

After admin confirms, run:

```powershell
ssh -i $env:USERPROFILE\.ssh\poornasree-staff root@65.20.72.131
```

- Enter your **key passphrase** if you set one (not a server password)
- Type `yes` if asked to trust the host fingerprint

If successful, you will see a prompt like:

```
root@poornasree-v4:~#
```

Run these to confirm:

```powershell
hostname
whoami
```

Type `exit` to disconnect.

---

## Step 7 — Easy login (optional)

Create an SSH config so you can type `ssh poornasree-v4` instead of the long command.

```powershell
if (-not (Test-Path $env:USERPROFILE\.ssh)) { New-Item -ItemType Directory -Path $env:USERPROFILE\.ssh }
notepad $env:USERPROFILE\.ssh\config
```

Paste this into the file (create the file if it does not exist):

```
Host poornasree-v4
    HostName 65.20.72.131
    User root
    IdentityFile ~/.ssh/poornasree-staff
    IdentitiesOnly yes
```

Save and close Notepad.

Now connect with:

```powershell
ssh poornasree-v4
```

---

## Step 8 — Remember passphrase (optional)

So you do not type your key passphrase every time:

```powershell
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\poornasree-staff
```

Enter your passphrase once. It will be remembered until you restart Windows.

---

## Troubleshooting

### "Permission denied (publickey)"

- Confirm admin added your `.pub` key to the server
- Use the exact command with `-i $env:USERPROFILE\.ssh\poornasree-staff`
- Make sure you are using the key file, not the `.pub` file, with `-i`

### "ssh is not recognized"

- Install OpenSSH Client (see Step 2)

### Connection times out

- Check your internet connection
- Tell admin your public IP from https://ifconfig.me — they may need to allow it in the firewall

---

## Security rules

- **Never** share your private key (`poornasree-staff` without `.pub`)
- **Never** put your private key in email, chat, or GitHub
- **One key per person** — do not copy your key to another colleague's PC
- If your PC is lost or compromised, tell admin immediately so they can remove your key

---

## Quick copy — all commands in order

```powershell
# 1. Check SSH
ssh -V

# 2. Generate key (replace YOUR-NAME)
ssh-keygen -t ed25519 -C "YOUR-NAME-poornasree-2026" -f $env:USERPROFILE\.ssh\poornasree-staff

# 3. Show public key — send this line to admin
Get-Content $env:USERPROFILE\.ssh\poornasree-staff.pub

# 4. After admin confirms — test connection
ssh -i $env:USERPROFILE\.ssh\poornasree-staff root@65.20.72.131

# 5. Optional — easy login alias
notepad $env:USERPROFILE\.ssh\config
# (paste the Host poornasree-v4 block from Step 7, save, then:)
ssh poornasree-v4
```
