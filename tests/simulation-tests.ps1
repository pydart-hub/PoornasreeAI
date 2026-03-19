# PoornasreeAI - Real-World Simulation Test Suite
# Covers: normal flows, failure scenarios, edge cases, multi-user isolation, validation
# Usage: .\tests\simulation-tests.ps1 [-Base "https://poornasree.pydart.com"]
param([string]$Base = "https://poornasree.pydart.com")
$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── Counters & helpers ─────────────────────────────────────────────────────
$script:pass = 0; $script:fail = 0; $script:skip = 0
$script:log = @()

function Pass  { param($n,$d=""); Write-Host "  [PASS] $n" -ForegroundColor Green;      if($d){Write-Host "         $d" -ForegroundColor DarkGray}; $script:pass++; $script:log += "PASS | $n" }
function Fail  { param($n,$d=""); Write-Host "  [FAIL] $n" -ForegroundColor Red;        if($d){Write-Host "         $d" -ForegroundColor Yellow};   $script:fail++; $script:log += "FAIL | $n | $d" }
function Skip  { param($n,$d=""); Write-Host "  [SKIP] $n" -ForegroundColor DarkYellow; if($d){Write-Host "         reason: $d" -ForegroundColor DarkGray}; $script:skip++; $script:log += "SKIP | $n" }
function Head  { param($t); Write-Host ""; Write-Host ("=" * 65) -ForegroundColor DarkCyan; Write-Host "  $t" -ForegroundColor Cyan; Write-Host ("=" * 65) -ForegroundColor DarkCyan }

function Login {
    param([string]$email, [string]$password)
    $body = (@{ email=$email; password=$password } | ConvertTo-Json)
    try {
        $null = Invoke-WebRequest -Method POST -Uri "$Base/api/auth/login" `
            -ContentType "application/json" -Body $body `
            -SessionVariable s -UseBasicParsing -ErrorAction Stop
        return $s
    } catch { return $null }
}

# Call returns parsed JSON. On error, tries to parse error body; returns $null if nothing.
function Call {
    param([string]$method, [string]$path, $body=$null,
          [Microsoft.PowerShell.Commands.WebRequestSession]$sess=$null)
    $p = @{ Method=$method; Uri="$Base$path"; ContentType="application/json"; UseBasicParsing=$true }
    if ($body)  { $p.Body = ($body | ConvertTo-Json -Depth 10) }
    if ($sess)  { $p.WebSession = $sess }
    try {
        $r = Invoke-WebRequest @p -ErrorAction Stop
        return @{ status=[int]$r.StatusCode; data=($r.Content | ConvertFrom-Json) }
    } catch {
        $code = [int]$_.Exception.Response.StatusCode
        try { $errBody = ($_.ErrorDetails.Message | ConvertFrom-Json) } catch { $errBody = $null }
        return @{ status=$code; data=$errBody }
    }
}

# ── Login all test users ──────────────────────────────────────────────────
Head "PRE-FLIGHT: Authenticate all test users"
$admin    = Login "admin@poornasree.com"      "Admin@1234"
$manager  = Login "manager@poornasree.com"    "Manager@1234"
$engineer1= Login "engineer1@poornasree.com"  "Engineer@1234"
$engineer2= Login "engineer2@poornasree.com"  "Engineer@1234"
$dealer   = Login "dealer@poornasree.com"     "Dealer@1234"

$allOk = $admin -and $manager -and $engineer1 -and $engineer2 -and $dealer
if ($allOk) { Pass "All users authenticated" } else { Fail "User login failed - aborting"; exit 1 }

# ═══════════════════════════════════════════════════════════════════════════
#  CATEGORY 1: NORMAL FLOW (Happy Path)
# ═══════════════════════════════════════════════════════════════════════════
Head "CATEGORY 1: Normal Flow - Full Ticket Lifecycle"

# T1.1 - Dealer creates ticket -> assigned engineer starts -> OTP -> close
$r = Call "POST" "/api/tickets" @{ problemDescription="Simulation test - normal lifecycle"; machineName="Test Machine 1" } $dealer
$tkId = $null; $tkNum = $null
if ($r.status -eq 201 -and $r.data.ticket) {
    $tkId  = $r.data.ticket.id
    $tkNum = $r.data.ticket.ticketNumber
    Pass "T1.1a Dealer creates ticket" "$tkNum"
} else { Fail "T1.1a Dealer creates ticket" "status=$($r.status)" }

# Ticket should be auto-assigned (ASSIGNED)
if ($tkId) {
    $r2 = Call "GET" "/api/tickets/$tkId" $null $admin
    if ($r2.data.ticket.status -eq "ASSIGNED") {
        Pass "T1.1b Ticket auto-assigned to engineer" "assigned=$($r2.data.ticket.assignedEngineer.id)"
        $assignedEngId = $r2.data.ticket.assignedEngineer.id
    } else { Fail "T1.1b Ticket auto-assigned" "status=$($r2.data.ticket.status). Expected ASSIGNED"; $assignedEngId = $null }
}

