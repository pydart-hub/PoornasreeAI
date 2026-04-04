// â”€â”€ Simulate Service (V-Guard-Style FSM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Flow overview:
//   GREETING       â†’ any message â†’ show main menu
//   MAIN_MENU      â†’ "1" â†’ product list  |  "2" â†’ help info
//   PRODUCT_SELECT â†’ "N:issue" â†’ classify â†’ start troubleshooting steps
//   TROUBLESHOOTING â†’ "1"(done)/"2"(next step)/"3"(help) â†’ step walkthrough
//   ESCALATION_NAME â†’ ESCALATION_PLACE â†’ ESCALATION_PINCODE â†’ ESCALATION_SERIAL
//                  â†’ create Ticket â†’ COMPLETED
//
// Global commands (any state): MENU (restart), BYE (close)
// Session timeout: 10-min inactivity â†’ warning; 30-min â†’ auto-reset

import prisma from "../lib/prisma";
import * as TroubleshootingService from "./troubleshooting.service";
import * as TicketService from "./ticket.service";
import { findVideosForQuery } from "../controllers/video.controller";
import { embedText, searchVectors } from "./vector.service";
import { io } from "../lib/socket";

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const INACTIVITY_WARN_MS  = 10 * 60 * 1000; // 10 min â†’ warning
const INACTIVITY_RESET_MS = 30 * 60 * 1000; // 30 min â†’ auto-reset

// â”€â”€ Static messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GREETING_MSG =
  "Hello ðŸ‘‹\nWelcome to Poornasree Support ðŸ¤–\n\n" +
  "ðŸ“œ Here are the options for you:\n" +
  "1 - Register a Complaint\n" +
  "2 - Help / Support\n\n" +
  "Please reply with your choice.";

const INVALID_MENU_MSG =
  "Please reply with:\n1 - Register a Complaint\n2 - Help / Support";

const HELP_MSG =
  "ðŸ“ž For immediate assistance please call our support team.\n\n" +
  "To register a complaint reply 1.\n\n" +
  "Reply MENU to go back to main menu.";

const INVALID_PRODUCT_FORMAT =
  "Please reply in the format:\n<number>:<issue>\n\nExample:\n2: machine not turning on";

const escalationIntro =
  "ðŸš§ Unable to resolve the issue remotely. Please provide your details to create a service request.";

const INACTIVITY_WARN_MSG =
  "â³ We are waiting for your input.\n\n" +
  "ðŸ”™ Reply MENU for Main Menu\n" +
  "ðŸ”š Reply BYE to close this session";

const SESSION_EXPIRED_MSG =
  "Sorry! Your session has ended due to inactivity.\n\nReply anything to start a new conversation.";

// â”€â”€ Problem keywords â†’ problemType mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PROBLEM_KEYWORDS: { keywords: string[]; problemType: string }[] = [
  { keywords: ["power", "start", "starting", "turn", "not working", "not turning", "dead", "switch on", "switch off"], problemType: "power_issue" },
  { keywords: ["display", "screen", "blank", "no display", "dark"], problemType: "no_display" },
  { keywords: ["vibr", "vibration", "vibro", "shaking", "shak"], problemType: "vibration_issue" },
  { keywords: ["calibrat", "reading", "measurement", "accuracy", "result", "wrong value"], problemType: "calibration_issue" },
  { keywords: ["leak", "overflow", "water", "liquid", "drip"], problemType: "leakage_issue" },
  { keywords: ["noise", "sound", "loud", "beep", "rattle"], problemType: "noise_issue" },
  { keywords: ["network", "wifi", "connect", "offline", "internet", "bluetooth"], problemType: "connectivity_issue" },
  { keywords: ["heat", "hot", "overheat", "burn", "smoke"], problemType: "overheating_issue" },
  { keywords: ["charge", "battery", "solar", "power supply", "adapter"], problemType: "power_supply_issue" },
];

function detectProblemType(issue: string): string | null {
  const lower = issue.toLowerCase();
  for (const entry of PROBLEM_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.problemType;
    }
  }
  return null;
}

