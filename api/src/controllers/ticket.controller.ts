// ── Ticket Controller ─────────────────────────────────────────────────────
// Thin HTTP layer — delegates all business logic to ticket.service.ts.
// Handles validation, role guards, and response shaping only.

import { Request, Response } from "express";
import { TicketStatus } from "@prisma/client";
import { io } from "../lib/socket";
import prisma from "../lib/prisma";
import * as TicketService from "../services/ticket.service";
import { startFeedbackFlow } from "../services/simulate.service";
import * as WhatsAppService from "../services/whatsapp.service";
import {
  syncHrEngineers,
  engineerManagerWhere,
  getAssistantParentManagerId,
  canManagerAccessEngineer,
  mapEngineerSource,
} from "../services/hr-engineer.service";


// ── POST /api/tickets ─────────────────────────────────────────────────────
// Any authenticated user can raise a ticket on behalf of themselves.
// Dealers can also raise tickets, passing an optional dealerId implicitly.
export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    const { problemDescription, machineName, machineSerialNumber, phoneNumber, place, district, state, customerAddress } = req.body;
    // Auto-inherit the dealer/user's own pincodeId so tickets are always
    // routed to the correct service manager zone.
    const pincodeId: string | undefined =
      req.body.pincodeId || req.user!.pincodeId || undefined;
    const userId = req.user!.userId;
    const role   = req.user!.role;

    if (!problemDescription?.trim()) {
      res.status(400).json({ error: "problemDescription is required" });
      return;
    }

    // Dealer ID: auto-set for dealer role, or accept from body (customer selects dealer)
    const dealerId: string | undefined =
      role === "dealer" ? userId : (req.body.dealerId || undefined);

    const ticket = await TicketService.createTicket({
      customerId:         userId,
      problemDescription,
      machineName,
      machineSerialNumber,
      pincodeId,
      dealerId,
      phoneNumber,
      place,
      district,
      state,
      customerAddress,
    });

    // Notify service managers of new ticket so their dashboard updates in real-time
    io?.to("managers").emit("ticket:new", ticket);

    res.status(201).json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/tickets ──────────────────────────────────────────────────────