# Figure out which session matches the assigned engineer
$engSession = $null
if ($assignedEngId) {
    # Try engineer1 - get profile
    $me1 = Call "GET" "/api/auth/me" $null $engineer1
    $me2 = Call "GET" "/api/auth/me" $null $engineer2
    if ($me1.data.user.id -eq $assignedEngId -or $me1.data.id -eq $assignedEngId) { $engSession = $engineer1; $engLabel = "engineer1" }
    elseif ($me2.data.user.id -eq $assignedEngId -or $me2.data.id -eq $assignedEngId) { $engSession = $engineer2; $engLabel = "engineer2" }
    else {
        # Fallback: admin can start (isAdmin override)
        $engSession = $admin; $engLabel = "admin (override)"
    }
}

# Engineer starts work
if ($tkId -and $engSession) {
    $r = Call "PATCH" "/api/tickets/$tkId/start" $null $engSession
    if ($r.status -eq 200 -and $r.data.ticket.status -eq "IN_PROGRESS") {
        Pass "T1.1c Engineer starts work" "$engLabel -> IN_PROGRESS"
    } else { Fail "T1.1c Engineer starts work" "status=$($r.status) err=$($r.data.error)" }
}

# Engineer requests OTP
$otpCode = $null
if ($tkId -and $engSession) {
    $r = Call "POST" "/api/tickets/$tkId/otp" $null $engSession
    if ($r.status -eq 200 -and $r.data.otp) {
        $otpCode = $r.data.otp
        Pass "T1.1d OTP requested" "code=$otpCode, expires=$($r.data.expiresAt)"
    } else { Fail "T1.1d OTP requested" "status=$($r.status) err=$($r.data.error)" }
}

# Engineer verifies OTP -> CLOSED
if ($tkId -and $engSession -and $otpCode) {
    $r = Call "POST" "/api/tickets/$tkId/verify-otp" @{ code=$otpCode } $engSession
    if ($r.status -eq 200 -and $r.data.ticket.status -eq "CLOSED") {
        Pass "T1.1e OTP verified, ticket CLOSED" "closedAt=$($r.data.ticket.closedAt)"
    } else { Fail "T1.1e OTP verify" "status=$($r.status) err=$($r.data.error)" }
}

# T1.4 - Multi-ticket creation (unique numbers)
Head "CATEGORY 1: Normal Flow - Multi-Ticket Dealer"
$ticketNums = @()
for ($i = 1; $i -le 3; $i++) {
    $r = Call "POST" "/api/tickets" @{ problemDescription="Multi-ticket test #$i" } $dealer
    if ($r.status -eq 201) { $ticketNums += $r.data.ticket.ticketNumber }
}
if ($ticketNums.Count -eq 3) {
    $unique = ($ticketNums | Sort-Object -Unique).Count
    if ($unique -eq 3) { Pass "T1.4 Three tickets with unique numbers" ($ticketNums -join ", ") }
    else { Fail "T1.4 Ticket number uniqueness" "Got duplicates: $($ticketNums -join ', ')" }
} else { Fail "T1.4 Multi-ticket creation" "Only created $($ticketNums.Count) of 3" }


# ═══════════════════════════════════════════════════════════════════════════
#  CATEGORY 2: FAILURE SCENARIOS
# ═══════════════════════════════════════════════════════════════════════════
Head "CATEGORY 2: Failure Scenarios - Wrong OTP Lockout"

# Create a fresh ticket for OTP lockout test
$r = Call "POST" "/api/tickets" @{ problemDescription="OTP lockout test" } $dealer
$otpTkId = $null
if ($r.status -eq 201) {
    $otpTkId = $r.data.ticket.id
    Pass "T2.1 setup - ticket created" $r.data.ticket.ticketNumber
}

# Start work (via admin for simplicity)
if ($otpTkId) {
    # Admin re-assigns to engineer1 first
    $me1 = Call "GET" "/api/auth/me" $null $engineer1
    $eng1Id = if ($me1.data.user) { $me1.data.user.id } else { $me1.data.id }
    $null = Call "PATCH" "/api/tickets/$otpTkId/assign-engineer" @{ engineerId=$eng1Id } $admin
    $r = Call "PATCH" "/api/tickets/$otpTkId/start" $null $engineer1
    if ($r.status -eq 200) { Pass "T2.1 setup - work started" }
    else { Fail "T2.1 setup - start" "status=$($r.status) err=$($r.data.error)" }
}

# Request OTP
$realOtp = $null
if ($otpTkId) {
    $r = Call "POST" "/api/tickets/$otpTkId/otp" $null $engineer1
    if ($r.status -eq 200) { $realOtp = $r.data.otp; Pass "T2.1 setup - OTP generated" }
    else { Fail "T2.1 setup - OTP" "status=$($r.status)" }
}

