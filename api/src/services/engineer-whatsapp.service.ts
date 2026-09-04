// ── Service Engineer WhatsApp Router & Action Engine ────────────────────────

import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { normalizeWhatsappNumber } from "./whatsapp.service";
import * as WhatsAppService from "./whatsapp.service";
import * as TicketService from "./ticket.service";
import * as TroubleshootingService from "./troubleshooting.service";
import { searchTrainingVideos } from "./engineer-training-video.service";
import { findVideosForQuery } from "../controllers/video.controller";
import { getCatalogForRole, prefilterCatalog } from "./training-catalog.service";
import {
  ENG_PREFIX,
  ENGINEER_ACTIVE_TICKET_SELECT,
  type EngineerTicketRow,
  type EngLang,
  getEngineerLanguage,
  getEngMainMenuButtons,
  getEngLangList,
  getMainMenuButton,
  formatTicketDetailMessage,
  sendTicketActionButtons,
  sendEngineerMessage,
  sendReportMenuList,
  attachWorkReportPhoto,
  findEngineerTicket,
  formatTrainingVideoListMessage,
  getTrainingVideoInteractiveList,
  formatTrainingVideoDetail,
  getTrainingVideoDetailButtons,
} from "./engineer-ticket-whatsapp.shared";
import { translateText } from "./translate.service";
import { resolveTicketCustomerName } from "../lib/ticket-customer";
import { afterOtpTicketClosed } from "../lib/ticket-otp-close-effects";

interface PendingAction {
  type: "diagnose" | "work_done" | "part" | "verify_otp" | "ts_serial" | "ts_respond";
  ticketNumber: string; // For ts_serial: problemType, for ts_respond: sessionId
}

// In-memory active ticket and pending action tracking per engineer phone
const activeTicketMap = new Map<string, string>();
const pendingActionMap = new Map<string, PendingAction>();
const lastEngineerMenuMap = new Map<string, string>();

export function getActiveTicket(phone: string): string | undefined {
  return activeTicketMap.get(phone);
}

export function setActiveTicket(phone: string, ticketNumber: string): void {
  activeTicketMap.set(phone, ticketNumber);
}

export function setPending(phone: string, type: PendingAction["type"], ticketNumber: string): void {
  pendingActionMap.set(phone, { type, ticketNumber });
}

export function clearPending(phone: string): void {
  pendingActionMap.delete(phone);
}

/**
 * Checks if a given phone number belongs to an active service_engineer.
 * Matches all standard formats (+91, 91, 0, 10 digits, formatted spaces/dashes).
 */
