import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const number = '9048740132';
  
  console.log(`Starting deletion for number containing: ${number}`);
  
  // 1. SimulateMessage
  const delSimulateMessage = await prisma.simulateMessage.deleteMany({
    where: { phoneNumber: { contains: number } }
  });
  console.log(`Deleted SimulateMessage: ${delSimulateMessage.count}`);

  // 2. TroubleshootingSession
  const delTroubleshootingSession = await prisma.troubleshootingSession.deleteMany({
    where: { phoneNumber: { contains: number } }
  });
  console.log(`Deleted TroubleshootingSession: ${delTroubleshootingSession.count}`);

  // 3. ManualComplaint
  const delManualComplaint = await prisma.manualComplaint.deleteMany({
    where: { phoneNumber: { contains: number } }
  });
  console.log(`Deleted ManualComplaint: ${delManualComplaint.count}`);

  // 4. ConversationSession
  const delConversationSession = await prisma.conversationSession.deleteMany({
    where: { phoneNumber: { contains: number } }
  });
  console.log(`Deleted ConversationSession: ${delConversationSession.count}`);

  // 5. Ticket
  const delTicket = await prisma.ticket.deleteMany({
    where: { phoneNumber: { contains: number } }
  });
  console.log(`Deleted Ticket: ${delTicket.count}`);

  // 6. MarketingLead
  const delMarketingLead = await prisma.marketingLead.deleteMany({
    where: { phone: { contains: number } }
  });
  console.log(`Deleted MarketingLead: ${delMarketingLead.count}`);

  // 7. User
  const delUser = await prisma.user.deleteMany({
    where: { whatsappNumber: { contains: number } }
  });
  console.log(`Deleted User: ${delUser.count}`);

  console.log('Done!');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
