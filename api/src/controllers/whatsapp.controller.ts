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
import type { SimulateReply } from "../services/simulate.service";
import { transcribeAudioWithGroq } from "../services/groq.service";
import { touchSupportActivity } from "../services/support-inactivity.service";
import {
  isServiceEngineer,
  handleEngineerMessage,
  handleEngineerMedia,
} from "../services/engineer-whatsapp.service";

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
    await WhatsAppService.sendMessage(to, `⚠️ No troubleshooting guides found for ${categoryName}.`);
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

  await WhatsAppService.sendInteractiveList(
    to,
    `🔍 *Troubleshoot - ${categoryName}*\n\nPlease select the issue (showing ${startNum}-${endNum} of ${totalNum}):`,
    "Select Issue",
    rows,
  );
}

// ── GET /api/whatsapp/webhook — Meta verification challenge ──────────────
export function verifyWebhook(req: Request, res: Response): void {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const validTokens = [
    runtime.waVerifyToken(),
    process.env.WA_VERIFY_TOKEN,
    "poornasree_ai_webhook_secret_2026",
    "poornasree_secret_123",
    "poornasree_ai_secret_2026",
  ].filter(Boolean) as string[];

  if (mode === "subscribe" && validTokens.includes(String(token).trim())) {
    console.log(`[whatsapp] Webhook verified successfully by Meta with token "${token}" ✅`);
    res.status(200).send(String(challenge));
    return;
  }

  console.warn(`[whatsapp] Webhook verification failed ❌. Received: "${token}", expected one of: ${validTokens.join(", ")}`);
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
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          await handleSingleMessage(msg);
        }
      }

      const statuses = change?.value?.statuses;
      if (Array.isArray(statuses)) {
        for (const statusObj of statuses) {
          await handleDeliveryStatus(statusObj);
        }
      }
    }
  }
}