export async function isServiceEngineer(rawPhone: string) {
  const norm = normalizeWhatsappNumber(rawPhone);
  if (!norm) return null;

  const tenDigits = norm.length >= 10 ? norm.slice(-10) : norm;

  const phoneVariants = Array.from(
    new Set([
      rawPhone,
      norm,
      tenDigits,
      `+91${tenDigits}`,
      `91${tenDigits}`,
      `0${tenDigits}`,
      norm.startsWith("91") && norm.length === 12 ? norm.slice(2) : norm,
      norm.startsWith("91") && norm.length === 12 ? `+${norm}` : norm,
    ]),
  );

  // 1. First attempt exact match on common formats
  let user = await prisma.user.findFirst({
    where: {
      role: "service_engineer",
      OR: [
        { whatsappNumber: { in: phoneVariants } },
        { email: { in: phoneVariants } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      whatsappNumber: true,
      email: true,
    },
  });

  // 2. Fallback: match if whatsappNumber ends with the same 10 digits
  if (!user && tenDigits.length === 10) {
    user = await prisma.user.findFirst({
      where: {
        role: "service_engineer",
        whatsappNumber: {
          endsWith: tenDigits,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        whatsappNumber: true,
        email: true,
      },
    });
  }

  return user;
}

/**
 * Upsert fields on an engineer's work report.
 */
async function upsertReportField(
  ticketId: string,
  engineerId: string,
  fields: {
    problemDiagnosed?: string;
    workDone?: string;
    warrantyClaimRequested?: boolean;
    appendPart?: { partName: string; partNumber?: string; quantity: number };
  },
) {
  let report = await prisma.workReport.findUnique({
    where: { ticketId },
  });

  if (!report) {
    report = await prisma.workReport.create({
      data: { ticketId, dealerId: engineerId },
    });
  }

  const data: Record<string, unknown> = {};
  if (fields.problemDiagnosed !== undefined) data.problemDiagnosed = fields.problemDiagnosed;
  if (fields.workDone !== undefined) data.workDone = fields.workDone;
  if (fields.warrantyClaimRequested !== undefined) data.warrantyClaimRequested = fields.warrantyClaimRequested;

  if (Object.keys(data).length > 0) {
    report = await prisma.workReport.update({
      where: { id: report.id },
      data,
    });
  }

  if (fields.appendPart) {
    await prisma.replacedPart.create({
      data: {
        workReportId: report.id,
        partName: fields.appendPart.partName,
        partNumber: fields.appendPart.partNumber ?? null,
        quantity: fields.appendPart.quantity,
      },
    });
  }

  return report;
}

// ── Engineer Localization Dictionary ──────────────────────────────────────────
export const ENG_TRANSLATIONS: Record<string, Record<EngLang, string>> = {
  LANG_CHANGED_EN: {
    en: "✅ Language set to *English*.",
    hi: "✅ Language set to *English*.",
    ta: "✅ மொழி *English* என அமைக்கப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *English* ಗೆ ಹೊಂದಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *English* वर सेट केली.",
    te: "✅ భాష *English* గా సెట్ చేయబడింది.",
    bn: "✅ ভাষা *English* সেট করা হয়েছে।",
    ml: "✅ ഭാഷ *English* ആയി മാറ്റി.",
  },
  LANG_CHANGED_HI: {
    en: "✅ भाषा *हिंदी* में बदली गई।",
    hi: "✅ भाषा *हिंदी* में बदली गई।",
    ta: "✅ மொழி *हिंदी* க்கு மாற்றப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *हिंदी* ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *हिंदी* मध्ये बदलली.",
    te: "✅ భాష *हिंदी* కి మార్చబడింది.",
    bn: "✅ ভাষা *हिंदी* তে পরিবর্তিত হয়েছে।",
    ml: "✅ ഭാഷ *हिंदी* ആയി മാറ്റി.",
  },
  LANG_CHANGED_TA: {
    en: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    hi: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    ta: "✅ மொழி *தமிழ்* ஆக மாற்றப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *தமிழ்* ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *தமிழ்* मध्ये बदलली.",
    te: "✅ భాష *தமிழ்* కి మార్చబడింది.",
    bn: "✅ ভাষা *தமிழ்* তে পরিবর্তিত হয়েছে।",
    ml: "✅ ഭാഷ *தமிழ்* ആയി മാറ്റി.",
  },
  LANG_CHANGED_ML: {
    en: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
    hi: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
    ta: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
    kn: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
    mr: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
    te: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
    bn: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
    ml: "✅ ഭാഷ *മലയാളം* ആയി മാറ്റി.",
  },
  LANG_CHANGED_KN: {
    en: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    hi: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    ta: "✅ மொழி *ಕನ್ನಡ* க்கு மாற்றப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *ಕನ್ನಡ* ಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *ಕನ್ನಡ* मध्ये बदलली.",
    te: "✅ భాష *ಕನ್ನಡ* కి మార్చబడింది.",
    bn: "✅ ভাষা *ಕನ್ನಡ* তে পরিবর্তিত হয়েছে।",
    ml: "✅ ഭാഷ *കನ್ನಡ* ആയി മാറ്റി.",
  },
  LANG_CHANGED_MR: {
    en: "✅ भाषा *मराठी* मध्ये बदलली.",
    hi: "✅ भाषा *मराठी* मध्ये बदलली.",
    ta: "✅ மொழி *मराठी* க்கு மாற்றப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *मराठी* ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *मराठी* मध्ये बदलली.",
    te: "✅ भाषा *मराठी* కి మార్చబడింది.",
    bn: "✅ भाषा *मराठी* मध्ये बदलली.",
    ml: "✅ ഭാഷ *മറാഠി* ആയി മാറ്റി.",
  },
  LANG_CHANGED_TE: {
    en: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    hi: "✅ भाषा *తెలుగు* में बदली गई।",
    ta: "✅ மொழி *తెలుగు* க்கு மாற்றப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *తెలుగు* ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *తెలుగు* मध्ये बदलली.",
    te: "✅ భాష *తెలుగు* కి మార్చబడింది.",
    bn: "✅ भाषा *తెలుగు* তে পরিবর্তিত হয়েছে।",
    ml: "✅ ഭാഷ *തെലുങ്ക്* ആയി മാറ്റി.",
  },
  LANG_CHANGED_BN: {
    en: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে।",
    hi: "✅ भाषा *বাংলা* में बदली गई।",
    ta: "✅ மொழி *বাংলা* க்கு மாற்றப்பட்டது.",
    kn: "✅ ಭಾಷೆಯನ್ನು *বাংলা* ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    mr: "✅ भाषा *বাংলা* मध्ये बदलली.",
    te: "✅ भाषा *বাংলা* కి మార్చబడింది.",
    bn: "✅ ভাষা *বাংলা* তে পরিবর্তিত হয়েছে।",
    ml: "✅ ഭാഷ *ബംഗാളി* ആയി മാറ്റി.",
  },
  MAIN_MENU_GREETING: {
    en: "👋 *Hi {name}!*\nWelcome to the *Poornasree Service Engineer Portal*.\n\nManage your service tickets and get instant troubleshooting help right here on WhatsApp.\n\n💡 _Type any machine problem (e.g. \"vibro not working\", \"low voltage\") to get instant troubleshooting steps._\n📊 _Type \"STATUS\" for your ticket summary._",
    ml: "👋 *ഹലോ {name}!* \n*പൂർണ്ണശ്രീ സർവീസ് എഞ്ചിനീയർ പോർട്ടലിലേക്ക്* സ്വാഗതം.\n\nനിങ്ങളുടെ സർവീസ് ടിക്കറ്റുകൾ കൈകാര്യം ചെയ്യാനും ട്രബിൾഷൂട്ടിംഗ് സഹായം നേടാനും ഇവിടെ സാധിക്കും.\n\n💡 _മെഷീൻ തകരാറുകൾ നേരിട്ട് ടൈപ്പ് ചെയ്യുക (ഉദാ: \"vibro not working\", \"low voltage\")._\n📊 _ടിക്കറ്റ് സംഗ്രഹം അറിയാൻ \"STATUS\" എന്ന് ടൈപ്പ് ചെയ്യുക._",
    hi: "👋 *नमस्ते {name}!* \n*पूर्णश्री सर्विस इंजीनियर पोर्टल* में आपका स्वागत है।\n\nअपने सर्विस टिकट प्रबंधित करें और त्वरित समस्या निवारण सहायता प्राप्त करें।\n\n💡 _मशीन की समस्या टाइप करें (उदा: \"vibro not working\", \"low voltage\")।_\n📊 _टिकट सारांश के लिए \"STATUS\" टाइप करें।_",
    ta: "👋 *வணக்கம் {name}!* \n*பூர்ணஸ்ரீ சர்வீஸ் இன்ஜினியர் போர்ட்டலுக்கு* வரவேற்கிறோம்.\n\nஉங்கள் சேவை டிக்கெட்டுகளை நிர்வகிக்கவும் சரிசெய்தல் உதவிகளைப் பெறவும் முடியும்.\n\n💡 _இயந்திர சிக்கலை நேரடியாக உள்ளிடவும் (எ.கா: \"vibro not working\", \"low voltage\")._\n📊 _சுருக்கத்திற்கு \"STATUS\" என தட்டச்சு செய்க._",
    kn: "👋 *ನಮಸ್ಕಾರ {name}!* \n*ಪೂರ್ಣಶ್ರೀ ಸರ್ವಿಸ್ ಇಂಜಿನಿಯರ್ ಪೋರ್ಟಲ್* ಗೆ ಸುಸ್ವಾಗತ.\n\nನಿಮ್ಮ ಸೇವಾ ಟಿಕೆಟ್‌ಗಳನ್ನು ನಿರ್ವಹಿಸಿ ಮತ್ತು ತಕ್ಷಣದ ಪರಿಹಾರ ಪಡೆಯಿರಿ.\n\n💡 _ಯಂತ್ರದ ಸಮಸ್ಯೆಯನ್ನು ನೇರವಾಗಿ ಟೈಪ್ ಮಾಡಿ (ಉದಾ: \"vibro not working\", \"low voltage\")._\n📊 _ಸಾರಾಂಶಕ್ಕಾಗಿ \"STATUS\" ಎಂದು ಟೈಪ್ ಮಾಡಿ._",
    mr: "👋 *नमस्कार {name}!* \n*पूर्णश्री सर्व्हिस इंजिनिअर पोर्टल* मध्ये आपले स्वागत आहे.\n\nआपली सर्व्हिस तिकिटे व्यवस्थापित करा आणि व्हॉट्सॲपवर त्वरित मदत मिळवा.\n\n💡 _मशीनची समस्या थेट टाइप करा (उदा: \"vibro not working\", \"low voltage\")._\n📊 _तिकीट सारांशासाठी \"STATUS\" टाइप करा._",
    te: "👋 *నమస్కారం {name}!* \n*పూర్ణశ్రీ సర్వీస్ ఇంజనీర్ పోర్టల్* కు స్వాగతం.\n\nమీ సర్వీస్ టిక్కెట్లను నిర్వహించండి మరియు తక్షణ సహాయం పొందండి.\n\n💡 _మెషిన్ సమస్యను టైప్ చేయండి (ఉదా: \"vibro not working\", \"low voltage\")._\n📊 _సారాంశం కోసం \"STATUS\" టైప్ చేయండి._",
    bn: "👋 *নমস্কার {name}!* \n*পূর্ণশ্রী সার্ভিস ইঞ্জিনিয়ার পোর্টালে* স্বাগতম।\n\nআপনার সার্ভিস টিকিট পরিচালনা করুন এবং உடனடியாக সহায়তা পান।\n\n💡 _মেশিনের समस्याটি সরাসরি টাইপ করুন (যেমন: \"vibro not working\", \"low voltage\")._\n📊 _সারসংক্ষেপের জন্য \"STATUS\" টাইপ করুন।_",
  },
  NO_TICKETS: {
    en: "📋 *My Tickets*\n\nHi {name}, you have no pending tickets assigned right now! 🎉",
    ml: "📋 *എന്റെ ടിക്കറ്റുകൾ*\n\nഹലോ {name}, നിലവിൽ നിങ്ങൾക്ക് തീർപ്പാക്കാത്ത ടിക്കറ്റുകളൊന്നുമില്ല! 🎉",
    hi: "📋 *मेरे टिकट*\n\nनमस्ते {name}, आपके पास अभी कोई लंबित टिकट नहीं है! 🎉",
    ta: "📋 *எனது டிக்கெட்டுகள்*\n\nவணக்கம் {name}, உங்களுக்கு தற்போது நிலுவையில் உள்ள டிக்கெட்டுகள் எதுவும் இல்லை! 🎉",
    kn: "📋 *ನನ್ನ ಟಿಕೆಟ್‌ಗಳು*\n\nನಮಸ್ಕಾರ {name}, ನಿಮಗೆ ಪ್ರಸ್ತುತ ಯಾವುದೇ ಬಾಕಿ ಟಿಕೆಟ್‌ಗಳಿಲ್ಲ! 🎉",
    mr: "📋 *माझी तिकिटे*\n\nनमस्कार {name}, आपल्याकडे सध्या कोणतीही प्रलंबित तिकिटे नाहीत! 🎉",
    te: "📋 *నా టిక్కెట్లు*\n\nనమస్కారం {name}, మీకు ప్రస్తుతం పెండింగ్‌లో ఉన్న టిక్కెట్లు ఏవీ లేవు! 🎉",
    bn: "📋 *আমার টিকিট*\n\nনমস্কার {name}, আপনার কাছে বর্তমানে কোনো অমীমাংসিত টিকিট নেই! 🎉",
  },
  TROUBLESHOOT_INFO: {
    en: "🔍 *Troubleshooting Help*\n\nJust type your machine problem directly and I'll find the troubleshooting steps and training videos for you!\n\n_Examples:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
    ml: "🔍 *ട്രബിൾഷൂട്ടിംഗ് സഹായം*\n\nമെഷീൻ പ്രശ്നം ഇവിടെ ടൈപ്പ് ചെയ്യുക, ട്രബിൾഷൂട്ടിംഗ് ഘട്ടങ്ങളും വീഡിയോകളും ഞാൻ കണ്ടെത്തി നൽകാം!\n\n_ഉദാഹരണങ്ങൾ:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
    hi: "🔍 *समस्या निवारण सहायता*\n\nअपनी मशीन की समस्या सीधे टाइप करें और मैं आपके लिए समस्या निवारण चरण और प्रशिक्षण वीडियो ढूंढ दूंगा!\n\n_उदाहरण:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
    ta: "🔍 *சரிசெய்தல் உதவி*\n\nஉங்கள் இயந்திர சிக்கலை நேரடியாக தட்டச்சு செய்யவும், அதற்கான வழிகாட்டுதல் மற்றும் வீடியோக்களை நான் தருகிறேன்!\n\n_உதாரணங்கள்:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
    kn: "🔍 *ಸಮಸ್ಯೆ ನಿವಾರಣೆ ಸಹಾಯ*\n\nನಿಮ್ಮ ಯಂತ್ರದ ಸಮಸ್ಯೆಯನ್ನು ನೇರವಾಗಿ ಟೈಪ್ ಮಾಡಿ ಮತ್ತು ನಾನು ಪರಿಹಾರ ಹಂತಗಳನ್ನು ಹುಡುಕುತ್ತೇನೆ!\n\n_ಉದಾಹರಣೆಗಳು:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
    mr: "🔍 *समस्या निवारण मदत*\n\nआपल्या मशीनची समस्या थेट टाइप करा आणि मी समस्येचे निवारण आणि व्हिडिओ शोधून देईन!\n\n_उदाहरणे:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
    te: "🔍 *సమస్య నివారణ సహాయం*\n\nమీ మెషిన్ సమస్యను నేరుగా టైప్ చేయండి, నేను పరిష్కార దశలు మరియు వీడియోలను కనుగొంటాను!\n\n_ఉదాహరణలు:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
    bn: "🔍 *সমস্যা সমাধান সহায়তা*\n\nআপনার মেশিনের সমস্যাটি সরাসরি টাইপ করুন এবং আমি সমাধান পদক্ষেপ ও ভিডিও খুঁজে দেব!\n\n_উদাহরণ:_\n• *\"vibro not working\"*\n• *\"low voltage\"*\n• *\"no display\"*\n• *\"wifi not connecting\"*",
  },
};

export function tEng(key: string, lang: EngLang = "en", vars: Record<string, string> = {}): string {
  let str = ENG_TRANSLATIONS[key]?.[lang] ?? ENG_TRANSLATIONS[key]?.en ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.split(`{${k}}`).join(v);
  }
  return str;
}

/**
 * Main router for inbound WhatsApp messages from Service Engineers.
 */
export async function handleEngineerMessage(
  from: string,
  rawText: string,
  engineer: { id: string; firstName: string; lastName?: string | null },
): Promise<void> {
  const text = (rawText || "").trim();
  const upper = text.toUpperCase();

  console.log(`[engineer-whatsapp] Inbound from ${engineer.firstName} (${from}): "${text}"`);

  // ── 0. Language Request & Selection Interceptor ──
  if (
    upper === "CHANGE_LANGUAGE" ||
    upper === "CHANGE_LANG" ||
    upper === "SELECT_LANG" ||
    upper === "LANGUAGE" ||
    upper === "LANG" ||
    upper === "CHANGE LANGUAGE" ||
    upper === "CHOOSE LANGUAGE"
  ) {
    const lang = await getEngineerLanguage(from);
    await sendEngineerMessage(
      from,
      lang === "ml"
        ? "🌐 *നിങ്ങൾക്ക് ഇഷ്ടമുള്ള ഭാഷ തിരഞ്ഞെടുക്കുക:*\nതുടരാൻ താഴെ നിന്ന് ഒരു ഭാഷ തിരഞ്ഞെടുക്കുക 👇"
        : lang === "hi"
        ? "🌐 *अपनी पसंदीदा भाषा चुनें:*\nजारी रखने के लिए नीचे से भाषा चुनें 👇"
        : "🌐 *Select your preferred language:*\nChoose your language below to continue 👇",
      undefined,
      getEngLangList(lang),
    );
    return;
  }

  const langMatch =
    text.match(
      /^(?:LANG_)?(malayalam|hindi|tamil|telugu|kannada|marathi|bengali|english)$/i,
    ) ||
    text.match(/^in\s+(malayalam|hindi|tamil|telugu|kannada|marathi|bengali|english)$/i) ||
    text.match(/^(LANG_EN|LANG_HI|LANG_TA|LANG_ML|LANG_KN|LANG_MR|LANG_TE|LANG_BN)$/i) ||
    text.match(/^(EN|ML)$/i) ||
    text.match(/^(മലയാളം|हिंदी|தமிழ்|ಕನ್ನಡ|मराठी|తెలుగు|বাংলা)$/);

  if (langMatch) {
    const rawVal = (langMatch[1] || text).toLowerCase().replace(/^in\s+/i, "").replace(/^lang_/i, "");
    const langCodeMap: Record<string, EngLang> = {
      en: "en",
      english: "en",
      ml: "ml",
      malayalam: "ml",
      "മലയാളം": "ml",
      hi: "hi",
      hindi: "hi",
      "हिंदी": "hi",
      ta: "ta",
      tamil: "ta",
      "தமிழ்": "ta",
      kn: "kn",
      kannada: "kn",
      "ಕನ್ನಡ": "kn",
      mr: "mr",
      marathi: "mr",
      "मराठी": "mr",
      te: "te",
      telugu: "te",
      "తెలుగు": "te",
      bn: "bn",
      bengali: "bn",
      "বাংলা": "bn",
    };
    const code: EngLang = langCodeMap[rawVal] || "en";

    try {
      let session = await prisma.conversationSession.findFirst({ where: { phoneNumber: from } });
      if (!session) {
        session = await prisma.conversationSession.create({
          data: { phoneNumber: from, metadata: { language: code } },
        });
      } else {
        const meta = (session.metadata as any) || {};
        meta.language = code;
        await prisma.conversationSession.update({
          where: { id: session.id },
          data: { metadata: meta },
        });
      }

      const confirmMsg = tEng(`LANG_CHANGED_${code.toUpperCase()}`, code);
      const greetingMsg = tEng("MAIN_MENU_GREETING", code, { name: engineer.firstName });

      await sendEngineerMessage(
        from,
        `${confirmMsg}\n\n${greetingMsg}`,
        getEngMainMenuButtons(code),
      );
    } catch (e) {
      console.error("[engineer-whatsapp] Error setting language:", e);
    }
    return;
  }

  // ── 1. Pending Action Interceptor (e.g. text input after button click) ──
  const pending = pendingActionMap.get(from);
  if (pending) {
    const { type, ticketNumber } = pending;

    if (type === "diagnose") {
      clearPending(from);
      const ticket = await findEngineerTicket(ticketNumber, engineer.id);
      if (ticket) {
        await upsertReportField(ticket.id, engineer.id, { problemDiagnosed: text });
        setActiveTicket(from, ticketNumber);
        setPending(from, "work_done", ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ *Problem Diagnosed* saved for *${ticketNumber}*.\n\n` +
            `🔧 *Next Step:* Please describe the *work done* (repair notes).\n\n` +
            `_(Or type: NOTE ${ticketNumber} <notes>)_`,
        );
        return;
      }
    } else if (type === "work_done") {
      clearPending(from);
      const ticket = await findEngineerTicket(ticketNumber, engineer.id);
      if (ticket) {
        await upsertReportField(ticket.id, engineer.id, { workDone: text });
        setActiveTicket(from, ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ *Work notes* saved for *${ticketNumber}*.\n\n` +
            `🔧 *Next Step:* Is this a warranty claim?`,
          [
            { id: `${ENG_PREFIX.WARR_YES}${ticketNumber}`, title: "Yes, Warranty" },
            { id: `${ENG_PREFIX.WARR_NO}${ticketNumber}`, title: "No Warranty" },
          ],
        );
        return;
      }
    } else if (type === "part") {
      clearPending(from);
      const segments = text.split("|").map((s) => s.trim());
      const partName = segments[0];
      const partNumber = segments[1] || undefined;
      const quantity = Math.max(1, parseInt(segments[2] ?? "1", 10) || 1);
      const ticket = await findEngineerTicket(ticketNumber, engineer.id);
      if (ticket && partName) {
        await upsertReportField(ticket.id, engineer.id, {
          appendPart: { partName, partNumber, quantity },
        });
        setActiveTicket(from, ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ Part added: *${partName}* ${partNumber ? `(${partNumber}) ` : ""}x${quantity}.\n\n` +
            `Add another part (*PART ${ticketNumber} name | part# | qty*), or upload the *finished work photo* to proceed.`,
        );
        return;
      }
    } else if (type === "verify_otp") {
      clearPending(from);
      const codeMatch = text.match(/\b\d{4}\b/);
      if (codeMatch) {
        await handleVerifyOtp(from, engineer, ticketNumber, codeMatch[0]);
        return;
      }
    } else if (type === "ts_serial") {
      // Engineer entered a serial number (or SKIP) for guided troubleshooting
      clearPending(from);
      const serial = upper === "SKIP" ? "UNKNOWN" : text;
      const problemType = ticketNumber; // stored problemType in ticketNumber field
      try {
        const result = await TroubleshootingService.startSession(from, serial, problemType);
        setPending(from, "ts_respond", result.session.id);
        await sendEngineerMessage(
          from,
          `🔍 *Guided Troubleshooting Started*\n\n${result.message}`,
          [
            { id: `${ENG_PREFIX.TS_QUIT}`, title: "❌ Exit Guide" },
          ],
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Could not start troubleshooting";
        await sendEngineerMessage(from, `⚠️ ${msg}`, [
          { id: ENG_PREFIX.TS_GUIDE, title: "🔍 Try Again" },
          { id: "MENU", title: "🏠 Main Menu" },
        ]);
      }
      return;
    } else if (type === "ts_respond") {
      // Engineer replied YES/NO/HELP to a troubleshooting step
      clearPending(from);
      const sessionId = ticketNumber; // stored sessionId in ticketNumber field
      try {
        const result = await TroubleshootingService.handleResponse(sessionId, text);
        if (result.done) {
          // Session completed or escalated
          const ticketInfo = (result as any).ticketNumber
            ? `\n\n📋 Support ticket *${(result as any).ticketNumber}* has been created.`
            : "";
          await sendEngineerMessage(
            from,
            `${result.message}${ticketInfo}`,
            [
              { id: ENG_PREFIX.TS_GUIDE, title: "🔍 New Guide" },
              { id: "TICKETS", title: "📋 My Tickets" },
              { id: "MENU", title: "🏠 Main Menu" },
            ],
          );
        } else {
          // More steps remain — keep pending
          setPending(from, "ts_respond", sessionId);
          await sendEngineerMessage(
            from,
            `🔍 ${result.message}`,
            [
              { id: `${ENG_PREFIX.TS_QUIT}`, title: "❌ Exit Guide" },
            ],
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Troubleshooting error";
        await sendEngineerMessage(from, `⚠️ ${msg}`, [
          { id: ENG_PREFIX.TS_GUIDE, title: "🔍 Retry" },
          { id: "MENU", title: "🏠 Main Menu" },
        ]);
      }
      return;
    }
  }

  // ── 2. Handle 4-digit OTP Code Reply Directly ──
  if (/^\d{4}$/.test(text)) {
    const activeTn = getActiveTicket(from);
    let targetTicket: EngineerTicketRow | null = null;
    if (activeTn) {
      targetTicket = (await findEngineerTicket(activeTn, engineer.id)) as EngineerTicketRow | null;
    }
    if (!targetTicket || targetTicket.status !== "PENDING_OTP") {
      const pendingTicket = await prisma.ticket.findFirst({
        where: { assignedEngineerId: engineer.id, status: "PENDING_OTP" },
        select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
        orderBy: { updatedAt: "desc" },
      });
      targetTicket = pendingTicket as EngineerTicketRow | null;
    }

    if (targetTicket) {
      await handleVerifyOtp(from, engineer, targetTicket.ticketNumber, text);
      return;
    }
  }

  // ── 3. Greeting & Main Menu ──
  if (
    /^H(I+|E+Y+|E+LLO+|A+I+)$/i.test(upper) ||
    upper === "HELLO" ||
    upper === "MENU" ||
    upper === "START" ||
    upper === "HOME" ||
    upper === "GREETINGS" ||
    upper === "MAIN MENU" ||
    upper === "ENG_MENU"
  ) {
    lastEngineerMenuMap.delete(from);
    const lang = await getEngineerLanguage(from);
    await sendEngineerMessage(
      from,
      tEng("MAIN_MENU_GREETING", lang, { name: engineer.firstName }),
      getEngMainMenuButtons(lang),
    );
    return;
  }

  // ── 3b. Training Videos Catalog ("TRAINING_VIDEOS" / "TRAINING" / "VIDEOS" / "TUTORIALS") ──
  if (
    upper === "TRAINING_VIDEOS" ||
    upper === "TRAINING" ||
    upper === "VIDEOS" ||
    upper === "VIDEO" ||
    upper === "TUTORIALS" ||
    upper === "TUTORIAL" ||
    upper === "TRAINING VIDEOS" ||
    upper === "TRAINING LIST" ||
    upper === "VIDEO LIST" ||
    upper === "ALL VIDEOS" ||
    upper === "ENG_VIDEOS"
  ) {
    await handleListTrainingVideos(from, engineer);
    return;
  }

  // ── 3c. Training Video Direct Selection (e.g. "VID_1", "V1", "VIDEO 1", or number in training mode) ──
  if (upper.startsWith("VID_") || upper.startsWith("VIDEO_")) {
    const rawNum = upper.replace("VID_", "").replace("VIDEO_", "").trim();
    const index = parseInt(rawNum, 10);
    if (!isNaN(index) && index >= 1) {
      await handleShowTrainingVideo(from, engineer, index);
      return;
    }
  }

  const vPrefixMatch = upper.match(/^V\s*(\d+)$/i) || upper.match(/^VIDEO\s+(\d+)$/i);
  if (vPrefixMatch) {
    const index = parseInt(vPrefixMatch[1], 10);
    if (!isNaN(index) && index >= 1) {
      await handleShowTrainingVideo(from, engineer, index);
      return;
    }
  }

  if (/^\d+$/.test(upper)) {
    const num = parseInt(upper, 10);
    if (lastEngineerMenuMap.get(from) === "training_videos") {
      await handleShowTrainingVideo(from, engineer, num);
      return;
    }
    if (num >= 2 && num <= 30) {
      const videoCount = await prisma.engineerTrainingVideo.count();
      if (num <= videoCount) {
        await handleShowTrainingVideo(from, engineer, num);
        return;
      }
    }
  }

  // ── 4. View Active Tickets List ("TICKETS" / "VIEW TICKETS" / "MY TICKETS" / "1") ──
  if (
    upper === "TICKETS" ||
    upper === "VIEW TICKETS" ||
    upper === "MY TICKETS" ||
    (upper === "1" && lastEngineerMenuMap.get(from) !== "training_videos") ||
    upper === "ALL TICKETS" ||
    upper === "LIST" ||
    upper === "ENG_TICKETS" ||
    upper === "JOBS" ||
    upper.startsWith("PAGE:")
  ) {
    lastEngineerMenuMap.delete(from);
    const pageMatch = upper.match(/PAGE:(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : 0;
    await handleListTickets(from, engineer, page);
    return;
  }

  // ── 5. Status Summary ──
  if (upper === "STATUS" || upper === "SUMMARY") {
    lastEngineerMenuMap.delete(from);
    await handleStatusSummary(from, engineer);
    return;
  }

  // ── 6. Select Ticket Details ──
  if (upper.startsWith(ENG_PREFIX.SEL) || upper.startsWith("DETAILS ") || upper.startsWith("TICKET ")) {
    const ticketNumber = upper
      .replace(ENG_PREFIX.SEL, "")
      .replace("DETAILS ", "")
      .replace("TICKET ", "")
      .trim();
    const ticket = (await findEngineerTicket(ticketNumber, engineer.id)) as EngineerTicketRow | null;
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found in your assigned list.`);
      return;
    }
    setActiveTicket(from, ticketNumber);
    await sendTicketActionButtons(from, ticket, engineer.id, { includeDetails: true });
    return;
  }

  // ── 7. Start Work on Ticket ──
  if (upper.startsWith(ENG_PREFIX.START) || upper.startsWith("START ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.START, "").replace("START ", "").trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    try {
      await TicketService.startWork(ticket.id, engineer.id);
      setActiveTicket(from, ticketNumber);
      const updated = (await findEngineerTicket(ticketNumber, engineer.id)) as EngineerTicketRow;
      await sendTicketActionButtons(from, updated, engineer.id, {
        prefix: `🚀 *Work started on ticket ${ticketNumber}!* Status is now *IN PROGRESS*.\n\n`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start work";
      await sendEngineerMessage(from, `⚠️ ${msg}`);
    }
    return;
  }

  // ── 8. Service Report Menu ──
  if (upper.startsWith(ENG_PREFIX.RPT) || upper.startsWith("REPORT ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.RPT, "").replace("REPORT ", "").trim();
    setActiveTicket(from, ticketNumber);
    await sendReportMenuList(from, ticketNumber);
    return;
  }

  // ── 9. Diagnose Prompt / Command ──
  if (upper.startsWith(ENG_PREFIX.DIAG)) {
    const ticketNumber = upper.replace(ENG_PREFIX.DIAG, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "diagnose", ticketNumber);
    await sendEngineerMessage(
      from,
      `📝 *Problem Diagnosed for ${ticketNumber}:*\n\nPlease reply with the root cause description.`,
    );
    return;
  }
  if (upper.startsWith("DIAGNOSE ")) {
    const rest = text.slice(9).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *DIAGNOSE <ticketNumber> <problem description>*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const body = rest.slice(spaceIdx + 1).trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, { problemDiagnosed: body });
    setActiveTicket(from, ticketNumber);
    setPending(from, "work_done", ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ *Problem Diagnosed* saved for *${ticketNumber}*.\n\n` +
        `🔧 *Next Step:* Please describe the *work done* (repair notes) for this ticket.\n\n` +
        `_(Or reply with: NOTE ${ticketNumber} <notes>)_`,
    );
    return;
  }

  // ── 10. Work Done Prompt / Command ──
  if (upper.startsWith(ENG_PREFIX.WDONE)) {
    const ticketNumber = upper.replace(ENG_PREFIX.WDONE, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "work_done", ticketNumber);
    await sendEngineerMessage(
      from,
      `🔧 *Work Done for ${ticketNumber}:*\n\nPlease reply with the repair notes and action taken.`,
    );
    return;
  }
  if (upper.startsWith("NOTE ")) {
    const rest = text.slice(5).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *NOTE <ticketNumber> <work notes>*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const body = rest.slice(spaceIdx + 1).trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, { workDone: body });
    setActiveTicket(from, ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ *Work notes* saved for *${ticketNumber}*.\n\n` +
        `🔧 *Next Step:* Is this a warranty claim?`,
      [
        { id: `${ENG_PREFIX.WARR_YES}${ticketNumber}`, title: "Yes, Warranty" },
        { id: `${ENG_PREFIX.WARR_NO}${ticketNumber}`, title: "No Warranty" },
      ],
    );
    return;
  }

  // ── 11. Add Part Prompt / Command ──
  if (upper.startsWith(ENG_PREFIX.PART)) {
    const ticketNumber = upper.replace(ENG_PREFIX.PART, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "part", ticketNumber);
    await sendEngineerMessage(
      from,
      `🔩 *Add Replaced Part for ${ticketNumber}:*\n\nReply with details in format:\n*Part Name | Part Number | Quantity*\n\n_Example: Main Sensor PCB | PCB-E4 | 1_`,
    );
    return;
  }
  if (upper.startsWith("PART ")) {
    const rest = text.slice(5).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await sendEngineerMessage(from, `⚠️ Usage: *PART <ticketNumber> name | part# | qty*`);
      return;
    }
    const ticketNumber = rest.slice(0, spaceIdx).toUpperCase();
    const partSpec = rest.slice(spaceIdx + 1).trim();
    const segments = partSpec.split("|").map((s) => s.trim());
    const partName = segments[0];
    const partNumber = segments[1] || undefined;
    const quantity = Math.max(1, parseInt(segments[2] ?? "1", 10) || 1);
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket || !partName) {
      await sendEngineerMessage(from, `⚠️ Could not add part. Check ticket number and part name.`);
      return;
    }
    await upsertReportField(ticket.id, engineer.id, {
      appendPart: { partName, partNumber, quantity },
    });
    setActiveTicket(from, ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ Part added: *${partName}* ${partNumber ? `(${partNumber}) ` : ""}x${quantity}.\n\n` +
        `Add another part or upload your *finished work photo* to proceed.`,
    );
    return;
  }

  // ── 12. Warranty Claim Buttons ──
  if (upper.startsWith(ENG_PREFIX.WARR_YES) || upper.startsWith(ENG_PREFIX.WARR_NO)) {
    const isYes = upper.startsWith(ENG_PREFIX.WARR_YES);
    const ticketNumber = upper
      .replace(ENG_PREFIX.WARR_YES, "")
      .replace(ENG_PREFIX.WARR_NO, "")
      .trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (ticket) {
      await upsertReportField(ticket.id, engineer.id, { warrantyClaimRequested: isYes });
      setActiveTicket(from, ticketNumber);
      await sendEngineerMessage(
        from,
        `✅ Warranty claim marked *${isYes ? "Yes" : "No"}* for *${ticketNumber}*.\n\n` +
          `📸 *Next Step:* Please upload the *finished work photo* of the repaired machine.`,
      );
      return;
    }
  }

  // ── 13. Test Close (Quick Trial Close) ──
  if (upper.startsWith(ENG_PREFIX.TEST_CLOSE) || upper.startsWith("TESTCLOSE ")) {
    const ticketNumber = upper
      .replace(ENG_PREFIX.TEST_CLOSE, "")
      .replace("TESTCLOSE ", "")
      .trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (ticket) {
      await upsertReportField(ticket.id, engineer.id, {
        problemDiagnosed: "Customer trial / demonstration / test call",
        workDone: "Inspected and verified normal operation with customer",
        warrantyClaimRequested: false,
      });
      try {
        await TicketService.requestOTP(ticket.id, engineer.id);
        setActiveTicket(from, ticketNumber);
        setPending(from, "verify_otp", ticketNumber);
        await sendEngineerMessage(
          from,
          `✅ *Trial/Test Service Report recorded for ${ticketNumber}.*\n\n` +
            `🔐 A 4-digit closure OTP has been sent to the customer.\n` +
            `Please ask the customer for the code and reply with it here.`,
          [
            { id: `${ENG_PREFIX.VERIFY_PROMPT}${ticketNumber}`, title: "✅ Enter OTP" },
            { id: `${ENG_PREFIX.RESEND}${ticketNumber}`, title: "🔁 Resend OTP" },
          ],
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to generate OTP";
        await sendEngineerMessage(from, `⚠️ ${msg}`);
      }
      return;
    }
  }

  // ── 14. Request OTP ──
  if (upper.startsWith(ENG_PREFIX.OTP) || upper.startsWith("OTP ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.OTP, "").replace("OTP ", "").trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (!ticket) {
      await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
      return;
    }
    try {
      await TicketService.requestOTP(ticket.id, engineer.id);
      setActiveTicket(from, ticketNumber);
      setPending(from, "verify_otp", ticketNumber);
      await sendEngineerMessage(
        from,
        `🔐 *OTP Sent to Customer for Ticket ${ticketNumber}*\n\n` +
          `A 4-digit code has been delivered to the customer's WhatsApp/SMS.\n` +
          `Ask the customer for the code and reply with it here to close the ticket.`,
        [
          { id: `${ENG_PREFIX.VERIFY_PROMPT}${ticketNumber}`, title: "✅ Enter OTP" },
          { id: `${ENG_PREFIX.RESEND}${ticketNumber}`, title: "🔁 Resend OTP" },
        ],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not request OTP";
      await sendEngineerMessage(from, `⚠️ ${msg}`);
    }
    return;
  }

  // ── 15. Resend OTP ──
  if (upper.startsWith(ENG_PREFIX.RESEND) || upper.startsWith("RESEND ")) {
    const ticketNumber = upper.replace(ENG_PREFIX.RESEND, "").replace("RESEND ", "").trim();
    const ticket = await findEngineerTicket(ticketNumber, engineer.id);
    if (ticket) {
      try {
        await TicketService.requestOTP(ticket.id, engineer.id, false, true);
        await sendEngineerMessage(
          from,
          `🔁 *New OTP sent to customer for ${ticketNumber}.*\nAsk the customer for the 4-digit code and reply here.`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to resend OTP";
        await sendEngineerMessage(from, `⚠️ ${msg}`);
      }
      return;
    }
  }

  // ── 16. Enter OTP Prompt ──
  if (upper.startsWith(ENG_PREFIX.VERIFY_PROMPT)) {
    const ticketNumber = upper.replace(ENG_PREFIX.VERIFY_PROMPT, "").trim();
    setActiveTicket(from, ticketNumber);
    setPending(from, "verify_otp", ticketNumber);
    await sendEngineerMessage(
      from,
      `🔐 *Enter 4-Digit OTP for ${ticketNumber}:*\n\nPlease reply with the 4-digit code provided by the customer.`,
    );
    return;
  }

  // ── 17. Verify OTP Command ──
  if (upper.startsWith("VERIFY ")) {
    const parts = text.split(/\s+/);
    const ticketNumber = parts[1]?.toUpperCase();
    const code = parts[2];
    if (!ticketNumber || !code || !/^\d{4}$/.test(code)) {
      await sendEngineerMessage(from, `⚠️ Usage: *VERIFY <ticketNumber> <4-digit-code>*`);
      return;
    }
    await handleVerifyOtp(from, engineer, ticketNumber, code);
    return;
  }

  // ── 18. Troubleshoot keyword — redirect to type-based help ──
  if (upper === "TROUBLESHOOT" || upper === "TRAINING" || upper === "2" || upper === ENG_PREFIX.TS_GUIDE || upper === ENG_PREFIX.TS_VIDEOS) {
    const lang = await getEngineerLanguage(from);
    await sendEngineerMessage(
      from,
      tEng("TROUBLESHOOT_INFO", lang),
      getEngMainMenuButtons(lang),
    );
    return;
  }

  // ── 19. Help Command ──
  if (upper === "HELP" || upper === "COMMANDS") {
    await sendEngineerMessage(
      from,
      `📖 *Poornasree Engineer Help:*\n\n` +
        `💡 *Troubleshooting:* Just type any machine problem!\n` +
        `_(e.g. "vibro not working", "low voltage", "no display")_\n\n` +
        `📋 *Ticket Commands:*\n` +
        `• *TICKETS* — View active assigned tickets\n` +
        `• *START <TKT>* — Mark ticket In Progress\n` +
        `• *DIAGNOSE <TKT> <notes>* — Set diagnosed root cause\n` +
        `• *NOTE <TKT> <notes>* — Add work done notes\n` +
        `• *PART <TKT> name | part# | qty* — Add replaced part\n` +
        `• *OTP <TKT>* — Send OTP to customer\n` +
        `• *VERIFY <TKT> <code>* (or send 4 digits) — Close ticket\n` +
        `• *STATUS* — Summary of your tickets\n` +
        `• *Send Photo* — Upload machine photo`,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "STATUS", title: "📊 Status Summary" },
        { id: "MENU", title: "🏠 Main Menu" },
      ],
    );
    return;
  }

  // ── 20. Smart Fallback: Combined troubleshooting steps + matching videos ──
  if (text.length > 2) {
    // Search diagnostic checks, troubleshooting videos, and engineer training videos
    const [troubleshootMatch, troubleshootingVideos, trainingVideoMatches] = await Promise.all([
      findEngineerTroubleshooting(text, engineer.firstName),
      findVideosForQuery(text, 1).catch(() => []),
      searchTrainingVideos(text, 2).catch(() => []),
    ]);

    const hasSteps = !!troubleshootMatch?.formatted;
    const hasTroubleshootingVideo = troubleshootingVideos.length > 0;
    const hasTrainingVideos = trainingVideoMatches.length > 0;

    if (hasSteps || hasTroubleshootingVideo || hasTrainingVideos) {
      const parts: string[] = [];
      const lang = await getEngineerLanguage(from);

      if (hasSteps) {
        let stepsText = troubleshootMatch!.formatted;
        if (lang !== "en") {
          try {
            stepsText = await translateText(stepsText, lang);
          } catch (e) {
            console.error("[engineer-whatsapp] Error translating troubleshooting steps:", e);
          }
        }
        parts.push(stepsText);
      }

      // If matching complaint has a troubleshooting video, present it
      if (hasTroubleshootingVideo) {
        const videoLines = troubleshootingVideos
          .map((v) => `🎬 *${v.title}*\n👉 ${v.youtubeUrl}`)
          .join("\n\n");
        const videoTitle = lang === "ml"
          ? "📺 *ട്രബിൾഷൂട്ടിംഗ് വീഡിയോ:*"
          : lang === "hi"
          ? "📺 *समस्या निवारण वीडियो:*"
          : "📺 *Related Troubleshooting Video:*";
        parts.push(`${hasSteps ? "\n\n────────────────\n\n" : ""}${videoTitle}\n\n${videoLines}`);
      } else if (hasTrainingVideos) {
        // If not a machine fault troubleshooting video, but matches engineer setup training (e.g. "channels")
        const videoLines = trainingVideoMatches
          .map((v) => `🎬 *${v.title}*\n👉 ${v.youtubeUrl}`)
          .join("\n\n");
        const trainingTitle = lang === "ml"
          ? "🎓 *ട്രെയിനിംഗ് വീഡിയോകൾ:*"
          : lang === "hi"
          ? "🎓 *प्रशिक्षण वीडियो:*"
          : "🎓 *Related Training Videos:*";
        parts.push(`${hasSteps ? "\n\n────────────────\n\n" : ""}${trainingTitle}\n\n${videoLines}`);
      }

      const footer = lang === "ml"
        ? "\n\n_മറ്റൊരു മെഷീൻ പ്രശ്നം എപ്പോൾ വേണമെങ്കിലും ടൈപ്പ് ചെയ്യുക, അല്ലെങ്കിൽ താഴെ ക്ലിക്ക് ചെയ്യുക:_"
        : lang === "hi"
        ? "\n\n_किसी अन्य मशीन की समस्या कभी भी टाइप करें, या नीचे टैप करें:_"
        : "\n\n_Type another machine problem anytime, or tap below:_";

      await sendEngineerMessage(
        from,
        parts.join("") + footer,
        getEngMainMenuButtons(lang),
      );
      return;
    }
  }

  // ── 20b. Typo-tolerant command matching ──
  const fuzzyMatch = fuzzyMatchCommand(upper);
  if (fuzzyMatch) {
    return handleEngineerMessage(from, fuzzyMatch, engineer);
  }

  // ── Default Fallback ──
  const lang = await getEngineerLanguage(from);
  const fallbackMsg = lang === "ml"
    ? `ഹലോ ${engineer.firstName}, *"${text.length > 40 ? text.slice(0, 37) + "..." : text}"* എന്നതിന് വിവരങ്ങളൊന്നും കണ്ടെത്താനായില്ല.\n\n💡 _ട്രബിൾഷൂട്ടിംഗ് ഘട്ടങ്ങൾ ലഭിക്കാൻ മെഷീൻ പ്രശ്നം ടൈപ്പ് ചെയ്യുക (ഉദാ: "vibro not working", "no display", "low voltage")._`
    : lang === "hi"
    ? `नमस्ते ${engineer.firstName}, मुझे *"${text.length > 40 ? text.slice(0, 37) + "..." : text}"* के लिए कोई परिणाम नहीं मिला।\n\n💡 _समस्या निवारण के लिए मशीन की समस्या टाइप करें (उदा: "vibro not working", "no display", "low voltage")._`
    : `Hi ${engineer.firstName}, I couldn't find a match for *"${text.length > 40 ? text.slice(0, 37) + "..." : text}"*.\n\n💡 _Try typing a machine problem (e.g. "vibro not working", "no display", "low voltage") to get troubleshooting steps._`;

  await sendEngineerMessage(
    from,
    fallbackMsg,
    getEngMainMenuButtons(lang),
  );
}

/**
 * Lists all active tickets assigned to this engineer.
 */
async function handleListTickets(
  from: string,
  engineer: { id: string; firstName: string },
  page: number = 0,
): Promise<void> {
  const lang = await getEngineerLanguage(from);
  const PAGE_SIZE = 8;
  const tickets = (await prisma.ticket.findMany({
    where: {
      assignedEngineerId: engineer.id,
      status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
    },
    select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
    orderBy: { updatedAt: "desc" },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  })) as EngineerTicketRow[];

  if (tickets.length === 0 && page === 0) {
    await sendEngineerMessage(
      from,
      tEng("NO_TICKETS", lang, { name: engineer.firstName }),
      getEngMainMenuButtons(lang),
    );
    return;
  }

  if (tickets.length === 0 && page > 0) {
    const noMoreMsg = lang === "ml" ? "ഈ പേജിൽ കൂടുതൽ സജീവ ടിക്കറ്റുകളൊന്നുമില്ല." : "No more active tickets found on this page.";
    const firstPageBtn = lang === "ml" ? "⬅️ ആദ്യ പേജ്" : "⬅️ First Page";
    await sendEngineerMessage(from, noMoreMsg, [
      { id: "PAGE:0", title: firstPageBtn },
      getMainMenuButton(lang),
    ]);
    return;
  }

  const hasNext = tickets.length > PAGE_SIZE;
  const displayTickets = tickets.slice(0, PAGE_SIZE);

  // If only 1 ticket on first page, show its full detail card and actions directly
  if (displayTickets.length === 1 && page === 0 && !hasNext) {
    const t = displayTickets[0];
    setActiveTicket(from, t.ticketNumber);
    const prefixMsg = lang === "ml" ? "📋 നിങ്ങൾക്ക് 1 സജീവ ടിക്കറ്റ് ഉണ്ട്:\n\n" : "📋 You have 1 active ticket:\n\n";
    await sendTicketActionButtons(from, t, engineer.id, {
      includeDetails: true,
      prefix: prefixMsg,
    });
    return;
  }

  // Multiple tickets: present an interactive list picker
  const rows: { id: string; title: string; description: string }[] = displayTickets.map((t) => {
    const customerName = resolveTicketCustomerName(t) || "Customer";
    const place = t.pincode?.place || t.machineAddress1 || "";
    let statusIcon = "🔵";
    if (t.status === "IN_PROGRESS") statusIcon = "🟡";
    if (t.status === "PENDING_OTP") statusIcon = "🟠";
    return {
      id: `${ENG_PREFIX.SEL}${t.ticketNumber}`,
      title: `${statusIcon} ${t.ticketNumber}`.slice(0, 24),
      description: `${customerName} · ${place}`.slice(0, 72),
    };
  });

  if (page > 0) {
    rows.push({
      id: `PAGE:${page - 1}`,
      title: lang === "ml" ? "⬅️ മുൻപേജ്" : "⬅️ Previous Page",
      description: `View previous page`,
    });
  }

  if (hasNext) {
    rows.push({
      id: `PAGE:${page + 1}`,
      title: lang === "ml" ? "➡️ അടുത്ത പേജ്" : "➡️ Next Page",
      description: `View more tickets`,
    });
  }

  const listText = displayTickets
    .map((t, idx) => {
      const customerName = resolveTicketCustomerName(t) || "Customer";
      const place = t.pincode?.place || "—";
      let statusIcon = "🔵";
      if (t.status === "IN_PROGRESS") statusIcon = "🟡";
      if (t.status === "PENDING_OTP") statusIcon = "🟠";
      return `${page * PAGE_SIZE + idx + 1}. ${statusIcon} *${t.ticketNumber}* (${t.status})\n   👤 ${customerName} · 📍 ${place}`;
    })
    .join("\n\n");

  const headerMsg = lang === "ml"
    ? `📋 *സജീവമായ ടിക്കറ്റുകൾ (${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + displayTickets.length}):*\n\n${listText}\n\nവിവരങ്ങൾ കാണാനും ജോലി ആരംഭിക്കാനും ഒരു ടിക്കറ്റ് തിരഞ്ഞെടുക്കുക:`
    : `📋 *Active Tickets (${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + displayTickets.length}):*\n\n${listText}\n\nSelect a ticket to view details and start work:`;

  const btnText = lang === "ml" ? "ടിക്കറ്റ് തിരഞ്ഞെടുക്കുക" : lang === "hi" ? "टिकट चुनें" : "Select Ticket";

  await sendEngineerMessage(
    from,
    headerMsg,
    undefined,
    {
      buttonText: btnText,
      rows,
    },
  );
}

/**
 * Shows ticket count summary by status for the engineer.
 */
async function handleStatusSummary(
  from: string,
  engineer: { id: string; firstName: string },
): Promise<void> {
  const lang = await getEngineerLanguage(from);
  const [assignedCount, inProgressCount, pendingOtpCount, closedCount] = await Promise.all([
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "ASSIGNED" } }),
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "PENDING_OTP" } }),
    prisma.ticket.count({ where: { assignedEngineerId: engineer.id, status: "CLOSED" } }),
  ]);

  const totalActive = assignedCount + inProgressCount + pendingOtpCount;

  const labels = {
    title: lang === "ml" ? `📊 *ടിക്കറ്റ് സംഗ്രഹം — ${engineer.firstName}*` : lang === "hi" ? `📊 *टिकट सारांश — ${engineer.firstName}*` : `📊 *Ticket Summary — ${engineer.firstName}*`,
    assigned: lang === "ml" ? "🔵 *അസൈൻ ചെയ്തത് (പുതിയത്):*" : lang === "hi" ? "🔵 *सौंपा गया (नया):*" : "🔵 *Assigned (New):*",
    inProgress: lang === "ml" ? "🟡 *ജോലി പുരോഗമിക്കുന്നു:*" : lang === "hi" ? "🟡 *प्रगति पर है:*" : "🟡 *In Progress:*",
    pendingOtp: lang === "ml" ? "🟠 *OTP കാത്തിരിക്കുന്നു:*" : lang === "hi" ? "🟠 *लंबित OTP:*" : "🟠 *Pending OTP:*",
    active: lang === "ml" ? "📋 *ആകെ സജീവം:*" : lang === "hi" ? "📋 *कुल सक्रिय:*" : "📋 *Total Active:*",
    closed: lang === "ml" ? "✅ *പൂർത്തിയായത് / ക്ലോസ് ചെയ്തത്:*" : lang === "hi" ? "✅ *पूर्ण / बंद:*" : "✅ *Completed / Closed:*",
  };

  const msg = [
    labels.title,
    ``,
    `${labels.assigned} ${assignedCount}`,
    `${labels.inProgress} ${inProgressCount}`,
    `${labels.pendingOtp} ${pendingOtpCount}`,
    `────────────────`,
    `${labels.active} ${totalActive}`,
    `${labels.closed} ${closedCount}`,
  ].join("\n");

  await sendEngineerMessage(from, msg, getEngMainMenuButtons(lang));
}

