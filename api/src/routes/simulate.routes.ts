// ── Simulate Routes ───────────────────────────────────────────────────────
// Prefix: /api/simulate   (mounted in index.ts)
// Simulates WhatsApp message flow — no auth required.

import { Router } from "express";
import { handleMessage, getHistory } from "../controllers/simulate.controller";

const router = Router();

router.post("/message", handleMessage);
router.get("/history/:phoneNumber", getHistory);

export default router;
