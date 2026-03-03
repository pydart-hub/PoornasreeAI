// ── Admin Routes ──────────────────────────────────────────────────────
// Prefix: /api/admin   (mounted in index.ts)
// All routes require authentication via `protect`.

import { Router } from "express";
import multer from "multer";
import path from "path";
import { protect } from "../middleware/auth";
import { uploadDocument } from "../controllers/document.controller";

const router = Router();

// ── Multer config — store PDFs in api/uploads/ ────────────────────────
const storage = multer.diskStorage({
  destination: path.resolve(__dirname, "../../uploads"),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only PDF files are accepted"));
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

// All admin routes are protected
router.use(protect);

// POST /api/admin/documents  —  upload + embed a PDF
router.post("/documents", upload.single("file"), uploadDocument);

export default router;
