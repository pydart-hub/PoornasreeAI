// ── Manager Routes ────────────────────────────────────────────────────────
// Prefix: /api/manager   (mounted in index.ts)
// Most routes allow service_manager AND assistant_service_manager.
// The /assistants sub-routes are service_manager only.

import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createEngineer,
  listMyEngineers,
  updateMyEngineer,
  deleteEngineer,
  setEngineerPincodes,
  listMyPincodes,
  createMyPincode,
  createMyPincodesBatch,
  updateMyPincode,
  deleteMyPincode,
  createDealer,
  listDealers,
  updateDealer,
  deleteDealer,
  exportTickets,
  createAssistantManager,
  listMyAssistants,
  updateMyAssistant,
  deleteAssistantManager,
} from "../controllers/manager.controller";

const router = Router();
router.use(protect);

// ── Assistants (service_manager only) ────────────────────────────────────
router.get("/assistants",                authorize("service_manager"), listMyAssistants);
router.post("/assistants",               authorize("service_manager"), createAssistantManager);
router.patch("/assistants/:id",          authorize("service_manager"), updateMyAssistant);
router.delete("/assistants/:id",         authorize("service_manager"), deleteAssistantManager);
router.patch("/assistants/:id/pincodes", authorize("service_manager"), setEngineerPincodes);

// ── Shared routes (service_manager + assistant_service_manager) ──────────
const SM = authorize("service_manager", "assistant_service_manager");

// Engineers
router.post("/engineers",                   SM, createEngineer);
router.get("/engineers",                    SM, listMyEngineers);
router.patch("/engineers/:id",              SM, updateMyEngineer);
router.delete("/engineers/:id",             SM, deleteEngineer);
router.patch("/engineers/:id/pincodes",     SM, setEngineerPincodes);

// Pincodes
router.get("/pincodes",                     SM, listMyPincodes);
router.post("/pincodes/batch",              SM, createMyPincodesBatch);
router.post("/pincodes",                    SM, createMyPincode);
router.patch("/pincodes/:id",               SM, updateMyPincode);
router.delete("/pincodes/:id",              SM, deleteMyPincode);

// Dealers (service_manager only — assistants don't manage dealers)
router.post("/dealers",                     authorize("service_manager"), createDealer);
router.get("/dealers",                      authorize("service_manager"), listDealers);
router.patch("/dealers/:id",                authorize("service_manager"), updateDealer);
router.delete("/dealers/:id",               authorize("service_manager"), deleteDealer);

// Export
router.get("/export/tickets",               authorize("service_manager"), exportTickets);

export default router;
