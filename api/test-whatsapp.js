const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const from = "918714440038";
  const normalizedFrom = from.replace(/\D/g, "");
  console.log("normalizedFrom:", normalizedFrom);

  const allEngineers = await prisma.user.findMany({
    where: { role: "service_engineer" },
    select: { id: true, firstName: true, whatsappNumber: true },
  });

  console.log("All Engineers:");
  console.table(allEngineers);

  const engineer = allEngineers.find(e => {
    if (!e.whatsappNumber) return false;
    const cleanDb = e.whatsappNumber.replace(/\D/g, "");
    return cleanDb === normalizedFrom || 
           cleanDb === normalizedFrom.replace(/^91/, "") || 
           `91${cleanDb}` === normalizedFrom;
  });

  console.log("Matched Engineer:", engineer);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
