import { llmChat } from "./llm.service";

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

const translationCache = new Map<string, string>();

/**
 * Translates English text to a target language using unified LLM.
 * For English ("en"), it formats the string to sentence case.
 * Uses an in-memory cache to return recurring step translations instantly.
 */
export async function translateText(text: string, langCode: string): Promise<string> {
  if (!langCode || langCode === "en") {
    return toSentenceCase(text);
  }

  const cacheKey = `${langCode}:${text.trim()}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  const langName = LANG_NAMES[langCode] || langCode;

  const translationPrompt = `Translate the following text to ${langName}.
Output ONLY the ${langName} translation. Do not include any English or extra commentary.

Text to translate:
${text}

${langName} Translation:`;

  try {
    const t0 = Date.now();
    const translated = await llmChat(
      [{ role: "user", content: translationPrompt }],
      { temperature: 0.1, maxTokens: 400 }
    );
    console.log(`[Translate] LLM translateText to ${langName}: ${Date.now() - t0} ms`);
    const result = translated || text;
    if (result) {
      if (translationCache.size > 2000) {
        // Clear oldest entries if cache exceeds 2000 items
        const firstKey = translationCache.keys().next().value;
        if (firstKey) translationCache.delete(firstKey);
      }
      translationCache.set(cacheKey, result);
    }
    return result;
  } catch (e: unknown) {
    console.error(`[Translate] LLM translation failed:`, e);
    return text;
  }
}
