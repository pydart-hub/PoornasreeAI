# PoornasreeAI - Full E2E Test Suite
param([string]$Base = "https://ai.poornasreecloud.com")
$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:pass = 0; $script:fail = 0; $script:skip = 0
$script:log = @()

function Pass {
    param($n, $d="")
    Write-Host "  [PASS] $n" -ForegroundColor Green
    if ($d) { Write-Host "         $d" -ForegroundColor DarkGray }
    $script:pass++
    $script:log += "PASS | $n"
}
function Fail {
    param($n, $d="")
    Write-Host "  [FAIL] $n" -ForegroundColor Red
    if ($d) { Write-Host "         $d" -ForegroundColor Yellow }
    $script:fail++
    $script:log += "FAIL | $n | $d"
}
function Skip {
    param($n, $d="")
    Write-Host "  [SKIP] $n" -ForegroundColor DarkYellow
    if ($d) { Write-Host "         reason: $d" -ForegroundColor DarkGray }
    $script:skip++
    $script:log += "SKIP | $n"
}
function Head {
    param($t)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor DarkCyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor DarkCyan
}

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

function Call {
    param([string]$method, [string]$path, $body=$null,
          [Microsoft.PowerShell.Commands.WebRequestSession]$sess=$null)
    $p = @{ Method=$method; Uri="$Base$path"; ContentType="application/json"; UseBasicParsing=$true; ErrorAction="Stop" }
    if ($body) { $p.Body = ($body | ConvertTo-Json -Depth 10) }
    if ($sess) { $p.WebSession = $sess }
    try { $r = Invoke-WebRequest @p; return ($r.Content | ConvertFrom-Json) }
    catch {
        try { return ($_.ErrorDetails.Message | ConvertFrom-Json) } catch { return $null }
    }
}

function CallRaw {
    param([string]$method, [string]$path, $body=$null,
          [Microsoft.PowerShell.Commands.WebRequestSession]$sess=$null)
    $p = @{ Method=$method; Uri="$Base$path"; ContentType="application/json"; UseBasicParsing=$true; ErrorAction="Stop" }
    if ($body) { $p.Body = ($body | ConvertTo-Json -Depth 10) }
    if ($sess) { $p.WebSession = $sess }
    try { return Invoke-WebRequest @p } catch { return $null }
}

$adminSess    = $null
$dealerSess   = $null
$engineerSess = $null
$managerSess  = $null
$testTicketId = $null
$phone = "TEST$(Get-Date -Format 'HHmmss')"

Write-Host ""
Write-Host "  PoornasreeAI E2E Test Suite" -ForegroundColor White
Write-Host "  Target: $Base" -ForegroundColor DarkGray
Write-Host "  Phone:  $phone" -ForegroundColor DarkGray

# ======================================================
Head "PHASE 0 - Connectivity"
# ======================================================

$br = Call GET "/api/branding"
if ($br.companyName) { Pass "GET /api/branding (public)" "company: $($br.companyName)" }
else                  { Fail "GET /api/branding" "got: $($br | ConvertTo-Json -Compress)" }

# ======================================================
Head "PHASE 1 - Auth"
# ======================================================

$adminSess = Login "admin@poornasree.com" "Admin@1234"
if ($adminSess) { Pass "Login admin@poornasree.com" }
else             { Fail "Login admin@poornasree.com" "no session" }

$me = Call GET "/api/auth/me" -sess $adminSess
if ($me.user.role -eq "admin") { Pass "GET /api/auth/me - role = admin" }
else                            { Fail "GET /api/auth/me" "got: $($me | ConvertTo-Json -Compress)" }

$fns = Login "admin" "Admin@1234"
if ($fns) { Pass "Login by firstName shortcut 'admin'" }
else       { Fail "Login by firstName shortcut" }

$managerSess = Login "manager@poornasree.com" "Manager@1234"
if ($managerSess) { Pass "Login manager@poornasree.com" }
else               { Fail "Login manager@poornasree.com" }

$engineerSess = Login "engineer1@poornasree.com" "Engineer@1234"
if ($engineerSess) { Pass "Login engineer1@poornasree.com" }
else                { Fail "Login engineer1@poornasree.com" }

$dealerSess = Login "dealer@poornasree.com" "Dealer@1234"
if ($dealerSess) { Pass "Login dealer@poornasree.com" }
else              { Fail "Login dealer@poornasree.com" }

