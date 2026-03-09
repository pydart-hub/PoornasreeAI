// ── Support Routes ────────────────────────────────────────────────────────
// Prefix: /api/support   (mounted in index.ts)
// All routes require authentication via `protect`.

import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createSupportRequest,
  listSupportRequests,
  acceptSupportRequest,
  resolveSupportRequest,
  getSupportMessages,
  sendSupportMessage,
  getAiInsight,
} from "../controllers/support.controller";

const router = Router();
router.use(protect);

// Support request queue
router.post  ("/requests",                    createSupportRequest);
router.get   ("/requests",                    listSupportRequests);
router.patch ("/requests/:id/accept",         acceptSupportRequest);
router.patch ("/requests/:id/resolve",        resolveSupportRequest);

// Support chat messages
router.get   ("/requests/:id/messages",       getSupportMessages);
router.post  ("/requests/:id/messages",       sendSupportMessage);

// AI insight for engineers (Feature 6)
router.post  ("/ai-insight",                  getAiInsight);

export default router;
