# ============================================================
# deploy-quick.ps1 — Same fast habit as the OLD server
# ============================================================
# Old server: git pull → docker compose build web → restart
# No long health wait, seed, Ollama, or nginx steps.
#
#   UI changes (default):  .\scripts\deploy-quick.ps1
#   API changes:           .\scripts\deploy-quick.ps1 -Api
#   SSH drops:             add -Background
# ============================================================

param(
    [switch]$Api,
    [switch]$Background,
    [string]$Server    = "65.20.72.131",
    [string]$User      = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI2"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$params = @{
    Server    = $Server
    User      = $User
    SshPort   = $SshPort
    RemoteDir = $RemoteDir
    KeyFile   = $KeyFile
}
if ($Api) {
    $params.QuickApi = $true
} else {
    $params.Quick = $true
}
if ($Background) { $params.Background = $true }
& "$Root\deploy.ps1" @params
