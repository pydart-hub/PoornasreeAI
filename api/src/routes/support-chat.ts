import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import * as WhatsAppService from "../services/whatsapp.service";
import { io } from "../lib/socket";
import { touchSupportActivity, clearSupportActivity } from "../services/support-inactivity.service";

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

    const botState = Boolean(isBotPaused);

    // Save system audit message in database
    const systemMsg = await prisma.simulateMessage.create({
      data: {
        phoneNumber,
        role: "system",
        content: botState ? "Chatbot turned OFF by support agent" : "Chatbot turned ON by support agent",
      },
    });

    // Broadcast system message to UI
    if (io) {
      io.to("customer_support").emit("support-chat:message", {
        phoneNumber,
        message: systemMsg,
      });
    }

    // Send automated greeting when the agent takes over
    if (botState) {
      // Start the 2-minute auto-turn-on countdown timer
      touchSupportActivity(phoneNumber);

      const greetingMsg = "Hello, our customer support agent is now live and ready to assist you. Please feel free to ask your questions or clarify any doubts.";
      await WhatsAppService.sendMessage(phoneNumber, greetingMsg);
      
      const sentMsgRecord = await prisma.simulateMessage.create({
        data: {
          phoneNumber,
          role: "bot",
          content: greetingMsg,
        },
      });

      if (io) {
        io.to("customer_support").emit("support-chat:message", {
          phoneNumber,
          message: sentMsgRecord,
        });
      }
    } else {
      // Agent manually turned bot back ON - clear any pending auto-timeout
      clearSupportActivity(phoneNumber);
    }

    if (!session) {
      const newSession = await prisma.conversationSession.create({
        data: {
          phoneNumber,
          state: "GREETING",
          isBotPaused: botState,
        },
      });
      return res.json({ session: newSession });
    }

    const updated = await prisma.conversationSession.update({
      where: { id: session.id },
      data: { isBotPaused: botState },
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

    // Refresh the 2-minute activity countdown timer for this support session
    touchSupportActivity(phoneNumber);

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

function phoneLookupVariants(phoneNumber: string): string[] {
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

// GET /api/support-chat/customer-context/:phoneNumber
// Fetch complete context: User/Lead profile, tickets history, and registered machines.
router.get("/customer-context/:phoneNumber", async (req: Request, res: Response) => {
  try {
    const phoneNumber = String(req.params.phoneNumber);
    const variants = phoneLookupVariants(phoneNumber);

    // 1. Fetch User or MarketingLead profile details
    const user = await prisma.user.findFirst({
      where: { whatsappNumber: { in: variants } },
    });
    const lead = await prisma.marketingLead.findFirst({
      where: { phone: { in: variants } },
    });

    // 2. Fetch all tickets for this phone number
    const tickets = await prisma.ticket.findMany({
      where: { phoneNumber: { in: variants } },
      orderBy: { createdAt: "desc" },
      include: {
        assignedEngineer: { select: { firstName: true, lastName: true } },
      },
    });

    // 3. Fetch latest session metadata to get machine details
    const latestSession = await prisma.conversationSession.findFirst({
      where: { phoneNumber: { in: variants } },
      orderBy: { updatedAt: "desc" },
    });
    const metadata = latestSession?.metadata as any;
    const machineData = metadata?.machineData || null;

    res.json({
      profile: {
        name: user ? `${user.firstName} ${user.lastName || ""}`.trim() : (lead?.name || phoneNumber),
        email: user?.email || null,
        phone: phoneNumber,
        role: user?.role || "lead",
        location: tickets[0]?.place
          ? `${tickets[0].place}, ${tickets[0].district || ""}, ${tickets[0].state || ""}`.replace(/,\s*,/g, ",").trim()
          : (machineData?.Address1 || "N/A"),
      },
      tickets: tickets.map(t => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        status: t.status,
        problemDescription: t.problemDescription,
        createdAt: t.createdAt,
        engineerName: t.assignedEngineer ? `${t.assignedEngineer.firstName} ${t.assignedEngineer.lastName || ""}`.trim() : null,
      })),
      machines: tickets
        .filter(t => t.machineSerialNumber)
        .map(t => ({
          serialNumber: t.machineSerialNumber,
          modelName: t.machineName || "Unknown Model",
          invoiceNo: t.machineInvoiceNo || "N/A",
          invoiceDate: t.machineInvoiceDate || "N/A",
          warrantyMonths: t.machineWarranty || 0,
          createdAt: t.createdAt,
        }))
        // Deduplicate by serialNumber
        .filter((v, i, a) => a.findIndex(t => t.serialNumber === v.serialNumber) === i),
    });
  } catch (error) {
    console.error("[support-chat] GET /customer-context error:", error);
    res.status(500).json({ error: "Failed to fetch customer context" });
  }
});

export default router;
