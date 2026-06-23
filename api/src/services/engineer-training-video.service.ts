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
Engineers search for training videos via WhatsApp. Your job is to find videos whose Topic EXACTLY matches what the engineer is asking about.

Available training videos:
${videoList}

Matching Rules:
1. The "Topic" field is the primary match key — it is set precisely by the admin.
2. Match the engineer's query against each video's Topic field. Correct obvious spelling mistakes (e.g. "repots" → "reports", "chanels" → "channels", "ecod channls" → "ecod channels").
3. STRICT DISTINCTION: Topics that sound similar are DIFFERENT and must NOT be confused:
   - Topic "reports" ≠ Topic "eco d reports" — these are separate videos.
   - If the engineer types "Reports" → return ONLY videos with Topic = "reports".
   - If the engineer types "ECO D Reports" or "ecod reports" → return ONLY videos with Topic = "eco d reports".
   - If the engineer types "ECO D" or "ecod" (without specifying a sub-topic) → match all ECO D related topics.
4. Do NOT return all videos that loosely share a word. Only include a video if the engineer's intent clearly matches that specific topic.
5. If the query has spelling errors, first mentally correct the spelling, then match strictly.
6. Return ONLY a JSON array of matching video numbers (1-indexed). Example: [1, 3, 5]
7. If NO videos match precisely, return an empty array: []
8. Maximum ${limit} matches. Prefer accuracy over quantity.`;

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
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  const scored = videos
    .map((v) => {
      const topicLower = v.topic.toLowerCase().trim();
      const titleLower = v.title.toLowerCase();
      const descLower = (v.description || "").toLowerCase();

      let score = 0;

      // ── Exact topic match: highest priority ────────────────────────────
      if (topicLower === queryLower) {
        score += 20;
      } else {
        // ── Word-level matching with specificity penalty ─────────────────
        // This prevents "reports" (1 word) from matching "eco d reports" (3 words).
        const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 1);
        const matchedWords = queryWords.filter((qw) => topicWords.some((tw) => tw === qw));
        const matchRatio = queryWords.length > 0 ? matchedWords.length / queryWords.length : 0;

        if (matchRatio === 1 && matchedWords.length > 0) {
          // All query words matched — penalize if topic is much more specific than query
          const extraWords = topicWords.length - queryWords.length;
          if (extraWords === 0) {
            score += 10; // Perfect word set match (e.g. query "reports" == topic "reports")
          } else if (extraWords === 1) {
            score += 4;  // Topic slightly more specific — allow
          }
          // extraWords > 1: no bonus (e.g. "reports" query vs "eco d reports" topic)
        } else if (matchRatio >= 0.5 && topicWords.length <= queryWords.length + 1) {
          // Partial match only if topic is not much broader than query
          score += Math.round(matchRatio * 3);
        }
      }

      // Title exact/partial match (secondary)
      if (titleLower === queryLower) score += 6;
      else if (titleLower.includes(queryLower)) score += 3;

      // Description match (lowest priority)
      if (descLower.includes(queryLower)) score += 1;

      return { video: v, score };
    })
    // Require a meaningful score to avoid returning all videos on weak overlap
    .filter((s) => s.score >= 10)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    id: s.video.id,
    title: s.video.title,
    description: s.video.description,
    youtubeUrl: s.video.youtubeUrl,
    topic: s.video.topic,
  }));
}
