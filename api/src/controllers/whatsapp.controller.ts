// ── WhatsApp Webhook Controller ───────────────────────────────────────────
// Receives inbound messages from Meta Cloud API and routes them through
// the existing SimulateService FSM.  Replies are sent back via WhatsApp.

import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { env } from "../config/env";
import * as SimulateService from "../services/simulate.service";
import * as WhatsAppService from "../services/whatsapp.service";
import * as TicketService from "../services/ticket.service";
import { startFeedbackFlow } from "../services/simulate.service";
import { io } from "../lib/socket";
import type { ProductImage } from "../services/simulate.service";

// ── Deduplication ─────────────────────────────────────────────────────────
// Meta can retry webhook deliveries.  Keep a short-lived set of processed
// message IDs so we don't handle the same message twice.
const processedIds = new Set<string>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(messageId: string): boolean {
  if (processedIds.has(messageId)) return true;
  processedIds.add(messageId);
  setTimeout(() => processedIds.delete(messageId), DEDUP_TTL_MS);
  return false;
}

// ── GET /api/whatsapp/webhook — Meta verification challenge ──────────────
export function verifyWebhook(req: Request, res: Response): void {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WA_VERIFY_TOKEN) {
    console.log("[whatsapp] Webhook verified by Meta ✅");
    res.status(200).send(challenge);
    return;
  }

  console.warn("[whatsapp] Webhook verification failed ❌");
  res.sendStatus(403);
}

// ── POST /api/whatsapp/webhook — Inbound messages ────────────────────────
export function handleWebhook(req: Request, res: Response): void {
  // Acknowledge immediately — Meta requires a fast 200.
  res.sendStatus(200);

  // Process asynchronously so Meta doesn't time out.
  processWebhook(req.body).catch((err) =>
    console.error("[whatsapp] Webhook processing error:", err),
  );
}

async function processWebhook(body: unknown): Promise<void> {
  if (!body || typeof body !== "object") return;
  const payload = body as Record<string, unknown>;
  if (payload.object !== "whatsapp_business_account") return;

  const entries = payload.entry;
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    const changes = entry?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const messages = change?.value?.messages;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        await handleSingleMessage(msg);
      }
    }
  }
}

async function handleSingleMessage(msg: Record<string, unknown>): Promise<void> {
  const messageId = String(msg.id ?? "");
  const from      = String(msg.from ?? "");
  if (!from) return;

  // Deduplicate
  if (messageId && isDuplicate(messageId)) {
    console.log(`[whatsapp] Duplicate message ${messageId} — skipped`);
    return;
  }

  // ── Check if sender is a service engineer first ──
  // Normalize: Meta sends numbers without leading +, but DB may have been saved with or without it.
  const normalizedFrom = from.replace(/^\+/, "");
  const engineer = await prisma.user.findFirst({
    where: { whatsappNumber: { in: [normalizedFrom, `+${normalizedFrom}`] }, role: "service_engineer" },
    select: { id: true, firstName: true },
  });

  // Engineers can send images for work report photos
  if (engineer && msg.type === "image") {
    await handleEngineerImage(from, msg, engineer);
    return;
  }

  // Only process text and interactive (button/list reply) messages
  let text = "";
  if (msg.type === "text") {
    text = String((msg.text as Record<string, unknown>)?.body ?? "").trim();
  } else if (msg.type === "interactive") {
    const interactive = msg.interactive as Record<string, unknown> | undefined;
    if (interactive?.type === "button_reply") {
      const reply = interactive.button_reply as Record<string, unknown> | undefined;
      text = String(reply?.id ?? reply?.title ?? "").trim();
    } else if (interactive?.type === "list_reply") {
      const reply = interactive.list_reply as Record<string, unknown> | undefined;
      text = String(reply?.id ?? reply?.title ?? "").trim();
    }
  } else {
    await WhatsAppService.sendMessage(
      from,
      "⚠️ Sorry, I can only process text messages. Please type *MENU* to see options.",
    );
    return;
  }

  if (engineer) {
    await handleEngineerMessage(from, text, engineer);
    return;
  }

  // ── Customer flow — existing FSM ──

  // Persist user message
  if (text) {
    await prisma.simulateMessage.create({
      data: { phoneNumber: from, role: "user", content: text },
    });
  }

  // Run through FSM
  const result = await SimulateService.handleMessage(from, text);

  // Persist bot reply
  if (result.message) {
    await prisma.simulateMessage.create({
      data: { phoneNumber: from, role: "bot", content: result.message },
    });

    // Send product images first (if any)
    const images = (result as { images?: ProductImage[] }).images;
    if (images && images.length > 0) {
      for (const img of images) {
        await WhatsAppService.sendImage(from, img.url, img.caption);
      }
    }

    // Send reply via WhatsApp — use interactive list/buttons when available
    if (result.list && result.list.rows?.length > 0) {
      await WhatsAppService.sendInteractiveList(from, result.message, result.list.buttonText, result.list.rows);
    } else if (result.buttons && result.buttons.length > 0) {
      await WhatsAppService.sendInteractiveButtons(from, result.message, result.buttons);
    } else {
      await WhatsAppService.sendMessage(from, result.message);
    }
  }
}

