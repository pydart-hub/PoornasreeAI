// ── Ticket Service ────────────────────────────────────────────────────────
// Core business logic for the Ticket lifecycle.
// Status flow: OPEN → ASSIGNED → IN_PROGRESS → PENDING_OTP → CLOSED

import crypto from "crypto";
import bcrypt from "bcrypt";
import { TicketStatus, TicketOwnerType } from "@prisma/client";
import prisma from "../lib/prisma";
import { enrichTicketFromSerial, resolveDealerFromPasstestCustomer } from "./dealerMatch.service";
import * as WhatsAppService from "./whatsapp.service";
import { notifyTicketEvent } from "./integration-webhook.service";

export const activeOtps = new Map<string, { code: string; expiresAt: Date }>();

export function getActiveOtp(ticketId: string): string | null {
  const record = activeOtps.get(ticketId);
  if (!record) return null;
  if (new Date() > record.expiresAt) {
    activeOtps.delete(ticketId);
    return null;
  }
  return record.code;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TICKET_INCLUDE = {
  customer:        { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
  dealer:          { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedManager: { select: { id: true, firstName: true, lastName: true } },
  assignedEngineer:{ select: { id: true, firstName: true, lastName: true } },
  assignedDealer:  { select: { id: true, firstName: true, lastName: true, email: true } },
  pincode:         { select: { id: true, code: true, place: true, district: true, state: true } },
} as const;

// ── State machine ────────────────────────────────────────────────────────
// Single source of truth for all permitted status transitions.
// Any update that would violate this table is rejected before touching the DB.
const ALLOWED_TRANSITIONS: Readonly<Partial<Record<TicketStatus, TicketStatus>>> = {
  [TicketStatus.OPEN]:        TicketStatus.ASSIGNED,
  [TicketStatus.ASSIGNED]:    TicketStatus.IN_PROGRESS,
  [TicketStatus.IN_PROGRESS]: TicketStatus.PENDING_OTP,
  [TicketStatus.PENDING_OTP]: TicketStatus.CLOSED,
};

function assertTransition(current: TicketStatus, next: TicketStatus): void {
  if (current === TicketStatus.CLOSED) {
    throw Object.assign(new Error("Cannot update a closed ticket"), { status: 400 });
  }
  if (ALLOWED_TRANSITIONS[current] !== next) {
    throw Object.assign(
      new Error(`Invalid status transition: ${current} \u2192 ${next}`),
      { status: 400 },
    );
  }
}

/** Generates TKT-YYYYMMDD-XXXXXXXX using a cryptographically random 4-byte
 *  suffix. No DB read required — collision probability is ~1 in 4 billion per
 *  day, safe at any realistic ticket volume. The @unique constraint on
 *  ticketNumber in the schema remains the final safety net. */
function generateTicketNumber(): string {
  const now     = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const suffix  = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TKT-${dateStr}-${suffix}`;
}

// ── autoAssignEngineer ───────────────────────────────────────────────────
// Attempts to auto-assign an engineer to a ticket based on pincode matching
// and workload (least active tickets). Returns the assigned engineerId or null.
export async function autoAssignEngineer(
  ticketId: string,
  pincodeId: string,
): Promise<{ assigned: boolean; engineerId?: string }> {
  // Find all engineers covering this pincode
  const engineers = await prisma.user.findMany({
    where: {
      role: "service_engineer",
      engineerPincodes: { some: { id: pincodeId } },
    },
    select: {
      id: true,
      _count: {
        select: {
          engineerTickets: {
            where: {
              status: {
                in: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING_OTP],
              },
            },
          },
        },
      },
    },
  });

  if (engineers.length === 0) {
    return { assigned: false };
  }

  // Sort by active ticket count ascending (least loaded first)
  engineers.sort((a, b) => a._count.engineerTickets - b._count.engineerTickets);
  const bestEngineer = engineers[0];

  // Atomic conditional update: only if still OPEN and no engineer assigned
  const result = await prisma.ticket.updateMany({
    where: {
      id:                 ticketId,
      status:             TicketStatus.OPEN,
      assignedEngineerId: null,
    },
    data: {
      assignedEngineerId: bestEngineer.id,
      status:             TicketStatus.ASSIGNED,
    },
  });

  if (result.count === 1) {
    return { assigned: true, engineerId: bestEngineer.id };
  }

  return { assigned: false };
}

// ── createTicket ─────────────────────────────────────────────────────────
export async function createTicket(data: {
  customerId:         string;
  problemDescription: string;
  issueDescription?:  string;
  machineName?:       string;
  machineSerialNumber?: string;
  pincodeId?:         string;
  dealerId?:          string;
  phoneNumber?:       string;
  place?:             string;
  district?:          string;
  state?:             string;
  customerAddress?:   string;
}) {
  const ticketNumber = generateTicketNumber();

  // Enrich from Passtest when serial provided
  let machineName        = data.machineName?.trim()  || null;
  let machineProductCode: string | null = null;
  let machineCustomer:    string | null = null;
  let machineAddress1:    string | null = null;
  let machineAddress2:    string | null = null;
  let machineInvoiceNo:   string | null = null;
  let machineInvoiceDate: string | null = null;
  let machineWarranty:    number | null = null;
  let passtestMatched    = false;
  let passtestDealerId:   string | null = null;

  if (data.machineSerialNumber?.trim()) {
    const enriched = await enrichTicketFromSerial(
      data.machineSerialNumber.trim(),
      data.machineName,
    );
    passtestMatched = enriched.passtestMatched;
    passtestDealerId = enriched.suggestedDealerId;
    machineName        = enriched.machineFields.machineName;
    machineProductCode = enriched.machineFields.machineProductCode;
    machineCustomer    = enriched.machineFields.machineCustomer;
    machineAddress1    = enriched.machineFields.machineAddress1;
    machineAddress2    = enriched.machineFields.machineAddress2;
    machineInvoiceNo   = enriched.machineFields.machineInvoiceNo;
    machineInvoiceDate = enriched.machineFields.machineInvoiceDate;
    machineWarranty    = enriched.machineFields.machineWarranty;
  }

  // ── Routing decision ────────────────────────────────────────────────────
  // ALL tickets route to MANAGER. dealerId = Passtest-suggested dealer metadata.
  let resolvedDealerId: string | null = null;
  const ownerType: TicketOwnerType = TicketOwnerType.MANAGER;
  const status: TicketStatus = TicketStatus.OPEN;

  if (data.dealerId) {
    const dealer = await prisma.user.findUnique({
      where: { id: data.dealerId },
      select: { id: true, role: true },
    });
    if (dealer && dealer.role === "dealer") {
      resolvedDealerId = dealer.id;
    } else {
      console.warn(`[createTicket] dealerId ${data.dealerId} not found or not a dealer — ignoring`);
    }
  } else if (passtestDealerId) {
    resolvedDealerId = passtestDealerId;
  }

  // All tickets go to service manager queue
  const defaultManager = await prisma.user.findFirst({
    where: { role: "service_manager" },
    select: { id: true },
  });
  const ownerId = defaultManager?.id ?? null;

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      ownerType,
      ownerId,
      customerId:          data.customerId,
      problemDescription:  data.problemDescription.trim(),
      issueDescription:    data.issueDescription?.trim() || null,
      machineName,
      machineSerialNumber: data.machineSerialNumber?.trim() || null,
      machineProductCode,
      machineCustomer,
      machineAddress1,
      machineAddress2,
      machineInvoiceNo,
      machineInvoiceDate,
      machineWarranty,
      pincodeId:           data.pincodeId  || null,
      dealerId:            resolvedDealerId,
      phoneNumber:         data.phoneNumber || null,
      place:               data.place?.trim() || null,
      district:            data.district?.trim() || null,
      state:               data.state?.trim() || null,
      customerAddress:     data.customerAddress?.trim() || null,
      passtestMatched,
      status,
    },
    include: TICKET_INCLUDE,
  });

  notifyTicketEvent("ticket.created", ticket.id);
  return ticket;
}

// ── listTickets ───────────────────────────────────────────────────────────
export async function listTickets(filters: {
  status?:            TicketStatus;
  pincodeId?:         string;
  managedPincodeIds?: string[]; // pincodes managed by a service_manager — filters to exact matches only
  customerId?:        string;
  dealerId?:          string;
  engineerId?:        string;
  managerId?:         string;
  ownerType?:         TicketOwnerType;
  ownerId?:           string;
  assignedDealerId?:  string; // dealer assigned by service manager for field work
}) {
  const where: Record<string, unknown> = {};
  if (filters.status !== undefined) where.status           = filters.status;

  // Owner-based routing filter
  if (filters.ownerType) where.ownerType = filters.ownerType;
  if (filters.ownerId)   where.ownerId   = filters.ownerId;

  // Multi-pincode manager filter: only tickets in managed pincodes (no unrouted)
  if (filters.managedPincodeIds) {
    where.pincodeId = { in: filters.managedPincodeIds };
  } else if (filters.pincodeId) {
    where.pincodeId = filters.pincodeId;
  }

  if (filters.customerId)       where.customerId         = filters.customerId;
  if (filters.dealerId)         where.dealerId           = filters.dealerId;
  if (filters.engineerId)       where.assignedEngineerId = filters.engineerId;
  if (filters.managerId)        where.assignedManagerId  = filters.managerId;
  if (filters.assignedDealerId) where.assignedDealerId   = filters.assignedDealerId;

  const tickets = await prisma.ticket.findMany({
    where,
    include:  TICKET_INCLUDE,
    orderBy:  { createdAt: "desc" },
  });

  await backfillPasstestDealerLinks(tickets);
  return tickets;
}

/** Link OPEN tickets that have Passtest customer text but missed dealerId (name mismatch). */
async function backfillPasstestDealerLinks(
  tickets: Awaited<ReturnType<typeof prisma.ticket.findMany<{ include: typeof TICKET_INCLUDE }>>>,
) {
  const pending = tickets.filter(
    (t) =>
      t.status === TicketStatus.OPEN &&
      !t.dealerId &&
      !t.assignedDealerId &&
      t.machineCustomer?.trim(),
  );
  if (!pending.length) return;

  for (const t of pending) {
    const dealerId = await resolveDealerFromPasstestCustomer(t.machineCustomer!);
    if (!dealerId) continue;

    const updated = await prisma.ticket.update({
      where: { id: t.id },
      data: {
        dealerId,
        passtestMatched: t.passtestMatched || !!t.machineSerialNumber?.trim(),
      },
      include: TICKET_INCLUDE,
    });
    Object.assign(t, updated);
  }
}

// ── getTicket ─────────────────────────────────────────────────────────────
export async function getTicket(id: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: TICKET_INCLUDE });
  if (ticket) await backfillPasstestDealerLinks([ticket]);
  return ticket;
}

// ── assignEngineer ────────────────────────────────────────────────────────
// Admin or service_manager assigns an engineer to an OPEN ticket.
// Single-manager system: requires ownerType=MANAGER, no per-ticket manager assignment.
// Uses an atomic conditional updateMany to prevent race conditions.
export async function assignEngineer(ticketId: string, engineerId: string, assignedBy?: string) {
  // Single atomic write: succeeds only when status=OPEN and no engineer yet
  const result = await prisma.ticket.updateMany({
    where: {
      id:                 ticketId,
      status:             TicketStatus.OPEN,
      assignedEngineerId: null,
    },
    data: {
      assignedEngineerId: engineerId,
      status:             TicketStatus.ASSIGNED,
      ...(assignedBy ? { assignedManagerId: assignedBy } : {}),
    },
  });

  if (result.count === 1) {
    const updated = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: TICKET_INCLUDE,
    });
    notifyTicketEvent("ticket.assigned", ticketId);
    try {
      // @ts-ignore
      const { notifyEngineerTicketAssigned } = await import("./engineer-ticket-notification.service");
      notifyEngineerTicketAssigned(ticketId).catch(() => {});
    } catch {}
    return updated;
  }

  // Update did not apply — fetch once to determine and surface the reason
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.assignedEngineerId) {
    throw Object.assign(new Error("Engineer already assigned. Use reassignment flow."), { status: 409 });
  }
  throw Object.assign(new Error("Engineer can only be assigned to tickets in OPEN status"), { status: 400 });
}

// ── unassignEngineer ──────────────────────────────────────────────────────
// Manager or admin removes the assigned engineer, reverting ticket to OPEN.
// Only allowed when ticket is in ASSIGNED status (before work has started).
export async function unassignEngineer(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.status === TicketStatus.CLOSED) {
    throw Object.assign(new Error("Cannot modify a closed ticket"), { status: 400 });
  }
  if (!ticket.assignedEngineerId) {
    throw Object.assign(new Error("No engineer is assigned to this ticket"), { status: 400 });
  }
  if (ticket.status !== TicketStatus.ASSIGNED) {
    throw Object.assign(new Error(`Cannot cancel assignment when ticket is ${ticket.status}. Only ASSIGNED tickets can be unassigned.`), { status: 400 });
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedEngineerId: null,
      status: TicketStatus.OPEN,
    },
    include: TICKET_INCLUDE,
  });
  notifyTicketEvent("ticket.unassigned", ticketId);
  return updated;
}

/** Resolves assigned engineer for public / WhatsApp flows (no web login). */
export async function requireAssignedEngineerId(ticketId: string): Promise<string> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { assignedEngineerId: true },
  });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!ticket.assignedEngineerId) {
    throw Object.assign(new Error("No engineer assigned to this ticket"), { status: 400 });
  }
  return ticket.assignedEngineerId;
}

// ── startWork ─────────────────────────────────────────────────────────────
// Engineer marks a ticket IN_PROGRESS. Records firstEngineeredAt.
export async function startWork(ticketId: string, engineerId: string, isAdmin = false) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket)                         throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!isAdmin && ticket.assignedEngineerId !== engineerId) {
    throw Object.assign(new Error("You are not assigned to this ticket"), { status: 403 });
  }
  assertTransition(ticket.status, TicketStatus.IN_PROGRESS);

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data:  { status: TicketStatus.IN_PROGRESS, firstEngineeredAt: new Date() },
    include: TICKET_INCLUDE,
  });
  notifyTicketEvent("ticket.started", ticketId);
  return updated;
}

// ── requestOTP ────────────────────────────────────────────────────────────
// Engineer requests OTP to close the ticket. Generates a 4-digit code,
// stores its bcrypt hash, and returns the plain code (for Postman testing).
// In the live system, the plain code is sent to the customer via WhatsApp
// instead of being returned in the API response.
export async function requestOTP(ticketId: string, engineerId: string, isAdmin = false, resend = false): Promise<{ otp: string; expiresAt: Date }> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket)                              throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!isAdmin && ticket.assignedEngineerId !== engineerId) {
    throw Object.assign(new Error("You are not assigned to this ticket"), { status: 403 });
  }
  // For a resend the ticket is already PENDING_OTP — no status transition occurs, so skip the check.
  // For a fresh request the ticket must be IN_PROGRESS (the only permitted predecessor).
  if (!resend) {
    assertTransition(ticket.status, TicketStatus.PENDING_OTP);
  } else if (ticket.status !== TicketStatus.PENDING_OTP) {
    throw Object.assign(new Error("Ticket is not in PENDING_OTP state; cannot resend OTP."), { status: 400 });
  }
  // Block regeneration while a valid OTP exists — unless the engineer is explicitly resending.
  if (!resend && ticket.otpCodeHash && ticket.otpExpiresAt && new Date() < ticket.otpExpiresAt) {
    throw Object.assign(new Error("An active OTP already exists. Use resend to send it again."), { status: 409 });
  }

  const plainCode  = String(crypto.randomInt(1000, 10000));   // 4-digit
  const codeHash   = await bcrypt.hash(plainCode, 10);
  const expiresAt  = new Date(Date.now() + 30 * 60 * 1000);  // 30 minutes

  activeOtps.set(ticketId, { code: plainCode, expiresAt });

  await prisma.ticket.update({
    where: { id: ticketId },
    data:  {
      otpCodeHash:  codeHash,
      otpExpiresAt: expiresAt,
      otpVerified:  false,
      otpAttempts:  0,          // reset counter whenever a fresh OTP is issued
      status:       TicketStatus.PENDING_OTP,
    },
  });

  // Send OTP to the customer via real WhatsApp
  if (ticket.phoneNumber) {
    const otpMsg = `🔐 Your OTP for ticket ${ticket.ticketNumber} is: *${plainCode}*\n\nPlease share this code with the service engineer to close your ticket.\n\nThis code expires in 30 minutes.`;
    if (WhatsAppService.isConfigured()) {
      // Send via Meta WhatsApp Cloud API
      WhatsAppService.sendMessage(ticket.phoneNumber, otpMsg).catch(() => {});
    } else {
      // Fallback: push to simulate chat when WhatsApp is not configured
      await prisma.simulateMessage.create({
        data: {
          phoneNumber: ticket.phoneNumber,
          role: "system",
          content: otpMsg,
        },
      }).catch(() => {});
    }
  }

  notifyTicketEvent("ticket.otp_requested", ticketId);
  return { otp: plainCode, expiresAt };
}

// ── verifyOTP ─────────────────────────────────────────────────────────────
// Engineer submits the OTP provided by the customer. On success, closes ticket.
// The failed-attempt increment is atomic: updateMany only fires while
// otpAttempts < 3, preventing concurrent requests from bypassing the limit.
export async function verifyOTP(ticketId: string, userId: string, code: string, isAdmin = false) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket)                              throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!isAdmin && ticket.assignedEngineerId !== userId) {
    throw Object.assign(new Error("You are not assigned to this ticket"), { status: 403 });
  }
  assertTransition(ticket.status, TicketStatus.CLOSED);
  // assertTransition guarantees status === PENDING_OTP here; check kept for explicit clarity
  if (ticket.status !== TicketStatus.PENDING_OTP) throw Object.assign(new Error("No OTP pending for this ticket"), { status: 400 });
  if (!ticket.otpCodeHash || !ticket.otpExpiresAt) {
    throw Object.assign(new Error("OTP was not generated"), { status: 400 });
  }
  if (new Date() > ticket.otpExpiresAt)     throw Object.assign(new Error("OTP has expired"), { status: 400 });

  // Fast-fail on clearly locked tickets before the expensive bcrypt call
  if (ticket.otpAttempts >= 3) {
    throw Object.assign(new Error("OTP locked after 3 failed attempts. A Service Manager must override to close this ticket."), { status: 423 });
  }

  const valid = await bcrypt.compare(code, ticket.otpCodeHash);

  if (valid) {
    activeOtps.delete(ticketId);
    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data:  { otpVerified: true, status: TicketStatus.CLOSED, closedAt: new Date() },
      include: TICKET_INCLUDE,
    });
    notifyTicketEvent("ticket.closed", ticketId);
    return updated;
  }

  // Atomically increment attempts — only succeeds if still below the limit.
  // Concurrent requests at attempt limit (otpAttempts=2) will race here;
  // only one will find otpAttempts < 3 and succeed; the rest get count=0.
  const incremented = await prisma.ticket.updateMany({
    where: {
      id:          ticketId,
      status:      TicketStatus.PENDING_OTP,
      otpAttempts: { lt: 3 },
    },
    data: { otpAttempts: { increment: 1 } },
  });

  if (incremented.count === 0) {
    // Concurrent request already consumed the last allowed attempt, or state changed
    const fresh = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!fresh || fresh.status !== TicketStatus.PENDING_OTP) {
      throw Object.assign(new Error("No OTP pending for this ticket"), { status: 400 });
    }
    throw Object.assign(new Error("OTP locked after 3 failed attempts. A Service Manager must override to close this ticket."), { status: 423 });
  }

  const attempts  = ticket.otpAttempts + 1;
  const remaining = 3 - attempts;
  if (remaining <= 0) {
    throw Object.assign(new Error("OTP locked after 3 failed attempts. A Service Manager must override to close this ticket."), { status: 423 });
  }
  throw Object.assign(new Error(`Invalid OTP. ${remaining} attempt(s) remaining.`), { status: 400 });
}

// ── assignDealer ──────────────────────────────────────────────────────────
// Service manager explicitly routes a ticket to a dealer for field handling.
// Sets assignedDealerId so the dealer can see the ticket in their "My Jobs" view.
// ownerType remains MANAGER — the ticket stays fully under service manager control.
export async function assignDealer(ticketId: string, dealerId: string, assignedBy?: string) {
  // Validate dealer exists
  const dealer = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { id: true, role: true },
  });
  if (!dealer || dealer.role !== "dealer") {
    throw Object.assign(new Error("Invalid dealer ID"), { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.status === TicketStatus.CLOSED) {
    throw Object.assign(new Error("Cannot assign a closed ticket"), { status: 400 });
  }

  // Ticket stays under MANAGER ownerType — only assignedDealerId changes.
  // This keeps all tickets always visible to the service manager.
  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedDealerId: dealerId,
      dealerResponse: "pending",
      dealerRespondedAt: null,
      ...(assignedBy ? { assignedManagerId: assignedBy } : {}),
    },
    include: TICKET_INCLUDE,
  });
}

// ── dealerAccept ──────────────────────────────────────────────────────────
export async function dealerAccept(ticketId: string, dealerUserId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.assignedDealerId !== dealerUserId) {
    throw Object.assign(new Error("Ticket is not assigned to you"), { status: 403 });
  }
  if (ticket.status === TicketStatus.CLOSED) {
    throw Object.assign(new Error("Cannot accept a closed ticket"), { status: 400 });
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      dealerResponse: "accepted",
      dealerRespondedAt: new Date(),
    },
    include: TICKET_INCLUDE,
  });
}

// ── dealerReject ──────────────────────────────────────────────────────────
export async function dealerReject(ticketId: string, dealerUserId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.assignedDealerId !== dealerUserId) {
    throw Object.assign(new Error("Ticket is not assigned to you"), { status: 403 });
  }
  if (ticket.status === TicketStatus.CLOSED) {
    throw Object.assign(new Error("Cannot reject a closed ticket"), { status: 400 });
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedDealerId: null,
      dealerResponse: "rejected",
      dealerRespondedAt: new Date(),
    },
    include: TICKET_INCLUDE,
  });
}

// ── dealerComplete ────────────────────────────────────────────────────────
export async function dealerComplete(ticketId: string, dealerUserId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.assignedDealerId !== dealerUserId) {
    throw Object.assign(new Error("Ticket is not assigned to you"), { status: 403 });
  }
  if (ticket.status === TicketStatus.CLOSED) {
    throw Object.assign(new Error("Ticket is already closed"), { status: 400 });
  }
  if (ticket.dealerResponse !== "accepted") {
    throw Object.assign(new Error("Accept the ticket before completing"), { status: 400 });
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      dealerResponse: "completed",
      dealerRespondedAt: new Date(),
      status: TicketStatus.CLOSED,
      closedAt: new Date(),
    },
    include: TICKET_INCLUDE,
  });
  notifyTicketEvent("ticket.closed", ticketId);
  return updated;
}