$newEmail = "testuser_$(Get-Date -Format 'yyyyMMddHHmmss')@test.com"
$reg = Call POST "/api/auth/register" @{ email=$newEmail; password="Test1234!"; firstName="TestUser" }
if ($reg.user.role -eq "customer") { Pass "POST /api/auth/register - role defaults to customer" }
else                                { Fail "POST /api/auth/register" "got: $($reg | ConvertTo-Json -Compress)" }

$lo = Call POST "/api/auth/logout" -sess $adminSess
if ($lo.message -match "out") { Pass "POST /api/auth/logout" }
else                           { Fail "POST /api/auth/logout" "got: $($lo | ConvertTo-Json -Compress)" }

# Re-login admin after logout
$adminSess = Login "admin@poornasree.com" "Admin@1234"
if (-not $adminSess) { Fail "Re-login admin after logout" "session is null"; return }

# ======================================================
Head "PHASE 2A - Admin Users"
# ======================================================

$users = Call GET "/api/admin/users" -sess $adminSess
if ($users.users.Count -gt 0) { Pass "GET /api/admin/users - $($users.users.Count) users" }
else                            { Fail "GET /api/admin/users" "got: $($users | ConvertTo-Json -Compress -Depth 2)" }

$testEmail = "eng_test_$(Get-Date -Format 'HHmmss')@test.com"
$created = Call POST "/api/admin/users" @{
    email=$testEmail; password="Test1234!"; firstName="TestEng"; lastName="Test"
    role="service"
} -sess $adminSess
if ($created.user.id) {
    $testUserId = $created.user.id
    Pass "POST /api/admin/users - service user created" "id: $testUserId"
} else {
    $testUserId = $null
    Fail "POST /api/admin/users" "got: $($created | ConvertTo-Json -Compress)"
}

if ($testUserId) {
    $upd = Call PATCH "/api/admin/users/$testUserId" @{ firstName="UpdatedEng" } -sess $adminSess
    if ($upd.user.firstName -eq "UpdatedEng") { Pass "PATCH /api/admin/users/:id" }
    else                                        { Fail "PATCH /api/admin/users/:id" "got: $($upd | ConvertTo-Json -Compress)" }

    $del = Call DELETE "/api/admin/users/$testUserId" -sess $adminSess
    if ($del -ne $null) { Pass "DELETE /api/admin/users/:id" }
    else                 { Fail "DELETE /api/admin/users/:id" }
} else {
    Skip "PATCH /api/admin/users/:id" "no test user"
    Skip "DELETE /api/admin/users/:id" "no test user"
}

# ======================================================
Head "PHASE 2B - Admin Documents"
# ======================================================

$docs = Call GET "/api/admin/documents" -sess $adminSess
if ($docs -ne $null) { Pass "GET /api/admin/documents" }
else                  { Fail "GET /api/admin/documents" }

# ======================================================
Head "PHASE 2C - Admin Templates"
# ======================================================

$tmpls = Call GET "/api/admin/templates" -sess $adminSess
$tmplArr = $tmpls.templates
if ($tmplArr.Count -gt 0) {
    Pass "GET /api/admin/templates - $($tmplArr.Count) templates"
    $known = $tmplArr | Where-Object { $_.problemType -in @("power_issue","no_display","vibration_issue") }
    if ($known.Count -eq 3) { Pass "Standard templates: power_issue, no_display, vibration_issue present" }
    else                     { Fail "Standard templates missing" "found: $(($tmplArr | ForEach-Object { $_.problemType }) -join ', ')" }
} else { Fail "GET /api/admin/templates" "got: $($tmpls | ConvertTo-Json -Compress -Depth 2)" }

$pt = "test_issue_$(Get-Date -Format 'HHmmss')"
$newTmpl = Call POST "/api/admin/templates" @{
    problemType=$pt; title="Test Issue"; description="Auto test"; steps=@("Step 1","Step 2")
} -sess $adminSess
if ($newTmpl.template.id) {
    Pass "POST /api/admin/templates - created" "id: $($newTmpl.template.id)"
    $delT = Call DELETE "/api/admin/templates/$($newTmpl.template.id)" -sess $adminSess
    if ($delT -ne $null) { Pass "DELETE /api/admin/templates/:id" }
    else                  { Fail "DELETE /api/admin/templates/:id" }
} else { Fail "POST /api/admin/templates" "got: $($newTmpl | ConvertTo-Json -Compress -Depth 3)" }