// ── Engineer-specific WhatsApp handler ────────────────────────────────────
// Engineers get a different experience — ticket status, assignment info, etc.
async function handleEngineerMessage(
  from: string,
  text: string,
  engineer: { id: string; firstName: string },
): Promise<void> {
  const upperText = text.toUpperCase().trim();

  if (upperText === "MENU" || upperText === "HI" || upperText === "HII" || upperText === "HIII" || upperText === "HELLO" || upperText === "HEY") {
    await WhatsAppService.sendInteractiveButtons(
      from,
      `👋 Hi ${engineer.firstName}! Welcome to Poornasree Engineer Portal.\n\nWhat would you like to do?`,
      [
        { id: "TICKETS",      title: "📋 My Tickets" },
        { id: "TROUBLESHOOT", title: "🔍 Troubleshoot" },
        { id: "HELP",         title: "❓ Help" },
      ],
    );
    return;
  }

  if (upperText === "TICKETS") {
    const tickets = await prisma.ticket.findMany({
      where: {
        assignedEngineerId: engineer.id,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
      },
      select: {
        ticketNumber: true,
        status: true,
        problemDescription: true,
        issueDescription: true,
        machineName: true,
        machineSerialNumber: true,
        machineCustomer: true,
        customerAddress: true,
        updatedAt: true,
        customer: { select: { firstName: true, lastName: true } },
        pincode: { select: { code: true, place: true } },
        assignedManager: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (tickets.length === 0) {
      await WhatsAppService.sendMessage(from, "✅ You have no active tickets right now. Great job!");
      return;
    }

    const lines = tickets.map((t, i) => {
      const customerName = t.machineCustomer
        || (t.customer ? `${t.customer.firstName} ${t.customer.lastName ?? ""}`.trim() : "Unknown");
      const place = t.pincode?.place ?? "";
      const pincode = t.pincode?.code ?? "";
      const product = t.machineName ?? "—";
      const serial = t.machineSerialNumber ?? "—";
      const complaint = t.problemDescription ? t.problemDescription.slice(0, 100) : "—";
      const assignedBy = t.assignedManager
        ? `${t.assignedManager.firstName} ${t.assignedManager.lastName ?? ""}`.trim()
        : "—";
      const assignedAt = t.updatedAt
        ? t.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
          + ", " + t.updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
        : "—";

      return [
        `${i + 1}. *${t.ticketNumber}* (${t.status})`,
        `   👤 Name: ${customerName}`,
        ...(t.customerAddress ? [`   🏠 Address: ${t.customerAddress}`] : []),
        `   📍 Place: ${place}${place && pincode ? " | " : ""}Pincode: ${pincode}`,
        `   🔧 Product: ${product}`,
        `   🔑 S/N: ${serial}`,
        `   📅 Assigned: ${assignedAt}`,
        `   📝 Complaint: ${complaint}`,
        `   👨‍💼 Assigned by: ${assignedBy}`,
      ].join("\n");
    });

    const reply = [`📋 *Your Active Tickets (${tickets.length}):*`, "", ...lines].join("\n");
    await WhatsAppService.sendMessage(from, reply);
    return;
  }

  if (upperText === "TROUBLESHOOT") {
    // Store state: waiting for the engineer to describe the issue
    await prisma.troubleshootingSession.deleteMany({
      where: { phoneNumber: from, status: "ACTIVE" },
    });
    await prisma.troubleshootingSession.create({
      data: { phoneNumber: from, serialNumber: "ENGINEER", problemType: "__PENDING__", currentStep: 0, status: "ACTIVE" },
    });
    await WhatsAppService.sendMessage(
      from,
      `🔍 *Troubleshoot Mode*\n\nDescribe the issue you are facing (e.g. "no vibration", "machine not turning on"):`,
    );
    return;
  }

  // ── Engineer troubleshoot session — handle open ACTIVE session ─────────
  // If the engineer has an active TroubleshootingSession, route all text through it.
  const activeSession = await prisma.troubleshootingSession.findFirst({
    where: { phoneNumber: from, status: "ACTIVE" },
  });

  if (activeSession) {
    await handleEngineerTroubleshootStep(from, text, engineer, activeSession);
    return;
  }

  if (upperText === "STATUS") {
    const counts = await prisma.ticket.groupBy({
      by: ["status"],
      where: { assignedEngineerId: engineer.id, status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP", "CLOSED"] } },
      _count: { _all: true },
    });

    const get = (s: string) => counts.find(c => c.status === s)?._count._all ?? 0;
    const reply = [
      `📊 *Ticket Summary for ${engineer.firstName}:*`,
      "",
      `🔵 Assigned: ${get("ASSIGNED")}`,
      `🟡 In Progress: ${get("IN_PROGRESS")}`,
      `🟠 Pending OTP: ${get("PENDING_OTP")}`,
      `✅ Closed: ${get("CLOSED")}`,
    ].join("\n");
    await WhatsAppService.sendMessage(from, reply);
    return;
  }

  // ── START <ticket-number> ─────────────────────────────────────────────
  if (upperText.startsWith("START ")) {
    const ticketNumber = text.slice(6).trim().toUpperCase();
    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber, assignedEngineerId: engineer.id },
    });
    if (!ticket) {
      await WhatsAppService.sendMessage(from, `❌ Ticket *${ticketNumber}* not found or not assigned to you.`);
      return;
    }
    try {
      await TicketService.startWork(ticket.id, engineer.id);
      await WhatsAppService.sendMessage(from, `✅ Ticket *${ticketNumber}* is now *IN PROGRESS*.\n\nWhen done, type:\n• *OTP ${ticketNumber}* — to request closure OTP\n• *NOTE ${ticketNumber} <your notes>* — to add work notes\n• Send a photo with caption *${ticketNumber}* — to attach a photo`);
    } catch (e: unknown) {
      await WhatsAppService.sendMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not start work."}`);
    }
    return;
  }

  // ── OTP <ticket-number> ───────────────────────────────────────────────
  if (upperText.startsWith("OTP ")) {
    const ticketNumber = text.slice(4).trim().toUpperCase();
    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber, assignedEngineerId: engineer.id },
    });
    if (!ticket) {
      await WhatsAppService.sendMessage(from, `❌ Ticket *${ticketNumber}* not found or not assigned to you.`);
      return;
    }
    try {
      const result = await TicketService.requestOTP(ticket.id, engineer.id);
      const exp = result.expiresAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      await WhatsAppService.sendMessage(from, `✅ OTP sent to the customer via WhatsApp.\n\nAsk the customer for the code, then type:\n*VERIFY ${ticketNumber} <code>*\n\nOTP expires at ${exp}.`);
    } catch (e: unknown) {
      await WhatsAppService.sendMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not send OTP."}`);
    }
    return;
  }

  // ── RESEND <ticket-number> ────────────────────────────────────────────
  if (upperText.startsWith("RESEND ")) {
    const ticketNumber = text.slice(7).trim().toUpperCase();
    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber, assignedEngineerId: engineer.id },
    });
    if (!ticket) {
      await WhatsAppService.sendMessage(from, `❌ Ticket *${ticketNumber}* not found or not assigned to you.`);
      return;
    }
    try {
      const result = await TicketService.requestOTP(ticket.id, engineer.id, false, true);
      const exp = result.expiresAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      await WhatsAppService.sendMessage(from, `✅ OTP resent to the customer.\n\nType: *VERIFY ${ticketNumber} <code>*\n\nExpires at ${exp}.`);
    } catch (e: unknown) {
      await WhatsAppService.sendMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not resend OTP."}`);
    }
    return;
  }

  // ── VERIFY <ticket-number> <code> ─────────────────────────────────────
  if (upperText.startsWith("VERIFY ")) {
    const parts = text.slice(7).trim().split(/\s+/);
    const ticketNumber = parts[0]?.toUpperCase();
    const code = parts[1];
    if (!ticketNumber || !code) {
      await WhatsAppService.sendMessage(from, `⚠️ Usage: *VERIFY <ticket-number> <4-digit-code>*\nExample: VERIFY TKT-20260515-001 4823`);
      return;
    }
    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber, assignedEngineerId: engineer.id },
    });
    if (!ticket) {
      await WhatsAppService.sendMessage(from, `❌ Ticket *${ticketNumber}* not found or not assigned to you.`);
      return;
    }
    try {
      const closed = await TicketService.verifyOTP(ticket.id, engineer.id, code);
      // Notify customer via socket
      io?.to(`user:${closed.customerId}`).emit("ticket:closed", {
        ticketId: closed.id,
        ticketNumber: closed.ticketNumber,
      });
      // Send feedback request to customer
      if (closed.phoneNumber && WhatsAppService.isConfigured()) {
        try {
          const feedbackMsg = await startFeedbackFlow(closed.phoneNumber, closed.id, closed.ticketNumber);
          await WhatsAppService.sendMessage(closed.phoneNumber, feedbackMsg);
          await prisma.simulateMessage.create({
            data: { phoneNumber: closed.phoneNumber, role: "assistant", content: feedbackMsg },
          });
        } catch { /* non-fatal */ }
      }
      await WhatsAppService.sendMessage(from, `🎉 Ticket *${ticketNumber}* has been *CLOSED* successfully!\n\nA feedback request has been sent to the customer.`);
    } catch (e: unknown) {
      await WhatsAppService.sendMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not verify OTP."}`);
    }
    return;
  }

  // ── NOTE <ticket-number> <text> ───────────────────────────────────────
  if (upperText.startsWith("NOTE ")) {
    const rest = text.slice(5).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await WhatsAppService.sendMessage(from, `⚠️ Usage: *NOTE <ticket-number> <your notes>*\nExample: NOTE TKT-20260515-001 Replaced motor capacitor`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const noteText = rest.slice(spaceIdx + 1).trim();
    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber, assignedEngineerId: engineer.id },
    });
    if (!ticket) {
      await WhatsAppService.sendMessage(from, `❌ Ticket *${ticketNumber}* not found or not assigned to you.`);
      return;
    }
    try {
      await prisma.workReport.upsert({
        where: { ticketId: ticket.id },
        create: { ticketId: ticket.id, dealerId: engineer.id, workDone: noteText },
        update: { workDone: noteText },
      });
      await WhatsAppService.sendMessage(from, `✅ Notes saved for *${ticketNumber}*.\n\nYou can also send a photo with caption *${ticketNumber}* to attach images.`);
    } catch (e: unknown) {
      await WhatsAppService.sendMessage(from, `⚠️ ${(e as { message?: string }).message ?? "Could not save notes."}`);
    }
    return;
  }

  if (upperText === "HELP") {
    await WhatsAppService.sendMessage(
      from,
      `🔧 *Engineer Commands:*\n\n` +
      `📋 *TICKETS* — View your active tickets\n` +
      `📊 *STATUS* — View ticket count summary\n` +
      `🔍 *TROUBLESHOOT* — Step-by-step private troubleshooting guide\n\n` +
      `*START <ticket>* — Mark ticket as In Progress\n` +
      `*OTP <ticket>* — Request closure OTP (sent to customer)\n` +
      `*RESEND <ticket>* — Resend OTP to customer\n` +
      `*VERIFY <ticket> <code>* — Enter OTP from customer to close ticket\n` +
      `*NOTE <ticket> <text>* — Add work notes to a ticket\n\n` +
      `📸 *Send a photo* with the ticket number as caption to attach it to the work report.\n\n` +
      `Example ticket number: TKT-20260515-001`,
    );
    return;
  }

  // Default — unrecognized command
  await WhatsAppService.sendInteractiveButtons(
    from,
    `Hi ${engineer.firstName}, I didn't understand that.\n\nType *HELP* for the full command list, or choose:`,
    [
      { id: "TICKETS",      title: "📋 My Tickets" },
      { id: "TROUBLESHOOT", title: "🔍 Troubleshoot" },
      { id: "HELP",         title: "❓ Help" },
    ],
  );
}

