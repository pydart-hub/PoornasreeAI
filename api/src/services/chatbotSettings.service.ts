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
};

const DEFAULT_COMPANY_ADDRESS = "13/191-C, Mannoor Road, Near Abad Golden Oak Apartments, Maradu P.O, Ernakulam, Kerala - 682304";

const DEFAULT_COMPANY_PHOTOS = JSON.stringify([
  { url: "https://poornasree.com/wp-content/uploads/2024/06/Social-Share-image.jpg", caption: "Poornasree Equipments Head Office & Facility" },
  { url: "https://poornasree.com/wp-content/uploads/2023/12/copmany.png", caption: "LactoSure Eco Milk Analyzer Product Line" },
  { url: "https://poornasree.com/wp-content/uploads/2024/03/Poornasree-png-300x135.png", caption: "Poornasree Brand Logo" },
  { url: "https://poornasree.com/wp-content/uploads/2024/02/certificate-of-compiance.png", caption: "ISO 9001:2015 Certificate of Compliance" }
]);

const DEFAULT_COMPANY_DETAILS = `Poornasree Equipments (Established 2011) — India's No. 1 Milk Testing Equipment Manufacturer.
Website: www.poornasree.com | Email: sales@poornasree.com
Head Office: 13/191-C, Mannoor Road, Near Abad Golden Oak Apartments, Maradu P.O, Ernakulam, Kerala – 682304 (Tel: +91 484 4859291, Mob: +91 94009 61291)
Sales Contacts: +91 75101 40111, +91 79092 20003, +91 80757 90438
Service Contacts: +91 80863 48859, +91 95447 57711
Branch Offices: Bhopal (MP), Karnataka (Belgaum), Delhi, Rajasthan (Jaipur), Tamil Nadu (Cuddalore), Uttar Pradesh (Pratapgarh), Andhra Pradesh (Vijayawada).`;

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
