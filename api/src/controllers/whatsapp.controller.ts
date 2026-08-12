// ── WhatsApp Webhook Controller ───────────────────────────────────────────
// Receives inbound messages from Meta Cloud API and routes them through
// the existing SimulateService FSM.  Replies are sent back via WhatsApp.

import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { runtime } from "../services/runtime-config.service";
import * as SimulateService from "../services/simulate.service";
import * as WhatsAppService from "../services/whatsapp.service";
import {
  handleEngineerWhatsAppMessage,
  getActiveTicket,
  setActiveTicket,
  handleReachedPhotoAttached,
  handleFinishedPhotoAttached,
  handleNormalPhotoAttached,
} from "../services/engineer-whatsapp.service";
import type { SimulateReply } from "../services/simulate.service";
import {
  sendEngineerMessage,
  attachWorkReportPhoto,
  findEngineerTicket,
  sendTicketActionButtons,
  sendReportMenuList,
  type EngineerTicketRow,
} from "../services/engineer-ticket-whatsapp.shared";
import { handleDealerWhatsAppMessage } from "../services/dealer-whatsapp.service";
import { searchTrainingVideos } from "../services/engineer-training-video.service";
import { transcribeAudioWithGroq } from "../services/groq.service";

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

function extractProductFromTag(tag: string): { prefix: string; name: string } {
  // Hardcoded mappings for known categories to ensure backward compatibility and exact casing
  const categoryMap: Record<string, string> = {
    "vibro": "Vibro",
    "solar_charger": "Solar Charger",
    "compact_adapter": "Compact Adapter",
    "charger_adapter": "Charger Adapter",
    "ecod_dpst": "Ecod DPST",
    "ecod_battery": "Ecod Battery",
    "analyzer_mainboard": "Analyzer Mainboard",
    "others_analyzer": "Others Analyzer",
    "pump": "Pump",
  };

  // Check if it starts with any of the known category keys (longest match first)
  const sortedKeys = Object.keys(categoryMap).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (tag.startsWith(key)) {
      return { prefix: key, name: categoryMap[key] };
    }
  }

  // Fallback: dynamic extraction
  const parts = tag.split("_");
  if (parts.length === 0) {
    return { prefix: tag, name: tag.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) };
  }

  // Stop words that indicate the start of the issue/symptom rather than the product name
  const stopWords = new Set([
    "not", "no", "error", "issue", "failure", "fail", "broken", "bad", 
    "low", "high", "working", "power", "led", "display", "vibration", 
    "temp", "voltage", "current", "charging", "output", "input", "dead",
    "fault"
  ]);

  let prefixLength = 1;
  if (parts.length > 1 && !stopWords.has(parts[1].toLowerCase())) {
    prefixLength = 2;
  }

  const prefixParts = parts.slice(0, prefixLength);
  const prefix = prefixParts.join("_");
  
  // Format prefix to Title Case (e.g., "solar_charger" -> "Solar Charger")
  const name = prefixParts
    .map(p => {
      // Special acronyms/capitalizations
      const upper = p.toUpperCase();
      if (["USB", "GSM", "LED", "DPST", "ECOD", "AC", "DC"].includes(upper)) {
        return upper;
      }
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join(" ");

  return { prefix, name };
}

function getPageInfo(total: number, page: number) {
  const hasPrev = page > 0;
  const startIndex = page === 0 ? 0 : 9 + (page - 1) * 8;
  const remaining = total - startIndex;

  let pageSize = 0;
  let hasNext = false;

  if (page === 0) {
    if (total <= 10) {
      pageSize = total;
      hasNext = false;
    } else {
      pageSize = 9;
      hasNext = true;
    }
  } else {
    if (remaining <= 9) {
      pageSize = remaining;
      hasNext = false;
    } else {
      pageSize = 8;
      hasNext = true;
    }
  }

  return { startIndex, pageSize, hasPrev, hasNext };
}

function splitIssueTitle(title: string): { displayTitle: string; displayDesc?: string } {
  // 1. Check if there is a mixed case transition (e.g. "READING VARIATION Inconsistent readings")
  const words = title.split(" ");
  let firstLowercaseIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (/[a-z]/.test(words[i])) {
      firstLowercaseIdx = i;
      break;
    }
  }
  if (firstLowercaseIdx > 0) {
    const displayTitle = words.slice(0, firstLowercaseIdx).join(" ").trim();
    const displayDesc = words.slice(firstLowercaseIdx).join(" ").trim();
    return { displayTitle, displayDesc };
  }

  // 2. Look for explicit keywords/substrings to split by (longest/most specific matches first)
  const splitKeywords = [
    "RESTART TIME TIME CHANGED",
    "MACHINE WILL OFF FUSE BURN",
    "UPDATION ERROR SHOWN",
    "WATER IN SENSOR",
    "BLANK DISPLAY",
    "NOT VIEW",
    "AIR IN MILK",
    "FUSE BURN",
    "NOT WORKING",
    "NOT PRESENT",
    "NOT DETECTED",
    "NOT SHOWN",
    "NOT RUNNING",
    "NOT SAVED",
    "NOT SEND",
    "RESULT ZERO",
    "VERSION",
    "COMPUTER MODE",
    "ERROR SHOWN",
    "ERROR",
    "TO THE FARMER",
    "IN WATER",
  ];

  for (const kw of splitKeywords) {
    const idx = title.toUpperCase().indexOf(kw);
    if (idx > 0) {
      const displayTitle = title.slice(0, idx).trim();
      const displayDesc = title.slice(idx).trim();
      return { displayTitle, displayDesc };
    }
  }

  // 3. Fallback: if title is longer than 24 chars, split by word count
  if (title.length > 24) {
    const half = Math.ceil(words.length / 2);
    const displayTitle = words.slice(0, half).join(" ").trim();
    const displayDesc = words.slice(half).join(" ").trim();
    return { displayTitle, displayDesc };
  }

  return { displayTitle: title };
}

