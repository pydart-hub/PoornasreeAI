# ============================================================
# deploy.ps1 — Push local code to VPS and rebuild Docker
# ============================================================
# Usage (password auth):
#   .\deploy.ps1
#
# Usage (SSH key):
#   .\deploy.ps1 -KeyFile "C:\Users\you\.ssh\id_rsa"
#   .\deploy.ps1 -User ubuntu -KeyFile "C:\path\to\key.pem"
#
# Requirements: OpenSSH must be in PATH (installed by default on Windows 10+)
# ============================================================

param(
    [string]$Server    = "187.77.188.63",
    [string]$User      = "root",
    [string]$RemoteDir = "/root/PoornasreeAI",
    [string]$KeyFile   = ""   # path to private key; leave empty for password auth
)

$ErrorActionPreference = "Stop"

function Get-SshArgs {
    $base = @("-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
    if ($KeyFile) { return @("-i", $KeyFile) + $base }
    return $base
}

function Invoke-Ssh([string]$cmd) {
    $sshArgs = (Get-SshArgs) + @("$User@$Server", $cmd)
    & ssh @sshArgs
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed: $cmd" }
}

function Copy-ToRemote([string]$local, [string]$remote) {
    $scpArgs = (Get-SshArgs) + @($local, "${User}@${Server}:${remote}")
    & scp @scpArgs
    if ($LASTEXITCODE -ne 0) { throw "scp failed for $local" }
}

# -- Banner ---------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PoornasreeAI - Deploy to VPS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Server   : $User@$Server"
Write-Host " RemoteDir: $RemoteDir"
if ($KeyFile) { Write-Host " Key file : $KeyFile" }
Write-Host ""

# -- Step 1: Copy changed source files ------------------------
Write-Host "[1/3] Syncing files to VPS..." -ForegroundColor Yellow

$filesToSync = @(
    "src/lib/env.ts",
    "src/components/providers/AuthProvider.tsx",
    "next.config.mjs",
    "docker-compose.yml",
    "Dockerfile",
    "package.json",
    "api/src/index.ts",
    "api/src/config/env.ts",
    "api/src/controllers/auth.controller.ts",
    "api/Dockerfile",
    "api/package.json"
)

foreach ($file in $filesToSync) {
    $localPath = Join-Path $PSScriptRoot ($file -replace "/", "\")
    if (-not (Test-Path $localPath)) {
        Write-Host "  skip (not found locally): $file" -ForegroundColor DarkGray
        continue
    }

    # Ensure the remote directory exists
    $remoteFileDir = "$RemoteDir/" + ($file -replace "\\", "/" -replace "/[^/]+$", "")
    Invoke-Ssh "mkdir -p '$remoteFileDir'"

    $remotePath = "$RemoteDir/" + ($file -replace "\\", "/")
    Write-Host "  -> $file" -ForegroundColor Gray
    Copy-ToRemote $localPath $remotePath
}

# -- Step 2: Rebuild Docker containers ------------------------
Write-Host ""
Write-Host "[2/3] Rebuilding Docker containers..." -ForegroundColor Yellow

Invoke-Ssh "cd '$RemoteDir' && docker compose down && docker compose up -d --build"

# -- Step 3: Verify -------------------------------------------
Write-Host ""
Write-Host "[3/3] Verifying deployment..." -ForegroundColor Yellow

Start-Sleep -Seconds 8

Invoke-Ssh "cd '$RemoteDir' && docker compose ps"
Invoke-Ssh "curl -sf http://localhost:4000/health && echo '' || echo 'API health check: still starting, check again in 30s'"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Done! Open: http://$Server" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
