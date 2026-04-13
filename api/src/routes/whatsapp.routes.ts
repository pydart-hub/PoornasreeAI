// ── WhatsApp Routes ───────────────────────────────────────────────────────
// Prefix: /api/whatsapp   (mounted in index.ts)
// Receives Meta Cloud API webhook events — no auth required.

import { Router } from "express";
import { verifyWebhook, handleWebhook } from "../controllers/whatsapp.controller";

const router = Router();

router.get("/webhook",  verifyWebhook);
router.post("/webhook", handleWebhook);

export default router;
