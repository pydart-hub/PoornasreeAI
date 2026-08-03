// ── Groq WhatsApp agent (conversational, multilingual, memory-aware) ──────
// Two-stage: (1) select catalog entries (2) reply only from those entries.
// Human-like persona, multi-language support, customer context, conversation memory.

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
import { fetchMachineBySerial, type PasstestMachine } from "./machine.service";
import {
  groqChat,
  groqFastModel,
  groqAgentModel,
  isGroqConfigured,
  parseGroqJson,
} from "./groq.service";
import * as WhatsAppService from "./whatsapp.service";

// ── Types ─────────────────────────────────────────────────────────────────
export type AgentReplyButton = { id: string; title: string };
export type AgentReply = {
  message: string;
  buttons?: AgentReplyButton[];
  followUpMessage?: string;
};

const MIN_CONFIDENCE = 0.45;
const HISTORY_LIMIT = 12;

type AgentMeta = {
  language?: string;
  customerName?: string;
  customerPhone?: string;
  agentMode?: boolean;
  lastCatalogIds?: string[];
  customerMachines?: string[];
};

type Stage1Result = {
  matches: number[];
  confidence: number;
  needs_clarification: boolean;
  clarify_question: string | null;
};

// ── Boilerplate helpers ────────────────────────────────────────────────────
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

// ── Shortcut constants ─────────────────────────────────────────────────────
const SHORTCUT_BOOK = new Set([
  "BOOK_SERVICE",
  "2",
  "BOOK SERVICE",
  "BOOK A SERVICE",
  "RAISE COMPLAINT",
  "REGISTER COMPLAINT",
]);

const SHORTCUT_SUPPORT = new Set([
  "TALK_AGENT",
  "4",
  "SPEAK TO SUPPORT",
  "TALK TO AGENT",
  "TALK TO HUMAN",
  "HUMAN",
  "SUPPORT",
]);

const SHORTCUT_MENU = new Set([
  "MENU",
  "HI",
  "HELLO",
  "HEY",
  "START",
  "NAMASTE",
  "VANAKKAM",
  "VANAKKAM",
]);

function agentWelcomeButtons(): AgentReplyButton[] {
  return [
    { id: "BOOK_SERVICE", title: "Book service" },
    { id: "TALK_AGENT", title: "Talk to agent" },
    { id: "MENU", title: "Main menu" },
  ];
}

function escalateButtons(): AgentReplyButton[] {
  return [
    { id: "BOOK_SERVICE", title: "Book service" },
    { id: "TALK_AGENT", title: "Talk to agent" },
  ];
}

// ── DB helpers ─────────────────────────────────────────────────────────────
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
    .map((r: { role: string; content: string }) => `${r.role === "user" ? "Customer" : r.role === "support" ? "Agent" : "Bot"}: ${r.content}`)
    .join("\n");
}

async function notifyLiveSupport(
  phoneNumber: string,
  meta: AgentMeta,
): Promise<void> {
  const support = await getWhatsAppSupportSettings();
  const customerName = meta.customerName || "Not Provided";
  const customerPhone = meta.customerPhone || phoneNumber;
  const notificationText =
    `🚨 *Live Chat Request*\n\nA customer wants to speak with support.\n` +
    `👤 *Name:* ${customerName}\n📱 *Phone:* ${customerPhone}\n\n` +
    `Please log into the dashboard, pause the chatbot for this user, and chat manually.`;

  try {
    const sentTemplate = await WhatsAppService.sendTemplate(support.supportPhone, {
      name: "engineer_ticket_assigned",
      languageCode: "en",
      bodyParameters: [
        "Support Team",
        "Live Chat Request",
        customerName.replace(/[\n\r\t]/g, " ").trim().slice(0, 100),
        customerPhone.replace(/[\n\r\t]/g, " ").trim().slice(0, 50),
        "WhatsApp Chatbot",
        "Wants to connect with support. Please log into the dashboard, pause the chatbot, and reply manually.",
      ],
    });
    if (!sentTemplate) {
      await WhatsAppService.sendMessage(support.supportPhone, notificationText);
    }
  } catch (err) {
    console.error("[whatsapp-agent] Failed to notify support:", err);
  }
}

