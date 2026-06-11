const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { role: 'service_engineer' },
    select: { id: true, firstName: true, whatsappNumber: true }
  });
  console.log("Engineers:", users);
}

main().catch(console.error).finally(() => prisma.$disconnect());
