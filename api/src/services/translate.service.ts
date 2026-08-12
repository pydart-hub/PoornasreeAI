import { groqChat, isGroqConfigured } from "./groq.service";

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
 * Translates English text to a target language using Groq Flagship LLM (Llama 3.3 70B).
 * For English ("en"), it formats the string to sentence case.
 */
export async function translateText(text: string, langCode: string): Promise<string> {
  if (!langCode || langCode === "en") {
    return toSentenceCase(text);
  }

  const langName = LANG_NAMES[langCode] || langCode;

  if (!isGroqConfigured()) {
    return text;
  }

  const translationPrompt = `Translate the following text to ${langName}.
Output ONLY the ${langName} translation. Do not include any English or extra commentary.

Text to translate:
${text}

${langName} Translation:`;

  try {
    const t0 = Date.now();
    const translated = await groqChat(
      [{ role: "user", content: translationPrompt }],
      { temperature: 0.1, maxTokens: 400, timeoutMs: 15_000 }
    );
    console.log(`[Translate] Groq Llama 3.3 70B translateText to ${langName}: ${Date.now() - t0} ms`);
    return translated || text;
  } catch (e: unknown) {
    console.error(`[Translate] Groq translation failed:`, e);
    return text;
  }
}
