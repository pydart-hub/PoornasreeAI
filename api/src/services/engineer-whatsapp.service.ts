// Engineer WhatsApp command router — tickets, OTP, service report, interactive menus.

import prisma from "../lib/prisma";
import { io } from "../lib/socket";
import * as TicketService from "./ticket.service";
import * as WhatsAppService from "./whatsapp.service";
import { startFeedbackFlow } from "./simulate.service";
import {
  ENG_PREFIX,
  ENGINEER_ACTIVE_TICKET_SELECT,
  findEngineerTicket,
  formatTicketDetailMessage,
  sendReportMenuList,
  sendTicketActionButtons,
  sendEngineerMessage,
  ticketFromEngId,
  type EngineerTicketRow,
} from "./engineer-ticket-whatsapp.shared";

type EngineerCtx = { id: string; firstName: string };

type PendingKind = "verify_otp" | "diagnose" | "work_done" | "part" | "note";

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

async function checkReachedPhoto(ticketNumber: string, engineerId: string): Promise<boolean> {
  const t = await findEngineerTicket(ticketNumber, engineerId);
  if (!t) return false;
  const report = await prisma.workReport.findUnique({
    where: { ticketId: t.id },
    include: { images: true }
  });
  return report?.images.some(img => img.fileName.startsWith("reached_location")) ?? false;
}

async function upsertReportField(
  ticketId: string,
  engineerId: string,
  data: {
    problemDiagnosed?: string;
    workDone?: string;
    warrantyClaimRequested?: boolean;
    appendPart?: { partName: string; partNumber?: string; quantity: number };
  },
): Promise<void> {
  const existing = await prisma.workReport.findUnique({
    where: { ticketId },
    include: { parts: true },
  });

  let parts: { partName: string; partNumber?: string; quantity: number }[] =
    existing?.parts.map((p) => ({
      partName: p.partName,
      partNumber: p.partNumber ?? undefined,
      quantity: p.quantity,
    })) ?? [];

  if (data.appendPart) {
    parts = [...parts, data.appendPart];
  }

  await prisma.workReport.upsert({
    where: { ticketId },
    create: {
      ticketId,
      dealerId: engineerId,
      problemDiagnosed: data.problemDiagnosed?.trim() || null,
      workDone: data.workDone?.trim() || null,
      warrantyClaimRequested: data.warrantyClaimRequested ?? false,
    },
    update: {
      ...(data.problemDiagnosed !== undefined
        ? { problemDiagnosed: data.problemDiagnosed.trim() || null }
        : {}),
      ...(data.workDone !== undefined ? { workDone: data.workDone.trim() || null } : {}),
      ...(data.warrantyClaimRequested !== undefined
        ? { warrantyClaimRequested: data.warrantyClaimRequested }
        : {}),
    },
  });

  if (data.appendPart || parts.length > 0) {
    const report = await prisma.workReport.findUniqueOrThrow({ where: { ticketId } });
    await prisma.replacedPart.deleteMany({ where: { workReportId: report.id } });
    if (parts.length > 0) {
      await prisma.replacedPart.createMany({
        data: parts.map((p) => ({
          workReportId: report.id,
          partName: p.partName.trim(),
          partNumber: p.partNumber?.trim() || null,
          quantity: Math.max(1, p.quantity),
        })),
      });
    }
  }
}

