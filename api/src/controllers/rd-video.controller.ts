// ── R&D Video Controller ──────────────────────────────────────────────────
// Admin uploads internal videos; engineers + admins can view.

import { Request, Response } from "express";

import prisma from "../lib/prisma";

// ── GET /api/rd-videos ───────────────────────────────────────────────────
export async function listRdVideos(req: Request, res: Response): Promise<void> {
  try {
    const videos = await prisma.rdVideo.findMany({
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ videos });
  } catch (err) {
    console.error("listRdVideos error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/admin/rd-videos ───────────────────────────────────────────
export async function createRdVideo(req: Request, res: Response): Promise<void> {
  try {
    const title = (req.body.title as string)?.trim();
    const description = (req.body.description as string)?.trim() || null;
    const youtubeUrl = (req.body.youtubeUrl as string)?.trim();

    if (!title || !youtubeUrl) {
      res.status(400).json({ error: "Title and YouTube URL are required" });
      return;
    }

    const video = await prisma.rdVideo.create({
      data: {
        title,
        description,
        youtubeUrl,
        uploadedById: req.user!.userId,
      },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.status(201).json({ video });
  } catch (err) {
    console.error("createRdVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/rd-videos/:id ──────────────────────────────────────
export async function deleteRdVideo(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const video = await prisma.rdVideo.findUnique({ where: { id } });
    if (!video) { res.status(404).json({ error: "Video not found" }); return; }

    await prisma.rdVideo.delete({ where: { id } });

    res.json({ message: "Video deleted" });
  } catch (err) {
    console.error("deleteRdVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
