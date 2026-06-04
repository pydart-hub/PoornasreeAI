// Outbound WhatsApp when a service manager assigns a ticket to an engineer.

import { env } from "../config/env";
import prisma from "../lib/prisma";
import {
  formatCustomerPhoneDisplay,
  getTicketComplaintText,
  resolveTicketCustomerName,
  resolveTicketCustomerPhone,
} from "../lib/ticket-customer";
import * as WhatsAppService from "./whatsapp.service";
import {
  formatTicketDetailMessage,
  sendTicketActionButtons,
  type EngineerTicketRow,
} from "./engineer-ticket-whatsapp.shared";

function templateParam(text: string, maxLen = 200): string {
  return text.replace(/[\n\r\t]/g, " ").trim().slice(0, maxLen);
}

/**
 * Always notify engineer on manual assign. Uses approved template first, then full session message + buttons.
 */
export async function notifyEngineerTicketAssigned(ticketId: string): Promise<void> {
  if (!WhatsAppService.isConfigured()) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      problemDescription: true,
      issueDescription: true,
      machineName: true,
      machineSerialNumber: true,
      machineCustomer: true,
      customerAddress: true,
      phoneNumber: true,
      updatedAt: true,
      assignedEngineerId: true,
      customer: { select: { firstName: true, lastName: true, role: true } },
      pincode: { select: { code: true, place: true } },
      assignedManager: { select: { firstName: true, lastName: true } },
      assignedEngineer: {
        select: { id: true, firstName: true, whatsappNumber: true },
      },
    },
  });

  if (!ticket?.assignedEngineer?.whatsappNumber) {
    console.warn(`[engineer-ticket-wa] No WhatsApp number for engineer on ticket ${ticket?.ticketNumber ?? ticketId}`);
    return;
  }

  const wa = ticket.assignedEngineer.whatsappNumber;
  const engineerFirst = ticket.assignedEngineer.firstName;
  const customerName = resolveTicketCustomerName(ticket) || "Customer";
  const phone = formatCustomerPhoneDisplay(resolveTicketCustomerPhone(ticket));
  const place = [ticket.pincode?.place, ticket.pincode?.code].filter(Boolean).join(" · ") || "—";
  const complaint =
    getTicketComplaintText(ticket.problemDescription, ticket.issueDescription)?.slice(0, 80) ||
    ticket.problemDescription.slice(0, 80) ||
    "—";

  const templateName = env.WA_ENGINEER_TICKET_TEMPLATE.trim();
  if (templateName) {
    const ok = await WhatsAppService.sendTemplate(wa, {
      name: templateName,
      languageCode: env.WA_ENGINEER_TICKET_TEMPLATE_LANG,
      bodyParameters: [
        templateParam(engineerFirst, 40),
        templateParam(ticket.ticketNumber, 40),
        templateParam(customerName, 60),
        templateParam(phone, 24),
        templateParam(place, 80),
        templateParam(complaint, 120),
      ],
    });
    if (!ok) {
      console.warn(
        `[engineer-ticket-wa] Template "${templateName}" failed for ${wa} — sending session text`,
      );
    }
  }

  const detail = formatTicketDetailMessage(ticket as EngineerTicketRow, {
    heading: `🆕 *New ticket assigned*`,
  });
  await WhatsAppService.sendMessage(
    wa,
    `${detail}\n\nOpen the ticket menu below or type *TICKETS*.`,
  );
  await sendTicketActionButtons(wa, ticket as EngineerTicketRow, ticket.assignedEngineer.id);
}
