// ── Shared Types & Helpers for Service Engineer WhatsApp Flow ───────────────

import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import * as WhatsAppService from "./whatsapp.service";
import { translateText } from "./translate.service";
import type { WaButton, WaListRow } from "./whatsapp.service";
import {
  formatCustomerPhoneDisplay,
  getTicketComplaintText,
  resolveTicketCustomerName,
  resolveTicketContactPerson,
  resolveTicketOrganization,
  resolveTicketCustomerPhone,
} from "../lib/ticket-customer";

export const ENG_PREFIX = {
  START: "ENG_START:",
  SEL: "ENG_SEL:",
  OTP: "ENG_OTP:",
  VERIFY_PROMPT: "ENG_VERIFY_PROMPT:",
  RESEND: "ENG_RESEND:",
  DIAG: "ENG_DIAG:",
  WDONE: "ENG_WDONE:",
  PART: "ENG_PART:",
  WARR_YES: "ENG_WARR_YES:",
  WARR_NO: "ENG_WARR_NO:",
  RPT: "ENG_RPT:",
  TEST_CLOSE: "ENG_TEST_CLOSE:",
  TS_GUIDE: "ENG_TS_GUIDE",
  TS_PROB: "ENG_TS_PROB:",
  TS_VIDEOS: "ENG_TS_VIDEOS",
  TS_QUIT: "ENG_TS_QUIT",
  PARTS_PRICING: "ENG_PARTS_PRICING",
  ASSIGN_STATUS: "ENG_ASSIGN_STATUS:",
  NEW_TICKETS: "ENG_NEW_TICKETS",
  ACTIVE_TICKETS: "ENG_ACTIVE_TICKETS",
  MY_TICKETS: "ENG_MY_TICKETS",
  MENU: "ENG_MENU",
} as const;

export const ENGINEER_ACTIVE_TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  status: true,
  problemDescription: true,
  issueDescription: true,
  machineName: true,
  machineSerialNumber: true,
  machineCustomer: true,
  machineAddress1: true,
  machineAddress2: true,
  customerAddress: true,
  phoneNumber: true,
  createdAt: true,
  updatedAt: true,
  assignedEngineerId: true,
  customer: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
  pincode: {
    select: { id: true, code: true, place: true, district: true, state: true },
  },
  assignedManager: {
    select: { id: true, firstName: true, lastName: true },
  },
  assignedEngineer: {
    select: { id: true, firstName: true, lastName: true, whatsappNumber: true },
  },
} as const;

export type EngineerTicketRow = {
  id: string;
  ticketNumber: string;
  status: string;
  problemDescription: string;
  issueDescription: string | null;
  machineName: string | null;
  machineSerialNumber: string | null;
  machineCustomer: string | null;
  machineAddress1: string | null;
  machineAddress2: string | null;
  customerAddress: string | null;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedEngineerId: string | null;
  customer?: { id: string; firstName: string; lastName: string | null; role: string } | null;
  pincode?: { id: string; code: string; place: string | null; district: string | null; state: string | null } | null;
  assignedManager?: { id: string; firstName: string; lastName: string | null } | null;
  assignedEngineer?: { id: string; firstName: string; lastName: string | null; whatsappNumber: string | null } | null;
};

export type EngLang = "en" | "hi" | "ta" | "ml" | "kn" | "mr" | "te" | "bn";

export async function getEngineerLanguage(phone: string): Promise<EngLang> {
  try {
    const session = await prisma.conversationSession.findFirst({ where: { phoneNumber: phone } });
    if (session && session.metadata) {
      const meta = session.metadata as any;
      if (meta.language) return meta.language as EngLang;
    }
  } catch {}
  return "en";
}

// ── Button & List Helpers for WhatsApp (Strictly <= 20 chars for buttons) ──

export function getEngMainMenuButtons(lang: EngLang = "en"): WaButton[] {
  const tickets: Record<EngLang, string> = {
    en: "📋 View Tickets",
    ml: "📋 ടിക്കറ്റുകൾ",
    hi: "📋 टिकट देखें",
    ta: "📋 டிக்கெட்டுகள்",
    kn: "📋 ಟಿಕೆಟ್‌ಗಳು",
    mr: "📋 तिकिटे पहा",
    te: "📋 టిక్కెట్లు",
    bn: "📋 টিকিট দেখুন",
  };
  const trainingVideos: Record<EngLang, string> = {
    en: "🎓 Training Videos",
    ml: "🎓 പരിശീലനം",
    hi: "🎓 प्रशिक्षण वीडियो",
    ta: "🎓 பயிற்சி வீடியோ",
    kn: "🎓 ತರಬೇತಿ ವೀಡಿಯೊ",
    mr: "🎓 प्रशिक्षण",
    te: "🎓 శిక్షణ వీడియోలు",
    bn: "🎓 প্রশিক্ষণ ভিডিও",
  };
  const changeLang: Record<EngLang, string> = {
    en: "🌐 Language",
    ml: "🌐 ഭാഷ മാറ്റുക",
    hi: "🌐 भाषा बदलें",
    ta: "🌐 மொழி மாற்றம்",
    kn: "🌐 ಭಾಷೆ ಬದಲಿಸಿ",
    mr: "🌐 भाषा बदला",
    te: "🌐 భాష మార్చండి",
    bn: "🌐 ভাষা পরিবর্তন",
  };
  return [
    { id: "TICKETS", title: tickets[lang] || tickets.en },
    { id: "TRAINING_VIDEOS", title: trainingVideos[lang] || trainingVideos.en },
    { id: "CHANGE_LANG", title: changeLang[lang] || changeLang.en },
  ];
}

