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
  tsSteps?:         string[];
  tsCurrentStep?:   number;
  language?:        "en" | "hi";
};

// ── Language type ─────────────────────────────────────────────────────────
type Lang = "en" | "hi";

// ── Bilingual translations (English / हिंदी) ──────────────────────────────
const TRANSLATIONS: Record<string, Record<Lang, string>> = {
  GREETING_HEADER: {
    en: "🙏 *Welcome to Poornasree Equipments!*\nYour Trusted Service Partner 🔧\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n",
    hi: "🙏 *पूर्णश्री इक्विपमेंट्स में आपका स्वागत है!*\nआपका विश्वसनीय सेवा साझेदार 🔧\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n",
  },
  MAIN_MENU_MSG: {
    en: "Welcome to *Poornasree HelpDesk* 🤖📲\n\nPlease select an option below 👇",
    hi: "*पूर्णश्री हेल्पडेस्क* में आपका स्वागत है 🤖📲\n\nकृपया नीचे एक विकल्प चुनें 👇",
  },
  NOT_REGISTERED: {
    en: "📱 This mobile number is not registered with us.\n\nIf you are a Registered Customer, please provide your registered 10 digit mobile number.\n\nEg. 9633503333\n\nOr press *Skip* to Continue. 👇",
    hi: "📱 यह मोबाइल नंबर हमारे यहाँ पंजीकृत नहीं है।\n\nयदि आप पंजीकृत ग्राहक हैं, तो कृपया अपना 10 अंकों का पंजीकृत मोबाइल नंबर दें।\n\nजैसे: 9633503333\n\nया जारी रखने के लिए *Skip* दबाएं। 👇",
  },
  TIMEOUT_MSG: {
    en: "Sorry!!! ☹️ Your session has ended as there was no response from your side.\n\nThank you for reaching out to Poornasree HelpDesk. 🙂",
    hi: "क्षमा करें!!! ☹️ आपकी तरफ से कोई जवाब न आने के कारण आपका सत्र समाप्त हो गया है।\n\nपूर्णश्री हेल्पडेस्क से संपर्क करने के लिए धन्यवाद। 🙂",
  },
  WELCOME_BACK: {
    en: "Welcome back, *{name}*! 👋\n\n",
    hi: "वापसी पर स्वागत है, *{name}*! 👋\n\n",
  },
  PHONE_FOUND: {
    en: "✅ Found! Welcome back, {name}! 👋\n\n",
    hi: "✅ मिल गया! वापसी पर स्वागत है, {name}! 👋\n\n",
  },
  PHONE_NOT_FOUND: {
    en: "❌ No records found for this number.\n\nPlease try another number or press *Skip* to continue as a new customer.",
    hi: "❌ इस नंबर के लिए कोई रिकॉर्ड नहीं मिला।\n\nकृपया दूसरा नंबर आज़माएं या *Skip* दबाकर नए ग्राहक के रूप में जारी रखें।",
  },
  INVALID_PHONE: {
    en: "⚠️ Please enter a valid 10-digit mobile number.\n\nEg. 9633503333\n\nOr press Skip to continue as a new customer.",
    hi: "⚠️ कृपया एक वैध 10 अंकों का मोबाइल नंबर दर्ज करें।\n\nजैसे: 9633503333\n\nया नए ग्राहक के रूप में जारी रखने के लिए Skip दबाएं।",
  },
  SERIAL_PROMPT: {
    en: "🔧 *Complaint Registration*\n\nPlease enter your machine serial number.\n\n_(You can find it on the machine label or warranty card)_",
    hi: "🔧 *शिकायत दर्ज करें*\n\nकृपया अपने मशीन का सीरियल नंबर दर्ज करें।\n\n_(यह मशीन के लेबल या वारंटी कार्ड पर मिलता है)_",
  },
  SERIAL_INVALID: {
    en: "Please enter a valid serial number or press Skip to continue:",
    hi: "कृपया एक वैध सीरियल नंबर दर्ज करें या जारी रखने के लिए Skip दबाएं:",
  },
  SERIAL_NOT_FOUND: {
    en: "❌ Serial number *{serial}* not found in our system.\n\nPlease check and try again, or press *Skip* to continue without serial number.",
    hi: "❌ सीरियल नंबर *{serial}* हमारे सिस्टम में नहीं मिला।\n\nकृपया जांचें और पुनः प्रयास करें, या बिना सीरियल नंबर के जारी रखने के लिए *Skip* दबाएं।",
  },
  MACHINE_FOUND: {
    en: "✅ *Machine Found!*\n\n👤 *Customer:* {customer}\n🔧 *Model:* {model}\n📍 *Address:* {address}\n\nIs this your machine?",
    hi: "✅ *मशीन मिल गई!*\n\n👤 *ग्राहक:* {customer}\n🔧 *मॉडल:* {model}\n📍 *पता:* {address}\n\nक्या यह आपकी मशीन है?",
  },
  SELECT_VALID: {
    en: "Please select an option:",
    hi: "कृपया एक विकल्प चुनें:",
  },
  DESCRIBE_COMPLAINT: {
    en: "📝 *Describe your complaint:*\n\nPlease explain the issue you are facing with your machine.\n\nExample: _LED blinking, not heating, display not working_",
    hi: "📝 *अपनी शिकायत बताएं:*\n\nकृपया अपनी मशीन में आ रही समस्या बताएं।\n\nउदाहरण: _LED झपक रही है, गर्म नहीं हो रहा, डिस्प्ले काम नहीं कर रहा_",
  },
  DESCRIBE_SHORT: {
    en: "Please describe your issue in at least a few words:",
    hi: "कृपया अपनी समस्या कुछ शब्दों में बताएं:",
  },
  PRODUCT_SELECTED: {
    en: "✅ *Product:* {product}\n\n📝 *Describe your complaint:*\n\nPlease explain the issue you are facing.\n\nExample: _LED blinking, not heating, display not working_",
    hi: "✅ *उत्पाद:* {product}\n\n📝 *अपनी शिकायत बताएं:*\n\nकृपया अपनी समस्या बताएं।\n\nउदाहरण: _LED झपक रही है, गर्म नहीं हो रहा, डिस्प्ले काम नहीं कर रहा_",
  },
  SELECT_PRODUCT: {
    en: "📦 *Select your product:*",
    hi: "📦 *अपना उत्पाद चुनें:*",
  },
  SELECT_VALID_PRODUCT: {
    en: "Please select a valid product:",
    hi: "कृपया एक वैध उत्पाद चुनें:",
  },
  NO_STEPS: {
    en: "📝 *Complaint noted:* {complaint}\n\n😔 We were unable to find troubleshooting steps for this issue.\n\nWould you like to book a service visit? Our technician will come to your location.",
    hi: "📝 *शिकायत नोट की गई:* {complaint}\n\n😔 इस समस्या के लिए कोई समाधान चरण नहीं मिले।\n\nक्या आप सेवा विज़िट बुक करना चाहेंगे? हमारा तकनीशियन आपके स्थान पर आएगा।",
  },
  STEPS_FOUND: {
    en: "📝 *Complaint noted:* {complaint}\n\n🔧 *Troubleshooting Steps:*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{steps}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nWere you able to resolve the issue?",
    hi: "📝 *शिकायत नोट की गई:* {complaint}\n\n🔧 *समस्या निवारण चरण:*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{steps}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nक्या आप समस्या हल करने में सफल रहे?",
  },
  ISSUE_RESOLVED: {
    en: "🎉 *Issue Resolved!*\n\nWe're glad the troubleshooting helped! 😊\n\nThank you for choosing Poornasree Support. 🙏",
    hi: "🎉 *समस्या हल हो गई!*\n\nहमें खुशी है कि समाधान चरणों से मदद मिली! 😊\n\nपूर्णश्री सपोर्ट चुनने के लिए धन्यवाद। 🙏",
  },
  ALL_STEPS_DONE: {
    en: "✅ All {count} troubleshooting steps have been completed.\n\nWould you like to book a service visit? Our technician will assist you on-site. 🔧",
    hi: "✅ सभी {count} समस्या निवारण चरण पूरे हो गए।\n\nक्या आप सेवा विज़िट बुक करना चाहेंगे? हमारा तकनीशियन आपकी सहायता करेगा। 🔧",
  },
  STEP_DISPLAY: {
    en: "🔍 *Step {current} of {total}:*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{step}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nWere you able to resolve the issue?",
    hi: "🔍 *चरण {current}/{total}:*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{step}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nक्या आप समस्या हल करने में सफल रहे?",
  },
  ENTER_NAME: {
    en: "Please enter your *full name*:",
    hi: "कृपया अपना *पूरा नाम* दर्ज करें:",
  },
  SHORT_NAME: {
    en: "Please enter your full name (at least 2 characters):",
    hi: "कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर):",
  },
  ENTER_PINCODE: {
    en: "Please enter your *6-digit pincode*:",
    hi: "कृपया अपना *6 अंकों का पिनकोड* दर्ज करें:",
  },
  INVALID_PINCODE: {
    en: "Please enter a valid 6-digit pincode (numbers only):",
    hi: "कृपया एक वैध 6 अंकों का पिनकोड दर्ज करें (केवल अंक):",
  },
  TICKET_CONFIRMED: {
    en: "✅ 👷 *Your complaint has been registered!*\n\n🎫 *Ticket No: {ticket}*\n📦 Product: {product}\n📝 Issue: {issue}\n📍 Location: {location}\n\n*Our technician will reach out to you within 24–48 hours. Assuring you of the best services!* 😊",
    hi: "✅ 👷 *आपकी शिकायत दर्ज हो गई है!*\n\n🎫 *टिकट नंबर: {ticket}*\n📦 उत्पाद: {product}\n📝 समस्या: {issue}\n📍 स्थान: {location}\n\n*हमारा तकनीशियन 24–48 घंटों के भीतर आपसे संपर्क करेगा। सर्वोत्तम सेवा का आश्वासन!* 😊",
  },
  SESSION_CLOSED: {
    en: "👋 Session closed. Thank you for contacting Poornasree Support!\n\nReply anything to start again.",
    hi: "👋 सत्र बंद हो गया। पूर्णश्री सपोर्ट से संपर्क करने के लिए धन्यवाद!\n\nदोबारा शुरू करने के लिए कुछ भी टाइप करें।",
  },
  VALID_OPTION: {
    en: "Please select a valid option from the menu below 👇",
    hi: "कृपया नीचे दिए मेनू से एक विकल्प चुनें 👇",
  },
  INSTALLATION_INFO: {
    en: "🔧 *Product Installation*\n\nFor product installation requests, please contact our service team.\n\nOr register a complaint and mention \"Installation\" as the issue.",
    hi: "🔧 *उत्पाद इंस्टॉलेशन*\n\nइंस्टॉलेशन के लिए कृपया हमारी सेवा टीम से संपर्क करें।\n\nया शिकायत दर्ज करें और \"Installation\" समस्या के रूप में उल्लेख करें।",
  },
  SPEAK_TO_SUPPORT: {
    en: "📞 *Speak to Support*\n\nOur support team will reach out to you shortly.",
    hi: "📞 *सहायता से बात करें*\n\nहमारी सहायता टीम जल्द ही आपसे संपर्क करेगी।",
  },
  LANG_SELECT: {
    en: "🌐 *Select your preferred language:*\n\nChoose your language to continue 👇",
    hi: "🌐 *अपनी पसंदीदा भाषा चुनें:*\n\nजारी रखने के लिए भाषा चुनें 👇",
  },
  LANG_CHANGED_EN: {
    en: "✅ Language set to *English*.",
    hi: "✅ Language set to *English*.",
  },
  LANG_CHANGED_HI: {
    en: "✅ भाषा *हिंदी* में बदली गई।",
    hi: "✅ भाषा *हिंदी* में बदली गई।",
  },
  WAITING_INPUT: {
    en: "⏳ *We are waiting for your input.* 🤔\n\n🔙 To go back to Main Menu, please click *Main Menu* button.\n\n💬 To change your preferred language, please click *Change Language* Button.\n\n🔚 To end the conversation, please click *Close* Button. 👇",
    hi: "⏳ *हम आपके जवाब का इंतजार कर रहे हैं।* 🤔\n\n🔙 मुख्य मेनू पर जाने के लिए *मुख्य मेनू* बटन दबाएं।\n\n💬 भाषा बदलने के लिए *भाषा बदलें* बटन दबाएं।\n\n🔚 बातचीत समाप्त करने के लिए *बंद करें* बटन दबाएं। 👇",
  },
  NO_TICKETS: {
    en: "📋 No tickets found for your number.",
    hi: "📋 आपके नंबर के लिए कोई टिकट नहीं मिला।",
  },
  SERVICE_UNAVAILABLE: {
    en: "Service temporarily unavailable. Please try again later.",
    hi: "सेवा अस्थायी रूप से उपलब्ध नहीं है। कृपया बाद में पुनः प्रयास करें।",
  },
};

