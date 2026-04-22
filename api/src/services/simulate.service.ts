// ── Simulate Service (WhatsApp Customer Chat FSM) ────────────────────────
//
// Flow overview:
//   GREETING        → check registration → greet or ask phone
//   ASK_PHONE       → validate 10-digit → lookup → MAIN_MENU or re-ask
//   MAIN_MENU       → route to selected option
//   VIEW_PRODUCTS   → display product list → back to menu
//   COMPLAINT_NAME  → collect name → COMPLAINT_PINCODE
//   COMPLAINT_PINCODE → 6-digit pincode → fetch place → COMPLAINT_PINCODE_CONFIRM
//   COMPLAINT_PINCODE_CONFIRM → confirm place → COMPLAINT_SERIAL
//   COMPLAINT_SERIAL → serial number → Passtest API → MACHINE_CONFIRM or COMPLAINT_PRODUCT
//   MACHINE_CONFIRM  → confirm machine → COMPLAINT_PRODUCT
//   COMPLAINT_PRODUCT → select product → COMPLAINT_ISSUE
//   COMPLAINT_ISSUE   → free-text complaint → create ticket → COMPLETED
//   CHECK_STATUS      → show active tickets → back to menu
//   FEEDBACK_RATING   → 1-5 rating → FEEDBACK_SATISFIED
//   FEEDBACK_SATISFIED → yes/no → COMPLETED
//
// Global commands (any state): MENU (restart), BYE (close)

import prisma from "../lib/prisma";
import * as TicketService from "./ticket.service";
import { fetchMachineBySerial, type PasstestMachine } from "./machine.service";
import { io } from "../lib/socket";
import { env } from "../config/env";

// ── Session metadata shape ────────────────────────────────────────────────
type SessionMeta = {
  customerName?:    string;
  customerPhone?:   string;
  serialNumber?:    string;
  machineData?:     PasstestMachine | null;
  manualName?:      string;
  manualPlace?:     string;
  manualPincode?:   string;
  manualDistrict?:  string;
  manualState?:     string;
  complaint?:       string;
  pincodeDisplay?:  string;
  selectedProduct?: string;
  feedbackTicketId?: string;
  tsSessionId?:     string;
  tsSerialPath?:    boolean;
};

// ── Static messages ───────────────────────────────────────────────────────
const SKIP_BUTTON: ReplyButton = { id: "SKIP", title: "Skip ⏭️" };
const MENU_BUTTON: ReplyButton = { id: "MENU", title: "⬅️ Main Menu" };
const COMPLAINT_BUTTON: ReplyButton = { id: "2", title: "Register Complaint" };
const YES_NO_BUTTONS: ReplyButton[] = [
  { id: "1", title: "Yes ✅" },
  { id: "2", title: "No ❌" },
];

const MAIN_MENU_LIST: ReplyList = {
  buttonText: "View Options 📋",
  rows: [
    { id: "1", title: "View Our Products", description: "Browse our product catalog" },
    { id: "2", title: "Complaint Registration", description: "Register a new complaint" },
    { id: "3", title: "Complaint Status", description: "Check existing ticket status" },
    { id: "4", title: "Product Installation", description: "Request product installation" },
    { id: "5", title: "Speak to Support", description: "Connect with our support team" },
  ],
};

const RATING_LIST: ReplyList = {
  buttonText: "Rate Service ⭐",
  rows: [
    { id: "1", title: "1 - Poor ⭐" },
    { id: "2", title: "2 - Fair ⭐⭐" },
    { id: "3", title: "3 - Good ⭐⭐⭐" },
    { id: "4", title: "4 - Very Good ⭐⭐⭐⭐" },
    { id: "5", title: "5 - Excellent ⭐⭐⭐⭐⭐" },
  ],
};

const NOT_REGISTERED_MSG =
  `📱 This mobile number is not registered with us.\n\n` +
  `If you are a Registered Customer, please provide your registered 10 digit mobile number.\n\n` +
  `Eg. 9633503333\n\n` +
  `Or press *Skip* to Continue. 👇`;

const MAIN_MENU_MSG =
  `Welcome to *Poornasree HelpDesk* 🤖📲\n\n` +
  `Please select an option below 👇`;

