import { env } from './src/config/env';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';
async function testGroq() {
  const videoList = `1. Title: "Printer and dispay settings" | Topic: "Printer,Display"
2. Title: "LACTOSURE ECO D display and printer settings and sms alert" | Topic: "display,printer,sms alert"
3. Title: "Reports" | Topic: "reports"
4. Title: "LACTOSURE ECOD REPORTS" | Topic: "eco d reports"
5. Title: "Charts" | Topic: "charts"`;

  const systemPrompt = `You are a strict topic-matching assistant for Poornasree, a milk analyzer/ECOD machine service company.
Engineers search for training videos via WhatsApp. Your job is to find videos whose Topic matches what the engineer is asking about.

Available training videos:
${videoList}

Matching Rules:
1. The "Topic" field may contain multiple distinct tags separated by commas (e.g. "Printer,Display"). Treat each tag as a separate topic.
2. If the query has spelling mistakes, mentally correct them first (e.g., "repots" -> "reports", "dispay" -> "display").
3. STRICT DISTINCTION ("ECO D" vs general): 
   - Topics that sound similar are DIFFERENT and must NOT be confused.
   - If the engineer types "Reports" -> return ONLY videos with Topic = "reports". DO NOT return "eco d reports".
   - If the engineer types "Printer" -> return ONLY videos with Topic = "printer". DO NOT return "eco d printer".
   - If the engineer types "ECO D" or "ecod" -> ONLY then return ECO D specific videos.
4. If they type "Printer and display", match the video whose topics cover "printer" and "display". DO NOT return ECO D videos unless they said "ECO D".
5. Return ONLY a JSON array of matching video numbers (1-indexed). Example: [1, 3]
6. If NO videos match precisely, return an empty array: []`;

  const runQuery = async (query: string) => {
    const res = await fetch(GROQ_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROQ_MODEL, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Engineer query: "${query}"\n\nWhich video numbers match? Reply with only a JSON array.` } ], temperature: 0.0, max_tokens: 100 }) });
    const data: any = await res.json();
    console.log(`Query: "${query}" -> Matches:`, data.choices?.[0]?.message?.content);
  };

  await runQuery("Printer and display");
  await runQuery("Printer");
  await runQuery("Reports");
  await runQuery("ecod reports");
  await runQuery("repots");
  await runQuery("Charts");
}
testGroq();
