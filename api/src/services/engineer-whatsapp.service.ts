// ── Service Engineer WhatsApp Router & Action Engine ────────────────────────

import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { normalizeWhatsappNumber } from "./whatsapp.service";
import * as WhatsAppService from "./whatsapp.service";
import * as TicketService from "./ticket.service";
import { searchTrainingVideos } from "./engineer-training-video.service";
import { getCatalogForRole, prefilterCatalog } from "./training-catalog.service";
import {
  ENG_PREFIX,
  ENGINEER_ACTIVE_TICKET_SELECT,
  type EngineerTicketRow,
  formatTicketDetailMessage,
  sendTicketActionButtons,
  sendEngineerMessage,
  sendReportMenuList,
  attachWorkReportPhoto,
  findEngineerTicket,
} from "./engineer-ticket-whatsapp.shared";
import { resolveTicketCustomerName } from "../lib/ticket-customer";

interface PendingAction {
  type: "diagnose" | "work_done" | "part" | "verify_otp";
  ticketNumber: string;
}

// In-memory active ticket and pending action tracking per engineer phone
const activeTicketMap = new Map<string, string>();
const pendingActionMap = new Map<string, PendingAction>();

export function getActiveTicket(phone: string): string | undefined {
  return activeTicketMap.get(phone);
}

export function setActiveTicket(phone: string, ticketNumber: string): void {
  activeTicketMap.set(phone, ticketNumber);
}

export function setPending(phone: string, type: PendingAction["type"], ticketNumber: string): void {
  pendingActionMap.set(phone, { type, ticketNumber });
}

export function clearPending(phone: string): void {
  pendingActionMap.delete(phone);
}

/**
 * Checks if a given phone number belongs to an active service_engineer.
 */
