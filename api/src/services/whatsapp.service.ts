// ── WhatsApp Cloud API Service ────────────────────────────────────────────
// Sends outbound messages via Meta's Graph API v21.0.
// Uses native fetch (Node 18+) — no extra dependencies.

import { env } from "../config/env";

const API_VERSION = "v21.0";

/** Returns true when all three WhatsApp env vars are configured. */
export function isConfigured(): boolean {
  return !!(env.WA_PHONE_NUMBER_ID && env.WA_ACCESS_TOKEN && env.WA_VERIFY_TOKEN);
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

/** Send a plain-text WhatsApp message. `to` should be international digits (e.g. 919876543210). */
export async function sendMessage(to: string, text: string): Promise<boolean> {
  const normalized = normalizeWhatsappNumber(to) ?? to.replace(/\D/g, "");
  if (!normalized) {
    console.warn(`[whatsapp] Invalid recipient: ${to}`);
    return false;
  }

  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendMessage");
    return false;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalized,
        type: "text",
        text: { body: text, preview_url: false },
      }),
    });

    const body = await res.json().catch(() => ({})) as {
      error?: { message?: string; code?: number };
      messages?: { id: string }[];
    };

    if (!res.ok || body.error) {
      console.error(`[whatsapp] Send failed (${res.status}) → ${normalized}:`, JSON.stringify(body));
      return false;
    }
    if (!body.messages?.[0]?.id) {
      console.warn(`[whatsapp] No message id in response → ${normalized}:`, JSON.stringify(body));
      return false;
    }
    console.log(`[whatsapp] Sent → ${normalized} id=${body.messages[0].id}`);
    return true;
  } catch (err) {
    console.error(`[whatsapp] Network error sending to ${normalized}:`, (err as Error).message);
    return false;
  }
}

/** WhatsApp interactive reply-button shape. Max 3 buttons, title max 20 chars. */
export type WaButton = { id: string; title: string };

/** Send an interactive button message via WhatsApp Cloud API. */
export async function sendInteractiveButtons(
  to: string,
  body: string,
  buttons: WaButton[],
): Promise<void> {
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendInteractiveButtons");
    return;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Interactive send failed (${res.status}):`, JSON.stringify(err));
    } else {
      console.log(`[whatsapp] Sent buttons → ${to}: ${body.slice(0, 60)}…`);
    }
  } catch (err) {
    console.error(`[whatsapp] Network error sending buttons to ${to}:`, (err as Error).message);
  }
}

/** WhatsApp interactive list-row shape. Title max 24 chars. */
export type WaListRow = { id: string; title: string; description?: string };

/** Send an interactive list message via WhatsApp Cloud API. Max 10 rows. */
export async function sendInteractiveList(
  to: string,
  body: string,
  buttonText: string,
  rows: WaListRow[],
): Promise<void> {
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendInteractiveList");
    return;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
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
            button: buttonText.slice(0, 20),
            sections: [
              {
                title: "Options",
                rows: rows.slice(0, 10).map((r) => ({
                  id: r.id,
                  title: r.title.slice(0, 24),
                  ...(r.description ? { description: r.description.slice(0, 72) } : {}),
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
    } else {
      console.log(`[whatsapp] Sent list → ${to}: ${body.slice(0, 60)}…`);
    }
  } catch (err) {
    console.error(`[whatsapp] Network error sending list to ${to}:`, (err as Error).message);
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

  const url = `https://graph.facebook.com/${API_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
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
