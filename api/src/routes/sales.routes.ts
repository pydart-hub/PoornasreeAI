// ── Sales Routes ──────────────────────────────────────────────────────────
// Prefix: /api/sales   (mounted in index.ts)
// All routes require authentication via `protect`.

import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getAnalytics,
} from "../controllers/sales.controller";
import { getAnalyticsTimeline } from "../controllers/support.controller";

const router = Router();

// All sales routes are protected
router.use(protect);

// GET  /api/sales/users  —  list all users (read-only for non-customers)
router.get("/users", listUsers);

// POST /api/sales/users  —  create a new customer account
router.post("/users", createUser);

// PATCH /api/sales/users/:id  —  update a customer (firstName, lastName, email, newPassword)
router.patch("/users/:id", updateUser);

// DELETE /api/sales/users/:id  —  delete a customer account
router.delete("/users/:id", deleteUser);

// GET /api/sales/analytics  —  dashboard analytics summary
router.get("/analytics", getAnalytics);

// GET /api/sales/analytics/timeline  —  daily counts for charts
router.get("/analytics/timeline", getAnalyticsTimeline);

export default router;