function t(key: string, lang: Lang = "en", vars: Record<string, string> = {}): string {
  let str = TRANSLATIONS[key]?.[lang] ?? TRANSLATIONS[key]?.en ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.split(`{${k}}`).join(v);
  }
  return str;
}

// ── Language-aware button / list helpers ──────────────────────────────────
function getSkipButton(lang: Lang): ReplyButton {
  return { id: "SKIP", title: lang === "hi" ? "छोड़ें ⏭️" : "Skip ⏭️" };
}

function getMenuButton(lang: Lang): ReplyButton {
  return { id: "MENU", title: lang === "hi" ? "⬅️ मुख्य मेनू" : "⬅️ Main Menu" };
}

function getYesNoButtons(lang: Lang): ReplyButton[] {
  return [
    { id: "1", title: lang === "hi" ? "हाँ ✅" : "Yes ✅" },
    { id: "2", title: lang === "hi" ? "नहीं ❌" : "No ❌" },
  ];
}

function getMainMenuList(lang: Lang): ReplyList {
  return {
    buttonText: lang === "hi" ? "विकल्प देखें 📋" : "View Options 📋",
    rows: [
      { id: "1", title: lang === "hi" ? "हमारे उत्पाद देखें"   : "View Our Products",      description: lang === "hi" ? "हमारा उत्पाद कैटलॉग" : "Browse our product catalog" },
      { id: "2", title: lang === "hi" ? "शिकायत दर्ज करें"    : "Complaint Registration",  description: lang === "hi" ? "नई शिकायत दर्ज करें" : "Register a new complaint" },
      { id: "3", title: lang === "hi" ? "शिकायत की स्थिति"    : "Complaint Status",         description: lang === "hi" ? "मौजूदा टिकट जांचें" : "Check existing ticket status" },
      { id: "4", title: lang === "hi" ? "उत्पाद इंस्टॉलेशन"   : "Product Installation",     description: lang === "hi" ? "इंस्टॉलेशन अनुरोध" : "Request product installation" },
      { id: "5", title: lang === "hi" ? "सहायता से बात करें"  : "Speak to Support",         description: lang === "hi" ? "सहायता टीम से जुड़ें" : "Connect with our support team" },
      { id: "6", title: lang === "hi" ? "भाषा बदलें"           : "Change Language",          description: "English / हिंदी" },
    ],
  };
}