// ── Entry point ───────────────────────────────────────────────────────────
export async function handleMessage(phoneNumber: string, message: string) {
  const text = message.trim();
  const upper = text.toUpperCase();

  // ── Global navigation commands (any state except feedback) ──────────────
  if (upper === "MENU" || upper === "START" || upper === "RESET" || /^H[IE]+I*$/.test(upper) || /^HELL+O*$/.test(upper)) {
    const s = await getOrCreateSession(phoneNumber);
    const meta: SessionMeta = (s.metadata as SessionMeta) ?? {};
    // If in feedback flow, don't interrupt
    if (s.state === "FEEDBACK_RATING" || s.state === "FEEDBACK_SATISFIED") {
      return routeState(s, phoneNumber, text, meta);
    }
    return startGreeting(phoneNumber);
  }

  if (upper === "BYE") {
    const s = await getOrCreateSession(phoneNumber);
    await updateSession(s.id, "COMPLETED", {});
    return makeReply("👋 Session closed. Thank you for contacting Poornasree Support!\n\nReply anything to start again.");
  }

  const session = await getOrCreateSession(phoneNumber);
  const meta: SessionMeta = (session.metadata as SessionMeta) ?? {};

  return routeState(session, phoneNumber, text, meta);
}

// ── Greeting / Registration check ─────────────────────────────────────────
async function startGreeting(phoneNumber: string) {
  const session = await getOrCreateSession(phoneNumber);

  // Check if this phone has raised a ticket before
  const existingTicket = await prisma.ticket.findFirst({
    where: { phoneNumber },
    orderBy: { createdAt: "desc" },
    select: {
      machineCustomer: true,
      phoneNumber: true,
      pincode: { select: { place: true, code: true } },
    },
  });

  const GREETING_HEADER =
    `🙏 *Welcome to Poornasree Equipments!*\n` +
    `Your Trusted Service Partner 🔧\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (existingTicket) {
    const name = existingTicket.machineCustomer || "Customer";
    const meta: SessionMeta = { customerName: name, customerPhone: phoneNumber };
    await updateSession(session.id, "MAIN_MENU", meta);
    return makeReply(
      GREETING_HEADER +
      `Welcome back, *${name}*! 👋\n\n` +
      MAIN_MENU_MSG,
      undefined,
      MAIN_MENU_LIST
    );
  }

  // Not registered — show branded greeting then ask for registered phone
  await updateSession(session.id, "ASK_PHONE", {});
  return makeReply(GREETING_HEADER + NOT_REGISTERED_MSG, [SKIP_BUTTON]);
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
      return startGreeting(phoneNumber);

    case "ASK_PHONE":
      return handleAskPhone(session.id, phoneNumber, text);

    case "MAIN_MENU":
      return handleMainMenu(session.id, phoneNumber, meta, text);

    case "VIEW_PRODUCTS":
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(MAIN_MENU_MSG, undefined, MAIN_MENU_LIST);

    case "COMPLAINT_ASK_SERIAL":
      return handleComplaintAskSerial(session.id, phoneNumber, meta, text);

    case "MACHINE_CONFIRM":
      return handleMachineConfirm(session.id, meta, text);

    case "COMPLAINT_PRODUCT":
      return handleComplaintProduct(session.id, phoneNumber, meta, text);

    case "COMPLAINT_DESCRIBE":
      return handleComplaintDescribe(session.id, phoneNumber, meta, text);

    case "TROUBLESHOOT_ACTIVE":
      return handleTroubleshootActive(session.id, phoneNumber, meta, text);

    case "TROUBLESHOOT_DONE_OPTIONS":
      return handleTroubleshootDoneOptions(session.id, phoneNumber, meta, text);

    case "COMPLAINT_MANUAL_NAME":
      return handleComplaintManualName(session.id, meta, text);

    case "COMPLAINT_MANUAL_PINCODE":
      return handleComplaintManualPincode(session.id, phoneNumber, meta, text);

    case "CHECK_STATUS":
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(MAIN_MENU_MSG, undefined, MAIN_MENU_LIST);

    case "INSTALLATION_INFO":
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(MAIN_MENU_MSG, undefined, MAIN_MENU_LIST);

    case "FEEDBACK_RATING":
      return handleFeedbackRating(session.id, meta, text);

    case "FEEDBACK_SATISFIED":
      return handleFeedbackSatisfied(session.id, meta, text);

    default:
      return startGreeting(phoneNumber);
  }
}

// ── ASK_PHONE ─────────────────────────────────────────────────────────────
async function handleAskPhone(sessionId: string, chatPhone: string, text: string) {
  const upper = text.toUpperCase().trim();

  if (upper === "SKIP" || upper === "0") {
    const meta: SessionMeta = { customerPhone: chatPhone };
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(MAIN_MENU_MSG, undefined, MAIN_MENU_LIST);
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length !== 10) {
    return makeReply(
      `⚠️ Please enter a valid 10-digit mobile number.\n\nEg. 9633503333\n\nOr press Skip to continue as a new customer.`,
      [SKIP_BUTTON]
    );
  }

  const lookupPhone = digits.startsWith("91") ? digits : `91${digits}`;
  const ticket = await prisma.ticket.findFirst({
    where: { OR: [{ phoneNumber: lookupPhone }, { phoneNumber: digits }] },
    orderBy: { createdAt: "desc" },
    select: { machineCustomer: true, phoneNumber: true },
  });

  if (ticket) {
    const name = ticket.machineCustomer || "Customer";
    const meta: SessionMeta = { customerName: name, customerPhone: digits };
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(`✅ Found! Welcome back, ${name}! 👋\n\n` + MAIN_MENU_MSG, undefined, MAIN_MENU_LIST);
  }

  return makeReply(`❌ No records found for this number.\n\nPlease try another number or press *Skip* to continue as a new customer.`, [SKIP_BUTTON]);
}

// ── MAIN_MENU ─────────────────────────────────────────────────────────────
async function handleMainMenu(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const choice = text.trim();

  if (choice === "1") {
    return showProducts(sessionId, meta);
  }
  if (choice === "2") {
    await updateSession(sessionId, "COMPLAINT_ASK_SERIAL", meta);
    return makeReply(
      `🔧 *Complaint Registration*\n\n` +
      `Please enter your machine serial number.\n\n` +
      `_(You can find it on the machine label or warranty card)_`,
      [SKIP_BUTTON]
    );
  }
  if (choice === "3") {
    return showTicketStatus(sessionId, phoneNumber, meta);
  }
  if (choice === "4") {
    await updateSession(sessionId, "INSTALLATION_INFO", meta);
    return makeReply(
      `🔧 *Product Installation*\n\n` +
      `For product installation requests, please contact our service team.\n\n` +
      `Or register a complaint and mention "Installation" as the issue.`,
      [MENU_BUTTON, COMPLAINT_BUTTON]
    );
  }
  if (choice === "5") {
    await updateSession(sessionId, "COMPLETED", meta);
    return makeReply(
      `📞 *Speak to Support*\n\nOur support team will reach out to you shortly.`,
      [MENU_BUTTON]
    );
  }

  return makeReply(`Please select a valid option from the menu below 👇`, undefined, MAIN_MENU_LIST);
}

// ── VIEW_PRODUCTS ─────────────────────────────────────────────────────────
const DEFAULT_CONTACT = "+91 94009 61291";

async function showProducts(sessionId: string, meta: SessionMeta) {
  await updateSession(sessionId, "VIEW_PRODUCTS", meta);

  // Fetch admin-managed products from the database
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  if (products.length === 0) {
    return makeReply(
      `📦 *Our Products*\n\nNo products available at the moment. Please check back later!\n\n📞 *Contact Us:* ${DEFAULT_CONTACT}`,
      [MENU_BUTTON, COMPLAINT_BUTTON],
    );
  }

  // Build image array for WhatsApp (only products that have an image)
  const baseUrl = env.FRONTEND_URL.replace(/\/$/, "");
  const images: ProductImage[] = products
    .filter(p => p.imageUrl)
    .map(p => ({
      url: p.imageUrl!.startsWith("http") ? p.imageUrl! : `${baseUrl}${p.imageUrl}`,
      caption: `*${p.name}*${p.price ? `\n💰 ${p.price}` : ""}${p.detail ? `\n\n${p.detail}` : ""}${p.contactNumber ? `\n\n📞 ${p.contactNumber}` : ""}`,
    }));

  // Build summary text
  const productLines = products.map((p, i) => `${i + 1}. ${p.name}`);
  const contactNumber = products.find(p => p.contactNumber)?.contactNumber ?? DEFAULT_CONTACT;

  const summary = [
    `📦 *Our Products — Poornasree Equipments*`,
    ``,
    ...productLines,
    ``,
    `📞 *Contact Us:* ${contactNumber}`,
    `🌐 *Website:* poornasree.com/products`,
  ].join("\n");

  return makeReply(
    summary,
    [MENU_BUTTON, COMPLAINT_BUTTON],
    undefined,
    images.length > 0 ? images : undefined,
  );
}

// ── CHECK_STATUS ──────────────────────────────────────────────────────────
async function showTicketStatus(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lookupPhones = [phoneNumber];
  if (meta.customerPhone && meta.customerPhone !== phoneNumber) {
    lookupPhones.push(meta.customerPhone);
    lookupPhones.push(`91${meta.customerPhone}`);
  }

  const tickets = await prisma.ticket.findMany({
    where: { phoneNumber: { in: lookupPhones } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { ticketNumber: true, status: true, problemDescription: true, machineName: true, createdAt: true },
  });

  if (tickets.length === 0) {
    await updateSession(sessionId, "CHECK_STATUS", meta);
    return makeReply(`📋 No tickets found for your number.`, [MENU_BUTTON, COMPLAINT_BUTTON]);
  }

  const statusEmoji: Record<string, string> = {
    OPEN: "🔵", ASSIGNED: "🟡", IN_PROGRESS: "🟠", PENDING_OTP: "🟣", CLOSED: "✅",
  };

  const lines = tickets.map((t, i) => {
    const emoji = statusEmoji[t.status] || "⚪";
    const date = t.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const complaint = t.problemDescription?.slice(0, 40) || "—";
    return `${i + 1}. *${t.ticketNumber}*\n   ${emoji} ${t.status}\n   📅 ${date}\n   📝 ${complaint}`;
  });

  await updateSession(sessionId, "CHECK_STATUS", meta);
  return makeReply(`📋 *Your Tickets (${tickets.length}):*\n\n` + lines.join("\n\n"), [MENU_BUTTON]);
}

// ── COMPLAINT_ASK_SERIAL ──────────────────────────────────────────────────
async function handleComplaintAskSerial(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const upper = text.toUpperCase().trim();

  if (upper === "SKIP" || upper === "0") {
    const clearedMeta: SessionMeta = { ...meta, machineData: null, serialNumber: undefined, tsSerialPath: false };
    return showProductSelection(sessionId, clearedMeta);
  }

  const serial = text.replace(/\s+/g, "").toUpperCase();
  if (serial.length < 3) {
    return makeReply(`Please enter a valid serial number or press Skip to continue:`, [SKIP_BUTTON]);
  }

  let machineData: PasstestMachine | null = null;
  try {
    machineData = await fetchMachineBySerial(serial);
  } catch (err) {
    console.error(`[simulate] API error for "${serial}":`, (err as Error).message);
  }

  if (machineData) {
    const newMeta: SessionMeta = { ...meta, serialNumber: serial, machineData, tsSerialPath: true };
    await updateSession(sessionId, "MACHINE_CONFIRM", newMeta);
    return makeReply(
      `✅ *Machine Found!*\n\n` +
      `👤 *Customer:* ${machineData.customer || "N/A"}\n` +
      `🔧 *Model:* ${machineData.m_model || "N/A"}\n` +
      `📍 *Address:* ${[machineData.Address1, machineData.Address2].filter(Boolean).join(", ") || "N/A"}\n\n` +
      `Is this your machine?`,
      YES_NO_BUTTONS
    );
  }

  return makeReply(
    `❌ Serial number *${serial}* not found in our system.\n\n` +
    `Please check and try again, or press *Skip* to continue without serial number.`,
    [SKIP_BUTTON]
  );
}

// ── MACHINE_CONFIRM ───────────────────────────────────────────────────────
async function handleMachineConfirm(sessionId: string, meta: SessionMeta, text: string) {
  if (text === "1" || /^yes/i.test(text)) {
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", meta);
    return makeReply(
      `📝 *Describe your complaint:*\n\n` +
      `Please explain the issue you are facing with your machine.\n\n` +
      `Example: _LED blinking, not heating, display not working_`
    );
  }
  if (text === "2" || /^no/i.test(text)) {
    const clearedMeta: SessionMeta = { ...meta, serialNumber: undefined, machineData: null, tsSerialPath: false };
    return showProductSelection(sessionId, clearedMeta);
  }
  return makeReply("Please select an option:", YES_NO_BUTTONS);
}

// ── COMPLAINT_PRODUCT (show product list) ─────────────────────────────────
async function showProductSelection(sessionId: string, meta: SessionMeta) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  let productNames: string[];
  if (products.length > 0) {
    productNames = products.map(p => p.name);
  } else {
    productNames = ["Milk Analyzer", "VIBRO Stirrer", "Water Pump", "Motor Controller", "Display Unit"];
  }

  const productRows = productNames.map((p, i) => ({ id: String(i + 1), title: p.slice(0, 24) }));
  await updateSession(sessionId, "COMPLAINT_PRODUCT", meta);
  return makeReply(
    `📦 *Select your product:*`,
    undefined,
    { buttonText: "Select Product 📦", rows: productRows }
  );
}

async function handleComplaintProduct(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  let productNames: string[];
  if (products.length > 0) {
    productNames = products.map(p => p.name);
  } else {
    productNames = ["Milk Analyzer", "VIBRO Stirrer", "Water Pump", "Motor Controller", "Display Unit"];
  }

  const index = parseInt(text, 10) - 1;
  if (isNaN(index) || index < 0 || index >= productNames.length) {
    const directMatch = productNames.find(p => p.toLowerCase().includes(text.toLowerCase()));
    if (!directMatch) {
      const productRows = productNames.map((p, i) => ({ id: String(i + 1), title: p.slice(0, 24) }));
      return makeReply(`Please select a valid product:`, undefined, { buttonText: "Select Product 📦", rows: productRows });
    }
    const updatedMeta = { ...meta, selectedProduct: directMatch };
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", updatedMeta);
    return makeReply(
      `✅ *Product:* ${directMatch}\n\n` +
      `📝 *Describe your complaint:*\n\nPlease explain the issue you are facing.\n\n` +
      `Example: _LED blinking, not heating, display not working_`
    );
  }

  const selectedProduct = productNames[index];
  const updatedMeta = { ...meta, selectedProduct };
  await updateSession(sessionId, "COMPLAINT_DESCRIBE", updatedMeta);

  return makeReply(
    `✅ *Product:* ${selectedProduct}\n\n` +
    `📝 *Describe your complaint:*\n\nPlease explain the issue you are facing.\n\n` +
    `Example: _LED blinking, not heating, display not working_`
  );
}

// ── COMPLAINT_DESCRIBE ────────────────────────────────────────────────────
async function handleComplaintDescribe(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  if (text.length < 3) {
    return makeReply("Please describe your issue in at least a few words:");
  }

  const updatedMeta: SessionMeta = { ...meta, complaint: text };
  const productName = meta.selectedProduct || meta.machineData?.m_model || "";
  const template = await findTroubleshootingTemplate(productName);

  if (!template || template.steps.length === 0) {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);
    return makeReply(
      `📝 *Complaint noted:* ${text}\n\n` +
      `😔 We were unable to find remote troubleshooting steps for this issue.\n\n` +
      `Would you like to book a service visit? Our technician will come to your location.`,
      [{ id: "BOOK_SERVICE", title: "Book Service 🔧" }, MENU_BUTTON]
    );
  }

  const serial = meta.serialNumber || "MANUAL";
  const tsSession = await prisma.troubleshootingSession.create({
    data: {
      phoneNumber,
      serialNumber: serial,
      problemType: template.problemType,
      currentStep: 1,
      status: "ACTIVE",
    },
  });

  const firstStep = template.steps[0];
  const totalSteps = template.steps.length;
  const finalMeta: SessionMeta = { ...updatedMeta, tsSessionId: tsSession.id };
  await updateSession(sessionId, "TROUBLESHOOT_ACTIVE", finalMeta);

  return makeReply(
    `📝 *Complaint noted:* ${text}\n\n` +
    `Let me guide you through some troubleshooting steps.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔧 *Step 1 of ${totalSteps}:*\n\n${firstStep.stepContent}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Is the issue resolved?`,
    YES_NO_BUTTONS
  );
}

// ── TROUBLESHOOT_ACTIVE ───────────────────────────────────────────────────
async function handleTroubleshootActive(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const upper = text.toUpperCase().trim();

  if (!meta.tsSessionId) {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", meta);
    return showTroubleshootDone(meta);
  }

  if (upper === "YES" || upper === "1") {
    await prisma.troubleshootingSession.update({
      where: { id: meta.tsSessionId },
      data: { status: "COMPLETED" },
    }).catch(() => {});
    await updateSession(sessionId, "COMPLETED", {});
    return makeReply(
      `🎉 *Issue Resolved!*\n\n` +
      `We're glad the troubleshooting helped! 😊\n\n` +
      `Thank you for choosing Poornasree Support. 🙏`,
      [MENU_BUTTON]
    );
  }

  if (upper !== "NO" && upper !== "2") {
    return makeReply("Please reply *YES* if the issue is resolved or *NO* to try the next step:", YES_NO_BUTTONS);
  }

  // NO — move to next step
  const tsSession = await prisma.troubleshootingSession.findUnique({
    where: { id: meta.tsSessionId },
  });

  if (!tsSession || tsSession.status !== "ACTIVE") {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", meta);
    return showTroubleshootDone(meta);
  }

  const template = await prisma.troubleshootingTemplate.findUnique({
    where: { problemType: tsSession.problemType },
    include: { steps: { orderBy: { stepNumber: "asc" as const } } },
  });

  if (!template) {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", meta);
    return showTroubleshootDone(meta);
  }

  const totalSteps = template.steps.length;
  const nextStep = tsSession.currentStep + 1;

  if (nextStep > totalSteps) {
    await prisma.troubleshootingSession.update({
      where: { id: meta.tsSessionId },
      data: { status: "ESCALATED" },
    }).catch(() => {});
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", meta);
    return showTroubleshootDone(meta);
  }

  await prisma.troubleshootingSession.update({
    where: { id: meta.tsSessionId },
    data: { currentStep: nextStep },
  });

  const stepRecord = template.steps.find(s => s.stepNumber === nextStep);
  await updateSession(sessionId, "TROUBLESHOOT_ACTIVE", meta);

  return makeReply(
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔧 *Step ${nextStep} of ${totalSteps}:*\n\n${stepRecord?.stepContent || "Please restart the device and try again."}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Is the issue resolved?`,
    YES_NO_BUTTONS
  );
}

function showTroubleshootDone(meta: SessionMeta) {
  return makeReply(
    `😔 We've gone through all troubleshooting steps but the issue persists.\n\n` +
    `Would you like us to arrange a *service visit*?\n\n` +
    `Our technician will come to your location to fix the issue.`,
    [{ id: "BOOK_SERVICE", title: "Book Service 🔧" }, MENU_BUTTON]
  );
}

