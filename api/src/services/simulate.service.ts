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
//   COMPLAINT_ASK_SERIAL → serial → Passtest → MACHINE_CONFIRM → COMPLAINT_DESCRIBE
//   Book Service (manual) → COMPLAINT_MANUAL_NAME → COMPLAINT_MANUAL_PINCODE
//     → COMPLAINT_MANUAL_PINCODE_CONFIRM → END_CUSTOMER_ADDRESS → create ticket
//   Book Service (Passtest path) → PASSTEST_CUSTOMER_NAME → PASSTEST_PINCODE
//     → PASSTEST_PINCODE_CONFIRM → END_CUSTOMER_ADDRESS → create ticket → COMPLETED
//   CHECK_STATUS      → show active tickets → back to menu
//   FEEDBACK_RATING   → 1-5 rating → FEEDBACK_SATISFIED
//   FEEDBACK_SATISFIED → yes/no → COMPLETED
//
// Global commands (any state): MENU (restart), BYE (close)

import prisma from "../lib/prisma";
import { fetchPlaceFromPincode } from "../lib/pincode";
import * as TicketService from "./ticket.service";
import { fetchMachineBySerial, type PasstestMachine } from "./machine.service";

import { io } from "../lib/socket";
import { env } from "../config/env";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_KEYS,
  getCategoryLabel,
  isProductCategory,
  sortByCategory,
  type ProductCategory,
} from "../constants/productCategories";
import {
  formatSupportContactBlock,
  getWhatsAppSupportSettings,
} from "./chatbotSettings.service";
import { findVideosForQuery, formatVideoSuggestions } from "../controllers/video.controller";

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
  manualAddress?:   string;
  complaint?:       string;
  pincodeDisplay?:  string;
  selectedProduct?: string;
  productCategory?: ProductCategory;
  feedbackTicketId?: string;
  tsSessionId?:     string;
  tsSerialPath?:    boolean;
  tsSteps?:         string[];
  tsCurrentStep?:   number;
  language?:        "en" | "hi";
  /** Set when name/pincode were loaded from a prior ticket — skip confirm on Book Service */
  skipEndCustomerConfirm?: boolean;
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
    en: "✅ *Machine Verified*\n\n👤 *Customer:* {customer}\n🔧 *Model:* {model}\n🔢 *Serial:* {serial}\n📍 *Address:* {address}\n\nPlease confirm.",
    hi: "✅ *मशीन सत्यापित*\n\n👤 *ग्राहक:* {customer}\n🔧 *मॉडल:* {model}\n🔢 *सीरियल:* {serial}\n📍 *पता:* {address}\n\nकृपया पुष्टि करें।",
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
  SELECT_CATEGORY: {
    en: "📂 *Select product category:*",
    hi: "📂 *उत्पाद श्रेणी चुनें:*",
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
    en: "Please enter your full name.",
    hi: "कृपया अपना पूरा नाम दर्ज करें।",
  },
  SHORT_NAME: {
    en: "Please enter your full name (minimum 2 characters).",
    hi: "कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर)।",
  },
  ENTER_PINCODE: {
    en: "Please enter your area pincode (6 digits).",
    hi: "कृपया अपने क्षेत्र का पिनकोड दर्ज करें (6 अंक)।",
  },
  INVALID_PINCODE: {
    en: "Please enter a valid 6-digit pincode.",
    hi: "कृपया एक वैध 6 अंकों का पिनकोड दर्ज करें।",
  },
  PINCODE_CONFIRM: {
    en: "📍 *We found your area:*\n{location}\n📮 *Pincode:* {pincode}\n\nIs this your service area?",
    hi: "📍 *आपका क्षेत्र मिला:*\n{location}\n📮 *पिनकोड:* {pincode}\n\nक्या यह आपका सेवा क्षेत्र सही है?",
  },
  ENTER_ADDRESS: {
    en: "Please enter your full address (house no., street, landmark).\n\nExample: House 12, Main Road, near temple",
    hi: "कृपया अपना पूरा पता दर्ज करें (मकान नं., सड़क, लैंडमार्क)।\n\nउदाहरण: मकान 12, मुख्य सड़क, मंदिर के पास",
  },
  SHORT_ADDRESS: {
    en: "Please enter your full address (at least 10 characters).",
    hi: "कृपया अपना पूरा पता दर्ज करें (कम से कम 10 अक्षर)।",
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
  SPEAK_TO_SUPPORT: {
    en: "📞 *Speak to Support*\n\n{contact}\n\nOur support team will reach out to you shortly.",
    hi: "📞 *सहायता से बात करें*\n\n{contact}\n\nहमारी सहायता टीम जल्द ही आपसे संपर्क करेगी।",
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

const LANG_BUTTONS: ReplyButton[] = [
  { id: "LANG_EN", title: "🇬🇧 English" },
  { id: "LANG_HI", title: "🇮🇳 हिंदी" },
];

function getMainMenuList(lang: Lang): ReplyList {
  return {
    buttonText: lang === "hi" ? "विकल्प देखें 📋" : "View Options 📋",
    rows: [
      { id: "1", title: lang === "hi" ? "हमारे उत्पाद देखें"   : "View Our Products",      description: lang === "hi" ? "हमारा उत्पाद कैटलॉग" : "Browse our product catalog" },
      { id: "2", title: lang === "hi" ? "शिकायत दर्ज करें"    : "Complaint Registration",  description: lang === "hi" ? "नई शिकायत दर्ज करें" : "Register a new complaint" },
      { id: "3", title: lang === "hi" ? "शिकायत की स्थिति"    : "Complaint Status",         description: lang === "hi" ? "मौजूदा टिकट जांचें" : "Check existing ticket status" },
      { id: "4", title: lang === "hi" ? "सहायता से बात करें"  : "Speak to Support",         description: lang === "hi" ? "सहायता टीम से जुड़ें" : "Connect with our support team" },
      { id: "5", title: lang === "hi" ? "भाषा बदलें"           : "Change Language",          description: "English / हिंदी" },
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


// ── Entry point ───────────────────────────────────────────────────────────
export async function handleMessage(phoneNumber: string, message: string) {
  const text = message.trim();
  const upper = text.toUpperCase();

  // ── Global navigation commands (any state except feedback) ──────────────
  // Note: "HI" is excluded while in CHANGE_LANGUAGE — it collides with the Hindi button id.
  if (isGlobalRestartCommand(upper)) {
    const s = await getOrCreateSession(phoneNumber);
    const meta: SessionMeta = (s.metadata as SessionMeta) ?? {};
    // If in feedback flow, don't interrupt
    if (s.state === "FEEDBACK_RATING" || s.state === "FEEDBACK_SATISFIED") {
      return routeState(s, phoneNumber, text, meta);
    }
    // Let language selection handle button taps (LANG_EN / LANG_HI)
    if (s.state === "CHANGE_LANGUAGE") {
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

    case "COMPLAINT_CATEGORY":
      return handleComplaintCategory(session.id, meta, text);

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

    case "COMPLAINT_MANUAL_PINCODE_CONFIRM":
      return handleComplaintManualPincodeConfirm(session.id, phoneNumber, meta, text);

    case "END_CUSTOMER_ADDRESS":
      return handleEndCustomerAddress(session.id, phoneNumber, meta, text);

    case "PASSTEST_CUSTOMER_NAME":
      return handlePasstestCustomerName(session.id, meta, text);

    case "PASSTEST_PINCODE":
      return handlePasstestPincode(session.id, meta, text);

    case "PASSTEST_PINCODE_CONFIRM":
      return handlePasstestPincodeConfirm(session.id, phoneNumber, meta, text);

    case "CHECK_STATUS":
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
    await updateSession(sessionId, "COMPLETED", meta);
    const support = await getWhatsAppSupportSettings();
    const contact = formatSupportContactBlock(support);
    return makeReply(t("SPEAK_TO_SUPPORT", lang, { contact }), [getMenuButton(lang)]);
  }
  if (choice === "5") {
    await updateSession(sessionId, "CHANGE_LANGUAGE", meta);
    return makeReply(t("LANG_SELECT", lang), LANG_BUTTONS);
  }

  return makeReply(t("VALID_OPTION", lang), undefined, getMainMenuList(lang));
}

// ── VIEW_PRODUCTS ─────────────────────────────────────────────────────────
const DEFAULT_CONTACT = "+91 94009 61291";

async function showProducts(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  await updateSession(sessionId, "VIEW_PRODUCTS", meta);

  // Fetch admin-managed products from the database
  const products = sortByCategory(
    await prisma.product.findMany({ where: { isActive: true } }),
  );

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

  const productLines = formatProductsGrouped(products);
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
        serial,
        address:  [machineData.Address1, machineData.Address2].filter(Boolean).join(", ") || "N/A",
      }),
      getYesNoButtons(lang)
    );
  }

  return makeReply(t("SERIAL_NOT_FOUND", lang, { serial }), [getSkipButton(lang)]);
}

// ── Complaint types list helper ───────────────────────────────────────────
async function fetchComplaintListRows(lang: Lang, productName?: string) {
  const templates = await prisma.troubleshootingTemplate.findMany({
    where: {
      isActive: true,
      audience: { in: ["customer", "both"] },
    },
    select: { id: true, title: true, description: true, problemType: true },
    orderBy: { title: "asc" },
  });

  let filteredTemplates = templates;

  if (productName) {
    const normProduct = productName.toLowerCase();

    if (normProduct.includes("vibro")) {
      // Vibro Stirrer: match templates with "vibro" or "vibration" in title or problemType
      filteredTemplates = templates.filter(t =>
        t.problemType.toLowerCase().includes("vibro") ||
        t.problemType.toLowerCase().includes("vibration") ||
        t.title.toLowerCase().includes("vibro") ||
        t.title.toLowerCase().includes("vibration")
      );
    } else if (normProduct.includes("dps") || normProduct.includes("dpst") || normProduct.includes("data processing")) {
      // DPS-T / Data Processing System: match templates with "dpst" or "dps"
      filteredTemplates = templates.filter(t =>
        t.problemType.toLowerCase().includes("dpst") ||
        t.problemType.toLowerCase().includes("dps") ||
        t.title.toLowerCase().includes("dpst") ||
        t.title.toLowerCase().includes("dps")
      );
    } else if (normProduct.includes("solar") || normProduct.includes("charger")) {
      // Solar Charger: match templates with "solar" or "charger"
      filteredTemplates = templates.filter(t =>
        t.problemType.toLowerCase().includes("solar") ||
        t.title.toLowerCase().includes("solar")
      );
    } else if (
      normProduct.includes("analyzer") ||
      normProduct.includes("lactosure") ||
      normProduct.includes("lactogrand")
    ) {
      // Milk Analyzer models (Lactosure / Lactogrand):
      // They use mainboard, pump, ecod, compact adapter, charger adapter.
      // They should NOT see vibro or solar charger issues.
      filteredTemplates = templates.filter(t =>
        !t.problemType.toLowerCase().includes("vibro") &&
        !t.problemType.toLowerCase().includes("solar_charger") &&
        !t.title.toLowerCase().includes("vibro") &&
        !t.title.toLowerCase().includes("solar charger")
      );
    } else {
      // If we don't recognize the product, check keyword overlaps
      filteredTemplates = templates.filter(t => {
        const words = normProduct.split(/\s+/).filter(w => w.length >= 3);
        return words.some(w => t.problemType.toLowerCase().includes(w) || t.title.toLowerCase().includes(w));
      });
      // If nothing matches, fallback to all templates
      if (filteredTemplates.length === 0) {
        filteredTemplates = templates;
      }
    }
  }

  const seenTitles = new Set<string>();
  const rows = filteredTemplates.slice(0, 9).map((t) => {
    let title = t.title.slice(0, 24).trim();
    let counter = 1;
    while (seenTitles.has(title.toLowerCase())) {
      const suffix = ` ${counter}`;
      title = t.title.slice(0, 24 - suffix.length).trim() + suffix;
      counter++;
    }
    seenTitles.add(title.toLowerCase());
    return {
      id: `COMPLAINT_${t.id}`,
      title,
      description: t.description?.slice(0, 72),
    };
  });

  rows.push({
    id: "COMPLAINT_OTHER",
    title: lang === "hi" ? "अन्य (टाइप करें)" : "Other (type manually)",
    description: lang === "hi" ? "अपनी समस्या लिखकर बताएं" : "Describe your issue",
  });

  return rows;
}

// ── MACHINE_CONFIRM ───────────────────────────────────────────────────────
async function handleMachineConfirm(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text === "1" || /^yes/i.test(text)) {
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", meta);
    const listRows = await fetchComplaintListRows(lang, meta.machineData?.m_model);
    return makeReply(
      t("DESCRIBE_COMPLAINT", lang),
      undefined,
      listRows.length > 1 ? { buttonText: lang === "hi" ? "शिकायत चुनें 📝" : "Select Complaint 📝", rows: listRows } : undefined
    );
  }
  if (text === "2" || /^no/i.test(text)) {
    const clearedMeta: SessionMeta = { ...meta, serialNumber: undefined, machineData: null, tsSerialPath: false };
    return showProductSelection(sessionId, clearedMeta);
  }
  return makeReply(t("SELECT_VALID", lang), getYesNoButtons(lang));
}

// ── Product catalogue helpers ─────────────────────────────────────────────
type CatalogueProduct = { name: string; category: string; displayOrder: number };

const FALLBACK_PRODUCTS: CatalogueProduct[] = [
  { name: "Milk Analyzer", category: "other", displayOrder: 1 },
  { name: "VIBRO Stirrer", category: "other", displayOrder: 2 },
  { name: "Water Pump", category: "other", displayOrder: 3 },
  { name: "Motor Controller", category: "other", displayOrder: 4 },
  { name: "Display Unit", category: "other", displayOrder: 5 },
];

async function fetchActiveCatalogue(): Promise<CatalogueProduct[]> {
  const rows = sortByCategory(
    await prisma.product.findMany({ where: { isActive: true } }),
  );
  return rows.length > 0 ? rows : FALLBACK_PRODUCTS;
}

function formatProductsGrouped(products: CatalogueProduct[]): string[] {
  const lines: string[] = [];
  let num = 1;
  for (const key of PRODUCT_CATEGORY_KEYS) {
    const inCategory = products.filter(p => p.category === key);
    if (inCategory.length === 0) continue;
    lines.push(`*${PRODUCT_CATEGORIES[key].label}*`);
    for (const p of inCategory) {
      lines.push(`${num}. ${p.name}`);
      num += 1;
    }
    lines.push("");
  }
  const uncategorized = products.filter(p => !isProductCategory(p.category));
  if (uncategorized.length > 0) {
    lines.push(`*Other*`);
    for (const p of uncategorized) {
      lines.push(`${num}. ${p.name}`);
      num += 1;
    }
  }
  return lines;
}

function usesCategoryFlow(products: CatalogueProduct[]): boolean {
  return products.some(p => isProductCategory(p.category));
}

// ── COMPLAINT: category then product ──────────────────────────────────────
async function showProductSelection(sessionId: string, meta: SessionMeta) {
  const products = await fetchActiveCatalogue();
  if (!usesCategoryFlow(products)) {
    return showProductList(sessionId, meta, products);
  }
  return showCategorySelection(sessionId, meta);
}

async function showCategorySelection(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const products = await fetchActiveCatalogue();
  const categoryRows = PRODUCT_CATEGORY_KEYS
    .filter(key => products.some(p => p.category === key))
    .map((key, i) => ({
      id: String(i + 1),
      title: PRODUCT_CATEGORIES[key].label.slice(0, 24),
    }));

  await updateSession(sessionId, "COMPLAINT_CATEGORY", { ...meta, productCategory: undefined });
  return makeReply(
    t("SELECT_CATEGORY", lang),
    undefined,
    { buttonText: lang === "hi" ? "श्रेणी चुनें 📂" : "Select Category 📂", rows: categoryRows },
  );
}

async function handleComplaintCategory(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const products = await fetchActiveCatalogue();
  const availableCategories = PRODUCT_CATEGORY_KEYS.filter(key =>
    products.some(p => p.category === key),
  );

  const index = parseInt(text, 10) - 1;
  let category: ProductCategory | undefined;
  if (!isNaN(index) && index >= 0 && index < availableCategories.length) {
    category = availableCategories[index];
  } else {
    const match = availableCategories.find(
      key =>
        PRODUCT_CATEGORIES[key].label.toLowerCase().includes(text.toLowerCase()) ||
        key.includes(text.toLowerCase()),
    );
    category = match;
  }

  if (!category) {
    return showCategorySelection(sessionId, meta);
  }

  const inCategory = products.filter(p => p.category === category);
  return showProductList(sessionId, { ...meta, productCategory: category }, inCategory);
}

async function showProductList(
  sessionId: string,
  meta: SessionMeta,
  products: CatalogueProduct[],
) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const productRows = products.map((p, i) => ({ id: String(i + 1), title: p.name.slice(0, 24) }));
  await updateSession(sessionId, "COMPLAINT_PRODUCT", meta);
  const categoryLabel = meta.productCategory ? getCategoryLabel(meta.productCategory) : "";
  const header = categoryLabel
    ? `${t("SELECT_PRODUCT", lang)}\n_${categoryLabel}_`
    : t("SELECT_PRODUCT", lang);
  return makeReply(
    header,
    undefined,
    { buttonText: lang === "hi" ? "उत्पाद चुनें 📦" : "Select Product 📦", rows: productRows },
  );
}

