// ── WhatsApp Webhook Controller ───────────────────────────────────────────
// Receives inbound messages from Meta Cloud API and routes them through
// the existing SimulateService FSM.  Replies are sent back via WhatsApp.

import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { env } from "../config/env";
import * as SimulateService from "../services/simulate.service";
import * as WhatsAppService from "../services/whatsapp.service";

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

  // Only process text and interactive (button reply) messages
  let text = "";
  if (msg.type === "text") {
    text = String((msg.text as Record<string, unknown>)?.body ?? "").trim();
  } else if (msg.type === "interactive") {
    const interactive = msg.interactive as Record<string, unknown> | undefined;
    if (interactive?.type === "button_reply") {
      const reply = interactive.button_reply as Record<string, unknown> | undefined;
      text = String(reply?.id ?? reply?.title ?? "").trim();
    }
  } else {
    await WhatsAppService.sendMessage(
      from,
      "⚠️ Sorry, I can only process text messages. Please type *MENU* to see options.",
    );
    return;
  }

  // ── Check if sender is a service engineer ──
  const engineer = await prisma.user.findFirst({
    where: { whatsappNumber: from, role: "service_engineer" },
    select: { id: true, firstName: true },
  });

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

    // Send reply via WhatsApp — use interactive buttons when available
    if (result.buttons && result.buttons.length > 0) {
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

  if (upperText === "MENU" || upperText === "HI" || upperText === "HELLO" || upperText === "START") {
    const reply = [
      `👋 Hi ${engineer.firstName}! Welcome to Poornasree Engineer Portal.`,
      "",
      "Available commands:",
      "📋 *TICKETS* — View your assigned tickets",
      "📊 *STATUS* — Quick ticket count summary",
      "❓ *HELP* — Show this menu again",
    ].join("\n");
    await WhatsAppService.sendMessage(from, reply);
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

  if (upperText === "HELP") {
    const reply = [
      `🔧 *Engineer Commands:*`,
      "",
      "📋 *TICKETS* — View your assigned tickets",
      "📊 *STATUS* — Quick ticket count summary",
      "❓ *HELP* — Show this menu",
    ].join("\n");
    await WhatsAppService.sendMessage(from, reply);
    return;
  }

  // Default — unrecognized command
  await WhatsAppService.sendMessage(
    from,
    `Hi ${engineer.firstName}, I didn't understand that. Type *HELP* to see available commands.`,
  );
}
