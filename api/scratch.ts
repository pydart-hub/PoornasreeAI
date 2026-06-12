import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const issues = await prisma.documentIssue.findMany({
    where: { audience: { in: ["engineer", "both"] } }
  });
  console.log("Total engineer issues:", issues.length);
  const titles = issues.map(i => i.title);
  console.log(titles.join("\n"));
}
main().finally(() => prisma.$disconnect());
