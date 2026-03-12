// ── Document Upload Controller ────────────────────────────────────────
// POST /api/admin/documents  —  admin only
// Accepts a multipart file upload, saves to disk, creates a Document
// record, then kicks off the embedding pipeline.

import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { processDocument } from "../services/document.service";

// Where uploaded PDFs are stored (simple disk storage).
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

// Ensure directory exists on module load.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * POST /api/admin/documents
 * Requires `multer` middleware to have populated `req.file`.
 */
export async function uploadDocument(req: Request, res: Response): Promise<void> {
  try {
    const { role, userId } = req.user!;

    // Admin-only guard
    if (role !== "admin") {
      res.status(403).json({ error: "Only admins may upload documents" });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No file provided. Send a PDF as form-data field 'file'." });
      return;
    }

    const title = (req.body.title as string)?.trim() || file.originalname;
    const documentType = (req.body.documentType as string)?.trim() || "service";

    if (!["service", "customer"].includes(documentType)) {
      res.status(400).json({ error: "documentType must be 'service' or 'customer'" });
      return;
    }

    // 1. Persist Document record
    const document = await prisma.document.create({
      data: {
        title,
        filePath: file.path,
        documentType,
        uploadedById: userId,
      },
    });

    // 2. Kick off embedding pipeline (async — don't block the response for
    //    large files; but for now we await so admin gets immediate feedback).
    const result = await processDocument(document.id, file.path, file.mimetype, documentType);

    res.status(201).json({
      document: {
        id:    document.id,
        title: document.title,
        createdAt: document.createdAt,
      },
      processing: result,
    });
  } catch (err) {
    console.error("uploadDocument error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/suggestions
 * Returns document titles for customer-type documents (used as suggestion chips).
 */
export async function getSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const documents = await prisma.document.findMany({
      where: { documentType: "customer" },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ suggestions: documents });
  } catch (err) {
    console.error("getSuggestions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