// â”€â”€ Session metadata shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type SessionMeta = {
  productId?:               string;
  productName?:             string;
  issueDescription?:        string;
  problemType?:             string;
  troubleshootingSessionId?: string;
  escName?:                 string;
  escPlace?:                string;
  escPincode?:              string;
  escDistrict?:             string;
  escState?:                string;
};

// â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function handleMessage(phoneNumber: string, message: string) {
  const text = message.trim();

  // â”€â”€ Global navigation commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (text.toUpperCase() === "MENU") {
    const s = await getOrCreateSession(phoneNumber);
    await updateSession(s.id, "GREETING", {});
    return makeReply(GREETING_MSG);
  }

  if (text.toUpperCase() === "BYE") {
    const s = await getOrCreateSession(phoneNumber);
    await updateSession(s.id, "COMPLETED", {});
    return makeReply("ðŸ‘‹ Session closed. Thank you for contacting Poornasree Support!\n\nReply anything to start again.");
  }

  const session = await getOrCreateSession(phoneNumber);
  const meta: SessionMeta = (session.metadata as SessionMeta) ?? {};

  // â”€â”€ Inactivity timeout check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (session.state !== "GREETING" && session.state !== "COMPLETED") {
    const idleMs = Date.now() - new Date(session.updatedAt).getTime();
    if (idleMs > INACTIVITY_RESET_MS) {
      await updateSession(session.id, "GREETING", {});
      await prisma.simulateMessage.create({
        data: { phoneNumber, role: "bot", content: SESSION_EXPIRED_MSG },
      });
      return makeReply(GREETING_MSG);
    }
    if (idleMs > INACTIVITY_WARN_MS && text === "") {
      return makeReply(INACTIVITY_WARN_MSG);
    }
  }

  return routeState(session, phoneNumber, text, meta);
}

// â”€â”€ State router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function routeState(
  session: { id: string; state: string },
  phoneNumber: string,
  text: string,
  meta: SessionMeta,
) {
  switch (session.state) {
    // Legacy states and fresh start â†’ show greeting menu
    case "GREETING":
    case "COMPLETED":
    case "NEW_USER":
    case "AWAITING_SERIAL":
    case "REGISTERED":
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(GREETING_MSG);

    case "MAIN_MENU":
      return handleMainMenu(session.id, meta, text);

    case "PRODUCT_SELECT":
      return handleProductSelect(session.id, phoneNumber, meta, text);

    case "TROUBLESHOOTING":
      return handleTroubleshooting(session.id, phoneNumber, meta, text);

    case "ESCALATION_NAME":
      return handleEscalationName(session.id, meta, text);

    case "ESCALATION_PLACE":
      return handleEscalationPlace(session.id, meta, text);

    case "ESCALATION_PINCODE":
      return handleEscalationPincode(session.id, meta, text);

    case "ESCALATION_LOCATION_CONFIRM":
      return handleEscalationLocationConfirm(session.id, meta, text);

    case "ESCALATION_SERIAL":
      return handleEscalationSerial(session.id, phoneNumber, meta, text);

    default:
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(GREETING_MSG);
  }
}

// â”€â”€ MAIN_MENU â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleMainMenu(sessionId: string, meta: SessionMeta, text: string) {
  if (text === "1") {
    const products = await getActiveProducts();
    if (products.length === 0) {
      return makeReply(
        "No products are configured yet. Please contact support.\n\nReply MENU to start over."
      );
    }
    const list = products.map((p, i) => `${i + 1} - ${p.name}`).join("\n");
    await updateSession(sessionId, "PRODUCT_SELECT", meta);
    return makeReply(
      `ðŸ“œ List of Products:\n${list}\n\n` +
      `To register a complaint, reply in this format:\n<number>:<issue>\n\nExample:\n2: machine not turning on`
    );
  }

  if (text === "2") {
    return makeReply(HELP_MSG);
  }

  return makeReply(INVALID_MENU_MSG);
}