// ── Static messages kept for non-FSM use (feedback, etc.) ────────────────
const COMPLAINT_BUTTON: ReplyButton = { id: "2", title: "Register Complaint" };
const MENU_BUTTON: ReplyButton = { id: "MENU", title: "⬅️ Main Menu" };
const YES_NO_BUTTONS: ReplyButton[] = [
  { id: "1", title: "Yes ✅" },
  { id: "2", title: "No ❌" },
];

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

// ── Session timeout constant ──────────────────────────────────────────────
const SESSION_TIMEOUT_MS = 60_000; // 1 minute

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

  if (upper === "BYE" || upper === "CLOSE") {
    const s = await getOrCreateSession(phoneNumber);
    const sMeta: SessionMeta = (s.metadata as SessionMeta) ?? {};
    const lang: Lang = (sMeta.language ?? "en") as Lang;
    await updateSession(s.id, "COMPLETED", {});
    return makeReply(t("SESSION_CLOSED", lang));
  }

  const session = await getOrCreateSession(phoneNumber);
  const meta: SessionMeta = (session.metadata as SessionMeta) ?? {};
  const lang: Lang = (meta.language ?? "en") as Lang;

  // ── Session timeout: 1 minute of customer inactivity ─────────────────────────
  if (
    session.state !== "GREETING" &&
    session.state !== "COMPLETED" &&
    session.state !== "FEEDBACK_RATING" &&
    session.state !== "FEEDBACK_SATISFIED" &&
    Date.now() - session.updatedAt.getTime() > SESSION_TIMEOUT_MS
  ) {
    await updateSession(session.id, "COMPLETED", {});
    return makeReply(t("TIMEOUT_MSG", lang));
  }

  return routeState(session, phoneNumber, text, meta);
}

