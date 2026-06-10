import { extractTemplatesFromDocument, processDocument } from './src/services/document.service';
import prisma from './src/lib/prisma';
import fs from 'fs';

async function test() {
  console.log("Templates before:", await prisma.troubleshootingTemplate.count());
  
  // We use processDocument with mimetype for xlsx
  const mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const filePath = "C:/Users/abhis/OneDrive/Desktop/PoornasreeAI/data/training/CHATBOT_DATAS.xlsx";
  
  const result = await processDocument("test-doc-123", filePath, mimetype, "customer");
  console.log("Process result:", result);
  
  console.log("Templates after:", await prisma.troubleshootingTemplate.count());
}

test().catch(console.error).finally(() => prisma.$disconnect());
