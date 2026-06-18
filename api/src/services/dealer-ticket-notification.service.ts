// Outbound WhatsApp when a service manager assigns a ticket to a dealer.

import prisma from "../lib/prisma";
import * as WhatsAppService from "./whatsapp.service";
import {
  formatDealerTicketDetailMessage,
  sendDealerTicketActionButtons,
  sendDealerMessage,
  type DealerTicketRow,
} from "./dealer-ticket-whatsapp.shared";

/**
 * Notify dealer via WhatsApp when a ticket is assigned to them.
 * Sends ticket details + Accept/Reject buttons.
 */
export async function notifyDealerTicketAssigned(ticketId: string): Promise<void> {
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
      machineProductCode: true,
      machineAddress1: true,
      machineAddress2: true,
      machineInvoiceNo: true,
      machineInvoiceDate: true,
      machineWarranty: true,
      customerAddress: true,
      phoneNumber: true,
      dealerResponse: true,
      dealerNote: true,
      updatedAt: true,
      createdAt: true,
      assignedDealerId: true,
      customer: { select: { firstName: true, lastName: true, role: true } },
      pincode: { select: { code: true, place: true } },
      assignedManager: { select: { firstName: true, lastName: true } },
      assignedEngineer: { select: { firstName: true, lastName: true } },
      assignedDealer: {
        select: { id: true, firstName: true, whatsappNumber: true },
      },
    },
  });

  if (!ticket?.assignedDealer?.whatsappNumber) {
    console.warn(`[dealer-ticket-wa] No WhatsApp number for dealer on ticket ${ticket?.ticketNumber ?? ticketId}`);
    return;
  }

  const wa = ticket.assignedDealer.whatsappNumber;

  const detail = formatDealerTicketDetailMessage(ticket as unknown as DealerTicketRow, {
    heading: `🆕 *New ticket assigned to you*`,
  });
  await sendDealerMessage(
    wa,
    `${detail}\n\nPlease accept or reject this ticket:`,
  );
  await sendDealerTicketActionButtons(wa, ticket as unknown as DealerTicketRow);
}

/**
 * Sends a summary of pending/accepted tickets to each active dealer.
 * Can be scheduled for daily summaries (8:00 AM).
 */
export async function sendDailyDealerSummary(): Promise<void> {
  const dealers = await prisma.user.findMany({
    where: { role: "dealer" },
    select: { id: true, firstName: true, whatsappNumber: true },
  });

  for (const dealer of dealers) {
    if (!dealer.whatsappNumber) continue;

    const tickets = await prisma.ticket.findMany({
      where: {
        assignedDealerId: dealer.id,
        status: { not: "CLOSED" },
        dealerResponse: { in: ["pending", "accepted"] },
      },
      select: {
        ticketNumber: true,
        dealerResponse: true,
        machineCustomer: true,
        pincode: { select: { place: true } },
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (tickets.length === 0) {
      await sendDealerMessage(
        dealer.whatsappNumber,
        `📅 *Daily Summary*\n\nHi ${dealer.firstName}, you have no pending or active tickets today. 👍`,
        [
          { id: "TICKETS", title: "📋 My Tickets" },
          { id: "HELP", title: "❓ Help" },
        ]
      );
      continue;
    }

    const pendingCount = tickets.filter(t => t.dealerResponse === "pending").length;
    const acceptedCount = tickets.filter(t => t.dealerResponse === "accepted").length;

    const listLines = tickets.map((t, idx) => {
      const custName = t.machineCustomer || t.customer?.firstName || "Customer";
      const place = t.pincode?.place ?? "—";
      const statusIcon = t.dealerResponse === "pending" ? "🆕" : "✅";
      const status = t.dealerResponse === "pending" ? "Pending" : "Accepted";
      return `${idx + 1}. ${statusIcon} *${t.ticketNumber}* (${status})\n   👤 ${custName} · 📍 ${place}`;
    }).join("\n\n");

    const message = [
      `📅 *Daily Dealer Summary*`,
      `Hi ${dealer.firstName}, here is your ticket summary:`,
      `🆕 Pending: ${pendingCount}`,
      `✅ Accepted: ${acceptedCount}`,
      ``,
      `📋 *Active Tickets:*`,
      listLines,
      ``,
      `Use the buttons below to view your tickets.`
    ].join("\n");

    await sendDealerMessage(
      dealer.whatsappNumber,
      message,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "HELP", title: "❓ Help" },
      ]
    );
  }
}
