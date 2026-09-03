import { handleMessage } from "../src/services/simulate.service";

async function runTest() {
  const testPhone = `917999112244`;
  console.log("----------------------------------------------------------------");
  console.log("Testing Scenario: Customer clicks Register Complaint -> 'Date and time not sowing' -> 'TROUBLESHOOT_UNRESOLVED'");
  console.log("----------------------------------------------------------------");

  // Step 1: Skip registration
  await handleMessage(testPhone, "SKIP");

  // Step 2: Click Register Complaint
  await handleMessage(testPhone, "COMPLAINT_REG");

  // Step 3: Type the complaint: "Date and time not sowing"
  const res3 = await handleMessage(testPhone, "Date and time not sowing");
  console.log("\n[3. Sent 'Date and time not sowing']:\nResponse:\n", res3.message);
  console.log("Buttons:", res3.buttons?.map(b => `${b.id} (${b.title})`));

  // Step 4: Click Unresolved
  const res4 = await handleMessage(testPhone, "TROUBLESHOOT_UNRESOLVED");
  console.log("\n[4. Sent 'TROUBLESHOOT_UNRESOLVED']:\nResponse:\n", res4.message);
  console.log("Buttons:", res4.buttons?.map(b => `${b.id} (${b.title})`));

  const movedToRegistration = res4.message?.includes("register") || res4.message?.includes("Name") || res4.message?.includes("Serial") || res4.message?.includes("details");
  console.log("\n--- Verification Results ---");
  console.log("4. Seamlessly moved to Ticket/Service Registration:", movedToRegistration ? "PASSED ✅" : "FAILED ❌");

  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
