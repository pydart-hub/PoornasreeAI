// ── Public Routes ─────────────────────────────────────────────────────────
// No authentication required. Read ticket data and run engineer close flow (start / OTP / verify).
// Prefix: /api/public   (mounted in index.ts)

import { Router, Request, Response } from "express";
import { TicketStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  publicStartWork,
  publicRequestOTP,
  publicVerifyOTP,
} from "../controllers/public-ticket.controller";
import { getActiveOtp } from "../services/ticket.service";
import {
  PUBLIC_TICKET_SELECT,
  STATUS_BY_STAGE,
  toStageExportDto,
  type StageSlug,
} from "../lib/ticket-export.mapper";
const router = Router();

const STAGE_SLUGS: StageSlug[] = [
  "created",
  "assigned",
  "in-progress",
  "pending-otp",
  "closed",
];

function parseSince(since: string | undefined): Date | undefined | "invalid" {
  if (!since?.trim()) return undefined;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

function parseListQuery(req: Request) {
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const skip = (page - 1) * limit;
  const ticketNumber = (req.query.ticketNumber as string | undefined)?.trim();
  const since = parseSince(req.query.since as string | undefined);
  return { limit, page, skip, ticketNumber, since };
}

async function listTicketsByStage(stage: StageSlug, req: Request, res: Response): Promise<void> {
  try {
    const { limit, page, skip, ticketNumber, since } = parseListQuery(req);

    if (since === "invalid") {
      res.status(400).json({
        success: false,
        data: null,
        message: "Invalid since parameter — use ISO 8601 datetime",
      });
      return;
    }

    const where: Record<string, unknown> = {
      status: STATUS_BY_STAGE[stage],
    };
    if (ticketNumber) where.ticketNumber = ticketNumber;
    if (since instanceof Date) where.updatedAt = { gte: since };

    const [rows, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        select: PUBLIC_TICKET_SELECT,
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({
      success: true,
      data: rows.map((t) => toStageExportDto(t, stage)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({
      success: false,
      data: null,
      message: e.message ?? "Internal server error",
    });
  }
}

async function getTicketByStage(stage: StageSlug, req: Request, res: Response): Promise<void> {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: String(req.params.id),
        status: STATUS_BY_STAGE[stage],
      },
      select: PUBLIC_TICKET_SELECT,
    });

    if (!ticket) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Ticket not found in this stage",
      });
      return;
    }

    res.json({
      success: true,
      data: toStageExportDto(ticket, stage),
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({
      success: false,
      data: null,
      message: e.message ?? "Internal server error",
    });
  }
}

// ── Engineer close flow (no auth — ticket must have assigned engineer) ───────
router.patch("/tickets/:id/start", publicStartWork);
router.post("/tickets/:id/otp", publicRequestOTP);
router.post("/tickets/:id/verify-otp", publicVerifyOTP);

// ── Stage endpoints (register before /tickets/:id) ─────────────────────────

for (const stage of STAGE_SLUGS) {
  router.get(`/tickets/stage/${stage}`, (req, res) => listTicketsByStage(stage, req, res));
  router.get(`/tickets/stage/${stage}/:id`, (req, res) => getTicketByStage(stage, req, res));
}

// ── GET /api/public/tickets (legacy) ──────────────────────────────────────
router.get("/tickets", async (req: Request, res: Response): Promise<void> => {
  try {
    const statusQ = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    const ticketNumber = (req.query.ticketNumber as string | undefined)?.trim();
    const since = parseSince(req.query.since as string | undefined);

    if (since === "invalid") {
      res.status(400).json({ error: "Invalid since parameter — use ISO 8601 datetime" });
      return;
    }

    const where: Record<string, unknown> = {};
    if (statusQ) {
      if (!Object.values(TicketStatus).includes(statusQ as TicketStatus)) {
        res.status(400).json({
          error: `Invalid status. Must be one of: ${Object.values(TicketStatus).join(", ")}`,
        });
        return;
      }
      where.status = statusQ as TicketStatus;
    }
    if (ticketNumber) where.ticketNumber = ticketNumber;
    if (since instanceof Date) where.updatedAt = { gte: since };

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: PUBLIC_TICKET_SELECT,
      }),
      prisma.ticket.count({ where }),
    ]);

    const now = Date.now();
    const enriched = tickets.map((t) => ({
      ...t,
      ageHours: Math.round((now - new Date(t.createdAt).getTime()) / 3600000 * 10) / 10,
      responseTimeHours: t.firstEngineeredAt
        ? Math.round(
            (new Date(t.firstEngineeredAt).getTime() - new Date(t.createdAt).getTime()) / 3600000 * 10,
          ) / 10
        : null,
      durationHours: t.closedAt
        ? Math.round((new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000 * 10) / 10
        : null,
    }));

    res.json({
      tickets: enriched,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ error: e.message ?? "Internal server error" });
  }
});

// ── GET /api/public/tickets/:id (legacy) ──────────────────────────────────
router.get("/tickets/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: String(req.params.id) },
      select: PUBLIC_TICKET_SELECT,
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ error: e.message ?? "Internal server error" });
  }
});

export default router;
