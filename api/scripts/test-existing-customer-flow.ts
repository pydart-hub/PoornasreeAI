import { handleMessage } from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function testExistingCustomerFlow() {
  console.log("================================================================================");
  console.log("🧪 TESTING EXISTING / REGISTERED CUSTOMER COMPLAINT REGISTRATION FLOW");
  console.log("================================================================================\n");

  const testPhone = "919447000111"; // Phone from previous test that has a registered ticket/profile in DB

  // Step 1: User sends a complaint directly from Menu or chat
  console.log("--- 1. Registered Customer selects '2' (Register Complaint) ---");
  const step1 = await handleMessage(testPhone, "2");
  console.log("BOT:", step1.message, "\n");

  console.log("--- 2. Customer describes issue: 'T2 error' ---");
  const step2 = await handleMessage(testPhone, "T2 error");
  console.log("BOT:\n" + step2.message);
  console.log("BUTTONS:", step2.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 3. Customer clicks '❌ Unresolved' ---");
  const step3 = await handleMessage(testPhone, "TROUBLESHOOT_UNRESOLVED");
  console.log("BOT (AUTO-FETCHED DETAILS):\n" + step3.message);
  console.log("BUTTONS:", step3.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 4. Customer Skips Serial Number ---");
  const step4 = await handleMessage(testPhone, "SKIP");
  console.log("BOT (CONFIRMATION CARD):\n" + step4.message);
  console.log("BUTTONS:", step4.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("--- 5. Customer clicks '✅ Confirm' ---");
  const step5 = await handleMessage(testPhone, "CONFIRM_BOOK_TICKET");
  console.log("BOT (TICKET CREATED):\n" + step5.message);
  console.log("BUTTONS:", step5.buttons?.map((b: any) => b.title).join(" | "), "\n");

  console.log("================================================================================");
  console.log("✅ EXISTING CUSTOMER AUTO-FETCH FLOW TEST PASSED!");
  console.log("================================================================================");
}

testExistingCustomerFlow().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e); process.exit(1); });
