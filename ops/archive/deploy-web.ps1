# ============================================================
# deploy-web.ps1 - Fast web-only (old-server quick path)
# ============================================================
# Alias for: .\scripts\deploy-quick.ps1
# ============================================================

param(
    [switch]$Background,
    [string]$Server    = "65.20.72.131",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI2"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$params = @{
    Quick     = $true
    Server    = $Server
    User      = $User
    SshPort   = $SshPort
    RemoteDir = $RemoteDir
    KeyFile   = $KeyFile
}
if ($Background) { $params.Background = $true }
& "$Root\deploy.ps1" @params
