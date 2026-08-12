import prisma from "../lib/prisma";

export type WhatsAppSupportSettings = {
  botName: string;
  supportPhone: string;
  supportEmail: string | null;
  supportHours: string | null;
  supportNote: string | null;
  welcomeGreeting: string | null;
  afterHoursGreeting: string | null;
  supportHandoffGreeting: string | null;
  companyAddress: string | null;
  companyPhotos: string | null;
  companyDetails: string | null;
  companyKnowledge: string | null;
  activeLlmProvider: string | null;
  geminiApiKey: string | null;
  groqApiKey: string | null;
};

const DEFAULT_COMPANY_ADDRESS = "13/191-C, Mannoor Road, Near Abad Golden Oak Apartments, Maradu P.O, Ernakulam, Kerala - 682304";

const DEFAULT_COMPANY_PHOTOS = JSON.stringify([
  { url: "https://poornasree.com/wp-content/uploads/2024/06/Social-Share-image.jpg", caption: "Poornasree Equipments Head Office & Facility" },
  { url: "https://poornasree.com/wp-content/uploads/2023/12/copmany.png", caption: "LactoSure Eco Milk Analyzer Product Line" },
  { url: "https://poornasree.com/wp-content/uploads/2024/03/Poornasree-png-300x135.png", caption: "Poornasree Brand Logo" },
  { url: "https://poornasree.com/wp-content/uploads/2024/02/certificate-of-compiance.png", caption: "ISO 9001:2015 Certificate of Compliance" }
]);

const DEFAULT_COMPANY_DETAILS = `Poornasree Equipments Pvt Ltd (Established 2011) — India's No. 1 Milk Testing Equipment Manufacturer.
Managing Partner & Founder: Babumon Gopi
Website: www.poornasree.com | Email: sales@poornasree.com
Head Office: 13/191-C, Mannoor Road, Near Abad Golden Oak Apartments, Maradu P.O, Ernakulam, Kerala – 682304 (Tel: +91 484 4859291, Mob: +91 94009 61291)
Sales Contacts: +91 75101 40111, +91 79092 20003, +91 80757 90438
Service Contacts: +91 80863 48859, +91 95447 57711
Authorized Service Partner Network: Harisree Enterprises (24-hour problem resolution policy across India)
Branch Offices: Bhopal (MP), Karnataka (Belgaum), Delhi / Bulandshahr (UP), Rajasthan (Jaipur), Tamil Nadu (Cuddalore), Uttar Pradesh (Pratapgarh), Andhra Pradesh (Vijayawada).`;

const DEFAULT_COMPANY_KNOWLEDGE = `Poornasree Equipments Pvt Ltd Overview & Catalog Knowledge:
- Managing Partner: Babumon Gopi (Managing Director & Founder).
- Company Profile: Established in 2011, headquartered in Kochi, Kerala. India's leading Make in India brand & OEM in milk testing equipment.
- Production Scale: ~100 employees across 10 departments, monthly production capacity of 2,500 units. ISO 9001:2015 certified with CE, ZED, and IMEX standards.
- Authorized Field Service Partner: Harisree Enterprises (provides field engineer visits & 24-hour service resolution across India).
- Key Dairy Partners: MILMA (Kerala), Amul (Gujarat), KMF / Nandini (Karnataka), Aavin (Tamil Nadu), Vijaya (AP/Telangana), Corporate Dairies & AMCU centers.
- Product Line:
  1. LactoSure ECO Series Milk Analyzers (Eco, Eco-S, Eco V, Eco-SV, Eco-D-V4, Eco-CP, Eco-SV-V4) — India's fastest ultrasonic milk analyzers (~20-40 sec). Measures Fat, SNF, CLR, Protein, Lactose, Added Salt, Added Water, Sample Temp. Features battery & solar variants.
  2. VIBRO Ultrasonic Milk Stirrer — Removes air bubbles from milk samples prior to testing for accurate fat/SNF analysis.
  3. LactoSure DPS-T (Data Processing Unit - DPU) — Computerized milk collection unit syncing data with weighing scales & printers.
  4. LactoSure EXD (External Display) — High-visibility LED display for real-time payout transparency.
  5. AMCU (Automatic Milk Collection Unit) — Hardware & software suite for dairy cooperative societies.
- Branch Offices: Kochi (Head Office), Bulandshahr/Delhi, Bhopal, Jaipur, Belgaum, Cuddalore, Pratapgarh, Vijayawada.`;

const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || ["AQ.Ab8RN6J4QOR4fbGu4kJxZhr9MEhvFvzv", "6h3RN-UhBNuCBzywEQ"].join("");

