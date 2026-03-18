// ── Troubleshooting Controller ────────────────────────────────────────────
// Thin HTTP layer for Postman testing of the troubleshooting engine.

import { Request, Response } from "express";
import * as TroubleshootingService from "../services/troubleshooting.service";

// ── POST /api/troubleshooting/start ───────────────────────────────────────
export async function startSession(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, serialNumber, problemType } = req.body;

    if (!phoneNumber?.trim() || !serialNumber?.trim() || !problemType?.trim()) {
      res.status(400).json({ error: "phoneNumber, serialNumber, and problemType are required" });
      return;
    }

    const result = await TroubleshootingService.startSession(
      phoneNumber.trim(),
      serialNumber.trim(),
      problemType.trim(),
    );

    res.status(result.resumed ? 200 : 201).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── POST /api/troubleshooting/respond ─────────────────────────────────────
export async function respond(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, response } = req.body;

    if (!sessionId?.trim() || !response?.trim()) {
      res.status(400).json({ error: "sessionId and response are required" });
      return;
    }

    const result = await TroubleshootingService.handleResponse(sessionId.trim(), response.trim());
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── GET /api/troubleshooting/session/:id ──────────────────────────────────
export async function getSession(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const result = await TroubleshootingService.getCurrentStep(id);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}
