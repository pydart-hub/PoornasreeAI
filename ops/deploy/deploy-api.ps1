# ============================================================
# deploy-api.ps1 - Fast API-only deployment via SSH
# ============================================================
# Rebuilds only the API container on the VPS (skips Next.js build).
# Use after backend-only changes instead of full deploy.ps1.
#
# Workflow:
#   1. git add . && git commit -m "..." && git push
#   2. .\scripts\deploy-api.ps1 -Quick        # old-server fast path (recommended)
#   2b. .\scripts\deploy-api.ps1 -Background
#   Or: .\scripts\deploy-quick.ps1 -Api
#
# See DEPLOY.md for all deploy modes.
# ============================================================

param(
    [switch]$Background,
    [switch]$Quick,
    [switch]$Seed,
    [string]$Server,
    [string]$User,
    [int]   $SshPort,
    [string]$RemoteDir,
    [string]$KeyFile
)

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. "$RepoRoot\scripts\deploy-config.ps1"
if (-not $Server)    { $Server    = $DeployServer }
if (-not $User)      { $User      = $DeployUser }
if (-not $SshPort)   { $SshPort   = $DeploySshPort }
if (-not $RemoteDir) { $RemoteDir = $DeployRemoteDir }
if (-not $KeyFile)   { $KeyFile   = $DeployKeyFile }

$ErrorActionPreference = "Stop"

$params = @{
    Server     = $Server
    User       = $User
    SshPort    = $SshPort
    RemoteDir  = $RemoteDir
    KeyFile    = $KeyFile
}
if ($Quick) {
    $params.QuickApi = $true
} else {
    $params.ApiOnly = $true
}
if ($Background) { $params.Background = $true }
if ($Seed) { $params.Seed = $true }
& "$RepoRoot\deploy.ps1" @params