export async function isServiceEngineer(rawPhone: string) {
  const norm = normalizeWhatsappNumber(rawPhone);
  if (!norm) return null;

  const phoneVariants = [
    rawPhone,
    norm,
    norm.startsWith("91") && norm.length === 12 ? norm.slice(2) : norm,
    norm.startsWith("91") && norm.length === 12 ? `+${norm}` : norm,
  ];

  return prisma.user.findFirst({
    where: {
      role: "service_engineer",
      OR: [
        { whatsappNumber: { in: phoneVariants } },
        { email: { in: phoneVariants } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      whatsappNumber: true,
      email: true,
    },
  });
}

/**
 * Upsert fields on an engineer's work report.
 */
async function upsertReportField(
  ticketId: string,
  engineerId: string,
  fields: {
    problemDiagnosed?: string;
    workDone?: string;
    warrantyClaimRequested?: boolean;
    appendPart?: { partName: string; partNumber?: string; quantity: number };
  },
) {
  let report = await prisma.workReport.findUnique({
    where: { ticketId },
  });

  if (!report) {
    report = await prisma.workReport.create({
      data: { ticketId, dealerId: engineerId },
    });
  }

  const data: Record<string, unknown> = {};
  if (fields.problemDiagnosed !== undefined) data.problemDiagnosed = fields.problemDiagnosed;
  if (fields.workDone !== undefined) data.workDone = fields.workDone;
  if (fields.warrantyClaimRequested !== undefined) data.warrantyClaimRequested = fields.warrantyClaimRequested;

  if (Object.keys(data).length > 0) {
    report = await prisma.workReport.update({
      where: { id: report.id },
      data,
    });
  }

  if (fields.appendPart) {
    await prisma.replacedPart.create({
      data: {
        workReportId: report.id,
        partName: fields.appendPart.partName,
        partNumber: fields.appendPart.partNumber ?? null,
        quantity: fields.appendPart.quantity,
      },
    });
  }

  return report;
}

/**
 * Main router for inbound WhatsApp messages from Service Engineers.
 */
export async function handleEngineerMessage(
  from: string,
  rawText: string,
  engineer: { id: string; firstName: string; lastName?: string | null },
): Promise<void> {
  const text = (rawText || "").trim();
  const upper = text.toUpperCase();

  console.log(`[engineer-whatsapp] Inbound from ${engineer.firstName} (${from}): "${text}"`);

  // ── 1. Pending Action Interceptor (e.g. text input after button click) ──
  const pending = pendingActionMap.get(from);
  if (pending) {
    const { type, ticketNumber } = pending;

    if (type === "diagnose") {
      clearPending(from);
      const ticket = await findEngineerTicket(ticketNumber, engineer.id);
      if (ticket) {
        await upsertReportField(ticket.id, engineer.id, { problemDiagnosed: text });
        setActiveTicket(from, ticketNumber);
        setPending(from, "work_done", ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ *Problem Diagnosed* saved for *${ticketNumber}*.\n\n` +
            `🔧 *Next Step:* Please describe the *work done* (repair notes).\n\n` +
            `_(Or type: NOTE ${ticketNumber} <notes>)_`,
        );
        return;
      }
    } else if (type === "work_done") {
      clearPending(from);
      const ticket = await findEngineerTicket(ticketNumber, engineer.id);
      if (ticket) {
        await upsertReportField(ticket.id, engineer.id, { workDone: text });
        setActiveTicket(from, ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ *Work notes* saved for *${ticketNumber}*.\n\n` +
            `🔧 *Next Step:* Is this a warranty claim?`,
          [
            { id: `${ENG_PREFIX.WARR_YES}${ticketNumber}`, title: "Yes, Warranty" },
            { id: `${ENG_PREFIX.WARR_NO}${ticketNumber}`, title: "No Warranty" },
          ],
        );
        return;
      }
    } else if (type === "part") {
      clearPending(from);
      const segments = text.split("|").map((s) => s.trim());
      const partName = segments[0];
      const partNumber = segments[1] || undefined;
      const quantity = Math.max(1, parseInt(segments[2] ?? "1", 10) || 1);
      const ticket = await findEngineerTicket(ticketNumber, engineer.id);
      if (ticket && partName) {
        await upsertReportField(ticket.id, engineer.id, {
          appendPart: { partName, partNumber, quantity },
        });
        setActiveTicket(from, ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ Part added: *${partName}* ${partNumber ? `(${partNumber}) ` : ""}x${quantity}.\n\n` +
            `Add another part (*PART ${ticketNumber} name | part# | qty*), or upload the *finished work photo* to proceed.`,
        );
        return;
      }
    } else if (type === "verify_otp") {
      clearPending(from);
      const codeMatch = text.match(/\b\d{4}\b/);
      if (codeMatch) {
        await handleVerifyOtp(from, engineer, ticketNumber, codeMatch[0]);
        return;
      }
    }
  }

  // ── 2. Handle 4-digit OTP Code Reply Directly ──
  if (/^\d{4}$/.test(text)) {
    const activeTn = getActiveTicket(from);
    let targetTicket: EngineerTicketRow | null = null;
    if (activeTn) {
      targetTicket = (await findEngineerTicket(activeTn, engineer.id)) as EngineerTicketRow | null;
    }
    if (!targetTicket || targetTicket.status !== "PENDING_OTP") {
      const pendingTicket = await prisma.ticket.findFirst({
        where: { assignedEngineerId: engineer.id, status: "PENDING_OTP" },
        select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
        orderBy: { updatedAt: "desc" },
      });
      targetTicket = pendingTicket as EngineerTicketRow | null;
    }

    if (targetTicket) {
      await handleVerifyOtp(from, engineer, targetTicket.ticketNumber, text);
      return;
    }
  }

  // ── 3. Greeting & Main Menu ──
  if (
    upper === "HI" ||
    upper === "HELLO" ||
    upper === "MENU" ||
    upper === "START" ||
    upper === "HOME" ||
    upper === "HEY"
  ) {
    await sendEngineerMessage(
      from,
      `👋 *Hi ${engineer.firstName}!*\nWelcome to the Poornasree Service Engineer Portal.\n\nWhat would you like to do?`,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "TROUBLESHOOT", title: "🔍 Troubleshoot" },
        { id: "STATUS", title: "📊 Status Summary" },
      ],
    );
    return;
  }

  // ── 4. View Active Tickets List ("TICKETS" / "MY TICKETS" / "1") ──
  if (
    upper === "TICKETS" ||
    upper === "MY TICKETS" ||
    upper === "1" ||
    upper === "ALL TICKETS" ||
    upper === "LIST"
  ) {
    await handleListTickets(from, engineer);
    return;
  }

  // ── 5. Status Summary ──
  if (upper === "STATUS" || upper === "SUMMARY") {
    await handleStatusSummary(from, engineer);
    return;
  }

  // ── 6. Select Ticket Details ──
  if (upper.startsWith(ENG_PREFIX.SEL) || upper.startsWith("DETAILS ") || upper.startsWith("TICKET ")) {
    const ticketNumber = upper
      .replace(ENG_PREFIX.SEL, "")
      .replace("DETAILS ", "")
      .replace("TICKET ", "")
      .trim();
    const ticket = (await findEngineerTicket(ticketNumber, engineer.id)) as EngineerTicketRow | null;
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found in your assigned list.`);
      return;
    }
    setActiveTicket(from, ticketNumber);
    await sendTicketActionButtons(from, ticket, engineer.id, { includeDetails: true });
    return;
  }

  // ── 7. Start Work on Ticket ──
  if (upper.startsWith(ENG_PREFIX.START) || upper.startsWith("START ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.START, "").replace("START ", "").trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    try {
      await TicketService.startWork(ticket.id, engineer.id);
      setActiveTicket(from, ticketNumber);
      const updated = (await findEngineerTicket(ticketNumber, engineer.id)) as EngineerTicketRow;
      await sendTicketActionButtons(from, updated, engineer.id, {
        prefix: `🚀 *Work started on ticket ${ticketNumber}!* Status is now *IN PROGRESS*.\n\n`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start work";
      await sendEngineerMessage(from, `⚠️ ${msg}`);
    }
    return;
  }

  // ── 8. Service Report Menu ──
  if (upper.startsWith(ENG_PREFIX.RPT) || upper.startsWith("REPORT ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.RPT, "").replace("REPORT ", "").trim();
    setActiveTicket(from, ticketNumber);
    await sendReportMenuList(from, ticketNumber);
    return;
  }

  // ── 9. Diagnose Prompt / Command ──
  if (upper.startsWith(ENG_PREFIX.DIAG)) {
    const ticketNumber = upper.replace(ENG_PREFIX.DIAG, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "diagnose", ticketNumber);
    await sendEngineerMessage(
      from,
      `📝 *Problem Diagnosed for ${ticketNumber}:*\n\nPlease reply with the root cause description.`,
    );
    return;
  }
  if (upper.startsWith("DIAGNOSE ")) {
    const rest = text.slice(9).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *DIAGNOSE <ticketNumber> <problem description>*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const body = rest.slice(spaceIdx + 1).trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, { problemDiagnosed: body });
    setActiveTicket(from, ticketNumber);
    setPending(from, "work_done", ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ *Problem Diagnosed* saved for *${ticketNumber}*.\n\n` +
        `🔧 *Next Step:* Please describe the *work done* (repair notes) for this ticket.\n\n` +
        `_(Or reply with: NOTE ${ticketNumber} <notes>)_`,
    );
    return;
  }

  // ── 10. Work Done Prompt / Command ──
  if (upper.startsWith(ENG_PREFIX.WDONE)) {
    const ticketNumber = upper.replace(ENG_PREFIX.WDONE, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "work_done", ticketNumber);
    await sendEngineerMessage(
      from,
      `🔧 *Work Done for ${ticketNumber}:*\n\nPlease reply with the repair notes and action taken.`,
    );
    return;
  }
  if (upper.startsWith("NOTE ")) {
    const rest = text.slice(5).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *NOTE <ticketNumber> <work notes>*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const body = rest.slice(spaceIdx + 1).trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, { workDone: body });
    setActiveTicket(from, ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ *Work notes* saved for *${ticketNumber}*.\n\n` +
        `🔧 *Next Step:* Is this a warranty claim?`,
      [
        { id: `${ENG_PREFIX.WARR_YES}${ticketNumber}`, title: "Yes, Warranty" },
        { id: `${ENG_PREFIX.WARR_NO}${ticketNumber}`, title: "No Warranty" },
      ],
    );
    return;
  }

  // ── 11. Add Part Prompt / Command ──
  if (upper.startsWith(ENG_PREFIX.PART)) {
    const ticketNumber = upper.replace(ENG_PREFIX.PART, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "part", ticketNumber);
    await sendEngineerMessage(
      from,
      `🔩 *Add Replaced Part for ${ticketNumber}:*\n\nReply with details in format:\n*Part Name | Part Number | Quantity*\n\n_Example: Main Sensor PCB | PCB-E4 | 1_`,
    );
    return;
  }
  if (upper.startsWith("PART ")) {
    const rest = text.slice(5).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *PART <ticketNumber> name | part# | qty*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const partSpec = rest.slice(spaceIdx + 1).trim();
    const segments = partSpec.split("|").map((s) => s.trim());
    const partName = segments[0];
    const partNumber = segments[1] || undefined;
    const quantity = Math.max(1, parseInt(segments[2] ?? "1", 10) || 1);
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket || !partName) {
      await sendEngineerMessage(from, `⚠️ Could not add part. Check ticket number and part name.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, {
      appendPart: { partName, partNumber, quantity },
    });
    setActiveTicket(from, ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ Part added: *${partName}* ${partNumber ? `(${partNumber}) ` : ""}x${quantity}.\n\n` +
        `Add another part or upload your *finished work photo* to proceed.`,
    );
    return;
  }

  // ── 12. Warranty Claim Buttons ──
  if (upper.startsWith(ENG_PREFIX.WARR_YES) || upper.startsWith(ENG_PREFIX.WARR_NO)) {
    const isYes = upper.startsWith(ENG_PREFIX.WARR_YES);
    const ticketNumber = upper
      .replace(ENG_PREFIX.WARR_YES, "")
      .replace(ENG_PREFIX.WARR_NO, "")
      .trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (ticket) {
      await upsertReportField(ticket.id, engineer.id, { warrantyClaimRequested: isYes });
      setActiveTicket(from, ticketNumber);
      await sendEngineerMessage(
        from,
        `✅ Warranty claim marked *${isYes ? "Yes" : "No"}* for *${ticketNumber}*.\n\n` +
          `📸 *Next Step:* Please upload the *finished work photo* of the repaired machine.`,
      );
      return;
    }
  }

  // ── 13. Test Close (Quick Trial Close) ──
  if (upper.startsWith(ENG_PREFIX.TEST_CLOSE) || upper.startsWith("TESTCLOSE ")) {
    const ticketNumber = upper
      .replace(ENG_PREFIX.TEST_CLOSE, "")
      .replace("TESTCLOSE ", "")
      .trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (ticket) {
      await upsertReportField(ticket.id, engineer.id, {
        problemDiagnosed: "Customer trial / demonstration / test call",
        workDone: "Inspected and verified normal operation with customer",
        warrantyClaimRequested: false,
      });
      try {
        await TicketService.requestOTP(ticket.id, engineer.id);
        setActiveTicket(from, ticketNumber);
        setPending(from, "verify_otp", ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ *Trial/Test Service Report recorded for ${ticketNumber}.*\n\n` +
            `🔐 A 4-digit closure OTP has been sent to the customer.\n` +
            `Please ask the customer for the code and reply with it here.`,
          [
            { id: `${ENG_PREFIX.VERIFY_PROMPT}${ticketNumber}`, title: "✅ Enter OTP" },
            { id: `${ENG_PREFIX.RESEND}${ticketNumber}`, title: "🔁 Resend OTP" },
          ],
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to generate OTP";
        await sendEngineerMessage(from, `⚠️ ${msg}`);
      }
      return;
    }
  }

  // ── 14. Request OTP ──
  if (upper.startsWith(ENG_PREFIX.OTP) || upper.startsWith("OTP ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.OTP, "").replace("OTP ", "").trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    try {
      await TicketService.requestOTP(ticket.id, engineer.id);
      setActiveTicket(from, ticketNumber);
      setPending(from, "verify_otp", ticketNumber);
      await sendEngineerMessage(
        from,
        `🔐 *OTP Sent to Customer for Ticket ${ticketNumber}*\n\n` +
          `A 4-digit code has been delivered to the customer's WhatsApp/SMS.\n` +
          `Ask the customer for the code and reply with it here to close the ticket.`,
        [
          { id: `${ENG_PREFIX.VERIFY_PROMPT}${ticketNumber}`, title: "✅ Enter OTP" },
          { id: `${ENG_PREFIX.RESEND}${ticketNumber}`, title: "🔁 Resend OTP" },
        ],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not request OTP";
      await sendEngineerMessage(from, `⚠️ ${msg}`);
    }
    return;
  }

  // ── 15. Resend OTP ──
  if (upper.startsWith(ENG_PREFIX.RESEND) || upper.startsWith("RESEND ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.RESEND, "").replace("RESEND ", "").trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (ticket) {
      try {
        await TicketService.requestOTP(ticket.id, engineer.id, false, true);
        await sendEngineerMessage(
          from,
          `🔁 *New OTP sent to customer for ${ticketNumber}.*\nAsk the customer for the 4-digit code and reply here.`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to resend OTP";
        await sendEngineerMessage(from, `⚠️ ${msg}`);
      }
      return;
    }
  }

  // ── 16. Enter OTP Prompt ──
  if (upper.startsWith(ENG_PREFIX.VERIFY_PROMPT)) {
    const ticketNumber = upper.replace(ENG_PREFIX.VERIFY_PROMPT, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "verify_otp", ticketNumber);
    await sendEngineerMessage(
      from,
      `🔐 *Enter 4-Digit OTP for ${ticketNumber}:*\n\nPlease reply with the 4-digit code provided by the customer.`,
    );
    return;
  }

  // ── 17. Verify OTP Command ──
  if (upper.startsWith("VERIFY ")) {
    const parts = text.split(/\s+/);
    const ticketNumber = parts[1]?.toUpperCase();
    const code = parts[2];
    if (!ticketNumber || !code || !/^\d{4}$/.test(code)) {
      await sendEngineerMessage(from, `⚠️ Usage: *VERIFY <ticketNumber> <4-digit-code>*`);
      return;
    }
    await handleVerifyOtp(from, engineer, ticketNumber, code);
    return;
  }

  // ── 18. Troubleshoot / Training Videos ──
  if (upper === "TROUBLESHOOT" || upper === "TRAINING" || upper === "2") {
    await sendEngineerMessage(
      from,
      `🔍 *Technical Knowledge & Video Search*\n\nYou can ask any technical question directly (e.g. *"how to calibrate sensor channels"*, *"vibro low vibration"*).\n\nOr choose a quick topic:`,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "HELP", title: "❓ Help" },
      ],
    );
    return;
  }

  // ── 19. Help Command ──
  if (upper === "HELP" || upper === "COMMANDS") {
    await sendEngineerMessage(
      from,
      `📖 *Poornasree Engineer Commands:*\n\n` +
        `• *TICKETS* — View active assigned tickets\n` +
        `• *START <TKT>* — Mark ticket In Progress\n` +
        `• *DIAGNOSE <TKT> <notes>* — Set diagnosed root cause\n` +
        `• *NOTE <TKT> <notes>* — Add work done notes\n` +
        `• *PART <TKT> name | part# | qty* — Add replaced part\n` +
        `• *OTP <TKT>* — Send OTP to customer\n` +
        `• *RESEND <TKT>* — Resend OTP code\n` +
        `• *VERIFY <TKT> <code>* (or send 4 digits) — Close ticket\n` +
        `• *STATUS* — Summary of your tickets\n` +
        `• *Send Photo* — Upload arrival or finished machine photo`,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "STATUS", title: "📊 Status Summary" },
        { id: "MENU", title: "🏠 Main Menu" },
      ],
    );
    return;
  }

  // ── 20. Technical Query / Semantic Fallback ──
  if (text.length > 3) {
    const videoMatches = await searchTrainingVideos(text, 2).catch(() => []);
    if (videoMatches.length > 0) {
      const videoLines = videoMatches
        .map((v) => `🎬 *${v.title}*\n👉 ${v.youtubeUrl}`)
        .join("\n\n");
      await sendEngineerMessage(
        from,
        `💡 *Relevant Technical Training Videos:*\n\n${videoLines}\n\nType *TICKETS* to return to your jobs.`,
        [
          { id: "TICKETS", title: "📋 My Tickets" },
          { id: "HELP", title: "❓ Help" },
        ],
      );
      return;
    }
  }

  // Default Fallback
  await sendEngineerMessage(
    from,
    `Hi ${engineer.firstName}, I didn't recognize that command.\n\nType *TICKETS* to view your active jobs, or choose:`,
    [
      { id: "TICKETS", title: "📋 My Tickets" },
      { id: "STATUS", title: "📊 Status Summary" },
      { id: "HELP", title: "❓ Help" },
    ],
  );
}

