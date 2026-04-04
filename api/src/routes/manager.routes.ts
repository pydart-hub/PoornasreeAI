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
} from "../controllers/manager.controller";

const router = Router();
router.use(protect);
router.use(authorize("service_manager"));

// Engineers
router.post("/engineers",                   createEngineer);
router.get("/engineers",                    listMyEngineers);
router.patch("/engineers/:id",              updateMyEngineer);
router.patch("/engineers/:id/pincodes",     setEngineerPincodes);

// Pincodes
router.get("/pincodes",                     listMyPincodes);

export default router;
