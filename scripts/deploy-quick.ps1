# Forwards to ops/deploy/deploy-quick.ps1 (kept for backward compatibility)
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

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

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
        Write-Host " Pushed $branch → origin" -ForegroundColor Green
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

$deployScript = "$PSScriptRoot\..\ops\deploy\deploy-quick.ps1"

if ($Full) {
    # API then web
    & $deployScript -Api @common
    & $deployScript @common
} elseif ($Api) {
    & $deployScript -Api @common
} else {
    & $deployScript @common
}
