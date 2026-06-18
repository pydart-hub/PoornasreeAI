// Dealer WhatsApp command router — tickets, accept/reject/complete, service note.

import prisma from "../lib/prisma";
import { io } from "../lib/socket";
import * as TicketService from "./ticket.service";
import {
  DLR_PREFIX,
  DEALER_ACTIVE_TICKET_SELECT,
  findDealerTicket,
  formatDealerTicketDetailMessage,
  sendDealerMessage,
  sendDealerTicketActionButtons,
  ticketFromDlrId,
  type DealerTicketRow,
} from "./dealer-ticket-whatsapp.shared";

type DealerCtx = { id: string; firstName: string };

type PendingKind = "note";

interface PendingInput {
  kind: PendingKind;
  ticketNumber: string;
  expiresAt: number;
}

const pendingByPhone = new Map<string, PendingInput>();
const PENDING_TTL_MS = 30 * 60 * 1000;

function setPending(phone: string, kind: PendingKind, ticketNumber: string): void {
  pendingByPhone.set(phone, {
    kind,
    ticketNumber: ticketNumber.toUpperCase(),
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

function getPending(phone: string): PendingInput | null {
  const p = pendingByPhone.get(phone);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    pendingByPhone.delete(phone);
    return null;
  }
  return p;
}

function clearPending(phone: string): void {
  pendingByPhone.delete(phone);
}

// ── Ticket List ──────────────────────────────────────────────────────────
async function showTicketList(from: string, dealer: DealerCtx, page: number = 0): Promise<void> {
  const PAGE_SIZE = 8;
  const tickets = await prisma.ticket.findMany({
    where: {
      assignedDealerId: dealer.id,
      status: { not: "CLOSED" },
    },
    select: DEALER_ACTIVE_TICKET_SELECT,
    orderBy: { createdAt: "desc" },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });

  if (tickets.length === 0 && page === 0) {
    await sendDealerMessage(from, "✅ You have no active tickets right now.");
    return;
  }
  if (tickets.length === 0 && page > 0) {
    await sendDealerMessage(from, "No more tickets found on this page.");
    return;
  }

  const hasNext = tickets.length > PAGE_SIZE;
  const displayTickets = tickets.slice(0, PAGE_SIZE);

  const summary = displayTickets
    .map((t, i) => {
      const status = t.dealerResponse
        ? t.dealerResponse.charAt(0).toUpperCase() + t.dealerResponse.slice(1)
        : "Pending";
      const custName = t.machineCustomer || t.customer?.firstName || "Customer";
      return `${page * PAGE_SIZE + i + 1}. *${t.ticketNumber}* (${status})\n   👤 ${custName}`;
    })
    .join("\n\n");

  const rows = displayTickets.map((t) => {
    const custName = t.machineCustomer || t.customer?.firstName || "Customer";
    const status = t.dealerResponse
      ? t.dealerResponse.charAt(0).toUpperCase() + t.dealerResponse.slice(1)
      : "Pending";
    return {
      id: `${DLR_PREFIX.SEL}${t.ticketNumber}`,
      title: t.ticketNumber.replace(/^TKT-\d{8}-/i, "").slice(0, 24) || t.ticketNumber.slice(0, 24),
      description: `${custName.slice(0, 40)} · ${status}`,
    };
  });

  if (page > 0) {
    rows.push({
      id: `${DLR_PREFIX.LIST}:${page - 1}`,
      title: "⬅️ Previous Page",
      description: `View previous tickets`,
    });
  }
  if (hasNext) {
    rows.push({
      id: `${DLR_PREFIX.LIST}:${page + 1}`,
      title: "➡️ Next Page",
      description: "View more tickets",
    });
  }

  await sendDealerMessage(
    from,
    `📋 *Your Tickets (Page ${page + 1}):*\n\n${summary}\n\nTap below to select a ticket:`,
    undefined,
    {
      buttonText: "Select ticket",
      rows,
    },
  );
}

// ── Ticket Detail ────────────────────────────────────────────────────────
async function showTicketDetail(from: string, dealer: DealerCtx, ticketNumber: string): Promise<void> {
  const ticket = await findDealerTicket(ticketNumber, dealer.id);
  if (!ticket) {
    await sendDealerMessage(from, `❌ Ticket *${ticketNumber}* not found or not assigned to you.`);
    return;
  }
  await sendDealerTicketActionButtons(from, ticket as DealerTicketRow, { includeDetails: true });
}

// ── Accept ───────────────────────────────────────────────────────────────
async function handleAccept(from: string, dealer: DealerCtx, ticketNumber: string): Promise<void> {
  const ticket = await findDealerTicket(ticketNumber, dealer.id);
  if (!ticket) {
    await sendDealerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }
  try {
    const updated = await TicketService.dealerAccept(ticket.id, dealer.id);
    io?.to("managers").emit("ticket:updated", { ticketId: ticket.id, ticket: updated });
    const refreshed = await findDealerTicket(ticketNumber, dealer.id);
    if (refreshed) {
      await sendDealerTicketActionButtons(from, refreshed as DealerTicketRow, {
        prefix: `✅ Ticket *${ticketNumber}* accepted!\n\n`,
      });
    }
  } catch (e: unknown) {
    await sendDealerMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not accept ticket."}`);
  }
}

// ── Reject ───────────────────────────────────────────────────────────────
async function handleReject(from: string, dealer: DealerCtx, ticketNumber: string): Promise<void> {
  const ticket = await findDealerTicket(ticketNumber, dealer.id);
  if (!ticket) {
    await sendDealerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }
  try {
    const updated = await TicketService.dealerReject(ticket.id, dealer.id);
    io?.to("managers").emit("ticket:updated", { ticketId: ticket.id, ticket: updated });
    await sendDealerMessage(
      from,
      `❌ Ticket *${ticketNumber}* rejected. The service manager will reassign.`,
      [{ id: "TICKETS", title: "📋 My Tickets" }],
    );
  } catch (e: unknown) {
    await sendDealerMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not reject ticket."}`);
  }
}

// ── Complete ─────────────────────────────────────────────────────────────
async function handleComplete(from: string, dealer: DealerCtx, ticketNumber: string): Promise<void> {
  const ticket = await findDealerTicket(ticketNumber, dealer.id);
  if (!ticket) {
    await sendDealerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }
  try {
    const updated = await TicketService.dealerComplete(ticket.id, dealer.id);
    io?.to("managers").emit("ticket:updated", { ticketId: ticket.id, ticket: updated });
    io?.to(`user:${updated.customerId}`).emit("ticket:closed", {
      ticketId: updated.id,
      ticketNumber: updated.ticketNumber,
    });
    await sendDealerMessage(
      from,
      `🎉 Ticket *${ticketNumber}* has been *completed* and closed successfully!`,
      [{ id: "TICKETS", title: "📋 My Tickets" }],
    );
  } catch (e: unknown) {
    await sendDealerMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not complete ticket."}`);
  }
}

// ── Update Note ──────────────────────────────────────────────────────────
async function handleUpdateNote(from: string, dealer: DealerCtx, ticketNumber: string, noteText: string): Promise<void> {
  const ticket = await findDealerTicket(ticketNumber, dealer.id);
  if (!ticket) {
    await sendDealerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }
  try {
    await TicketService.dealerUpdateNote(ticket.id, dealer.id, noteText);
    clearPending(from);
    const refreshed = await findDealerTicket(ticketNumber, dealer.id);
    if (refreshed) {
      await sendDealerTicketActionButtons(from, refreshed as DealerTicketRow, {
        prefix: `✅ Note saved for *${ticketNumber}*.\n\n`,
      });
    }
  } catch (e: unknown) {
    await sendDealerMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not save note."}`);
  }
}

// ── Interactive handler ──────────────────────────────────────────────────
async function handleInteractive(
  from: string,
  dealer: DealerCtx,
  text: string,
): Promise<boolean> {
  if (text.startsWith(DLR_PREFIX.LIST) || text === "TICKETS") {
    const parts = text.split(":");
    const page = parseInt(parts[1] ?? "0", 10) || 0;
    await showTicketList(from, dealer, page);
    return true;
  }
  if (text === DLR_PREFIX.MENU) {
    await sendDealerMenu(from, dealer);
    return true;
  }

  const sel = ticketFromDlrId(DLR_PREFIX.SEL, text);
  if (sel) {
    await showTicketDetail(from, dealer, sel);
    return true;
  }

  const acceptTn = ticketFromDlrId(DLR_PREFIX.ACCEPT, text);
  if (acceptTn) {
    await handleAccept(from, dealer, acceptTn);
    return true;
  }

  const rejectTn = ticketFromDlrId(DLR_PREFIX.REJECT, text);
  if (rejectTn) {
    await handleReject(from, dealer, rejectTn);
    return true;
  }

  const completeTn = ticketFromDlrId(DLR_PREFIX.COMPLETE, text);
  if (completeTn) {
    await handleComplete(from, dealer, completeTn);
    return true;
  }

  const noteTn = ticketFromDlrId(DLR_PREFIX.NOTE, text);
  if (noteTn) {
    setPending(from, "note", noteTn);
    await sendDealerMessage(
      from,
      `📝 Type your note for ticket *${noteTn}*:\n\n_(Just type your message and send)_`,
    );
    return true;
  }

  if (text === DLR_PREFIX.BACK) {
    await showTicketList(from, dealer);
    return true;
  }

  return false;
}

// ── Pending text handler ─────────────────────────────────────────────────
async function handlePendingText(
  from: string,
  dealer: DealerCtx,
  text: string,
  pending: PendingInput,
): Promise<boolean> {
  if (pending.kind === "note") {
    await handleUpdateNote(from, dealer, pending.ticketNumber, text);
    return true;
  }
  return false;
}

// ── Menu ─────────────────────────────────────────────────────────────────
async function sendDealerMenu(from: string, dealer: DealerCtx): Promise<void> {
  await sendDealerMessage(
    from,
    `👋 Hi ${dealer.firstName}! Poornasree Dealer Portal.\n\nWhat would you like to do?`,
    [
      { id: "TICKETS", title: "📋 My Tickets" },
      { id: "HELP", title: "❓ Help" },
    ],
  );
}

// ── Help ─────────────────────────────────────────────────────────────────
function helpText(): string {
  return (
    `🔧 *Dealer WhatsApp Help*\n\n` +
    `Welcome to the Poornasree Dealer Portal!\n` +
    `You don't need to type any manual commands. Simply use the menu to navigate:\n\n` +
    `📋 *My Tickets* — View tickets assigned to you by the service manager.\n\n` +
    `✅ *Accept / ❌ Reject* — Respond to a newly assigned ticket.\n\n` +
    `📝 *Add Note* — Attach a service note to an accepted ticket.\n\n` +
    `🏁 *Complete* — Mark an accepted ticket as completed.\n\n` +
    `Type *MENU* at any time to see the main menu.`
  );
}

// ── Main router ──────────────────────────────────────────────────────────
/** Main dealer message router (text + interactive reply ids). */
export async function handleDealerWhatsAppMessage(
  from: string,
  text: string,
  dealer: DealerCtx,
): Promise<void> {
  const upperText = text.toUpperCase().trim();
  const trimmed = text.trim();

  // Check for pending input (e.g. waiting for note text)
  const pending = getPending(from);
  if (
    pending &&
    !upperText.startsWith("DLR_") &&
    !trimmed.startsWith(DLR_PREFIX.SEL) &&
    !trimmed.startsWith(DLR_PREFIX.LIST) &&
    trimmed !== "MENU" &&
    trimmed !== "TICKETS" &&
    trimmed !== "HELP"
  ) {
    if (await handlePendingText(from, dealer, trimmed, pending)) return;
  }

  if (upperText === "TICKETS") {
    await showTicketList(from, dealer);
    return;
  }

  if (await handleInteractive(from, dealer, trimmed)) return;

  if (
    upperText === "MENU" ||
    upperText === "HI" ||
    upperText === "HII" ||
    upperText === "HIII" ||
    upperText === "HELLO" ||
    upperText === "HEY"
  ) {
    await sendDealerMenu(from, dealer);
    return;
  }

  if (upperText === "STATUS") {
    const tickets = await prisma.ticket.findMany({
      where: { assignedDealerId: dealer.id },
      select: { dealerResponse: true, status: true },
    });
    const pending = tickets.filter(t => !t.dealerResponse || t.dealerResponse === "pending").length;
    const accepted = tickets.filter(t => t.dealerResponse === "accepted").length;
    const completed = tickets.filter(t => t.dealerResponse === "completed" || t.status === "CLOSED").length;
    const rejected = tickets.filter(t => t.dealerResponse === "rejected").length;
    await sendDealerMessage(
      from,
      [
        `📊 *Ticket Summary for ${dealer.firstName}:*`,
        "",
        `🆕 Pending: ${pending}`,
        `✅ Accepted: ${accepted}`,
        `🏁 Completed: ${completed}`,
        `❌ Rejected: ${rejected}`,
        `📋 Total: ${tickets.length}`,
      ].join("\n"),
    );
    return;
  }

  if (upperText === "HELP") {
    await sendDealerMessage(from, helpText());
    return;
  }

  // Fallback
  await sendDealerMessage(
    from,
    `Hi ${dealer.firstName}, I didn't understand that.\n\nType *HELP* or choose:`,
    [
      { id: "TICKETS", title: "📋 My Tickets" },
      { id: "HELP", title: "❓ Help" },
    ],
  );
}
