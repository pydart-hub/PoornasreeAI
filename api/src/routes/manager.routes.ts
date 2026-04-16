// ── Manager Routes ────────────────────────────────────────────────────────
// Prefix: /api/manager   (mounted in index.ts)
// All routes require service_manager role.

import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createEngineer,
  listMyEngineers,
  updateMyEngineer,
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
} from "../controllers/manager.controller";

const router = Router();
router.use(protect);
router.use(authorize("service_manager"));

// Engineers
router.post("/engineers",                   createEngineer);
router.get("/engineers",                    listMyEngineers);
router.patch("/engineers/:id",              updateMyEngineer);
router.patch("/engineers/:id/pincodes",     setEngineerPincodes);

// Pincodes (manager-owned CRUD)
router.get("/pincodes",                     listMyPincodes);
router.post("/pincodes/batch",              createMyPincodesBatch);
router.post("/pincodes",                    createMyPincode);
router.patch("/pincodes/:id",               updateMyPincode);
router.delete("/pincodes/:id",              deleteMyPincode);

// Dealers
router.post("/dealers",                     createDealer);
router.get("/dealers",                      listDealers);
router.patch("/dealers/:id",                updateDealer);
router.delete("/dealers/:id",               deleteDealer);

// Export
router.get("/export/tickets",               exportTickets);

export default router;
