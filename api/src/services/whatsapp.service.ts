// ── WhatsApp Cloud API Service ────────────────────────────────────────────
// Sends outbound messages via Meta's Graph API v21.0.
// Uses native fetch (Node 18+) — no extra dependencies.

import { env } from "../config/env";

const API_VERSION = "v21.0";

/** Returns true when all three WhatsApp env vars are configured. */
export function isConfigured(): boolean {
  return !!(env.WA_PHONE_NUMBER_ID && env.WA_ACCESS_TOKEN && env.WA_VERIFY_TOKEN);
}

/** Send a plain-text WhatsApp message to `to` (international format, e.g. 919876543210). */
export async function sendMessage(to: string, text: string): Promise<void> {
  if (!isConfigured()) {
    console.warn("[whatsapp] Not configured — skipping sendMessage");
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
        type: "text",
        text: { body: text, preview_url: false },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Send failed (${res.status}):`, JSON.stringify(err));
    } else {
      console.log(`[whatsapp] Sent → ${to}: ${text.slice(0, 60)}…`);
    }
  } catch (err) {
    console.error(`[whatsapp] Network error sending to ${to}:`, (err as Error).message);
  }
}
