// Shared ticket formatting and interactive IDs for engineer WhatsApp.

import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import {
  formatCustomerPhoneDisplay,
  getTicketComplaintText,
  resolveTicketCustomerName,
  resolveTicketCustomerPhone,
} from "../lib/ticket-customer";
import * as WhatsAppService from "./whatsapp.service";
import { WaButton, WaListRow } from "./whatsapp.service";

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

/** Wrapper sending helper to support simulator fallback. */
export async function sendEngineerMessage(
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

/** Attaches work report photo, renaming to track location vs finished photos. */
export async function attachWorkReportPhoto(
  ticketId: string,
  engineerId: string,
  filename: string,
): Promise<{ type: "reached" | "finished" | "normal"; ticketNumber: string }> {
  let report = await prisma.workReport.findUnique({
    where: { ticketId },
    include: { images: true },
  });
  if (!report) {
    report = await prisma.workReport.create({
      data: { ticketId, dealerId: engineerId },
      include: { images: true },
    });
  }

  const hasReached = report.images.some((img) => img.fileName.startsWith("reached_location"));
  const isReportComplete = !!(report.problemDiagnosed?.trim() && report.workDone?.trim());

  let finalFilename = filename;
  let photoType: "reached" | "finished" | "normal" = "normal";

  if (!hasReached) {
    finalFilename = "reached_location_" + filename;
    photoType = "reached";
  } else if (isReportComplete) {
    const hasFinished = report.images.some((img) => img.fileName.startsWith("finished_work"));
    if (!hasFinished) {
      finalFilename = "finished_work_" + filename;
      photoType = "finished";
    }
  }

  // Rename physical file if needed
  const dir = path.resolve(__dirname, "../../uploads/work-reports");
  const oldPath = path.join(dir, filename);
  const newPath = path.join(dir, finalFilename);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }

  await prisma.workReportImage.create({
    data: {
      workReportId: report.id,
      url: `/uploads/work-reports/${finalFilename}`,
      fileName: finalFilename,
    },
  });

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { ticketNumber: true },
  });

  return { type: photoType, ticketNumber: ticket.ticketNumber };
}

/** Status-specific action buttons guided by checklist status. */
export async function sendTicketActionButtons(
  to: string,
  t: EngineerTicketRow,
  _engineerId: string,
): Promise<void> {
  const tn = t.ticketNumber;
  if (t.status === "ASSIGNED") {
    await sendEngineerMessage(to, `*${tn}* — ready to start?`, [
      { id: `${ENG_PREFIX.START}${tn}`, title: "▶️ Start work" },
      { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
      { id: "TICKETS", title: "📋 All tickets" },
    ]);
    return;
  }
  if (t.status === "IN_PROGRESS") {
    const report = await prisma.workReport.findUnique({
      where: { ticketId: t.id },
      include: { images: true }
    });
    const hasReached = report?.images.some(img => img.fileName.startsWith("reached_location")) ?? false;
    const isReportComplete = !!(report?.problemDiagnosed?.trim() && report?.workDone?.trim());
    const hasFinished = report?.images.some(img => img.fileName.startsWith("finished_work")) ?? false;

    if (!hasReached) {
      await sendEngineerMessage(to, `📍 *${tn}* (In Progress)\n\n⚠️ *Awaiting arrival photo.* Please upload a photo of the product on arrival.\n\nIf this was a test/trial complaint, click *Test Close* below.`, [
        { id: `ENG_TEST_CLOSE:${tn}`, title: "❌ Test Close" },
        { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
        { id: "TICKETS", title: "📋 All tickets" },
      ]);
      return;
    }

    if (!isReportComplete) {
      await sendEngineerMessage(to, `📍 *${tn}* (In Progress)\n\nReached photo uploaded. Please fill in the Service Report (Problem diagnosed, Work done).`, [
        { id: `${ENG_PREFIX.RPT}${tn}`, title: "📝 Service report" },
        { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
        { id: "TICKETS", title: "📋 All tickets" },
      ]);
      return;
    }

    if (!hasFinished) {
      await sendEngineerMessage(to, `📍 *${tn}* (In Progress)\n\nService report complete. Please upload a finished work photo before requesting OTP.`, [
        { id: `${ENG_PREFIX.RPT}${tn}`, title: "📝 Service report" },
        { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
        { id: "TICKETS", title: "📋 All tickets" },
      ]);
      return;
    }

    await sendEngineerMessage(to, `📍 *${tn}* (In Progress)\n\nAll tasks complete! Request OTP from customer.`, [
      { id: `${ENG_PREFIX.OTP}${tn}`, title: "🔐 Request OTP" },
      { id: `${ENG_PREFIX.RPT}${tn}`, title: "📝 Service report" },
      { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
    ]);
    return;
  }
  if (t.status === "PENDING_OTP") {
    await sendEngineerMessage(to, `*${tn}* — waiting for OTP`, [
      { id: `${ENG_PREFIX.VERIFY_PROMPT}${tn}`, title: "✅ Enter OTP" },
      { id: `${ENG_PREFIX.RESEND}${tn}`, title: "🔁 Resend OTP" },
      { id: "TICKETS", title: "📋 All tickets" },
    ]);
  }
}

export async function sendReportMenuList(to: string, ticketNumber: string): Promise<void> {
  const tn = ticketNumber;
  await sendEngineerMessage(
    to,
    `*${tn}* — Service report\n\nChoose a field to update, or use text commands (type HELP).`,
    undefined,
    {
      buttonText: "Report options",
      rows: [
        { id: `${ENG_PREFIX.DIAG}${tn}`, title: "Problem diagnosed", description: "Set root cause" },
        { id: `${ENG_PREFIX.WDONE}${tn}`, title: "Work done", description: "Repair notes" },
        { id: `${ENG_PREFIX.PART}${tn}`, title: "Add replaced part", description: "name | part# | qty" },
        { id: `${ENG_PREFIX.WARR_YES}${tn}`, title: "Warranty: Yes", description: "Claim required" },
        { id: `${ENG_PREFIX.WARR_NO}${tn}`, title: "Warranty: No", description: "No claim" },
        { id: `${ENG_PREFIX.SEL}${tn}`, title: "Back to ticket", description: "Actions & details" },
      ]
    }
  );
}

