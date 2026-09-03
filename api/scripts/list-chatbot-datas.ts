import prisma from "../src/lib/prisma";

async function listChatbotDatasChunks() {
  const doc = await prisma.document.findFirst({
    where: { title: "CHATBOT_DATAS" },
    include: { chunks: true },
  });

  if (!doc) {
    console.log("No CHATBOT_DATAS doc found!");
    return;
  }

  console.log(`CHATBOT_DATAS has ${doc.chunks.length} chunks:\n`);
  doc.chunks.forEach((c, i) => {
    const firstLine = c.content.split("\n")[0];
    console.log(`[${i + 1}] ID: ${c.id}`);
    console.log(`Content Preview: ${firstLine}`);
    console.log(c.content);
    console.log("----------------------------------------------------------------\n");
  });
}

listChatbotDatasChunks().catch(console.error);