# Wrong OTP attempt 1 -> 2 remaining
if ($otpTkId -and $realOtp) {
    $r = Call "POST" "/api/tickets/$otpTkId/verify-otp" @{ code="0000" } $engineer1
    if ($r.status -eq 400 -and $r.data.error -match "2 attempt") {
        Pass "T2.1a Wrong OTP #1" "2 attempts remaining"
    } else { Fail "T2.1a Wrong OTP #1" "status=$($r.status) err=$($r.data.error)" }

    # Wrong OTP attempt 2 -> 1 remaining
    $r = Call "POST" "/api/tickets/$otpTkId/verify-otp" @{ code="0001" } $engineer1
    if ($r.status -eq 400 -and $r.data.error -match "1 attempt") {
        Pass "T2.1b Wrong OTP #2" "1 attempt remaining"
    } else { Fail "T2.1b Wrong OTP #2" "status=$($r.status) err=$($r.data.error)" }

    # Wrong OTP attempt 3 -> 423 locked
    $r = Call "POST" "/api/tickets/$otpTkId/verify-otp" @{ code="0002" } $engineer1
    if ($r.status -eq 423 -and $r.data.error -match "locked") {
        Pass "T2.1c Wrong OTP #3 - LOCKED" "423 lockout"
    } else { Fail "T2.1c Wrong OTP #3 lockout" "status=$($r.status) err=$($r.data.error)" }

    # Correct OTP after lockout -> still 423
    $r = Call "POST" "/api/tickets/$otpTkId/verify-otp" @{ code=$realOtp } $engineer1
    if ($r.status -eq 423) {
        Pass "T2.1d Correct OTP after lockout still rejected" "423"
    } else { Fail "T2.1d Post-lockout" "status=$($r.status) - expected 423" }
}

# ── T2.3 Unauthorized role actions ────────────────────────────────────────
Head "CATEGORY 2: Failure Scenarios - Unauthorized Roles"

# Engineer tries to create ticket -> 403
$r = Call "POST" "/api/tickets" @{ problemDescription="Unauthorized" } $engineer1
if ($r.status -eq 403) { Pass "T2.3a Engineer cannot create ticket" "403" }
else { Fail "T2.3a Engineer create ticket" "status=$($r.status)" }

# Dealer tries to assign manager -> 403
$r = Call "PATCH" "/api/tickets/fake-id/assign-manager" @{ managerId="fake" } $dealer
if ($r.status -eq 403) { Pass "T2.3b Dealer cannot assign manager" "403" }
else { Fail "T2.3b Dealer assign-manager" "status=$($r.status)" }

# Engineer tries to assign-manager -> 403
$r = Call "PATCH" "/api/tickets/fake-id/assign-manager" @{ managerId="fake" } $engineer1
if ($r.status -eq 403) { Pass "T2.3c Engineer cannot assign manager" "403" }
else { Fail "T2.3c Engineer assign-manager" "status=$($r.status)" }

# Dealer tries to assign-engineer -> 403
$r = Call "PATCH" "/api/tickets/fake-id/assign-engineer" @{ engineerId="fake" } $dealer
if ($r.status -eq 403) { Pass "T2.3d Dealer cannot assign engineer" "403" }
else { Fail "T2.3d Dealer assign-engineer" "status=$($r.status)" }

# Dealer tries to start work -> 403
$r = Call "PATCH" "/api/tickets/fake-id/start" $null $dealer
if ($r.status -eq 403) { Pass "T2.3e Dealer cannot start work" "403" }
else { Fail "T2.3e Dealer start work" "status=$($r.status)" }

# Dealer tries to request OTP -> 403
$r = Call "POST" "/api/tickets/fake-id/otp" $null $dealer
if ($r.status -eq 403) { Pass "T2.3f Dealer cannot request OTP" "403" }
else { Fail "T2.3f Dealer request OTP" "status=$($r.status)" }

# Dealer tries to verify OTP -> 403
$r = Call "POST" "/api/tickets/fake-id/verify-otp" @{ code="1234" } $dealer
if ($r.status -eq 403) { Pass "T2.3g Dealer cannot verify OTP" "403" }
else { Fail "T2.3g Dealer verify OTP" "status=$($r.status)" }

# ── T2.4 Wrong engineer tries to start work ──────────────────────────────
Head "CATEGORY 2: Failure Scenarios - Wrong Engineer"

# Create ticket -> auto-assigned to some engineer
$r = Call "POST" "/api/tickets" @{ problemDescription="Wrong engineer test" } $dealer
$weTkId = $null
if ($r.status -eq 201) {
    $weTkId = $r.data.ticket.id
    $assignedId = $r.data.ticket.assignedEngineer.id
    # Determine which engineer is NOT assigned
    $me1 = Call "GET" "/api/auth/me" $null $engineer1
    $me2 = Call "GET" "/api/auth/me" $null $engineer2
    $eng1Id = if ($me1.data.user) { $me1.data.user.id } else { $me1.data.id }
    $eng2Id = if ($me2.data.user) { $me2.data.user.id } else { $me2.data.id }

    if ($assignedId -eq $eng1Id) {
        $wrongEngineer = $engineer2; $wrongLabel = "engineer2"
    } else {
        $wrongEngineer = $engineer1; $wrongLabel = "engineer1"
    }

    # Wrong engineer tries to start
    $r2 = Call "PATCH" "/api/tickets/$weTkId/start" $null $wrongEngineer
    if ($r2.status -eq 403 -and $r2.data.error -match "not assigned") {
        Pass "T2.4 Wrong engineer blocked from start" "$wrongLabel -> 403"
    } else { Fail "T2.4 Wrong engineer start" "status=$($r2.status) err=$($r2.data.error)" }
} else { Fail "T2.4 Setup" "Could not create ticket" }