export interface TrainingVideoItem {
  id: string;
  title: string;
  description?: string | null;
  youtubeUrl: string;
  topic: string;
}

export function formatTrainingVideoListMessage(
  videos: TrainingVideoItem[],
  lang: EngLang = "en"
): string {
  const headings: Record<EngLang, string> = {
    en: `🎓 *Poornasree Engineer Training Videos* (${videos.length} Available)\n\n_Reply with a video number (e.g. *1*, *7*, *12*) or choose from the list below:_`,
    ml: `🎓 *പൂർണ്ണശ്രീ എഞ്ചിനീയർ ട്രെയിനിംഗ് വീഡിയോകൾ* (${videos.length} എണ്ണം ലഭ്യമാണ്)\n\n_ഒരു വീഡിയോ നമ്പർ ടൈപ്പ് ചെയ്യുക (ഉദാ: *1*, *7*, *12*) അല്ലെങ്കിൽ താഴെ നിന്ന് തിരഞ്ഞെടുക്കുക:_`,
    hi: `🎓 *पूर्णश्री इंजीनियर प्रशिक्षण वीडियो* (${videos.length} उपलब्ध)\n\n_वीडियो नंबर टाइप करें (उदा: *1*, *7*, *12*) या नीचे सूची से चुनें:_`,
    ta: `🎓 *பூர்ணஸ்ரீ இன்ஜினியர் பயிற்சி வீடியோக்கள்* (${videos.length} உள்ளது)\n\n_வீடியோ எண்ணை உள்ளிடவும் (எ.கா: *1*, *7*, *12*) அல்லது கீழே தேர்ந்தெடுக்கவும்:_`,
    kn: `🎓 *ಪೂರ್ಣಶ್ರೀ ಇಂಜಿನಿಯರ್ ತರಬೇತಿ ವೀಡಿಯೊಗಳು* (${videos.length} ಲಭ್ಯ)\n\n_ವೀಡಿಯೊ ಸಂಖ್ಯೆಯನ್ನು ಟೈಪ್ ಮಾಡಿ (ಉದಾ: *1*, *7*, *12*) ಅಥವಾ ಕೆಳಗಿನಿಂದ ಆಯ್ಕೆಮಾಡಿ:_`,
    mr: `🎓 *पूर्णश्री इंजिनिअर प्रशिक्षण व्हिडिओ* (${videos.length} उपलब्ध)\n\n_व्हिडिओ क्रमांक टाइप करा (उदा: *1*, *7*, *12*) किंवा खालील सूचीमधून निवडा:_`,
    te: `🎓 *పూర్ణశ్రీ ఇంజనీర్ శిక్షణ వీడియోలు* (${videos.length} అందుబాటులో ఉన్నాయి)\n\n_వీడియో నంబర్‌ను టైప్ చేయండి (ఉదా: *1*, *7*, *12*) లేదా క్రింది నుండి ఎంచుకోండి:_`,
    bn: `🎓 *পূর্ণশ্রী ইঞ্জিনিয়ার প্রশিক্ষণ ভিডিও* (${videos.length} টি উপলব্ধ)\n\n_একটি ভিডিও নম্বর টাইপ করুন (যেমন: *1*, *7*, *12*) বা নিচের তালিকা থেকে নির্বাচন করুন:_`,
  };

  const lines = [headings[lang] || headings.en, ""];
  videos.forEach((v, idx) => {
    const num = idx + 1;
    lines.push(`*${num}.* ${v.title}`);
  });

  const footers: Record<EngLang, string> = {
    en: `\n💡 _Tip: You can also search by typing keywords like "wifi", "scale", "vibro", or "reports"._`,
    ml: `\n💡 _സൂചന: "wifi", "scale", "vibro", "reports" തുടങ്ങിയ വിഷയങ്ങൾ നേരിട്ട് ടൈപ്പ് ചെയ്തും കണ്ടെത്താം._`,
    hi: `\n💡 _सुझाव: आप "wifi", "scale", "vibro", या "reports" जैसे शब्द लिखकर भी खोज सकते हैं।_`,
    ta: `\n💡 _குறிப்பு: "wifi", "scale", "vibro" போன்ற தலைப்புகளை நேரடியாக தட்டச்சு செய்து தேடலாம்._`,
    kn: `\n💡 _ಸಲಹೆ: "wifi", "scale", "vibro" ನಂತಹ ಪದಗಳನ್ನು ಟೈಪ್ ಮಾಡುವ ಮೂಲಕವೂ ಹುಡುಕಬಹುದು._`,
    mr: `\n💡 _टीप: आपण "wifi", "scale", "vibro" सारखे शब्द टाइप करूनही शोधू शकता._`,
    te: `\n💡 _సూచన: మీరు "wifi", "scale", "vibro" వంటి పదాలను టైప్ చేయడం ద్వారా కూడా శోధించవచ్చు._`,
    bn: `\n💡 _টিপ: আপনি "wifi", "scale", "vibro" ইত্যাদির মতো কীওয়ার্ড লিখেও অনুসন্ধান করতে পারেন।_`,
  };
  lines.push(footers[lang] || footers.en);

  return lines.join("\n");
}

