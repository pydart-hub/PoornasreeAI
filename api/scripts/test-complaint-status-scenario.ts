import { handleMessage, getOrCreateSession, updateSession } from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function runTest() {
  const testPhone = `919048740132`; // Exact test phone from user screenshot
  console.log("================================================================");
  console.log("TEST: Verify Complaint Status button does not contaminate Issue Description");
  console.log("================================================================");

  // Setup: Simulate post-ticket booking state (ANOTHER_COMPLAINT_PROMPT)
  const session = await getOrCreateSession(testPhone);
  await updateSession(session.id, "ANOTHER_COMPLAINT_PROMPT", {
    customerName: "aph",
    customerPhone: testPhone,
    manualName: "aph",
    manualPincode: "676553",
    manualPlace: "Kadampuzha",
    manualDistrict: "Malappuram",
    manualState: "Kerala",
  });

  console.log("\n[Step 1: User is at post-ticket prompt and clicks 'COMPLAINT_STATUS']");
  const res1 = await handleMessage(testPhone, "COMPLAINT_STATUS");
  console.log("Response Preview:\n", res1.message?.slice(0, 200), "...");

  const isStatusCard = res1.message?.includes("Ticket") || res1.message?.includes("ticket") || res1.message?.includes("Active Tickets") || res1.message?.includes("Status");
  console.log("-> Returned Ticket Status:", isStatusCard ? "PASSED ✅" : "FAILED ❌");

  console.log("\n[Step 2: User now clicks 'Register a new complaint' / 'COMPLAINT_REG']");
  const res2 = await handleMessage(testPhone, "COMPLAINT_REG");
  console.log("Response Preview:\n", res2.message?.slice(0, 200), "...");

  const isNotContaminated = !res2.message?.includes("Issue Description: COMPLAINT_STATUS") && !res2.message?.includes("COMPLAINT_STATUS");
  const asksForDescription = res2.message?.includes("describe the issue") || res2.message?.includes("Please describe");
  
  console.log("-> Did NOT prefill 'COMPLAINT_STATUS':", isNotContaminated ? "PASSED ✅" : "FAILED ❌");
  console.log("-> Correctly prompted user to describe real issue:", asksForDescription ? "PASSED ✅" : "FAILED ❌");

  console.log("\n[Step 3: User enters their real issue 'Display not working']");
  const res3 = await handleMessage(testPhone, "Display not working");
  console.log("Response Preview:\n", res3.message?.slice(0, 300), "...");

  const capturedRealIssue = res3.message?.includes("Display not working") || res3.message?.includes("Confirm Complaint Registration") || res3.message?.includes("Serial");
  console.log("-> Real issue 'Display not working' captured properly:", capturedRealIssue ? "PASSED ✅" : "FAILED ❌");

  console.log("\n================================================================");
  if (isStatusCard && isNotContaminated && asksForDescription) {
    console.log("ALL TESTS PASSED SUCCESSFULLY! 🎉");
    process.exit(0);
  } else {
    console.error("TEST FAILED! ❌");
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
