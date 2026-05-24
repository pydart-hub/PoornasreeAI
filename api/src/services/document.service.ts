// ── Document Processing Service ───────────────────────────────────────
// Extracts text from a PDF, splits it into chunks, embeds each chunk
// via Ollama, stores the vector in Qdrant, and saves a DocumentChunk
// row so we can map vector results back to source documents.

import fs from "fs";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
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

// ── Text extraction for non-JSON files ───────────────────────────────

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

// ── Chunking helpers ──────────────────────────────────────────────────

const MAX_CHUNK = 500;

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (word) => {
    if (word === word.toUpperCase() && word.length > 2) return word; // keep USB, GSM, LED etc.
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).trim();
}

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

// ── Template extraction from JSON ──────────────────────────────────────
// Takes a document file path (JSON) and creates/updates TroubleshootingTemplate
// + TroubleshootingStep rows in the DB.
// Expected JSON format:
//   { "templates": [{ "problemType": "...", "title": "...", "description": "...", "steps": ["step1", "step2"] }] }

export interface TemplateExtractionResult {
  created: number;
  updated: number;
  errors:  string[];
}

export async function extractTemplatesFromDocument(
  filePath: string,
): Promise<TemplateExtractionResult> {
  const buffer = fs.readFileSync(filePath);
  let parsed: any;
  try {
    parsed = JSON.parse(buffer.toString("utf-8"));
  } catch {
    throw new Error("File is not valid JSON");
  }

  if (!Array.isArray(parsed?.templates)) {
    throw new Error('JSON must contain a "templates" array');
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const tpl of parsed.templates) {
    const { problemType, title, description, steps } = tpl;
    if (!problemType || !title || !Array.isArray(steps) || steps.length === 0) {
      errors.push(`Skipped entry: missing problemType, title, or steps`);
      continue;
    }

    try {
      const existing = await prisma.troubleshootingTemplate.findUnique({
        where: { problemType },
      });

      if (existing) {
        // Update: replace title/description and recreate steps
        await prisma.troubleshootingStep.deleteMany({ where: { templateId: existing.id } });
        await prisma.troubleshootingTemplate.update({
          where: { id: existing.id },
          data: {
            title,
            description: description ?? null,
            steps: {
              create: steps.map((s: string, i: number) => ({
                stepNumber: i + 1,
                stepContent: s,
              })),
            },
          },
        });
        updated++;
      } else {
        // Create new template with steps
        await prisma.troubleshootingTemplate.create({
          data: {
            problemType,
            title,
            description: description ?? null,
            steps: {
              create: steps.map((s: string, i: number) => ({
                stepNumber: i + 1,
                stepContent: s,
              })),
            },
          },
        });
        created++;
      }
    } catch (err) {
      errors.push(`Failed "${problemType}": ${(err as Error).message}`);
    }
  }

  return { created, updated, errors };
}

/**
 * Full pipeline: read file → extract text → chunk → embed → Qdrant + DB.
 *
 * JSON files with a recognised structure (problems / intents arrays) are
 * processed via a "direct-response" path: each entry is embedded using its
 * search-friendly text, but what is stored as the answer is already the
 * formatted step-by-step response — so the LLM is bypassed entirely.
 *
 * PDF / DOCX / CSV / TXT go through the normal text-chunking path and the
 * LLM is called at query time to synthesise an answer.
 */
