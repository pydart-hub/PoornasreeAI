// ── Simulate Service ──────────────────────────────────────────────────────
// State-machine gatekeeper that enforces serial-number registration before
// any feature.
// States: NEW_USER → AWAITING_SERIAL → REGISTERED
//
// Once REGISTERED, incoming messages route through:
//   1. Active troubleshooting session → forward to troubleshooting engine
//   2. No active session → detect problem type → start troubleshooting
//   3. Unrecognised problem → ask user to describe more clearly

import prisma from "../lib/prisma";
import * as TroubleshootingService from "./troubleshooting.service";
import * as TicketService from "./ticket.service";
import { findVideosForQuery } from "../controllers/video.controller";
import { embedText, searchVectors } from "./vector.service";

// ── Constants ─────────────────────────────────────────────────────────────

const REGISTRATION_PROMPT =
  "� Welcome to Poornasree Service Support!\n\n" +
  "Please enter your machine serial number (last 5 digits).\n\n" +
  "Eg: 00001\n\n" +
  "Or reply SKIP to continue without registration.";

const SERIAL_NOT_FOUND_MESSAGE =
  "❌ No machine found with that serial number.\n\n" +
  "Please check and enter the last 5 digits of your serial number again.\n\n" +
  "Or reply SKIP to continue without registration.";

const MULTIPLE_MATCHES_MESSAGE =
  "Multiple machines match those digits. Please enter the full serial number.\n\n" +
  "Or reply SKIP to continue without registration.";

const WELCOME_MESSAGE = "Welcome! Please describe your issue.";

const DESCRIBE_ISSUE_MESSAGE =
  "Please describe your issue clearly (e.g., machine not turning on, no display, vibration issue).";

const NO_ISSUE_DETECTED_MESSAGE =
  "We could not identify the issue.\n\n" +
  "Please describe your problem (e.g., machine not turning on, no display, vibration issue).\n\n" +
  "Or reply HELP to create a service request.";

const INVALID_RESPONSE_MESSAGE = "Please reply YES, NO, or HELP";

const RESOLVED_MESSAGE = "✅ Glad your issue is resolved.";

const ESCALATED_MESSAGE = "🚧 Service request created.\n\nOur engineer will contact you shortly.";

const MAX_SERIAL_ATTEMPTS = 3;

// ── Problem detection (keyword-based, no AI) ──────────────────────────────

const PROBLEM_KEYWORDS: { keywords: string[]; problemType: string }[] = [
  {
    keywords: ["power", "start", "starting", "turn", "not working", "not turning", "dead"],
    problemType: "power_issue",
  },
  {
    keywords: ["display", "screen", "blank"],
    problemType: "no_display",
  },
  {
    keywords: ["vibr", "vibration", "vibro", "shaking"],
    problemType: "vibration_issue",
  },
];

function detectProblemType(message: string): string | null {
  console.log("Inside detectProblemType, message:", message);
  const lower = message.toLowerCase();
  for (const entry of PROBLEM_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.problemType;
    }
  }
  return null;
}

// ── handleMessage ─────────────────────────────────────────────────────────
// Single entry point — every incoming "WhatsApp" message flows through here.

export async function handleMessage(phoneNumber: string, message: string) {
  console.log("Incoming message:", message);

  // ── GLOBAL HELP: highest priority — works regardless of state ────────
  if (message.trim().toLowerCase() === "help") {
    await createHelpTicket(phoneNumber);
    return {
      message: ESCALATED_MESSAGE,
      state: "GLOBAL",
      sessionId: null,
      isRegistered: false,
    };
  }

  const session = await loadOrCreateSession(phoneNumber);
  console.log("Session state:", session.state);

  // ── Gatekeeper: block everything until REGISTERED ────────────────────
  if (session.state !== "REGISTERED") {
    return gatekeeper(session, message);
  }

  console.log("User is REGISTERED");

  // ── Post-registration: route into troubleshooting ────────────────────
  return handleRegisteredUser(session, phoneNumber, message);
}

// ── Registered-user handler ───────────────────────────────────────────────

