// ── Engineer Training Video Service ──────────────────────────────────────
// Uses Groq LLM to match engineer free-text queries to relevant training videos.
// Completely separate from RdVideo / troubleshooting video matching.

import prisma from "../lib/prisma";
import { env } from "../config/env";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
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
  if (!env.GROQ_API_KEY) {
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
6. Maximum ${limit} matches. Prefer accuracy over quantity.`;

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Engineer query: "${query}"\n\nWhich video numbers match? Reply with only a JSON array.` },
      ],
      temperature: 0.0,
      max_tokens: 100,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${errBody}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";

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
  const stopWords = new Set(["and", "or", "the", "a", "an", "settings", "sms", "alert", "video", "training", "how", "to", "for"]);
  const meaningfulQueryWords = queryWords.filter(w => !stopWords.has(w) && w.length > 1);

  if (meaningfulQueryWords.length === 0) return matches;

  const scoredMatches = matches.map(v => {
    const videoWordsList = normalize(`${v.title} ${v.topic}`).split(" ").filter(w => w.length > 1);
    const videoWords = new Set(videoWordsList);
    
    let extraCount = 0;
    for (const vw of videoWordsList) {
      if (!stopWords.has(vw) && !meaningfulQueryWords.includes(vw)) {
        extraCount++;
      }
    }

    let missingCount = 0;
    for (const qw of meaningfulQueryWords) {
      if (!videoWords.has(qw)) {
        missingCount++;
      }
    }

    return { v, extraCount, missingCount };
  });

  // First, find videos that match the most query words (minimize missingCount)
  const minMissing = Math.min(...scoredMatches.map(m => m.missingCount));
  const bestCoverage = scoredMatches.filter(m => m.missingCount === minMissing);

  // Second, among those with best coverage, prefer videos that aren't overly specific (minimize extraCount)
  const minExtra = Math.min(...bestCoverage.map(m => m.extraCount));
  
  // Allow slightly higher extra count (e.g. +1) to handle varying descriptions, but filter out heavily specific ones
  return bestCoverage
    .filter(m => m.extraCount <= minExtra + 1)
    .map(m => m.v);
}

/** Simple fallback: keyword overlap when Groq is unavailable */
function fallbackKeywordSearch(
  query: string,
  videos: { id: string; title: string; description: string | null; youtubeUrl: string; topic: string }[],
  limit: number,
): TrainingVideoMatch[] {
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  const rawMatches = videos.filter((v) => {
    const topicLower = v.topic.toLowerCase().trim();
    const titleLower = v.title.toLowerCase();

    // Broad matching: Does it contain the exact query string, or at least one significant query word?
    if (topicLower.includes(queryLower) || titleLower.includes(queryLower)) {
      return true;
    }
    
    if (queryWords.length > 0) {
      const topicWords = topicLower.split(/\s+/);
      return queryWords.some(qw => topicWords.includes(qw));
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