export function getTrainingVideoInteractiveList(
  videos: TrainingVideoItem[],
  lang: EngLang = "en"
): { buttonText: string; rows: WaListRow[] } {
  const btnTexts: Record<EngLang, string> = {
    en: "Choose Video 🎬",
    ml: "വീഡിയോ കാണുക 🎬",
    hi: "वीडियो चुनें 🎬",
    ta: "வீடியோ தேர்வு 🎬",
    kn: "ವೀಡಿಯೊ ಆಯ್ಕೆ 🎬",
    mr: "व्हिडिओ निवडा 🎬",
    te: "వీడియో ఎంచుకోండి 🎬",
    bn: "ভিডিও নির্বাচন 🎬",
  };

  // WhatsApp allows max 10 rows in an interactive list
  const rows: WaListRow[] = videos.slice(0, 10).map((v, idx) => {
    const title = `${idx + 1}. ${v.title}`;
    // Row title strictly <= 24 chars
    const cleanTitle = Array.from(title).slice(0, 24).join("");
    // Description strictly <= 72 chars
    const cleanDesc = Array.from(v.topic || v.description || "Training Video")
      .slice(0, 72)
      .join("");

    return {
      id: `VID_${idx + 1}`,
      title: cleanTitle,
      description: cleanDesc,
    };
  });

  return {
    buttonText: btnTexts[lang] || btnTexts.en,
    rows,
  };
}

export function formatTrainingVideoDetail(
  video: TrainingVideoItem,
  index: number,
  lang: EngLang = "en"
): string {
  const labels = {
    videoNum: lang === "ml" ? "വീഡിയോ" : lang === "hi" ? "वीडियो" : "Video",
    topic: lang === "ml" ? "📌 *വിഷയം:*" : lang === "hi" ? "📌 *विषय:*" : "📌 *Topic:*",
    desc: lang === "ml" ? "📝 *വിവരണം:*" : lang === "hi" ? "📝 *विवरण:*" : "📝 *Description:*",
    watch: lang === "ml" ? "👉 *യൂട്യൂബിൽ കാണുക:*" : lang === "hi" ? "👉 *यूट्यूब पर देखें:*" : "👉 *Watch Video on YouTube:*",
    nextTip:
      lang === "ml"
        ? "\n💡 _മറ്റൊരു വീഡിയോ കാണാൻ നമ്പർ ടൈപ്പ് ചെയ്യുക, അല്ലെങ്കിൽ താഴെ ക്ലിക്ക് ചെയ്യുക:_"
        : lang === "hi"
        ? "\n💡 _अन्य वीडियो देखने के लिए नंबर टाइप करें, या नीचे टैप करें:_"
        : "\n💡 _Type another video number anytime, or tap below:_"
  };

  const lines = [
    `🎬 *${labels.videoNum} #${index}: ${video.title}*`,
    ``,
    ...(video.topic ? [`${labels.topic} ${video.topic}`, ``] : []),
    ...(video.description ? [`${labels.desc}\n${video.description}`, ``] : []),
    `${labels.watch}`,
    `${video.youtubeUrl}`,
    `${labels.nextTip}`,
  ];

  return lines.join("\n");
}

export function getTrainingVideoDetailButtons(lang: EngLang = "en"): WaButton[] {
  const allVideos: Record<EngLang, string> = {
    en: "🎓 All Videos",
    ml: "🎓 വീഡിയോകൾ",
    hi: "🎓 सभी वीडियो",
    ta: "🎓 அனைத்து வீடியோ",
    kn: "🎓 ಎಲ್ಲಾ ವೀಡಿಯೊಗಳು",
    mr: "🎓 सर्व व्हिडिओ",
    te: "🎓 అన్ని వీడియోలు",
    bn: "🎓 সমস্ত ভিডিও",
  };
  const tickets: Record<EngLang, string> = {
    en: "📋 View Tickets",
    ml: "📋 ടിക്കറ്റുകൾ",
    hi: "📋 टिकट देखें",
    ta: "📋 டிக்கெட்டுகள்",
    kn: "📋 ಟಿಕೆಟ್‌ಗಳು",
    mr: "📋 तिकिटे पहा",
    te: "📋 టిక్కెట్లు",
    bn: "📋 টিকিট দেখুন",
  };
  const mainMenu: Record<EngLang, string> = {
    en: "🏠 Main Menu",
    ml: "🏠 പ്രധാന മെനു",
    hi: "🏠 मुख्य मेनू",
    ta: "🏠 முதன்மை மெனு",
    kn: "🏠 ಮುಖ್ಯ ಮೆನು",
    mr: "🏠 मुख्य मेनू",
    te: "🏠 ప్రధాన మెనూ",
    bn: "🏠 প্রধান মেনু",
  };
  return [
    { id: "TRAINING_VIDEOS", title: allVideos[lang] || allVideos.en },
    { id: "TICKETS", title: tickets[lang] || tickets.en },
    { id: "ENG_MENU", title: mainMenu[lang] || mainMenu.en },
  ];
}

