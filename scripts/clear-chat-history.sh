#!/usr/bin/env bash
# ── Clear WhatsApp Chat History & Reset Session ───────────────────────────
# Usage:
#   ./scripts/clear-chat-history.sh [PHONE_NUMBER]
# Examples:
#   ./scripts/clear-chat-history.sh 7356765036
#   ./scripts/clear-chat-history.sh 917356765036 --local

PHONE="${1:-7356765036}"
IS_LOCAL=false

if [[ "$1" == "--local" ]] || [[ "$2" == "--local" ]]; then
  IS_LOCAL=true
fi

# Clean digits to 10-digit format
DIGITS=$(echo "$PHONE" | sed 's/[^0-9]//g')
if [ ${#DIGITS} -ge 10 ]; then
  LAST10="${DIGITS: -10}"
else
  LAST10="$DIGITS"
fi

RAW_10="$LAST10"
WITH_91="91$LAST10"
PLUS_91="+91$LAST10"

echo "============================================"
echo " 🧹 Clearing WhatsApp History for: $RAW_10"
echo "============================================"

if [ "$IS_LOCAL" = true ]; then
  echo "Executing on LOCAL database..."
  cd "$(dirname "$0")/../api" || exit 1
  node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  async function main() {
    const phones = ['$RAW_10', '$WITH_91', '$PLUS_91'];
    const deletedMsgs = await prisma.simulateMessage.deleteMany({ where: { phoneNumber: { in: phones } } });
    console.log('✅ Deleted ' + deletedMsgs.count + ' chat messages.');
    const deletedSessions = await prisma.conversationSession.deleteMany({ where: { phoneNumber: { in: phones } } });
    console.log('✅ Deleted ' + deletedSessions.count + ' conversation sessions.');
    const users = await prisma.user.findMany({ where: { OR: [ { whatsappNumber: { in: phones } }, { whatsappNumber: { contains: '$RAW_10' } }, { email: { contains: '$RAW_10' } } ] } });
    for (const u of users) {
      await prisma.ticket.deleteMany({ where: { customerId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
      console.log('✅ Deleted customer record: ' + u.id);
    }
  }
  main().catch(console.error).finally(() => prisma.\$disconnect());
  "
else
  echo "Executing on PRODUCTION server (poornasree-v4)..."
  ssh poornasree-v4 "docker exec -i poornasree-ai-api-1 node -e \"
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  async function main() {
    const phones = ['$RAW_10', '$WITH_91', '$PLUS_91'];
    const deletedMsgs = await prisma.simulateMessage.deleteMany({ where: { phoneNumber: { in: phones } } });
    console.log('✅ Deleted ' + deletedMsgs.count + ' chat messages.');
    const deletedSessions = await prisma.conversationSession.deleteMany({ where: { phoneNumber: { in: phones } } });
    console.log('✅ Deleted ' + deletedSessions.count + ' conversation sessions.');
    const users = await prisma.user.findMany({ where: { OR: [ { whatsappNumber: { in: phones } }, { whatsappNumber: { contains: '$RAW_10' } }, { email: { contains: '$RAW_10' } } ] } });
    for (const u of users) {
      await prisma.ticket.deleteMany({ where: { customerId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
      console.log('✅ Deleted customer record: ' + u.id);
    }
  }
  main().catch(console.error).finally(() => prisma.\\\$disconnect());
  \""
fi

echo "✨ History cleared successfully for $RAW_10!"