async function handleDeliveryStatus(statusObj: Record<string, unknown>): Promise<void> {
  const waMsgId = String(statusObj.id || "");
  const status = String(statusObj.status || "").toLowerCase(); // "sent" | "delivered" | "read" | "failed"
  const recipientId = String(statusObj.recipient_id || "");
  const pricingCategory = (statusObj.pricing as Record<string, unknown> | undefined)?.category;
  const errors = statusObj.errors as Array<Record<string, unknown>> | undefined;
  const errorMessage = errors?.[0] ? String(errors[0].title || errors[0].message || JSON.stringify(errors[0])) : undefined;

  if (!waMsgId) return;

  try {
    const updateData: Record<string, unknown> = {};
    if (["sent", "delivered", "read", "failed"].includes(status)) {
      updateData.status = status;
    }
    if (pricingCategory && typeof pricingCategory === "string") {
      updateData.category = pricingCategory.toLowerCase();
    }
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.whatsAppMessageLog.updateMany({
        where: { waMessageId: waMsgId },
        data: updateData,
      });
      console.log(`[whatsapp] Status updated for wamid=${waMsgId} → ${status} (${recipientId})`);
    }
  } catch (err) {
    console.warn(`[whatsapp] Failed to update delivery status for ${waMsgId}:`, err);
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

  // ── Stale Message Protection ─────────────────────────────────────────────
  // If an incoming message was sent more than 10 minutes ago, it is a delayed
  // webhook retry from Meta (e.g. re-delivered after server maintenance/restart).
  // Acknowledge it to Meta (via 200 OK) but skip processing to avoid sending
  // unexpected, delayed auto-replies.
  const rawTimestamp = Number(msg.timestamp);
  if (!isNaN(rawTimestamp) && rawTimestamp > 0) {
    const ageSeconds = Math.floor(Date.now() / 1000) - rawTimestamp;
    const MAX_MESSAGE_AGE_SECONDS = 10 * 60; // 10 minutes
    if (ageSeconds > MAX_MESSAGE_AGE_SECONDS) {
      console.log(
        `[whatsapp] Skipping stale message ${messageId} from ${from} (sent ${Math.round(ageSeconds / 60)}m ago > 10m threshold)`,
      );
      return;
    }
  }

  // ── Mark incoming message as read (blue ticks ✓✓) & send typing indicator animation (non-blocking) ──
  if (messageId) {
    WhatsAppService.sendTypingIndicator(messageId).catch(() => {});
  }

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
      const result = await SimulateService.handleMessage(from, locationText);
      await deliverBotReply(from, result);
      return;
    }
    await WhatsAppService.sendMessage(from, "⚠️ Could not read your location. Please try again or type/paste a Google Maps link.");
    return;
  }

  // Check if sender is a registered service engineer
  const engineer = await isServiceEngineer(from);

  // Handle media uploads (image, video, audio/voice, document)
  if (msg.type === "image" || msg.type === "video" || msg.type === "audio" || msg.type === "voice" || msg.type === "document") {
    if (engineer && (msg.type === "image" || msg.type === "document")) {
      await handleEngineerMedia(from, msg, engineer);
      return;
    }
    await handleCustomerMedia(from, msg);
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

  // ── If sender is a Service Engineer, route to Engineer WhatsApp Engine ──
  if (engineer) {
    await handleEngineerMessage(from, text, engineer);
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

  const upperText = (text || "").toUpperCase().trim();
  const isSupportTrigger =
    upperText === "4" ||
    upperText === "SPEAK_SUPPORT" ||
    upperText === "TALK_AGENT" ||
    upperText === "TALK_TO_SUPPORT" ||
    upperText === "SPEAK_TO_SUPPORT" ||
    upperText === "SUPPORT" ||
    upperText.includes("SPEAK TO SUPPORT") ||
    upperText.includes("TALK TO SUPPORT") ||
    upperText.includes("TALK TO AGENT") ||
    upperText.includes("TALK TO HUMAN") ||
    upperText.includes("CONNECT TO SUPPORT") ||
    upperText.includes("CUSTOMER SUPPORT") ||
    upperText.includes("CUSTOMER CARE");

  if (session?.isBotPaused && !isSupportTrigger) {
    // Bot is paused and this is regular customer chat, don't run the FSM. Human is watching.
    // Refresh the 2-minute inactivity countdown so support agent has time to respond.
    touchSupportActivity(from);
    return;
  }

  // Send status: read immediately (blue ticks ✓✓) & typing indicator animation
  if (messageId) {
    WhatsAppService.sendTypingIndicator(messageId).catch(() => {});
  }

  const result = await SimulateService.handleMessage(from, text, messageId);

  await deliverBotReply(from, result);
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
    const uniqueImages = Array.from(
      new Map(result.images.map((img) => [img.url, img])).values()
    );
    for (const img of uniqueImages) {
      await WhatsAppService.sendImage(to, img.url, img.caption);
    }
  }

  if (result.ctaButton) {
    const sent = await WhatsAppService.sendCtaUrlButton(
      to,
      result.message,
      result.ctaButton.displayText,
      result.ctaButton.url,
      result.ctaButton.headerText,
      result.ctaButton.footerText,
    );
    if (!sent) {
      console.warn("[whatsapp] CTA button delivery failed — falling back to plain text with link");
      await WhatsAppService.sendMessage(
        to,
        `${result.message}\n\n👉 *${result.ctaButton.displayText}:*\n${result.ctaButton.url}`,
      );
    }
  } else if (result.listMenu?.rows?.length) {
    const sent = await WhatsAppService.sendInteractiveList(to, result.message, result.listMenu.buttonText, result.listMenu.rows);
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



async function handleCustomerMedia(
  from: string,
  msg: Record<string, unknown>,
): Promise<void> {
  const mediaObj = (msg.image || msg.video || msg.audio || msg.voice || msg.document) as Record<string, unknown> | undefined;
  const mediaId = String(mediaObj?.id ?? "");
  const caption = String(mediaObj?.caption ?? "").trim();
  const mediaType = String(msg.type ?? "image");

  if (!mediaId) {
    await WhatsAppService.sendMessage(from, "⚠️ Could not read the attachment. Please try again.");
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
    const mimeType    = metaUrlJson.mime_type ?? (mediaType === "video" ? "video/mp4" : mediaType === "audio" || mediaType === "voice" ? "audio/ogg" : "image/jpeg");
    if (!downloadUrl) throw new Error("No download URL in Meta response");

    // Step 2: Download the media binary
    const imgRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${runtime.waAccessToken()}` },
    });
    if (!imgRes.ok) throw new Error(`Media download failed: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Step 3: Save to disk
    let ext = "bin";
    if (mimeType.includes("png")) ext = "png";
    else if (mimeType.includes("webp")) ext = "webp";
    else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = "jpg";
    else if (mimeType.includes("mp4")) ext = "mp4";
    else if (mimeType.includes("webm")) ext = "webm";
    else if (mimeType.includes("ogg")) ext = "ogg";
    else if (mimeType.includes("mp3")) ext = "mp3";
    else if (mimeType.includes("pdf")) ext = "pdf";

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
        content: caption || `Sent a ${mediaType}`,
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

    // Step 6: Get or create active session matching phone number (with or without 91 prefix)
    const session = await SimulateService.getOrCreateSession(from);

    if (session?.isBotPaused) {
      return;
    }

    // If session is in complaint media state or confirmation, route media URL directly to SimulateService!
    if (session && (session.state === "AWAIT_COMPLAINT_MEDIA" || session.state === "CONFIRM_REGISTER_TICKET")) {
      console.log(`[whatsapp] User ${from} (session ${session.phoneNumber}) uploaded media in state ${session.state}: ${relativeUrl}`);
      const result = await SimulateService.handleMessage(from, relativeUrl);
      await deliverBotReply(from, result);
      return;
    }

    // Default media acknowledgement
    await WhatsAppService.sendMessage(
      from,
      `📎 Thank you for sharing your ${mediaType}! Our support team has been notified. You can also describe your issue in detail or type *MENU* to see options.`
    );

  } catch (e: unknown) {
    console.error("[whatsapp] Error processing media:", e);
    await WhatsAppService.sendMessage(from, "⚠️ Failed to process media upload. Please try again.");
  }
}
