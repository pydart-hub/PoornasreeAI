// ── Complaint Controller ──────────────────────────────────────────────────
// Returns complaint types extracted from admin-uploaded documents.
// Source: DocumentIssue table (populated by document.service.ts
// when admin uploads Excel/JSON files).

import { Request, Response } from "express";
import prisma from "../lib/prisma";

// ── GET /api/complaints/types ────────────────────────────────────────────
// Returns all active troubleshooting templates as selectable complaint types.
// Any authenticated user can call this endpoint.
export async function listComplaintTypes(_req: Request, res: Response): Promise<void> {
  try {
    const templates = await prisma.documentIssue.findMany({
      where: { isActive: true },
      select: {
        id: true,
        problemType: true,
        title: true,
        description: true,
      },
      orderBy: { title: "asc" },
    });

    const complaintTypes = templates.map((t) => ({
      id: t.id,
      value: t.problemType,
      title: t.title,
      description: t.description,
    }));

    res.json({ complaintTypes });
  } catch (err) {
    console.error("listComplaintTypes:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
