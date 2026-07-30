// ── Engineer Training Video Service ──────────────────────────────────────
// Uses Groq LLM to match engineer free-text queries to relevant training videos.
// Completely separate from RdVideo / troubleshooting video matching.

import prisma from "../lib/prisma";
import { groqChat, isGroqConfigured } from "./groq.service";

const GROQ_MODEL = "llama-3.1-8b-instant";

interface TrainingVideoMatch {
  id: string;
  title: string;
  description: string | null;
  youtubeUrl: string;
  topic: string;
}

/**
 * Use Groq LLM to find training videos that match an engineer's free-text query.
 * Returns matched videos (up to `limit`). Returns empty array if no match or no videos exist.
 */
export async function searchTrainingVideos(
  query: string,
  limit = 5,
): Promise<TrainingVideoMatch[]> {
  const allVideos = await prisma.engineerTrainingVideo.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (allVideos.length === 0) return [];

  const trimmedQuery = query.trim();
  if (!trimmedQuery || trimmedQuery.length < 2) return [];

  // If Groq API key not configured, fall back to simple keyword match
  if (!isGroqConfigured()) {
    return fallbackKeywordSearch(trimmedQuery, allVideos, limit);
  }

  try {
    return await groqSearch(trimmedQuery, allVideos, limit);
  } catch (err) {
    console.error("[training-video] Groq API error, falling back to keyword search:", err);
    return fallbackKeywordSearch(trimmedQuery, allVideos, limit);
  }
}

