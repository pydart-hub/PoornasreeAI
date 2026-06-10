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
& "$RepoRoot\deploy.ps1" @params
