// ── Video Resource Controller ──────────────────────────────────────────────
// Admin CRUD for YouTube video recommendations.
// Also exports findVideosForQuery() used by message.controller to attach
// relevant videos to AI chat responses.

import { Request, Response } from "express";
import prisma from "../lib/prisma";

// ── Shared helper: YouTube URL validation ────────────────────────────────
export function isValidYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") && u.searchParams.has("v") ||
      u.hostname === "youtu.be"
    );
  } catch {
    return false;
  }
}

// ── Exported helper for message.controller ───────────────────────────────
/**
 * Given a user query, find up to `limit` matching VideoResources by
 * keyword overlap. Returns an empty array if no matches or DB has no videos.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "not", "how", "why", "what", "when",
  "where", "which", "can", "this", "that", "its", "was", "with",
  "have", "has", "from", "but", "our", "your", "my", "his", "her",
  "they", "them", "also", "any", "all", "get", "got", "did", "does",
  "will", "been", "who", "you", "too", "use", "used", "via",
  "in", "on", "at", "to", "of", "a", "an", "is", "it", "by", "as",
  "be", "or", "do", "if", "so", "no", "into", "onto", "some", "more",
  "hindi", "malayalam", "tamil", "telugu", "kannada", "bengali", "marathi",
  "english", "hinglish", "manglish", "words", "word", "language", "languages",
  "please", "tell", "say", "write", "translate", "translation", "repeat", "explain",
]);

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  vibro: ["stirrer", "vibration", "vibrating"],
  stirrer: ["vibro", "vibration", "vibrating"],
  printer: ["paper", "blank", "print", "printing"],
  blank: ["printer", "paper"],
  t2: ["temperature", "temp", "t2 error", "temp set"],
  temperature: ["t2", "temp", "hot"],
  hot: ["hot sample", "temperature", "heat"],
  sensor: ["water in sensor", "plunge", "sensor tube"],
  sample: ["sample not found", "sucking", "air in milk"],
  zero: ["water zero", "calibration", "zero calibration"],
  calibration: ["water zero", "zero calibration", "calibrate"],
  wifi: ["gsm", "cloud", "range", "network", "connectivity"],
  cleaning: ["clean", "maintenance", "flush", "cleaning solution"],
};

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Score how well a video matches a query (higher = better). Evaluates title + keywords with domain synonyms. */
export function scoreVideoMatch(query: string, title: string, keywords: string): number {
  const normQ = query.toLowerCase().trim();
  const normTitle = title.toLowerCase().trim();
  const normKw = (keywords || "").toLowerCase().trim();
  if (!normQ) return 0;

  let score = 0;

  // 1. Direct title contains whole query or vice versa (minimum 4 chars to prevent preposition false matches)
  if (normTitle && normQ.length >= 4 && (normTitle.includes(normQ) || (normQ.length >= normTitle.length && normQ.includes(normTitle)))) {
    score += 50;
  }

  // 2. Direct keyword phrase match (minimum 4 chars)
  if (normKw && normQ.length >= 4 && (normKw.includes(normQ) || (normQ.length >= normKw.length && normQ.includes(normKw)))) {
    score += 40;
  }

  const qWords = tokenizeQuery(normQ);
  const targetWords = tokenizeQuery(`${normTitle} ${normKw}`);
  if (qWords.length === 0) return score;

  // Expand query with domain synonyms
  const expandedQWords = new Set<string>(qWords);
  for (const w of qWords) {
    const syns = DOMAIN_SYNONYMS[w];
    if (syns) {
      syns.forEach((s) => expandedQWords.add(s));
    }
  }

  // Check word intersections
  for (const qw of expandedQWords) {
    const isExactTitleWord = targetWords.some((tw) => tw === qw);
    if (isExactTitleWord) {
      score += 15;
    } else if (qw.length >= 4 && normTitle.includes(qw)) {
      score += 8;
    }

    if (normKw.split(/[\s|,]+/).some((kw) => kw.trim() === qw)) {
      score += 10;
    } else if (qw.length >= 4 && normKw.includes(qw)) {
      score += 5;
    }

    for (const tw of targetWords) {
      if (tw === qw) {
        score += 8;
      } else if (qw.length >= 4 && tw.length >= 4 && (tw.includes(qw) || qw.includes(tw))) {
        score += 4;
      }
    }
  }

  return score;
}

