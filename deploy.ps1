# ============================================================
# deploy.ps1 - Trigger GitHub pull deployment on VPS
# ============================================================
# Workflow (fast — recommended):
#   1. git push origin AIpoorna  →  CI builds images  →  auto deploy-production (pull on VPS)
#   2. Or manually: .\scripts\deploy-pull.ps1  (~1-3 min on VPS)
#
# Usage:
#   git push only                 # DEFAULT — GitHub Actions build + pull deploy
#   .\scripts\deploy-pull.ps1     # manual pull deploy (same as CI deploy step)
#   .\scripts\deploy-quick.ps1    # legacy VPS build web (~8-15 min)
#   .\deploy.ps1                  # legacy full VPS build (~15-26 min)
#   .\deploy.ps1 -Quick             # same as deploy-quick.ps1 (UI)
#   .\deploy.ps1 -Quick -QuickApi   # old-style API quick (~3-6 min)
#   .\deploy.ps1 -ApiOnly           # API + extra checks (~3-8 min)
#   .\deploy.ps1 -WebOnly           # web + extra checks (~8-15 min)
#   .\deploy.ps1 -Background        # run on VPS in background (SSH won't drop build)
#   .\deploy.ps1 -Seed              # also run prisma db seed (off by default)
#   .\deploy.ps1 -PullOnly          # pull GHCR images (~1-3 min; needs CI workflow)
#   .\scripts\deploy-pull.ps1       # same as -PullOnly
# ============================================================

param(
    [switch]$Quick,
    [switch]$QuickApi,
    [switch]$ApiOnly,
    [switch]$WebOnly,
    [switch]$PullOnly,
    [switch]$Background,
    [switch]$Seed,
    [string]$ImageTag = "AIpoorna",
    [string]$Server    = "168.231.121.19",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI"
)

$ErrorActionPreference = "Stop"

function Get-SshArgs {
    $base = @(
        "-p", "$SshPort",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=30",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=120"
    )
    if ($KeyFile) { return @("-i", $KeyFile) + $base }
    return $base
}

function Invoke-Ssh([string]$cmd) {
    $sshArgs = (Get-SshArgs) + @("${User}@${Server}", $cmd)
    & ssh @sshArgs
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed (exit $LASTEXITCODE)" }
}

function Invoke-SshCapture([string]$cmd) {
    $sshArgs = (Get-SshArgs) + @("${User}@${Server}", $cmd)
    $out = & ssh @sshArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed (exit $LASTEXITCODE): $out" }
    return ($out | Out-String).Trim()
}

$flags = @($PullOnly, $Quick, $QuickApi, $ApiOnly, $WebOnly) | Where-Object { $_.IsPresent }
if ($flags.Count -gt 1) {
    throw "Use only one deploy mode: -Quick, -QuickApi, -ApiOnly, -WebOnly, or -PullOnly"
}

$mode = if ($PullOnly) {
    "pull"
} elseif ($QuickApi) {
    "quick-api"
} elseif ($Quick -or $WebOnly) {
    "quick"
} elseif ($ApiOnly) {
    "api"
} else {
    "full"
}
$modeLabel = switch ($mode) {
    "pull"      { "Pull GHCR images (~1-3 min)" }
    "quick"     { "Quick UI — old server style (~8-15 min)" }
    "quick-api" { "Quick API — old server style (~3-6 min)" }
    "api"       { "API only + checks (~3-8 min)" }
    "web"       { "Web only + checks (~8-15 min)" }
    default     { "Full api + web (~15-26 min)" }
}

$useSeed = $Seed.IsPresent

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PoornasreeAI - GitHub Pull Deployment"     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Server   : ${User}@${Server}:$SshPort"
Write-Host " RemoteDir: $RemoteDir"
Write-Host " Mode     : $modeLabel"
if ($Background) { Write-Host " Run      : background (log: /tmp/deploy.log on VPS)" }
if ($Seed) { Write-Host " Seed     : enabled" } else { Write-Host " Seed     : skipped (use -Seed if needed)" }
if ($KeyFile) { Write-Host " Key file : $KeyFile" }
Write-Host ""

if ($Background) {
    Write-Host "[1/2] Starting deployment on VPS (background)..." -ForegroundColor Yellow
    $envPrefix = "IMAGE_TAG=$ImageTag"
    if ($useSeed) { $envPrefix += " SEED_ON_DEPLOY=1" }
    $nohupLine = "nohup env $envPrefix bash deploy.sh $mode >> /tmp/deploy.log 2>&1 &"
    $startCmd = "cd '$RemoteDir' && : > /tmp/deploy.log && $nohupLine echo `$! > /tmp/deploy.pid && echo started"
    Invoke-Ssh $startCmd | Out-Null

    $pollSec = 20
    $maxMin = switch ($mode) {
        "pull"      { 10 }
        "quick-api" { 20 }
        "quick"     { 30 }
        "api"       { 25 }
        "web"       { 35 }
        default     { 45 }
    }
    $deadline = (Get-Date).AddMinutes($maxMin)
    Write-Host "       Polling every ${pollSec}s (max ~${maxMin} min). Log: ssh ... 'tail -f /tmp/deploy.log'" -ForegroundColor DarkGray

    $pollCmd = 'grep -q "Deployment complete" /tmp/deploy.log 2>/dev/null && echo done || (test -f /tmp/deploy.pid && kill -0 $(cat /tmp/deploy.pid) 2>/dev/null && echo running || echo stopped)'

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $pollSec
        $state = Invoke-SshCapture $pollCmd
        if ($state -eq "done") {
            Write-Host ""
            Invoke-Ssh "tail -30 /tmp/deploy.log"
            break
        }
        if ($state -eq "stopped") {
            Write-Host ""
            Invoke-Ssh "tail -40 /tmp/deploy.log"
            throw "Deploy process exited before completion — check /tmp/deploy.log on VPS"
        }
        $snippet = Invoke-SshCapture "tail -3 /tmp/deploy.log 2>/dev/null | tr '\n' ' '"
        Write-Host "  ... still building: $snippet" -ForegroundColor DarkGray
    }

    if ((Get-Date) -ge $deadline) {
        Write-Host "Timed out waiting for deploy. Check: ssh ... 'tail -f /tmp/deploy.log'" -ForegroundColor Red
        throw "Deploy poll timed out"
    }
} else {
    Write-Host "[1/2] Triggering deployment on VPS..." -ForegroundColor Yellow
    Write-Host "       (git pull -> rebuild $modeLabel -> prisma -> nginx)" -ForegroundColor DarkGray
    Write-Host ""
    $envParts = @("IMAGE_TAG=$ImageTag")
    if ($useSeed) { $envParts += "SEED_ON_DEPLOY=1" }
    $envStr = $envParts -join " "
    $deployCmd = "cd '$RemoteDir' && env $envStr bash deploy.sh $mode"
    Invoke-Ssh $deployCmd
}

Write-Host ""
Write-Host "[2/2] Verifying containers..." -ForegroundColor Yellow

Invoke-Ssh "cd '$RemoteDir' && docker compose ps"
Invoke-Ssh "curl -sf http://localhost:4000/health && echo ' API healthy' || echo ' API not responding — check /tmp/deploy.log on VPS'"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Deployment complete!" -ForegroundColor Green
Write-Host " App: https://poornasree.pydart.com" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
