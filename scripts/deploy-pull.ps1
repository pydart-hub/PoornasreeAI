# ============================================================
# deploy-pull.ps1 - Pull pre-built images from GHCR (fast deploy)
# ============================================================
# Requires images from .github/workflows/publish-images.yml
# See DEPLOY.md for one-time GHCR setup.
#
# Workflow:
#   1. git push (CI builds images on AIpoorna)
#   2. .\scripts\deploy-pull.ps1
# ============================================================

param(
    [switch]$Background,
    [string]$ImageTag = "AIpoorna",
    [string]$Server,
    [string]$User,
    [int]   $SshPort,
    [string]$RemoteDir,
    [string]$KeyFile
)

. "$PSScriptRoot/deploy-config.ps1"
if (-not $Server)    { $Server    = $DeployServer }
if (-not $User)      { $User      = $DeployUser }
if (-not $SshPort)   { $SshPort   = $DeploySshPort }
if (-not $RemoteDir) { $RemoteDir = $DeployRemoteDir }
if (-not $KeyFile)   { $KeyFile   = $DeployKeyFile }

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$params = @{
    PullOnly  = $true
    ImageTag  = $ImageTag
    Server    = $Server
    User      = $User
    SshPort   = $SshPort
    RemoteDir = $RemoteDir
    KeyFile   = $KeyFile
}
if ($Background) { $params.Background = $true }
& "$Root\deploy.ps1" @params