export function getEngLangList(lang: EngLang = "en"): { buttonText: string; rows: WaListRow[] } {
  const btnTexts: Record<EngLang, string> = {
    en: "Select Language 🌐",
    ml: "ഭാഷ തിരഞ്ഞെടുക്കുക 🌐",
    hi: "भाषा चुनें 🌐",
    ta: "மொழி தேர்வு 🌐",
    kn: "ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ 🌐",
    mr: "भाषा निवडा 🌐",
    te: "భాషను ఎంచుకోండి 🌐",
    bn: "ভাষা নির্বাচন 🌐",
  };
  return {
    buttonText: btnTexts[lang] || btnTexts.en,
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

export function getStartWorkButton(lang: EngLang, tn: string): WaButton {
  const titles: Record<EngLang, string> = {
    en: "▶️ Start Work",
    ml: "▶️ ജോലി തുടങ്ങുക",
    hi: "▶️ काम शुरू करें",
    ta: "▶️ வேலையை தொடங்கு",
    kn: "▶️ ಕೆಲಸ ಪ್ರಾರಂಭಿಸಿ",
    mr: "▶️ काम सुरू करा",
    te: "▶️ పని ప్రారంభించండి",
    bn: "▶️ কাজ শুরু করুন",
  };
  return { id: `${ENG_PREFIX.START}${tn}`, title: titles[lang] || titles.en };
}

export function getDetailsButton(lang: EngLang, tn: string): WaButton {
  const titles: Record<EngLang, string> = {
    en: "📋 Details",
    ml: "📋 വിവരങ്ങൾ",
    hi: "📋 विवरण",
    ta: "📋 விவரங்கள்",
    kn: "📋 ವಿವರಗಳು",
    mr: "📋 तपशील",
    te: "📋 వివరాలు",
    bn: "📋 বিবরণ",
  };
  return { id: `${ENG_PREFIX.SEL}${tn}`, title: titles[lang] || titles.en };
}

export function getAllTicketsButton(lang: EngLang): WaButton {
  const titles: Record<EngLang, string> = {
    en: "📋 All Tickets",
    ml: "📋 എല്ലാ ടിക്കറ്റും",
    hi: "📋 सभी टिकट",
    ta: "📋 அனைத்து டிக்கெட்",
    kn: "📋 ಎಲ್ಲಾ ಟಿಕೆಟ್‌ಗಳು",
    mr: "📋 सर्व तिकिटे",
    te: "📋 అన్ని టిక్కెట్లు",
    bn: "📋 সমস্ত টিকিট",
  };
  return { id: "TICKETS", title: titles[lang] || titles.en };
}

export function getServiceReportButton(lang: EngLang, tn: string): WaButton {
  const titles: Record<EngLang, string> = {
    en: "📝 Service Report",
    ml: "📝 സർവീസ് റിപ്പോർട്ട്",
    hi: "📝 सर्विस रिपोर्ट",
    ta: "📝 சேவை அறிக்கை",
    kn: "📝 ಸೇವಾ ವರದಿ",
    mr: "📝 सर्व्हिस रिपोर्ट",
    te: "📝 సర్వీస్ రిపోర్ట్",
    bn: "📝 সার্ভিস রিপোর্ট",
  };
  return { id: `${ENG_PREFIX.RPT}${tn}`, title: titles[lang] || titles.en };
}

export function getRequestOtpButton(lang: EngLang, tn: string): WaButton {
  const titles: Record<EngLang, string> = {
    en: "🔐 Request OTP",
    ml: "🔐 OTP ആവശ്യപ്പെടുക",
    hi: "🔐 OTP मांगें",
    ta: "🔐 OTP கோருங்கள்",
    kn: "🔐 OTP ವಿನಂತಿಸಿ",
    mr: "🔐 OTP मागा",
    te: "🔐 OTP అడగండి",
    bn: "🔐 OTP অনুরোধ করুন",
  };
  return { id: `${ENG_PREFIX.OTP}${tn}`, title: titles[lang] || titles.en };
}

export function getEnterOtpButton(lang: EngLang, tn: string): WaButton {
  const titles: Record<EngLang, string> = {
    en: "✅ Enter OTP",
    ml: "✅ OTP നൽകുക",
    hi: "✅ OTP दर्ज करें",
    ta: "✅ OTP உள்ளிடவும்",
    kn: "✅ OTP ನಮೂದಿಸಿ",
    mr: "✅ OTP टाका",
    te: "✅ OTP నమోదు చేయండి",
    bn: "✅ OTP লিখুন",
  };
  return { id: `${ENG_PREFIX.VERIFY_PROMPT}${tn}`, title: titles[lang] || titles.en };
}

export function getResendOtpButton(lang: EngLang, tn: string): WaButton {
  const titles: Record<EngLang, string> = {
    en: "🔁 Resend OTP",
    ml: "🔁 വീണ്ടും അയക്കുക",
    hi: "🔁 पुनः भेजें",
    ta: "🔁 மீண்டும் அனுப்பு",
    kn: "🔁 ಮರುಕಳುಹಿಸಿ",
    mr: "🔁 पुन्हा पाठवा",
    te: "🔁 మళ్ళీ పంపండి",
    bn: "🔁 আবার পাঠান",
  };
  return { id: `${ENG_PREFIX.RESEND}${tn}`, title: titles[lang] || titles.en };
}

export function getTestCloseButton(lang: EngLang, tn: string): WaButton {
  const titles: Record<EngLang, string> = {
    en: "❌ Test Close",
    ml: "❌ ടെസ്റ്റ് ക്ലോസ്",
    hi: "❌ टेस्ट क्लोज",
    ta: "❌ சோதனை முடிவு",
    kn: "❌ ಟೆಸ್ಟ್ ಕ್ಲೋಸ್",
    mr: "❌ टेस्ट क्लोज",
    te: "❌ టెస్ట్ క్లోజ్",
    bn: "❌ টেস্ট ক্লোজ",
  };
  return { id: `${ENG_PREFIX.TEST_CLOSE}${tn}`, title: titles[lang] || titles.en };
}

export function getMainMenuButton(lang: EngLang): WaButton {
  const titles: Record<EngLang, string> = {
    en: "🏠 Main Menu",
    ml: "🏠 പ്രധാന മെനു",
    hi: "🏠 मुख्य मेनू",
    ta: "🏠 முதன்மை மெனு",
    kn: "🏠 ಮುಖ್ಯ ಮೆನು",
    mr: "🏠 मुख्य मेनू",
    te: "🏠 ప్రధాన మెను",
    bn: "🏠 প্রধান মেনু",
  };
  return { id: "MENU", title: titles[lang] || titles.en };
}

export function formatTicketDetailMessage(
  t: EngineerTicketRow,
  opts?: { heading?: string; lang?: EngLang },
): string {
  const lang = opts?.lang || "en";
  const contactPerson = resolveTicketContactPerson(t);
  const organization = resolveTicketOrganization(t);
  const rawPhone = resolveTicketCustomerPhone(t);
  const phone = formatCustomerPhoneDisplay(rawPhone);
  const place = t.pincode?.place || t.machineAddress1 || "—";
  const pincode = t.pincode?.code ?? "—";
  const product = t.machineName || "—";
  const serial = t.machineSerialNumber || "—";
  const complaint =
    getTicketComplaintText(t.problemDescription, t.issueDescription) ||
    t.problemDescription ||
    "—";
  const assignedBy = t.assignedManager
    ? `${t.assignedManager.firstName} ${t.assignedManager.lastName ?? ""}`.trim()
    : "—";
  const d = t.updatedAt ? new Date(t.updatedAt) : (t.createdAt ? new Date(t.createdAt) : null);
  const assignedAt =
    d && !isNaN(d.getTime())
      ? d.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }) +
        ", " +
        d.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "—";

  const labels = {
    contact: lang === "ml" ? "👤 *ബന്ധപ്പെടേണ്ട വ്യക്തി:*" : lang === "hi" ? "👤 *संपर्क व्यक्ति:*" : "👤 *Contact Person:*",
    society: lang === "ml" ? "🏢 *സൊസൈറ്റി/ഡീലർ:*" : lang === "hi" ? "🏢 *सोसाइटी/डीलर:*" : "🏢 *Society/Dealer:*",
    customer: lang === "ml" ? "👤 *കസ്റ്റമർ:*" : lang === "hi" ? "👤 *ग्राहक:*" : "👤 *Customer:*",
    phone: lang === "ml" ? "📞 *ഫോൺ:*" : lang === "hi" ? "📞 *फ़ोन:*" : "📞 *Phone:*",
    address: lang === "ml" ? "🏠 *മേൽവിലാസം:*" : lang === "hi" ? "🏠 *पता:*" : "🏠 *Address:*",
    location: lang === "ml" ? "📍 *സ്ഥലം:*" : lang === "hi" ? "📍 *स्थान:*" : "📍 *Location:*",
    product: lang === "ml" ? "🔧 *മെഷീൻ:*" : lang === "hi" ? "🔧 *उत्पाद:*" : "🔧 *Product:*",
    assigned: lang === "ml" ? "📅 *നിയമിച്ചത്:*" : lang === "hi" ? "📅 *सौंपा गया:*" : "📅 *Assigned:*",
    complaint: lang === "ml" ? "📝 *പരാതി:*" : lang === "hi" ? "📝 *शिकायत:*" : "📝 *Complaint:*",
    assignedBy: lang === "ml" ? "👨‍💼 *നിയമിച്ച മാനേജർ:*" : lang === "hi" ? "👨‍💼 *सौंपने वाले:*" : "👨‍💼 *Assigned by:*",
  };

  const lines = [
    opts?.heading ?? `📋 *Ticket ${t.ticketNumber}* (${t.status})`,
    ``,
    ...(contactPerson ? [`${labels.contact} ${contactPerson}`] : []),
    ...(organization && organization !== contactPerson ? [`${labels.society} ${organization}`] : []),
    ...(!contactPerson && !organization ? [`${labels.customer} Customer`] : []),
    `${labels.phone} ${phone}`,
    ...(t.customerAddress ? [`${labels.address} ${t.customerAddress}`] : []),
    `${labels.location} ${place} (${pincode})`,
    `${labels.product} ${product} (S/N: ${serial})`,
    `${labels.assigned} ${assignedAt}`,
    `${labels.complaint} ${complaint}`,
    `${labels.assignedBy} ${assignedBy}`,
  ];
  return lines.join("\n");
}

