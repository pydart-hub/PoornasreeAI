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
import { handleEngineerWhatsAppMessage } from "../services/engineer-whatsapp.service";
import type { SimulateReply } from "../services/simulate.service";

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
  // Meta sends numbers without leading +, but DB may have been saved with spaces, +, or without country code.
  const cleanFrom = from.replace(/\D/g, "");
  
  const allEngineers = await prisma.user.findMany({
    where: { role: "service_engineer" },
    select: { id: true, firstName: true, whatsappNumber: true },
  });
  
  const engineer = allEngineers.find(e => {
    if (!e.whatsappNumber) return false;
    const cleanDb = e.whatsappNumber.replace(/\D/g, "");
    
    // Bulletproof 10-digit Indian mobile number matching
    if (cleanDb.length >= 10 && cleanFrom.length >= 10) {
      return cleanDb.slice(-10) === cleanFrom.slice(-10);
    }
    return cleanDb === cleanFrom;
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
    if (text.startsWith("ENG_PHOTO:")) {
      const parts = text.split(":");
      const ticketNumber = parts[1];
      const filename = parts[2];

      const ticket = await prisma.ticket.findFirst({
        where: { ticketNumber, assignedEngineerId: engineer.id },
      });
      if (!ticket) {
        await WhatsAppService.sendMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
        return;
      }

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
      await WhatsAppService.sendMessage(from, `✅ Photo attached to ticket *${ticketNumber}* successfully.`);
      return;
    }

    await handleEngineerWhatsAppMessage(from, text, engineer, async (f, t, eng) => {
      if (t.toUpperCase().trim() === "TROUBLESHOOT") {
        await prisma.troubleshootingSession.deleteMany({
          where: { phoneNumber: f, status: "ACTIVE" },
        });

        const issues = await prisma.documentIssue.findMany({
          where: { isActive: true, audience: { in: ["engineer", "both"] } },
          take: 10,
        });

        if (issues.length === 0) {
          await WhatsAppService.sendMessage(f, `⚠️ No troubleshooting guides available right now.`);
          return;
        }

        await WhatsAppService.sendInteractiveList(
          f,
          `🔍 *Troubleshoot Mode*\n\nPlease select the issue you are facing:`,
          "Select Issue",
          issues.map(iss => ({
            id: `ENG_TS_ISSUE:${iss.problemType}`,
            title: iss.title.slice(0, 24),
            description: iss.description?.slice(0, 72)
          }))
        );
        return;
      }

      if (t.startsWith("ENG_TS_ISSUE:")) {
        const problemType = t.replace("ENG_TS_ISSUE:", "").trim();
        const template = await prisma.documentIssue.findUnique({
          where: { problemType },
          include: { steps: { orderBy: { stepNumber: "asc" } } },
        });

        if (!template || template.steps.length === 0) {
          await WhatsAppService.sendMessage(f, `⚠️ No steps found for this issue.`);
          return;
        }

        await prisma.troubleshootingSession.deleteMany({
          where: { phoneNumber: f, status: "ACTIVE" },
        });

        await prisma.troubleshootingSession.create({
          data: {
            phoneNumber: f,
            serialNumber: "ENGINEER",
            problemType: template.problemType,
            currentStep: 1,
            status: "ACTIVE",
          },
        });

        await WhatsAppService.sendInteractiveButtons(
          f,
          `🔍 *${template.title}*\n\n` +
          `🔧 *Step 1 of ${template.steps.length}:*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          template.steps[0].stepContent + "\n" +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Did this resolve the issue?`,
          [
            { id: "ENG_YES",  title: "✅ Resolved" },
            ...(template.steps.length > 1 ? [{ id: "ENG_NEXT", title: "➡️ Next Step" }] : []),
            { id: "CANCEL",   title: "❌ Cancel" },
          ],
        );
        return;
      }

      const activeSession = await prisma.troubleshootingSession.findFirst({
        where: { phoneNumber: f, status: "ACTIVE" },
      });
      if (activeSession) {
        await handleEngineerTroubleshootStep(f, t, eng, activeSession);
      }
    });
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

  await deliverBotReply(from, result);
}

/** Persist and send the FSM reply; video links go in a separate text message. */
async function deliverBotReply(to: string, result: SimulateReply): Promise<void> {
  if (!result.message) return;

  await prisma.simulateMessage.create({
    data: { phoneNumber: to, role: "bot", content: result.message },
  });

  if (result.images?.length) {
    for (const img of result.images) {
      await WhatsAppService.sendImage(to, img.url, img.caption);
    }
  }

  if (result.list?.rows?.length) {
    await WhatsAppService.sendInteractiveList(to, result.message, result.list.buttonText, result.list.rows);
  } else if (result.buttons?.length) {
    await WhatsAppService.sendInteractiveButtons(to, result.message, result.buttons);
  } else {
    await WhatsAppService.sendMessage(to, result.message);
  }

  if (result.followUpMessage) {
    await prisma.simulateMessage.create({
      data: { phoneNumber: to, role: "bot", content: result.followUpMessage },
    });
    await WhatsAppService.sendMessage(to, result.followUpMessage);
  }
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
    // Find a matching engineer-audience template using semantic search
    const matched = await SimulateService.findDocumentIssue(text, "", ["engineer", "both"]);

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
    const template = await prisma.documentIssue.findUnique({
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
  const template = await prisma.documentIssue.findUnique({
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

    if (!caption) {
      // Step 4a: Ask for ticket if no caption
      const tickets = await prisma.ticket.findMany({
        where: {
          assignedEngineerId: engineer.id,
          status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
        },
        select: { ticketNumber: true, status: true, customer: { select: { firstName: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      if (tickets.length === 0) {
        await WhatsAppService.sendMessage(from, "⚠️ Photo saved, but you have no active tickets to attach it to.");
        return;
      }

      await WhatsAppService.sendInteractiveList(
        from,
        "Photo received! Which ticket does this belong to?",
        "Select Ticket",
        tickets.map((t) => ({
          id: `ENG_PHOTO:${t.ticketNumber}:${filename}`,
          title: t.ticketNumber.replace(/^TKT-\d{8}-/i, "").slice(0, 24) || t.ticketNumber.slice(0, 24),
          description: `Attach to ${t.customer?.firstName ?? "Customer"} (${t.status})`,
        })),
      );
      return;
    }

    // Step 4b: Attach immediately if caption has ticket
    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber: caption, assignedEngineerId: engineer.id },
    });
    if (!ticket) {
      await WhatsAppService.sendMessage(from, `❌ Ticket *${caption}* not found. The photo was saved, but not attached.`);
      return;
    }

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
