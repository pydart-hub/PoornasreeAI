// Public engineer ticket actions — no login required.
// Uses the ticket's assigned engineer (same trust model as engineer WhatsApp commands).

import { Request, Response } from "express";
import * as TicketService from "../services/ticket.service";
import { afterOtpTicketClosed } from "../lib/ticket-otp-close-effects";

// ── PATCH /api/public/tickets/:id/start ─────────────────────────────────────
export async function publicStartWork(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const engineerId = await TicketService.requireAssignedEngineerId(id);
    const ticket = await TicketService.startWork(id, engineerId, false);
    res.json({ ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── POST /api/public/tickets/:id/otp ──────────────────────────────────────
export async function publicRequestOTP(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const engineerId = await TicketService.requireAssignedEngineerId(id);
    const resend = req.body?.resend === true || req.query?.resend === "true";
    const result = await TicketService.requestOTP(id, engineerId, false, resend);
    res.json({
      message: "OTP sent to the customer via WhatsApp.",
      expiresAt: result.expiresAt,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

// ── POST /api/public/tickets/:id/verify-otp ───────────────────────────────
export async function publicVerifyOTP(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const code = (req.body?.code || req.query?.code) as string | undefined;
    if (!code?.trim()) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    const engineerId = await TicketService.requireAssignedEngineerId(id);
    const ticket = await TicketService.verifyOTP(id, engineerId, code.trim(), false);
    await afterOtpTicketClosed(ticket);

    res.json({ message: "Ticket closed successfully", ticket });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}

