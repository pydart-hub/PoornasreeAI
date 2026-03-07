// ── Vector Service ────────────────────────────────────────────────────
// Thin wrapper around Qdrant + Ollama embedding API.
// Keeps all vector-DB logic in one reusable module.

import { QdrantClient } from "@qdrant/js-client-rest";
import axios from "axios";

// ── Config ────────────────────────────────────────────────────────────
const QDRANT_URL   = process.env.QDRANT_URL   || "http://localhost:6333";
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434";
const COLLECTION   = "poornasree_docs";
const VECTOR_SIZE  = 768;           // nomic-embed-text dimension
const EMBED_MODEL  = "nomic-embed-text";

// ── Qdrant client (singleton) ─────────────────────────────────────────
const qdrant = new QdrantClient({ url: QDRANT_URL });

/**
 * Ensure the Qdrant collection exists; create it if missing.
 * Safe to call on every startup.
 */
export async function ensureCollection(): Promise<void> {
  try {
    const { collections } = await qdrant.getCollections();
    const exists = collections.some((c) => c.name === COLLECTION);
    if (!exists) {
      await qdrant.createCollection(COLLECTION, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });
      console.log(`[vector] Created Qdrant collection "${COLLECTION}"`);
    } else {
      console.log(`[vector] Qdrant collection "${COLLECTION}" already exists`);
    }
  } catch (err) {
    console.error("[vector] Failed to ensure Qdrant collection:", err);
    // Non-fatal — the service will still start; vector ops will fail individually.
  }
}

/**
 * Get a 768-dim embedding for a text string via Ollama.
 */
export async function embedText(text: string): Promise<number[]> {
  const { data } = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: EMBED_MODEL,
    prompt: text,
  });
  return data.embedding as number[];
}

/**
 * Upsert a single vector into Qdrant.
 */
export async function upsertVector(
  id: string,
  embedding: number[],
  payload: Record<string, unknown>
): Promise<void> {
  await qdrant.upsert(COLLECTION, {
    wait: true,
    points: [{ id, vector: embedding, payload }],
  });
}

/**
 * Search Qdrant for the top-k most similar vectors.
 * Optionally filter by document role metadata.
 * Returns the payloads so callers don't depend on Qdrant types.
 */
export async function searchVectors(
  queryEmbedding: number[],
  limit = 5,
  roleFilter?: string[]
): Promise<Array<{ score: number; payload: Record<string, unknown> }>> {
  const searchParams: any = {
    vector: queryEmbedding,
    limit,
    with_payload: true,
  };

  if (roleFilter && roleFilter.length > 0) {
    searchParams.filter = {
      must: [
        {
          key: "role",
          match: { any: roleFilter },
        },
      ],
    };
  }

  const results = await qdrant.search(COLLECTION, searchParams);

  return results.map((r) => ({
    score:   r.score,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}