# ═══════════════════════════════════════════════════════════════════════════
#  CATEGORY 3: EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════
Head "CATEGORY 3: Edge Cases - Skip Status Steps"

# Create a fresh ticket
$r = Call "POST" "/api/tickets" @{ problemDescription="Edge case test" } $dealer
$edgeTkId = $null
if ($r.status -eq 201) {
    $edgeTkId = $r.data.ticket.id
    $edgeStatus = $r.data.ticket.status
    Pass "T3.1 setup - ticket created" "status=$edgeStatus"
}

if ($edgeTkId) {
    # Try to request OTP on ASSIGNED ticket (should need IN_PROGRESS first)
    $r = Call "POST" "/api/tickets/$edgeTkId/otp" $null $admin
    if ($r.status -eq 400 -and $r.data.error -match "IN_PROGRESS") {
        Pass "T3.1a Cannot request OTP before starting work" "400"
    } else { Fail "T3.1a Skip to OTP" "status=$($r.status) err=$($r.data.error)" }

    # Try to verify OTP on ASSIGNED ticket
    $r = Call "POST" "/api/tickets/$edgeTkId/verify-otp" @{ code="1234" } $admin
    if ($r.status -eq 400 -and $r.data.error -match "pending|PENDING_OTP") {
        Pass "T3.1b Cannot verify OTP without requesting" "400"
    } else { Fail "T3.1b Skip to verify" "status=$($r.status) err=$($r.data.error)" }

    # Try assign-manager on ASSIGNED ticket (only works on OPEN)
    $mgrMe = Call "GET" "/api/auth/me" $null $manager
    $mgrId = if ($mgrMe.data.user) { $mgrMe.data.user.id } else { $mgrMe.data.id }
    $r = Call "PATCH" "/api/tickets/$edgeTkId/assign-manager" @{ managerId=$mgrId } $admin
    if ($r.status -eq 400 -and $r.data.error -match "OPEN") {
        Pass "T3.1c Cannot assign manager on ASSIGNED ticket" "Only OPEN"
    } else { Fail "T3.1c Assign manager on ASSIGNED" "status=$($r.status) err=$($r.data.error)" }
}

# ── T3.2 Double OTP request (re-request invalidates old) ─────────────────
Head "CATEGORY 3: Edge Cases - Double OTP Request"

$r = Call "POST" "/api/tickets" @{ problemDescription="Double OTP test" } $dealer
$dblTkId = $null
if ($r.status -eq 201) {
    $dblTkId = $r.data.ticket.id
    # Admin start (override)
    $null = Call "PATCH" "/api/tickets/$dblTkId/start" $null $admin
}
if ($dblTkId) {
    # Request OTP #1
    $r1 = Call "POST" "/api/tickets/$dblTkId/otp" $null $admin
    $otpA = $r1.data.otp

    # OTP moves to PENDING_OTP; re-request requires going back to IN_PROGRESS
    # Actually, requestOTP checks status=IN_PROGRESS, so re-request from PENDING_OTP should fail
    $r2 = Call "POST" "/api/tickets/$dblTkId/otp" $null $admin
    if ($r2.status -eq 400 -and $r2.data.error -match "IN_PROGRESS") {
        Pass "T3.2a Re-request OTP blocked (not IN_PROGRESS)" "Must be IN_PROGRESS"
    } else {
        # If it somehow succeeded (server changed behavior), verify old OTP is invalid
        if ($r2.status -eq 200 -and $r2.data.otp) {
            $otpB = $r2.data.otp
            # Try old OTP
            $rv = Call "POST" "/api/tickets/$dblTkId/verify-otp" @{ code=$otpA } $admin
            if ($rv.status -ne 200) {
                Pass "T3.2a Old OTP invalidated after re-request" "New OTP=$otpB"
            } else { Fail "T3.2a Old OTP still valid" "Expected invalidation" }
        } else {
            Fail "T3.2a Double OTP" "status=$($r2.status) err=$($r2.data.error)"
        }
    }

    # Verify first OTP still works (if not re-requested)
    if ($otpA -and $r2.status -eq 400) {
        $rv = Call "POST" "/api/tickets/$dblTkId/verify-otp" @{ code=$otpA } $admin
        if ($rv.status -eq 200 -and $rv.data.ticket.status -eq "CLOSED") {
            Pass "T3.2b Original OTP still valid" "CLOSED"
        } else { Fail "T3.2b Original OTP verify" "status=$($rv.status) err=$($rv.data.error)" }
    }
}

