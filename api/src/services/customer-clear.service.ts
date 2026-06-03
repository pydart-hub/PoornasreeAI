// Clears WhatsApp / simulate customer data for a phone number (testing reset).

import prisma from "../lib/prisma";

export function phoneLookupVariants(phoneNumber: string): string[] {
  const digits = phoneNumber.replace(/\D/g, "");
  const variants = new Set<string>([phoneNumber.trim()]);
  if (digits) {
    variants.add(digits);
    variants.add(`91${digits}`);
    if (digits.startsWith("91") && digits.length > 10) {
      variants.add(digits.slice(2));
    }
  }
  return [...variants].filter(Boolean);
}

export type ClearCustomerResult = {
  phone: string;
  variants: string[];
  tickets: number;
  simulateMessages: number;
  conversationSessions: number;
  troubleshootingSessions: number;
  total: number;
};

/** Delete tickets and chat sessions for one customer phone (all common formats). */
export async function clearCustomerByPhone(phone: string): Promise<ClearCustomerResult> {
  const trimmed = phone.trim();
  if (!trimmed) {
    throw Object.assign(new Error("phoneNumber is required"), { status: 400 });
  }

  const variants = phoneLookupVariants(trimmed);

  const tickets = await prisma.ticket.deleteMany({
    where: { phoneNumber: { in: variants } },
  });
  const simulateMessages = await prisma.simulateMessage.deleteMany({
    where: { phoneNumber: { in: variants } },
  });
  const conversationSessions = await prisma.conversationSession.deleteMany({
    where: { phoneNumber: { in: variants } },
  });
  const troubleshootingSessions = await prisma.troubleshootingSession.deleteMany({
    where: { phoneNumber: { in: variants } },
  });

  return {
    phone: trimmed,
    variants,
    tickets: tickets.count,
    simulateMessages: simulateMessages.count,
    conversationSessions: conversationSessions.count,
    troubleshootingSessions: troubleshootingSessions.count,
    total:
      tickets.count +
      simulateMessages.count +
      conversationSessions.count +
      troubleshootingSessions.count,
  };
}