async function showTicketList(from: string, engineer: EngineerCtx, page: number = 0): Promise<void> {
  const PAGE_SIZE = 8;
  const tickets = await prisma.ticket.findMany({
    where: {
      assignedEngineerId: engineer.id,
      status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
    },
    select: ENGINEER_ACTIVE_TICKET_SELECT,
    orderBy: { createdAt: "desc" },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });

  if (tickets.length === 0 && page === 0) {
    await sendEngineerMessage(from, "✅ You have no active tickets right now. Great job!");
    return;
  }
  if (tickets.length === 0 && page > 0) {
    await sendEngineerMessage(from, "No more tickets found on this page.");
    return;
  }

  const hasNext = tickets.length > PAGE_SIZE;
  const displayTickets = tickets.slice(0, PAGE_SIZE);

  const summary = displayTickets
    .map((t, i) => {
      const name = formatTicketDetailMessage(t).split("\n")[1] ?? "";
      return `${page * PAGE_SIZE + i + 1}. *${t.ticketNumber}* (${t.status})\n   ${name}`;
    })
    .join("\n\n");

  await sendEngineerMessage(
    from,
    `📋 *Your Active Tickets (Page ${page + 1}):*\n\n${summary}`,
  );

  const rows = displayTickets.map((t) => {
    const customer = formatTicketDetailMessage(t).split("\n")[1]?.replace("👤 Name: ", "") ?? "Customer";
    return {
      id: `${ENG_PREFIX.SEL}${t.ticketNumber}`,
      title: t.ticketNumber.replace(/^TKT-\d{8}-/i, "").slice(0, 24) || t.ticketNumber.slice(0, 24),
      description: `${customer.slice(0, 40)} · ${t.status}`,
    };
  });

  if (page > 0) {
    rows.push({
      id: `${ENG_PREFIX.LIST}:${page - 1}`,
      title: "⬅️ Previous Page",
      description: `View tickets ${Math.max(1, (page - 1) * PAGE_SIZE + 1)} to ${page * PAGE_SIZE}`,
    });
  }

  if (hasNext) {
    rows.push({
      id: `${ENG_PREFIX.LIST}:${page + 1}`,
      title: "➡️ Next Page",
      description: "View more tickets",
    });
  }

  await sendEngineerMessage(
    from,
    `Tap a ticket to open actions (Page ${page + 1}):`,
    undefined,
    {
      buttonText: "Select ticket",
      rows,
    }
  );
}

async function showTicketDetail(from: string, engineer: EngineerCtx, ticketNumber: string): Promise<void> {
  const ticket = await findEngineerTicket(ticketNumber, engineer.id);
  if (!ticket) {
    await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found or not assigned to you.`);
    return;
  }
  await sendEngineerMessage(from, formatTicketDetailMessage(ticket as EngineerTicketRow));
  await sendTicketActionButtons(from, ticket as EngineerTicketRow, engineer.id);
}

async function handleStart(from: string, engineer: EngineerCtx, ticketNumber: string): Promise<void> {
  const ticket = await findEngineerTicket(ticketNumber, engineer.id);
  if (!ticket) {
    await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }
  try {
    await TicketService.startWork(ticket.id, engineer.id);
    const updated = await findEngineerTicket(ticketNumber, engineer.id);
    if (updated) {
      await sendEngineerMessage(from, `✅ Ticket *${ticketNumber}* is now *IN PROGRESS*.\n\n📸 *Arrival photo needed:* Please take a photo of the product on arrival and send it to this chat.`);
      await sendTicketActionButtons(from, updated as EngineerTicketRow, engineer.id);
    }
  } catch (e: unknown) {
    await sendEngineerMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not start work."}`);
  }
}

async function handleOtp(
  from: string,
  engineer: EngineerCtx,
  ticketNumber: string,
  resend: boolean,
): Promise<void> {
  const ticket = await findEngineerTicket(ticketNumber, engineer.id);
  if (!ticket) {
    await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }
  try {
    const result = await TicketService.requestOTP(ticket.id, engineer.id, false, resend);
    const exp = result.expiresAt.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    await sendEngineerMessage(
      from,
      `✅ OTP ${resend ? "resent" : "sent"} to the customer via WhatsApp.\nExpires at ${exp}.\n\nTap *Enter OTP* or type *VERIFY ${ticketNumber} <code>*`,
    );
    const updated = await findEngineerTicket(ticketNumber, engineer.id);
    if (updated) await sendTicketActionButtons(from, updated as EngineerTicketRow, engineer.id);
  } catch (e: unknown) {
    await sendEngineerMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not send OTP."}`);
  }
}

