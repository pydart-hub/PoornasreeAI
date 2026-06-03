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
    [string]$Server    = "168.231.121.19",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI"
)

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
