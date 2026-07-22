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

  const systemPrompt = `You are a strict topic-matching assistant for Poornasree, a milk analyzer/ECOD machine service company.
Engineers search for training videos via WhatsApp. Your job is to find videos whose Topic EXACTLY match.

Available training videos:
${videoList}

Matching Rules:
1. The "Topic" field may contain multiple distinct tags separated by commas (e.g. "Printer,Display"). Treat each tag as a separate topic.
2. If the query has spelling mistakes, mentally correct them first (e.g., "repots" -> "reports", "dispay" -> "display").
3. Find ALL videos that are relevant to the core concepts in the query.
4. Return ONLY a JSON array of matching video numbers (1-indexed). Example: [1, 3]
5. If NO videos match precisely, return an empty array: []
6. Maximum 5 matches. Prefer accuracy over quantity.`;

  const runQuery = async (query: string) => {
    const res = await fetch(GROQ_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROQ_MODEL, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Engineer query: "${query}"\n\nWhich video numbers match? Reply with only a JSON array.` } ], temperature: 0.0, max_tokens: 100 }) });
    const data: any = await res.json();
    console.log(`Query: "${query}" -> Matches:`, data.choices?.[0]?.message?.content);
  };

  await runQuery("printor");
}
testGroq();