// ── Greeting / Registration check ─────────────────────────────────────────
async function startGreeting(phoneNumber: string) {
  const session = await getOrCreateSession(phoneNumber);
  const existingMeta: SessionMeta = (session.metadata as SessionMeta) ?? {};
  const lang: Lang = (existingMeta.language ?? "en") as Lang;

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

  if (existingTicket) {
    const name = existingTicket.machineCustomer || "Customer";
    const meta: SessionMeta = { customerName: name, customerPhone: phoneNumber, language: existingMeta.language };
    await updateSession(session.id, "MAIN_MENU", meta);
    return makeReply(
      t("GREETING_HEADER", lang) +
      t("WELCOME_BACK", lang, { name }) +
      t("MAIN_MENU_MSG", lang),
      undefined,
      getMainMenuList(lang)
    );
  }

  // Not registered — show branded greeting then ask for registered phone
  await updateSession(session.id, "ASK_PHONE", { language: existingMeta.language });
  return makeReply(t("GREETING_HEADER", lang) + t("NOT_REGISTERED", lang), [getSkipButton(lang)]);
}

// ── State router ──────────────────────────────────────────────────────────
async function routeState(
  session: { id: string; state: string },
  phoneNumber: string,
  text: string,
  meta: SessionMeta,
) {
  const lang: Lang = (meta.language ?? "en") as Lang;

  switch (session.state) {
    case "GREETING":
    case "COMPLETED":
      return startGreeting(phoneNumber);

    case "ASK_PHONE":
      return handleAskPhone(session.id, phoneNumber, text, meta);

    case "MAIN_MENU":
      return handleMainMenu(session.id, phoneNumber, meta, text);

    case "VIEW_PRODUCTS":
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));

    case "COMPLAINT_ASK_SERIAL":
      return handleComplaintAskSerial(session.id, phoneNumber, meta, text);

    case "MACHINE_CONFIRM":
      return handleMachineConfirm(session.id, meta, text);

    case "COMPLAINT_PRODUCT":
      return handleComplaintProduct(session.id, phoneNumber, meta, text);

    case "COMPLAINT_DESCRIBE":
      return handleComplaintDescribe(session.id, phoneNumber, meta, text);

    case "TROUBLESHOOT_STEP":
      return handleTroubleshootStep(session.id, phoneNumber, meta, text);

    case "TROUBLESHOOT_DONE_OPTIONS":
      return handleTroubleshootDoneOptions(session.id, phoneNumber, meta, text);

    case "COMPLAINT_MANUAL_NAME":
      return handleComplaintManualName(session.id, meta, text);

    case "COMPLAINT_MANUAL_PINCODE":
      return handleComplaintManualPincode(session.id, phoneNumber, meta, text);

    case "CHECK_STATUS":
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));

    case "INSTALLATION_INFO":
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));

    case "CHANGE_LANGUAGE":
      return handleChangeLanguage(session.id, meta, text);

    case "FEEDBACK_RATING":
      return handleFeedbackRating(session.id, meta, text);

    case "FEEDBACK_SATISFIED":
      return handleFeedbackSatisfied(session.id, meta, text);

    default:
      return startGreeting(phoneNumber);
  }
}

