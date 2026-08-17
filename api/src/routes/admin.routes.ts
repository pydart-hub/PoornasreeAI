// ── Admin Routes ──────────────────────────────────────────────────────
// Prefix: /api/admin   (mounted in index.ts)
// All routes require authentication via `protect`.

import { Router } from "express";
import multer from "multer";
import path from "path";
import { protect } from "../middleware/auth";
import { uploadDocument, extractTemplates, getRawExcel, updateRawExcel } from "../controllers/document.controller";
import {
  createUser,
  listUsers,
  deleteUser,
  updateUser,
  listDocuments,
  deleteDocumentRecord,
  reindexDocuments,
  importDealersAdmin,
  deleteAllDealersAdmin,
  clearTestCustomer,
  listRegisteredCustomers,
} from "../controllers/admin.controller";
import {
  getAnalytics,
  getAnalyticsTimeline,
  getCustomerAnalytics,
  getServiceAnalytics,
  getWhatsappChatbotAnalytics,
  getWhatsappLiveUsers,
} from "../controllers/support.controller";
import { exportChats, exportSupport, exportTickets } from "../controllers/export.controller";
import { listVideos, createVideo, updateVideo, deleteVideo } from "../controllers/video.controller";

import { listRdVideos, createRdVideo, deleteRdVideo, updateRdVideo } from "../controllers/rd-video.controller";
import { listProducts, createProduct, updateProduct, deleteProduct } from "../controllers/product.controller";
import { getChatbotSettings, updateChatbotSettings } from "../controllers/chatbotSettings.controller";
import { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from "../controllers/template.controller";
import { listMachines, createMachine, updateMachine, deleteMachine, searchMachines } from "../controllers/machine.controller";
import { listManualComplaints, createManualComplaint, updateManualComplaint, reviewManualComplaint, deleteManualComplaint, scanManualComplaints } from "../controllers/manualComplaint.controller";
import { listTrainingVideos, createTrainingVideo, updateTrainingVideo, deleteTrainingVideo, seedTrainingVideos, searchTrainingVideosHandler } from "../controllers/engineer-training-video.controller";

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
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls (some browsers report this for xlsx)
  // Image types (for product images, branding logo, etc.)
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

// Extension → canonical MIME (fallback for browsers that report octet-stream)
const EXT_TO_MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".json": "application/json",
  ".csv":  "text/csv",
  ".txt":  "text/plain",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls":  "application/vnd.ms-excel",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".gif":  "image/gif",
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

// In-memory xlsx upload for dealer bulk import
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith(".xlsx")) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx files are accepted"));
    }
  },
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

// POST /api/admin/documents/:id/extract-templates  — extract templates
router.post("/documents/:id/extract-templates", extractTemplates);

// GET/PUT /api/admin/documents/:id/excel — get/update raw excel
router.get("/documents/:id/excel", getRawExcel);
router.put("/documents/:id/excel", updateRawExcel);

// POST /api/admin/users  —  create a user with a specific role
router.post("/users", createUser);

// GET  /api/admin/users  —  list all users
router.get("/users", listUsers);

// GET  /api/admin/registered-customers  —  list customers registered via WhatsApp
router.get("/registered-customers", listRegisteredCustomers);

// PATCH /api/admin/users/:id  —  update a user
router.patch("/users/:id", updateUser);

// DELETE /api/admin/users/:id  —  delete a user
router.delete("/users/:id", deleteUser);

// GET  /api/admin/pincodes  —  list all pincodes
import { listMyPincodes } from "../controllers/manager.controller";
router.get("/pincodes", listMyPincodes);

// DELETE /api/admin/dealers/all  —  remove all dealer accounts
router.delete("/dealers/all", deleteAllDealersAdmin);

// POST /api/admin/import/dealers  —  bulk import dealers from Excel
router.post("/import/dealers", xlsxUpload.single("file"), importDealersAdmin);

// GET /api/admin/analytics  —  dashboard analytics (Feature 7)
router.get("/analytics", getAnalytics);

// GET /api/admin/analytics/timeline  —  daily counts for charts
router.get("/analytics/timeline", getAnalyticsTimeline);

// GET /api/admin/analytics/customer  —  customer-specific analytics
router.get("/analytics/customer", getCustomerAnalytics);

// GET /api/admin/analytics/service  —  service-specific analytics
router.get("/analytics/service", getServiceAnalytics);

// GET /api/admin/analytics/whatsapp  —  WhatsApp chatbot users by location
router.get("/analytics/whatsapp", getWhatsappChatbotAnalytics);

// GET /api/admin/analytics/whatsapp/live  —  recently active WhatsApp users
router.get("/analytics/whatsapp/live", getWhatsappLiveUsers);

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

// Troubleshooting templates (admin CRUD)
router.get("/templates", listTemplates);
router.get("/templates/:id", getTemplate);
router.post("/templates", createTemplate);
router.patch("/templates/:id", updateTemplate);
router.delete("/templates/:id", deleteTemplate);

// Machines (admin CRUD)
router.get("/machines", listMachines);
router.get("/machines/search", searchMachines);
router.post("/machines", createMachine);
router.patch("/machines/:id", updateMachine);
router.delete("/machines/:id", deleteMachine);

// Branding and marketing features moved to /api/marketing (marketing role)

// R&D Videos (admin upload + delete, list accessible to engineer/admin)
router.get("/rd-videos", listRdVideos);
router.post("/rd-videos", createRdVideo);
router.patch("/rd-videos/:id", updateRdVideo);
router.delete("/rd-videos/:id", deleteRdVideo);

// WhatsApp chatbot settings (Speak to Support contact)
router.get("/chatbot-settings", getChatbotSettings);
router.patch("/chatbot-settings", updateChatbotSettings);

// Product catalogue (admin CRUD with image upload)
router.get("/products", listProducts);
router.post("/products", upload.single("image"), createProduct);
router.patch("/products/:id", upload.single("image"), updateProduct);
router.delete("/products/:id", deleteProduct);

// WhatsApp customer test reset (admin only — remove when no longer needed)
router.delete("/test/customer", clearTestCustomer);

// Manual Complaints (from customer chat)
router.get("/manual-complaints", listManualComplaints);
router.post("/manual-complaints", createManualComplaint);
router.post("/manual-complaints/scan", scanManualComplaints);
router.patch("/manual-complaints/:id", updateManualComplaint);
router.patch("/manual-complaints/:id/review", reviewManualComplaint);
router.delete("/manual-complaints/:id", deleteManualComplaint);

// Engineer Training Videos (private AI-searchable videos for engineers)
router.get("/training-videos", listTrainingVideos);
router.post("/training-videos", createTrainingVideo);
router.post("/training-videos/seed", seedTrainingVideos);
router.get("/training-videos/search", searchTrainingVideosHandler);
router.patch("/training-videos/:id", updateTrainingVideo);
router.delete("/training-videos/:id", deleteTrainingVideo);

export default router;
