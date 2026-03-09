import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
  updateStatus,
  escalateConversation,
} from "../controllers/conversation.controller";
import { createMessage, addManualReply } from "../controllers/message.controller";
import { addFeedback } from "../controllers/feedback.controller";

const router = Router();

// All routes require authentication
router.use(protect);

// ── Conversations ──────────────────────────────────────────────────────
router.post  ("/conversations",             createConversation);
router.get   ("/conversations",             listConversations);
router.get   ("/conversations/:id",         getConversation);
router.delete("/conversations/:id",         deleteConversation);

// ── Lifecycle management (service / admin only) ────────────────────────
router.patch ("/conversations/:id/status",  updateStatus);
router.post  ("/conversations/:id/escalate",escalateConversation);

// ── Messages ───────────────────────────────────────────────────────────
router.post  ("/messages",                  authorize("admin", "service", "customer"), createMessage);

// ── Service / Admin manual reply ───────────────────────────────────────
router.post  ("/conversations/:id/reply",   addManualReply);

// ── Training feedback (service / admin) ───────────────────────────────
router.post  ("/conversations/:id/feedback",addFeedback);

export default router;