async function handleComplaintProduct(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const allProducts = await fetchActiveCatalogue();
  const products = meta.productCategory
    ? allProducts.filter(p => p.category === meta.productCategory)
    : allProducts;
  const productNames = products.map(p => p.name);

  const index = parseInt(text, 10) - 1;
  if (isNaN(index) || index < 0 || index >= productNames.length) {
    const directMatch = productNames.find(p => p.toLowerCase().includes(text.toLowerCase()));
    if (!directMatch) {
      return showProductList(sessionId, meta, products);
    }
    const updatedMeta = { ...meta, selectedProduct: directMatch };
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", updatedMeta);
    const listRows = await fetchComplaintListRows(lang, directMatch);
    return makeReply(
      t("PRODUCT_SELECTED", lang, { product: directMatch }),
      undefined,
      listRows.length > 1 ? { buttonText: lang === "hi" ? "शिकायत चुनें 📝" : "Select Complaint 📝", rows: listRows } : undefined
    );
  }

  const selectedProduct = productNames[index];
  const updatedMeta = { ...meta, selectedProduct };
  await updateSession(sessionId, "COMPLAINT_DESCRIBE", updatedMeta);
  const listRows = await fetchComplaintListRows(lang, selectedProduct);
  return makeReply(
    t("PRODUCT_SELECTED", lang, { product: selectedProduct }),
    undefined,
    listRows.length > 1 ? { buttonText: lang === "hi" ? "शिकायत चुनें 📝" : "Select Complaint 📝", rows: listRows } : undefined
  );
}

