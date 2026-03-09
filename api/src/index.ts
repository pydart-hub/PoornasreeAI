import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import chatRoutes from "./routes/chat.routes";
import adminRoutes from "./routes/admin.routes";
import supportRoutes from "./routes/support.routes";
import { ensureCollection } from "./services/vector.service";
import { indexTrainingData } from "./services/training-indexer";
import { initSocket } from "./lib/socket";

const app = express();

// ── Middleware ────────────────────────────────────
// All requests arrive server-to-server from the Next.js proxy container.
// The browser never calls this port directly, so origin: true (reflect
// whatever origin is present, including none) is the correct setting.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Routes ───────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportRoutes);

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

  // Index training.json intents into Qdrant in the background.
  // Runs non-blocking so a slow Ollama startup doesn't delay the HTTP server.
  setTimeout(() => {
    indexTrainingData().catch((err) =>
      console.error("[training] Background indexing failed:", err?.message ?? err)
    );
  }, 5000); // 5 s head-start for Ollama to finish loading
});

export default app;
