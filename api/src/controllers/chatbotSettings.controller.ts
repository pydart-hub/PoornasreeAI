import { Request, Response } from "express";
import {
  getWhatsAppSupportSettings,
  updateWhatsAppSupportSettings,
} from "../services/chatbotSettings.service";
import { clearTrainingCatalogCache } from "../services/training-catalog.service";

// GET /api/admin/chatbot-settings
export async function getChatbotSettings(_req: Request, res: Response): Promise<void> {
  const settings = await getWhatsAppSupportSettings();
  res.json({ settings });
}

// PATCH /api/admin/chatbot-settings
export async function updateChatbotSettings(req: Request, res: Response): Promise<void> {
  const { botName, supportPhone, supportEmail, supportHours, supportNote } = req.body ?? {};
  try {
    const settings = await updateWhatsAppSupportSettings({
      ...(botName !== undefined && { botName: String(botName) }),
      ...(supportPhone !== undefined && { supportPhone: String(supportPhone) }),
      ...(supportEmail !== undefined && { supportEmail: supportEmail == null ? null : String(supportEmail) }),
      ...(supportHours !== undefined && { supportHours: supportHours == null ? null : String(supportHours) }),
      ...(supportNote !== undefined && { supportNote: supportNote == null ? null : String(supportNote) }),
    });
    clearTrainingCatalogCache();
    res.json({ settings });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
}
