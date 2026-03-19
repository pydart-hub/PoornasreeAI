// ── R&D Video Controller ──────────────────────────────────────────────────
// Admin uploads internal videos; engineers + admins can view.

import { Request, Response } from "express";
import fs from "fs";
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

// ── POST /api/admin/rd-videos  (multer file upload) ─────────────────────
export async function createRdVideo(req: Request, res: Response): Promise<void> {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No file provided. Upload a video file." });
      return;
    }

    const title = (req.body.title as string)?.trim();
    const description = (req.body.description as string)?.trim() || null;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const video = await prisma.rdVideo.create({
      data: {
        title,
        description,
        filePath: file.path,
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

    // Remove file from disk
    if (fs.existsSync(video.filePath)) {
      fs.unlinkSync(video.filePath);
    }

    res.json({ message: "Video deleted" });
  } catch (err) {
    console.error("deleteRdVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