// ── Language detection ─────────────────────────────────────────────────────
function detectLanguage(text: string): string {
  // Unicode range checks for Indic scripts
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

  // Roman-script keyword detection (Hinglish, Tanglish, Manglish, etc.)
  const lower = text.toLowerCase();
  const hinglishWords = ["bhai", "bhaiya", "kya", "nai", "haan", "nahi", "thik", "theek", "samajh", "aap", "tum", "mera", "aapka", "karna", "chahiye", "madad", "samasya", "kharab", "kaam"];
  const tanglishWords = ["enna", "sariya", "illa", "aa", "da", "di", "vanga", "poren", "solra", "theriyuma", "kandipa", "romba", "kasu"];
  const manglishWords = ["ente", "ningalude", "cheyyam", "varum", "pokam", "sari", "illa", "athu", "ithu", "engane"];
  const teluguWords = ["endi", "le", "ra", "ayya", "cheppu", "ema", "kadu", "thini"];

  const checkWords = (words: string[], haystack: string) =>
    words.some((w) => haystack.includes(w));

  if (checkWords(tanglishWords, lower)) return "ta";
  if (checkWords(manglishWords, lower)) return "ml";
  if (checkWords(teluguWords, lower)) return "te";
  if (checkWords(hinglishWords, lower)) return "en-hinglish";

  return "en";
}

const LANGUAGE_NAME: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  "en-hinglish": "Hinglish (casual Hindi-English mix)",
};

// ── Customer & machine context enrichment ──────────────────────────────────
async function enrichCustomerContext(phoneNumber: string): Promise<{
  customerName: string;
  language: string;
  machineSummary: string;
}> {
  let customerName = "";
  let language = "en";

  // Try to find customer by phone from DB
  try {
    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone: phoneNumber },
          { phone: phoneNumber.replace("+", "").replace("whatsapp:", "") },
        ],
      },
      select: { name: true, phone: true },
    });
    if (customer?.name) {
      customerName = customer.name;
    }
  } catch {
    // Customer lookup is optional — continue without it
  }

  // Fetch machines from Passtest cloud
  let machines: PasstestMachine[] = [];
  try {
    const url = "https://passtest.poornasreecloud.com/api/machines?all=true";
    const resp = await fetch(url, { timeout: 15000 } as any);
    const json = (await resp.json()) as { success?: boolean; data?: any[] };
    if (json?.success && Array.isArray(json.data)) {
      const cleanPhone = phoneNumber.replace("+", "").replace("whatsapp:", "").trim();
      machines = json.data.filter((m: any) => {
        const custPhone = (m.CustomerPhone ?? m.customer_phone ?? m.phone ?? "").toString();
        return custPhone.includes(cleanPhone) || custPhone.includes(cleanPhone.slice(-10));
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
          `${m.m_model || m.product_code || "Machine"} (S/N: ${m.serial_no})${
            m.test_result ? ` — Status: ${m.test_result}` : ""
          }${m.tested_at ? ` — Tested: ${new Date(m.tested_at).toLocaleDateString("en-IN")}` : ""}`,
      )
      .join("\n");
  }

  return { customerName, language, machineSummary };
}

// ── Conversation memory builder ────────────────────────────────────────────
async function buildConversationMemory(history: string, currentQuery: string): Promise<string> {
  if (!history || history.trim().length < 20) {
    return "No previous conversation context.";
  }

  // Summarize via a quick Groq call — keep it to one short paragraph
  const system = `You are a concise assistant. Summarize the conversation history below into ONE short paragraph (max 120 words) capturing:
1. What machine(s) the customer has or mentioned
2. What issue they described
3. What troubleshooting was already done
4. Any pending actions or agreements

Write in English regardless of the original language. No labels, no bullets.`;

  const user = `CONVERSATION:\n${history.slice(0, 3000)}\n\nCURRENT MESSAGE: ${currentQuery.slice(0, 200)}\n\nSummary:`;

  try {
    return await groqChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: groqFastModel(),
        temperature: 0,
        maxTokens: 200,
        timeoutMs: 15_000,
      },
    );
  } catch {
    return "Earlier conversation about a machine issue.";
  }
}

// ── Welcome message ────────────────────────────────────────────────────────
function welcomeMessage(name?: string): string {
  if (name) {
    return `Hey ${name}! 👋 Welcome to Poornasree Equipments support.\n\nTell me what's happening with your machine — I speak English, Hindi, Tamil, Malayalam, Telugu, and more.\n\nOr pick a quick option below.`;
  }
  return `Hey! 👋 Welcome to Poornasree Equipments support.\n\nTell me what's happening with your machine — I speak English, Hindi, Tamil, Malayalam, Telugu, and more.\n\nOr pick a quick option below.`;
}

