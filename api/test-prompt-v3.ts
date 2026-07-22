import { env } from './src/config/env';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';
async function testGroq() {
  const videoList = `1. Title: "Printer and dispay settings" | Topic: "Printer,Display"
2. Title: "LACTOSURE ECO D display and printer settings and sms alert" | Topic: "display,printer,sms alert"
3. Title: "Reports" | Topic: "reports"
4. Title: "LACTOSURE ECOD REPORTS" | Topic: "eco d reports"
5. Title: "Charts" | Topic: "charts"
6. Title: "Channels" | Topic: "channels"
7. Title: "ECO D Channels" | Topic: "eco d channels"`;

  const systemPrompt = `You are a precision video matching AI.

Videos:
${videoList}

Rules:
1. Compare the core concepts in the engineer's query to the core concepts in the video's Topic.
2. Comma-separated topics mean the video covers multiple concepts (e.g. "Printer,Display" covers Printer AND Display).
3. IGNORE TYPOS: Mentally fix typos ("repots" -> "reports", "dispay" -> "display").
4. STRICT SPECIFICITY RULE: A video matches the query ONLY if they share the EXACT SAME machine type / specificity.
   - If the query mentions a specific machine type (e.g., "ECO D", "Lactosure", "Ecod"), you MUST ONLY match videos that have that machine type in their Topic or Title.
   - If the query is GENERAL and does NOT mention a specific machine type (e.g., "reports", "printer", "printer and display", "channels"), you MUST ONLY match videos that are ALSO GENERAL (i.e., videos that DO NOT have "ECO D", "Lactosure", etc. in their Topic or Title).
5. Return ONLY a valid JSON array of matching video numbers. Example: [1, 3]`;

  const runQuery = async (query: string) => {
    const res = await fetch(GROQ_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROQ_MODEL, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Query: "${query}"\n\nWhich video numbers match? Reply with only a JSON array.` } ], temperature: 0.0, max_tokens: 100 }) });
    const data: any = await res.json();
    console.log(`Query: "${query}" -> Matches:`, data.choices?.[0]?.message?.content);
  };

  await runQuery("Printer");
  await runQuery("ECO D Printer");
  await runQuery("Reports");
  await runQuery("ecod reports");
  await runQuery("repots");
  await runQuery("Printer and display");
  await runQuery("channels");
  await runQuery("eco d channels");
}
testGroq();
