import prisma from "../lib/prisma";

export type WhatsAppSupportSettings = {
  botName: string;
  supportPhone: string;
  supportEmail: string | null;
  supportHours: string | null;
  supportNote: string | null;
};

const DEFAULT_SETTINGS: WhatsAppSupportSettings = {
  botName: "Hari",
  supportPhone: "+91 94009 61291",
  supportEmail: null,
  supportHours: null,
  supportNote: null,
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
    },
    update: {
      ...(botName !== undefined && { botName: botName || DEFAULT_SETTINGS.botName }),
      ...(phone !== undefined && { supportPhone: phone }),
      ...(data.supportEmail !== undefined && { supportEmail: data.supportEmail?.trim() || null }),
      ...(data.supportHours !== undefined && { supportHours: data.supportHours?.trim() || null }),
      ...(data.supportNote !== undefined && { supportNote: data.supportNote?.trim() || null }),
    },
  });

  return {
    botName: (row as any).botName || DEFAULT_SETTINGS.botName,
    supportPhone: row.supportPhone,
    supportEmail: row.supportEmail,
    supportHours: row.supportHours,
    supportNote: row.supportNote,
  };
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