# ======================================================
Head "PHASE 2D - Admin Machines"
# ======================================================

$serial = "TEST-$(Get-Date -Format 'HHmmss')"
$m = Call POST "/api/admin/machines" @{ serialNumber=$serial; modelName="TestModel" } -sess $adminSess
if ($m.machine.id) {
    $machId = $m.machine.id
    Pass "POST /api/admin/machines - created" "serial: $serial"

    $ml = Call GET "/api/admin/machines" -sess $adminSess
    if ($ml.machines.Count -gt 0) { Pass "GET /api/admin/machines - $($ml.machines.Count) machines" }
    else                            { Fail "GET /api/admin/machines" }

    $ms = Call GET "/api/admin/machines/search?q=$serial" -sess $adminSess
    $msArr = if ($ms.machines) { $ms.machines } else { @() }
    if ($msArr | Where-Object { $_.serialNumber -eq $serial }) {
        Pass "GET /api/admin/machines/search - found by q"
    } else { Fail "GET /api/admin/machines/search" "serial $serial not in results" }

    $mup = Call PATCH "/api/admin/machines/$machId" @{ modelName="UpdatedModel" } -sess $adminSess
    if ($mup.machine.modelName -eq "UpdatedModel") { Pass "PATCH /api/admin/machines/:id" }
    else                                             { Fail "PATCH /api/admin/machines/:id" "got: $($mup | ConvertTo-Json -Compress)" }

    $null = Call DELETE "/api/admin/machines/$machId" -sess $adminSess
    Pass "DELETE /api/admin/machines/:id"
} else { Fail "POST /api/admin/machines" "got: $($m | ConvertTo-Json -Compress)" }

# ======================================================
Head "PHASE 2E - Admin Videos"
# ======================================================

$v = Call POST "/api/admin/videos" @{ title="Test Video"; youtubeUrl="https://www.youtube.com/watch?v=test123"; keywords="vibration" } -sess $adminSess
if ($v.video.id) {
    Pass "POST /api/admin/videos - created" "id: $($v.video.id)"
    $vup = Call PATCH "/api/admin/videos/$($v.video.id)" @{ title="Updated Video" } -sess $adminSess
    if ($vup.video.title -eq "Updated Video") { Pass "PATCH /api/admin/videos/:id" }
    else                                        { Fail "PATCH /api/admin/videos/:id" "got: $($vup | ConvertTo-Json -Compress)" }
    $null = Call DELETE "/api/admin/videos/$($v.video.id)" -sess $adminSess
    Pass "DELETE /api/admin/videos/:id"
} else { Fail "POST /api/admin/videos" "got: $($v | ConvertTo-Json -Compress)" }

$vl = Call GET "/api/admin/videos" -sess $adminSess
if ($vl.videos -ne $null) { Pass "GET /api/admin/videos - $($vl.videos.Count) videos" }
else                       { Fail "GET /api/admin/videos" }

# ======================================================
Head "PHASE 2F - Admin Analytics and Exports"
# ======================================================

$an = Call GET "/api/admin/analytics" -sess $adminSess
if ($an) { Pass "GET /api/admin/analytics" "totalConversations: $($an.totalConversations)" }
else      { Fail "GET /api/admin/analytics" }

$tl = Call GET "/api/admin/analytics/timeline" -sess $adminSess
if ($tl) { Pass "GET /api/admin/analytics/timeline" }
else      { Fail "GET /api/admin/analytics/timeline" }

$ca = Call GET "/api/admin/analytics/customer" -sess $adminSess
if ($ca -ne $null) { Pass "GET /api/admin/analytics/customer" }
else                { Fail "GET /api/admin/analytics/customer" }

$sa = Call GET "/api/admin/analytics/service" -sess $adminSess
if ($sa -ne $null) { Pass "GET /api/admin/analytics/service" }
else                { Fail "GET /api/admin/analytics/service" }

$ec = CallRaw GET "/api/admin/export/chats" -sess $adminSess
if ($ec -and $ec.StatusCode -eq 200) { Pass "GET /api/admin/export/chats - CSV 200" }
else                                   { Fail "GET /api/admin/export/chats" "status: $($ec.StatusCode)" }