export async function findEngineerTicket(ticketNumber: string, engineerId: string) {
  return prisma.ticket.findFirst({
    where: { ticketNumber, assignedEngineerId: engineerId },
    select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
  });
}

/** Wrapper sending helper to support live WhatsApp Cloud API with simulate fallback. */
export async function sendEngineerMessage(
  to: string,
  text: string,
  buttons?: WaButton[],
  list?: { buttonText: string; rows: WaListRow[] },
): Promise<void> {
  const finalBody = text;

  if (WhatsAppService.isConfigured()) {
    if (list) {
      await WhatsAppService.sendInteractiveList(to, finalBody, list.buttonText, list.rows);
    } else if (buttons && buttons.length > 0) {
      await WhatsAppService.sendInteractiveButtons(to, finalBody, buttons);
    } else {
      await WhatsAppService.sendMessage(to, finalBody);
    }
  } else {
    let content = finalBody;
    if (buttons && buttons.length > 0) {
      content += "\n\nButtons:\n" + buttons.map((b) => `[${b.title}] (${b.id})`).join("\n");
    } else if (list) {
      content +=
        `\n\nList [${list.buttonText}]:\n` +
        list.rows.map((r) => `- ${r.title} (${r.id}): ${r.description ?? ""}`).join("\n");
    }
    await prisma.simulateMessage
      .create({
        data: {
          phoneNumber: to,
          role: "bot",
          content,
        },
      })
      .catch(() => {});
  }
}

