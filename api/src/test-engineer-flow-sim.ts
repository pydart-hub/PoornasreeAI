import prisma from "./lib/prisma";
import { notifyEngineerTicketAssigned } from "./services/engineer-ticket-notification.service";
import { routeEngineerMessage } from "./controllers/whatsapp.controller";

async function runSimulation() {
  console.log("=== STARTING SERVICE ENGINEER FLOW SIMULATION ===");

  // 1. Find or create an engineer user
  let engineer = await prisma.user.findFirst({
    where: { role: "service_engineer" },
  });

  if (!engineer) {
    console.log("No engineer found, creating a test engineer...");
    engineer = await prisma.user.create({
      data: {
        email: "test.eng@poornasree.com",
        firstName: "Test",
        lastName: "Engineer",
        role: "service_engineer",
        whatsappNumber: "918714440038",
        passwordHash: "dummy",
      },
    });
  }

  console.log(`Using engineer: ${engineer.firstName} (${engineer.whatsappNumber})`);

  // 2. Create a customer user for ticket
  let customer = await prisma.user.findFirst({
    where: { role: "customer" },
  });

  if (!customer) {
    customer = await prisma.user.create({
      data: {
        email: "cust@gmail.com",
        firstName: "Aph",
        role: "customer",
        passwordHash: "dummy",
      },
    });
  }

  // 3. Clear old simulate messages for this number
  const phone = engineer.whatsappNumber!;
  await prisma.simulateMessage.deleteMany({
    where: { phoneNumber: phone },
  });

  // 4. Create a new ticket
  const ticketNum = `TKT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  console.log(`Creating ticket: ${ticketNum}`);
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: ticketNum,
      customerId: customer.id,
      assignedEngineerId: engineer.id,
      problemDescription: "AMCU-Automatic Milk Unit With Milk Analyzer: How to clean",
      status: "ASSIGNED",
      customerAddress: "Kadampuzha · 676553",
      phoneNumber: "+919048740132",
    },
  });

  const getRecentBotReplies = async () => {
    const msgs = await prisma.simulateMessage.findMany({
      where: { phoneNumber: phone, role: "bot" },
      orderBy: { createdAt: "asc" },
    });
    // Clear them so we only see new ones next time
    await prisma.simulateMessage.deleteMany({
      where: { phoneNumber: phone },
    });
    return msgs.map(m => m.content);
  };

  // 5. Notify engineer of the ticket assignment
  console.log("\n--- Step 1: Assign Ticket Notification ---");
  await notifyEngineerTicketAssigned(ticket.id);
  let replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 6. Engineer starts work
  console.log("\n--- Step 2: Engineer Clicks 'Start Work' ---");
  await routeEngineerMessage(phone, `ENG_START:${ticketNum}`, { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 7. Send arrival photo (reached location)
  console.log("\n--- Step 3: Engineer Uploads Arrival Photo ---");
  await routeEngineerMessage(phone, `ENG_PHOTO:${ticketNum}:reached_photo_${ticketNum}.jpg`, { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 8. Send problem diagnosed text (triggers prompt for work done)
  console.log("\n--- Step 4: Engineer Sends Problem Diagnosed Text ---");
  await routeEngineerMessage(phone, "Replaced dirty filter", { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 9. Send work done text (triggers prompt for warranty claim)
  console.log("\n--- Step 5: Engineer Sends Work Done Text ---");
  await routeEngineerMessage(phone, "Cleaned the machine thoroughly and tested output", { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 10. Send warranty decision (triggers prompt for parts / finished photo)
  console.log("\n--- Step 6: Engineer Selects 'No Warranty' ---");
  await routeEngineerMessage(phone, `ENG_WARR_NO:${ticketNum}`, { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 11. Send replaced part details (triggers prompt for another part or finished photo)
  console.log("\n--- Step 7: Engineer Sends Replaced Part Details ---");
  await routeEngineerMessage(phone, "Filter | FLT-05 | 1", { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 12. Send finished work photo (triggers action buttons for OTP)
  console.log("\n--- Step 8: Engineer Sends Finished Work Photo ---");
  await routeEngineerMessage(phone, `ENG_PHOTO:${ticketNum}:finished_photo_${ticketNum}.jpg`, { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 13. Request OTP (triggers prompt to enter OTP code)
  console.log("\n--- Step 9: Engineer Requests OTP ---");
  await routeEngineerMessage(phone, `ENG_OTP:${ticketNum}`, { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  // 14. Verify OTP (directly typing the 4-digit code)
  console.log("\n--- Step 10: Engineer Enters OTP ---");
  // Query customer simulate messages to get the generated OTP code
  const customerMsgs = await prisma.simulateMessage.findMany({
    where: { phoneNumber: ticket.phoneNumber! },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  let otpCode = "1234";
  for (const msg of customerMsgs) {
    const match = msg.content.match(/is:\s*\*(\d{4})\*/);
    if (match) {
      otpCode = match[1];
      break;
    }
  }
  console.log(`Extracted customer OTP code: ${otpCode}`);
  await routeEngineerMessage(phone, otpCode, { id: engineer.id, firstName: engineer.firstName });
  replies = await getRecentBotReplies();
  replies.forEach((r, i) => console.log(`[Bot Message ${i + 1}]:\n${r}\n`));

  console.log("=== SIMULATION COMPLETED ===");
}

runSimulation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