async function handleVerify(
  from: string,
  engineer: EngineerCtx,
  ticketNumber: string,
  code: string,
): Promise<void> {
  const ticket = await findEngineerTicket(ticketNumber, engineer.id);
  if (!ticket) {
    await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }
  try {
    const closed = await TicketService.verifyOTP(ticket.id, engineer.id, code);
    clearPending(from);
    io?.to(`user:${closed.customerId}`).emit("ticket:closed", {
      ticketId: closed.id,
      ticketNumber: closed.ticketNumber,
    });
    if (closed.phoneNumber && WhatsAppService.isConfigured()) {
      try {
        const feedbackMsg = await startFeedbackFlow(
          closed.phoneNumber,
          closed.id,
          closed.ticketNumber,
        );
        await WhatsAppService.sendMessage(closed.phoneNumber, feedbackMsg);
        await prisma.simulateMessage.create({
          data: { phoneNumber: closed.phoneNumber, role: "assistant", content: feedbackMsg },
        });
      } catch { /* non-fatal */ }
    }
    await sendEngineerMessage(
      from,
      `🎉 Ticket *${ticketNumber}* has been *CLOSED* successfully!\n\nA feedback request was sent to the customer.`,
    );
  } catch (e: unknown) {
    await sendEngineerMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not verify OTP."}`);
  }
}

