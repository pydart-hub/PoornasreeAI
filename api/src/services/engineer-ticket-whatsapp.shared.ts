// ── Shared Types & Helpers for Service Engineer WhatsApp Flow ───────────────

import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import * as WhatsAppService from "./whatsapp.service";
import type { WaButton, WaListRow } from "./whatsapp.service";
import {
  formatCustomerPhoneDisplay,
  getTicketComplaintText,
  resolveTicketCustomerName,
  resolveTicketCustomerPhone,
} from "../lib/ticket-customer";

export const ENG_PREFIX = {
  START: "ENG_START:",
  SEL: "ENG_SEL:",
  OTP: "ENG_OTP:",
  VERIFY_PROMPT: "ENG_VERIFY_PROMPT:",
  RESEND: "ENG_RESEND:",
  DIAG: "ENG_DIAG:",
  WDONE: "ENG_WDONE:",
  PART: "ENG_PART:",
  WARR_YES: "ENG_WARR_YES:",
  WARR_NO: "ENG_WARR_NO:",
  RPT: "ENG_RPT:",
  TEST_CLOSE: "ENG_TEST_CLOSE:",
} as const;

export const ENGINEER_ACTIVE_TICKET_SELECT = {
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
  customer: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
  pincode: {
    select: { id: true, code: true, place: true, district: true, state: true },
  },
  assignedManager: {
    select: { id: true, firstName: true, lastName: true },
  },
  assignedEngineer: {
    select: { id: true, firstName: true, lastName: true, whatsappNumber: true },
  },
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
  machineAddress1: string | null;
  machineAddress2: string | null;
  customerAddress: string | null;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedEngineerId: string | null;
  customer?: { id: string; firstName: string; lastName: string | null; role: string } | null;
  pincode?: { id: string; code: string; place: string | null; district: string | null; state: string | null } | null;
  assignedManager?: { id: string; firstName: string; lastName: string | null } | null;
  assignedEngineer?: { id: string; firstName: string; lastName: string | null; whatsappNumber: string | null } | null;
};

export function formatTicketDetailMessage(
  t: EngineerTicketRow,
  opts?: { heading?: string },
): string {
  const customerName = resolveTicketCustomerName(t) || "Customer";
  const rawPhone = resolveTicketCustomerPhone(t);
  const phone = formatCustomerPhoneDisplay(rawPhone);
  const place = t.pincode?.place || t.machineAddress1 || "—";
  const pincode = t.pincode?.code ?? "—";
  const product = t.machineName || "—";
  const serial = t.machineSerialNumber || "—";
  const complaint =
    getTicketComplaintText(t.problemDescription, t.issueDescription) ||
    t.problemDescription ||
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
    opts?.heading ?? `📋 *Ticket ${t.ticketNumber}* (${t.status})`,
    ``,
    `👤 *Customer:* ${customerName}`,
    `📞 *Phone:* ${phone}`,
    ...(t.customerAddress ? [`🏠 *Address:* ${t.customerAddress}`] : []),
    `📍 *Location:* ${place} (${pincode})`,
    `🔧 *Product:* ${product} (S/N: ${serial})`,
    `📅 *Assigned:* ${assignedAt}`,
    `📝 *Complaint:* ${complaint}`,
    `👨‍💼 *Assigned by:* ${assignedBy}`,
  ];
  return lines.join("\n");
}

export async function findEngineerTicket(ticketNumber: string, engineerId: string) {
  return prisma.ticket.findFirst({
    where: { ticketNumber, assignedEngineerId: engineerId },
    select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
  });
}

