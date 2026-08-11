import prisma from './src/lib/prisma';

async function checkRecentChats() {
  console.log("==========================================");
  console.log("1. RECENT CONVERSATION SESSIONS");
  console.log("==========================================");
  const sessions = await prisma.conversationSession.findMany({
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  for (const s of sessions) {
    console.log(`Phone: ${s.phoneNumber} | State: ${s.state} | IsRegistered: ${s.isRegistered} | Updated: ${s.updatedAt}`);
    console.log("Metadata:", JSON.stringify(s.metadata, null, 2));
    console.log("------------------------------------------");
  }

  console.log("\n==========================================");
  console.log("2. RECENT SIMULATE MESSAGES (TOP 30)");
  console.log("==========================================");
  const messages = await prisma.simulateMessage.findMany({
    take: 30,
    orderBy: { createdAt: "desc" },
  });

  for (const m of messages.reverse()) {
    console.log(`[${m.createdAt.toISOString()}] ${m.phoneNumber} (${m.role}): ${m.content} ${m.mediaUrl ? `[Media: ${m.mediaUrl}]` : ""}`);
  }

  console.log("\n==========================================");
  console.log("3. RECENT TICKETS");
  console.log("==========================================");
  const tickets = await prisma.ticket.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      ticketNumber: true,
      phoneNumber: true,
      status: true,
      issueDescription: true,
      customerAddress: true,
      createdAt: true,
    },
  });

  for (const t of tickets) {
    console.log(`Ticket: ${t.ticketNumber} | Phone: ${t.phoneNumber} | Status: ${t.status} | Created: ${t.createdAt}`);
    console.log(`Address: ${t.customerAddress}`);
    console.log(`Issue: ${t.issueDescription}`);
    console.log("------------------------------------------");
  }
}

checkRecentChats()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
