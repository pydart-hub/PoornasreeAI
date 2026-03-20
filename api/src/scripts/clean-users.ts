/**
 * clean-users.ts
 * Deletes all non-admin users and every piece of data that belongs to them.
 *
 * Run (on VPS):
 *   docker compose exec api npx ts-node src/scripts/clean-users.ts
 *
 * Run (locally):
 *   cd api && npx ts-node src/scripts/clean-users.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1. Identify non-admin users ─────────────────────────────────────────
  const nonAdminUsers = await prisma.user.findMany({
    where: { role: { not: "admin" } },
    select: { id: true, email: true, role: true },
  });

  if (nonAdminUsers.length === 0) {
    console.log("No non-admin users found. Nothing to delete.");
    return;
  }

  console.log(`\nFound ${nonAdminUsers.length} non-admin user(s) to delete:`);
  for (const u of nonAdminUsers) {
    console.log(`  • ${u.email} (${u.role})`);
  }

  const ids = nonAdminUsers.map((u) => u.id);

  // ── 2. Disconnect engineers from pincodes (many-to-many join table) ────
  console.log("\n[1/9] Disconnecting engineers from pincode zones...");
  for (const id of ids) {
    await prisma.user.update({
      where: { id },
      data: {
        engineerPincodes: { set: [] },
        managedPincodes:  { set: [] },
      },
    });
  }

  // ── 3. Nullify managerId on pincodes ───────────────────────────────────
  console.log("[2/9] Clearing pincode manager assignments...");
  await prisma.pincode.updateMany({
    where: { managerId: { in: ids } },
    data:  { managerId: null },
  });

  // ── 4. Nullify optional Ticket FK fields ───────────────────────────────
  console.log("[3/9] Clearing ticket assignments (dealer / manager / engineer)...");
  await prisma.ticket.updateMany({
    where: { dealerId: { in: ids } },
    data:  { dealerId: null },
  });
  await prisma.ticket.updateMany({
    where: { assignedManagerId: { in: ids } },
    data:  { assignedManagerId: null },
  });
  await prisma.ticket.updateMany({
    where: { assignedEngineerId: { in: ids } },
    data:  { assignedEngineerId: null },
  });

  // ── 5. Nullify optional engineerId on SupportRequests ─────────────────
  console.log("[4/9] Clearing support-request engineer assignments...");
  await prisma.supportRequest.updateMany({
    where: { engineerId: { in: ids } },
    data:  { engineerId: null },
  });

  // ── 6. Delete TrainingFeedback (createdById — no CASCADE in DB) ────────
  console.log("[5/9] Deleting training feedback...");
  await prisma.trainingFeedback.deleteMany({
    where: { createdById: { in: ids } },
  });

  // ── 7. Delete SupportMessages sent by non-admin users ─────────────────
  //    (senderId has no ON DELETE CASCADE at DB level)
  console.log("[6/9] Deleting support chat messages...");
  await prisma.supportMessage.deleteMany({
    where: { senderId: { in: ids } },
  });

  // ── 8. Delete Documents uploaded by non-admin (chunks cascade in DB) ───
  console.log("[7/9] Deleting documents and chunks...");
  await prisma.document.deleteMany({
    where: { uploadedById: { in: ids } },
  });

  // ── 9. Delete R&D Videos uploaded by non-admin ────────────────────────
  console.log("[8/9] Deleting R&D videos...");
  await prisma.rdVideo.deleteMany({
    where: { uploadedById: { in: ids } },
  });

  // ── 10. Delete all non-admin users ────────────────────────────────────
  //   CASCADE in DB handles: Conversation → Message
  //                          Conversation → SupportRequest → SupportMessage
  //                          CustomerTickets (onDelete: Cascade)
  console.log("[9/9] Deleting non-admin users...");
  const result = await prisma.user.deleteMany({
    where: { role: { not: "admin" } },
  });

  console.log(`\n✅ Done. Deleted ${result.count} user(s) and all associated data.\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ Error during cleanup:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
