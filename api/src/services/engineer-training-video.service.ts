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

  const systemPrompt = `You are a technical assistant for a milk analyzer/ECOD machine service company called Poornasree.
Engineers ask about machine topics via WhatsApp. Your job is to match their query to relevant training videos.

Available training videos:
${videoList}

Instructions:
- The engineer's query may be a single word, a phrase, or a question.
- Match the query to the most relevant videos based on topic, title, and description.
- Return ONLY a JSON array of matching video numbers (1-indexed). Example: [1, 3, 5]
- If NO videos match the query, return an empty array: []
- Maximum ${limit} matches.
- Be generous with matching — if the query is even loosely related, include it.
- Common queries: "channels", "chart", "reports", "wifi", "weighing", "farmer", "shift", "printer", "display", "cleaning", "calibration", "test mode", "ecod"`;

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

/** Simple fallback: keyword overlap when Groq is unavailable */
function fallbackKeywordSearch(
  query: string,
  videos: { id: string; title: string; description: string | null; youtubeUrl: string; topic: string }[],
  limit: number,
): TrainingVideoMatch[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  const scored = videos
    .map((v) => {
      const topicLower = v.topic.toLowerCase();
      const titleLower = v.title.toLowerCase();
      const descLower = (v.description || "").toLowerCase();

      let score = 0;
      // Full phrase match
      if (topicLower.includes(queryLower) || queryLower.includes(topicLower)) score += 5;
      if (titleLower.includes(queryLower) || queryLower.includes(titleLower)) score += 4;
      if (descLower.includes(queryLower)) score += 3;

      // Word-level match
      for (const qw of queryWords) {
        if (topicLower.includes(qw)) score += 2;
        if (titleLower.includes(qw)) score += 1;
        if (descLower.includes(qw)) score += 1;
      }

      return { video: v, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    id: s.video.id,
    title: s.video.title,
    description: s.video.description,
    youtubeUrl: s.video.youtubeUrl,
    topic: s.video.topic,
  }));
}
