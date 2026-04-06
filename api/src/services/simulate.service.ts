// ── Simulate Service (Simplified Test Chat FSM) ──────────────────────────
//
// Flow overview:
//   GREETING       → any message → ask for serial number
//   SERIAL_INPUT   → normalize serial → call Passtest API
//                    → success: show machine details → MACHINE_CONFIRM
//                    → failure: show warning → MANUAL_NAME
//   MACHINE_CONFIRM → "1" (Yes) → create ticket (auto-route) → COMPLETED
//                    → "2" (No)  → MANUAL_NAME
//   MANUAL_NAME     → MANUAL_PLACE → MANUAL_PINCODE → create ticket → COMPLETED
//
// Global commands (any state): MENU (restart), BYE (close)

import prisma from "../lib/prisma";
import * as TicketService from "./ticket.service";
import { fetchMachineBySerial, type PasstestMachine } from "./machine.service";
import { io } from "../lib/socket";

// ── Session metadata shape ────────────────────────────────────────────────
type SessionMeta = {
  serialNumber?:   string;
  machineData?:    PasstestMachine | null;
  manualName?:     string;
  manualPlace?:    string;
  manualPincode?:  string;
  manualDistrict?: string;
  manualState?:    string;
};

// ── Static messages ───────────────────────────────────────────────────────
const GREETING_MSG =
  "Hello 👋\nWelcome to Poornasree Support 🤖\n\n" +
  "Please enter your machine serial number (e.g., PSR-24001 or 24001):";

// ── Entry point ───────────────────────────────────────────────────────────
export async function handleMessage(phoneNumber: string, message: string) {
  const text = message.trim();

  // ── Global navigation commands ──────────────────────────────────────────
  if (text.toUpperCase() === "MENU") {
    const s = await getOrCreateSession(phoneNumber);
    await updateSession(s.id, "GREETING", {});
    return makeReply(GREETING_MSG);
  }

  if (text.toUpperCase() === "BYE") {
    const s = await getOrCreateSession(phoneNumber);
    await updateSession(s.id, "COMPLETED", {});
    return makeReply("👋 Session closed. Thank you for contacting Poornasree Support!\n\nReply anything to start again.");
  }

  const session = await getOrCreateSession(phoneNumber);
  const meta: SessionMeta = (session.metadata as SessionMeta) ?? {};

  return routeState(session, phoneNumber, text, meta);
}

// ── State router ──────────────────────────────────────────────────────────
async function routeState(
  session: { id: string; state: string },
  phoneNumber: string,
  text: string,
  meta: SessionMeta,
) {
  switch (session.state) {
    case "GREETING":
    case "COMPLETED":
      // Fresh start or restart → ask for serial
      await updateSession(session.id, "SERIAL_INPUT", {});
      return makeReply(GREETING_MSG);

    case "SERIAL_INPUT":
      return handleSerialInput(session.id, meta, text);

    case "MACHINE_CONFIRM":
      return handleMachineConfirm(session.id, phoneNumber, meta, text);

    case "MANUAL_NAME":
      return handleManualName(session.id, meta, text);

    case "MANUAL_PLACE":
      return handleManualPlace(session.id, meta, text);

    case "MANUAL_PINCODE":
      return handleManualPincode(session.id, phoneNumber, meta, text);

    default:
      await updateSession(session.id, "SERIAL_INPUT", {});
      return makeReply(GREETING_MSG);
  }
}

