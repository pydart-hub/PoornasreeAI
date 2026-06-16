import axios from "axios";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const GEN_MODEL = "phi3:mini";

const LANG_NAMES: Record<string, string> = {
  hi: "Hindi", mr: "Marathi", bn: "Bengali", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam"
};

/**
 * Format string to Sentence Case:
 * "CHECK THE FUSE -> REPLACE THE FUSE" 
 * -> "Check the fuse -> Replace the fuse"
 */
export function toSentenceCase(text: string): string {
  if (!text) return text;
  // Lowercase the text first
  const lower = text.toLowerCase();
  
  // Split by common delimiters (like "->", ".", "\n", "- ") to capitalize sub-sentences if needed,
  // but for simplicity, we capitalize the first letter and letters after a period.
  return lower.replace(/(^\s*\w|[\.\!\?]\s*\w)/g, (c) => c.toUpperCase());
}

/**
 * Translates English text to a target language using the local LLM.
 * For English ("en"), it formats the string to sentence case.
 */
export async function translateText(text: string, langCode: string): Promise<string> {
  if (!langCode || langCode === "en") {
    return toSentenceCase(text);
  }

  const langName = LANG_NAMES[langCode] || langCode;
  
  const translationPrompt = `Translate the following troubleshooting instructions to ${langName}. 
Output ONLY the ${langName} translation. Do not include any English or extra commentary. 
IMPORTANT: Format the translation as clear, proper sentences with correct capitalization (do not use ALL CAPS).

Text to translate:
${text}

${langName} Translation:`;

  try {
    const t0 = Date.now();
    const { data } = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: GEN_MODEL,
        messages: [{ role: "user", content: translationPrompt }],
        stream: false,
        keep_alive: "10m",
        options: { num_ctx: 512, num_predict: 300, temperature: 0 },
      },
      { timeout: 120_000 }
    );
    console.log(`[Translate] translateText to ${langName}: ${Date.now() - t0} ms`);
    const translated = (data.message?.content as string)?.trim();
    return translated || text;
  } catch (err: any) {
    console.error(`[Translate] error translating to ${langName}:`, err?.message ?? err);
    return text;
  }
}