async function sendMatchingRdVideo(to: string, issueTitle: string): Promise<void> {
  try {
    const rdVideos = await prisma.rdVideo.findMany();
    const issueTitleLower = issueTitle.toLowerCase();
    
    let bestMatch = null;
    for (const v of rdVideos) {
      const vTitle = v.title.toLowerCase();
      const vDesc = (v.description || "").toLowerCase();
      const vKeywords = (v.keywords || "").toLowerCase().split(",").map(k => k.trim()).filter(Boolean);
      
      let matchedByKeyword = false;
      for (const kw of vKeywords) {
        if (issueTitleLower.includes(kw)) {
          matchedByKeyword = true;
          break;
        }
      }

      // Match by keyword, or if issue title contains video title (or vice versa), or if description contains issue title.
      // We skip very short video titles to avoid false positives (e.g., "a" matching everything).
      if (
        matchedByKeyword ||
        (vTitle.length > 2 && issueTitleLower.includes(vTitle)) ||
        vTitle.includes(issueTitleLower) ||
        (vDesc.length > 2 && vDesc.includes(issueTitleLower))
      ) {
        bestMatch = v;
        break;
      }
    }
    
    if (bestMatch) {
      await WhatsAppService.sendMessage(
        to,
        `🎥 *R&D Reference Video*\n${bestMatch.title}\n${bestMatch.youtubeUrl}`
      );
    }
  } catch (err) {
    console.error("[whatsapp] Error fetching/sending R&D video:", err);
  }
}


