import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import * as WhatsAppService from "../services/whatsapp.service";
import { io } from "../lib/socket";

const router = Router();

// GET /api/support-chat/sessions
// Fetch active conversation sessions along with the latest message
router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.conversationSession.findMany({
      orderBy: { updatedAt: "desc" },
    });

    // Deduplicate by phoneNumber, keeping the first (latest) occurrence
    const uniqueSessionsMap = new Map<string, typeof sessions[0]>();
    for (const session of sessions) {
      if (!uniqueSessionsMap.has(session.phoneNumber)) {
        uniqueSessionsMap.set(session.phoneNumber, session);
      }
    }
    const uniqueSessions = Array.from(uniqueSessionsMap.values());

    const sessionData = await Promise.all(
      uniqueSessions.map(async (session) => {
        // Try to find the user's name from MarketingLead
        const lead = await prisma.marketingLead.findFirst({
          where: { phone: session.phoneNumber },
        });

        // If not found in MarketingLead, check User
        let name = lead?.name;
        if (!name) {
          const user = await prisma.user.findFirst({
            where: { whatsappNumber: session.phoneNumber },
          });
          if (user) name = `${user.firstName} ${user.lastName || ""}`.trim();
        }

        // Fetch the last message
        const lastMessage = await prisma.simulateMessage.findFirst({
          where: { phoneNumber: session.phoneNumber },
          orderBy: { createdAt: "desc" },
        });

        return {
          ...session,
          name: name || session.phoneNumber,
          lastMessage,
        };
      })
    );

    res.json({ sessions: sessionData });
  } catch (error) {
    console.error("[support-chat] GET /sessions error:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// GET /api/support-chat/messages/:phoneNumber
// Fetch full message history
router.get("/messages/:phoneNumber", async (req: Request, res: Response) => {
  try {
    const phoneNumber = String(req.params.phoneNumber);
    const messages = await prisma.simulateMessage.findMany({
      where: { phoneNumber },
      orderBy: { createdAt: "asc" },
    });
    res.json({ messages });
  } catch (error) {
    console.error("[support-chat] GET /messages error:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// POST /api/support-chat/toggle-bot/:phoneNumber
router.post("/toggle-bot/:phoneNumber", async (req: Request, res: Response) => {
  try {
    const phoneNumber = String(req.params.phoneNumber);
    const { isBotPaused } = req.body;

    const session = await prisma.conversationSession.findFirst({
      where: { phoneNumber },
      orderBy: { updatedAt: "desc" },
    });

    if (!session) {
      const newSession = await prisma.conversationSession.create({
        data: {
          phoneNumber,
          state: "GREETING",
          isBotPaused: Boolean(isBotPaused),
        },
      });
      return res.json({ session: newSession });
    }

    const updated = await prisma.conversationSession.update({
      where: { id: session.id },
      data: { isBotPaused: Boolean(isBotPaused) },
    });

    res.json({ session: updated });
  } catch (error) {
    console.error("[support-chat] POST /toggle-bot error:", error);
    res.status(500).json({ error: "Failed to toggle bot" });
  }
});

// POST /api/support-chat/send-message/:phoneNumber
router.post("/send-message/:phoneNumber", async (req: Request, res: Response) => {
  try {
    const phoneNumber = String(req.params.phoneNumber);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Save message to DB
    const message = await prisma.simulateMessage.create({
      data: {
        phoneNumber,
        role: "support",
        content,
      },
    });

    // Send via WhatsApp
    await WhatsAppService.sendMessage(phoneNumber, content);

    // Broadcast to UI
    if (io) {
      io.to("customer_support").emit("support-chat:message", {
        phoneNumber,
        message,
      });
    }

    res.json({ message });
  } catch (error) {
    console.error("[support-chat] POST /send-message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
