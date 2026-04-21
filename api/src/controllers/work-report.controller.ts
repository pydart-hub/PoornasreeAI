import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import prisma from "../lib/prisma";

// ── Multer config for work-report images ─────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve(__dirname, "../../uploads/work-reports");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
  }
};

export const workReportUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
}).single("image");

// ── GET /api/work-reports ─────────────────────────────────────────────────
// dealer: own reports | service_manager | admin: all
export async function listWorkReports(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  try {
    const where =
      role === "dealer"
        ? { dealerId: userId }
        : {}; // manager & admin see all

    const reports = await prisma.workReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        dealer: { select: { id: true, firstName: true, lastName: true } },
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            machineName: true,
            machineSerialNumber: true,
            status: true,
          },
        },
        _count: { select: { parts: true, images: true } },
      },
    });

    res.json({ reports });
  } catch (err) {
    console.error("[work-report] listWorkReports error:", err);
    res.status(500).json({ error: "Failed to fetch work reports" });
  }
}

// ── GET /api/work-reports/:ticketId ──────────────────────────────────────
export async function getWorkReport(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const ticketId = req.params.ticketId as string;

  try {
    const report = await prisma.workReport.findUnique({
      where: { ticketId },
      include: {
        dealer: { select: { id: true, firstName: true, lastName: true } },
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            machineName: true,
            machineSerialNumber: true,
            status: true,
          },
        },
        parts: { orderBy: { createdAt: "asc" } },
        images: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!report) {
      res.status(404).json({ error: "Work report not found" });
      return;
    }

    // Scope check: dealer can only see their own
    if (role === "dealer" && report.dealerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ report });
  } catch (err) {
    console.error("[work-report] getWorkReport error:", err);
    res.status(500).json({ error: "Failed to fetch work report" });
  }
}

// ── POST /api/work-reports/:ticketId ─────────────────────────────────────
// Upsert work report (text + parts). Images are handled separately.
export async function upsertWorkReport(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const ticketId = req.params.ticketId as string;
  const {
    problemDiagnosed,
    workDone,
    warrantyClaimRequested,
    parts,
  } = req.body as {
    problemDiagnosed?: string;
    workDone?: string;
    warrantyClaimRequested?: boolean;
    parts?: { partName: string; partNumber?: string; quantity?: number }[];
  };

  try {
    // Verify ticket belongs to this dealer and is in a valid state
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, dealerId: true, status: true },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.dealerId !== userId) {
      res.status(403).json({ error: "Forbidden: ticket does not belong to your account" });
      return;
    }

    const validStatuses = ["IN_PROGRESS", "PENDING_OTP", "CLOSED"];
    if (!validStatuses.includes(ticket.status)) {
      res.status(400).json({
        error: "Work report can only be submitted for tickets that are In Progress, Pending OTP, or Closed",
      });
      return;
    }

    // Upsert report
    const report = await prisma.workReport.upsert({
      where: { ticketId },
      create: {
        ticketId,
        dealerId: userId,
        problemDiagnosed: problemDiagnosed?.trim() || null,
        workDone: workDone?.trim() || null,
        warrantyClaimRequested: warrantyClaimRequested ?? false,
      },
      update: {
        problemDiagnosed: problemDiagnosed?.trim() || null,
        workDone: workDone?.trim() || null,
        warrantyClaimRequested: warrantyClaimRequested ?? false,
      },
    });

    // Replace parts (delete all + recreate)
    if (Array.isArray(parts)) {
      await prisma.replacedPart.deleteMany({ where: { workReportId: report.id } });
      if (parts.length > 0) {
        const validParts = parts.filter((p) => p.partName?.trim());
        if (validParts.length > 0) {
          await prisma.replacedPart.createMany({
            data: validParts.map((p) => ({
              workReportId: report.id,
              partName: p.partName.trim(),
              partNumber: p.partNumber?.trim() || null,
              quantity: Math.max(1, Number(p.quantity) || 1),
            })),
          });
        }
      }
    }

    // Fetch full report to return
    const full = await prisma.workReport.findUnique({
      where: { id: report.id },
      include: {
        parts: { orderBy: { createdAt: "asc" } },
        images: { orderBy: { createdAt: "asc" } },
      },
    });

    res.json({ report: full });
  } catch (err) {
    console.error("[work-report] upsertWorkReport error:", err);
    res.status(500).json({ error: "Failed to save work report" });
  }
}

// ── POST /api/work-reports/:ticketId/images ───────────────────────────────
export async function uploadReportImage(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const ticketId = req.params.ticketId as string;

  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }

  try {
    // Ensure work report exists for this dealer's ticket
    let report = await prisma.workReport.findUnique({ where: { ticketId } });

    if (!report) {
      // Auto-create a blank report so images can be attached
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { dealerId: true, status: true },
      });
      if (!ticket || ticket.dealerId !== userId) {
        // Clean up uploaded file
        fs.unlink(req.file.path, () => {});
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      report = await prisma.workReport.create({
        data: { ticketId, dealerId: userId },
      });
    } else if (report.dealerId !== userId) {
      fs.unlink(req.file.path, () => {});
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const relativeUrl = `/uploads/work-reports/${req.file.filename}`;
    const image = await prisma.workReportImage.create({
      data: {
        workReportId: report.id,
        url: relativeUrl,
        fileName: req.file.originalname,
      },
    });

    res.json({ image });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("[work-report] uploadReportImage error:", err);
    res.status(500).json({ error: "Failed to upload image" });
  }
}

// ── DELETE /api/work-reports/:ticketId/images/:imageId ───────────────────
export async function deleteReportImage(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const ticketId = req.params.ticketId as string;
  const imageId = req.params.imageId as string;

  try {
    const image = await prisma.workReportImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const report = await prisma.workReport.findUnique({
      where: { id: image.workReportId },
      select: { dealerId: true, ticketId: true },
    });

    if (!report || report.ticketId !== ticketId || report.dealerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Delete file from disk
    const filePath = path.resolve(__dirname, "../../", image.url.replace(/^\//, ""));
    fs.unlink(filePath, () => {}); // best-effort

    await prisma.workReportImage.delete({ where: { id: imageId } });

    res.json({ success: true });
  } catch (err) {
    console.error("[work-report] deleteReportImage error:", err);
    res.status(500).json({ error: "Failed to delete image" });
  }
}
