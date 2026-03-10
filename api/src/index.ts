import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
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

// ── TTS proxy ─────────────────────────────────────
// Proxies text-to-speech through our server so the browser avoids CORS
// and Google's user-agent blocking when fetching audio directly.
app.get("/api/tts", async (req: express.Request, res: express.Response) => {
  try {
    const ALLOWED_LANGS = ["en", "hi", "mr", "bn", "te"];
    const lang = ALLOWED_LANGS.includes(String(req.query.lang)) ? String(req.query.lang) : "en";
    const text = String(req.query.text ?? "").slice(0, 500).trim();
    if (!text) { res.status(400).json({ error: "text is required" }); return; }

    const url =
      `https://translate.google.com/translate_tts` +
      `?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob&ttsspeed=0.9`;

    const upstream = await axios.get(url, {
      responseType: "stream",
      timeout: 10_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Referer": "https://translate.google.com/",
        "Accept": "audio/mpeg,*/*",
      },
    });

    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=3600");
    (upstream.data as NodeJS.ReadableStream).pipe(res);
  } catch {
    res.status(502).json({ error: "TTS service unavailable" });
  }
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
