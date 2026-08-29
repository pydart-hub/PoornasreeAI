param(
    [string]$Phone = "7356765036",
    [switch]$Local
)

# Clean digits to 10-digit format
$digits = $Phone -replace '\D', ''
if ($digits.Length -ge 10) {
    $last10 = $digits.Substring($digits.Length - 10, 10)
} else {
    $last10 = $digits
}

$raw10 = $last10
$with91 = "91$last10"
$plus91 = "+91$last10"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " 🧹 Clearing WhatsApp History for: $raw10" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($Local) {
    Write-Host "Executing on LOCAL database..." -ForegroundColor Yellow
    $apiDir = Join-Path $PSScriptRoot "..\api"
    $nodeScript = @"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const phones = ['$raw10', '$with91', '$plus91'];
  const deletedMsgs = await prisma.simulateMessage.deleteMany({ where: { phoneNumber: { in: phones } } });
  console.log('✅ Deleted ' + deletedMsgs.count + ' chat messages.');
  const deletedSessions = await prisma.conversationSession.deleteMany({ where: { phoneNumber: { in: phones } } });
  console.log('✅ Deleted ' + deletedSessions.count + ' conversation sessions.');
  const users = await prisma.user.findMany({ where: { OR: [ { whatsappNumber: { in: phones } }, { whatsappNumber: { contains: '$raw10' } }, { email: { contains: '$raw10' } } ] } });
  for (const u of users) {
    await prisma.ticket.deleteMany({ where: { customerId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
    console.log('✅ Deleted customer record: ' + u.id);
  }
}
main().catch(console.error).finally(() => prisma.`$disconnect());
"@
    Push-Location $apiDir
    try {
        node -e "$nodeScript"
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Executing on PRODUCTION server (poornasree-v4)..." -ForegroundColor Green
    $nodeScript = @"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const phones = ['$raw10', '$with91', '$plus91'];
  const deletedMsgs = await prisma.simulateMessage.deleteMany({ where: { phoneNumber: { in: phones } } });
  console.log('✅ Deleted ' + deletedMsgs.count + ' chat messages.');
  const deletedSessions = await prisma.conversationSession.deleteMany({ where: { phoneNumber: { in: phones } } });
  console.log('✅ Deleted ' + deletedSessions.count + ' conversation sessions.');
  const users = await prisma.user.findMany({ where: { OR: [ { whatsappNumber: { in: phones } }, { whatsappNumber: { contains: '$raw10' } }, { email: { contains: '$raw10' } } ] } });
  for (const u of users) {
    await prisma.ticket.deleteMany({ where: { customerId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
    console.log('✅ Deleted customer record: ' + u.id);
  }
}
main().catch(console.error).finally(() => prisma.`$disconnect());
"@
    $nodeScript | ssh poornasree-v4 "docker exec -i poornasree-ai-api-1 node"
}

Write-Host "✨ History cleared successfully for $raw10!" -ForegroundColor Green
