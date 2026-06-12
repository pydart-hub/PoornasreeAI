const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const issues = await prisma.documentIssue.findMany();
  for (const issue of issues) {
    if (issue.title === 'COMPLAINT' || issue.title === 'Patterns' || issue.title.startsWith('COMPLAINT |')) {
      console.log('Deleting:', issue.title);
      await prisma.documentIssueStep.deleteMany({where:{issueId:issue.id}});
      await prisma.documentIssue.delete({where:{id:issue.id}});
    }
  }
}
run().then(() => prisma.$disconnect());
