# ============================================================
# create-users.ps1 — Seed all application users via the Admin API
# ============================================================
# Usage (against VPS):
#   .\create-users.ps1
#
# Usage (against local dev server):
#   .\create-users.ps1 -ApiBase "http://localhost:4000"
#
# Requirements:
#   - API must be running and reachable
#   - Admin account must already exist (run .\create-admin.ps1 first)
# ============================================================

param(
    [string]$ApiBase    = "https://ai.poornasreecloud.com",
    [string]$AdminEmail = "admin@poornasree.com",
    [string]$AdminPass  = "password123"
)

$ErrorActionPreference = "Stop"

# ── Banner ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PoornasreeAI — Create Application Users"   -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " API base : $ApiBase"
Write-Host " Admin    : $AdminEmail"
Write-Host ""

# ── Step 1: Login as admin ───────────────────────────────────────────────
Write-Host "[1/3] Logging in as admin..." -ForegroundColor Yellow

$loginBody = @{ email = $AdminEmail; password = $AdminPass } | ConvertTo-Json
try {
    $loginResp = Invoke-RestMethod `
        -Uri        "$ApiBase/api/auth/login" `
        -Method     POST `
        -Body       $loginBody `
        -ContentType "application/json"
} catch {
    $status = $_.Exception.Response?.StatusCode?.value__
    $body   = $_ | Select-Object -ExpandProperty ErrorDetails -ErrorAction SilentlyContinue
    Write-Host "  ERROR: Login failed (HTTP $status)" -ForegroundColor Red
    if ($body) { Write-Host "  $($body.Message)" -ForegroundColor Red }
    exit 1
}

$token = $loginResp.token
if (-not $token) {
    Write-Host "  ERROR: No token returned — check admin credentials." -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Logged in — token acquired." -ForegroundColor Green

# ── Step 2: Define users to create ──────────────────────────────────────
Write-Host ""
Write-Host "[2/3] Creating users..." -ForegroundColor Yellow

$users = @(
    @{
        email     = "service@poornasree.com"
        password  = "Service@123"
        firstName = "Rajan"
        lastName  = "Kumar"
        role      = "service"
    },
    @{
        email     = "rd@poornasree.com"
        password  = "RnD@1234"
        firstName = "Priya"
        lastName  = "Sharma"
        role      = "service"
    },
    @{
        email     = "customer@example.com"
        password  = "Customer@123"
        firstName = "Amit"
        lastName  = "Patel"
        role      = "customer"
    },
    # ── Add additional customers / staff below ──
    # @{
    #     email     = "customer2@example.com"
    #     password  = "Customer@456"
    #     firstName = "Sneha"
    #     lastName  = "Rao"
    #     role      = "customer"
    # },
)

$headers = @{ Authorization = "Bearer $token" }
$created = 0
$skipped = 0

foreach ($u in $users) {
    $body = $u | ConvertTo-Json
    try {
        $resp = Invoke-RestMethod `
            -Uri         "$ApiBase/api/admin/users" `
            -Method      POST `
            -Body        $body `
            -ContentType "application/json" `
            -Headers     $headers

        Write-Host ("  + {0,-35} ({1})" -f $resp.user.email, $resp.user.role) -ForegroundColor Green
        $created++
    } catch {
        $status = $_.Exception.Response?.StatusCode?.value__
        if ($status -eq 409) {
            Write-Host ("  ~ {0,-35} — already exists, skipped" -f $u.email) -ForegroundColor DarkGray
            $skipped++
        } else {
            $errBody = $_ | Select-Object -ExpandProperty ErrorDetails -ErrorAction SilentlyContinue
            Write-Host ("  ! {0,-35} — HTTP $status  {1}" -f $u.email, $errBody.Message) -ForegroundColor Red
        }
    }
}

# ── Step 3: Summary ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/3] Fetching current user list..." -ForegroundColor Yellow

try {
    $listResp = Invoke-RestMethod `
        -Uri     "$ApiBase/api/admin/users" `
        -Method  GET `
        -Headers $headers

    $cols = @(
        @{ Label="Email";     Expression={ $_.email } },
        @{ Label="Name";      Expression={ "$($_.firstName) $($_.lastName)".Trim() } },
        @{ Label="Role";      Expression={ $_.role } },
        @{ Label="Chats";     Expression={ $_._count.conversations } }
    )
    $listResp.users | Format-Table $cols -AutoSize
} catch {
    Write-Host "  (Could not fetch user list)" -ForegroundColor DarkGray
}

Write-Host "============================================" -ForegroundColor Green
Write-Host (" Done — {0} created, {1} already existed." -f $created, $skipped) -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host " Credentials summary:" -ForegroundColor Cyan
Write-Host "   service@poornasree.com   /  Service@123  (role: service)"
Write-Host "   rd@poornasree.com        /  RnD@1234     (role: service)"
Write-Host "   customer@example.com     /  Customer@123 (role: customer)"
Write-Host ""
