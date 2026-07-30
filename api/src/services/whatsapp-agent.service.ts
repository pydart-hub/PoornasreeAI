// ── Groq WhatsApp agent (training-grounded, human tone) ──────────────────
// Two-stage: (1) select catalog entries (2) reply only from those entries.
// Returns SimulateReply, or null to delegate transactional flows to FSM.

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
  groqChat,
  groqFastModel,
  groqAgentModel,
  isGroqConfigured,
  parseGroqJson,
} from "./groq.service";
import * as WhatsAppService from "./whatsapp.service";
// Local reply shape — mirrors simulate.service SimulateReply (avoid circular import).
export type AgentReplyButton = { id: string; title: string };
export type AgentReply = {
  message: string;
  buttons?: AgentReplyButton[];
  followUpMessage?: string;
};

const MIN_CONFIDENCE = 0.45;
const HISTORY_LIMIT = 8;

type AgentMeta = {
  language?: string;
  customerName?: string;
  customerPhone?: string;
  agentMode?: boolean;
  lastCatalogIds?: string[];
};

type Stage1Result = {
  matches: number[];
  confidence: number;
  needs_clarification: boolean;
  clarify_question: string | null;
};

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
    .map((r) => `${r.role === "user" ? "Customer" : r.role === "support" ? "Agent" : "Bot"}: ${r.content}`)
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

function welcomeMessage(name?: string): string {
  const greet = name ? `Hi ${name} 🙏` : "Hi 🙏";
  return (
    `${greet} I'm from *Poornasree Equipments* support.\n\n` +
    `Tell me what's happening with your machine — in any language you prefer.\n\n` +
    `Or use a quick option below.`
  );
}

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
    `I'll connect you with our support team.\n\n${contact}\n\n` +
      `Please wait — a human agent will join this chat shortly. ` +
      `You can also keep typing your issue here.`,
    [{ id: "MENU", title: "Main menu" }],
  );
}

async function stage1Select(
  query: string,
  history: string,
  catalog: CatalogEntry[],
): Promise<Stage1Result> {
  const catalogText = formatCatalogForPrompt(catalog);
  const system = `You are a strict training-document matcher for Poornasree Equipments.
Pick ONLY entries from the CATALOG that can answer the customer message.
Return JSON only:
{
  "matches": [1-based catalog numbers],
  "confidence": 0.0-1.0,
  "needs_clarification": boolean,
  "clarify_question": string|null
}
Rules:
- Maximum 3 matches. Prefer the most specific product+issue matches.
- If nothing in the catalog covers the question, return matches=[] and low confidence.
- Do NOT invent IDs. Numbers must exist in the catalog list.
- If product/model is unclear but issue is clear, set needs_clarification=true with one short question.`;

  const user = `CATALOG:\n${catalogText}\n\nRECENT CHAT:\n${history || "(none)"}\n\nCUSTOMER MESSAGE:\n${query}`;

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

async function stage2Reply(
  query: string,
  history: string,
  chunks: CatalogEntry[],
  role: CatalogRole,
): Promise<string> {
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.tag})\n${c.content}`)
    .join("\n\n")
    .slice(0, 6000);

  const persona =
    role === "customer"
      ? `You are a warm, concise Poornasree Equipments customer-care agent on WhatsApp.
Speak like a helpful human colleague — short messages, natural tone, same language as the customer (Hindi, Tamil, Tanglish, Malayalam, English, Hinglish, etc.).`
      : `You are a senior Poornasree field-service mentor helping engineers on WhatsApp.
Be precise and practical. Keep CHECK → ACTION order from CONTEXT. Reply in the same language as the engineer.`;

  const system = `${persona}

STRICT RULES:
1. Answer ONLY using CONTEXT below. Do not use outside knowledge.
2. Never invent products, prices, warranty, spare parts, or troubleshooting steps not present in CONTEXT.
3. If CONTEXT is insufficient, say you don't have that in training documents and offer Book service / Talk to agent (for customers) or ask for machine model (for engineers).
4. Do not mention "CONTEXT", "catalog", "LLM", or "AI".
5. Keep WhatsApp length: prefer under 700 characters. Use numbered steps when needed.`;

  const user = `CONTEXT:\n${context}\n\nRECENT CHAT:\n${history || "(none)"}\n\nMESSAGE:\n${query}\n\nWrite the WhatsApp reply now:`;

  const answer = await groqChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      model: groqAgentModel(),
      temperature: 0.15,
      maxTokens: runtime.groqMaxTokensReply(),
      timeoutMs: 45_000,
    },
  );

  return answer || "Sorry — I couldn't form a reply just now. Please try again.";
}

function refusalMessage(role: CatalogRole): AgentReply {
  if (role === "service") {
    return makeReply(
      `I don't have Poornasree service documentation for that.\n\n` +
        `I can only help with our analyzers, Vibro, adapters, and related equipment from training docs.\n` +
        `Tell me the machine/model and the symptom — or type *HELP* for ticket commands.`,
    );
  }
  return makeReply(
    `Sorry — I don't have that information in our Poornasree training records.\n\n` +
      `I only help with Poornasree equipment support. ` +
      `Tell me your machine and the issue, or choose an option below.`,
    escalateButtons(),
  );
}

