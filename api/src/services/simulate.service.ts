// ── Simulate Service ──────────────────────────────────────────────────────
// State-machine gatekeeper that enforces registration before any feature.
// States: NEW_USER → AWAITING_MOBILE → REGISTERED
//
// Once REGISTERED the user gets a welcome message. Future stages will
// route registered users into the troubleshooting engine or menu system.

import prisma from "../lib/prisma";

// ── Constants ─────────────────────────────────────────────────────────────

const REGISTRATION_PROMPT =
  "📱 This mobile number is not registered with us.\n\n" +
  "If you are a Registered Customer, please provide your registered 10 digit mobile number.\n\n" +
  "Eg: 9633503333\n\n" +
  "Else reply SKIP to continue.";

const WELCOME_MESSAGE = "Welcome! Please describe your issue.";

const MOBILE_RE = /^\d{10}$/;

// ── handleMessage ─────────────────────────────────────────────────────────
// Single entry point — every incoming "WhatsApp" message flows through here.

export async function handleMessage(phoneNumber: string, message: string) {
  const session = await loadOrCreateSession(phoneNumber);

  // ── Gatekeeper: block everything until REGISTERED ────────────────────
  if (session.state !== "REGISTERED") {
    return gatekeeper(session, message);
  }

  // ── Post-registration: user is registered ────────────────────────────
  return {
    message: WELCOME_MESSAGE,
    state: session.state,
    sessionId: session.id,
    isRegistered: session.isRegistered,
  };
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
