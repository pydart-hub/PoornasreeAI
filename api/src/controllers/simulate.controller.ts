// ── Simulate Controller ───────────────────────────────────────────────────
// Single-endpoint simulation of WhatsApp message flow for Postman testing.

import { Request, Response } from "express";
import prisma from "../lib/prisma";
import * as SimulateService from "../services/simulate.service";

// ── POST /api/simulate/message ────────────────────────────────────────────
export async function handleMessage(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, message, mediaUrl } = req.body;

    if (!phoneNumber?.trim()) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    const phone = phoneNumber.trim();
    // Any input (even empty) is a valid "message" — WhatsApp can send blank
    const text = typeof message === "string" ? message : "";

    // Persist user message
    if (text || mediaUrl) {
      const savedUserMessage = await prisma.simulateMessage.create({
        data: {
          phoneNumber: phone,
          role: "user",
          content: text || "Sent an image",
          mediaUrl: mediaUrl || null,
        },
      });
      const { io } = await import("../lib/socket");
      if (io) {
        io.to("customer_support").emit("support-chat:message", {
          phoneNumber: phone,
          message: savedUserMessage,
        });
      }
    }

    // Check if the phone number belongs to a service engineer
    const cleanFrom = phone.replace(/\D/g, "");
    const allEngineers = await prisma.user.findMany({
      where: { role: "service_engineer" },
      select: { id: true, firstName: true, whatsappNumber: true },
    });
    const engineer = allEngineers.find(e => {
      if (!e.whatsappNumber) return false;
      const cleanDb = e.whatsappNumber.replace(/\D/g, "");
      if (cleanDb.length >= 10 && cleanFrom.length >= 10) {
        return cleanDb.slice(-10) === cleanFrom.slice(-10);
      }
      return cleanDb === cleanFrom;
    });

    if (engineer) {
      const { routeEngineerMessage } = await import("./whatsapp.controller");
      await routeEngineerMessage(phone, text, engineer);
      res.json({ ok: true, message: "Engineer message processed in simulator." });
      return;
    }

    // Check if chatbot is paused
    const session = await prisma.conversationSession.findFirst({
      where: { phoneNumber: phone },
      orderBy: { updatedAt: "desc" },
    });

    if (session?.isBotPaused) {
      res.json({ ok: true, paused: true, message: "Bot is paused. Under manual control." });
      return;
    }

    const result = await SimulateService.handleMessage(phone, text);

    const { io } = await import("../lib/socket");

    // Persist bot reply (and any follow-up, e.g. video links)
    if (result.message) {
      const savedBotMessage = await prisma.simulateMessage.create({
        data: { phoneNumber: phone, role: "bot", content: result.message },
      });
      if (io) {
        io.to("customer_support").emit("support-chat:message", {
          phoneNumber: phone,
          message: savedBotMessage,
        });
      }
    }
    if (result.followUpMessage) {
      const savedFollowUpMessage = await prisma.simulateMessage.create({
        data: { phoneNumber: phone, role: "bot", content: result.followUpMessage },
      });
      if (io) {
        io.to("customer_support").emit("support-chat:message", {
          phoneNumber: phone,
          message: savedFollowUpMessage,
        });
      }
    }

    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/simulate/sessions ───────────────────────────────────────────
// Returns all distinct phone numbers that have simulate messages.
export async function listSessions(req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.simulateMessage.findMany({
      distinct: ["phoneNumber"],
      orderBy:  { createdAt: "desc" },
      select:   { phoneNumber: true, content: true, role: true, createdAt: true },
    });
    res.json({ sessions: rows });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/simulate/history/:phoneNumber ────────────────────────────────
// Returns persisted chat history for a phone number so the frontend can
// restore state after a page refresh and also receive pushed OTP messages.
export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    const phone = String(req.params.phoneNumber || "").trim();
    if (!phone) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    const messages = await prisma.simulateMessage.findMany({
      where: { phoneNumber: phone },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    res.json({ messages });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── DELETE /api/simulate/session/:phoneNumber ─────────────────────────────
// Resets ONLY the FSM session state — message history is preserved.
export async function resetSession(req: Request, res: Response): Promise<void> {
  try {
    const phone = String(req.params.phoneNumber || "").trim();
    if (!phone) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    // Only reset FSM state — keep message history so user can still read the conversation
    await prisma.conversationSession.deleteMany({ where: { phoneNumber: phone } });

    res.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── DELETE /api/simulate/all ──────────────────────────────────────────────
// Wipes all simulate messages, FSM sessions, and ALL tickets. Fresh-start helper.
export async function clearAll(_req: Request, res: Response): Promise<void> {
  try {
    // Delete in FK-safe order
    await prisma.simulateMessage.deleteMany({});
    await prisma.conversationSession.deleteMany({});
    await prisma.ticket.deleteMany({});
    res.json({ ok: true, message: "All simulate messages, sessions, and tickets deleted." });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}
