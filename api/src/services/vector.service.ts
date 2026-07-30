// ── Vector Service ────────────────────────────────────────────────────
// Thin wrapper around Qdrant + Ollama embedding API.
// Keeps all vector-DB logic in one reusable module.

import { QdrantClient } from "@qdrant/js-client-rest";
import axios from "axios";
import { runtime } from "./runtime-config.service";

// ── Config ────────────────────────────────────────────────────────────
const COLLECTION   = "poornasree_docs";
const VECTOR_SIZE  = 768;           // nomic-embed-text dimension
const EMBED_MODEL  = "nomic-embed-text";

function qdrantUrl(): string {
  return runtime.qdrantUrl();
}
function ollamaUrl(): string {
  return runtime.ollamaUrl();
}

let qdrant: QdrantClient | null = null;
function getQdrant(): QdrantClient {
  if (!qdrant) qdrant = new QdrantClient({ url: qdrantUrl() });
  return qdrant;
}

/**
 * Ensure the Qdrant collection exists; create it if missing.
 * Safe to call on every startup.
 */
export async function ensureCollection(): Promise<void> {
  try {
    const client = getQdrant();
    const { collections } = await client.getCollections();
    const exists = collections.some((c) => c.name === COLLECTION);
    if (!exists) {
      await client.createCollection(COLLECTION, {
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
  const { data } = await axios.post(`${ollamaUrl()}/api/embeddings`, {
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
  await getQdrant().upsert(COLLECTION, {
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

  const results = await getQdrant().search(COLLECTION, searchParams);

  return results.map((r) => ({
    score:   r.score,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Delete all vectors associated with a specific document from Qdrant.
 */
export async function deleteVectorsByDocumentId(documentId: string): Promise<void> {
  await getQdrant().delete(COLLECTION, {
    wait: true,
    filter: {
      must: [{ key: "documentId", match: { value: documentId } }],
    },
  });
}
