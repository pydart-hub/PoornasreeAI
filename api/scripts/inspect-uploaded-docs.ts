import prisma from "../src/lib/prisma";

async function inspectDocs() {
  console.log("=== 1. UPLOADED DOCUMENTS in DB ===");
  const docs = await prisma.document.findMany({
    include: { _count: { select: { chunks: true, issues: true } } },
  });
  console.log(`Total Documents: ${docs.length}`);
  docs.forEach((d) => {
    console.log(`- ID: ${d.id}, Title: "${d.title}", Type: ${d.documentType}, Chunks: ${d._count.chunks}, Issues: ${d._count.issues}`);
  });

  console.log("\n=== 2. DOCUMENT ISSUES in DB (with steps) ===");
  const issues = await prisma.documentIssue.findMany({
    include: { steps: { orderBy: { stepNumber: "asc" } }, document: true },
  });
  console.log(`Total DocumentIssues: ${issues.length}`);
  issues.forEach((iss) => {
    console.log(`\n* [Issue] ID: ${iss.id}, ProblemType: "${iss.problemType}", Title: "${iss.title}", Audience: ${iss.audience}`);
    console.log(`  Doc: ${iss.document?.title || "None"}`);
    console.log(`  Steps (${iss.steps.length}):`);
    iss.steps.forEach((s) => {
      console.log(`    Step ${s.stepNumber}: ${s.stepContent}`);
    });
  });

  console.log("\n=== 3. DOCUMENT CHUNKS in DB (searching date / time) ===");
  const chunks = await prisma.documentChunk.findMany({
    where: {
      OR: [
        { content: { contains: "date", mode: "insensitive" } },
        { content: { contains: "time", mode: "insensitive" } },
        { content: { contains: "clock", mode: "insensitive" } },
        { content: { contains: "rtc", mode: "insensitive" } },
      ],
    },
    include: { document: true },
  });
  console.log(`Total Date/Time Chunks: ${chunks.length}`);
  chunks.forEach((c) => {
    console.log(`\n* [Chunk] Doc: "${c.document.title}" (${c.document.documentType})\nContent:\n${c.content}`);
  });

  process.exit(0);
}

inspectDocs().catch((err) => {
  console.error(err);
  process.exit(1);
});