/** Wrapper sending helper to support live WhatsApp Cloud API with simulate fallback. */
export async function sendEngineerMessage(
  to: string,
  text: string,
  buttons?: WaButton[],
  list?: { buttonText: string; rows: WaListRow[] },
): Promise<void> {
  if (WhatsAppService.isConfigured()) {
    if (list) {
      await WhatsAppService.sendInteractiveList(to, text, list.buttonText, list.rows);
    } else if (buttons && buttons.length > 0) {
      await WhatsAppService.sendInteractiveButtons(to, text, buttons);
    } else {
      await WhatsAppService.sendMessage(to, text);
    }
  } else {
    let content = text;
    if (buttons && buttons.length > 0) {
      content += "\n\nButtons:\n" + buttons.map((b) => `[${b.title}] (${b.id})`).join("\n");
    } else if (list) {
      content +=
        `\n\nList [${list.buttonText}]:\n` +
        list.rows.map((r) => `- ${r.title} (${r.id}): ${r.description ?? ""}`).join("\n");
    }
    await prisma.simulateMessage
      .create({
        data: {
          phoneNumber: to,
          role: "bot",
          content,
        },
      })
      .catch(() => {});
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
    try {
      fs.renameSync(oldPath, newPath);
    } catch {}
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
  opts?: { prefix?: string; includeDetails?: boolean },
): Promise<void> {
  const tn = t.ticketNumber;
  const prefix = opts?.prefix ?? "";

  if (opts?.includeDetails) {
    const detailMsg = formatTicketDetailMessage(t);
    await sendEngineerMessage(to, detailMsg);
  }

  if (t.status === "ASSIGNED") {
    await sendEngineerMessage(to, `${prefix}📋 *${tn}* — Ready to start work?`, [
      { id: `${ENG_PREFIX.START}${tn}`, title: "▶️ Start Work" },
      { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
      { id: "TICKETS", title: "📋 All Tickets" },
    ]);
    return;
  }

  if (t.status === "IN_PROGRESS") {
    const report = await prisma.workReport.findUnique({
      where: { ticketId: t.id },
      include: { images: true },
    });
    const hasReached =
      report?.images.some((img) => img.fileName.startsWith("reached_location")) ?? false;
    const isReportComplete = !!(report?.problemDiagnosed?.trim() && report?.workDone?.trim());
    const hasFinished =
      report?.images.some((img) => img.fileName.startsWith("finished_work")) ?? false;

    if (!hasReached) {
      await sendEngineerMessage(
        to,
        `${prefix}📍 *${tn}* (In Progress)\n\n📸 *Awaiting Arrival Photo:*\nPlease upload a photo of the machine upon arrival at the customer location.\n\n_(If this was a trial/test call, tap Test Close below.)_`,
        [
          { id: `${ENG_PREFIX.TEST_CLOSE}${tn}`, title: "❌ Test Close" },
          { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
          { id: "TICKETS", title: "📋 All Tickets" },
        ],
      );
      return;
    }

    if (!isReportComplete) {
      await sendEngineerMessage(
        to,
        `${prefix}📍 *${tn}* (In Progress)\n\n✅ Arrival photo verified.\n📝 Please fill in your Service Report (Problem diagnosed, Work done).`,
        [
          { id: `${ENG_PREFIX.RPT}${tn}`, title: "📝 Service Report" },
          { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
          { id: "TICKETS", title: "📋 All Tickets" },
        ],
      );
      return;
    }

    if (!hasFinished) {
      await sendEngineerMessage(
        to,
        `${prefix}📍 *${tn}* (In Progress)\n\n✅ Service report notes saved.\n📸 Please upload a photo of the completed/repaired machine before requesting OTP.`,
        [
          { id: `${ENG_PREFIX.RPT}${tn}`, title: "📝 Service Report" },
          { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
          { id: "TICKETS", title: "📋 All Tickets" },
        ],
      );
      return;
    }

    await sendEngineerMessage(
      to,
      `${prefix}📍 *${tn}* (In Progress)\n\n🎉 All work and photos completed!\n🔐 Request OTP from the customer to close this ticket.`,
      [
        { id: `${ENG_PREFIX.OTP}${tn}`, title: "🔐 Request OTP" },
        { id: `${ENG_PREFIX.RPT}${tn}`, title: "📝 Service Report" },
        { id: `${ENG_PREFIX.SEL}${tn}`, title: "📋 Details" },
      ],
    );
    return;
  }

  if (t.status === "PENDING_OTP") {
    await sendEngineerMessage(
      to,
      `${prefix}🔐 *${tn}* — Waiting for Customer OTP\n\nAsk the customer for the 4-digit code sent to their WhatsApp/SMS, and reply with the code here.`,
      [
        { id: `${ENG_PREFIX.VERIFY_PROMPT}${tn}`, title: "✅ Enter OTP" },
        { id: `${ENG_PREFIX.RESEND}${tn}`, title: "🔁 Resend OTP" },
        { id: "TICKETS", title: "📋 All Tickets" },
      ],
    );
  }
}

export async function sendReportMenuList(
  to: string,
  ticketNumber: string,
  opts?: { prefix?: string },
): Promise<void> {
  const tn = ticketNumber;
  const prefix = opts?.prefix ?? "";
  await sendEngineerMessage(
    to,
    `${prefix}*${tn}* — Service Report\n\nChoose an item to update, or use direct text commands (e.g. *DIAGNOSE ${tn} <notes>*).`,
    undefined,
    {
      buttonText: "Report Options",
      rows: [
        { id: `${ENG_PREFIX.DIAG}${tn}`, title: "Problem Diagnosed", description: "Set root cause" },
        { id: `${ENG_PREFIX.WDONE}${tn}`, title: "Work Done Notes", description: "Log repair notes" },
        { id: `${ENG_PREFIX.PART}${tn}`, title: "Add Replaced Part", description: "name | part# | qty" },
        { id: `${ENG_PREFIX.WARR_YES}${tn}`, title: "Warranty: Yes", description: "Claim required" },
        { id: `${ENG_PREFIX.WARR_NO}${tn}`, title: "Warranty: No", description: "No warranty claim" },
        { id: `${ENG_PREFIX.SEL}${tn}`, title: "Back to Ticket", description: "View actions & details" },
      ],
    },
  );
}
