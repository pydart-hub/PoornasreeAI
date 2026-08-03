// ── Groq WhatsApp agent (fully conversational, multilingual, human-like) ──────
// Single-stage: ONE Groq call per message — no catalog gating, no hardcoded fallbacks.
// The agent always responds conversationally in whatever language the customer uses.

import prisma from "../lib/prisma";
import {
  formatSupportContactBlock,
  getWhatsAppSupportSettings,
} from "./chatbotSettings.service";
import { runtime } from "./runtime-config.service";
import {
  getCatalogForRole,
  prefilterCatalog,
  formatCatalogForPrompt,
  type CatalogEntry,
  type CatalogRole,
} from "./training-catalog.service";
import {
  fetchMachineBySerial,
  type PasstestMachine,
} from "./machine.service";
import {
  groqChat,
  groqFastModel,
  groqAgentModel,
  isGroqConfigured,
} from "./groq.service";
import * as WhatsAppService from "./whatsapp.service";

// ── Types ────────────────────────────────────────────────────────────────────
export type AgentReplyButton = { id: string; title: string };
export type AgentReply = {
  message: string;
  buttons?: AgentReplyButton[];
  followUpMessage?: string;
};

const HISTORY_LIMIT = 12;
const LANG_CONTEXT_LIMIT = 6;

type AgentMeta = {
  language?: string;
  customerName?: string;
  customerPhone?: string;
  agentMode?: boolean;
  lastCatalogIds?: string[];
  customerMachines?: string[];
  lastLangHints?: string[]; // recent detected languages to stabilize
};

// ── Exported helpers ─────────────────────────────────────────────────────────
export function isGroqChatbotEnabled(): boolean {
  if (!isGroqConfigured()) return false;
  return runtime.chatbotMode() === "groq";
}

// ── Boilerplate helpers ──────────────────────────────────────────────────────
function makeReply(
  message: string,
  buttons?: AgentReplyButton[],
  followUpMessage?: string,
): AgentReply {
  return { message, buttons, followUpMessage };
}

// ── Language detection ───────────────────────────────────────────────────────
const LANG_CODE: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
};

const LANG_GREETING: Record<string, string> = {
  en: "Hello",
  hi: "Namaste",
  ta: "Vanakkam",
  te: "Namaskaram",
  kn: "Namaskara",
  ml: "Namaskaram",
  bn: "Namaskar",
};

function detectLanguage(text: string): string {
  const hasDevanagari = /[ऀ-ॿ]/.test(text);
  const hasTamil = /[஀-௿]/.test(text);
  const hasTelugu = /[ఀ-౿]/.test(text);
  const hasKannada = /[ಀ-೿]/.test(text);
  const hasMalayalam = /[ഀ-ൿ]/.test(text);
  const hasBengali = /[ঀ-৿]/.test(text);
  if (hasDevanagari) return "hi";
  if (hasTamil) return "ta";
  if (hasTelugu) return "te";
  if (hasKannada) return "kn";
  if (hasMalayalam) return "ml";
  if (hasBengali) return "bn";

  const lower = text.toLowerCase();
  const tanglish = ["enna", "sariya", "illa", "vanga", "poren", "theriyuma", "romba", "kasu", "da", "di"];
  const manglish = ["ente", "ningalude", "cheyyam", "pokam", "sari", "illatha", "engane", "athe"];
  const telugu = ["endi", "ra", "ayya", "cheppu", "ema", "kadu", "thini", "vellu"];
  const hinglish = [
    "bhai", "bhaiya", "kya", "nai", "haan", "nahi", "thik",
    "theek", "samajh", "aap", "tum", "mera", "aapka", "chahiye",
    "madad", "samasya", "kharab", "kaam", "abhi", "thoda",
    "kuch", "karwa", "bhejo", "bhej",
  ];

  if (tanglish.some((w) => lower.includes(w))) return "ta";
  if (manglish.some((w) => lower.includes(w))) return "ml";
  if (telugu.some((w) => lower.includes(w))) return "te";
  if (hinglish.some((w) => lower.includes(w))) return "en-hinglish";
  return "en";
}

function detectLanguageStrict(text: string): string {
  // Same detection but never returns "en-hinglish" — treats it as "hi"
  const raw = detectLanguage(text);
  return raw === "en-hinglish" ? "hi" : raw;
}