/** Groq LLM-powered intent matching */
async function groqSearch(
  query: string,
  videos: { id: string; title: string; description: string | null; youtubeUrl: string; topic: string }[],
  limit: number,
): Promise<TrainingVideoMatch[]> {
  const videoList = videos
    .map((v, i) => `${i + 1}. Title: "${v.title}" | Topic: "${v.topic}"${v.description ? ` | Description: "${v.description}"` : ""}`)
    .join("\n");

  const systemPrompt = `You are a generous topic-matching assistant for Poornasree.

Available training videos:
${videoList}

Matching Rules:
1. The "Topic" field may contain multiple distinct tags separated by commas (e.g. "Printer,Display"). Treat each tag as a separate topic.
2. If the query has spelling mistakes, mentally correct them first (e.g., "printor" -> "printer", "repots" -> "reports", "dispay" -> "display").
3. Find ALL videos that are relevant to the core concepts in the query. Do NOT filter out videos based on extra words like 'ECO D'. We want a broad initial match.
4. Return ONLY a JSON array of matching video numbers (1-indexed). Example: [1, 3]
5. If NO videos match precisely, return an empty array: []
6. Maximum ${limit} matches. Prefer accuracy over quantity.`;

  const resContent = await groqChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Engineer query: "${query}"\n\nWhich video numbers match? Reply with only a JSON array.` },
    ],
    {
      model: GROQ_MODEL,
      temperature: 0,
      maxTokens: 100,
    },
  );

  const content = resContent.trim();

  // Parse the JSON array from the response
  const jsonMatch = content.match(/\[[\d,\s]*\]/);
  if (!jsonMatch) {
    console.warn("[training-video] Groq returned non-JSON:", content);
    return [];
  }

  const indices: number[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(indices) || indices.length === 0) return [];

  const rawMatches = indices
    .filter((i) => i >= 1 && i <= videos.length)
    .map((i) => {
      const v = videos[i - 1];
      return {
        id: v.id,
        title: v.title,
        description: v.description,
        youtubeUrl: v.youtubeUrl,
        topic: v.topic,
      };
    });

  return filterSpecificVideos(query, rawMatches).slice(0, limit);
}

/**
 * Helper to dynamically filter specialized videos (e.g. "ECO D") out of general queries ("printer")
 * and prioritize specialized videos when explicitly requested ("ecod printer").
 */
function filterSpecificVideos(query: string, matches: TrainingVideoMatch[]): TrainingVideoMatch[] {
  if (matches.length <= 1) return matches;

  const normalize = (s: string) => s.toLowerCase().replace(/eco\s+d/g, "ecod").replace(/[^a-z0-9]+/g, " ").trim();
  const queryWords = normalize(query).split(" ");
  const stopWords = new Set(["and", "or", "the", "a", "an", "settings", "sms", "alert", "video", "training", "how", "to", "for", "with"]);
  const meaningfulQueryWords = queryWords.filter(w => !stopWords.has(w) && w.length > 1);

  if (meaningfulQueryWords.length === 0) return matches;

  // Identify specific product lines
  const specificProducts = ["ecod", "lactosure", "amcu", "dpcu"];
  const queryProducts = specificProducts.filter(p => queryWords.includes(p));

  const scoredMatches = matches.map(v => {
    const titleWordsList = normalize(v.title).split(" ").filter(w => w.length > 1);
    const topicWordsList = normalize(v.topic).split(" ").filter(w => w.length > 1);
    const allWordsList = [...titleWordsList, ...topicWordsList];
    const allWords = new Set(allWordsList);
    
    // Check if the video is for a specific product
    const videoProducts = specificProducts.filter(p => allWords.has(p));
    
    // A video is an "unwanted specific" if it is for a product the user didn't ask for.
    const hasUnwantedProduct = videoProducts.some(p => !queryProducts.includes(p));

    let extraCount = 0;
    for (const tw of allWords) {
      if (!stopWords.has(tw) && !meaningfulQueryWords.includes(tw)) {
        extraCount++;
      }
    }

    let missingCount = 0;
    for (const qw of meaningfulQueryWords) {
      if (!allWords.has(qw)) {
        missingCount++;
      }
    }

    return { v, extraCount, missingCount, hasUnwantedProduct };
  });

  // Sort by missingCount first
  scoredMatches.sort((a, b) => {
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    // Unwanted products go to the bottom
    if (a.hasUnwantedProduct && !b.hasUnwantedProduct) return 1;
    if (!a.hasUnwantedProduct && b.hasUnwantedProduct) return -1;
    return a.extraCount - b.extraCount;
  });

  // Take the best missingCount
  const minMissing = scoredMatches[0].missingCount;
  let bestMatches = scoredMatches.filter(m => m.missingCount === minMissing);

  // If we have generic matches, drop the unwanted specific ones entirely
  const hasGeneric = bestMatches.some(m => !m.hasUnwantedProduct);
  if (hasGeneric) {
    bestMatches = bestMatches.filter(m => !m.hasUnwantedProduct);
  }

  // Return the best matches, sorted by relevance
  return bestMatches.map(m => m.v);
}

/** Simple fallback: keyword overlap when Groq is unavailable */
function fallbackKeywordSearch(
  query: string,
  videos: { id: string; title: string; description: string | null; youtubeUrl: string; topic: string }[],
  limit: number,
): TrainingVideoMatch[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const queryLower = query.toLowerCase().trim();
  const queryWords = normalize(query).split(" ").filter((w) => w.length > 1);

  const rawMatches = videos.filter((v) => {
    const titleLower = v.title.toLowerCase();
    const topicLower = v.topic.toLowerCase();

    // Exact phrase match in title or topic
    if (titleLower.includes(queryLower) || topicLower.includes(queryLower)) {
      return true;
    }
    
    // Broad keyword matching
    if (queryWords.length > 0) {
      const titleWords = normalize(v.title).split(" ");
      const topicWords = normalize(v.topic).split(" ");
      const allWords = [...titleWords, ...topicWords];
      
      // Return true if any meaningful query word is found
      return queryWords.some(qw => allWords.includes(qw));
    }
    return false;
  }).map(v => ({
    id: v.id,
    title: v.title,
    description: v.description,
    youtubeUrl: v.youtubeUrl,
    topic: v.topic,
  }));

  return filterSpecificVideos(query, rawMatches).slice(0, limit);
}