// â”€â”€ PRODUCT_SELECT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleProductSelect(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  const match = text.match(/^(\d+)\s*[:\-]\s*(.+)$/s);
  if (!match) {
    return makeReply(INVALID_PRODUCT_FORMAT);
  }

  const idx   = parseInt(match[1], 10) - 1;
  const issue = match[2].trim();

  const products = await getActiveProducts();
  if (idx < 0 || idx >= products.length) {
    const list = products.map((p, i) => `${i + 1} - ${p.name}`).join("\n");
    return makeReply(
      `Please reply with a valid product number (1â€“${products.length}).\n\nðŸ“œ Products:\n${list}\n\nFormat: <number>:<issue>`
    );
  }

  const product = products[idx];

  // AI / keyword classify
  let problemType = detectProblemType(issue);

  // Fall back to RAG if no keyword match
  if (!problemType) {
    problemType = await classifyWithRAG(issue);
  }

  const newMeta: SessionMeta = {
    ...meta,
    productId:        product.id,
    productName:      product.name,
    issueDescription: issue,
    problemType:      problemType ?? "general_issue",
  };

  // Try to find a matching troubleshooting template
  const template = problemType
    ? await prisma.troubleshootingTemplate.findUnique({
        where: { problemType },
        include: { steps: { orderBy: { stepNumber: "asc" } } },
      })
    : null;

  if (!template || !template.isActive || template.steps.length === 0) {
    // No template â†’ go straight to escalation
    await updateSession(sessionId, "ESCALATION_NAME", newMeta);
    return makeReply(
      `âœ… Issue noted for *${product.name}*: "${issue}"\n\n${escalationIntro}\n\n` +
      `Please enter your name:`
    );
  }

  // Start troubleshooting session (serial = phoneNumber as placeholder)
  const tsResult = await TroubleshootingService.startSession(
    phoneNumber,
    phoneNumber,
    template.problemType,
  );

  newMeta.troubleshootingSessionId = tsResult.session.id;
  await updateSession(sessionId, "TROUBLESHOOTING", newMeta);

  const stepText = formatStepMessage(tsResult.message);
  const videos   = await getVideosFor(template.problemType, tsResult.message);

  return makeReply(
    `âœ… Issue noted for *${product.name}*: "${issue}"\n\nLet's troubleshoot step by step.\n\n${stepText}`,
    videos,
  );
}

// ── TROUBLESHOOTING ───────────────────────────────────────────────────────────
// Response semantics:
//   1 (Done)        → advance to next step; if last step → issue RESOLVED (no ticket)
//   2 (Not Working) → advance to next step; if last step → ESCALATE (create ticket)
//   3 (Need Help)   → immediate ESCALATION regardless of step
async function handleTroubleshooting(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  if (!["1", "2", "3"].includes(text)) {
    return makeReply(
      "Please reply:\n1 - Done ✅\n2 - Not Working ❌\n3 - Need Help 🆘"
    );
  }

  if (!meta.troubleshootingSessionId) {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(GREETING_MSG);
  }

  const tsSessionId = meta.troubleshootingSessionId;

  // ── 3 (Need Help) → immediate escalation ──────────────────────────────────
  if (text === "3") {
    await TroubleshootingService.escalateSession(tsSessionId);
    await updateSession(sessionId, "ESCALATION_NAME", meta);
    return makeReply(`${escalationIntro}\n\nPlease enter your name:`);
  }

  // ── Determine current position in the troubleshooting flow ─────────────────
  const tsSession = await prisma.troubleshootingSession.findUnique({
    where: { id: tsSessionId },
  });
  if (!tsSession || tsSession.status !== "ACTIVE") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(GREETING_MSG);
  }

  const totalSteps = await prisma.troubleshootingStep.count({
    where: { template: { problemType: tsSession.problemType } },
  });
  const isLastStep = tsSession.currentStep >= totalSteps;

  // ── 1 (Done) → advance; resolve if last step ──────────────────────────────
  if (text === "1") {
    if (isLastStep) {
      await TroubleshootingService.completeSession(tsSessionId);
      await updateSession(sessionId, "COMPLETED", meta);
      return makeReply(
        "✅ Great! Your issue is resolved. We are glad we could help!\n\n" +
        "Thank you for choosing Poornasree Support 😊\n\nReply MENU to return to main menu."
      );
    }
    const result = await TroubleshootingService.moveToNextStep(tsSessionId);
    const stepText = formatStepMessage(result.message);
    const videos   = await getVideosFor(meta.problemType ?? "", result.message);
    return makeReply(stepText, videos);
  }

  // ── 2 (Not Working) → advance; escalate if last step ──────────────────────
  if (isLastStep) {
    await TroubleshootingService.escalateSession(tsSessionId);
    await updateSession(sessionId, "ESCALATION_NAME", meta);
    return makeReply(`${escalationIntro}\n\nPlease enter your name:`);
  }
  const result = await TroubleshootingService.moveToNextStep(tsSessionId);
  const stepText = formatStepMessage(result.message);
  const videos   = await getVideosFor(meta.problemType ?? "", result.message);
  return makeReply(stepText, videos);
}

