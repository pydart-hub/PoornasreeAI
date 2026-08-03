// ── Groq WhatsApp agent (fully conversational, multilingual, human-like) ──────
// Modelled after Stibe CRM wa-ai-responder architecture.
// Single-stage: Dynamic Groq LLM completions with full training document RAG,
// video recommendations, and configurable persona name ("Hari").

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
import { findDocumentIssue } from "./simulate.service";
import { findVideosForQuery, formatVideoSuggestions } from "../controllers/video.controller";

// ── Types ────────────────────────────────────────────────────────────────────
export type AgentReplyButton = { id: string; title: string };
export type AgentReply = {
  message: string;
  buttons?: AgentReplyButton[];
  followUpMessage?: string;
};

const HISTORY_LIMIT = 14;
const LANG_CONTEXT_LIMIT = 6;

type AgentMeta = {
  language?: string;
  customerName?: string;
  customerPhone?: string;
  agentMode?: boolean;
  lastCatalogIds?: string[];
  customerMachines?: string[];
  lastLangHints?: string[];
  lastComplaint?: string;
};

// ── Exported helpers ─────────────────────────────────────────────────────────
export function isGroqChatbotEnabled(): boolean {
  if (!isGroqConfigured()) return false;
  return runtime.chatbotMode() === "groq";
}

function makeReply(
  message: string,
  buttons?: AgentReplyButton[],
  followUpMessage?: string,
): AgentReply {
  return { message, buttons, followUpMessage };
}

// ── Business Hours Check (Mon-Sat 9 AM - 6 PM IST) ──────────────────────────
function isWithinBusinessHours(): boolean {
  const now = new Date();
  const istTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istTimeStr);
  const day = istDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const hour = istDate.getHours();

  if (day === 0) return false; // Sunday off
  return hour >= 9 && hour < 18;
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
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  ur: "Urdu",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  de: "German",
};

function detectLanguage(text: string): string {
  const hasDevanagari = /[ऀ-ॿ]/.test(text);
  const hasTamil = /[஀-௿]/.test(text);
  const hasTelugu = /[ఀ-౿]/.test(text);
  const hasKannada = /[ಀ-೿]/.test(text);
  const hasMalayalam = /[ഀ-ൿ]/.test(text);
  const hasBengali = /[ঀ-৿]/.test(text);
  const hasArabic = /[؀-ۿ]/.test(text);
  if (hasDevanagari) return "hi";
  if (hasTamil) return "ta";
  if (hasTelugu) return "te";
  if (hasKannada) return "kn";
  if (hasMalayalam) return "ml";
  if (hasBengali) return "bn";
  if (hasArabic) return "ar";

  const lower = text.toLowerCase();
  const tanglish = ["enna", "sariya", "illa", "vanga", "poren", "theriyuma", "romba", "kasu", "da", "di"];
  const manglish = ["ente", "ningalude", "cheyyam", "pokam", "sari", "illatha", "engane", "athe", "nandhi", "shubharatri"];
  const telugu = ["endi", "ra", "ayya", "cheppu", "ema", "kadu", "thini", "vellu"];
  const hinglish = [
    "bhai", "bhaiya", "kya", "nai", "haan", "nahi", "thik",
    "theek", "samajh", "aap", "tum", "mera", "aapka", "chahiye",
    "madad", "samasya", "kharab", "kaam", "abhi", "thoda",
    "kuch", "karwa", "bhejo", "bhej", "karna", "baat",
  ];

  if (tanglish.some((w) => lower.includes(w))) return "ta";
  if (manglish.some((w) => lower.includes(w))) return "ml";
  if (telugu.some((w) => lower.includes(w))) return "te";
  if (hinglish.some((w) => lower.includes(w))) return "en-hinglish";
  return "en";
}

function detectLanguageStrict(text: string): string {
  const raw = detectLanguage(text);
  return raw === "en-hinglish" ? "hi" : raw;
}

function stabilizeLanguage(meta: AgentMeta, detected: string): string {
  if (detected && detected !== "en") return detected;
  const sessionLang = meta.language;
  if (sessionLang && sessionLang !== "en" && detected === "en") {
    return "en";
  }
  return detected;
}

