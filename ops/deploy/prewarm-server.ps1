# ============================================================
# prewarm-server.ps1 - One-time Docker/Ollama cache warm-up on VPS
# ============================================================
# Run after a fresh server setup to pull images, pre-build layers,
# and ensure Ollama models are cached before the first real deploy.
#
# Usage:
#   .\ops\deploy\prewarm-server.ps1  (or .\scripts\prewarm-server.ps1)
# ============================================================

param(
    [string]$Server    = "65.20.72.131",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI2"
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
Write-Host " PoornasreeAI - Server Pre-warm"           -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Server: $User@${Server}:$SshPort"
Write-Host ""

Write-Host "Syncing prewarm script to VPS..." -ForegroundColor Yellow
$prewarmSh = Join-Path $PSScriptRoot "..\server\prewarm-server.sh"
$scpArgs = (Get-SshArgs) + @(
    $prewarmSh,
    "${User}@${Server}:${RemoteDir}/ops/server/prewarm-server.sh"
)
& scp @scpArgs
if ($LASTEXITCODE -ne 0) { throw "SCP failed (exit $LASTEXITCODE)" }

Write-Host "Running pre-warm on VPS (may take several minutes)..." -ForegroundColor Yellow
Invoke-Ssh "cd '$RemoteDir' && bash ops/server/prewarm-server.sh"

Write-Host ""
Write-Host "Pre-warm complete. Future deploys should be faster." -ForegroundColor Green
Write-Host ""
