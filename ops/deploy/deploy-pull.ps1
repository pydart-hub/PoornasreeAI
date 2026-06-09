# ============================================================
# deploy-pull.ps1 - Pull pre-built images from GHCR (fast deploy)
# ============================================================
# Requires images from .github/workflows/publish-images.yml
# See DEPLOY.md for one-time GHCR setup.
#
# Workflow:
#   1. git push (CI builds images on AIpoorna)
#   2. .\ops\deploy\deploy-pull.ps1  (or .\scripts\deploy-pull.ps1)
# ============================================================

param(
    [switch]$Background,
    [string]$ImageTag = "AIpoorna",
    [string]$Server    = "65.20.72.131",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI2"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
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