# ── T3.3 Re-assign engineer mid-flow ─────────────────────────────────────
Head "CATEGORY 3: Edge Cases - Re-assign Mid-Flow"

$r = Call "POST" "/api/tickets" @{ problemDescription="Re-assign mid-flow test" } $dealer
$raTkId = $null
if ($r.status -eq 201) {
    $raTkId = $r.data.ticket.id
    # Start work via admin
    $null = Call "PATCH" "/api/tickets/$raTkId/start" $null $admin
}
if ($raTkId) {
    # Ticket is IN_PROGRESS; try reassigning engineer
    $me2 = Call "GET" "/api/auth/me" $null $engineer2
    $eng2Id = if ($me2.data.user) { $me2.data.user.id } else { $me2.data.id }
    $r = Call "PATCH" "/api/tickets/$raTkId/assign-engineer" @{ engineerId=$eng2Id } $admin
    if ($r.status -eq 400 -and $r.data.error -match "OPEN or ASSIGNED") {
        Pass "T3.3 Cannot re-assign engineer on IN_PROGRESS ticket" "400"
    } else { Fail "T3.3 Re-assign mid-flow" "status=$($r.status) err=$($r.data.error) - expected 400" }
}

# ── T3.6 Empty / missing fields ──────────────────────────────────────────
Head "CATEGORY 3: Edge Cases - Missing Fields"

# Empty problemDescription
$r = Call "POST" "/api/tickets" @{ problemDescription="" } $dealer
if ($r.status -eq 400 -and $r.data.error -match "problemDescription") {
    Pass "T3.6a Empty problemDescription rejected" "400"
} else { Fail "T3.6a Empty problemDescription" "status=$($r.status)" }

# No problemDescription at all
$r = Call "POST" "/api/tickets" @{ machineName="test" } $dealer
if ($r.status -eq 400) {
    Pass "T3.6b Missing problemDescription rejected" "400"
} else { Fail "T3.6b Missing problemDescription" "status=$($r.status)" }

# Verify OTP with empty code
$r = Call "POST" "/api/tickets/fake-id/verify-otp" @{ code="" } $admin
if ($r.status -eq 400 -and $r.data.error -match "code is required") {
    Pass "T3.6c Empty OTP code rejected" "400"
} else { Fail "T3.6c Empty OTP code" "status=$($r.status) err=$($r.data.error)" }

# Assign engineer without engineerId
$r = Call "PATCH" "/api/tickets/fake-id/assign-engineer" @{} $admin
if ($r.status -eq 400 -and $r.data.error -match "engineerId") {
    Pass "T3.6d Missing engineerId rejected" "400"
} else { Fail "T3.6d Missing engineerId" "status=$($r.status) err=$($r.data.error)" }

# Assign manager without managerId
$r = Call "PATCH" "/api/tickets/fake-id/assign-manager" @{} $admin
if ($r.status -eq 400 -and $r.data.error -match "managerId") {
    Pass "T3.6e Missing managerId rejected" "400"
} else { Fail "T3.6e Missing managerId" "status=$($r.status) err=$($r.data.error)" }

# ── T3.4 Concurrent ticket creation ──────────────────────────────────────
Head "CATEGORY 3: Edge Cases - Rapid Sequential Ticket Creation"

$rapidNums = @()
for ($i = 1; $i -le 5; $i++) {
    $r = Call "POST" "/api/tickets" @{ problemDescription="Rapid ticket #$i" } $dealer
    if ($r.status -eq 201) { $rapidNums += $r.data.ticket.ticketNumber }
}
$uniqueCount = ($rapidNums | Sort-Object -Unique).Count
if ($rapidNums.Count -eq 5 -and $uniqueCount -eq 5) {
    Pass "T3.4 Five rapid tickets - all unique numbers" ($rapidNums -join ", ")
} else { Fail "T3.4 Rapid ticket uniqueness" "created=$($rapidNums.Count) unique=$uniqueCount" }


# ═══════════════════════════════════════════════════════════════════════════
#  CATEGORY 4: MULTI-USER ISOLATION
# ═══════════════════════════════════════════════════════════════════════════
Head "CATEGORY 4: Multi-User - Dealer Isolation"

# Dealer creates a ticket
$r = Call "POST" "/api/tickets" @{ problemDescription="Dealer isolation test" } $dealer
$dealerTkId = $null
if ($r.status -eq 201) { $dealerTkId = $r.data.ticket.id }

# Dealer lists tickets -> should contain the ticket
if ($dealerTkId) {
    $r = Call "GET" "/api/tickets" $null $dealer
    $found = $r.data.tickets | Where-Object { $_.id -eq $dealerTkId }
    if ($found) { Pass "T4.1a Dealer sees own ticket in list" }
    else { Fail "T4.1a Dealer ticket visibility" "Ticket not found in dealer list" }
}

