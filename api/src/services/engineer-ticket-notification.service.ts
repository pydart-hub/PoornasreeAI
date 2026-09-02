// ── Outbound WhatsApp Service for Engineer Ticket Assignment Alerts ─────────

import prisma from "../lib/prisma";
import { resolveTicketCustomerName } from "../lib/ticket-customer";
import {
  formatTicketDetailMessage,
  sendEngineerMessage,
  type EngineerTicketRow,
  ENG_PREFIX,
} from "./engineer-ticket-whatsapp.shared";

/**
 * Notification on ticket assignment has been disabled per user requirement.
 * This is now a no-op so no WhatsApp messages or templates are sent to engineers on ticket assignment.
 */
export async function notifyEngineerTicketAssigned(_ticketId: string): Promise<void> {
  // Ticket assignment notification to engineer disabled per system requirement
  return;
}

/**
 * Sends a summary of active/pending tickets to each active engineer (e.g. 8:00 AM digest).
 */
export async function sendDailyEngineerSummary(): Promise<void> {
  const engineers = await prisma.user.findMany({
    where: { role: "service_engineer" },
    select: { id: true, firstName: true, whatsappNumber: true },
  });

  for (const eng of engineers) {
    if (!eng.whatsappNumber) continue;

    const tickets = await prisma.ticket.findMany({
      where: {
        assignedEngineerId: eng.id,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
      },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        pincode: { select: { id: true, code: true, place: true, district: true, state: true } },
        problemDescription: true,
        issueDescription: true,
        machineCustomer: true,
        machineName: true,
        machineSerialNumber: true,
        machineAddress1: true,
        machineAddress2: true,
        customerAddress: true,
        phoneNumber: true,
        createdAt: true,
        updatedAt: true,
        assignedEngineerId: true,
        customer: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { status: "asc" },
    });

    if (tickets.length === 0) {
      await sendEngineerMessage(
        eng.whatsappNumber,
        `📅 *Daily Ticket Summary - 8:00 AM*\n\nHi ${eng.firstName}, you have no pending tickets today. Great job!`,
        [
          { id: "TICKETS", title: "📋 My Tickets" },
          { id: "HELP", title: "❓ Help" },
        ],
      );
      continue;
    }

    const assignedCount = tickets.filter((t) => t.status === "ASSIGNED").length;
    const inProgressCount = tickets.filter((t) => t.status === "IN_PROGRESS").length;
    const pendingOtpCount = tickets.filter((t) => t.status === "PENDING_OTP").length;

    const listLines = tickets
      .map((t, idx) => {
        const custName = resolveTicketCustomerName(t as any) || "Customer";
        const place = t.pincode?.place ?? "—";
        let statusIcon = "🔵";
        if (t.status === "IN_PROGRESS") statusIcon = "🟡";
        if (t.status === "PENDING_OTP") statusIcon = "🟠";
        return `${idx + 1}. ${statusIcon} *${t.ticketNumber}* (${t.status})\n   👤 ${custName} · 📍 ${place}`;
      })
      .join("\n\n");

    const message = [
      `📅 *Daily Ticket Summary - 8:00 AM*`,
      `Hi ${eng.firstName}, here is your ticket summary for today:`,
      `🔵 Assigned: ${assignedCount}`,
      `🟡 In Progress: ${inProgressCount}`,
      `🟠 Pending OTP: ${pendingOtpCount}`,
      ``,
      `📋 *Active Tickets:*`,
      listLines,
      ``,
      `Tap below to view full details or manage tickets.`,
    ].join("\n");

    await sendEngineerMessage(eng.whatsappNumber, message, [
      { id: "TICKETS", title: "📋 My Tickets" },
      { id: "HELP", title: "❓ Help" },
    ]);
  }
}