async function sendIssuesList(to: string, prefix: string, page: number, categoryName: string): Promise<void> {
  const issues = await prisma.documentIssue.findMany({
    where: {
      isActive: true,
      audience: { in: ["engineer", "customer", "both"] },
      problemType: { startsWith: prefix },
    },
    orderBy: { title: "asc" },
  });

  if (issues.length === 0) {
    await sendEngineerMessage(to, `⚠️ No troubleshooting guides found for ${categoryName}.`);
    return;
  }

  const { startIndex, pageSize, hasPrev, hasNext } = getPageInfo(issues.length, page);
  const pageIssues = issues.slice(startIndex, startIndex + pageSize);

  const rows: WhatsAppService.WaListRow[] = [];

  if (hasPrev) {
    rows.push({
      id: `ENG_TS_PAGE:${prefix}:${page - 1}`,
      title: "⬅️ Previous Page",
      description: "Go to previous issues",
    });
  }

  pageIssues.forEach((iss) => {
    const { displayTitle, displayDesc } = splitIssueTitle(iss.title);
    rows.push({
      id: `ENG_TS_ISSUE:${iss.id}`,
      title: displayTitle.slice(0, 24),
      ...(displayDesc ? { description: displayDesc.slice(0, 72) } : {}),
    });
  });

  if (hasNext) {
    rows.push({
      id: `ENG_TS_PAGE:${prefix}:${page + 1}`,
      title: "Next Page ➡️",
      description: "Go to next issues",
    });
  }

  const startNum = startIndex + 1;
  const endNum = startIndex + pageIssues.length;
  const totalNum = issues.length;

  await sendEngineerMessage(
    to,
    `🔍 *Troubleshoot - ${categoryName}*\n\nPlease select the issue (showing ${startNum}-${endNum} of ${totalNum}):`,
    undefined,
    {
      buttonText: "Select Issue",
      rows,
    }
  );
}