/**
 * Lists all engineer training videos uploaded in the system.
 */
async function handleListTrainingVideos(
  from: string,
  engineer: { id: string; firstName: string; lastName?: string | null },
): Promise<void> {
  const lang = await getEngineerLanguage(from);
  const videos = await prisma.engineerTrainingVideo.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (videos.length === 0) {
    const emptyMsg =
      lang === "ml"
        ? "🎓 നിലവിൽ ട്രെയിനിംഗ് വീഡിയോകൾ ലഭ്യമല്ല."
        : lang === "hi"
        ? "🎓 फिलहाल कोई प्रशिक्षण वीडियो उपलब्ध नहीं है।"
        : "🎓 No training videos have been uploaded yet.";
    await sendEngineerMessage(from, emptyMsg, getEngMainMenuButtons(lang));
    return;
  }

  lastEngineerMenuMap.set(from, "training_videos");

  const messageText = formatTrainingVideoListMessage(videos, lang);
  const listDrawer = getTrainingVideoInteractiveList(videos, lang);

  await sendEngineerMessage(from, messageText, undefined, listDrawer);
}

/**
 * Displays a specific engineer training video with direct YouTube link and navigation buttons.
 */
async function handleShowTrainingVideo(
  from: string,
  engineer: { id: string; firstName: string; lastName?: string | null },
  index: number,
): Promise<void> {
  const lang = await getEngineerLanguage(from);
  const videos = await prisma.engineerTrainingVideo.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (videos.length === 0) {
    await sendEngineerMessage(
      from,
      "🎓 No training videos found.",
      getEngMainMenuButtons(lang),
    );
    return;
  }

  if (index < 1 || index > videos.length) {
    const invalidMsg =
      lang === "ml"
        ? `⚠️ ദയവായി 1 നും ${videos.length} നും ഇടയിലുള്ള ഒരു വീഡിയോ നമ്പർ തിരഞ്ഞെടുക്കുക.`
        : lang === "hi"
        ? `⚠️ कृपया 1 से ${videos.length} के बीच का वीडियो नंबर चुनें।`
        : `⚠️ Please choose a valid video number between 1 and ${videos.length}.`;
    await sendEngineerMessage(from, invalidMsg, getTrainingVideoDetailButtons(lang));
    return;
  }

  lastEngineerMenuMap.set(from, "training_videos");
  const selectedVideo = videos[index - 1];
  const detailMsg = formatTrainingVideoDetail(selectedVideo, index, lang);

  await sendEngineerMessage(from, detailMsg, getTrainingVideoDetailButtons(lang));
}

