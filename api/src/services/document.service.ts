// ── Document Processing Service ───────────────────────────────────────
// Extracts text from a PDF, splits it into chunks, embeds each chunk
// via Ollama, stores the vector in Qdrant, and saves a DocumentChunk
// row so we can map vector results back to source documents.

import fs from "fs";
import mammoth from "mammoth";
import prisma from "../lib/prisma";
import { embedText, upsertVector } from "./vector.service";
import { randomUUID } from "crypto";

// pdf-parse v2 exports a class-based API but its typings mark internal methods
// as private. Use a runtime require to bypass TS visibility checks entirely.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require("pdf-parse") as any;

async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  const PDFParse = pdfParseModule.PDFParse ?? pdfParseModule.default?.PDFParse;
  if (PDFParse) {
    // v2 class-based API
    const parser = new PDFParse({ data: buffer });
    await parser.load();
    const result = await parser.getText();
    return (typeof result === "string" ? result : result?.text) ?? "";
  }
  // Fallback: v1 function-based API  pdfParse(buffer) => { text }
  const fallback = pdfParseModule.default ?? pdfParseModule;
  if (typeof fallback === "function") {
    const { text } = await fallback(buffer);
    return text ?? "";
  }
  throw new Error("pdf-parse: no usable export found");
}

// ── Text extraction by MIME type ──────────────────────────────────────

async function extractText(buffer: Buffer, mimetype: string): Promise<string> {
  switch (mimetype) {
    case "application/pdf": {
      try {
        return await parsePdfBuffer(buffer);
      } catch (err) {
        console.error("[doc] PDF parsing failed:", err);
        throw new Error("Failed to parse PDF document");
      }
    }
    case "application/json": {
      const parsed = JSON.parse(buffer.toString("utf-8"));
      // Try to flatten structured JSON into readable text chunks
      const flattened = flattenStructuredJSON(parsed);
      if (flattened) return flattened;
      return JSON.stringify(parsed, null, 2);
    }
    case "text/csv":
    case "text/plain":
      return buffer.toString("utf-8");
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    default:
      throw new Error("Unsupported document format");
  }
}

/**
 * Flatten structured JSON (problems/intents) into human-readable text.
 * Each entry becomes a separate paragraph (separated by \n\n) so that
 * chunkText() produces one meaningful chunk per problem/intent.
 */
function flattenStructuredJSON(data: any): string | null {
  // Format: { "problems": [ { title, problem, possible_causes, solutions } ] }
  if (Array.isArray(data?.problems)) {
    return data.problems
      .map((p: any) => {
        const lines: string[] = [];
        if (p.title) lines.push(`Problem: ${p.title}`);
        if (p.problem) lines.push(`Description: ${p.problem}`);
        if (Array.isArray(p.possible_causes) && p.possible_causes.length > 0) {
          lines.push(`Possible causes: ${p.possible_causes.join(", ")}`);
        }
        if (Array.isArray(p.solutions) && p.solutions.length > 0) {
          lines.push(`Solutions: ${p.solutions.map((s: string, i: number) => `${i + 1}. ${s}`).join(" ")}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
  }

  // Format: { "intents": [ { tag, patterns, responses } ] }
  if (Array.isArray(data?.intents)) {
    return data.intents
      .map((intent: any) => {
        const lines: string[] = [];
        if (intent.tag) lines.push(`Topic: ${intent.tag.replace(/_/g, " ")}`);
        if (Array.isArray(intent.patterns) && intent.patterns.length > 0) {
          lines.push(`Questions: ${intent.patterns.join(" | ")}`);
        }
        if (Array.isArray(intent.responses) && intent.responses.length > 0) {
          lines.push(`Answer: ${intent.responses[0]}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
  }

  // Format: array of objects at top level
  if (Array.isArray(data)) {
    const items = data.map((item: any) => {
      if (typeof item === "string") return item;
      // Generic object: flatten key-value pairs
      return Object.entries(item)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("\n");
    });
    return items.join("\n\n");
  }

  return null; // Not a recognized structure — fall back to raw JSON
}

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
 * Full pipeline: read file → extract text → chunk → embed → Qdrant + DB.
 *
 * @param documentId  The Document record id (already persisted)
 * @param filePath    Absolute (or relative) path to the file on disk
 * @param mimetype    MIME type of the uploaded file
 * @param documentType  "service" | "customer" — stored as role metadata in Qdrant
 */
export async function processDocument(
  documentId: string,
  filePath: string,
  mimetype: string = "application/pdf",
  documentType: string = "service"
): Promise<ProcessResult> {
  // 1. Extract text based on file type
  const buffer = fs.readFileSync(filePath);
  const text = await extractText(buffer, mimetype);

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
        role: documentType,
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