// ── SERIAL_INPUT ──────────────────────────────────────────────────────────
async function handleSerialInput(sessionId: string, _meta: SessionMeta, text: string) {
  // Normalize: strip whitespace, uppercase, prepend PSR- if only digits
  let serial = text.replace(/\s+/g, "").toUpperCase();
  if (/^\d+$/.test(serial)) {
    serial = `PSR-${serial}`;
  }
  // Also handle "psr24001" without dash → "PSR-24001"
  const noDash = serial.match(/^PSR(\d+)$/);
  if (noDash) {
    serial = `PSR-${noDash[1]}`;
  }

  if (serial.length < 3) {
    return makeReply("Please enter a valid serial number (e.g., PSR-24001 or 24001):");
  }

  // Call Passtest API
  let machineData: PasstestMachine | null = null;
  try {
    machineData = await fetchMachineBySerial(serial);
  } catch {
    // API error — continue to manual flow
  }

  if (machineData) {
    const newMeta: SessionMeta = { serialNumber: serial, machineData };
    await updateSession(sessionId, "MACHINE_CONFIRM", newMeta);
    return makeReply(
      `We found your machine details:\n\n` +
      `Customer: ${machineData.customer || "N/A"}\n` +
      `Model: ${machineData.m_model || "N/A"}\n` +
      `Product Code: ${machineData.product_code || "N/A"}\n` +
      `Location: ${[machineData.Address1, machineData.Address2].filter(Boolean).join(", ") || "N/A"}\n\n` +
      `Is this your machine?\n\n` +
      `1 - Yes ✅\n` +
      `2 - No ❌`
    );
  }

  // API failed or machine not found → manual flow
  const newMeta: SessionMeta = { serialNumber: serial, machineData: null };
  await updateSession(sessionId, "MANUAL_NAME", newMeta);
  return makeReply(
    "⚠️ We couldn't fetch machine details. Please continue manually.\n\n" +
    "Please enter your name:"
  );
}

// ── MACHINE_CONFIRM ───────────────────────────────────────────────────────
async function handleMachineConfirm(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  if (text === "1") {
    // Yes — create ticket with API data + auto-route
    return createTicketFromAPI(sessionId, phoneNumber, meta);
  }
  if (text === "2") {
    // No — fall to manual flow (keep serial)
    await updateSession(sessionId, "MANUAL_NAME", {
      serialNumber: meta.serialNumber,
      machineData: null,
    });
    return makeReply("Please enter your name:");
  }
  return makeReply("Please reply:\n1 - Yes ✅\n2 - No ❌");
}

// ── MANUAL_NAME ───────────────────────────────────────────────────────────
async function handleManualName(sessionId: string, meta: SessionMeta, text: string) {
  if (text.length < 2) {
    return makeReply("Please enter your full name (at least 2 characters):");
  }
  await updateSession(sessionId, "MANUAL_PLACE", { ...meta, manualName: text });
  return makeReply("Please enter your location:");
}

// ── MANUAL_PLACE ──────────────────────────────────────────────────────────
async function handleManualPlace(sessionId: string, meta: SessionMeta, text: string) {
  if (text.length < 2) {
    return makeReply("Please enter your location:");
  }
  await updateSession(sessionId, "MANUAL_PINCODE", { ...meta, manualPlace: text });
  return makeReply("Please enter your pincode (6 digits):");
}

// ── MANUAL_PINCODE → create ticket ───────────────────────────────────────
async function handleManualPincode(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  if (!/^\d{6}$/.test(text)) {
    return makeReply("Please enter a valid 6-digit pincode (numbers only):");
  }

  // Auto-detect location from India Pincode API
  let district: string | undefined;
  let stateName: string | undefined;
  let place = meta.manualPlace;
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
      place = po.Name || place;
      district = po.District || undefined;
      stateName = po.State || undefined;
    }
  } catch {
    // Non-blocking
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    manualPincode: text,
    manualPlace: place,
    manualDistrict: district,
    manualState: stateName,
  };

  return createTicketManual(sessionId, phoneNumber, updatedMeta);
}

