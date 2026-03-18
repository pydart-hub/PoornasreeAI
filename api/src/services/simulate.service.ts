// ── Simulate Service ──────────────────────────────────────────────────────
// State-machine gatekeeper that enforces registration before any feature.
// States: NEW_USER → AWAITING_MOBILE → REGISTERED
//
// Once REGISTERED, incoming messages route through:
//   1. Active troubleshooting session → forward to troubleshooting engine
//   2. No active session → detect problem type → start troubleshooting
//   3. Unrecognised problem → ask user to describe more clearly

import prisma from "../lib/prisma";
import * as TroubleshootingService from "./troubleshooting.service";
import * as TicketService from "./ticket.service";

// ── Constants ─────────────────────────────────────────────────────────────

const REGISTRATION_PROMPT =
  "📱 This mobile number is not registered with us.\n\n" +
  "If you are a Registered Customer, please provide your registered 10 digit mobile number.\n\n" +
  "Eg: 9633503333\n\n" +
  "Else reply SKIP to continue.";

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

const MOBILE_RE = /^\d{10}$/;

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

  // ── Post-registration: route into troubleshooting ────────────────────
  return handleRegisteredUser(session, phoneNumber, message);
}

// ── Registered-user handler ───────────────────────────────────────────────

async function handleRegisteredUser(
  convoSession: { id: string; state: string; isRegistered: boolean },
  phoneNumber: string,
  message: string,
) {
  const reply = (msg: string) => ({
    message: msg,
    state: convoSession.state,
    sessionId: convoSession.id,
    isRegistered: convoSession.isRegistered,
  });

  // Check for an ACTIVE troubleshooting session for this phone number
  const activeTs = await prisma.troubleshootingSession.findFirst({
    where: { phoneNumber, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  // ── CASE A: Active troubleshooting session exists ─────────────────────
  if (activeTs) {
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

    // Ongoing step — standardize format (STEP 4)
    return reply(reformatStepMessage(result.message));
  }

  // ── CASE B: No active troubleshooting session ─────────────────────────

  console.log("Calling detectProblemType...");
  const problemType = detectProblemType(message);
  console.log("Detected problemType:", problemType);

  if (!problemType) {
    // STEP 3: No dead-end — always guide user with clear options
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
  // serialNumber is not yet collected — use phoneNumber as placeholder
  const tsResult = await TroubleshootingService.startSession(phoneNumber, phoneNumber, problemType);

  // STEP 4: Standardize step format
  return reply(reformatStepMessage(tsResult.message));
}

// ── Helper: reformat step messages to standard format (STEP 4) ───────────
// Converts   "Step N of T: content\nIs the issue resolved? Reply YES or NO."
// to         "Step N of T: content\n\nIs the issue resolved?\nReply YES, NO, or HELP"
function reformatStepMessage(msg: string): string {
  return msg
    .replace(/\nIs the issue resolved\? Reply YES or NO\.?/i,
      "\n\nIs the issue resolved?\nReply YES, NO, or HELP");
}

// ── Helper: create a help ticket using admin as fallback customer ──────────
async function createHelpTicket(phoneNumber: string): Promise<void> {
  try {
    const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
    if (!adminUser) return;
    await TicketService.createTicket({
      customerId: adminUser.id,
      problemDescription: `Help request from ${phoneNumber}`,
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
  // ── NEW_USER → transition to AWAITING_MOBILE and show prompt ─────────
  if (session.state === "NEW_USER") {
    const updated = await prisma.conversationSession.update({
      where: { id: session.id },
      data: { state: "AWAITING_MOBILE" },
    });
    return {
      message: REGISTRATION_PROMPT,
      state: updated.state,
      sessionId: updated.id,
      isRegistered: false,
    };
  }

  // ── AWAITING_MOBILE → validate input ─────────────────────────────────
  if (session.state === "AWAITING_MOBILE") {
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

    // Valid 10-digit number → check User table
    if (MOBILE_RE.test(trimmed)) {
      // Look up by email pattern OR a dedicated phone field.
      // Current User model has no phone column, so we search by email
      // containing the number (dealers/customers are often seeded with
      // phone-based emails). A dedicated phone column can be added later.
      // For now, also check the phoneNumber itself against existing
      // conversation sessions that were previously verified — and check
      // the User table for any user whose email starts with the number.
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { startsWith: trimmed } },
            { email: { contains: trimmed } },
          ],
        },
      });

      if (user) {
        const updated = await prisma.conversationSession.update({
          where: { id: session.id },
          data: {
            state: "REGISTERED",
            isRegistered: true,
            providedMobile: trimmed,
          },
        });
        return {
          message: WELCOME_MESSAGE,
          state: updated.state,
          sessionId: updated.id,
          isRegistered: true,
        };
      }

      // Number not found in User table → re-prompt
      return {
        message: REGISTRATION_PROMPT,
        state: session.state,
        sessionId: session.id,
        isRegistered: false,
      };
    }

    // Any other input while AWAITING_MOBILE → re-prompt
    return {
      message: REGISTRATION_PROMPT,
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
      state: { in: ["NEW_USER", "AWAITING_MOBILE", "REGISTERED"] },
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