// ── TROUBLESHOOT_DONE_OPTIONS ─────────────────────────────────────────────
async function handleTroubleshootDoneOptions(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const upper = text.toUpperCase().trim();

  if (upper === "BOOK_SERVICE" || upper === "1") {
    if (meta.tsSerialPath && meta.machineData) {
      return createTicketFromAPI(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply("Please enter your *full name*:");
  }

  return showTroubleshootDone(meta);
}

// ── COMPLAINT_MANUAL_NAME ─────────────────────────────────────────────────
async function handleComplaintManualName(sessionId: string, meta: SessionMeta, text: string) {
  if (text.length < 2) {
    return makeReply("Please enter your full name (at least 2 characters):");
  }
  const updatedMeta: SessionMeta = { ...meta, manualName: text, customerName: text };
  await updateSession(sessionId, "COMPLAINT_MANUAL_PINCODE", updatedMeta);
  return makeReply("Please enter your *6-digit pincode*:");
}

// ── COMPLAINT_MANUAL_PINCODE ──────────────────────────────────────────────
async function handleComplaintManualPincode(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  if (!/^\d{6}$/.test(text)) {
    return makeReply("Please enter a valid 6-digit pincode (numbers only):");
  }

  let district: string | undefined;
  let stateName: string | undefined;
  let place: string | undefined;
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
      place     = po.Name     || undefined;
      district  = po.District || undefined;
      stateName = po.State    || undefined;
    }
  } catch {
    // Non-blocking
  }

  const locationStr = [place, district, stateName].filter(Boolean).join(", ");
  const updatedMeta: SessionMeta = {
    ...meta,
    manualPincode:  text,
    manualPlace:    place,
    manualDistrict: district,
    manualState:    stateName,
    pincodeDisplay: locationStr || text,
  };

  return createTicketManual(sessionId, phoneNumber, updatedMeta);
}

