import { handleMessage, startFeedbackFlow } from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function testGoogleReviewFeedback() {
  console.log("================================================================================");
  console.log("🧪 TESTING GOOGLE REVIEW FEEDBACK GATING & CTA BUTTON IN CUSTOMER CHAT");
  console.log("================================================================================\n");

  const testPhone = "919999000888";
  const dummyTicketNumber = "TKT-TEST-9999";

  // Clean up any prior test artifacts
  await prisma.simulateMessage.deleteMany({ where: { phoneNumber: testPhone } }).catch(() => {});
  await prisma.conversationSession.deleteMany({ where: { phoneNumber: testPhone } }).catch(() => {});
  await prisma.ticket.deleteMany({ where: { ticketNumber: dummyTicketNumber } }).catch(() => {});

  // Create a temporary closed ticket for testing
  const dummyCustomer = await prisma.user.findFirst({ where: { role: "customer" } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: dummyTicketNumber,
      status: "CLOSED",
      problemDescription: "Test Issue for Feedback",
      issueDescription: "Test Issue for Feedback",
      customerId: dummyCustomer?.id || "dummy-cust-id",
      phoneNumber: testPhone,
    },
  });

  try {
    // ── Test 1: Rating 5 Stars (Should return Google Review CTA Button) ──────
    console.log("--- TEST 1: Customer rates 5 Stars ⭐⭐⭐⭐⭐ ---");
    await startFeedbackFlow(testPhone, ticket.id, ticket.ticketNumber);
    const reply5 = await handleMessage(testPhone, "5");

    console.log("BOT REPLY:", reply5.message);
    console.log("CTA BUTTON:", JSON.stringify(reply5.ctaButton));

    if (!reply5.ctaButton) {
      throw new Error("❌ FAILED: Rating 5 did not return a ctaButton!");
    }
    if (!reply5.ctaButton.url.includes("google.com/search") && !reply5.ctaButton.url.includes("/review")) {
      throw new Error(`❌ FAILED: Unexpected review URL: ${reply5.ctaButton.url}`);
    }
    if (reply5.ctaButton.displayText !== "Rate us on Google ⭐") {
      throw new Error(`❌ FAILED: Unexpected button text: ${reply5.ctaButton.displayText}`);
    }
    console.log("✅ TEST 1 PASSED: 5 Stars received Google Review CTA button!\n");

    // ── Test 2: Rating 4 Stars (Should return Google Review CTA Button) ──────
    console.log("--- TEST 2: Customer rates 4 Stars ⭐⭐⭐⭐ ---");
    await startFeedbackFlow(testPhone, ticket.id, ticket.ticketNumber);
    const reply4 = await handleMessage(testPhone, "4");
    if (!reply4.ctaButton) {
      throw new Error("❌ FAILED: Rating 4 did not return a ctaButton!");
    }
    console.log("✅ TEST 2 PASSED: 4 Stars received Google Review CTA button!\n");

    // ── Test 3: Rating 3 Stars (Should return Google Review CTA Button) ──────
    console.log("--- TEST 3: Customer rates 3 Stars ⭐⭐⭐ ---");
    await startFeedbackFlow(testPhone, ticket.id, ticket.ticketNumber);
    const reply3 = await handleMessage(testPhone, "3");
    console.log("BOT REPLY 3:", reply3.message);
    console.log("CTA BUTTON 3:", JSON.stringify(reply3.ctaButton));
    if (!reply3.ctaButton) {
      throw new Error("❌ FAILED: Rating 3 did not return a ctaButton!");
    }
    console.log("✅ TEST 3 PASSED: 3 Stars received Google Review CTA button!\n");

    // ── Test 4: Rating 2 Stars (Should NOT return Google Review CTA Button) ──
    console.log("--- TEST 4: Customer rates 2 Stars ⭐⭐ ---");
    await startFeedbackFlow(testPhone, ticket.id, ticket.ticketNumber);
    const reply2 = await handleMessage(testPhone, "2");
    console.log("BOT REPLY:", reply2.message);
    console.log("BUTTONS:", reply2.buttons?.map(b => b.title).join(" | "));

    if (reply2.ctaButton) {
      throw new Error("❌ FAILED: Rating 2 returned a ctaButton! Dissatisfied customer should NOT receive Google Review link!");
    }
    const hasSupportBtn = reply2.buttons?.some(b => b.id === "SUPPORT");
    if (!hasSupportBtn) {
      throw new Error("❌ FAILED: Rating 2 did not provide 'Speak to Support' button!");
    }
    console.log("✅ TEST 4 PASSED: 2 Stars suppressed Google Review link and provided support routing!\n");

    // ── Test 5: Rating 1 Star (Should NOT return Google Review CTA Button) ───
    console.log("--- TEST 5: Customer rates 1 Star ⭐ ---");
    await startFeedbackFlow(testPhone, ticket.id, ticket.ticketNumber);
    const reply1 = await handleMessage(testPhone, "1");
    if (reply1.ctaButton) {
      throw new Error("❌ FAILED: Rating 1 returned a ctaButton!");
    }
    console.log("✅ TEST 5 PASSED: 1 Star suppressed Google Review link!\n");

    // ── Check Ticket Database State ─────────────────────────────────────────
    const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    console.log("DB Ticket Feedback Rating:", updatedTicket?.feedbackRating);
    console.log("DB Ticket Feedback Comment:", updatedTicket?.feedbackComment);

    console.log("\n================================================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    console.log("================================================================================\n");
  } finally {
    // Clean up
    await prisma.simulateMessage.deleteMany({ where: { phoneNumber: testPhone } }).catch(() => {});
    await prisma.conversationSession.deleteMany({ where: { phoneNumber: testPhone } }).catch(() => {});
    await prisma.ticket.deleteMany({ where: { id: ticket.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

testGoogleReviewFeedback().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
