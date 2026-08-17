// ── Outbound WhatsApp Service for Engineer Ticket Assignment Alerts ─────────

import prisma from "../lib/prisma";
import {
  formatCustomerPhoneDisplay,
  getTicketComplaintText,
  resolveTicketCustomerName,
  resolveTicketCustomerPhone,
} from "../lib/ticket-customer";
import * as WhatsAppService from "./whatsapp.service";
import {
  formatTicketDetailMessage,
  sendTicketActionButtons,
  sendEngineerMessage,
  type EngineerTicketRow,
} from "./engineer-ticket-whatsapp.shared";

/**
 * Notifies the assigned service engineer on WhatsApp when a ticket is assigned/reassigned.
 */
export async function notifyEngineerTicketAssigned(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      problemDescription: true,
      issueDescription: true,
      machineName: true,
      machineSerialNumber: true,
      machineCustomer: true,
      machineAddress1: true,
      machineAddress2: true,
      customerAddress: true,
      phoneNumber: true,
      createdAt: true,
      updatedAt: true,
      assignedEngineerId: true,
      customer: { select: { id: true, firstName: true, lastName: true, role: true } },
      pincode: { select: { id: true, code: true, place: true, district: true, state: true } },
      assignedManager: { select: { id: true, firstName: true, lastName: true } },
      assignedEngineer: {
        select: { id: true, firstName: true, lastName: true, whatsappNumber: true },
      },
    },
  });

  if (!ticket?.assignedEngineer?.whatsappNumber) {
    console.warn(`[engineer-ticket-wa] No WhatsApp number for engineer on ticket ${ticket?.ticketNumber ?? ticketId}`);
    return;
  }

  const wa = ticket.assignedEngineer.whatsappNumber;
  const customerName = resolveTicketCustomerName(ticket) || "Customer";
  const rawPhone = resolveTicketCustomerPhone(ticket);
  const phone = formatCustomerPhoneDisplay(rawPhone);
  const place = ticket.pincode?.place || ticket.machineAddress1 || "—";
  const pincode = ticket.pincode?.code ?? "—";
  const location = `${place} · ${pincode}`;
  const complaint =
    getTicketComplaintText(ticket.problemDescription, ticket.issueDescription) ||
    ticket.problemDescription ||
    "—";

  console.log(`[engineer-ticket-wa] Sending assignment notification for ${ticket.ticketNumber} to ${wa}`);

  // 1. Try sending official WhatsApp template if available (utility category)
  if (WhatsAppService.isConfigured()) {
    try {
      await WhatsAppService.sendTemplate(wa, {
        name: "engineer_ticket_assigned",
        languageCode: "en",
        bodyParameters: [
          ticket.assignedEngineer.firstName || "Engineer",
          ticket.ticketNumber,
          customerName,
          phone,
          location,
          complaint.slice(0, 100),
        ],
      });
    } catch {
      // Non-fatal: will fall back to direct session message
    }
  }

  // 2. Send formatted ticket details & action buttons
  const detail = formatTicketDetailMessage(ticket as EngineerTicketRow, {
    heading: `🆕 *NEW SERVICE TICKET ASSIGNED*`,
  });

  await sendEngineerMessage(
    wa,
    `${detail}\n\nTap a button below or type *TICKETS* at any time to view active tickets.`,
  );
  await sendTicketActionButtons(wa, ticket as EngineerTicketRow, ticket.assignedEngineer.id);
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
