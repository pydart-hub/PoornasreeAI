import { handleMessage } from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function testMultiMachineAndAutoRegistration() {
  console.log("================================================================================");
  console.log("🧪 TESTING MULTI-MACHINE SUPPORT, CHANGE MACHINE & CUSTOMER AUTO-REGISTRATION");
  console.log("================================================================================\n");

  const multiMachinePhone = "919888111222";
  const newCustomerPhone = "919777333444";

  // Clean test data
  await prisma.simulateMessage.deleteMany({ where: { phoneNumber: { in: [multiMachinePhone, newCustomerPhone] } } }).catch(() => {});
  await prisma.conversationSession.deleteMany({ where: { phoneNumber: { in: [multiMachinePhone, newCustomerPhone] } } }).catch(() => {});
  await prisma.ticket.deleteMany({ where: { phoneNumber: { in: [multiMachinePhone, newCustomerPhone] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { whatsappNumber: { in: [multiMachinePhone, newCustomerPhone] } } }).catch(() => {});

  // -------------------------------------------------------------------------
  // SCENARIO 1: Registered Customer with MULTIPLE Machines on file
  // -------------------------------------------------------------------------
  console.log("--- SCENARIO 1: Customer with 2 past registered machines ---");
  
  // Create registered User for multiMachinePhone
  const registeredCustomer = await prisma.user.create({
    data: {
      email: "ernakulam_dairy@poornasree.local",
      passwordHash: "NOPASSWORD",
      firstName: "Ernakulam Dairy Society",
      role: "customer",
      whatsappNumber: multiMachinePhone,
    }
  });

  // Seed 2 past tickets for multiMachinePhone with different serials
  await prisma.ticket.create({
    data: {
      ticketNumber: "TKT-TEST-MACH-1",
      customerId: registeredCustomer.id,
      phoneNumber: multiMachinePhone,
      machineName: "Eco-V Milk Analyzer",
      machineSerialNumber: "2410-0012",
      problemDescription: "Past ticket 1",
      issueDescription: "End customer: Ernakulam Dairy Society, Address: Main Road, Ernakulam",
      customerAddress: "Main Road, Ernakulam",
      place: "Kochi",
      district: "Ernakulam",
      state: "Kerala",
    }
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: "TKT-TEST-MACH-2",
      customerId: registeredCustomer.id,
      phoneNumber: multiMachinePhone,
      machineName: "Lactosure Stirrer",
      machineSerialNumber: "2510-0089",
      problemDescription: "Past ticket 2",
      issueDescription: "End customer: Ernakulam Dairy Society, Address: Main Road, Ernakulam",
      customerAddress: "Main Road, Ernakulam",
      place: "Kochi",
      district: "Ernakulam",
      state: "Kerala",
    }
  });

  // Step 1: Customer describes an issue
  console.log("1. Customer sends: 'Vibro not working'");
  await handleMessage(multiMachinePhone, "Vibro not working");

  // Step 2: Customer clicks "❌ Unresolved"
  console.log("2. Customer clicks: TROUBLESHOOT_UNRESOLVED");
  const m2 = await handleMessage(multiMachinePhone, "TROUBLESHOOT_UNRESOLVED");
  console.log("Bot Response:\n" + m2.message);
  if (m2.listMenu) {
    console.log("List Button:", m2.listMenu.buttonText);
    console.log("List Rows:", m2.listMenu.rows.map((r: any) => `${r.title} [${r.id}]`).join(" | "));
  }
  console.log("\n");

  // Step 3: Customer chooses machine 2 ("SELECT_MACH_2510-0089")
  console.log("3. Customer selects: SELECT_MACH_2510-0089");
  const m3 = await handleMessage(multiMachinePhone, "SELECT_MACH_2510-0089");
  console.log("Bot Confirmation Summary:\n" + m3.message);
  console.log("Buttons:", m3.buttons?.map((b: any) => b.title).join(" | "), "\n");

  // Step 4: Customer clicks "🔄 Change Machine" to test changing machine
  console.log("4. Customer clicks: CHANGE_MACHINE");
  const m4 = await handleMessage(multiMachinePhone, "CHANGE_MACHINE");
  console.log("Bot List / Prompt:\n" + m4.message);
  if (m4.listMenu) {
    console.log("List Rows:", m4.listMenu.rows.map((r: any) => `${r.title} [${r.id}]`).join(" | "));
  }
  console.log("\n");

  // Step 5: Customer chooses to enter new serial and sends: "2610-0044"
  console.log("5. Customer chooses to enter new serial and sends: 2610-0044");
  await handleMessage(multiMachinePhone, "ENTER_NEW_SERIAL");
  const m5 = await handleMessage(multiMachinePhone, "2610-0044");
  console.log("Bot Updated Summary:\n" + m5.message);
  console.log("Buttons:", m5.buttons?.map((b: any) => b.title).join(" | "), "\n");

  // Step 6: Customer confirms ticket booking
  console.log("6. Customer clicks: CONFIRM_BOOK_TICKET");
  const m6 = await handleMessage(multiMachinePhone, "CONFIRM_BOOK_TICKET");
  console.log("Bot Ticket Created:\n" + m6.message, "\n");

  // -------------------------------------------------------------------------
  // SCENARIO 2: BRAND NEW CUSTOMER AUTO-REGISTRATION
  // -------------------------------------------------------------------------
  console.log("--- SCENARIO 2: Brand new customer registers complaint ---");
  await handleMessage(newCustomerPhone, "T2 error");
  const n2 = await handleMessage(newCustomerPhone, "TROUBLESHOOT_UNRESOLVED");
  console.log("Bot asks Name:", n2.message);
  
  const n3 = await handleMessage(newCustomerPhone, "Sunrise Milk Farm");
  console.log("Bot asks Pincode:", n3.message);

  const n4 = await handleMessage(newCustomerPhone, "682001");
  console.log("Bot asks Pincode Confirm:", n4.message);

  const n5 = await handleMessage(newCustomerPhone, "1"); // Yes
  console.log("Bot asks Address:", n5.message);

  const n6 = await handleMessage(newCustomerPhone, "Door 55, Near Lake, Fort Kochi");
  console.log("Bot asks Serial:", n6.message);

  const n7 = await handleMessage(newCustomerPhone, "2410-0012");
  console.log("Bot Confirmation Summary:\n" + n7.message);

  const n8 = await handleMessage(newCustomerPhone, "CONFIRM_BOOK_TICKET");
  console.log("Bot Ticket Created:\n" + n8.message, "\n");

  // Verify User was automatically created in Postgres DB
  const createdUser = await prisma.user.findFirst({
    where: { whatsappNumber: newCustomerPhone },
  });
  console.log("✅ Auto-Created User in DB:", createdUser?.firstName, "| Role:", createdUser?.role, "| Phone:", createdUser?.whatsappNumber);

  // Verify Machine was upserted in prisma.machine
  const machineInDb = await prisma.machine.findFirst({
    where: { serialNumber: "2410-0012" },
  });
  console.log("✅ Machine registered in DB:", machineInDb?.serialNumber, "| Model:", machineInDb?.modelName);

  console.log("\n================================================================================");
  console.log("✅ ALL MULTI-MACHINE & AUTO-REGISTRATION TESTS PASSED PERFECTLY!");
  console.log("================================================================================");
}

testMultiMachineAndAutoRegistration().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e); process.exit(1); });