// ── COMPLAINT_DESCRIBE ────────────────────────────────────────────────────
async function handleComplaintDescribe(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  let complaintText = text.trim();
  let selectedTemplate: any = null;

  // If they selected a complaint from the list
  if (complaintText.startsWith("COMPLAINT_")) {
    if (complaintText === "COMPLAINT_OTHER") {
      // Prompt them to type manually while staying in COMPLAINT_DESCRIBE state
      return makeReply(t("DESCRIBE_SHORT", lang));
    }
    const templateId = complaintText.replace("COMPLAINT_", "");
    selectedTemplate = await prisma.troubleshootingTemplate.findUnique({
      where: { id: templateId },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });
    if (selectedTemplate) {
      complaintText = selectedTemplate.title;
    } else {
      complaintText = ""; // Not found, will prompt to describe
    }
  }

  if (complaintText.length < 3) {
    return makeReply(t("DESCRIBE_SHORT", lang));
  }

  const updatedMeta: SessionMeta = { ...meta, complaint: complaintText };
  const productName = meta.selectedProduct || meta.machineData?.m_model || "";

  // If this was typed manually (not selected from list), log it
  if (!text.trim().startsWith("COMPLAINT_")) {
    await prisma.manualComplaint.create({
      data: {
        phoneNumber,
        machineName: productName || null,
        complaint: text.trim(),
      }
    }).catch(e => console.error("[simulate] failed to log manual complaint:", e));
  }

  const template = selectedTemplate || await findTroubleshootingTemplate(complaintText, productName);

  // ── Video recommendations: search by complaint + product name ──────────
  const videoSearchQuery = productName ? `${productName} ${complaintText}` : complaintText;
  const videos = await findVideosForQuery(videoSearchQuery, 3);

  if (!template || template.steps.length === 0) {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);
    const noStepsFollowUp = videos.length > 0 ? formatVideoSuggestions(videos, lang).trim() : undefined;
    return makeReply(
      t("NO_STEPS", lang, { complaint: complaintText }),
      [{ id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }, getMenuButton(lang)],
      undefined,
      undefined,
      noStepsFollowUp,
    );
  }

  const steps = template.steps
    .map((s: { stepContent: string }) => s.stepContent)
    .filter(isActionableStep);

  if (steps.length === 0) {
    await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);
    const emptyStepsFollowUp = videos.length > 0 ? formatVideoSuggestions(videos, lang).trim() : undefined;
    return makeReply(
      t("NO_STEPS", lang, { complaint: complaintText }),
      [{ id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }, getMenuButton(lang)],
      undefined,
      undefined,
      emptyStepsFollowUp,
    );
  }

  const stepsText = steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n");

  await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);

  const followUpMessage = videos.length > 0
    ? formatVideoSuggestions(videos, lang).trim()
    : undefined;

  return makeReply(
    t("STEPS_FOUND", lang, { complaint: complaintText, steps: stepsText }),
    [{ id: "YES", title: lang === "hi" ? "हाँ, हल हुआ ✅" : "Yes, Resolved ✅" }, { id: "BOOK_SERVICE", title: lang === "hi" ? "सेवा बुक करें 🔧" : "Book Service 🔧" }],
    undefined,
    undefined,
    followUpMessage,
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
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
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
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
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
async function handleComplaintManualPincode(sessionId: string, _phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const digits = text.replace(/\D/g, "");
  if (!/^\d{6}$/.test(digits)) {
    return makeReply(t("INVALID_PINCODE", lang));
  }

  const resolved = await fetchPlaceFromPincode(digits);
  const updatedMeta: SessionMeta = {
    ...meta,
    manualPincode:  digits,
    manualPlace:    resolved?.place,
    manualDistrict: resolved?.district,
    manualState:    resolved?.state,
    pincodeDisplay: resolved?.display || digits,
  };

  return showManualPincodeConfirm(sessionId, updatedMeta);
}

async function showManualPincodeConfirm(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  await updateSession(sessionId, "COMPLAINT_MANUAL_PINCODE_CONFIRM", meta);
  return makeReply(
    t("PINCODE_CONFIRM", lang, {
      location: pincodeLocationDisplay(meta),
      pincode:  meta.manualPincode || "",
    }),
    getYesNoButtons(lang),
  );
}

async function handleComplaintManualPincodeConfirm(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text === "1" || /^yes/i.test(text)) {
    if (!endCustomerName(meta) || !meta.manualPincode) {
      await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
      return makeReply(t("ENTER_NAME", lang));
    }
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", meta);
    return makeReply(t("ENTER_ADDRESS", lang));
  }
  if (text === "2" || /^no/i.test(text)) {
    const clearedMeta: SessionMeta = {
      ...meta,
      manualPincode:  undefined,
      manualPlace:    undefined,
      manualDistrict: undefined,
      manualState:    undefined,
      pincodeDisplay: undefined,
    };
    await updateSession(sessionId, "COMPLAINT_MANUAL_PINCODE", clearedMeta);
    return makeReply(t("ENTER_PINCODE", lang));
  }
  return makeReply(t("SELECT_VALID", lang), getYesNoButtons(lang));
}