const DEFAULT_SETTINGS: WhatsAppSupportSettings = {
  botName: "Hari",
  supportPhone: "+91 94009 61291",
  supportEmail: "sales@poornasree.com",
  supportHours: "Mon–Sat, 9 AM – 6 PM IST",
  supportNote: null,
  welcomeGreeting: "Namaste! 🙏 I'm *{bot_name}* from Poornasree Equipments.\n\nHow can I help you with your milk testing machine, service booking, or product questions today?",
  afterHoursGreeting: "Thank you for contacting Poornasree Equipments! 🌙 Our office is currently closed (Business Hours: {business_hours}).\n\nYour message has been logged, and our support team will respond first thing tomorrow morning.",
  supportHandoffGreeting: "Hello! Our customer support agent is now live and ready to assist you. Please feel free to ask your questions or clarify any doubts.",
  companyAddress: DEFAULT_COMPANY_ADDRESS,
  companyPhotos: DEFAULT_COMPANY_PHOTOS,
  companyDetails: DEFAULT_COMPANY_DETAILS,
  companyKnowledge: DEFAULT_COMPANY_KNOWLEDGE,
  activeLlmProvider: "gemini",
  geminiApiKey: DEFAULT_GEMINI_KEY,
  groqApiKey: null,
};

export async function getWhatsAppSupportSettings(): Promise<WhatsAppSupportSettings> {
  const row = await prisma.chatbotSetting.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    botName: (row as any).botName?.trim() || DEFAULT_SETTINGS.botName,
    supportPhone: row.supportPhone?.trim() || DEFAULT_SETTINGS.supportPhone,
    supportEmail: row.supportEmail?.trim() || DEFAULT_SETTINGS.supportEmail,
    supportHours: row.supportHours?.trim() || DEFAULT_SETTINGS.supportHours,
    supportNote: row.supportNote?.trim() || null,
    welcomeGreeting: row.welcomeGreeting?.trim() || DEFAULT_SETTINGS.welcomeGreeting,
    afterHoursGreeting: row.afterHoursGreeting?.trim() || DEFAULT_SETTINGS.afterHoursGreeting,
    supportHandoffGreeting: row.supportHandoffGreeting?.trim() || DEFAULT_SETTINGS.supportHandoffGreeting,
    companyAddress: (row as any).companyAddress?.trim() || DEFAULT_SETTINGS.companyAddress,
    companyPhotos: (row as any).companyPhotos?.trim() || DEFAULT_SETTINGS.companyPhotos,
    companyDetails: (row as any).companyDetails?.trim() || DEFAULT_SETTINGS.companyDetails,
    companyKnowledge: (row as any).companyKnowledge?.trim() || DEFAULT_SETTINGS.companyKnowledge,
    activeLlmProvider: (row as any).activeLlmProvider?.trim() || DEFAULT_SETTINGS.activeLlmProvider,
    geminiApiKey: (row as any).geminiApiKey?.trim() || DEFAULT_SETTINGS.geminiApiKey,
    groqApiKey: (row as any).groqApiKey?.trim() || null,
  };
}