/** Attaches work report photo, renaming to track location vs finished photos. */
export async function attachWorkReportPhoto(
  ticketId: string,
  engineerId: string,
  filename: string,
): Promise<{ type: "reached" | "finished" | "normal"; ticketNumber: string }> {
  let report = await prisma.workReport.findUnique({
    where: { ticketId },
    include: { images: true },
  });
  if (!report) {
    report = await prisma.workReport.create({
      data: { ticketId, dealerId: engineerId },
      include: { images: true },
    });
  }

  const hasReached = report.images.some((img) => img.fileName.startsWith("reached_location"));
  const isReportComplete = !!(report.problemDiagnosed?.trim() && report.workDone?.trim());

  let finalFilename = filename;
  let photoType: "reached" | "finished" | "normal" = "normal";

  if (!hasReached) {
    finalFilename = "reached_location_" + filename;
    photoType = "reached";
  } else if (isReportComplete) {
    const hasFinished = report.images.some((img) => img.fileName.startsWith("finished_work"));
    if (!hasFinished) {
      finalFilename = "finished_work_" + filename;
      photoType = "finished";
    }
  }

  // Rename physical file if needed
  const dir = path.resolve(__dirname, "../../uploads/work-reports");
  const oldPath = path.join(dir, filename);
  const newPath = path.join(dir, finalFilename);
  if (fs.existsSync(oldPath)) {
    try {
      fs.renameSync(oldPath, newPath);
    } catch {}
  }

  await prisma.workReportImage.create({
    data: {
      workReportId: report.id,
      url: `/uploads/work-reports/${finalFilename}`,
      fileName: finalFilename,
    },
  });

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { ticketNumber: true },
  });

  return { type: photoType, ticketNumber: ticket.ticketNumber };
}

