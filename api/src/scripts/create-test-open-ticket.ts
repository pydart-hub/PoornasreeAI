import prisma from "../lib/prisma";
import { TicketStatus } from "@prisma/client";

async function run() {
  try {
    // 1. Get first user to act as customer
    const customer = await prisma.user.findFirst({
      where: { role: "admin" } // Or any user
    });
    if (!customer) {
      console.error("No customer/admin user found to attach ticket to!");
      process.exit(1);
    }
    
    // 2. Find an engineer if possible
    const engineer = await prisma.user.findFirst({
      where: { role: "service_engineer" }
    }) || await prisma.user.findFirst({
      where: { whatsappNumber: { not: null } }
    });

    const stamp = new Date().getTime();

    // 3. Create a CREATED (status: OPEN) ticket
    const openTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-TEST-OPEN-${stamp}`,
        customerId: customer.id,
        problemDescription: "Test Open Ticket: LCD screen flickers on startup",
        status: TicketStatus.OPEN,
        place: "Kochi",
        district: "Ernakulam",
        state: "Kerala",
        phoneNumber: "919000000001",
      }
    });
    console.log("Created OPEN ticket:", openTicket.ticketNumber);

    // 4. Create an ASSIGNED ticket if engineer exists
    if (engineer) {
      const assignedTicket = await prisma.ticket.create({
        data: {
          ticketNumber: `TKT-TEST-ASG-${stamp}`,
          customerId: customer.id,
          assignedEngineerId: engineer.id,
          problemDescription: "Test Assigned Ticket: Main fuse blowing repeatedly",
          status: TicketStatus.ASSIGNED,
          place: "Trivandrum",
          district: "Trivandrum",
          state: "Kerala",
          phoneNumber: "919000000002",
        }
      });
      console.log("Created ASSIGNED ticket:", assignedTicket.ticketNumber);
    } else {
      console.log("No engineer user found; skipped creating assigned ticket.");
    }
  } catch (err) {
    console.error("Error creating test tickets:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
