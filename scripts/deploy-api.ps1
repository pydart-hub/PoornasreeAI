# ============================================================
# deploy-api.ps1 - Fast API-only deployment via SSH
# ============================================================
# Rebuilds only the API container on the VPS (skips Next.js build).
# Use after backend-only changes instead of full deploy.ps1.
#
# Workflow:
#   1. git add . && git commit -m "..." && git push
#   2. .\scripts\deploy-api.ps1
#   2b. .\scripts\deploy-api.ps1 -Background   # if SSH drops during build
# ============================================================

param(
    [switch]$Background,
    [switch]$Seed,
    [string]$Server    = "168.231.121.19",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$params = @{
    ApiOnly    = $true
    Server     = $Server
    User       = $User
    SshPort    = $SshPort
    RemoteDir  = $RemoteDir
    KeyFile    = $KeyFile
}
if ($Background) { $params.Background = $true }
if ($Seed) { $params.Seed = $true }
& "$Root\deploy.ps1" @params