function stabilizeLanguage(meta: AgentMeta, detected: string): string {
  // If detected is a non-English language, always use it (user switched)
  if (detected && detected !== "en") return detected;

  // If detected is English but session has a non-English language,
  // check if the message contains ANY non-English text
  const sessionLang = meta.language;
  if (sessionLang && sessionLang !== "en" && detected === "en") {
    // Message detected as English but session was Tamil/Hindi/etc.
    // This could mean the user switched to English or just used a roman word.
    // Stick with session language unless the message is clearly long English.
    // For now, let's switch to English — the user likely typed in English.
    return "en";
  }

  // Default: use detected language
  return detected;
}

// ── Company knowledge (from poornasree.com) ───────────────────────────────────
const COMPANY_KNOWLEDGE = `
ABOUT POORNASREE EQUIPMENTS:
- Founded in 2011, headquartered in Kochi, Kerala
- India's leading milk testing equipment brand — "Precision Meets Innovation"
- ~100 employees, 10 departments, monthly production capacity of 2,500 units
- ISO 9001:2015 certified, CE, ZED, IMEX standards
- Managing Partner: Mr. Babumon Gopi (~20 years in Electronics & Embedded Systems)
- Three entities: Poornasree Equipments (HQ), Poornasree Designs (R&D), Harisree Enterprises (service)

PRODUCTS:
1. LactoSure ECO series — ultrasonic milk analyzers (fastest in India)
   Models: LactoSure Eco, Eco-S, Eco V, Eco-SV, Eco-D-V4, Eco-CP, Eco-SV-V4
   Parameters measured: Fat, SNF, CLR, Protein, Lactose, Added Salt, Added Water, Temperature
   Features: Compact, portable, user-friendly, built-in battery option, solar-powered variant available
2. VIBRO — Ultrasonic Stirrers (standalone or accessory for analyzers)
3. LactoSure DPS-T — Data Processing Unit (compatible with all analyzer models)
4. External Display — compatible with all analyzer models and DPU
5. Receipt Printer — for printing analysis reports

SERVICE & SUPPORT:
- 24-hour solution policy
- 30 field engineers distributed nationwide (Harisree Enterprises)
- All brands serviced, special focus on Ksheera brand
- Genuine spares and sophisticated tools
- Round-the-clock Customer Care
- Dealer network across B2B, B2C, Cooperative, Corporate, and Export channels

CONTACT:
- Head Office (Kochi): 13/191-C, Mannoor Road, Maradu P.O, Ernakulam – 682304
  Tel: +91 484 4859291 | Mobile: +91 94009 61291, +91 80757 90438
- Design Center (Kochi): Harigovindam (KRPS 274), Kattithara Sahakarana Road, Maradu P.O, PIN 682304
- Delhi Office: Shop No. 12, First Floor, Co-Operative Cold Storage Market, Siyana Road, Bulandshahr, UP 203001 | Mobile: +91 96057 57816
- Email/Website: poornasree.com`;

// ── Quick-reply shortcuts ────────────────────────────────────────────────────
const SHORTCUT_BOOK = new Set([
  "BOOK_SERVICE", "2", "BOOK SERVICE", "BOOK A SERVICE",
  "RAISE COMPLAINT", "REGISTER COMPLAINT", "book", "service",
]);

const SHORTCUT_SUPPORT = new Set([
  "TALK_AGENT", "4", "SPEAK TO SUPPORT", "TALK TO AGENT",
  "TALK TO HUMAN", "HUMAN", "SUPPORT", "agent", "support",
  "human", "talk to support",
]);

const SHORTCUT_MENU = new Set([
  "MENU", "HI", "HELLO", "HEY", "START",
  "NAMASTE", "VANAKKAM",
]);

function isBookShortcut(text: string): boolean {
  const t = text.toUpperCase().trim();
  return SHORTCUT_BOOK.has(t) || SHORTCUT_BOOK.has(text);
}

function isSupportShortcut(text: string): boolean {
  const t = text.toUpperCase().trim();
  return SHORTCUT_SUPPORT.has(t) || SHORTCUT_SUPPORT.has(text);
}

function isMenuShortcut(text: string): boolean {
  const t = text.toUpperCase().trim();
  return SHORTCUT_MENU.has(t);
}