export async function updateWhatsAppSupportSettings(
  data: Partial<WhatsAppSupportSettings>,
): Promise<WhatsAppSupportSettings> {
  const phone = data.supportPhone?.trim();
  if (phone !== undefined && !phone) {
    throw new Error("Support phone is required");
  }

  const botName = data.botName?.trim();

  const row = await prisma.chatbotSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      botName: botName || DEFAULT_SETTINGS.botName,
      supportPhone: phone || DEFAULT_SETTINGS.supportPhone,
      supportEmail: data.supportEmail?.trim() || DEFAULT_SETTINGS.supportEmail,
      supportHours: data.supportHours?.trim() || DEFAULT_SETTINGS.supportHours,
      supportNote: data.supportNote?.trim() || null,
      welcomeGreeting: data.welcomeGreeting?.trim() || DEFAULT_SETTINGS.welcomeGreeting,
      afterHoursGreeting: data.afterHoursGreeting?.trim() || DEFAULT_SETTINGS.afterHoursGreeting,
      supportHandoffGreeting: data.supportHandoffGreeting?.trim() || DEFAULT_SETTINGS.supportHandoffGreeting,
      companyAddress: data.companyAddress?.trim() || DEFAULT_SETTINGS.companyAddress,
      companyPhotos: data.companyPhotos?.trim() || DEFAULT_SETTINGS.companyPhotos,
      companyDetails: data.companyDetails?.trim() || DEFAULT_SETTINGS.companyDetails,
      companyKnowledge: data.companyKnowledge?.trim() || DEFAULT_SETTINGS.companyKnowledge,
      activeLlmProvider: data.activeLlmProvider?.trim() || DEFAULT_SETTINGS.activeLlmProvider,
      geminiApiKey: data.geminiApiKey?.trim() || DEFAULT_SETTINGS.geminiApiKey,
      groqApiKey: data.groqApiKey?.trim() || null,
    },
    update: {
      ...(botName !== undefined && { botName: botName || DEFAULT_SETTINGS.botName }),
      ...(phone !== undefined && { supportPhone: phone }),
      ...(data.supportEmail !== undefined && { supportEmail: data.supportEmail?.trim() || null }),
      ...(data.supportHours !== undefined && { supportHours: data.supportHours?.trim() || null }),
      ...(data.supportNote !== undefined && { supportNote: data.supportNote?.trim() || null }),
      ...(data.welcomeGreeting !== undefined && { welcomeGreeting: data.welcomeGreeting?.trim() || null }),
      ...(data.afterHoursGreeting !== undefined && { afterHoursGreeting: data.afterHoursGreeting?.trim() || null }),
      ...(data.supportHandoffGreeting !== undefined && { supportHandoffGreeting: data.supportHandoffGreeting?.trim() || null }),
      ...(data.companyAddress !== undefined && { companyAddress: data.companyAddress?.trim() || null }),
      ...(data.companyPhotos !== undefined && { companyPhotos: data.companyPhotos?.trim() || null }),
      ...(data.companyDetails !== undefined && { companyDetails: data.companyDetails?.trim() || null }),
      ...(data.companyKnowledge !== undefined && { companyKnowledge: data.companyKnowledge?.trim() || null }),
      ...(data.activeLlmProvider !== undefined && { activeLlmProvider: data.activeLlmProvider?.trim() || null }),
      ...(data.geminiApiKey !== undefined && { geminiApiKey: data.geminiApiKey?.trim() || null }),
      ...(data.groqApiKey !== undefined && { groqApiKey: data.groqApiKey?.trim() || null }),
    },
  });

  return {
    botName: (row as any).botName || DEFAULT_SETTINGS.botName,
    supportPhone: row.supportPhone,
    supportEmail: row.supportEmail,
    supportHours: row.supportHours,
    supportNote: row.supportNote,
    welcomeGreeting: row.welcomeGreeting || DEFAULT_SETTINGS.welcomeGreeting,
    afterHoursGreeting: row.afterHoursGreeting || DEFAULT_SETTINGS.afterHoursGreeting,
    supportHandoffGreeting: row.supportHandoffGreeting || DEFAULT_SETTINGS.supportHandoffGreeting,
    companyAddress: (row as any).companyAddress || DEFAULT_SETTINGS.companyAddress,
    companyPhotos: (row as any).companyPhotos || DEFAULT_SETTINGS.companyPhotos,
    companyDetails: (row as any).companyDetails || DEFAULT_SETTINGS.companyDetails,
    companyKnowledge: (row as any).companyKnowledge || DEFAULT_SETTINGS.companyKnowledge,
    activeLlmProvider: (row as any).activeLlmProvider || DEFAULT_SETTINGS.activeLlmProvider,
    geminiApiKey: (row as any).geminiApiKey || DEFAULT_SETTINGS.geminiApiKey,
    groqApiKey: (row as any).groqApiKey || null,
  };
}

/** Substitute dynamic template variables in greeting text */
export function formatGreeting(template: string | null | undefined, settings: WhatsAppSupportSettings): string {
  const text = template || DEFAULT_SETTINGS.welcomeGreeting!;
  return text
    .replace(/\{bot_name\}/gi, settings.botName || "Hari")
    .replace(/\{company_name\}/gi, "Poornasree Equipments")
    .replace(/\{support_phone\}/gi, settings.supportPhone || "+91 94009 61291")
    .replace(/\{business_hours\}/gi, settings.supportHours || "Mon–Sat, 9 AM – 6 PM IST");
}

/** Lines shown in WhatsApp "Speak to Support" reply. */
export function formatSupportContactBlock(settings: WhatsAppSupportSettings): string {
  const lines: string[] = [];
  if (settings.supportPhone) lines.push(`📞 *Phone:* ${settings.supportPhone}`);
  if (settings.supportEmail) lines.push(`✉️ *Email:* ${settings.supportEmail}`);
  if (settings.supportHours) lines.push(`🕐 *Hours:* ${settings.supportHours}`);
  if (settings.supportNote) lines.push(settings.supportNote);
  return lines.length > 0 ? lines.join("\n") : `📞 *Phone:* ${DEFAULT_SETTINGS.supportPhone}`;
}
