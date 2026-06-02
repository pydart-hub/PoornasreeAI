# ============================================================
# deploy.ps1 - Trigger GitHub pull deployment on VPS
# ============================================================
# Workflow:
#   1. git add . && git commit -m "..." && git push   (on your machine)
#   2. .\deploy.ps1                                   (triggers VPS to pull & rebuild)
#
# Usage:
#   .\deploy.ps1                    # rebuild api + web (infra stays up)
#   .\deploy.ps1 -ApiOnly           # API-only deploy (fastest for backend changes)
#   .\deploy.ps1 -SshPort 22
#   .\deploy.ps1 -KeyFile "C:\Users\you\.ssh\id_rsa"
# ============================================================

param(
    [switch]$ApiOnly,
    [switch]$WebOnly,
    [string]$Server    = "168.231.121.19",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI"
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

$mode = if ($ApiOnly) { "api" } elseif ($WebOnly) { "web" } else { "full" }
$modeLabel = switch ($mode) { "api" { "API only (~3-5 min)" } "web" { "Web only (~8-10 min)" } default { "api + web (~12-15 min)" } }

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PoornasreeAI - GitHub Pull Deployment"     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Server   : $User@${Server}:$SshPort"
Write-Host " RemoteDir: $RemoteDir"
Write-Host " Mode     : $modeLabel"
if ($KeyFile) { Write-Host " Key file : $KeyFile" }
Write-Host ""

Write-Host "[1/2] Triggering deployment on VPS..." -ForegroundColor Yellow
Write-Host "       (git pull -> rebuild $modeLabel -> wait for API -> prisma -> nginx)" -ForegroundColor DarkGray
Write-Host ""

Invoke-Ssh "cd '$RemoteDir' && bash deploy.sh $mode"

Write-Host ""
Write-Host "[2/2] Verifying containers..." -ForegroundColor Yellow

Invoke-Ssh "cd '$RemoteDir' && docker compose ps"
Invoke-Ssh "curl -sf http://localhost:4000/health && echo ' API healthy' || echo ' API not responding — check /tmp/compose-build.log on VPS'"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Deployment complete!" -ForegroundColor Green
Write-Host " App: https://poornasree.pydart.com" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