// ── GET /api/whatsapp/webhook — Meta verification challenge ──────────────
export function verifyWebhook(req: Request, res: Response): void {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === runtime.waVerifyToken()) {
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
  console.log("[whatsapp] Incoming webhook payload:", JSON.stringify(req.body));
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

  // ── Mark incoming message as read (blue ticks ✓✓) & send typing indicator animation ──
  if (messageId) {
    WhatsAppService.sendTypingIndicator(messageId).catch(() => {});
  }

  // ── Check if sender is a service engineer first ──
  const cleanFrom = from.replace(/\D/g, "");
  
  const allEngineers = await prisma.user.findMany({
    where: { role: "service_engineer" },
    select: { id: true, firstName: true, whatsappNumber: true },
  });
  
  const engineer = allEngineers.find(e => {
    if (!e.whatsappNumber) return false;
    const cleanDb = e.whatsappNumber.replace(/\D/g, "");
    
    if (cleanDb.length >= 10 && cleanFrom.length >= 10) {
      return cleanDb.slice(-10) === cleanFrom.slice(-10);
    }
    return cleanDb === cleanFrom;
  });

  // Handle location shares (native WhatsApp location button)
  if (msg.type === "location") {
    const location = msg.location as Record<string, unknown> | undefined;
    const lat = location?.latitude;
    const lng = location?.longitude;
    const locName = location?.name ? String(location.name).trim() : "";
    const locAddr = location?.address ? String(location.address).trim() : "";
    if (typeof lat === "number" && typeof lng === "number") {
      const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const locationText = locAddr || locName ? `📍 Location Shared:\n${locName ? locName + '\n' : ''}${locAddr ? locAddr + '\n' : ''}${mapUrl}` : `📍 ${mapUrl}`;
      if (engineer) {
        await routeEngineerMessage(from, locationText, engineer);
        return;
      }
      const allDealers = await prisma.user.findMany({
        where: { role: "dealer" },
        select: { id: true, firstName: true, whatsappNumber: true },
      });
      const dealer = allDealers.find(d => {
        if (!d.whatsappNumber) return false;
        const cleanDb = d.whatsappNumber.replace(/\D/g, "");
        if (cleanDb.length >= 10 && cleanFrom.length >= 10) {
          return cleanDb.slice(-10) === cleanFrom.slice(-10);
        }
        return cleanDb === cleanFrom;
      });
      if (dealer) {
        await handleDealerWhatsAppMessage(from, locationText, dealer);
        return;
      }
      let savedMessage = null;
      savedMessage = await prisma.simulateMessage.create({
        data: { phoneNumber: from, role: "user", content: locationText },
      });
      const { io } = await import("../lib/socket");
      if (io) {
        io.to("customer_support").emit("support-chat:message", { phoneNumber: from, message: savedMessage });
      }
      const session = await prisma.conversationSession.findFirst({
        where: { phoneNumber: from },
        orderBy: { updatedAt: "desc" },
      });
      if (session?.isBotPaused) return;
      const result = await SimulateService.handleMessage(from, locationText);
      await deliverBotReply(from, result);
      return;
    }
    await WhatsAppService.sendMessage(from, "⚠️ Could not read your location. Please try again or type/paste a Google Maps link.");
    return;
  }

  // Handle image uploads
  if (msg.type === "image") {
    if (engineer) {
      await handleEngineerImage(from, msg, engineer);
    } else {
      await handleCustomerImage(from, msg);
    }
    return;
  }

  // Process text, audio/voice, and interactive (button/list reply) messages
  let text = "";
  if (msg.type === "text") {
    text = String((msg.text as Record<string, unknown>)?.body ?? "").trim();
  } else if (msg.type === "audio" || msg.type === "voice") {
    const audioObj = (msg.audio || msg.voice) as Record<string, unknown> | undefined;
    const mediaId = String(audioObj?.id ?? "");
    if (mediaId) {
      console.log(`[whatsapp] Downloading voice note audio (mediaId: ${mediaId})...`);
      const audioBuffer = await WhatsAppService.downloadMediaBuffer(mediaId);
      if (audioBuffer) {
        try {
          text = await transcribeAudioWithGroq(audioBuffer, "voicenote.ogg");
          console.log(`[whatsapp] Transcribed voice note from ${from}: "${text}"`);
        } catch (e) {
          console.error("[whatsapp] Voice note transcription failed:", e);
        }
      }
    }
    if (!text) {
      await WhatsAppService.sendMessage(
        from,
        "⚠️ Sorry, I could not transcribe your voice note clearly. Please try typing your issue in text.",
      );
      return;
    }
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
      "⚠️ Sorry, I can only process text or voice note messages. Please type or send a voice note.",
    );
    return;
  }

  if (engineer) {
    await routeEngineerMessage(from, text, engineer);
    return;
  }

  // ── Check if sender is a dealer ──
  const allDealers = await prisma.user.findMany({
    where: { role: "dealer" },
    select: { id: true, firstName: true, whatsappNumber: true },
  });

  const dealer = allDealers.find(d => {
    if (!d.whatsappNumber) return false;
    const cleanDb = d.whatsappNumber.replace(/\D/g, "");
    if (cleanDb.length >= 10 && cleanFrom.length >= 10) {
      return cleanDb.slice(-10) === cleanFrom.slice(-10);
    }
    return cleanDb === cleanFrom;
  });

  if (dealer) {
    await handleDealerWhatsAppMessage(from, text, dealer);
    return;
  }

  // ── Customer flow — existing FSM ──

  // Persist user message
  let savedMessage = null;
  if (text) {
    savedMessage = await prisma.simulateMessage.create({
      data: { phoneNumber: from, role: "user", content: text },
    });

    // Bump session activity timestamp (updatedAt) for live dashboards
    const touchSession = await prisma.conversationSession.findFirst({
      where: { phoneNumber: from },
      orderBy: { updatedAt: "desc" },
    });
    if (touchSession) {
      await prisma.conversationSession.update({
        where: { id: touchSession.id },
        data: { metadata: (touchSession.metadata as object) ?? {} },
      });
    }
    
    // Broadcast the new user message to the dashboard
    const { io } = await import("../lib/socket");
    if (io) {
      io.to("customer_support").emit("support-chat:message", {
        phoneNumber: from,
        message: savedMessage,
      });
    }
  }

  // Check if chatbot is paused
  const session = await prisma.conversationSession.findFirst({
    where: { phoneNumber: from },
    orderBy: { updatedAt: "desc" },
  });

  if (session?.isBotPaused) {
    // Bot is paused, don't run the FSM. Human is watching.
    return;
  }

  // Run through FSM
  const result = await SimulateService.handleMessage(from, text);

  await deliverBotReply(from, result);
}

