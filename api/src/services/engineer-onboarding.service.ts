// ── Engineer onboarding WhatsApp ───────────────────────────────────────────
// First contact must use an approved Meta template (outside the 24h session window).
// Plain text is used as fallback when no template is configured or template send fails.

import { runtime } from "./runtime-config.service";
import * as WhatsAppService from "./whatsapp.service";

export type EngineerSetupRecipient = {
  firstName: string;
  email: string;
  whatsappNumber: string;
  pincodes?: string[];
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
    ...(engineer.pincodes && engineer.pincodes.length > 0 
        ? ["", `📍 Assigned Service Areas: ${engineer.pincodes.join(", ")}`] 
        : []),
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
  const setPasswordUrl = `${runtime.frontendUrl()}/set-password?token=${rawToken}`;
  const templateName = runtime.waEngineerSetupTemplate().trim();

  if (templateName) {
    const viaTemplate = await WhatsAppService.sendTemplate(engineer.whatsappNumber, {
      name: templateName,
      languageCode: runtime.waEngineerSetupTemplateLang(),
      bodyParameters: [
        templateParam(engineer.firstName, 60),
        templateParam(managerName, 80),
        templateParam(setPasswordUrl, 250),
        templateParam(engineer.email, 120),
      ],
    });
    if (viaTemplate) {
      if (engineer.pincodes && engineer.pincodes.length > 0) {
        // Try to send an interactive text or regular text with the assigned areas right after template
        await WhatsAppService.sendMessage(
          engineer.whatsappNumber,
          `📍 You have been assigned the following service areas: ${engineer.pincodes.join(", ")}\n\nYou can reply to this chat to manage your tasks. Send "menu" to see options.`,
        );
      }
      return true;
    }
    console.warn(
      `[engineer-onboarding] Template "${templateName}" failed for ${engineer.whatsappNumber} — trying session text`,
    );
  }

  return WhatsAppService.sendMessage(
    engineer.whatsappNumber,
    buildSessionTextMessage(engineer, setPasswordUrl, managerName),
  );
}
