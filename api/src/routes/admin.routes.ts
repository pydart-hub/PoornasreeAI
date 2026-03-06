// ── Admin Routes ──────────────────────────────────────────────────────
// Prefix: /api/admin   (mounted in index.ts)
// All routes require authentication via `protect`.

import { Router } from "express";
import multer from "multer";
import path from "path";
import { protect } from "../middleware/auth";
import { uploadDocument } from "../controllers/document.controller";
import {
  createUser,
  listUsers,
  deleteUser,
  listDocuments,
  deleteDocumentRecord,
} from "../controllers/admin.controller";

const router = Router();

// ── Multer config — store PDFs in api/uploads/ ────────────────────────
const storage = multer.diskStorage({
  destination: path.resolve(__dirname, "../../uploads"),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/json",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// Extension → canonical MIME (fallback for browsers that report octet-stream)
const EXT_TO_MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".json": "application/json",
  ".csv":  "text/csv",
  ".txt":  "text/plain",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Normalise MIME type: if browser sent a generic type, derive from extension
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const mimeByExt = EXT_TO_MIME[ext];
      if (!mimeByExt) {
        return cb(new Error("Unsupported file type"));
      }
      // Override so downstream (processDocument) uses the correct MIME
      file.mimetype = mimeByExt;
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

// All admin routes are protected
router.use(protect);

// POST /api/admin/documents  —  upload + embed a PDF
router.post("/documents", upload.single("file"), uploadDocument);

// GET  /api/admin/documents  —  list all uploaded documents
router.get("/documents", listDocuments);

// DELETE /api/admin/documents/:id  —  delete a document + file
router.delete("/documents/:id", deleteDocumentRecord);

// POST /api/admin/users  —  create a user with a specific role
router.post("/users", createUser);

// GET  /api/admin/users  —  list all users
router.get("/users", listUsers);

// DELETE /api/admin/users/:id  —  delete a user
router.delete("/users/:id", deleteUser);

export default router;
