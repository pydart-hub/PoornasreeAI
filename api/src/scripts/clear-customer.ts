/**
 * clear-customer.ts
 * Deletes all data associated with a customer phone number so they
 * can start fresh in the customer chat flow.
 *
 * Usage:
 *   cd api && npx ts-node src/scripts/clear-customer.ts 9048740132
 *   cd api && npx ts-node src/scripts/clear-customer.ts          # defaults to 9048740132
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const phone = process.argv[2] || "9048740132";
  // Also check with country code prefix
  const phoneVariants = [phone, `91${phone}`];

  console.log(`\n🧹 Clearing all customer data for phone: ${phone}\n`);

  // 1. Tickets (phoneNumber field)
  const tickets = await prisma.ticket.deleteMany({
    where: { phoneNumber: { in: phoneVariants } },
  });
  console.log(`  🎫 Tickets deleted:                ${tickets.count}`);

  // 2. SimulateMessage (WhatsApp simulator chat history)
  const simMsgs = await prisma.simulateMessage.deleteMany({
    where: { phoneNumber: { in: phoneVariants } },
  });
  console.log(`  💬 SimulateMessages deleted:        ${simMsgs.count}`);

  // 3. ConversationSession (FSM state tracking)
  const convSessions = await prisma.conversationSession.deleteMany({
    where: { phoneNumber: { in: phoneVariants } },
  });
  console.log(`  🔄 ConversationSessions deleted:    ${convSessions.count}`);

  // 4. TroubleshootingSession (troubleshooting by phone+serial)
  const troubleSessions = await prisma.troubleshootingSession.deleteMany({
    where: { phoneNumber: { in: phoneVariants } },
  });
  console.log(`  🔧 TroubleshootingSessions deleted: ${troubleSessions.count}`);

  const total = tickets.count + simMsgs.count + convSessions.count + troubleSessions.count;
  console.log(`\n✅ Done! ${total} records deleted for phone ${phone}.\n`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
