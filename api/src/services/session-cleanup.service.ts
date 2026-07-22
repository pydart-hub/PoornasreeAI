import cron from "node-cron";
import prisma from "../lib/prisma";
import * as WhatsAppService from "./whatsapp.service";
import { io } from "../lib/socket";

export function startSessionCleanupCron() {
  // Run every 5 minutes — check for sessions inactive for 15+ minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      // Find all paused sessions that haven't been updated in 15 minutes
      const expiredSessions = await prisma.conversationSession.findMany({
        where: {
          isBotPaused: true,
          updatedAt: {
            lt: fifteenMinutesAgo,
          },
        },
      });

      if (expiredSessions.length === 0) return;

      console.log(`[session-cleanup] Found ${expiredSessions.length} inactive manual sessions. Unpausing bots...`);

      for (const session of expiredSessions) {
        // 1. Update session to unpause bot
        await prisma.conversationSession.update({
          where: { id: session.id },
          data: {
            isBotPaused: false,
            supportAgentId: null, // Clear assigned agent if any
          },
        });

        const phoneNumber = session.phoneNumber;
        const msgText = "This chat session has been closed due to inactivity. Our automated assistant is back online. Type 'Hi' to start over.";

        // 2. Send WhatsApp message to customer
        try {
          await WhatsAppService.sendMessage(phoneNumber, msgText);
        } catch (waError) {
          console.error(`[session-cleanup] Failed to send WA message to ${phoneNumber}:`, waError);
        }

        // 3. Create a system audit message
        const systemMsg = await prisma.simulateMessage.create({
          data: {
            phoneNumber,
            role: "system",
            content: "Chatbot auto-resumed due to 5 minutes of inactivity.",
          },
        });

        // 4. Create the bot message record so the agent sees what was sent
        const botMsg = await prisma.simulateMessage.create({
          data: {
            phoneNumber,
            role: "bot",
            content: msgText,
          },
        });

        // 5. Broadcast both to UI
        if (io) {
          io.to("customer_support").emit("support-chat:message", {
            phoneNumber,
            message: systemMsg,
          });
          io.to("customer_support").emit("support-chat:message", {
            phoneNumber,
            message: botMsg,
          });
        }
      }
    } catch (error) {
      console.error("[session-cleanup] Error during cron execution:", error);
    }
  });
  console.log("[session-cleanup] Cron job initialized (runs every 5 minutes, closes sessions inactive for 15+ minutes).");
}
