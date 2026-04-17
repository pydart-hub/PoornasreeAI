// ── Ticket Controller ─────────────────────────────────────────────────────
// Thin HTTP layer — delegates all business logic to ticket.service.ts.
// Handles validation, role guards, and response shaping only.

import { Request, Response } from "express";
import { TicketStatus, TicketOwnerType } from "@prisma/client";
import { io } from "../lib/socket";
import prisma from "../lib/prisma";
import * as TicketService from "../services/ticket.service";
import { startFeedbackFlow } from "../services/simulate.service";
import * as WhatsAppService from "../services/whatsapp.service";


// ── POST /api/tickets ─────────────────────────────────────────────────────
// Any authenticated user can raise a ticket on behalf of themselves.
// Dealers can also raise tickets, passing an optional dealerId implicitly.
export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    const { problemDescription, machineName, machineSerialNumber, phoneNumber, place, district, state } = req.body;
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
      filters.ownerType = TicketOwnerType.DEALER;
      filters.ownerId   = userId;
    }
    else if (role === "service_engineer" || role === "service")  filters.engineerId = userId;
    else if (role === "service_manager") {
      filters.ownerType = TicketOwnerType.MANAGER;
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
      if (ticket.dealerId !== userId) { res.status(403).json({ error: "Access denied" }); return; }
    } else if (role === "customer") {
      if (ticket.customerId !== userId) { res.status(403).json({ error: "Access denied" }); return; }
    } else if (role === "service_engineer" || role === "service") {
      if (ticket.assignedEngineerId !== userId) { res.status(403).json({ error: "Access denied: not assigned to this ticket" }); return; }
    }
    // service_manager: sees all tickets — no pincode ownership restriction
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

    // Pincode enforcement for service_manager
    if (req.user!.role === "service_manager") {
      const managerId = req.user!.userId;

      // Engineer must be owned by this manager
      const engineer = await prisma.user.findUnique({
        where: { id: engineerId },
        select: { managerId: true, role: true, engineerPincodes: { select: { id: true } } },
      });
      if (!engineer || engineer.role !== "service_engineer") {
        res.status(400).json({ error: "Invalid engineer ID" }); return;
      }
      if (engineer.managerId !== managerId) {
        res.status(403).json({ error: "This engineer is not in your team" }); return;
      }

      // Engineer must have at least one pincode assigned
      if (engineer.engineerPincodes.length === 0) {
        res.status(400).json({ error: "Engineer must have at least one pincode assigned before being assigned to tickets" }); return;
      }

      // Check that the manager manages the ticket's pincode
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
    }

    const ticket = await TicketService.assignEngineer(id, engineerId, req.user!.userId);
    io?.to(`user:${engineerId}`).emit("ticket:assigned", { ticketId: id });
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
// Returns plain OTP now (for Postman testing). Phase C: send to customer via WhatsApp.
export async function requestOTP(req: Request, res: Response): Promise<void> {
  try {
    const id      = String(req.params.id);
    const isAdmin = req.user!.role === "admin";
    const result  = await TicketService.requestOTP(id, req.user!.userId, isAdmin);

    res.json({
      message:   "OTP generated. Provide this code to the customer.",
      otp:       result.otp,
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

    // service_manager: only engineers they own (managerId === their id)
    // admin: all service_engineers
    const engineerWhere: Record<string, unknown> =
      role === "service_manager"
        ? { role: "service_engineer", managerId: userId }
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
