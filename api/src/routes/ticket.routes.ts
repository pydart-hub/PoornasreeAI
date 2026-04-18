// ── Ticket Routes ─────────────────────────────────────────────────────────
// Prefix: /api/tickets   (mounted in index.ts)
// All routes require authentication via `protect`.

import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createTicket,
  listTickets,
  getTicket,
  assignEngineer,
  unassignEngineer,
  startWork,
  requestOTP,
  verifyOTP,
  listEngineers,
} from "../controllers/ticket.controller";

const router = Router();
router.use(protect);

// ── Core CRUD ─────────────────────────────────────────────────────────────
// CREATE TICKET: dealer, customer, or admin
router.post("/", authorize("dealer", "admin", "customer"), createTicket);

// VIEW TICKETS: all ticket-related roles (role-scoped filtering in controller)
router.get("/engineers", authorize("service_manager", "admin"), listEngineers);
router.get("/", authorize("admin", "service_manager", "service_engineer", "service", "dealer", "customer"), listTickets);
router.get("/:id", authorize("admin", "service_manager", "service_engineer", "service", "dealer", "customer"), getTicket);

// ── Assignment ────────────────────────────────────────────────────────────

// ASSIGN ENGINEER: service_manager or admin
router.patch("/:id/assign-engineer", authorize("service_manager", "admin"), assignEngineer);

// UNASSIGN ENGINEER: service_manager or admin
router.patch("/:id/unassign-engineer", authorize("service_manager", "admin"), unassignEngineer);

// ── Engineer lifecycle ────────────────────────────────────────────────────
// START WORK: assigned service_engineer or admin
router.patch("/:id/start", authorize("service_engineer", "service", "admin"), startWork);
// REQUEST OTP: assigned service_engineer or admin
router.post("/:id/otp", authorize("service_engineer", "service", "admin"), requestOTP);
// VERIFY OTP: assigned service_engineer OR admin (override)
router.post("/:id/verify-otp", authorize("service_engineer", "service", "admin"), verifyOTP);

export default router;