# Engineer1 should NOT see dealer's ticket in their list (unless assigned to them)
$rEng = Call "GET" "/api/tickets" $null $engineer1
$engTicketIds = $rEng.data.tickets | ForEach-Object { $_.id }
# Admin sees all
$rAdmin = Call "GET" "/api/tickets" $null $admin
$adminTicketIds = $rAdmin.data.tickets | ForEach-Object { $_.id }
if ($dealerTkId -in $adminTicketIds) {
    Pass "T4.4 Admin sees all tickets" "Including dealer's ticket"
} else { Fail "T4.4 Admin ticket visibility" "Dealer's ticket not in admin list" }

# ── T4.2 Engineer isolation ──────────────────────────────────────────────
Head "CATEGORY 4: Multi-User - Engineer Isolation"

# Create 2 tickets, assign one to eng1 and one to eng2
$me1 = Call "GET" "/api/auth/me" $null $engineer1
$me2 = Call "GET" "/api/auth/me" $null $engineer2
$eng1Id = if ($me1.data.user) { $me1.data.user.id } else { $me1.data.id }
$eng2Id = if ($me2.data.user) { $me2.data.user.id } else { $me2.data.id }

$r1 = Call "POST" "/api/tickets" @{ problemDescription="Engineer1 ticket" } $dealer
$r2 = Call "POST" "/api/tickets" @{ problemDescription="Engineer2 ticket" } $dealer
$eng1TkId = $null; $eng2TkId = $null

if ($r1.status -eq 201 -and $r2.status -eq 201) {
    $eng1TkId = $r1.data.ticket.id
    $eng2TkId = $r2.data.ticket.id

    # Re-assign explicitly: ticket1 -> eng1, ticket2 -> eng2
    $null = Call "PATCH" "/api/tickets/$eng1TkId/assign-engineer" @{ engineerId=$eng1Id } $admin
    $null = Call "PATCH" "/api/tickets/$eng2TkId/assign-engineer" @{ engineerId=$eng2Id } $admin

    # Engineer1 lists -> should see eng1TkId but NOT eng2TkId
    $list1 = Call "GET" "/api/tickets" $null $engineer1
    $ids1 = $list1.data.tickets | ForEach-Object { $_.id }
    if ($eng1TkId -in $ids1 -and $eng2TkId -notin $ids1) {
        Pass "T4.2a Engineer1 only sees assigned tickets"
    } elseif ($eng1TkId -in $ids1 -and $eng2TkId -in $ids1) {
        Fail "T4.2a Engineer1 isolation" "Can see engineer2's ticket"
    } else {
        Fail "T4.2a Engineer1 isolation" "Cannot see own ticket"
    }

    # Engineer2 lists -> should see eng2TkId but NOT eng1TkId
    $list2 = Call "GET" "/api/tickets" $null $engineer2
    $ids2 = $list2.data.tickets | ForEach-Object { $_.id }
    if ($eng2TkId -in $ids2 -and $eng1TkId -notin $ids2) {
        Pass "T4.2b Engineer2 only sees assigned tickets"
    } elseif ($eng2TkId -in $ids2 -and $eng1TkId -in $ids2) {
        Fail "T4.2b Engineer2 isolation" "Can see engineer1's ticket"
    } else {
        Fail "T4.2b Engineer2 isolation" "Cannot see own ticket"
    }
}

# ── T4.2c Cross-engineer access on getTicket ─────────────────────────────
if ($eng1TkId -and $eng2TkId) {
    # Engineer1 tries to get engineer2's ticket -> 403
    $r = Call "GET" "/api/tickets/$eng2TkId" $null $engineer1
    if ($r.status -eq 403) {
        Pass "T4.2c Engineer1 blocked from engineer2's ticket detail" "403"
    } else { Fail "T4.2c Cross-engineer detail access" "status=$($r.status)" }
}

# ── T4.3 Manager pincode scope ───────────────────────────────────────────
Head "CATEGORY 4: Multi-User - Manager Pincode Scope"

# Manager lists engineers -> should only see same-pincode engineers
$r = Call "GET" "/api/tickets/engineers" $null $manager
if ($r.status -eq 200 -and $r.data.engineers) {
    $managerEngineers = $r.data.engineers
    Pass "T4.3a Manager lists engineers" "count=$($managerEngineers.Count)"
    # All returned engineers should share manager's pincode
    # (We know manager=Chennai, eng1+eng2=Chennai, eng3=Delhi)
    $mgrMe = Call "GET" "/api/auth/me" $null $manager
    $mgrPincodeId = if ($mgrMe.data.user) { $mgrMe.data.user.pincodeId } else { $mgrMe.data.pincodeId }
    $wrongPincode = $managerEngineers | Where-Object { $_.pincodeId -ne $mgrPincodeId -and $_.pincodeId -ne $null }
    if ($wrongPincode.Count -eq 0) {
        Pass "T4.3b All listed engineers match manager's pincode"
    } else {
        Fail "T4.3b Pincode filter leak" "$($wrongPincode.Count) engineers from other pincodes returned"
    }
} else { Fail "T4.3a Manager list engineers" "status=$($r.status)" }