/**
 * Handles OTP verification and closing the ticket.
 */
async function handleVerifyOtp(
  from: string,
  engineer: { id: string; firstName: string },
  ticketNumber: string,
  code: string,
): Promise<void> {
  const ticket = await findEngineerTicket(ticketNumber, engineer.id);
  if (!ticket) {
    await sendEngineerMessage(from, `❌ Ticket *${ticketNumber}* not found.`);
    return;
  }

  try {
    const updated = await TicketService.verifyOTP(ticket.id, engineer.id, code);
    await afterOtpTicketClosed(updated);
    setActiveTicket(from, "");
    clearPending(from);

    await sendEngineerMessage(
      from,
      `🎉 *TICKET CLOSED SUCCESSFULLY!*\n\n` +
        `Ticket *${ticketNumber}* has been verified and marked as *CLOSED* ✅.\n\n` +
        `A service completion confirmation and feedback survey have been sent to the customer. Thank you!`,
      [
        { id: "TICKETS", title: "📋 My Tickets" },
        { id: "STATUS", title: "📊 Status Summary" },
      ],
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OTP Verification failed";
    await sendEngineerMessage(
      from,
      `❌ *OTP Verification Failed:* ${msg}\n\nPlease check the 4-digit code with the customer or tap *Resend OTP*.`,
      [
        { id: `${ENG_PREFIX.VERIFY_PROMPT}${ticketNumber}`, title: "✅ Re-enter OTP" },
        { id: `${ENG_PREFIX.RESEND}${ticketNumber}`, title: "🔁 Resend OTP" },
        { id: "TICKETS", title: "📋 All Tickets" },
      ],
    );
  }
}

/**
 * Handles photo uploads sent by a service engineer.
 */
export async function handleEngineerMedia(
  from: string,
  msg: Record<string, unknown>,
  engineer: { id: string; firstName: string },
): Promise<void> {
  const mediaObj = (msg.image || msg.document) as Record<string, unknown> | undefined;
  const mediaId = String(mediaObj?.id ?? "");

  if (!mediaId) {
    await sendEngineerMessage(from, `⚠️ Could not read image attachment.`);
    return;
  }

  // Find target active ticket
  let activeTn = getActiveTicket(from);
  let ticket: EngineerTicketRow | null = null;

  if (activeTn) {
    ticket = (await findEngineerTicket(activeTn, engineer.id)) as EngineerTicketRow | null;
  }

  if (!ticket) {
    const inProgressTicket = await prisma.ticket.findFirst({
      where: { assignedEngineerId: engineer.id, status: "IN_PROGRESS" },
      select: { ...ENGINEER_ACTIVE_TICKET_SELECT, id: true },
      orderBy: { updatedAt: "desc" },
    });
    ticket = inProgressTicket as EngineerTicketRow | null;
  }

  if (!ticket) {
    await sendEngineerMessage(
      from,
      `📸 Photo received, but no active *In Progress* ticket was found.\n\nPlease type *TICKETS* and select a ticket first.`,
      [{ id: "TICKETS", title: "📋 My Tickets" }],
    );
    return;
  }

  // Download media buffer
  const buffer = await WhatsAppService.downloadMediaBuffer(mediaId);
  if (!buffer) {
    await sendEngineerMessage(from, `⚠️ Could not download image from WhatsApp.`);
    return;
  }

  // Save to disk
  const uploadDir = path.resolve(process.cwd(), "uploads/work-reports");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `${Date.now()}_${engineer.id.slice(0, 8)}.jpg`;
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);

  // Attach to work report
  const { type, ticketNumber } = await attachWorkReportPhoto(ticket.id, engineer.id, filename);
  setActiveTicket(from, ticketNumber);

  if (type === "reached") {
    setPending(from, "diagnose", ticketNumber);
    await sendEngineerMessage(
      from,
      `✅ *Arrival Photo Attached to ${ticketNumber}!*\n\n` +
        `📝 *Next Step:* Please enter the *problem diagnosed* (root cause).\n\n` +
        `_(Or reply with: DIAGNOSE ${ticketNumber} <root cause>)_`,
    );
  } else if (type === "finished") {
    const updated = (await findEngineerTicket(ticketNumber, engineer.id)) as EngineerTicketRow;
    await sendTicketActionButtons(from, updated, engineer.id, {
      prefix:
        `✅ *Finished Work Photo Attached to ${ticketNumber}!*\n\n` +
        `🔐 *Next Step:* Click *Request OTP* below to close the ticket.\n\n`,
    });
  } else {
    await sendEngineerMessage(
      from,
      `✅ Photo attached to ticket *${ticketNumber}* successfully.`,
      [
        { id: `${ENG_PREFIX.SEL}${ticketNumber}`, title: "📋 Ticket Details" },
        { id: "TICKETS", title: "📋 All Tickets" },
      ],
    );
  }
}

