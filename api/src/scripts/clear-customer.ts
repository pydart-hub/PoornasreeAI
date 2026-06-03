/**
 * clear-customer.ts
 * Deletes all data associated with a customer phone number so they
 * can start fresh in the customer chat flow.
 *
 * Usage:
 *   cd api && npx ts-node src/scripts/clear-customer.ts 9048740132
 *   cd api && npx ts-node src/scripts/clear-customer.ts          # defaults to 9048740132
 */

import prisma from "../lib/prisma";
import { clearCustomerByPhone } from "../services/customer-clear.service";

async function main() {
  const phone = process.argv[2] || "9048740132";

  console.log(`\n🧹 Clearing all customer data for phone: ${phone}\n`);

  const result = await clearCustomerByPhone(phone);

  console.log(`  🎫 Tickets deleted:                ${result.tickets}`);
  console.log(`  💬 SimulateMessages deleted:        ${result.simulateMessages}`);
  console.log(`  🔄 ConversationSessions deleted:    ${result.conversationSessions}`);
  console.log(`  🔧 TroubleshootingSessions deleted: ${result.troubleshootingSessions}`);
  console.log(`\n✅ Done! ${result.total} records deleted for phone ${phone}.\n`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
