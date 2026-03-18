// ── Troubleshooting Routes ────────────────────────────────────────────────
// Prefix: /api/troubleshooting   (mounted in index.ts)
// For Postman testing only — no auth required (WhatsApp will call these later).

import { Router } from "express";
import {
  startSession,
  respond,
  getSession,
} from "../controllers/troubleshooting.controller";

const router = Router();

router.post("/start",       startSession);   // Start or resume session
router.post("/respond",     respond);        // Send YES / NO / HELP
router.get ("/session/:id", getSession);     // Get current session state

export default router;