/** Status-specific action buttons guided by checklist status. */
export async function sendTicketActionButtons(
  to: string,
  t: EngineerTicketRow,
  _engineerId: string,
  opts?: { prefix?: string; includeDetails?: boolean },
): Promise<void> {
  const lang = await getEngineerLanguage(to);
  const tn = t.ticketNumber;
  const prefix = opts?.prefix ?? "";

  if (opts?.includeDetails) {
    const detailMsg = formatTicketDetailMessage(t, { lang });
    await sendEngineerMessage(to, detailMsg);
  }

  if (t.status === "ASSIGNED") {
    const msg = lang === "ml"
      ? `${prefix}📋 *${tn}* — ജോലി ആരംഭിക്കാൻ തയ്യാറാണോ?`
      : lang === "hi"
      ? `${prefix}📋 *${tn}* — क्या काम शुरू करने के लिए तैयार हैं?`
      : `${prefix}📋 *${tn}* — Ready to start work?`;
    await sendEngineerMessage(to, msg, [
      getStartWorkButton(lang, tn),
      getDetailsButton(lang, tn),
      getAllTicketsButton(lang),
    ]);
    return;
  }

  if (t.status === "IN_PROGRESS") {
    const report = await prisma.workReport.findUnique({
      where: { ticketId: t.id },
      include: { images: true },
    });
    const hasReached =
      report?.images.some((img) => img.fileName.startsWith("reached_location")) ?? false;
    const isReportComplete = !!(report?.problemDiagnosed?.trim() && report?.workDone?.trim());
    const hasFinished =
      report?.images.some((img) => img.fileName.startsWith("finished_work")) ?? false;

    if (!hasReached) {
      const msg = lang === "ml"
        ? `${prefix}📍 *${tn}* (ജോലി പുരോഗമിക്കുന്നു)\n\n📸 *സ്ഥലത്ത് എത്തിയ ഫോട്ടോ നൽകുക:*\nകസ്റ്റമറുടെ സ്ഥലത്ത് എത്തിയ ഉടൻ മെഷീന്റെ ഫോട്ടോ അയക്കുക.\n\n_(ഇതൊരു ട്രയൽ/ടെസ്റ്റ് കോൾ ആണെങ്കിൽ താഴെയുള്ള ടെസ്റ്റ് ക്ലോസ് അമർത്തുക.)_`
        : lang === "hi"
        ? `${prefix}📍 *${tn}* (प्रगति पर है)\n\n📸 *आगमन फोटो की प्रतीक्षा:*\nग्राहक के स्थान पर पहुंचने पर मशीन का फोटो अपलोड करें।\n\n_(यदि यह ट्रायल/टेस्ट कॉल था, तो नीचे टेस्ट क्लोज दबाएं।)_`
        : `${prefix}📍 *${tn}* (In Progress)\n\n📸 *Awaiting Arrival Photo:*\nPlease upload a photo of the machine upon arrival at the customer location.\n\n_(If this was a trial/test call, tap Test Close below.)_`;
      await sendEngineerMessage(to, msg, [
        getTestCloseButton(lang, tn),
        getDetailsButton(lang, tn),
        getAllTicketsButton(lang),
      ]);
      return;
    }

    if (!isReportComplete) {
      const msg = lang === "ml"
        ? `${prefix}📍 *${tn}* (ജോലി പുരോഗമിക്കുന്നു)\n\n✅ എത്തിച്ചേരൽ ഫോട്ടോ സ്ഥിരീകരിച്ചു.\n📝 ദയവായി സർവീസ് റിപ്പോർട്ട് പൂരിപ്പിക്കുക (കണ്ടെത്തിയ തകരാറും ചെയ്ത ജോലിയും).`
        : lang === "hi"
        ? `${prefix}📍 *${tn}* (प्रगति पर है)\n\n✅ आगमन फोटो सत्यापित।\n📝 कृपया अपनी सर्विस रिपोर्ट भरें (समस्या और किया गया कार्य)।`
        : `${prefix}📍 *${tn}* (In Progress)\n\n✅ Arrival photo verified.\n📝 Please fill in your Service Report (Problem diagnosed, Work done).`;
      await sendEngineerMessage(to, msg, [
        getServiceReportButton(lang, tn),
        getDetailsButton(lang, tn),
        getAllTicketsButton(lang),
      ]);
      return;
    }

    if (!hasFinished) {
      const msg = lang === "ml"
        ? `${prefix}📍 *${tn}* (ജോലി പുരോഗമിക്കുന്നു)\n\n✅ സർവീസ് റിപ്പോർട്ട് സേവ് ചെയ്തു.\n📸 OTP ചോദിക്കുന്നതിന് മുമ്പ് പൂർത്തിയാക്കിയ മെഷീന്റെ ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക.`
        : lang === "hi"
        ? `${prefix}📍 *${tn}* (प्रगति पर है)\n\n✅ सर्विस रिपोर्ट सहेजी गई।\n📸 OTP मांगने से पहले पूर्ण कार्य का फोटो अपलोड करें।`
        : `${prefix}📍 *${tn}* (In Progress)\n\n✅ Service report notes saved.\n📸 Please upload a photo of the completed/repaired machine before requesting OTP.`;
      await sendEngineerMessage(to, msg, [
        getServiceReportButton(lang, tn),
        getDetailsButton(lang, tn),
        getAllTicketsButton(lang),
      ]);
      return;
    }

    const msg = lang === "ml"
      ? `${prefix}📍 *${tn}* (ജോലി പുരോഗമിക്കുന്നു)\n\n🎉 എല്ലാ ജോലികളും ഫോട്ടോകളും പൂർത്തിയായി!\n🔐 ടിക്കറ്റ് ക്ലോസ് ചെയ്യാൻ കസ്റ്റമറോട് OTP ആവശ്യപ്പെടുക.`
      : lang === "hi"
      ? `${prefix}📍 *${tn}* (प्रगति पर है)\n\n🎉 सभी काम और फोटो पूरे हो गए!\n🔐 इस टिकट को बंद करने के लिए ग्राहक से OTP मांगें।`
      : `${prefix}📍 *${tn}* (In Progress)\n\n🎉 All work and photos completed!\n🔐 Request OTP from the customer to close this ticket.`;
    await sendEngineerMessage(to, msg, [
      getRequestOtpButton(lang, tn),
      getServiceReportButton(lang, tn),
      getDetailsButton(lang, tn),
    ]);
    return;
  }

  if (t.status === "PENDING_OTP") {
    const msg = lang === "ml"
      ? `${prefix}🔐 *${tn}* — കസ്റ്റമർ OTP-ക്കായി കാത്തിരിക്കുന്നു\n\nകസ്റ്റമറുടെ ഫോണിലേക്ക് അയച്ച 4 അക്ക കോഡ് വാങ്ങി ഇവിടെ ടൈപ്പ് ചെയ്യുക.`
      : lang === "hi"
      ? `${prefix}🔐 *${tn}* — ग्राहक OTP की प्रतीक्षा में\n\nग्राहक को भेजे गए 4-अंकीय कोड को पूछकर यहाँ भेजें।`
      : `${prefix}🔐 *${tn}* — Waiting for Customer OTP\n\nAsk the customer for the 4-digit code sent to their WhatsApp/SMS, and reply with the code here.`;
    await sendEngineerMessage(to, msg, [
      getEnterOtpButton(lang, tn),
      getResendOtpButton(lang, tn),
      getAllTicketsButton(lang),
    ]);
  }
}