/**
 * Lists all active tickets assigned to this engineer.
 */
async function handleListTickets(
  from: string,
  engineer: { id: string; firstName: string },
): Promise<void> {
  const tickets = (await prisma.ticket.findMany({
    where: {
      assignedEngineerId: engineer.id,
      status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
    },
    select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  })) as EngineerTicketRow[];

  if (tickets.length === 0) {
    await sendEngineerMessage(
      from,
      `📋 *My Tickets*\n\nHi ${engineer.firstName}, you have no pending tickets assigned right now! 🎉`,
      [
        { id: "STATUS", title: "📊 Status Summary" },
        { id: "HELP", title: "❓ Help" },
      ],
    );
    return;
  }

  // If only 1 ticket, show its full detail card and actions directly
  if (tickets.length === 1) {
    const t = tickets[0];
    setActiveTicket(from, t.ticketNumber);
    await sendTicketActionButtons(from, t, engineer.id, {
      includeDetails: true,
      prefix: `📋 You have 1 active ticket:\n\n`,
    });
    return;
  }

  // Multiple tickets: present an interactive list picker
  const rows = tickets.map((t) => {
    const customerName = resolveTicketCustomerName(t) || "Customer";
    const place = t.pincode?.place || t.machineAddress1 || "";
    let statusIcon = "🔵";
    if (t.status === "IN_PROGRESS") statusIcon = "🟡";
    if (t.status === "PENDING_OTP") statusIcon = "🟠";
    return {
      id: `${ENG_PREFIX.SEL}${t.ticketNumber}`,
      title: `${statusIcon} ${t.ticketNumber}`.slice(0, 24),
      description: `${customerName} · ${place}`.slice(0, 72),
    };
  });

  const listText = tickets
    .map((t, idx) => {
      const customerName = resolveTicketCustomerName(t) || "Customer";
      const place = t.pincode?.place || "—";
      let statusIcon = "🔵";
      if (t.status === "IN_PROGRESS") statusIcon = "🟡";
      if (t.status === "PENDING_OTP") statusIcon = "🟠";
      return `${idx + 1}. ${statusIcon} *${t.ticketNumber}* (${t.status})\n   👤 ${customerName} · 📍 ${place}`;
    })
    .join("\n\n");

  await sendEngineerMessage(
    from,
    `📋 *Active Tickets (${tickets.length}):*\n\n${listText}\n\nSelect a ticket to view details and start work:`,
    undefined,
    {
      buttonText: "Select Ticket",
      rows,
    },
  );
}