export async function processDocument(
  documentId: string,
  filePath: string,
  mimetype: string = "application/pdf",
  documentType: string = "service"
): Promise<ProcessResult> {
  const buffer = fs.readFileSync(filePath);

  // ── Structured JSON: direct-response path (no LLM at query time) ─────
  if (mimetype === "application/json") {
    let parsed: any;
    try {
      parsed = JSON.parse(buffer.toString("utf-8"));
    } catch {
      throw new Error("Failed to parse JSON document");
    }

    // { "problems": [...] }
    if (Array.isArray(parsed?.problems)) {
      return embedStructuredEntries(
        documentId,
        documentType,
        parsed.problems.map((p: any) => {
          // searchText: what the user's question will match against
          const searchText = [
            p.title ?? "",
            p.problem ?? "",
            ...(Array.isArray(p.possible_causes) ? p.possible_causes : []),
          ].filter(Boolean).join(" ");

          // answerText: pre-formatted step-by-step answer returned directly to user
          const steps = Array.isArray(p.solutions) ? p.solutions : [];
          const answerText = steps.length > 0
            ? steps.map((s: string, i: number) => `Step ${i + 1} -- ${s}`).join("\n")
            : (p.problem ?? p.title ?? "");

          return { searchText, answerText, tag: p.title ?? "" };
        })
      );
    }

    // { "intents": [...] }
    if (Array.isArray(parsed?.intents)) {
      const result = await embedStructuredEntries(
        documentId,
        documentType,
        parsed.intents.map((intent: any) => {
          const searchText = Array.isArray(intent.patterns)
            ? intent.patterns.join(" | ")
            : intent.tag ?? "";
          const answerText = Array.isArray(intent.responses) && intent.responses[0]
            ? intent.responses[0]
            : "";
          return { searchText, answerText, tag: intent.tag ?? "" };
        })
      );

      // Also upsert into TroubleshootingTemplate DB for WhatsApp bot
      for (const intent of parsed.intents) {
        if (!intent.tag || !Array.isArray(intent.responses) || !intent.responses[0]) continue;
        const response = intent.responses[0] as string;
        const stepLines = response.split("\n").filter((l: string) => /^\d+\.\s/.test(l.trim()));
        const steps = stepLines.map((l: string) => l.replace(/^\d+\.\s*/, "").trim());
        if (steps.length === 0) continue;
        const title = (intent.tag as string)
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        const description = Array.isArray(intent.patterns)
          ? intent.patterns.join(" | ")
          : intent.tag;
        try {
          const existing = await prisma.troubleshootingTemplate.findUnique({
            where: { problemType: intent.tag },
          });
          if (existing) {
            await prisma.troubleshootingStep.deleteMany({ where: { templateId: existing.id } });
            await prisma.troubleshootingTemplate.update({
              where: { id: existing.id },
              data: {
                title,
                description,
                steps: {
                  create: steps.map((s: string, i: number) => ({ stepNumber: i + 1, stepContent: s })),
                },
              },
            });
          } else {
            await prisma.troubleshootingTemplate.create({
              data: {
                problemType: intent.tag,
                title,
                description,
                steps: {
                  create: steps.map((s: string, i: number) => ({ stepNumber: i + 1, stepContent: s })),
                },
              },
            });
          }
        } catch {
          // non-blocking — don't fail the whole upload if one intent fails
        }
      }

      return result;
    }

    // Generic JSON array or object — fall through to text-chunking
    const flat = JSON.stringify(parsed, null, 2);
    return embedTextChunks(documentId, documentType, chunkText(flat));
  }

  // ── Excel (.xlsx) — chatbot training data or generic text ────────────
  if (
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel"
  ) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    const userChatSheet = wb.getWorksheet("USER CHAT");
    if (userChatSheet) {
      // ── Detect CHATBOT_DATAS format and convert to intents ──────────
      const intents: Array<{ tag: string; patterns: string[]; responses: string[]; role: string }> = [];
      const seenTags = new Set<string>();
      let lastProduct = "";

      userChatSheet.eachRow((row, rowIdx) => {
        if (rowIdx === 1) return; // skip header
        const cells = row.values as (string | null | undefined)[];
        // exceljs row.values is 1-indexed; col 2 = PRODUCT, col 3 = COMPLAINT, col 4+ = CHECK/ACTION pairs
        const productCell = cells[2] ? String(cells[2]).trim() : "";
        const complaint   = cells[3] ? String(cells[3]).trim() : "";

        if (productCell) lastProduct = productCell;
        if (!complaint || !lastProduct) return;

        // Build CHECK/ACTION pairs from col 4 onwards
        const pairs: Array<{ check: string; action: string }> = [];
        for (let col = 4; col < cells.length; col += 2) {
          const check  = cells[col]   ? String(cells[col]).trim()   : "";
          const action = cells[col+1] ? String(cells[col+1]).trim() : "";
          if (!check && !action) continue;

          if (/contact customer care/i.test(check)) {
            pairs.push({ check: "CONTACT_CARE", action: "" });
            break;
          }
          if (/contact customer care/i.test(action)) {
            if (check) pairs.push({ check, action: "" });
            pairs.push({ check: "CONTACT_CARE", action: "" });
            break;
          }
          pairs.push({ check, action });
        }
        if (pairs.length === 0) return;

        // Generate tag
        const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
        const tag = `chatbot_${slug(lastProduct)}_${slug(complaint)}`;
        if (seenTags.has(tag)) return;
        seenTags.add(tag);

        // Build patterns
        const p = toTitleCase(lastProduct);
        const c = complaint.trim();
        const cLow = c.toLowerCase();
        const patterns: string[] = [c, `${p} - ${c}`, `${p} ${cLow}`];
        if (/not (work|on|show|detect|print|send)/i.test(c)) {
          patterns.push(`Why is my ${p} ${cLow}?`, `My ${p} is ${cLow}`);
        } else if (/error|shown/i.test(c)) {
          patterns.push(`${p} showing ${cLow}`, `${p} ${cLow} problem`);
        } else {
          patterns.push(`My ${p} has ${cLow} issue`, `Problem with ${p}: ${cLow}`);
        }

        // Build response text
        const respLines = [`Here's how to troubleshoot your ${p} — ${toTitleCase(complaint)}:`];
        let stepNum = 1;
        for (const { check, action } of pairs) {
          if (check === "CONTACT_CARE") {
            respLines.push(`${stepNum}. If none of the above steps help, please contact Poornasree Customer Care for further assistance.`);
            break;
          }
          if (check && action) {
            respLines.push(`${stepNum}. Check: ${toTitleCase(check)} → ${toTitleCase(action)}`);
          } else if (check) {
            respLines.push(`${stepNum}. ${toTitleCase(check)}`);
          }
          stepNum++;
        }

        intents.push({
          tag,
          patterns: [...new Set(patterns)],
          responses: [respLines.join("\n")],
          role: documentType,
        });
      });

      if (intents.length > 0) {
        return embedStructuredEntries(
          documentId,
          documentType,
          intents.map((intent) => ({
            searchText: intent.patterns.join(" | "),
            answerText: intent.responses[0],
            tag:        intent.tag,
          }))
        );
      }
    }

    // Generic xlsx — convert all sheets to text and chunk
    const lines: string[] = [];
    wb.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        const vals = (row.values as (string | null | undefined)[])
          .slice(1)
          .map((v) => (v != null ? String(v).trim() : ""))
          .filter(Boolean);
        if (vals.length) lines.push(vals.join(" | "));
      });
    });
    return embedTextChunks(documentId, documentType, chunkText(lines.join("\n")));
  }

  // ── Unstructured file: text-chunking path (LLM synthesises answer) ───
  const text = await extractText(buffer, mimetype);
  return embedTextChunks(documentId, documentType, chunkText(text));
}