async function handleInteractive(
  from: string,
  engineer: EngineerCtx,
  text: string,
): Promise<boolean> {
  const upperText = text.toUpperCase().trim();

  if (text.startsWith(ENG_PREFIX.LIST) || text === "TICKETS") {
    const parts = text.split(":");
    const page = parseInt(parts[1] ?? "0", 10) || 0;
    await showTicketList(from, engineer, page);
    return true;
  }
  if (text === ENG_PREFIX.MENU) {
    await sendEngineerMenu(from, engineer);
    return true;
  }

  const sel = ticketFromEngId(ENG_PREFIX.SEL, text);
  if (sel) {
    await showTicketDetail(from, engineer, sel);
    return true;
  }

  const startTn = ticketFromEngId(ENG_PREFIX.START, text);
  if (startTn) {
    await handleStart(from, engineer, startTn);
    return true;
  }

  // ENG_TEST_CLOSE interactive button reply
  if (text.startsWith("ENG_TEST_CLOSE:")) {
    const tn = text.replace("ENG_TEST_CLOSE:", "").trim().toUpperCase();
    const t = await findEngineerTicket(tn, engineer.id);
    if (!t) {
      await sendEngineerMessage(from, `❌ Ticket *${tn}* not found.`);
      return true;
    }
    await upsertReportField(t.id, engineer.id, {
      problemDiagnosed: "Test/Trial Complaint - Closed without service",
      workDone: "No service required (Customer test)",
      warrantyClaimRequested: false,
    });
    await handleOtp(from, engineer, tn, false);
    return true;
  }

  const otpTn = ticketFromEngId(ENG_PREFIX.OTP, text);
  if (otpTn) {
    const t = await findEngineerTicket(otpTn, engineer.id);
    if (!t) {
      await sendEngineerMessage(from, `❌ Ticket *${otpTn}* not found.`);
      return true;
    }
    const report = await prisma.workReport.findUnique({
      where: { ticketId: t.id },
      include: { images: true }
    });
    const hasReached = report?.images.some(img => img.fileName.startsWith("reached_location")) ?? false;
    const isReportComplete = !!(report?.problemDiagnosed?.trim() && report?.workDone?.trim());
    const hasFinished = report?.images.some(img => img.fileName.startsWith("finished_work")) ?? false;

    if (!hasReached) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) before requesting OTP.`);
      await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }
    if (!isReportComplete) {
      await sendEngineerMessage(from, `⚠️ Please complete the Service Report (Problem Diagnosed & Work Done) before requesting OTP.`);
      await sendReportMenuList(from, otpTn);
      return true;
    }
    if (!hasFinished) {
      await sendEngineerMessage(from, `⚠️ You must upload a photo of the finished work before requesting OTP.`);
      await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }

    await handleOtp(from, engineer, otpTn, false);
    return true;
  }

  const resendTn = ticketFromEngId(ENG_PREFIX.RESEND, text);
  if (resendTn) {
    await handleOtp(from, engineer, resendTn, true);
    return true;
  }

  const verifyTn = ticketFromEngId(ENG_PREFIX.VERIFY_PROMPT, text);
  if (verifyTn) {
    setPending(from, "verify_otp", verifyTn);
    await sendEngineerMessage(
      from,
      `Enter the 4-digit OTP from the customer for *${verifyTn}*.\n\nReply with the code only, or *VERIFY ${verifyTn} <code>*`,
    );
    return true;
  }

  const rptTn = ticketFromEngId(ENG_PREFIX.RPT, text);
  if (rptTn) {
    if (!await checkReachedPhoto(rptTn, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(rptTn, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }
    await sendReportMenuList(from, rptTn);
    return true;
  }

  const diagTn = ticketFromEngId(ENG_PREFIX.DIAG, text);
  if (diagTn) {
    if (!await checkReachedPhoto(diagTn, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(diagTn, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }
    setPending(from, "diagnose", diagTn);
    await sendEngineerMessage(
      from,
      `Describe the *problem diagnosed* for *${diagTn}* (one message), or type:\n*DIAGNOSE ${diagTn} <text>*`,
    );
    return true;
  }

  const wdoneTn = ticketFromEngId(ENG_PREFIX.WDONE, text);
  if (wdoneTn) {
    if (!await checkReachedPhoto(wdoneTn, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(wdoneTn, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }
    setPending(from, "work_done", wdoneTn);
    await sendEngineerMessage(
      from,
      `Describe *work done* for *${wdoneTn}*, or type:\n*NOTE ${wdoneTn} <text>*`,
    );
    return true;
  }

  const partTn = ticketFromEngId(ENG_PREFIX.PART, text);
  if (partTn) {
    if (!await checkReachedPhoto(partTn, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(partTn, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }
    setPending(from, "part", partTn);
    await sendEngineerMessage(
      from,
      `Send replaced part for *${partTn}*:\n*PART ${partTn} name | part-number | qty*\nExample: PART ${partTn} Motor | MTR-01 | 1`,
    );
    return true;
  }

  const warrYes = ticketFromEngId(ENG_PREFIX.WARR_YES, text);
  if (warrYes) {
    if (!await checkReachedPhoto(warrYes, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(warrYes, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }
    const t = await findEngineerTicket(warrYes, engineer.id);
    if (!t) {
      await sendEngineerMessage(from, `❌ Ticket *${warrYes}* not found.`);
      return true;
    }
    await upsertReportField(t.id, engineer.id, { warrantyClaimRequested: true });
    await sendEngineerMessage(from, `✅ Warranty claim marked *Yes* for *${warrYes}*.`);
    await sendReportMenuList(from, warrYes);
    return true;
  }

  const warrNo = ticketFromEngId(ENG_PREFIX.WARR_NO, text);
  if (warrNo) {
    if (!await checkReachedPhoto(warrNo, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(warrNo, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return true;
    }
    const t = await findEngineerTicket(warrNo, engineer.id);
    if (!t) {
      await sendEngineerMessage(from, `❌ Ticket *${warrNo}* not found.`);
      return true;
    }
    await upsertReportField(t.id, engineer.id, { warrantyClaimRequested: false });
    await sendEngineerMessage(from, `✅ Warranty claim marked *No* for *${warrNo}*.`);
    await sendReportMenuList(from, warrNo);
    return true;
  }

  if (text === ENG_PREFIX.BACK) {
    await showTicketList(from, engineer);
    return true;
  }

  return false;
}

async function handlePendingText(
  from: string,
  engineer: EngineerCtx,
  text: string,
  pending: PendingInput,
): Promise<boolean> {
  const tn = pending.ticketNumber;
  const ticket = await findEngineerTicket(tn, engineer.id);
  if (!ticket) {
    clearPending(from);
    await sendEngineerMessage(from, `❌ Ticket *${tn}* not found.`);
    return true;
  }

  if (pending.kind === "verify_otp") {
    const code = text.replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) {
      await sendEngineerMessage(from, `⚠️ Send a 4-digit code, or *VERIFY ${tn} <code>*`);
      return true;
    }
    await handleVerify(from, engineer, tn, code);
    return true;
  }

  if (pending.kind === "diagnose") {
    await upsertReportField(ticket.id, engineer.id, { problemDiagnosed: text });
    clearPending(from);
    await sendEngineerMessage(from, `✅ Diagnosis saved for *${tn}*.`);
    await sendReportMenuList(from, tn);
    return true;
  }

  if (pending.kind === "work_done" || pending.kind === "note") {
    await upsertReportField(ticket.id, engineer.id, { workDone: text });
    clearPending(from);
    await sendEngineerMessage(from, `✅ Work notes saved for *${tn}*.`);
    await sendReportMenuList(from, tn);
    return true;
  }

  if (pending.kind === "part") {
    clearPending(from);
    await sendEngineerMessage(
      from,
      `Use: *PART ${tn} name | part-number | quantity*`,
    );
    return true;
  }

  return false;
}

async function sendEngineerMenu(from: string, engineer: EngineerCtx): Promise<void> {
  await sendEngineerMessage(
    from,
    `👋 Hi ${engineer.firstName}! Poornasree Engineer Portal.\n\nWhat would you like to do?`,
    [
      { id: "TICKETS", title: "📋 My Tickets" },
      { id: "TROUBLESHOOT", title: "🔍 Troubleshoot" },
      { id: "HELP", title: "❓ Help" },
    ],
  );
}

function helpText(): string {
  return (
    `🔧 *Engineer WhatsApp Help*\n\n` +
    `Welcome to the Poornasree Engineer Portal!\n` +
    `You don't need to type any manual commands. Simply use the menu to navigate:\n\n` +
    `📋 *My Tickets* — View your active tasks, update their status, close them, and submit your service reports.\n\n` +
    `🔍 *Troubleshoot* — Get guided step-by-step help for machine issues.\n\n` +
    `📸 *Photo Upload* — To add a photo to a report, just send the photo and the bot will ask you which ticket it belongs to!`
  );
}

