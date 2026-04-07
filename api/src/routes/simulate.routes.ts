// ── Simulate Routes ───────────────────────────────────────────────────────
// Prefix: /api/simulate   (mounted in index.ts)
// Simulates WhatsApp message flow — no auth required.

import { Router } from "express";
import { handleMessage, getHistory, listSessions, resetSession } from "../controllers/simulate.controller";

const router = Router();

router.post("/message", handleMessage);
router.get("/sessions", listSessions);
router.get("/history/:phoneNumber", getHistory);
router.delete("/session/:phoneNumber", resetSession);

export default router;
