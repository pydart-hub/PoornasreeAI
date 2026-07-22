const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const customer = await prisma.user.findFirst({
      where: { role: 'admin' }
    });
    if (!customer) {
      console.error('No customer/admin user found to attach ticket to!');
      process.exit(1);
    }
    
    const engineer = await prisma.user.findFirst({
      where: { role: 'service_engineer' }
    }) || await prisma.user.findFirst({
      where: { whatsappNumber: { not: null } }
    });

    const stamp = new Date().getTime();

    // Create a CREATED ticket (OPEN status)
    const openTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-TEST-OPEN-${stamp}`,
        customerId: customer.id,
        problemDescription: 'Test Open Ticket: LCD screen flickers on startup',
        status: 'OPEN',
        place: 'Kochi',
        district: 'Ernakulam',
        state: 'Kerala',
        phoneNumber: '919000000001',
      }
    });
    console.log('Created OPEN ticket:', openTicket.ticketNumber);

    // Create an ASSIGNED ticket (ASSIGNED status)
    if (engineer) {
      const assignedTicket = await prisma.ticket.create({
        data: {
          ticketNumber: `TKT-TEST-ASG-${stamp}`,
          customerId: customer.id,
          assignedEngineerId: engineer.id,
          problemDescription: 'Test Assigned Ticket: Main fuse blowing repeatedly',
          status: 'ASSIGNED',
          place: 'Trivandrum',
          district: 'Trivandrum',
          state: 'Kerala',
          phoneNumber: '919000000002',
        }
      });
      console.log('Created ASSIGNED ticket:', assignedTicket.ticketNumber);
    } else {
      console.log('No engineer user found; skipped creating assigned ticket.');
    }
  } catch (err) {
    console.error('Error creating test tickets:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
