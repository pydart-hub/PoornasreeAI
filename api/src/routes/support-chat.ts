import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import * as WhatsAppService from "../services/whatsapp.service";
import { io } from "../lib/socket";
import { touchSupportActivity, clearSupportActivity } from "../services/support-inactivity.service";
import {
  PROMOTION_TEMPLATES,
  getLiveMetaTemplateStatuses,
  getAudienceContacts,
  sendPromotionBroadcast,
  saveManualLeads,
  deleteManualLead,
} from "../services/promotion.service";

const router = Router();

// Storage configuration for uploaded promotion images
const promoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve(__dirname, "../../uploads/promotions");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `promo-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadPromo = multer({
  storage: promoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Meta WhatsApp limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Strict Meta WhatsApp rule: Only JPG (.jpg, .jpeg) and PNG (.png) files are supported."));
    }
  },
});

export function phoneLookupVariants(phoneNumber: string): string[] {
  const raw = String(phoneNumber || "").trim();
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>();
  if (raw) variants.add(raw);
  if (digits) {
    variants.add(digits);
    const last10 = digits.slice(-10);
    variants.add(last10);
    variants.add(`91${last10}`);
    variants.add(`+91${last10}`);
  }
  return [...variants].filter(Boolean);
}

// GET /api/support-chat/sessions
// Fetch active conversation sessions along with the latest message
router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.conversationSession.findMany({
      orderBy: { updatedAt: "desc" },
    });

    // Deduplicate by normalized last 10 digits, keeping the latest occurrence
    const uniqueSessionsMap = new Map<string, typeof sessions[0]>();
    for (const session of sessions) {
      const digits = session.phoneNumber.replace(/\D/g, "");
      const key = digits.slice(-10) || session.phoneNumber;
      if (!uniqueSessionsMap.has(key)) {
        uniqueSessionsMap.set(key, session);
      }
    }
    const uniqueSessions = Array.from(uniqueSessionsMap.values());

    const sessionData = await Promise.all(
      uniqueSessions.map(async (session) => {
        const variants = phoneLookupVariants(session.phoneNumber);

        // Try to find the user's name from MarketingLead
        const lead = await prisma.marketingLead.findFirst({
          where: { phone: { in: variants } },
        });

        // If not found in MarketingLead, check User
        let name = lead?.name;
        if (!name) {
          const user = await prisma.user.findFirst({
            where: { whatsappNumber: { in: variants } },
          });
          if (user) name = `${user.firstName} ${user.lastName || ""}`.trim();
        }

        // Fetch the last message across any phone format variant
        const lastMessage = await prisma.simulateMessage.findFirst({
          where: { phoneNumber: { in: variants } },
          orderBy: { createdAt: "desc" },
        });

        const meta = (session.metadata as Record<string, unknown>) || {};

        return {
          ...session,
          name: name || session.phoneNumber,
          lastMessage,
          isWaitingForSupport: Boolean(meta.isWaitingForSupport),
          supportRequestedAt: (meta.supportRequestedAt as string) || null,
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
    const variants = phoneLookupVariants(phoneNumber);
    const messages = await prisma.simulateMessage.findMany({
      where: { phoneNumber: { in: variants } },
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

    // Clear waiting status once support responds
    const activeSess = await prisma.conversationSession.findFirst({
      where: { phoneNumber },
      orderBy: { updatedAt: "desc" },
    });
    if (activeSess) {
      const meta = (activeSess.metadata as Record<string, unknown>) || {};
      if (meta.isWaitingForSupport) {
        await prisma.conversationSession.update({
          where: { id: activeSess.id },
          data: {
            metadata: { ...meta, isWaitingForSupport: false } as object,
          },
        });
      }
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

// ── Promotion Endpoints ───────────────────────────────────────────────────────

// GET /api/support-chat/promotions/templates
// Returns the 10 customizable promotional templates along with live Meta approval statuses
router.get("/promotions/templates", async (_req: Request, res: Response) => {
  try {
    const metaStatuses = await getLiveMetaTemplateStatuses();
    const templatesWithStatus = PROMOTION_TEMPLATES.map((tpl) => ({
      ...tpl,
      metaStatus: metaStatuses[tpl.name]?.status || "NOT_SUBMITTED",
      metaId: metaStatuses[tpl.name]?.id || null,
    }));
    res.json({ templates: templatesWithStatus });
  } catch (error) {
    console.error("[support-chat] GET /promotions/templates error:", error);
    res.status(500).json({ error: "Failed to fetch promotion templates" });
  }
});

// GET /api/support-chat/promotions/meta-status
// Poll or refresh live Meta template approval statuses
router.get("/promotions/meta-status", async (_req: Request, res: Response) => {
  try {
    const metaStatuses = await getLiveMetaTemplateStatuses();
    res.json({ metaStatuses });
  } catch (error) {
    console.error("[support-chat] GET /promotions/meta-status error:", error);
    res.status(500).json({ error: "Failed to fetch Meta statuses" });
  }
});

// GET /api/support-chat/promotions/audiences
// Fetch contacts grouped by category (engineers, customers, dealers, leads, manual) with name & phone
router.get("/promotions/audiences", async (req: Request, res: Response) => {
  try {
    const category = String(req.query.category || "all");
    const search = String(req.query.search || "");
    const result = await getAudienceContacts(category, search);

    // Also include saved manual contacts for quick reference in chips and preview
    const manualResult = await getAudienceContacts("manual", "");
    res.json({
      ...result,
      manualContacts: manualResult.contacts,
    });
  } catch (error) {
    console.error("[support-chat] GET /promotions/audiences error:", error);
    res.status(500).json({ error: "Failed to fetch audience contacts" });
  }
});

// POST /api/support-chat/promotions/upload-image
// Upload promotional banner image to /uploads/promotions/ and upload to Meta Media API
router.post("/promotions/upload-image", (req: Request, res: Response) => {
  uploadPromo.single("image")(req, res, async (err: any) => {
    if (err) {
      console.warn("[support-chat] Upload rejected by strict Meta file filter:", err.message);
      return res.status(400).json({ error: err.message || "Invalid file format. Only JPG and PNG are supported by Meta WhatsApp." });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }
      const relativeUrl = `/uploads/promotions/${req.file.filename}`;
      const fileBuffer = fs.readFileSync(req.file.path);
      const mediaId = await WhatsAppService.uploadMediaToMeta(fileBuffer, req.file.mimetype, req.file.originalname);
      return res.json({
        imageUrl: relativeUrl,
        mediaId,
        fileName: req.file.filename,
        size: req.file.size,
      });
    } catch (error) {
      console.error("[support-chat] POST /promotions/upload-image error:", error);
      return res.status(500).json({ error: "Failed to upload promotion image" });
    }
  });
});

// POST /api/support-chat/promotions/send
// Execute promotion broadcast with personalized variable interpolation
router.post("/promotions/send", async (req: Request, res: Response) => {
  try {
    const { title, templateName, templateParams, imageUrl, mediaId, targetAudience, recipientPhones, customRecipients } = req.body;

    if (!templateName || !Array.isArray(recipientPhones) || recipientPhones.length === 0) {
      res.status(400).json({ error: "templateName and recipientPhones[] are required" });
      return;
    }

    const campaign = await sendPromotionBroadcast({
      title: title || `Promotion - ${templateName}`,
      templateName,
      templateParams: templateParams || {},
      imageUrl,
      mediaId,
      targetAudience: targetAudience || "all",
      recipientPhones,
      customRecipients,
      createdById: (req as any).user?.userId,
    });

    res.json({ campaign });
  } catch (error: any) {
    console.error("[support-chat] POST /promotions/send error:", error);
    res.status(500).json({ error: error?.message || "Failed to broadcast promotion" });
  }
});

// GET /api/support-chat/promotions/history
// Fetch history of sent promotional campaigns
router.get("/promotions/history", async (_req: Request, res: Response) => {
  try {
    const campaigns = await prisma.promotionCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ campaigns });
  } catch (error) {
    console.error("[support-chat] GET /promotions/history error:", error);
    res.status(500).json({ error: "Failed to fetch promotion campaign history" });
  }
});

// POST /api/support-chat/promotions/leads
// Save custom manual recipient number(s) into database permanently
router.post("/promotions/leads", async (req: Request, res: Response) => {
  try {
    const { leads, name, phone, tags } = req.body;
    const items = Array.isArray(leads) ? leads : [{ name, phone, tags }];
    const saved = await saveManualLeads(items);
    res.json({ success: true, count: saved.length, leads: saved });
  } catch (error: any) {
    console.error("[support-chat] POST /promotions/leads error:", error);
    res.status(500).json({ error: error?.message || "Failed to save custom lead" });
  }
});

// DELETE /api/support-chat/promotions/leads/:phone
// Delete custom manual lead from database
router.delete("/promotions/leads/:phone", async (req: Request, res: Response) => {
  try {
    const phone = String(req.params.phone);
    await deleteManualLead(phone);
    res.json({ success: true });
  } catch (error: any) {
    console.error("[support-chat] DELETE /promotions/leads error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete custom lead" });
  }
});

export default router;
