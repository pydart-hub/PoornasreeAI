// ── WhatsApp Cloud API Service ────────────────────────────────────────────
// Sends outbound messages via Meta's Graph API v21.0.
// Uses native fetch (Node 18+) — no extra dependencies.

import path from "path";
import sharp from "sharp";
import { runtime } from "./runtime-config.service";
import prisma from "../lib/prisma";

const API_VERSION = "v21.0";

/** Returns true when WhatsApp Cloud API credentials are configured (DB or env). */
export function isConfigured(): boolean {
  return !!(runtime.waPhoneNumberId() && runtime.waAccessToken() && runtime.waVerifyToken());
}

/**
 * Normalize to WhatsApp Cloud API format (digits only, no +).
 * Indian 10-digit mobiles → prefix 91.
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export type SendTemplateOptions = {
  name: string;
  languageCode: string;
  /** Body {{1}}, {{2}}, … in order */
  bodyParameters: string[];
  /** Optional header image URL for templates with format: IMAGE */
  headerImageUrl?: string;
  /** Optional Meta media ID (e.g. from uploadMediaToMeta) for guaranteed direct delivery */
  headerMediaId?: string;
  /** Dynamic URL button suffix (template URL ends with {{1}}) */
  urlButtonIndex?: number;
  urlButtonParameter?: string;
};

type WaApiResponse = {
  error?: { message?: string; code?: number; error_subcode?: number };
  messages?: { id: string }[];
};

