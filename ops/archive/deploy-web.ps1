# ============================================================
# deploy-web.ps1 - Fast web-only (old-server quick path)
# ============================================================
# Alias for: .\scripts\deploy-quick.ps1
# ============================================================

param(
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
    Quick     = $true
    Server    = $Server
    User      = $User
    SshPort   = $SshPort
    RemoteDir = $RemoteDir
    KeyFile   = $KeyFile
}
if ($Background) { $params.Background = $true }
& "$RepoRoot\deploy.ps1" @params
