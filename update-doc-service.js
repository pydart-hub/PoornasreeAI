const fs = require('fs');

let content = fs.readFileSync('api/src/services/document.service.ts', 'utf8');

if (!content.includes('import axios')) {
    content = 'import axios from "axios";\n' + content;
}

if (!content.includes('async function extractIssuesFromLLM')) {
    const extractFunction = `
async function extractIssuesFromLLM(documentId: string, text: string, documentType: string) {
  const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
  const GEN_MODEL = "phi3:mini";

  const prompt = \`You are a technical support extraction system. 
Analyze the following document text and extract all distinct customer complaints, issues, or error codes, along with their step-by-step troubleshooting solutions.
Respond ONLY with a valid JSON array of objects, like this:
[
  {
    "problemType": "power_issue",
    "title": "Machine will not turn on",
    "description": "The machine shows no sign of power when plugged in.",
    "steps": ["Check power cable", "Verify wall outlet", "Check internal fuse"]
  }
]
If no clear troubleshooting instructions are found, output an empty array [].
DO NOT output any markdown blocks or explanations, just the raw JSON array.

TEXT:
\${text.substring(0, 10000)}\`;

  try {
    const { data } = await axios.post(\`\${OLLAMA_URL}/api/chat\`, {
      model: GEN_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
      keep_alive: "10m",
    });

    let raw = data.message.content.trim();
    if (raw.startsWith('\`\`\`json')) raw = raw.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '');
    
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[doc] Failed to parse LLM JSON output", e);
      return;
    }
    
    if (Array.isArray(parsed)) {
      const audience = documentType === "service" ? "engineer" : "customer";
      for (const item of parsed) {
         if (item.problemType && item.title && Array.isArray(item.steps) && item.steps.length > 0) {
            const problemTypeSlug = item.problemType.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50);
            
            const existing = await prisma.documentIssue.findUnique({
               where: { problemType: problemTypeSlug }
            });
            
            if (existing) {
               await prisma.documentIssueStep.deleteMany({ where: { issueId: existing.id } });
               await prisma.documentIssue.update({
                 where: { id: existing.id },
                 data: {
                   documentId,
                   title: item.title,
                   description: item.description,
                   audience,
                   steps: {
                     create: item.steps.map((s: string, i: number) => ({ stepNumber: i+1, stepContent: s }))
                   }
                 }
               });
            } else {
               await prisma.documentIssue.create({
                 data: {
                   documentId,
                   problemType: problemTypeSlug,
                   title: item.title,
                   description: item.description,
                   audience,
                   steps: {
                     create: item.steps.map((s: string, i: number) => ({ stepNumber: i+1, stepContent: s }))
                   }
                 }
               });
            }
         }
      }
    }
  } catch (e) {
    console.error("[doc] LLM Extraction failed:", e);
  }
}
`;
    content += extractFunction;
}

if (!content.includes('await extractIssuesFromLLM(')) {
    content = content.replace(
        /const text = await extractText\(buffer, mimetype\);\s*return embedTextChunks\(documentId, documentType, chunkText\(text\)\);/,
        `const text = await extractText(buffer, mimetype);
  // NEW: Also run LLM extraction to automatically populate DocumentIssues for dropdowns
  await extractIssuesFromLLM(documentId, text, documentType);
  return embedTextChunks(documentId, documentType, chunkText(text));`
    );
}

fs.writeFileSync('api/src/services/document.service.ts', content);
console.log('document.service.ts updated with LLM extraction');
