import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const recentSessions = await prisma.conversationSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5
  });

  console.log("Recent Sessions:");
  console.log(JSON.stringify(recentSessions, null, 2));

  const recentSimulateMessages = await prisma.simulateMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log("\nRecent Simulate Messages:");
  console.log(JSON.stringify(recentSimulateMessages, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
