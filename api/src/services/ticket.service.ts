// ── Ticket Service ────────────────────────────────────────────────────────
// Core business logic for the Ticket lifecycle.
// Status flow: OPEN → ASSIGNED → IN_PROGRESS → PENDING_OTP → CLOSED

import crypto from "crypto";
import bcrypt from "bcrypt";
import { TicketStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import { fetchMachineBySerial } from "./machine.service";

// ── Helpers ───────────────────────────────────────────────────────────────

const TICKET_INCLUDE = {
  customer:        { select: { id: true, firstName: true, lastName: true, email: true } },
  dealer:          { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedManager: { select: { id: true, firstName: true, lastName: true } },
  assignedEngineer:{ select: { id: true, firstName: true, lastName: true } },
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

// ── createTicket ─────────────────────────────────────────────────────────
export async function createTicket(data: {
  customerId:         string;
  problemDescription: string;
  machineName?:       string;
  machineSerialNumber?: string;
  pincodeId?:         string;
  dealerId?:          string;
  phoneNumber?:       string;
  place?:             string;
  district?:          string;
  state?:             string;
}) {
  const ticketNumber = generateTicketNumber();

  // Enrich from Passtest machine API if a serial number was provided.
  // Non-blocking: 404 → null (skip silently); 502/503 → log and skip.
  let machineName     = data.machineName?.trim()         || null;
  let machineProductCode: string | null = null;
  let machineCustomer:    string | null = null;
  if (data.machineSerialNumber?.trim()) {
    try {
      const machineData = await fetchMachineBySerial(data.machineSerialNumber.trim());
      if (machineData) {
        machineName        = machineData.m_model       || machineName;
        machineProductCode = machineData.product_code  || null;
        machineCustomer    = machineData.customer       || null;
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      console.error(`[createTicket] Passtest API error for serial ${data.machineSerialNumber}: ${e.message}`);
    }
  }

  // ── Routing decision ────────────────────────────────────────────────────
  // 1. If dealerId is provided and valid → dealer-routed (OPEN, no auto-manager)
  // 2. Else → manager-routed: auto-assign manager from pincode (ASSIGNED)
  // Fallback: if dealer not found in DB → ignore and route to manager
  let resolvedDealerId: string | null = null;
  let assignedManagerId: string | null = null;
  let status: TicketStatus = TicketStatus.OPEN;

  if (data.dealerId) {
    const dealer = await prisma.user.findUnique({
      where: { id: data.dealerId },
      select: { id: true, role: true },
    });
    if (dealer && dealer.role === "dealer") {
      resolvedDealerId = dealer.id;
      // Dealer-routed: stays OPEN until dealer or admin assigns manager
    } else {
      console.warn(`[createTicket] dealerId ${data.dealerId} not found or not a dealer — falling back to manager routing`);
    }
  }

  // Manager routing removed — tickets stay OPEN until manually assigned

  return prisma.ticket.create({
    data: {
      ticketNumber,
      customerId:         data.customerId,
      problemDescription: data.problemDescription.trim(),
      machineName,
      machineSerialNumber: data.machineSerialNumber?.trim() || null,
      machineProductCode,
      machineCustomer,
      pincodeId:          data.pincodeId  || null,
      dealerId:           resolvedDealerId,
      phoneNumber:        data.phoneNumber || null,
      place:              data.place?.trim() || null,
      district:           data.district?.trim() || null,
      state:              data.state?.trim() || null,
      assignedManagerId,
      status,
    },
    include: TICKET_INCLUDE,
  });
}

// ── listTickets ───────────────────────────────────────────────────────────
export async function listTickets(filters: {
  status?:          TicketStatus;
  pincodeId?:         string;
  managedPincodeIds?: string[]; // pincodes managed by a service_manager — filters to exact matches only
  customerId?:      string;
  dealerId?:        string;
  engineerId?:      string;
  managerId?:       string;
}) {
  const where: Record<string, unknown> = {};
  if (filters.status !== undefined) where.status           = filters.status;

  // Multi-pincode manager filter: only tickets in managed pincodes (no unrouted)
  if (filters.managedPincodeIds) {
    // Empty array means manager has no pincodes — callers must short-circuit before here,
    // but guard defensively so no tickets leak through.
    where.pincodeId = { in: filters.managedPincodeIds };
  } else if (filters.pincodeId) {
    where.pincodeId = filters.pincodeId;
  }

  if (filters.customerId) where.customerId         = filters.customerId;
  if (filters.dealerId)   where.dealerId           = filters.dealerId;
  if (filters.engineerId) where.assignedEngineerId = filters.engineerId;
  if (filters.managerId)  where.assignedManagerId  = filters.managerId;

  return prisma.ticket.findMany({
    where,
    include:  TICKET_INCLUDE,
    orderBy:  { createdAt: "desc" },
  });
}

// ── getTicket ─────────────────────────────────────────────────────────────
export async function getTicket(id: string) {
  return prisma.ticket.findUnique({ where: { id }, include: TICKET_INCLUDE });
}

// ── assignManager ─────────────────────────────────────────────────────────
// Admin or service_manager assigns a manager to an OPEN ticket.
// Uses an atomic conditional updateMany to prevent race conditions — the
// update only applies when status=OPEN and no manager is set.
export async function assignManager(ticketId: string, managerId: string) {
  const result = await prisma.ticket.updateMany({
    where: {
      id:               ticketId,
      status:           TicketStatus.OPEN,
      assignedManagerId: null,
    },
    data: { assignedManagerId: managerId, status: TicketStatus.ASSIGNED },
  });

  if (result.count === 1) {
    return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: TICKET_INCLUDE });
  }

  // Update did not apply — fetch once to determine and surface the reason
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.assignedManagerId) {
    throw Object.assign(new Error("Manager already assigned. Use reassignment flow."), { status: 409 });
  }
  assertTransition(ticket.status, TicketStatus.ASSIGNED);
  throw Object.assign(new Error("Only OPEN tickets can have a manager assigned"), { status: 400 });
}

// ── assignEngineer ────────────────────────────────────────────────────────
// Admin or service_manager assigns an engineer to an ASSIGNED ticket.
// Requires: status = ASSIGNED and assignedManagerId is already set.
// Uses an atomic conditional updateMany to prevent race conditions — the
// update only applies when all three preconditions hold simultaneously.
export async function assignEngineer(ticketId: string, engineerId: string) {
  // Single atomic write: succeeds only when status=ASSIGNED, manager set, no engineer yet
  const result = await prisma.ticket.updateMany({
    where: {
      id:                 ticketId,
      status:             TicketStatus.ASSIGNED,
      assignedManagerId:  { not: null },
      assignedEngineerId: null,
    },
    data: { assignedEngineerId: engineerId },
  });

  if (result.count === 1) {
    return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: TICKET_INCLUDE });
  }

  // Update did not apply — fetch once to determine and surface the reason
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.assignedEngineerId) {
    throw Object.assign(new Error("Engineer already assigned. Use reassignment flow."), { status: 409 });
  }
  if (!ticket.assignedManagerId) {
    throw Object.assign(new Error("A manager must be assigned before assigning an engineer"), { status: 400 });
  }
  if (ticket.status === TicketStatus.OPEN) {
    throw Object.assign(new Error("A manager must be assigned before assigning an engineer"), { status: 400 });
  }
  throw Object.assign(new Error("Engineer can only be assigned to tickets in ASSIGNED status"), { status: 400 });
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

  return prisma.ticket.update({
    where: { id: ticketId },
    data:  { status: TicketStatus.IN_PROGRESS, firstEngineeredAt: new Date() },
    include: TICKET_INCLUDE,
  });
}

