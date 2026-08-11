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
};

const DEFAULT_SETTINGS: WhatsAppSupportSettings = {
  botName: "Hari",
  supportPhone: "+91 94009 61291",
  supportEmail: null,
  supportHours: null,
  supportNote: null,
  welcomeGreeting: "Namaste! 🙏 I'm *{bot_name}* from Poornasree Equipments.\n\nHow can I help you with your milk testing machine, service booking, or product questions today?",
  afterHoursGreeting: "Thank you for contacting Poornasree Equipments! 🌙 Our office is currently closed (Business Hours: {business_hours}).\n\nYour message has been logged, and our support team will respond first thing tomorrow morning.",
  supportHandoffGreeting: "Hello! Our customer support agent is now live and ready to assist you. Please feel free to ask your questions or clarify any doubts.",
};

export async function getWhatsAppSupportSettings(): Promise<WhatsAppSupportSettings> {
  const row = await prisma.chatbotSetting.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    botName: (row as any).botName?.trim() || DEFAULT_SETTINGS.botName,
    supportPhone: row.supportPhone?.trim() || DEFAULT_SETTINGS.supportPhone,
    supportEmail: row.supportEmail?.trim() || null,
    supportHours: row.supportHours?.trim() || null,
    supportNote: row.supportNote?.trim() || null,
    welcomeGreeting: row.welcomeGreeting?.trim() || DEFAULT_SETTINGS.welcomeGreeting,
    afterHoursGreeting: row.afterHoursGreeting?.trim() || DEFAULT_SETTINGS.afterHoursGreeting,
    supportHandoffGreeting: row.supportHandoffGreeting?.trim() || DEFAULT_SETTINGS.supportHandoffGreeting,
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
      supportEmail: data.supportEmail?.trim() || null,
      supportHours: data.supportHours?.trim() || null,
      supportNote: data.supportNote?.trim() || null,
      welcomeGreeting: data.welcomeGreeting?.trim() || DEFAULT_SETTINGS.welcomeGreeting,
      afterHoursGreeting: data.afterHoursGreeting?.trim() || DEFAULT_SETTINGS.afterHoursGreeting,
      supportHandoffGreeting: data.supportHandoffGreeting?.trim() || DEFAULT_SETTINGS.supportHandoffGreeting,
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