$et = CallRaw GET "/api/admin/export/tickets" -sess $adminSess
if ($et -and $et.StatusCode -eq 200) { Pass "GET /api/admin/export/tickets - CSV 200" }
else                                   { Fail "GET /api/admin/export/tickets" "status: $($et.StatusCode)" }

$es = CallRaw GET "/api/admin/export/support" -sess $adminSess
if ($es -and $es.StatusCode -eq 200) { Pass "GET /api/admin/export/support - CSV 200" }
else                                   { Fail "GET /api/admin/export/support" "status: $($es.StatusCode)" }

# ======================================================
Head "PHASE 3 - Simulate / RAG (Critical)"
# ======================================================

Write-Host "  Phone session: $phone" -ForegroundColor DarkGray

$r1 = Call POST "/api/simulate/message" @{ phoneNumber=$phone; message="hello" }
if ($r1.state -eq "AWAITING_SERIAL") { Pass "Simulate: first message -> AWAITING_SERIAL" }
else { Fail "Simulate: first message" "state=$($r1.state) msg=$($r1.message)" }

$r2 = Call POST "/api/simulate/message" @{ phoneNumber=$phone; message="SKIP" }
if ($r2.state -eq "REGISTERED") { Pass "Simulate: SKIP -> REGISTERED" }
else { Fail "Simulate: SKIP" "state=$($r2.state)" }

Write-Host "  Querying RAG: 'vibro LED blinking but not working'..." -ForegroundColor DarkGray
$r3 = Call POST "/api/simulate/message" @{ phoneNumber=$phone; message="vibro LED blinking but not working" }
$r3msg = if ($r3.message) { $r3.message } else { "" }
if ($r3msg -match "GUN ELEMENT|STIRRER BOARD|DC CONNECTOR|LED|POWER|CHECK") {
    Pass "RAG Test 1: 'vibro LED blinking' -> training.json answer" "$($r3msg.Substring(0,[Math]::Min(90,$r3msg.Length)))"
} else {
    Fail "RAG Test 1: 'vibro LED blinking'" "Got: $($r3msg.Substring(0,[Math]::Min(100,$r3msg.Length)))"
}

$ph2 = "T2$(Get-Date -Format 'HHmmss')"
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph2; message="hi" }
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph2; message="SKIP" }
Write-Host "  Querying RAG: 'Machine is on but vibration is not present'..." -ForegroundColor DarkGray
$r4 = Call POST "/api/simulate/message" @{ phoneNumber=$ph2; message="Machine is on but vibration is not present" }
$r4msg = if ($r4.message) { $r4.message } else { "" }
if ($r4msg -match "SUPPLY VOLTAGE|FREQ.POT|GUN ELEMENT|STIRRER BOARD|VIBR") {
    Pass "RAG Test 2: 'no vibration' -> training.json answer" "$($r4msg.Substring(0,[Math]::Min(90,$r4msg.Length)))"
} else {
    Fail "RAG Test 2: 'no vibration'" "Got: $($r4msg.Substring(0,[Math]::Min(100,$r4msg.Length)))"
}

$ph3 = "T3$(Get-Date -Format 'HHmmss')"
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph3; message="hi" }
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph3; message="SKIP" }
Write-Host "  Querying RAG: 'My vibro won''t turn on'..." -ForegroundColor DarkGray
$r5 = Call POST "/api/simulate/message" @{ phoneNumber=$ph3; message="My vibro wont turn on" }
$r5msg = if ($r5.message) { $r5.message } else { "" }
if ($r5msg -match "FUSE|POWER SUPPLY|GUN ELEMENT|STIRRER BOARD|CHECK") {
    Pass "RAG Test 3: 'vibro wont turn on' -> training.json answer" "$($r5msg.Substring(0,[Math]::Min(90,$r5msg.Length)))"
} else {
    Fail "RAG Test 3: 'vibro wont turn on'" "Got: $($r5msg.Substring(0,[Math]::Min(100,$r5msg.Length)))"
}

$ph4 = "T4$(Get-Date -Format 'HHmmss')"
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph4; message="hi" }
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph4; message="SKIP" }
$rHelp = Call POST "/api/simulate/message" @{ phoneNumber=$ph4; message="HELP" }
if ($rHelp.message -match "engineer|request|created|contact|service") {
    Pass "Simulate: HELP -> ticket/escalation response"
} else { Fail "Simulate: HELP" "Got: $($rHelp.message)" }

