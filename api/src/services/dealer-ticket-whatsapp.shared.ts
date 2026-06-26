// Shared ticket formatting and interactive IDs for dealer WhatsApp.

import prisma from "../lib/prisma";
import {
  formatCustomerPhoneDisplay,
  getTicketComplaintText,
  resolveTicketCustomerName,
  resolveTicketCustomerPhone,
} from "../lib/ticket-customer";
import * as WhatsAppService from "./whatsapp.service";
import { WaButton, WaListRow } from "./whatsapp.service";

export const DLR_PREFIX = {
  SEL: "DLR_SEL:",
  ACCEPT: "DLR_ACCEPT:",
  REJECT: "DLR_REJECT:",
  COMPLETE: "DLR_COMPLETE:",
  NOTE: "DLR_NOTE:",
  BACK: "DLR_BACK",
  LIST: "DLR_LIST",
  MENU: "DLR_MENU",
} as const;

export function ticketFromDlrId(prefix: string, text: string): string | null {
  if (!text.startsWith(prefix)) return null;
  const tn = text.slice(prefix.length).trim().toUpperCase();
  return tn || null;
}

export const DEALER_ACTIVE_TICKET_SELECT = {
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
  customer: { select: { firstName: true, lastName: true, role: true } },
  pincode: { select: { code: true, place: true } },
  assignedManager: { select: { firstName: true, lastName: true } },
  assignedEngineer: { select: { firstName: true, lastName: true } },
} as const;

export type DealerTicketRow = {
  id: string;
  ticketNumber: string;
  status: string;
  problemDescription: string;
  issueDescription: string | null;
  machineName: string | null;
  machineSerialNumber: string | null;
  machineCustomer: string | null;
  machineProductCode: string | null;
  machineAddress1: string | null;
  machineAddress2: string | null;
  machineInvoiceNo: string | null;
  machineInvoiceDate: string | null;
  machineWarranty: number | null;
  customerAddress: string | null;
  phoneNumber: string | null;
  dealerResponse: string | null;
  dealerNote: string | null;
  updatedAt: Date;
  createdAt: Date;
  customer: { firstName: string; lastName: string | null; role: string } | null;
  pincode: { code: string; place: string | null } | null;
  assignedManager: { firstName: string; lastName: string | null } | null;
  assignedEngineer: { firstName: string; lastName: string | null } | null;
};

export function formatDealerTicketDetailMessage(
  t: DealerTicketRow,
  opts?: { heading?: string },
): string {
  const customerName = resolveTicketCustomerName(t) || "Customer";
  const phone = formatCustomerPhoneDisplay(resolveTicketCustomerPhone(t));
  const place = t.pincode?.place ?? "";
  const pincode = t.pincode?.code ?? "";
  const product = t.machineName ?? "—";
  const serial = t.machineSerialNumber ?? "—";
  const complaint =
    getTicketComplaintText(t.problemDescription, t.issueDescription)?.slice(0, 200) ||
    t.problemDescription.slice(0, 200) ||
    "—";
  const assignedBy = t.assignedManager
    ? `${t.assignedManager.firstName} ${t.assignedManager.lastName ?? ""}`.trim()
    : "—";
  const engineer = t.assignedEngineer
    ? `${t.assignedEngineer.firstName} ${t.assignedEngineer.lastName ?? ""}`.trim()
    : null;
  const createdAt = t.createdAt
    ? new Date(t.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) +
      ", " +
      new Date(t.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })
    : "—";

  const dealerStatus = t.dealerResponse
    ? t.dealerResponse.charAt(0).toUpperCase() + t.dealerResponse.slice(1)
    : "Pending";

  const lines = [
    opts?.heading ?? `📋 *${t.ticketNumber}* (${dealerStatus})`,
    `👤 Customer: ${customerName}`,
    `📞 Phone: ${phone}`,
    ...(t.customerAddress ? [`🏠 Address: ${t.customerAddress}`] : []),
    `📍 Place: ${place}${place && pincode ? " | " : ""}Pincode: ${pincode}`,
    `🔧 Product: ${product}`,
    `🔑 S/N: ${serial}`,
    `📅 Created: ${createdAt}`,
    `📝 Complaint: ${complaint}`,
    `👨‍💼 Assigned by: ${assignedBy}`,
    ...(engineer ? [`👷 Engineer: ${engineer}`] : []),
    ...(t.dealerNote ? [`📄 Your Note: ${t.dealerNote.slice(0, 150)}`] : []),
  ];
  return lines.join("\n");
}