// ── Engineer troubleshoot step handler ───────────────────────────────────
// Routes the engineer through private step-by-step templates.
async function handleEngineerTroubleshootStep(
  from: string,
  text: string,
  engineer: { id: string; firstName: string },
  session: { id: string; phoneNumber: string; serialNumber: string; problemType: string; currentStep: number; status: string },
): Promise<void> {
  const upper = text.toUpperCase().trim();

  // ── Cancel / exit troubleshoot ─────────────────────────────────────────
  if (upper === "CANCEL" || upper === "EXIT" || upper === "MENU") {
    await prisma.troubleshootingSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED" },
    });
    await WhatsAppService.sendInteractiveButtons(
      from,
      `Troubleshoot session ended. What would you like to do?`,
      [
        { id: "TICKETS",      title: "📋 My Tickets" },
        { id: "TROUBLESHOOT", title: "🔍 Troubleshoot" },
        { id: "HELP",         title: "❓ Help" },
      ],
    );
    return;
  }

  // ── Phase 1: Engineer just described the issue — find template ─────────
  if (session.problemType === "__PENDING__") {
    // Find a matching engineer-audience template
    const template = await prisma.troubleshootingTemplate.findFirst({
      where: {
        isActive: true,
        audience: { in: ["engineer", "both"] },
        description: { contains: text, mode: "insensitive" },
      },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    // Try individual words if no phrase match
    let matched = template;
    if (!matched || matched.steps.length === 0) {
      const words = text.split(/\s+/).filter((w) => w.length >= 5);
      for (const word of words) {
        const m = await prisma.troubleshootingTemplate.findFirst({
          where: {
            isActive: true,
            audience: { in: ["engineer", "both"] },
            description: { contains: word, mode: "insensitive" },
          },
          include: { steps: { orderBy: { stepNumber: "asc" } } },
        });
        if (m && m.steps.length > 0) { matched = m; break; }
      }
    }

    if (!matched || matched.steps.length === 0) {
      await prisma.troubleshootingSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED" },
      });
      await WhatsAppService.sendInteractiveButtons(
        from,
        `😔 No troubleshooting guide found for: "${text}".\n\nContact your service manager or type *TROUBLESHOOT* to try again.`,
        [{ id: "TROUBLESHOOT", title: "🔍 Try Again" }, { id: "TICKETS", title: "📋 My Tickets" }],
      );
      return;
    }

    const steps = matched.steps;
    await prisma.troubleshootingSession.update({
      where: { id: session.id },
      data: { problemType: matched.problemType, currentStep: 1 },
    });

    await WhatsAppService.sendInteractiveButtons(
      from,
      `🔍 *${matched.title}*\n\n` +
      `🔧 *Step 1 of ${steps.length}:*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      steps[0].stepContent + "\n" +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Did this resolve the issue?`,
      [
        { id: "ENG_YES",  title: "✅ Resolved" },
        ...(steps.length > 1 ? [{ id: "ENG_NEXT", title: "➡️ Next Step" }] : []),
        { id: "CANCEL",   title: "❌ Cancel" },
      ],
    );
    return;
  }

  // ── Phase 2: Mid-session — handle YES / NEXT ───────────────────────────
  if (upper === "ENG_YES" || upper === "1") {
    await prisma.troubleshootingSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED" },
    });
    await WhatsAppService.sendMessage(
      from,
      `✅ *Issue Resolved!*\n\nGlad the guide helped, ${engineer.firstName}. Troubleshoot session closed.`,
    );
    return;
  }

  if (upper === "ENG_NEXT" || upper === "2") {
    const template = await prisma.troubleshootingTemplate.findUnique({
      where: { problemType: session.problemType },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    if (!template) {
      await prisma.troubleshootingSession.update({ where: { id: session.id }, data: { status: "COMPLETED" } });
      await WhatsAppService.sendMessage(from, `⚠️ Template not found. Session ended.`);
      return;
    }

    const nextStep = session.currentStep + 1;
    if (nextStep > template.steps.length) {
      // All steps exhausted
      await prisma.troubleshootingSession.update({
        where: { id: session.id },
        data: { status: "ESCALATED" },
      });
      await WhatsAppService.sendMessage(
        from,
        `✅ *All ${template.steps.length} steps completed.*\n\nIssue still unresolved? Contact your service manager with template: *${template.problemType}*.`,
      );
      return;
    }

    await prisma.troubleshootingSession.update({
      where: { id: session.id },
      data: { currentStep: nextStep },
    });

    const step = template.steps[nextStep - 1];
    await WhatsAppService.sendInteractiveButtons(
      from,
      `🔧 *Step ${nextStep} of ${template.steps.length}:*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      step.stepContent + "\n" +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Did this resolve the issue?`,
      [
        { id: "ENG_YES",  title: "✅ Resolved" },
        ...(nextStep < template.steps.length ? [{ id: "ENG_NEXT", title: "➡️ Next Step" }] : []),
        { id: "CANCEL",   title: "❌ Cancel" },
      ],
    );
    return;
  }

  // Unrecognised input during a session — re-show current step
  const template = await prisma.troubleshootingTemplate.findUnique({
    where: { problemType: session.problemType },
    include: { steps: { where: { stepNumber: session.currentStep }, take: 1 } },
  });
  const stepContent = template?.steps[0]?.stepContent ?? "Step not found.";
  await WhatsAppService.sendInteractiveButtons(
    from,
    `Please choose an option for *Step ${session.currentStep}:*\n\n${stepContent}`,
    [
      { id: "ENG_YES",  title: "✅ Resolved" },
      { id: "ENG_NEXT", title: "➡️ Next Step" },
      { id: "CANCEL",   title: "❌ Cancel" },
    ],
  );
}

// ── Engineer image handler ────────────────────────────────────────────────
// Downloads the photo from Meta's media API and attaches it to the
// work report for the ticket whose number appears in the image caption.
async function handleEngineerImage(
  from: string,
  msg: Record<string, unknown>,
  engineer: { id: string; firstName: string },
): Promise<void> {
  const image = msg.image as Record<string, unknown> | undefined;
  const mediaId = String(image?.id ?? "");
  const caption = String(image?.caption ?? "").trim().toUpperCase();

  if (!mediaId) {
    await WhatsAppService.sendMessage(from, "⚠️ Could not read the image. Please try again.");
    return;
  }

  if (!caption) {
    await WhatsAppService.sendMessage(from, "⚠️ Please add the ticket number as the image caption.\nExample caption: TKT-20260515-001");
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: caption, assignedEngineerId: engineer.id },
  });
  if (!ticket) {
    await WhatsAppService.sendMessage(from, `❌ Ticket *${caption}* not found or not assigned to you.`);
    return;
  }

  if (!WhatsAppService.isConfigured()) {
    await WhatsAppService.sendMessage(from, "⚠️ WhatsApp media download is not configured on this server.");
    return;
  }

  try {
    // Step 1: Resolve media URL from Meta Graph API
    const metaUrlRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}` } },
    );
    if (!metaUrlRes.ok) throw new Error(`Media URL fetch failed: ${metaUrlRes.status}`);
    const metaUrlJson = (await metaUrlRes.json()) as { url?: string; mime_type?: string };
    const downloadUrl = metaUrlJson.url;
    const mimeType    = metaUrlJson.mime_type ?? "image/jpeg";
    if (!downloadUrl) throw new Error("No download URL in Meta response");

    // Step 2: Download the image binary
    const imgRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}` },
    });
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Step 3: Save to disk
    const ext      = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-wa.${ext}`;
    const dir      = path.resolve(__dirname, "../../uploads/work-reports");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);

    // Step 4: Attach to work report (auto-create if needed)
    let report = await prisma.workReport.findUnique({ where: { ticketId: ticket.id } });
    if (!report) {
      report = await prisma.workReport.create({
        data: { ticketId: ticket.id, dealerId: engineer.id },
      });
    }
    await prisma.workReportImage.create({
      data: {
        workReportId: report.id,
        url:          `/uploads/work-reports/${filename}`,
        fileName:     filename,
      },
    });

    await WhatsAppService.sendMessage(from, `✅ Photo attached to ticket *${caption}* successfully.`);
  } catch (e: unknown) {
    console.error("[whatsapp] handleEngineerImage error:", e);
    await WhatsAppService.sendMessage(from, `⚠️ Failed to save photo: ${(e as { message?: string }).message ?? "Unknown error"}`);
  }
}
