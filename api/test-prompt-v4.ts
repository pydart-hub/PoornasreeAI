import { env } from './src/config/env';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';
async function testGroq() {
  const videoList = `[1] Title: "Printer and dispay settings" | Topic: "Printer,Display"
[2] Title: "LACTOSURE ECO D display and printer settings and sms alert" | Topic: "display,printer,sms alert"
[3] Title: "Reports" | Topic: "reports"
[4] Title: "LACTOSURE ECOD REPORTS" | Topic: "eco d reports"
[5] Title: "Charts" | Topic: "charts"
[6] Title: "Channels" | Topic: "channels"
[7] Title: "ECO D Channels" | Topic: "eco d channels"`;

  const systemPrompt = `You are a strict video matching assistant.

Videos:
${videoList}

Rules:
1. Fix typos in the query (e.g., 'repots'->'reports').
2. Match the core concepts of the query to the videos.
3. CRITICAL RULE ON SPECIALIZED VIDEOS:
   Some videos are specialized for specific products (e.g., they contain "ECO D", "Ecod", "Lactosure" in their title/topic).
   - If the query DOES NOT mention the specific product (e.g., query is just "printer" or "reports" or "channels"), you MUST NOT return the specialized videos (e.g., do not return the ECO D videos). You can only return the general videos.
   - If the query DOES mention the specific product (e.g., "ecod printer", "eco d channels"), you MUST ONLY return the specialized videos for that product.
4. Output ONLY a valid JSON array of matching video IDs. Example: [1, 3]`;

  const runQuery = async (query: string) => {
    const res = await fetch(GROQ_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROQ_MODEL, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Query: "${query}"\n\nWhich video IDs match? Reply with only a JSON array.` } ], temperature: 0.0, max_tokens: 100 }) });
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
