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

  const systemPrompt = `You are a precision video matching assistant.
Available Videos:
\${videoList}

Rules:
1. Identify the core concepts in the query (fix typos if any).
2. Evaluate EACH video against the query.
3. A video is "Specialized" if its Title/Topic has a specific Machine Type (e.g. ECO D, Lactosure). Otherwise it is "General".
4. If the query does NOT mention the Machine Type, you MUST NOT return the Specialized video.
5. If the query DOES mention the Machine Type, you MUST ONLY return the Specialized video for that type.

Output MUST be a JSON object with this exact structure:
{
  "evaluations": [
    {
      "videoId": 1,
      "video_type": "General or Specialized (specify type)",
      "query_type": "General or Specialized (specify type)",
      "concept_match": true/false,
      "type_match": true/false,
      "should_return": true/false
    }
  ],
  "matches": [1, 3] // Array of video IDs where should_return is true
}`;

  const runQuery = async (query: string) => {
    const res = await fetch(GROQ_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROQ_MODEL, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Query: "${query}"` } ], temperature: 0.0, response_format: { type: "json_object" } }) });
    const data: any = await res.json();
    console.log(`\n=== Query: "${query}" ===\n`, data.choices?.[0]?.message?.content);
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