// ── Template finder ───────────────────────────────────────────────────────
async function findTroubleshootingTemplate(productName: string) {
  if (productName) {
    const match = await prisma.troubleshootingTemplate.findFirst({
      where: {
        isActive: true,
        OR: [
          { title: { contains: productName, mode: "insensitive" } },
          { problemType: { contains: productName.toLowerCase().replace(/\s+/g, "_"), mode: "insensitive" } },
        ],
      },
      include: { steps: { orderBy: { stepNumber: "asc" as const } } },
    });
    if (match) return match;
  }
  return prisma.troubleshootingTemplate.findFirst({
    where: { isActive: true },
    include: { steps: { orderBy: { stepNumber: "asc" as const } } },
  });
}



// ── FEEDBACK_RATING ───────────────────────────────────────────────────────
async function handleFeedbackRating(sessionId: string, meta: SessionMeta, text: string) {
  const rating = parseInt(text, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return makeReply(
      `Please rate the service from 1 to 5:`,
      undefined,
      RATING_LIST
    );
  }

  if (meta.feedbackTicketId) {
    await prisma.ticket.update({
      where: { id: meta.feedbackTicketId },
      data: { feedbackRating: rating, feedbackSubmittedAt: new Date() },
    }).catch(() => {});
  }

  await updateSession(sessionId, "FEEDBACK_SATISFIED", meta);
  return makeReply(
    `Thank you for rating us ${"\u2b50".repeat(rating)}!\n\nAre you satisfied with the service?`,
    YES_NO_BUTTONS
  );
}