// ── Helper: Format troubleshooting steps neatly ───────────────────────────
function formatTroubleshootingSteps(title: string, rawContent: string, engineerName?: string): string {
  // If rawContent already starts with "Hi ... here are the troubleshooting steps", return it directly
  if (/^Hi\s+[^,]+,\s+here are the troubleshooting steps/i.test(rawContent.trim())) {
    return rawContent.trim();
  }

  const cleanTitle = title
    .replace(/^To fix /i, "")
    .replace(/^To troubleshoot /i, "")
    .replace(/^To resolve /i, "")
    .replace(/^Analyzer — /i, "")
    .trim();

  let issueText = cleanTitle;
  if (/engineers?\s+training/i.test(cleanTitle) || /technical\s+guide/i.test(cleanTitle) || /troubleshooting\s+guide/i.test(cleanTitle)) {
    issueText = "reported issue";
  } else if (!cleanTitle.toLowerCase().includes("issue") && !cleanTitle.toLowerCase().includes("error") && !cleanTitle.toLowerCase().includes("problem")) {
    issueText = `${cleanTitle} issue`;
  }

  const name = engineerName ? engineerName.trim() : "there";
  const greeting = `Hi ${name}, here are the troubleshooting steps to resolve the ${issueText}:`;

  // If rawContent already contains keycap numbers (e.g. 1️⃣, 2️⃣), preserve and wrap with greeting & footer
  if (rawContent.includes("1️⃣")) {
    const cleanRaw = rawContent
      .replace(/\n\s*If none of the above steps help.*?$/gim, "")
      .replace(/If none of the above steps help.*?$/gim, "")
      .trim();
    return `${greeting}\n\n${cleanRaw}\n\nIf the issue persists after these checks, please submit a service diagnosis report or request component replacement approval.`;
  }

  const text = rawContent
    .replace(/\n\s*\d+\.\s*If none of the above steps help.*?$/gim, "")
    .replace(/If none of the above steps help.*?$/gim, "")
    .replace(/Book a service visit.*?$/gim, "")
    .replace(/Please raise a service request.*?$/gim, "")
    .trim();

  const lines = text.split("\n");
  const formattedLines: string[] = [];
  const numEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  let stepIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const numMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)/i);
    if (numMatch) {
      stepIndex++;
      const emoji = numEmojis[stepIndex - 1] || `${stepIndex}️⃣`;
      const stepBody = numMatch[2].trim();
      if (stepBody.includes("->")) {
        const [c, ...a] = stepBody.split("->");
        if (formattedLines.length > 0) formattedLines.push("");
        formattedLines.push(`${emoji} *${c.trim()}:*`);
        formattedLines.push(`• ${a.join(" -> ").trim()}`);
      } else {
        if (formattedLines.length > 0) formattedLines.push("");
        formattedLines.push(`${emoji} *${stepBody}:*`);
      }
    } else if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
      formattedLines.push(trimmed.startsWith("•") ? trimmed : `• ${trimmed.replace(/^-\s*/, "")}`);
    } else if (trimmed.startsWith("↳")) {
      formattedLines.push(`   ${trimmed}`);
    } else if (
      /^To (fix|troubleshoot|resolve)/i.test(trimmed) ||
      /^Description:/i.test(trimmed) ||
      /^Steps:?$/i.test(trimmed) ||
      trimmed.toLowerCase() === title.toLowerCase() ||
      trimmed.toLowerCase() === cleanTitle.toLowerCase()
    ) {
      // skip title header and metadata lines
    } else {
      formattedLines.push(trimmed);
    }
  }

  const body = formattedLines.join("\n");
  return `${greeting}\n\n${body}\n\nIf the issue persists after these checks, please submit a service diagnosis report or request component replacement approval.`;
}

