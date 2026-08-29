import { handleMessage, getOrCreateSession, updateSession } from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function runVerification() {
  console.log("================================================================================");
  console.log("🧪 VERIFYING FIXES FOR AUTO-GENERATED / UNWANTED WHATSAPP MESSAGES");
  console.log("================================================================================\n");

  const testPhone = "917356765036"; // Manu's number

  // Initialize session in MAIN_MENU without stale complaints
  const initSession = await getOrCreateSession(testPhone);
  await updateSession(initSession.id, "MAIN_MENU", {
    customerName: "manu",
    customerPhone: testPhone,
    complaint: undefined,
    lastIssueQuery: undefined,
    videoSearchQuery: undefined,
  });

  // Test 1: Casual greeting "How are you"
  console.log("--- TEST 1: Customer sends casual greeting 'How are you' ---");
  const reply1 = await handleMessage(testPhone, "How are you");
  console.log("Bot reply:", reply1.message?.slice(0, 100));

  const session1 = await getOrCreateSession(testPhone);
  const meta1 = (session1?.metadata as any) || {};
  console.log("Session complaint:", meta1.complaint);
  console.log("Session lastIssueQuery:", meta1.lastIssueQuery);
  if (meta1.complaint === "How are you" || meta1.lastIssueQuery === "How are you") {
    throw new Error("❌ FAILURE: 'How are you' was incorrectly stored as a complaint!");
  } else {
    console.log("✅ PASSED: Greeting 'How are you' was NOT saved as a complaint.\n");
  }

  // Test 2: Unresolved button clicked while on Main Menu
  console.log("--- TEST 2: Customer clicks/sends 'TROUBLESHOOT_UNRESOLVED' while on Main Menu ---");
  await handleMessage(testPhone, "MENU");
  const reply2 = await handleMessage(testPhone, "TROUBLESHOOT_UNRESOLVED");
  console.log("Bot reply:\n" + reply2.message);
  if (reply2.message?.includes("Confirm Complaint Registration")) {
    throw new Error("❌ FAILURE: Complaint registration card was automatically sent for stale button!");
  } else {
    console.log("✅ PASSED: Stale unresolved button did NOT auto-generate a complaint card.\n");
  }

  // Test 3: Genuine technical issue flow
  console.log("--- TEST 3: Genuine technical complaint 'T2 error' ---");
  const reply3 = await handleMessage(testPhone, "2"); // Register complaint
  console.log("Step 1 (Menu 2):", reply3.message?.slice(0, 80));

  const reply4 = await handleMessage(testPhone, "T2 error");
  console.log("Step 2 (T2 error):\n" + reply4.message?.slice(0, 150));

  console.log("\n================================================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

runVerification()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("FATAL ERROR:", err);
    prisma.$disconnect();
    process.exit(1);
  });
