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
  const areas =
    engineer.pincodes && engineer.pincodes.length > 0
      ? engineer.pincodes.join(", ")
      : "All service areas";

  return [
    `🎉 Welcome to Poornasree Service Team, ${engineer.firstName}!`,
    "",
    `You've been registered as a Service Engineer by ${managerName}.`,
    "",
    `📍 Assigned service areas: ${areas}`,
    "",
    "Complete your registration by opening the link below:",
    setPasswordUrl,
    "",
    `Login email: ${engineer.email}`,
    "",
    'You can reply to this chat to manage your tasks. Send "menu" to see options.',
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

  const areas =
    engineer.pincodes && engineer.pincodes.length > 0
      ? engineer.pincodes.join(", ")
      : "All service areas";

  if (templateName) {
    const isV3 = templateName.includes("v3");
    const bodyParameters = isV3
      ? [
          templateParam(engineer.firstName, 60),
          templateParam(managerName, 80),
          templateParam(areas, 100),
          templateParam(setPasswordUrl, 250),
          templateParam(engineer.email, 120),
        ]
      : [
          templateParam(engineer.firstName, 60),
          templateParam(managerName, 80),
          templateParam(setPasswordUrl, 250),
          templateParam(engineer.email, 120),
        ];

    const viaTemplate = await WhatsAppService.sendTemplate(engineer.whatsappNumber, {
      name: templateName,
      languageCode: runtime.waEngineerSetupTemplateLang(),
      bodyParameters,
    });
    if (viaTemplate) {
      // With the unified template or clean onboarding, everything is in a single message
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

export type ManagerOnboardingRecipient = {
  firstName: string;
  email: string;
  whatsappNumber: string;
  role: "service_manager" | "assistant_service_manager" | string;
  pincodes?: string[];
};

/**
 * Send Service Manager / Assistant Service Manager onboarding notification via WhatsApp
 * with assigned pincodes, locations, and dashboard access information.
 */
export async function sendManagerOnboardingNotification(
  manager: ManagerOnboardingRecipient,
  adminName = "Administrator"
): Promise<boolean> {
  const isAssistant = manager.role === "assistant_service_manager";
  const roleTitle = isAssistant ? "Assistant Service Manager" : "Service Manager";
  const dashboardUrl = `${runtime.frontendUrl()}/${isAssistant ? "assistant-manager" : "service-manager"}`;

  const areas = manager.pincodes && manager.pincodes.length > 0
    ? manager.pincodes.join(", ")
    : "All Service Areas / National";

  const message = [
    `🎉 *Welcome to Poornasree Service Team, ${manager.firstName}!*`,
    ``,
    `You have been registered as a *${roleTitle}* by ${adminName}.`,
    ``,
    `📍 *Assigned Service Areas:* ${areas}`,
    `📧 *Login Email:* ${manager.email}`,
    `🔗 *Dashboard Portal:* ${dashboardUrl}`,
    ``,
    `🔔 *WhatsApp Notifications:*`,
    `You will receive real-time alerts on this WhatsApp chat whenever customer service tickets are created, along with attached photos and audio voice notes.`,
    ``,
    `Thank you! 🙏`,
  ].join("\n");

  const normalized = WhatsAppService.normalizeWhatsappNumber(manager.whatsappNumber);
  if (!normalized) return false;

  return WhatsAppService.sendMessage(normalized, message)
    .then(() => true)
    .catch((err) => {
      console.warn(`[sendManagerOnboardingNotification] Failed to send WhatsApp message to ${normalized}:`, err.message);
      return false;
    });
}

