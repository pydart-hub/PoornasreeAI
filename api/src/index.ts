import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import chatRoutes from "./routes/chat.routes";
import adminRoutes from "./routes/admin.routes";
import { ensureCollection } from "./services/vector.service";

const app = express();

// ── Middleware ────────────────────────────────────
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Routes ───────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api", chatRoutes);
app.use("/api/admin", adminRoutes);

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

// ── Start ────────────────────────────────────────
app.listen(env.PORT, async () => {
  console.log(`[${env.NODE_ENV}] API server running on http://localhost:${env.PORT}`);

  // Ensure Qdrant collection exists (non-blocking — logs error if Qdrant is down)
  await ensureCollection();
});
