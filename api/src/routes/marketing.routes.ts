// ── Marketing Routes ─────────────────────────────────────────────────────
// Prefix: /api/marketing   (mounted in index.ts)
// All routes require authentication + marketing or admin role.

import { Router } from "express";
import multer from "multer";
import path from "path";
import { protect, authorize } from "../middleware/auth";
import {
  updateBranding,
  uploadLogo,
  listLeads,
  addLead,
  importLeads,
  deleteLead,
  listCampaigns,
  createCampaign,
  deleteCampaign,
  addLeadsToCampaign,
  sendCampaign,
} from "../controllers/branding.controller";

const router = Router();

const storage = multer.diskStorage({
  destination: path.resolve(__dirname, "../../uploads"),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const CSV_MIMES = ["text/csv", "application/vnd.ms-excel", "text/plain"];

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = ALLOWED_IMAGE_MIMES.includes(file.mimetype) || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
    const isCsv = CSV_MIMES.includes(file.mimetype) || ext === ".csv";
    if (isImage || isCsv) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

// All marketing routes require authentication + marketing or admin role
router.use(protect, authorize("marketing", "admin"));

// ── Branding ─────────────────────────────────────────────────────────────
router.patch("/branding", updateBranding);
router.post("/branding/logo", upload.single("file"), uploadLogo);

// ── Marketing Leads ───────────────────────────────────────────────────────
router.get("/leads", listLeads);
router.post("/leads", addLead);
router.post("/leads/import", upload.single("file"), importLeads);
router.delete("/leads/:id", deleteLead);

// ── WhatsApp Campaigns ────────────────────────────────────────────────────
router.get("/campaigns", listCampaigns);
router.post("/campaigns", upload.single("image"), createCampaign);
router.delete("/campaigns/:id", deleteCampaign);
router.post("/campaigns/:id/leads", addLeadsToCampaign);
router.post("/campaigns/:id/send", sendCampaign);

export default router;
