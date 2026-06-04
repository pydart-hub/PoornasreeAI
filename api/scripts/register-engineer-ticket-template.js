/**
 * Create or verify Meta template engineer_ticket_assigned.
 * Run: node scripts/register-engineer-ticket-template.js
 * Requires api/.env: WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.error("Missing api/.env");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const TEMPLATE_NAME = process.env.WA_ENGINEER_TICKET_TEMPLATE || "engineer_ticket_assigned";
const LANG = process.env.WA_ENGINEER_TICKET_TEMPLATE_LANG || "en";

const BODY_TEXT =
  "Hi {{1}}, a new service ticket is assigned to you.\n\n" +
  "Ticket: {{2}}\n" +
  "Customer: {{3}}\n" +
  "Phone: {{4}}\n" +
  "Location: {{5}}\n" +
  "Issue: {{6}}\n\n" +
  "Open WhatsApp and use the buttons in the next message, or type TICKETS.";

async function graphGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  loadEnv();
  const token = process.env.WA_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error("Set WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID in api/.env");
    process.exit(1);
  }

  const phoneRes = await graphGet(
    `https://graph.facebook.com/v21.0/${phoneId}?fields=whatsapp_business_account`,
    token,
  );
  const wabaId = phoneRes.json?.whatsapp_business_account?.id;
  if (!wabaId) {
    console.error("Could not resolve WhatsApp Business Account ID:", JSON.stringify(phoneRes.json));
    process.exit(1);
  }
  console.log("WABA ID:", wabaId);

  const listRes = await graphGet(
    `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`,
    token,
  );
  const existing = (listRes.json?.data || []).find(
    (t) => t.name === TEMPLATE_NAME && (t.language === LANG || t.language === "en_US"),
  );
  if (existing) {
    console.log(`Template "${TEMPLATE_NAME}" already exists — status: ${existing.status}`);
    process.exit(0);
  }

  const payload = {
    name: TEMPLATE_NAME,
    language: LANG,
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: BODY_TEXT,
        example: {
          body_text: [
            [
              "Mhd Ijaz",
              "TKT-20260604-3EC7B4F0",
              "Aph",
              "+919048740132",
              "Chembra · 679304",
              "Vibro: not working",
            ],
          ],
        },
      },
    ],
  };

  const createRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const createBody = await createRes.json().catch(() => ({}));
  console.log("Create status:", createRes.status);
  console.log(JSON.stringify(createBody, null, 2));
  if (!createRes.ok) {
    process.exit(1);
  }
  console.log(`Submitted "${TEMPLATE_NAME}" for Meta review. Check WhatsApp Manager → Message templates.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
