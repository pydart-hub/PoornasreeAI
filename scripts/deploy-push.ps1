# Commit, push to AIpoorna, wait for CI images, then fast pull deploy on VPS.
# Usage:
#   .\scripts\deploy-push.ps1 -Message "feat: my change"
#   .\scripts\deploy-push.ps1 -Message "fix: x" -SkipCommit   # push + deploy only
#   .\scripts\deploy-push.ps1 -SkipPush -SkipWait               # deploy only (already pushed)

param(
    [string]$Message = "chore: deploy sync",
    [switch]$SkipCommit,
    [switch]$SkipPush,
    [switch]$SkipWait,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not $SkipCommit) {
    $status = git status --porcelain
    if ($status) {
        Write-Host "Committing changes..." -ForegroundColor Cyan
        git add -A
        git commit -m $Message
    } else {
        Write-Host "Nothing to commit." -ForegroundColor DarkGray
    }
}

if (-not $SkipPush) {
    Write-Host "Pushing AIpoorna..." -ForegroundColor Cyan
    git push origin AIpoorna
}

if (-not $SkipWait) {
    Write-Host "Waiting for Publish Docker images workflow..." -ForegroundColor Cyan
    $run = gh run list --workflow "Publish Docker images" --branch AIpoorna --limit 1 --json databaseId,status --jq '.[0].databaseId' 2>$null
    if ($run) {
        gh run watch $run --exit-status
    } else {
        Write-Host "No workflow run found — continuing to deploy." -ForegroundColor Yellow
    }
}

if (-not $SkipDeploy) {
    Write-Host "Fast pull deploy on VPS..." -ForegroundColor Cyan
    & "$PSScriptRoot\deploy-pull.ps1"
}

Write-Host ""
Write-Host "Done. Check https://ai.poornasreecloud.com" -ForegroundColor Green
