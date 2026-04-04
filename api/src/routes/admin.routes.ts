// ── Admin Routes ──────────────────────────────────────────────────────
// Prefix: /api/admin   (mounted in index.ts)
// All routes require authentication via `protect`.

import { Router } from "express";
import multer from "multer";
import path from "path";
import { protect } from "../middleware/auth";
import { uploadDocument, extractTemplates } from "../controllers/document.controller";
import {
  createUser,
  listUsers,
  deleteUser,
  updateUser,
  listDocuments,
  deleteDocumentRecord,
  reindexDocuments,
} from "../controllers/admin.controller";
import { getAnalytics, getAnalyticsTimeline, getCustomerAnalytics, getServiceAnalytics } from "../controllers/support.controller";
import { exportChats, exportSupport, exportTickets } from "../controllers/export.controller";
import { listVideos, createVideo, updateVideo, deleteVideo } from "../controllers/video.controller";
import { listMachines, createMachine, updateMachine, deleteMachine, searchMachines } from "../controllers/machine.controller";
import { updateBranding, uploadLogo } from "../controllers/branding.controller";
import { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from "../controllers/template.controller";
import { listRdVideos, createRdVideo, deleteRdVideo } from "../controllers/rd-video.controller";

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

// POST /api/admin/documents/reindex  —  re-process all documents with improved chunking
router.post("/documents/reindex", reindexDocuments);

// POST /api/admin/documents/:id/extract-templates  —  extract troubleshooting templates from JSON doc
router.post("/documents/:id/extract-templates", extractTemplates);

// POST /api/admin/users  —  create a user with a specific role
router.post("/users", createUser);

// GET  /api/admin/users  —  list all users
router.get("/users", listUsers);

// PATCH /api/admin/users/:id  —  update a user
router.patch("/users/:id", updateUser);

// DELETE /api/admin/users/:id  —  delete a user
router.delete("/users/:id", deleteUser);

// GET /api/admin/analytics  —  dashboard analytics (Feature 7)
router.get("/analytics", getAnalytics);

// GET /api/admin/analytics/timeline  —  daily counts for charts
router.get("/analytics/timeline", getAnalyticsTimeline);

// GET /api/admin/analytics/customer  —  customer-specific analytics
router.get("/analytics/customer", getCustomerAnalytics);

// GET /api/admin/analytics/service  —  service-specific analytics
router.get("/analytics/service", getServiceAnalytics);

// GET /api/admin/export/chats    —  CSV download of all chat logs
router.get("/export/chats", exportChats);

// GET /api/admin/export/support  —  CSV download of all support tickets
router.get("/export/support", exportSupport);

// GET /api/admin/export/tickets  —  CSV download of ticket data
router.get("/export/tickets", exportTickets);

// Video recommendation resources (admin CRUD)
router.get("/videos", listVideos);
router.post("/videos", createVideo);
router.patch("/videos/:id", updateVideo);
router.delete("/videos/:id", deleteVideo);

// Machine registry (admin CRUD)
router.get("/machines", listMachines);
router.get("/machines/search", searchMachines);
router.post("/machines", createMachine);
router.patch("/machines/:id", updateMachine);
router.delete("/machines/:id", deleteMachine);

// Branding (admin update)
router.patch("/branding", updateBranding);
router.post("/branding/logo", upload.single("file"), uploadLogo);

// Troubleshooting templates (admin CRUD)
router.get("/templates", listTemplates);
router.get("/templates/:id", getTemplate);
router.post("/templates", createTemplate);
router.patch("/templates/:id", updateTemplate);
router.delete("/templates/:id", deleteTemplate);

// R&D Videos (admin upload + delete, list accessible to engineer/admin)
router.get("/rd-videos", listRdVideos);
router.post("/rd-videos", upload.single("file"), createRdVideo);
router.delete("/rd-videos/:id", deleteRdVideo);

export default router;