/**
 * Shows ticket count summary by status for the engineer.
 */
async function handleStatusSummary(
  from: string,
  engineer: { id: string; firstName: string },
): Promise<void> {
  const [assignedCount, inProgressCount, pendingOtpCount, closedCount] = await Promise.all([
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "ASSIGNED" } }),
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "PENDING_OTP" } }),
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "CLOSED" } }),
  ]);

  const totalActive = assignedCount + inProgressCount + pendingOtpCount;

  const msg = [
    `📊 *Ticket Summary — ${engineer.firstName}*`,
    ``,
    `🔵 *Assigned (New):* ${assignedCount}`,
    `🟡 *In Progress:* ${inProgressCount}`,
    `🟠 *Pending OTP:* ${pendingOtpCount}`,
    `────────────────`,
    `📋 *Total Active:* ${totalActive}`,
    `✅ *Completed / Closed:* ${closedCount}`,
  ].join("\n");

  await sendEngineerMessage(from, msg, [
    { id: "TICKETS", title: "📋 My Tickets" },
    { id: "HELP", title: "❓ Help" },
  ]);
}

/**
 * Handles OTP verification and closing the ticket.
 */
async function handleVerifyOtp(
  from: string,
  engineer: { id: string; firstName: string },
  ticketNumber: string,
  code: string,
): Promise<void> {
  const ticket = await findEngineerTicket(ticketNumber, engineer.id);
  if (!ticket) {
    await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }

  try {
    await TicketService.verifyOTP(ticket.id, engineer.id, code);
    setActiveTicket(from, "");
    clearPending(from);

    await sendEngineerMessage(
      from,
      `🎉 *TICKET CLOSED SUCCESSFULLY!*\n\n` +
        `Ticket *${ticketNumber}* has been verified and marked as *CLOSED* ✅.\n\n` +
        `A service completion confirmation and feedback survey have been sent to the customer. Thank you!`,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "STATUS", title: "📊 Status Summary" },
      ],
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OTP Verification failed";
    await sendEngineerMessage(
      from,
      `❌ *OTP Verification Failed:* ${msg}\n\nPlease check the 4-digit code with the customer or tap *Resend OTP*.`,
      [
        { id: `${ENG_PREFIX.VERIFY_PROMPT}${ticketNumber}`, title: "✅ Re-enter OTP" },
        { id: `${ENG_PREFIX.RESEND}${ticketNumber}`, title: "🔁 Resend OTP" },
        { id: "TICKETS", title: "📋 All Tickets" },
      ],
    );
  }
}