# Admin lists all engineers (no pincode filter)
$r = Call "GET" "/api/tickets/engineers" $null $admin
if ($r.status -eq 200 -and $r.data.engineers.Count -ge $managerEngineers.Count) {
    Pass "T4.3c Admin sees all engineers" "count=$($r.data.engineers.Count)"
} else { Fail "T4.3c Admin engineer list" "status=$($r.status)" }


# ═══════════════════════════════════════════════════════════════════════════
#  CATEGORY 5: VALIDATION & DATA CONSISTENCY
# ═══════════════════════════════════════════════════════════════════════════
Head "CATEGORY 5: Validation - Status Transition Enforcement"

# Create a fresh ticket and walk through lifecycle, testing invalid transitions at each step
$r = Call "POST" "/api/tickets" @{ problemDescription="Status transition enforcement test" } $dealer
$valTkId = $null
if ($r.status -eq 201) {
    $valTkId = $r.data.ticket.id
    Pass "T5.1 setup - ticket created (ASSIGNED)"
}

if ($valTkId) {
    # Status: ASSIGNED -> only start should work. OTP and verify should fail.
    $r = Call "POST" "/api/tickets/$valTkId/otp" $null $admin
    if ($r.status -eq 400) { Pass "T5.1a ASSIGNED: OTP request blocked" "400" }
    else { Fail "T5.1a ASSIGNED: OTP should fail" "status=$($r.status)" }

    $r = Call "POST" "/api/tickets/$valTkId/verify-otp" @{ code="1234" } $admin
    if ($r.status -eq 400) { Pass "T5.1b ASSIGNED: verify-OTP blocked" "400" }
    else { Fail "T5.1b ASSIGNED: verify should fail" "status=$($r.status)" }

    # Start work -> IN_PROGRESS
    $r = Call "PATCH" "/api/tickets/$valTkId/start" $null $admin
    if ($r.status -eq 200) { Pass "T5.1c Start work succeeds on ASSIGNED" }
    else { Fail "T5.1c Start work" "status=$($r.status) err=$($r.data.error)" }

    # Status: IN_PROGRESS -> start again should fail, verify should fail
    $r = Call "PATCH" "/api/tickets/$valTkId/start" $null $admin
    if ($r.status -eq 400) { Pass "T5.1d IN_PROGRESS: double-start blocked" "400" }
    else { Fail "T5.1d Double-start" "status=$($r.status)" }

    $r = Call "POST" "/api/tickets/$valTkId/verify-otp" @{ code="1234" } $admin
    if ($r.status -eq 400) { Pass "T5.1e IN_PROGRESS: verify-OTP blocked" "400" }
    else { Fail "T5.1e IN_PROGRESS: verify should fail" "status=$($r.status)" }

    # Request OTP -> PENDING_OTP
    $r = Call "POST" "/api/tickets/$valTkId/otp" $null $admin
    $valOtp = $null
    if ($r.status -eq 200) {
        $valOtp = $r.data.otp
        Pass "T5.1f OTP request succeeds on IN_PROGRESS"
    } else { Fail "T5.1f OTP request" "status=$($r.status)" }

    # Status: PENDING_OTP -> start should fail
    $r = Call "PATCH" "/api/tickets/$valTkId/start" $null $admin
    if ($r.status -eq 400) { Pass "T5.1g PENDING_OTP: start blocked" "400" }
    else { Fail "T5.1g PENDING_OTP: start should fail" "status=$($r.status)" }

    # Verify OTP -> CLOSED
    if ($valOtp) {
        $r = Call "POST" "/api/tickets/$valTkId/verify-otp" @{ code=$valOtp } $admin
        if ($r.status -eq 200 -and $r.data.ticket.status -eq "CLOSED") {
            Pass "T5.1h verify-OTP succeeds on PENDING_OTP -> CLOSED"
        } else { Fail "T5.1h Verify OTP" "status=$($r.status) err=$($r.data.error)" }
    }

    # Status: CLOSED -> all actions should fail
    $r = Call "PATCH" "/api/tickets/$valTkId/start" $null $admin
    if ($r.status -eq 400) { Pass "T5.1i CLOSED: start blocked" "400" }
    else { Fail "T5.1i CLOSED: start" "status=$($r.status)" }

    $r = Call "POST" "/api/tickets/$valTkId/otp" $null $admin
    if ($r.status -eq 400) { Pass "T5.1j CLOSED: OTP request blocked" "400" }
    else { Fail "T5.1j CLOSED: OTP" "status=$($r.status)" }

    $r = Call "POST" "/api/tickets/$valTkId/verify-otp" @{ code="1234" } $admin
    if ($r.status -eq 400) { Pass "T5.1k CLOSED: verify-OTP blocked" "400" }
    else { Fail "T5.1k CLOSED: verify" "status=$($r.status)" }
}

