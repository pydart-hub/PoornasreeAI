// Outbound WhatsApp when a service manager assigns a ticket to an engineer.

import { env } from "../config/env";
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

function templateParam(text: string, maxLen = 200): string {
  return text.replace(/[\n\r\t]/g, " ").trim().slice(0, maxLen);
}

/**
 * Always notify engineer on manual assign. Uses approved template first, then full session message + buttons.
 */
export async function notifyEngineerTicketAssigned(ticketId: string): Promise<void> {
  if (!WhatsAppService.isConfigured()) return;

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
      customerAddress: true,
      phoneNumber: true,
      updatedAt: true,
      assignedEngineerId: true,
      customer: { select: { firstName: true, lastName: true, role: true } },
      pincode: { select: { code: true, place: true } },
      assignedManager: { select: { firstName: true, lastName: true } },
      assignedEngineer: {
        select: { id: true, firstName: true, whatsappNumber: true },
      },
    },
  });

  if (!ticket?.assignedEngineer?.whatsappNumber) {
    console.warn(`[engineer-ticket-wa] No WhatsApp number for engineer on ticket ${ticket?.ticketNumber ?? ticketId}`);
    return;
  }

  const wa = ticket.assignedEngineer.whatsappNumber;

  const detail = formatTicketDetailMessage(ticket as EngineerTicketRow, {
    heading: `🆕 *New ticket assigned*`,
  });
  await sendEngineerMessage(
    wa,
    `${detail}\n\nOpen the ticket menu below or type *TICKETS*.`,
  );
  await sendTicketActionButtons(wa, ticket as EngineerTicketRow, ticket.assignedEngineer.id);
}

/**
 * Sends a summary of active/pending tickets to each active engineer.
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
        ticketNumber: true,
        status: true,
        pincode: { select: { place: true } },
        problemDescription: true,
        issueDescription: true,
        machineCustomer: true,
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { status: "asc" },
    });

    if (tickets.length === 0) {
      await sendEngineerMessage(
        eng.whatsappNumber,
        `📅 *Daily Ticket Summary - 8:00 AM*\n\nHi ${eng.firstName}, you have no assigned or pending tickets today. Great job!`,
        [
          { id: "TICKETS", title: "📋 My Tickets" },
          { id: "HELP", title: "❓ Help" },
        ]
      );
      continue;
    }

    const assignedCount = tickets.filter(t => t.status === "ASSIGNED").length;
    const inProgressCount = tickets.filter(t => t.status === "IN_PROGRESS").length;
    const pendingOtpCount = tickets.filter(t => t.status === "PENDING_OTP").length;

    const listLines = tickets.map((t, idx) => {
      const custName = resolveTicketCustomerName(t as any) || "Customer";
      const place = t.pincode?.place ?? "—";
      let statusIcon = "🔵";
      if (t.status === "IN_PROGRESS") statusIcon = "🟡";
      if (t.status === "PENDING_OTP") statusIcon = "🟠";
      return `${idx + 1}. ${statusIcon} *${t.ticketNumber}* (${t.status})\n   👤 ${custName} · 📍 ${place}`;
    }).join("\n\n");

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
      `Use the buttons below to view tickets or get help.`
    ].join("\n");

    await sendEngineerMessage(
      eng.whatsappNumber,
      message,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "HELP", title: "❓ Help" },
      ]
    );
  }
}

let dailySummaryTimeout: NodeJS.Timeout | null = null;

/**
 * Starts the daily recurring 8:00 AM scheduler.
 */
export function startDailySummaryScheduler(): void {
  if (dailySummaryTimeout) {
    clearTimeout(dailySummaryTimeout);
  }

  const scheduleNext = () => {
    const now = new Date();
    const target = new Date();
    target.setHours(8, 0, 0, 0);

    // If it's already past 8:00 AM today, schedule for 8:00 AM tomorrow
    if (now.getTime() >= target.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const delay = target.getTime() - now.getTime();
    console.log(`[scheduler] Next engineer daily summary scheduled in ${Math.round(delay / 1000 / 60)} minutes (at ${target.toLocaleString()})`);

    dailySummaryTimeout = setTimeout(async () => {
      console.log("[scheduler] Triggering daily engineer ticket summaries...");
      try {
        await sendDailyEngineerSummary();
      } catch (err) {
        console.error("[scheduler] Error sending daily summaries:", err);
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
