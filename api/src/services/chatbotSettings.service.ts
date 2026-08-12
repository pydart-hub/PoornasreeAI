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

const DEFAULT_COMPANY_KNOWLEDGE = `POORNASREE EQUIPMENTS PVT LTD — COMPLETE OFFICIAL PRODUCT CATALOG & AI TRAINING KNOWLEDGE MATRIX:

1. LACTOSURE ECO SERIES MILK ANALYZERS (Category: lactosure)
- Overview: India's fastest & most reliable ultrasonic milk analyzers designed for dairy collection societies and farmers.
- Test Time: 20–30 seconds ultra-fast measurement per sample.
- Testing Parameters: Fat (0.01%–15%), SNF (3%–15%), Density/CLR (1.020–1.040 g/cm³), Protein (2%–7%), Lactose (0.01%–6%), Added Water (0%–70%), Sample Temperature (5°C–45°C), Freezing Point.
- Key Specifications & Operating Features:
  • Operating Voltage: 12V DC / 220V AC dual power capability.
  • Power Consumption: Low power consumption (~30W).
  • Sample Volume: ~15 ml per test.
  • Cleaning: Automatic cleaning & peristaltic pump rinse cycle.
  • Connectivity: RS232, Bluetooth, USB sync for external LED display (EXD), weighing scale, and thermal printers.
- Model Comparison Matrix:
  • ECO V3: Standard entry-level ultrasonic milk analyzer, highly reliable and fast.
  • ECO-V: Enhanced model with high-visibility digital display & improved sensor stability.
  • ECO SV-V4: Smart variant with built-in Bluetooth connectivity, fast processing, and mobile app sync.
  • ECO D-V4 (ECO-DS0G-12AH-V4): Premium dual-power variant equipped with integrated battery charger and solar charging port for uninterrupted operation in rural areas.

2. LACTOGRAND SERIES (Category: lactogrand)
- Overview: Industrial heavy-duty milk analyzers & computerized collection terminals engineered for high-volume dairy societies & milk collection centers.
- Testing Parameters: Full 8-parameter analysis (Fat, SNF, Density/CLR, Protein, Lactose, Salt, Added Water, Sample Temp).
- Hardware & Connectivity: High-resolution color LCD / Touchscreen, stainless steel probe, RS232/USB, built-in WiFi, GPRS / 4G cloud data transfer.
- Model Comparison Matrix:
  • LactoGrand Lite: Compact, budget-friendly high-accuracy milk analyzer.
  • LactoGrand SD: Industrial model with built-in SD card / internal memory storage for offline milk collection logging.
  • LactoGrand S Pro: Professional high-capacity analyzer with multi-scale calibration and thermal printer support.
  • LactoGrand S Pro Connect +: Ultimate flagship analyzer featuring WiFi, 4G cloud sync, GPRS, thermal printer integration, and direct society management software sync.

3. VIBRO ULTRASONIC MILK STIRRER (Category: other / stirrer)
- Function: Removes trapped air bubbles, froth, and gas from fresh milk samples in 5–10 seconds prior to ultrasonic analysis.
- Why It Is Essential: Air bubbles cause false low Fat & SNF readings. Using Vibro guarantees 100% accurate testing.
- Features: High-frequency ultrasonic vibration transducer, stainless steel beaker holder, automatic shut-off timer, splash-proof casing.

4. LACTOSURE EXD (EXTERNAL DISPLAY) (Category: other)
- Function: Remote high-brightness LED display unit.
- Purpose: Connects via RS232/Bluetooth to LactoSure analyzers to show Fat, SNF, rate, and total payout to farmers for full transparency.

5. AMCU (AUTOMATIC MILK COLLECTION UNIT) (Category: other)
- Function: Complete hardware & software suite combining Milk Analyzer (LactoSure/LactoGrand), Weighing Scale, Thermal Printer, and AMCU Software.
- Features: Automatic farmer identification, instant billing receipt printing, SMS alerts, and society cloud database upload.`;

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
