// ── Super Admin Routes ───────────────────────────────────────────────────
// Prefix: /api/super-admin

import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  getSystemSettings,
  patchSystemSettings,
  reloadSystemSettings,
  importEnvSystemSettings,
} from "../controllers/superAdmin.controller";

const router = Router();

router.use(protect);
router.use(authorize("super_admin"));

router.get("/settings", getSystemSettings);
router.patch("/settings", patchSystemSettings);
router.post("/settings/reload", reloadSystemSettings);
router.post("/settings/import-env", importEnvSystemSettings);

export default router;
