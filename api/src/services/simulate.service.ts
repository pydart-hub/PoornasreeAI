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

// ── Constants ─────────────────────────────────────────────────────────────

const REGISTRATION_PROMPT =
  "📱 This mobile number is not registered with us.\n\n" +
  "If you are a Registered Customer, please provide your registered 10 digit mobile number.\n\n" +
  "Eg: 9633503333\n\n" +
  "Else reply SKIP to continue.";

const WELCOME_MESSAGE = "Welcome! Please describe your issue.";

const DESCRIBE_ISSUE_MESSAGE =
  "Please describe your issue clearly (e.g., machine not turning on, no display, vibration issue).";

const RESOLVED_MESSAGE = "✅ Glad your issue is resolved.";

const ESCALATED_MESSAGE = "🚧 Service request created. Our engineer will contact you.";

const MOBILE_RE = /^\d{10}$/;

// ── Problem detection (keyword-based, no AI) ──────────────────────────────

const PROBLEM_KEYWORDS: { keywords: string[]; problemType: string }[] = [
  { keywords: ["not turning on", "no power", "not starting"], problemType: "power_issue" },
  { keywords: ["no display", "blank screen"],                 problemType: "no_display" },
  { keywords: ["vibration", "shaking"],                       problemType: "vibration_issue" },
];

function detectProblemType(message: string): string | null {
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
  const session = await loadOrCreateSession(phoneNumber);

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

  // ── CASE 2: Active troubleshooting session exists ────────────────────
  if (activeTs) {
    const result = await TroubleshootingService.handleResponse(activeTs.id, message);

    // Map troubleshooting-service responses to strict output format
    if (result.done) {
      const tsSession = result.session as { status: string };
      if (tsSession.status === "COMPLETED") {
        return reply(RESOLVED_MESSAGE);
      }
      // ESCALATED (either via HELP or last-step auto-escalation)
      return reply(ESCALATED_MESSAGE);
    }

    // Ongoing step or invalid-input re-prompt
    return reply(result.message);
  }

  // ── CASE 1: No active troubleshooting session ───────────────────────

  // Special: if user types HELP without an active session → immediate escalation
  if (message.trim().toUpperCase() === "HELP") {
    return reply("No active troubleshooting session. " + DESCRIBE_ISSUE_MESSAGE);
  }

  const problemType = detectProblemType(message);

  if (!problemType) {
    // Could not identify problem from keywords
    return reply(DESCRIBE_ISSUE_MESSAGE);
  }

  // Verify that a template exists for this problem type
  const template = await prisma.troubleshootingTemplate.findUnique({
    where: { problemType },
  });

  if (!template || !template.isActive) {
    return reply("We could not identify the issue. Reply HELP to create a service request.");
  }

  // Start a new troubleshooting session
  // serialNumber is not yet collected — use phoneNumber as placeholder
  const tsResult = await TroubleshootingService.startSession(phoneNumber, phoneNumber, problemType);

  return reply(tsResult.message);
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