async function handleRegisteredUser(
  convoSession: { id: string; state: string; isRegistered: boolean; serialNumber?: string | null },
  phoneNumber: string,
  message: string,
) {
  const reply = (msg: string, videos?: any[]) => ({
    message: msg,
    state: convoSession.state,
    sessionId: convoSession.id,
    isRegistered: convoSession.isRegistered,
    ...(videos && videos.length > 0 ? { videos } : {}),
  });

  // Check for an ACTIVE troubleshooting session for this phone number
  console.log("Checking for active troubleshooting session...");
  const activeTs = await prisma.troubleshootingSession.findFirst({
    where: { phoneNumber, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  console.log("Active session:", activeTs);

  // ── CASE A: Active troubleshooting session exists ─────────────────────
  if (activeTs) {
    console.log("Entering handleResponse branch");
    const normalized = message.trim().toUpperCase();

    // STEP 5: Reject anything that is not YES / NO / HELP immediately
    if (normalized !== "YES" && normalized !== "Y" &&
        normalized !== "NO"  && normalized !== "N"  &&
        normalized !== "HELP" && normalized !== "ESCALATE") {
      return reply(INVALID_RESPONSE_MESSAGE);
    }

    const result = await TroubleshootingService.handleResponse(activeTs.id, message);

    // Map troubleshooting-service responses to strict output format
    if (result.done) {
      const tsSession = result.session as { status: string };
      if (tsSession.status === "COMPLETED") {
        return reply(RESOLVED_MESSAGE);
      }
      // ESCALATED (via HELP or last-step auto-escalation)
      return reply(ESCALATED_MESSAGE);
    }

    // Ongoing step — standardize format and attach video suggestions
    const formatted = reformatStepMessage(result.message);
    const videos = await findVideosForStep(activeTs.problemType, result.message);
    return reply(formatted, videos);
  }

  // ── CASE B: No active troubleshooting session ─────────────────────────
  console.log("No active session → trying AI vector search first");

  // ── STEP B1: Try RAG / vector search against uploaded documents ──────
  const aiAnswer = await queryDocuments(message);

  if (aiAnswer) {
    // Document-based answer found — return it directly with video suggestions
    const videos = await findVideosForQuery(message, 2).catch(() => []);
    return reply(aiAnswer, videos.length > 0 ? videos : undefined);
  }

  // ── STEP B2: Fall back to keyword-based template engine ──────────────
  console.log("No RAG answer → falling back to template engine");
  const problemType = detectProblemType(message);
  console.log("Detected problemType:", problemType);

  if (!problemType) {
    return reply(NO_ISSUE_DETECTED_MESSAGE);
  }

  // Verify that a template exists for this problem type
  const template = await prisma.troubleshootingTemplate.findUnique({
    where: { problemType },
  });

  if (!template || !template.isActive) {
    return reply(NO_ISSUE_DETECTED_MESSAGE);
  }

  // Start a new troubleshooting session
  const serialNum = convoSession.serialNumber || phoneNumber;
  const tsResult = await TroubleshootingService.startSession(phoneNumber, serialNum, problemType);

  // Attach video suggestions for first step
  const formatted2 = reformatStepMessage(tsResult.message);
  const videos2 = await findVideosForStep(problemType, tsResult.message);
  return reply(formatted2, videos2);
}

// ── Helper: query Qdrant for a document-based answer ────────────────────
// Returns the answer string if confident, or null to fall back to templates.
// NOTE: training.json intents are indexed into Qdrant at startup (not stored
// in the Document table), so we do NOT gate on prisma.document.count().
async function queryDocuments(query: string): Promise<string | null> {
  try {
    const embedding = await embedText(query);
    const hits = await searchVectors(embedding, 3, ["service"]);

    const MIN_SCORE = 0.45;
    const relevant = hits.filter((h) => h.score >= MIN_SCORE);
    if (relevant.length === 0) return null;

    const top = relevant[0];

    // Direct-hit shortcut: if this chunk was indexed with a directResponse flag
    // (i.e. came from a training.json intent), return it immediately.
    if (top.payload.directResponse === true && top.score >= 0.55) {
      const content = top.payload.content as string;
      return content || null;
    }

    // Otherwise return the raw chunk content — it is the extracted document text
    return (top.payload.content as string) || null;
  } catch (err) {
    console.warn("[simulate] RAG query failed:", err);
    return null;
  }
}

// ── Helper: reformat step messages to standard format (STEP 4) ───────────
// Converts   "Step N of T: content\nIs the issue resolved? Reply YES or NO."
// to         "Step N of T: content\n\nIs the issue resolved?\nReply YES, NO, or HELP"
function reformatStepMessage(msg: string): string {
  return msg
    .replace(/\nIs the issue resolved\? Reply YES or NO\.?/i,
      "\n\nIs the issue resolved?\nReply YES, NO, or HELP");
}

// ── Helper: find video suggestions for a troubleshooting step ─────────────
async function findVideosForStep(problemType: string, stepMessage: string) {
  try {
    const query = `${problemType.replace(/_/g, " ")} ${stepMessage}`;
    return await findVideosForQuery(query, 2);
  } catch {
    return [];
  }
}

// ── Helper: create a help ticket using admin as fallback customer ──────────
async function createHelpTicket(phoneNumber: string): Promise<void> {
  try {
    const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
    if (!adminUser) return;
    await TicketService.createTicket({
      customerId: adminUser.id,
      problemDescription: `Help request from ${phoneNumber}`,
      phoneNumber,
    });
  } catch {
    // Non-blocking — log silently so the response still goes through
  }
}

// ── Gatekeeper logic ──────────────────────────────────────────────────────

async function gatekeeper(
  session: { id: string; state: string; phoneNumber: string },
  message: string,
) {
  // ── NEW_USER → transition to AWAITING_SERIAL and show prompt ─────────
  if (session.state === "NEW_USER") {
    const updated = await prisma.conversationSession.update({
      where: { id: session.id },
      data: { state: "AWAITING_SERIAL" },
    });
    return {
      message: REGISTRATION_PROMPT,
      state: updated.state,
      sessionId: updated.id,
      isRegistered: false,
    };
  }

  // ── AWAITING_SERIAL → validate serial number input ───────────────────
  if (session.state === "AWAITING_SERIAL") {
    const trimmed = message.trim();

    // SKIP → guest mode
    if (trimmed.toUpperCase() === "SKIP") {
      const updated = await prisma.conversationSession.update({
        where: { id: session.id },
        data: { state: "REGISTERED", isRegistered: false },
      });
      return {
        message: WELCOME_MESSAGE,
        state: updated.state,
        sessionId: updated.id,
        isRegistered: false,
      };
    }

    // Look up machine by serial number
    // Strategy: try last 5 digits match first, then exact match
    const input = trimmed.replace(/[^a-zA-Z0-9-]/g, ""); // sanitize

    // First try exact match
    let machine = await prisma.machine.findFirst({
      where: { serialNumber: input, isActive: true },
    });

    if (!machine) {
      // Try matching by last 5 digits (endsWith)
      const last5 = input.slice(-5);
      if (last5.length >= 3) {
        const matches = await prisma.machine.findMany({
          where: { serialNumber: { endsWith: last5 }, isActive: true },
        });

        if (matches.length === 1) {
          machine = matches[0];
        } else if (matches.length > 1) {
          // Multiple matches — ask for full serial
          return {
            message: MULTIPLE_MATCHES_MESSAGE,
            state: session.state,
            sessionId: session.id,
            isRegistered: false,
          };
        }
      }
    }

    if (machine) {
      // Machine found → register
      const updated = await prisma.conversationSession.update({
        where: { id: session.id },
        data: {
          state: "REGISTERED",
          isRegistered: true,
          serialNumber: machine.serialNumber,
          machineId: machine.id,
        },
      });
      return {
        message: `✅ Machine verified: ${machine.modelName} (${machine.serialNumber})\n\n${WELCOME_MESSAGE}`,
        state: updated.state,
        sessionId: updated.id,
        isRegistered: true,
      };
    }

    // Not found → re-prompt
    return {
      message: SERIAL_NOT_FOUND_MESSAGE,
      state: session.state,
      sessionId: session.id,
      isRegistered: false,
    };
  }

  // Fallback (should never reach here)
  return {
    message: REGISTRATION_PROMPT,
    state: session.state,
    sessionId: session.id,
    isRegistered: false,
  };
}

// ── Load or create session ────────────────────────────────────────────────

async function loadOrCreateSession(phoneNumber: string) {
  // Find the most recent non-terminal session for this phone number
  const existing = await prisma.conversationSession.findFirst({
    where: {
      phoneNumber,
      state: { in: ["NEW_USER", "AWAITING_SERIAL", "REGISTERED"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) return existing;

  // Create fresh session
  return prisma.conversationSession.create({
    data: {
      phoneNumber,
      state: "NEW_USER",
    },
  });
}
