import prisma from "../lib/prisma";
import { loadRuntimeConfig } from "../services/runtime-config.service";
import { createTicket, notifyServiceManagerNewTicket } from "../services/ticket.service";

async function main() {
  await loadRuntimeConfig();

  console.log("=== [1/4] Inspecting Service Managers with WhatsApp Numbers ===");
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ["service_manager", "assistant_service_manager"] },
      whatsappNumber: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      email: true,
      whatsappNumber: true,
      engineerPincodes: { select: { code: true, place: true } },
    },
  });

  if (managers.length === 0) {
    console.warn("⚠️ Warning: No Service Managers found with a whatsappNumber configured in the database!");
    console.log("Tip: Add a WhatsApp number to a Service Manager via Admin > Users.");
  } else {
    console.log(`Found ${managers.length} Service Manager(s) configured for WhatsApp notifications:`);
    managers.forEach((m) => {
      const areas = m.engineerPincodes?.map((p) => p.code).join(", ") || "All Areas";
      console.log(` • [${m.role}] ${m.firstName} ${m.lastName || ""} | Phone: ${m.whatsappNumber} | Areas: ${areas}`);
    });
  }

  console.log("\n=== [2/4] Finding Customer / User Record for Ticket ===");
  let customer = await prisma.user.findFirst({
    where: { role: { in: ["customer", "admin"] } },
    select: { id: true, firstName: true, lastName: true, whatsappNumber: true },
  });

  if (!customer) {
    customer = await prisma.user.findFirst({
      select: { id: true, firstName: true, lastName: true, whatsappNumber: true },
    });
  }

  if (!customer) {
    console.error("❌ Error: No user found in database to attach ticket.");
    process.exit(1);
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);

  // Look for a pincode if available
  const pincode = await prisma.pincode.findFirst({
    select: { id: true, code: true, place: true, district: true, state: true },
  });

  console.log("\n=== [3/4] Creating Dummy Customer Service Ticket ===");
  const ticket = await createTicket({
    customerId: customer.id,
    problemDescription: `[Demo] Stirrer motor failure and display error code E-04 during milk fat analysis`,
    issueDescription: `Machine stops during test cycle. Error E-04 appears on LCD screen. Needs on-site sensor inspection and motor calibration.`,
    machineName: "LactoSure Eco",
    machineSerialNumber: `LSE-${stamp}-${randomSuffix}`,
    phoneNumber: customer.whatsappNumber || "919876543210",
    pincodeId: pincode?.id || undefined,
    place: pincode?.place || "Kozhikode",
    district: pincode?.district || "Kozhikode",
    state: pincode?.state || "Kerala",
    customerAddress: "Kozhikode Dairy Farmers Co-operative, Main Road",
  });

  console.log(`✅ Ticket successfully created!`);
  console.log(` • Ticket Number: ${ticket.ticketNumber}`);
  console.log(` • Status:        ${ticket.status}`);
  console.log(` • Machine:       ${ticket.machineName} (S/N: ${ticket.machineSerialNumber})`);
  console.log(` • Complaint:     ${ticket.problemDescription}`);

  console.log("\n=== [4/4] Triggering Live WhatsApp Alert to Service Managers ===");
  try {
    await notifyServiceManagerNewTicket(ticket.id);
    console.log("✅ notifyServiceManagerNewTicket executed successfully!");
    console.log("Check the Service Manager's WhatsApp to view the delivered ticket alert card.");
  } catch (err: any) {
    console.error("❌ notifyServiceManagerNewTicket error:", err?.message || err);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
