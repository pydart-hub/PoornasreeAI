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

/**
 * Generic domain words that describe machines, milk, or general errors.
 * These must NOT qualify or drive video recommendations on their own.
 */
export const GENERIC_DOMAIN_WORDS = new Set([
  "error", "errors", "problem", "problems", "issue", "issues",
  "fault", "faults", "damage", "showing", "shown", "shwoing",
  "guide", "tutorial", "troubleshoot", "troubleshooting",
  "video", "videos", "lactosure", "lactogrand", "analyzer", "analyzers",
  "machine", "machines", "milk", "milks", "device", "unit", "help",
  "fix", "please", "support", "service", "customer"
]);

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  sample: ["sample not found", "sample", "sucking", "suction", "sample error"],
  vibro: ["stirrer", "vibration", "vibrating", "not vibrating", "stirrer on but not vibrating"],
  stirrer: ["vibro", "vibration", "vibrating", "not vibrating", "stirrer on but not vibrating"],
  vibrating: ["vibro", "stirrer", "vibration", "not vibrating"],
  vibration: ["vibro", "stirrer", "vibrating", "not vibrating"],
  printer: ["paper", "blank", "print", "printing", "printer paper coming out blank"],
  blank: ["printer", "paper", "printer paper coming out blank"],
  paper: ["printer", "blank", "printer paper coming out blank"],
  t2: ["t2", "t2 error", "temperature error"],
  hot: ["hot sample", "temperature high", "high temp", "warm", "too hot", "hot sample error"],
  temperature: ["temp", "heat", "t2", "hot sample"],
  temp: ["temperature", "heat", "t2", "hot sample"],
  sensor: ["sensor", "plunge", "tube", "water in sensor"],
  zero: ["water zero", "zero calibration", "calibration"],
  calibration: ["water zero", "zero calibration", "calibrate", "recalibrate"],
  wifi: ["gsm", "cloud", "range", "network", "connectivity", "wifi range not showing"],
  cleaning: ["clean", "maintenance", "flush", "daily cleaner", "solution"],
  battery: ["power", "charging", "charger", "adapter", "battery drain", "not on", "machine not turning on"],
  power: ["battery", "charger", "adapter", "not on", "turn on", "machine not turning on"],
  air: ["air in milk", "bubbles", "air error"],
  fat: ["snf", "reading variation", "calibration", "accuracy"],
  snf: ["fat", "reading variation", "calibration", "accuracy"],
};

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Score how well a video matches a query (higher = better).
 * Requires substantive topic matching — generic words alone ("error", "sample", "analyzer")
 * will NEVER qualify a video.
 */
export function scoreVideoMatch(query: string, title: string, keywords: string): number {
  const normQ = query.toLowerCase().trim();
  const normTitle = title.toLowerCase().trim();
  const normKw = (keywords || "").toLowerCase().trim();
  if (!normQ) return 0;

  const qWords = tokenizeQuery(normQ);
  if (qWords.length === 0) return 0;

  // Extract substantive query words (excluding stop words and generic domain terms)
  const substantiveQWords = qWords.filter((w) => !GENERIC_DOMAIN_WORDS.has(w));
  // A query consisting only of generic words (e.g. "error", "machine error", "sample error")
  // must NEVER trigger a specific troubleshooting video
  if (substantiveQWords.length === 0) return 0;

  const targetWords = tokenizeQuery(`${normTitle} ${normKw}`);
  const substantiveTargetWords = targetWords.filter((w) => !GENERIC_DOMAIN_WORDS.has(w));
  if (substantiveTargetWords.length === 0) return 0;

  // Specificity guard: "Hot Sample Error" video requires "hot" / "warm" in query
  const isHotVideo = normTitle.includes("hot") || normKw.includes("hot sample");
  const queryHasHot = normQ.includes("hot") || normQ.includes("warm") || normQ.includes("heat");
  if (isHotVideo && !queryHasHot) {
    return 0;
  }

  // Direct full-phrase match in title or keywords (e.g. "hot sample error", "t2 error", "water zero")
  if (normTitle && normQ.length >= 4 && (normTitle.includes(normQ) || (normQ.length >= normTitle.length && normQ.includes(normTitle)))) {
    return 120;
  }
  if (normKw && normQ.length >= 4 && (normKw.includes(normQ) || (normQ.length >= normKw.length && normQ.includes(normKw)))) {
    return 100;
  }

  // Expand query's substantive words with domain synonyms
  const expandedSubstantive = new Set<string>(substantiveQWords);
  for (const w of substantiveQWords) {
    const syns = DOMAIN_SYNONYMS[w];
    if (syns) {
      for (const s of syns) {
        tokenizeQuery(s).forEach((sw) => {
          if (!GENERIC_DOMAIN_WORDS.has(sw)) {
            expandedSubstantive.add(sw);
          }
        });
      }
    }
  }

  // Count overlapping substantive words
  let substantiveMatches = 0;
  for (const qw of expandedSubstantive) {
    if (substantiveTargetWords.includes(qw)) {
      substantiveMatches++;
    }
  }

  // STRICT REJECTION: If the customer query contains specific problem words (e.g. "keypad", "sensor", "display")
  // and ZERO of them match the video's substantive topic, reject immediately!
  if (substantiveMatches === 0) {
    return 0;
  }

  let score = substantiveMatches * 35;

  // Title coverage bonus: if a majority of the video's substantive title words are matched
  const titleSubstantive = tokenizeQuery(normTitle).filter((w) => !GENERIC_DOMAIN_WORDS.has(w));
  if (titleSubstantive.length > 0) {
    const titleMatchedCount = titleSubstantive.filter((tw) => expandedSubstantive.has(tw)).length;
    if (titleMatchedCount / titleSubstantive.length >= 0.5) {
      score += 30;
    }
  }

  // Exact keyword match bonus
  const kwList = normKw.split(/[\s|,|;]+/).map((k) => k.trim()).filter(Boolean);
  if (kwList.some((kw) => kw === normQ || expandedSubstantive.has(kw))) {
    score += 20;
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
      .filter((s) => s.score >= 30)
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