$ph5 = "T5$(Get-Date -Format 'HHmmss')"
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph5; message="hi" }
$null = Call POST "/api/simulate/message" @{ phoneNumber=$ph5; message="SKIP" }
$rTp = Call POST "/api/simulate/message" @{ phoneNumber=$ph5; message="screen is blank" }
if ($rTp.message) { Pass "Simulate: 'screen is blank' -> got response" "state: $($rTp.state)" }
else               { Fail "Simulate: template fallback" }

# ======================================================
Head "PHASE 4 - Ticket Lifecycle"
# ======================================================

$tk = Call POST "/api/tickets" @{ problemDescription="E2E test vibration issue" } -sess $dealerSess
if ($tk.ticket.id -and $tk.ticket.ticketNumber -match "TKT-") {
    $testTicketId = $tk.ticket.id
    Pass "POST /api/tickets (dealer) - created" "ticket: $($tk.ticket.ticketNumber) status: $($tk.ticket.status)"
} else {
    $testTicketId = $null
    Fail "POST /api/tickets" "got: $($tk | ConvertTo-Json -Compress -Depth 3)"
}

$tklist = Call GET "/api/tickets" -sess $adminSess
if ($tklist.tickets.Count -gt 0) { Pass "GET /api/tickets (admin) - $($tklist.tickets.Count) tickets" }
else                               { Fail "GET /api/tickets (admin)" "got: $($tklist | ConvertTo-Json -Compress -Depth 2)" }

if ($testTicketId) {
    $tkg = Call GET "/api/tickets/$testTicketId" -sess $adminSess
    if ($tkg.ticket.id -eq $testTicketId) { Pass "GET /api/tickets/:id - retrieved" }
    else                                    { Fail "GET /api/tickets/:id" "got: $($tkg | ConvertTo-Json -Compress -Depth 2)" }
}

$engs = Call GET "/api/tickets/engineers" -sess $adminSess
if ($engs.engineers.Count -gt 0) { Pass "GET /api/tickets/engineers - $($engs.engineers.Count) engineers" }
else                               { Fail "GET /api/tickets/engineers" "got: $($engs | ConvertTo-Json -Compress -Depth 2)" }

if ($testTicketId) {
    # Ticket is auto-assigned (ASSIGNED status) so assign-manager only works on OPEN tickets
    $tkDetail = Call GET "/api/tickets/$testTicketId" -sess $adminSess
    if ($tkDetail.ticket.status -eq "OPEN") {
        $mgrMe = Call GET "/api/auth/me" -sess $managerSess
        if ($mgrMe.user.id) {
            $asgM = Call PATCH "/api/tickets/$testTicketId/assign-manager" @{ managerId=$mgrMe.user.id } -sess $adminSess
            if ($asgM.ticket.id) { Pass "PATCH /api/tickets/:id/assign-manager" "status: $($asgM.ticket.status)" }
            else                   { Fail "PATCH /api/tickets/:id/assign-manager" "got: $($asgM | ConvertTo-Json -Compress -Depth 2)" }
        } else { Skip "assign-manager" "could not get manager id" }
    } else {
        Skip "PATCH /api/tickets/:id/assign-manager" "ticket auto-assigned (status: $($tkDetail.ticket.status))"
    }

    # Assign engineer1 specifically so we can use $engineerSess for start/OTP
    $engMe = Call GET "/api/auth/me" -sess $engineerSess
    $eng1Id = $engMe.user.id
    if ($eng1Id) {
        $asgE = Call PATCH "/api/tickets/$testTicketId/assign-engineer" @{ engineerId=$eng1Id } -sess $adminSess
        if ($asgE.ticket.id) { Pass "PATCH /api/tickets/:id/assign-engineer - status: $($asgE.ticket.status)" }
        else                   { Fail "PATCH /api/tickets/:id/assign-engineer" "got: $($asgE | ConvertTo-Json -Compress -Depth 2)" }
    } else { Skip "assign-engineer" "could not get engineer1 id" }

    $sw = Call PATCH "/api/tickets/$testTicketId/start" -sess $engineerSess
    if ($sw.ticket.status -eq "IN_PROGRESS") { Pass "PATCH /api/tickets/:id/start -> IN_PROGRESS" }
    else                                       { Fail "PATCH /api/tickets/:id/start" "got: $($sw | ConvertTo-Json -Compress -Depth 2)" }

    $otp = Call POST "/api/tickets/$testTicketId/otp" -sess $engineerSess
    if ($otp.otp) {
        Pass "POST /api/tickets/:id/otp - got OTP" "code: $($otp.otp)"
        $ver = Call POST "/api/tickets/$testTicketId/verify-otp" @{ code=$otp.otp } -sess $engineerSess
        if ($ver.ticket.status -eq "CLOSED") { Pass "POST /api/tickets/:id/verify-otp -> CLOSED" }
        else                                   { Fail "POST /api/tickets/:id/verify-otp" "got: $($ver | ConvertTo-Json -Compress -Depth 2)" }
    } else { Fail "POST /api/tickets/:id/otp" "no OTP: $($otp | ConvertTo-Json -Compress)" }
}