async function postWhatsAppMessage(
  to: string,
  payload: Record<string, unknown>,
): Promise<WaApiResponse | null> {
  const isStatusUpdate = to === "status_update";
  let normalized = "";
  if (!isStatusUpdate) {
    normalized = normalizeWhatsappNumber(to) ?? to.replace(/\D/g, "");
    if (!normalized) {
      console.warn(`[whatsapp] Invalid recipient: ${to}`);
      return null;
    }
  }

  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping send");
    return null;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${runtime.waPhoneNumberId()}/messages`;
  try {
    const jsonBody = isStatusUpdate
      ? { messaging_product: "whatsapp", ...payload }
      : { messaging_product: "whatsapp", to: normalized, ...payload };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.waAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonBody),
    });
    const body = (await res.json().catch(() => ({}))) as WaApiResponse;
    const waMsgId = body.messages?.[0]?.id || null;
    const isFailed = !res.ok || !!body.error || (!isStatusUpdate && !waMsgId);

    // Asynchronously log outbound message telemetry and billing metadata
    if (!isStatusUpdate && normalized) {
      const msgType = String(payload.type || "text");
      const templateName = payload.type === "template" ? String((payload.template as any)?.name || "") : null;
      
      let category = "service";
      let costInr = 0.35;
      let costUsd = 0.0040;

      if (templateName) {
        const lowerTpl = templateName.toLowerCase();
        if (lowerTpl.includes("promo") || lowerTpl.includes("market") || lowerTpl.includes("campaign") || lowerTpl.includes("branding")) {
          category = "marketing";
          costInr = 0.88;
          costUsd = 0.0102;
        } else if (lowerTpl.includes("otp") || lowerTpl.includes("auth") || lowerTpl.includes("verify")) {
          category = "authentication";
          costInr = 0.12;
          costUsd = 0.0014;
        } else {
          category = "utility";
          costInr = 0.12;
          costUsd = 0.0014;
        }
      }

      prisma.whatsAppMessageLog.create({
        data: {
          waMessageId: waMsgId,
          recipientPhone: normalized,
          direction: "outbound",
          messageType: msgType,
          templateName: templateName || null,
          category,
          status: isFailed ? "failed" : "sent",
          costInr,
          costUsd,
          errorMessage: body.error ? (body.error.message || JSON.stringify(body.error)).slice(0, 500) : null,
        },
      }).catch((logErr) => {
        console.warn("[whatsapp] Failed to record message log:", logErr?.message || logErr);
      });
    }

    if (!res.ok || body.error) {
      console.error(`[whatsapp] API error (${res.status}) → ${to}:`, JSON.stringify(body));
      return body;
    }
    if (!isStatusUpdate && !body.messages?.[0]?.id) {
      console.warn(`[whatsapp] No message id → ${normalized}:`, JSON.stringify(body));
      return body;
    }
    if (isStatusUpdate) {
      console.log(`[whatsapp] Status/typing updated for msg=${payload.message_id || "N/A"}`);
    } else {
      console.log(`[whatsapp] Sent → ${normalized} id=${body.messages?.[0]?.id}`);
    }
    return body;
  } catch (err) {
    console.error(`[whatsapp] Network error → ${to}:`, (err as Error).message);
    if (!isStatusUpdate && normalized) {
      prisma.whatsAppMessageLog.create({
        data: {
          recipientPhone: normalized,
          direction: "outbound",
          messageType: String(payload.type || "text"),
          status: "failed",
          errorMessage: (err as Error).message,
        },
      }).catch(() => {});
    }
    return null;
  }
}

/**
 * Upload a media file directly to Meta Cloud API (WhatsApp Business Account).
 * Returns the uploaded Meta media_id string, which can be passed directly
 * into template headers or image messages without needing an external public URL.
 * Automatically converts WebP and other non-standard image formats into standard JPEG
 * to ensure 100% compatibility with Meta WhatsApp Cloud API.
 */
export async function uploadMediaToMeta(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string | null> {
  if (!isConfigured()) {
    console.warn("[whatsapp] WhatsApp Cloud API not configured — cannot upload media");
    return null;
  }

  let uploadBuffer = buffer;
  let uploadMime = mimeType;
  let uploadName = filename;

  // Meta Cloud API template headers only accept image/jpeg and image/png.
  // WebP and other formats are rejected by Meta with error 131053 ("WebP image uploads are not currently supported").
  // Convert any non-PNG image or WebP to high-quality JPEG:
  if (mimeType.startsWith("image/") && (mimeType === "image/webp" || (mimeType !== "image/png" && mimeType !== "image/jpeg"))) {
    try {
      uploadBuffer = await sharp(buffer)
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      uploadMime = "image/jpeg";
      uploadName = `${path.parse(filename).name || "image"}.jpg`;
      console.log(`[whatsapp] Auto-converted ${mimeType} to image/jpeg for Meta Cloud API (${uploadBuffer.length} bytes)`);
    } catch (convErr) {
      console.warn("[whatsapp] Image conversion to JPEG failed, using original:", convErr);
    }
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${runtime.waPhoneNumberId()}/media`;
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", uploadMime);
    form.append("file", new Blob([uploadBuffer as any], { type: uploadMime }), uploadName);

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.waAccessToken()}` },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: any };
    if (!res.ok || json.error) {
      console.error("[whatsapp] Meta Media Upload failed:", JSON.stringify(json));
      return null;
    }
    console.log(`[whatsapp] Successfully uploaded media to Meta: id=${json.id}`);
    return json.id || null;
  } catch (err) {
    console.error("[whatsapp] Error uploading media to Meta:", err);
    return null;
  }
}

/**
 * Send an approved WhatsApp message template (required for first outbound contact).
 * Template must exist in Meta Business Manager with matching name, language, and variables.
 */
export async function sendTemplate(to: string, options: SendTemplateOptions): Promise<boolean> {
  const components: Record<string, unknown>[] = [];

  if (options.headerMediaId) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            id: options.headerMediaId,
          },
        },
      ],
    });
  } else if (options.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: options.headerImageUrl,
          },
        },
      ],
    });
  }

  if (options.bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: options.bodyParameters.map((text) => ({
        type: "text",
        text,
      })),
    });
  }

  if (
    options.urlButtonParameter !== undefined &&
    options.urlButtonIndex !== undefined
  ) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(options.urlButtonIndex),
      parameters: [{ type: "text", text: options.urlButtonParameter }],
    });
  }

  const result = await postWhatsAppMessage(to, {
    type: "template",
    template: {
      name: options.name,
      language: { code: options.languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  });
  return !!result?.messages?.[0]?.id;
}

/** Mark an incoming customer message as "read" in WhatsApp (blue checkmarks ✓✓). */
export async function markMessageAsRead(messageId: string): Promise<boolean> {
  if (!messageId || !isConfigured()) return false;
  const result = await postWhatsAppMessage("status_update", {
    status: "read",
    message_id: messageId,
  });
  return !!result;
}

/** Show animated WhatsApp typing indicator ("typing...") to the customer. */
export async function sendTypingIndicator(messageId: string): Promise<boolean> {
  if (!messageId || !isConfigured()) return false;
  const result = await postWhatsAppMessage("status_update", {
    status: "read",
    message_id: messageId,
    typing_indicator: {
      type: "text",
    },
  });
  return !!result;
}

/** Send a plain-text WhatsApp message. `to` should be international digits (e.g. 919876543210). */
export async function sendMessage(to: string, text: string): Promise<boolean> {
  if (!text) return false;
  if (text.length > 3800) {
    // Split into chunks along newline boundaries to stay well within Meta's 4096 char limit
    const chunks: string[] = [];
    let current = "";
    for (const line of text.split("\n")) {
      if ((current + "\n" + line).length > 3800) {
        if (current) chunks.push(current.trim());
        current = line;
      } else {
        current = current ? current + "\n" + line : line;
      }
    }
    if (current) chunks.push(current.trim());
    let allOk = true;
    for (const chunk of chunks) {
      const res = await postWhatsAppMessage(to, {
        type: "text",
        text: { body: chunk, preview_url: true },
      });
      if (!res?.messages?.[0]?.id) allOk = false;
    }
    return allOk;
  }

  const result = await postWhatsAppMessage(to, {
    type: "text",
    text: { body: text, preview_url: true },
  });
  return !!result?.messages?.[0]?.id;
}

/** WhatsApp interactive button action. Max 3 buttons total (incl. location). */
export type WaButtonAction =
  | { type: "reply"; reply: { id: string; title: string } }
  | { type: "location" };

/** WhatsApp interactive reply-button shape. Max 3 buttons, title max 20 chars. */
export type WaButton =
  | { id: string; title: string }
  | { id: "__location__"; title: string; isLocation: true };

/** Send an interactive button message via WhatsApp Cloud API. Returns true if sent successfully. */
export async function sendInteractiveButtons(
  to: string,
  body: string,
  buttons: WaButton[],
): Promise<boolean> {
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendInteractiveButtons");
    return false;
  }

  // Meta Cloud API enforces a strict max 1024 chars on interactive.body.text
  let interactiveBody = body;
  if (body.length > 1000) {
    // 1. Send the full detailed message first via plain text (supports up to 4096 chars)
    await sendMessage(to, body);
    // 2. Present the interactive buttons with a concise prompt
    interactiveBody = "Did the above steps resolve your issue? Please select an option below 👇";
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${runtime.waPhoneNumberId()}/messages`;

  const actions: WaButtonAction[] = buttons.slice(0, 3).map((b) => {
    if ("isLocation" in b && b.isLocation) {
      return { type: "location" };
    }
    const cleanTitle = Array.from(b.title).slice(0, 20).join("");
    return {
      type: "reply",
      reply: { id: b.id, title: cleanTitle },
    };
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.waAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: interactiveBody },
          action: { buttons: actions },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Interactive send failed (${res.status}):`, JSON.stringify(err));
      return false;
    } else {
      console.log(`[whatsapp] Sent buttons → ${to}: ${interactiveBody.slice(0, 60)}…`);
      return true;
    }
  } catch (err) {
    console.error(`[whatsapp] Network error sending buttons to ${to}:`, (err as Error).message);
    return false;
  }
}

/** WhatsApp interactive list-row shape. Title max 24 chars. */
export type WaListRow = { id: string; title: string; description?: string };

/** Send an interactive list message via WhatsApp Cloud API. Max 10 rows. Returns true if sent successfully. */
export async function sendInteractiveList(
  to: string,
  body: string,
  buttonText: string,
  rows: WaListRow[],
): Promise<boolean> {
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendInteractiveList");
    return false;
  }

  // Meta Cloud API enforces a strict max 1024 chars on interactive.body.text
  let interactiveBody = body;
  if (body.length > 1000) {
    await sendMessage(to, body);
    interactiveBody = "Please select an option from the list below 👇";
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${runtime.waPhoneNumberId()}/messages`;

  try {
    const cleanButtonText = Array.from(buttonText).slice(0, 20).join("");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.waAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: interactiveBody },
          action: {
            button: cleanButtonText,
            sections: [
              {
                title: "Options",
                rows: rows.slice(0, 10).map((r) => ({
                  id: r.id,
                  title: Array.from(r.title).slice(0, 24).join(""),
                  ...(r.description ? { description: Array.from(r.description).slice(0, 72).join("") } : {}),
                })),
              },
            ],
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[whatsapp] List send failed (${res.status}):`, JSON.stringify(err));
      return false;
    } else {
      console.log(`[whatsapp] Sent list → ${to}: ${body.slice(0, 60)}…`);
      return true;
    }
  } catch (err) {
    console.error(`[whatsapp] Network error sending list to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Send an image message via WhatsApp Cloud API. */
export async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendImage");
    return;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${runtime.waPhoneNumberId()}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.waAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
          link: imageUrl,
          ...(caption ? { caption: caption.slice(0, 1024) } : {}),
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Image send failed (${res.status}):`, JSON.stringify(err));
      console.error(`[whatsapp] Image URL was: ${imageUrl}`);
    } else {
      const body = await res.json().catch(() => ({}));
      console.log(`[whatsapp] Sent image → ${to}: url=${imageUrl} caption=${caption?.slice(0, 40)}`);
      console.log(`[whatsapp] Image send response:`, JSON.stringify(body));
    }
  } catch (err) {
    console.error(`[whatsapp] Network error sending image to ${to}:`, (err as Error).message);
  }
}

/** Send a video message via WhatsApp Cloud API. */
export async function sendVideo(
  to: string,
  videoUrl: string,
  caption?: string,
): Promise<void> {
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendVideo");
    return;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${runtime.waPhoneNumberId()}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.waAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "video",
        video: {
          link: videoUrl,
          ...(caption ? { caption: caption.slice(0, 1024) } : {}),
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Video send failed (${res.status}):`, JSON.stringify(err));
      console.error(`[whatsapp] Video URL was: ${videoUrl}`);
    } else {
      const body = await res.json().catch(() => ({}));
      console.log(`[whatsapp] Sent video → ${to}: url=${videoUrl} caption=${caption?.slice(0, 40)}`);
    }
  } catch (err) {
    console.error(`[whatsapp] Network error sending video to ${to}:`, (err as Error).message);
  }
}

