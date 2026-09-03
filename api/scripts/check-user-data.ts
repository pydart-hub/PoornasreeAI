import prisma from "../src/lib/prisma";

async function checkPhoneData() {
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

  console.log("Searching for data associated with phone:", phone);

  // 1. Users
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { whatsappNumber: { in: phoneVariants } },
        { whatsappNumber: { contains: last10 } },
        { email: { contains: last10 } },
      ],
    },
    include: { pincode: true },
  });
  console.log(`\n1. Users found: ${users.length}`);
  users.forEach((u) => {
    console.log(`   - ID: ${u.id}, Name: ${u.firstName} ${u.lastName || ""}, Role: ${u.role}, WhatsApp: ${u.whatsappNumber}, Email: ${u.email}`);
  });

  const userIds = users.map((u) => u.id);

  // 2. Conversation Sessions
  const sessions = await prisma.conversationSession.findMany({
    where: {
      OR: [
        { phoneNumber: { in: phoneVariants } },
        { phoneNumber: { contains: last10 } },
      ],
    },
  });
  console.log(`\n2. Conversation Sessions found: ${sessions.length}`);
  sessions.forEach((s) => {
    console.log(`   - ID: ${s.id}, Phone: ${s.phoneNumber}, State: ${s.state}, Meta:`, JSON.stringify(s.metadata));
  });

  // 3. Simulate Messages
  const simulateMsgs = await prisma.simulateMessage.findMany({
    where: {
      OR: [
        { phoneNumber: { in: phoneVariants } },
        { phoneNumber: { contains: last10 } },
      ],
    },
  });
  console.log(`\n3. Simulate Messages found: ${simulateMsgs.length}`);

  // 4. Troubleshooting Sessions
  const tsSessions = await prisma.troubleshootingSession.findMany({
    where: {
      OR: [
        { phoneNumber: { in: phoneVariants } },
        { phoneNumber: { contains: last10 } },
      ],
    },
  });
  console.log(`\n4. Troubleshooting Sessions found: ${tsSessions.length}`);

  // 5. Manual Complaints
  const manualComplaints = await prisma.manualComplaint.findMany({
    where: {
      OR: [
        { phoneNumber: { in: phoneVariants } },
        { phoneNumber: { contains: last10 } },
      ],
    },
  });
  console.log(`\n5. Manual Complaints found: ${manualComplaints.length}`);
  manualComplaints.forEach((c) => {
    console.log(`   - ID: ${c.id}, Complaint: ${c.complaint}, Phone: ${c.phoneNumber}`);
  });

  // 6. Tickets
  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { phoneNumber: { in: phoneVariants } },
        { phoneNumber: { contains: last10 } },
        { customerId: { in: userIds } },
      ],
    },
  });
  console.log(`\n6. Tickets found: ${tickets.length}`);
  tickets.forEach((t) => {
    console.log(`   - ID: ${t.id}, Ticket#: ${t.ticketNumber}, Status: ${t.status}, Issue: ${t.issueDescription || t.problemDescription}, Phone: ${t.phoneNumber}`);
  });

  // 7. Conversations & Messages
  const conversations = await prisma.conversation.findMany({
    where: { userId: { in: userIds } },
  });
  console.log(`\n7. Conversations found: ${conversations.length}`);

  // 8. Marketing Leads
  const marketingLeads = await prisma.marketingLead.findMany({
    where: {
      OR: [
        { phone: { in: phoneVariants } },
        { phone: { contains: last10 } },
      ],
    },
  });
  console.log(`\n8. Marketing Leads found: ${marketingLeads.length}`);

  process.exit(0);
}

checkPhoneData().catch((e) => {
  console.error(e);
  process.exit(1);
});