// ── Shared embedding helpers ──────────────────────────────────────────

interface StructuredEntry {
  searchText: string;
  answerText: string;
  tag:        string;
}

/**
 * Embed each structured entry.
 * The vector is built from searchText (what users ask), but the payload
 * content is answerText (the pre-formatted answer).
 * directResponse: true → controller returns answerText without calling LLM.
 */
async function embedStructuredEntries(
  documentId: string,
  documentType: string,
  entries: StructuredEntry[]
): Promise<ProcessResult> {
  let embedded = 0;
  let failed   = 0;

  for (const { searchText, answerText, tag } of entries) {
    if (!searchText.trim() || !answerText.trim()) continue;
    const vectorId = randomUUID();
    try {
      const embedding = await embedText(searchText);

      await upsertVector(vectorId, embedding, {
        documentId,
        content:        answerText,
        role:           documentType,
        directResponse: true,   // ← skips LLM at query time
        tag,
        source:         "document",
      });

      await prisma.documentChunk.create({
        data: { documentId, content: answerText, vectorId },
      });

      embedded++;
    } catch (err) {
      console.error(`[doc] Failed to embed entry "${tag}" (doc ${documentId}):`, err);
      failed++;
    }
  }

  return { totalChunks: entries.length, embedded, failed };
}

/**
 * Embed plain text chunks (PDF/DOCX/CSV/TXT).
 * No directResponse — LLM is called at query time to synthesise answer.
 */
async function embedTextChunks(
  documentId: string,
  documentType: string,
  chunks: string[]
): Promise<ProcessResult> {
  let embedded = 0;
  let failed   = 0;

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
    }
  }

  return { totalChunks: chunks.length, embedded, failed };
}
