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
  assignAssistant,
  assignDealer,
  dealerAccept,
  dealerReject,
  dealerComplete,
  dealerUpdateNote,
  startWork,
  requestOTP,
  verifyOTP,
  listEngineers,
  getEngineerFeedback,
  deleteAllTickets,
} from "../controllers/ticket.controller";

const router = Router();
router.use(protect);

// ── Core CRUD ─────────────────────────────────────────────────────────────
// DELETE ALL TICKETS: service_manager or admin
router.delete("/all", authorize("service_manager", "admin"), deleteAllTickets);

// CREATE TICKET: dealer, customer, or admin
router.post("/", authorize("dealer", "admin", "customer"), createTicket);

// VIEW TICKETS: all ticket-related roles (role-scoped filtering in controller)
router.get("/engineers", authorize("service_manager", "assistant_service_manager", "admin"), listEngineers);
router.get("/engineer-feedback", authorize("service_manager", "assistant_service_manager", "admin"), getEngineerFeedback);
router.get("/", authorize("admin", "service_manager", "assistant_service_manager", "service_engineer", "service", "dealer", "customer"), listTickets);
router.get("/:id", authorize("admin", "service_manager", "assistant_service_manager", "service_engineer", "service", "dealer", "customer"), getTicket);

// ── Assignment ────────────────────────────────────────────────────────────

// ASSIGN ENGINEER: service_manager, assistant_service_manager or admin
router.patch("/:id/assign-engineer", authorize("service_manager", "assistant_service_manager", "admin"), assignEngineer);

// ASSIGN ASSISTANT: service_manager or admin
router.patch("/:id/assign-assistant", authorize("service_manager", "admin"), assignAssistant);

// ASSIGN DEALER: service_manager or admin routes ticket to a dealer for field handling
router.patch("/:id/assign-dealer", authorize("service_manager", "admin"), assignDealer);

// DEALER RESPONSES
router.patch("/:id/dealer-accept", authorize("dealer"), dealerAccept);
router.patch("/:id/dealer-reject", authorize("dealer"), dealerReject);
router.patch("/:id/dealer-complete", authorize("dealer"), dealerComplete);
router.patch("/:id/dealer-note", authorize("dealer"), dealerUpdateNote);

// UNASSIGN ENGINEER: service_manager, assistant_service_manager or admin
router.patch("/:id/unassign-engineer", authorize("service_manager", "assistant_service_manager", "admin"), unassignEngineer);

// ── Engineer lifecycle ────────────────────────────────────────────────────
// START WORK: assigned service_engineer or admin
router.patch("/:id/start", authorize("service_engineer", "service", "admin"), startWork);
// REQUEST OTP: assigned service_engineer or admin
router.post("/:id/otp", authorize("service_engineer", "service", "admin"), requestOTP);
// VERIFY OTP: assigned service_engineer OR admin (override)
router.post("/:id/verify-otp", authorize("service_engineer", "service", "admin"), verifyOTP);

export default router;
