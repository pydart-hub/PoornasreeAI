// ── Simulate Controller ───────────────────────────────────────────────────
// Single-endpoint simulation of WhatsApp message flow for Postman testing.

import { Request, Response } from "express";
import prisma from "../lib/prisma";
import * as SimulateService from "../services/simulate.service";

// ── POST /api/simulate/message ────────────────────────────────────────────
export async function handleMessage(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber?.trim()) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    const phone = phoneNumber.trim();
    // Any input (even empty) is a valid "message" — WhatsApp can send blank
    const text = typeof message === "string" ? message : "";

    // Persist user message
    if (text) {
      await prisma.simulateMessage.create({
        data: { phoneNumber: phone, role: "user", content: text },
      });
    }

    const result = await SimulateService.handleMessage(phone, text);

    // Persist bot reply
    if (result.message) {
      await prisma.simulateMessage.create({
        data: { phoneNumber: phone, role: "bot", content: result.message },
      });
    }

    res.json(result);
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
// Wipes the server-side session state and full message history so the
// frontend reset button produces a genuinely clean start.
export async function resetSession(req: Request, res: Response): Promise<void> {
  try {
    const phone = String(req.params.phoneNumber || "").trim();
    if (!phone) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    await Promise.all([
      prisma.conversationSession.deleteMany({ where: { phoneNumber: phone } }),
      prisma.simulateMessage.deleteMany({ where: { phoneNumber: phone } }),
    ]);

    res.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}