// ── Helper: Search Document Chunks & Service Catalog for troubleshooting ──
// Accurately matches against admin-uploaded documents (DocumentChunks) and service technical guides.
export async function findEngineerTroubleshooting(
  query: string,
  engineerName?: string,
): Promise<{ title: string; formatted: string } | null> {
  const cleanQ = query.toLowerCase().trim();
  const qTokens = cleanQ.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
  if (qTokens.length === 0) return null;

  // 1. Search Service Catalog entries (role: "service" takes top priority)
  const catalog = await getCatalogForRole("service");
  // Only include entries explicitly meant for service engineers.
  // (Do not fallback to customer documents here, as it confuses engineers)
  const serviceCatalog = catalog.filter((e) => e.role === "service");

  let bestEntry: (typeof catalog)[0] | null = null;
  let bestScore = 0;

  for (const e of serviceCatalog) {
    let score = 0;
    if (e.role === "service") score += 50;

    const patterns = (e.patterns || []).map((p) => p.toLowerCase());
    for (const p of patterns) {
      if (p === cleanQ) score += 200;
      else if (p.includes(cleanQ) || cleanQ.includes(p)) score += 100;
    }

    const titleLower = e.title.toLowerCase();
    if (titleLower === cleanQ) score += 150;
    else if (titleLower.includes(cleanQ) || cleanQ.includes(titleLower)) score += 80;

    const allText = `${e.title} ${(e.patterns || []).join(" ")} ${e.content}`.toLowerCase();
    let matched = 0;
    for (const w of qTokens) {
      if (allText.includes(w)) matched++;
    }
    if (matched === qTokens.length) score += 60;
    else score += matched * 10;

    if (/->|REPLACE|CHECK THE|ADJUST/i.test(e.content)) {
      score += 30;
    }

    if (e.source === "document_issue") {
      if (e.role === "service") {
        score += 200; // Prioritize extracted steps from uploaded ENGINEER documents
      } else {
        score += 50; // Give a small boost to extracted CUSTOMER documents
      }
    }

    if (score > bestScore && score >= 35 && matched > 0) {
      bestScore = score;
      bestEntry = e;
    }
  }

  // 2. Also search DocumentChunks from admin-uploaded service documents
  const serviceChunks = await prisma.documentChunk.findMany({
    where: { document: { documentType: { in: ["service", "both"] } } },
    select: { content: true, document: { select: { title: true } } },
  });

  let bestChunk: (typeof serviceChunks)[0] | null = null;
  let bestChunkScore = 0;
  for (const chunk of serviceChunks) {
    const cLower = chunk.content.toLowerCase();
    let score = 0;
    if (cLower.includes(cleanQ)) score += 120;
    let matched = 0;
    for (const w of qTokens) {
      if (cLower.includes(w)) matched++;
    }
    if (matched === qTokens.length) score += 70;
    else score += matched * 10;

    if (/->|REPLACE|CHECK THE/i.test(chunk.content)) {
      score += 30;
    }

    if (score > 0) {
      score += 20;
    }

    if (score > bestChunkScore && score >= 45 && matched > 0) {
      bestChunkScore = score;
      bestChunk = chunk;
    }
  }

  let finalTitle = "";
  let finalContent = "";

  // Prioritize high-confidence catalog / DocumentIssue matches over raw document chunks
  if (bestEntry && (bestScore >= 100 || bestScore >= bestChunkScore)) {
    finalTitle = bestEntry.title || "Troubleshooting Guide";
    finalContent = bestEntry.content;
  } else if (bestChunk && bestChunkScore >= 60) {
    const firstLine = bestChunk.content.split(/\r?\n/)[0]?.trim() || "";
    const titleMatch = firstLine.match(/^To\s+(?:fix|troubleshoot|resolve)\s+(?:the\s+)?([^\:\,\n]+)/i);
    finalTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim() : (bestChunk.document?.title || "Technical Guide");
    finalContent = bestChunk.content;
  } else if (bestEntry) {
    finalTitle = bestEntry.title || "Troubleshooting Guide";
    finalContent = bestEntry.content;
  } else if (bestChunk) {
    const firstLine = bestChunk.content.split(/\r?\n/)[0]?.trim() || "";
    const titleMatch = firstLine.match(/^To\s+(?:fix|troubleshoot|resolve)\s+(?:the\s+)?([^\:\,\n]+)/i);
    finalTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim() : (bestChunk.document?.title || "Technical Guide");
    finalContent = bestChunk.content;
  } else {
    return null;
  }

  return {
    title: finalTitle,
    formatted: formatTroubleshootingSteps(finalTitle, finalContent, engineerName),
  };
}