/**
 * Customer Groq agent entry.
 * Returns AgentReply, or null to delegate to the legacy FSM (e.g. book-service serial flow).
 */
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

  // Book service → hand off to FSM complaint/serial flow
  if (SHORTCUT_BOOK.has(upper) || SHORTCUT_BOOK.has(text)) {
    await updateAgentSession(session.id, "COMPLAINT_ASK_SERIAL", meta);
    return null;
  }

  if (SHORTCUT_SUPPORT.has(upper) || SHORTCUT_SUPPORT.has(text)) {
    return handleTalkToSupport(phoneNumber, session.id, meta);
  }

  if (SHORTCUT_MENU.has(upper) || (text.length <= 2 && /^(hi|hey)$/i.test(text))) {
    await updateAgentSession(session.id, "AGENT_CHAT", meta);
    return makeReply(welcomeMessage(meta.customerName), agentWelcomeButtons());
  }

  if (upper === "BYE" || upper === "CLOSE") {
    await updateAgentSession(session.id, "COMPLETED", {});
    return makeReply("Thank you for contacting Poornasree Equipments. Have a great day! 🙏");
  }

  const history = await loadRecentHistory(phoneNumber);
  const catalogAll = await getCatalogForRole("customer");
  const catalog = prefilterCatalog(catalogAll, text, 55);

  if (catalog.length === 0) {
    return refusalMessage("customer");
  }

  let stage1: Stage1Result;
  try {
    stage1 = await stage1Select(text, history, catalog);
  } catch (err) {
    console.error("[whatsapp-agent] Stage1 failed:", err);
    throw err;
  }

  if (stage1.needs_clarification && stage1.clarify_question && stage1.matches.length === 0) {
    await updateAgentSession(session.id, "AGENT_CHAT", meta);
    return makeReply(stage1.clarify_question, escalateButtons());
  }

  if (stage1.matches.length === 0 || stage1.confidence < MIN_CONFIDENCE) {
    await updateAgentSession(session.id, "AGENT_CHAT", {
      ...meta,
      lastCatalogIds: [],
    });
    return refusalMessage("customer");
  }

  const chunks = stage1.matches.map((n) => catalog[n - 1]).filter(Boolean);
  let reply: string;
  try {
    reply = await stage2Reply(text, history, chunks, "customer");
  } catch (err) {
    console.error("[whatsapp-agent] Stage2 failed:", err);
    throw err;
  }

  await updateAgentSession(session.id, "AGENT_CHAT", {
    ...meta,
    lastCatalogIds: chunks.map((c) => c.id),
  });

  // Soft escalate option when confidence is middling
  const buttons =
    stage1.confidence < 0.7 ? escalateButtons() : [{ id: "BOOK_SERVICE", title: "Book service" }];

  return makeReply(reply, buttons);
}

/**
 * Engineer free-text technical Q&A from service training docs.
 * Returns a reply string, or null if nothing matched (caller may try videos / HELP).
 */
export async function handleEngineerAgentMessage(
  engineerFirstName: string,
  message: string,
  phoneNumber: string,
): Promise<string | null> {
  const text = message.trim();
  if (!text || text.length < 4) return null;

  const history = await loadRecentHistory(phoneNumber);
  const catalogAll = await getCatalogForRole("service");
  const catalog = prefilterCatalog(catalogAll, text, 55);
  if (catalog.length === 0) return null;

  let stage1: Stage1Result;
  try {
    stage1 = await stage1Select(text, history, catalog);
  } catch (err) {
    console.error("[whatsapp-agent] Engineer Stage1 failed:", err);
    return null;
  }

  if (stage1.matches.length === 0 || stage1.confidence < MIN_CONFIDENCE) {
    return null;
  }

  const chunks = stage1.matches.map((n) => catalog[n - 1]).filter(Boolean);
  try {
    const reply = await stage2Reply(text, history, chunks, "service");
    return `Hi ${engineerFirstName} 👋\n\n${reply}`;
  } catch (err) {
    console.error("[whatsapp-agent] Engineer Stage2 failed:", err);
    return null;
  }
}
