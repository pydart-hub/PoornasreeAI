// Side effects after OTP verification closes a ticket (socket + customer feedback).

import { io } from "./socket";
import prisma from "./prisma";
import { startFeedbackFlow } from "../services/simulate.service";
import * as WhatsAppService from "../services/whatsapp.service";

type ClosedTicket = {
  id: string;
  ticketNumber: string;
  customerId: string;
  phoneNumber: string | null;
};

export async function afterOtpTicketClosed(ticket: ClosedTicket): Promise<void> {
  io?.to(`user:${ticket.customerId}`).emit("ticket:closed", {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
  });

  if (ticket.phoneNumber && WhatsAppService.isConfigured()) {
    try {
      const feedbackMsg = await startFeedbackFlow(
        ticket.phoneNumber,
        ticket.id,
        ticket.ticketNumber,
      );
      await WhatsAppService.sendMessage(ticket.phoneNumber, feedbackMsg);
      await prisma.simulateMessage.create({
        data: { phoneNumber: ticket.phoneNumber, role: "assistant", content: feedbackMsg },
      });
    } catch (err) {
      console.error("[afterOtpTicketClosed] Failed to send feedback request:", (err as Error).message);
    }
  }
}
