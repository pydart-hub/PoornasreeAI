# ==============================================================================
# Poornasree AI - Complete Live Reconnect & Tunnel Generator (Windows PowerShell)
# ==============================================================================
# Run this script whenever your Wi-Fi disconnects/reconnects or whenever you want
# a fresh, verified local development tunnel and Meta webhook endpoint.
# ==============================================================================

param(
    [string]$VpsHost = "poornasree-v4",
    [string]$SecretToken = "psr_chatbot_verify_2026",
    [int]$LocalApiPort = 4000,
    [int]$LocalDbPort = 5433
)

$RootDir = $PSScriptRoot
while ($RootDir -and -not (Test-Path (Join-Path $RootDir "package.json"))) {
    $RootDir = Split-Path $RootDir -Parent
}
if (-not $RootDir -or -not (Test-Path (Join-Path $RootDir "package.json"))) {
    $RootDir = (Get-Location).Path
}
$ApiDir = Join-Path $RootDir "api"

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "🔄  POORNASREE AI - RECONNECTING LIVE DEVELOPMENT STACK (WINDOWS)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# Helper: Stop process on given port
# ------------------------------------------------------------------------------
function Stop-PortProcess {
    param([int]$Port)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($p in $pids) {
                if ($p -gt 0) {
                    Write-Host "   [-] Terminating process $p listening on port $Port..." -ForegroundColor Yellow
                    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {
        $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+(\d+)"
        foreach ($line in $lines) {
            if ($line.Matches[0].Groups[1].Value) {
                $pidToKill = [int]$line.Matches[0].Groups[1].Value
                if ($pidToKill -gt 0) {
                    Write-Host "   [-] Terminating process $pidToKill on port $Port..." -ForegroundColor Yellow
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

# ------------------------------------------------------------------------------
# Helper: Locate cloudflared binary
# ------------------------------------------------------------------------------
function Find-Cloudflared {
    $cmd = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    
    $commonPaths = @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe",
        (Join-Path $RootDir "cloudflared.exe")
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) { return $p }
    }
    
    $wingetMatches = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "cloudflared.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($wingetMatches) { return $wingetMatches.FullName }

    return $null
}

# ------------------------------------------------------------------------------
# Helper: Start persistent SSH tunnel to database
# ------------------------------------------------------------------------------
function Start-SshDbTunnel {
    param([string]$DbIp)
    $forwardArg = "${LocalDbPort}:${DbIp}:5432"
    $sshArgs = "-N -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o TCPKeepAlive=yes -o ExitOnForwardFailure=yes -L $forwardArg $VpsHost"
    return (Start-Process -FilePath "ssh" -ArgumentList $sshArgs -WindowStyle Hidden -PassThru)
}

# 1. Clean up existing processes
Write-Host ""
Write-Host "[1/5] Cleaning up existing tunnel and server processes..." -ForegroundColor Yellow
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-PortProcess -Port $LocalApiPort
Stop-PortProcess -Port $LocalDbPort
Start-Sleep -Seconds 1

# 2. Establish fresh SSH tunnel to VPS PostgreSQL
Write-Host ""
Write-Host "[2/5] Connecting persistent SSH Tunnel to Database (localhost:$LocalDbPort -> VPS DB)..." -ForegroundColor Yellow

# Detect container DB IP on VPS
$dbIp = "172.19.0.4"
try {
    $detectedIp = (ssh -o ConnectTimeout=5 $VpsHost "docker inspect poornasree-ai-db-1 | grep -m 1 '\"\"IPAddress\"\": \"\"172' | awk -F'\"\"' '{print \$4}'" 2>$null)
    if ($detectedIp -and $detectedIp.Trim() -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
        $dbIp = $detectedIp.Trim()
    }
} catch {}

Write-Host "   Targeting VPS Database at: $dbIp:5432" -ForegroundColor DarkGray
$sshProcess = Start-SshDbTunnel -DbIp $dbIp
Start-Sleep -Seconds 2

# Verify DB port
$dbConnected = $false
for ($i = 1; $i -le 10; $i++) {
    $test = Test-NetConnection -ComputerName "127.0.0.1" -Port $LocalDbPort -WarningAction SilentlyContinue -InformationLevel Quiet
    if ($test) {
        $dbConnected = $true
        break
    }
    Start-Sleep -Milliseconds 500
}

if ($dbConnected) {
    Write-Host "   [+] PostgreSQL Database tunnel connected on port $LocalDbPort." -ForegroundColor Green
} else {
    Write-Host "   [!] Failed to establish DB tunnel on port $LocalDbPort. Check SSH connection." -ForegroundColor Red
    if ($sshProcess -and -not $sshProcess.HasExited) { $sshProcess.Kill() }
    exit 1
}

# 3. Locate & Start Cloudflare Tunnel
Write-Host ""
Write-Host "[3/5] Launching Cloudflare Webhook Ingress Tunnel..." -ForegroundColor Yellow
$cfExe = Find-Cloudflared

if (-not $cfExe) {
    Write-Host "   [!] cloudflared not found in standard paths. Please install cloudflared." -ForegroundColor Red
    exit 1
}

Write-Host "   Using cloudflared binary: $cfExe" -ForegroundColor DarkGray
$tmpLogOut = [System.IO.Path]::GetTempFileName()
$tmpLogErr = [System.IO.Path]::GetTempFileName()
$cfProcess = Start-Process -FilePath $cfExe -ArgumentList "tunnel --protocol http2 --url http://127.0.0.1:$LocalApiPort" -RedirectStandardOutput $tmpLogOut -RedirectStandardError $tmpLogErr -WindowStyle Hidden -PassThru

$cfUrl = ""
Write-Host -NoNewline "   Waiting for public HTTPS tunnel URL"
for ($i = 1; $i -le 30; $i++) {
    Write-Host -NoNewline "."
    $allContent = ""
    if (Test-Path $tmpLogOut) {
        $allContent += (Get-Content -Path $tmpLogOut -Raw -ErrorAction SilentlyContinue)
    }
    if (Test-Path $tmpLogErr) {
        $allContent += (Get-Content -Path $tmpLogErr -Raw -ErrorAction SilentlyContinue)
    }
    if ($allContent -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
        $cfUrl = $matches[1]
        break
    }
    Start-Sleep -Seconds 1
}
Write-Host ""

if (-not $cfUrl) {
    Write-Host "   [!] Cloudflare tunnel failed to assign a URL. Check err log: $tmpLogErr" -ForegroundColor Red
    if ($cfProcess -and -not $cfProcess.HasExited) { $cfProcess.Kill() }
    if ($sshProcess -and -not $sshProcess.HasExited) { $sshProcess.Kill() }
    exit 1
}

$webhookUrl = $cfUrl + "/api/whatsapp/webhook"
Write-Host "   [+] Public Ingress URL assigned: $cfUrl" -ForegroundColor Green

# 4. Start API Server in Background
Write-Host ""
Write-Host "[4/5] Starting Node.js API Server..." -ForegroundColor Yellow
$apiLogOut = Join-Path $RootDir "api-dev-server.log"
$apiLogErr = Join-Path $RootDir "api-dev-server-err.log"
$apiProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory $ApiDir -RedirectStandardOutput $apiLogOut -RedirectStandardError $apiLogErr -WindowStyle Hidden -PassThru

Write-Host -NoNewline "   Waiting for API Server to initialize on port $LocalApiPort"
$apiRunning = $false
for ($i = 1; $i -le 35; $i++) {
    Write-Host -NoNewline "."
    try {
        $healthCheck = Invoke-WebRequest -Uri "http://localhost:$LocalApiPort/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($healthCheck.StatusCode -ge 200) {
            $apiRunning = $true
            break
        }
    } catch {
        $pCheck = Test-NetConnection -ComputerName "127.0.0.1" -Port $LocalApiPort -WarningAction SilentlyContinue -InformationLevel Quiet
        if ($pCheck) {
            $apiRunning = $true
            break
        }
    }
    Start-Sleep -Seconds 1
}
Write-Host ""

if ($apiRunning) {
    Write-Host "   [+] API Server running on port $LocalApiPort (PID: $($apiProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   [*] API server initializing (PID: $($apiProcess.Id)). Log: $apiLogOut" -ForegroundColor Yellow
}

# 5. Verify Webhook Handshake against Public Cloudflare Tunnel
Write-Host ""
Write-Host "[5/5] Testing live Meta Webhook verification handshake..." -ForegroundColor Yellow
$testChallenge = "1234567890"
$verifyUrl = $webhookUrl + "?hub.mode=subscribe&hub.verify_token=" + $SecretToken + "&hub.challenge=" + $testChallenge

Start-Sleep -Seconds 3
$handshakePassed = $false
try {
    $res = Invoke-RestMethod -Uri $verifyUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
    if ("$res".Trim() -eq $testChallenge) {
        Write-Host "   [+] Webhook Handshake Test PASSED (200 OK, Challenge Verified)" -ForegroundColor Green
        $handshakePassed = $true
    } else {
        Write-Host "   [*] Handshake test response: '$res'" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   [*] Handshake test response: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ">>> COPY AND PASTE INTO META DEVELOPER DASHBOARD <<<" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Callback URL:" -ForegroundColor White
Write-Host "  $webhookUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Verify Token:" -ForegroundColor White
Write-Host "  $SecretToken" -ForegroundColor Yellow
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host "Live stack is RUNNING (Auto-heal enabled). Press Ctrl+C to stop." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""

# Keep alive loop with auto-reconnection
try {
    while ($true) {
        if ($sshProcess.HasExited) {
            Write-Host "   [!] SSH Tunnel disconnected. Auto-reconnecting to VPS DB..." -ForegroundColor Yellow
            Stop-PortProcess -Port $LocalDbPort
            $sshProcess = Start-SshDbTunnel -DbIp $dbIp
        }
        if ($cfProcess.HasExited) {
            Write-Host "   [!] Cloudflare tunnel disconnected. Auto-restarting tunnel..." -ForegroundColor Yellow
            $cfProcess = Start-Process -FilePath $cfExe -ArgumentList "tunnel --protocol http2 --url http://127.0.0.1:$LocalApiPort" -RedirectStandardOutput $tmpLogOut -RedirectStandardError $tmpLogErr -WindowStyle Hidden -PassThru
        }
        Start-Sleep -Seconds 5
    }
} finally {
    Write-Host "`n[*] Stopping background services..." -ForegroundColor Yellow
    if ($cfProcess -and -not $cfProcess.HasExited) { $cfProcess.Kill() }
    if ($sshProcess -and -not $sshProcess.HasExited) { $sshProcess.Kill() }
    if ($apiProcess -and -not $apiProcess.HasExited) { $apiProcess.Kill() }
    Stop-PortProcess -Port $LocalApiPort
    Stop-PortProcess -Port $LocalDbPort
    Write-Host "   [+] Cleanup complete." -ForegroundColor Green
}
