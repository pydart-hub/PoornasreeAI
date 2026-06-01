# Test public stage endpoints (requires API on :4000 and DATABASE_URL reachable)
$Base = if ($env:API_BASE) { $env:API_BASE } else { "http://localhost:4000" }
$stages = @("created", "assigned", "in-progress", "pending-otp", "closed")

Write-Host "Testing Poornasree stage APIs at $Base" -ForegroundColor Cyan

foreach ($stage in $stages) {
  $url = "$Base/api/public/tickets/stage/$stage`?limit=1"
  try {
    $r = Invoke-RestMethod -Uri $url -Method Get
    if ($r.success -ne $true) {
      Write-Host "  FAIL $stage : success=false — $($r.message)" -ForegroundColor Red
      continue
    }
    $n = if ($r.data) { @($r.data).Count } else { 0 }
    Write-Host "  OK   GET /stage/$stage — $n ticket(s)" -ForegroundColor Green
  } catch {
    $msg = $_.Exception.Message
    if ($_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }
    Write-Host "  FAIL $stage — $msg" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "If DB errors: start DB tunnel or docker compose up -d db api"