// Role-scoped listing:
//   customer / dealer → own tickets only
//   service_engineer  → tickets assigned to them
//   service_manager   → all tickets (optionally filtered by pincode)
//   admin             → all tickets
export async function listTickets(req: Request, res: Response): Promise<void> {
  try {
    const userId   = req.user!.userId;
    const role     = req.user!.role;
    const statusQ  = req.query.status as string | undefined;

    const filters: Parameters<typeof TicketService.listTickets>[0] = {};
    if (statusQ) {
      if (!Object.values(TicketStatus).includes(statusQ as TicketStatus)) {
        res.status(400).json({ error: `Invalid status. Must be one of: ${Object.values(TicketStatus).join(", ")}` });
        return;
      }
      filters.status = statusQ as TicketStatus;
    }

    // Role-scoped filtering
    if (role === "customer")                                     filters.customerId = userId;
    else if (role === "dealer") {
      // Dealer sees only tickets explicitly assigned to them by service manager.
      // ownerType is always MANAGER — no dealer-owned queue anymore.
      filters.assignedDealerId = userId;
    }
    else if (role === "service_engineer" || role === "service")  filters.engineerId = userId;
    else if (role === "service_manager") {
      // Service manager sees ALL tickets — no ownerType filter.
      // Manager explicitly assigns tickets to engineers or dealers.
    }
    else if (role === "assistant_service_manager") {
      // Show only tickets within the assistant manager's assigned pincodes
      const asstUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { engineerPincodes: { select: { id: true } } },
      });
      const pincodeIds = asstUser?.engineerPincodes.map(p => p.id) ?? [];
      filters.managedPincodeIds = pincodeIds; // empty = no tickets shown
    }
    // admin: no filter — sees all tickets

    const tickets = await TicketService.listTickets(filters);

    // Add computed metrics to each ticket
    const now = Date.now();
    const enriched = tickets.map((t: any) => ({
      ...t,
      ageHours: Math.round((now - new Date(t.createdAt).getTime()) / 3600000 * 10) / 10,
      responseTimeHours: t.firstEngineeredAt
        ? Math.round((new Date(t.firstEngineeredAt).getTime() - new Date(t.createdAt).getTime()) / 3600000 * 10) / 10
        : null,
      durationHours: t.closedAt
        ? Math.round((new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000 * 10) / 10
        : null,
    }));

    res.json({ tickets: enriched });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/tickets/:id ──────────────────────────────────────────────────
export async function getTicket(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const ticket = await TicketService.getTicket(id);
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

    const userId = req.user!.userId;
    const role   = req.user!.role;

    // Ownership / scope enforcement per role
    if (role === "dealer") {
      // Allow access if this dealer submitted the ticket (origin) OR was assigned to it
      if (ticket.dealerId !== userId && (ticket as any).assignedDealerId !== userId) {
        res.status(403).json({ error: "Access denied" }); return;
      }
    } else if (role === "customer") {
      if (ticket.customerId !== userId) { res.status(403).json({ error: "Access denied" }); return; }
    } else if (role === "service_engineer" || role === "service") {
      if (ticket.assignedEngineerId !== userId) { res.status(403).json({ error: "Access denied: not assigned to this ticket" }); return; }
    }
    // service_manager: sees all tickets — no pincode ownership restriction
    // assistant_service_manager: sees any ticket by ID (ticket list is already pincode-scoped)
    // admin: full access — no filter

    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── PATCH /api/tickets/:id/assign-engineer ────────────────────────────────
export async function assignEngineer(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { engineerId } = req.body;
    if (!engineerId) { res.status(400).json({ error: "engineerId is required" }); return; }

    // Pincode enforcement for service_manager and assistant_service_manager
    if (req.user!.role === "service_manager" || req.user!.role === "assistant_service_manager") {
      const callerId = req.user!.userId;
      const callerRole = req.user!.role;

      const engineer = await prisma.user.findUnique({
        where: { id: engineerId },
        select: {
          managerId: true,
          hrEngineerId: true,
          role: true,
          engineerPincodes: { select: { id: true } },
        },
      });
      if (!engineer || engineer.role !== "service_engineer") {
        res.status(400).json({ error: "Invalid engineer ID" }); return;
      }
      const parentManagerId =
        callerRole === "assistant_service_manager"
          ? await getAssistantParentManagerId(callerId)
          : null;
      if (!(await canManagerAccessEngineer(engineer, callerId, callerRole, parentManagerId))) {
        res.status(403).json({ error: "This engineer is not in your team" }); return;
      }

      // Engineer must have at least one pincode assigned
      if (engineer.engineerPincodes.length === 0) {
        res.status(400).json({ error: "Engineer must have at least one pincode assigned before being assigned to tickets" }); return;
      }

      const existing = await TicketService.getTicket(id);
      if (!existing) { res.status(404).json({ error: "Ticket not found" }); return; }

      if (existing.pincodeId) {
        // Hard reject if engineer's pincodes don't include the ticket's pincode
        const engineerMatchesPincode = engineer.engineerPincodes.some(p => p.id === existing.pincodeId);
        if (!engineerMatchesPincode) {
          res.status(400).json({ error: "Engineer does not cover this ticket's pincode zone. Assign the correct zone to the engineer first." });
          return;
        }
      }

      // For assistant managers: also verify the ticket is in their assigned pincodes
      if (req.user!.role === "assistant_service_manager" && existing.pincodeId) {
        const asst = await prisma.user.findUnique({
          where: { id: callerId },
          select: { engineerPincodes: { select: { id: true } } },
        });
        const asstPincodeIds = new Set(asst?.engineerPincodes.map(p => p.id) ?? []);
        if (!asstPincodeIds.has(existing.pincodeId)) {
          res.status(403).json({ error: "This ticket is outside your assigned zone" }); return;
        }
      }
    }

    const ticket = await TicketService.assignEngineer(id, engineerId, req.user!.userId);
    io?.to(`user:${engineerId}`).emit("ticket:assigned", { ticketId: id });
    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── PATCH /api/tickets/:id/unassign-engineer ──────────────────────────────
// Manager or admin removes the assigned engineer, reverting ticket to OPEN.
export async function unassignEngineer(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const ticket = await TicketService.unassignEngineer(id);
    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── PATCH /api/tickets/:id/assign-dealer ─────────────────────────────────
// Service manager explicitly routes a ticket to a dealer for field handling.
export async function assignDealer(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { dealerId } = req.body;
    if (!dealerId) { res.status(400).json({ error: "dealerId is required" }); return; }

    const ticket = await TicketService.assignDealer(id, dealerId, req.user!.userId);
    io?.to(`user:${dealerId}`).emit("ticket:assigned", { ticketId: id });
    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── PATCH /api/tickets/:id/start ──────────────────────────────────────────
// Engineer sets ticket to IN_PROGRESS.
export async function startWork(req: Request, res: Response): Promise<void> {
  try {
    const id      = String(req.params.id);
    const isAdmin = req.user!.role === "admin";
    const ticket  = await TicketService.startWork(id, req.user!.userId, isAdmin);
    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── POST /api/tickets/:id/otp ─────────────────────────────────────────────
// Engineer requests OTP for ticket closure.
// OTP is sent to the customer via WhatsApp — NOT returned in the response.
export async function requestOTP(req: Request, res: Response): Promise<void> {
  try {
    const id      = String(req.params.id);
    const isAdmin = req.user!.role === "admin";
    const resend  = req.body?.resend === true;
    const result  = await TicketService.requestOTP(id, req.user!.userId, isAdmin, resend);

    res.json({
      message:   "OTP sent to the customer via WhatsApp.",
      expiresAt: result.expiresAt,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── POST /api/tickets/:id/verify-otp ──────────────────────────────────────
// Engineer submits the 4-digit OTP received from the customer.
export async function verifyOTP(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { code } = req.body;
    if (!code?.trim()) { res.status(400).json({ error: "code is required" }); return; }

    const isAdmin = req.user!.role === "admin";
    const ticket  = await TicketService.verifyOTP(id, req.user!.userId, code.trim(), isAdmin);

    io?.to(`user:${ticket.customerId}`).emit("ticket:closed", {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
    });

    // Send feedback request via WhatsApp to the customer's phone
    if (ticket.phoneNumber && WhatsAppService.isConfigured()) {
      try {
        const feedbackMsg = await startFeedbackFlow(ticket.phoneNumber, ticket.id, ticket.ticketNumber);
        await WhatsAppService.sendMessage(ticket.phoneNumber, feedbackMsg);

        // Persist the feedback message in chat history
        await prisma.simulateMessage.create({
          data: { phoneNumber: ticket.phoneNumber, role: "assistant", content: feedbackMsg },
        });
      } catch (err) {
        console.error("[verifyOTP] Failed to send feedback request:", (err as Error).message);
      }
    }

    res.json({ message: "Ticket closed successfully", ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/tickets/engineers ────────────────────────────────────────────
// Returns engineers scoped to the manager who created them (via managerId FK).
// Admin sees all service_engineers.
export async function listEngineers(req: Request, res: Response): Promise<void> {
  try {
    const role   = req.user!.role;
    const userId = req.user!.userId;
    const filterPincodeId = req.query.pincodeId as string | undefined;

    await syncHrEngineers();

    const parentManagerId =
      role === "assistant_service_manager"
        ? await getAssistantParentManagerId(userId)
        : null;

    const engineerWhere: Record<string, unknown> =
      role === "service_manager" || role === "assistant_service_manager"
        ? engineerManagerWhere(role, userId, parentManagerId)
        : { role: "service_engineer" };

    // If pincodeId filter provided, try to find engineers assigned to that pincode first
    if (filterPincodeId) {
      const pincodeMatched = await prisma.user.findMany({
        where: {
          ...engineerWhere,
          engineerPincodes: { some: { id: filterPincodeId } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          hrEngineerId: true,
          engineerPincodes: { select: { id: true, code: true, place: true, district: true, state: true } },
          _count: {
            select: {
              engineerTickets: {
                where: { status: { in: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING_OTP] } },
              },
            },
          },
        },
        orderBy: { firstName: "asc" },
      });

      if (pincodeMatched.length > 0) {
        const result = pincodeMatched.map(e => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          email: e.email,
          hrEngineerId: e.hrEngineerId,
          source: mapEngineerSource(e.hrEngineerId),
          pincodes: e.engineerPincodes,
          activeTickets: e._count.engineerTickets,
          pincodeMatch: true,
        }));
        res.json({ engineers: result, pincodeFiltered: true });
        return;
      }
      // Fallback: no engineers match pincodeId — return all (manual selection)
    }

    const engineers = await prisma.user.findMany({
      where: engineerWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        hrEngineerId: true,
        engineerPincodes: { select: { id: true, code: true, place: true, district: true, state: true } },
        _count: {
          select: {
            engineerTickets: {
              where: { status: { in: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING_OTP] } },
            },
          },
        },
      },
      orderBy: { firstName: "asc" },
    });

    const result = engineers.map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      hrEngineerId: e.hrEngineerId,
      source: mapEngineerSource(e.hrEngineerId),
      pincodes: e.engineerPincodes,
      activeTickets: e._count.engineerTickets,
      pincodeMatch: false,
    }));

    res.json({ engineers: result, pincodeFiltered: false });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/tickets/engineer-feedback ────────────────────────────────────
// Returns per-engineer feedback stats for closed tickets.
// service_manager / assistant_service_manager: scoped to their engineers.
// admin: all engineers.
export async function getEngineerFeedback(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const role   = req.user!.role;

    const parentManagerId =
      role === "assistant_service_manager"
        ? await getAssistantParentManagerId(userId)
        : null;

    const engineerWhere: Record<string, unknown> =
      role === "service_manager" || role === "assistant_service_manager"
        ? engineerManagerWhere(role, userId, parentManagerId)
        : { role: "service_engineer" };

    const engineers = await prisma.user.findMany({
      where: engineerWhere,
      select: { id: true, firstName: true, lastName: true },
    });

    if (engineers.length === 0) {
      res.json({ engineerStats: [] });
      return;
    }

    const engineerIds = engineers.map(e => e.id);

    // Fetch all closed tickets for these engineers
    const tickets = await prisma.ticket.findMany({
      where: {
        status: "CLOSED",
        assignedEngineerId: { in: engineerIds },
      },
      select: {
        ticketNumber:        true,
        feedbackRating:      true,
        feedbackComment:     true,
        feedbackSubmittedAt: true,
        machineCustomer:     true,
        issueDescription:    true,
        closedAt:            true,
        assignedEngineerId:  true,
      },
      orderBy: { closedAt: "desc" },
    });

    // Build per-engineer stats map
    type EngineerStat = {
      engineer:      { id: string; firstName: string; lastName: string | null };
      closedCount:   number;
      feedbackCount: number;
      ratingSum:     number;
      feedbacks:     Array<{
        ticketNumber: string;
        rating:       number;
        comment:      string | null;
        customerName: string | null;
        closedAt:     string | null;
      }>;
    };

    const statsMap = new Map<string, EngineerStat>();
    for (const eng of engineers) {
      statsMap.set(eng.id, {
        engineer:      eng,
        closedCount:   0,
        feedbackCount: 0,
        ratingSum:     0,
        feedbacks:     [],
      });
    }

    for (const t of tickets) {
      if (!t.assignedEngineerId) continue;
      const stat = statsMap.get(t.assignedEngineerId);
      if (!stat) continue;

      stat.closedCount++;

      if (t.feedbackRating != null) {
        stat.feedbackCount++;
        stat.ratingSum += t.feedbackRating;

        // Try to extract customer name from structured issueDescription
        const nameMatch = t.issueDescription?.match(/Customer[:\s]+([^\n,|]+)/i);
        const customerName = t.machineCustomer || (nameMatch ? nameMatch[1].trim() : null);

        stat.feedbacks.push({
          ticketNumber: t.ticketNumber,
          rating:       t.feedbackRating,
          comment:      t.feedbackComment ?? null,
          customerName,
          closedAt:     t.closedAt?.toISOString() ?? null,
        });
      }
    }

    const engineerStats = Array.from(statsMap.values()).map(stat => ({
      engineer:      stat.engineer,
      closedCount:   stat.closedCount,
      feedbackCount: stat.feedbackCount,
      avgRating:     stat.feedbackCount > 0
        ? Math.round((stat.ratingSum / stat.feedbackCount) * 10) / 10
        : null,
      feedbacks: stat.feedbacks,
    }));

    // Sort: highest avgRating first, nulls (no feedback yet) last
    engineerStats.sort((a, b) => {
      if (a.avgRating === null && b.avgRating === null) return 0;
      if (a.avgRating === null) return 1;
      if (b.avgRating === null) return -1;
      return b.avgRating - a.avgRating;
    });

    res.json({ engineerStats });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}