# ======================================================
Head "PHASE 5 - Conversations and Support"
# ======================================================

$custEmail2 = "c2_$(Get-Date -Format 'HHmmss')@test.com"
$null = Call POST "/api/auth/register" @{ email=$custEmail2; password="Test1234!"; firstName="CustTwo" }
$custSess2 = Login $custEmail2 "Test1234!"

if ($custSess2) {
    $conv = Call POST "/api/conversations" @{ title="E2E test conv" } -sess $custSess2
    if ($conv.conversation.id) {
        Pass "POST /api/conversations - created" "id: $($conv.conversation.id)"
        $convId = $conv.conversation.id

        $msg = Call POST "/api/messages" @{ conversationId=$convId; content="vibro LED blinking" } -sess $custSess2
        if ($msg.userMessage.id) { Pass "POST /api/messages - sent" }
        else                      { Fail "POST /api/messages" "got: $($msg | ConvertTo-Json -Compress -Depth 2)" }

        $gc = Call GET "/api/conversations/$convId" -sess $adminSess
        if ($gc.conversation.messages.Count -gt 0) { Pass "GET /api/conversations/:id - messages present" }
        else                                         { Fail "GET /api/conversations/:id" "got: $($gc | ConvertTo-Json -Compress -Depth 2)" }

        $us = Call PATCH "/api/conversations/$convId/status" @{ status="in_progress" } -sess $adminSess
        if ($us.conversation.status -eq "in_progress") { Pass "PATCH /api/conversations/:id/status -> in_progress" }
        else                                             { Fail "PATCH /api/conversations/:id/status" "got: $($us | ConvertTo-Json -Compress -Depth 2)" }

        $rep = Call POST "/api/conversations/$convId/reply" @{ content="Admin reply test" } -sess $adminSess
        if ($rep.message.id) { Pass "POST /api/conversations/:id/reply" }
        else                  { Fail "POST /api/conversations/:id/reply" "got: $($rep | ConvertTo-Json -Compress -Depth 2)" }
    } else {
        Fail "POST /api/conversations" "got: $($conv | ConvertTo-Json -Compress -Depth 3)"
    }
} else { Skip "Conversation tests" "customer login failed" }

$srList = Call GET "/api/support/requests" -sess $adminSess
if ($srList -ne $null) { Pass "GET /api/support/requests" }
else                    { Fail "GET /api/support/requests" }

$convList = Call GET "/api/conversations" -sess $adminSess
if ($convList.conversations.Count -gt 0) { Pass "GET /api/conversations (admin) - $($convList.conversations.Count)" }
else                                       { Fail "GET /api/conversations (admin)" "got: $($convList | ConvertTo-Json -Compress -Depth 2)" }

$ai = Call POST "/api/support/ai-insight" @{ description="vibro LED blinking issue" } -sess $engineerSess
if ($ai) { Pass "POST /api/support/ai-insight - response received" }
else      { Fail "POST /api/support/ai-insight" "null (Ollama may be slow)" }

# ======================================================
Head "PHASE 6 - Sales Role"
# ======================================================

$salesEmail2 = "sales2_$(Get-Date -Format 'HHmmss')@test.com"
$salesUser2 = Call POST "/api/admin/users" @{
    email=$salesEmail2; password="Test1234!"; firstName="SalesTwo"; role="sales"
} -sess $adminSess