export async function sendReportMenuList(
  to: string,
  ticketNumber: string,
  opts?: { prefix?: string },
): Promise<void> {
  const lang = await getEngineerLanguage(to);
  const tn = ticketNumber;
  const prefix = opts?.prefix ?? "";

  const titleText = lang === "ml"
    ? `${prefix}*${tn}* — സർവീസ് റിപ്പോർട്ട്\n\nഅപ്‌ഡേറ്റ് ചെയ്യാൻ ഒരു ഓപ്ഷൻ തിരഞ്ഞെടുക്കുക:`
    : lang === "hi"
    ? `${prefix}*${tn}* — सर्विस रिपोर्ट\n\nअपडेट करने के लिए एक विकल्प चुनें:`
    : `${prefix}*${tn}* — Service Report\n\nChoose an item to update, or use direct text commands (e.g. *DIAGNOSE ${tn} <notes>*).`;

  const btnText = lang === "ml" ? "റിപ്പോർട്ട് ഓപ്ഷനുകൾ" : lang === "hi" ? "रिपोर्ट विकल्प" : "Report Options";

  await sendEngineerMessage(
    to,
    titleText,
    undefined,
    {
      buttonText: btnText,
      rows: [
        { id: `${ENG_PREFIX.DIAG}${tn}`, title: lang === "ml" ? "കണ്ടെത്തിയ തകരാർ" : "Problem Diagnosed", description: lang === "ml" ? "തകരാറിന്റെ കാരണം നൽകുക" : "Set root cause" },
        { id: `${ENG_PREFIX.WDONE}${tn}`, title: lang === "ml" ? "ചെയ്ത ജോലി" : "Work Done Notes", description: lang === "ml" ? "റിപ്പയർ വിവരങ്ങൾ നൽകുക" : "Log repair notes" },
        { id: `${ENG_PREFIX.PART}${tn}`, title: lang === "ml" ? "മാറ്റിയ പാർട്സ് ചേർക്കുക" : "Add Replaced Part", description: "name | part# | qty" },
        { id: `${ENG_PREFIX.WARR_YES}${tn}`, title: lang === "ml" ? "വാറന്റി: ഉണ്ട്" : "Warranty: Yes", description: lang === "ml" ? "ക്ലെയിം ആവശ്യമാണ്" : "Claim required" },
        { id: `${ENG_PREFIX.WARR_NO}${tn}`, title: lang === "ml" ? "വാറന്റി: ഇല്ല" : "Warranty: No", description: lang === "ml" ? "ക്ലെയിം ഇല്ല" : "No warranty claim" },
        { id: `${ENG_PREFIX.SEL}${tn}`, title: lang === "ml" ? "ടിക്കറ്റിലേക്ക് മടങ്ങുക" : "Back to Ticket", description: lang === "ml" ? "വിവരങ്ങളും പ്രവർത്തനങ്ങളും" : "View actions & details" },
      ],
    },
  );
}