// ── Menu options per language ────────────────────────────────────────────────
const MENU_OPTIONS: Record<string, { title: string; id: string }[]> = {
  en: [
    { id: "products", title: "📋 Products" },
    { id: "troubleshoot", title: "🔧 Troubleshoot" },
    { id: "service", title: "🛠️ Book Service" },
    { id: "support", title: "💬 Talk to us" },
    { id: "info", title: "ℹ️ Company Info" },
  ],
  hi: [
    { id: "products", title: "📋 उत्पाद" },
    { id: "troubleshoot", title: "🔧 समस्या निवारण" },
    { id: "service", title: "🛠️ सर्विस बुक करें" },
    { id: "support", title: "💬 हमसे बात करें" },
    { id: "info", title: "ℹ️ कंपनी जानकारी" },
  ],
  ta: [
    { id: "products", title: "📋 தயாரிப்புகள்" },
    { id: "troubleshoot", title: "🔧 பிரச்சனை தீர்வு" },
    { id: "service", title: "🛠️ சேவை பதிவு" },
    { id: "support", title: "💬 எங்களுடன் பேசு" },
    { id: "info", title: "ℹ️ நிறுவன விவரம்" },
  ],
  te: [
    { id: "products", title: "📋 ఉత్పత్తులు" },
    { id: "troubleshoot", title: "🔧 సమస్య పరిష్కారం" },
    { id: "service", title: "🛠️ సేవా బుక్" },
    { id: "support", title: "💬 మాత్రతో మాట్లాడు" },
    { id: "info", title: "ℹ️ కంపెనీ వివరం" },
  ],
  ml: [
    { id: "products", title: "📋 പ്രോഡക്റ്റുകൾ" },
    { id: "troubleshoot", title: "🔧 പ്രശ്ന പരിഹാരം" },
    { id: "service", title: "🛠️ സേവന ബുക്ക്" },
    { id: "support", title: "💬 ഞങ്ങളുമായി സംസാരിക്കുക" },
    { id: "info", title: "ℹ️ കമ്പനി വിവരം" },
  ],
  kn: [
    { id: "products", title: "📋 ಉತ್ಪನ್ನಗಳು" },
    { id: "troubleshoot", title: "🔧 ಸಮಸ್ಯೆ ಪರಿಹಾರ" },
    { id: "service", title: "🛠️ ಸೇವೆ ಬುಕ್" },
    { id: "support", title: "💬 ನಮ್ಗೆ ಮಾತನಾಡಿ" },
    { id: "info", title: "ℹ️ ಕಂಪನಿ ಮಾಹಿತಿ" },
  ],
  bn: [
    { id: "products", title: "📋 পণ্য" },
    { id: "troubleshoot", title: "🔧 সমস্যা সমাধান" },
    { id: "service", title: "🛠️ সার্ভিস বুক" },
    { id: "support", title: "💬 আমাদের কথা বলুন" },
    { id: "info", title: "ℹ️ কোম্পানি তথ্য" },
  ],
  "en-hinglish": [
    { id: "products", title: "📋 Products" },
    { id: "troubleshoot", title: "🔧 Problem fix" },
    { id: "service", title: "🛠️ Service book karo" },
    { id: "support", title: "💬 Support se baat karo" },
    { id: "info", title: "ℹ️ Company info" },
  ],
};

function menuButtons(lang: string): AgentReplyButton[] {
  const options = MENU_OPTIONS[lang] || MENU_OPTIONS["en"];
  return options.map((o) => ({ id: o.id, title: o.title }));
}

