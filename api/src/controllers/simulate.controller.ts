// ── Simulate Controller ───────────────────────────────────────────────────
// Single-endpoint simulation of WhatsApp message flow for Postman testing.

import { Request, Response } from "express";
import * as SimulateService from "../services/simulate.service";

// ── POST /api/simulate/message ────────────────────────────────────────────
export async function handleMessage(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber?.trim()) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    // Any input (even empty) is a valid "message" — WhatsApp can send blank
    const text = typeof message === "string" ? message : "";

    const result = await SimulateService.handleMessage(phoneNumber.trim(), text);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}
