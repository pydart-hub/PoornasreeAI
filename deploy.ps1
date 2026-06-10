# Windows SSH wrapper for VPS quick deploy.
# See docs/DEPLOY-RUNBOOK.md

param(
    [switch]$Quick,
    [switch]$QuickApi,
    [switch]$Background,
    [string]$Server,
    [string]$User,
    [int]   $SshPort,
    [string]$RemoteDir,
    [string]$KeyFile
)

. "$PSScriptRoot/scripts/deploy-config.ps1"
if (-not $Server)    { $Server    = $DeployServer }
if (-not $User)      { $User      = $DeployUser }
if (-not $SshPort)   { $SshPort   = $DeploySshPort }
if (-not $RemoteDir) { $RemoteDir = $DeployRemoteDir }
if (-not $KeyFile)   { $KeyFile   = $DeployKeyFile }

$ErrorActionPreference = "Stop"

if (-not $Quick -and -not $QuickApi) {
    throw "Use -Quick (web) or -QuickApi (API). See docs/DEPLOY-RUNBOOK.md"
}
if ($Quick -and $QuickApi) {
    throw "Use only one of -Quick or -QuickApi"
}

$mode = if ($QuickApi) { "quick-api" } else { "quick" }

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

$deployCmd = "cd '$RemoteDir' && git remote set-url origin https://github.com/pydart-hub/PoornasreeAI.git && env SKIP_OLLAMA=1 bash deploy.sh $mode"

Write-Host ""
Write-Host " PoornasreeAI deploy — $mode" -ForegroundColor Cyan
Write-Host " Server: ${User}@${Server}" -ForegroundColor Cyan
Write-Host ""

if ($Background) {
    $startCmd = "cd '$RemoteDir' && : > /tmp/deploy.log && nohup bash -c `"$deployCmd`" >> /tmp/deploy.log 2>&1 & echo started"
    Invoke-Ssh $startCmd | Out-Null
    Write-Host "Running in background. Watch: ssh ${User}@${Server} 'tail -f /tmp/deploy.log'" -ForegroundColor Yellow
} else {
    Invoke-Ssh $deployCmd
}

Invoke-Ssh "curl -sf http://localhost:$($DeployApiHealthPort)/health && echo ' API OK' || echo ' API check failed'"
Invoke-Ssh "curl -sf -o /dev/null -w 'web:%{http_code}\n' http://127.0.0.1:3002/"

Write-Host ""
Write-Host " Done — $DeployAppUrl" -ForegroundColor Green