async function handleEndCustomerAddress(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const address = text.trim();
  if (address.length < 10) {
    return makeReply(t("SHORT_ADDRESS", lang));
  }
  const updatedMeta: SessionMeta = { ...meta, manualAddress: address };
  if (meta.tsSerialPath && meta.machineData) {
    return executePasstestTicketCreation(sessionId, phoneNumber, updatedMeta);
  }
  return createTicketManual(sessionId, phoneNumber, updatedMeta);
}

// ── End-customer details (after Book Service on Passtest path) ────────────
function endCustomerName(meta: SessionMeta): string | undefined {
  return meta.manualName?.trim() || meta.customerName?.trim();
}

function phoneLookupVariants(phoneNumber: string): string[] {
  const digits = phoneNumber.replace(/\D/g, "");
  const variants = new Set<string>([phoneNumber]);
  if (digits) {
    variants.add(digits);
    variants.add(`91${digits}`);
    if (digits.startsWith("91") && digits.length > 10) variants.add(digits.slice(2));
  }
  return [...variants];
}

/** Reuse name + pincode from a prior ticket on this WhatsApp number. */
async function loadSavedEndCustomer(phoneNumber: string): Promise<Partial<SessionMeta> | null> {
  const ticket = await prisma.ticket.findFirst({
    where: {
      phoneNumber: { in: phoneLookupVariants(phoneNumber) },
      pincodeId:   { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { issueDescription: true, customerAddress: true, pincode: true },
  });
  if (!ticket?.pincode) return null;

  const nameMatch =
    ticket.issueDescription?.match(/End customer:\s*([^,]+)/i) ??
    ticket.issueDescription?.match(/Service contact:\s*([^,]+)/i);
  const name = nameMatch?.[1]?.trim();
  if (!name) return null;

  const addressMatch = ticket.issueDescription?.match(/Address:\s*([^,]+)/i);
  const savedAddress = ticket.customerAddress?.trim() || addressMatch?.[1]?.trim();

  const pc = ticket.pincode;
  const display = [pc.place, pc.district, pc.state].filter(Boolean).join(", ") || pc.code;
  return {
    manualName:     name,
    customerName:   name,
    manualPincode:  pc.code,
    manualPlace:    pc.place ?? undefined,
    manualDistrict: pc.district ?? undefined,
    manualState:    pc.state ?? undefined,
    pincodeDisplay: display,
    manualAddress:  savedAddress,
  };
}

function pincodeLocationDisplay(meta: SessionMeta): string {
  return (
    meta.pincodeDisplay ||
    [meta.manualPlace, meta.manualDistrict, meta.manualState].filter(Boolean).join(", ") ||
    meta.manualPincode ||
    "N/A"
  );
}

function buildEndCustomerIssueDescription(meta: SessionMeta, extra?: string): string {
  const name = endCustomerName(meta) || "N/A";
  const address = meta.manualAddress?.trim() || "N/A";
  const base = `End customer: ${name}, Address: ${address}, Service area: ${pincodeLocationDisplay(meta)}, Pincode: ${meta.manualPincode || "N/A"}`;
  return extra ? `${base}, ${extra}` : base;
}

async function showPasstestPincodeConfirm(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  await updateSession(sessionId, "PASSTEST_PINCODE_CONFIRM", meta);
  return makeReply(
    t("PINCODE_CONFIRM", lang, {
      location: pincodeLocationDisplay(meta),
      pincode:  meta.manualPincode || "",
    }),
    getYesNoButtons(lang),
  );
}

async function beginPasstestTicketBooking(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;

  let workingMeta = meta;
  if (!endCustomerName(workingMeta) || !workingMeta.manualPincode) {
    const saved = await loadSavedEndCustomer(phoneNumber);
    if (saved) {
      workingMeta = { ...workingMeta, ...saved, skipEndCustomerConfirm: true };
    }
  }

  if (!endCustomerName(workingMeta)) {
    await updateSession(sessionId, "PASSTEST_CUSTOMER_NAME", workingMeta);
    return makeReply(t("ENTER_NAME", lang));
  }

  if (!workingMeta.manualPincode) {
    await updateSession(sessionId, "PASSTEST_PINCODE", workingMeta);
    return makeReply(t("ENTER_PINCODE", lang));
  }

  if (workingMeta.skipEndCustomerConfirm) {
    const { skipEndCustomerConfirm: _, ...ticketMeta } = workingMeta;
    if (ticketMeta.manualAddress?.trim()) {
      return executePasstestTicketCreation(sessionId, phoneNumber, ticketMeta);
    }
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", ticketMeta);
    return makeReply(t("ENTER_ADDRESS", lang));
  }

  return showPasstestPincodeConfirm(sessionId, workingMeta);
}

async function handlePasstestCustomerName(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text.length < 2) {
    return makeReply(t("SHORT_NAME", lang));
  }
  const updatedMeta: SessionMeta = { ...meta, manualName: text.trim(), customerName: text.trim() };
  await updateSession(sessionId, "PASSTEST_PINCODE", updatedMeta);
  return makeReply(t("ENTER_PINCODE", lang));
}

async function handlePasstestPincode(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const digits = text.replace(/\D/g, "");
  if (!/^\d{6}$/.test(digits)) {
    return makeReply(t("INVALID_PINCODE", lang));
  }

  const resolved = await fetchPlaceFromPincode(digits);
  const updatedMeta: SessionMeta = {
    ...meta,
    manualPincode:  digits,
    manualPlace:    resolved?.place,
    manualDistrict: resolved?.district,
    manualState:    resolved?.state,
    pincodeDisplay: resolved?.display || digits,
  };

  return showPasstestPincodeConfirm(sessionId, updatedMeta);
}

async function handlePasstestPincodeConfirm(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  text: string,
) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text === "1" || /^yes/i.test(text)) {
    if (!endCustomerName(meta) || !meta.manualPincode) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", meta);
    return makeReply(t("ENTER_ADDRESS", lang));
  }
  if (text === "2" || /^no/i.test(text)) {
    const clearedMeta: SessionMeta = {
      ...meta,
      manualPincode:  undefined,
      manualPlace:    undefined,
      manualDistrict: undefined,
      manualState:    undefined,
      pincodeDisplay: undefined,
    };
    await updateSession(sessionId, "PASSTEST_PINCODE", clearedMeta);
    return makeReply(t("ENTER_PINCODE", lang));
  }
  return makeReply(t("SELECT_VALID", lang), getYesNoButtons(lang));
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
  if (!endCustomerName(meta) || !meta.manualPincode) {
    return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
  }
  if (!meta.manualAddress?.trim()) {
    const lang: Lang = (meta.language ?? "en") as Lang;
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", meta);
    return makeReply(t("ENTER_ADDRESS", lang));
  }
  return executePasstestTicketCreation(sessionId, phoneNumber, meta);
}