/** Main engineer message router (text + interactive reply ids). */
export async function handleEngineerWhatsAppMessage(
  from: string,
  text: string,
  engineer: EngineerCtx,
  onTroubleshoot: (from: string, text: string, engineer: EngineerCtx) => Promise<void>,
): Promise<void> {
  const upperText = text.toUpperCase().trim();
  const trimmed = text.trim();

  const pending = getPending(from);
  if (
    pending &&
    !upperText.startsWith("VERIFY ") &&
    !upperText.startsWith("PART ") &&
    !upperText.startsWith("DIAGNOSE ") &&
    !upperText.startsWith("NOTE ") &&
    !upperText.startsWith("WARRANTY ") &&
    !trimmed.startsWith(ENG_PREFIX.SEL) &&
    !trimmed.startsWith(ENG_PREFIX.LIST) &&
    trimmed !== "MENU"
  ) {
    if (await handlePendingText(from, engineer, trimmed, pending)) return;
  }

  if (upperText === "TICKETS") {
    await showTicketList(from, engineer);
    return;
  }

  if (await handleInteractive(from, engineer, trimmed)) return;

  if (
    upperText === "MENU" ||
    upperText === "HI" ||
    upperText === "HII" ||
    upperText === "HIII" ||
    upperText === "HELLO" ||
    upperText === "HEY"
  ) {
    await sendEngineerMenu(from, engineer);
    return;
  }

  if (upperText === "STATUS") {
    const counts = await prisma.ticket.groupBy({
      by: ["status"],
      where: {
        assignedEngineerId: engineer.id,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP", "CLOSED"] },
      },
      _count: { _all: true },
    });
    const get = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
    await sendEngineerMessage(
      from,
      [
        `📊 *Ticket Summary for ${engineer.firstName}:*`,
        "",
        `🔵 Assigned: ${get("ASSIGNED")}`,
        `🟡 In Progress: ${get("IN_PROGRESS")}`,
        `🟠 Pending OTP: ${get("PENDING_OTP")}`,
        `✅ Closed: ${get("CLOSED")}`,
      ].join("\n"),
    );
    return;
  }

  if (
    upperText === "TROUBLESHOOT" ||
    upperText.startsWith("ENG_TS_ISSUE:") ||
    upperText.startsWith("ENG_TS_PROD:") ||
    upperText.startsWith("ENG_TS_PAGE:")
  ) {
    await onTroubleshoot(from, text, engineer);
    return;
  }

  const activeSession = await prisma.troubleshootingSession.findFirst({
    where: { phoneNumber: from, status: "ACTIVE" },
  });
  if (activeSession) {
    await onTroubleshoot(from, text, engineer);
    return;
  }

  if (upperText.startsWith("START ")) {
    await handleStart(from, engineer, text.slice(6).trim().toUpperCase());
    return;
  }

  // TESTCLOSE manual command
  if (upperText.startsWith("TESTCLOSE ")) {
    const tn = text.slice(10).trim().toUpperCase();
    const t = await findEngineerTicket(tn, engineer.id);
    if (!t) {
      await sendEngineerMessage(from, `❌ Ticket *${tn}* not found.`);
      return;
    }
    await upsertReportField(t.id, engineer.id, {
      problemDiagnosed: "Test/Trial Complaint - Closed without service",
      workDone: "No service required (Customer test)",
      warrantyClaimRequested: false,
    });
    await handleOtp(from, engineer, tn, false);
    return;
  }

  if (upperText.startsWith("OTP ")) {
    const tn = text.slice(4).trim().toUpperCase();
    const t = await findEngineerTicket(tn, engineer.id);
    if (!t) {
      await sendEngineerMessage(from, `❌ Ticket *${tn}* not found.`);
      return;
    }
    const report = await prisma.workReport.findUnique({
      where: { ticketId: t.id },
      include: { images: true }
    });
    const hasReached = report?.images.some(img => img.fileName.startsWith("reached_location")) ?? false;
    const isReportComplete = !!(report?.problemDiagnosed?.trim() && report?.workDone?.trim());
    const hasFinished = report?.images.some(img => img.fileName.startsWith("finished_work")) ?? false;

    if (!hasReached || !isReportComplete || !hasFinished) {
      await sendEngineerMessage(from, `⚠️ Cannot request OTP. Ensure arrival photo is uploaded, report is complete (diagnose & work done), and finished photo is uploaded.\n\nUse Test Close for trial complaints.`);
      await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return;
    }
    await handleOtp(from, engineer, tn, false);
    return;
  }

  if (upperText.startsWith("RESEND ")) {
    await handleOtp(from, engineer, text.slice(7).trim().toUpperCase(), true);
    return;
  }

  if (upperText.startsWith("VERIFY ")) {
    const parts = text.slice(7).trim().split(/\s+/);
    const ticketNumber = parts[0]?.toUpperCase();
    const code = parts[1];
    if (!ticketNumber || !code) {
      await sendEngineerMessage(
        from,
        `⚠️ Usage: *VERIFY <ticket> <code>*\nExample: VERIFY TKT-20260515-001 4823`,
      );
      return;
    }
    clearPending(from);
    await handleVerify(from, engineer, ticketNumber, code);
    return;
  }

  if (upperText.startsWith("DIAGNOSE ")) {
    const rest = text.slice(9).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *DIAGNOSE <ticket> <text>*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const body = rest.slice(spaceIdx + 1).trim();

    if (!await checkReachedPhoto(ticketNumber, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(ticketNumber, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return;
    }

    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, { problemDiagnosed: body });
    await sendEngineerMessage(from, `✅ Diagnosis saved for *${ticketNumber}*.`);
    await sendReportMenuList(from, ticketNumber);
    return;
  }

  if (upperText.startsWith("NOTE ")) {
    const rest = text.slice(5).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *NOTE <ticket> <text>*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const body = rest.slice(spaceIdx + 1).trim();

    if (!await checkReachedPhoto(ticketNumber, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(ticketNumber, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return;
    }

    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, { workDone: body });
    await sendEngineerMessage(from, `✅ Work notes saved for *${ticketNumber}*.`);
    await sendReportMenuList(from, ticketNumber);
    return;
  }

  if (upperText.startsWith("PART ")) {
    const rest = text.slice(5).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(
        from,
        `⚠️ Usage: *PART <ticket> name | part-number | qty*`,
      );
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const partSpec = rest.slice(spaceIdx + 1).trim();
    const segments = partSpec.split("|").map((s) => s.trim());
    const partName = segments[0];
    const partNumber = segments[1] || undefined;
    const quantity = Math.max(1, parseInt(segments[2] ?? "1", 10) || 1);
    if (!partName) {
      await sendEngineerMessage(from, `⚠️ Part name is required.`);
      return;
    }

    if (!await checkReachedPhoto(ticketNumber, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(ticketNumber, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return;
    }

    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, {
      appendPart: { partName, partNumber, quantity },
    });
    await sendEngineerMessage(from, `✅ Part added to *${ticketNumber}* report.`);
    await sendReportMenuList(from, ticketNumber);
    return;
  }

  if (upperText.startsWith("WARRANTY ")) {
    const rest = text.slice(9).trim().split(/\s+/);
    const ticketNumber = rest[0]?.toUpperCase();
    const flag = rest[1]?.toUpperCase();
    if (!ticketNumber || !flag) {
      await sendEngineerMessage(from, `⚠️ Usage: *WARRANTY <ticket> YES* or *NO*`);
      return;
    }

    if (!await checkReachedPhoto(ticketNumber, engineer.id)) {
      await sendEngineerMessage(from, `⚠️ You must upload a product photo on arrival (reached location) first.`);
      const t = await findEngineerTicket(ticketNumber, engineer.id);
      if (t) await sendTicketActionButtons(from, t as EngineerTicketRow, engineer.id);
      return;
    }

    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    const yes = flag === "YES" || flag === "Y" || flag === "TRUE" || flag === "1";
    const no = flag === "NO" || flag === "N" || flag === "FALSE" || flag === "0";
    if (!yes && !no) {
      await sendEngineerMessage(from, `⚠️ Use YES or NO after ticket number.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, { warrantyClaimRequested: yes });
    await sendEngineerMessage(
      from,
      `✅ Warranty *${yes ? "Yes" : "No"}* for *${ticketNumber}*.`,
    );
    await sendReportMenuList(from, ticketNumber);
    return;
  }

  if (upperText === "HELP") {
    await sendEngineerMessage(from, helpText());
    return;
  }

  await sendEngineerMessage(
    from,
    `Hi ${engineer.firstName}, I didn't understand that.\n\nType *HELP* or choose:`,
    [
      { id: "TICKETS", title: "📋 My Tickets" },
      { id: "TROUBLESHOOT", title: "🔍 Troubleshoot" },
      { id: "HELP", title: "❓ Help" },
    ],
  );
}
