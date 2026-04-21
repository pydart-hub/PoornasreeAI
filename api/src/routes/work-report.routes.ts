import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  listWorkReports,
  getWorkReport,
  upsertWorkReport,
  uploadReportImage,
  deleteReportImage,
  workReportUpload,
} from "../controllers/work-report.controller";

const router = Router();

// All routes require authentication
router.use(protect);

// GET /api/work-reports — dealer sees own, manager/admin see all
router.get(
  "/",
  authorize("dealer", "service_manager", "admin"),
  listWorkReports
);

// GET /api/work-reports/:ticketId — get single report with parts + images
router.get(
  "/:ticketId",
  authorize("dealer", "service_manager", "admin"),
  getWorkReport
);

// POST /api/work-reports/:ticketId — upsert report text + parts (dealer only)
router.post(
  "/:ticketId",
  authorize("dealer"),
  upsertWorkReport
);

// POST /api/work-reports/:ticketId/images — upload image (dealer only)
router.post(
  "/:ticketId/images",
  authorize("dealer"),
  (req, res, next) => {
    workReportUpload(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || "File upload failed" });
        return;
      }
      next();
    });
  },
  uploadReportImage
);

// DELETE /api/work-reports/:ticketId/images/:imageId — delete image (dealer only)
router.delete(
  "/:ticketId/images/:imageId",
  authorize("dealer"),
  deleteReportImage
);

export default router;
