import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import gtts from "node-gtts";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import chatRoutes from "./routes/chat.routes";
import adminRoutes from "./routes/admin.routes";
import managerRoutes from "./routes/manager.routes";
import supportRoutes from "./routes/support.routes";
import salesRoutes from "./routes/sales.routes";
import ticketRoutes from "./routes/ticket.routes";
import publicRoutes from "./routes/public.routes";
import troubleshootingRoutes from "./routes/troubleshooting.routes";
import whatsappRoutes from "./routes/whatsapp.routes";
import workReportRoutes from "./routes/work-report.routes";
import marketingRoutes from "./routes/marketing.routes";
import complaintRoutes from "./routes/complaint.routes";
import supportChatRoutes from "./routes/support-chat";
import simulateRoutes from "./routes/simulate.routes";
import { getBranding } from "./controllers/branding.controller";
import { listRdVideos } from "./controllers/rd-video.controller";
import { protect } from "./middleware/auth";
import { ensureCollection } from "./services/vector.service";
import { indexTrainingData } from "./services/training-indexer";
import { initSocket } from "./lib/socket";
import { startDailySummaryScheduler } from "./services/engineer-ticket-notification.service";
import { startSessionCleanupCron } from "./services/session-cleanup.service";

const app = express();

// ── Middleware ────────────────────────────────────
// All requests arrive server-to-server from the Next.js proxy container.
// The browser never calls this port directly, so origin: true (reflect
// whatever origin is present, including none) is the correct setting.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Serve uploaded files (logos, R&D videos, etc.)
import path from "path";
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));
// ── Routes ───────────────────────────────────────
app.use("/api/auth",    authRoutes);

// ── Public endpoints (no auth) — must be registered BEFORE the broad chatRoutes
// mount below, which runs `protect` on ALL /api/* requests.
app.use("/api/whatsapp",        whatsappRoutes);
app.use("/api/tickets",         ticketRoutes);
app.use("/api/troubleshooting", troubleshootingRoutes);
app.use("/api/public",          publicRoutes);  // no-auth data access
app.use("/api/simulate",        simulateRoutes);

// Public branding endpoint (no auth)
app.get("/api/branding", getBranding);

// R&D videos list (authenticated — engineers + admin)
app.get("/api/rd-videos", protect, listRdVideos);

// ── Authenticated routes ──────────────────────────────────────────────────
// IMPORTANT: specific prefixes MUST be mounted before the broad "/api" mount,
// otherwise chatRoutes' protect middleware intercepts admin/support/sales
// requests first and can cause duplicate auth checks or unexpected 401s.
app.use("/api/admin",        adminRoutes);
app.use("/api/manager",      managerRoutes);
app.use("/api/support",      supportRoutes);
app.use("/api/sales",        salesRoutes);
app.use("/api/work-reports", workReportRoutes);
app.use("/api/marketing",    marketingRoutes);
app.use("/api/complaints",   complaintRoutes);
app.use("/api/support-chat", protect, supportChatRoutes);
app.use("/api",         chatRoutes);    // broad mount — catch-all for /api/conversations, /api/messages, etc.

// ── TTS proxy ─────────────────────────────────────
// Uses node-gtts (Google TTS via server-side request) — works for all Indian
// languages: en, hi, mr, bn, te.  Browser-to-Google is blocked by CORS;
// server-to-Google is not.
app.get("/api/tts", (req: express.Request, res: express.Response) => {
  const ALLOWED_LANGS = ["en", "hi", "mr", "bn", "te"];
  const lang = ALLOWED_LANGS.includes(String(req.query.lang)) ? String(req.query.lang) : "en";
  const text = String(req.query.text ?? "").slice(0, 500).trim();
  if (!text) { res.status(400).json({ error: "text is required" }); return; }

  res.set("Content-Type", "audio/mpeg");
  res.set("Cache-Control", "public, max-age=3600");

  const stream = gtts(lang).stream(text);
  stream.on("error", () => {
    if (!res.headersSent) res.status(502).json({ error: "TTS service unavailable" });
  });
  stream.pipe(res);
});

// ── Health check ─────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

app.get("/", (_req, res) => {
  res.json({
    name: "PoornasreeAI API",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      register: "POST /api/auth/register",
      login: "POST /api/auth/login",
    },
  });
});

// ── eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("🔥 Backend Error:", err);
  const status: number = err.status ?? err.statusCode ?? 500;
  const message: string = err.message ?? "Internal server error";
  res.status(status).json({ error: message });
});

// ── HTTP server + Socket.IO ───────────────────────────────────────────
const httpServer = createServer(app);
initSocket(httpServer);

// ── Start ────────────────────────────────────────
httpServer.listen(env.PORT, async () => {
  console.log(`[${env.NODE_ENV}] API server running on http://localhost:${env.PORT}`);

  // Ensure Qdrant collection exists
  await ensureCollection();

  // Start daily engineer ticket summary scheduler at 8:00 AM
  startDailySummaryScheduler();

  // Start background inactivity sweep for manual support chats
  startSessionCleanupCron();

  // Index training.json intents into Qdrant in the background.
  // Runs non-blocking so a slow Ollama startup doesn't delay the HTTP server.
  setTimeout(() => {
    indexTrainingData().catch((err) =>
      console.error("[training] Background indexing failed:", err?.message ?? err)
    );
  }, 5000); // 5 s head-start for Ollama to finish loading
});

export default app;