// ── Stage 1: Smart catalog selection ───────────────────────────────────────
async function stage1Select(
  query: string,
  history: string,
  catalog: CatalogEntry[],
  customerContext?: string,
): Promise<Stage1Result> {
  const catalogText = formatCatalogForPrompt(catalog);

  const system = `You are a strict training-document matcher for Poornasree Equipments.
Your job: pick ONLY catalog entries that can answer the customer message.
Return JSON only:
{
  "matches": [1-based catalog numbers],
  "confidence": 0.0-1.0,
  "needs_clarification": boolean,
  "clarify_question": string|null
}
Rules:
- Maximum 3 matches. Prefer the most specific product+issue matches.
- If the customer mentions "my machine" generically, use CUSTOMER CONTEXT to figure out which machine they have.
- If nothing in the catalog covers the question, return matches=[] and low confidence.
- Do NOT invent IDs. Numbers must exist in the catalog list.
- If product/model is unclear but issue is clear, set needs_clarification=true with one short question.`;

  const customerBlock = customerContext ? `\nCUSTOMER INFO:\n${customerContext}\n` : "";
  const user = `CATALOG:\n${catalogText}\n${customerBlock}\nCONVERSATION CONTEXT:\n${history || "(none)"}\n\nCUSTOMER MESSAGE:\n${query}`;

  const raw = await groqChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      model: groqFastModel(),
      temperature: 0,
      maxTokens: 250,
      json: true,
      timeoutMs: 30_000,
    },
  );

  const parsed = parseGroqJson<Stage1Result>(raw);
  if (!parsed) {
    return { matches: [], confidence: 0, needs_clarification: false, clarify_question: null };
  }

  const matches = Array.isArray(parsed.matches)
    ? parsed.matches.filter((n) => Number.isFinite(n) && n >= 1 && n <= catalog.length).slice(0, 3)
    : [];

  return {
    matches,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : matches.length ? 0.6 : 0,
    needs_clarification: Boolean(parsed.needs_clarification),
    clarify_question: parsed.clarify_question ? String(parsed.clarify_question).slice(0, 240) : null,
  };
}

// ── Stage 2: Conversational human-like reply ───────────────────────────────
async function stage2Reply(
  query: string,
  history: string,
  chunks: CatalogEntry[],
  role: CatalogRole,
  detectedLanguage?: string,
  customerName?: string,
  customerMachines?: string,
  conversationMemory?: string,
): Promise<string> {
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.tag})\n${c.content}`)
    .join("\n\n")
    .slice(0, 6000);

  const langHint = detectedLanguage ? `\nThe customer is writing in: ${LANGUAGE_NAME[detectedLanguage] || detectedLanguage}. Reply in that same language/script.` : "";

  if (role === "customer") {
    const personalization = customerName ? `The customer's name is ${customerName}.` : "";
    const machines = customerMachines && customerMachines !== "No machines on record."
      ? `\nTheir registered machines:\n${customerMachines}`
      : "";
    const memory = conversationMemory && conversationMemory !== "No previous conversation context."
      ? `\nEarlier conversation notes: ${conversationMemory}`
      : "";

    const system = `You are Priya, a warm and helpful Poornasree Equipments customer-care agent on WhatsApp.
You sound like a real person texting a customer — casual, friendly, and natural.
Your tone: helpful colleague, not a FAQ bot.

CURRENT CONTEXT:
- Customer name: ${customerName || "unknown"}
- Their machines: ${customerMachines || "none on record"}
- Conversation history: ${conversationMemory || "none"}

STRICT RULES:
1. ${personalization} Greet them naturally if it's early in the conversation.
2. Speak in the SAME language the customer uses. Detect from their message.${langHint}
3. Use ONLY the CONTENT below to answer. Do not use outside knowledge.
4. Never mention "CONTEXT", "catalog", "training documents", "AI", "bot", or "LLM".
5. NEVER invent products, prices, warranty terms, spare parts, or steps not in CONTENT.
6. If CONTENT doesn't have the answer, say something natural like "I'd need to check with our technical team on that — let me connect you" and offer to talk to an agent or book a service visit.
7. Reference their specific machines when relevant ("your LactoSure ECO V3", not "the analyzer").
8. Reference earlier conversation points when relevant ("earlier you mentioned…").
9. Keep messages natural — 2-4 short sentences. Use emojis sparingly.
10. ONLY discuss Poornasree products and services. For unrelated topics, politely redirect.`;

    const user = `TRAINING CONTENT:\n${context}${machines}${memory}\n\nCUSTOMER MESSAGE:\n${query}\n\nWrite your WhatsApp reply now:`;
    const answer = await groqChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: groqAgentModel(),
        temperature: 0.2,
        maxTokens: 600,
        timeoutMs: 45_000,
      },
    );
    return answer || "Sorry, I couldn't form a reply just now. Please try again.";
  }

  // Service / engineer persona
  const system = `You are Raj, a senior Poornasree field-service mentor helping technicians on WhatsApp.
You're practical, direct, and experienced — like a senior engineer guiding a junior.

STRICT RULES:
1. Speak in the same language the engineer uses.${langHint}
2. Use ONLY the CONTENT below. Never invent steps or parts.
3. Keep CHECK → ACTION order from the content.
4. Never mention "CONTEXT", "catalog", or "AI".
5. If the content doesn't cover the issue, say "I don't have this in our service docs — let me pull up the detailed manual" and ask for the machine model.`;

  const user = `SERVICE TRAINING CONTENT:\n${context}\n\nCONVERSATION:\n${history || "(none)"}\n\nENGINEER MESSAGE:\n${query}\n\nWrite your reply now:`;

  return await groqChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      model: groqAgentModel(),
      temperature: 0.15,
      maxTokens: 600,
      timeoutMs: 45_000,
    },
  ).catch(() => "Sorry, I couldn't form a reply. Please try again.");
}

