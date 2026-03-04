// ── Admin Controller ─────────────────────────────────────────────────────
// All handlers here are admin-only (enforced in routes via `protect`).

import { Request, Response } from "express";
import fs from "fs";
import prisma from "../lib/prisma";

// ── GET /api/admin/users ─────────────────────────────────────────────────
export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ users });
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────
export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const id = req.params.id as string;

    if (id === req.user.userId) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await prisma.user.delete({ where: { id } });
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/documents ─────────────────────────────────────────────
export async function listDocuments(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const documents = await prisma.document.findMany({
      include: {
        uploadedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = documents.map((d) => ({
      id: d.id,
      title: d.title,
      filePath: d.filePath,
      createdAt: d.createdAt,
      uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName ?? ""}`.trim(),
      chunkCount: d._count.chunks,
      status: d._count.chunks > 0 ? "trained" : "pending",
    }));

    res.json({ documents: result });
  } catch (err) {
    console.error("listDocuments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/documents/:id ─────────────────────────────────────
export async function deleteDocumentRecord(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const id = req.params.id as string;

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    // Delete DB record (cascades to DocumentChunk)
    await prisma.document.delete({ where: { id } });

    // Remove file from disk if it exists
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error("deleteDocument error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