/** Unifies engineer command routing for real webhook + simulator chat */
export async function routeEngineerMessage(
  from: string,
  text: string,
  engineer: { id: string; firstName: string }
): Promise<void> {
  const trimmed = text.trim();

  if (trimmed.startsWith("ENG_PHOTO:")) {
    const parts = trimmed.split(":");
    const ticketNumber = parts[1];
    const filename = parts[2];

    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber, assignedEngineerId: engineer.id },
    });
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }

    const { type } = await attachWorkReportPhoto(ticket.id, engineer.id, filename);
    if (type === "reached") {
      await handleReachedPhotoAttached(from, engineer, ticketNumber);
    } else if (type === "finished") {
      await handleFinishedPhotoAttached(from, engineer, ticketNumber);
    } else {
      await handleNormalPhotoAttached(from, engineer, ticketNumber);
    }
    return;
  }

  await handleEngineerWhatsAppMessage(from, text, engineer, async (f, t, eng) => {
    if (t.toUpperCase().trim() === "TROUBLESHOOT") {
      await prisma.troubleshootingSession.deleteMany({
        where: { phoneNumber: f, status: "ACTIVE" },
      });

      const issues = await prisma.documentIssue.findMany({
        where: { isActive: true, audience: { in: ["engineer", "customer", "both"] } },
        select: { problemType: true }
      });

      const activeCategories = new Map<string, string>(); // prefix -> name

      issues.forEach(iss => {
        if (iss.problemType.toLowerCase().startsWith("chatbot")) return;
        const { prefix, name } = extractProductFromTag(iss.problemType);
        activeCategories.set(prefix, name);
      });

      if (activeCategories.size === 0) {
        await sendEngineerMessage(f, `⚠️ No troubleshooting guides available right now.`);
        return;
      }

      const categoryList = Array.from(activeCategories.entries()).map(([prefix, name]) => ({
        id: `ENG_TS_PROD:${prefix}`,
        title: name.slice(0, 24),
      }));

      await sendEngineerMessage(
        f,
        `🔍 *Troubleshoot Mode*\n\nPlease select the product:`,
        undefined,
        {
          buttonText: "Select Product",
          rows: categoryList.slice(0, 10)
        }
      );
      return;
    }

    if (t.startsWith("ENG_TS_PROD:")) {
      const prefix = t.replace("ENG_TS_PROD:", "").trim();
      const { name: categoryName } = extractProductFromTag(prefix);

      await prisma.troubleshootingSession.deleteMany({
        where: { phoneNumber: f, status: "ACTIVE" },
      });

      await prisma.troubleshootingSession.create({
        data: {
          phoneNumber: f,
          serialNumber: "ENGINEER",
          problemType: `__PENDING_PROD__${prefix}`,
          currentStep: 0,
          status: "ACTIVE",
        },
      });

      await sendIssuesList(f, prefix, 0, categoryName);
      return;
    }

    if (t.startsWith("ENG_TS_PAGE:")) {
      const parts = t.split(":");
      const prefix = parts[1];
      const page = parseInt(parts[2] ?? "0", 10) || 0;
      const { name: categoryName } = extractProductFromTag(prefix);
      await sendIssuesList(f, prefix, page, categoryName);
      return;
    }

    if (t.startsWith("ENG_TS_ISSUE:")) {
      const issueId = t.replace("ENG_TS_ISSUE:", "").trim();
      const template = await prisma.documentIssue.findUnique({
        where: { id: issueId },
        include: { steps: { orderBy: { stepNumber: "asc" } } },
      });

      if (!template || template.steps.length === 0) {
        await sendEngineerMessage(f, `⚠️ No steps found for this issue.`);
        return;
      }

      let activeSession = await prisma.troubleshootingSession.findFirst({
        where: { phoneNumber: f, status: "ACTIVE" },
      });

      if (!activeSession) {
        activeSession = await prisma.troubleshootingSession.create({
          data: {
            phoneNumber: f,
            serialNumber: "ENGINEER",
            problemType: template.problemType,
            currentStep: 1,
            status: "ACTIVE",
          },
        });
      } else {
        await prisma.troubleshootingSession.update({
          where: { id: activeSession.id },
          data: { problemType: template.problemType, currentStep: 1 },
        });
      }

      const steps = template.steps;
      await sendEngineerMessage(
        f,
        `🔍 *${template.title}*\n\n` +
        `🔧 *Step 1 of ${steps.length}:*\n` +
        `--------------------\n` +
        `✓ ${steps[0].stepContent}\n` +
        `--------------------\n\n` +
        `Did this resolve the issue?`,
        [
          { id: "ENG_YES",  title: "✅ Resolved" },
          ...(steps.length > 1 ? [{ id: "ENG_NEXT", title: "➡️ Next Step" }] : []),
          { id: "CANCEL",   title: "❌ Cancel" },
        ],
      );
      await sendMatchingRdVideo(f, template.title);
      return;
    }

    const activeSession = await prisma.troubleshootingSession.findFirst({
      where: { phoneNumber: f, status: "ACTIVE" },
    });
    if (activeSession) {
      await handleEngineerTroubleshootStep(f, t, eng, activeSession);
    }
  });
}

