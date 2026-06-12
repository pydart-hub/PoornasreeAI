const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Clearing DocumentIssue tables...");
  await prisma.documentIssueStep.deleteMany({});
  await prisma.documentIssue.deleteMany({});
  console.log("Cleared!");
  process.exit(0);
}
run();
