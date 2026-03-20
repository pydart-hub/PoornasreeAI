// ── Ticket Controller ─────────────────────────────────────────────────────
// Thin HTTP layer — delegates all business logic to ticket.service.ts.
// Handles validation, role guards, and response shaping only.

import { Request, Response } from "express";
import { io } from "../lib/socket";
import prisma from "../lib/prisma";
import * as TicketService from "../services/ticket.service";


// ── POST /api/tickets ─────────────────────────────────────────────────────
// Any authenticated user can raise a ticket on behalf of themselves.
// Dealers can also raise tickets, passing an optional dealerId implicitly.
export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    const { problemDescription, machineName } = req.body;
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

    const ticket = await TicketService.createTicket({
      customerId:         userId,
      problemDescription,
      machineName,
      pincodeId,
      dealerId: role === "dealer" ? userId : undefined,
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
    if (statusQ) filters.status = statusQ;

    // Role-scoped filtering
    if (role === "customer")                                     filters.customerId = userId;
    else if (role === "dealer")                                  filters.dealerId   = userId;
    else if (role === "service_engineer" || role === "service")  filters.engineerId = userId;
    else if (role === "service_manager") {
      // Manager sees tickets from ALL pincodes they manage + unrouted tickets
      const managedPincodes = await prisma.pincode.findMany({
        where: { managerId: userId },
        select: { id: true },
      });
      if (managedPincodes.length > 0) {
        filters.managedPincodeIds = managedPincodes.map(p => p.id);
      } else {
        // Fallback: legacy single-pincode assignment
        const managerPincodeId = req.user!.pincodeId;
        if (managerPincodeId) filters.pincodeIdOrNull = managerPincodeId;
      }
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
    } else if (role === "service_manager") {
      // Check if this manager manages the ticket's pincode
      if (ticket.pincodeId) {
        const pincodeRecord = await prisma.pincode.findUnique({
          where: { id: ticket.pincodeId },
          select: { managerId: true },
        });
        if (pincodeRecord && pincodeRecord.managerId && pincodeRecord.managerId !== userId) {
          res.status(403).json({ error: "Access denied: ticket outside your pincode" }); return;
        }
      }
    }
    // admin: full access — no filter

    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── PATCH /api/tickets/:id/assign-manager ─────────────────────────────────
export async function assignManager(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { managerId } = req.body;
    if (!managerId) { res.status(400).json({ error: "managerId is required" }); return; }

    const ticket = await TicketService.assignManager(id, managerId);
    io?.to("engineers").emit("ticket:updated", { ticketId: id, status: ticket.status });
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

      // Verify engineer exists and is a service_engineer
      const engineer = await prisma.user.findUnique({
        where: { id: engineerId },
        select: { pincodeId: true, role: true },
      });
      if (!engineer || engineer.role !== "service_engineer") {
        res.status(400).json({ error: "Invalid engineer ID" }); return;
      }

      // Check that the manager manages the ticket's pincode
      const existing = await TicketService.getTicket(id);
      if (!existing) { res.status(404).json({ error: "Ticket not found" }); return; }

      if (existing.pincodeId) {
        const pincodeRecord = await prisma.pincode.findUnique({
          where: { id: existing.pincodeId },
          select: { managerId: true, engineers: { select: { id: true } } },
        });
        if (pincodeRecord && pincodeRecord.managerId !== managerId) {
          res.status(403).json({ error: "Cannot manage tickets outside your assigned pincodes" }); return;
        }
        // Warn if engineer is not mapped to this pincode (still allow)
        const isEngineerMapped = pincodeRecord?.engineers.some(e => e.id === engineerId);
        if (!isEngineerMapped) {
          // Allow but log — the frontend can show a warning
        }
      }
    }

    const ticket = await TicketService.assignEngineer(id, engineerId);
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

    res.json({ message: "Ticket closed successfully", ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/tickets/engineers ────────────────────────────────────────────
// Returns engineers from the manager's assigned pincodes (via new many-to-many),
// including active ticket counts for workload visibility.
// Admin sees all service_engineers.
export async function listEngineers(req: Request, res: Response): Promise<void> {
  try {
    const role   = req.user!.role;
    const userId = req.user!.userId;

    let engineerWhere: Record<string, unknown> = { role: "service_engineer" };

    if (role === "service_manager") {
      // Find pincodes managed by this manager
      const managedPincodes = await prisma.pincode.findMany({
        where: { managerId: userId },
        select: { id: true, engineers: { select: { id: true } } },
      });

      if (managedPincodes.length > 0) {
        // Collect unique engineer IDs from all managed pincodes
        const engineerIds = new Set<string>();
        for (const p of managedPincodes) {
          for (const e of p.engineers) engineerIds.add(e.id);
        }
        if (engineerIds.size > 0) {
          engineerWhere = { id: { in: Array.from(engineerIds) }, role: "service_engineer" };
        } else {
          // No engineers mapped — return empty
          res.json({ engineers: [] });
          return;
        }
      } else {
        // Fallback: legacy single-pincode
        const pincodeId = req.user!.pincodeId;
        if (pincodeId) engineerWhere.pincodeId = pincodeId;
      }
    }

    const engineers = await prisma.user.findMany({
      where: engineerWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        pincodeId: true,
        _count: {
          select: {
            engineerTickets: {
              where: { status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] } },
            },
          },
        },
      },
      orderBy: { firstName: "asc" },
    });

    // Flatten _count into activeTickets
    const result = engineers.map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      pincodeId: e.pincodeId,
      activeTickets: e._count.engineerTickets,
    }));

    res.json({ engineers: result });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}