export async function findDealerTicket(ticketNumber: string, dealerId: string) {
  return prisma.ticket.findFirst({
    where: { ticketNumber, assignedDealerId: dealerId },
    select: { ...DEALER_ACTIVE_TICKET_SELECT, id: true },
  });
}

/** Wrapper sending helper to support simulator fallback. */
export async function sendDealerMessage(
  to: string,
  text: string,
  buttons?: WaButton[],
  list?: { buttonText: string; rows: WaListRow[] },
): Promise<void> {
  if (WhatsAppService.isConfigured()) {
    if (list) {
      await WhatsAppService.sendInteractiveList(to, text, list.buttonText, list.rows);
    } else if (buttons) {
      await WhatsAppService.sendInteractiveButtons(to, text, buttons);
    } else {
      await WhatsAppService.sendMessage(to, text);
    }
  } else {
    let content = text;
    if (buttons) {
      content += "\n\nButtons:\n" + buttons.map(b => `[${b.title}] (${b.id})`).join("\n");
    } else if (list) {
      content += `\n\nList [${list.buttonText}]:\n` + list.rows.map(r => `- ${r.title} (${r.id}): ${r.description ?? ""}`).join("\n");
    }
    await prisma.simulateMessage.create({
      data: {
        phoneNumber: to,
        role: "bot",
        content,
      }
    }).catch(() => {});
  }
}

/** Status-specific action buttons for dealer ticket flow. */
export async function sendDealerTicketActionButtons(
  to: string,
  t: DealerTicketRow,
  opts?: { prefix?: string; includeDetails?: boolean },
): Promise<void> {
  const tn = t.ticketNumber;
  const prefix = opts?.prefix ?? "";

  if (opts?.includeDetails) {
    const detailMsg = formatDealerTicketDetailMessage(t);
    await sendDealerMessage(to, detailMsg);
  }

  const pending = !t.dealerResponse || t.dealerResponse === "pending";
  const accepted = t.dealerResponse === "accepted";

  if (t.status === "CLOSED" || t.dealerResponse === "completed") {
    await sendDealerMessage(to, `${prefix}✅ *${tn}* — This ticket is closed.`, [
      { id: "TICKETS", title: "📋 My Tickets" },
    ]);
    return;
  }

  if (t.dealerResponse === "rejected") {
    await sendDealerMessage(to, `${prefix}❌ *${tn}* — You rejected this ticket. The manager will reassign.`, [
      { id: "TICKETS", title: "📋 My Tickets" },
    ]);
    return;
  }

  if (pending) {
    await sendDealerMessage(to, `${prefix}🆕 *${tn}* — New ticket assigned. Accept or reject?`, [
      { id: `${DLR_PREFIX.ACCEPT}${tn}`, title: "✅ Accept" },
      { id: `${DLR_PREFIX.REJECT}${tn}`, title: "❌ Reject" },
      { id: `${DLR_PREFIX.SEL}${tn}`, title: "📋 Details" },
    ]);
    return;
  }

  if (accepted) {
    await sendDealerMessage(to, `${prefix}✅ *${tn}* — Accepted. Update note or complete.`, [
      { id: `${DLR_PREFIX.COMPLETE}${tn}`, title: "🏁 Complete" },
      { id: `${DLR_PREFIX.NOTE}${tn}`, title: "📝 Add Note" },
      { id: `${DLR_PREFIX.SEL}${tn}`, title: "📋 Details" },
    ]);
    return;
  }

  // Fallback
  await sendDealerMessage(to, `${prefix}📋 *${tn}* (${t.dealerResponse ?? t.status})`, [
    { id: `${DLR_PREFIX.SEL}${tn}`, title: "📋 Details" },
    { id: "TICKETS", title: "📋 All tickets" },
  ]);
}
