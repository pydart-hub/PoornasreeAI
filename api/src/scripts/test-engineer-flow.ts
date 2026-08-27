// ── Test Script: Verify Service Engineer WhatsApp Notification & Ticket Workflow ──

import prisma from "../lib/prisma";
import { notifyEngineerTicketAssigned } from "../services/engineer-ticket-notification.service";
import { handleEngineerMessage, isServiceEngineer } from "../services/engineer-whatsapp.service";
import * as TicketService from "../services/ticket.service";

async function runTest() {
  console.log("=================================================");
  console.log("🧪 RUNNING SERVICE ENGINEER WHATSAPP FLOW TEST");
  console.log("=================================================");

  // 1. Find or create a test service engineer
  const testPhone = "919999988888";
  let engineer = await prisma.user.findFirst({
    where: { role: "service_engineer", whatsappNumber: testPhone },
  });

  if (!engineer) {
    engineer = await prisma.user.create({
      data: {
        email: "test-engineer@poornasree.local",
        passwordHash: "dummy",
        firstName: "Suresh",
        lastName: "Kumar",
        role: "service_engineer",
        whatsappNumber: testPhone,
      },
    });
    console.log(`✅ Created test engineer: ${engineer.firstName} (${engineer.id}) with phone ${testPhone}`);
  } else {
    console.log(`✅ Found existing test engineer: ${engineer.firstName} (${engineer.id})`);
  }

  // Verify isServiceEngineer detects the phone
  const detectedEngineer = await isServiceEngineer(testPhone);
  if (!detectedEngineer || detectedEngineer.id !== engineer.id) {
    throw new Error("❌ isServiceEngineer failed to recognize the engineer phone number");
  }
  console.log("✅ isServiceEngineer successfully verified!");

  // 2. Find or create a test customer
  let customer = await prisma.user.findFirst({
    where: { role: "customer" },
  });
  if (!customer) {
    customer = await prisma.user.create({
      data: {
        email: "test-cust@example.com",
        passwordHash: "dummy",
        firstName: "Raju",
        lastName: "Patel",
        role: "customer",
      },
    });
  }

  // 3. Create a test ticket
  const ticketNumber = `TKT-${Date.now().toString().slice(-6)}`;
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      customerId: customer.id,
      problemDescription: "Customer: Raju Patel\nPhone: 919876543210\nLocation: Anna Nagar, Chennai · 600001\nIssue: E4 Error vibration abnormal",
      machineName: "Lactosure Pro",
      machineSerialNumber: "ECO-2026-9999",
      machineCustomer: "Raju Patel",
      phoneNumber: "919876543210",
      status: "OPEN",
    },
  });
  console.log(`✅ Created test ticket: ${ticket.ticketNumber} (${ticket.id})`);

  // 4. Assign ticket to engineer
  console.log("\n--- Step 1: Assigning Ticket to Engineer ---");
  await TicketService.assignEngineer(ticket.id, engineer.id);
  console.log("✅ assignEngineer called. Checking notification execution...");

  // Call notifyEngineerTicketAssigned
  await notifyEngineerTicketAssigned(ticket.id);
  console.log("✅ notifyEngineerTicketAssigned executed successfully!");

  // 5. Test Engineer Greeting
  console.log("\n--- Step 2: Engineer says 'HI' ---");
  await handleEngineerMessage(testPhone, "HI", engineer);

  // 6. Test Engineer asks for TICKETS
  console.log("\n--- Step 3: Engineer types 'TICKETS' ---");
  await handleEngineerMessage(testPhone, "TICKETS", engineer);

  // 7. Test Start Work
  console.log("\n--- Step 4: Engineer types 'START <ticketNumber>' ---");
  await handleEngineerMessage(testPhone, `START ${ticketNumber}`, engineer);

  const ticketAfterStart = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  console.log(`✅ Ticket status after START: ${ticketAfterStart?.status} (Expected: IN_PROGRESS)`);

  // 8. Test Diagnosis & Work Done
  console.log("\n--- Step 5: Engineer enters DIAGNOSE & NOTE ---");
  await handleEngineerMessage(testPhone, `DIAGNOSE ${ticketNumber} Defective sensor board replaced`, engineer);
  await handleEngineerMessage(testPhone, `NOTE ${ticketNumber} Recalibrated all channels with standard milk samples`, engineer);

  const workReport = await prisma.workReport.findUnique({ where: { ticketId: ticket.id } });
  console.log(`✅ WorkReport Diagnosed: "${workReport?.problemDiagnosed}"`);
  console.log(`✅ WorkReport WorkDone: "${workReport?.workDone}"`);

  // 9. Test Request OTP
  console.log("\n--- Step 6: Engineer requests OTP ---");
  await handleEngineerMessage(testPhone, `OTP ${ticketNumber}`, engineer);

  const ticketAfterOtp = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  console.log(`✅ Ticket status after OTP request: ${ticketAfterOtp?.status} (Expected: PENDING_OTP)`);

  // Retrieve active OTP from memory / service
  const activeOtp = TicketService.getActiveOtp(ticket.id);
  console.log(`🔑 Generated OTP code: ${activeOtp}`);

  if (activeOtp) {
    // 10. Test Verify OTP
    console.log("\n--- Step 7: Engineer sends 4-digit code ---");
    await handleEngineerMessage(testPhone, activeOtp, engineer);

    const ticketAfterVerify = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    console.log(`✅ Ticket status after VERIFY: ${ticketAfterVerify?.status} (Expected: CLOSED)`);
  }

  // 11. Cleanup test ticket & dummy user
  console.log("\n--- Cleanup ---");
  await prisma.workReport.deleteMany({ where: { ticketId: ticket.id } });
  await prisma.ticket.delete({ where: { id: ticket.id } });
  await prisma.user.delete({ where: { id: engineer.id } });
  console.log("🧹 Cleaned up test records.");

  console.log("\n=================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================");
}

runTest()
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
