import { handleMessage, getOrCreateSession, updateSession } from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function run() {
  const phone = "919048740132";
  console.log("==================================================================");
  console.log("TEST: Reset Stale Session and Test Menu -> Complaint Registration");
  console.log("==================================================================");

  // 1. Reset all conversation sessions for this phone to clean state
  const sessions = await prisma.conversationSession.findMany({
    where: {
      OR: [
        { phoneNumber: phone },
        { phoneNumber: "+919048740132" },
        { phoneNumber: "9048740132" },
      ],
    },
  });

  for (const s of sessions) {
    const meta = (s.metadata as any) || {};
    delete meta.complaint;
    delete meta.lastIssueQuery;
    delete meta.videoSearchQuery;
    await prisma.conversationSession.update({
      where: { id: s.id },
      data: {
        state: "MAIN_MENU",
        metadata: meta,
      },
    });
  }
  console.log(`[1] Cleared stale complaint metadata from ${sessions.length} sessions for ${phone}.`);

  // 2. Test sending "hi"
  console.log("\n[2] Sending 'hi'...");
  const greetingRes = await handleMessage(phone, "hi");
  console.log("Greeting Preview:", greetingRes.message?.slice(0, 120), "...");

  // 3. Test sending "Complaint Registration" (Menu selection)
  console.log("\n[3] Sending 'Complaint Registration' / 'COMPLAINT_REG'...");
  const regRes = await handleMessage(phone, "COMPLAINT_REG");
  console.log("Response Preview:\n", regRes.message);

  const asksForIssue = regRes.message?.includes("describe the issue") || regRes.message?.includes("Please describe");
  const noAutoAddedIssue = !regRes.message?.includes("Issue Description: Display not working") && !regRes.message?.includes("Confirm Complaint Registration");

  console.log("\n--- Verification Results ---");
  console.log("Asks user to describe issue:", asksForIssue ? "PASSED ✅" : "FAILED ❌");
  console.log("Did NOT auto-add old issue:", noAutoAddedIssue ? "PASSED ✅" : "FAILED ❌");

  if (asksForIssue && noAutoAddedIssue) {
    console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("\n❌ TEST FAILED!");
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Test failed with error:", e);
  process.exit(1);
});
