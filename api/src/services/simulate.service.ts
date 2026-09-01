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
import { fetchPlaceFromPincode, extractPincodeFromAddress } from "../lib/pincode";
import * as TicketService from "./ticket.service";
import { fetchMachineBySerial, type PasstestMachine } from "./machine.service";
import { resolveDealerFromPasstestCustomer } from "./dealerMatch.service";
import { embedText, searchVectors } from "./vector.service";
import { translateText } from "./translate.service";

import { io } from "../lib/socket";
import { runtime } from "./runtime-config.service";
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
import * as WhatsAppService from "./whatsapp.service";
import { touchSupportActivity } from "./support-inactivity.service";

// ── Session metadata shape ────────────────────────────────────────────────
type SessionMeta = {
  customerName?: string;
  customerPhone?: string;
  serialNumber?: string;
  machineData?: PasstestMachine | null;
  candidateSerial?: string;
  candidateMachineData?: PasstestMachine | null;
  manualName?: string;
  manualPlace?: string;
  manualPincode?: string;
  manualDistrict?: string;
  manualState?: string;
  manualAddress?: string;
  manualGmapLink?: string;
  complaint?: string;
  lastIssueQuery?: string;
  targetCloseTicketId?: string;
  targetCloseTicketNumber?: string;
  selectedTicketId?: string;
  selectedTicketNumber?: string;
  pincodeDisplay?: string;
  selectedProduct?: string;
  complaintSubcategory?: string;
  productCategory?: ProductCategory;
  feedbackTicketId?: string;
  tsSessionId?: string;
  tsSerialPath?: boolean;
  tsSteps?: string[];
  tsCurrentStep?: number;
  language?: Lang;
  previousFsmState?: string;
  /** Set when name/pincode were loaded from a prior ticket — skip confirm on Book Service */
  skipEndCustomerConfirm?: boolean;
  customComplaintPath?: boolean;
  videoSearchQuery?: string;
  /** Registration flow (new customer first-time sign-up) */
  regSerialNumber?: string;
  regMachineData?: PasstestMachine | null;
  regName?: string;
  regAddress?: string;
  regPincode?: string;
  regPlace?: string;
  regDistrict?: string;
  regState?: string;
  regGmapLink?: string;
  regCustomerId?: string;
  regIsDealerMachine?: boolean;
  hasSkippedRegistration?: boolean;
  machineCount?: string | number;
  role?: string;
  isEngineer?: boolean;
  mediaUrls?: string[];
  complaintMediaUrl?: string;
  /** Product browsing */
  selectedCategory?: string;
  selectedProductId?: string;
  /** Live Support */
  isWaitingForSupport?: boolean;
  supportRequestedAt?: string;
};

// ── Language type ─────────────────────────────────────────────────────────
type Lang = "en" | "hi" | "ta" | "kn" | "mr" | "te" | "bn" | "ml";

export function isGreetingOrSmallTalk(text: string): boolean {
  if (!text || typeof text !== "string") return true;
  const clean = text.trim().toLowerCase().replace(/[^\w\s]/g, "");
  if (clean.length < 2) return true;

  const smallTalkExact = new Set([
    "hi", "hello", "hey", "hii", "heyy", "hola", "namaste", "vanakkam", "namaskaram",
    "how are you", "how r u", "how are u", "how r you", "how do you do", "how it going",
    "whats up", "what is up", "sup", "what are you doing",
    "good morning", "good afternoon", "good evening", "good night", "gm", "gn", "ga", "ge",
    "thank you", "thanks", "thx", "thank u", "dhanyawad", "nandi", "shukriya", "dhanyavadhaalu",
    "ok", "okay", "k", "kk", "yes", "no", "fine", "cool", "super", "nice", "great", "welcome", "alright",
    "who are you", "who r u", "what is your name", "whats your name", "who made you",
    "where is your office", "where are you located", "location", "address", "company address",
    "bye", "see you", "tata", "goodbye", "help", "menu", "start"
  ]);

  if (smallTalkExact.has(clean)) return true;

  const greetingPatterns = [
    /^(hi+|hello+|hey+|hola|namaste|vanakkam|namaskaram)\b/i,
    /^how (are|r) (you|u)/i,
    /^good (morning|afternoon|evening|night)/i,
    /^(thanks|thank you|thx)\b/i,
    /^who (are|r) (you|u)/i,
    /^what is (your|ur) name/i,
  ];

  return greetingPatterns.some(p => p.test(clean));
}

export function isTechnicalIssueQuery(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  if (isGreetingOrSmallTalk(text)) return false;
  const clean = text.trim().toLowerCase();

  const issueKeywords = [
    "error", "t1", "t2", "t3", "not working", "not on", "issue", "problem", "repair", "fault",
    "damage", "fail", "complaint", "blinking", "vibrating", "vibration", "noise", "leak",
    "variation", "stopped", "stuck", "slow", "sound", "display", "light", "heat", "smell",
    "speed", "power", "switch", "sensor", "pump", "stirrer", "fuse", "board", "weighing",
    "scale", "reading", "calibration", "sample", "hot sample", "cold sample", "cleaning",
    "acid", "alkali", "adapter", "battery", "charger", "showing", "shwoing", "shown", "show",
    "details", "farmer", "print", "printer", "wifi", "wi-fi", "connect", "connectivity",
    "bluetooth", "update", "date", "time", "rate", "chart", "pen-drive", "pendrive", "usb",
    "gsm", "cloud", "flicker", "flickering", "broken", "fix", "help", "running", "off",
    "voltage", "current", "output", "input", "dead", "zero", "result", "restart", "burn",
    "water", "air", "milk", "stir", "not", "no", "cant", "cannot", "won't", "wont",
    "เคด", "കേടായി", "പരാതി", "തകരാർ", "സഹായം", "ശരിയാക്കാൻ", "കാണിക്കുന്നില്ല"
  ];

  return issueKeywords.some(kw => clean.includes(kw));
}

// ── Bilingual translations (English / हिंदी) ──────────────────────────────
const TRANSLATIONS: Record<string, Record<Lang, string>> = {
  GREETING_HEADER: {
    en: "🙏 *Welcome to Poornasree Equipments!*\nYour Trusted Service Partner 🔧\n--------------------\n\n",
    hi: "🙏 *पूर्णश्री इक्विपमेंट्स में आपका स्वागत है!*\nआपका विश्वसनीय सेवा साझेदार 🔧\n--------------------\n\n",
    ta: "🙏 *பூர்ணஸ்ரீ எக்விப்மென்ட்ஸுக்கு வரவேற்கிறோம்!*\nஉங்கள் நம்பகமான சேவை கூட்டாளர் 🔧\n--------------------\n\n",
    kn: "🙏 *ಪೂರ್ಣಶ್ರೀ ಎಕ್ವಿಪ್ಮೆಂಟ್ಸ್‌ಗೆ ಸುಸ್ವಾಗತ!*\nನಿಮ್ಮ ವಿಶ್ವಾಸಾರ್ಹ ಸೇವಾ ಪಾಲುದಾರ 🔧\n--------------------\n\n",
    mr: "🙏 *पूर्णश्री इक्विपमेंट्समध्ये आपले स्वागत आहे!*\nआपला विश्वासू सेवा भागीदार 🔧\n--------------------\n\n",
    te: "🙏 *పూర్ణశ్రీ ఎక్విప్‌మెంట్స్‌కు స్వాగతం!*\nమీ నమ్మకమైన సేవా భాగస్వామి 🔧\n--------------------\n\n",
    bn: "🙏 *পূর্ণশ্রী ইকুইপমেন্টসে আপনাকে স্বাগতম!*\nআপনার বিশ্বস্ত পরিষেবা অংশীদার 🔧\n--------------------\n\n",
    ml: "🙏 *പൂർണ്ണശ്രീ ഇക്വിപ്മെന്റ്സിലേക്ക് സ്വാഗതം!*\nനിങ്ങളുടെ വിശ്വസ്ത സേവന പങ്കാളി 🔧\n--------------------\n\n",
  },
  MAIN_MENU_MSG: {
    en: "💡 You can select an option from the menu below, or type any question to ask me anything directly! 💬\n\nPlease select an option below 👇",
    hi: "💡 आप नीचे मेनू से एक विकल्प चुन सकते हैं, या मुझसे कुछ भी पूछने के लिए सीधा प्रश्न टाइप कर सकते हैं! 💬\n\nकृपया नीचे एक विकल्प चुनें 👇",
    ta: "💡 கீழே உள்ள மெனுவிலிருந்து ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கலாம் அல்லது என்னிடம் எதையும் கேட்க எந்தக் கேள்வியையும் நேரடியாகத் தட்டச்சு செய்யலாம்! 💬\n\nதயவுசெய்து கீழே ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும் 👇",
    kn: "💡 ನೀವು ಕೆಳಗಿನ ಮೆನುವಿನಿಂದ ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿಕೊಳ್ಳಬಹುದು, ಅಥವಾ ನನ್ನನ್ನು ಏನನ್ನಾದರೂ ಕೇಳಲು ನೇರವಾಗಿ ಯಾವುದೇ ಪ್ರಶ್ನೆಯನ್ನು ಟೈಪ್ ಮಾಡಬಹುದು! 💬\n\nದಯವಿಟ್ಟು ಕೆಳಗಿನ ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ 👇",
    mr: "💡 तुम्ही खालील मेनूमधून एक पर्याय निवडू शकता किंवा मला काहीही विचारण्यासाठी थेट प्रश्न टाईप करू शकता! 💬\n\nकृपया खालीलपैकी एक पर्याय निवडा 👇",
    te: "💡 మీరు క్రింది మెనూ నుండి ఒక ఎంపికను ఎంచుకోవచ్చు, లేదా నన్ను ఏమైనా అడగడానికి నేరుగా ప్రశ్న టైప్ చేయవచ్చు! 💬\n\nదయచేసి క్రింద ఉన్న ఎంపికను ఎంచుకోండి 👇",
    bn: "💡 আপনি নিচের মেনু থেকে একটি বিকল্প নির্বাচন করতে পারেন, অথবা আমাকে যেকোনো প্রশ্ন সরাসরি টাইপ করে জিজ্ঞাসা করতে পারেন! 💬\n\nঅনুগ্রহ করে নিচের একটি বিকল্প নির্বাচন করুন 👇",
    ml: "💡 താഴെയുള്ള മെനുവിൽ നിന്ന് ഒരു ഓപ്ഷൻ തിരഞ്ഞെടുക്കാം, അല്ലെങ്കിൽ എന്നോട് നേരിട്ട് സംശയങ്ങൾ ചോദിക്കാം! 💬\n\nദയവായി താഴെ ഒരു ഓപ്ഷൻ തിരഞ്ഞെടുക്കുക 👇",
  },
  REGISTER_WELCOME: {
    en: "👋 *Welcome to Poornasree!*\n\nWe don't have your details on file yet.\n\n📝 *Register now* to enjoy faster service and personalised support.\n\nOr press *Skip* to continue without registering.",
    hi: "👋 *पूर्णश्री में आपका स्वागत है!*\n\nहमारे पास अभी आपका विवरण नहीं है।\n\n📝 तेज़ सेवा और व्यक्तिगत सहायता के लिए *अभी पंजीकरण करें*।\n\nया पंजीकरण किए बिना जारी रखने के लिए *Skip* दबाएं।",
    ta: "👋 *பூர்ணஸ்ரீ-க்கு வரவேற்கிறோம்!*\n\nஉங்கள் விவரங்கள் எங்களிடம் இன்னும் இல்லை.\n\n📝 வேகமான சேவை மற்றும் தனிப்பட்ட ஆதரவுக்கு *இப்போது பதிவு செய்யுங்கள்*.\n\nஅல்லது பதிவு செய்யாமல் தொடர *Skip* அழுத்தவும்.",
    kn: "👋 *ಪೂರ್ಣಶ್ರೀಗೆ ಸುಸ್ವಾಗತ!*\n\nನಿಮ್ಮ ವಿವರಗಳು ಇನ್ನೂ ನಮ್ಮಲ್ಲಿ ಇಲ್ಲ.\n\n📝 ವೇಗದ ಸೇವೆ ಮತ್ತು ವೈಯಕ್ತಿಕ ಬೆಂಬಲಕ್ಕಾಗಿ *ಈಗಲೇ ನೋಂದಾಯಿಸಿ*.\n\nಅಥವಾ ನೋಂದಣಿ ಮಾಡದೆ ಮುಂದುವರಿಯಲು *Skip* ಒತ್ತಿರಿ.",
    mr: "👋 *पूर्णश्रीमध्ये आपले स्वागत आहे!*\n\nआपले तपशील अद्याप आमच्याकडे नाहीत.\n\n📝 जलद सेवा आणि वैयक्तिकृत सहाय्यासाठी *आता नोंदणी करा*.\n\nकिंवा नोंदणी न करता पुढे जाण्यासाठी *Skip* दाबा.",
    te: "👋 *పూర్ణశ్రీకి స్వాగతం!*\n\nమీ వివరాలు ఇంకా మా వద్ద లేవు.\n\n📝 వేగవంతమైన సేవ మరియు వ్యక్తిగతీకరించిన మద్దతు కోసం *ఇప్పుడే నమోదు చేయండి*.\n\nలేదా నమోదు చేయకుండా కొనసాగడానికి *Skip* నొక్కండి.",
    bn: "👋 *পূর্ণশ্রীতে আপনাকে স্বাগতম!*\n\nআপনার বিবরণ এখনও আমাদের কাছে নেই।\n\n📝 দ্রুত পরিষেবা এবং ব্যক্তিগতকরণ সহায়তার জন্য *এখনই নিবন্ধন করুন*।\n\nঅথবা নিবন্ধন না করে চালিয়ে যেতে *Skip* টিপুন।",
    ml: "👋 *പൂർണ്ണശ്രീയിലേക്ക് സ്വാഗതം!*\n\nനിങ്ങളുടെ വിവരങ്ങൾ ഇതുവരെ രജിസ്റ്റർ ചെയ്തിട്ടില്ല.\n\n📝 വേഗത്തിലുള്ള സേവനത്തിനും പിന്തുണയ്ക്കും *ഇപ്പോൾ രജിസ്റ്റർ ചെയ്യുക*.\n\nഅല്ലെങ്കിൽ രജിസ്റ്റർ ചെയ്യാതെ തുടരാൻ *Skip* അമർത്തുക.",
  },
  REGISTER_BUTTON: {
    en: "📝 Register Now",
    hi: "📝 अभी पंजीकरण करें",
    ta: "📝 இப்போது பதிவு செய்க",
    kn: "📝 ಈಗಲೇ ನೋಂದಾಯಿಸಿ",
    mr: "📝 आता नोंदणी करा",
    te: "📝 ఇప్పుడే నమోదు చేయండి",
    bn: "📝 এখনই নিবন্ধন করুন",
    ml: "📝 ഇപ്പോൾ രജിസ്റ്റർ ചെയ്യുക",
  },
  REGISTER_MACHINE_COUNT_PROMPT: {
    en: "🔢 *How many machines do you have?*\n\nPlease select or type the number of machines you own:",
    hi: "🔢 *आपके पास कितनी मशीनें हैं?*\n\nकृपया अपनी मशीनों की संख्या चुनें या टाइप करें:",
    ta: "🔢 *உங்களிடம் எத்தனை இயந்திரங்கள் உள்ளன?*\n\nஉங்கள் இயந்திரங்களின் எண்ணிக்கையைத் தேர்ந்தெடுக்கவும் அல்லது தட்டச்சு செய்யவும்:",
    kn: "🔢 *ನಿಮ್ಮ ಬಳಿ ಎಷ್ಟು ಯಂತ್ರಗಳಿವೆ?*\n\nದಯವಿಟ್ಟು ನಿಮ್ಮ ಯಂತ್ರಗಳ ಸಂಖ್ಯೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ ಅಥವಾ ಟೈಪ್ ಮಾಡಿ:",
    mr: "🔢 *आपल्याकडे किती मशीन्स आहेत?*\n\nकृपया आपल्या मशीनची संख्या निवडा किंवा टाइप करा:",
    te: "🔢 *మీ వద్ద ఎన్ని యంత్రాలు ఉన్నాయి?*\n\nదయచేసి మీ యంత్రాల సంఖ్యను ఎంచుకోండి లేదా టైప్ చేయండి:",
    bn: "🔢 *আপনার কাছে কতগুলি মেশিন আছে?*\n\nঅনুগ্রহ করে আপনার মেশিনের সংখ্যা নির্বাচন করুন বা লিখুন:",
    ml: "🔢 *നിങ്ങൾക്ക് എത്ര മെഷീനുകൾ ഉണ്ട്?*\n\nദയവായി മെഷീനുകളുടെ എണ്ണം തിരഞ്ഞെടുക്കുക അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യുക:",
  },
  COUNT_ONE_BUTTON: {
    en: "1️⃣ 1 Machine",
    hi: "1️⃣ 1 मशीन",
    ta: "1️⃣ 1 இயந்திரம்",
    kn: "1️⃣ 1 ಯಂತ್ರ",
    mr: "1️⃣ 1 मशीन",
    te: "1️⃣ 1 యంత్రం",
    bn: "1️⃣ 1টি মেশিন",
    ml: "1️⃣ 1 മെഷീൻ",
  },
  COUNT_MULTI_BUTTON: {
    en: "🔢 More than 1",
    hi: "🔢 1 से अधिक",
    ta: "🔢 1-க்கு மேல்",
    kn: "🔢 1 ಕ್ಕಿಂತ ಹೆಚ್ಚು",
    mr: "🔢 1 पेक्षा जास्त",
    te: "🔢 1 కంటే ఎక్కువ",
    bn: "🔢 1-এর বেশি",
    ml: "🔢 ഒന്നിൽ കൂടുതൽ",
  },
  REGISTER_SERIAL_PROMPT: {
    en: "📝 *Registration — Step 1 of 4*\n\n🔧 Please enter your machine *serial number*.\n\n_(You can find it on the machine label or warranty card)_\n\nIf you don't have one, press *Skip*.",
    hi: "📝 *पंजीकरण — चरण 1/4*\n\n🔧 कृपया अपनी मशीन का *सीरियल नंबर* दर्ज करें।\n\n_(यह मशीन के लेबल या वारंटी कार्ड पर मिलता है)_\n\nयदि आपके पास नहीं है, तो *Skip* दबाएं।",
    ta: "📝 *பதிவு — படி 1/4*\n\n🔧 உங்கள் இயந்திரத்தின் *வரிசை எண்ணை* உள்ளிடவும்.\n\n_(இயந்திர லேபிள் அல்லது உத்தரவாத அட்டையில் காணலாம்)_\n\nஉங்களிடம் இல்லையென்றால், *Skip* அழுத்தவும்.",
    kn: "📝 *ನೋಂದಣಿ — ಹಂತ 1/4*\n\n🔧 ದಯವಿಟ್ಟು ನಿಮ್ಮ ಯಂತ್ರದ *ಸರಣಿ ಸಂಖ್ಯೆ* ನಮೂದಿಸಿ.\n\n_(ಯಂತ್ರದ ಲೇಬಲ್ ಅಥವಾ ವಾರಂಟಿ ಕಾರ್ಡ್‌ನಲ್ಲಿ ಕಾಣಬಹುದು)_\n\nನಿಮ್ಮ ಬಳಿ ಇಲ್ಲದಿದ್ದರೆ, *Skip* ಒತ್ತಿರಿ.",
    mr: "📝 *नोंदणी — टप्पा 1/5*\n\n🔧 कृपया आपल्या मशीनचा *अनुक्रमांक* प्रविष्ट करा.\n\n_(मशीनच्या लेबलवर किंवा वॉरंटी कार्डवर आढळू शकतो)_\n\nआपल्याकडे नसल्यास, *Skip* दाबा.",
    te: "📝 *నమోదు — దశ 1/4*\n\n🔧 దయచేసి మీ యంత్రం *సీరియల్ నంబర్* నమోదు చేయండి.\n\n_(యంత్రం లేబుల్ లేదా వారంటీ కార్డులో కనుగొనవచ్చు)_\n\nమీ వద్ద లేకుంటే, *Skip* నొక్కండి.",
    bn: "📝 *নিবন্ধন — ধাপ 1/4*\n\n🔧 অনুগ্রহ করে আপনার মেশিনের *সিরিয়াল নম্বর* লিখুন।\n\n_(মেশিনের লেবেল বা ওয়ারেন্টি কার্ডে পাওয়া যেতে পারে)_\n\nআপনার কাছে না থাকলে, *Skip* টিপুন।",
    ml: "🔧 ദയവായി നിങ്ങളുടെ മെഷീൻ *സീരിയൽ നമ്പർ* നൽകുക (ഉദാഹരണത്തിന് ECO-2024-8841):",
  },
  REGISTER_SERIAL_NOT_FOUND: {
    en: "❌ Serial number *{serial}* was not found in our records.\n\nPlease double-check and try again, or press *Skip* to continue without a serial number.",
    hi: "❌ सीरियल नंबर *{serial}* हमारे रिकॉर्ड में नहीं मिला।\n\nकृपया दोबारा जांचें और पुनः प्रयास करें, या बिना सीरियल नंबर के जारी रखने के लिए *Skip* दबाएं।",
    ta: "❌ வரிசை எண் *{serial}* எங்கள் பதிவுகளில் கிடைக்கவில்லை.\n\nமீண்டும் சரிபார்த்து முயற்சிக்கவும் அல்லது வரிசை எண் இல்லாமல் தொடர *Skip* அழுத்தவும்.",
    kn: "❌ ಸರಣಿ ಸಂಖ್ಯೆ *{serial}* ನಮ್ಮ ದಾಖಲೆಗಳಲ್ಲಿ ಕಂಡುಬಂದಿಲ್ಲ.\n\nಮತ್ತೊಮ್ಮೆ ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಸರಣಿ ಸಂಖ್ಯೆ ಇಲ್ಲದೆ ಮುಂದುವರಿಯಲು *Skip* ಒತ್ತಿರಿ.",
    mr: "❌ अनुक्रमांक *{serial}* आमच्या रेकॉर्डमध्ये सापडला नाही.\n\nकृपया पुन्हा तपासा आणि प्रयत्न करा, किंवा अनुक्रमांक नसताना पुढे जाण्यासाठी *Skip* दाबा.",
    te: "❌ సీరియల్ నంబర్ *{serial}* మా రికార్డులలో దొరకలేదు.\n\nదయచేసి మళ్ళీ తనిఖీ చేసి ప్రయత్నించండి, లేదా సీరియల్ నంబర్ లేకుండా కొనసాగడానికి *Skip* నొక్కండి.",
    bn: "❌ সিরিয়াল নম্বর *{serial}* আমাদের রেকর্ডে পাওয়া যায়নি।\n\nঅনুগ্রহ করে আবার পরীক্ষা করে চেষ্টা করুন, বা সিরিয়াল নম্বর ছাড়াই চালিয়ে যেতে *Skip* টিপুন।",
    ml: "❌ সিরিয়াল নম্বর *{serial}* আমাদের রেকর্ডে পাওয়া যায়নি।\n\nঅনুগ্রহ করে আবার পরীক্ষা করে চেষ্টা করুন, বা সিরিয়াল নম্বর ছাড়াই চালিয়ে যেতে *Skip* টিপুন।",
  },
  REGISTER_MACHINE_FOUND: {
    // Non-dealer machine: show model + serial only (no warranty)
    en: "✅ *Machine Found!*\n\n🔧 *Model:* {model}\n🔢 *Serial:* {serial}\n\nWe will use these details for your registration.\n\nPress *Continue* to proceed.",
    hi: "✅ *मशीन मिली!*\n\n🔧 *मॉडल:* {model}\n🔢 *सीरियल:* {serial}\n\nहम आपके पंजीकरण के लिए इन विवरणों का उपयोग करेंगे।\n\nजारी रखने के लिए *Continue* दबाएं।",
    ta: "✅ *இயந்திரம் கண்டுபிடிக்கப்பட்டது!*\n\n🔧 *மாதிரி:* {model}\n🔢 *வரிசை எண்:* {serial}\n\nஉங்கள் பதிவுக்கு இந்த விவரங்கள் பயன்படுத்தப்படும்.\n\nதொடர *Continue* அழுத்தவும்.",
    kn: "✅ *ಯಂತ್ರ ಸಿಕ್ಕಿದೆ!*\n\n🔧 *ಮಾದರಿ:* {model}\n🔢 *ಸರಣಿ:* {serial}\n\nನಿಮ್ಮ ನೋಂದಣಿಗಾಗಿ ಈ ವಿವರಗಳನ್ನು ಬಳಸುತ್ತೇವೆ.\n\nಮುಂದುವರಿಯಲು *Continue* ಒತ್ತಿರಿ.",
    mr: "✅ *मशीन सापडली!*\n\n🔧 *मॉडेल:* {model}\n🔢 *अनुक्रमांक:* {serial}\n\nआपल्या नोंदणीसाठी हे तपशील वापरले जातील.\n\nपुढे जाण्यासाठी *Continue* दाबा.",
    te: "✅ *యంత్రం దొరికింది!*\n\n🔧 *మోడల్:* {model}\n🔢 *సీరియల్:* {serial}\n\nమీ నమోదు కోసం ఈ వివరాలను ఉపయోగిస్తాము.\n\nకొనసాగడానికి *Continue* నొక్కండి.",
    bn: "✅ *মেশিন পাওয়া গেছে!*\n\n🔧 *মডেল:* {model}\n🔢 *সিরিয়াল:* {serial}\n\nআপনার নিবন্ধনের জন্য এই বিবরণ ব্যবহার করা হবে।\n\nচালিয়ে যেতে *Continue* টিপুন।",
    ml: "✅ *মেশিন পাওয়া গেছে!*\n\n🔧 *মডেল:* {model}\n🔢 *সিরিয়াল:* {serial}\n\nআপনার নিবন্ধনের জন্য এই বিবরণ ব্যবহার করা হবে।\n\nচালিয়ে যেতে *Continue* টিপুন।",
  },
  REGISTER_MACHINE_FOUND_DEALER: {
    // Dealer machine: show dealer name, model, serial — hide warranty/invoice/product code
    en: "✅ *Machine Found!*\n\n🏪 *Dealer:* {dealerName}\n🔧 *Model:* {model}\n🔢 *Serial:* {serial}\n\nWe will use these details for your registration.\n\nPress *Continue* to proceed.",
    hi: "✅ *मशीन मिली!*\n\n🏪 *डीलर:* {dealerName}\n🔧 *मॉडल:* {model}\n🔢 *सीरियल:* {serial}\n\nहम आपके पंजीकरण के लिए इन विवरणों का उपयोग करेंगे।\n\nजारी रखने के लिए *Continue* दबाएं।",
    ta: "✅ *இயந்திரம் கண்டுபிடிக்கப்பட்டது!*\n\n🏪 *டீலர்:* {dealerName}\n🔧 *மாதிரி:* {model}\n🔢 *வரிசை எண்:* {serial}\n\nஉங்கள் பதிவுக்கு இந்த விவரங்கள் பயன்படுத்தப்படும்.\n\nதொடர *Continue* அழுத்தவும்.",
    kn: "✅ *ಯಂತ್ರ ಸಿಕ್ಕಿದೆ!*\n\n🏪 *ಡೀಲರ್:* {dealerName}\n🔧 *ಮಾದರಿ:* {model}\n🔢 *ಸರಣಿ:* {serial}\n\nನಿಮ್ಮ ನೋಂದಣಿಗಾಗಿ ಈ ವಿವರಗಳನ್ನು ಬಳಸುತ್ತೇವೆ.\n\nಮುಂದುವರಿಯಲು *Continue* ಒತ್ತಿರಿ.",
    mr: "✅ *मशीन सापडली!*\n\n🏪 *डीलर:* {dealerName}\n🔧 *मॉडेल:* {model}\n🔢 *अनुक्रमांक:* {serial}\n\nआपल्या नोंदणीसाठी हे तपशील वापरले जातील.\n\nपुढे जाण्यासाठी *Continue* दाबा.",
    te: "✅ *యంత్రం దొరికింది!*\n\n🏪 *డీలర్:* {dealerName}\n🔧 *మోడల్:* {model}\n🔢 *సీరియల్:* {serial}\n\nమీ నమోదు కోసం ఈ వివరాలను ఉపయోగిస్తాము.\n\nకొనసాగడానికి *Continue* నొక్కండి.",
    bn: "✅ *মেশিন পাওয়া গেছে!*\n\n🏪 *ডিলার:* {dealerName}\n🔧 *মডেল:* {model}\n🔢 *সিরিয়াল:* {serial}\n\nআপনার নিবন্ধনের জন্য এই বিবরণ ব্যবহার করা হবে।\n\nচালিয়ে যেতে *Continue* টিপুন।",
    ml: "✅ *মেশিন পাওয়া গেছে!*\n\n🏪 *ডিলার:* {dealerName}\n🔧 *মডেল:* {model}\n🔢 *সিরিয়াল:* {serial}\n\nআপনার নিবন্ধনের জন্য এই বিবরণ ব্যবহার করা হবে।\n\nচালিয়ে যেতে *Continue* টিপুন।",
  },
  REGISTER_CONTINUE_BUTTON: {
    en: "✅ Continue",
    hi: "✅ आगे बढ़ें",
    ta: "✅ தொடரவும்",
    kn: "✅ ಮುಂದುವರಿಸಿ",
    mr: "✅ पुढे जा",
    te: "✅ కొనసాగించు",
    bn: "✅ চালিয়ে যান",
    ml: "✅ চালিয়ে যান",
  },
  REGISTER_NAME_PROMPT: {
    en: "📝 *Registration — Step 2 of 4*\n\n👤 Please enter your *full name*.",
    hi: "📝 *पंजीकरण — चरण 2/4*\n\n👤 कृपया अपना *पूरा नाम* दर्ज करें।",
    ta: "📝 *பதிவு — படி 2/4*\n\n👤 உங்கள் *முழு பெயரை* உள்ளிடவும்.",
    kn: "📝 *ನೋಂದಣಿ — ಹಂತ 2/4*\n\n👤 ದಯವಿಟ್ಟು ನಿಮ್ಮ *ಪೂರ್ಣ ಹೆಸರನ್ನು* ನಮೂದಿಸಿ.",
    mr: "📝 *नोंदणी — टप्पा 2/5*\n\n👤 कृपया आपले *पूर्ण नाव* प्रविष्ट करा.",
    te: "📝 *నమోదు — దశ 2/4*\n\n👤 దయచేసి మీ *పూర్తి పేరు* నమోదు చేయండి.",
    bn: "📝 *নিবন্ধন — ধাপ 2/4*\n\n👤 অনুগ্রহ করে আপনার *পূর্ণ নাম* লিখুন।",
    ml: "📝 *രജിസ്ട്രേഷൻ — ഘട്ടം 2/4*\n\n👤 ദയവായി നിങ്ങളുടെ *പൂർണ്ണമായ പേര്* ടൈപ്പ് ചെയ്യുക.",
  },
  REGISTER_ADDRESS_PROMPT: {
    en: "📝 *Registration — Step 3 of 4*\n\n🏠 Please enter your *full address* (house no., street, landmark).\n\nExample: House 12, Main Road, near temple",
    hi: "📝 *पंजीकरण — चरण 4/4*\n\n🏠 कृपया अपना *पूरा पता* दर्ज करें (मकान नं., सड़क, लैंडमार्क)।\n\nउदाहरण: मकान 12, मुख्य सड़क, मंदिर के पास",
    ta: "📝 *பதிவு — படி 4/4*\n\n🏠 உங்கள் *முழு முகவரியை* உள்ளிடவும் (வீட்டு எண், தெரு, அடையாளம்).\n\nஉதாரணம்: வீடு 12, பிரதான சாலை, கோயிலுக்கு அருகில்",
    kn: "📝 *ನೋಂದಣಿ — ಹಂತ 4/4*\n\n🏠 ದಯವಿಟ್ಟು ನಿಮ್ಮ *ಪೂರ್ಣ ವಿಳಾಸ* ನಮೂದಿಸಿ (ಮನೆ ಸಂಖ್ಯೆ, ರಸ್ತೆ, ಹೆಗ್ಗುರುತು).\n\nಉದಾಹರಣೆ: ಮನೆ 12, ಮುಖ್ಯ ರಸ್ತೆ, ದೇವಸ್ಥಾನದ ಹತ್ತಿರ",
    mr: "📝 *नोंदणी — टप्पा 3/5*\n\n🏠 कृपया आपला *पूर्ण पत्ता* प्रविष्ट करा (घर क्रमांक, रस्ता, खूण).\n\nउदाहरण: घर 12, मुख्य रस्ता, मंदिराजवळ",
    te: "📝 *నమోదు — దశ 4/4*\n\n🏠 దయచేసి మీ *పూర్తి చిరునామా* నమోదు చేయండి (ఇంటి నంబర్, వీధి, ల్యాండ్‌మార్క్).\n\nఉదాహరణ: ఇల్లు 12, ప్రధాన రహదారి, గుడి దగ్గర",
    bn: "📝 *নিবন্ধন — ধাপ 4/4*\n\n🏠 অনুগ্রহ করে আপনার *সম্পূর্ণ ঠিকানা* লিখুন (বাড়ির নম্বর, রাস্তা, ল্যান্ডমার্ক)।\n\nউদাহরণ: বাড়ি 12, প্রধান রাস্তা, মন্দিরের কাছে",
    ml: "📝 *নিবন্ধন — ধাপ 4/4*\n\n🏠 অনুগ্রহ করে আপনার *সম্পূর্ণ ঠিকানা* লিখুন (বাড়ির নম্বর, রাস্তা, ল্যান্ডমার্ক)।\n\nউদাহরণ: বাড়ি 12, প্রধান রাস্তা, মন্দিরের কাছে",
  },
  REGISTER_PINCODE_PROMPT: {
    en: "📝 *Registration — Step 3 of 4*\n\n📮 Please enter your *6-digit pincode*.",
    hi: "📝 *पंजीकरण — चरण 3/4*\n\n📮 कृपया अपना *6 अंकों का पिनकोड* दर्ज करें।",
    ta: "📝 *பதிவு — படி 3/4*\n\n📮 உங்கள் *6 இலக்க பின்கோடை* உள்ளிடவும்.",
    kn: "📝 *ನೋಂದಣಿ — ಹಂತ 3/4*\n\n📮 ದಯವಿಟ್ಟು ನಿಮ್ಮ *6-ಅಂಕಿಯ ಪಿನ್‌ಕೋಡ್* ನಮೂದಿಸಿ.",
    mr: "📝 *नोंदणी — टप्पा 3/4*\n\n📮 कृपया आपला *6 अंकी पिनकोड* प्रविष्ट करा.",
    te: "📝 *నమోదు — దశ 3/4*\n\n📮 దయచేసి మీ *6 అంకెల పినకోడ్* నమోదు చేయండి.",
    bn: "📝 *নিবন্ধন — ধাপ 3/4*\n\n📮 অনুগ্রহ করে আপনার *৬-সংখ্যার পিনকোড* লিখুন।",
    ml: "📝 *രജിസ്ട്രേഷൻ — ഘട്ടം 3/4*\n\n📍 ദയവായി നിങ്ങളുടെ *6 അക്ക പിൻകോഡ്* നൽകുക (ഉദാഹരണത്തിന് 682304).",
  },
  REGISTER_GMAP_PROMPT: {
    en: "📝 *Registration — Step 4 of 4*\n\n📍 Please share your location using the WhatsApp location button (📎/➕ ➔ Location) or paste your *Google Maps location link* so our technician can reach you easily.\n\nWays to send:\n1️⃣ Tap 📎 or ➕ ➔ *Location* ➔ *Send your current location*\n2️⃣ Or copy & paste a Google Maps link (e.g. https://maps.google.com/?q=10.0154,76.3125)\n\nOr press *Skip* if you don't have one.",
    hi: "📝 *पंजीकरण — चरण 3/4*\n\n📍 कृपया अपना *Google Maps स्थान लिंक* साझा करें ताकि हमारा तकनीशियन आप तक आसानी से पहुंच सके।\n\nलिंक कैसे प्राप्त करें:\n1. Google Maps खोलें\n2. अपने स्थान पर देर तक दबाएं\n3. *शेयर* पर टैप करें और लिंक कॉपी करें\n\nउदाहरण: https://maps.google.com/?q=12.9716,77.5946\n\nया *Skip* दबाएं।",
    ta: "📝 *பதிவு — படி 3/4*\n\n📍 எங்கள் தொழில்நுட்பவியலாளர் உங்களை எளிதில் சென்றடைய உங்கள் *Google Maps இருப்பிட இணைப்பை* பகிரவும்.\n\nஇணைப்பை எப்படி பெறுவது:\n1. Google Maps திறக்கவும்\n2. உங்கள் இடத்தில் நீண்ட நேரம் அழுத்தவும்\n3. *பகிர்* என்பதைத் தட்டி இணைப்பை நகலெடுக்கவும்\n\nஉதாரணம்: https://maps.google.com/?q=12.9716,77.5946\n\nஅல்லது *Skip* அழுத்தவும்.",
    kn: "📝 *ನೋಂದಣಿ — ಹಂತ 3/4*\n\n📍 ನಮ್ಮ ತಂತ್ರಜ್ಞರು ನಿಮ್ಮನ್ನು ಸುಲಭವಾಗಿ ತಲುಪಲು ನಿಮ್ಮ *Google Maps ಸ್ಥಳ ಲಿಂಕ್* ಹಂಚಿಕೊಳ್ಳಿ.\n\nಲಿಂಕ್ ಪಡೆಯುವ ವಿಧಾನ:\n1. Google Maps ತೆರೆಯಿರಿ\n2. ನಿಮ್ಮ ಸ್ಥಳದಲ್ಲಿ ಸ್ವಲ್ಪ ಸಮಯ ಒತ್ತಿರಿ\n3. *ಹಂಚಿಕೊಳ್ಳಿ* ಟ್ಯಾಪ್ ಮಾಡಿ ಮತ್ತು ಲಿಂಕ್ ನಕಲಿಸಿ\n\nಉದಾಹರಣೆ: https://maps.google.com/?q=12.9716,77.5946\n\nಅಥವಾ *Skip* ಒತ್ತಿರಿ.",
    mr: "📝 *नोंदणी — टप्पा 4/4*\n\n📍 कृपया आमचे तंत्रज्ञ तुम्हाला सहजपणे भेटू शकतील असे आपले *Google Maps स्थान लिंक* शेअर करा.\n\nलिंक कसे मिळवायचे:\n1. Google Maps उघडा\n2. आपल्या स्थानावर दीर्घकाळ दाबा\n3. *शेअर* वर टॅप करा आणि लिंक कॉपी करा\n\nउदाहरण: https://maps.google.com/?q=12.9716,77.5946\n\nकिंवा *Skip* दाबा.",
    te: "📝 *నమోదు — దశ 3/4*\n\n📍 మీ సాంకేతిక నిపుణుడు మిమ్మల్ని సులభంగా చేరుకోవడానికి మీ *Google Maps స్థాన లింక్* పంచుకోండి.\n\nలింక్ పొందడం ఎలా:\n1. Google Maps తెరవండి\n2. మీ స్థానంపై ఎక్కువ సమయం నొక్కండి\n3. *షేర్* నొక్కి లింక్ కాపీ చేయండి\n\nఉదాహరణ: https://maps.google.com/?q=12.9716,77.5946\n\nలేదా *Skip* నొక్కండి.",
    bn: "📝 *নিবন্ধন — ধাপ 3/4*\n\n📍 আমাদের প্রযুক্তিবিদ যাতে সহজেই আপনার কাছে পৌঁছাতে পারেন তাই আপনার *Google Maps অবস্থান লিঙ্ক* শেয়ার করুন।\n\nলিঙ্ক পাওয়ার উপায়:\n1. Google Maps খুলুন\n2. আপনার অবস্থানে দীর্ঘক্ষণ চাপ দিন\n3. *শেয়ার* চাপুন এবং লিঙ্ক কপি করুন\n\nউদাহরণ: https://maps.google.com/?q=12.9716,77.5946\n\nঅথবা *Skip* টিপুন।",
    ml: "📝 *নিবন্ধন — ধাপ 3/4*\n\n📍 আমাদের প্রযুক্তিবিদ যাতে সহজেই আপনার কাছে পৌঁছাতে পারেন তাই আপনার *Google Maps অবস্থান লিঙ্ক* শেয়ার করুন।\n\nলিঙ্ক পাওয়ার উপায়:\n1. Google Maps খুলুন\n2. আপনার অবস্থানে দীর্ঘক্ষণ চাপ দিন\n3. *শেয়ার* চাপুন এবং লিঙ্ক কপি করুন\n\nউদাহরণ: https://maps.google.com/?q=12.9716,77.5946\n\nঅথবা *Skip* টিপুন।",
  },
  REGISTER_SUCCESS: {
    en: "🎉 *Registration Successful!*\n\nWelcome to the Poornasree family, {name}!\n\nYour details have been saved. Our team will be able to assist you faster from now on.\n\nWhat would you like to do?",
    hi: "🎉 *पंजीकरण सफल!*\n\nपूर्णश्री परिवार में आपका स्वागत है, {name}!\n\nआपका विवरण सहेज लिया गया है। अब से हमारी टीम आपकी तेज़ी से सहायता कर सकेगी।\n\nआप क्या करना चाहेंगे?",
    ta: "🎉 *பதிவு வெற்றிகரமாக!*\n\nபூர்ணஸ்ரீ குடும்பத்திற்கு வரவேற்கிறோம், {name}!\n\nஉங்கள் விவரங்கள் சேமிக்கப்பட்டன. இனி எங்கள் குழு உங்களுக்கு வேகமாக உதவ முடியும்.\n\nநீங்கள் என்ன செய்ய விரும்புகிறீர்கள்?",
    kn: "🎉 *ನೋಂದಣಿ ಯಶಸ್ವಿ!*\n\nಪೂರ್ಣಶ್ರೀ ಕುಟುಂಬಕ್ಕೆ ಸುಸ್ವಾಗತ, {name}!\n\nನಿಮ್ಮ ವಿವರಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ. ಇನ್ನು ಮುಂದೆ ನಮ್ಮ ತಂಡ ನಿಮಗೆ ವೇಗವಾಗಿ ಸಹಾಯ ಮಾಡಬಹುದು.\n\nನೀವು ಏನು ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?",
    mr: "🎉 *नोंदणी यशस्वी!*\n\nपूर्णश्री कुटुंबात आपले स्वागत आहे, {name}!\n\nआपले तपशील जतन केले आहेत. आता पुढे आमची टीम तुम्हाला जलद मदत करू शकेल.\n\nतुम्हाला काय करायचे आहे?",
    te: "🎉 *నమోదు విజయవంతం!*\n\nపూర్ణశ్రీ కుటుంబానికి స్వాగతం, {name}!\n\nమీ వివరాలు సేవ్ చేయబడ్డాయి. ఇప్పటి నుండి మా బృందం మీకు వేగంగా సహాయం చేయగలదు.\n\nమీరు ఏమి చేయాలనుకుంటున్నారు?",
    bn: "🎉 *নিবন্ধন সফল!*\n\nপূর্ণশ্রী পরিবারে স্বাগতম, {name}!\n\nআপনার বিবরণ সংরক্ষণ করা হয়েছে। এখন থেকে আমাদের দল আপনাকে দ্রুত সহায়তা করতে পারবে।\n\nআপনি কী করতে চান?",
    ml: "🎉 *নিবন্ধন সফল!*\n\nপূর্ণশ্রী পরিবারে স্বাগতম, {name}!\n\nআপনার বিবরণ সংরক্ষণ করা হয়েছে। এখন থেকে আমাদের দল আপনাকে দ্রুত সহায়তা করতে পারবে।\n\nআপনি কী করতে চান?",
  },
  REGISTER_INVALID_NAME: {
    en: "⚠️ Please enter your full name (at least 2 characters).",
    hi: "⚠️ कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर)।",
    ta: "⚠️ உங்கள் முழு பெயரை உள்ளிடவும் (குறைந்தது 2 எழுத்துக்கள்).",
    kn: "⚠️ ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 2 ಅಕ್ಷರಗಳು).",
    mr: "⚠️ कृपया आपले पूर्ण नाव प्रविष्ट करा (किमान 2 अक्षरे).",
    te: "⚠️ దయచేసి మీ పూర్తి పేరును నమోదు చేయండి (కనీసం 2 అక్షరాలు).",
    bn: "⚠️ অনুগ্রহ করে আপনার পুরো নাম লিখুন (কমপক্ষে 2 অক্ষর)।",
    ml: "⚠️ অনুগ্রহ করে আপনার পুরো নাম লিখুন (কমপক্ষে 2 অক্ষর)।",
  },
  REGISTER_INVALID_ADDRESS: {
    en: "⚠️ Please enter your full address (at least 10 characters).",
    hi: "⚠️ कृपया अपना पूरा पता दर्ज करें (कम से कम 10 अक्षर)।",
    ta: "⚠️ உங்கள் முழு முகவரியை உள்ளிடவும் (குறைந்தது 10 எழுத்துக்கள்).",
    kn: "⚠️ ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 10 ಅಕ್ಷರಗಳು).",
    mr: "⚠️ कृपया आपला पूर्ण पत्ता प्रविष्ट करा (किमान 10 अक्षरे).",
    te: "⚠️ దయచేసి మీ పూర్తి చిరునామాను నమోదు చేయండి (కనీసం 10 అక్షరాలు).",
    bn: "⚠️ অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা লিখুন (কমপক্ষে 10 অক্ষর)।",
    ml: "⚠️ অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা লিখুন (কমপক্ষে 10 অক্ষর)।",
  },
  REGISTER_INVALID_GMAP: {
    en: "⚠️ Please share a valid Google Maps link (starting with http:// or https://).\n\nOr press *Skip* if you don't have one.",
    hi: "⚠️ कृपया एक वैध Google Maps लिंक साझा करें (http:// या https:// से शुरू)।\n\nया *Skip* दबाएं।",
    ta: "⚠️ தயவுசெய்து சரியான Google Maps இணைப்பைப் பகிரவும் (http:// அல்லது https:// இல் தொடங்கும்).\n\nஅல்லது *Skip* அழுத்தவும்.",
    kn: "⚠️ ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ Google Maps ಲಿಂಕ್ ಹಂಚಿಕೊಳ್ಳಿ (http:// ಅಥವಾ https:// ನಿಂದ ಪ್ರಾರಂಭ).\n\nಅಥವಾ *Skip* ಒತ್ತಿರಿ.",
    mr: "⚠️ कृपया वैध Google Maps लिंक शेअर करा (http:// किंवा https:// ने सुरू होणारे).\n\nकिंवा *Skip* दाबा.",
    te: "⚠️ దయచేసి సరైన Google Maps లింక్ పంచుకోండి (http:// లేదా https:// తో ప్రారంభమయ్యేది).\n\nలేదా *Skip* నొక్కండి.",
    bn: "⚠️ অনুগ্রহ করে একটি বৈধ Google Maps লিঙ্ক শেয়ার করুন (http:// বা https:// দিয়ে শুরু)।\n\nঅথবা *Skip* টিপুন।",
    ml: "⚠️ অনুগ্রহ করে একটি বৈধ Google Maps লিঙ্ক শেয়ার করুন (http:// বা https:// দিয়ে শুরু)।\n\nঅথবা *Skip* টিপুন।",
  },
  NOT_REGISTERED: {
    en: "📱 This mobile number is not registered with us.\n\nIf you are a Registered Customer, please provide your registered 10 digit mobile number.\n\nEg. 9633503333\n\nOr press *Skip* to Continue. 👇",
    hi: "📱 यह मोबाइल नंबर हमारे यहाँ पंजीकृत नहीं है।\n\nयदि आप पंजीकृत ग्राहक हैं, तो कृपया अपना 10 अंकों का पंजीकृत मोबाइल नंबर दें।\n\nजैसे: 9633503333\n\nया जारी रखने के लिए *Skip* दबाएं। 👇",
    ta: "📱 இந்த மொபைல் எண் எங்களிடம் பதிவு செய்யப்படவில்லை.\n\nநீங்கள் பதிவுசெய்யப்பட்ட வாடிக்கையாளராக இருந்தால், உங்கள் பதிவுசெய்யப்பட்ட 10 இலக்க மொபைல் எண்ணை வழங்கவும்.\n\nஉதாரணம்: 9633503333\n\nஅல்லது தொடர *Skip* என்பதை அழுத்தவும். 👇",
    kn: "📱 ಈ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮ್ಮಲ್ಲಿ ನೋಂದಾಯಿಸಲಾಗಿಲ್ಲ.\n\nನೀವು ನೋಂದಾಯಿತ ಗ್ರಾಹಕರಾಗಿದ್ದರೆ, ದಯವಿಟ್ಟು ನಿಮ್ಮ ನೋಂದಾಯಿತ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ಒದಗಿಸಿ.\n\nಉದಾಹರಣೆಗೆ: 9633503333\n\nಅಥವಾ ಮುಂದುವರಿಯಲು *Skip* ಒತ್ತಿರಿ. 👇",
    mr: "📱 हा मोबाईल नंबर आमच्याकडे नोंदणीकृत नाही.\n\nजर आपण नोंदणीकृत ग्राहक असाल, तर कृपया आपला नोंदणीकृत 10 अंकी मोबाईल नंबर द्या.\n\nउदा. 9633503333\n\nकिंवा पुढे जाण्यासाठी *Skip* दाबा. 👇",
    te: "📱 ఈ మొబైల్ నంబర్ మా వద్ద నమోదు చేయబడలేదు.\n\nమీరు నమోదిత కస్టమర్ అయితే, దయచేసి మీ నమోదిత 10 అంకెల మొబైల్ నంబర్‌ను అందించండి.\n\nఉదాహరణ: 9633503333\n\nలేదా కొనసాగించడానికి *Skip* నొక్కండి. 👇",
    bn: "📱 এই মোবাইল নম্বরটি আমাদের কাছে নিবন্ধিত নয়।\n\nআপনি যদি একজন নিবন্ধিত গ্রাহক হন তবে অনুগ্রহ করে আপনার নিবন্ধিত ১০ অঙ্কের মোবাইল নম্বর প্রদান করুন।\n\nউদাঃ 9633503333\n\nঅথবা চালিয়ে যেতে *Skip* টিপুন। 👇",
    ml: "📱 এই মোবাইল নম্বরটি আমাদের কাছে নিবন্ধিত নয়।\n\nআপনি যদি একজন নিবন্ধিত গ্রাহক হন তবে অনুগ্রহ করে আপনার নিবন্ধিত ১০ অঙ্কের মোবাইল নম্বর প্রদান করুন।\n\nউদাঃ 9633503333\n\nঅথবা চালিয়ে যেতে *Skip* টিপুন। 👇",
  },
  WELCOME_BACK: {
    en: "Welcome back, *{name}*! 👋\n\n",
    hi: "वापसी पर स्वागत है, *{name}*! 👋\n\n",
    ta: "மீண்டும் வரவேற்கிறோம், *{name}*! 👋\n\n",
    kn: "ಮತ್ತೆ ಸ್ವಾಗತ, *{name}*! 👋\n\n",
    mr: "पुन्हा स्वागत आहे, *{name}*! 👋\n\n",
    te: "మళ్ళీ స్వాగతం, *{name}*! 👋\n\n",
    bn: "ফিরে আসার জন্য স্বাগতম, *{name}*! 👋\n\n",
    ml: "👋 വീണ്ടും സ്വാഗതം, *{name}*! പൂർണ്ണശ്രീ സപ്പോർട്ടിലേക്ക് ബന്ധപ്പെട്ടതിന് നന്ദി. 🔧",
  },
  PHONE_FOUND: {
    en: "✅ Found! Welcome back, {name}! 👋\n\n",
    hi: "✅ मिल गया! वापसी पर स्वागत है, {name}! 👋\n\n",
    ta: "✅ கண்டுபிடிக்கப்பட்டது! மீண்டும் வரவேற்கிறோம், {name}! 👋\n\n",
    kn: "✅ ಕಂಡುಬಂದಿದೆ! ಮತ್ತೆ ಸ್ವಾಗತ, {name}! 👋\n\n",
    mr: "✅ सापडले! पुन्हा स्वागत आहे, {name}! 👋\n\n",
    te: "✅ కనుగొనబడింది! మళ్ళీ స్వాగతం, {name}! 👋\n\n",
    bn: "✅ পাওয়া গেছে! ফিরে আসার জন্য স্বাগতম, {name}! 👋\n\n",
    ml: "✅ পাওয়া গেছে! ফিরে আসার জন্য স্বাগতম, {name}! 👋\n\n",
  },
  PHONE_NOT_FOUND: {
    en: "❌ No records found for this number.\n\nPlease try another number or press *Skip* to continue as a new customer.",
    hi: "❌ इस नंबर के लिए कोई रिकॉर्ड नहीं मिला।\n\nकृपया दूसरा नंबर आज़माएं या *Skip* दबाकर नए ग्राहक के रूप में जारी रखें।",
    ta: "❌ இந்த எண்ணுக்கு பதிவுகள் எதுவும் கிடைக்கவில்லை.\n\nதயவுசெய்து வேறு எண்ணை முயற்சிக்கவும் அல்லது புதிய வாடிக்கையாளராக தொடர *Skip* ஐ அழுத்தவும்.",
    kn: "❌ ಈ ಸಂಖ್ಯೆಗಾಗಿ ಯಾವುದೇ ದಾಖಲೆಗಳು ಕಂಡುಬಂದಿಲ್ಲ.\n\nದಯವಿಟ್ಟು ಬೇರೆ ಸಂಖ್ಯೆಯನ್ನು ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಹೊಸ ಗ್ರಾಹಕರಾಗಿ ಮುಂದುವರಿಯಲು *Skip* ಒತ್ತಿರಿ.",
    mr: "❌ या क्रमांकासाठी कोणतेही रेकॉर्ड सापडले नाही.\n\nकृपया दुसरा क्रमांक वापरून पहा किंवा नवीन ग्राहक म्हणून पुढे जाण्यासाठी *Skip* दाबा.",
    te: "❌ ఈ నంబర్ కోసం ఎటువంటి రికార్డులు కనుగొనబడలేదు.\n\nదయచేసి వేరే నంబర్‌ను ప్రయత్నించండి లేదా కొత్త కస్టమర్‌గా కొనసాగడానికి *Skip* నొక్కండి.",
    bn: "❌ এই নম্বরের জন্য কোনও রেকর্ড পাওয়া যায়নি।\n\nঅনুগ্রহ করে অন্য একটি নম্বর চেষ্টা করুন বা নতুন গ্রাহক হিসাবে চালিয়ে যেতে *Skip* টিপুন।",
    ml: "❌ এই নম্বরের জন্য কোনও রেকর্ড পাওয়া যায়নি।\n\nঅনুগ্রহ করে অন্য একটি নম্বর চেষ্টা করুন বা নতুন গ্রাহক হিসাবে চালিয়ে যেতে *Skip* টিপুন।",
  },
  INVALID_PHONE: {
    en: "⚠️ Please enter a valid 10-digit mobile number.\n\nEg. 9633503333\n\nOr press Skip to continue as a new customer.",
    hi: "⚠️ कृपया एक वैध 10 अंकों का मोबाइल नंबर दर्ज करें।\n\nजैसे: 9633503333\n\nया नए ग्राहक के रूप में जारी रखने के लिए Skip दबाएं।",
    ta: "⚠️ தயவுசெய்து சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.\n\nஉதாரணம்: 9633503333\n\nஅல்லது புதிய வாடிக்கையாளராக தொடர Skip ஐ அழுத்தவும்.",
    kn: "⚠️ ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.\n\nಉದಾಹರಣೆಗೆ: 9633503333\n\nಅಥವಾ ಹೊಸ ಗ್ರಾಹಕರಾಗಿ ಮುಂದುವರಿಯಲು Skip ಒತ್ತಿರಿ.",
    mr: "⚠️ कृपया एक वैध 10 अंकी मोबाईल नंबर प्रविष्ट करा.\n\nउदा. 9633503333\n\nकिंवा नवीन ग्राहक म्हणून पुढे जाण्यासाठी Skip दाबा.",
    te: "⚠️ దయచేసి సరైన 10 అంకెల మొబైల్ నంబర్‌ను నమోదు చేయండి.\n\nఉదాహరణ: 9633503333\n\nలేదా కొత్త కస్టమర్‌గా కొనసాగడానికి Skip నొక్కండి.",
    bn: "⚠️ অনুগ্রহ করে একটি বৈধ ১০ অঙ্কের মোবাইল নম্বর লিখুন।\n\nউদাঃ 9633503333\n\nঅথবা নতুন গ্রাহক হিসাবে চালিয়ে যেতে Skip টিপুন।",
    ml: "⚠️ অনুগ্রহ করে একটি বৈধ ১০ অঙ্কের মোবাইল নম্বর লিখুন।\n\nউদাঃ 9633503333\n\nঅথবা নতুন গ্রাহক হিসাবে চালিয়ে যেতে Skip টিপুন।",
  },
  SERIAL_PROMPT: {
    en: "🔧 *Complaint Registration*\n\nPlease enter your machine serial number.\n\n_(You can find it on the machine label or warranty card)_",
    hi: "🔧 *शिकायत दर्ज करें*\n\nकृपया अपने मशीन का सीरियल नंबर दर्ज करें।\n\n_(यह मशीन के लेबल या वारंटी कार्ड पर मिलता है)_",
    ta: "🔧 *புகார் பதிவு*\n\nஉங்கள் இயந்திரத்தின் வரிசை எண்ணை உள்ளிடவும்.\n\n_(இதை இயந்திர லேபிள் அல்லது உத்தரவாத அட்டையில் காணலாம்)_",
    kn: "🔧 *ದೂರು ನೋಂದಣಿ*\n\nದಯವಿಟ್ಟು ನಿಮ್ಮ ಯಂತ್ರದ ಸರಣಿ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.\n\n_(ಇದನ್ನು ಯಂತ್ರದ ಲೇಬಲ್ ಅಥವಾ ವಾರಂಟಿ ಕಾರ್ಡ್‌ನಲ್ಲಿ ಕಾಣಬಹುದು)_",
    mr: "🔧 *तक्रार नोंदणी*\n\nकृपया आपल्या मशीनचा अनुक्रमांक प्रविष्ट करा.\n\n_(हा मशीनच्या लेबलवर किंवा वॉरंटी कार्डवर आढळू शकतो)_",
    te: "🔧 *ఫిర్యాదు నమోదు*\n\nదయచేసి మీ యంత్రం యొక్క సీరియల్ నంబర్‌ను నమోదు చేయండి.\n\n_(దీన్ని మెషిన్ లేబుల్ లేదా వారంటీ కార్డులో కనుగొనవచ్చు)_",
    bn: "🔧 *অভিযোগ নিবন্ধন*\n\nঅনুগ্রহ করে আপনার মেশিনের সিরিয়াল নম্বর লিখুন।\n\n_(এটি মেশিনের লেবেল বা ওয়ারেন্টি কার্ডে পাওয়া যেতে পারে)_",
    ml: "🔧 ദയവായി നിങ്ങളുടെ മെഷീൻ *സീരിയൽ നമ്പർ* നൽകുക (ഉദാഹരണത്തിന് ECO-2024-8841):",
  },
  SERIAL_INVALID: {
    en: "Please enter a valid serial number or press Skip to continue:",
    hi: "कृपया एक वैध सीरियल नंबर दर्ज करें या जारी रखने के लिए Skip दबाएं:",
    ta: "தயவுசெய்து சரியான வரிசை எண்ணை உள்ளிடவும் அல்லது தொடர Skip ஐ அழுத்தவும்:",
    kn: "ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಸರಣಿ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ ಅಥವಾ ಮುಂದುವರಿಯಲು Skip ಒತ್ತಿರಿ:",
    mr: "कृपया एक वैध अनुक्रमांक प्रविष्ट करा किंवा पुढे जाण्यासाठी Skip दाबा:",
    te: "దయచేసి సరైన సీరియల్ నంబర్‌ను నమోదు చేయండి లేదా కొనసాగించడానికి Skip నొక్కండి:",
    bn: "অনুগ্রহ করে একটি বৈধ সিরিয়াল নম্বর লিখুন বা চালিয়ে যেতে Skip টিপুন:",
    ml: "❌ ദയവായി സാധുവായ സീരിയൽ നമ്പർ നൽകുക (കുറഞ്ഞത് 3 അക്ഷരങ്ങൾ).",
  },
  SERIAL_NOT_FOUND: {
    en: "❌ Serial number *{serial}* not found in our system.\n\nPlease check and try again, or press *Skip* to continue without serial number.",
    hi: "❌ सीरियल नंबर *{serial}* हमारे सिस्टम में नहीं मिला।\n\nकृपया जांचें और पुनः प्रयास करें, या बिना सीरियल नंबर के जारी रखने के लिए *Skip* दबाएं।",
    ta: "❌ வரிசை எண் *{serial}* எங்கள் கணினியில் கிடைக்கவில்லை.\n\nசரிபார்த்து மீண்டும் முயற்சிக்கவும் அல்லது வரிசை எண் இல்லாமல் தொடர *Skip* ஐ அழுத்தவும்.",
    kn: "❌ ಸರಣಿ ಸಂಖ್ಯೆ *{serial}* ನಮ್ಮ ಸಿಸ್ಟಂನಲ್ಲಿ ಕಂಡುಬಂದಿಲ್ಲ.\n\nದಯವಿಟ್ಟು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಸರಣಿ ಸಂಖ್ಯೆ ಇಲ್ಲದೆ ಮುಂದುವರಿಯಲು *Skip* ಒತ್ತಿರಿ.",
    mr: "❌ अनुक्रमांक *{serial}* आमच्या सिस्टीममध्ये सापडला नाही.\n\nकृपया तपासा आणि पुन्हा प्रयत्न करा, किंवा अनुक्रमांक नसताना पुढे जाण्यासाठी *Skip* दाबा.",
    te: "❌ సీరియల్ నంబర్ *{serial}* మా సిస్టమ్‌లో కనుగొనబడలేదు.\n\nదయచేసి తనిఖీ చేసి మళ్ళీ ప్రయత్నించండి లేదా సీరియల్ నంబర్ లేకుండా కొనసాగడానికి *Skip* నొక్కండి.",
    bn: "❌ সিরিয়াল নম্বর *{serial}* আমাদের সিস্টেমে পাওয়া যায়নি।\n\nঅনুগ্রহ করে পরীক্ষা করে আবার চেষ্টা করুন, বা সিরিয়াল নম্বর ছাড়াই চালিয়ে যেতে *Skip* টিপুন।",
    ml: "❌ সিরিয়াল নম্বর *{serial}* আমাদের সিস্টেমে পাওয়া যায়নি।\n\nঅনুগ্রহ করে পরীক্ষা করে আবার চেষ্টা করুন, বা সিরিয়াল নম্বর ছাড়াই চালিয়ে যেতে *Skip* টিপুন।",
  },
  MACHINE_FOUND: {
    en: "✅ *Machine Verified*\n\n👤 *Customer:* {customer}\n🔧 *Model:* {model}\n🔢 *Serial:* {serial}\n📍 *Address:* {address}\n\nPlease confirm.",
    hi: "✅ *मशीन सत्यापित*\n\n👤 *ग्राहक:* {customer}\n🔧 *मॉडल:* {model}\n🔢 *सीरियल:* {serial}\n📍 *पता:* {address}\n\nकृपया पुष्टि करें।",
    ta: "✅ *இயந்திரம் சரிபார்க்கப்பட்டது*\n\n👤 *வாடிக்கையாளர்:* {customer}\n🔧 *மாதிரி:* {model}\n🔢 *வரிசை எண்:* {serial}\n📍 *முகவரி:* {address}\n\nஉறுதிப்படுத்தவும்.",
    kn: "✅ *ಯಂತ್ರ ಪರಿಶೀಲಿಸಲಾಗಿದೆ*\n\n👤 *ಗ್ರಾಹಕರು:* {customer}\n🔧 *ಮಾದರಿ:* {model}\n🔢 *ಸರಣಿ:* {serial}\n📍 *ವಿಳಾಸ:* {address}\n\nದಯವಿಟ್ಟು ಖಚಿತಪಡಿಸಿ.",
    mr: "✅ *मशीन सत्यापित*\n\n👤 *ग्राहक:* {customer}\n🔧 *मॉडेल:* {model}\n🔢 *अनुक्रमांक:* {serial}\n📍 *पत्ता:* {address}\n\nकृपया पुष्टी करा.",
    te: "✅ *యంత్రం ధృవీకరించబడింది*\n\n👤 *కస్టమర్:* {customer}\n🔧 *మోడల్:* {model}\n🔢 *సీరియల్:* {serial}\n📍 *చిరునామా:* {address}\n\nదయచేసి ధృవీకరించండి.",
    bn: "✅ *মেশিন যাচাই করা হয়েছে*\n\n👤 *গ্রাহক:* {customer}\n🔧 *মডেল:* {model}\n🔢 *সিরিয়াল:* {serial}\n📍 *ঠিকানা:* {address}\n\nঅনুগ্রহ করে নিশ্চিত করুন।",
    ml: "✅ *মেশিন যাচাই করা হয়েছে*\n\n👤 *গ্রাহক:* {customer}\n🔧 *মডেল:* {model}\n🔢 *সিরিয়াল:* {serial}\n📍 *ঠিকানা:* {address}\n\nঅনুগ্রহ করে নিশ্চিত করুন।",
  },
  SELECT_VALID: {
    en: "Please select an option:",
    hi: "कृपया एक विकल्प चुनें:",
    ta: "ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்:",
    kn: "ದಯವಿಟ್ಟು ಒಂದು ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ:",
    mr: "कृपया एक पर्याय निवडा:",
    te: "దయచేసి ఒక ఎంపికను ఎంచుకోండి:",
    bn: "অনুগ্রহ করে একটি বিকল্প নির্বাচন করুন:",
    ml: "অনুগ্রহ করে একটি বিকল্প নির্বাচন করুন:",
  },
  DESCRIBE_COMPLAINT: {
    en: "📝 *Describe your complaint:*\n\nPlease explain the issue you are facing with your machine.\n\nExample: _LED blinking, not heating, display not working_",
    hi: "📝 *अपनी शिकायत बताएं:*\n\nकृपया अपनी मशीन में आ रही समस्या बताएं।\n\nउदाहरण: _LED झपक रही है, गर्म नहीं हो रहा, डिस्प्ले काम नहीं कर रहा_",
    ta: "📝 *உங்கள் புகாரை விவரிக்கவும்:*\n\nஉங்கள் இயந்திரத்தில் நீங்கள் எதிர்கொள்ளும் சிக்கலை விளக்கவும்.\n\nஉதாரணம்: _LED ஒளிர்கிறது, வெப்பமடையவில்லை, டிஸ்ப்ளே வேலை செய்யவில்லை_",
    kn: "📝 *ನಿಮ್ಮ ದೂರನ್ನು ವಿವರಿಸಿ:*\n\nನಿಮ್ಮ ಯಂತ್ರದೊಂದಿಗೆ ನೀವು ಎದುರಿಸುತ್ತಿರುವ ಸಮಸ್ಯೆಯನ್ನು ದಯವಿಟ್ಟು ವಿವರಿಸಿ.\n\nಉದಾಹರಣೆಗೆ: _LED ಮಿನುಗುತ್ತಿದೆ, ಬಿಸಿಯಾಗುತ್ತಿಲ್ಲ, ಡಿಸ್ಪ್ಲೇ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ_",
    mr: "📝 *तुमच्या तक्रारीचे वर्णन करा:*\n\nतुमच्या मशीनमध्ये येणारी समस्या कृपया सांगा.\n\nउदाहरण: _LED लुकलुकत आहे, गरम होत नाही, डिस्प्ले काम करत नाही_",
    te: "📝 *మీ ఫిర్యాదును వివరించండి:*\n\nమీ యంత్రంలో మీరు ఎదుర్కొంటున్న సమస్యను దయచేసి వివరించండి.\n\nఉదాహరణ: _LED మెరుస్తుంది, వేడి చేయడం లేదు, డిస్ప్లే పని చేయడం లేదు_",
    bn: "📝 *আপনার অভিযোগ বর্ণনা করুন:*\n\nআপনার মেশিনে আপনি যে সমস্যার সম্মুখীন হচ্ছেন তা অনুগ্রহ করে ব্যাখ্যা করুন।\n\nউদাহরণ: _LED জ্বলজ্বল করছে, গরম হচ্ছে না, ডিসপ্লে কাজ করছে না_",
    ml: "📝 *আপনার অভিযোগ বর্ণনা করুন:*\n\nআপনার মেশিনে আপনি যে সমস্যার সম্মুখীন হচ্ছেন তা অনুগ্রহ করে ব্যাখ্যা করুন।\n\nউদাহরণ: _LED জ্বলজ্বল করছে, গরম হচ্ছে না, ডিসপ্লে কাজ করছে না_",
  },
  DESCRIBE_SHORT: {
    en: "Please describe your issue in at least a few words:",
    hi: "कृपया अपनी समस्या कुछ शब्दों में बताएं:",
    ta: "உங்கள் சிக்கலை சில வார்த்தைகளிலாவது விவரிக்கவும்:",
    kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ಕನಿಷ್ಠ ಕೆಲವು ಪದಗಳಲ್ಲಿ ವಿವರಿಸಿ:",
    mr: "कृपया तुमची समस्या काही शब्दांत सांगा:",
    te: "దయచేసి మీ సమస్యను కనీసం కొన్ని మాటల్లో వివరించండి:",
    bn: "অনুগ্রহ করে আপনার সমস্যাটি অন্তত কয়েকটি শব্দে বর্ণনা করুন:",
    ml: "অনুগ্রহ করে আপনার সমস্যাটি অন্তত কয়েকটি শব্দে বর্ণনা করুন:",
  },
  PRODUCT_SELECTED: {
    en: "✅ *Product:* {product}\n\n📝 *Describe your complaint:*\n\nPlease explain the issue you are facing.\n\nExample: _LED blinking, not heating, display not working_",
    hi: "✅ *उत्पाद:* {product}\n\n📝 *अपनी शिकायत बताएं:*\n\nकृपया अपनी समस्या बताएं।\n\nउदाहरण: _LED झपक रही है, गर्म नहीं हो रहा, डिस्प्ले काम नहीं कर रहा_",
    ta: "✅ *தயாரிப்பு:* {product}\n\n📝 *உங்கள் புகாரை விவரிக்கவும்:*\n\nநீங்கள் எதிர்கொள்ளும் சிக்கலை விளக்கவும்.\n\nஉதாரணம்: _LED ஒளிர்கிறது, வெப்பமடையவில்லை, டிஸ்ப்ளே வேலை செய்யவில்லை_",
    kn: "✅ *ಉತ್ಪನ್ನ:* {product}\n\n📝 *ನಿಮ್ಮ ದೂರನ್ನು ವಿವರಿಸಿ:*\n\nನೀವು ಎದುರಿಸುತ್ತಿರುವ ಸಮಸ್ಯೆಯನ್ನು ದಯವಿಟ್ಟು ವಿವರಿಸಿ.\n\nಉದಾಹರಣೆಗೆ: _LED ಮಿನುಗುತ್ತಿದೆ, ಬಿಸಿಯಾಗುತ್ತಿಲ್ಲ, ಡಿಸ್ಪ್ಲೇ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ_",
    mr: "✅ *उत्पादन:* {product}\n\n📝 *तुमच्या तक्रारीचे वर्णन करा:*\n\nतुम्हाला भेडसावणारी समस्या कृपया सांगा.\n\nउदाहरण: _LED लुकलुकत आहे, गरम होत नाही, डिस्प्ले काम करत नाही_",
    te: "✅ *ఉత్పత్తి:* {product}\n\n📝 *మీ ఫిర్యాదును వివరించండి:*\n\nమీరు ఎదుర్కొంటున్న సమస్యను దయచేసి వివరించండి.\n\nఉదాహరణ: _LED మెరుస్తుంది, వేడి చేయడం లేదు, డిస్ప్లే పని చేయడం లేదు_",
    bn: "✅ *পণ্য:* {product}\n\n📝 *আপনার অভিযোগ বর্ণনা করুন:*\n\nআপনি যে সমস্যার সম্মুখীন হচ্ছেন তা অনুগ্রহ করে ব্যাখ্যা করুন।\n\nউদাহরণ: _LED জ্বলজ্বল করছে, গরম হচ্ছে না, ডিসপ্লে কাজ করছে না_",
    ml: "✅ *পণ্য:* {product}\n\n📝 *আপনার অভিযোগ বর্ণনা করুন:*\n\nআপনি যে সমস্যার সম্মুখীন হচ্ছেন তা অনুগ্রহ করে ব্যাখ্যা করুন।\n\nউদাহরণ: _LED জ্বলজ্বল করছে, গরম হচ্ছে না, ডিসপ্লে কাজ করছে না_",
  },
  SELECT_CATEGORY: {
    en: "📂 *Select product category:*",
    hi: "📂 *उत्पाद श्रेणी चुनें:*",
    ta: "📂 *தயாரிப்பு வகையைத் தேர்ந்தெடுக்கவும்:*",
    kn: "📂 *ಉತ್ಪನ್ನ ವರ್ಗವನ್ನು ಆರಿಸಿ:*",
    mr: "📂 *उत्पादन श्रेणी निवडा:*",
    te: "📂 *ఉత్పత్తి వర్గాన్ని ఎంచుకోండి:*",
    bn: "📂 *পণ্যের বিভাগ নির্বাচন করুন:*",
    ml: "📂 *পণ্যের বিভাগ নির্বাচন করুন:*",
  },
  SELECT_PRODUCT: {
    en: "📦 *Select your product:*",
    hi: "📦 *अपना उत्पाद चुनें:*",
    ta: "📦 *உங்கள் தயாரிப்பைத் தேர்ந்தெடுக்கவும்:*",
    kn: "📦 *ನಿಮ್ಮ ಉತ್ಪನ್ನವನ್ನು ಆರಿಸಿ:*",
    mr: "📦 *तुमचे उत्पादन निवडा:*",
    te: "📦 *మీ ఉత్పత్తిని ఎంచుకోండి:*",
    bn: "📦 *আপনার পণ্য নির্বাচন করুন:*",
    ml: "📦 *আপনার পণ্য নির্বাচন করুন:*",
  },
  SELECT_VALID_PRODUCT: {
    en: "Please select a valid product:",
    hi: "कृपया एक वैध उत्पाद चुनें:",
    ta: "தயவுசெய்து சரியான தயாரிப்பைத் தேர்ந்தெடுக்கவும்:",
    kn: "ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಉತ್ಪನ್ನವನ್ನು ಆರಿಸಿ:",
    mr: "कृपया एक वैध उत्पादन निवडा:",
    te: "దయచేసి సరైన ఉత్పత్తిని ఎంచుకోండి:",
    bn: "অনুগ্রহ করে একটি বৈধ পণ্য নির্বাচন করুন:",
ml: "অনুগ্রহ করে একটি বৈধ পণ্য নির্বাচন করুন:",
  },
  NO_STEPS: {
    en: "📝 *Complaint noted:* {complaint}\n\n😔 We were unable to find troubleshooting steps for this issue.\n\nWould you like to book a service visit? Our technician will come to your location.",
    hi: "📝 *शिकायत नोट की गई:* {complaint}\n\n😔 इस समस्या के लिए कोई समाधान चरण नहीं मिले।\n\nक्या आप सेवा विज़िट बुक करना चाहेंगे? हमारा तकनीशियन आपके स्थान पर आएगा।",
    ta: "📝 *புகார் குறிக்கப்பட்டது:* {complaint}\n\n😔 இந்த சிக்கலுக்கான தீர்வு படிகள் கிடைக்கவில்லை.\n\nசேவை வருகையை முன்பதிவு செய்ய விரும்புகிறீர்களா? எங்கள் தொழில்நுட்பவியலாளர் உங்கள் இடத்திற்கு வருவார்.",
    kn: "📝 *ದೂರು ದಾಖಲಾಗಿದೆ:* {complaint}\n\n😔 ಈ ಸಮಸ್ಯೆಗಾಗಿ ಪರಿಹಾರ ಹಂತಗಳು ಕಂಡುಬಂದಿಲ್ಲ.\n\nಸೇವಾ ಭೇಟಿಯನ್ನು ಬುಕ್ ಮಾಡಲು ನೀವು ಬಯಸುವಿರಾ? ನಮ್ಮ ತಂತ್ರಜ್ಞರು ನಿಮ್ಮ ಸ್ಥಳಕ್ಕೆ ಬರುತ್ತಾರೆ.",
    mr: "📝 *तक्रार नोंदवली:* {complaint}\n\n😔 या समस्येसाठी कोणतेही निवारण चरण सापडले नाहीत.\n\nतुम्ही सेवा भेट बुक करू इच्छिता का? आमचे तंत्रज्ञ तुमच्या ठिकाणी येतील.",
    te: "📝 *ఫిర్యాదు నమోదు చేయబడింది:* {complaint}\n\n😔 ఈ సమస్య కోసం పరిష్కార దశలు కనుగొనబడలేదు.\n\nమీరు సేవా సందర్శనను బుక్ చేయాలనుకుంటున్నారా? మా సాంకేతిక నిపుణుడు మీ స్థానానికి వస్తాడు.",
    bn: "📝 *অভিযোগ নোট করা হয়েছে:* {complaint}\n\n😔 এই সমস্যার জন্য কোনও সমাধান পদক্ষেপ পাওয়া যায়নি।\n\nআপনি কি পরিষেবা পরিদর্শন বুক করতে চান? আমাদের প্রযুক্তিবিদ আপনার স্থানে আসবেন।",
    ml: "📝 *অভিযোগ নোট করা হয়েছে:* {complaint}\n\n😔 এই সমস্যার জন্য কোনও সমাধান পদক্ষেপ পাওয়া যায়নি।\n\nআপনি কি পরিষেবা পরিদর্শন বুক করতে চান? আমাদের প্রযুক্তিবিদ আপনার স্থানে আসবেন।",
  },
  ISSUE_RESOLVED: {
    en: "🎉 *Issue Resolved!*\n\nWe're glad the troubleshooting helped! 😊\n\nThank you for choosing Poornasree Support. 🙏",
    hi: "🎉 *समस्या हल हो गई!*\n\nहमें खुशी है कि समाधान चरणों से मदद मिली! 😊\n\nपूर्णश्री सपोर्ट चुनने के लिए धन्यवाद। 🙏",
    ta: "🎉 *சிக்கல் தீர்க்கப்பட்டது!*\n\nபழுதுநீக்குதல் உதவியதில் நாங்கள் மகிழ்ச்சியடைகிறோம்! 😊\n\nபூர்ணஸ்ரீ ஆதரவைத் தேர்ந்தெடுத்ததற்கு நன்றி. 🙏",
    kn: "🎉 *ಸಮಸ್ಯೆ ಬಗೆಹರಿದಿದೆ!*\n\nದೋಷನಿವಾರಣೆ ಸಹಾಯ ಮಾಡಿದ್ದಕ್ಕೆ ನಮಗೆ ಸಂತೋಷವಾಗಿದೆ! 😊\n\nಪೂರ್ಣಶ್ರೀ ಬೆಂಬಲವನ್ನು ಆಯ್ಕೆ ಮಾಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. 🙏",
    mr: "🎉 *समस्या सुटली!*\n\nआम्हाला आनंद आहे की समस्या निवारणाने मदत केली! 😊\n\nपूर्णश्री सपोर्ट निवडल्याबद्दल धन्यवाद. 🙏",
    te: "🎉 *సమస్య పరిష్కరించబడింది!*\n\nట్రబుల్షూటింగ్ సహాయపడినందుకు మేము సంతోషిస్తున్నాము! 😊\n\nపూర్ణశ్రీ మద్దతును ఎంచుకున్నందుకు ధన్యవాదాలు. 🙏",
    bn: "🎉 *সমস্যা সমাধান হয়েছে!*\n\nআমরা খুশি যে সমস্যা সমাধানটি সাহায্য করেছে! 😊\n\nপূর্ণশ্রী সাপোর্ট বেছে নেওয়ার জন্য ধন্যবাদ। 🙏",
    ml: "🎉 *সমস্যা সমাধান হয়েছে!*\n\nআমরা খুশি যে সমস্যা সমাধানটি সাহায্য করেছে! 😊\n\nপূর্ণশ্রী সাপোর্ট বেছে নেওয়ার জন্য ধন্যবাদ। 🙏",
  },
  ALL_STEPS_DONE: {
    en: "✅ All troubleshooting steps have been completed but the issue is not resolved.\n\nWould you like to book a service visit? Our technician will assist you on-site. 🔧",
    hi: "✅ सभी समस्या निवारण चरण पूरे हो गए लेकिन समस्या हल नहीं हुई।\n\nक्या आप सेवा विज़िट बुक करना चाहेंगे? हमारा तकनीशियन आपकी सहायता करेगा। 🔧",
    ta: "✅ அனைத்து பழுதுநீக்கும் படிகளும் நிறைவடைந்துள்ளன, ஆனால் சிக்கல் தீர்க்கப்படவில்லை.\n\nசேவை வருகையை முன்பதிவு செய்ய விரும்புகிறீர்களா? எங்கள் தொழில்நுட்பவியலாளர் உங்களுக்கு உதவுவார். 🔧",
    kn: "✅ ಎಲ್ಲಾ ದೋಷನಿವಾರಣೆ ಹಂತಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ ಆದರೆ ಸಮಸ್ಯೆ ಬಗೆಹರಿದಿಲ್ಲ.\n\nಸೇವಾ ಭೇಟಿಯನ್ನು ಬುಕ್ ಮಾಡಲು ನೀವು ಬಯಸುವಿರಾ? ನಮ್ಮ ತಂತ್ರಜ್ಞರು ನಿಮಗೆ ಸಹಾಯ ಮಾಡುತ್ತಾರೆ. 🔧",
    mr: "✅ सर्व समस्या निवारण चरण पूर्ण झाले आहेत परंतु समस्या सुटली नाही.\n\nतुम्ही सेवा भेट बुक करू इच्छिता का? आमचे तंत्रज्ञ तुम्हाला मदत करतील. 🔧",
    te: "✅ అన్ని ట్రబుల్షూటింగ్ దశలు పూర్తయ్యాయి కానీ సమస్య పరిష్కరించబడలేదు.\n\nమీరు సేవా సందర్శనను బుక్ చేయాలనుకుంటున్నారా? మా సాంకేతిక నిపుణుడు మీకు సహాయం చేస్తారు. 🔧",
    bn: "✅ সমস্ত সমস্যা সমাধানের পদক্ষেপ সম্পন্ন হয়েছে তবে সমস্যাটির সমাধান হয়নি।\n\nআপনি কি পরিষেবা পরিদর্শন বুক করতে চান? আমাদের প্রযুক্তিবিদ আপনাকে সহায়তা করবেন। 🔧",
    ml: "✅ সমস্ত সমস্যা সমাধানের পদক্ষেপ সম্পন্ন হয়েছে তবে সমস্যাটির সমাধান হয়নি।\n\nআপনি কি পরিষেবা পরিদর্শন বুক করতে চান? আমাদের প্রযুক্তিবিদ আপনাকে সহায়তা করবেন। 🔧",
  },
  ASK_BOOK_SERVICE: {
    en: "😔 Sorry the troubleshooting didn't help.\n\nWould you like to book a service visit? Our technician will come to your location. 🔧",
    hi: "😔 माफ़ कीजिए समस्या निवारण से मदद नहीं मिली।\n\nक्या आप सेवा विज़िट बुक करना चाहेंगे? हमारा तकनीशियन आपके स्थान पर आएगा। 🔧",
    ta: "😔 மன்னிக்கவும், பழுதுநீக்குதல் உதவவில்லை.\n\nசேவை வருகையை முன்பதிவு செய்ய விரும்புகிறீர்களா? எங்கள் தொழில்நுட்பவியலாளர் உங்கள் இடத்திற்கு வருவார். 🔧",
    kn: "😔 ಕ್ಷಮಿಸಿ ದೋಷನಿವಾರಣೆ ಸಹಾಯ ಮಾಡಿಲ್ಲ.\n\nಸೇವಾ ಭೇಟಿಯನ್ನು ಬುಕ್ ಮಾಡಲು ನೀವು ಬಯಸುವಿರಾ? ನಮ್ಮ ತಂತ್ರಜ್ಞರು ನಿಮ್ಮ ಸ್ಥಳಕ್ಕೆ ಬರುತ್ತಾರೆ. 🔧",
    mr: "😔 क्षमस्व, समस्या निवारणाने मदत केली नाही.\n\nतुम्ही सेवा भेट बुक करू इच्छिता का? आमचे तंत्रज्ञ तुमच्या ठिकाणी येतील. 🔧",
    te: "😔 క్షమించండి ట్రబుల్షూటింగ్ సహాయపడలేదు.\n\nమీరు సేవా సందర్శనను బుక్ చేయాలనుకుంటున్నారా? మా సాంకేతిక నిపుణుడు మీ స్థానానికి వస్తాడు. 🔧",
    bn: "😔 দুঃখিত, সমস্যা সমাধানটি সাহায্য করেনি।\n\nআপনি কি পরিষেবা পরিদর্শন বুক করতে চান? আমাদের প্রযুক্তিবিদ আপনার স্থানে আসবেন। 🔧",
    ml: "😔 দুঃখিত, সমস্যা সমাধানটি সাহায্য করেনি।\n\nআপনি কি পরিষেবা পরিদর্শন বুক করতে চান? আমাদের প্রযুক্তিবিদ আপনার স্থানে আসবেন। 🔧",
  },
  STEP_DISPLAY: {
    en: "🔍 *Step {current} of {total}:*\n--------------------\n✓ {step}\n--------------------\n\nWere you able to resolve the issue?",
    hi: "🔍 *चरण {current}/{total}:*\n--------------------\n✓ {step}\n--------------------\n\nक्या आप समस्या हल करने में सफल रहे?",
    ta: "🔍 *படி {current}/{total}:*\n--------------------\n✓ {step}\n--------------------\n\nஉங்களால் சிக்கலைத் தீர்க்க முடிந்ததா?",
    kn: "🔍 *ಹಂತ {current}/{total}:*\n--------------------\n✓ {step}\n--------------------\n\nಸಮಸ್ಯೆಯನ್ನು ಬಗೆಹರಿಸಲು ನಿಮಗೆ ಸಾಧ್ಯವಾಯಿತೇ?",
    mr: "🔍 *चरण {current}/{total}:*\n--------------------\n✓ {step}\n--------------------\n\nतुम्ही समस्या सोडवू शकलात का?",
    te: "🔍 *దశ {current}/{total}:*\n--------------------\n✓ {step}\n--------------------\n\nమీరు సమస్యను పరిష్కరించగలిగారా?",
    bn: "🔍 *ধাপ {current}/{total}:*\n--------------------\n✓ {step}\n--------------------\n\nআপনি কি সমস্যাটি সমাধান করতে পেরেছেন?",
    ml: "🔍 *ধাপ {current}/{total}:*\n--------------------\n✓ {step}\n--------------------\n\nআপনি কি সমস্যাটি সমাধান করতে পেরেছেন?",
  },
  ENTER_NAME: {
    en: "Please enter your full name.",
    hi: "कृपया अपना पूरा नाम दर्ज करें।",
    ta: "தயவுசெய்து உங்கள் முழு பெயரை உள்ளிடவும்.",
    kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.",
    mr: "कृपया आपले पूर्ण नाव प्रविष्ट करा.",
    te: "దయచేసి మీ పూర్తి పేరును నమోదు చేయండి.",
    bn: "অনুগ্রহ করে আপনার পুরো নাম লিখুন।",
    ml: "অনুগ্রহ করে আপনার পুরো নাম লিখুন।",
  },
  SHORT_NAME: {
    en: "Please enter your full name (minimum 2 characters).",
    hi: "कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर)।",
    ta: "தயவுசெய்து உங்கள் முழு பெயரை உள்ளிடவும் (குறைந்தது 2 எழுத்துக்கள்).",
    kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 2 ಅಕ್ಷರಗಳು).",
    mr: "कृपया आपले पूर्ण नाव प्रविष्ट करा (किमान 2 अक्षरे).",
    te: "దయచేసి మీ పూర్తి పేరును నమోదు చేయండి (కనీసం 2 అక్షరాలు).",
    bn: "অনুগ্রহ করে আপনার পুরো নাম লিখুন (কমপক্ষে 2 অক্ষর)।",
    ml: "অনুগ্রহ করে আপনার পুরো নাম লিখুন (কমপক্ষে 2 অক্ষর)।",
  },
  ENTER_PINCODE: {
    en: "Please enter your area pincode (6 digits).",
    hi: "कृपया अपने क्षेत्र का पिनकोड दर्ज करें (6 अंक)।",
    ta: "உங்கள் பகுதி பின்கோடை உள்ளிடவும் (6 இலக்கங்கள்).",
    kn: "ನಿಮ್ಮ ಪ್ರದೇಶದ ಪಿನ್‌ಕೋಡ್ ನಮೂದಿಸಿ (6 ಅಂಕೆಗಳು).",
    mr: "कृपया आपल्या क्षेत्राचा पिनकोड प्रविष्ट करा (6 अंक).",
    te: "దయచేసి మీ ప్రాంత పినకోడ్‌ను నమోదు చేయండి (6 అంకెలు).",
    bn: "অনুগ্রহ করে আপনার এলাকার পিনকোড লিখুন (6 সংখ্যা)।",
    ml: "অনুগ্রহ করে আপনার এলাকার পিনকোড লিখুন (6 সংখ্যা)।",
  },
  INVALID_PINCODE: {
    en: "Please enter a valid 6-digit pincode.",
    hi: "कृपया एक वैध 6 अंकों का पिनकोड दर्ज करें।",
    ta: "சரியான 6 இலக்க பின்கோடை உள்ளிடவும்.",
    kn: "ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ 6-ಅಂಕಿಯ ಪಿನ್‌ಕೋಡ್ ನಮೂದಿಸಿ.",
    mr: "कृपया एक वैध 6 अंकी पिनकोड प्रविष्ट करा.",
    te: "దయచేసి సరైన 6 అంకెల పినకోడ్‌ను నమోదు చేయండి.",
    bn: "অনুগ্রহ করে একটি বৈধ ৬-অঙ্কের পিনকোড লিখুন।",
    ml: "অনুগ্রহ করে একটি বৈধ ৬-অঙ্কের পিনকোড লিখুন।",
  },
  PINCODE_NOT_FOUND: {
    en: "❌ Pincode *{pincode}* does not exist in our records.\n\nPlease enter a valid 6-digit pincode:",
    hi: "❌ पिनकोड *{pincode}* हमारे रिकॉर्ड में मौजूद नहीं है।\n\nकृपया एक वैध 6 अंकों का पिनकोड दर्ज करें:",
    ta: "❌ பின்கோடு *{pincode}* எங்கள் பதிவுகளில் இல்லை.\n\nதயவுசெய்து சரியான 6 இலக்க பின்கோடை உள்ளிடவும்:",
    kn: "❌ ಪಿನ್‌ಕೋಡ್ *{pincode}* ನಮ್ಮ ದಾಖಲೆಗಳಲ್ಲಿ ಅಸ್ತಿತ್ವದಲ್ಲಿಲ್ಲ.\n\nದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ 6-ಅಂಕಿಯ ಪಿನ್‌ಕೋಡ್ ನಮೂದಿಸಿ:",
    mr: "❌ पिनकोड *{pincode}* आमच्या रेकॉर्डमध्ये अस्तित्वात नाही.\n\nकृपया एक वैध 6 अंकी पिनकोड प्रविष्ट करा:",
    te: "❌ పినకోడ్ *{pincode}* మా రికార్డులలో లేదు.\n\nదయచేసి సరైన 6 అంకెల పినకోడ్‌ను నమోదు చేయండి:",
    bn: "❌ পিনকোড *{pincode}* আমাদের রেকর্ডে নেই।\n\nঅনুগ্রহ করে একটি বৈধ ৬-অঙ্কের পিনকোড লিখুন:",
    ml: "❌ পিনকোড *{pincode}* আমাদের রেকর্ডে নেই।\n\nঅনুগ্রহ করে একটি বৈধ ৬-অঙ্কের পিনকোড লিখুন:",
  },
  PINCODE_CONFIRM: {
    en: "📍 *We found your area:*\n{location}\n📮 *Pincode:* {pincode}\n\nIs this your service area?",
    hi: "📍 *आपका क्षेत्र मिला:*\n{location}\n📮 *पिनकोड:* {pincode}\n\nक्या यह आपका सेवा क्षेत्र सही है?",
    ta: "📍 *உங்கள் பகுதி கண்டுபிடிக்கப்பட்டது:*\n{location}\n📮 *பின்கோடு:* {pincode}\n\nஇது உங்கள் சேவைப் பகுதியா?",
    kn: "📍 *ನಿಮ್ಮ ಪ್ರದೇಶ ಕಂಡುಬಂದಿದೆ:*\n{location}\n📮 *ಪಿನ್‌ಕೋಡ್:* {pincode}\n\nಇದು ನಿಮ್ಮ ಸೇವಾ ಪ್ರದೇಶವೇ?",
    mr: "📍 *आम्हाला तुमचे क्षेत्र सापडले:*\n{location}\n📮 *पिनकोड:* {pincode}\n\nहे तुमचे सेवा क्षेत्र आहे का?",
    te: "📍 *మేము మీ ప్రాంతాన్ని కనుగొన్నాము:*\n{location}\n📮 *పినకోడ్:* {pincode}\n\nఇది మీ సేవా ప్రాంతమా?",
    bn: "📍 *আমরা আপনার এলাকা খুঁজে পেয়েছি:*\n{location}\n📮 *পিনকোড:* {pincode}\n\nএটি কি আপনার পরিষেবা এলাকা?",
    ml: "📍 *আমরা আপনার এলাকা খুঁজে পেয়েছি:*\n{location}\n📮 *পিনকোড:* {pincode}\n\nএটি কি আপনার পরিষেবা এলাকা?",
  },
  ENTER_ADDRESS: {
    en: "Please enter your full address (house no., street, landmark).\n\nExample: House 12, Main Road, near temple",
    hi: "कृपया अपना पूरा पता दर्ज करें (मकान नं., सड़क, लैंडमार्क)।\n\nउदाहरण: मकान 12, मुख्य सड़क, मंदिर के पास",
    ta: "உங்கள் முழு முகவரியை உள்ளிடவும் (வீட்டு எண், தெரு, அடையாளம்).\n\nஉதாரணம்: வீடு 12, பிரதான சாலை, கோயிலுக்கு அருகில்",
    kn: "ನಿಮ್ಮ ಪೂರ್ಣ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ (ಮನೆ ಸಂಖ್ಯೆ, ರಸ್ತೆ, ಹೆಗ್ಗುರುತು).\n\nಉದಾಹರಣೆ: ಮನೆ 12, ಮುಖ್ಯ ರಸ್ತೆ, ದೇವಸ್ಥಾನದ ಹತ್ತಿರ",
    mr: "कृपया आपला पूर्ण पत्ता प्रविष्ट करा (घर क्रमांक, रस्ता, खूण).\n\nउदाहरण: घर 12, मुख्य रस्ता, मंदिराजवळ",
    te: "దయచేసి మీ పూర్తి చిరునామాను నమోదు చేయండి (ఇంటి నంబర్, వీధి, ల్యాండ్‌మార్క్).\n\nఉదాహరణ: ఇల్లు 12, ప్రధాన రహదారి, గుడి దగ్గర",
    bn: "অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা লিখুন (বাড়ির নম্বর, রাস্তা, ল্যান্ডমার্ক)।\n\nউদাহরণ: বাড়ি 12, প্রধান রাস্তা, মন্দিরের কাছে",
    ml: "অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা লিখুন (বাড়ির নম্বর, রাস্তা, ল্যান্ডমার্ক)।\n\nউদাহরণ: বাড়ি 12, প্রধান রাস্তা, মন্দিরের কাছে",
  },
  SHORT_ADDRESS: {
    en: "Please enter your full address (at least 10 characters).",
    hi: "कृपया अपना पूरा पता दर्ज करें (कम से कम 10 अक्षर)।",
    ta: "உங்கள் முழு முகவரியை உள்ளிடவும் (குறைந்தது 10 எழுத்துக்கள்).",
    kn: "ನಿಮ್ಮ ಪೂರ್ಣ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 10 ಅಕ್ಷರಗಳು).",
    mr: "कृपया आपला पूर्ण पत्ता प्रविष्ट करा (किमान 10 अक्षरे).",
    te: "దయచేసి మీ పూర్తి చిరునామాను నమోదు చేయండి (కనీసం 10 అక్షరాలు).",
    bn: "অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা লিখুন (কমপক্ষে 10 অক্ষর)।",
    ml: "অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা লিখুন (কমপক্ষে 10 অক্ষর)।",
  },
  TICKET_CONFIRMED: {
    en: "✅ 👷 *Your complaint has been registered!*\n\n🎫 *Ticket No: {ticket}*\n📦 Product: {product}\n📝 Issue: {issue}\n📍 Location: {location}\n\n*Our technician will reach out to you within 24–48 hours. Assuring you of the best services!* 😊",
    hi: "✅ 👷 *आपकी शिकायत दर्ज हो गई है!*\n\n🎫 *टिकट नंबर: {ticket}*\n📦 उत्पाद: {product}\n📝 समस्या: {issue}\n📍 स्थान: {location}\n\n*हमारा तकनीशियन 24–48 घंटों के भीतर आपसे संपर्क करेगा। सर्वोत्तम सेवा का आश्वासन!* 😊",
    ta: "✅ 👷 *உங்கள் புகார் பதிவு செய்யப்பட்டுள்ளது!*\n\n🎫 *டிக்கெட் எண்: {ticket}*\n📦 தயாரிப்பு: {product}\n📝 சிக்கல்: {issue}\n📍 இடம்: {location}\n\n*எங்கள் தொழில்நுட்பவியலாளர் 24–48 மணிநேரத்திற்குள் உங்களை தொடர்புகொள்வார்!* 😊",
    kn: "✅ 👷 *ನಿಮ್ಮ ದೂರು ದಾಖಲಾಗಿದೆ!*\n\n🎫 *ಟಿಕೆಟ್ ಸಂಖ್ಯೆ: {ticket}*\n📦 ಉತ್ಪನ್ನ: {product}\n📝 ಸಮಸ್ಯೆ: {issue}\n📍 ಸ್ಥಳ: {location}\n\n*ನಮ್ಮ ತಂತ್ರಜ್ಞರು 24–48 ಗಂಟೆಗಳ ಒಳಗೆ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ!* 😊",
    mr: "✅ 👷 *तुमची तक्रार नोंदवली गेली आहे!*\n\n🎫 *तिकीट क्रमांक: {ticket}*\n📦 उत्पादन: {product}\n📝 समस्या: {issue}\n📍 ठिकाण: {location}\n\n*आमचे तंत्रज्ञ 24–48 तासांत तुमच्याशी संपर्क साधतील!* 😊",
    te: "✅ 👷 *మీ ఫిర్యాదు నమోదు చేయబడింది!*\n\n🎫 *టికెట్ నంబర్: {ticket}*\n📦 ఉత్పత్తి: {product}\n📝 సమస్య: {issue}\n📍 స్థానం: {location}\n\n*మా సాంకేతిక నిపుణుడు 24–48 గంటల్లో మిమ్మల్ని సంప్రదిస్తారు!* 😊",
    bn: "✅ 👷 *আপনার অভিযোগ নিবন্ধিত হয়েছে!*\n\n🎫 *টিকিট নম্বর: {ticket}*\n📦 পণ্য: {product}\n📝 সমস্যা: {issue}\n📍 অবস্থান: {location}\n\n*আমাদের প্রযুক্তিবিদ 24-48 ঘন্টার মধ্যে আপনার সাথে যোগাযোগ করবেন!* 😊",
    ml: "✅ 👷 *আপনার অভিযোগ নিবন্ধিত হয়েছে!*\n\n🎫 *টিকিট নম্বর: {ticket}*\n📦 পণ্য: {product}\n📝 সমস্যা: {issue}\n📍 অবস্থান: {location}\n\n*আমাদের প্রযুক্তিবিদ 24-48 ঘন্টার মধ্যে আপনার সাথে যোগাযোগ করবেন!* 😊",
  },
  SESSION_CLOSED: {
    en: "👋 Session closed. Thank you for contacting Poornasree Support!\n\nReply anything to start again.",
    hi: "👋 सत्र बंद हो गया। पूर्णश्री सपोर्ट से संपर्क करने के लिए धन्यवाद!\n\nदोबारा शुरू करने के लिए कुछ भी टाइप करें।",
    ta: "👋 அமர்வு மூடப்பட்டது. பூர்ணஸ்ரீ ஆதரவைத் தொடர்புகொண்டதற்கு நன்றி!\n\nமீண்டும் தொடங்க ஏதேனும் பதிலளிக்கவும்.",
    kn: "👋 ಅಧಿವೇಶನ ಮುಚ್ಚಿದೆ. ಪೂರ್ಣಶ್ರೀ ಬೆಂಬಲವನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು!\n\nಮತ್ತೆ ಪ್ರಾರಂಭಿಸಲು ಏನಾದರೂ ಪ್ರತ್ಯುತ್ತರಿಸಿ.",
    mr: "👋 सत्र बंद झाले. पूर्णश्री सपोर्टशी संपर्क साधल्याबद्दल धन्यवाद!\n\nपुन्हा सुरू करण्यासाठी काहीही रिप्लाय द्या.",
    te: "👋 సెషన్ ముగిసింది. పూర్ణశ్రీ మద్దతును సంప్రదించినందుకు ధన్యవాదాలు!\n\nమళ్ళీ ప్రారంభించడానికి ఏదైనా ప్రత్యుత్తరం ఇవ్వండి.",
    bn: "👋 সেশন বন্ধ হয়েছে। পূর্ণশ্রী সাপোর্টে যোগাযোগ করার জন্য ধন্যবাদ!\n\nআবার শুরু করতে কিছু উত্তর দিন।",
    ml: "👋 সেশন বন্ধ হয়েছে। পূর্ণশ্রী সাপোর্টে যোগাযোগ করার জন্য ধন্যবাদ!\n\nআবার শুরু করতে কিছু উত্তর দিন।",
  },
  VALID_OPTION: {
    en: "Please select a valid option from the menu below 👇",
    hi: "कृपया नीचे दिए मेनू से एक विकल्प चुनें 👇",
    ta: "கீழே உள்ள மெனுவிலிருந்து சரியான விருப்பத்தைத் தேர்ந்தெடுக்கவும் 👇",
    kn: "ದಯವಿಟ್ಟು ಕೆಳಗಿನ ಮೆನುವಿನಿಂದ ಮಾನ್ಯವಾದ ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ 👇",
    mr: "कृपया खालील मेनूमधून एक वैध पर्याय निवडा 👇",
    te: "దయచేసి క్రింది మెను నుండి సరైన ఎంపికను ఎంచుకోండి 👇",
    bn: "অনুগ্রহ করে নিচের মেনু থেকে একটি বৈধ বিকল্প নির্বাচন করুন 👇",
    ml: "ദയവായി താഴെയുള്ള മെനുവിൽ നിന്ന് ശരിയായ ഒരു ഓപ്ഷൻ തിരഞ്ഞെടുക്കുക 👇",
  },
  SPEAK_TO_SUPPORT: {
    en: "📞 *Speak to Support*\n\n{contact}\n\nPlease wait, we are finding you the best support... Our support team will reach out to you shortly.",
    hi: "📞 *सहायता से बात करें*\n\n{contact}\n\nकृपया प्रतीक्षा करें, हम आपके लिए सर्वश्रेष्ठ सहायता खोज रहे हैं... हमारी सहायता टीम जल्द ही आपसे संपर्क करेगी।",
    ta: "📞 *ஆதரவு குழுவுடன் பேசவும்*\n\n{contact}\n\nதயவுசெய்து காத்திருக்கவும், நாங்கள் சிறந்த ஆதரவைக் கண்டறிகிறோம்... எங்கள் ஆதரவுக் குழு விரைவில் உங்களைத் தொடர்புகொள்ளும்.",
    kn: "📞 *ಬೆಂಬಲ ತಂಡದೊಂದಿಗೆ ಮಾತನಾಡಿ*\n\n{contact}\n\nದಯವಿಟ್ಟು ನಿರೀಕ್ಷಿಸಿ, ನಾವು ನಿಮಗೆ ಉತ್ತಮ ಬೆಂಬಲವನ್ನು ಹುಡುಕುತ್ತಿದ್ದೇವೆ... ನಮ್ಮ ಬೆಂಬಲ ತಂಡವು ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
    mr: "📞 *सपोर्ट टीमशी बोला*\n\n{contact}\n\nकृपया प्रतीक्षा करा, आम्ही तुमच्यासाठी सर्वोत्तम सपोर्ट शोधत आहोत... आमची सपोर्ट टीम लवकरच तुमच्याशी संपर्क साधेल.",
    te: "📞 *మద్దతు బృందంతో మాట్లాడండి*\n\n{contact}\n\nదయచేసి వేచి ఉండండి, మేము మీకు ఉత్తమ మద్దతును కనుగొంటున్నాము... మా మద్దతు బృందం త్వరలో మిమ్మల్ని సంప్రదిస్తుంది.",
    bn: "📞 *সাপোর্ট টিমের সাথে কথা বলুন*\n\n{contact}\n\nঅনুগ্রহ করে অপেক্ষা করুন, আমরা আপনার জন্য সেরা সহায়তা খুঁজছি... আমাদের সাপোর্ট টিম শীঘ্রই আপনার সাথে যোগাযোগ করবে।",
    ml: "📞 *সাপোর্ট টিমের সাথে কথা বলুন*\n\n{contact}\n\nঅনুগ্রহ করে অপেক্ষা করুন, আমরা আপনার জন্য সেরা সহায়তা খুঁজছি... আমাদের সাপোর্ট টিম শীঘ্রই আপনার সাথে যোগাযোগ করবে।",
  },
  LANG_SELECT: {
    en: "🌐 *Select your preferred language:*\n\nChoose your language to continue 👇",
    hi: "🌐 *अपनी पसंदीदा भाषा चुनें:*\n\nजारी रखने के लिए भाषा चुनें 👇",
    ta: "🌐 *உங்கள் விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்:*\n\nதொடர உங்கள் மொழியைத் தேர்வு செய்யவும் 👇",
    kn: "🌐 *ನಿಮ್ಮ ಆದ್ಯತೆಯ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ:*\n\nಮುಂದುವರಿಯಲು ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆರಿಸಿ 👇",
    mr: "🌐 *तुमची पसंतीची भाषा निवडा:*\n\nपुढे जाण्यासाठी तुमची भाषा निवडा 👇",
    te: "🌐 *మీకు ఇష్టమైన భాషను ఎంచుకోండి:*\n\nకొనసాగించడానికి మీ భాషను ఎంచుకోండి 👇",
    bn: "🌐 *আপনার পছন্দের ভাষা নির্বাচন করুন:*\n\nচালিয়ে যেতে আপনার ভাষা চয়ন করুন 👇",
    ml: "🌐 *നിങ്ങൾക്ക് ഇഷ്ടമുള്ള ഭാഷ തിരഞ്ഞെടുക്കുക:*\n\nതുടരാൻ ഭാഷ തിരഞ്ഞെടുക്കുക 👇",
  },
  LANG_CHANGED_EN: {
    en: "✅ Language set to *English*.",
    hi: "✅ Language set to *English*.",
    ta: "✅ மொழி *English* என அமைக்கப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *English* ಗೆ ಹೊಂದಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *English* वर सेट केली.",
    te: "✅ భాష *English* గా సెట్ చేయబడింది.",
    bn: "✅ ভাষা *English* সেট করা হয়েছে।",
    ml: "✅ ভাষা *English* সেট করা হয়েছে।",
  },
  LANG_CHANGED_HI: {
    en: "✅ भाषा *हिंदी* में बदली गई।",
    hi: "✅ भाषा *हिंदी* में बदली गई।",
    ta: "✅ மொழி *हिंदी* க்கு மாற்றப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *हिंदी* ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *हिंदी* मध्ये बदलली.",
    te: "✅ భాష *हिंदी* కి మార్చబడింది.",
    bn: "✅ ভাষা *हिंदी* তে পরিবর্তিত হয়েছে।",
    ml: "✅ ভাষা *हिंदी* তে পরিবর্তিত হয়েছে।",
  },
  LANG_CHANGED_TA: {
    en: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    hi: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    ta: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    kn: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    mr: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    te: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    bn: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    ml: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
  },
  LANG_CHANGED_KN: {
    en: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    hi: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    ta: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    kn: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    te: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    bn: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    ml: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
  },
  LANG_CHANGED_MR: {
    en: "✅ भाषा *मराठी* मध्ये बदलली.",
    hi: "✅ भाषा *मराठी* मध्ये बदलली.",
    ta: "✅ भाषा *मराठी* मध्ये बदलली.",
    kn: "✅ भाषा *मराठी* मध्ये बदलली.",
    mr: "✅ भाषा *मराठी* मध्ये बदलली.",
    te: "✅ भाषा *मराठी* मध्ये बदलली.",
    bn: "✅ भाषा *मराठी* मध्ये बदलली.",
    ml: "✅ भाषा *मराठी* मध्ये बदलली.",
  },
  LANG_CHANGED_TE: {
    en: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    hi: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    ta: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    kn: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    mr: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    te: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    bn: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    ml: "✅ భాష *తెలుగు* కి మార్చబడింది.",
  },
  LANG_CHANGED_BN: {
    en: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে।",
    hi: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে।",
    ta: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে。",
    kn: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে。",
    mr: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে。",
    te: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে。",
    bn: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে।",
    ml: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে।",
  },
  WAITING_INPUT: {
    en: "⏳ *We are waiting for your input.* 🤔\n\n🔙 To go back to Main Menu, please click *Main Menu* button.\n\n💬 To change your preferred language, please click *Change Language* Button.\n\n🔚 To end the conversation, please click *Close* Button. 👇",
    hi: "⏳ *हम आपके जवाब का इंतजार कर रहे हैं।* 🤔\n\n🔙 मुख्य मेनू पर जाने के लिए *मुख्य मेनू* बटन दबाएं।\n\n💬 भाषा बदलने के लिए *भाषा बदलें* बटन दबाएं।\n\n🔚 बातचीत समाप्त करने के लिए *बंद करें* बटन दबाएं। 👇",
    ta: "⏳ *நாங்கள் உங்கள் பதிலுக்காக காத்திருக்கிறோம்.* 🤔\n\n🔙 முதன்மை மெனுவிற்கு செல்ல *முதன்மை மெனு* பொத்தானை அழுத்தவும்.\n\n💬 மொழியை மாற்ற *மொழியை மாற்று* பொத்தானை அழுத்தவும்.\n\n🔚 உரையாடலை முடிக்க *மூடு* பொத்தானை அழுத்தவும். 👇",
    kn: "⏳ *ನಾವು ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆಗಾಗಿ ಕಾಯುತ್ತಿದ್ದೇವೆ.* 🤔\n\n🔙 ಮುಖ್ಯ ಮೆನುಗೆ ಹೋಗಲು *ಮುಖ್ಯ ಮೆನು* ಬಟನ್ ಒತ್ತಿರಿ.\n\n💬 ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಲು *ಭಾಷೆ ಬದಲಾಯಿಸಿ* ಬಟನ್ ಒತ್ತಿರಿ.\n\n🔚 ಸಂಭಾಷಣೆಯನ್ನು ಕೊನೆಗೊಳಿಸಲು *ಮುಚ್ಚು* ಬಟನ್ ಒತ್ತಿರಿ. 👇",
    mr: "⏳ *आम्ही तुमच्या उत्तराची वाट पाहत आहोत.* 🤔\n\n🔙 मुख्य मेनूवर जाण्यासाठी *मुख्य मेनू* बटण दाबा.\n\n💬 भाषा बदलण्यासाठी *भाषा बदला* बटण दाबा.\n\n🔚 संभाषण संपवण्यासाठी *बंद करा* बटण दाबा. 👇",
    te: "⏳ *మేము మీ సమాధానం కోసం వేచి ఉన్నాము.* 🤔\n\n🔙 ప్రధాన మెనుకి వెళ్ళడానికి *ప్రధాన మెను* బటన్ నొక్కండి.\n\n💬 భాషను మార్చడానికి *భాష మార్చండి* బటన్ నొక్కండి.\n\n🔚 సంభాషణను ముగించడానికి *మూసివేయి* బటన్ నొక్కండి. 👇",
    bn: "⏳ *আমরা আপনার উত্তরের জন্য অপেক্ষা করছি।* 🤔\n\n🔙 প্রধান মেনুতে ফিরে যেতে *প্রধান মেনু* বোতাম টিপুন।\n\n💬 ভাষা পরিবর্তন করতে *ভাষা পরিবর্তন করুন* বোতাম টিপুন।\n\n🔚 কথোপকথন শেষ করতে *বন্ধ করুন* বোতাম টিপুন। 👇",
    ml: "⏳ *আমরা আপনার উত্তরের জন্য অপেক্ষা করছি।* 🤔\n\n🔙 প্রধান মেনুতে ফিরে যেতে *প্রধান মেনু* বোতাম টিপুন।\n\n💬 ভাষা পরিবর্তন করতে *ভাষা পরিবর্তন করুন* বোতাম টিপুন।\n\n🔚 কথোপকথন শেষ করতে *বন্ধ করুন* বোতাম টিপুন। 👇",
  },
  NO_TICKETS: {
    en: "📋 No tickets found for your number.",
    hi: "📋 आपके नंबर के लिए कोई टिकट नहीं मिला।",
    ta: "📋 உங்கள் எண்ணுக்கு டிக்கெட்டுகள் எதுவும் கிடைக்கவில்லை.",
    kn: "📋 ನಿಮ್ಮ ಸಂಖ್ಯೆಗೆ ಯಾವುದೇ ಟಿಕೆಟ್‌ಗಳು ಕಂಡುಬಂದಿಲ್ಲ.",
    mr: "📋 तुमच्या नंबरसाठी कोणतीही तिकिटे सापडली नाहीत.",
    te: "📋 మీ నంబర్ కోసం ఎటువంటి టిక్కెట్లు కనుగొనబడలేదు.",
    bn: "📋 আপনার নম্বরের জন্য কোনও টিকিট পাওয়া যায়নি।",
    ml: "📋 আপনার নম্বরের জন্য কোনও টিকিট পাওয়া যায়নি।",
  },
  SERVICE_UNAVAILABLE: {
    en: "Service temporarily unavailable. Please try again later.",
    hi: "सेवा अस्थायी रूप से उपलब्ध नहीं है। कृपया बाद में पुनः प्रयास करें।",
    ta: "சேவை தற்காலிகமாக கிடைக்கவில்லை. பின்னர் மீண்டும் முயற்சிக்கவும்.",
    kn: "ಸೇವೆ ತಾತ್ಕಾಲಿಕವಾಗಿ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    mr: "सेवा तात्पुरती अनुपलब्ध आहे. कृपया नंतर पुन्हा प्रयत्न करा.",
    te: "సేవ తాత్కాలికంగా అందుబాటులో లేదు. దయచేసి తర్వాత మళ్ళీ ప్రయత్నించండి.",
    bn: "পরিষেবা সাময়িকভাবে অনুপলব্ধ। অনুগ্রহ করে পরে আবার চেষ্টা করুন।",
    ml: "পরিষেবা সাময়িকভাবে অনুপলব্ধ। অনুগ্রহ করে পরে আবার চেষ্টা করুন।",
  },
  ASK_VIDEO_TUTORIAL: {
    en: "📺 We have a tutorial video on how to fix this issue.\n\nWould you like to watch it?",
    hi: "📺 हमारे पास इस समस्या को ठीक करने का एक ट्यूटोरियल वीडियो है।\n\nक्या आप इसे देखना चाहेंगे?",
    ta: "📺 இந்த சிக்கலை எவ்வாறு சரிசெய்வது என்பதற்கான டுடோரியல் வீடியோ எங்களிடம் உள்ளது.\n\nநீங்கள் அதைப் பார்க்க விரும்புகிறீர்களா?",
    kn: "📺 ಈ ಸಮಸ್ಯೆಯನ್ನು ಹೇಗೆ ಸರಿಪಡಿಸುವುದು ಎಂಬುದರ ಕುರಿತು ಟ್ಯುಟೋರಿಯಲ್ ವೀಡಿಯೊ ನಮ್ಮಲ್ಲಿದೆ.\n\nನೀವು ಅದನ್ನು ನೋಡಲು ಬಯಸುವಿರಾ?",
    mr: "📺 ही समस्या कशी सोडवायची याचा ट्यूटोरियल व्हिडिओ आमच्याकडे आहे.\n\nतुम्हाला तो पाहायला आवडेल का?",
    te: "📺 ఈ సమస్యను ఎలా పరిష్కరించాలో ట్యుటోరియల్ వీడియో మా వద్ద ఉంది.\n\nమీరు దానిని చూడాలనుకుంటున్నారా?",
    bn: "📺 এই সমস্যাটি কীভাবে ঠিক করবেন তার একটি টিউটোরিয়াল ভিডিও আমাদের কাছে রয়েছে।\n\nআপনি কি এটি দেখতে চান?",
    ml: "📺 এই সমস্যাটি কীভাবে ঠিক করবেন তার একটি টিউটোরিয়াল ভিডিও আমাদের কাছে রয়েছে।\n\nআপনি কি এটি দেখতে চান?",
  },
  ASK_VIDEO_HELPED: {
    en: "Did the video help resolve the issue?",
    hi: "क्या वीडियो से आपकी समस्या हल हुई?",
    ta: "வீடியோ சிக்கலைத் தீர்க்க உதவியதா?",
    kn: "ವೀಡಿಯೊ ಸಮಸ್ಯೆಯನ್ನು ಬಗೆಹರಿಸಲು ಸಹಾಯ ಮಾಡಿತೇ?",
    mr: "व्हिडिओमुळे समस्या सोडवण्यास मदत झाली का?",
    te: "వీడియో సమస్యను పరిష్కరించడంలో సహాయపడిందా?",
    bn: "ভিডিওটি কি সমস্যা সমাধানে সাহায্য করেছে?",
    ml: "ভিডিওটি কি সমস্যা সমাধানে সাহায্য করেছে?",
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

function getCancelButton(lang: Lang): ReplyButton {
  const titles: Record<Lang, string> = {
    en: "Cancel ❌",
    hi: "रद्द करें ❌",
    ta: "ரத்து செய் ❌",
    kn: "ರದ್ದುಮಾಡಿ ❌",
    mr: "रद्द करा ❌",
    te: "రద్దు చేయండి ❌",
    bn: "বাতিল করুন ❌",
    ml: "বাতিল করুন ❌",
  };
  return { id: "CANCEL", title: titles[lang] ?? "Cancel ❌" };
}

async function cancelRegistrationToMainMenu(
  sessionId: string,
  meta: SessionMeta,
  lang: Lang
) {
  const cancelMeta: SessionMeta = { ...meta, hasSkippedRegistration: true };
  await updateSession(sessionId, "MAIN_MENU", cancelMeta);
  return makeReply(
    "💡 You can select an option from the menu below, or type any question to ask me anything directly! 💬",
    undefined,
    getMainMenuList(lang)
  );
}

function getLangSelectButton(lang: Lang): ReplyButton {
  const titles: Record<Lang, string> = {
    en: "🌐 Select Language",
    hi: "🌐 भाषा चुनें",
    ta: "🌐 மொழி தேர்வு",
    kn: "🌐 ಭಾಷೆ ಆಯ್ಕೆ",
    mr: "🌐 भाषा निवडा",
    te: "🌐 భాష మార్చండి",
    bn: "🌐 ভাষা বাছুন",
    ml: "🌐 ഭാഷ തിരഞ്ഞെടുക്കുക",
  };
  return { id: "SELECT_LANG", title: titles[lang] ?? "🌐 Select Language" };
}

function getMenuButton(lang: Lang): ReplyButton {
  return { id: "MENU", title: lang === "hi" ? "⬅️ मुख्य मेनू" : "⬅️ Main Menu" };
}

function getBackButton(lang: Lang): ReplyButton {
  return { id: "GO_BACK", title: t_extra("GO_BACK_TITLE", lang) };
}

function getBackRow(lang: Lang) {
  return {
    id: "GO_BACK",
    title: t_extra("GO_BACK_TITLE", lang),
    description: t_extra("GO_BACK_DESC", lang),
  };
}

function getRegisterAnotherComplaintButton(lang: Lang): ReplyButton {
  return { id: "YES", title: t_extra("REGISTER_ANOTHER_COMPLAINT_BUTTON", lang) };
}

function getCheckStatusButton(lang: Lang): ReplyButton {
  const titles: Record<Lang, string> = {
    en: "📋 Check Ticket Status",
    hi: "📋 शिकायत स्थिति जांचें",
    ta: "📋 நிலையைச் சரிபார்க்கவும்",
    ml: "📋 പരാതിയുടെ അവസ്ഥ കാണുക",
    kn: "📋 ಸ್ಥಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ",
    mr: "📋 स्थिती तपासा",
    te: "📋 పరిస్థితిని తనిఖీ చేయండి",
    bn: "📋 স্থিতি পরীক্ষা করুন",
  };
  return { id: "COMPLAINT_STATUS", title: titles[lang] || titles.en };
}

function isGlobalBackCommand(text: string): boolean {
  const upper = text.toUpperCase().trim();
  return (
    upper === "GO_BACK" ||
    upper === "BACK" ||
    upper === "PREVIOUS" ||
    upper === "PREVIOUS_STEP" ||
    upper === "00" ||
    upper.includes("GO BACK") ||
    upper.includes("पीछे जाएं") ||
    upper.includes("பின்செல்லவும்") ||
    upper.includes("ஹಿಂದೆ ಹೋಗಿ") ||
    upper.includes("मागे जा") ||
    upper.includes("వెనుకకు వెళ్ళు") ||
    upper.includes("ফিরে যান")
  );
}

function getYesNoButtons(lang: Lang): ReplyButton[] {
  return [
    { id: "1", title: lang === "hi" ? "हाँ ✅" : "Yes ✅" },
    { id: "2", title: lang === "hi" ? "नहीं ❌" : "No ❌" },
  ];
}

const EXTRA_TRANSLATIONS: Record<string, Record<Lang, string>> = {
  FLOW_INTERRUPTED: {
    en: "⚠️ It looks like you selected an option from a previous message.\n\nPlease choose a valid option below or return to the Main Menu:",
    hi: "⚠️ ऐसा प्रतीत होता है कि आपने पिछले संदेश का विकल्प चुना है।\n\nकृपया नीचे दिए गए विकल्पों में से चुनें या मुख्य मेनू पर लौटें:",
    ta: "⚠️ முந்தைய செய்தியிலிருந்து ஒரு விருப்பத்தைத் தேர்ந்தெடுத்தது போல் தெரிகிறது.\n\nதயவுசெய்து கீழே உள்ள விருப்பத்தைத் தேர்ந்தெடுக்கவும் அல்லது முதன்மை மெனுவிற்குத் திரும்பவும்:",
    kn: "⚠️ ನೀವು ಹಿಂದಿನ ಸಂದೇಶದಿಂದ ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿರುವಂತೆ ತೋರುತ್ತಿದೆ.\n\nದಯವಿಟ್ಟು ಕೆಳಗಿನ ಮಾನ್ಯವಾದ ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ ಅಥವಾ ಮುಖ್ಯ ಮೆನುಗೆ ಹಿಂತಿರುಗಿ:",
    mr: "⚠️ असे दिसते की आपण मागील संदेशातील पर्याय निवडला आहे.\n\nकृपया खालीलपैकी एक पर्याय निवडा किंवा मुख्य मेनूवर जा:",
    te: "⚠️ మీరు మునుపటి సందేశం నుండి ఒక ఎంపికను ఎంచుకున్నట్లు కనిపిస్తోంది.\n\nదయచేసి క్రింద ఉన్న ఎంపికలలో ఒకదాన్ని ఎంచుకోండి లేదా ప్రధాన మెనుకి తిరిగి వెళ్లండి:",
    bn: "⚠️ মনে হচ্ছে আপনি পূর্ববর্তী বার্তার একটি বিকল্প নির্বাচন করেছেন।\n\nঅনুগ্রহ করে নীচের সঠিক বিকল্পটি নির্বাচন করুন বা প্রধান মেনুতে ফিরে যান:",
    ml: "⚠️ মনে হচ্ছে আপনি পূর্ববর্তী বার্তার একটি বিকল্প নির্বাচন করেছেন।\n\nঅনুগ্রহ করে নীচের সঠিক বিকল্পটি নির্বাচন করুন বা প্রধান মেনুতে ফিরে যান:",
  },
  GO_BACK_TITLE: {
    en: "🔙 Go Back",
    hi: "🔙 पीछे जाएं",
    ta: "🔙 பின்செல்லவும்",
    kn: "🔙 ಹಿಂದೆ ಹೋಗಿ",
    mr: "🔙 मागे जा",
    te: "🔙 వెనుకకు వెళ్ళు",
    bn: "🔙 ফিরে যান",
    ml: "🔙 ফিরে যান",
  },
  GO_BACK_DESC: {
    en: "Return to previous step",
    hi: "पिछली स्क्रीन पर लौटें",
    ta: "முந்தைய படிக்கு திரும்பு",
    kn: "ಹಿಂದಿನ ಹಂತಕ್ಕೆ ಹಿಂತಿರುಗಿ",
    mr: "मागील पायरीवर जा",
    te: "మునుపటి దశకు తిరిగి వెళ్లండి",
    bn: "পূর্ববর্তী ধাপে ফিরে যান",
    ml: "পূর্ববর্তী ধাপে ফিরে যান",
  },
  REGISTER_ANOTHER_COMPLAINT_BUTTON: {
    en: "Register Another Complaint 📝",
    hi: "दूसरी शिकायत दर्ज करें 📝",
    ta: "மற்றொரு புகாரைப் பதிவுசெய்க 📝",
    kn: "ಮತ್ತೊಂದು ದೂರನ್ನು ನೋಂದಾಯಿಸಿ 📝",
    mr: "दूसरी तक्रार नोंदवा 📝",
    te: "మరొక ఫిర్యాదును నమోదు చేయండి 📝",
    bn: "অন্য একটি অভিযোগ নথিভুক্ত করুন 📝",
    ml: "অন্য একটি অভিযোগ নথিভুক্ত করুন 📝",
  },
  NEXT_COMPLAINT_PROMPT: {
    en: "Please select your next complaint:",
    hi: "कृपया अपनी अगली शिकायत चुनें:",
    ta: "தயவுசெய்து உங்கள் அடுத்த புகாரைத் தேர்ந்தெடுக்கவும்:",
    kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಮುಂದಿನ ದೂರನ್ನು ಆರಿಸಿ:",
    mr: "कृपया आपली पुढील तक्रार निवडा:",
    te: "దయచేసి మీ తదుపరి ఫిర్యాదును ఎంచుకోండి:",
    bn: "অনুগ্রহ করে আপনার পরবর্তী অভিযোগটি নির্বাচন করুন:",
    ml: "অনুগ্রহ করে আপনার পরবর্তী অভিযোগটি নির্বাচন করুন:",
  },
  THANK_YOU: {
    en: "Thank you! Have a great day.",
    hi: "धन्यवाद! आपका दिन शुभ हो।",
    ta: "நன்றி! இனிய நாள் அமையட்டும்.",
    kn: "ಧನ್ಯವಾದಗಳು! ಶುಭ ದಿನವಾಗಿರಲಿ.",
    mr: "धन्यवाद! आपला दिवस चांगला जावो.",
    te: "ధన్యవాదాలు! మీ రోజు బాగుండాలి.",
    bn: "ধন্যবাদ! আপনার দিনটি শুভ হোক।",
    ml: "ধন্যবাদ! আপনার দিনটি শুভ হোক।",
  },
  DO_YOU_HAVE_ANOTHER: {
    en: "Do you have another complaint for this machine?",
    hi: "क्या आपको इस मशीन के लिए कोई और शिकायत दर्ज करनी है?",
    ta: "இந்த இயந்திரத்திற்கு வேறு ஏதேனும் புகார் உள்ளதா?",
    kn: "ಈ ಯಂತ್ರಕ್ಕಾಗಿ ನಿಮಗೆ ಮತ್ತೊಂದು ದೂರು ಇದೆಯೇ?",
    mr: "या मशीनसाठी आपल्याकडे दुसरी तक्रार आहे का?",
    te: "ఈ మెషిన్ కోసం మీకు మరొక ఫిర్యాదు ఉందా?",
    bn: "আপনার কি এই মেশিনের জন্য অন্য কোনও অভিযোগ আছে?",
    ml: "আপনার কি এই মেশিনের জন্য অন্য কোনও অভিযোগ আছে?",
  },
  SELECT_NEXT_COMPLAINT_BUTTON: {
    en: "Select Complaint 📝",
    hi: "शिकायत चुनें 📝",
    ta: "புகாரைத் தேர்ந்தெடுக்கவும் 📝",
    kn: "ದೂರು ಆರಿಸಿ 📝",
    mr: "तक्रार निवडा 📝",
    te: "ఫిర్యాదును ఎంచుకోండి 📝",
    bn: "অভিযোগ নির্বাচন করুন 📝",
    ml: "অভিযোগ নির্বাচন করুন 📝",
  },
  SELECT_CATEGORY_BUTTON: {
    en: "Select Category 📝",
    hi: "श्रेणी चुनें 📝",
    ta: "வகையைத் தேர்ந்தெடுக்கவும் 📝",
    kn: "ವರ್ಗವನ್ನು ಆರಿಸಿ 📝",
    mr: "श्रेणी निवडा 📝",
    te: "వర్గాన్ని ఎంచుకోండి 📝",
    bn: "বিভাগ নির্বাচন করুন 📝",
    ml: "বিভাগ নির্বাচন করুন 📝",
  },
  YES_ANOTHER_ISSUE: {
    en: "Yes, Another Issue 📝",
    hi: "हाँ, दूसरी शिकायत 📝",
    ta: "ஆம், மற்றொரு பிரச்சினை 📝",
    kn: "ಹೌದು, ಮತ್ತೊಂದು ಸಮಸ್ಯೆ 📝",
    mr: "होय, दुसरी समस्या 📝",
    te: "అవును, మరొక समस्या 📝",
    bn: "হ্যাঁ, অন্য সমস্যা 📝",
    ml: "হ্যাঁ, অন্য সমস্যা 📝",
  },
  NO_BUTTON: {
    en: "No ❌",
    hi: "नहीं ❌",
    ta: "இல்லை ❌",
    kn: "ಇಲ್ಲ ❌",
    mr: "नाही ❌",
    te: "లేదు ❌",
    bn: "না ❌",
    ml: "না ❌",
  }
};

function t_extra(key: string, lang: Lang = "en"): string {
  return EXTRA_TRANSLATIONS[key]?.[lang] ?? EXTRA_TRANSLATIONS[key]?.en ?? key;
}

const LANG_BUTTONS: ReplyButton[] = [
  { id: "LANG_EN", title: "🇬🇧 English" },
  { id: "LANG_HI", title: "🇮🇳 हिंदी" },
];

function getLangList(lang: Lang): ReplyList {
  const buttonTexts: Record<Lang, string> = {
    en: "Select Language 🌐",
    hi: "भाषा चुनें 🌐",
    ta: "மொழியைத் தேர்ந்தெடுக்கவும் 🌐",
    kn: "ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ 🌐",
    mr: "भाषा निवडा 🌐",
    te: "భాషను ఎంచుకోండి 🌐",
    bn: "ভাষা নির্বাচন করুন 🌐",
    ml: "ভাষা নির্বাচন করুন 🌐",
  };
  return {
    buttonText: buttonTexts[lang] || buttonTexts.en,
    rows: [
      { id: "LANG_EN", title: "🇬🇧 English" },
      { id: "LANG_HI", title: "🇮🇳 हिंदी (Hindi)" },
      { id: "LANG_TA", title: "🇮🇳 தமிழ் (Tamil)" },
      { id: "LANG_ML", title: "🇮🇳 മലയാളം (Malayalam)" },
      { id: "LANG_KN", title: "🇮🇳 ಕನ್ನಡ (Kannada)" },
      { id: "LANG_MR", title: "🇮🇳 मराठी (Marathi)" },
      { id: "LANG_TE", title: "🇮🇳 తెలుగు (Telugu)" },
      { id: "LANG_BN", title: "🇮🇳 বাংলা (Bengali)" },
    ],
  };
}

function getYesResolvedButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Yes, Resolved ✅",
    hi: "हाँ, हल हुआ ✅",
    ta: "ஆம், தீர்க்கப்பட்டது ✅",
    kn: "ಹೌದು, ಪರಿಹರಿಸಲಾಗಿದೆ ✅",
    mr: "होय, सुटली ✅",
    te: "అవును, పరిష్కరించబడింది ✅",
    bn: "হ্যাঁ, সমাধান হয়েছে ✅",
    ml: "হ্যাঁ, সমাধান হয়েছে ✅",
  };
  return { id: "YES", title: labels[lang] || labels.en };
}

function getNotResolvedButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Not Resolved ❌",
    hi: "नहीं, हल नहीं हुआ ❌",
    ta: "இல்லை, தீர்க்கப்படவில்லை ❌",
    kn: "ಇಲ್ಲ, ಪರಿಹರಿಸಲಾಗಿಲ್ಲ ❌",
    mr: "नाही, सुटली नाही ❌",
    te: "లేదు, పరిష్కరించబడలేదు ❌",
    bn: "না, সমাধান হয়নি ❌",
    ml: "না, সমাধান হয়নি ❌",
  };
  return { id: "NOT_RESOLVED", title: labels[lang] || labels.en };
}

function getBookServiceButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Book Service 🔧",
    hi: "सेवा बुक करें 🔧",
    ta: "சேவை முன்பதிவு 🔧",
    kn: "ಸೇವೆ ಬುಕ್ ಮಾಡಿ 🔧",
    mr: "सेवा बुक करा 🔧",
    te: "సేవ బుక్ చేయండి 🔧",
    bn: "পরিষেবা বুক করুন 🔧",
    ml: "পরিষেবা বুক করুন 🔧",
  };
  return { id: "BOOK_SERVICE", title: labels[lang] || labels.en };
}

function getNextStepButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "No, Next Step ➡️",
    hi: "नहीं, अगला चरण ➡️",
    ta: "இல்லை, அடுத்த படி ➡️",
    kn: "ಇಲ್ಲ, ಮುಂದಿನ ಹಂತ ➡️",
    mr: "नाही, पुढचे पाऊल ➡️",
    te: "లేదు, తదుపరి దశ ➡️",
    bn: "না, পরবর্তী ধাপ ➡️",
    ml: "না, পরবর্তী ধাপ ➡️",
  };
  return { id: "NEXT_STEP", title: labels[lang] || labels.en };
}

function getShowVideoButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Yes, Show Video 📹",
    hi: "हाँ, वीडियो दिखाएं 📹",
    ta: "ஆம், வீடியோவைக் காட்டு 📹",
    kn: "ಹೌದು, ವೀಡಿಯೊ ತೋರಿಸಿ 📹",
    mr: "होय, व्हिडिओ दाखवा 📹",
    te: "అవును, వీడియో చూపించు 📹",
    bn: "হ্যাঁ, видео দেখান 📹",
    ml: "হ্যাঁ, видео দেখান 📹",
  };
  return { id: "YES", title: labels[lang] || labels.en };
}

function getNoBookServiceButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "No, Book Service 🔧",
    hi: "नहीं, सेवा बुक करें 🔧",
    ta: "இல்லை, சேவை முன்பதிவு 🔧",
    kn: "ಇಲ್ಲ, ಸೇವೆ ಬುಕ್ ಮಾಡಿ 🔧",
    mr: "नाही, सेवा बुक करा 🔧",
    te: "లేదు, సేవ బుక్ చేయండి 🔧",
    bn: "না, পরিষেবা বুক করুন 🔧",
    ml: "না, পরিষেবা বুক করুন 🔧",
  };
  return { id: "NO", title: labels[lang] || labels.en };
}

function getYesAnotherIssueButton(lang: Lang): ReplyButton {
  return { id: "YES", title: EXTRA_TRANSLATIONS.YES_ANOTHER_ISSUE[lang] || EXTRA_TRANSLATIONS.YES_ANOTHER_ISSUE.en };
}

function getNoButton(lang: Lang): ReplyButton {
  return { id: "NO", title: EXTRA_TRANSLATIONS.NO_BUTTON[lang] || EXTRA_TRANSLATIONS.NO_BUTTON.en };
}

export function getMainMenuList(lang: Lang, options?: { hasTickets?: boolean }): ReplyList {
  const titles: Record<string, Record<Lang, string>> = {
    view_products: {
      en: "View Our Products",
      hi: "हमारे उत्पाद देखें",
      ta: "எங்களது தயாரிப்புகள்",
      kn: "ನಮ್ಮ ಉತ್ಪನ್ನಗಳನ್ನು ವೀಕ್ಷಿಸಿ",
      mr: "आमची उत्पादने पहा",
      te: "मा ఉత్పత్తులను చూడండి",
      bn: "আমাদের পণ্য দেখুন",
    ml: "আমাদের পণ্য দেখুন",
    },
    complaint_reg: {
      en: "Complaint Registration",
      hi: "शिकायत दर्ज करें",
      ta: "புகார் பதிவு",
      kn: "ದೂರು ನೋಂದಣಿ",
      mr: "तक्रार नोंदणी",
      te: "ఫిర్యాదు నమోదు",
      bn: "অভিযোগ নিবন্ধন",
    ml: "অভিযোগ নিবন্ধন",
    },
    complaint_status: {
      en: "Complaint Status",
      hi: "शिकायत की स्थिति",
      ta: "புகாரின் நிலை",
      kn: "ದೂರಿನ ಸ್ಥಿತಿ",
      mr: "तक्रारीची स्थिती",
      te: "ఫిర్యాదు స్థితి",
      bn: "অভিযোগের স্থিতি",
    ml: "অভিযোগের স্থিতি",
    },
    speak_support: {
      en: "Speak to Support",
      hi: "सहायता से बात करें",
      ta: "வாடிக்கையாளர் சேவை",
      kn: "ಬೆಂಬಲದೊಂದಿಗೆ ಮಾತನಾಡಿ",
      mr: "सपोर्ट टीमशी बोला",
      te: "మద్దతుతో మాట్లాడండి",
      bn: "সহায়তার সাথে কথা বলুন",
    ml: "সহায়তার সাথে কথা বলুন",
    },
    change_lang: {
      en: "Change Language",
      hi: "भाषा बदलें",
      ta: "மொழியை மாற்றவும்",
      kn: "ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ",
      mr: "भाषा बदला",
      te: "భాషను మార్చండి",
      bn: "ভাষা পরিবর্তন করুন",
    ml: "ভাষা পরিবর্তন করুন",
    }
  };

  const descriptions: Record<string, Record<Lang, string>> = {
    view_products: {
      en: "Browse our product catalog",
      hi: "हमारा उत्पाद कैटलॉग",
      ta: "தயாரிப்பு அட்டவணை",
      kn: "ಉತ್ಪನ್ನ ಕ್ಯಾಟಲಾಗ್",
      mr: "उत्पादन कॅटलॉग",
      te: "ఉత్పత్తి కేటలాగ్",
      bn: "প্রোডাক্ট ক্যাটালগ",
    ml: "প্রোডাক্ট ক্যাটালগ",
    },
    complaint_reg: {
      en: "Register a new complaint",
      hi: "नई शिकायत दर्ज करें",
      ta: "புதிய புகாரைப் பதிவு செய்யவும்",
      kn: "ಹೊಸ ದೂರನ್ನು ನೋಂದಾಯಿಸಿ",
      mr: "नवीन तक्रार नोंदवा",
      te: "కొత్త ఫిర్యాదును నమోదు చేయండి",
      bn: "নতুন অভিযোগ নথিভুক্ত করুন",
    ml: "নতুন অভিযোগ নথিভুক্ত করুন",
    },
    complaint_status: {
      en: "Check existing ticket status",
      hi: "मौजूदा टिकट जांचें",
      ta: "தற்போதைய புகாரின் நிலையைச் சரிபார்க்கவும்",
      kn: "ಅಸ್ತಿತ್ವದಲ್ಲಿರುವ ದೂರಿನ ಸ್ಥಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ",
      mr: "सद्य तिकीट स्थिती तपासा",
      te: "ప్రస్తుత ఫిర్యాదు స్థితిని తనిఖీ చేయండి",
      bn: "বিদ্যমান টিকিট স্থিতি পরীক্ষা করুন",
    ml: "বিদ্যমান টিকিট স্থিতি পরীক্ষা করুন",
    },
    speak_support: {
      en: "Connect with our support team",
      hi: "सहायता टीम से जुड़ें",
      ta: "எங்களது ஆதரவுக் குழுவைத் தொடர்பு கொள்ளவும்",
      kn: "ನಮ್ಮ ಬೆಂಬಲ ತಂಡದೊಂದಿಗೆ ಸಂಪರ್ಕ ಸಾಧಿಸಿ",
      mr: "आमच्या सपोर्ट टीमशी संपर्क साधा",
      te: "మా మద్దతు బృందంతో కనెక్ట్ అవ్వండి",
      bn: "আমাদের সহায়তা দলের সাথে সংযোগ করুন",
    ml: "আমাদের সহায়তা দলের সাথে সংযোগ করুন",
    },
    change_lang: {
      en: "Change your preferred language",
      hi: "अपनी भाषा बदलें",
      ta: "விரும்பிய மொழியைத் தேர்ந்தெடுக்கவும்",
      kn: "ನಿಮ್ಮ ಆದ್ಯತೆಯ ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ",
      mr: "आपली पसंतीची भाषा बदला",
      te: "మీ ప్రాధాన్యత భాషను మార్చండి",
      bn: "আপনার পছন্দের ভাষা পরিবর্তন করুন",
    ml: "আপনার পছন্দের ভাষা পরিবর্তন করুন",
    }
  };

  return {
    buttonText: lang === "hi" ? "विकल्प देखें 📋" : (
      lang === "ta" ? "விருப்பங்கள் 📋" : (
        lang === "kn" ? "ಆಯ್ಕೆಗಳನ್ನು ನೋಡಿ 📋" : (
          lang === "mr" ? "पर्याय पहा 📋" : (
            lang === "te" ? "ఎంపికలను చూడండి 📋" : (
              lang === "bn" ? "বিকল্পগুলি দেখুন 📋" : "View Options 📋"
            )
          )
        )
      )
    ),
    rows: [
      { id: "1", title: titles.view_products[lang] || titles.view_products.en, description: descriptions.view_products[lang] || descriptions.view_products.en },
      { id: "2", title: titles.complaint_reg[lang] || titles.complaint_reg.en, description: descriptions.complaint_reg[lang] || descriptions.complaint_reg.en },
      ...(options?.hasTickets ? [{ id: "3", title: titles.complaint_status[lang] || titles.complaint_status.en, description: descriptions.complaint_status[lang] || descriptions.complaint_status.en }] : []),
      { id: "4", title: titles.speak_support[lang] || titles.speak_support.en, description: descriptions.speak_support[lang] || descriptions.speak_support.en },
      { id: "5", title: titles.change_lang[lang] || titles.change_lang.en, description: descriptions.change_lang[lang] || descriptions.change_lang.en },
    ],
  };
}

export async function getContextualMainMenuList(phoneNumber: string, lang: Lang, isEngineer?: boolean): Promise<ReplyList | undefined> {
  if (isEngineer) {
    return undefined; // Service engineers interact via direct AI chat & troubleshooting without customer menu buttons
  }
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  const ticketCount = await prisma.ticket.count({
    where: {
      OR: [
        { phoneNumber: { contains: last10 } },
        { phoneNumber: phoneNumber }
      ]
    }
  });
  return getMainMenuList(lang, { hasTickets: ticketCount > 0 });
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
export async function handleMessage(phoneNumber: string, message: string, messageId?: string) {
  const text = message.trim();
  const upper = text.toUpperCase();

  const session = await getOrCreateSession(phoneNumber);
  if (session.isBotPaused) {
    return makeReply("");
  }

  let meta: SessionMeta = (session.metadata as SessionMeta) ?? {};

  // Auto-detect if user is registered in User table (especially Engineers) if meta.role / meta.isEngineer is unpopulated
  if (!meta.role && !meta.isEngineer) {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber: { contains: last10 } },
          { whatsappNumber: phoneNumber },
          { whatsappNumber: "91" + last10 },
          { whatsappNumber: "+91" + last10 },
        ],
      },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (dbUser) {
      const isEng = ["service_engineer", "service", "service_manager", "assistant_service_manager", "admin", "super_admin", "engineer"].includes(dbUser.role.toLowerCase());
      const displayName = [dbUser.firstName, dbUser.lastName].filter(Boolean).join(" ").trim() || (isEng ? "Service Engineer" : "Customer");
      meta = {
        ...meta,
        role: dbUser.role,
        isEngineer: isEng,
        regCustomerId: dbUser.id,
        regName: displayName,
        customerName: displayName,
        hasSkippedRegistration: isEng ? true : meta.hasSkippedRegistration,
      };
      const nextState = (session.state === "REGISTER_PROMPT" || session.state === "REGISTER_SERIAL") && isEng ? "MAIN_MENU" : session.state;
      await updateSession(session.id, nextState, meta);
    }
  }

  const lang: Lang = (meta.language ?? "en") as Lang;

  // ── Groq conversational agent (feature-flagged) ─────────────────────────
  // Preserves feedback FSM and falls back to legacy menus on agent errors /
  // when agent returns null (e.g. Book service → serial/complaint FSM).
  const inFeedback =
    session.state === "FEEDBACK_RATING" || session.state === "FEEDBACK_SATISFIED";
  const inLegacyTransactional =
    session.state === "VIEW_PRODUCTS" ||
    session.state === "VIEW_PRODUCT_CATEGORY" ||
    session.state === "VIEW_PRODUCT_DETAIL" ||

    session.state === "COMPLAINT_ASK_SERIAL" ||
    session.state === "MACHINE_CONFIRM" ||
    session.state === "COMPLAINT_CATEGORY" ||
    session.state === "COMPLAINT_PRODUCT" ||
    session.state === "COMPLAINT_SUBCATEGORY" ||
    session.state === "COMPLAINT_DESCRIBE" ||
    session.state === "TROUBLESHOOT_STEP" ||
    session.state === "TROUBLESHOOT_DONE_OPTIONS" ||
    session.state === "ASK_VIDEO_TUTORIAL" ||
    session.state === "VIDEO_HELPED" ||
    session.state === "ANOTHER_COMPLAINT_PROMPT" ||
    session.state === "ASK_BOOK_SERVICE" ||
    session.state === "COMPLAINT_MANUAL_NAME" ||
    session.state === "COMPLAINT_MANUAL_PINCODE" ||
    session.state === "COMPLAINT_MANUAL_PINCODE_CONFIRM" ||
    session.state === "END_CUSTOMER_ADDRESS" ||
    session.state === "PASSTEST_CUSTOMER_NAME" ||
    session.state === "PASSTEST_PINCODE" ||
    session.state === "PASSTEST_PINCODE_CONFIRM" ||
    session.state === "CHECK_STATUS" ||
    session.state === "CHANGE_LANGUAGE" ||
    session.state === "ASK_PHONE" ||
    session.state === "REGISTER_MACHINE_COUNT" ||
    session.state === "REGISTER_SERIAL" ||
    session.state === "REGISTER_NAME" ||
    session.state === "REGISTER_PINCODE" ||
    session.state === "REGISTER_GMAP";

  // Interactive button IDs bypass Groq so the FSM processes them directly.
  const fsmButtonIds = new Set([
    "1", "2", "3", "4", "5",
    "REGISTER", "SKIP", "CANCEL", "SELECT_LANG", "MENU", "MAIN MENU", "YES", "NO",
    "COUNT_1", "COUNT_MULTI",
    "LANG_EN", "LANG_HI", "LANG_TA", "LANG_ML", "LANG_KN", "LANG_MR", "LANG_TE", "LANG_BN",
    "BOOK_SERVICE", "TALK_AGENT", "SPEAK TO SUPPORT",
    "VIEW_PRODUCTS", "VIEW_TICKETS", "VIEW_ORDERS",
    "COMPLAINT_REG", "COMPLAINT_STATUS", "SPEAK_SUPPORT", "CHANGE_LANG",
    "TROUBLESHOOT_RESOLVED", "TROUBLESHOOT_UNRESOLVED", "RESOLVED", "UNRESOLVED",
    "CONFIRM_MACHINE_YES", "CONFIRM_MACHINE_NO"
  ]);
  if (upper === "REGISTER" && session.state !== "REGISTER_PROMPT") {
    await updateSession(session.id, "REGISTER_MACHINE_COUNT", { language: meta.language });
    return makeReply(
      t("REGISTER_MACHINE_COUNT_PROMPT", lang),
      [
        { id: "COUNT_1", title: t("COUNT_ONE_BUTTON", lang) },
        { id: "COUNT_MULTI", title: t("COUNT_MULTI_BUTTON", lang) },
        getCancelButton(lang),
        getMenuButton(lang),
      ]
    );
  }
  const isRegisterComplaintIntent =
    upper.includes("REGISTER COMPLAINT") ||
    upper.includes("REGISTER A COMPLAINT") ||
    upper.includes("BOOK COMPLAINT") ||
    upper.includes("NEW COMPLAINT") ||
    upper.includes("REGISTER TICKET") ||
    upper.includes("COMPLAINT REGISTER") ||
    upper.includes("COMPLAINT REGISTRATION") ||
    upper.includes("COMPLAINT REG") ||
    upper === "COMPLAINT" ||
    upper === "COMPLAINTS" ||
    upper === "COMPLAINT_REG" ||
    upper === "BOOK_SERVICE" ||
    upper.includes("പരാതി") ||
    upper.includes("शिकायत") ||
    upper.includes("புகார்") ||
    upper.includes("ದೂರು") ||
    upper.includes("ఫిర్యాదు");

  if (isRegisterComplaintIntent) {
    const rawComplaint = meta.complaint || meta.lastIssueQuery || meta.videoSearchQuery;
    const hasValidIssue = Boolean(rawComplaint && !isGreetingOrSmallTalk(rawComplaint) && isTechnicalIssueQuery(rawComplaint));

    if (hasValidIssue && rawComplaint) {
      return startComplaintRegistration(session.id, phoneNumber, meta, lang, rawComplaint.trim());
    }

    await updateSession(session.id, "COMPLAINT_DESCRIBE", meta);
    return makeReply(
      `📝 *Please describe the issue you are facing with your machine:*\n\n` +
      `You can type the symptoms (e.g. _Vibro not working, T2 error, Rate chart not taking, Reading variation_) or send a voice note.`,
      [getMenuButton(lang)]
    );
  }

  const isChangeMachineIntent =
    upper === "CHANGE_SERIAL" ||
    upper === "DIFFERENT_MACHINE" ||
    upper.includes("DIFFERENT MACHINE") ||
    upper.includes("DIFFERENT SERIAL") ||
    upper.includes("CHANGE MACHINE") ||
    upper.includes("CHANGE SERIAL") ||
    upper.includes("ANOTHER MACHINE") ||
    upper.includes("OTHER MACHINE");

  if (isChangeMachineIntent) {
    const clearedMeta: SessionMeta = {
      ...meta,
      regSerialNumber: undefined,
      regMachineData: undefined,
      serialNumber: undefined,
      machineData: undefined,
      tsSerialPath: false,
    };
    await updateSession(session.id, "COMPLAINT_ASK_SERIAL", clearedMeta);
    return makeReply(
      `🔧 *Enter Machine Serial Number:*\n\nPlease enter the serial number of the machine you are registering a complaint for.`,
      [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]
    );
  }

  const isCheckTicketStatusIntent =
    upper.includes("CHECK TICKET") ||
    upper.includes("CHECK STATUS") ||
    upper.includes("TICKET STATUS") ||
    upper.includes("COMPLAINT STATUS") ||
    upper.includes("MY TICKET") ||
    upper.includes("MY COMPLAINT") ||
    upper === "CHECK_STATUS" ||
    upper === "TICKET_STATUS" ||
    upper === "CHECK_TICKET_STATUS";

  if (isCheckTicketStatusIntent) {
    return showTicketStatus(session.id, phoneNumber, meta);
  }

  if (upper.startsWith("VIEW_TICKET_")) {
    const ticketId = text.replace(/^VIEW_TICKET_/i, "").trim();
    return handleTicketSelection(session.id, phoneNumber, meta, ticketId);
  }

  if (upper.startsWith("ACTION_CLOSE_TICKET") || upper === "CLOSE_TICKET") {
    const ticketId = text.replace(/^ACTION_CLOSE_TICKET_?/i, "").trim() || meta.selectedTicketId || meta.targetCloseTicketId;
    return startTicketCloseFlow(session.id, phoneNumber, meta, lang, ticketId);
  }

  const isCloseTicketIntent =
    upper.includes("CLOSE TICKET") ||
    upper.includes("CLOSE COMPLAINT") ||
    upper.includes("CANCEL TICKET") ||
    upper.includes("CANCEL COMPLAINT") ||
    upper.includes("CLOSE MY TICKET") ||
    upper.includes("CLOSE MY COMPLAINT") ||
    upper === "CLOSE_TICKET" ||
    upper === "CLOSE_COMPLAINT";

  if (isCloseTicketIntent) {
    return startTicketCloseFlow(session.id, phoneNumber, meta, lang);
  }

  // Explicit global intent matching for Talk to Support / Customer Care
  const isSupportIntent =
    upper === "SPEAK_SUPPORT" ||
    upper === "TALK_AGENT" ||
    upper === "TALK_TO_SUPPORT" ||
    upper === "SPEAK_TO_SUPPORT" ||
    upper === "SUPPORT" ||
    (upper === "4" && session.state === "MAIN_MENU") ||
    upper.includes("SPEAK TO SUPPORT") ||
    upper.includes("TALK TO SUPPORT") ||
    upper.includes("TALK TO AGENT") ||
    upper.includes("TALK TO HUMAN") ||
    upper.includes("CONNECT TO SUPPORT") ||
    upper.includes("CONNECT SUPPORT") ||
    upper.includes("CUSTOMER SUPPORT") ||
    upper.includes("CUSTOMER CARE") ||
    upper.includes("HUMAN AGENT") ||
    upper.includes("SPEAK WITH SUPPORT") ||
    upper.includes("NEED SUPPORT") ||
    upper.includes("സപ്പോർട്ട്") ||
    upper.includes("സഹായം") ||
    upper.includes("सपोर्ट") ||
    upper.includes("कस्टमर केयर");

  if (isSupportIntent && session.state !== "FEEDBACK_RATING" && session.state !== "FEEDBACK_SATISFIED") {
    return handleCustomerSupportRequest(session.id, phoneNumber, meta, lang);
  }

  // Product browsing buttons and VIEW_PRODUCTS always bypass state locks and go directly to product handlers
  const isProductNavButton =
    upper === "VIEW_PRODUCTS" ||
    upper === "PRODUCTS" ||
    upper.startsWith("CAT_") ||
    upper.startsWith("PROD_") ||
    upper === "BACK_CATEGORIES" ||
    upper === "BACK_MAIN";

  if (isProductNavButton) {
    return routeState(session, phoneNumber, text, meta);
  }

  if (fsmButtonIds.has(upper) && !inLegacyTransactional) {
    // If the button corresponds to troubleshooting results, update metadata only if it is a valid technical issue
    if (upper === "TROUBLESHOOT_RESOLVED" || upper === "TROUBLESHOOT_UNRESOLVED") {
      if (meta.lastIssueQuery && !isGreetingOrSmallTalk(meta.lastIssueQuery) && isTechnicalIssueQuery(meta.lastIssueQuery)) {
        await updateSession(session.id, session.state, {
          ...meta,
          complaint: meta.lastIssueQuery,
        }).catch(() => {});
      }
    }
    return routeState(session, phoneNumber, text, meta);
  }

  if (isGlobalRestartCommand(upper)) {
    if (session.state === "FEEDBACK_RATING" || session.state === "FEEDBACK_SATISFIED") {
      return routeState(session, phoneNumber, text, meta);
    }
    if (session.state === "CHANGE_LANGUAGE") {
      return routeState(session, phoneNumber, text, meta);
    }
    return startGreeting(phoneNumber);
  }

  if (isGlobalBackCommand(upper) || isGlobalBackCommand(text)) {
    if (
      session.state !== "GREETING" &&
      session.state !== "ASK_PHONE" &&
      session.state !== "FEEDBACK_RATING" &&
      session.state !== "FEEDBACK_SATISFIED" &&
      session.state !== "CHANGE_LANGUAGE" &&
      session.state !== "REGISTER_PROMPT" &&
      session.state !== "REGISTER_SERIAL" &&
      session.state !== "REGISTER_NAME" &&
      session.state !== "REGISTER_PINCODE" &&
      session.state !== "REGISTER_GMAP"
    ) {
      return handleGlobalBack(session, phoneNumber, meta);
    }
  }

  if (upper === "BYE" || upper === "CLOSE") {
    await updateSession(session.id, "COMPLETED", {});
    return makeReply(t("SESSION_CLOSED", lang));
  }

  return routeState(session, phoneNumber, text, meta);
}

// ── Global Back Handler ──────────────────────────────────────────────────
async function handleGlobalBack(
  session: { id: string; state: string },
  phoneNumber: string,
  meta: SessionMeta,
) {
  const lang: Lang = (meta.language ?? "en") as Lang;

  switch (session.state) {
    case "MACHINE_CONFIRM": {
      const updatedMeta: SessionMeta = { ...meta, serialNumber: undefined, machineData: null, tsSerialPath: false };
      await updateSession(session.id, "COMPLAINT_ASK_SERIAL", updatedMeta);
      return makeReply(t("SERIAL_PROMPT", lang), [getSkipButton(lang), getMenuButton(lang)]);
    }

    case "COMPLAINT_CATEGORY":
    case "COMPLAINT_PRODUCT":
    case "COMPLAINT_SUBCATEGORY":
    case "COMPLAINT_DESCRIBE": {
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(
        `📝 *Please describe the issue you are facing with your machine:*\n\n` +
        `Example: _LED blinking, not heating, display not working, T2 error_`,
        [getMenuButton(lang)]
      );
    }

    case "TROUBLESHOOT_STEP":
    case "TROUBLESHOOT_DONE_OPTIONS":
    case "ASK_VIDEO_TUTORIAL":
    case "VIDEO_HELPED":
    case "ASK_BOOK_SERVICE": {
      const productName = meta.selectedProduct || meta.machineData?.m_model;
      const listRows = await fetchComplaintListRows(lang, productName, meta.complaintSubcategory, meta.productCategory);
      const hasSubCategories = listRows.some(r => r.id.startsWith("SUBCAT_"));
      const nextState = hasSubCategories && !meta.complaintSubcategory ? "COMPLAINT_SUBCATEGORY" : "COMPLAINT_DESCRIBE";
      const clearedMeta: SessionMeta = { ...meta, complaint: undefined, tsSteps: undefined, tsCurrentStep: undefined };
      await updateSession(session.id, nextState, clearedMeta);
      return makeReply(
        t("DESCRIBE_COMPLAINT", lang),
        undefined,
        listRows.length > 0 ? { buttonText: hasSubCategories ? (lang === "hi" ? "श्रेणी चुनें 📝" : "Select Category 📝") : (lang === "hi" ? "शिकायत चुनें 📝" : "Select Complaint 📝"), rows: listRows } : undefined
      );
    }

    case "COMPLAINT_MANUAL_NAME":
    case "PASSTEST_CUSTOMER_NAME": {
      await updateSession(session.id, "ASK_BOOK_SERVICE", meta);
      return makeReply(
        t("ASK_BOOK_SERVICE", lang),
        [getBookServiceButton(lang), getBackButton(lang), getMenuButton(lang)]
      );
    }

    case "COMPLAINT_MANUAL_PINCODE": {
      await updateSession(session.id, "COMPLAINT_MANUAL_NAME", meta);
      return makeReply(t("ENTER_NAME", lang), [getBackButton(lang), getMenuButton(lang)]);
    }

    case "PASSTEST_PINCODE": {
      await updateSession(session.id, "PASSTEST_CUSTOMER_NAME", meta);
      return makeReply(t("ENTER_NAME", lang), [getBackButton(lang), getMenuButton(lang)]);
    }

    case "COMPLAINT_MANUAL_PINCODE_CONFIRM": {
      await updateSession(session.id, "COMPLAINT_MANUAL_PINCODE", meta);
      return makeReply(t("ENTER_PINCODE", lang), [getBackButton(lang), getMenuButton(lang)]);
    }

    case "PASSTEST_PINCODE_CONFIRM": {
      await updateSession(session.id, "PASSTEST_PINCODE", meta);
      return makeReply(t("ENTER_PINCODE", lang), [getBackButton(lang), getMenuButton(lang)]);
    }

    case "END_CUSTOMER_ADDRESS": {
      if (meta.manualPincode) {
        return showManualPincodeConfirm(session.id, meta);
      }
      await updateSession(session.id, "COMPLAINT_MANUAL_PINCODE", meta);
      return makeReply(t("ENTER_PINCODE", lang), [getBackButton(lang), getMenuButton(lang)]);
    }

    case "ANOTHER_COMPLAINT_PROMPT": {
      return showProductSelection(session.id, meta);
    }

    default: {
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
    }
  }
}

// ── Greeting / Registration check ─────────────────────────────────────────
export async function startGreeting(phoneNumber: string) {
  const session = await getOrCreateSession(phoneNumber);
  let existingMeta: SessionMeta = (session.metadata as SessionMeta) ?? {};
  const lang: Lang = (existingMeta.language ?? "en") as Lang;

  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  const registeredUser = await prisma.user.findFirst({
    where: {
      OR: [
        { whatsappNumber: { contains: last10 } },
        { whatsappNumber: phoneNumber },
        { whatsappNumber: "91" + last10 },
        { whatsappNumber: "+91" + last10 },
      ],
    },
    select: { id: true, firstName: true, lastName: true, role: true, whatsappNumber: true, pincodeId: true },
  });

  // ONLY treat as registered if active User record exists in DB
  if (registeredUser) {
    const isEng = ["service_engineer", "service", "service_manager", "assistant_service_manager", "admin", "super_admin", "engineer"].includes(registeredUser.role.toLowerCase());
    const displayName = [registeredUser.firstName, registeredUser.lastName].filter(Boolean).join(" ").trim() || "Customer";

    const savedProfile = await loadSavedEndCustomer(phoneNumber).catch(() => null);

    const meta: SessionMeta = {
      ...existingMeta,
      customerName: displayName,
      customerPhone: phoneNumber,
      regCustomerId: registeredUser.id,
      regName: displayName,
      manualName: displayName,
      manualPincode: savedProfile?.manualPincode || existingMeta.manualPincode,
      regPincode: savedProfile?.manualPincode || existingMeta.regPincode,
      manualPlace: savedProfile?.manualPlace || existingMeta.manualPlace,
      regPlace: savedProfile?.manualPlace || existingMeta.regPlace,
      manualDistrict: savedProfile?.manualDistrict || existingMeta.manualDistrict,
      regDistrict: savedProfile?.manualDistrict || existingMeta.regDistrict,
      manualState: savedProfile?.manualState || existingMeta.manualState,
      regState: savedProfile?.manualState || existingMeta.regState,
      manualAddress: savedProfile?.manualAddress || existingMeta.manualAddress,
      regAddress: savedProfile?.manualAddress || existingMeta.regAddress,
      language: existingMeta.language,
      role: registeredUser.role || "customer",
      isEngineer: isEng,
      hasSkippedRegistration: true,
    };
    await updateSession(session.id, "MAIN_MENU", meta);

    if (isEng) {
      return makeReply(
        `🔧 *Welcome, Service Engineer ${displayName}!*\n\nHow can I assist you today? You can search machine troubleshooting steps, query training manuals, view R&D videos, or assist customers.`
      );
    }

    // Show welcome back directly with Main Menu
    return makeReply(
      t("WELCOME_BACK", lang, { name: displayName }) +
      "\n\n" +
      t("MAIN_MENU_MSG", lang),
      undefined,
      await getContextualMainMenuList(phoneNumber, lang)
    );
  }

  // Unregistered user / Deleted customer: Clear stale meta and prompt for registration
  await updateSession(session.id, "REGISTER_PROMPT", { language: existingMeta.language });
  return makeReply(
    t("REGISTER_WELCOME", lang),
    [
      { id: "REGISTER", title: t("REGISTER_BUTTON", lang) },
      getSkipButton(lang),
      getLangSelectButton(lang),
    ]
  );
}

// ── State router ──────────────────────────────────────────────────────────
async function routeState(
  session: { id: string; state: string },
  phoneNumber: string,
  text: string,
  meta: SessionMeta,
): Promise<any> {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "TROUBLESHOOT_RESOLVED" || upper === "RESOLVED" || upper === "SOLVED" || upper === "PROBLEM FIXED") {
    await updateSession(session.id, "MAIN_MENU", meta);
    return makeReply(
      `🎉 *Glad we could help!* Your issue has been marked as resolved.\n\nPlease select an option from the menu below if you need anything else:`,
      undefined,
      await getContextualMainMenuList(phoneNumber, lang)
    );
  }

  if (upper === "TROUBLESHOOT_UNRESOLVED" || upper === "UNRESOLVED" || upper.includes("NOT SOLVED") || upper.includes("NOT FIXED") || upper.includes("UNCATALOGED")) {
    const rawComplaint = meta.complaint || meta.lastIssueQuery || meta.videoSearchQuery;
    const hasValidIssue = Boolean(rawComplaint && !isGreetingOrSmallTalk(rawComplaint) && isTechnicalIssueQuery(rawComplaint));

    if (hasValidIssue && rawComplaint) {
      return startComplaintRegistration(session.id, phoneNumber, meta, lang, rawComplaint.trim());
    }

    return startComplaintRegistration(session.id, phoneNumber, meta, lang);
  }

  if (upper === "CANCEL" || upper === "MENU" || upper === "MAIN MENU" || upper === "MAIN_MENU" || upper === "BACK_MAIN") {
    await updateSession(session.id, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
  }

  if (upper.startsWith("PROD_")) {
    return handleProductDetail(session.id, phoneNumber, meta, text);
  }
  if (upper.startsWith("CAT_")) {
    return handleProductCategory(session.id, phoneNumber, meta, text);
  }
  if (upper === "VIEW_PRODUCTS" || upper === "PRODUCTS") {
    return handleProductBrowse(session.id, phoneNumber, meta, text);
  }
  if (upper === "BACK_CATEGORIES") {
    return handleProductBrowse(session.id, phoneNumber, meta, text);
  }

  switch (session.state) {
    case "AGENT_CHAT":
      if (upper === "BOOK_SERVICE" || upper.includes("BOOK SERVICE") || upper.includes("COMPLAINT") || upper === "2") {
        return startComplaintRegistration(session.id, phoneNumber, meta, lang);
      }
      await updateSession(session.id, "MAIN_MENU", meta);
      return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));

    case "GREETING":
    case "COMPLETED":
      return startGreeting(phoneNumber);

    case "ASK_PHONE":
      return handleAskPhone(session.id, phoneNumber, text, meta);

    case "MAIN_MENU":
      return handleMainMenu(session.id, phoneNumber, meta, text);

    case "VIEW_PRODUCTS":
      return handleProductBrowse(session.id, phoneNumber, meta, text);

    case "VIEW_PRODUCT_CATEGORY":
      return handleProductCategory(session.id, phoneNumber, meta, text);

    case "VIEW_PRODUCT_DETAIL":
      return handleProductDetail(session.id, phoneNumber, meta, text);

    case "COMPLAINT_ASK_SERIAL":
      return handleComplaintAskSerial(session.id, phoneNumber, meta, text);

    case "CHANGE_LANGUAGE":
      return handleChangeLanguage(session.id, meta, text);

    case "REGISTER_PROMPT":
      return handleRegisterPrompt(session.id, phoneNumber, meta, text);

    case "REGISTER_MACHINE_COUNT":
      return handleRegisterMachineCount(session.id, phoneNumber, meta, text);

    case "REGISTER_SERIAL":
      return handleRegisterSerial(session.id, phoneNumber, meta, text);

    case "REGISTER_NAME":
      return handleRegisterName(session.id, phoneNumber, meta, text);

    case "REGISTER_PINCODE":
      return handleRegisterPincode(session.id, phoneNumber, meta, text);

    case "REGISTER_GMAP":
      return handleRegisterGmap(session.id, phoneNumber, meta, text);

    case "FEEDBACK_RATING":
      return handleFeedbackRating(session.id, meta, text);

    case "MACHINE_CONFIRM":
      return handleMachineConfirm(session.id, phoneNumber, meta, text);

    case "COMPLAINT_CATEGORY":
      return handleComplaintCategory(session.id, meta, text);

    case "COMPLAINT_PRODUCT":
      return handleComplaintProduct(session.id, phoneNumber, meta, text);

    case "COMPLAINT_SUBCATEGORY":
      return handleComplaintSubcategory(session.id, phoneNumber, meta, text);

    case "COMPLAINT_DESCRIBE":
      return handleComplaintDescribe(session.id, phoneNumber, meta, text);

    case "TROUBLESHOOT_STEP":
      return handleTroubleshootStep(session.id, phoneNumber, meta, text);

    case "TROUBLESHOOT_DONE_OPTIONS":
      return handleTroubleshootDoneOptions(session.id, phoneNumber, meta, text);

    case "ASK_VIDEO_TUTORIAL":
      return handleAskVideoTutorial(session.id, phoneNumber, meta, text);

    case "VIDEO_HELPED":
      return handleVideoHelped(session.id, phoneNumber, meta, text);

    case "ANOTHER_COMPLAINT_PROMPT":
      return handleAnotherComplaintPrompt(session.id, phoneNumber, meta, text);

    case "ASK_BOOK_SERVICE":
      return handleAskBookService(session.id, phoneNumber, meta, text);

    case "COMPLAINT_MANUAL_NAME":
      return handleComplaintManualName(session.id, meta, text);

    case "COMPLAINT_MANUAL_PINCODE":
      return handleComplaintManualPincode(session.id, phoneNumber, meta, text);

    case "COMPLAINT_MANUAL_PINCODE_CONFIRM":
      return handleComplaintManualPincodeConfirm(session.id, phoneNumber, meta, text);

    case "END_CUSTOMER_ADDRESS":
      return handleEndCustomerAddress(session.id, phoneNumber, meta, text);

    case "PASSTEST_CUSTOMER_NAME":
      return handlePasstestCustomerName(session.id, phoneNumber, meta, text);

    case "PASSTEST_PINCODE":
      return handlePasstestPincode(session.id, meta, text);

    case "PASSTEST_PINCODE_CONFIRM":
      return handlePasstestPincodeConfirm(session.id, phoneNumber, meta, text);

    case "SELECT_REGISTERED_MACHINE":
      return handleSelectRegisteredMachine(session.id, phoneNumber, meta, text);

    case "CONFIRM_REGISTER_TICKET":
      return handleConfirmRegisterTicket(session.id, phoneNumber, meta, text);

    case "AWAIT_COMPLAINT_MEDIA":
      return handleAwaitComplaintMedia(session.id, phoneNumber, meta, text);

    case "CLOSE_TICKET_SELECT":
    case "CLOSE_TICKET_REASON":
      return handleCloseTicketReason(session.id, phoneNumber, meta, text);

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
    select: { machineCustomer: true, phoneNumber: true, issueDescription: true },
  });

  if (ticket) {
    let name = ticket.machineCustomer;
    if (!name && ticket.issueDescription) {
      const nameMatch =
        ticket.issueDescription.match(/End customer:\s*([^,]+)/i) ??
        ticket.issueDescription.match(/Service contact:\s*([^,]+)/i);
      if (nameMatch && nameMatch[1]) {
        name = nameMatch[1].trim();
      }
    }
    const displayName = name || "Customer";
    const meta: SessionMeta = { customerName: displayName, customerPhone: digits, language: prevMeta.language };
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("PHONE_FOUND", lang, { name: displayName }) + "\n\n" + t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }

  // New user registration flow: accept the number and proceed to main menu
  const newMeta: SessionMeta = { customerPhone: digits, language: prevMeta.language };
  await updateSession(sessionId, "MAIN_MENU", newMeta);
  return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
}

// ── Registration FSM ─────────────────────────────────────────────────────
// States: REGISTER_PROMPT → REGISTER_SERIAL → REGISTER_NAME → REGISTER_ADDRESS
//         → REGISTER_PINCODE → REGISTER_GMAP → (save User) → MAIN_MENU

async function handleRegisterPrompt(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "MENU" || upper === "MAIN MENU") {
    const menuMeta: SessionMeta = { ...meta, customerPhone: meta.customerPhone || phoneNumber };
    await updateSession(sessionId, "MAIN_MENU", menuMeta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }

  // Language selection from the welcome screen — save and re-show welcome in chosen language
  const langMap: Record<string, Lang> = {
    LANG_EN: "en", EN: "en", ENGLISH: "en",
    LANG_HI: "hi", HINDI: "hi",
    LANG_TA: "ta", TAMIL: "ta",
    LANG_ML: "ml", ML: "ml", MALAYALAM: "ml",
    LANG_KN: "kn", KANNADA: "kn",
    LANG_MR: "mr", MARATHI: "mr",
    LANG_TE: "te", TELUGU: "te",
    LANG_BN: "bn", BENGALI: "bn",
  };
  if (upper === "SELECT_LANG" || upper === "CHANGE_LANGUAGE" || upper === "CHANGE_LANG") {
    return makeReply(t("LANG_SELECT", lang), undefined, getLangList(lang));
  }
  if (langMap[upper]) {
    const newLang = langMap[upper];
    const newMeta: SessionMeta = { ...meta, language: newLang };
    await updateSession(sessionId, "REGISTER_PROMPT", newMeta);
    return makeReply(
      t("REGISTER_WELCOME", newLang),
      [
        { id: "REGISTER", title: t("REGISTER_BUTTON", newLang) },
        getSkipButton(newLang),
        getLangSelectButton(newLang),
      ]
    );
  }

  if (upper === "REGISTER" || upper === "REGISTER_MACHINE") {
    await updateSession(sessionId, "REGISTER_MACHINE_COUNT", meta);
    return makeReply(
      t("REGISTER_MACHINE_COUNT_PROMPT", lang),
      [
        { id: "COUNT_1", title: t("COUNT_ONE_BUTTON", lang) },
        { id: "COUNT_MULTI", title: t("COUNT_MULTI_BUTTON", lang) },
        getCancelButton(lang),
        getMenuButton(lang),
      ]
    );
  }

  if (upper === "SKIP" || upper === "SKIP_REGISTER" || upper === "0") {
    const skipMeta: SessionMeta = { ...meta, customerPhone: phoneNumber, hasSkippedRegistration: true };
    await updateSession(sessionId, "MAIN_MENU", skipMeta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
  }

  // Free-text query / digit input from unregistered user -> Auto-skip registration and route to main menu / Groq assistant
  const autoMeta: SessionMeta = { ...meta, hasSkippedRegistration: true };
  await updateSession(sessionId, "MAIN_MENU", autoMeta);
  return handleMainMenu(sessionId, phoneNumber, autoMeta, text);
}

async function handleRegisterMachineCount(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "MENU" || upper === "MAIN MENU") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }
  if (upper === "CANCEL" || upper.includes("CANCEL")) {
    return cancelRegistrationToMainMenu(sessionId, meta, lang);
  }
  if (isGlobalBackCommand(upper) || isGlobalBackCommand(text)) {
    await updateSession(sessionId, "REGISTER_PROMPT", meta);
    return makeReply(
      t("REGISTER_WELCOME", lang),
      [
        { id: "REGISTER", title: t("REGISTER_BUTTON", lang) },
        getSkipButton(lang),
        getLangSelectButton(lang),
      ]
    );
  }

  const isOne =
    upper === "COUNT_1" ||
    upper === "1" ||
    upper === "ONE" ||
    upper.includes("1 MACHINE") ||
    upper.includes("ONE MACHINE") ||
    upper.includes("1 മെഷീൻ") ||
    upper.includes("1 मशीन");

  const isMulti =
    upper === "COUNT_MULTI" ||
    upper.includes("MORE") ||
    upper.includes("MULTI") ||
    upper.includes("ഒന്നിൽ കൂടുതൽ") ||
    upper.includes("1 से अधिक") ||
    /^[2-9]\d*$/.test(upper) ||
    upper.includes("2") ||
    upper.includes("3") ||
    upper.includes("TWO") ||
    upper.includes("THREE");

  if (isOne) {
    const updatedMeta: SessionMeta = { ...meta, machineCount: "1" };
    await updateSession(sessionId, "REGISTER_SERIAL", updatedMeta);
    return makeReply(t("REGISTER_SERIAL_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  if (isMulti || upper === "SKIP" || upper === "0") {
    const parsedNum = upper.match(/\d+/)?.[0] || "multiple";
    const updatedMeta: SessionMeta = {
      ...meta,
      machineCount: parsedNum,
      regSerialNumber: undefined,
      regMachineData: undefined,
    };
    await updateSession(sessionId, "REGISTER_NAME", updatedMeta);
    return makeReply(t("REGISTER_NAME_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  const num = parseInt(upper, 10);
  if (!isNaN(num)) {
    if (num === 1) {
      const updatedMeta: SessionMeta = { ...meta, machineCount: "1" };
      await updateSession(sessionId, "REGISTER_SERIAL", updatedMeta);
      return makeReply(t("REGISTER_SERIAL_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
    } else {
      const updatedMeta: SessionMeta = { ...meta, machineCount: String(num), regSerialNumber: undefined };
      await updateSession(sessionId, "REGISTER_NAME", updatedMeta);
      return makeReply(t("REGISTER_NAME_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
    }
  }

  return makeReply(
    t("REGISTER_MACHINE_COUNT_PROMPT", lang),
    [
      { id: "COUNT_1", title: t("COUNT_ONE_BUTTON", lang) },
      { id: "COUNT_MULTI", title: t("COUNT_MULTI_BUTTON", lang) },
      getCancelButton(lang),
      getMenuButton(lang),
    ]
  );
}

// ── Machine Details Message Formatter ────────────────────────────────────
function formatMachineDetailsCard(machine: PasstestMachine, options?: { isConfirmation?: boolean; dealerName?: string; lang?: Lang }): string {
  const isConfirmation = options?.isConfirmation ?? false;
  const dealerName = options?.dealerName;
  const parts: string[] = [];

  parts.push(`✅ *Machine Found!*\n`);
  if (machine.m_model) {
    parts.push(`🔧 *Model:* ${machine.m_model}`);
  }
  if (machine.serial_no) {
    parts.push(`🔢 *Serial:* ${machine.serial_no}`);
  }
  if (dealerName) {
    parts.push(`🏪 *Dealer:* ${dealerName}`);
  }
  if (machine.customer && machine.customer !== dealerName) {
    parts.push(`🏢 *Registered To:* ${machine.customer}`);
  }
  const addressParts = [machine.Address1, machine.Address2]
    .map(s => s?.trim().replace(/,+$/, ""))
    .filter(Boolean);
  if (addressParts.length > 0) {
    parts.push(`📍 *Location:* ${addressParts.join(", ")}`);
  }
  if (machine.invoice_no) {
    parts.push(`🧾 *Invoice No:* ${machine.invoice_no}`);
  }
  if (machine.invoice_date) {
    const cleanDate = machine.invoice_date.split(" ")[0].replace(/T.*/, "");
    if (cleanDate && cleanDate !== "0000-00-00") {
      parts.push(`📅 *Invoice Date:* ${cleanDate}`);
    }
  }
  if (machine.warranty_months && machine.warranty_months > 0) {
    parts.push(`🛡️ *Warranty:* ${machine.warranty_months} Months`);
  }

  if (isConfirmation) {
    parts.push(`\nAre these machine details correct?`);
  } else {
    parts.push(`\nWe will use these details for your registration.\n\nPress *Continue* to proceed.`);
  }

  return parts.join("\n");
}

async function handleRegisterSerial(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "MENU" || upper === "MAIN MENU") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }
  // CANCEL exits registration entirely → Main Menu
  if (upper === "CANCEL" || upper.includes("CANCEL")) {
    return cancelRegistrationToMainMenu(sessionId, meta, lang);
  }
  if (isGlobalBackCommand(upper) || isGlobalBackCommand(text)) {
    await updateSession(sessionId, "REGISTER_MACHINE_COUNT", meta);
    return makeReply(
      t("REGISTER_MACHINE_COUNT_PROMPT", lang),
      [
        { id: "COUNT_1", title: t("COUNT_ONE_BUTTON", lang) },
        { id: "COUNT_MULTI", title: t("COUNT_MULTI_BUTTON", lang) },
        getCancelButton(lang),
        getMenuButton(lang),
      ]
    );
  }
  // SKIP advances to next step (Name prompt)
  if (upper === "SKIP" || upper === "SKIP_REGISTER" || upper === "0") {
    const updatedMeta: SessionMeta = { ...meta, regSerialNumber: "N/A" };
    await updateSession(sessionId, "REGISTER_NAME", updatedMeta);
    return makeReply(t("REGISTER_NAME_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  const serial = text.trim();
  if (text.includes(" ") || text.length > 25 || /[\?\!\.\,]/g.test(text)) {
    return runGroqCompanyAssistant(phoneNumber, text, meta, { activeFsmState: "REGISTER_SERIAL" });
  }

  if (serial.length < 3) {
    return makeReply(t("SERIAL_INVALID", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  try {
    const machine = await fetchMachineBySerial(serial);
    if (machine) {
      let isDealerMachine = false;
      let dealerDisplayName = "";
      if (machine.customer) {
        const dealerId = await resolveDealerFromPasstestCustomer(machine.customer);
        if (dealerId) {
          isDealerMachine = true;
          // Fetch the dealer's display name to show in the message
          const dealerUser = await prisma.user.findUnique({
            where: { id: dealerId },
            select: { firstName: true, lastName: true },
          });
          if (dealerUser) {
            dealerDisplayName = [dealerUser.firstName, dealerUser.lastName].filter(Boolean).join(" ");
          }
        }
      }

      const updatedMeta: SessionMeta = {
        ...meta,
        regSerialNumber: machine.serial_no,
        regMachineData: machine,
        regIsDealerMachine: isDealerMachine,
        regPlace: machine.Address1 || undefined,
      };
      await updateSession(sessionId, "REGISTER_NAME", updatedMeta);

      const detailsMsg = formatMachineDetailsCard(machine, {
        dealerName: dealerDisplayName || (isDealerMachine ? machine.customer : undefined),
        isConfirmation: false,
        lang,
      });

      return makeReply(
        detailsMsg,
        [{ id: "CONTINUE", title: t("REGISTER_CONTINUE_BUTTON", lang) }, getBackButton(lang)]
      );
    }
  } catch (err) {
    console.error("[register] Machine lookup failed:", err);
  }

  await updateSession(sessionId, "REGISTER_SERIAL", meta);
  return makeReply(
    t("REGISTER_SERIAL_NOT_FOUND", lang, { serial }),
    [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]
  );
}

async function handleRegisterName(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "MENU" || upper === "MAIN MENU") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }
  if (isGlobalBackCommand(upper) || isGlobalBackCommand(text)) {
    if (meta.machineCount === "1" || meta.machineCount === 1) {
      await updateSession(sessionId, "REGISTER_SERIAL", meta);
      return makeReply(t("REGISTER_SERIAL_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
    }
    await updateSession(sessionId, "REGISTER_MACHINE_COUNT", meta);
    return makeReply(
      t("REGISTER_MACHINE_COUNT_PROMPT", lang),
      [
        { id: "COUNT_1", title: t("COUNT_ONE_BUTTON", lang) },
        { id: "COUNT_MULTI", title: t("COUNT_MULTI_BUTTON", lang) },
        getCancelButton(lang),
        getMenuButton(lang),
      ]
    );
  }
  // CANCEL exits registration entirely → Main Menu
  if (upper === "CANCEL" || upper.includes("CANCEL")) {
    return cancelRegistrationToMainMenu(sessionId, meta, lang);
  }
  // SKIP advances to next step (Pincode prompt)
  if (upper === "SKIP" || upper.includes("SKIP") || upper === "0") {
    const updatedMeta: SessionMeta = { ...meta, regName: meta.regName || "Customer" };
    await updateSession(sessionId, "REGISTER_PINCODE", updatedMeta);
    return makeReply(t("REGISTER_PINCODE_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  const name = text.trim();
  if (name.length < 2 || upper === "CONTINUE") {
    return makeReply(t("REGISTER_INVALID_NAME", lang), [getSkipButton(lang), getBackButton(lang), getMenuButton(lang)]);
  }

  const updatedMeta: SessionMeta = { ...meta, regName: name };
  await updateSession(sessionId, "REGISTER_PINCODE", updatedMeta);
  return makeReply(t("REGISTER_PINCODE_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
}

// REGISTER_ADDRESS step removed — flow is now Serial → Name → Pincode → Location

async function handleRegisterPincode(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "MENU" || upper === "MAIN MENU") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }
  if (isGlobalBackCommand(upper) || isGlobalBackCommand(text)) {
    await updateSession(sessionId, "REGISTER_NAME", meta);
    return makeReply(t("REGISTER_NAME_PROMPT", lang), [getSkipButton(lang), getBackButton(lang), getMenuButton(lang)]);
  }
  // CANCEL exits registration entirely → Main Menu
  if (upper === "CANCEL" || upper.includes("CANCEL")) {
    return cancelRegistrationToMainMenu(sessionId, meta, lang);
  }
  // SKIP advances to next step (Google Maps location prompt)
  if (upper === "SKIP" || upper.includes("SKIP") || upper === "0") {
    await updateSession(sessionId, "REGISTER_GMAP", meta);
    return makeReply(t("REGISTER_GMAP_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  // Check if customer sent a location attachment or Google Maps link at pincode step
  const loc = extractGmapLink(text);
  if (loc && loc.mapLink) {
    const updatedMeta: SessionMeta = {
      ...meta,
      regGmapLink: loc.mapLink,
      regAddress: loc.addressText || meta.regAddress,
    };
    await updateSession(sessionId, "REGISTER_PINCODE", updatedMeta);
    return makeReply(
      `📍 Location received!\n${loc.mapLink}\n\n` + t("REGISTER_PINCODE_PROMPT", lang),
      [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]
    );
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length !== 6) {
    return makeReply(t("INVALID_PINCODE", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  let place: string | undefined;
  let district: string | undefined;
  let state: string | undefined;
  try {
    const resolved = await fetchPlaceFromPincode(digits);
    if (resolved) {
      place = resolved.place;
      district = resolved.district;
      state = resolved.state;
    }
  } catch {
    // proceed without resolved place
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    regPincode: digits,
    regPlace: place,
    regDistrict: district,
    regState: state,
  };

  if (updatedMeta.regGmapLink) {
    await saveRegisteredCustomer(sessionId, phoneNumber, updatedMeta);
    return showMainMenuAfterRegistration(sessionId, phoneNumber, updatedMeta, lang);
  }

  await updateSession(sessionId, "REGISTER_GMAP", updatedMeta);
  return makeReply(t("REGISTER_GMAP_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
}

async function handleRegisterGmap(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "MENU" || upper === "MAIN MENU") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, getMainMenuList(lang));
  }
  if (isGlobalBackCommand(upper) || isGlobalBackCommand(text)) {
    await updateSession(sessionId, "REGISTER_PINCODE", meta);
    return makeReply(t("REGISTER_PINCODE_PROMPT", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }
  // CANCEL exits registration entirely → Main Menu
  if (upper === "CANCEL" || upper.includes("CANCEL")) {
    return cancelRegistrationToMainMenu(sessionId, meta, lang);
  }
  // SKIP finishes registration and presents Main Menu
  if (upper === "SKIP" || upper.includes("SKIP") || upper === "0") {
    await saveRegisteredCustomer(sessionId, phoneNumber, meta);
    return showMainMenuAfterRegistration(sessionId, phoneNumber, meta, lang);
  }

  // Handle 6-digit pincode sent at location step
  const digits = text.replace(/\D/g, "");
  if (digits.length === 6 && !extractGmapLink(text)) {
    let place: string | undefined;
    let district: string | undefined;
    let state: string | undefined;
    try {
      const resolved = await fetchPlaceFromPincode(digits);
      if (resolved) {
        place = resolved.place;
        district = resolved.district;
        state = resolved.state;
      }
    } catch {}
    const updatedMeta: SessionMeta = {
      ...meta,
      regPincode: digits,
      regPlace: place || meta.regPlace,
      regDistrict: district || meta.regDistrict,
      regState: state || meta.regState,
    };
    await saveRegisteredCustomer(sessionId, phoneNumber, updatedMeta);
    return showMainMenuAfterRegistration(sessionId, phoneNumber, updatedMeta, lang);
  }

  const loc = extractGmapLink(text);
  if (!loc || !loc.mapLink) {
    return makeReply(t("REGISTER_INVALID_GMAP", lang), [getSkipButton(lang), getCancelButton(lang), getMenuButton(lang)]);
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    regGmapLink: loc.mapLink,
    regAddress: loc.addressText || meta.regAddress || meta.manualAddress,
  };

  await saveRegisteredCustomer(sessionId, phoneNumber, updatedMeta);
  return showMainMenuAfterRegistration(sessionId, phoneNumber, updatedMeta, lang);
}

async function saveRegisteredCustomer(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const name = meta.regName || `Customer ${phoneNumber.slice(-4)}`;
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  let customerId = meta.regCustomerId;

  if (customerId) {
    // Update existing user
    await prisma.user.update({
      where: { id: customerId },
      data: {
        firstName: name,
        whatsappNumber: phoneNumber,
      },
    });
  } else {
    // Check if user already exists with matching whatsappNumber or email
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber: phoneNumber },
          { whatsappNumber: { contains: last10 } },
          { email: `cust_${cleanPhone}@poornasree.ai` },
        ],
      },
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          firstName: name,
          whatsappNumber: phoneNumber,
        },
      });
      customerId = existingUser.id;
    } else {
      const newUser = await prisma.user.create({
        data: {
          email: `cust_${cleanPhone}@poornasree.ai`,
          passwordHash: "NO_PASSWORD_WHATSAPP_CUSTOMER",
          firstName: name,
          whatsappNumber: phoneNumber,
          role: "customer",
        },
      });
      customerId = newUser.id;
    }
    meta.regCustomerId = customerId;
  }

  meta.regName = name;

  const mergedMeta = sanitizeForJson({
    ...((meta as any) ?? {}),
    regName: name,
    regCustomerId: customerId,
    regSerialNumber: meta.regSerialNumber ?? null,
    regMachineData: meta.regMachineData ?? null,
    regPincode: meta.regPincode ?? null,
    regPlace: meta.regPlace ?? null,
    regDistrict: meta.regDistrict ?? null,
    regState: meta.regState ?? null,
    regGmapLink: meta.regGmapLink ?? null,
    regAddress: meta.regAddress || meta.manualAddress || null,
    regIsDealerMachine: meta.regIsDealerMachine ?? false,
  });

  // Mark session as registered AND persist all registration metadata
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      isRegistered: true,
      metadata: mergedMeta as object,
    },
  });
}

const SUPPORT_NOTIFIED_MSGS: Record<string, string> = {
  en: "👋 *Our Customer Support Team has been notified!*\n\nHey there, a live support executive has been alerted and will join this chat shortly. Please feel free to type your query or issue below.\n\n_If you wish to return to the AI assistant at any time, tap [🏠 Main Menu]._ ",
  ml: "👋 *ഞങ്ങളുടെ കസ്റ്റമർ സപ്പോർട്ട് ടീമിനെ അറിയിച്ചിട്ടുണ്ട്!*\n\nഒരു സപ്പോർട്ട് എക്സിക്യൂട്ടീവ് ഉടൻ തന്നെ നിങ്ങളുമായി സംസാരിക്കും. ദയവായി നിങ്ങളുടെ സംശയം താഴെ ടൈപ്പ് ചെയ്യുക.\n\n_AI അസിസ്റ്റന്റിലേക്ക് തിരികെ പോകാൻ [🏠 Main Menu] ക്ലിക്ക് ചെയ്യുക._",
  hi: "👋 *हमारी कस्टमर सपोर्ट टीम को सूचित कर दिया गया है!*\n\nएक सपोर्ट एजेंट जल्द ही आपसे जुड़ेगा। कृपया अपनी समस्या नीचे लिखें.\n\n_AI सहायक पर वापस जाने के लिए [🏠 Main Menu] पर टैप करें।_",
  ta: "👋 *எங்கள் வாடிக்கையாளர் ஆதரவு குழுவிற்கு தெரிவிக்கப்பட்டுள்ளது!*\n\nநேரலை ஆதரவு நிர்வாகி விரைவில் உங்களுடன் இணைவார். தயவுசெய்து உங்கள் கேள்வியை கீழே பதிவிடவும்.\n\n_AI உதவியாளரிடம் திரும்ப [🏠 Main Menu] ஐத் தட்டவும்._",
  kn: "👋 *ನಮ್ಮ ಗ್ರಾಹಕ ಬೆಂಬಲ ತಂಡಕ್ಕೆ ತಿಳಿಸಲಾಗಿದೆ!*\n\nಲೈವ್ ಬೆಂಬಲ ಪ್ರತಿನಿಧಿ ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮೊಂದಿಗೆ ಸಂಪರ್ಕ ಸಾಧಿಸುತ್ತಾರೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ.\n\n_AI ಸಹಾಯಕಕ್ಕೆ ಹಿಂತಿರುಗಲು [🏠 Main Menu] ಒತ್ತಿರಿ._",
  te: "👋 *మా కస్టమర్ సపోర్ట్ బృందానికి తెలియజేయబడింది!*\n\nలైవ్ సపోర్ట్ ఎగ్జిక్యూటివ్ త్వరలో మిమ్మల్ని సంప్రదిస్తారు. దయచేసి మీ సందేహాన్ని క్రింద టైప్ చేయండి.\n\n_AI అసిస్టెంట్‌కి తిరిగి వెళ్లడానికి [🏠 Main Menu] నొక్కండి._",
  mr: "👋 *आमच्या ग्राहक सपोर्ट टीमला सूचित केले आहे!*\n\nएक सपोर्ट प्रतिनिधी लवकरच आपल्याशी बोलेल. कृपया आपला प्रश्न खाली टाइप करा.\n\n_AI सहाय्यकाकडे परत जाण्यासाठी [🏠 Main Menu] टॅप करा._",
  bn: "👋 *আমাদের কাস্টমার সাপোর্ট টিমকে জানানো হয়েছে!*\n\nএকজন সাপোর্ট প্রতিনিধি শীঘ্রই আপনার সাথে কথা বলবেন। অনুগ্রহ করে নিচে আপনার সমস্যা লিখুন।\n\n_AI সহকারীতে ফিরতে [🏠 Main Menu] চাপুন।_",
};

export async function handleCustomerSupportRequest(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  lang: Lang = "en"
) {
  const customerName = meta.customerName || meta.regName || "Customer";
  const customerPhone = meta.customerPhone || phoneNumber;
  const timeStr = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // 1. Fetch support phone from settings (e.g. 9400916291)
  const support = await getWhatsAppSupportSettings();
  const rawSupportPhone = support.supportPhone || "+91 94009 61291";
  const normalizedSupportPhone =
    WhatsAppService.normalizeWhatsappNumber(rawSupportPhone) ||
    rawSupportPhone.replace(/\D/g, "");

  // 2. Pause bot for this customer and mark waiting status
  const updatedMeta: SessionMeta = {
    ...meta,
    isWaitingForSupport: true,
    supportRequestedAt: new Date().toISOString(),
  };

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      isBotPaused: true,
      state: "WAITING_FOR_SUPPORT",
      metadata: updatedMeta as object,
    },
  });

  // Start the 2-minute inactivity timer
  touchSupportActivity(phoneNumber);

  // 3. Send WhatsApp Alert to the configured Admin Support Phone
  const supportAlertMsg = `🚨 *Live Customer Support Request*\n\nHey Support Team, a customer is waiting for you on the support dashboard!\n\n👤 *Customer:* ${customerName}\n📱 *Phone:* ${customerPhone}\n⏰ *Time:* ${timeStr} IST\n\n👉 Please check your dashboard:\nhttps://ai.poornasreecloud.com/support-dashboard`;

  try {
    console.log(`[simulate] Dispatching WhatsApp support alert to ${normalizedSupportPhone}...`);
    // Attempt dedicated customer support template first, with utility fallback
    let templateSent = await WhatsAppService.sendTemplate(normalizedSupportPhone, {
      name: "customer_support_alert_v1",
      languageCode: "en",
      bodyParameters: [
        customerName.replace(/[\n\r\t]/g, " ").trim().slice(0, 100),
        customerPhone.replace(/[\n\r\t]/g, " ").trim().slice(0, 50),
        timeStr,
      ],
    });

    if (!templateSent) {
      templateSent = await WhatsAppService.sendTemplate(normalizedSupportPhone, {
        name: "engineer_ticket_assigned",
        languageCode: "en",
        bodyParameters: [
          "Support Team",
          "Live Chat Request",
          customerName.replace(/[\n\r\t]/g, " ").trim().slice(0, 100),
          customerPhone.replace(/[\n\r\t]/g, " ").trim().slice(0, 50),
          "Support Dashboard",
          "Customer is waiting for support. Please check dashboard.",
        ],
      });
    }

    if (!templateSent) {
      console.log(`[simulate] Template not sent, falling back to direct session message...`);
      await WhatsAppService.sendMessage(normalizedSupportPhone, supportAlertMsg);
    } else {
      console.log(`[simulate] Template alert successfully dispatched to ${normalizedSupportPhone}`);
      // Also send rich details if conversational window allows
      await WhatsAppService.sendMessage(normalizedSupportPhone, supportAlertMsg).catch(() => {});
    }
  } catch (err) {
    console.error(`[simulate] Failed to send support WhatsApp alert to ${normalizedSupportPhone}:`, err);
  }

  // 4. Save system audit log in SimulateMessage
  const systemMsg = await prisma.simulateMessage.create({
    data: {
      phoneNumber,
      role: "system",
      content: `Customer requested live support. Admin support team alerted at ${normalizedSupportPhone}`,
    },
  });

  // 5. Broadcast real-time Socket.IO events to customer support dashboard
  if (io) {
    io.to("customer_support").emit("support-chat:customer-waiting", {
      phoneNumber,
      name: customerName,
      requestedAt: new Date().toISOString(),
    });
    io.to("customer_support").emit("support-chat:bot-status", {
      phoneNumber,
      isBotPaused: true,
      reason: "customer_requested_support",
    });
    io.to("customer_support").emit("support-chat:message", {
      phoneNumber,
      message: systemMsg,
    });
  }

  // 6. Return friendly localized reply to customer with Main Menu button
  const replyText = SUPPORT_NOTIFIED_MSGS[lang] || SUPPORT_NOTIFIED_MSGS.en;
  return makeReply(replyText, [getMenuButton(lang)]);
}

async function showMainMenuAfterRegistration(sessionId: string, phoneNumber: string, meta: SessionMeta, lang: Lang) {
  const name = meta.regName || "Customer";
  await updateSession(sessionId, "MAIN_MENU", meta);
  return makeReply(
    t("REGISTER_SUCCESS", lang, { name }) +
    "\n\n" +
    t("MAIN_MENU_MSG", lang),
    undefined,
    await getContextualMainMenuList(phoneNumber, lang)
  );
}
async function handleMainMenu(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const choice = text.trim();
  const upperChoice = choice.toUpperCase();

  if (choice === "1" || upperChoice === "VIEW_PRODUCTS" || upperChoice === "PRODUCTS") {
    return showProducts(sessionId, meta);
  }
  if (
    choice === "2" ||
    upperChoice === "COMPLAINT_REG" ||
    upperChoice === "COMPLAINT" ||
    upperChoice === "COMPLAINTS" ||
    upperChoice.includes("COMPLAINT REG") ||
    upperChoice.includes("COMPLAINT REGISTER") ||
    upperChoice.includes("COMPLAINT REGISTRATION") ||
    upperChoice.includes("REGISTER COMPLAINT") ||
    upperChoice.includes("BOOK COMPLAINT") ||
    upperChoice.includes("പരാതി") ||
    upperChoice.includes("शिकायत") ||
    upperChoice.includes("புகார்") ||
    upperChoice.includes("ದೂರು")
  ) {
    const rawComplaint = meta.complaint || meta.lastIssueQuery || meta.videoSearchQuery;
    const hasValidIssue = Boolean(rawComplaint && !isGreetingOrSmallTalk(rawComplaint) && isTechnicalIssueQuery(rawComplaint));

    if (hasValidIssue && rawComplaint) {
      return startComplaintRegistration(sessionId, phoneNumber, meta, lang, rawComplaint.trim());
    }

    const clearedMeta: SessionMeta = { ...meta, complaint: undefined, lastIssueQuery: undefined };
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", clearedMeta);
    return makeReply(
      `📝 *Please describe the issue you are facing with your machine:*\n\n` +
      `You can type the symptoms (e.g. _Vibro not working, T2 error, Rate chart not taking, Reading variation_) or send a voice note.`,
      [getMenuButton(lang)]
    );
  }
  if (choice === "3" || upperChoice === "COMPLAINT_STATUS" || upperChoice === "TICKETS" || upperChoice.includes("STATUS")) {
    return showTicketStatus(sessionId, phoneNumber, meta);
  }
  if (choice === "4" || upperChoice === "SPEAK_SUPPORT" || upperChoice === "SUPPORT" || upperChoice === "TALK_AGENT" || upperChoice === "TALK_TO_SUPPORT" || upperChoice.includes("SPEAK TO SUPPORT") || upperChoice.includes("TALK TO SUPPORT")) {
    return handleCustomerSupportRequest(sessionId, phoneNumber, meta, lang);
  }
  if (choice === "5" || upperChoice === "CHANGE_LANG" || upperChoice === "CHANGE_LANGUAGE" || upperChoice === "LANGUAGE") {
    await updateSession(sessionId, "CHANGE_LANGUAGE", meta);
    return makeReply(t("LANG_SELECT", lang), undefined, getLangList(lang));
  }
  if (upperChoice === "COMPLAINT_REG" || upperChoice === "COMPLAINT_REGISTER" || upperChoice === "BOOK_SERVICE") {
    return startComplaintRegistration(sessionId, phoneNumber, meta, lang);
  }
  if (upperChoice === "COMPACT_ADAPTER") {
    return runGroqCompanyAssistant(phoneNumber, "Compact Adapter output voltage troubleshooting", meta, { sessionId });
  }
  if (upperChoice === "CHARGER_ADAPTER") {
    return runGroqCompanyAssistant(phoneNumber, "Charger Adapter output voltage troubleshooting", meta, { sessionId });
  }

  // Free-text query (not matching strict menu digits/buttons) -> Groq Conversational Assistant using DB company & product knowledge
  return runGroqCompanyAssistant(phoneNumber, text, meta, { sessionId });
}

// ── In-Memory Caches with 60s TTL for High Chatbot Throughput ─────────────
let cachedActiveProducts: { data: any[]; expiresAt: number } | null = null;
async function getCachedActiveProducts() {
  const now = Date.now();
  if (cachedActiveProducts && cachedActiveProducts.expiresAt > now) {
    return cachedActiveProducts.data;
  }
  const data = await prisma.product.findMany({ where: { isActive: true } });
  cachedActiveProducts = { data, expiresAt: now + 60_000 };
  return data;
}

let cachedDocIssues: { data: any[]; expiresAt: number } | null = null;
async function getCachedDocumentIssues() {
  const now = Date.now();
  if (cachedDocIssues && cachedDocIssues.expiresAt > now) {
    return cachedDocIssues.data;
  }
  const data = await prisma.documentIssue.findMany({
    where: { isActive: true },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  });
  cachedDocIssues = { data, expiresAt: now + 60_000 };
  return data;
}

let cachedDocChunks: { key: string; data: any[]; expiresAt: number } | null = null;
async function getCachedDocumentChunks(targetDocTypes: string[]) {
  const now = Date.now();
  const key = targetDocTypes.slice().sort().join(",");
  if (cachedDocChunks && cachedDocChunks.key === key && cachedDocChunks.expiresAt > now) {
    return cachedDocChunks.data;
  }
  const data = await prisma.documentChunk.findMany({
    where: { document: { documentType: { in: targetDocTypes } } },
    include: { document: true },
  });
  cachedDocChunks = { key, data, expiresAt: now + 60_000 };
  return data;
}

/** Groq LLM Assistant that ingests dynamic DB company, owner & product catalog settings, remembers conversation history & FSM state, and answers like a humanoid assistant */
export async function runGroqCompanyAssistant(
  phoneNumber: string,
  query: string,
  meta: SessionMeta,
  options: { activeFsmState?: string; sessionId?: string } = {}
): Promise<any> {
  const settings = await getWhatsAppSupportSettings();
  const botName = settings.botName?.trim() || "Hari";
  const lang: Lang = (meta.language ?? "en") as Lang;
  const activeState = options.activeFsmState || meta.previousFsmState || "MAIN_MENU";

  // Verify registered customer against User table (strict source of truth)
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  const registeredUser = await prisma.user.findFirst({
    where: {
      OR: [
        { whatsappNumber: { contains: last10 } },
        { whatsappNumber: phoneNumber },
        { whatsappNumber: "91" + last10 },
        { whatsappNumber: "+91" + last10 },
      ],
    },
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  const verifiedCustomerName = registeredUser
    ? [registeredUser.firstName, registeredUser.lastName].filter(Boolean).join(" ").trim()
    : "";

  const namePrompt = verifiedCustomerName
    ? `The customer's name is ${verifiedCustomerName}. Address them by their name naturally when appropriate.`
    : "The customer is not registered. Do NOT use any assumed customer name.";
  const lowerQuery = query.toLowerCase();

  // Retrieve or create active conversation session ID
  let targetSessionId = options.sessionId;
  if (!targetSessionId) {
    try {
      const activeSess = await prisma.conversationSession.findFirst({
        where: { phoneNumber },
        orderBy: { updatedAt: "desc" },
      });
      targetSessionId = activeSess?.id;
    } catch {
      /* ignore */
    }
  }

  // Save user's query into session metadata ONLY if it is a real technical machine issue (not greetings/small talk)
  const isMetaOrLanguageCmd =
    query.toUpperCase().includes("MALAYALAM") ||
    query.toUpperCase().includes("HINDI") ||
    query.toUpperCase().includes("ENGLISH") ||
    query.toUpperCase().includes("TAMIL") ||
    query.toUpperCase().includes("TELUGU");

  if (
    targetSessionId &&
    query.length >= 2 &&
    !isMetaOrLanguageCmd &&
    !isGreetingOrSmallTalk(query) &&
    isTechnicalIssueQuery(query) &&
    !query.toUpperCase().startsWith("CONFIRM_") &&
    !query.toUpperCase().startsWith("TROUBLESHOOT_") &&
    !query.toUpperCase().startsWith("ATTACH_") &&
    !query.toUpperCase().startsWith("EDIT_") &&
    !query.toUpperCase().startsWith("REVIEW_")
  ) {
    meta.complaint = query.trim();
    meta.videoSearchQuery = query.trim();
    meta.lastIssueQuery = query.trim();
    await updateSession(targetSessionId, options.activeFsmState || "MAIN_MENU", meta).catch(() => {});
  }
  const inComplaintOrTroubleshootState =
    activeState === "COMPLAINT_DESCRIBE" ||
    activeState === "COMPLAINT_ASK_SERIAL" ||
    activeState === "TROUBLESHOOT_STEP" ||
    activeState.startsWith("COMPLAINT_") ||
    activeState.startsWith("TROUBLESHOOT_") ||
    options.activeFsmState === "COMPLAINT_DESCRIBE" ||
    options.activeFsmState === "COMPLAINT_ASK_SERIAL" ||
    options.activeFsmState === "TROUBLESHOOT_STEP" ||
    Boolean(options.activeFsmState?.startsWith("COMPLAINT_")) ||
    Boolean(options.activeFsmState?.startsWith("TROUBLESHOOT_"));

  if (targetSessionId && !inComplaintOrTroubleshootState) {
    try {
      const activeProducts = await getCachedActiveProducts();
      const cleanQ = lowerQuery.trim();

      const isIssueQuery =
        cleanQ.includes("not working") ||
        cleanQ.includes("not on") ||
        cleanQ.includes("issue") ||
        cleanQ.includes("error") ||
        cleanQ.includes("problem") ||
        cleanQ.includes("repair") ||
        cleanQ.includes("fault") ||
        cleanQ.includes("damage") ||
        cleanQ.includes("fail") ||
        cleanQ.includes("complaint") ||
        cleanQ.includes("blinking") ||
        cleanQ.includes("vibrating") ||
        cleanQ.includes("vibration") ||
        cleanQ.includes("noise") ||
        cleanQ.includes("leak") ||
        cleanQ.includes("variation") ||
        cleanQ.includes("help") ||
        cleanQ.includes("running") ||
        cleanQ.includes("showing") ||
        cleanQ.includes("shwoing") ||
        cleanQ.includes("stopped") ||
        cleanQ.includes("stuck") ||
        cleanQ.includes("slow") ||
        cleanQ.includes("sound") ||
        cleanQ.includes("off") ||
        cleanQ.includes("display") ||
        cleanQ.includes("light") ||
        cleanQ.includes("heat") ||
        cleanQ.includes("smell") ||
        cleanQ.includes("speed") ||
        cleanQ.includes("power") ||
        cleanQ.includes("switch") ||
        cleanQ.includes("കേടായി") ||
        cleanQ.includes("പരാതി");

      if (!isIssueQuery) {
        // 1. Check if user typed or clicked a specific product model name to view/browse
        const matchedProduct = activeProducts.find((p) => {
          const pNameLower = p.name.toLowerCase();
          if (cleanQ === pNameLower) return true;
          if (cleanQ === `show ${pNameLower}` || cleanQ === `about ${pNameLower}` || cleanQ === `${pNameLower} details` || cleanQ === `${pNameLower} price` || cleanQ === `${pNameLower} info` || cleanQ === `${pNameLower} catalog`) return true;
          if (pNameLower.includes("v3") && (cleanQ === "v3" || cleanQ === "eco v3" || cleanQ === "show v3" || cleanQ === "show eco v3")) return true;
          if (pNameLower.includes("vibro") && (cleanQ === "vibro" || cleanQ === "vibro stirrer" || cleanQ === "show vibro" || cleanQ === "about vibro" || cleanQ === "vibro details" || cleanQ === "vibro price" || cleanQ === "vibro catalog")) return true;
          if (pNameLower.includes("exd") && (cleanQ === "exd" || cleanQ === "show exd" || cleanQ === "about exd")) return true;
          if (pNameLower.includes("amcu") && (cleanQ === "amcu" || cleanQ === "show amcu" || cleanQ === "about amcu")) return true;
          if (pNameLower.includes("lite") && (cleanQ === "lite" || cleanQ === "lactosure lite" || cleanQ === "show lite")) return true;
          if (pNameLower.includes("s pro") && (cleanQ === "s pro" || cleanQ === "lactosure s pro" || cleanQ === "show s pro")) return true;
          if (pNameLower.includes("sd") && (cleanQ === "sd" || cleanQ === "lactosure sd" || cleanQ === "show sd")) return true;
          return false;
        });

        if (matchedProduct) {
          return handleProductDetail(targetSessionId, phoneNumber, meta, `PROD_${matchedProduct.id}`);
        }

        // 2. Check if user specified a category
        if (cleanQ === "lactosure" || cleanQ === "eco" || cleanQ === "eco series" || cleanQ === "show lactosure" || cleanQ === "lactosure products") {
          return handleProductCategory(targetSessionId, phoneNumber, meta, "CAT_LACTOSURE");
        }
        if (cleanQ === "lactogrand" || cleanQ === "grand" || cleanQ === "show lactogrand" || cleanQ === "lactogrand products") {
          return handleProductCategory(targetSessionId, phoneNumber, meta, "CAT_LACTOGRAND");
        }
      }

      // 3. General Product Catalog intent (English, Manglish & Malayalam Script)
      const isCatalogQuery =
        cleanQ === "products" ||
        cleanQ === "catalog" ||
        cleanQ === "view_products" ||
        cleanQ.includes("browse product") ||
        cleanQ.includes("show product") ||
        cleanQ.includes("product detail") ||
        cleanQ.includes("product list") ||
        cleanQ.includes("product info") ||
        cleanQ.includes("product kaanik") ||
        cleanQ.includes("product kanik") ||
        cleanQ.includes("product undo") ||
        cleanQ.includes("product ond") ||
        cleanQ.includes("product ethokke") ||
        cleanQ.includes("products ethokke") ||
        cleanQ.includes("products kanik") ||
        cleanQ.includes("products kaanik") ||
        cleanQ.includes("products undo") ||
        cleanQ.includes("kaanikamo") ||
        cleanQ.includes("kanikamo") ||
        cleanQ.includes("kaananam") ||
        cleanQ.includes("kaanenam") ||
        cleanQ.includes("nokkanam") ||
        cleanQ.includes("nokkamo") ||
        cleanQ.includes("products kaan") ||
        cleanQ.includes("product kaan") ||
        cleanQ.includes("മോഡലുകൾ") ||
        cleanQ.includes("ഉല്പന്നങ്ങൾ");

      if (isCatalogQuery) {
        return showProducts(targetSessionId, meta);
      }
    } catch (pErr) {
      console.error("[product-interceptor] Failed to intercept product query:", pErr);
    }
  }

  const isPhotoRequest =
    lowerQuery.includes("photo") ||
    lowerQuery.includes("picture") ||
    lowerQuery.includes("image") ||
    lowerQuery.includes("ഫോട്ടോ") ||
    lowerQuery.includes("പടം");

  if (isPhotoRequest) {
    try {
      const defaultPhotos = [
        { url: "https://poornasree.com/wp-content/uploads/2024/06/Social-Share-image.jpg", caption: "Poornasree Equipments Head Office & Facility" },
        { url: "https://poornasree.com/wp-content/uploads/2023/12/copmany.png", caption: "LactoSure Eco Milk Analyzer Product Line" },
        { url: "https://poornasree.com/wp-content/uploads/2024/03/Poornasree-png-300x135.png", caption: "Poornasree Brand Logo" },
        { url: "https://poornasree.com/wp-content/uploads/2024/02/certificate-of-compiance.png", caption: "ISO 9001:2015 Certificate of Compliance" }
      ];
      const parsed = settings.companyPhotos ? JSON.parse(settings.companyPhotos) : [];
      const photos = Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultPhotos;

      const photoList = photos.map((p: any) => `📷 *${p.caption}*\n${p.url}`).join("\n\n");
      return makeReply(
        `📸 *Poornasree Equipments Head Office & Facility Photos*\n\n${photoList}`,
        [{ id: "VIEW_PRODUCTS", title: "📦 Browse Products" }]
      );
    } catch {
      /* ignore */
    }
  }

  // ── Helper to Clean & Deduplicate Leaked Future Checks from Remarks ──────
  function sanitizeTroubleshootingChunks(content: string): string {
    if (!content) return "";
    const lines = content.split("\n");
    const checks: { title: string; actions: string[] }[] = [];
    let currentCheck: { title: string; actions: string[] } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\d+\.\s*check/i.test(trimmed) || /^check\s*\d*:/i.test(trimmed)) {
        currentCheck = { title: trimmed.toUpperCase(), actions: [] };
        checks.push(currentCheck);
      } else if (currentCheck && (trimmed.includes("Action") || trimmed.includes("->") || trimmed.includes("→"))) {
        currentCheck.actions.push(trimmed.toUpperCase());
      }
    }

    const cleanedLines: string[] = [];
    let currentCheckIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\d+\.\s*check/i.test(trimmed) || /^check\s*\d*:/i.test(trimmed)) {
        currentCheckIndex++;
        cleanedLines.push(line);
        continue;
      }

      // Only filter out remarks that strictly duplicate a future check title
      const isRemark = trimmed.includes("Remark:") || trimmed.includes("↳ Remark:");
      if (isRemark && checks.length > currentCheckIndex) {
        const futureChecks = checks.slice(currentCheckIndex);
        const isLeaked = futureChecks.some((fc) => {
          const words = fc.title.replace(/[^A-Z0-9]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
          return words.length > 0 && words.every((w) => line.toUpperCase().includes(w));
        });

        if (isLeaked && !line.includes("EG:") && !line.includes("ASCII") && !line.includes("CODE") && !line.includes("FAT") && !line.includes("WEIGHT") && !line.includes("RATE")) {
          continue;
        }
      }

      cleanedLines.push(line);
    }

    return cleanedLines.join("\n");
  }

  // ── Helper to Convert Text into Natural Sentence Casing ───────────
  function toSentenceCase(str: string): string {
    if (!str) return "";
    const preserveAcronyms = new Set([
      "T2", "USB", "GSM", "SIM", "LED", "ASCII", "L-PLUG", "AC", "DC", "PCB",
      "KG", "LTR", "SNF", "CLR", "FAT", "POT", "LCD", "ID", "ECO", "ECO-V", "V3", "V4"
    ]);

    const emojiNumbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
    let stepCounter = 0;

    const lines = str.split("\n");
    const resultLines: string[] = [];
    let prevNormalized = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const norm = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Deduplicate consecutive lines that say the exact same text
      if (norm.length > 5 && norm === prevNormalized) {
        continue;
      }

      // If line is empty or artificial Step header like "📍 *Step 1:*"
      if (/^📍\s*\*Step\s*\d+:?\*\s*$/i.test(line)) {
        continue;
      }

      // If line is "📍 *Step N:* If none of the above..."
      const fallbackStepMatch = line.match(/^📍\s*\*Step\s*\d+:?\*\s*(If none.+)$/i);
      if (fallbackStepMatch) {
        resultLines.push(`\n_${convertTextToSentenceCase(fallbackStepMatch[1].trim(), preserveAcronyms)}_`);
        continue;
      }

      // If line has Check tag like "🔍 *Check 1:* <Title>"
      const checkMatch = line.match(/^\s*🔍\s*\*Check\s*(\d+):?\*\s*(.*)$/i);
      if (checkMatch) {
        stepCounter++;
        const numEmoji = emojiNumbers[stepCounter - 1] || `${stepCounter}.`;
        const titleText = checkMatch[2].trim();
        const formattedTitle = convertTextToSentenceCase(titleText, preserveAcronyms);
        resultLines.push(`\n${numEmoji} *${formattedTitle}:*`);
        prevNormalized = norm;
        continue;
      }

      // If line has Action tag like "⚡ *Action 1:* <Content>"
      const actionMatch = line.match(/^\s*⚡\s*\*Action\s*\d*:?\*\s*(.*)$/i);
      if (actionMatch) {
        const actionContent = actionMatch[1].trim();
        if (actionContent) {
          const actionNorm = actionContent.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (actionNorm.length > 5 && (actionNorm === prevNormalized || prevNormalized.includes(actionNorm) || actionNorm.includes(prevNormalized))) {
            continue;
          }
          resultLines.push(`• ${convertTextToSentenceCase(actionContent, preserveAcronyms)}`);
          prevNormalized = actionNorm;
        }
        continue;
      }

      // If line is secondary Action tag with text
      const secondaryActionMatch = line.match(/^\s*⚡\s*\*Action\s*(?:[2-9]|\d{2,})\d*:?\*\s*(.+)$/i);
      if (secondaryActionMatch) {
        const actionContent = secondaryActionMatch[1].trim();
        const actionNorm = actionContent.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (actionNorm.length > 5 && (actionNorm === prevNormalized || prevNormalized.includes(actionNorm) || actionNorm.includes(prevNormalized))) {
          continue;
        }
        resultLines.push(`• ${convertTextToSentenceCase(actionContent, preserveAcronyms)}`);
        prevNormalized = actionNorm;
        continue;
      }

      const remarkMatch = line.match(/^(\s*↳\s*Remark:\s*)(.*)$/i);
      if (remarkMatch) {
        resultLines.push(`${remarkMatch[1]}${convertTextToSentenceCase(remarkMatch[2].trim(), preserveAcronyms)}`);
        prevNormalized = norm;
        continue;
      }

      const bulletMatch = line.match(/^(\s*•\s*(?:\d+\))?\s*)(.*)$/i);
      if (bulletMatch) {
        const bulletText = bulletMatch[2].trim();
        const bulletNorm = bulletText.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (bulletNorm.length > 5 && (bulletNorm === prevNormalized || prevNormalized.includes(bulletNorm) || bulletNorm.includes(prevNormalized))) {
          continue;
        }
        resultLines.push(`${bulletMatch[1]}${convertTextToSentenceCase(bulletText, preserveAcronyms)}`);
        prevNormalized = bulletNorm;
        continue;
      }

      resultLines.push(convertTextToSentenceCase(line, preserveAcronyms));
      prevNormalized = norm;
    }

    return resultLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function convertTextToSentenceCase(text: string, preserve: Set<string>): string {
    if (!text) return "";
    const letters = text.replace(/[^a-zA-Z]/g, "");
    if (!letters) return text;
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    if (upperCount / letters.length < 0.6) {
      return text;
    }
    const words = text.split(/\s+/);
    return words
      .map((w, idx) => {
        const cleanWord = w.replace(/[^a-zA-Z0-9\-]/g, "").toUpperCase();
        if (preserve.has(cleanWord)) return w;
        if (idx === 0) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }
        return w.toLowerCase();
      })
      .join(" ");
  }

  // ── Adapter Disambiguation Interceptor ───────────────────────────
  const isAdapterQuery = lowerQuery.includes("adapter") || lowerQuery.includes("അഡാപ്റ്റർ") || lowerQuery.includes("എഡാപ്റ്റർ");
  const specifiesCompact = lowerQuery.includes("compact") || lowerQuery.includes("കോംപാക്ട്");
  const specifiesCharger = lowerQuery.includes("charger") || lowerQuery.includes("ചാർജർ");

  if (isAdapterQuery && !specifiesCompact && !specifiesCharger) {
    return makeReply(
      `🔌 *Which adapter model are you using?*\n\nWe have two adapter models. Please select your adapter type below so I can give you the exact troubleshooting steps:`,
      [
        { id: "COMPACT_ADAPTER", title: "🔌 Compact Adapter" },
        { id: "CHARGER_ADAPTER", title: "⚡ Charger Adapter" },
      ]
    );
  }

  // Fetch recent conversation history from DB to enable true humanoid multi-turn memory
  let historyMessages: { role: "user" | "assistant"; content: string }[] = [];
  try {
    const pastMsgs = await prisma.simulateMessage.findMany({
      where: { phoneNumber },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const reversed = pastMsgs.reverse();
    historyMessages = reversed.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
  } catch (err) {
    console.error("[groq-company-assistant] Failed to fetch chat history:", err);
  }

  // Fetch trained document issues & chunks (CHATBOT_DATAS for customer, Engineers Training for service engineer)
  let matchedDocKnowledge = "";
  let hasExactDocMatch = false;
  try {
    const isServiceUser = (meta as any).isEngineer || (meta as any).role === "service_engineer" || (meta as any).role === "service";
    const targetDocTypes = isServiceUser ? ["service", "customer", "both"] : ["customer", "both"];

    // Normalize alphanumeric query (e.g. "t2error" -> "t2 error", "e1problem" -> "e1 problem")
    const cleanQ = query
      .toLowerCase()
      .replace(/([a-zA-Z]+[0-9]+)([a-zA-Z]+)/g, "$1 $2")
      .replace(/[^a-z0-9\s]/g, " ")
      .trim();

    const stopWords = new Set([
      "the", "and", "for", "this", "that", "with", "from", "you", "machine", "work", "help",
      "fault", "showing", "got", "get", "getting", "is", "in", "on",
      "at", "to", "a", "an", "my", "our", "please", "how", "what", "why", "me", "having", "not", "no"
    ]);
    const queryWords = cleanQ.split(/\s+/).filter((w) => w.length >= 2 && !stopWords.has(w));

    // 1. Check DocumentIssue templates first (exact official troubleshooting checklists)
    const allIssues = await getCachedDocumentIssues();

    let bestIssue: any = null;
    let bestIssueScore = 0;
    for (const issue of allIssues) {
      const text = (issue.title + " " + issue.problemType + " " + (issue.description || "")).toLowerCase();
      const issueTokens = text.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !stopWords.has(w));
      let score = 0;
      if (text.includes(cleanQ) && cleanQ.length >= 2) score += 15;
      for (const w of queryWords) {
        for (const it of issueTokens) {
          if (w === it) {
            score += (w.length >= 4 ? 4 : 3);
          } else if (it.includes(w) || w.includes(it)) {
            score += 2;
          } else if (w.length >= 4 && it.length >= 4) {
            // Levenshtein distance <= 2 for typos like "sampe" -> "sample"
            let dist = 0;
            const lenDiff = Math.abs(w.length - it.length);
            if (lenDiff <= 2) {
              let diffs = 0;
              const minLen = Math.min(w.length, it.length);
              for (let i = 0; i < minLen; i++) {
                if (w[i] !== it[i]) diffs++;
              }
              diffs += lenDiff;
              if (diffs <= 2) score += 2;
            }
          }
        }
      }
      if (score > bestIssueScore && score >= 2) {
        bestIssueScore = score;
        bestIssue = issue;
      }
    }

    // 1. Search DocumentChunk for rich knowledge with strict audience isolation
    const allChunks = await getCachedDocumentChunks(targetDocTypes);

    const allQueryWords = cleanQ.split(/\s+/).filter((w) => w.length >= 2);

    const scoredChunks = allChunks.map((chunk) => {
      const contentLower = chunk.content.toLowerCase();
      let score = 0;
      if (contentLower.includes(cleanQ)) score += 30;
      let matchedWords = 0;
      for (const w of allQueryWords) {
        if (contentLower.includes(w)) {
          matchedWords++;
          score += (w.length >= 4 ? 4 : 2);
        }
      }
      if (matchedWords === allQueryWords.length && allQueryWords.length > 0) score += 15;
      if (chunk.content.includes("Check") && (chunk.content.includes("Action") || chunk.content.includes("→") || chunk.content.includes("->"))) score += 6;
      if (chunk.content.includes("↳ Remark:") || chunk.content.includes("Remark")) score += 5;
      if (chunk.content.includes("•")) score += 5;
      return { chunk, score, length: chunk.content.length };
    }).filter((c) => c.score >= 4).sort((a, b) => b.score - a.score || b.length - a.length);

    const topMatches = scoredChunks.slice(0, 3);

    if (topMatches.length > 0) {
      hasExactDocMatch = true;
      matchedDocKnowledge = topMatches
        .map((m) => `[MATCHED OFFICIAL TROUBLESHOOTING DOCUMENT: ${m.chunk.document.title}]\n${sanitizeTroubleshootingChunks(m.chunk.content)}`)
        .join("\n\n");
    } else if (bestIssue && bestIssue.steps.length > 0) {
      hasExactDocMatch = true;
      const formattedSteps = bestIssue.steps
        .map((s: any) => `Step ${s.stepNumber}:\n${s.stepContent}`)
        .join("\n\n");
      matchedDocKnowledge = `[MATCHED OFFICIAL TROUBLESHOOTING TEMPLATE: ${bestIssue.title}]\n${sanitizeTroubleshootingChunks(formattedSteps)}`;
    }
  } catch (err) {
    console.error("[groq-company-assistant] Failed to load document troubleshooting chunks:", err);
  }

  const uncatalogedRule = !hasExactDocMatch
    ? `\n11. UNCATALOGED COMPLAINT RULE:
       - This customer issue/complaint is NOT covered in our official troubleshooting documents.
       - Politely inform the customer in 1 natural sentence in their exact language/script that their issue has been logged for technical review, and advise them to book a technician service visit.`
    : "";

  const systemPrompt = `You are ${botName}, a friendly, intelligent human customer support representative for Poornasree Equipments.
Answer the customer's question directly, concisely, and naturally using the official knowledge below. ${namePrompt}

HUMAN CONVERSATIONAL RULES (STRICT NO-BOT-DATA POLICY):
1. FOR GENERAL CONVERSATIONS & INQUIRIES (Greetings, Company info, office locations, general product queries): Write short, direct, natural 1-2 sentence replies. Talk like a real person replying on WhatsApp.
2. FOR TECHNICAL TROUBLESHOOTING & ERROR COMPLAINTS (When MATCHED TROUBLESHOOTING DOCUMENTS exist below): ALWAYS follow Rule 10! You MUST ALWAYS format the response using 📍 *Step 1:*, 🔍 *Check 1:*, ⚡ *Action 1:*, • bullet points for all sub-items, and ↳ Remark: for remarks! NEVER summarize troubleshooting steps into a paragraph!
3. ABSOLUTELY NO BOT TRAILING SIGNATURES: Do NOT append phone numbers (${settings.supportPhone}), emails, or contact footers unless the customer specifically asks for contact details.
4. ABSOLUTELY NO UNWANTED SALES PITCHES OR PROMPTS: Do NOT append repetitive sales pitches ("Would you like to browse products or register?"), formal intros ("Namaste! I am Hari official AI assistant..."), or trailing prompts. Just answer their question directly.
5. ABSOLUTELY NO UNWANTED DATA DUMPING: Do NOT dump company capacity, employee count, ISO details, or unrequested catalog specs. Only answer what was asked.
6. MIRROR THE CUSTOMER'S EXACT LANGUAGE AND WRITING STYLE FAITHFULLY:
   - If the customer asks to switch script or font (e.g. "Malayalam font use chey", "Malayalam text il samsarikamo", "Hindi me bolo"), IMMEDIATELY write all replies in that requested script/language!
   - If the customer writes in Romanized transliteration (Manglish, Hinglish, Tanglish), reply in the SAME Romanized transliteration.
   - If the customer writes in Native Script (Malayalam, Hindi Devanagari, Tamil, etc.), reply in the SAME Native Script.
   - If the customer writes in English or any other language, reply in that SAME Language.
7. PRODUCT COMPARISON REQUESTS:
   - When asked to compare products (e.g. "Ella products um compare cheyamo", "Which model is best?"), compare Poornasree's own models (LactoSure Eco, Eco-S, Eco-V, LactoGrand, Vibro stirrer) using official specs. Never say "I only know about Poornasree equipment" when asked about Poornasree products!
8. CASUAL GREETINGS & PERSONAL QUESTIONS ("Sugam ano"):
   - "Sugam ano", "How are you", "Enthokkeyundu" are personal friendly greetings ("How are you doing?").
   - Respond warmly: "Enikku sugamanu! How can I help you with your milk testing machine or product questions today?"
   - Do NOT say that the machine model is doing well, and do NOT dump technical specs or voltage ratings!
9. PROFANITY, INSULTS & SLANG SAFEGUARD:
   - Never echo insults, offensive slang ("mandan"), or informal pronouns ("nee/ni").
   - Maintain 100% calm, polite, courteous human professionalism: "I apologize if there was any misunderstanding. I am here to help you with your machine or product questions."
10. OFF-TOPIC CHAT REDIRECTION (Universe, Galaxy, Movies, Jokes):
    - For off-topic questions (universe, galaxy, movies, jokes), give a polite 1-sentence human redirection ("I am Hari from Poornasree customer support. How can I assist you with your equipment today?").
    - Do NOT repeat or mention off-topic words in your response.
11. STRICT DOCUMENT-GROUNDED TROUBLESHOOTING COMPLIANCE:
    - When MATCHED TROUBLESHOOTING DOCUMENTS exist below, follow the exact multi-check and multi-action flow from the document in clean, natural sentence case:

      📍 *Step 1:* 
      🔍 *Check 1:* Check the rate chart settings entered properly 
      ⚡ *Action 1:* Enter the correct settings
      • 1) Rate chart enable - Enable
      • 2) Auto chart selection and limit set - (Purpose: cow chart to buffalo chart searching)
         ↳ Remark: Eg: Fat limit = 7.0. Below fat 7.0 rate taken from cow chart and above 7.0 taken from buffalo chart
      • 3) High-Low FX rate - Enable
         ↳ Remark: A fixed rate added in the result for below fat limit (eg: F 2.00) and above fat limit (eg: F 12.00)
      • 4) Low limit fat - Eg: F 2.0
         ↳ Remark: Below fat 2.0 - A fixed rate taken
      • 5) High limit fat - Eg: F 12.0
      • 6) Enter low fat fixed rate - Enter the rupees
      • 7) Enter high fat fixed rate - Enter the rupees
      • 8) Rate chart selection - Method / import from pendrive
      • Rate taken combination - Fat & SNF, Fat & CLR, Fat only, CLR only
         ↳ Remark: Uses the rate taken on Fat and SNF reading basis
      • 1) Enter start fat - For the import file
      • 2) Enter end fat - For the import file
      • 3) Enter start SNF - For the import file
      • 4) Enter end SNF - For the import file
      • Then import file from USB
         ↳ Remark: If any wrong rate shown at "Check Rate" operation, check if "Auto Chart is Enable" and verify range

      OR for Weighing Scale:

      📍 *Step 1:* 
      🔍 *Check 1:* Check the required settings is applied 
      ⚡ *Action 1:* Set the required settings values
      • 1) "Weight in Collection" weight taken at the time of test (Before/After)
         ↳ Remark: Weight value taken before or after the sample test | Works only in remote mode
      • 2) "Weight Detect From" - From scale / Manual
         ↳ Remark: Weight taken from weighing scale or manual enter
      • 3) KG to Litre
         ↳ Remark: Kilogram data to litre conversion enable/disable
      • 4) Tare - No tare, before and after collection
         ↳ Remark: Automatic scale tare action
      • 5) Baud rate & datatype
      • 6) Read delay
         ↳ Remark: Scale data sending time interval = Normally set at 0.50 second

      📍 *Step 2:* 
      🔍 *Check 2:* Check the analyser to weighing scale data cable connectivity 
      ⚡ *Action 1:* Properly connect or replace the cable 
      • 1) Serial "Baud Rate" auto detection / manual selection
         ↳ Remark: Auto selection = Enter the reference weight data from scale display (eg: 123.45 Ltr)
      • 2) Manual selection - Total 10 selectable models and 1 manual settable model
         ↳ Remark: DOWN key used to select Baud Rate and UP key used to select Types of Models
      • 1) First enter the start character code
         ↳ Remark: ASCII code table: Eg: Scale serial data is "L00123.45 0D 0A" -> "L" code is 076 -> Enter 076 in Start Charcode
      • 2) Next enter the End Charcode
         ↳ Remark: "0D" is end code -> Enter value 013
      • 3) Next enter the Char Count
         ↳ Remark: Eg: "00123.45" total count = 7
      • 4) Next enter decimal point count
         ↳ Remark: Eg: Decimal point values "45" count = 2

      OR for General Errors (e.g. T2 Error, Adapter, Vibro, Temperature, Sensor):

      📍 *Step 1:* 
      🔍 *Check 1:* Check the leakage/block in sample sucking sections 
      ⚡ *Action 1:* Check the silicon tube for damage or bend
      • 1) Check if inlet pipe is broken or blocked
         ↳ Remark: Replace inlet pipe if damaged
      • 2) Check inlet tube to preheater silicon tube
         ↳ Remark: Replace or tie silicon tube

      📍 *Step 2:* 
      🔍 *Check 2:* Check the L-plug properly inserted 
      ⚡ *Action 1:* Check the O-ring
      • 1) Check L-plug for damage and inspect O-ring quality
         ↳ Remark: Replace L-plug or O-ring

      📍 *Step 3:*
      If none of the above steps help, please contact Poornasree Customer Care for further assistance.

    - CRITICAL DOCUMENT MAPPING & COMPLETE UN-TRUNCATED OUTPUT RULES:
      1. ABSOLUTELY DO NOT SUMMARIZE OR CONVERT STEPS INTO A PARAGRAPH! You MUST ALWAYS format the response using 📍 *Step 1:*, 🔍 *Check 1:*, ⚡ *Action 1:*, and • bullet points for all sub-items and ↳ Remark: for remarks!
      2. NATURAL SENTENCE CASING DIRECTIVE: Write all check titles, actions, sub-bullets, and remarks in natural, clean sentence case (e.g. 'Check the fuse', 'Replace the fuse', 'Check the power supply'). NEVER write full sentences or bullet titles in ALL-CAPS / UPPERCASE (except for standard abbreviations/acronyms like USB, GSM, LED, ASCII, L-PLUG, T2).
      3. MANDATORY CHECK & ACTION PAIR: Every single Step (Step 1, Step 2, Step 3...) MUST contain BOTH a 🔍 *Check* line AND at least one ⚡ *Action* line (⚡ *Action 1:* ...). ABSOLUTELY NEVER output a 🔍 *Check* without its corresponding ⚡ *Action*!
      4. YOU MUST OUTPUT EVERY SINGLE CHECK STEP FROM THE DOCUMENT (Check 1, Check 2, Check 3, Check 4, Check 5...). If the matched document contains 5 Checks, YOUR RESPONSE MUST CONTAIN ALL 5 CHECKS AS STEP 1, STEP 2, STEP 3, STEP 4, AND STEP 5!
      5. Under Check 1, list ALL main actions corresponding to CHECK-1 from ACTION-1 (⚡ Action 1:...). Sub-numbered configuration settings (e.g. '1) Weight in collection', '2) Weight detect from', '1) Serial baud rate...') MUST be indented as sub-bullets under Action 1 (• 1) "Weight in collection"...). DO NOT format sub-settings or remarks as separate main Actions (Action 2, Action 3, Action 4).
      6. ABSOLUTELY NO TRUNCATION: You MUST output EVERY SINGLE Check (Check 1 to N), EVERY Action line (Action 1, Action 2...), and EVERY sub-bullet item from the matched document without omitting, shortening, or cutting off a single line!
      7. STRICT REMARKS FORMATTING: ANY LINE THAT CONTAINS REMARKS, EXPLANATIONS, OR EXAMPLES (e.g. "Works only in remote mode", "Eg: The scale display shown...", "ASCII code is 076...") MUST BE FORMATTED AS AN INDENTED "↳ Remark:" LINE UNDER ITS CORRESPONDING SUB-POINT! ABSOLUTELY DO NOT FORMAT REMARKS AS "• Action 2:", "• Action 3:", OR MAIN ACTION LINES!
      8. ABSOLUTELY DO NOT omit, skip, or summarize distinct checks, actions, examples, or button enable instructions!
      9. Translate the *Check* and *Action* items into the customer's language/writing style (Manglish, Malayalam, Hindi, English).
      10. Follow ONLY the exact steps and sequence from the matched document.
      11. ABSOLUTELY DO NOT suggest or introduce outside steps, outside tools, or procedures that are not written in the document.
      12. ABSOLUTELY NO DUPLICATE REMARKS OR LEAKED FUTURE CHECKS: A Step must NEVER output a "↳ Remark:" that simply mentions, repeats, or previews the next check (e.g. "Check the power supply", "Check the adapter", "Check the sensor and tube") or future replacement actions! If a check step has no unique explanatory notes, parameters, examples (Eg: ...), or ASCII codes, DO NOT output any "↳ Remark:" line under that step. Output only 📍 *Step N:*, 🔍 *Check N:*, and ⚡ *Action 1:*!${uncatalogedRule}

--- MATCHED OFFICIAL TROUBLESHOOTING DOCUMENTS ---
${matchedDocKnowledge || "No specific troubleshooting document match found."}

--- OFFICIAL KNOWLEDGE ---
Company Overview & Contact:
${settings.companyDetails || ""}

Company Knowledge & Catalog:
${settings.companyKnowledge || ""}

Head Office Address:
${settings.companyAddress || ""}
--------------------------`;

  try {
    const { llmChat } = await import("./llm.service");

    const conversationPayload: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
    ];

    // Append query if not already the last message in history
    const lastMsg = historyMessages[historyMessages.length - 1];
    if (!lastMsg || lastMsg.content !== query) {
      conversationPayload.push({ role: "user", content: query });
    }

    const rawReply = await llmChat(conversationPayload, { maxTokens: 1200, temperature: 0.5 });
    const reply = rawReply ? toSentenceCase(rawReply.trim()) : "";

    if (reply && reply.trim()) {
      const lowerQuery = query.toLowerCase();
      const isServiceIntent =
        lowerQuery.includes("service") ||
        lowerQuery.includes("complaint") ||
        lowerQuery.includes("repair") ||
        lowerQuery.includes("fix") ||
        lowerQuery.includes("broken") ||
        lowerQuery.includes("problem") ||
        lowerQuery.includes("issue") ||
        lowerQuery.includes("error") ||
        lowerQuery.includes("working") ||
        lowerQuery.includes("blinking") ||
        lowerQuery.includes("not on") ||
        lowerQuery.includes("flicker") ||
        lowerQuery.includes("flickering") ||
        lowerQuery.includes("fault") ||
        lowerQuery.includes("damage") ||
        lowerQuery.includes("fail") ||
        lowerQuery.includes("display") ||
        lowerQuery.includes("sensor") ||
        lowerQuery.includes("motor") ||
        lowerQuery.includes("power") ||
        lowerQuery.includes("showing") ||
        lowerQuery.includes("reading") ||
        lowerQuery.includes("water") ||
        lowerQuery.includes("fat") ||
        lowerQuery.includes("snf") ||
        lowerQuery.includes("leak") ||
        lowerQuery.includes("noise") ||
        lowerQuery.includes("stopped") ||
        lowerQuery.includes("engineer") ||
        lowerQuery.includes("കേടായി") ||
        lowerQuery.includes("പരാതി");

      // Automatic Manual Complaint Registration in DB if user is reporting a machine issue but NO document match exists
      if (isServiceIntent && !hasExactDocMatch) {
        try {
          await prisma.manualComplaint.create({
            data: {
              phoneNumber,
              machineName: meta.serialNumber || meta.regName || "Customer Machine",
              complaint: query.trim(),
              isReviewed: false,
              hasMatch: false,
            },
          });
          console.log(`[manual-complaint] Registered un-cataloged complaint for ${phoneNumber}: "${query}"`);
        } catch (mErr) {
          console.error("[manual-complaint] Failed to log manual complaint:", mErr);
        }
      }

      const isProductIntent =
        lowerQuery.includes("price") ||
        lowerQuery.includes("cost") ||
        lowerQuery.includes("catalog") ||
        lowerQuery.includes("rate") ||
        lowerQuery.includes("buy") ||
        lowerQuery.includes("model") ||
        lowerQuery.includes("lactosure") ||
        lowerQuery.includes("vibro") ||
        lowerQuery.includes("വില");

      let buttons: ReplyButton[] | undefined = undefined;
      const isTroubleshootingContent =
        reply.includes("Step") ||
        reply.includes("Check") ||
        reply.includes("Action") ||
        reply.includes("Replace") ||
        reply.includes("Customer Care") ||
        reply.includes("Clean") ||
        reply.includes("Inspect") ||
        reply.includes("Ensure") ||
        reply.includes("fuse") ||
        reply.includes("power") ||
        reply.includes("വിശദാംശങ്ങൾ") ||
        reply.includes("പരിഹരിക്കാൻ");

      const isCheckTicketStatus =
        lowerQuery.includes("check ticket") ||
        lowerQuery.includes("ticket status") ||
        lowerQuery.includes("check status") ||
        lowerQuery.includes("my ticket") ||
        lowerQuery.includes("my complaint") ||
        options.activeFsmState === "CHECK_STATUS" ||
        options.activeFsmState === "SELECT_TICKET_LIST" ||
        options.activeFsmState === "SELECT_TICKET_ACTION";

      if (isCheckTicketStatus) {
        return showTicketStatus(targetSessionId || options.sessionId || "", phoneNumber, meta);
      }

      if (meta.isEngineer) {
        // Service engineers interact via direct text & troubleshooting without buttons
        buttons = undefined;
      } else if (activeState === "COMPLAINT_ASK_SERIAL" || activeState === "REGISTER_SERIAL") {
        buttons = [
          { id: "COMPLAINT_REG", title: "📝 Enter Serial" },
          { id: "SKIP", title: "⏭️ Skip Serial" },
        ];
      } else if (isServiceIntent || (hasExactDocMatch && isTroubleshootingContent) || inComplaintOrTroubleshootState || isTroubleshootingContent) {
        // Show Resolved / Unresolved buttons ONLY on troubleshooting & machine issue queries
        buttons = [
          { id: "TROUBLESHOOT_RESOLVED", title: "✅ Resolved" },
          { id: "TROUBLESHOOT_UNRESOLVED", title: "❌ Unresolved" },
        ];
        meta.complaint = query.trim();
        meta.lastIssueQuery = query.trim();
        meta.videoSearchQuery = query.trim();
        if (targetSessionId || options.sessionId) {
          await updateSession(targetSessionId || options.sessionId || "", activeState, meta).catch(() => {});
        }
      } else if (isProductIntent) {
        buttons = [
          { id: "VIEW_PRODUCTS", title: "📦 Browse Products" },
          getMenuButton(lang),
        ];
      } else {
        // Normal conversational chat (general questions, greetings, company info) -> show Main Menu button
        buttons = [getMenuButton(lang)];
      }

      return makeReply(reply.trim(), buttons);
    }
  } catch (err) {
    console.error("[groq-company-assistant] Fallback error:", err);
  }

  // Fallback if Groq is unavailable
  return makeReply(t("VALID_OPTION", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
}


// ── VIEW_PRODUCTS — 3-step browsing flow ──────────────────────────────────
const DEFAULT_CONTACT = "+91 94009 61291";

/** Pretty-print a category key → readable label */
function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    lactogrand: "LactoGrand",
    lactosure: "LactoSure",
    other: "Other Products",
  };
  return labels[cat.toLowerCase()] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

/** Step 1: show category selection list */
async function showProducts(sessionId: string, meta: SessionMeta) {
  return handleProductBrowse(sessionId, "", meta, "");
}

async function handleProductBrowse(sessionId: string, _phoneNumber: string, meta: SessionMeta, _text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: true, price: true },
    orderBy: { createdAt: "asc" },
  });

  if (products.length === 0) {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(
      `📦 No products available at the moment.\n\n📞 Contact us: ${DEFAULT_CONTACT}`,
      [getMenuButton(lang)],
    );
  }

  await updateSession(sessionId, "VIEW_PRODUCT_DETAIL", meta);

  const rows = products.map((p) => ({
    id: `PROD_${p.id}`,
    title: p.name,
    description: `${categoryLabel(p.category)}${p.price ? ` — 💰 ${p.price}` : ""}`,
  }));
  rows.push({ id: "BACK_MAIN", title: "⬅️ Main Menu", description: "Go back to main menu" });

  return makeReply(
    `📦 *Poornasree Products Catalog*\n\nPlease select any product from the list below to view specs & photos:`,
    undefined,
    { buttonText: "Browse Products 📋", rows },
  );
}

/** Step 2: user picked a category — show products in that category */
async function handleProductCategory(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string): Promise<any> {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.trim().toUpperCase();

  if (upper === "BACK_MAIN" || upper === "MENU" || upper === "MAIN MENU") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
  }

  // If user directly sends a PROD_ id while in this state, pass to detail handler
  if (upper.startsWith("PROD_")) {
    return handleProductDetail(sessionId, phoneNumber, meta, text);
  }

  // Resolve category from button ID like "CAT_LACTOGRAND" or from raw text
  let category: string | null = null;
  if (upper.startsWith("CAT_")) {
    category = upper.replace("CAT_", "").toLowerCase();
  } else {
    // Try to match category by name
    const cats = await prisma.product.groupBy({ by: ["category"], where: { isActive: true } });
    const match = cats.find(c => c.category.toLowerCase() === upper.toLowerCase() || categoryLabel(c.category).toLowerCase() === upper.toLowerCase());
    if (match) category = match.category;
  }

  if (!category) {
    // User typed a free-text question instead of selecting a category -> Route to Gemini AI
    return runGroqCompanyAssistant(phoneNumber, text, meta, { activeFsmState: "VIEW_PRODUCT_CATEGORY" });
  }

  const products = await prisma.product.findMany({
    where: { isActive: true, category },
    select: { id: true, name: true, imageUrl: true, price: true },
    orderBy: { createdAt: "asc" },
  });

  if (products.length === 0) {
    return handleProductBrowse(sessionId, phoneNumber, meta, "");
  }

  await updateSession(sessionId, "VIEW_PRODUCT_DETAIL", { ...meta, selectedCategory: category });

  const rows = products.map(p => ({
    id: `PROD_${p.id}`,
    title: p.name,
    description: p.price ? `💰 ${p.price}` : "Tap to view details",
  }));
  rows.push({ id: "BACK_CATEGORIES", title: "⬅️ Back to Categories", description: "" });

  return makeReply(
    `📦 *${categoryLabel(category)}*\n\nSelect a product to view details:`,
    undefined,
    { buttonText: `View Products 📋`, rows },
  );
}

/** Step 3: user picked a product — Groq generates description from image in customer's language */
async function handleProductDetail(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string): Promise<any> {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.trim().toUpperCase();

  if (upper === "BACK_CATEGORIES" || upper === "BACK") {
    return handleProductBrowse(sessionId, phoneNumber, meta, "");
  }
  if (upper === "BACK_MAIN" || upper === "MENU" || upper === "MAIN MENU") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
  }

  // Resolve product ID from button ID "PROD_<uuid>"
  let productId: string | null = null;
  if (upper.startsWith("PROD_")) {
    productId = text.trim().slice(5); // preserve original case for UUID
  }

  if (!productId) {
    // User typed a free-text question instead of clicking product ID -> Route to Gemini AI
    return runGroqCompanyAssistant(phoneNumber, text, meta, { activeFsmState: "VIEW_PRODUCT_DETAIL" });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, imageUrl: true, price: true, detail: true, contactNumber: true, category: true },
  });

  if (!product) {
    return handleProductBrowse(sessionId, phoneNumber, meta, "");
  }

  await updateSession(sessionId, "MAIN_MENU", { ...meta, selectedProductId: productId });

  const baseUrl = runtime.frontendUrl().replace(/\/$/, "");
  const imageUrl = product.imageUrl
    ? (product.imageUrl.startsWith("http") ? product.imageUrl : `${baseUrl}${product.imageUrl}`)
    : null;

  // Detect customer's language name for Groq prompt
  const langNames: Record<string, string> = {
    en: "English", hi: "Hindi", ml: "Malayalam", ta: "Tamil",
    kn: "Kannada", mr: "Marathi", te: "Telugu", bn: "Bengali",
  };
  const targetLanguage = langNames[lang] ?? "English";

  // Use unified LLM to generate a product description in the customer's language
  let description = product.detail ?? "";
  try {
    const { llmChat } = await import("./llm.service");
    const systemPrompt = `You are a product description specialist for Poornasree Equipments, a dairy equipment company.
The customer's preferred language is ${targetLanguage}.
Write a compelling, friendly product description in ${targetLanguage} language only.
Be concise (2-3 sentences). Use WhatsApp-friendly formatting (bold with *text*, emojis).
If the product name includes technical terms (like LactoGrand, LactoSure, Vibro, ECO), keep those in English.
Do NOT include pricing or contact info in the description.`;

    const userPrompt = product.imageUrl
      ? `Product name: "${product.name}" (Category: ${product.category}). This product has an image at: ${imageUrl}. Generate a compelling product description in ${targetLanguage}.`
      : `Product name: "${product.name}" (Category: ${product.category}). Generate a compelling product description in ${targetLanguage}.`;

    description = await llmChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 250, temperature: 0.7 },
    );
  } catch (err) {
    console.error("[product] LLM description generation failed:", err);
    description = product.detail ?? product.name;
  }

  // Fetch other active products to display under "Other Products" in 3rd point
  const otherProducts = await prisma.product.findMany({
    where: { isActive: true, id: { not: productId } },
    select: { id: true, name: true, category: true, price: true },
    orderBy: { createdAt: "asc" },
    take: 4,
  });

  const otherLines = otherProducts.map(
    op => `• *${op.name}* (${categoryLabel(op.category)})${op.price ? ` — 💰 ${op.price}` : ""}`
  );

  const otherProductsBlock = otherLines.length > 0
    ? `\n✨ *Other Products Available:*\n${otherLines.join("\n")}`
    : "";

  const contact = product.contactNumber ?? DEFAULT_CONTACT;
  const priceText = product.price ? `\n💰 *Price:* ${product.price}` : "";

  const msg = [
    `📦 *${product.name}*`,
    ``,
    description,
    priceText,
    otherProductsBlock,
    ``,
    `📞 *Contact:* ${contact}`,
    `🌐 *Website:* poornasree.com/products`,
  ].filter(Boolean).join("\n").trim();

  const images: ProductImage[] = imageUrl
    ? [{ url: imageUrl, caption: "" }]
    : [];

  const buttons: ReplyButton[] = [
    { id: "VIEW_PRODUCTS", title: "📦 Browse Products" },
    { id: "COMPLAINT_REG", title: "📝 Book Complaint" },
    { id: "MENU", title: "🏠 Main Menu" },
  ];

  return makeReply(
    msg,
    buttons,
    undefined,
    images.length > 0 ? images : undefined,
  );
}




// ── CHECK_STATUS & MULTI-TICKET SELECTION ────────────────────────────────
async function showTicketStatus(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  const lookupPhones = [phoneNumber, cleanPhone, last10];
  if (meta.customerPhone) {
    lookupPhones.push(meta.customerPhone);
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { phoneNumber: { in: lookupPhones } },
        { phoneNumber: { contains: last10 } },
        ...(meta.regCustomerId ? [{ customerId: meta.regCustomerId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      assignedEngineer: { select: { firstName: true, lastName: true } },
    },
  });

  if (tickets.length === 0) {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(
      `ℹ️ *No Tickets Found*\n\nYou currently have no registered tickets or service complaints with us.`,
      [
        { id: "COMPLAINT_REG", title: "📝 Register Complaint" },
        getMenuButton(lang),
      ]
    );
  }

  const openTickets = tickets.filter((t) => t.status !== "CLOSED");

  // If exactly 1 open ticket (or no open tickets, only past tickets)
  if (openTickets.length === 1) {
    return showSelectedTicketDetails(sessionId, phoneNumber, meta, openTickets[0]);
  }

  if (openTickets.length === 0) {
    // Only closed tickets exist
    const lastTicket = tickets[0];
    return showSelectedTicketDetails(sessionId, phoneNumber, meta, lastTicket);
  }

  // Multiple active tickets exist (2 or more)
  const statusEmoji: Record<string, string> = {
    OPEN: "🔵", ASSIGNED: "🟡", IN_PROGRESS: "🟠", PENDING_OTP: "🟣", CLOSED: "✅",
  };

  const ticketLines = openTickets.map((t, index) => {
    const emoji = statusEmoji[t.status] || "⚪";
    const date = t.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
    const product = t.machineName || "Machine";
    const serial = t.machineSerialNumber ? ` (Serial: ${t.machineSerialNumber})` : "";
    const issue = t.problemDescription || "Service Request";
    return `${index + 1}️⃣ *Ticket #${t.ticketNumber}*\n   📦 *Machine:* ${product}${serial}\n   📝 *Issue:* ${issue}\n   📊 *Status:* ${emoji} ${t.status}\n   📅 *Date:* ${date}`;
  });

  const buttons: ReplyButton[] = openTickets.slice(0, 2).map((t) => ({
    id: `VIEW_TICKET_${t.id}`,
    title: `🎫 ${t.ticketNumber.slice(-10)}`,
  }));
  buttons.push(getMenuButton(lang));

  await updateSession(sessionId, "SELECT_TICKET_LIST", meta);

  return makeReply(
    `📋 *Your Active Tickets (${openTickets.length}):*\n\n` +
    ticketLines.join("\n\n") + "\n\n" +
    `Please tap a ticket button below or reply with ticket number to view details & actions 👇`,
    buttons
  );
}

async function handleTicketSelection(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  const upper = text.trim().toUpperCase();

  let targetTicketId = upper.startsWith("VIEW_TICKET_") ? upper.replace("VIEW_TICKET_", "") : "";

  const openTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { phoneNumber: phoneNumber },
        { phoneNumber: { contains: last10 } },
        ...(meta.regCustomerId ? [{ customerId: meta.regCustomerId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { assignedEngineer: { select: { firstName: true, lastName: true } } },
  });

  if (targetTicketId) {
    const found = openTickets.find((t) => t.id === targetTicketId || t.ticketNumber === targetTicketId);
    if (found) return showSelectedTicketDetails(sessionId, phoneNumber, meta, found);
  }

  // Check numeric selection (1, 2, 3) or ticket number search
  const numIndex = parseInt(text.trim(), 10) - 1;
  if (!isNaN(numIndex) && numIndex >= 0 && numIndex < openTickets.length) {
    return showSelectedTicketDetails(sessionId, phoneNumber, meta, openTickets[numIndex]);
  }

  const directMatch = openTickets.find((t) => t.ticketNumber.toUpperCase().includes(upper) || t.id === upper);
  if (directMatch) {
    return showSelectedTicketDetails(sessionId, phoneNumber, meta, directMatch);
  }

  return showTicketStatus(sessionId, phoneNumber, meta);
}

async function showSelectedTicketDetails(sessionId: string, phoneNumber: string, meta: SessionMeta, ticket: any) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const statusEmoji: Record<string, string> = {
    OPEN: "🔵", ASSIGNED: "🟡", IN_PROGRESS: "🟠", PENDING_OTP: "🟣", CLOSED: "✅",
  };
  const emoji = statusEmoji[ticket.status] || "⚪";
  const date = ticket.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  const engName = ticket.assignedEngineer ? `${ticket.assignedEngineer.firstName} ${ticket.assignedEngineer.lastName || ""}`.trim() : "Pending Engineer Assignment";

  const updatedMeta: SessionMeta = {
    ...meta,
    selectedTicketId: ticket.id,
    selectedTicketNumber: ticket.ticketNumber,
    targetCloseTicketId: ticket.id,
    targetCloseTicketNumber: ticket.ticketNumber,
  };

  await updateSession(sessionId, "SELECT_TICKET_ACTION", updatedMeta);

  const buttons: ReplyButton[] = [];
  if (ticket.status !== "CLOSED") {
    buttons.push({ id: `ACTION_CLOSE_TICKET_${ticket.id}`, title: "🔒 Close Ticket" });
    buttons.push({ id: "ATTACH_COMPLAINT_MEDIA", title: "🎙️/📹 Attach Media" });
  } else {
    buttons.push({ id: "COMPLAINT_REG", title: "📝 New Complaint" });
  }
  buttons.push(getMenuButton(lang));

  return makeReply(
    `🎫 *Ticket Details: #${ticket.ticketNumber}*\n\n` +
    `📦 *Machine:* ${ticket.machineName || "Machine"} (Serial: ${ticket.machineSerialNumber || "N/A"})\n` +
    `📝 *Issue Description:* ${ticket.problemDescription || "Service Request"}\n` +
    `📊 *Status:* ${emoji} ${ticket.status}\n` +
    `📅 *Created:* ${date}\n` +
    `👷 *Engineer:* ${engName}\n` +
    `📍 *Location:* ${ticket.place || "Kochi"}, ${ticket.district || "Ernakulam"}\n\n` +
    `What action would you like to perform for this ticket?`,
    buttons
  );
}

// ── Customer Registered Machines Lookup Helper ───────────────────────────
async function getCustomerRegisteredMachines(phoneNumber: string): Promise<{ serial: string; model: string }[]> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  // Only lookup machines if customer is an active registered user in prisma.user
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { whatsappNumber: { contains: last10 } },
        { whatsappNumber: phoneNumber },
        { whatsappNumber: "91" + last10 },
        { whatsappNumber: "+91" + last10 },
      ],
    },
    select: { id: true },
  });

  if (!user) return [];

  const tickets = await prisma.ticket.findMany({
    where: {
      customerId: user.id,
      machineSerialNumber: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { machineSerialNumber: true, machineName: true },
    take: 10,
  });

  const seen = new Set<string>();
  const machines: { serial: string; model: string }[] = [];
  for (const t of tickets) {
    if (t.machineSerialNumber && t.machineSerialNumber.trim()) {
      const s = t.machineSerialNumber.trim().toUpperCase();
      if (!seen.has(s)) {
        seen.add(s);
        machines.push({
          serial: t.machineSerialNumber.trim(),
          model: t.machineName?.trim() || "Machine",
        });
      }
    }
  }
  return machines;
}

// ── Customer User Auto-Registration Helper ────────────────────────────────
async function getOrCreateCustomerUser(phoneNumber: string, name?: string, pincodeCodeOrId?: string): Promise<any> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { whatsappNumber: { contains: last10 } },
        { whatsappNumber: phoneNumber },
        { whatsappNumber: "91" + last10 },
        { whatsappNumber: "+91" + last10 },
      ],
    },
  });

  let validPincodeId: string | null = null;
  if (pincodeCodeOrId) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pincodeCodeOrId)) {
      validPincodeId = pincodeCodeOrId;
    } else {
      const pc = await prisma.pincode.findFirst({ where: { code: pincodeCodeOrId } });
      if (pc) validPincodeId = pc.id;
    }
  }

  const cleanName = (name || "").trim();
  const names = (cleanName && cleanName.toLowerCase() !== "customer" ? cleanName : "Customer").split(" ");

  if (!user) {
    const uniqueEmail = `cust_${cleanPhone || Date.now()}@poornasree.local`;
    user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        passwordHash: "NOPASSWORD_WHATSAPP_CUSTOMER",
        firstName: names[0] || "Customer",
        lastName: names.slice(1).join(" ") || undefined,
        role: "customer",
        whatsappNumber: phoneNumber,
        pincodeId: validPincodeId,
      },
    });
  } else {
    const shouldUpdateName = Boolean(
      cleanName &&
      cleanName.toLowerCase() !== "customer" &&
      (user.firstName === "Customer" || user.firstName !== names[0])
    );
    if (shouldUpdateName || (validPincodeId && !user.pincodeId)) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(shouldUpdateName ? { firstName: names[0], lastName: names.slice(1).join(" ") || null } : {}),
          ...(validPincodeId && !user.pincodeId ? { pincodeId: validPincodeId } : {}),
        },
      });
    }
  }

  return user;
}

// ── Smart Complaint Registration Entry Point ──────────────────────────────
export async function startComplaintRegistration(
  sessionId: string,
  phoneNumber: string,
  meta: SessionMeta,
  lang: Lang,
  overrideComplaint?: string
): Promise<any> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  // 1. Lookup registered user / past customer details in DB
  let registeredUser = await prisma.user.findFirst({
    where: {
      OR: [
        { whatsappNumber: { contains: last10 } },
        { whatsappNumber: phoneNumber },
        { whatsappNumber: "91" + last10 },
        { whatsappNumber: "+91" + last10 },
      ],
    },
    select: { id: true, firstName: true, lastName: true, role: true, whatsappNumber: true },
  });

  const savedProfile = await loadSavedEndCustomer(phoneNumber).catch(() => null);

  let regName = meta.customerName || meta.manualName || savedProfile?.manualName || [registeredUser?.firstName, registeredUser?.lastName].filter(Boolean).join(" ");
  let regPincode = meta.manualPincode || meta.regPincode || savedProfile?.manualPincode;
  let regPlace = meta.manualPlace || meta.regPlace || savedProfile?.manualPlace;
  let regDistrict = meta.manualDistrict || meta.regDistrict || savedProfile?.manualDistrict;
  let regState = meta.manualState || meta.regState || savedProfile?.manualState;
  let regAddress = meta.manualAddress || meta.regAddress || savedProfile?.manualAddress;
  let regSerial = meta.serialNumber || meta.regSerialNumber;
  let regMachine = meta.machineData || meta.regMachineData;

  const knownMachines = await getCustomerRegisteredMachines(phoneNumber);

  // If customer has multiple registered machines and none chosen yet in this flow:
  if (knownMachines.length > 1 && !regSerial && !regMachine) {
    const updatedMeta: SessionMeta = {
      ...meta,
      customerName: regName,
      manualName: regName,
      manualPincode: regPincode,
      regPincode: regPincode,
      manualPlace: regPlace,
      regPlace: regPlace,
      manualDistrict: regDistrict,
      regDistrict: regDistrict,
      manualState: regState,
      regState: regState,
      manualAddress: regAddress,
      regAddress: regAddress,
      complaint: overrideComplaint || meta.complaint,
    };
    await updateSession(sessionId, "SELECT_REGISTERED_MACHINE", updatedMeta);
    const rows = [
      ...knownMachines.map((m, idx) => ({
        id: `SELECT_MACH_${m.serial}`,
        title: `${m.model.slice(0, 15)} (${m.serial})`,
        description: `Registered Machine #${idx + 1}`,
      })),
      {
        id: "ENTER_NEW_SERIAL",
        title: "➕ Enter Different Serial",
        description: "Register a new machine",
      },
    ];
    return makeReply(
      `📋 *We found ${knownMachines.length} machines registered under your account:*\n\n` +
      `Please select the machine having the issue, or choose to enter a new serial number:`,
      undefined,
      { buttonText: "Select Machine 👇", rows }
    );
  }

  // If only 1 past machine found and none chosen yet, default to that machine
  if (!regSerial && knownMachines.length === 1) {
    regSerial = knownMachines[0].serial;
    if (!regMachine) {
      regMachine = {
        serial_no: knownMachines[0].serial,
        m_model: knownMachines[0].model || "Machine",
        customer: regName || "Customer",
      } as PasstestMachine;
    }
  }

  // Preserve prior complaint or query from chat ONLY if it is a real technical issue
  const rawComplaint = overrideComplaint || meta.complaint || meta.lastIssueQuery || meta.videoSearchQuery;
  const hasValidComplaint = Boolean(rawComplaint && !isGreetingOrSmallTalk(rawComplaint) && isTechnicalIssueQuery(rawComplaint));

  if (!hasValidComplaint) {
    // If no valid machine issue description exists, prompt customer to describe their issue first
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", meta);
    return makeReply(
      `📝 *Please describe the issue you are facing with your machine:*\n\n` +
      `You can type the symptoms (e.g. _Vibro not working, T2 error, Rate chart not taking, Reading variation_) or send a voice note.`,
      [getMenuButton(lang)]
    );
  }

  const effectiveComplaint = rawComplaint!.trim();

  const updatedMeta: SessionMeta = {
    ...meta,
    customerName: regName,
    manualName: regName,
    manualPincode: regPincode,
    regPincode: regPincode,
    manualPlace: regPlace,
    regPlace: regPlace,
    manualDistrict: regDistrict,
    regDistrict: regDistrict,
    manualState: regState,
    regState: regState,
    manualAddress: regAddress,
    regAddress: regAddress,
    serialNumber: regSerial,
    regSerialNumber: regSerial,
    machineData: regMachine,
    regMachineData: regMachine,
    complaint: effectiveComplaint,
  };

  // Case A: UNREGISTERED / NO SAVED CUSTOMER DETAILS -> Ask for Name first
  if (!regName || !regPincode) {
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", updatedMeta);
    return makeReply(
      `📝 *Let's register your service visit request.*\n\nPlease enter your *Name* or *Dairy Society Name*:`,
      [getMenuButton(lang)]
    );
  }

  // Case B: REGISTERED CUSTOMER BUT MACHINE SERIAL IS UNKNOWN -> Ask for Machine Serial Number with Skip option
  if (!regSerial && !updatedMeta.machineData) {
    const locSummary = [regPlace, regDistrict, regState].filter(Boolean).join(", ") || regPincode || "";
    await updateSession(sessionId, "COMPLAINT_ASK_SERIAL", updatedMeta);
    return makeReply(
      `📋 *We found your registered details:*\n` +
      `👤 *Name:* ${regName}\n` +
      `📍 *Location:* ${locSummary}${regPincode ? ` (${regPincode})` : ""}\n\n` +
      `🔢 *Please enter your Machine Serial Number:*\n` +
      `(e.g., 2410-0012)\n\n` +
      `Or press *Skip* if you don't have the serial number handy.`,
      [
        { id: "SKIP", title: "⏭️ Skip Serial" },
        { id: "EDIT_CUSTOMER_DETAILS", title: "✏️ Change Details" },
        getMenuButton(lang),
      ]
    );
  }

  // Case C: ALL DETAILS & MACHINE ARE KNOWN -> Show Confirmation Summary Card
  const productName = updatedMeta.selectedProduct || regMachine?.m_model || "Machine";
  const place = regPlace || "Kochi";
  const district = regDistrict || "Ernakulam";
  const state = regState || "Kerala";
  const pincode = regPincode || "682001";
  let gmapLink = updatedMeta.regGmapLink || updatedMeta.manualGmapLink || "";
  if (!gmapLink) {
    try {
      const targetCustId = registeredUser?.id || updatedMeta.regCustomerId;
      if (targetCustId) {
        const lastTicketWithMap = await prisma.ticket.findFirst({
          where: {
            customerId: targetCustId,
            OR: [
              { customerAddress: { contains: "http" } },
              { issueDescription: { contains: "http" } },
              { problemDescription: { contains: "http" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          select: { customerAddress: true, issueDescription: true, problemDescription: true },
        });

        if (lastTicketWithMap) {
          const fullStr = `${lastTicketWithMap.customerAddress || ""} ${lastTicketWithMap.issueDescription || ""} ${lastTicketWithMap.problemDescription || ""}`;
          const match = fullStr.match(/(https?:\/\/[^\s]+maps[^\s]+|https?:\/\/maps\.google[^\s]+|https?:\/\/goo\.gl[^\s]+|https?:\/\/maps\.app\.goo\.gl[^\s]+)/i);
          if (match) {
            gmapLink = match[0];
            updatedMeta.regGmapLink = gmapLink;
          }
        }
      }
    } catch (err) {
      console.error("[simulate] Auto-extract gmapLink error:", err);
    }
  }
  const gmapDisplay = gmapLink ? gmapLink : "Not Provided";

const mediaCount = updatedMeta.mediaUrls?.length || (updatedMeta.complaintMediaUrl ? 1 : 0);
  const mediaStatus = mediaCount > 0 ? `📎 ${mediaCount} File(s) Attached 🎙️/📹` : "None";

  await updateSession(sessionId, "CONFIRM_REGISTER_TICKET", updatedMeta);

  return makeReply(
    `📝 *Confirm Complaint Registration:*\n\n` +
    `👤 *Customer Name:* ${updatedMeta.customerName || "Customer"}\n` +
    `📞 *Phone:* ${updatedMeta.customerPhone || phoneNumber}\n` +
    `📦 *Product:* ${productName} (Serial: ${regSerial || "N/A"})\n` +
    `📝 *Issue Description:* ${effectiveComplaint}\n` +
    `📍 *Location:* ${place}, ${district}, ${state}\n` +
    `📮 *Pincode:* ${pincode}\n` +
    `🗺️ *Google Maps:* ${gmapDisplay}\n` +
    `📎 *Attached Media:* ${mediaStatus}\n\n` +
    `Would you like to confirm this complaint or change machine/details?`,
    [
      { id: "CONFIRM_BOOK_TICKET", title: "✅ Confirm" },
      { id: "CHANGE_MACHINE", title: "🔄 Change Machine" },
      { id: "ATTACH_COMPLAINT_MEDIA", title: "🎙️/📹 Attach Media" },
    ]
  );
}

async function handleConfirmRegisterTicket(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "CONFIRM_BOOK_TICKET" || upper === "1" || upper.includes("CONFIRM") || upper.includes("BOOK") || upper.includes("YES")) {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    if (!endCustomerName(meta) || !meta.manualPincode) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    return executePasstestTicketCreation(sessionId, phoneNumber, meta);
  }

  if (upper === "CHANGE_MACHINE" || upper === "CHANGE_SERIAL" || upper.includes("CHANGE MACHINE") || upper.includes("DIFFERENT MACHINE") || upper.includes("CHANGE PRODUCT")) {
    const knownMachines = await getCustomerRegisteredMachines(phoneNumber);
    if (knownMachines.length > 1) {
      await updateSession(sessionId, "SELECT_REGISTERED_MACHINE", meta);
      const rows = [
        ...knownMachines.map((m, idx) => ({
          id: `SELECT_MACH_${m.serial}`,
          title: `${m.model.slice(0, 15)} (${m.serial})`,
          description: `Registered Machine #${idx + 1}`,
        })),
        {
          id: "ENTER_NEW_SERIAL",
          title: "➕ Enter Different Serial",
          description: "Register a new machine",
        },
      ];
      return makeReply(
        `📋 *Select Machine for this Service Request:*\n\n` +
        `Choose from your registered machines, or enter a new serial number:`,
        undefined,
        { buttonText: "Select Machine 👇", rows }
      );
    }

    const clearedMeta: SessionMeta = { ...meta, serialNumber: undefined, machineData: null };
    await updateSession(sessionId, "COMPLAINT_ASK_SERIAL", clearedMeta);
    return makeReply(
      `🔢 *Please enter the Serial Number of the machine requiring service:*\n` +
      `(e.g., 2410-0012)\n\n` +
      `Or press *Skip* if you don't have the serial number handy.`,
      [
        { id: "SKIP", title: "⏭️ Skip Serial No." },
        getMenuButton(lang),
      ]
    );
  }

  if (upper === "ATTACH_COMPLAINT_MEDIA" || upper.includes("ATTACH") || upper.includes("AUDIO") || upper.includes("VIDEO") || upper.includes("MEDIA")) {
    await updateSession(sessionId, "AWAIT_COMPLAINT_MEDIA", meta);
    return makeReply(
      `🎙️/📹 *Attach Audio Voice Note or Video Clip*\n\nPlease send your audio voice note, video clip, or photo now to attach it to your complaint.`
    );
  }

  if (upper === "EDIT_COMPLAINT_DESC" || upper === "2" || upper.includes("EDIT") || upper.includes("CHANGE")) {
    const updatedMeta = { ...meta, complaint: undefined, lastIssueQuery: undefined, videoSearchQuery: undefined };
    await updateSession(sessionId, "MAIN_MENU", updatedMeta);
    return makeReply(
      `📝 *Please describe the new issue you are facing with your machine:*\n\n` +
      `Example: _LED blinking, not heating, display not working, T2 error_`,
      [getMenuButton(lang)]
    );
  }

  if (isGreetingOrSmallTalk(text) || (!upper.startsWith("CONFIRM_") && !upper.startsWith("CHANGE_") && !upper.startsWith("ATTACH_") && text.length > 2)) {
    const updatedMeta = { ...meta, complaint: undefined, lastIssueQuery: undefined };
    await updateSession(sessionId, "MAIN_MENU", updatedMeta);
    return runGroqCompanyAssistant(phoneNumber, text, updatedMeta, { sessionId });
  }

  return makeReply(
    t_extra("SELECT_VALID", lang),
    [
      { id: "CONFIRM_BOOK_TICKET", title: "✅ Confirm" },
      { id: "CHANGE_MACHINE", title: "🔄 Change Machine" },
      { id: "ATTACH_COMPLAINT_MEDIA", title: "🎙️/📹 Attach Media" },
    ]
  );
}

// ── SELECT_REGISTERED_MACHINE Handler ─────────────────────────────────────
async function handleSelectRegisteredMachine(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "CANCEL" || upper === "MENU" || upper === "MAIN MENU" || upper === "MAIN_MENU" || upper === "BACK_MAIN") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
  }

  if (upper === "ENTER_NEW_SERIAL" || upper === "NEW" || upper.includes("DIFFERENT") || upper.includes("NEW SERIAL")) {
    const clearedMeta: SessionMeta = { ...meta, serialNumber: undefined, machineData: null };
    await updateSession(sessionId, "COMPLAINT_ASK_SERIAL", clearedMeta);
    return makeReply(
      `🔢 *Please enter your Machine Serial Number:*\n(e.g., 2410-0012)\n\nOr press *Skip* if you don't have the serial number handy.`,
      [
        { id: "SKIP", title: "⏭️ Skip Serial No." },
        getMenuButton(lang),
      ]
    );
  }

  let selectedSerial = "";
  if (upper.startsWith("SELECT_MACH_")) {
    selectedSerial = text.slice("SELECT_MACH_".length).trim();
  } else {
    const knownMachines = await getCustomerRegisteredMachines(phoneNumber);
    const num = parseInt(text.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= knownMachines.length) {
      selectedSerial = knownMachines[num - 1].serial;
    } else {
      selectedSerial = text.replace(/\s+/g, "").toUpperCase();
    }
  }

  if (selectedSerial && selectedSerial.length >= 3) {
    let machineData: PasstestMachine | null = null;
    try {
      machineData = await fetchMachineBySerial(selectedSerial);
    } catch (e) {}

    const newMeta: SessionMeta = {
      ...meta,
      serialNumber: selectedSerial,
      machineData: machineData || ({ serial_no: selectedSerial, m_model: meta.selectedProduct || "Machine" } as any),
      selectedProduct: machineData?.m_model || meta.selectedProduct,
    };
    return startComplaintRegistration(sessionId, phoneNumber, newMeta, lang);
  }

  return makeReply(t_extra("SELECT_VALID", lang), [getMenuButton(lang)]);
}

async function handleAwaitComplaintMedia(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "CONFIRM" || upper === "CONFIRM_BOOK_TICKET" || upper === "YES" || upper === "1") {
    return handleConfirmRegisterTicket(sessionId, phoneNumber, meta, "CONFIRM_BOOK_TICKET");
  }

  if (upper === "SKIP" || upper === "REVIEW" || upper === "REVIEW_SUMMARY" || upper === "CANCEL" || upper === "MENU" || upper === "MAIN MENU") {
    return startComplaintRegistration(sessionId, phoneNumber, meta, lang);
  }

  const currentUrls = meta.mediaUrls || (meta.complaintMediaUrl ? [meta.complaintMediaUrl] : []);
  let newMediaUrl: string | undefined;

  if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("/uploads/")) {
    newMediaUrl = text.trim();
  }

  if (newMediaUrl) {
    if (!currentUrls.includes(newMediaUrl)) {
      currentUrls.push(newMediaUrl);
    }
  } else if (text.length >= 3 && !upper.startsWith("ATTACH_")) {
    meta.complaint = `${meta.complaint || "Issue"}\n(Note: ${text})`;
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    mediaUrls: currentUrls,
    complaintMediaUrl: currentUrls[0] || meta.complaintMediaUrl,
  };

  await updateSession(sessionId, "AWAIT_COMPLAINT_MEDIA", updatedMeta);

  const fileCount = currentUrls.length;
  if (fileCount === 0) {
    return startComplaintRegistration(sessionId, phoneNumber, updatedMeta, lang);
  }

  const lastUrl = currentUrls[currentUrls.length - 1] || "";
  const mediaTypeBadge = lastUrl.includes(".mp4") || lastUrl.includes("video") ? "📹 Video Clip" : lastUrl.includes(".ogg") || lastUrl.includes(".mp3") || lastUrl.includes("audio") ? "🎙️ Voice Note" : "📷 Photo / Attachment";

  return makeReply(
    `✅ *Attachment Received! (${fileCount} File${fileCount > 1 ? "s" : ""} Attached)* ${mediaTypeBadge}\n\n` +
    `You can send another photo, video, or audio voice note now, or click *Review & Confirm* to review your complaint summary.`,
    [
      { id: "ATTACH_COMPLAINT_MEDIA", title: "➕ Add Another Media" },
      { id: "REVIEW_SUMMARY", title: "✅ Review & Confirm" },
      { id: "CONFIRM_BOOK_TICKET", title: "✅ Confirm Ticket" },
    ]
  );
}

// ── TICKET CLOSE FLOW ───────────────────────────────────────────────────
async function startTicketCloseFlow(sessionId: string, phoneNumber: string, meta: SessionMeta, lang: Lang, targetTicketId?: string) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  let targetTicket: any = null;

  if (targetTicketId) {
    targetTicket = await prisma.ticket.findUnique({ where: { id: targetTicketId } });
  } else if (meta.targetCloseTicketId || meta.selectedTicketId) {
    targetTicket = await prisma.ticket.findUnique({ where: { id: meta.targetCloseTicketId || meta.selectedTicketId } });
  }

  if (!targetTicket) {
    const openTickets = await prisma.ticket.findMany({
      where: {
        OR: [
          { phoneNumber: phoneNumber },
          { phoneNumber: { contains: last10 } },
          ...(meta.regCustomerId ? [{ customerId: meta.regCustomerId }] : []),
        ],
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (openTickets.length > 0) {
      targetTicket = openTickets[0];
    }
  }

  if (!targetTicket) {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(
      `ℹ️ *No Open Complaints Found*\n\nYou currently have no open complaints or active service tickets registered with us.`,
      [
        { id: "COMPLAINT_REG", title: "📝 Register Complaint" },
        getMenuButton(lang),
      ]
    );
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    targetCloseTicketId: targetTicket.id,
    targetCloseTicketNumber: targetTicket.ticketNumber,
  };

  await updateSession(sessionId, "CLOSE_TICKET_REASON", updatedMeta);

  return makeReply(
    `🎫 *Close Complaint Registration:*\n\n` +
    `🎫 *Ticket No:* ${targetTicket.ticketNumber}\n` +
    `📦 *Product:* ${targetTicket.machineName || "Machine"} (Serial: ${targetTicket.machineSerialNumber || "N/A"})\n` +
    `📝 *Issue:* ${targetTicket.problemDescription || "Service Request"}\n` +
    `📍 *Location:* ${targetTicket.place || "Kochi"}, ${targetTicket.district || "Ernakulam"}\n\n` +
    `Please select or type the reason for closing this complaint below 👇`,
    [
      { id: "CLOSE_REASON_SELF", title: "✅ Fixed Myself" },
      { id: "CLOSE_REASON_TECH", title: "👷 Tech Visited" },
      { id: "CLOSE_REASON_MISTAKE", title: "❌ Wrong Ticket" },
      { id: "CLOSE_REASON_OTHER", title: "✏️ Other Reason" },
    ]
  );
}

async function handleCloseTicketReason(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();
  const ticketId = meta.targetCloseTicketId;

  if (!ticketId) {
    return startTicketCloseFlow(sessionId, phoneNumber, meta, lang);
  }

  let reason = text.trim();
  if (upper === "CLOSE_REASON_SELF" || upper.includes("FIXED MYSELF") || upper.includes("SELF")) {
    reason = "Issue fixed by myself";
  } else if (upper === "CLOSE_REASON_TECH" || upper.includes("TECH VISITED") || upper.includes("TECHNICIAN")) {
    reason = "Technician visited and resolved issue";
  } else if (upper === "CLOSE_REASON_MISTAKE" || upper.includes("WRONG TICKET") || upper.includes("MISTAKE")) {
    reason = "Created by mistake / wrong complaint";
  } else if (upper === "CLOSE_REASON_OTHER") {
    return makeReply(`✏️ *Please type the reason for closing your complaint:*`);
  }

  try {
    const { closeCustomerTicket } = await import("./ticket.service");
    const closed = await closeCustomerTicket(ticketId, reason);
    const updatedMeta: SessionMeta = { ...meta, targetCloseTicketId: undefined, targetCloseTicketNumber: undefined };
    await updateSession(sessionId, "MAIN_MENU", updatedMeta);

    return makeReply(
      `✅ *Ticket Closed Successfully!*\n\n` +
      `🎫 *Ticket No:* ${closed.ticketNumber}\n` +
      `📝 *Reason:* ${reason}\n\n` +
      `Thank you for using Poornasree Equipments Customer Support! 😊`,
      [
        getMenuButton(lang),
        { id: "COMPLAINT_REG", title: "📝 New Complaint" },
      ]
    );
  } catch (err) {
    console.error("[simulate] Failed to close ticket:", err);
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(
      `⚠️ Could not close ticket. It may already be closed.`,
      [getMenuButton(lang)]
    );
  }
}

// ── COMPLAINT_ASK_SERIAL ──────────────────────────────────────────────────
async function handleComplaintAskSerial(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string): Promise<any> {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "VIEW_PRODUCTS" || upper === "PRODUCTS" || upper.startsWith("CAT_") || upper.startsWith("PROD_")) {
    return routeState({ id: sessionId, state: "VIEW_PRODUCTS" }, phoneNumber, text, meta);
  }

  if (upper === "CANCEL" || upper === "MENU" || upper === "MAIN MENU" || upper === "MAIN_MENU" || upper === "BACK_MAIN") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
  }

  if (upper === "EDIT_CUSTOMER_DETAILS" || upper === "EDIT_NAME") {
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(
      `📝 *Please enter your Name or Dairy Society Name:*`,
      [getMenuButton(lang)]
    );
  }

  if (upper === "SKIP" || upper === "0" || upper === "SKIP_SERIAL") {
    const clearedMeta: SessionMeta = { ...meta, machineData: null, serialNumber: undefined, tsSerialPath: false };
    if (meta.complaint && (meta.manualPincode || meta.regPincode)) {
      return startComplaintRegistration(sessionId, phoneNumber, clearedMeta, lang);
    }
    return showProductSelection(sessionId, clearedMeta);
  }

  const serial = text.replace(/\s+/g, "").toUpperCase();
  if (text.includes(" ") || text.length > 25 || /[\?\!\.\,]/g.test(text)) {
    return runGroqCompanyAssistant(phoneNumber, text, meta, { activeFsmState: "COMPLAINT_ASK_SERIAL" });
  }

  if (serial.length < 3) {
    return makeReply(t("SERIAL_INVALID", lang), [getSkipButton(lang), getMenuButton(lang)]);
  }

  let machineData: PasstestMachine | null = null;
  try {
    machineData = await fetchMachineBySerial(serial);
  } catch (err) {
    console.error(`[simulate] API error for "${serial}":`, (err as Error).message);
  }

  if (machineData) {
    const candidateMeta: SessionMeta = {
      ...meta,
      candidateSerial: machineData.serial_no || serial,
      candidateMachineData: machineData,
      tsSerialPath: true,
    };
    await updateSession(sessionId, "MACHINE_CONFIRM", candidateMeta);

    const detailsMsg = formatMachineDetailsCard(machineData, {
      isConfirmation: true,
      lang,
    });

    return makeReply(
      detailsMsg,
      [
        { id: "CONFIRM_MACHINE_YES", title: "✅ Yes, Correct" },
        { id: "CONFIRM_MACHINE_NO", title: "❌ No, Incorrect" },
      ]
    );
  }

  // If machine was not found in Passtest API, strictly reject and do not accept fake serials
  return makeReply(
    `❌ Serial number *${serial}* was not found in our records.\n\nPlease check your machine label and enter a valid serial number, or press *Skip* if you do not know the serial number.`,
    [getSkipButton(lang), getMenuButton(lang)]
  );
}

// ── Complaint types list helper ───────────────────────────────────────────
async function fetchComplaintListRows(lang: Lang, productName?: string, subCategory?: string, productCategory?: ProductCategory) {
  const templates = await prisma.documentIssue.findMany({
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
      filteredTemplates = templates.filter(t => t.problemType.toLowerCase().includes("vibro"));
    } else if (normProduct.includes("compact adapter")) {
      filteredTemplates = templates.filter(t => t.problemType.toLowerCase().includes("compact"));
    } else if (normProduct.includes("charger adapter") || normProduct.includes("solar charger")) {
      filteredTemplates = templates.filter(t => t.problemType.toLowerCase().includes("charger"));
    } else if (
      normProduct.includes("analyzer") ||
      normProduct.includes("lactosure") ||
      normProduct.includes("lactogrand") ||
      normProduct.includes("eco-v") ||
      normProduct.includes("eco-") ||
      productCategory === "lactosure" ||
      productCategory === "lactogrand"
    ) {
      const analyzerComplaints = templates.filter(t => t.problemType.toLowerCase().includes("analyzer"));

      if (!subCategory) {
        // Return 3 sub-categories instead of actual complaints
        return [
          { id: "SUBCAT_POWER", title: "Power, Sensor & Display", description: "Not turning on, Temp error, Display" },
          { id: "SUBCAT_DATA", title: "Data, Network & Print", description: "WiFi, Printer, SMS, Cloud" },
          { id: "SUBCAT_SCALE", title: "Scale & Reading", description: "Reading variation, Weighing scale" },
          { id: "COMPLAINT_OTHER", title: lang === "hi" ? "अन्य (टाइप करें)" : "Other (type manually)", description: lang === "hi" ? "अपनी समस्या लिखकर बताएं" : "Describe your issue" },
          getBackRow(lang),
        ];
      } else {
        // Filter analyzer complaints based on selected subCategory
        if (subCategory === "SUBCAT_POWER") {
          filteredTemplates = analyzerComplaints.filter(t =>
            /not on|battery|t2|plunge|hot sample|output not present|external display|fat shown/i.test(t.title)
          );
        } else if (subCategory === "SUBCAT_DATA") {
          filteredTemplates = analyzerComplaints.filter(t =>
            /pen-drive|wifi|date|sms|farmer|printer|cloud/i.test(t.title)
          );
        } else if (subCategory === "SUBCAT_SCALE") {
          filteredTemplates = analyzerComplaints.filter(t =>
            /reading variation|weighing scale|rate not taken/i.test(t.title)
          );
        } else {
          filteredTemplates = analyzerComplaints;
        }
      }
    } else {
      // Fallback
      filteredTemplates = templates.filter(t => {
        const words = normProduct.split(/\s+/).filter(w => w.length >= 3);
        return words.some(w => t.problemType.toLowerCase().includes(w) || t.title.toLowerCase().includes(w));
      });
      if (filteredTemplates.length === 0) filteredTemplates = templates;
    }
  }

  // Format the rows to ensure unique titles and lengths
  const seenTitles = new Set<string>();
  const rows = filteredTemplates.slice(0, 8).map((t) => {
    let title = t.title.trim();
    let description = t.description?.trim();

    if (title.length > 24) {
      const spaceIndex = title.lastIndexOf(' ', 24);
      if (spaceIndex > 0) {
        description = title.substring(spaceIndex).trim() + (description ? " - " + description : "");
        title = title.substring(0, spaceIndex);
      } else {
        description = title.substring(24).trim() + (description ? " - " + description : "");
        title = title.substring(0, 24);
      }
    } else {
      if (description) {
        const dLow = description.toLowerCase().replace(/\s+/g, "");
        const tLow = t.title.toLowerCase().replace(/\s+/g, "");
        if (dLow === tLow || dLow === title.toLowerCase().replace(/\s+/g, "")) {
          description = undefined;
        } else {
          description = description.slice(0, 72);
        }
      }
    }

    let counter = 1;
    let uniqueTitle = title;
    while (seenTitles.has(uniqueTitle.toLowerCase())) {
      const suffix = ` ${counter}`;
      uniqueTitle = title.slice(0, 24 - suffix.length).trim() + suffix;
      counter++;
    }
    seenTitles.add(uniqueTitle.toLowerCase());

    return {
      id: `COMPLAINT_${t.id}`,
      title: uniqueTitle,
      description: description ? description.slice(0, 72) : undefined,
    };
  });

  rows.push({
    id: "COMPLAINT_OTHER",
    title: lang === "hi" ? "अन्य (टाइप करें)" : "Other (type manually)",
    description: lang === "hi" ? "अपनी समस्या लिखकर बताएं" : "Describe your issue",
  });

  rows.push(getBackRow(lang));

  return rows;
}


// ── MACHINE_CONFIRM ───────────────────────────────────────────────────────
async function handleMachineConfirm(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  const isYes =
    upper === "CONFIRM_MACHINE_YES" ||
    upper === "YES" ||
    upper === "1" ||
    upper.includes("YES") ||
    upper.includes("CORRECT");

  const isNo =
    upper === "CONFIRM_MACHINE_NO" ||
    upper === "NO" ||
    upper === "2" ||
    upper.includes("NO") ||
    upper.includes("INCORRECT");

  if (isYes) {
    const verifiedSerial = meta.candidateSerial || meta.serialNumber;
    const verifiedMachine = meta.candidateMachineData || meta.machineData;

    const confirmedMeta: SessionMeta = {
      ...meta,
      serialNumber: verifiedSerial,
      machineData: verifiedMachine,
      regSerialNumber: verifiedSerial,
      regMachineData: verifiedMachine,
      selectedProduct: verifiedMachine?.m_model || meta.selectedProduct,
      candidateSerial: undefined,
      candidateMachineData: undefined,
      tsSerialPath: true,
    };

    // If complaint description already exists, proceed to complaint registration
    if (confirmedMeta.complaint && !isGreetingOrSmallTalk(confirmedMeta.complaint)) {
      return startComplaintRegistration(sessionId, phoneNumber, confirmedMeta, lang);
    }

    // Otherwise, advance to COMPLAINT_DESCRIBE
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", confirmedMeta);
    return makeReply(
      `📝 *Please describe the issue you are facing with your machine:*\n\n` +
      `You can type the symptoms (e.g. _Vibro not working, T2 error, Rate chart not taking, Reading variation_) or send a voice note.`,
      [getMenuButton(lang)]
    );
  }

  if (isNo) {
    const clearedMeta: SessionMeta = {
      ...meta,
      serialNumber: undefined,
      machineData: null,
      candidateSerial: undefined,
      candidateMachineData: undefined,
      tsSerialPath: false,
    };
    await updateSession(sessionId, "COMPLAINT_ASK_SERIAL", clearedMeta);
    return makeReply(
      `🔧 *Please enter the correct serial number from your machine label:*\n\n(e.g., 251052615102)\n\nOr press *Skip* if you don't have the serial number handy.`,
      [getSkipButton(lang), getMenuButton(lang)]
    );
  }

  return makeReply(
    t("SELECT_VALID", lang),
    [
      { id: "CONFIRM_MACHINE_YES", title: "✅ Yes, Correct" },
      { id: "CONFIRM_MACHINE_NO", title: "❌ No, Incorrect" },
    ]
  );
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

  categoryRows.push(getBackRow(lang));

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
  const productRows = products.slice(0, 8).map((p, i) => ({ id: String(i + 1), title: p.name.slice(0, 24) }));
  productRows.push(getBackRow(lang));

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
  const directMatch = productNames.find(p => p.toLowerCase().includes(text.toLowerCase()));
  const selectedProduct = (!isNaN(index) && index >= 0 && index < productNames.length) ? productNames[index] : directMatch;

  if (!selectedProduct) {
    return showProductList(sessionId, meta, products);
  }

  const updatedMeta = { ...meta, selectedProduct };
  await updateSession(sessionId, "MAIN_MENU", updatedMeta);

  return makeReply(
    `📝 *Please describe the issue you are facing with your ${selectedProduct}:*\n\n` +
    `Example: _LED blinking, not heating, display not working, T2 error_`,
    [getMenuButton(lang)]
  );
}

// ── COMPLAINT_SUBCATEGORY ─────────────────────────────────────────────────
async function handleComplaintSubcategory(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  let subCategory = text.trim();

  const isOther =
    subCategory === "COMPLAINT_OTHER" ||
    subCategory === "Other (type manually)" ||
    subCategory === "Describe your issue" ||
    subCategory === "अन्य (टाइप करें)" ||
    subCategory === "अपनी समस्या लिखकर बताएं";

  if (isOther) {
    const updatedMeta = { ...meta, customComplaintPath: true };
    await updateSession(sessionId, "COMPLAINT_DESCRIBE", updatedMeta);
    return makeReply(t("DESCRIBE_SHORT", lang));
  }

  const updatedMeta = { ...meta, complaintSubcategory: subCategory };
  await updateSession(sessionId, "MAIN_MENU", updatedMeta);

  return makeReply(
    `📝 *Please describe the issue you are facing with your machine:*\n\n` +
    `Example: _LED blinking, not heating, display not working, T2 error_`,
    [getMenuButton(lang)]
  );
}

// ── COMPLAINT_DESCRIBE ────────────────────────────────────────────────────
async function handleComplaintDescribe(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.trim().toUpperCase();

  if (upper === "CANCEL" || upper === "MENU" || upper === "MAIN MENU" || upper === "MAIN_MENU" || upper === "BACK_MAIN") {
    await updateSession(sessionId, "MAIN_MENU", meta);
    return makeReply(t("MAIN_MENU_MSG", lang), undefined, await getContextualMainMenuList(phoneNumber, lang));
  }

  const updatedMeta: SessionMeta = { ...meta, complaint: text.trim(), lastIssueQuery: text.trim() };
  await updateSession(sessionId, "MAIN_MENU", updatedMeta);
  return runGroqCompanyAssistant(phoneNumber, text, updatedMeta, { sessionId, activeFsmState: "COMPLAINT_DESCRIBE" });
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
    await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", meta);
    return makeReply(
      t("ISSUE_RESOLVED", lang) + "\n\n" + t_extra("DO_YOU_HAVE_ANOTHER", lang),
      [
        getYesAnotherIssueButton(lang),
        getNoButton(lang),
        getMenuButton(lang)
      ]
    );
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
      const videos = meta.videoSearchQuery ? await findVideosForQuery(meta.videoSearchQuery, 1) : [];
      if (videos.length > 0) {
        await updateSession(sessionId, "ASK_VIDEO_TUTORIAL", meta);
        return makeReply(
          t("ALL_STEPS_DONE_BASE", lang) + "\n\n" + t("ASK_VIDEO_TUTORIAL", lang),
          [
            getShowVideoButton(lang),
            getNoBookServiceButton(lang),
          ]
        );
      }
      // All steps exhausted — fall back to book-service prompt
      await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", meta);
      return makeReply(
        t("ALL_STEPS_DONE", lang, { total: String(totalSteps) }),
        [getBookServiceButton(lang), getMenuButton(lang)]
      );
    }

    const updatedMeta: SessionMeta = { ...meta, tsCurrentStep: nextStep };
    await updateSession(sessionId, "TROUBLESHOOT_STEP", updatedMeta);

    const buttons: ReplyButton[] = [getYesResolvedButton(lang)];
    if (nextStep < totalSteps) buttons.push(getNextStepButton(lang));
    buttons.push(getBookServiceButton(lang));

    const stepContent = await translateText(steps[nextStep - 1], lang);
    return makeReply(
      t("STEP_DISPLAY", lang, { current: String(nextStep), total: String(totalSteps), step: stepContent }),
      buttons
    );
  }

  // Unrecognised input — re-show current step
  const buttons: ReplyButton[] = [getYesResolvedButton(lang)];
  if (currentStep < totalSteps) buttons.push(getNextStepButton(lang));
  buttons.push(getBookServiceButton(lang));

  const stepContent = await translateText(steps[currentStep - 1] ?? "", lang);
  return makeReply(
    t("STEP_DISPLAY", lang, { current: String(currentStep), total: String(totalSteps), step: stepContent }),
    buttons
  );
}

// ── TROUBLESHOOT_DONE_OPTIONS ─────────────────────────────────────────────
async function handleTroubleshootDoneOptions(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  // "Not Resolved" → show Book Service or Main Menu
  const isNotResolved =
    upper === "NOT_RESOLVED" ||
    upper === "NO" ||
    upper.includes("NOT RESOLVED") ||
    upper.includes("NOT_RESOLVED") ||
    upper.includes("UNRESOLVED") ||
    upper.includes("हल नहीं") ||
    upper.includes("தீர்க்கப்படவில்லை") ||
    upper.includes("ಪರಿಹರಿಸಲಾಗಿಲ್ಲ") ||
    upper.includes("सुटली नाही") ||
    upper.includes("పరిష్కరించబడలేదు") ||
    upper.includes("সমাধান হয়নি");

  if (isNotResolved) {
    const videos = meta.videoSearchQuery ? await findVideosForQuery(meta.videoSearchQuery, 1) : [];
    if (videos.length > 0) {
      await updateSession(sessionId, "ASK_VIDEO_TUTORIAL", meta);
      return makeReply(
        t("ASK_VIDEO_TUTORIAL", lang),
        [
          getShowVideoButton(lang),
          getNoBookServiceButton(lang),
          getMenuButton(lang),
        ]
      );
    }

    await updateSession(sessionId, "ASK_BOOK_SERVICE", meta);
    return makeReply(
      t("ASK_BOOK_SERVICE", lang),
      [
        getBookServiceButton(lang),
        getMenuButton(lang),
      ],
    );
  }

  const isResolved =
    (upper === "RESOLVED" ||
      upper === "YES" ||
      upper.includes("RESOLVED") ||
      upper.includes("हल हुआ") ||
      upper.includes("தீர்க்கப்பட்டது") ||
      upper.includes("ಪರಿಹರಿಸಲಾಗಿದೆ") ||
      upper.includes("सुटली") ||
      upper.includes("పరిష్కరించబడింది") ||
      upper.includes("সমাধান হয়েছে")) &&
    !upper.includes("NOT");

  if (isResolved) {
    await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", meta);
    return makeReply(
      t("ISSUE_RESOLVED", lang) + "\n\n" + t_extra("DO_YOU_HAVE_ANOTHER", lang),
      [
        getYesAnotherIssueButton(lang),
        getNoButton(lang),
        getMenuButton(lang)
      ]
    );
  }

  // Direct Book Service (from NO_STEPS flow where there are no troubleshoot steps)
  if (upper === "BOOK_SERVICE" || upper.includes("BOOK SERVICE") || upper.includes("सेवा बुक")) {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  if (text.trim().length >= 3 && !upper.includes("MENU")) {
    return handleComplaintDescribe(sessionId, phoneNumber, meta, text);
  }

  return makeReply(
    t_extra("FLOW_INTERRUPTED", lang),
    [
      getYesResolvedButton(lang),
      getNotResolvedButton(lang),
      getMenuButton(lang),
    ]
  );
}

// ── ASK_VIDEO_TUTORIAL ───────────────────────────────────────────────────
async function handleAskVideoTutorial(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  const isYes = upper === "YES" || upper.includes("SHOW VIDEO") || upper.includes("वीडियो दिखाएं");
  const isNo = upper === "NO" || upper === "BOOK_SERVICE" || upper.includes("BOOK SERVICE") || upper.includes("सेवा बुक");

  if (isYes) {
    const videos = meta.videoSearchQuery ? await findVideosForQuery(meta.videoSearchQuery, 3) : [];
    if (videos.length === 0) {
      await updateSession(sessionId, "ASK_BOOK_SERVICE", meta);
      return makeReply(
        t("ASK_BOOK_SERVICE", lang),
        [getBookServiceButton(lang), getMenuButton(lang)]
      );
    }

    const videoMessage = formatVideoSuggestions(videos, lang).trim();
    await updateSession(sessionId, "VIDEO_HELPED", meta);

    return makeReply(
      videoMessage + "\n\n" + t("ASK_VIDEO_HELPED", lang),
      [
        getYesResolvedButton(lang),
        getNoBookServiceButton(lang),
        getMenuButton(lang),
      ]
    );
  }

  if (isNo) {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  return makeReply(
    t_extra("FLOW_INTERRUPTED", lang),
    [
      getShowVideoButton(lang),
      getNoBookServiceButton(lang),
      getMenuButton(lang),
    ]
  );
}

// ── VIDEO_HELPED ──────────────────────────────────────────────────────────
async function handleVideoHelped(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  const isYes =
    upper === "YES" ||
    upper === "RESOLVED" ||
    upper.includes("RESOLVED") ||
    upper.includes("हल हुआ");

  const isNo =
    upper === "NO" ||
    upper === "BOOK_SERVICE" ||
    upper.includes("BOOK SERVICE") ||
    upper.includes("सेवा बुक");

  if (isYes) {
    await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", meta);
    return makeReply(
      t("ISSUE_RESOLVED", lang) + "\n\n" + t_extra("DO_YOU_HAVE_ANOTHER", lang),
      [
        getYesAnotherIssueButton(lang),
        getNoButton(lang),
        getMenuButton(lang)
      ]
    );
  }

  if (isNo) {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  return makeReply(
    t_extra("FLOW_INTERRUPTED", lang),
    [
      getYesResolvedButton(lang),
      getNoBookServiceButton(lang),
      getMenuButton(lang),
    ]
  );
}

// ── ANOTHER_COMPLAINT_PROMPT ───────────────────────────────────────────────
async function handleAnotherComplaintPrompt(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  const isYes =
    upper === "YES" ||
    upper === "ANOTHER_YES" ||
    upper.includes("ANOTHER") ||
    upper.includes("दूसरी");

  const isNo =
    upper === "NO" ||
    upper === "ANOTHER_NO" ||
    upper.includes("THANK") ||
    upper.includes("नहीं");

  if (isYes) {
    const updatedMeta: SessionMeta = { ...meta, complaint: undefined, lastIssueQuery: undefined, videoSearchQuery: undefined };
    await updateSession(sessionId, "MAIN_MENU", updatedMeta);

    return makeReply(
      `📝 *Please describe the new issue you are facing with your machine:*\n\n` +
      `Example: _LED blinking, not heating, display not working, T2 error_`,
      [getMenuButton(lang)]
    );
  }

  if (isNo) {
    await updateSession(sessionId, "COMPLETED", {});
    return makeReply(t_extra("THANK_YOU", lang), [getMenuButton(lang)]);
  }

  // If user types a freeform question/issue instead of clicking Yes/No button:
  if (text.length >= 2 && !upper.startsWith("ANOTHER_")) {
    const isTech = isTechnicalIssueQuery(text);
    const updatedMeta: SessionMeta = {
      ...meta,
      complaint: isTech ? text.trim() : undefined,
      videoSearchQuery: isTech ? text.trim() : undefined,
      lastIssueQuery: isTech ? text.trim() : undefined,
      tsSteps: undefined,
      tsCurrentStep: undefined,
    };
    await updateSession(sessionId, "MAIN_MENU", updatedMeta);
    return runGroqCompanyAssistant(phoneNumber, text, updatedMeta, { sessionId });
  }

  return makeReply(
    t_extra("FLOW_INTERRUPTED", lang),
    [
      getRegisterAnotherComplaintButton(lang),
      getNoButton(lang),
      getMenuButton(lang)
    ]
  );
}

// ── ASK_BOOK_SERVICE (intermediate: after "Not Resolved") ─────────────────
async function handleAskBookService(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  const isBook = upper === "BOOK_SERVICE" || upper.includes("BOOK") || upper.includes("सेवा बुक");

  if (isBook) {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  if (upper === "MENU") {
    return startGreeting(phoneNumber);
  }

  return makeReply(
    t_extra("FLOW_INTERRUPTED", lang),
    [
      getBookServiceButton(lang),
      getMenuButton(lang),
    ],
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
  if (!resolved || !resolved.place) {
    return makeReply(t("PINCODE_NOT_FOUND", lang, { pincode: digits }));
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    manualPincode: digits,
    manualPlace: resolved.place,
    manualDistrict: resolved.district,
    manualState: resolved.state,
    pincodeDisplay: resolved.display,
  };

  return showManualPincodeConfirm(sessionId, updatedMeta);
}

async function showManualPincodeConfirm(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  await updateSession(sessionId, "COMPLAINT_MANUAL_PINCODE_CONFIRM", meta);
  return makeReply(
    t("PINCODE_CONFIRM", lang, {
      location: pincodeLocationDisplay(meta),
      pincode: meta.manualPincode || "",
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
      manualPincode: undefined,
      manualPlace: undefined,
      manualDistrict: undefined,
      manualState: undefined,
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
  const loc = extractGmapLink(text);
  let address = text.trim();
  let gmapLink = meta.manualGmapLink || meta.regGmapLink;

  if (loc && loc.mapLink) {
    gmapLink = loc.mapLink;
    address = loc.addressText || loc.mapLink;
  } else if (address.length < 5) {
    return makeReply(t("SHORT_ADDRESS", lang));
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    manualAddress: address,
    manualGmapLink: gmapLink,
    regGmapLink: gmapLink || meta.regGmapLink,
  };

  // If machine serial number is not set yet, ask for it with a Skip button
  if (!updatedMeta.serialNumber && !updatedMeta.machineData) {
    await updateSession(sessionId, "COMPLAINT_ASK_SERIAL", updatedMeta);
    return makeReply(
      `🔢 *Please enter your Machine Serial Number:*\n(e.g., 2410-0012)\n\nOr press *Skip* if you don't have the serial number handy.`,
      [
        { id: "SKIP", title: "⏭️ Skip Serial No." },
        getMenuButton(lang),
      ]
    );
  }

  return startComplaintRegistration(sessionId, phoneNumber, updatedMeta, lang);
}

// ── End-customer details (after Book Service on Passtest path) ────────────
function endCustomerName(meta: SessionMeta): string | undefined {
  return meta.manualName?.trim() || meta.customerName?.trim() || meta.regName?.trim();
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

/** Reuse name + pincode from active User profile on this WhatsApp number ONLY. */
async function loadSavedEndCustomer(phoneNumber: string): Promise<Partial<SessionMeta> | null> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  // Check User table ONLY
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { whatsappNumber: { contains: last10 } },
        { whatsappNumber: phoneNumber },
        { whatsappNumber: "91" + last10 },
        { whatsappNumber: "+91" + last10 },
      ],
    },
    include: { pincode: true },
  });

  if (!user) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const pc = user.pincode;
  const place = pc?.place;
  const district = pc?.district;
  const state = pc?.state;
  const code = pc?.code;

  if (!name && !code) return null;

  return {
    manualName: name || undefined,
    customerName: name || undefined,
    manualPincode: code || undefined,
    regPincode: code || undefined,
    manualPlace: place || undefined,
    regPlace: place || undefined,
    manualDistrict: district || undefined,
    regDistrict: district || undefined,
    manualState: state || undefined,
    regState: state || undefined,
    pincodeDisplay: [place, district, state].filter(Boolean).join(", ") || code || undefined,
  };
}

export function sanitizeForJson<T>(obj: T): T {
  if (typeof obj === "string") {
    const str = obj as string;
    return (typeof (str as any).toWellFormed === "function"
      ? (str as any).toWellFormed()
      : str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")) as unknown as T;
  }
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForJson) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeForJson(value);
  }
  return result as T;
}

export function extractGmapLink(text: string): { mapLink?: string; addressText?: string } | null {
  if (!text) return null;
  let clean = text.trim();
  if (clean.startsWith("📍 Location Shared:\n")) {
    clean = clean.replace("📍 Location Shared:\n", "").trim();
  } else if (clean.startsWith("📍")) {
    clean = clean.slice(1).trim();
  }

  const urlMatch = clean.match(/(https?:\/\/[^\s]+|maps\.google[^\s]+|goo\.gl[^\s]+)/i);
  if (urlMatch) {
    let mapLink = urlMatch[0];
    if (!mapLink.startsWith("http://") && !mapLink.startsWith("https://")) {
      mapLink = `https://${mapLink}`;
    }
    const addressText = clean.replace(urlMatch[0], "").replace(/[\n\r]+/g, ", ").trim().replace(/^,\s*|,\s*$/g, "");
    return { mapLink, addressText: addressText || undefined };
  }

  const coordsMatch = clean.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
  if (coordsMatch) {
    const lat = coordsMatch[1];
    const lng = coordsMatch[2];
    const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
    const addressText = clean.replace(coordsMatch[0], "").trim();
    return { mapLink, addressText: addressText || undefined };
  }

  return null;
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
  const name = endCustomerName(meta) || meta.regName?.trim() || meta.customerName?.trim() || "Customer";
  const pincode = meta.manualPincode || meta.regPincode || "N/A";
  const loc = pincodeLocationDisplay(meta);
  const address = meta.manualAddress?.trim() || meta.regAddress?.trim() || (loc !== "N/A" ? loc : "N/A");
  const gmapLink = meta.manualGmapLink || meta.regGmapLink;
  const gmapPart = gmapLink ? `, Google Maps: ${gmapLink}` : "";
  const base = `End customer: ${name}, Address: ${address}, Service area: ${loc}, Pincode: ${pincode}${gmapPart}`;
  return extra ? `${base}, ${extra}` : base;
}

async function showPasstestPincodeConfirm(sessionId: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  await updateSession(sessionId, "PASSTEST_PINCODE_CONFIRM", meta);
  return makeReply(
    t("PINCODE_CONFIRM", lang, {
      location: pincodeLocationDisplay(meta),
      pincode: meta.manualPincode || "",
    }),
    getYesNoButtons(lang),
  );
}

async function beginPasstestTicketBooking(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;

  let workingMeta = meta;

  // Pre-populate manualAddress from Passtest machine address if available and not already set
  if (workingMeta.machineData && !workingMeta.manualAddress?.trim()) {
    const addr1 = workingMeta.machineData.Address1 || "";
    const addr2 = workingMeta.machineData.Address2 || "";
    const fullAddress = [addr1, addr2].filter(Boolean).join(", ");
    if (fullAddress) {
      workingMeta.manualAddress = fullAddress;
    }
  }

  // Extract pincode from Passtest address if missing, BEFORE falling back to saved customer
  if (!workingMeta.manualPincode && workingMeta.manualAddress) {
    const extracted = extractPincodeFromAddress(workingMeta.manualAddress);
    if (extracted) {
      const resolved = await fetchPlaceFromPincode(extracted);
      if (resolved && resolved.place) { // Only automatically resolve if pincode is valid and has a location
        workingMeta = {
          ...workingMeta,
          manualPincode: extracted,
          manualPlace: resolved.place,
          manualDistrict: resolved.district,
          manualState: resolved.state,
          pincodeDisplay: resolved.display,
          skipEndCustomerConfirm: false, // Must confirm the automatically fetched pincode
        };
      }
    }
  }

  if (!endCustomerName(workingMeta) || !workingMeta.manualPincode) {
    const saved = await loadSavedEndCustomer(phoneNumber);
    if (saved) {
      workingMeta = { ...workingMeta, ...saved, skipEndCustomerConfirm: false }; // Must confirm if using saved location for a Passtest machine
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

async function handlePasstestCustomerName(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  if (text.length < 2) {
    return makeReply(t("SHORT_NAME", lang));
  }
  const updatedMeta: SessionMeta = { ...meta, manualName: text.trim(), customerName: text.trim() };
  return beginPasstestTicketBooking(sessionId, phoneNumber, updatedMeta);
}

async function handlePasstestPincode(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const digits = text.replace(/\D/g, "");
  if (!/^\d{6}$/.test(digits)) {
    return makeReply(t("INVALID_PINCODE", lang));
  }

  const resolved = await fetchPlaceFromPincode(digits);
  if (!resolved || !resolved.place) {
    return makeReply(t("PINCODE_NOT_FOUND", lang, { pincode: digits }));
  }

  const updatedMeta: SessionMeta = {
    ...meta,
    manualPincode: digits,
    manualPlace: resolved.place,
    manualDistrict: resolved.district,
    manualState: resolved.state,
    pincodeDisplay: resolved.display,
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
    if (meta.manualAddress?.trim()) {
      return executePasstestTicketCreation(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", meta);
    return makeReply(t("ENTER_ADDRESS", lang));
  }
  if (text === "2" || /^no/i.test(text)) {
    const clearedMeta: SessionMeta = {
      ...meta,
      manualPincode: undefined,
      manualPlace: undefined,
      manualDistrict: undefined,
      manualState: undefined,
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

export async function findDocumentIssue(
  complaintText: string,
  productName: string,
  audienceFilter: string[] = ["customer", "both"],
) {
  const include = { steps: { orderBy: { stepNumber: "asc" as const } } };

  // 1. Try vector semantic search first
  const query = productName ? `${productName} ${complaintText}` : complaintText;
  if (query.trim()) {
    try {
      const embedding = await embedText(query);
      const results = await searchVectors(embedding, 5);

      const bestWithTag = results.find(r => r.score >= 0.5 && r.payload?.tag);
      if (bestWithTag) {
        const tag = bestWithTag.payload.tag as string;
        const match = await prisma.documentIssue.findUnique({
          where: { problemType: tag },
          include,
        });
        if (match && audienceFilter.includes(match.audience) && match.steps.length > 0) {
          return match;
        }
      }
    } catch (e) {
      console.error("[simulate] vector search failed:", e);
    }
  }

  // Search by title/description/problemType, hard-filtered by audience.
  async function findByText(text: string) {
    if (!text.trim()) return null;
    const cleanText = text.trim();
    const match = await prisma.documentIssue.findFirst({
      where: {
        isActive: true,
        audience: { in: audienceFilter },
        OR: [
          { title: { contains: cleanText, mode: "insensitive" } },
          { description: { contains: cleanText, mode: "insensitive" } },
          { problemType: { contains: cleanText.toLowerCase().replace(/\s+/g, "_"), mode: "insensitive" } },
        ],
      },
      include,
    });
    return match && match.steps.length > 0 ? match : null;
  }

  // 2. Match full complaint phrase
  if (complaintText.trim()) {
    const phraseMatch = await findByText(complaintText.trim());
    if (phraseMatch) return phraseMatch;

    // 3. Try individual significant words (≥2 chars)
    const words = complaintText
      .split(/\s+/)
      .filter((w: string) => w.length >= 2 && !/^(the|and|for|in|on|at|to|a|an|is|of|with|not|how|what|why|show|shown|issue|problem|machine)$/i.test(w));
    for (const word of words) {
      const wordMatch = await findByText(word);
      if (wordMatch) return wordMatch;
    }

    // Fallback: also try all words ≥2 chars
    const allWords = complaintText.split(/\s+/).filter((w: string) => w.length >= 2);
    for (const word of allWords) {
      const wordMatch = await findByText(word);
      if (wordMatch) return wordMatch;
    }
  }

  // 4. Match by product name (title or problemType)
  if (productName.trim()) {
    const productMatch = await prisma.documentIssue.findFirst({
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
    }).catch(() => { });
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
    }).catch(() => { });
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

  if (!endCustomerName(meta) || !meta.manualPincode) {
    await updateSession(sessionId, "END_CUSTOMER_ADDRESS", meta);
    return makeReply(t("ENTER_ADDRESS", lang));
  }

  const md = (meta.machineData as any) || { m_model: meta.selectedProduct || "Machine", customer: meta.customerName || meta.regName || "Customer", serial_no: meta.serialNumber || "N/A" };
  const pincodeCode = meta.manualPincode || meta.regPincode || "682001";
  const placeName = meta.manualPlace || meta.regPlace;
  const districtName = meta.manualDistrict || meta.regDistrict;
  const stateName = meta.manualState || meta.regState;
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
        code: pincodeCode,
        place: placeName || null,
        district: districtName || null,
        state: stateName || null,
      },
    });
  } else if (placeName || districtName || stateName) {
    pincodeRecord = await prisma.pincode.update({
      where: { id: pincodeRecord.id },
      data: {
        place: placeName || pincodeRecord.place,
        district: districtName || pincodeRecord.district,
        state: stateName || pincodeRecord.state,
      },
    });
  }
  pincodeId = pincodeRecord.id;

  // Auto-register customer as User (role: customer) if not already registered
  const customerUser = await getOrCreateCustomerUser(
    phoneNumber,
    meta.customerName || meta.manualName || "Customer",
    pincodeId
  );

  // Save/upsert machine under customer / fleet registry
  if (serial && serial.trim()) {
    await prisma.machine.upsert({
      where: { serialNumber: serial.trim() },
      create: { serialNumber: serial.trim(), modelName: productName || "Machine", isActive: true },
      update: { modelName: productName || "Machine" },
    }).catch(() => {});
  }

  const locString = [placeName, districtName, stateName].filter(Boolean).join(", ");
  const gmapLink = meta.regGmapLink || meta.manualGmapLink || "";
  const baseAddr = meta.manualAddress?.trim() || meta.regAddress?.trim() || locString || (pincodeCode ? `Pincode: ${pincodeCode}` : "");
  const finalAddress = baseAddr ? `${baseAddr}${gmapLink ? " | Map: " + gmapLink : ""}` : gmapLink;

  const ticket = await TicketService.createTicket({
    customerId: customerUser.id,
    problemDescription: `${productName ? productName + ": " : ""}${complaintText}`,
    issueDescription: buildEndCustomerIssueDescription(meta, dealerExtra),
    machineName: md.m_model || productName || undefined,
    machineSerialNumber: serial,
    pincodeId,
    phoneNumber,
    place: meta.manualPlace,
    district: meta.manualDistrict,
    state: meta.manualState,
    customerAddress: finalAddress,
    mediaUrls: meta.mediaUrls || (meta.complaintMediaUrl ? [meta.complaintMediaUrl] : []),
  });

  if (ticket.ownerType === "DEALER" && ticket.ownerId) {
    io?.to(`dealer:${ticket.ownerId}`).emit("ticket:new", ticket);
  } else {
    io?.to("managers").emit("ticket:new", ticket);
  }

  const clearedMeta: SessionMeta = {
    customerName: meta.customerName || meta.manualName,
    customerPhone: meta.customerPhone || phoneNumber,
    selectedProduct: meta.selectedProduct,
    productCategory: meta.productCategory,
    machineData: meta.machineData,
    serialNumber: meta.serialNumber,
    tsSerialPath: meta.tsSerialPath,
    manualName: meta.manualName,
    manualPincode: meta.manualPincode,
    manualPlace: meta.manualPlace,
    manualDistrict: meta.manualDistrict,
    manualState: meta.manualState,
    manualAddress: meta.manualAddress,
    pincodeDisplay: meta.pincodeDisplay,
    language: meta.language,
  };
  await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", clearedMeta);

  return makeReply(
    t("TICKET_CONFIRMED", lang, {
      ticket: ticket.ticketNumber,
      product: productName || "N/A",
      issue: complaintText,
      location: pincodeLocationDisplay(meta),
    }),
    [getCheckStatusButton(lang), getMenuButton(lang)]
  );
}

// ── Ticket creation: manual entry ─────────────────────────────────────────
async function createTicketManual(sessionId: string, phoneNumber: string, meta: SessionMeta) {
  const lang: Lang = (meta.language ?? "en") as Lang;

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

  // Auto-register customer as User (role: customer) if not already registered
  const customerUser = await getOrCreateCustomerUser(
    phoneNumber,
    meta.customerName || meta.manualName || "Customer",
    pincodeId
  );

  // Save/upsert machine under customer / fleet registry
  if (meta.serialNumber && meta.serialNumber.trim()) {
    await prisma.machine.upsert({
      where: { serialNumber: meta.serialNumber.trim() },
      create: { serialNumber: meta.serialNumber.trim(), modelName: productName || "Machine", isActive: true },
      update: { modelName: productName || "Machine" },
    }).catch(() => {});
  }

  const ticket = await TicketService.createTicket({
    customerId: customerUser.id,
    problemDescription: `${productName ? productName + ": " : ""}${complaintText}`,
    issueDescription: buildEndCustomerIssueDescription(meta),
    machineName: productName || undefined,
    machineSerialNumber: meta.serialNumber || undefined,
    pincodeId,
    phoneNumber,
    place: meta.manualPlace,
    district: meta.manualDistrict,
    state: meta.manualState,
    customerAddress: `${meta.manualAddress?.trim() || [meta.manualPlace, meta.manualDistrict, meta.manualState].filter(Boolean).join(", ")}${(meta.regGmapLink || meta.manualGmapLink) ? " | Map: " + (meta.regGmapLink || meta.manualGmapLink) : ""}`,
  });

  io?.to("managers").emit("ticket:new", ticket);

  const clearedMeta: SessionMeta = {
    customerName: meta.customerName || meta.manualName,
    customerPhone: meta.customerPhone || phoneNumber,
    selectedProduct: meta.selectedProduct,
    productCategory: meta.productCategory,
    machineData: meta.machineData,
    serialNumber: meta.serialNumber,
    tsSerialPath: meta.tsSerialPath,
    manualName: meta.manualName,
    manualPincode: meta.manualPincode,
    manualPlace: meta.manualPlace,
    manualDistrict: meta.manualDistrict,
    manualState: meta.manualState,
    manualAddress: meta.manualAddress,
    pincodeDisplay: meta.pincodeDisplay,
    language: meta.language,
  };
  await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", clearedMeta);

  return makeReply(
    t("TICKET_CONFIRMED", lang, {
      ticket: ticket.ticketNumber,
      product: productName || "N/A",
      issue: complaintText,
      location: [meta.manualPlace, meta.manualDistrict, meta.manualState].filter(Boolean).join(", ") || meta.pincodeDisplay || "N/A",
    }),
    [getCheckStatusButton(lang), getMenuButton(lang)]
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
  if (upper === "LANG_TA" || upper === "TAMIL" || text === "தமிழ்") {
    const newMeta: SessionMeta = { ...meta, language: "ta" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_TA", "ta") + "\n\n" + t("MAIN_MENU_MSG", "ta"),
      undefined,
      getMainMenuList("ta"),
    );
  }
  if (upper === "LANG_KN" || upper === "KANNADA" || text === "ಕನ್ನಡ") {
    const newMeta: SessionMeta = { ...meta, language: "kn" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_KN", "kn") + "\n\n" + t("MAIN_MENU_MSG", "kn"),
      undefined,
      getMainMenuList("kn"),
    );
  }
  if (upper === "LANG_MR" || upper === "MARATHI" || text === "मराठी") {
    const newMeta: SessionMeta = { ...meta, language: "mr" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_MR", "mr") + "\n\n" + t("MAIN_MENU_MSG", "mr"),
      undefined,
      getMainMenuList("mr"),
    );
  }
  if (upper === "LANG_TE" || upper === "TELUGU" || text === "తెలుగు") {
    const newMeta: SessionMeta = { ...meta, language: "te" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_TE", "te") + "\n\n" + t("MAIN_MENU_MSG", "te"),
      undefined,
      getMainMenuList("te"),
    );
  }
  if (upper === "LANG_BN" || upper === "BENGALI" || text === "বাংলা") {
    const newMeta: SessionMeta = { ...meta, language: "bn" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_BN", "bn") + "\n\n" + t("MAIN_MENU_MSG", "bn"),
      undefined,
      getMainMenuList("bn"),
    );
  }
  if (upper === "LANG_ML" || upper === "ML" || upper === "MALAYALAM" || text === "മലയാളം") {
    const newMeta: SessionMeta = { ...meta, language: "ml" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_ML", "ml") + "\n\n" + t("MAIN_MENU_MSG", "ml"),
      undefined,
      getMainMenuList("ml"),
    );
  }
  if (upper === "CHANGE_LANGUAGE") {
    return makeReply(t("LANG_SELECT", lang), undefined, getLangList(lang));
  }
  // Unrecognized input → waiting-for-input nudge with list
  return makeReply(
    t("WAITING_INPUT", lang),
    [
      getMenuButton(lang),
      {
        id: "CHANGE_LANGUAGE", title: lang === "hi" ? "🌐 भाषा बदलें" : (
          lang === "ta" ? "🌐 மொழியை மாற்றவும்" : (
            lang === "kn" ? "🌐 ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ" : (
              lang === "mr" ? "🌐 भाषा बदला" : (
                lang === "te" ? "🌐 भाषा మార్చండి" : (
                  lang === "bn" ? "🌐 ভাষা পরিবর্তন" : "🌐 Change Language"
                )
              )
            )
          )
        )
      },
      {
        id: "CLOSE", title: lang === "hi" ? "❌ बंद करें" : (
          lang === "ta" ? "❌ மூடு" : (
            lang === "kn" ? "❌ ಮುಚ್ಚಿ" : (
              lang === "mr" ? "❌ बंद करा" : (
                lang === "te" ? "❌ మూసివేయి" : (
                  lang === "bn" ? "❌ বন্ধ করুন" : "❌ Close"
                )
              )
            )
          )
        )
      },
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
  listMenu?: ReplyList;
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
  return { message, buttons, list, listMenu: list, images, followUpMessage };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

function countMetaKeys(meta: any): number {
  return Object.keys(meta || {}).filter(
    (k) => k !== "_count" && k !== "_type" && typeof meta[k] !== "undefined",
  ).length;
}

// ── Session helpers ────────────────────────────────────────────────────────
async function findBestSession(phoneNumber: string) {
  const digits = normalizePhone(phoneNumber);
  const raw = phoneNumber.replace(/\D/g, "");
  const plus91 = "+91" + digits;
  const with91 = "91" + digits;
  const candidates = await prisma.conversationSession.findMany({
    where: {
      OR: [
        { phoneNumber },
        { phoneNumber: digits },
        { phoneNumber: raw },
        { phoneNumber: with91 },
        { phoneNumber: plus91 },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  if (candidates.length === 0) return null;

  // Prefer non-COMPLETED sessions; among those, pick the richest metadata
  const active = candidates.filter((s) => s.state !== "COMPLETED");
  const pool = active.length > 0 ? active : candidates;
  return pool.sort((a, b) => countMetaKeys(b.metadata) - countMetaKeys(a.metadata))[0];
}

export async function getOrCreateSession(phoneNumber: string) {
  const digits = normalizePhone(phoneNumber);
  const best = await findBestSession(phoneNumber);

  if (best) {
    // Normalize phone number format for consistency
    if (best.phoneNumber !== digits) {
      await prisma.conversationSession.update({
        where: { id: best.id },
        data: { phoneNumber: digits },
      });
      // Delete other duplicate sessions for this customer (keep completed history)
      const allCandidates = await prisma.conversationSession.findMany({
        where: {
          OR: [
            { phoneNumber },
            { phoneNumber: "91" + digits },
            { phoneNumber: "+91" + digits },
            { phoneNumber: digits },
          ],
        },
      });
      const others = allCandidates.filter((s) => s.id !== best.id && s.state !== "COMPLETED");
      if (others.length > 0) {
        await prisma.conversationSession.deleteMany({
          where: { id: { in: others.map((s) => s.id) } },
        });
      }
    }
    return best;
  }

  // No existing session — create a fresh one
  return prisma.conversationSession.create({
    data: {
      phoneNumber: digits,
      state: "GREETING",
      isBotPaused: false,
      supportAgentId: null,
    },
  });
}

export async function updateSession(id: string, state: string, meta: SessionMeta) {
  return prisma.conversationSession.update({
    where: { id },
    data: { state, metadata: sanitizeForJson(meta) as object },
  });
}

// ── History (kept for frontend) ───────────────────────────────────────────
export async function getHistory(phoneNumber: string) {
  return prisma.simulateMessage.findMany({
    where: { phoneNumber },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
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