async function executePasstestTicketCreation(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    return makeReply(t("SERVICE_UNAVAILABLE", lang));
  }

  if (!endCustomerName(meta) || !meta.manualPincode || !meta.manualAddress?.trim()) {
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", meta);
    return makeReply(t("ENTER_ADDRESS", lang));
  }

  const md = meta.machineData!;
  const pincodeCode = meta.manualPincode!;
  const serial = meta.serialNumber ?? "";
  const productName = meta.selectedProduct || md.m_model || "";
  const complaintText = meta.complaint || "Service request via chat";
  const dealerAddress = [md.Address1, md.Address2].filter(Boolean).join(", ");
  const dealerExtra = `Dealer: ${md.customer || "N/A"}${dealerAddress ? `, Dealer address: ${dealerAddress}` : ""}`;

  let pincodeId: string | undefined;
  let pincodeRecord = await prisma.pincode.findFirst({ where: { code: pincodeCode } });
  if (!pincodeRecord) {
    pincodeRecord = await prisma.pincode.create({
      data: {
        code:     pincodeCode,
        place:    meta.manualPlace    || null,
        district: meta.manualDistrict || null,
        state:    meta.manualState    || null,
      },
    });
  } else if (meta.manualPlace || meta.manualDistrict || meta.manualState) {
    pincodeRecord = await prisma.pincode.update({
      where: { id: pincodeRecord.id },
      data: {
        place:    meta.manualPlace    || pincodeRecord.place,
        district: meta.manualDistrict || pincodeRecord.district,
        state:    meta.manualState    || pincodeRecord.state,
      },
    });
  }
  pincodeId = pincodeRecord.id;

  const ticket = await TicketService.createTicket({
    customerId:          adminUser.id,
    problemDescription:  `${productName ? productName + ": " : ""}${complaintText}`,
    issueDescription:    buildEndCustomerIssueDescription(meta, dealerExtra),
    machineName:         md.m_model || productName || undefined,
    machineSerialNumber: serial,
    pincodeId,
    phoneNumber,
    place:               meta.manualPlace,
    district:            meta.manualDistrict,
    state:               meta.manualState,
    customerAddress:     meta.manualAddress!.trim(),
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
      location: pincodeLocationDisplay(meta),
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

  if (!endCustomerName(meta) || !meta.manualPincode || !meta.manualAddress?.trim()) {
    if (!endCustomerName(meta)) {
      await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
      return makeReply(t("ENTER_NAME", lang));
    }
    if (!meta.manualPincode) {
      await updateSession(sessionId, "COMPLAINT_MANUAL_PINCODE", meta);
      return makeReply(t("ENTER_PINCODE", lang));
    }
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", meta);
    return makeReply(t("ENTER_ADDRESS", lang));
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
    issueDescription:    buildEndCustomerIssueDescription(meta),
    machineName:         productName || undefined,
    machineSerialNumber: meta.serialNumber || undefined,
    pincodeId,
    phoneNumber,
    place:               meta.manualPlace,
    district:            meta.manualDistrict,
    state:               meta.manualState,
    customerAddress:     meta.manualAddress!.trim(),
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

  if (upper === "LANG_EN" || upper === "EN" || upper === "ENGLISH") {
    const newMeta: SessionMeta = { ...meta, language: "en" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_EN", "en") + "\n\n" + t("MAIN_MENU_MSG", "en"),
      undefined,
      getMainMenuList("en"),
    );
  }
  if (upper === "LANG_HI" || upper === "HINDI" || text === "हिंदी") {
    const newMeta: SessionMeta = { ...meta, language: "hi" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_HI", "hi") + "\n\n" + t("MAIN_MENU_MSG", "hi"),
      undefined,
      getMainMenuList("hi"),
    );
  }
  if (upper === "CHANGE_LANGUAGE") {
    return makeReply(t("LANG_SELECT", lang), LANG_BUTTONS);
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

function isGlobalRestartCommand(upper: string): boolean {
  return (
    upper === "MENU" ||
    upper === "START" ||
    upper === "RESET" ||
    /^H[IE]+I*$/.test(upper) ||
    /^HELL+O*$/.test(upper)
  );
}

export type ReplyButton = { id: string; title: string };
export type ReplyList = { buttonText: string; rows: Array<{ id: string; title: string; description?: string }> };
export type ProductImage = { url: string; caption: string };
export type SimulateReply = {
  message: string;
  buttons?: ReplyButton[];
  list?: ReplyList;
  images?: ProductImage[];
  /** Plain-text follow-up (e.g. video links) sent after interactive replies on WhatsApp. */
  followUpMessage?: string;
};

function makeReply(
  message: string,
  buttons?: ReplyButton[],
  list?: ReplyList,
  images?: ProductImage[],
  followUpMessage?: string,
): SimulateReply {
  return { message, buttons, list, images, followUpMessage };
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
