# Forwards to ops/deploy/deploy-quick.ps1 (kept for backward compatibility)
# ─────────────────────────────────────────────────────────────────────────────
# IMPORTANT: This script NEVER touches /root/poornasree-ai/.env on the server.
# The production .env is managed manually on the VPS only.
# See docs/DEPLOY-RUNBOOK.md → "CRITICAL: Production .env Rules"
# ─────────────────────────────────────────────────────────────────────────────
# Before deploy: commit any local changes and push to origin so the VPS can pull them.
#
# Usage:
#   .\scripts\deploy-quick.ps1              # web (commit+push, then deploy)
#   .\scripts\deploy-quick.ps1 -Api         # API only
#   .\scripts\deploy-quick.ps1 -Full        # API then web
#   .\scripts\deploy-quick.ps1 -SkipCommit  # deploy without commit/push
#   .\scripts\deploy-quick.ps1 -Background

param(
    [switch]$Api,
    [switch]$Full,
    [switch]$Background,
    [switch]$SkipCommit,
    [string]$CommitMessage,
    [string]$Server,
    [string]$User,
    [int]   $SshPort,
    [string]$RemoteDir,
    [string]$KeyFile
)

$RepoRoot = $PSScriptRoot
while ($RepoRoot -and -not (Test-Path (Join-Path $RepoRoot "package.json"))) {
    $RepoRoot = Split-Path $RepoRoot -Parent
}
if (-not $RepoRoot -or -not (Test-Path (Join-Path $RepoRoot "package.json"))) {
    $RepoRoot = (Get-Location).Path
}

# ── Guard: detect if local .env looks like a dev file ────────────────────────
# The production server .env must NEVER be overwritten with local dev values.
function Test-LocalEnvIsNotDevOnly {
    $envFile = Join-Path $RepoRoot ".env"
    if (-not (Test-Path $envFile)) { return }

    $envContent  = Get-Content $envFile -ErrorAction SilentlyContinue
    $corsLine    = $envContent | Where-Object { $_ -match '^CORS_ORIGIN=' } | Select-Object -First 1
    $jwtLine     = $envContent | Where-Object { $_ -match '^JWT_SECRET='  } | Select-Object -First 1
    $corsVal     = if ($corsLine)  { ($corsLine  -split '=', 2)[1].Trim('"') } else { "" }
    $jwtVal      = if ($jwtLine)   { ($jwtLine   -split '=', 2)[1].Trim('"') } else { "" }
    $devJwt      = "36bb67b0d739464ae4d982e671113d97652a896f5e58b57e99b35a170f84fdbe"
    $warned      = $false

    if ($corsVal -match 'localhost') {
        Write-Host ""
        Write-Host " [WARN] WARNING: Your local .env has CORS_ORIGIN=$corsVal" -ForegroundColor Yellow
        Write-Host "    This looks like a LOCAL DEV environment file." -ForegroundColor Yellow
        Write-Host "    The server's production .env should have CORS_ORIGIN=https://ai.poornasreecloud.com" -ForegroundColor Yellow
        $warned = $true
    }
    if ($jwtVal -eq $devJwt) {
        Write-Host ""
        Write-Host " [WARN] WARNING: Your local .env contains the DEVELOPMENT JWT_SECRET." -ForegroundColor Yellow
        Write-Host "    The production server uses a different JWT_SECRET that encrypts DB secrets." -ForegroundColor Yellow
        Write-Host "    NEVER overwrite the server .env with this file." -ForegroundColor Yellow
        $warned = $true
    }
    if ($warned) {
        Write-Host ""
        Write-Host "    This deploy script does NOT copy .env to the server - you are safe." -ForegroundColor DarkGray
        Write-Host "    But if you have recently synced .env to the server, verify with:" -ForegroundColor DarkGray
        Write-Host "    ssh poornasree-v4 'grep JWT_SECRET /root/poornasree-ai/.env'" -ForegroundColor DarkGray
        Write-Host "    Expected: <your production JWT_SECRET>" -ForegroundColor DarkGray
        Write-Host ""
    }
}

Test-LocalEnvIsNotDevOnly

function Invoke-GitCommitAndPush {
    param([string]$Message)

    Push-Location $RepoRoot
    try {
        Write-Host ""
        Write-Host " Git: commit + push latest before deploy" -ForegroundColor Cyan

        # Stage everything; .gitignore keeps secrets (.env) out
        git add -A
        if ($LASTEXITCODE -ne 0) { throw "git add failed" }

        # Never force-stage env files even if somehow tracked
        git reset HEAD -- .env .env.local api/.env 2>$null | Out-Null

        $porcelain = git status --porcelain
        if ($porcelain) {
            if (-not $Message) {
                $Message = "Deploy: sync latest changes $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
            }
            git commit -m $Message
            if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
            Write-Host " Committed: $Message" -ForegroundColor Green
        } else {
            Write-Host " Nothing new to commit." -ForegroundColor DarkGray
        }

        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        git push -u origin "HEAD"
        if ($LASTEXITCODE -ne 0) { throw "git push failed" }
        Write-Host " Pushed $branch -> origin" -ForegroundColor Green
        Write-Host ""
    } finally {
        Pop-Location
    }
}

if (-not $SkipCommit) {
    Invoke-GitCommitAndPush -Message $CommitMessage
} else {
    Write-Host " Skipping commit/push (-SkipCommit)." -ForegroundColor Yellow
}

# Build args for the real deploy script (ops/deploy/deploy-quick.ps1)
$common = @{}
if ($Background) { $common.Background = $true }
if ($Server)     { $common.Server = $Server }
if ($User)       { $common.User = $User }
if ($SshPort)    { $common.SshPort = $SshPort }
if ($RemoteDir)  { $common.RemoteDir = $RemoteDir }
if ($KeyFile)    { $common.KeyFile = $KeyFile }

$deployScript = Join-Path $RepoRoot "ops\deploy\deploy-quick.ps1"

if ($Full) {
    # API then web
    & $deployScript -Api @common
    & $deployScript @common
} elseif ($Api) {
    & $deployScript -Api @common
} else {
    & $deployScript @common
}