// ── ASK_PHONE ─────────────────────────────────────────────────────────────
async function handleAskPhone(sessionId: string, chatPhone: string, text: string, prevMeta: SessionMeta = {}) {
  const lang: Lang = (prevMeta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "SKIP" || upper === "0") {
    const meta: SessionMeta = { customerPhone: chatPhone, language: prevMeta.language };
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length !== 10) {
    return makeReply(t("INVALID_PHONE", lang), [getSkipButton(lang)]);
  }

  const lookupPhone = digits.startsWith("91") ? digits : `91${digits}`;
  const ticket = await prisma.ticket.findFirst({
    where: { OR: [{ phoneNumber: lookupPhone }, { phoneNumber: digits }] },
    orderBy: { createdAt: "desc" },
    select: { machineCustomer: true, phoneNumber: true },
  });

  if (ticket) {
    const name = ticket.machineCustomer || "Customer";
    const meta: SessionMeta = { customerName: name, customerPhone: digits, language: prevMeta.language };
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("PHONE_FOUND", lang, { name }) + t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }

  return makeReply(t("PHONE_NOT_FOUND", lang), [getSkipButton(lang)]);
}

// ── MAIN_MENU ─────────────────────────────────────────────────────────────
async function handleMainMenu(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const choice = text.trim();

  if (choice === "1") {
    return showProducts(sessionId, meta);
  }
  if (choice === "2") {
    await updateSession(sessionId, "COMPLAINT_ASK_SERIAL", meta);
    return makeReply(t("SERIAL_PROMPT", lang), [getSkipButton(lang)]);
  }
  if (choice === "3") {
    return showTicketStatus(sessionId, phoneNumber, meta);
  }
  if (choice === "4") {
    await updateSession(sessionId, "INSTALLATION_INFO", meta);
    return makeReply(t("INSTALLATION_INFO", lang), [getMenuButton(lang), COMPLAINT_BUTTON]);
  }
  if (choice === "5") {
    await updateSession(sessionId, "COMPLETED", meta);
    return makeReply(t("SPEAK_TO_SUPPORT", lang), [getMenuButton(lang)]);
  }
  if (choice === "6") {
    await updateSession(sessionId, "CHANGE_LANGUAGE", meta);
    return makeReply(
      t("LANG_SELECT", lang),
      [{ id: "EN", title: "🇬🇧 English" }, { id: "HI", title: "🇮🇳 हिंदी" }]
    );
  }

  return makeReply(t("VALID_OPTION", lang), undefined, getMainMenuList(lang));
}

