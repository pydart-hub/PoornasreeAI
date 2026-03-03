// ── Document Processing Service ───────────────────────────────────────
// Extracts text from a PDF, splits it into chunks, embeds each chunk
// via Ollama, stores the vector in Qdrant, and saves a DocumentChunk
// row so we can map vector results back to source documents.

import fs from "fs";
import pdfParse from "pdf-parse";
import prisma from "../lib/prisma";
import { embedText, upsertVector } from "./vector.service";
import { randomUUID } from "crypto";

// pdf-parse type workaround
const parsePdf: (buf: Buffer) => Promise<{ text: string }> = pdfParse as any;

// ── Chunking helpers ──────────────────────────────────────────────────

const MAX_CHUNK = 500; // characters

/**
 * Split text by paragraph boundaries first, then fall back to
 * fixed-length slicing when a single paragraph exceeds MAX_CHUNK.
 */
function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= MAX_CHUNK) {
      chunks.push(para);
    } else {
      // Fixed-length fallback
      for (let i = 0; i < para.length; i += MAX_CHUNK) {
        chunks.push(para.slice(i, i + MAX_CHUNK).trim());
      }
    }
  }
  return chunks;
}

// ── Public API ────────────────────────────────────────────────────────

export interface ProcessResult {
  totalChunks: number;
  embedded:    number;
  failed:      number;
}

/**
 * Full pipeline: read PDF → chunk → embed → Qdrant + DB.
 *
 * @param documentId  The Document record id (already persisted)
 * @param filePath    Absolute (or relative) path to the PDF on disk
 */
export async function processDocument(
  documentId: string,
  filePath: string
): Promise<ProcessResult> {
  // 1. Extract text
  const buffer = fs.readFileSync(filePath);
  const { text } = await parsePdf(buffer);

  // 2. Chunk
  const chunks = chunkText(text);

  let embedded = 0;
  let failed   = 0;

  // 3. Embed + store each chunk
  for (const content of chunks) {
    const vectorId = randomUUID();
    try {
      const embedding = await embedText(content);

      await upsertVector(vectorId, embedding, {
        documentId,
        content,
      });

      await prisma.documentChunk.create({
        data: { documentId, content, vectorId },
      });

      embedded++;
    } catch (err) {
      console.error(`[doc] Failed to embed chunk (doc ${documentId}):`, err);
      failed++;
      // Continue with remaining chunks — don't block entire upload.
    }
  }

  return { totalChunks: chunks.length, embedded, failed };
}