/**
 * Handles photo uploads sent by a service engineer.
 */
export async function handleEngineerMedia(
  from: string,
  msg: Record<string, unknown>,
  engineer: { id: string; firstName: string },
): Promise<void> {
  const mediaObj = (msg.image || msg.document) as Record<string, unknown> | undefined;
  const mediaId = String(mediaObj?.id ?? "");

  if (!mediaId) {
    await sendEngineerMessage(from, `⚠️ Could not read image attachment.`);
    return;
  }

  // Find target active ticket
  let activeTn = getActiveTicket(from);
  let ticket: EngineerTicketRow | null = null;

  if (activeTn) {
    ticket = (await findEngineerTicket(activeTn, engineer.id)) as EngineerTicketRow | null;
  }

  if (!ticket) {
    const inProgressTicket = await prisma.ticket.findFirst({
      where: { assignedEngineerId: engineer.id, status: "IN_PROGRESS" },
      select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
      orderBy: { updatedAt: "desc" },
    });
    ticket = inProgressTicket as EngineerTicketRow | null;
  }

  if (!ticket) {
    await sendEngineerMessage(
      from,
      `📸 Photo received, but no active *In Progress* ticket was found.\n\nPlease type *TICKETS* and select a ticket first.`,
      [{ id: "TICKETS", title: "📋 My Tickets" }],
    );
    return;
  }

  // Download media buffer
  const buffer = await WhatsAppService.downloadMediaBuffer(mediaId);
  if (!buffer) {
    await sendEngineerMessage(from, `⚠️ Could not download image from WhatsApp.`);
    return;
  }

  // Save to disk
  const uploadDir = path.resolve(process.cwd(), "uploads/work-reports");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `${Date.now()}_${engineer.id.slice(0, 8)}.jpg`;
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);

  // Attach to work report
  const { type, ticketNumber } = await attachWorkReportPhoto(ticket.id, engineer.id, filename);
  setActiveTicket(from, ticketNumber);

  if (type === "reached") {
    setPending(from, "diagnose", ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ *Arrival Photo Attached to ${ticketNumber}!*\n\n` +
        `📝 *Next Step:* Please enter the *problem diagnosed* (root cause).\n\n` +
        `_(Or reply with: DIAGNOSE ${ticketNumber} <root cause>)_`,
    );
  } else if (type === "finished") {
    const updated = (await findEngineerTicket(ticketNumber, engineer.id)) as EngineerTicketRow;
    await sendTicketActionButtons(from, updated, engineer.id, {
      prefix:
        `✅ *Finished Work Photo Attached to ${ticketNumber}!*\n\n` +
        `🔐 *Next Step:* Click *Request OTP* below to close the ticket.\n\n`,
    });
  } else {
    await sendEngineerMessage(
      from,
      `✅ Photo attached to ticket *${ticketNumber}* successfully.`,
      [
        { id: `${ENG_PREFIX.SEL}${ticketNumber}`, title: "📋 Ticket Details" },
        { id: "TICKETS", title: "📋 All Tickets" },
      ],
    );
  }
}
