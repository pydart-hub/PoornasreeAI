import prisma from "../lib/prisma";

async function main() {
  const phoneSuffix = "8089732385";
  console.log(`[*] Searching for user and records matching phone suffix: ${phoneSuffix}...`);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { whatsappNumber: { contains: phoneSuffix } },
        { email: { contains: phoneSuffix } },
      ],
    },
    select: { id: true, email: true, firstName: true, role: true, whatsappNumber: true },
  });

  console.log(`Found ${users.length} matching user(s):`, users);
  const userIds = users.map((u) => u.id);

  // 1. Find tickets
  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { customerId: { in: userIds } },
        { phoneNumber: { contains: phoneSuffix } },
      ],
    },
    select: { id: true, ticketNumber: true },
  });
  console.log(`Found ${tickets.length} matching ticket(s):`, tickets.map((t) => t.ticketNumber));
  const ticketIds = tickets.map((t) => t.id);

  // 2. Delete WorkReport and children
  if (ticketIds.length > 0) {
    const workReports = await prisma.workReport.findMany({
      where: { ticketId: { in: ticketIds } },
      select: { id: true },
    });
    const wrIds = workReports.map((wr) => wr.id);

    if (wrIds.length > 0) {
      const delImg = await prisma.workReportImage.deleteMany({ where: { workReportId: { in: wrIds } } });
      console.log(`Deleted ${delImg.count} WorkReportImage rows`);
      const delParts = await prisma.replacedPart.deleteMany({ where: { workReportId: { in: wrIds } } });
      console.log(`Deleted ${delParts.count} ReplacedPart rows`);
      const delWr = await prisma.workReport.deleteMany({ where: { id: { in: wrIds } } });
      console.log(`Deleted ${delWr.count} WorkReport rows`);
    }

    const delTickets = await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    console.log(`Deleted ${delTickets.count} Ticket rows`);
  }

  // 3. Delete ConversationSession
  const delConvSession = await prisma.conversationSession.deleteMany({
    where: { phoneNumber: { contains: phoneSuffix } },
  });
  console.log(`Deleted ${delConvSession.count} ConversationSession rows`);

  // 4. Delete SimulateMessage
  const delSim = await prisma.simulateMessage.deleteMany({
    where: { phoneNumber: { contains: phoneSuffix } },
  });
  console.log(`Deleted ${delSim.count} SimulateMessage rows`);

  // 5. Delete TroubleshootingSession
  const delTrouble = await prisma.troubleshootingSession.deleteMany({
    where: { phoneNumber: { contains: phoneSuffix } },
  });
  console.log(`Deleted ${delTrouble.count} TroubleshootingSession rows`);

  // 6. Delete ManualComplaint
  const delManual = await prisma.manualComplaint.deleteMany({
    where: { phoneNumber: { contains: phoneSuffix } },
  });
  console.log(`Deleted ${delManual.count} ManualComplaint rows`);

  // 7. Delete SupportRequest & SupportMessage
  if (userIds.length > 0) {
    const supportReqs = await prisma.supportRequest.findMany({
      where: { customerId: { in: userIds } },
      select: { id: true },
    });
    const srIds = supportReqs.map((sr) => sr.id);
    if (srIds.length > 0) {
      const delSm = await prisma.supportMessage.deleteMany({ where: { supportRequestId: { in: srIds } } });
      console.log(`Deleted ${delSm.count} SupportMessage rows`);
      const delSr = await prisma.supportRequest.deleteMany({ where: { id: { in: srIds } } });
      console.log(`Deleted ${delSr.count} SupportRequest rows`);
    }

    // 8. Delete Conversations & Messages
    const convos = await prisma.conversation.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const cIds = convos.map((c) => c.id);
    if (cIds.length > 0) {
      const delTf = await prisma.trainingFeedback.deleteMany({ where: { conversationId: { in: cIds } } });
      console.log(`Deleted ${delTf.count} TrainingFeedback rows`);
      const delMsgs = await prisma.message.deleteMany({ where: { conversationId: { in: cIds } } });
      console.log(`Deleted ${delMsgs.count} Message rows`);
      const delConv = await prisma.conversation.deleteMany({ where: { id: { in: cIds } } });
      console.log(`Deleted ${delConv.count} Conversation rows`);
    }
  }

  // 9. Delete MarketingLead
  const leads = await prisma.marketingLead.findMany({
    where: { phone: { contains: phoneSuffix } },
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);
  if (leadIds.length > 0) {
    await prisma.brandingCampaignLead.deleteMany({ where: { leadId: { in: leadIds } } });
    const delLeads = await prisma.marketingLead.deleteMany({ where: { id: { in: leadIds } } });
    console.log(`Deleted ${delLeads.count} MarketingLead rows`);
  }

  // 10. Delete Users
  if (userIds.length > 0) {
    const delUsers = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    console.log(`Deleted ${delUsers.count} User row(s)`);
  }

  console.log(`[+] Successfully cleared all tickets and data for phone suffix: ${phoneSuffix}`);
}

main()
  .catch((err) => {
    console.error("Error clearing phone data:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