// ── FEEDBACK_SATISFIED ────────────────────────────────────────────────────
async function handleFeedbackSatisfied(sessionId: string, meta: SessionMeta, text: string) {
  if (text !== "1" && text !== "2" && !/^(yes|no)/i.test(text)) {
    return makeReply("Please select an option:", YES_NO_BUTTONS);
  }

  const satisfied = text === "1" || /^yes/i.test(text);
  const comment = satisfied ? "Satisfied" : "Not satisfied";

  if (meta.feedbackTicketId) {
    await prisma.ticket.update({
      where: { id: meta.feedbackTicketId },
      data: { feedbackComment: comment },
    }).catch(() => {});
  }

  await updateSession(sessionId, "COMPLETED", {});

  if (satisfied) {
    return makeReply(
      `🎉 We're glad you're satisfied!\n\nThank you for your valuable feedback. 🙏`,
      [MENU_BUTTON]
    );
  }
  return makeReply(
    `We're sorry to hear that. 😔\n\nYour feedback has been noted. Our team will work to improve.\n\nThank you for letting us know. 🙏`,
    [MENU_BUTTON]
  );
}

// ── Ticket creation: from API data ────────────────────────────────────────
async function createTicketFromAPI(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply("Service temporarily unavailable. Please try again later.");
  }

  const md = meta.machineData!;
  const serial = meta.serialNumber ?? "";
  const productName = meta.selectedProduct || md.m_model || "";
  const complaintText = meta.complaint || "Service request via chat";

  let resolvedDealerId: string | undefined;
  if (md.customer?.trim()) {
    const customerName = md.customer.trim().toLowerCase();
    console.log(`[simulate] Matching customer: "${customerName}" against dealer table`);
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
      console.log(`[simulate] Dealer match found: ${matched.id} (${matched.firstName} ${matched.lastName})`);
    } else {
      console.log(`[simulate] No dealer match — routing to MANAGER`);
    }
  } else {
    console.log(`[simulate] No customer name in API data — routing to MANAGER`);
  }

  let pincodeId: string | undefined;
  if (meta.manualPincode) {
    let pincodeRecord = await prisma.pincode.findFirst({ where: { code: meta.manualPincode } });
    if (!pincodeRecord) {
      pincodeRecord = await prisma.pincode.create({
        data: {
          code:     meta.manualPincode,
          place:    meta.manualPlace    || null,
          district: meta.manualDistrict || null,
          state:    meta.manualState    || null,
        },
      });
    }
    pincodeId = pincodeRecord.id;
  }

  const ticket = await TicketService.createTicket({
    customerId:          adminUser.id,
    problemDescription:  `${productName ? productName + ": " : ""}${complaintText}`,
    issueDescription:    `Customer: ${md.customer || meta.manualName || "N/A"}, Location: ${[md.Address1, md.Address2].filter(Boolean).join(", ") || meta.pincodeDisplay || "N/A"}, Pincode: ${meta.manualPincode || "N/A"}${meta.pincodeDisplay ? ` (${meta.pincodeDisplay})` : ""}`,
    machineName:         md.m_model || productName || undefined,
    machineSerialNumber: serial,
    pincodeId,
    phoneNumber,
    dealerId:            resolvedDealerId,
  });

  if (ticket.ownerType === "DEALER" && ticket.ownerId) {
    io?.to(`dealer:${ticket.ownerId}`).emit("ticket:new", ticket);
  } else {
    io?.to("managers").emit("ticket:new", ticket);
  }

  await updateSession(sessionId, "COMPLETED", {});

  return makeReply(
    `✅ Your complaint has been registered successfully!\n\n` +
    `🎫 Ticket: *${ticket.ticketNumber}*\n` +
    `📦 Product: ${productName || "N/A"}\n` +
    `📝 Issue: ${complaintText}\n` +
    `📍 Location: ${meta.pincodeDisplay || "N/A"}\n\n` +
    `Our service engineer will contact you shortly.\n\n` +
    `Thank you for choosing Poornasree Support 😊`,
    [MENU_BUTTON]
  );
}

