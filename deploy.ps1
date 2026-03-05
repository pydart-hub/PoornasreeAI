# ============================================================
# deploy.ps1 - Trigger GitHub pull deployment on VPS
# ============================================================
# Workflow:
#   1. git add . && git commit -m "..." && git push   (on your machine)
#   2. .\deploy.ps1                                   (triggers VPS to pull & rebuild)
#
# Usage:
#   .\deploy.ps1
#   .\deploy.ps1 -SshPort 22            # if SSH was moved to port 22
#   .\deploy.ps1 -KeyFile "C:\Users\you\.ssh\id_rsa"
# ============================================================

param(
    [string]$Server    = "187.77.188.63",
    [string]$User      = "deploy",
    [int]   $SshPort   = 2222,
    [string]$RemoteDir = "/home/deploy/poornasree-ai",
    [string]$KeyFile   = ""
)

$ErrorActionPreference = "Stop"

function Get-SshArgs {
    $base = @("-p", "$SshPort", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30")
    if ($KeyFile) { return @("-i", $KeyFile) + $base }
    return $base
}

function Invoke-Ssh([string]$cmd) {
    $sshArgs = (Get-SshArgs) + @("$User@$Server", $cmd)
    & ssh @sshArgs
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed (exit $LASTEXITCODE)" }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PoornasreeAI - GitHub Pull Deployment"     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Server   : $User@${Server}:$SshPort"
Write-Host " RemoteDir: $RemoteDir"
if ($KeyFile) { Write-Host " Key file : $KeyFile" }
Write-Host ""

Write-Host "[1/2] Triggering deployment on VPS..." -ForegroundColor Yellow
Write-Host "       (VPS will: git pull -> docker compose down -> up --build)" -ForegroundColor DarkGray
Write-Host ""

Invoke-Ssh "cd '$RemoteDir' && bash deploy.sh"

Write-Host ""
Write-Host "[2/2] Verifying containers..." -ForegroundColor Yellow

Start-Sleep -Seconds 5
Invoke-Ssh "cd '$RemoteDir' && docker compose ps"
Invoke-Ssh "curl -sf http://localhost:4000/health && echo ' API healthy' || echo ' API still starting - check again in ~30s'"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Deployment complete!" -ForegroundColor Green
Write-Host " App: http://$Server" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