// ── DB & Chat Session helpers ───────────────────────────────────────────────
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
  const support = await getWhatsAppSupportSettings();
  const customerName = (meta.customerName || "Not Provided").replace(/[\n\r\t]/g, " ").trim().slice(0, 100);
  const customerPhone = (meta.customerPhone || phoneNumber).replace(/[\n\r\t]/g, " ").trim().slice(0, 50);

  const notificationText =
    `🚨 *Live Chat Request*\n\n` +
    `👤 *Name:* ${customerName}\n📱 *Phone:* ${customerPhone}\n\n` +
    `Please log into the dashboard, pause the chatbot for this user, and chat manually.`;

  try {
    const sentTemplate = await WhatsAppService.sendTemplate(
      support.supportPhone,
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
      await WhatsAppService.sendMessage(support.supportPhone, notificationText);
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
  activeTicketSummary: string;
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

  let machineSummary = "No registered machines on record.";
  if (machines.length > 0) {
    machineSummary = machines
      .map(
        (m) =>
          `• ${m.m_model || m.product_code || "Milk Analyzer"} (S/N: ${m.serial_no})` +
          ((m as any).CustomerName || m.customer ? ` registered to ${(m as any).CustomerName || m.customer}` : "") +
          (m.test_result ? ` [Status: ${m.test_result}]` : ""),
      )
      .join("\n");
    if ((machines[0] as any)?.CustomerName || machines[0]?.customer) {
      customerName = (machines[0] as any)?.CustomerName || machines[0]?.customer;
    }
  }

  // Active tickets lookup for complaint status memory
  let activeTicketSummary = "No active support tickets.";
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        phoneNumber: { contains: phoneNumber.slice(-10) },
        status: { notIn: ["CLOSED"] },
      },
      include: {
        assignedEngineer: { select: { firstName: true, lastName: true, whatsappNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    if (tickets.length > 0) {
      activeTicketSummary = tickets
        .map((t) => {
          const engName = t.assignedEngineer
            ? `${t.assignedEngineer.firstName} ${t.assignedEngineer.lastName || ""}`.trim()
            : "Assigning field engineer";
          const engPhone = t.assignedEngineer?.whatsappNumber || "N/A";
          return `• Ticket ${t.ticketNumber} (${t.status}): ${t.problemDescription}. Field Engineer: ${engName} (${engPhone})`;
        })
        .join("\n");
    }
  } catch {
    // Ticket lookup optional
  }

  return { customerName, language, machineSummary, activeTicketSummary };
}

// ── Catalog & Video Resolution ───────────────────────────────────────────────
async function loadRelevantCatalog(
  text: string,
  role: CatalogRole,
): Promise<CatalogEntry[]> {
  const all = await getCatalogForRole(role);
  if (all.length === 0) return [];
  return prefilterCatalog(all, text, 25);
}

// ── The Single Dynamic AI Completion Engine ─────────────────────────────────
async function aiReply(
  customerMessage: string,
  history: string,
  language: string,
  customerName: string,
  machines: string,
  activeTickets: string,
  catalogContext: string,
  isEngineer: boolean,
  isNewUser: boolean,
): Promise<string> {
  const supportSettings = await getWhatsAppSupportSettings();
  const botName = supportSettings.botName || "Hari";
  const langName = LANG_CODE[language] || language;

  const isBusinessHours = isWithinBusinessHours();

  const isFirstTurn = !history || history.trim().length < 20;

  const system = `You are ${botName}, a warm, smart, and expert human customer support executive at Poornasree Equipments — India's leading milk testing equipment manufacturer since 2011.

PERSONA & HUMAN CONVERSATION RULES (CRITICAL):
- Your name is ${botName}. Speak like a real human support team member — empathetic, concise, and natural.
- NEVER sound like a rigid robot, automated bot, or canned menu system.
- NEVER mention "AI", "LLM", "Prompt", "System Instructions", or "Training Catalog".
- ${isFirstTurn 
    ? `This is the FIRST message of the chat. Greet the customer warmly and introduce yourself as ${botName} from Poornasree Equipments.`
    : `STRICT RULE FOR ONGOING CHAT: This is a CONTINUING conversation thread. DO NOT say "Hi", "Hello", "Namaste", or "I'm ${botName}". DO NOT re-introduce yourself. Jump STRAIGHT into answering the user's question directly without any greeting!`
  }
- IMPORTANT: Our WhatsApp system CAN and DOES automatically attach product photos, model images, brochures, and video tutorial links directly into the customer's WhatsApp chat. NEVER claim "I cannot display images". Reassure the user that you are sharing photos/links in chat.

LANGUAGE RULE (STRICT):
- Identify the language used by the customer in their message and recent chat history.
- Reply ONLY in ${langName}. Write fluently in ${langName}. If the user types in Hinglish, Tanglish, or Manglish, match their exact casual conversational style.

STRICT CONTENT SAFETY & BOUNDARY RULES:
- If the customer uses improper language, profanity, abusive words, or attempts flirting/romance:
  1. Do NOT argue, take offense, or flirt back.
  2. Politely refuse off-topic comments and firmly state: "I am ${botName}, Poornasree's support representative here to assist you with milk testing equipment, service bookings, and technical inquiries."
  3. Offer help with their milk analyzer, stirrer, or service booking.

COMPANY KNOWLEDGE & POLICIES (Poornasree Equipments):
- Head Office: 13/191-C, Mannoor Road, Maradu P.O, Ernakulam, Kochi, Kerala – 682304. Tel: +91 484 4859291, Mobile: +91 94009 61291.
- Delhi Office: Shop 12, Cold Storage Market, Siyana Road, Bulandshahr, UP 203001. Mobile: +91 96057 57816.
- Products: LactoSure ECO series (Eco, Eco-S, Eco-V, Eco-SV, Eco-D-V4, Eco-CP, Eco-SV-V4 ultrasonic milk analyzers), VIBRO Ultrasonic Stirrer, LactoSure DPS-T Data Processing Unit, External Displays, Receipt Printers.
- Guarantees: 24-hour solution policy, 30 nationwide field engineers (Harisree Enterprises), ISO 9001:2015 certified.
- Current Time Status: ${isBusinessHours ? "Currently within active Business Hours (Mon-Sat 9 AM - 6 PM IST). Direct engineer dispatch available." : "Currently After Business Hours (Night/Sunday). Tickets created now are prioritized for 9 AM dispatch tomorrow morning."}

CUSTOMER & TICKET MEMORY:
Customer Name: ${customerName || "Customer"}
Registered Machines:\n${machines}
Active Support Tickets:\n${activeTickets}

TRAINING DOCUMENTS & TROUBLESHOOTING GUIDES:\n${catalogContext.slice(0, 6000)}

TROUBLESHOOTING INSTRUCTIONS (CRITICAL):
- When a customer reports a machine issue (e.g. "Vibro not working", "Analyzer not on", "Low battery error"), you MUST provide the EXACT CHECK and ACTION steps from the training documents above.
- Format troubleshooting as numbered steps: "Step 1: CHECK ... → If failed, ACTION: ..."
- After listing ALL checks and actions, ask: "Did these steps resolve your issue?"
- If the training documents contain a matching troubleshooting guide, use it EXACTLY. Do NOT make up your own steps.
- If no matching guide exists, ask clarifying questions about the specific machine model and error symptoms.

REPLY FORMATTING (WhatsApp Friendly):
- Keep paragraphs short (2-3 lines max) with clean line breaks.
- Use *bold* for headings and key specs.
- For troubleshooting, provide numbered step-by-step instructions (Step 1, Step 2, Step 3).`;

  const userPrompt =
    `CONVERSATION HISTORY:\n${history || "(first message)"}\n\n` +
    `CUSTOMER MESSAGE: ${customerMessage}\n\n` +
    `Now write your natural ${langName} response as ${botName}:`;

  try {
    const reply = await groqChat(
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      {
        model: groqAgentModel(),
        temperature: 0.35,
        maxTokens: isEngineer ? 900 : 600,
        timeoutMs: 40_000,
      },
    );
    const trimmed = (reply || "").trim();
    if (trimmed.length > 5) return trimmed;
  } catch (err) {
    console.error("[whatsapp-agent] Groq completion error:", err);
  }

  return `Namaste! 🙏 I'm ${botName} from Poornasree Equipments. How can I help you with your milk testing machine or service booking today?`;
}

// ── Public Entry Point: Customer WhatsApp Agent ──────────────────────────────
export async function handleCustomerAgentMessage(
  phoneNumber: string,
  message: string,
): Promise<AgentReply | null> {
  const text = message.trim();
  const supportSettings = await getWhatsAppSupportSettings();
  const botName = supportSettings.botName || "Hari";

  if (!text) {
    return makeReply(
      `Namaste! 🙏 I'm ${botName} from Poornasree Equipments. Please tell me what issue you are facing or what information you need.`,
      [{ id: "troubleshoot", title: "🔧 Troubleshoot" }, { id: "book_service", title: "🛠️ Book Service" }],
    );
  }

  const session = await getOrCreateAgentSession(phoneNumber);
  const meta: AgentMeta = {
    ...((session.metadata as AgentMeta) ?? {}),
    agentMode: true,
  };
  const upper = text.toUpperCase().trim();

  // Handle shortcuts
  if (upper === "TALK_AGENT" || upper === "SPEAK TO SUPPORT" || upper === "4") {
    return handleTalkToSupport(phoneNumber, session.id, meta);
  }

  if (upper === "YES_RESOLVED") {
    await updateAgentSession(session.id, "AGENT_CHAT", { ...meta, lastComplaint: undefined });
    return makeReply(
      `Great! 🎉 Glad the issue is resolved. If you face any other problems in the future, feel free to reach out anytime. We're always here to help!`,
      [{ id: "troubleshoot", title: "🔧 Troubleshoot" }, { id: "book_service", title: "🛠️ Book Service" }],
    );
  }

  if (upper === "BOOK_SERVICE" || upper === "BOOK SERVICE" || upper === "2") {
    await updateAgentSession(session.id, "COMPLAINT_ASK_SERIAL", meta);
    return makeReply(
      `Sure! I'll help you book a service visit. Please enter your 10-digit machine serial number (e.g. ECO-2024-8841) — or tap Skip to continue without it.`,
      [
        { id: "SKIP", title: "Skip ⏭️" },
        { id: "MENU", title: "Menu 📋" },
      ],
    );
  }

  // Explicit language request detection (e.g. "Talk in Malayalam", "Speak Hindi", "Tamil")
  const lowerText = text.toLowerCase();
  if (/\bmalayalam\b|മലയാളം/i.test(lowerText)) meta.language = "ml";
  else if (/\bhindi\b|हिंदी|हिन्दी/i.test(lowerText)) meta.language = "hi";
  else if (/\btamil\b|தமிழ்/i.test(lowerText)) meta.language = "ta";
  else if (/\btelugu\b|తెలుగు/i.test(lowerText)) meta.language = "te";
  else if (/\bkannada\b|ಕನ್ನಡ/i.test(lowerText)) meta.language = "kn";
  else if (/\bbengali\b|বাংলা/i.test(lowerText)) meta.language = "bn";
  // Detect Manglish (Malayalam in English)
  else if (/\b(ente|enikk|aanu|alla|undo|avunnilla|ariyumo|cheyyumo|ivide|evidaya|onnum|enthaanu|ningal|njan|mashineentha|paalu)\b/i.test(lowerText)) {
    meta.language = "ml";
  }
  // Detect Hinglish (Hindi in English)
  else if (/\b(meri|mera|mere|kaise|chalu|nhi|nahin|kare|kaam|karo|batao|kya|kaise)\b/i.test(lowerText)) {
    meta.language = "hi";
  }
  // Detect Tanglish (Tamil in English)
  else if (/\b(enadhu|enaku|ennudaiya|theriyuma|irukku|panla|varala|pannunga)\b/i.test(lowerText)) {
    meta.language = "ta";
  }
  else {
    const detectedLang = detectLanguageStrict(text);
    // Only override session language if confidently detected AND session not already established
    if (meta.language && detectedLang === "en") {
      // Keep existing session language if new message is ambiguous English
    } else {
      meta.language = stabilizeLanguage(meta, detectedLang);
    }
  }
  const lang = meta.language || "en";

  // Enrich Context
  const rawHistory = await loadRecentHistory(phoneNumber);
  const customerCtx = await enrichCustomerContext(phoneNumber);
  if (!meta.customerName && customerCtx.customerName) {
    meta.customerName = customerCtx.customerName;
  }

  const isEngineer = /step|board|sensor|voltage|circuit|replace|calibrate|transducer|wiring/i.test(text);
  const isNewUser = /new user|first time|just bought|unbox|setting up|how to use/i.test(text);

  // Load relevant training document RAG
  const catalog = await loadRelevantCatalog(text, isEngineer ? "service" : isNewUser ? "new_user" : "customer");
  const catalogContext = formatCatalogForPrompt(catalog);

  // ── Structured Complaint Matching from Training Catalog ───────────────────
  // ONLY match troubleshooting entries from JSON/document_issue sources (NOT products)
  const troubleshootEntries = catalog.filter((e) => e.source === "json" || e.source === "document_issue");
  const lowerMsg = text.toLowerCase();

  // Build a relevance-scored match against all troubleshooting entries
  let bestMatch: CatalogEntry | null = null;
  let bestScore = 0;

  for (const entry of troubleshootEntries) {
    let score = 0;
    const hay = `${entry.title} ${entry.tag} ${entry.patterns.join(" ")} ${entry.content}`.toLowerCase();

    // Direct pattern match (highest weight)
    for (const p of entry.patterns) {
      if (p.length > 3 && lowerMsg.includes(p.toLowerCase())) score += 10;
    }

    // Keyword overlap scoring
    const msgWords = lowerMsg.split(/\s+/).filter((w) => w.length > 2);
    for (const word of msgWords) {
      if (hay.includes(word)) score += 2;
    }

    // Boost common product/complaint keywords
    if (lowerMsg.includes("vibro") && hay.includes("vibro")) score += 5;
    if (lowerMsg.includes("not working") && hay.includes("not working")) score += 5;
    if (lowerMsg.includes("not on") && (hay.includes("not on") || hay.includes("not working"))) score += 5;
    if (lowerMsg.includes("led") && hay.includes("led")) score += 3;
    if (lowerMsg.includes("vibration") && hay.includes("vibration")) score += 3;
    if (lowerMsg.includes("adapter") && hay.includes("adapter")) score += 5;
    if (lowerMsg.includes("analyzer") && hay.includes("analyzer")) score += 5;
    if (lowerMsg.includes("cloud") && hay.includes("cloud")) score += 5;
    if (lowerMsg.includes("error") && hay.includes("error")) score += 3;
    if (lowerMsg.includes("battery") && hay.includes("battery")) score += 3;
    if (lowerMsg.includes("fat") && hay.includes("fat")) score += 3;
    if (lowerMsg.includes("reading") && hay.includes("reading")) score += 3;
    if (lowerMsg.includes("printer") && hay.includes("printer")) score += 3;
    if (lowerMsg.includes("wifi") && hay.includes("wifi")) score += 3;
    if (lowerMsg.includes("gsm") && hay.includes("gsm")) score += 3;
    if (lowerMsg.includes("sample") && hay.includes("sample")) score += 3;
    if (lowerMsg.includes("hot") && hay.includes("hot")) score += 3;
    if (lowerMsg.includes("display") && hay.includes("display")) score += 3;
    if (lowerMsg.includes("fuse") && hay.includes("fuse")) score += 3;
    if (lowerMsg.includes("power") && hay.includes("power")) score += 3;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  // Only use structured match if score is significant (at least one keyword + one pattern)
  if (bestMatch && bestScore >= 5) {
    meta.lastComplaint = bestMatch.title;
    await updateAgentSession(session.id, "AGENT_CHAT", meta);

    let structuredText = `🔧 *Troubleshooting: ${bestMatch.title}*\n\n${bestMatch.content}`;

    // Add "Did this resolve?" prompt
    structuredText += `\n\n✅ Did these steps resolve your issue? If not, tap *Register Complaint* below and our field engineer will be assigned to you.`;

    // Attach video if available
    try {
      const matchedVideos = await findVideosForQuery(`${text} ${bestMatch.title}`, 2);
      if (matchedVideos.length > 0) {
        structuredText += formatVideoSuggestions(
          matchedVideos.map((v) => ({ title: v.title, youtubeUrl: v.youtubeUrl })),
          lang,
        );
      }
    } catch (e) {
      console.error("[whatsapp-agent] Video lookup error:", e);
    }

    return makeReply(structuredText, [
      { id: "YES_RESOLVED", title: "✅ Yes, Resolved" },
      { id: "BOOK_SERVICE", title: "🛠️ Register Complaint" },
      { id: "talk_agent", title: "💬 Talk to us" },
    ]);
  }

  // Generate Groq completion
  let replyText = await aiReply(
    text,
    rawHistory,
    lang,
    meta.customerName || "",
    customerCtx.machineSummary,
    customerCtx.activeTicketSummary,
    catalogContext,
    isEngineer,
    isNewUser,
  );

  // ── Automatic Video Recommendation Injection ─────────────────────────────
  // If the conversation touches an error, fault, or troubleshooting topic, query videos
  const videoSearchTerms = [text, meta.lastComplaint ?? ""].join(" ");
  if (/error|fault|issue|problem|cleaning|fat|snf|reading|vibro|stirrer|power|display|battery/i.test(text)) {
    try {
      const matchedVideos = await findVideosForQuery(videoSearchTerms, 2);
      if (matchedVideos.length > 0) {
        const videoBlock = formatVideoSuggestions(
          matchedVideos.map((v) => ({ title: v.title, youtubeUrl: v.youtubeUrl })),
          lang,
        );
        replyText += videoBlock;
      }
    } catch (e) {
      console.error("[whatsapp-agent] Video suggestion query error:", e);
    }
  }

  // ── Automatic Product Image Dispatch ──────────────────────────────────────
  if (/image|images|photo|photos|pic|pics|picture|pictures|catalog|brochure|product|model|price|lactosure/i.test(text)) {
    try {
      const activeProducts = await prisma.product.findMany({ where: { isActive: true } });
      const baseUrl = process.env.FRONTEND_URL || "https://ai.poornasreecloud.com";

      // 1. Check if specific product name matches
      let matchedCount = 0;
      for (const prod of activeProducts) {
        if (prod.imageUrl && text.toLowerCase().includes(prod.name.toLowerCase())) {
          const fullImageUrl = prod.imageUrl.startsWith("http") ? prod.imageUrl : `${baseUrl}${prod.imageUrl}`;
          await WhatsAppService.sendImage(
            phoneNumber,
            fullImageUrl,
            `📸 *${prod.name}*\n${prod.detail || ""}`,
          );
          matchedCount++;
        }
      }

      // 2. If user asked generally for images/photos and no specific model matched, send top 3 active model photos
      if (matchedCount === 0 && /image|images|photo|photos|pic|pics|picture|pictures/i.test(text)) {
        const withImages = activeProducts.filter((p) => Boolean(p.imageUrl)).slice(0, 3);
        for (const prod of withImages) {
          const fullImageUrl = prod.imageUrl!.startsWith("http") ? prod.imageUrl! : `${baseUrl}${prod.imageUrl}`;
          await WhatsAppService.sendImage(
            phoneNumber,
            fullImageUrl,
            `📸 *${prod.name}*\n${prod.detail || ""}`,
          );
        }
      }
    } catch (e) {
      console.error("[whatsapp-agent] Product image dispatch error:", e);
    }
  }

  await updateAgentSession(session.id, "AGENT_CHAT", meta);

  return makeReply(replyText, [
    { id: "troubleshoot", title: "🔧 Troubleshoot" },
    { id: "book_service", title: "🛠️ Book Service" },
    { id: "talk_agent", title: "💬 Talk to us" },
  ]);
}

// ── Support notification helper ──────────────────────────────────────────────
async function handleTalkToSupport(
  phoneNumber: string,
  sessionId: string,
  meta: AgentMeta,
): Promise<AgentReply> {
  await notifyLiveSupport(phoneNumber, meta);
  const support = await getWhatsAppSupportSettings();
  const contact = formatSupportContactBlock(support);
  await updateAgentSession(sessionId, "AGENT_CHAT", { ...meta, agentMode: true });

  const botName = support.botName || "Hari";
  const msg =
    `I'm connecting you to our customer support team now.\n\n${contact}\n\n` +
    `I'm ${botName}, and our live support agent will also join this chat shortly. Feel free to message your question here while waiting!`;

  return makeReply(msg, [{ id: "MENU", title: "📋 Menu" }]);
}

// ── Public Entry Point: Engineer WhatsApp Agent ──────────────────────────────
export async function handleEngineerAgentMessage(
  engineerFirstName: string,
  message: string,
  phoneNumber: string,
): Promise<string | null> {
  const text = message.trim();
  if (!text || text.length < 2) return null;

  const rawHistory = await loadRecentHistory(phoneNumber);
  const catalog = await loadRelevantCatalog(text, "service");
  const catalogContext = formatCatalogForPrompt(catalog);

  const replyText = await aiReply(
    text,
    rawHistory,
    "en",
    engineerFirstName,
    "",
    "",
    catalogContext,
    true,
    false,
  );

  return `Hi ${engineerFirstName} 👋\n\n${replyText}`;
}