// ── Refusal / escalation messages ──────────────────────────────────────────
function refusalMessage(role: CatalogRole): AgentReply {
  if (role === "service") {
    return makeReply(
      `I don't have Poornasree service documentation for that.\n\n` +
        `I can only help with our analyzers, Vibro, adapters, and related equipment from training docs.\n` +
        `Tell me the machine/model and the symptom — or type HELP for ticket commands.`,
    );
  }
  return makeReply(
    `Sorry — I don't have that information in our training records right now.\n\n` +
      `I can help with Poornasree equipment troubleshooting, product info, and service bookings. ` +
      `Tell me your machine and the issue, or choose an option below.`,
    escalateButtons(),
  );
}

// ── Public: Customer agent entry ───────────────────────────────────────────
export async function handleCustomerAgentMessage(
  phoneNumber: string,
  message: string,
): Promise<AgentReply | null> {
  const text = message.trim();
  if (!text) {
    return makeReply(welcomeMessage(), agentWelcomeButtons());
  }

  const session = await getOrCreateAgentSession(phoneNumber);
  const meta: AgentMeta = { ...((session.metadata as AgentMeta) ?? {}), agentMode: true };
  const upper = text.toUpperCase().trim();

  // Preserve feedback for FSM
  if (session.state === "FEEDBACK_RATING" || session.state === "FEEDBACK_SATISFIED") {
    return null;
  }

  // Book service → hand off to FSM
  if (SHORTCUT_BOOK.has(upper) || SHORTCUT_BOOK.has(text)) {
    await updateAgentSession(session.id, "COMPLAINT_ASK_SERIAL", meta);
    return null;
  }

  // Talk to support
  if (SHORTCUT_SUPPORT.has(upper) || SHORTCUT_SUPPORT.has(text)) {
    return handleTalkToSupport(phoneNumber, session.id, meta);
  }

  // Menu / greeting
  if (SHORTCUT_MENU.has(upper) || (text.length <= 4 && /^(hi|hey|hello|hai|vanakkam)$/i.test(text))) {
    await updateAgentSession(session.id, "AGENT_CHAT", meta);
    return makeReply(welcomeMessage(meta.customerName), agentWelcomeButtons());
  }

  if (upper === "BYE" || upper === "CLOSE" || upper === "THANK YOU") {
    await updateAgentSession(session.id, "COMPLETED", {});
    return makeReply(
      meta.customerName
        ? `Thank you, ${meta.customerName}! Feel free to message us anytime you need help. Have a great day! 🙏`
        : "Thank you for contacting Poornasree Equipments. Have a great day! 🙏",
    );
  }

  // Detect language
  const detectedLanguage = detectLanguage(text);
  if (!meta.language) meta.language = detectedLanguage;

  // Load conversation history
  const rawHistory = await loadRecentHistory(phoneNumber);

  // Build conversation memory (summarized)
  const conversationMemory = await buildConversationMemory(rawHistory, text);

  // Enrich with customer + machine context
  const customerCtx = await enrichCustomerContext(phoneNumber);
  if (!meta.customerName && customerCtx.customerName) {
    meta.customerName = customerCtx.customerName;
  }

  const customerBlock = [
    `Customer: ${customerCtx.customerName || "Unknown"}`,
    `Phone: ${phoneNumber}`,
    customerCtx.machineSummary !== "No machines on record."
      ? `Registered machines:\n${customerCtx.machineSummary}`
      : "No machines found on our records.",
  ]
    .filter(Boolean)
    .join("\n");

  // Load catalog and prefilter
  const catalogAll = await getCatalogForRole("customer");
  const catalog = prefilterCatalog(catalogAll, text, 55);

  if (catalog.length === 0) {
    return refusalMessage("customer");
  }

  // Stage 1: Select matching catalog entries
  let stage1: Stage1Result;
  try {
    stage1 = await stage1Select(text, rawHistory, catalog, customerBlock);
  } catch (err) {
    console.error("[whatsapp-agent] Stage1 failed:", err);
    throw err;
  }

  // Clarification
  if (stage1.needs_clarification && stage1.clarify_question && stage1.matches.length === 0) {
    await updateAgentSession(session.id, "AGENT_CHAT", meta);
    return makeReply(stage1.clarify_question, escalateButtons());
  }

  // No good matches
  if (stage1.matches.length === 0 || stage1.confidence < MIN_CONFIDENCE) {
    await updateAgentSession(session.id, "AGENT_CHAT", { ...meta, lastCatalogIds: [] });
    return refusalMessage("customer");
  }

  // Stage 2: Generate human-like reply
  const chunks = stage1.matches.map((n) => catalog[n - 1]).filter(Boolean);
  let reply: string;
  try {
    reply = await stage2Reply(
      text,
      rawHistory,
      chunks,
      "customer",
      detectedLanguage,
      meta.customerName,
      customerCtx.machineSummary,
      conversationMemory,
    );
  } catch (err) {
    console.error("[whatsapp-agent] Stage2 failed:", err);
    throw err;
  }

  await updateAgentSession(session.id, "AGENT_CHAT", {
    ...meta,
    lastCatalogIds: chunks.map((c) => c.id),
  });

  // Soft escalate when confidence is middling
  const buttons =
    stage1.confidence < 0.7 ? escalateButtons() : [{ id: "BOOK_SERVICE", title: "Book service" }];

  return makeReply(reply, buttons);
}

