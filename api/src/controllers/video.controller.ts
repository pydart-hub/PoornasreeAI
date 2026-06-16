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
]);

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Score how well admin keywords match a customer query (higher = better). */
export function scoreVideoMatch(query: string, keywords: string): number {
  const normalizedQuery = query.toLowerCase().trim();
  const keywordText = keywords.toLowerCase().trim();
  if (!normalizedQuery || !keywordText) return 0;

  // Strong match when the full keyword phrase appears in the query (e.g. "milk analyzer").
  if (keywordText.length >= 4 && normalizedQuery.includes(keywordText)) {
    return 10;
  }

  const queryWords = tokenizeQuery(query);
  const keywordTokens = keywordText
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  if (queryWords.length === 0 || keywordTokens.length === 0) return 0;

  return queryWords.filter((qw) =>
    keywordTokens.some((kt) => kt === qw || kt.includes(qw) || qw.includes(kt))
  ).length;
}

/** Format matched videos for WhatsApp / plain-text chat replies. */
export function formatVideoSuggestions(
  videos: Array<{ title: string; youtubeUrl: string }>,
  lang: string = "en"
): string {
  if (videos.length === 0) return "";

  const headers: Record<string, string> = {
    en: "📺 *Related Videos:*",
    hi: "📺 *संबंधित वीडियो:*",
    ta: "📺 *தொடர்புடைய வீடியோக்கள்:*",
    kn: "📺 *ಸಂಬಂಧಿತ ವೀಡಿಯೊಗಳು:*",
    mr: "📺 *संबंधित व्हिडिओ:*",
    te: "📺 *సంబంధిత వీడియోలు:*",
    bn: "📺 *সম্পর্কিত ভিডিও:*",
  };

  const header = "\n\n" + (headers[lang] || headers.en);
  const lines = videos
    .map((v) => `▶️ *${v.title}*\n${v.youtubeUrl}`)
    .join("\n\n");

  return `${header}\n${lines}`;
}

export async function findVideosForQuery(
  query: string,
  limit = 3
): Promise<{ id: string; title: string; description: string | null; youtubeUrl: string; keywords: string }[]> {
  try {
    const allVideos = await prisma.videoResource.findMany();
    if (allVideos.length === 0) return [];

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const scored = allVideos
      .map((v) => ({ video: v, score: scoreVideoMatch(normalizedQuery, v.keywords) }))
      .filter((s) => s.score >= 1)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => ({
      id: s.video.id,
      title: s.video.title,
      description: s.video.description,
      youtubeUrl: s.video.youtubeUrl,
      keywords: s.video.keywords,
    }));
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
    res.json({ success: true });
  } catch (err) {
    console.error("deleteVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