/** Format matched videos for WhatsApp / plain-text chat replies. */
export function formatVideoSuggestions(
  videos: Array<{ title: string; youtubeUrl: string }>,
  lang: string = "en"
): string {
  if (videos.length === 0) return "";

  const headers: Record<string, string> = {
    en: "📺 *Related Troubleshooting Video:*",
    hi: "📺 *संबंधित वीडियो ट्यूटोरियल:*",
    ta: "📺 *தொடர்புடைய வீடியோ:*",
    kn: "📺 *ಸಂಬಂಧಿತ ವೀಡಿಯೊ:*",
    mr: "📺 *संबंधित व्हिडिओ:*",
    te: "📺 *సంబంధిత వీడియో:*",
    bn: "📺 *সম্পর্কিত ভিডিও:*",
  };

  const header = "\n\n" + (headers[lang] || headers.en);
  const lines = videos
    .map((v) => `▶️ *${v.title}*\n${v.youtubeUrl}`)
    .join("\n\n");

  return `${header}\n${lines}`;
}

// ── In-Memory Cache for Video Resources (1 Hour TTL) ─────────────────────
let cachedVideos: { data: any[]; expiresAt: number } | null = null;
const VIDEO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getCachedVideoResources(): Promise<any[]> {
  const now = Date.now();
  if (cachedVideos && cachedVideos.expiresAt > now) {
    return cachedVideos.data;
  }
  const data = await prisma.videoResource.findMany({
    orderBy: { createdAt: "desc" },
  });
  cachedVideos = { data, expiresAt: now + VIDEO_CACHE_TTL_MS };
  return data;
}

export function invalidateVideoCache(): void {
  cachedVideos = null;
}

/** Pre-warm video resources in background on server boot */
export async function preWarmVideoCache(): Promise<void> {
  try {
    console.log("[video.controller] Pre-warming video resource cache...");
    await getCachedVideoResources();
  } catch (err) {
    console.warn("[video.controller] Pre-warm failed (will retry on demand):", (err as Error).message);
  }
}

export async function findVideosForQuery(
  query: string,
  limit = 1
): Promise<{ id: string; title: string; description: string | null; youtubeUrl: string; keywords: string }[]> {
  try {
    const allVideos = await getCachedVideoResources();
    if (allVideos.length === 0) return [];

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery || normalizedQuery.length < 2) return [];

    const scored = allVideos
      .map((v) => ({
        video: v,
        score: scoreVideoMatch(normalizedQuery, v.title, v.keywords),
      }))
      .filter((s) => s.score >= 12)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      return scored.slice(0, limit).map((s) => ({
        id: s.video.id,
        title: s.video.title,
        description: s.video.description,
        youtubeUrl: s.video.youtubeUrl,
        keywords: s.video.keywords,
      }));
    }

    return [];
  } catch (err) {
    console.error("[VideoSearch] error:", err);
    return [];
  }
}

// ── GET /api/admin/videos ─────────────────────────────────────────────────
export async function listVideos(req: Request, res: Response): Promise<void> {
  try {
    const videos = await prisma.videoResource.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ videos });
  } catch (err) {
    console.error("listVideos error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/admin/videos ────────────────────────────────────────────────
export async function createVideo(req: Request, res: Response): Promise<void> {
  try {
    const { title, description, youtubeUrl, keywords } = req.body as {
      title?: string;
      description?: string;
      youtubeUrl?: string;
      keywords?: string;
    };

    if (!title?.trim() || !youtubeUrl?.trim() || !keywords?.trim()) {
      res.status(400).json({ error: "title, youtubeUrl, and keywords are required" });
      return;
    }

    if (!isValidYouTubeUrl(youtubeUrl.trim())) {
      res.status(400).json({ error: "Invalid YouTube URL. Use https://www.youtube.com/watch?v=... or https://youtu.be/..." });
      return;
    }

    const video = await prisma.videoResource.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        youtubeUrl: youtubeUrl.trim(),
        keywords: keywords.toLowerCase().trim(),
      },
    });

    invalidateVideoCache();
    res.status(201).json({ video });
  } catch (err) {
    console.error("createVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/admin/videos/:id ───────────────────────────────────────────
export async function updateVideo(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const { title, description, youtubeUrl, keywords } = req.body as {
      title?: string;
      description?: string;
      youtubeUrl?: string;
      keywords?: string;
    };

    const existing = await prisma.videoResource.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    if (youtubeUrl !== undefined && !isValidYouTubeUrl(youtubeUrl.trim())) {
      res.status(400).json({ error: "Invalid YouTube URL" });
      return;
    }

    const video = await prisma.videoResource.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() || null }),
        ...(youtubeUrl !== undefined && { youtubeUrl: youtubeUrl.trim() }),
        ...(keywords !== undefined && { keywords: keywords.toLowerCase().trim() }),
      },
    });

    invalidateVideoCache();
    res.json({ video });
  } catch (err) {
    console.error("updateVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/videos/:id ──────────────────────────────────────────
export async function deleteVideo(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;

    const existing = await prisma.videoResource.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    await prisma.videoResource.delete({ where: { id } });
    invalidateVideoCache();
    res.json({ success: true });
  } catch (err) {
    console.error("deleteVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