// ── Public: Engineer agent entry ───────────────────────────────────────────
export async function handleEngineerAgentMessage(
  engineerFirstName: string,
  message: string,
  phoneNumber: string,
): Promise<string | null> {
  const text = message.trim();
  if (!text || text.length < 4) return null;

  const rawHistory = await loadRecentHistory(phoneNumber);
  const catalogAll = await getCatalogForRole("service");
  const catalog = prefilterCatalog(catalogAll, text, 55);
  if (catalog.length === 0) return null;

  let stage1: Stage1Result;
  try {
    stage1 = await stage1Select(text, rawHistory, catalog);
  } catch (err) {
    console.error("[whatsapp-agent] Engineer Stage1 failed:", err);
    return null;
  }

  if (stage1.matches.length === 0 || stage1.confidence < MIN_CONFIDENCE) {
    return null;
  }

  const chunks = stage1.matches.map((n) => catalog[n - 1]).filter(Boolean);
  try {
    const reply = await stage2Reply(text, rawHistory, chunks, "service");
    return `Hi ${engineerFirstName} 👋\n\n${reply}`;
  } catch (err) {
    console.error("[whatsapp-agent] Engineer Stage2 failed:", err);
    return null;
  }
}

// ── Support notification helper ────────────────────────────────────────────
async function handleTalkToSupport(
  phoneNumber: string,
  sessionId: string,
  meta: AgentMeta,
): Promise<AgentReply> {
  await notifyLiveSupport(phoneNumber, meta);
  const support = await getWhatsAppSupportSettings();
  const contact = formatSupportContactBlock(support);
  await updateAgentSession(sessionId, "AGENT_CHAT", { ...meta, agentMode: true });
  return makeReply(
    `I'm connecting you to our support team now.\n\n${contact}\n\n` +
      `A human agent will be with you shortly. You can also keep typing your issue here while you wait.`,
    [{ id: "MENU", title: "Main menu" }],
  );
}
