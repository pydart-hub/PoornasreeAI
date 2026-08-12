// ── WhatsApp Cloud API Service ────────────────────────────────────────────
// Sends outbound messages via Meta's Graph API v21.0.
// Uses native fetch (Node 18+) — no extra dependencies.

import { runtime } from "./runtime-config.service";

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
  const normalized = normalizeWhatsappNumber(to) ?? to.replace(/\D/g, "");
  if (!normalized) {
    console.warn(`[whatsapp] Invalid recipient: ${to}`);
    return null;
  }
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping send");
    return null;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${runtime.waPhoneNumberId()}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.waAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", to: normalized, ...payload }),
    });
    const body = (await res.json().catch(() => ({}))) as WaApiResponse;
    if (!res.ok || body.error) {
      console.error(`[whatsapp] API error (${res.status}) → ${normalized}:`, JSON.stringify(body));
      return body;
    }
    if (!body.messages?.[0]?.id) {
      console.warn(`[whatsapp] No message id → ${normalized}:`, JSON.stringify(body));
      return body;
    }
    console.log(`[whatsapp] Sent → ${normalized} id=${body.messages[0].id}`);
    return body;
  } catch (err) {
    console.error(`[whatsapp] Network error → ${to}:`, (err as Error).message);
    return null;
  }
}

/**
 * Send an approved WhatsApp message template (required for first outbound contact).
 * Template must exist in Meta Business Manager with matching name, language, and variables.
 */
export async function sendTemplate(to: string, options: SendTemplateOptions): Promise<boolean> {
  const components: Record<string, unknown>[] = [];

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

/** Mark an incoming customer message as "read" in WhatsApp (blue checkmarks ✓✓) and show animated typing indicator ("typing..."). */
export async function markMessageAsRead(messageId: string): Promise<boolean> {
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

/** Show animated WhatsApp typing indicator ("typing...") to the customer. */
export async function sendTypingIndicator(messageId: string): Promise<boolean> {
  if (!messageId || !isConfigured()) return false;
  return markMessageAsRead(messageId);
}

/** Send a plain-text WhatsApp message. `to` should be international digits (e.g. 919876543210). */
export async function sendMessage(to: string, text: string): Promise<boolean> {
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
          body: { text: body },
          action: { buttons: actions },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Interactive send failed (${res.status}):`, JSON.stringify(err));
      return false;
    } else {
      console.log(`[whatsapp] Sent buttons → ${to}: ${body.slice(0, 60)}…`);
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
          body: { text: body },
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
