import { handleMessage, getOrCreateSession, updateSession } from "../src/services/simulate.service";

async function testSkipSerialFlow() {
  const testPhone = `917999887766`;
  console.log("----------------------------------------------------------------");
  console.log("Testing Scenario: Registered customer clicks Skip Serial during complaint registration");
  console.log("----------------------------------------------------------------");

  // Setup: Simulate registered user session with known Name & Pincode and complaint
  const session = await getOrCreateSession(testPhone);
  await updateSession(session.id, "COMPLAINT_ASK_SERIAL", {
    customerName: "Aph",
    manualName: "Aph",
    manualPincode: "676553",
    regPincode: "676553",
    manualPlace: "Kadampuzha",
    regPlace: "Kadampuzha",
    manualDistrict: "Malappuram",
    regDistrict: "Malappuram",
    manualState: "Kerala",
    regState: "Kerala",
    complaint: "Date and time not showing",
  });

  // Step 1: User sends SKIP / Skip Serial
  console.log("\n[Customer sends 'SKIP' / 'Skip Serial']");
  const res = await handleMessage(testPhone, "SKIP");

  console.log("\nBot Response:\n", res.message);
  console.log("\nBot Buttons:\n", res.buttons?.map(b => `${b.id} (${b.title})`));

  const isConfirmationCard = res.message?.includes("Confirm Complaint Registration") || res.message?.includes("Customer Name: Aph");
  const askedSerialAgain = res.message?.includes("Please enter your Machine Serial Number");
  const hasConfirmButton = res.buttons?.some(b => b.id === "CONFIRM_REGISTER_TICKET_YES" || b.id.includes("CONFIRM"));

  console.log("\n--- Verification Results ---");
  console.log("1. Avoided repeating serial question:", !askedSerialAgain ? "PASSED ✅" : "FAILED ❌");
  console.log("2. Advanced to Confirmation Card:", isConfirmationCard ? "PASSED ✅" : "FAILED ❌");
  console.log("3. Has Confirm Ticket action:", hasConfirmButton ? "PASSED ✅" : "FAILED ❌");

  if (!askedSerialAgain && isConfirmationCard) {
    console.log("\n🎉 TEST PASSED! No infinite loop on Skip Serial.");
    process.exit(0);
  } else {
    console.error("\n❌ TEST FAILED!");
    process.exit(1);
  }
}

testSkipSerialFlow().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