// ── Ticket creation: from API data ────────────────────────────────────────
async function createTicketFromAPI(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
) {
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply("Service temporarily unavailable. Please try again later.");
  }

  const md = meta.machineData!;
  const serial = meta.serialNumber ?? "";

  // Match customer name against dealer table (case-insensitive)
  let resolvedDealerId: string | undefined;
  if (md.customer?.trim()) {
    const customerName = md.customer.trim().toLowerCase();
    const dealers = await prisma.user.findMany({
      where: { role: "dealer" },
      select: { id: true, firstName: true, lastName: true },
    });
    const matched = dealers.find(d => {
      const fullName = [d.firstName, d.lastName].filter(Boolean).join(" ").toLowerCase();
      return fullName === customerName || d.firstName.toLowerCase() === customerName;
    });
    if (matched) {
      resolvedDealerId = matched.id;
    }
  }

  const description = [
    `Customer: ${md.customer || "N/A"}`,
    `Model: ${md.m_model || "N/A"}`,
    `Product Code: ${md.product_code || "N/A"}`,
    `Location: ${[md.Address1, md.Address2].filter(Boolean).join(", ") || "N/A"}`,
    `Serial: ${serial}`,
    `Phone: ${phoneNumber}`,
  ].join("\n");

  const ticket = await TicketService.createTicket({
    customerId:          adminUser.id,
    problemDescription:  description,
    machineName:         md.m_model || undefined,
    machineSerialNumber: serial,
    phoneNumber,
    dealerId:            resolvedDealerId,
  });

  // Emit to the correct room based on routing
  if (ticket.ownerType === "DEALER" && ticket.ownerId) {
    io?.to(`dealer:${ticket.ownerId}`).emit("ticket:new", ticket);
  } else {
    io?.to("managers").emit("ticket:new", ticket);
  }

  await updateSession(sessionId, "COMPLETED", {});

  return makeReply(
    `✅ Your request has been registered successfully.\n\n` +
    `🎫 Ticket: *${ticket.ticketNumber}*\n\n` +
    `Our service engineer will contact you shortly.\n\n` +
    `Thank you for choosing Poornasree Support 😊\n\n` +
    `Reply MENU to go back to main menu.`
  );
}

// ── Ticket creation: manual entry ─────────────────────────────────────────
async function createTicketManual(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
) {
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply("Service temporarily unavailable. Please try again later.");
  }

  // Resolve or create Pincode record
  let pincodeId: string | undefined;
  if (meta.manualPincode) {
    let pincodeRecord = await prisma.pincode.findFirst({ where: { code: meta.manualPincode } });
    if (!pincodeRecord) {
      pincodeRecord = await prisma.pincode.create({
        data: {
          code: meta.manualPincode,
          place: meta.manualPlace || null,
          district: meta.manualDistrict || null,
          state: meta.manualState || null,
        },
      });
    }
    pincodeId = pincodeRecord.id;
  }

  const description = [
    `Customer Name: ${meta.manualName || "N/A"}`,
    `Place: ${meta.manualPlace || "N/A"}`,
    `District: ${meta.manualDistrict || "N/A"}`,
    `State: ${meta.manualState || "N/A"}`,
    `Pincode: ${meta.manualPincode || "N/A"}`,
    `Serial: ${meta.serialNumber || "N/A"}`,
    `Phone: ${phoneNumber}`,
  ].join("\n");

  // Manual flow → always routes to MANAGER (no API data for dealer match)
  const ticket = await TicketService.createTicket({
    customerId:          adminUser.id,
    problemDescription:  description,
    machineSerialNumber: meta.serialNumber || undefined,
    pincodeId,
    phoneNumber,
    place:               meta.manualPlace,
    district:            meta.manualDistrict,
    state:               meta.manualState,
  });

  io?.to("managers").emit("ticket:new", ticket);

  await updateSession(sessionId, "COMPLETED", {});

  return makeReply(
    `✅ Your request has been registered successfully.\n\n` +
    `🎫 Ticket: *${ticket.ticketNumber}*\n\n` +
    `Our service engineer will contact you shortly.\n\n` +
    `Thank you for choosing Poornasree Support 😊\n\n` +
    `Reply MENU to go back to main menu.`
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeReply(message: string) {
  return { message };
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

// ── History (kept for frontend) ───────────────────────────────────────────
export async function getHistory(phoneNumber: string) {
  return prisma.simulateMessage.findMany({
    where:   { phoneNumber },
    orderBy: { createdAt: "asc" },
    select:  { id: true, role: true, content: true, createdAt: true },
  });
}
