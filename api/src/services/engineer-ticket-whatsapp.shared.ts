// Shared ticket formatting and interactive IDs for engineer WhatsApp.

import prisma from "../lib/prisma";
import {
  formatCustomerPhoneDisplay,
  getTicketComplaintText,
  resolveTicketCustomerName,
  resolveTicketCustomerPhone,
} from "../lib/ticket-customer";
import * as WhatsAppService from "./whatsapp.service";

export const ENG_PREFIX = {
  SEL: "ENG_SEL:",
  START: "ENG_START:",
  OTP: "ENG_OTP:",
  RESEND: "ENG_RESEND:",
  VERIFY_PROMPT: "ENG_VERIFY:",
  RPT: "ENG_RPT:",
  DIAG: "ENG_DIAG:",
  WDONE: "ENG_WDONE:",
  PART: "ENG_PART:",
  WARR_YES: "ENG_WARR_YES:",
  WARR_NO: "ENG_WARR_NO:",
  BACK: "ENG_BACK",
  LIST: "ENG_LIST",
  MENU: "ENG_MENU",
} as const;

export function ticketFromEngId(prefix: string, text: string): string | null {
  if (!text.startsWith(prefix)) return null;
  const tn = text.slice(prefix.length).trim().toUpperCase();
  return tn || null;
}

export const ENGINEER_ACTIVE_TICKET_SELECT = {
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
  customer: { select: { firstName: true, lastName: true, role: true } },
  pincode: { select: { code: true, place: true } },
  assignedManager: { select: { firstName: true, lastName: true } },
} as const;

export type EngineerTicketRow = {
  id: string;
  ticketNumber: string;
  status: string;
  problemDescription: string;
  issueDescription: string | null;
  machineName: string | null;
  machineSerialNumber: string | null;
  machineCustomer: string | null;
  customerAddress: string | null;
  phoneNumber: string | null;
  updatedAt: Date;
  customer: { firstName: string; lastName: string | null; role: string } | null;
  pincode: { code: string; place: string | null } | null;
  assignedManager: { firstName: string; lastName: string | null } | null;
};

export function formatTicketDetailMessage(
  t: EngineerTicketRow,
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
  const assignedAt = t.updatedAt
    ? t.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
      ", " +
      t.updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "—";

  const lines = [
    opts?.heading ?? `📋 *${t.ticketNumber}* (${t.status})`,
    `👤 Name: ${customerName}`,
    `📞 Phone: ${phone}`,
    ...(t.customerAddress ? [`🏠 Address: ${t.customerAddress}`] : []),
    `📍 Place: ${place}${place && pincode ? " | " : ""}Pincode: ${pincode}`,
    `🔧 Product: ${product}`,
    `🔑 S/N: ${serial}`,
    `📅 Assigned: ${assignedAt}`,
    `📝 Complaint: ${complaint}`,
    `👨‍💼 Assigned by: ${assignedBy}`,
  ];
  return lines.join("\n");
}

export async function findEngineerTicket(ticketNumber: string, engineerId: string) {
  return prisma.ticket.findFirst({
    where: { ticketNumber, assignedEngineerId: engineerId },
    select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
  });
}

/** Status-specific action buttons (max 3). */
export async function sendTicketActionButtons(
  to: string,
  t: EngineerTicketRow,
  _engineerId: string,
): Promise<void> {
  const tn = t.ticketNumber;
  if (t.status === "ASSIGNED") {
    await WhatsAppService.sendInteractiveButtons(to, `*${tn}* — ready to start?`, [
      { id: `${ENG_PREFIX.START}${tn}`, title: "▶️ Start work" },
      { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
      { id: "TICKETS", title: "📋 All tickets" },
    ]);
    return;
  }
  if (t.status === "IN_PROGRESS") {
    await WhatsAppService.sendInteractiveButtons(to, `*${tn}* — in progress`, [
      { id: `${ENG_PREFIX.OTP}${tn}`, title: "🔐 Request OTP" },
      { id: `${ENG_PREFIX.RPT}${tn}`, title: "📝 Service report" },
      { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
    ]);
    return;
  }
  if (t.status === "PENDING_OTP") {
    await WhatsAppService.sendInteractiveButtons(to, `*${tn}* — waiting for OTP`, [
      { id: `${ENG_PREFIX.VERIFY_PROMPT}${tn}`, title: "✅ Enter OTP" },
      { id: `${ENG_PREFIX.RESEND}${tn}`, title: "🔁 Resend OTP" },
      { id: "TICKETS", title: "📋 All tickets" },
    ]);
  }
}

export async function sendReportMenuList(to: string, ticketNumber: string): Promise<void> {
  const tn = ticketNumber;
  await WhatsAppService.sendInteractiveList(
    to,
    `*${tn}* — Service report\n\nChoose a field to update, or use text commands (type HELP).`,
    "Report options",
    [
      { id: `${ENG_PREFIX.DIAG}${tn}`, title: "Problem diagnosed", description: "Set root cause" },
      { id: `${ENG_PREFIX.WDONE}${tn}`, title: "Work done", description: "Repair notes" },
      { id: `${ENG_PREFIX.PART}${tn}`, title: "Add replaced part", description: "name | part# | qty" },
      { id: `${ENG_PREFIX.WARR_YES}${tn}`, title: "Warranty: Yes", description: "Claim required" },
      { id: `${ENG_PREFIX.WARR_NO}${tn}`, title: "Warranty: No", description: "No claim" },
      { id: `${ENG_PREFIX.SEL}${tn}`, title: "Back to ticket", description: "Actions & details" },
    ],
  );
}
