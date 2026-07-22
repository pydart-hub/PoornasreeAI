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

  const systemPrompt = `You are an intelligent video matching assistant.

Available Videos:
\${videoList}

Rules:
1. Identify the core concepts in the query (fix typos if any).
2. Identify if the query specifies a Machine Type (e.g., "ECO D", "Lactosure"). If it does not, the query is "General".
3. A video is "Specialized" if its Title or Topic contains a specific Machine Type (e.g., ECO D). Otherwise it is "General".
4. MATCHING LOGIC:
   - If the query is General, you MUST ONLY return General videos. DO NOT return Specialized videos.
   - If the query specifies a Machine Type, you MUST ONLY return videos Specialized for that exact Machine Type.
5. You must output valid JSON containing your step-by-step reasoning and the final array of matching video IDs.

Example JSON output:
{
  "reasoning": "The query 'printer' is General. Video 1 is General. Video 2 is Specialized (ECO D). Therefore, only Video 1 matches.",
  "matches": [1]
}`;

  const runQuery = async (query: string) => {
    const res = await fetch(GROQ_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROQ_MODEL, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Query: "${query}"\n\nProvide the JSON response.` } ], temperature: 0.0, response_format: { type: "json_object" } }) });
    const data: any = await res.json();
    console.log(`Query: "${query}" ->\n`, data.choices?.[0]?.message?.content, '\n');
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