// ── Meta Approved Message Templates ─────────────────────────────────────────

export async function sendTicketAssignedTemplate(
  to: string,
  customerName: string,
  ticketNumber: string,
  machineModel: string,
  engineerName: string,
  engineerPhone: string,
): Promise<boolean> {
  return sendTemplate(to, {
    name: "ticket_assigned_v1",
    languageCode: "en",
    bodyParameters: [customerName, ticketNumber, machineModel, engineerName, engineerPhone],
  });
}

export async function sendTicketStatusUpdateTemplate(
  to: string,
  customerName: string,
  ticketNumber: string,
  statusMessage: string,
  engineerName: string,
): Promise<boolean> {
  return sendTemplate(to, {
    name: "ticket_status_update_v1",
    languageCode: "en",
    bodyParameters: [customerName, ticketNumber, statusMessage, engineerName],
  });
}

export async function sendServiceCompletedTemplate(
  to: string,
  customerName: string,
  ticketNumber: string,
): Promise<boolean> {
  return sendTemplate(to, {
    name: "service_completed_v1",
    languageCode: "en",
    bodyParameters: [customerName, ticketNumber],
  });
}

export async function sendProductReleaseTemplate(
  to: string,
  customerName: string,
  productName: string,
  keySpecs: string,
): Promise<boolean> {
  return sendTemplate(to, {
    name: "new_product_release_v1",
    languageCode: "en",
    bodyParameters: [customerName, productName, keySpecs],
  });
}

export async function sendSpecialOfferTemplate(
  to: string,
  customerName: string,
  offerDetails: string,
  expiryDate: string,
): Promise<boolean> {
  return sendTemplate(to, {
    name: "special_offer_broadcast_v1",
    languageCode: "en",
    bodyParameters: [customerName, offerDetails, expiryDate],
  });
}

/** Download a media file (e.g. voice note audio / image) from Meta Cloud API */
export async function downloadMediaBuffer(mediaId: string): Promise<Buffer | null> {
  if (!isConfigured()) return null;
  try {
    const metaUrl = `https://graph.facebook.com/${API_VERSION}/${mediaId}`;
    const infoRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${runtime.waAccessToken()}` },
    });
    if (!infoRes.ok) return null;
    const info = (await infoRes.json()) as { url?: string };
    if (!info.url) return null;

    const fileRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${runtime.waAccessToken()}` },
    });
    if (!fileRes.ok) return null;
    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(`[whatsapp] Failed to download media ${mediaId}:`, (err as Error).message);
    return null;
  }
}
