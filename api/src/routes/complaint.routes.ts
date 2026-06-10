// ── Complaint Routes ──────────────────────────────────────────────────
// Prefix: /api/complaints   (mounted in index.ts)
// All routes require authentication.

import { Router } from "express";
import { protect } from "../middleware/auth";
import { listComplaintTypes } from "../controllers/complaint.controller";

const router = Router();

router.use(protect);

// GET /api/complaints/types — list complaint types from admin-uploaded documents
router.get("/types", listComplaintTypes);

export default router;