/** Persist and send the FSM reply; video links go in a separate text message. */
async function deliverBotReply(to: string, result: SimulateReply): Promise<void> {
  if (!result.message) return;

  const botMessage = await prisma.simulateMessage.create({
    data: { phoneNumber: to, role: "bot", content: result.message },
  });

  // Broadcast bot message
  const { io } = await import("../lib/socket");
  if (io) {
    io.to("customer_support").emit("support-chat:message", {
      phoneNumber: to,
      message: botMessage,
    });
  }

  if (result.images?.length) {
    for (const img of result.images) {
      await WhatsAppService.sendImage(to, img.url, img.caption);
    }
  }

  if (result.list?.rows?.length) {
    const sent = await WhatsAppService.sendInteractiveList(to, result.message, result.list.buttonText, result.list.rows);
    if (!sent) {
      console.warn("[whatsapp] Interactive list delivery failed — falling back to plain text");
      await WhatsAppService.sendMessage(to, result.message);
    }
  } else if (result.buttons?.length) {
    const sent = await WhatsAppService.sendInteractiveButtons(to, result.message, result.buttons);
    if (!sent) {
      console.warn("[whatsapp] Interactive buttons delivery failed — falling back to plain text");
      await WhatsAppService.sendMessage(to, result.message);
    }
  } else {
    await WhatsAppService.sendMessage(to, result.message);
  }

  if (result.followUpMessage) {
    const followUp = await prisma.simulateMessage.create({
      data: { phoneNumber: to, role: "bot", content: result.followUpMessage },
    });
    
    if (io) {
      io.to("customer_support").emit("support-chat:message", {
        phoneNumber: to,
        message: followUp,
      });
    }
    
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
    await sendEngineerMessage(
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

  // ── Phase 1: Engineer just picked a product — wait for number ─────────
  if (session.problemType.startsWith("__PENDING_PROD__")) {
    const prefix = session.problemType.replace("__PENDING_PROD__", "");
    
    const issues = await prisma.documentIssue.findMany({
      where: { 
        isActive: true, 
        audience: { in: ["engineer", "both"] },
        problemType: { startsWith: prefix }
      },
      orderBy: { title: "asc" }
    });
    
    if (issues.length === 0) {
       await sendEngineerMessage(from, `⚠️ Product session expired. Type TROUBLESHOOT to restart.`);
       return;
    }
    
    const selectedIndex = parseInt(text.trim(), 10) - 1;
    
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= issues.length) {
      await sendEngineerMessage(from, `⚠️ Please reply with a valid number from 1 to ${issues.length}.`);
      return;
    }
    
    const selectedIssue = issues[selectedIndex];
    
    const template = await prisma.documentIssue.findUnique({
      where: { id: selectedIssue.id },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    if (!template || template.steps.length === 0) {
      await sendEngineerMessage(from, `⚠️ No steps found for this issue.`);
      return;
    }

    const steps = template.steps;
    await prisma.troubleshootingSession.update({
      where: { id: session.id },
      data: { problemType: template.problemType, currentStep: 1 },
    });

    await sendEngineerMessage(
      from,
      `🔍 *${template.title}*\n\n` +
      `🔧 *Step 1 of ${steps.length}:*\n` +
      `--------------------\n` +
      steps[0].stepContent + "\n" +
      `--------------------\n\n` +
      `Did this resolve the issue?`,
      [
        { id: "ENG_YES",  title: "✅ Resolved" },
        ...(steps.length > 1 ? [{ id: "ENG_NEXT", title: "➡️ Next Step" }] : []),
        { id: "CANCEL",   title: "❌ Cancel" },
      ],
    );
    await sendMatchingRdVideo(from, template.title);
    return;
  }

  // ── Phase 2: Mid-session — handle YES / NEXT ───────────────────────────
  if (upper === "ENG_YES" || upper === "1") {
    await prisma.troubleshootingSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED" },
    });
    await sendEngineerMessage(
      from,
      `` +
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
      await sendEngineerMessage(from, `⚠️ Template not found. Session ended.`);
      return;
    }

    const nextStep = session.currentStep + 1;
    if (nextStep > template.steps.length) {
      // All steps exhausted
      await prisma.troubleshootingSession.update({
        where: { id: session.id },
        data: { status: "ESCALATED" },
      });
      await sendEngineerMessage(
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
    await sendEngineerMessage(
      from,
      `🔧 *Step ${nextStep} of ${template.steps.length}:*\n` +
      `--------------------\n` +
      `✓ ${step.stepContent}\n` +
      `--------------------\n\n` +
      `Did this resolve the issue?`,
      [
        { id: "ENG_YES",  title: "✅ Resolved" },
        ...(nextStep < template.steps.length ? [{ id: "ENG_NEXT", title: "➡️ Next Step" }] : []),
        { id: "CANCEL",   title: "❌ Cancel" },
      ],
    );
    return;
  }

  // Unrecognised input during a session — first check if it's an AI training video query
  try {
    const matchedVideos = await searchTrainingVideos(text.trim());
    if (matchedVideos.length > 0) {
      const videoList = matchedVideos
        .map((v) => `▶️ *${v.title}*\n${v.youtubeUrl}`)
        .join("\n\n");
      await sendEngineerMessage(
        from,
        `📺 *Training Videos matching "${text.trim()}":*\n\n${videoList}`,
      );
      // Wait briefly so messages arrive in order
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error("[whatsapp] Training video search error during troubleshoot:", err);
  }

  // Re-show current step
  const template = await prisma.documentIssue.findUnique({
    where: { problemType: session.problemType },
    include: { steps: { where: { stepNumber: session.currentStep }, take: 1 } },
  });
  const stepContent = template?.steps[0]?.stepContent ?? "Step not found.";
  await sendEngineerMessage(
    from,
    `Please choose an option for *Step ${session.currentStep}:*\n\n✓ ${stepContent}`,
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
    await sendEngineerMessage(from, "⚠️ Could not read the image. Please try again.");
    return;
  }

  if (!WhatsAppService.isConfigured()) {
    await sendEngineerMessage(from, "⚠️ WhatsApp media download is not configured on this server.");
    return;
  }

  try {
    // Step 1: Resolve media URL from Meta Graph API
    const metaUrlRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${runtime.waAccessToken()}` } },
    );
    if (!metaUrlRes.ok) throw new Error(`Media URL fetch failed: ${metaUrlRes.status}`);
    const metaUrlJson = (await metaUrlRes.json()) as { url?: string; mime_type?: string };
    const downloadUrl = metaUrlJson.url;
    const mimeType    = metaUrlJson.mime_type ?? "image/jpeg";
    if (!downloadUrl) throw new Error("No download URL in Meta response");

    // Step 2: Download the image binary
    const imgRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${runtime.waAccessToken()}` },
    });
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Step 3: Save to disk
    const ext      = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-wa.${ext}`;
    const dir      = path.resolve(__dirname, "../../uploads/work-reports");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);

    // Step 4: Determine target ticket
    let targetTicket = null;

    if (caption) {
      targetTicket = await prisma.ticket.findFirst({
        where: { ticketNumber: caption, assignedEngineerId: engineer.id, status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] } },
      });
    }

    if (!targetTicket) {
      const activeTn = getActiveTicket(from);
      if (activeTn) {
        targetTicket = await prisma.ticket.findFirst({
          where: { ticketNumber: activeTn, assignedEngineerId: engineer.id, status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] } },
        });
      }
    }

    if (!targetTicket) {
      const activeTickets = await prisma.ticket.findMany({
        where: { assignedEngineerId: engineer.id, status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] } },
        select: { id: true, ticketNumber: true }
      });
      if (activeTickets.length === 1) {
        targetTicket = activeTickets[0];
      }
    }

    if (targetTicket) {
      // Auto-attach
      const { type, ticketNumber } = await attachWorkReportPhoto(targetTicket.id, engineer.id, filename);
      if (type === "reached") {
        await handleReachedPhotoAttached(from, engineer, ticketNumber);
      } else if (type === "finished") {
        await handleFinishedPhotoAttached(from, engineer, ticketNumber);
      } else {
        await handleNormalPhotoAttached(from, engineer, ticketNumber);
      }
      return;
    }

    // Fallback: ask for ticket if no caption and multiple/no active tickets resolved
    if (caption) {
      await sendEngineerMessage(from, `❌ Ticket *${caption}* not found. The photo was saved, but not attached.`);
      return;
    }

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
      await sendEngineerMessage(from, "⚠️ Photo saved, but you have no active tickets to attach it to.");
      return;
    }

    await sendEngineerMessage(
      from,
      "Photo received! Which ticket does this belong to?",
      undefined,
      {
        buttonText: "Select Ticket",
        rows: tickets.map((t) => ({
          id: `ENG_PHOTO:${t.ticketNumber}:${filename}`,
          title: t.ticketNumber.replace(/^TKT-\d{8}-/i, "").slice(0, 24) || t.ticketNumber.slice(0, 24),
          description: `Attach to ${t.customer?.firstName ?? "Customer"} (${t.status})`,
        })),
      }
    );
  } catch (e: unknown) {
    console.error("[whatsapp] handleEngineerImage error:", e);
  }
}

async function handleCustomerImage(
  from: string,
  msg: Record<string, unknown>,
): Promise<void> {
  const image = msg.image as Record<string, unknown> | undefined;
  const mediaId = String(image?.id ?? "");
  const caption = String(image?.caption ?? "").trim();

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
      { headers: { Authorization: `Bearer ${runtime.waAccessToken()}` } },
    );
    if (!metaUrlRes.ok) throw new Error(`Media URL fetch failed: ${metaUrlRes.status}`);
    const metaUrlJson = (await metaUrlRes.json()) as { url?: string; mime_type?: string };
    const downloadUrl = metaUrlJson.url;
    const mimeType    = metaUrlJson.mime_type ?? "image/jpeg";
    if (!downloadUrl) throw new Error("No download URL in Meta response");

    // Step 2: Download the image binary
    const imgRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${runtime.waAccessToken()}` },
    });
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Step 3: Save to disk
    const ext      = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-wa.${ext}`;
    const dir      = path.resolve(__dirname, "../../uploads/customer-uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);

    const relativeUrl = `/uploads/customer-uploads/${filename}`;

    // Step 4: Persist message in database
    const savedMessage = await prisma.simulateMessage.create({
      data: {
        phoneNumber: from,
        role: "user",
        content: caption || "Sent an image",
        mediaUrl: relativeUrl,
      },
    });

    // Step 5: Broadcast to support dashboard
    const { io } = await import("../lib/socket");
    if (io) {
      io.to("customer_support").emit("support-chat:message", {
        phoneNumber: from,
        message: savedMessage,
      });
    }

    // Step 6: Check if chatbot is paused
    const session = await prisma.conversationSession.findFirst({
      where: { phoneNumber: from },
      orderBy: { updatedAt: "desc" },
    });

    if (session?.isBotPaused) {
      // Bot is paused, support agent will handle manually. Do not respond.
      return;
    }

    // If chatbot is active, respond with a helpful notification
    await WhatsAppService.sendMessage(
      from,
      "📸 Thank you for sharing the photo! Our support team has been notified. You can also describe your issue in detail or type *MENU* to see options."
    );

  } catch (e: unknown) {
    console.error("[whatsapp] handleCustomerImage error:", e);
    await WhatsAppService.sendMessage(from, "⚠️ Failed to process the image. Please try again.");
  }
}