// ── VIEW_PRODUCTS ─────────────────────────────────────────────────────────
const DEFAULT_CONTACT = "+91 94009 61291";

async function showProducts(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  await updateSession(sessionId, "VIEW_PRODUCTS", meta);

  // Fetch admin-managed products from the database
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  if (products.length === 0) {
    return makeReply(
      `📦 *Our Products*\n\nNo products available at the moment. Please check back later!\n\n📞 *Contact Us:* ${DEFAULT_CONTACT}`,
      [getMenuButton(lang), COMPLAINT_BUTTON],
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
    [getMenuButton(lang), COMPLAINT_BUTTON],
    undefined,
    images.length > 0 ? images : undefined,
  );
}

// ── CHECK_STATUS ──────────────────────────────────────────────────────────
async function showTicketStatus(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
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
    return makeReply(t("NO_TICKETS", lang), [getMenuButton(lang), COMPLAINT_BUTTON]);
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
  return makeReply(`📋 *Your Tickets (${tickets.length}):*\n\n` + lines.join("\n\n"), [getMenuButton(lang)]);
}

// ── COMPLAINT_ASK_SERIAL ──────────────────────────────────────────────────
async function handleComplaintAskSerial(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "SKIP" || upper === "0") {
    const clearedMeta: SessionMeta = { ...meta, machineData: null, serialNumber: undefined, tsSerialPath: false };
    return showProductSelection(sessionId, clearedMeta);
  }

  const serial = text.replace(/\s+/g, "").toUpperCase();
  if (serial.length < 3) {
    return makeReply(t("SERIAL_INVALID", lang), [getSkipButton(lang)]);
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
      t("MACHINE_FOUND", lang, {
        customer: machineData.customer || "N/A",
        model:    machineData.m_model  || "N/A",
        address:  [machineData.Address1, machineData.Address2].filter(Boolean).join(", ") || "N/A",
      }),
      getYesNoButtons(lang)
    );
  }

  return makeReply(t("SERIAL_NOT_FOUND", lang, { serial }), [getSkipButton(lang)]);
}

// ── MACHINE_CONFIRM ───────────────────────────────────────────────────────
async function handleMachineConfirm(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text === "1" || /^yes/i.test(text)) {
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", meta);
    return makeReply(t("DESCRIBE_COMPLAINT", lang));
  }
  if (text === "2" || /^no/i.test(text)) {
    const clearedMeta: SessionMeta = { ...meta, serialNumber: undefined, machineData: null, tsSerialPath: false };
    return showProductSelection(sessionId, clearedMeta);
  }
  return makeReply(t("SELECT_VALID", lang), getYesNoButtons(lang));
}

// ── COMPLAINT_PRODUCT (show product list) ─────────────────────────────────
async function showProductSelection(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
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
    t("SELECT_PRODUCT", lang),
    undefined,
    { buttonText: lang === "hi" ? "उत्पाद चुनें 📦" : "Select Product 📦", rows: productRows }
  );
}

async function handleComplaintProduct(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
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
      return makeReply(t("SELECT_VALID_PRODUCT", lang), undefined, { buttonText: lang === "hi" ? "उत्पाद चुनें 📦" : "Select Product 📦", rows: productRows });
    }
    const updatedMeta = { ...meta, selectedProduct: directMatch };
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", updatedMeta);
    return makeReply(t("PRODUCT_SELECTED", lang, { product: directMatch }));
  }

  const selectedProduct = productNames[index];
  const updatedMeta = { ...meta, selectedProduct };
  await updateSession(sessionId, "COMPLAINT_DESCRIBE", updatedMeta);
  return makeReply(t("PRODUCT_SELECTED", lang, { product: selectedProduct }));
}

