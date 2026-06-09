# E2E: create ticket → assign → start → OTP → close, verify each public stage endpoint
param([string]$Base = "https://poornasree.pydart.com")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$phone = "91$($stamp.Substring($stamp.Length - 10))"
$results = @()

function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }

function Login($email, $password) {
    $body = (@{ email = $email; password = $password } | ConvertTo-Json)
    $s = $null
    Invoke-WebRequest -Method POST -Uri "$Base/api/auth/login" `
        -ContentType "application/json" -Body $body -SessionVariable s -UseBasicParsing | Out-Null
    return $s
}

function Api($method, $path, $body, $sess) {
    $p = @{ Method = $method; Uri = "$Base$path"; ContentType = "application/json"; UseBasicParsing = $true }
    if ($body) { $p.Body = ($body | ConvertTo-Json -Depth 10) }
    if ($sess) { $p.WebSession = $sess }
    try {
        $r = Invoke-WebRequest @p
        return ($r.Content | ConvertFrom-Json)
    } catch {
        $err = $_.ErrorDetails.Message
        if ($err) { return ($err | ConvertFrom-Json) }
        throw
    }
}

function PublicGet($stage, $ticketId, $ticketNumber, $fetchSingle = $true) {
    $listUrl = "$Base/api/public/tickets/stage/$stage"
    if ($ticketNumber) { $listUrl += "?ticketNumber=$([uri]::EscapeDataString($ticketNumber))" }
    $list = Invoke-RestMethod -Uri $listUrl -Method Get
    $one = $null
    if ($fetchSingle) {
        try {
            $one = Invoke-RestMethod -Uri "$Base/api/public/tickets/stage/$stage/$ticketId" -Method Get
        } catch {
            $one = @{ success = $false; data = $null }
        }
    }
    return @{ list = $list; one = $one }
}

function Assert-Stage($name, $stage, $ticketId, $ticketNumber, $expectInList) {
    $pub = PublicGet $stage $ticketId $ticketNumber ($expectInList)
    $inList = @($pub.list.data | Where-Object { $_.id -eq $ticketId }).Count -gt 0
    if ($expectInList) {
        $oneOk = ($pub.one.success -eq $true) -and ($pub.one.data.id -eq $ticketId)
        $ok    = $inList -and $oneOk
    } else {
        $oneOk = $true
        $ok    = -not $inList
    }
    $script:results += [pscustomobject]@{
        Step = $name; Stage = $stage; InList = $inList; SingleGet = $oneOk; Expected = $expectInList; Pass = $ok
    }
    if ($ok) { Log "  [PASS] GET /stage/$stage (list + /:id)" "Green" }
    else { Log "  [FAIL] GET /stage/$stage - inList=$inList oneOk=$oneOk expected=$expectInList" "Red" }
    if ($expectInList -and $pub.one.data.customer) {
        $c = $pub.one.data.customer
        Log "         name=$($c.name) phone=$($c.phone) pincode=$($c.pincode) complaint=$($pub.one.data.complaint.problemDescription.Substring(0,[Math]::Min(50,$pub.one.data.complaint.problemDescription.Length)))..." "DarkGray"
    }
}

function Get-OtpFromServer($ticketId) {
    $out = ssh -o ConnectTimeout=30 poornasree "bash /root/poornasree-ai/api/scripts/get-test-otp.sh $ticketId" 2>&1
    return ($out | Out-String).Trim()
}

Log "`n========================================" "Cyan"
Log "  Stage API E2E - $Base" "Cyan"
Log "========================================`n" "Cyan"

Log "[1] Login (dealer, manager, engineer, admin)" "Yellow"
$dealerSess   = Login "dealer@poornasree.com" "Dealer@1234"
$managerSess  = Login "manager@poornasree.com" "Manager@1234"
$engineerSess = Login "engineer1@poornasree.com" "Engineer@1234"
$adminSess    = Login "admin@poornasree.com" "Admin@1234"
$engId = (Api GET "/api/auth/me" $null $engineerSess).user.id

Log "`n[2] POST /api/tickets - create with customer fields" "Yellow"
$created = Api POST "/api/tickets" @{
    problemDescription    = "E2E stage test $stamp"
    machineName           = "PSR-E2E"
    machineSerialNumber   = "E2E-$stamp"
    phoneNumber           = $phone
    customerAddress       = "12 Test Road, Kochi"
    place                 = "Kochi"
    district              = "Ernakulam"
    state                 = "Kerala"
} $dealerSess
if (-not $created.ticket.id) { throw "Create failed: $($created | ConvertTo-Json -Compress)" }
$tid = $created.ticket.id
$tn  = $created.ticket.ticketNumber
Log "  Created $tn -> OPEN" "Green"
Start-Sleep -Seconds 2
Assert-Stage "Step 2" "created" $tid $tn $true
Assert-Stage "Step 2b" "assigned" $tid $tn $false

Log "`n[3] PATCH assign-engineer" "Yellow"
$asg = Api PATCH "/api/tickets/$tid/assign-engineer" @{ engineerId = $engId } $adminSess
if (-not $asg.ticket) {
    $detail = Api GET "/api/tickets/$tid" $null $adminSess
    if ($detail.ticket.status -eq "ASSIGNED") {
        Log "  Already ASSIGNED" "DarkGray"
    } else {
        throw "Assign failed: $($asg | ConvertTo-Json -Compress)"
    }
} elseif ($asg.ticket.status -ne "ASSIGNED") {
    throw "Assign failed: $($asg | ConvertTo-Json -Compress)"
}
Log "  -> ASSIGNED" "Green"
Start-Sleep -Seconds 2
Assert-Stage "Step 3" "assigned" $tid $tn $true
Assert-Stage "Step 3b" "created" $tid $tn $false

Log "`n[4] PATCH start" "Yellow"
$st = Api PATCH "/api/tickets/$tid/start" $null $engineerSess
if ($st.ticket.status -ne "IN_PROGRESS") { throw "Start failed" }
Log "  -> IN_PROGRESS" "Green"
Start-Sleep -Seconds 2
Assert-Stage "Step 4" "in-progress" $tid $tn $true
Assert-Stage "Step 4b" "assigned" $tid $tn $false

Log "`n[5] POST otp" "Yellow"
$null = Api POST "/api/tickets/$tid/otp" $null $engineerSess
Log "  -> PENDING_OTP (OTP sent via WhatsApp)" "Green"
Start-Sleep -Seconds 2
Assert-Stage "Step 5" "pending-otp" $tid $tn $true
Assert-Stage "Step 5b" "in-progress" $tid $tn $false

Log "`n[6] POST verify-otp (OTP resolve via server ~30-90s)" "Yellow"
$otpCode = Get-OtpFromServer $tid
if ($otpCode -notmatch '^\d{4}$') { throw "Could not resolve OTP on server for test ticket" }
Log "  Using OTP **** (resolved on server for automated test)" "DarkGray"
$ver = Api POST "/api/tickets/$tid/verify-otp" @{ code = $otpCode } $engineerSess
if ($ver.ticket.status -ne "CLOSED") { throw "Verify failed: $($ver | ConvertTo-Json -Compress)" }
Log "  -> CLOSED" "Green"
Start-Sleep -Seconds 2
Assert-Stage "Step 6" "closed" $tid $tn $true
Assert-Stage "Step 6b" "pending-otp" $tid $tn $false

Log "`n[7] All stage URLs respond success=true" "Yellow"
foreach ($s in @("created","assigned","in-progress","pending-otp","closed")) {
    $r = Invoke-RestMethod -Uri "$Base/api/public/tickets/stage/$s`?limit=1"
    if ($r.success) { Log "  [PASS] /stage/$s" "Green" } else { Log "  [FAIL] /stage/$s" "Red" }
}

Log "`nTicket: $tn`n" "Cyan"
$results | Format-Table -AutoSize
$bad = @($results | Where-Object { -not $_.Pass }).Count
if ($bad -gt 0) { exit 1 }
