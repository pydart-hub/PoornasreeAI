// ── Public Routes ─────────────────────────────────────────────────────────
// No authentication required. Used by external systems to read ticket + customer data.
// Prefix: /api/public   (mounted in index.ts)

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { TicketStatus } from "@prisma/client";

const router = Router();

// ── GET /api/public/tickets ───────────────────────────────────────────────
// Returns all tickets with customer data.
// Optional query params:
//   ?status=OPEN|ASSIGNED|IN_PROGRESS|PENDING_OTP|CLOSED
//   ?limit=100   (default 500, max 1000)
//   ?page=1
router.get("/tickets", async (req: Request, res: Response): Promise<void> => {
  try {
    const statusQ = req.query.status as string | undefined;
    const limit   = Math.min(Number(req.query.limit) || 500, 1000);
    const page    = Math.max(Number(req.query.page)  || 1,   1);
    const skip    = (page - 1) * limit;

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

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id:                  true,
          ticketNumber:        true,
          status:              true,
          ownerType:           true,
          // Customer info
          customerId:          true,
          phoneNumber:         true,
          // Machine info from Passtest
          machineName:         true,
          machineSerialNumber: true,
          machineProductCode:  true,
          machineCustomer:     true,
          machineAddress1:     true,
          machineAddress2:     true,
          machineInvoiceNo:    true,
          machineInvoiceDate:  true,
          machineWarranty:     true,
          // Location
          place:               true,
          district:            true,
          state:               true,
          pincodeId:           true,
          // Problem
          problemDescription:  true,
          issueDescription:    true,
          // Lifecycle timestamps
          createdAt:           true,
          updatedAt:           true,
          firstEngineeredAt:   true,
          closedAt:            true,
          // Feedback
          feedbackRating:      true,
          feedbackComment:     true,
          // Relations
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          dealer:   { select: { id: true, firstName: true, lastName: true, email: true } },
          assignedEngineer: { select: { id: true, firstName: true, lastName: true } },
          pincode: { select: { id: true, code: true, place: true, district: true, state: true } },
          // NOTE: otpCodeHash, otpExpiresAt, otpAttempts intentionally excluded
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    // Add computed metrics
    const now = Date.now();
    const enriched = tickets.map((t) => ({
      ...t,
      ageHours: Math.round((now - new Date(t.createdAt).getTime()) / 3600000 * 10) / 10,
      responseTimeHours: t.firstEngineeredAt
        ? Math.round((new Date(t.firstEngineeredAt).getTime() - new Date(t.createdAt).getTime()) / 3600000 * 10) / 10
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

// ── GET /api/public/tickets/:id ───────────────────────────────────────────
router.get("/tickets/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id:                  true,
        ticketNumber:        true,
        status:              true,
        ownerType:           true,
        customerId:          true,
        phoneNumber:         true,
        machineName:         true,
        machineSerialNumber: true,
        machineProductCode:  true,
        machineCustomer:     true,
        machineAddress1:     true,
        machineAddress2:     true,
        machineInvoiceNo:    true,
        machineInvoiceDate:  true,
        machineWarranty:     true,
        place:               true,
        district:            true,
        state:               true,
        pincodeId:           true,
        problemDescription:  true,
        issueDescription:    true,
        createdAt:           true,
        updatedAt:           true,
        firstEngineeredAt:   true,
        closedAt:            true,
        feedbackRating:      true,
        feedbackComment:     true,
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        dealer:   { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedEngineer: { select: { id: true, firstName: true, lastName: true } },
        pincode: { select: { id: true, code: true, place: true, district: true, state: true } },
      },
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
