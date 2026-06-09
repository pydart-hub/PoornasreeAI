# ============================================================
# clear-customer-data.ps1
# Deletes ALL tickets, customer users, conversations, simulate
# messages, and related data from local and/or VPS databases.
#
# Usage:
#   .\clear-customer-data.ps1                    # local only
#   .\clear-customer-data.ps1 -Vps               # local + VPS
#   .\clear-customer-data.ps1 -Vps -KeyFile "C:\path\to\key"
#   .\clear-customer-data.ps1 -VpsOnly           # skip local
# ============================================================

param(
    [switch]$Vps,
    [switch]$VpsOnly,
    [string]$Server    = "65.20.72.131",
    [string]$SshUser   = "root",
    [int]   $SshPort   = 22,
    [string]$RemoteDir = "/root/poornasree-ai",
    [string]$KeyFile   = "$env:USERPROFILE\.ssh\poornasreeAI2",

    # Docker / DB settings (should match docker-compose.yml)
    [string]$DbService  = "db",
    [string]$DbUser     = "poorna_user",
    [string]$DbName     = "poornasree_ai"
)

$ErrorActionPreference = "Stop"
$SqlFile = Join-Path $PSScriptRoot "clear-customer-data.sql"

# ── helpers ──────────────────────────────────────────────────────────────────

function Write-Banner([string]$msg, [string]$color = "Cyan") {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor $color
    Write-Host "  $msg" -ForegroundColor $color
    Write-Host ("=" * 60) -ForegroundColor $color
    Write-Host ""
}

function Confirm-Step([string]$prompt) {
    $ans = Read-Host "$prompt [yes/no]"
    return $ans -eq "yes"
}

function Get-SshArgs {
    $base = @("-p", "$SshPort", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30")
    if ($KeyFile) { return @("-i", $KeyFile) + $base }
    return $base
}

function Invoke-SshCmd([string]$cmd) {
    $args = (Get-SshArgs) + @("${SshUser}@${Server}", $cmd)
    & ssh @args
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed (exit $LASTEXITCODE)" }
}

function Run-SqlLocal([string]$sql) {
    & docker compose exec -T $DbService psql -U $DbUser -d $DbName -c $sql
    if ($LASTEXITCODE -ne 0) { throw "Local psql command failed (exit $LASTEXITCODE)" }
}

function Run-SqlFileVps {
    # Copy SQL file to VPS then execute it inside the db container
    $sshBase = (Get-SshArgs) -join " "
    $remoteFile = "/tmp/clear-customer-data.sql"

    # scp the file
    $scpArgs = (Get-SshArgs) + @($SqlFile, "${SshUser}@${Server}:${remoteFile}")
    # Replace -p PORT with -P PORT for scp
    $scpArgs = $scpArgs | ForEach-Object { if ($_ -eq "-p") { "-P" } else { $_ } }
    & scp @scpArgs
    if ($LASTEXITCODE -ne 0) { throw "SCP failed (exit $LASTEXITCODE)" }

    # Run inside db container on VPS
    Invoke-SshCmd "cd '$RemoteDir' && docker compose cp '$remoteFile' ${DbService}:/tmp/clear.sql && docker compose exec -T $DbService psql -U $DbUser -d $DbName -f /tmp/clear.sql && docker compose exec -T $DbService rm -f /tmp/clear.sql"
}

# ── pre-flight ────────────────────────────────────────────────────────────────

if (-not (Test-Path $SqlFile)) {
    Write-Host "ERROR: $SqlFile not found." -ForegroundColor Red
    exit 1
}

Write-Banner "PoornasreeAI — Clear Customer Data"

Write-Host "  This will PERMANENTLY DELETE:" -ForegroundColor Yellow
Write-Host "    - All Ticket records (+ WorkReports, ReplacedParts, WorkReportImages)" -ForegroundColor Yellow
Write-Host "    - All User accounts where role = 'customer'" -ForegroundColor Yellow
Write-Host "    - All Conversation, Message, SupportRequest, SupportMessage rows" -ForegroundColor Yellow
Write-Host "    - All SimulateMessage, ConversationSession, TroubleshootingSession rows" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Preserved: admin/engineer/manager/dealer/sales users, pincodes," -ForegroundColor Green
Write-Host "             products, machines, branding, documents, R&D videos," -ForegroundColor Green
Write-Host "             marketing leads, troubleshooting templates." -ForegroundColor Green
Write-Host ""

# ── local run ─────────────────────────────────────────────────────────────────

if (-not $VpsOnly) {
    Write-Host "--- LOCAL DATABASE ---" -ForegroundColor Cyan
    if (-not (Confirm-Step "  Type 'yes' to clear the LOCAL database")) {
        Write-Host "  Skipped local database." -ForegroundColor DarkGray
    } else {
        Write-Host ""
        Write-Host "[LOCAL] Running SQL..." -ForegroundColor Yellow

        # Get the running db container id
        $containerId = & docker compose ps -q $DbService
        $containerId = $containerId.Trim()
        if (-not $containerId) { throw "Could not find running container for service '$DbService'. Is docker compose up?" }

        # Copy SQL into container and run it
        & docker cp $SqlFile "${containerId}:/tmp/clear.sql"
        if ($LASTEXITCODE -ne 0) { throw "docker cp failed" }

        & docker compose exec -T $DbService psql -U $DbUser -d $DbName -f /tmp/clear.sql
        if ($LASTEXITCODE -ne 0) { throw "Local psql execution failed" }

        & docker compose exec -T $DbService rm -f /tmp/clear.sql
        Write-Host ""
        Write-Host "[LOCAL] Done." -ForegroundColor Green
    }
}

# ── VPS run ───────────────────────────────────────────────────────────────────

if ($Vps -or $VpsOnly) {
    Write-Host ""
    Write-Host "--- VPS / PRODUCTION DATABASE ($Server) ---" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "  WARNING: This targets the PRODUCTION database on $Server." -ForegroundColor Red
    Write-Host ""
    if (-not (Confirm-Step "  Type 'yes' to clear the VPS (PRODUCTION) database")) {
        Write-Host "  Skipped VPS database." -ForegroundColor DarkGray
    } else {
        Write-Host ""
        Write-Host "[VPS] Copying SQL file to VPS..." -ForegroundColor Yellow
        Run-SqlFileVps
        Write-Host ""
        Write-Host "[VPS] Done." -ForegroundColor Green
    }
}

Write-Host ""
Write-Banner "Clear complete" "Green"
