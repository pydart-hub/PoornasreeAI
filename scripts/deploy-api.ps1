# Rebuild and restart Poornasree API on VPS (run ON the server after git pull)
# Usage from project root on server:
#   .\scripts\deploy-api.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Building API image..." -ForegroundColor Cyan
docker compose build api

Write-Host "Restarting API..." -ForegroundColor Cyan
docker compose up -d api

Write-Host "Health check (stage/created)..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/public/tickets/stage/created?limit=1"
  if ($r.success) {
    Write-Host "OK — stage API live (success=true)" -ForegroundColor Green
  } else {
    Write-Host "WARN — API up but success=false" -ForegroundColor Yellow
  }
} catch {
  Write-Host "WARN — curl failed (API may still be starting): $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "Done. Set INTEGRATION_WEBHOOK_URL in .env and run: docker compose up -d api" -ForegroundColor Green