// ── DB helpers ───────────────────────────────────────────────────────────────
async function getOrCreateAgentSession(phoneNumber: string) {
  const existing = await prisma.conversationSession.findFirst({
    where: { phoneNumber, state: { notIn: ["COMPLETED"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  const last = await prisma.conversationSession.findFirst({
    where: { phoneNumber },
    orderBy: { updatedAt: "desc" },
  });

  return prisma.conversationSession.create({
    data: {
      phoneNumber,
      state: "AGENT_CHAT",
      isBotPaused: last?.isBotPaused ?? false,
      supportAgentId: last?.supportAgentId ?? null,
      metadata: { agentMode: true },
    },
  });
}

async function updateAgentSession(
  id: string,
  state: string,
  meta: AgentMeta,
): Promise<void> {
  await prisma.conversationSession.update({
    where: { id },
    data: { state, metadata: meta as object },
  });
}

async function loadRecentHistory(phoneNumber: string): Promise<string> {
  const rows = await prisma.simulateMessage.findMany({
    where: { phoneNumber },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .map((r: { role: string; content: string }) =>
      r.role === "user" ? "Customer" : r.role === "support" ? "Agent" : "Bot",
    )
    .join("\n");
}

async function notifyLiveSupport(
  phoneNumber: string,
  meta: AgentMeta,
): Promise<void> {
  const support = getWhatsAppSupportSettings();
  const customerName = (meta.customerName || "Not Provided").replace(/[\n\r\t]/g, " ").trim().slice(0, 100);
  const customerPhone = (meta.customerPhone || phoneNumber).replace(/[\n\r\t]/g, " ").trim().slice(0, 50);

  const notificationText =
    `🚨 *Live Chat Request*\n\n` +
    `👤 *Name:* ${customerName}\n📱 *Phone:* ${customerPhone}\n\n` +
    `Please log into the dashboard, pause the chatbot for this user, and chat manually.`;

  try {
    const sentTemplate = await WhatsAppService.sendTemplate(
      (support as any).supportPhone,
      {
        name: "engineer_ticket_assigned",
        languageCode: "en",
        bodyParameters: [
          "Support Team",
          "Live Chat Request",
          customerName,
          customerPhone,
          "WhatsApp Chatbot",
          "Wants to connect with support. Please pause chatbot and reply manually.",
        ],
      },
    );
    if (!sentTemplate) {
      await WhatsAppService.sendMessage((support as any).supportPhone, notificationText);
    }
  } catch (err) {
    console.error("[whatsapp-agent] Failed to notify support:", err);
  }
}

// ── Customer & machine context enrichment ────────────────────────────────────
async function enrichCustomerContext(phoneNumber: string): Promise<{
  customerName: string;
  language: string;
  machineSummary: string;
}> {
  let customerName = "";
  let language = "en";

  let machines: PasstestMachine[] = [];
  try {
    const url = "https://passtest.poornasreecloud.com/api/machines?all=true";
    const resp = await fetch(url, { timeout: 15000 } as any);
    const json = (await resp.json()) as { success?: boolean; data?: any[] };
    if (json?.success && Array.isArray(json.data)) {
      const cleanPhone = phoneNumber.replace(/[^0-9]/g, "").slice(-10);
      machines = json.data.filter((m: any) => {
        const custPhone = (m.CustomerPhone ?? m.customer_phone ?? m.phone ?? "").toString();
        const digits = custPhone.replace(/[^0-9]/g, "").slice(-10);
        return digits === cleanPhone;
      });
    }
  } catch {
    // Machine lookup is optional
  }

  let machineSummary = "No machines on record.";
  if (machines.length > 0) {
    machineSummary = machines
      .map(
        (m) =>
          `${m.m_model || m.product_code || "Machine"} (S/N: ${m.serial_no})` +
          (m.test_result ? ` — Status: ${m.test_result}` : "") +
          (m.tested_at ? ` — Last test: ${new Date(m.tested_at).toLocaleDateString("en-IN")}` : ""),
      )
      .join("\n");
  }

  return { customerName, language, machineSummary };
}

// ── Catalog loading (for troubleshooting) ────────────────────────────────────
async function loadRelevantCatalog(
  text: string,
  role: CatalogRole,
): Promise<CatalogEntry[]> {
  const all = await getCatalogForRole(role);
  if (all.length === 0) return [];
  // Prefilter for speed — get top 20 matches by keyword overlap
  return prefilterCatalog(all, text, 20);
}

async function loadEngineerCatalog(text: string): Promise<CatalogEntry[]> {
  // Engineers get BOTH customer + service catalogs (not just service)
  const customer = await getCatalogForRole("customer");
  const service = await getCatalogForRole("service");
  const merged = [...customer, ...service];
  // Dedupe by id
  const seen = new Set<string>();
  const deduped = merged.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  if (deduped.length === 0) return [];
  return prefilterCatalog(deduped, text, 30);
}

// ── The single unified AI call ──────────────────────────────────────────────
async function aiReply(
  customerMessage: string,
  history: string,
  language: string,
  customerName: string,
  machines: string,
  catalogContext: string,
  isEngineer: boolean,
  isNewUser: boolean,
): Promise<string> {
  const lang = language || "en";
  const langName = LANG_CODE[lang] || lang;
  const greeting = LANG_GREETING[lang] || "Hello";

  const personaName = isEngineer ? "Ravi" : "Priya";
  const personaRole = isEngineer
    ? "a senior Poornasree field-service mentor helping a technician/engineer"
    : isNewUser
      ? "a friendly Poornasree onboarding guide helping a new user get started with their milk testing equipment"
      : "a warm Poornasree Equipments customer-support agent on WhatsApp";

  const personaStyle = isEngineer
    ? "Practical, direct, experienced — like a senior engineer guiding a junior. Step-by-step, numbered troubleshooting."
    : isNewUser
      ? "Welcoming, encouraging, patient — like a friendly guide walking someone through their first experience. Simple language, clear steps, positive tone."
      : "Casual, friendly, natural — like a real person texting. Not a FAQ bot.";

  const catalogSection = catalogContext
    ? `\n\nTRAINING DOCUMENTS (use these for troubleshooting, product info, setup steps):\n${catalogContext.slice(0, 5000)}`
    : "";

  const machineSection = machines && machines !== "No machines on record."
    ? `\n\nCUSTOMER'S REGISTERED MACHINES:\n${machines}`
    : "";

  // Build the system prompt — language enforcement is FIRST
  let systemPrefix: string;
  if (lang === "en") {
    systemPrefix = `You must reply ONLY in English. Never use Hindi, Tamil, Telugu, Malayalam, Kannada, or Bengali script.`;
  } else {
    systemPrefix = `⚠️ FIRST AND MOST IMPORTANT RULE: Reply ONLY in ${langName}. Use ${langName} script/words for EVERY word. Do NOT use English or any other language.`;
  }

  const system = `${systemPrefix}

You are ${personaName}, ${personaRole}.
Style: ${personaStyle}
You work for Poornasree Equipments — India's leading milk testing equipment brand since 2011.

Customer's name: ${customerName || "not known yet"}.
${machines && machines !== "No machines on record." ? `Their registered machines:\n${machines}` : ""}

RULES:
- ${isEngineer ? "Give numbered troubleshooting steps (Step 1, Step 2...) with CHECK and ACTION for each." : isNewUser ? "Give simple, welcoming step-by-step guidance. Start with the basics. Encourage the user." : "Keep replies natural — 2-4 short sentences. Sound like a real person, not a bot."}
- Use the training documents below for facts and steps only. Never mention "training documents" or "catalog".
- Never mention "AI", "bot", "LLM", "system", or "context".
- Reference their specific machines when relevant.
- ${isEngineer ? "Be precise and technical." : isNewUser ? "Be patient and clear. If they don't understand, offer to connect them to support." : "Only discuss Poornasree products/services. Redirect off-topic politely."}
- ${customerName && lang !== "en" ? `Use the customer's name ${customerName} naturally.` : ""}
- Give actionable next steps: what to check, what to do.
- ${isNewUser ? "If they have a complaint or issue, warmly offer to register a service request for them." : ""}`;

  const user =
    `COMPANY INFO (for reference):\n${COMPANY_KNOWLEDGE}\n` +
    `${catalogSection}${machineSection}\n\n` +
    `CONVERSATION HISTORY:\n${history || "(first message)"}\n\n` +
    `CUSTOMER MESSAGE: ${customerMessage}\n\n` +
    `Now write your ${langName} reply as ${personaName}:`;

  try {
    const reply = await groqChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: groqAgentModel(),
        temperature: 0.4,
        maxTokens: isEngineer ? 800 : 500,
        timeoutMs: 45_000,
      },
    );
    const trimmed = (reply || "").trim();
    if (trimmed.length > 5) return trimmed;
  } catch {
    // fall through
  }

  // Hardcoded fallback in the detected language
  return fallbackReply(lang, customerName, isEngineer);
}

function fallbackReply(lang: string, customerName: string, isEngineer: boolean): string {
  if (isEngineer) {
    return lang === "hi" ? `नमस्ते ${customerName} 👋\n\nमुझे इस मशीन के लिए सटीक सेवा दस्तावेज नहीं मिल रहे हैं। कृपया मशीन का मॉडल नंबर और समस्या का विवरण भेजें, ताकि मैं आपके लिए सही ट्रबलशूटिंग स्टेप्स ढूंढ सकूं।`
      : lang === "ta" ? `வணக்கம் ${customerName} 👋\n\nஇந்த இயந்திரத்திற்கான சேவை ஆவணங்கள் எனக்கு கிடவில்லை. தயாரிப்பு மாதிரி எண் மற்றும் சிக்கலை அனுப்புங்கள், சரியான பழudgeவை நான் உங்களுக்கு கண்டுபிடிப்பேன்.`
      : `Hi ${customerName} 👋\n\nI don't have the exact service docs for this right now. Please send me the machine model number and issue details so I can find the right troubleshooting steps for you.`;
  }

  const namePart = customerName ? `${customerName}! ` : "";
  if (lang === "hi") return `नमस्ते ${namePart}👋\n\nमैं आपकी मदद करने के लिए यहां हूँ। कृपया अपने मशीन का नाम और समस्या बताएं — या नीचे से कोई विकल्प चुनें।`;
  if (lang === "ta") return `வணக்கம் ${namePart}👋\n\nஉங்கள் இயந்திரத்தின் பெயரையும் சிக்கலைयும் சொல்லுங்கள் — அல்லது கீழே ஒரு விருப்பத்தைத் தேர்வு செய்யுங்கள்.`;
  if (lang === "te") return `హలో ${namePart}👋\n\nమీ యంత్రం పేరు మరియు సమస్య చెప్పండి — లేదా కింది ఎంపికను ఎంచుకోండి.`;
  if (lang === "ml") return `ഹലോ ${namePart}👋\n\nനിങ്ങളുടെ മഷീന്റെ പേരും പ്രശ്നവും പറയൂ — അല്ലെങ്കിൽ താഴെ ഒരു ഓപ്ഷൻ തിരഞ്ഞെടുക്കൂ.`;
  if (lang === "kn") return `ಹಲೋ ${namePart}👋\n\nನಿಮ್ಮ ಯಂತ್ರದ ಹೆಸರು ಮತ್ತು ಸಮಸ್ಯೆ ಹೇಳಿ — ಅಥವಾ ಕೆಳಗಿನ ಆಯ್ಕೆಯನ್ನು தேர்ந்தெடுக்கவும்.`;
  if (lang === "bn") return `হ্যালো ${namePart}👋\n\nআপনার মেশনের নাম ও সমস্যা বলুন — বা নিচের একটি অপশন বেছে নিন।`;
  return `Hey ${namePart}👋\n\nTell me your machine name and the issue — or pick an option below.`;
}

// ── Shortcut buttons ─────────────────────────────────────────────────────────
const ACTION_BUTTONS_EN: AgentReplyButton[] = [
  { id: "troubleshoot", title: "🔧 Troubleshoot" },
  { id: "book_service", title: "🛠️ Book Service" },
  { id: "talk_agent", title: "💬 Talk to us" },
];

const ACTION_BUTTONS_HI: AgentReplyButton[] = [
  { id: "troubleshoot", title: "🔧 समस्या निवारण" },
  { id: "book_service", title: "🛠️ सर्विस बुक करें" },
  { id: "talk_agent", title: "💬 हमसे बात करें" },
];

const ACTION_BUTTONS_TA: AgentReplyButton[] = [
  { id: "troubleshoot", title: "🔧 பிரச்சனை தீர்வு" },
  { id: "book_service", title: "🛠️ சேவை பதிவு" },
  { id: "talk_agent", title: "💬 எங்களுடன் பேசு" },
];

function actionButtons(lang: string): AgentReplyButton[] {
  if (lang === "hi") return ACTION_BUTTONS_HI;
  if (lang === "ta") return ACTION_BUTTONS_TA;
  return ACTION_BUTTONS_EN;
}

// ── Public: Customer agent entry ─────────────────────────────────────────────
export async function handleCustomerAgentMessage(
  phoneNumber: string,
  message: string,
): Promise<AgentReply | null> {
  const text = message.trim();
  if (!text) {
    return makeReply(fallbackReply("en", "", false), menuButtons("en"));
  }

  const session = await getOrCreateAgentSession(phoneNumber);
  const meta: AgentMeta = {
    ...((session.metadata as AgentMeta) ?? {}),
    agentMode: true,
  };
  const upper = text.toUpperCase().trim();

  // ── Shortcuts ──────────────────────────────────────────────────────────────
  if (isSupportShortcut(text)) {
    return handleTalkToSupport(phoneNumber, session.id, meta);
  }

  if (isBookShortcut(text)) {
    await updateAgentSession(session.id, "COMPLAINT_ASK_SERIAL", meta);
    // Return a multilingual book-service prompt
    const lang = meta.language || "en";
    const prompts: Record<string, string> = {
      en: "Sure! Let's book a service visit. Please share your machine's serial number — or tap Skip to continue without it.",
      hi: "ज़रूर! सर्विस विजिट बुक करते हैं। कृपया अपने मशीन के सीरियल नंबर साझा करें — या बिना इसे जारी रखने के लिए Skip टैप करें।",
      ta: "நிச்சயம்! ஒரு சேவை வருகையை பதிவு செய்வோம். உங்கள் இயந்திரத்தின் சீரியல் எண்ணைப் பகிரவும் — அல்லது தவிர்ந்து தொடர Skip ஐ அழுத்தவும்.",
    };
    return makeReply(prompts[lang] || prompts["en"], [
      { id: "SKIP", title: "Skip ⏭️" },
      { id: "MENU", title: "Menu 📋" },
    ]);
  }

  // Menu / greeting
  if (isMenuShortcut(text) || text.length <= 5 && /^(hi|hello|hey|hai|namaste|vanakkam|start|menu|হ্যালো|नमस्ते|வணக்கம்)/i.test(text)) {
    await updateAgentSession(session.id, "AGENT_CHAT", meta);
    const lang = meta.language || "en";
    const greetings: Record<string, string> = {
      en: `Hey${meta.customerName ? ` ${meta.customerName}` : ""}! 👋 Welcome to Poornasree Equipments support. I speak English, Hindi, Tamil, Telugu, Malayalam, Kannada, and Bengali. Tell me what's happening with your machine, or pick an option below.`,
      hi: `नमस्ते${meta.customerName ? ` ${meta.customerName}` : ""}! 👋 पूर्णस्री इक्विपमेंट्स के समर्थन में आपका स्वागत है। मैं अंग्रेजी, हिंदी, तमिल, तेलुगु, मलयालम, कन्नड़ और बंगाली बोलता हूँ। अपने मशीन की समस्या बताइए या नीचे से कोई विकल्प चुनें।`,
      ta: `வணக்கம்${meta.customerName ? ` ${meta.customerName}` : ""}! 👋 பூர்ணஸ்ரீ എક்விப்மென்ட்ஸ் ஆதரவில் உங்களை வரவேற்கிறோம். ரஞ்சி, தமிழ், தெலுங்கு, மலையாளம், கன்னடம், வங்காளம் பேசுகிறேன். உங்கள் இயந்திரத்தின் சிக்கலைச் சொல்லுங்கள் அல்லது கீழே ஒரு விருப்பத்தைத் தேர்ந்தெடுக்குங்கள்.`,
    };
    const greeting = greetings[lang] || greetings["en"];
    return makeReply(greeting, menuButtons(lang));
  }

  if (["BYE", "CLOSE", "THANK YOU", "THANKS", "धन्यवाद", "நன்றி"].includes(upper)) {
    await updateAgentSession(session.id, "COMPLETED", {});
    const lang = meta.language || "en";
    const byes: Record<string, string> = {
      en: meta.customerName
        ? `Thank you, ${meta.customerName}! Feel free to message us anytime you need help. Have a great day! 🙏`
        : "Thank you for contacting Poornasree Equipments. Have a great day! 🙏",
      hi: meta.customerName
        ? `धन्यवाद ${meta.customerName}! जब भी आपको मदद चाहिए हमसे संपर्क करें। अच्छा दिन हो! 🙏`
        : "पूर्णस्री इक्विपमेंट्स से संपर्क करने के लिए धन्यवाद। अच्छा दिन हो! 🙏",
      ta: meta.customerName
        ? `நன்றி ${meta.customerName}! எப்போதும் உங்களுக்கு உதவி தேவைப்பட்டால் எங்களை தொடர்பு கொள்ளுங்கள். நலமான நாள்! 🙏`
        : "பூர்ணஸ்ரீ എக்விப்மென்ட்ஸை தொடர்பு கொண்டதற்கு நன்றி. நலமான நாள்! 🙏",
    };
    return makeReply(byes[lang] || byes["en"]);
  }

  // ── Detect language ────────────────────────────────────────────────────────
  const detectedLang = detectLanguageStrict(text);
  const lang = stabilizeLanguage(meta, detectedLang);
  meta.language = lang;

  // Track language hints for stabilization
  meta.lastLangHints = [...(meta.lastLangHints || []).slice(-(LANG_CONTEXT_LIMIT - 1)), detectedLang];

  // ── Load context ───────────────────────────────────────────────────────────
  const rawHistory = await loadRecentHistory(phoneNumber);
  const customerCtx = await enrichCustomerContext(phoneNumber);
  if (!meta.customerName && customerCtx.customerName) {
    meta.customerName = customerCtx.customerName;
  }

  // ── Detect user persona: new_user vs customer vs engineer ──────────────────
  const newUserKeywords = [
    "new user", "first time", "just bought", "newly purchased", "getting started",
    "how to use", "beginner", "novice", "new to", "unbox", "setting up",
    "initial setup", "just received",
  ];
  const isNewUser = newUserKeywords.some((kw) => text.toLowerCase().includes(kw));

  // Detect if user is likely a registered engineer/technician
  const engineerKeywords = [
    "step", "check", "board", "sensor", "voltage", "circuit",
    "replace", "firmware", "calibrate", "diagnostic", "wiring",
    "component", "repair", "fix", "malfunction", "error code",
    "motherboard", "mainboard", "stirrer", "pump", "charger",
    "cotton", "filter", "probe", "ultrasonic", "transducer",
  ];
  const isEngineer = engineerKeywords.some((kw) => text.toLowerCase().includes(kw));

  // ── Load catalog (role-aware) ───────────────────────────────────────────────
  let catalogContext = "";
  if (isEngineer) {
    const catalog = await loadEngineerCatalog(text);
    const companyEntries = await getCatalogForRole("customer");
    const companyBlock = companyEntries
      .filter((e) => e.source === "company")
      .slice(0, 3);
    catalogContext = catalog.length > 0
      ? formatCatalogForPrompt([...catalog, ...companyBlock])
      : formatCatalogForPrompt(companyBlock);
  } else if (isNewUser) {
    const catalog = await loadRelevantCatalog(text, "new_user");
    const companyEntries = await getCatalogForRole("customer");
    const companyBlock = companyEntries
      .filter((e) => e.source === "company")
      .slice(0, 3);
    catalogContext = catalog.length > 0
      ? formatCatalogForPrompt([...catalog, ...companyBlock])
      : formatCatalogForPrompt(companyBlock);
  } else {
    const catalog = await loadRelevantCatalog(text, "customer");
    const companyEntries = await getCatalogForRole("customer");
    const companyBlock = companyEntries
      .filter((e) => e.source === "company")
      .slice(0, 3);
    catalogContext = catalog.length > 0
      ? formatCatalogForPrompt([...catalog, ...companyBlock])
      : formatCatalogForPrompt(companyBlock);
  }

  // ── Generate AI reply ──────────────────────────────────────────────────────
  const reply = await aiReply(
    text,
    rawHistory,
    lang,
    meta.customerName || "",
    customerCtx.machineSummary,
    catalogContext,
    isEngineer,
    isNewUser,
  );

  await updateAgentSession(session.id, "AGENT_CHAT", meta);

  // Smart buttons based on conversation state
  const isFirstMsg = !rawHistory || rawHistory.length < 30;
  if (isFirstMsg) {
    return makeReply(reply, actionButtons(lang));
  }

  return makeReply(reply, [{ id: "menu", title: "📋 Menu" }, { id: "talk_agent", title: "💬 Agent" }]);
}

// ── Public: Engineer agent entry ─────────────────────────────────────────────
export async function handleEngineerAgentMessage(
  engineerFirstName: string,
  message: string,
  phoneNumber: string,
): Promise<string | null> {
  const text = message.trim();
  if (!text || text.length < 2) return null;

  const rawHistory = await loadRecentHistory(phoneNumber);
  const catalog = await loadEngineerCatalog(text);
  const catalogContext = catalog.length > 0 ? formatCatalogForPrompt(catalog) : "";

  const reply = await aiReply(
    text,
    rawHistory,
    "en",
    engineerFirstName,
    "",
    catalogContext,
    true,
    false,
  );

  return `Hi ${engineerFirstName} 👋\n\n${reply}`;
}

// ── Support notification helper ──────────────────────────────────────────────
async function handleTalkToSupport(
  phoneNumber: string,
  sessionId: string,
  meta: AgentMeta,
): Promise<AgentReply> {
  await notifyLiveSupport(phoneNumber, meta);
  const support = getWhatsAppSupportSettings() as any;
  const contact = formatSupportContactBlock(support);
  await updateAgentSession(sessionId, "AGENT_CHAT", { ...meta, agentMode: true });
  const lang = meta.language || "en";
  const msg: Record<string, string> = {
    en: `I'm connecting you to our support team now.\n\n${contact}\n\nA human agent will be with you shortly. You can also keep typing your issue here while you wait.`,
    hi: `अब मैं आपको हमारी सपोर्ट टीम से कनेक्ट कर रहा हूँ।\n\n${contact}\n\nएक मानव एजेंट शीघ्र ही उपलब्ध होगा।`,
    ta: `இப்போ நான் உங்களை எங்கள் ஆதரவு குழுவுடன் இணைக்கிறேன்.\n\n${contact}\n\nஒரு மனித முகவர் விரைவில் உங்களை சந்திப்பார்.`,
  };
  return makeReply(msg[lang] || msg["en"], [{ id: "MENU", title: "📋 Menu" }]);
}
