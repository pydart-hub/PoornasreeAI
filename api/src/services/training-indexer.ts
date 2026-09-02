// ── Training Intent Indexer ───────────────────────────────────────────
// Reads training.json at API startup, embeds each intent's patterns,
// and upserts them into Qdrant with `directResponse: true`.
//
// When the message controller finds one of these vectors with a high
// enough cosine score it returns the stored response DIRECTLY —
// no LLM call → near-instant replies (200–500 ms instead of minutes).

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { embedText, upsertVector } from "./vector.service";

interface Intent {
  tag: string;
  patterns: string[];
  responses: string[];
  role?: string;  // "customer" | "service" — defaults to "service"
}

/**
 * Convert a training tag → deterministic UUID (stable across restarts).
 * Qdrant requires point IDs to be UUIDs or unsigned integers.
 */
function tagToUUID(tag: string): string {
  const hex = createHash("md5").update("poornasree-training:" + tag).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Training file configurations — add entries here to index additional files on startup.
const TRAINING_FILES = [
  {
    name: "training.json",
    candidates: [
      "/app/data/training.json",
      path.resolve(process.cwd(), "../data/training/training.json"),
      path.resolve(__dirname, "../../../data/training/training.json"),
    ],
  },
  {
    name: "customer-training.json",
    candidates: [
      "/app/data/customer-training.json",
      path.resolve(process.cwd(), "../data/training/customer-training.json"),
      path.resolve(__dirname, "../../../data/training/customer-training.json"),
    ],
  },
  {
    name: "chatbot-training.json",
    candidates: [
      "/app/data/chatbot-training.json",
      path.resolve(process.cwd(), "../data/training/chatbot-training.json"),
      path.resolve(__dirname, "../../../data/training/chatbot-training.json"),
    ],
  },
];

/**
 * Index all training files into Qdrant.
 * Safe to call on every startup — upsert is idempotent (same UUID each time).
 */
export async function indexTrainingData(): Promise<void> {
  for (const fileConfig of TRAINING_FILES) {
    const trainingPath = fileConfig.candidates.find((p) => fs.existsSync(p)) ?? null;
    if (!trainingPath) {
      console.warn(
        `[training] ${fileConfig.name} not found — skipped. ` +
        `Searched: ${fileConfig.candidates.join(", ")}`
      );
      continue;
    }
    await indexFile(trainingPath);
  }
}

async function indexFile(trainingPath: string): Promise<void> {
  let data: { intents: Intent[] };
  try {
    data = JSON.parse(fs.readFileSync(trainingPath, "utf-8"));
  } catch (err: any) {
    console.error("[training] Failed to parse", trainingPath + ":", err?.message);
    return;
  }

  const intents = data.intents ?? [];
  if (intents.length === 0) {
    console.warn("[training] No intents found in", trainingPath);
    return;
  }

  console.log(`[training] Indexing ${intents.length} intents from ${trainingPath}…`);

  let ok = 0;
  for (const intent of intents) {
    if (!intent.tag || !intent.patterns?.length || !intent.responses?.[0]) continue;
    try {
      // Embed all patterns joined — gives the best semantic coverage per intent
      const searchText = intent.patterns.join(" | ");
      const embedding = await embedText(searchText);
      const intentRole = intent.role === "customer" ? "customer" : "service";

      await upsertVector(tagToUUID(intent.tag), embedding, {
        content: intent.responses[0],
        directResponse: true,   // ← controller checks this to skip LLM
        tag: intent.tag,
        role: intentRole,
        source: "training",
      });
      ok++;
    } catch (err: any) {
      if (err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED" || err?.message?.includes("ENOTFOUND ollama")) {
        console.warn(`[training] Ollama vector service not reachable (${err?.message}). Skipping vector indexing; PostgreSQL document matching and cloud LLM will be used.`);
        return;
      }
      console.error(`[training] Failed to index intent "${intent.tag}":`, err?.message);
    }
  }

  console.log(`[training] Done — ${ok}/${intents.length} intents indexed from ${path.basename(trainingPath)}`);
}
