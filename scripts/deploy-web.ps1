# ============================================================
# deploy-web.ps1 - Fast web-only deployment via SSH
# ============================================================
# Rebuilds only the Next.js container on the VPS.
# Use after frontend-only changes instead of full deploy.ps1.
#
# Workflow:
#   1. git push
#   2. .\scripts\deploy-web.ps1
#   2b. .\scripts\deploy-web.ps1 -Background
# ============================================================

param(
    [switch]$Background,
    [string]$Server    = "168.231.121.19",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$params = @{
    WebOnly    = $true
    Server     = $Server
    User       = $User
    SshPort    = $SshPort
    RemoteDir  = $RemoteDir
    KeyFile    = $KeyFile
}
if ($Background) { $params.Background = $true }
& "$Root\deploy.ps1" @params