// ── Ticket creation: manual entry ─────────────────────────────────────────
async function createTicketManual(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply("Service temporarily unavailable. Please try again later.");
  }

  const productName = meta.selectedProduct || "";
  const complaintText = meta.complaint || "Manual service request via chat";

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

  const ticket = await TicketService.createTicket({
    customerId:          adminUser.id,
    problemDescription:  `${productName ? productName + ": " : ""}${complaintText}`,
    issueDescription:    `Customer: ${meta.manualName || meta.customerName || "N/A"}, Location: ${[meta.manualPlace, meta.manualDistrict, meta.manualState].filter(Boolean).join(", ") || "N/A"}, Pincode: ${meta.manualPincode || "N/A"}`,
    machineName:         productName || undefined,
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
    `✅ Your complaint has been registered successfully!\n\n` +
    `🎫 Ticket: *${ticket.ticketNumber}*\n` +
    `📦 Product: ${productName || "N/A"}\n` +
    `📝 Issue: ${complaintText}\n` +
    `📍 Location: ${meta.pincodeDisplay || "N/A"}\n\n` +
    `Our service engineer will contact you shortly.\n\n` +
    `Thank you for choosing Poornasree Support 😊`,
    [MENU_BUTTON]
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

export type ReplyButton = { id: string; title: string };
export type ReplyList = { buttonText: string; rows: Array<{ id: string; title: string; description?: string }> };
export type ProductImage = { url: string; caption: string };

function makeReply(message: string, buttons?: ReplyButton[], list?: ReplyList, images?: ProductImage[]) {
  return { message, buttons, list, images };
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

// ── Trigger feedback flow after ticket closure ────────────────────────────
// Called externally (from ticket.controller verifyOTP) to start feedback collection
export async function startFeedbackFlow(phoneNumber: string, ticketId: string, ticketNumber: string) {
  let session = await prisma.conversationSession.findFirst({
    where: { phoneNumber },
    orderBy: { updatedAt: "desc" },
  });

  const meta: SessionMeta = { feedbackTicketId: ticketId };

  if (session) {
    await updateSession(session.id, "FEEDBACK_RATING", meta);
  } else {
    session = await prisma.conversationSession.create({
      data: { phoneNumber, state: "FEEDBACK_RATING", metadata: meta as object },
    });
  }

  return (
    `✅ Your service ticket *${ticketNumber}* has been closed successfully!\n\n` +
    `We'd love your feedback! 🙏\n\n` +
    `How would you rate the service? (1-5)\n\n` +
    `1️⃣ Poor\n` +
    `2️⃣ Fair\n` +
    `3️⃣ Good\n` +
    `4️⃣ Very Good\n` +
    `5️⃣ Excellent`
  );
}