// â”€â”€ ESCALATION: Name â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleEscalationName(sessionId: string, meta: SessionMeta, text: string) {
  if (text.length < 2) {
    return makeReply("Please enter your full name (at least 2 characters):");
  }
  await updateSession(sessionId, "ESCALATION_PLACE", { ...meta, escName: text });
  return makeReply("Please enter your place/location:");
}

// â”€â”€ ESCALATION: Place â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleEscalationPlace(sessionId: string, meta: SessionMeta, text: string) {
  if (text.length < 2) {
    return makeReply("Please enter your place/location:");
  }
  await updateSession(sessionId, "ESCALATION_PINCODE", { ...meta, escPlace: text });
  return makeReply("Please enter your pincode (6 digits):");
}

// â”€â”€ ESCALATION: Pincode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleEscalationPincode(sessionId: string, meta: SessionMeta, text: string) {
  if (!/^\d{6}$/.test(text)) {
    return makeReply("Please enter a valid 6-digit pincode (numbers only):");
  }

  // Call India Pincode API to auto-detect location
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${text}`);
    const data = await response.json();
    if (
      Array.isArray(data) &&
      data[0]?.Status === "Success" &&
      Array.isArray(data[0]?.PostOffice) &&
      data[0].PostOffice.length > 0
    ) {
      const po = data[0].PostOffice[0];
      const place = po.Name || meta.escPlace || "Unknown";
      const district = po.District || "";
      const stateName = po.State || "";

      const newMeta: SessionMeta = {
        ...meta,
        escPincode: text,
        escPlace: place,
        escDistrict: district,
        escState: stateName,
      };
      await updateSession(sessionId, "ESCALATION_LOCATION_CONFIRM", newMeta);
      return makeReply(
        `📍 Location detected:\n\n` +
        `Place: ${place}\n` +
        `District: ${district}\n` +
        `State: ${stateName}\n` +
        `Pincode: ${text}\n\n` +
        `Is this correct?\n1 - Yes ✅\n2 - No, re-enter pincode ❌`
      );
    }
  } catch {
    // API failed — fall through to manual flow
  }

  // Fallback: pincode API failed or returned no results
  await updateSession(sessionId, "ESCALATION_SERIAL", { ...meta, escPincode: text });
  return makeReply("Please enter the last 5 digits of your machine serial number:");
}

// ── ESCALATION: Location Confirm ──────────────────────────────────────────
async function handleEscalationLocationConfirm(sessionId: string, meta: SessionMeta, text: string) {
  if (text === "1") {
    // Confirmed — proceed to serial
    await updateSession(sessionId, "ESCALATION_SERIAL", meta);
    return makeReply("Please enter the last 5 digits of your machine serial number:");
  }
  if (text === "2") {
    // Re-enter pincode
    await updateSession(sessionId, "ESCALATION_PINCODE", {
      ...meta,
      escPincode: undefined,
      escDistrict: undefined,
      escState: undefined,
    });
    return makeReply("Please enter your pincode (6 digits):");
  }
  return makeReply("Please reply:\n1 - Yes ✅\n2 - No, re-enter pincode ❌");
}

// â”€â”€ ESCALATION: Serial â†’ create ticket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleEscalationSerial(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  const cleaned = text.replace(/[^0-9A-Za-z]/g, "");
  if (!/^[0-9A-Za-z]{5}$/.test(cleaned)) {
    return makeReply("Please enter exactly 5 alphanumeric characters (e.g., 00123):");
  }

  // Resolve or create Pincode record
  let pincodeRecord = await prisma.pincode.findFirst({ where: { code: meta.escPincode! } });
  if (!pincodeRecord) {
    pincodeRecord = await prisma.pincode.create({
      data: { code: meta.escPincode!, place: meta.escPlace || null, district: meta.escDistrict || null, state: meta.escState || null },
    });
  }

  // Use admin as system customer (no real customer account for WhatsApp users)
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply("Service temporarily unavailable. Please try again later.");
  }

  const description = [
    `Product: ${meta.productName ?? "Unknown"}`,
    `Issue: ${meta.issueDescription ?? "Not specified"}`,
    `Customer Name: ${meta.escName}`,
    `Place: ${meta.escPlace}`,
    `District: ${meta.escDistrict || "N/A"}`,
    `State: ${meta.escState || "N/A"}`,
    `Pincode: ${meta.escPincode}`,
    `Serial (last 5): ${cleaned}`,
    `Phone: ${phoneNumber}`,
  ].join("\n");

  const ticket = await TicketService.createTicket({
    customerId:         adminUser.id,
    problemDescription: description,
    machineName:        meta.productName,
    machineSerialNumber: cleaned,
    pincodeId:          pincodeRecord.id,
    phoneNumber,
    place:              meta.escPlace,
    district:           meta.escDistrict,
    state:              meta.escState,
  });

  // Notify service manager dashboard via socket
  io?.to("managers").emit("ticket:new", ticket);

  await updateSession(sessionId, "COMPLETED", {});

  return makeReply(
    `âœ… Your service request has been registered.\n\n` +
    `ðŸŽ« Ticket: *${ticket.ticketNumber}*\n\n` +
    `Our service engineer will contact you shortly.\n\n` +
    `Thank you for choosing Poornasree Support ðŸ˜Š\n\n` +
    `Reply MENU to go back to main menu.`
  );
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeReply(message: string, videos?: unknown[]) {
  return {
    message,
    ...(videos && videos.length > 0 ? { videos } : {}),
  };
}

/** Reformat step message from troubleshooting.service to V-Guard style. */
function formatStepMessage(raw: string): string {
  // Strip legacy "Reply YES or NO" / "Reply YES, NO, or HELP" tails
  const stripped = raw
    .replace(/\n?Is the issue resolved\?.*$/is, "")
    .replace(/\nReply YES.*$/i, "")
    .trimEnd();
  return `${stripped}\n\nReply:\n1 - Done âœ…\n2 - Not Working âŒ\n3 - Need Help ðŸ†˜`;
}

async function getVideosFor(problemType: string, stepMsg: string) {
  try {
    const q = `${problemType.replace(/_/g, " ")} ${stepMsg}`;
    return await findVideosForQuery(q, 2);
  } catch {
    return [];
  }
}

async function getActiveProducts() {
  return prisma.product.findMany({
    where:   { isActive: true },
    orderBy: { displayOrder: "asc" },
  });
}

async function getOrCreateSession(phoneNumber: string) {
  const existing = await prisma.conversationSession.findFirst({
    where: {
      phoneNumber,
      state: { notIn: ["COMPLETED"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.conversationSession.create({
    data: { phoneNumber, state: "GREETING" },
  });
}

async function updateSession(id: string, state: string, meta: SessionMeta) {
  return prisma.conversationSession.update({
    where: { id },
    data:  { state, metadata: meta as object },
  });
}

/** Try to classify issue description using RAG vector search. */
async function classifyWithRAG(issue: string): Promise<string | null> {
  try {
    const embedding = await embedText(issue);
    const hits = await searchVectors(embedding, 3, ["service"]);
    const MIN_SCORE = 0.5;
    const relevant = hits.filter((h) => h.score >= MIN_SCORE);
    if (relevant.length === 0) return null;
    // Try to extract a problemType from the payload tags
    const top = relevant[0];
    return (top.payload.problemType as string) || null;
  } catch {
    return null;
  }
}
