# ============================================================
# deploy.ps1 - Trigger GitHub pull deployment on VPS
# ============================================================
# Workflow:
#   1. git add . && git commit -m "..." && git push   (on your machine)
#   2. .\deploy.ps1                                   (triggers VPS to pull & rebuild)
#
# Usage:
#   .\deploy.ps1                    # rebuild api + web (~12-15 min)
#   .\deploy.ps1 -ApiOnly           # API only (~3-5 min) — best for backend changes
#   .\deploy.ps1 -WebOnly           # Next.js only (~8-10 min)
#   .\deploy.ps1 -Background        # run on VPS in background (SSH won't drop build)
#   .\deploy.ps1 -Seed              # also run prisma db seed (off by default)
# ============================================================

param(
    [switch]$ApiOnly,
    [switch]$WebOnly,
    [switch]$Background,
    [switch]$Seed,
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

$mode = if ($ApiOnly) { "api" } elseif ($WebOnly) { "web" } else { "full" }
$modeLabel = switch ($mode) {
    "api"  { "API only (~3-5 min)" }
    "web"  { "Web only (~8-10 min)" }
    default { "api + web (~12-15 min)" }
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
    $nohupLine = if ($useSeed) {
        "nohup env SEED_ON_DEPLOY=1 bash deploy.sh $mode >> /tmp/deploy.log 2>&1 &"
    } else {
        "nohup bash deploy.sh $mode >> /tmp/deploy.log 2>&1 &"
    }
    $startCmd = "cd '$RemoteDir' && : > /tmp/deploy.log && $nohupLine echo `$! > /tmp/deploy.pid && echo started"
    Invoke-Ssh $startCmd | Out-Null

    $pollSec = 20
    $maxMin = if ($mode -eq "api") { 25 } elseif ($mode -eq "web") { 35 } else { 45 }
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
    $deployCmd = if ($useSeed) {
        "cd '$RemoteDir' && env SEED_ON_DEPLOY=1 bash deploy.sh $mode"
    } else {
        "cd '$RemoteDir' && bash deploy.sh $mode"
    }
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
