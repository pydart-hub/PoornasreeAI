const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const complaints = await prisma.manualComplaint.findMany({
    orderBy: { createdAt: "desc" },
  });
  console.log("Total complaints in DB:", complaints.length);
  console.log("Complaints:", JSON.stringify(complaints, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
