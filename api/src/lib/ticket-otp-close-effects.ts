// Side effects after ticket closure (socket broadcast + customer feedback survey).

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

// In-memory dedup map: ticketId -> timestamp (prevents duplicate feedback messages if called concurrently)
const sentFeedbackTickets = new Map<string, number>();

export async function afterOtpTicketClosed(ticket: ClosedTicket): Promise<void> {
  // 1. Emit real-time socket event for user dashboard
  io?.to(`user:${ticket.customerId}`).emit("ticket:closed", {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
  });

  if (!ticket.phoneNumber) {
    console.log(`[afterOtpTicketClosed] Ticket ${ticket.ticketNumber} has no phoneNumber — skipping customer feedback`);
    return;
  }

  // Deduplication check: do not send twice for the same ticket within 2 minutes
  const now = Date.now();
  const lastSent = sentFeedbackTickets.get(ticket.id);
  if (lastSent && now - lastSent < 120_000) {
    console.log(`[afterOtpTicketClosed] Feedback survey already sent recently for ticket ${ticket.ticketNumber} — skipping duplicate`);
    return;
  }
  sentFeedbackTickets.set(ticket.id, now);

  // Clean up old dedup entries
  if (sentFeedbackTickets.size > 500) {
    for (const [id, time] of sentFeedbackTickets.entries()) {
      if (now - time > 300_000) sentFeedbackTickets.delete(id);
    }
  }

  try {
    // 2. Always transition customer session to FEEDBACK_RATING and generate survey prompt
    const feedbackMsg = await startFeedbackFlow(
      ticket.phoneNumber,
      ticket.id,
      ticket.ticketNumber,
    );

    // 3. Persist feedback request in simulate message history (accessible in chat & support dashboard)
    const assistantMsg = await prisma.simulateMessage.create({
      data: { phoneNumber: ticket.phoneNumber, role: "assistant", content: feedbackMsg },
    });

    // 4. Emit live update to support-chat dashboard
    if (io) {
      io.to("customer_support").emit("support-chat:message", {
        phoneNumber: ticket.phoneNumber,
        message: assistantMsg,
      });
    }

    // 5. Send to customer via WhatsApp if configured
    if (WhatsAppService.isConfigured()) {
      try {
        const ratingRows = [
          { id: "1", title: "1 - Poor ⭐", description: "Not satisfied" },
          { id: "2", title: "2 - Fair ⭐⭐", description: "Below expectations" },
          { id: "3", title: "3 - Good ⭐⭐⭐", description: "Average service" },
          { id: "4", title: "4 - Very Good ⭐⭐⭐⭐", description: "Satisfied with resolution" },
          { id: "5", title: "5 - Excellent ⭐⭐⭐⭐⭐", description: "Highly impressed" },
        ];
        // Attempt interactive list first for optimal mobile UX
        const listSent = await WhatsAppService.sendInteractiveList(
          ticket.phoneNumber,
          feedbackMsg,
          "Rate Service ⭐",
          ratingRows
        );
        if (!listSent) {
          // Fallback to plain text message
          await WhatsAppService.sendMessage(ticket.phoneNumber, feedbackMsg);
        }
        console.log(`[afterOtpTicketClosed] Feedback survey successfully dispatched to ${ticket.phoneNumber} for ticket ${ticket.ticketNumber}`);
      } catch (waErr) {
        console.error("[afterOtpTicketClosed] WhatsApp dispatch failed:", (waErr as Error).message);
      }
    } else {
      console.log(`[afterOtpTicketClosed] WhatsApp Cloud API not configured — survey saved to chat history for ${ticket.phoneNumber}`);
    }
  } catch (err) {
    console.error("[afterOtpTicketClosed] Failed to process customer feedback flow:", (err as Error).message);
  }
}
