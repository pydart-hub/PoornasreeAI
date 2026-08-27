// ── Engineer Training Video Service ──────────────────────────────────────
// Uses Groq LLM & semantic specificity filtering to match engineer queries
// (e.g. "channels", "chart settings", "wifi", "reports") to relevant training videos.
// Completely separate from RdVideo (troubleshooting recommendations).

import prisma from "../lib/prisma";
import { env } from "../config/env";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export interface TrainingVideoMatch {
  id: string;
  title: string;
  description: string | null;
  youtubeUrl: string;
  topic: string;
  score?: number;
}

/**
 * Find training videos that match an engineer's query.
 * Uses Groq LLM with fallback to smart keyword and token matching.
 */
export async function searchTrainingVideos(
  query: string,
  limit = 5
): Promise<TrainingVideoMatch[]> {
  const allVideos = await prisma.engineerTrainingVideo.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (allVideos.length === 0) return [];

  const trimmedQuery = query.trim();
  if (!trimmedQuery || trimmedQuery.length < 2) return [];

  // Fallback if Groq API key is not configured
  if (!env.GROQ_API_KEY) {
    return fallbackKeywordSearch(trimmedQuery, allVideos, limit);
  }

  try {
    const results = await groqSearch(trimmedQuery, allVideos, limit);
    if (results.length > 0) return results;
    return fallbackKeywordSearch(trimmedQuery, allVideos, limit);
  } catch (err) {
    console.error("[training-video] Groq search error, falling back to keyword search:", err);
    return fallbackKeywordSearch(trimmedQuery, allVideos, limit);
  }
}

/** Groq LLM-powered topic and semantic matching */
async function groqSearch(
  query: string,
  videos: { id: string; title: string; description: string | null; youtubeUrl: string; topic: string }[],
  limit: number
): Promise<TrainingVideoMatch[]> {
  const videoList = videos
    .map(
      (v, i) =>
        `${i + 1}. Title: "${v.title}" | Topic: "${v.topic}"${v.description ? ` | Description: "${v.description}"` : ""}`
    )
    .join("\n");

  const systemPrompt = `You are a technical assistant for Poornasree milk analyzer equipment.
Engineers search for machine training videos by typing keywords or questions (e.g., "channels", "chart settings", "wifi", "reports", "cleaning", "weighing scale").

Available training videos:
${videoList}

Instructions:
- Match the engineer's query to the most relevant videos.
- Return ONLY a JSON array of matching video numbers (1-indexed). Example: [1, 3, 5]
- If no videos match, return [].
- Return at most ${limit} matching video indices.`;

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
        { role: "user", content: `Engineer query: "${query}"` },
      ],
      temperature: 0.1,
      max_tokens: 120,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${errBody}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";

  const jsonMatch = content.match(/\[[\d,\s]*\]/);
  if (!jsonMatch) {
    return [];
  }

  const indices: number[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(indices) || indices.length === 0) return [];

  return indices
    .filter((i) => i >= 1 && i <= videos.length)
    .slice(0, limit)
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
}

/** Fallback keyword / token overlap matching */
export function fallbackKeywordSearch(
  query: string,
  videos: { id: string; title: string; description: string | null; youtubeUrl: string; topic: string }[],
  limit: number
): TrainingVideoMatch[] {
  const queryLower = query.toLowerCase().trim();
  const queryTokens = queryLower
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const scored = videos
    .map((v) => {
      const topicLower = v.topic.toLowerCase();
      const titleLower = v.title.toLowerCase();
      const descLower = (v.description || "").toLowerCase();

      let score = 0;

      // Exact substring match in topic is highest priority
      if (topicLower.includes(queryLower)) score += 25;
      if (titleLower.includes(queryLower)) score += 15;
      if (descLower.includes(queryLower)) score += 10;

      // Individual token match
      for (const token of queryTokens) {
        if (topicLower.includes(token)) score += 8;
        if (titleLower.includes(token)) score += 4;
        if (descLower.includes(token)) score += 2;
      }

      return { video: v, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    id: s.video.id,
    title: s.video.title,
    description: s.video.description,
    youtubeUrl: s.video.youtubeUrl,
    topic: s.video.topic,
    score: s.score,
  }));
}
