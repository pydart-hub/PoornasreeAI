// ── Engineer onboarding WhatsApp ───────────────────────────────────────────
// First contact must use an approved Meta template (outside the 24h session window).
// Plain text is used as fallback when no template is configured or template send fails.

import { env } from "../config/env";
import * as WhatsAppService from "./whatsapp.service";

export type EngineerSetupRecipient = {
  firstName: string;
  email: string;
  whatsappNumber: string;
};

/** Strip chars Meta often rejects in template variables. */
function templateParam(text: string, maxLen = 200): string {
  return text.replace(/[\n\r\t]/g, " ").trim().slice(0, maxLen);
}

function buildSessionTextMessage(
  engineer: EngineerSetupRecipient,
  setPasswordUrl: string,
  managerName: string,
): string {
  return [
    `🎉 Welcome to Poornasree Service Team, ${engineer.firstName}!`,
    "",
    `You've been registered as a Service Engineer by ${managerName}.`,
    "",
    "To get started, please set your password by clicking the link below:",
    setPasswordUrl,
    "",
    `Your login email: ${engineer.email}`,
    "",
    "You'll receive ticket assignments and updates here on WhatsApp.",
    "",
    "Thank you! 🙏",
  ].join("\n");
}

/**
 * Send engineer set-password onboarding via approved template, then session text fallback.
 * @param rawToken — raw token from generateSetupToken (not the hash).
 */
export async function sendEngineerSetupNotification(
  engineer: EngineerSetupRecipient,
  rawToken: string,
  managerName: string,
): Promise<boolean> {
  const setPasswordUrl = `${env.FRONTEND_URL}/set-password?token=${rawToken}`;
  const templateName = env.WA_ENGINEER_SETUP_TEMPLATE.trim();

  if (templateName) {
    const viaTemplate = await WhatsAppService.sendTemplate(engineer.whatsappNumber, {
      name: templateName,
      languageCode: env.WA_ENGINEER_SETUP_TEMPLATE_LANG,
      bodyParameters: [
        templateParam(engineer.firstName, 60),
        templateParam(managerName, 80),
        templateParam(engineer.email, 120),
      ],
      urlButtonIndex: 0,
      urlButtonParameter: rawToken,
    });
    if (viaTemplate) return true;
    console.warn(
      `[engineer-onboarding] Template "${templateName}" failed for ${engineer.whatsappNumber} — trying session text`,
    );
  }

  return WhatsAppService.sendMessage(
    engineer.whatsappNumber,
    buildSessionTextMessage(engineer, setPasswordUrl, managerName),
  );
}
