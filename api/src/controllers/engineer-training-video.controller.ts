// ── Engineer Training Video Controller ────────────────────────────────────
// Admin CRUD for private training videos that engineers can query via WhatsApp.
// Separate from R&D Videos (which auto-send during troubleshooting).

import { Request, Response } from "express";
import prisma from "../lib/prisma";

// ── GET /api/admin/training-videos ───────────────────────────────────────
export async function listTrainingVideos(req: Request, res: Response): Promise<void> {
  try {
    const videos = await prisma.engineerTrainingVideo.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ videos });
  } catch (err) {
    console.error("listTrainingVideos error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/admin/training-videos ──────────────────────────────────────
export async function createTrainingVideo(req: Request, res: Response): Promise<void> {
  try {
    const title = (req.body.title as string)?.trim();
    const description = (req.body.description as string)?.trim() || null;
    const youtubeUrl = (req.body.youtubeUrl as string)?.trim();
    const topic = (req.body.topic as string)?.trim();

    if (!title || !youtubeUrl || !topic) {
      res.status(400).json({ error: "Title, YouTube URL, and topic are required" });
      return;
    }

    const video = await prisma.engineerTrainingVideo.create({
      data: { title, description, youtubeUrl, topic },
    });

    res.status(201).json({ video });
  } catch (err) {
    console.error("createTrainingVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/admin/training-videos/:id ─────────────────────────────────
export async function updateTrainingVideo(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const title = (req.body.title as string)?.trim();
    const description = (req.body.description as string)?.trim() || null;
    const youtubeUrl = (req.body.youtubeUrl as string)?.trim();
    const topic = (req.body.topic as string)?.trim();

    if (!title || !youtubeUrl || !topic) {
      res.status(400).json({ error: "Title, YouTube URL, and topic are required" });
      return;
    }

    const existing = await prisma.engineerTrainingVideo.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const video = await prisma.engineerTrainingVideo.update({
      where: { id },
      data: { title, description, youtubeUrl, topic },
    });

    res.json({ video });
  } catch (err) {
    console.error("updateTrainingVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/training-videos/:id ────────────────────────────────
export async function deleteTrainingVideo(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const existing = await prisma.engineerTrainingVideo.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    await prisma.engineerTrainingVideo.delete({ where: { id } });
    res.json({ message: "Video deleted" });
  } catch (err) {
    console.error("deleteTrainingVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