// ── Helper: Simple edit distance (Levenshtein, capped at 3 for perf) ────
function simpleEditDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Helper: Fuzzy command matching for typos ─────────────────────────────
// Maps common misspellings to known commands. Returns the canonical command or null.
function fuzzyMatchCommand(input: string): string | null {
  const COMMANDS: Record<string, string[]> = {
    TICKETS: ["TIVKET", "TIVKETS", "TIKET", "TIKETS", "TICKT", "TIKKETS", "TIKKET", "TICETS", "TCKETS", "TICKES", "TOKETS"],
    STATUS:  ["STAUS", "STATSU", "STATIS", "SATUS", "STAUTS", "SUMARY", "SUMMRY", "STATUSS"],
    TROUBLESHOOT: ["TROBLESHOT", "TRUBLESHOOT", "TRUBBLESHOOT", "TROUBESHOOT", "TROUBLESHOT", "TROUBLSHOOT"],
    HELP:    ["HLEP", "HALP", "HLP", "HEPL", "HELPP"],
    MENU:    ["MANU", "MENUE", "MANU", "MNEU"],
  };

  // Check known typo list first (fast path)
  for (const [canonical, typos] of Object.entries(COMMANDS)) {
    if (typos.includes(input)) return canonical;
  }

  // Edit distance fallback for unlisted typos
  const canonicals = Object.keys(COMMANDS);
  for (const cmd of canonicals) {
    const dist = simpleEditDistance(input, cmd);
    if (dist <= 2 && input.length >= 3) return cmd;
  }

  return null;
}