// ── requestOTP ────────────────────────────────────────────────────────────
// Engineer requests OTP to close the ticket. Generates a 4-digit code,
// stores its bcrypt hash, and returns the plain code (for Postman testing).
// In the live system, the plain code is sent to the customer via WhatsApp
// instead of being returned in the API response.
export async function requestOTP(ticketId: string, engineerId: string, isAdmin = false): Promise<{ otp: string; expiresAt: Date }> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket)                              throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!isAdmin && ticket.assignedEngineerId !== engineerId) {
    throw Object.assign(new Error("You are not assigned to this ticket"), { status: 403 });
  }
  assertTransition(ticket.status, TicketStatus.PENDING_OTP);
  // Block regeneration while a valid (non-expired) OTP already exists.
  // Prevents resetting otpAttempts on a live OTP regardless of how status was restored.
  if (ticket.otpCodeHash && ticket.otpExpiresAt && new Date() < ticket.otpExpiresAt) {
    throw Object.assign(new Error("An active OTP already exists. Wait for it to expire before requesting a new one."), { status: 409 });
  }

  const plainCode  = String(crypto.randomInt(1000, 10000));   // 4-digit
  const codeHash   = await bcrypt.hash(plainCode, 10);
  const expiresAt  = new Date(Date.now() + 30 * 60 * 1000);  // 30 minutes

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

  // Push OTP to simulate chat if this ticket was raised from the WhatsApp simulator
  if (ticket.phoneNumber) {
    await prisma.simulateMessage.create({
      data: {
        phoneNumber: ticket.phoneNumber,
        role: "system",
        content: `🔐 Your OTP for ticket ${ticket.ticketNumber} is: ${plainCode}\n\nPlease share this code with the service engineer to close your ticket.\n\nThis code expires in 30 minutes.`,
      },
    }).catch(() => {}); // non-blocking
  }

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
    return prisma.ticket.update({
      where: { id: ticketId },
      data:  { otpVerified: true, status: TicketStatus.CLOSED, closedAt: new Date() },
      include: TICKET_INCLUDE,
    });
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