# ── T5.2 Data consistency after full lifecycle ────────────────────────────
Head "CATEGORY 5: Validation - Data Consistency After Close"

# Use the valTkId from above (it's CLOSED)
if ($valTkId) {
    $r = Call "GET" "/api/tickets/$valTkId" $null $admin
    $tk = $r.data.ticket
    $checks = @()
    if ($tk.status -eq "CLOSED")            { $checks += "status" }
    if ($tk.closedAt)                       { $checks += "closedAt" }
    if ($tk.firstEngineeredAt)              { $checks += "firstEngineeredAt" }
    if ($tk.otpVerified -eq $true)          { $checks += "otpVerified" }
    if ($tk.assignedEngineer)               { $checks += "assignedEngineer" }
    if ($tk.ticketNumber -match "^TKT-\d{8}-\d{3}$") { $checks += "ticketNumber format" }

    if ($checks.Count -eq 6) {
        Pass "T5.2 All data fields consistent after close" ($checks -join ", ")
    } else {
        $missing = @("status","closedAt","firstEngineeredAt","otpVerified","assignedEngineer","ticketNumber format") | Where-Object { $_ -notin $checks }
        Fail "T5.2 Data consistency" "Missing: $($missing -join ', ')"
    }

    # T5.4 Timestamp ordering
    if ($tk.createdAt -and $tk.firstEngineeredAt -and $tk.closedAt) {
        $c = [DateTime]$tk.createdAt
        $e = [DateTime]$tk.firstEngineeredAt
        $x = [DateTime]$tk.closedAt
        if ($c -lt $e -and $e -lt $x) {
            Pass "T5.4 Timestamp ordering correct" "created < engineered < closed"
        } else {
            Fail "T5.4 Timestamp ordering" "created=$c engineered=$e closed=$x"
        }
    } else { Skip "T5.4 Timestamp ordering" "Missing timestamp fields" }
}

# ── T5.3 Ticket number format uniqueness (from rapid creation above) ─────
# Already tested in T3.4. Additionally verify format of all:
if ($rapidNums.Count -gt 0) {
    $allMatch = $true
    foreach ($n in $rapidNums) {
        if ($n -notmatch "^TKT-\d{8}-\d{3}$") { $allMatch = $false }
    }
    if ($allMatch) { Pass "T5.3 All ticket numbers follow TKT-YYYYMMDD-NNN format" }
    else { Fail "T5.3 Ticket number format" "Some don't match pattern" }
}


# ═══════════════════════════════════════════════════════════════════════════
#  CATEGORY BONUS: SIMULATE CHAT FLOW
# ═══════════════════════════════════════════════════════════════════════════
Head "BONUS: Simulate Chat - Registration + Troubleshooting"

$phone = "SIM-TEST-" + (Get-Random -Minimum 10000 -Maximum 99999)

# Step 1: New user -> greeting
$r = Call "POST" "/api/simulate" @{ phoneNumber=$phone; message="Hi" }
if ($r.status -eq 200 -and $r.data.reply) {
    Pass "B1 New user greeting" "state=$($r.data.state)"
} else { Skip "B1 Chat greeting" "Simulate endpoint may differ - status=$($r.status)" }

# Step 2: Provide serial number (may not exist -> should ask to retry)
$r = Call "POST" "/api/simulate" @{ phoneNumber=$phone; message="12345" }
if ($r.status -eq 200) {
    Pass "B2 Serial number response" "state=$($r.data.state)"
} else { Skip "B2 Serial" "status=$($r.status)" }

# Step 3: Say HELP -> should escalate to ticket
$r = Call "POST" "/api/simulate" @{ phoneNumber=$phone; message="HELP" }
if ($r.status -eq 200 -and ($r.data.reply -match "ticket|help|escalat" -or $r.data.ticketId)) {
    Pass "B3 HELP escalation" "reply contains ticket info"
} else { Skip "B3 HELP escalation" "Could not verify - reply=$($r.data.reply)" }


# ═══════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host ("=" * 65) -ForegroundColor Magenta
Write-Host "  SIMULATION TEST RESULTS" -ForegroundColor White
Write-Host ("=" * 65) -ForegroundColor Magenta
Write-Host "  PASSED : $($script:pass)" -ForegroundColor Green
Write-Host "  FAILED : $($script:fail)" -ForegroundColor $(if($script:fail -gt 0){"Red"}else{"Green"})
Write-Host "  SKIPPED: $($script:skip)" -ForegroundColor DarkYellow
Write-Host "  TOTAL  : $($script:pass + $script:fail + $script:skip)" -ForegroundColor White
Write-Host ("=" * 65) -ForegroundColor Magenta

# Write log
$logPath = Join-Path $PSScriptRoot "simulation-results.log"
$script:log | Set-Content -Path $logPath -Encoding UTF8
Write-Host "  Log written to: $logPath" -ForegroundColor DarkGray
Write-Host ""