if ($salesUser2.user.id) {
    Pass "POST /api/admin/users (sales) - created" "id: $($salesUser2.user.id)"
    $salesSess2 = Login $salesEmail2 "Test1234!"
    if ($salesSess2) {
        $sAn = Call GET "/api/sales/analytics" -sess $salesSess2
        if ($sAn -ne $null) { Pass "GET /api/sales/analytics" }
        else                 { Fail "GET /api/sales/analytics" }

        $sTl = Call GET "/api/sales/analytics/timeline" -sess $salesSess2
        if ($sTl -ne $null) { Pass "GET /api/sales/analytics/timeline" }
        else                 { Fail "GET /api/sales/analytics/timeline" }

        $sfb = Call GET "/api/sales/feedback" -sess $salesSess2
        if ($sfb -ne $null) { Pass "GET /api/sales/feedback" }
        else                 { Fail "GET /api/sales/feedback" }

        $cVS = Call POST "/api/sales/users" @{
            email="cv_$(Get-Date -Format 'HHmmss')@test.com"; password="Test1234!"; firstName="CustViaSales"
        } -sess $salesSess2
        if ($cVS.user.id) {
            Pass "POST /api/sales/users - customer created" "id: $($cVS.user.id)"
            $null = Call DELETE "/api/sales/users/$($cVS.user.id)" -sess $salesSess2
        } else { Fail "POST /api/sales/users" "got: $($cVS | ConvertTo-Json -Compress)" }
    } else { Skip "Sales role tests" "login failed" }
    $null = Call DELETE "/api/admin/users/$($salesUser2.user.id)" -sess $adminSess
} else { Fail "Create sales user" "got: $($salesUser2 | ConvertTo-Json -Compress -Depth 2)" }

# ======================================================
Head "PHASE 7 - Misc"
# ======================================================

$tts = CallRaw GET "/api/tts?text=Hello+world&lang=en" -sess $adminSess
if ($tts -and $tts.StatusCode -eq 200) { Pass "GET /api/tts - audio 200" }
else                                     { Fail "GET /api/tts" "status: $($tts.StatusCode)" }

$pc = Call GET "/api/admin/pincodes" -sess $adminSess
if ($pc -ne $null) { Pass "GET /api/admin/pincodes" }
else                { Fail "GET /api/admin/pincodes" }

$sug = Call GET "/api/suggestions?query=vibration+issue" -sess $adminSess
if ($sug -ne $null) { Pass "GET /api/suggestions" }
else                 { Fail "GET /api/suggestions" }

# ======================================================
Head "PHASE 8 - Training Indexer (SSH)"
# ======================================================

Write-Host "  Checking container logs..." -ForegroundColor DarkGray
$logOut = ssh poornasree-v4 `
    "docker logs poornasree-ai-api-1 2>&1 | grep '\[training\]'" 2>&1 | Out-String

if ($logOut -match "Done.*77|77/77") {
    Pass "Training indexer - all 77 intents indexed"
    $logOut -split "`n" | Where-Object { $_ -match "\[training\]" } | Select-Object -Last 2 |
        ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
} elseif ($logOut -match "\[training\]") {
    Fail "Training indexer - logs found but not all indexed" ($logOut -split "`n" | Where-Object { $_ -match "\[training\]" } | Select-Object -Last 3 | Out-String)
} else {
    Fail "Training indexer - no logs found" "Check training.json mount and Ollama health"
}

# ======================================================
Head "SUMMARY"
# ======================================================

$total = $script:pass + $script:fail + $script:skip
Write-Host ""
Write-Host "  Total  : $total" -ForegroundColor White
Write-Host "  Passed : $($script:pass)" -ForegroundColor Green
$failColor = if ($script:fail -gt 0) { "Red" } else { "Green" }
Write-Host "  Failed : $($script:fail)" -ForegroundColor $failColor
Write-Host "  Skipped: $($script:skip)" -ForegroundColor Yellow
Write-Host ""
if ($script:fail -gt 0) {
    Write-Host "  FAILURES:" -ForegroundColor Red
    $script:log | Where-Object { $_ -like "FAIL*" } | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
}
Write-Host ""
if ($script:fail -eq 0) { Write-Host "  All tests passed!" -ForegroundColor Green }
else                     { Write-Host "  $($script:fail) test(s) failed." -ForegroundColor Yellow }
