// ── Ticket Service ────────────────────────────────────────────────────────
// Core business logic for the Ticket lifecycle.
// Status flow: OPEN → ASSIGNED → IN_PROGRESS → PENDING_OTP → CLOSED

import crypto from "crypto";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";

// ── Helpers ───────────────────────────────────────────────────────────────

const TICKET_INCLUDE = {
  customer:        { select: { id: true, firstName: true, lastName: true, email: true } },
  dealer:          { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedManager: { select: { id: true, firstName: true, lastName: true } },
  assignedEngineer:{ select: { id: true, firstName: true, lastName: true } },
  pincode:         { select: { id: true, code: true, regionName: true } },
} as const;

/** Generates TKT-YYYYMMDD-NNN, unique per day. */
async function generateTicketNumber(): Promise<string> {
  const now     = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const prefix  = `TKT-${dateStr}-`;
  const count   = await prisma.ticket.count({ where: { ticketNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

// ── createTicket ─────────────────────────────────────────────────────────
export async function createTicket(data: {
  customerId:         string;
  problemDescription: string;
  machineName?:       string;
  pincodeId?:         string;
  dealerId?:          string;
  phoneNumber?:       string;
}) {
  const ticketNumber = await generateTicketNumber();

  // Tickets always start as OPEN — service manager assigns engineer from their dashboard.
  return prisma.ticket.create({
    data: {
      ticketNumber,
      customerId:         data.customerId,
      problemDescription: data.problemDescription.trim(),
      machineName:        data.machineName?.trim() || null,
      pincodeId:          data.pincodeId  || null,
      dealerId:           data.dealerId   || null,
      phoneNumber:        data.phoneNumber || null,
      status:             "OPEN",
    },
    include: TICKET_INCLUDE,
  });
}

// ── listTickets ───────────────────────────────────────────────────────────
export async function listTickets(filters: {
  status?:     string;
  pincodeId?:  string;
  customerId?: string;
  dealerId?:   string;
  engineerId?: string;
  managerId?:  string;
}) {
  const where: Record<string, unknown> = {};
  if (filters.status)     where.status             = filters.status;
  if (filters.pincodeId)  where.pincodeId          = filters.pincodeId;
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
export async function assignManager(ticketId: string, managerId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket)                  throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.status !== "OPEN") throw Object.assign(new Error("Only OPEN tickets can have a manager assigned"), { status: 400 });

  return prisma.ticket.update({
    where: { id: ticketId },
    data:  { assignedManagerId: managerId, status: "ASSIGNED" },
    include: TICKET_INCLUDE,
  });
}

// ── assignEngineer ────────────────────────────────────────────────────────
// Admin or service_manager assigns an engineer to an OPEN or ASSIGNED ticket.
export async function assignEngineer(ticketId: string, engineerId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!["OPEN", "ASSIGNED"].includes(ticket.status)) {
    throw Object.assign(new Error("Engineer can only be assigned to OPEN or ASSIGNED tickets"), { status: 400 });
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data:  { assignedEngineerId: engineerId, status: "ASSIGNED" },
    include: TICKET_INCLUDE,
  });
}

// ── startWork ─────────────────────────────────────────────────────────────
// Engineer marks a ticket IN_PROGRESS. Records firstEngineeredAt.
export async function startWork(ticketId: string, engineerId: string, isAdmin = false) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket)                         throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!isAdmin && ticket.assignedEngineerId !== engineerId) {
    throw Object.assign(new Error("You are not assigned to this ticket"), { status: 403 });
  }
  if (ticket.status !== "ASSIGNED") {
    throw Object.assign(new Error("Ticket must be in ASSIGNED status to start work"), { status: 400 });
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data:  { status: "IN_PROGRESS", firstEngineeredAt: new Date() },
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
  if (ticket.status !== "IN_PROGRESS") {
    throw Object.assign(new Error("Ticket must be IN_PROGRESS before requesting OTP"), { status: 400 });
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
      status:       "PENDING_OTP",
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
export async function verifyOTP(ticketId: string, userId: string, code: string, isAdmin = false) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket)                              throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (!isAdmin && ticket.assignedEngineerId !== userId) {
    throw Object.assign(new Error("You are not assigned to this ticket"), { status: 403 });
  }
  if (ticket.status !== "PENDING_OTP")      throw Object.assign(new Error("No OTP pending for this ticket"), { status: 400 });
  if (!ticket.otpCodeHash || !ticket.otpExpiresAt) {
    throw Object.assign(new Error("OTP was not generated"), { status: 400 });
  }
  if (new Date() > ticket.otpExpiresAt)     throw Object.assign(new Error("OTP has expired"), { status: 400 });

  // Enforce attempt limit BEFORE running the expensive bcrypt compare
  if (ticket.otpAttempts >= 3) {
    throw Object.assign(new Error("OTP locked after 3 failed attempts. A Service Manager must override to close this ticket."), { status: 423 });
  }

  const valid = await bcrypt.compare(code, ticket.otpCodeHash);
  if (!valid) {
    const attempts = ticket.otpAttempts + 1;
    await prisma.ticket.update({ where: { id: ticketId }, data: { otpAttempts: attempts } });
    const remaining = 3 - attempts;
    if (remaining <= 0) {
      throw Object.assign(new Error("OTP locked after 3 failed attempts. A Service Manager must override to close this ticket."), { status: 423 });
    }
    throw Object.assign(new Error(`Invalid OTP. ${remaining} attempt(s) remaining.`), { status: 400 });
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data:  {
      otpVerified: true,
      status:      "CLOSED",
      closedAt:    new Date(),
    },
    include: TICKET_INCLUDE,
  });
}
