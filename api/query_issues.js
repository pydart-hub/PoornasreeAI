const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const issues = await prisma.documentIssue.findMany();
  console.log("Total Issues:", issues.length);
  for (const i of issues.slice(0, 10)) {
    console.log(`- ${i.problemType} | ${i.title}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
