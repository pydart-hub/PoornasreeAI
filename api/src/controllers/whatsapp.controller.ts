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

  // Only process text messages
  if (msg.type !== "text") {
    await WhatsAppService.sendMessage(
      from,
      "⚠️ Sorry, I can only process text messages. Please type *MENU* to see options.",
    );
    return;
  }

  const text = String((msg.text as Record<string, unknown>)?.body ?? "").trim();

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

    // Send reply via WhatsApp
    await WhatsAppService.sendMessage(from, result.message);
  }
}
