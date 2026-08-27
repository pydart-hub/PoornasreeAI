import { handleMessage } from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function testRedesignedFlow() {
  console.log("================================================================================");
  console.log("🧪 TESTING REDESIGNED COMPLAINT REGISTRATION & TROUBLESHOOTING FLOW");
  console.log("================================================================================\n");

  const testPhone = "919447000111"; // Test customer

  // Reset any prior session for clean test
  await prisma.simulateMessage.deleteMany({ where: { phoneNumber: testPhone } }).catch(() => {});
  await prisma.conversationSession.deleteMany({ where: { phoneNumber: testPhone } }).catch(() => {});

  console.log("--- 1. User opens Chat & Skips initial greeting ---");
  const step1 = await handleMessage(testPhone, "SKIP");
  console.log("BOT:", (step1.message || "").slice(0, 100) + "...\n");

  console.log("--- 2. User selects '2' (Register Complaint) from Menu ---");
  const step2 = await handleMessage(testPhone, "2");
  console.log("BOT:", step2.message);
  console.log("BUTTONS:", step2.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 3. User types their complaint: 'Vibro not working' ---");
  const step3 = await handleMessage(testPhone, "Vibro not working");
  console.log("BOT:\n" + step3.message);
  console.log("BUTTONS:", step3.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 4. User clicks '❌ Unresolved' ---");
  const step4 = await handleMessage(testPhone, "TROUBLESHOOT_UNRESOLVED");
  console.log("BOT:\n" + step4.message);
  console.log("BUTTONS:", step4.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 5. New customer enters Name: 'Anand Milk Dairy' ---");
  const step5 = await handleMessage(testPhone, "Anand Milk Dairy");
  console.log("BOT:\n" + step5.message, "\n");

  console.log("--- 6. Customer enters Pincode: '682001' ---");
  const step6 = await handleMessage(testPhone, "682001");
  console.log("BOT:\n" + step6.message);
  console.log("BUTTONS:", step6.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 7. Customer confirms location: '1' (Yes) ---");
  const step7 = await handleMessage(testPhone, "1");
  console.log("BOT:\n" + step7.message, "\n");

  console.log("--- 8. Customer enters Address: 'Main Road, Near Society Hall, Fort Kochi' ---");
  const step8 = await handleMessage(testPhone, "Main Road, Near Society Hall, Fort Kochi");
  console.log("BOT:\n" + step8.message);
  console.log("BUTTONS:", step8.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 9. Customer enters Machine Serial Number: '2410-0012' (or 'SKIP') ---");
  const step9 = await handleMessage(testPhone, "2410-0012");
  console.log("BOT:\n" + step9.message);
  console.log("BUTTONS:", step9.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 10. Customer clicks '✅ Confirm' to book service ticket ---");
  const step10 = await handleMessage(testPhone, "CONFIRM_BOOK_TICKET");
  console.log("BOT (TICKET CONFIRMATION):\n" + step10.message);
  console.log("BUTTONS:", step10.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("================================================================================");
  console.log("✅ FULL REDESIGNED FLOW TEST COMPLETE!");
  console.log("================================================================================");
}

testRedesignedFlow().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e); process.exit(1); });