// ── COMPLAINT_DESCRIBE ────────────────────────────────────────────────────
async function handleComplaintDescribe(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text.length < 3) {
    return makeReply(t("DESCRIBE_SHORT", lang));
  }

  const updatedMeta: SessionMeta = { ...meta, complaint: text };
  const productName = meta.selectedProduct || meta.machineData?.m_model || "";
  const template = await findTroubleshootingTemplate(text, productName);

  if (!template || template.steps.length === 0) {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);
    return makeReply(
      t("NO_STEPS", lang, { complaint: text }),
      [{ id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }, getMenuButton(lang)]
    );
  }

  const steps = template.steps
    .map((s: { stepContent: string }) => s.stepContent)
    .filter(isActionableStep);

  if (steps.length === 0) {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);
    return makeReply(
      t("NO_STEPS", lang, { complaint: text }),
      [{ id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }, getMenuButton(lang)]
    );
  }

  const stepsText = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");

  await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);

  return makeReply(
    t("STEPS_FOUND", lang, { complaint: text, steps: stepsText }),
    [{ id: "YES", title: lang === "hi" ? "हाँ, हल हुआ ✅" : "Yes, Resolved ✅" }, { id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }]
  );
}

// ── TROUBLESHOOT_STEP ─────────────────────────────────────────────────────
// Handles step-by-step navigation after the first step is shown.
async function handleTroubleshootStep(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();
  const steps = meta.tsSteps ?? [];
  const currentStep = meta.tsCurrentStep ?? 1;
  const totalSteps = steps.length;

  if (upper === "YES" || upper === "1") {
    await updateSession(sessionId, "COMPLETED", {});
    return makeReply(t("ISSUE_RESOLVED", lang), [getMenuButton(lang)]);
  }

  if (upper === "BOOK_SERVICE" || upper === "3") {
    if (meta.tsSerialPath && meta.machineData) {
      return createTicketFromAPI(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  if (upper === "NEXT_STEP" || upper === "NO" || upper === "2") {
    const nextStep = currentStep + 1;
    if (nextStep > totalSteps) {
      // All steps exhausted — fall back to book-service prompt
      await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", meta);
      return makeReply(
        t("ALL_STEPS_DONE", lang, { total: String(totalSteps) }),
        [{ id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }, getMenuButton(lang)]
      );
    }

    const updatedMeta: SessionMeta = { ...meta, tsCurrentStep: nextStep };
    await updateSession(sessionId, "TROUBLESHOOT_STEP", updatedMeta);

    const buttons: ReplyButton[] = [{ id: "YES", title: lang === "hi" ? "हाँ, हल हुआ ✅" : "Yes, Resolved ✅" }];
    if (nextStep < totalSteps) buttons.push({ id: "NEXT_STEP", title: lang === "hi" ? "नहीं, अगला चरण ➡️" : "No, Next Step ➡️" });
    buttons.push({ id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" });

    return makeReply(
      t("STEP_DISPLAY", lang, { step: String(nextStep), total: String(totalSteps), content: steps[nextStep - 1] }),
      buttons
    );
  }

  // Unrecognised input — re-show current step
  const buttons: ReplyButton[] = [{ id: "YES", title: lang === "hi" ? "हाँ, हल हुआ ✅" : "Yes, Resolved ✅" }];
  if (currentStep < totalSteps) buttons.push({ id: "NEXT_STEP", title: lang === "hi" ? "नहीं, अगला चरण ➡️" : "No, Next Step ➡️" });
  buttons.push({ id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" });

  return makeReply(
    t("STEP_DISPLAY", lang, { step: String(currentStep), total: String(totalSteps), content: steps[currentStep - 1] ?? "" }),
    buttons
  );
}

// ── TROUBLESHOOT_DONE_OPTIONS ─────────────────────────────────────────────
async function handleTroubleshootDoneOptions(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "YES" || upper === "1") {
    await updateSession(sessionId, "COMPLETED", {});
    return makeReply(t("ISSUE_RESOLVED", lang), [getMenuButton(lang)]);
  }

  if (upper === "BOOK_SERVICE" || upper === "2" || upper === "NO") {
    if (meta.tsSerialPath && meta.machineData) {
      return createTicketFromAPI(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  return makeReply(
    t("ISSUE_RESOLVED", lang),
    [{ id: "YES", title: lang === "hi" ? "हाँ, हल हुआ ✅" : "Yes, Resolved ✅" }, { id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }]
  );
}

// ── COMPLAINT_MANUAL_NAME ─────────────────────────────────────────────────
async function handleComplaintManualName(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text.length < 2) {
    return makeReply(t("SHORT_NAME", lang));
  }
  const updatedMeta: SessionMeta = { ...meta, manualName: text, customerName: text };
  await updateSession(sessionId, "COMPLAINT_MANUAL_PINCODE", updatedMeta);
  return makeReply(t("ENTER_PINCODE", lang));
}

// ── COMPLAINT_MANUAL_PINCODE ──────────────────────────────────────────────
async function handleComplaintManualPincode(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (!/^\d{6}$/.test(text)) {
    return makeReply(t("INVALID_PINCODE", lang));
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
// Searches by complaint text first (against description/patterns field), then by product name.
// Hard-filters by audience so customer and engineer templates stay separate.

// Fallback lines like "If none of the above steps help..." are not actionable steps.
const FALLBACK_STEP_RE = /if none of the above|contact poornasree|raise a service request/i;

function isActionableStep(content: string): boolean {
  return !FALLBACK_STEP_RE.test(content);
}

async function findTroubleshootingTemplate(
  complaintText: string,
  productName: string,
  audienceFilter: string[] = ["customer", "both"],
) {
  const include = { steps: { orderBy: { stepNumber: "asc" as const } } };

  // Search by description, hard-filtered by audience.
  async function findByDescription(text: string) {
    if (!text.trim()) return null;
    const match = await prisma.troubleshootingTemplate.findFirst({
      where: {
        isActive: true,
        audience: { in: audienceFilter },
        description: { contains: text, mode: "insensitive" },
      },
      include,
    });
    return match && match.steps.length > 0 ? match : null;
  }

  // 1. Match full complaint phrase
  if (complaintText.trim()) {
    const phraseMatch = await findByDescription(complaintText.trim());
    if (phraseMatch) return phraseMatch;

    // 2. Try individual significant words (≥5 chars)
    const words = complaintText.split(/\s+/).filter((w: string) => w.length >= 5);
    for (const word of words) {
      const wordMatch = await findByDescription(word);
      if (wordMatch) return wordMatch;
    }
  }

  // 3. Match by product name (title or problemType)
  if (productName.trim()) {
    const productMatch = await prisma.troubleshootingTemplate.findFirst({
      where: {
        isActive: true,
        audience: { in: audienceFilter },
        OR: [
          { title: { contains: productName, mode: "insensitive" } },
          { problemType: { contains: productName.toLowerCase().replace(/\s+/g, "_"), mode: "insensitive" } },
        ],
      },
      include,
    });
    if (productMatch && productMatch.steps.length > 0) return productMatch;
  }

  return null;
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
  const lang: Lang = (meta.language ?? "en") as Lang;
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply(t("SERVICE_UNAVAILABLE", lang));
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
    t("TICKET_CONFIRMED", lang, {
      ticket:   ticket.ticketNumber,
      product:  productName || "N/A",
      issue:    complaintText,
      location: meta.pincodeDisplay || "N/A",
    }),
    [getMenuButton(lang)]
  );
}

// ── Ticket creation: manual entry ─────────────────────────────────────────
async function createTicketManual(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply(t("SERVICE_UNAVAILABLE", lang));
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
    t("TICKET_CONFIRMED", lang, {
      ticket:   ticket.ticketNumber,
      product:  productName || "N/A",
      issue:    complaintText,
      location: [meta.manualPlace, meta.manualDistrict, meta.manualState].filter(Boolean).join(", ") || meta.pincodeDisplay || "N/A",
    }),
    [getMenuButton(lang)]
  );
}

// ── CHANGE_LANGUAGE ───────────────────────────────────────────────────────
async function handleChangeLanguage(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "EN" || upper === "ENGLISH") {
    const newMeta: SessionMeta = { ...meta, language: "en" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_EN", "en") + "\n\n" + t("MAIN_MENU_MSG", "en"),
      undefined,
      getMainMenuList("en")
    );
  }
  if (upper === "HI" || upper === "HINDI" || text === "हिंदी") {
    const newMeta: SessionMeta = { ...meta, language: "hi" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_HI", "hi") + "\n\n" + t("MAIN_MENU_MSG", "hi"),
      undefined,
      getMainMenuList("hi")
    );
  }
  if (upper === "CHANGE_LANGUAGE") {
    return makeReply(
      t("LANG_SELECT", lang),
      [{ id: "EN", title: "🇬🇧 English" }, { id: "HI", title: "🇮🇳 हिंदी" }]
    );
  }
  // Unrecognized input → waiting-for-input nudge with 3 buttons
  return makeReply(
    t("WAITING_INPUT", lang),
    [
      getMenuButton(lang),
      { id: "CHANGE_LANGUAGE", title: lang === "hi" ? "🌐 भाषा बदलें" : "🌐 Change Language" },
      { id: "CLOSE", title: lang === "hi" ? "❌ बंद करें" : "❌ Close" },
    ]
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
