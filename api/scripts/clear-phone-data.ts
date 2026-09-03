import prisma from "../src/lib/prisma";

async function clearPhoneData() {
  const phone = "9048740132";
  const cleanPhone = phone.replace(/\D/g, "");
  const last10 = cleanPhone.slice(-10);

  const phoneVariants = [
    phone,
    cleanPhone,
    last10,
    `91${last10}`,
    `+91${last10}`,
  ];

  console.log("Clearing all data for phone variants:", phoneVariants);

  // 1. Find user IDs
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { whatsappNumber: { in: phoneVariants } },
        { whatsappNumber: { contains: last10 } },
        { email: { contains: last10 } },
      ],
    },
    select: { id: true },
  });

  const userIds = users.map((u) => u.id);
  console.log(`Found ${userIds.length} user(s) to delete:`, userIds);

  // Execute in transaction
  const [deletedSimulate, deletedSessions, deletedTs, deletedComplaints, deletedTickets, deletedLeads, deletedUsers] =
    await prisma.$transaction([
      prisma.simulateMessage.deleteMany({
        where: {
          OR: [
            { phoneNumber: { in: phoneVariants } },
            { phoneNumber: { contains: last10 } },
          ],
        },
      }),
      prisma.conversationSession.deleteMany({
        where: {
          OR: [
            { phoneNumber: { in: phoneVariants } },
            { phoneNumber: { contains: last10 } },
          ],
        },
      }),
      prisma.troubleshootingSession.deleteMany({
        where: {
          OR: [
            { phoneNumber: { in: phoneVariants } },
            { phoneNumber: { contains: last10 } },
          ],
        },
      }),
      prisma.manualComplaint.deleteMany({
        where: {
          OR: [
            { phoneNumber: { in: phoneVariants } },
            { phoneNumber: { contains: last10 } },
          ],
        },
      }),
      prisma.ticket.deleteMany({
        where: {
          OR: [
            { phoneNumber: { in: phoneVariants } },
            { phoneNumber: { contains: last10 } },
            ...(userIds.length > 0 ? [{ customerId: { in: userIds } }] : []),
          ],
        },
      }),
      prisma.marketingLead.deleteMany({
        where: {
          OR: [
            { phone: { in: phoneVariants } },
            { phone: { contains: last10 } },
          ],
        },
      }),
      prisma.user.deleteMany({
        where: { id: { in: userIds } },
      }),
    ]);

  console.log("\nDeletion Summary:");
  console.log(`- Simulate Messages deleted: ${deletedSimulate.count}`);
  console.log(`- Conversation Sessions deleted: ${deletedSessions.count}`);
  console.log(`- Troubleshooting Sessions deleted: ${deletedTs.count}`);
  console.log(`- Manual Complaints deleted: ${deletedComplaints.count}`);
  console.log(`- Tickets deleted: ${deletedTickets.count}`);
  console.log(`- Marketing Leads deleted: ${deletedLeads.count}`);
  console.log(`- Users deleted: ${deletedUsers.count}`);
  console.log("\n✅ All data for 9048740132 has been completely cleared!");
}

clearPhoneData().catch((e) => {
  console.error("Deletion failed:", e);
  process.exit(1);
});
