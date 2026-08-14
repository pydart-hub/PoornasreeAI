import axios from "axios";
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

function formatTrainingDataSteps(rawStr: string): string {
  if (!rawStr) return "";
  const lines = rawStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const formattedLines: string[] = [];
  let stepCount = 0;

  for (const line of lines) {
    // Check if line is a numbered step: e.g. "1. CHECK THE FUSE -> REPLACE FUSE."
    const stepMatch = line.match(/^(\d+)[\.\)]\s*(.*)/);
    if (stepMatch) {
      stepCount++;
      const content = stepMatch[2].trim();
      
      if (content.includes("->")) {
        const parts = content.split("->").map(p => p.trim());
        const checkText = parts[0];
        const actionText = parts.slice(1).join(" -> ");
        formattedLines.push(`📍 *Step ${stepCount}:*`);
        formattedLines.push(`🔍 *Check ${stepCount}:* ${checkText}`);
        formattedLines.push(`⚡ *Action 1:* ${actionText}`);
      } else {
        formattedLines.push(`📍 *Step ${stepCount}:*`);
        formattedLines.push(`🔍 *Check ${stepCount}:* ${content}`);
        formattedLines.push(`⚡ *Action 1:* ${content}`);
      }
    } else if (line.startsWith("•") || line.startsWith("-")) {
      formattedLines.push(`   ${line}`);
    }
  }

  if (stepCount > 0) {
    formattedLines.push(`\nIf none of the above steps help, please contact Poornasree Customer Care for further assistance.`);
    return formattedLines.join("\n");
  }

  return rawStr; // Fallback to original string if not numbered
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
// Takes a document file path (JSON) and creates/updates DocumentIssue
// + DocumentIssueStep rows in the DB.
// Expected JSON format:
//   { "templates": [{ "problemType": "...", "title": "...", "description": "...", "steps": ["step1", "step2"] }] }

export interface TemplateExtractionResult {
  created: number;
  updated: number;
  errors:  string[];
}

export async function extractTemplatesFromDocument(
  filePath: string,
  audience: string = "customer",
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
      const existing = await prisma.documentIssue.findUnique({
        where: { problemType },
      });

      if (existing) {
        // Update: replace title/description/audience and recreate steps
        await prisma.documentIssueStep.deleteMany({ where: { issueId: existing.id } });
        await prisma.documentIssue.update({
          where: { id: existing.id },
          data: {
            title,
            description: description ?? null,
            audience,
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
        await prisma.documentIssue.create({
          data: {
            problemType,
            title,
            description: description ?? null,
            audience,
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

      // Also upsert into DocumentIssue DB for WhatsApp bot
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
          const existing = await prisma.documentIssue.findUnique({
            where: { problemType: intent.tag },
          });
          // Map documentType to template audience
          const audience = documentType === "service" ? "engineer" : "customer";
          if (existing) {
            await prisma.documentIssueStep.deleteMany({ where: { issueId: existing.id } });
            await prisma.documentIssue.update({
              where: { id: existing.id },
              data: {
                title,
                description,
                audience,
                steps: {
                  create: steps.map((s: string, i: number) => ({ stepNumber: i + 1, stepContent: s })),
                },
              },
            });
          } else {
            await prisma.documentIssue.create({
              data: {
                problemType: intent.tag,
                title,
                description,
                audience,
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

    const structuredEntries: StructuredEntry[] = [];

    let userChatSheet: ExcelJS.Worksheet | undefined = wb.getWorksheet("USER CHAT");
    if (!userChatSheet) {
      userChatSheet = wb.worksheets.find(s => s.name.trim().toUpperCase() === "USER CHAT");
      if (!userChatSheet) {
        for (const sheet of wb.worksheets) {
          const firstRow = sheet.getRow(1);
          const cell2 = String(firstRow.getCell(2).value ?? "").toLowerCase();
          const cell3 = String(firstRow.getCell(3).value ?? "").toLowerCase();
          const cell4 = String(firstRow.getCell(4).value ?? "").toLowerCase();
          if (
            (cell2.includes("product") || cell2.includes("part")) &&
            (cell3.includes("complaint") || cell3.includes("comp")) &&
            cell4.includes("check")
          ) {
            userChatSheet = sheet;
            break;
          }
        }
      }
    }
    if (userChatSheet) {
      // ── Detect CHATBOT_DATAS format and convert to intents ──────────
      const intents: Array<{ tag: string; patterns: string[]; responses: string[]; role: string; complaint?: string }> = [];
      let lastProduct = "";
      let lastComplaint = "";

      interface CheckStepData {
        checkTitle: string;
        actionItems: string[];
      }

      interface ComplaintGroup {
        product: string;
        complaint: string;
        checksList: CheckStepData[];
        columnActiveStepMap: Map<number, CheckStepData>;
        hasContactCare: boolean;
      }

      const complaintGroupMap = new Map<string, ComplaintGroup>();
      const tagOrder: string[] = [];

      userChatSheet.eachRow((row, rowIdx) => {
        if (rowIdx === 1) return; // skip header
        const cells = row.values as (string | null | undefined)[];
        const productCell = cells[2] ? String(cells[2]).trim() : "";
        const complaintCell = cells[3] ? String(cells[3]).trim() : "";

        if (productCell) {
          let pNorm = productCell;
          if (/analyzer/i.test(pNorm)) pNorm = "ANALYZER";
          else if (/ecod/i.test(pNorm)) pNorm = "ECOD";
          else if (/stirrer/i.test(pNorm)) pNorm = "STIRRER";
          else if (/scale/i.test(pNorm)) pNorm = "WEIGHING SCALE";
          else if (/printer/i.test(pNorm)) pNorm = "PRINTER";
          lastProduct = pNorm;
        }
        if (complaintCell) lastComplaint = complaintCell;

        if (!lastProduct || !lastComplaint) return;
        if (lastComplaint.toLowerCase() === "complaint" || lastComplaint.toLowerCase() === "comp" || lastProduct.toLowerCase() === "product/parts" || lastProduct.toLowerCase() === "prod") return;

        const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
        const tag = `chatbot_${slug(lastProduct)}_${slug(lastComplaint)}`;

        if (!complaintGroupMap.has(tag)) {
          complaintGroupMap.set(tag, {
            product: lastProduct,
            complaint: lastComplaint,
            checksList: [],
            columnActiveStepMap: new Map(),
            hasContactCare: false,
          });
          tagOrder.push(tag);
        }

        const group = complaintGroupMap.get(tag)!;

        // Process column pairs: col 4/5, col 6/7, col 8/9, col 10/11...
        for (let col = 4; col < cells.length; col += 2) {
          const check = cells[col] ? String(cells[col]).trim() : "";
          const action = cells[col + 1] ? String(cells[col + 1]).trim() : "";
          const nextVal = cells[col + 2] ? String(cells[col + 2]).trim() : "";

          if (!check && !action && !nextVal) continue;

          if (/contact customer care/i.test(check) || /contact customer care/i.test(action)) {
            group.hasContactCare = true;
            if (check && !/contact customer care/i.test(check)) {
              let activeStep = group.checksList.find(c => c.checkTitle.toLowerCase() === check.toLowerCase());
              if (!activeStep) {
                activeStep = { checkTitle: check, actionItems: [] };
                group.checksList.push(activeStep);
              }
              group.columnActiveStepMap.set(col, activeStep);
              if (action && !/contact customer care/i.test(action)) {
                activeStep.actionItems.push(action);
              }
            }
            continue;
          }

          let activeStep: CheckStepData | undefined;

          // A cell is ONLY a Check title if it explicitly starts with CHECK / TO CHECK
          const isRealCheckTitle = /^CHECK|^TO CHECK/i.test(check);

          if (check && isRealCheckTitle) {
            activeStep = group.checksList.find(c => c.checkTitle.toLowerCase() === check.toLowerCase());
            if (!activeStep) {
              activeStep = { checkTitle: check, actionItems: [] };
              group.checksList.push(activeStep);
            }
            group.columnActiveStepMap.set(col, activeStep);
          } else {
            activeStep = group.columnActiveStepMap.get(col) || group.checksList[group.checksList.length - 1];
          }

          if (action && activeStep) {
            const remarks: string[] = [];
            for (let cIdx = col + 2; cIdx < cells.length; cIdx++) {
              const extra = cells[cIdx] ? String(cells[cIdx]).trim() : "";
              if (extra && !/contact customer care/i.test(extra) && !extra.toUpperCase().startsWith("TO CONTACT") && !/^CHECK|^TO CHECK/i.test(extra)) {
                if (!remarks.includes(extra)) {
                  remarks.push(extra);
                }
              }
            }

            const isRemarkAction = /^(EG:|ITS WORKING|AFTER |DOWN KEY|UP KEY|THE CHARACTER|TO ENTER|" 0D "|' 0D '|"L"|'L')/i.test(action);

            if (isRemarkAction && activeStep.actionItems.length > 0) {
              const lastIdx = activeStep.actionItems.length - 1;
              let remarkText = action;
              if (remarks.length > 0) {
                remarkText += ` | ${remarks.join(" | ")}`;
              }

              if (!activeStep.actionItems[lastIdx].includes("↳ Remark:")) {
                activeStep.actionItems[lastIdx] += `\n   ↳ Remark: ${remarkText}`;
              } else {
                activeStep.actionItems[lastIdx] += ` | ${remarkText}`;
              }
            } else {
              let combinedItem = action;
              if (remarks.length > 0) {
                combinedItem = `${action}\n   ↳ Remark: ${remarks.join(" | ")}`;
              }

              const lines = combinedItem.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
              activeStep.actionItems.push(...lines);
            }
          }
        }
      });

      // Construct final intents from complaintGroupMap
      for (const tag of tagOrder) {
        const group = complaintGroupMap.get(tag)!;
        const p = group.product;
        const c = group.complaint;
        const cLow = c.toLowerCase();

        const patterns: string[] = [c, `${p} - ${c}`, `${p} ${cLow}`];
        if (/not (work|on|show|detect|print|send)/i.test(c)) {
          patterns.push(`Why is my ${p} ${cLow}?`, `My ${p} is ${cLow}`);
        } else if (/error|shown/i.test(c)) {
          patterns.push(`${p} showing ${cLow}`, `${p} ${cLow} problem`);
        } else {
          patterns.push(`My ${p} has ${cLow} issue`, `Problem with ${p}: ${cLow}`);
        }

        const respLines = [`Here's how to troubleshoot your ${p} — ${c}:`];
        let stepNum = 1;

        for (const stepData of group.checksList) {
          const checkHeader = stepData.checkTitle || `Check ${stepNum}`;
          
          if (stepData.actionItems.length > 0) {
            const actionLines: string[] = [];
            let mainActionCount = 0;
            for (const ai of stepData.actionItems) {
              if (ai.startsWith("↳ Remark:")) {
                actionLines.push(`      ${ai}`);
              } else if (/^(\d+[\).\s]|•|\()/i.test(ai)) {
                actionLines.push(`      • ${ai}`);
              } else {
                mainActionCount++;
                actionLines.push(`   - Action ${mainActionCount}: ${ai}`);
              }
            }
            respLines.push(`${stepNum}. Check ${stepNum}: ${checkHeader}\n${actionLines.join("\n")}`);
          } else {
            respLines.push(`${stepNum}. Check ${stepNum}: ${checkHeader}`);
          }
          stepNum++;
        }

        if (group.hasContactCare || stepNum === 1) {
          respLines.push(`${stepNum}. If none of the above steps help, please contact Poornasree Customer Care for further assistance.`);
        }

        intents.push({
          tag,
          patterns: [...new Set(patterns)],
          responses: [respLines.join("\n")],
          role: documentType,
          complaint: c,
        });
      }

        if (intents.length > 0) {
          // Clear all old DocumentIssues so they don't linger
          await prisma.documentIssue.deleteMany({});
          // Upsert into DocumentIssue DB for WhatsApp bot
          for (const intent of intents) {
            if (!intent.tag || !Array.isArray(intent.responses) || !intent.responses[0]) continue;
            const response = intent.responses[0] as string;
            const stepLines = response.split("\n").filter((l: string) => /^\d+\.\s/.test(l.trim()));
            const steps = stepLines.map((l: string) => l.replace(/^\d+\.\s*/, "").trim());
            if (steps.length === 0) continue;
            const title = intent.complaint || (intent.tag as string)
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            const description = intent.complaint || intent.tag;
            try {
              const existing = await prisma.documentIssue.findUnique({
                where: { problemType: intent.tag },
              });
              const audience = documentType === "service" ? "engineer" : "customer";
              if (existing) {
                await prisma.documentIssueStep.deleteMany({ where: { issueId: existing.id } });
                await prisma.documentIssue.update({
                  where: { id: existing.id },
                  data: {
                    title,
                    description,
                    audience,
                    steps: {
                      create: steps.map((s: string, i: number) => ({ stepNumber: i + 1, stepContent: s })),
                    },
                  },
                });
              } else {
                await prisma.documentIssue.create({
                  data: {
                    problemType: intent.tag,
                    title,
                    description,
                    audience,
                    steps: {
                      create: steps.map((s: string, i: number) => ({ stepNumber: i + 1, stepContent: s })),
                    },
                  },
                });
              }
            } catch {
              // non-blocking
            }
          }

          structuredEntries.push(
            ...intents.map((intent) => ({
              searchText: intent.patterns.join(" | "),
              answerText: intent.responses[0],
              tag:        intent.tag,
            }))
          );
        }
    }

    let trainingDataSheet: ExcelJS.Worksheet | undefined = wb.getWorksheet("Training Data");
    if (!trainingDataSheet) {
      trainingDataSheet = wb.worksheets.find(s => s.name.trim().toLowerCase() === "training data");
      if (!trainingDataSheet) {
        for (const sheet of wb.worksheets) {
          const firstRow = sheet.getRow(1);
          const cell1 = String(firstRow.getCell(1).value ?? "").toLowerCase();
          const cell2 = String(firstRow.getCell(2).value ?? "").toLowerCase();
          const cell3 = String(firstRow.getCell(3).value ?? "").toLowerCase();
          if (
            (cell1 === "tag" || cell1.includes("problem")) &&
            cell2.includes("pattern") &&
            (cell3.includes("response") || cell3.includes("troubleshoot") || cell3.includes("step"))
          ) {
            trainingDataSheet = sheet;
            break;
          }
        }
      }
    }
    if (trainingDataSheet) {
      const intents: Array<{ tag: string; patterns: string[]; responses: string[]; role: string; complaint?: string }> = [];
      const seenTags = new Set<string>();

      trainingDataSheet.eachRow((row, rowIdx) => {
        const cells = row.values as (string | null | undefined)[];
        const tag = cells[1] ? String(cells[1]).trim() : "";
        const title = cells[2] ? String(cells[2]).trim() : "";
        const stepsStr = cells[3] ? String(cells[3]).trim() : "";

        if (!tag || !title || !stepsStr) return;
        if (tag.toLowerCase() === "tag" || tag.toLowerCase() === "problem type") return;
        if (title.toLowerCase() === "patterns" || stepsStr.toLowerCase().includes("troubleshooting steps")) return;

        if (seenTags.has(tag)) return;
        seenTags.add(tag);

        const patternsList = title
          .split("\n")
          .flatMap((line) => line.split("|"))
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        const primaryTitle = patternsList[0] || tag.replace(/_/g, " ");

        // Format Training Data steps into identical structured Check & Action format as CHATBOT_DATAS
        const structuredResponse = formatTrainingDataSteps(stepsStr);

        intents.push({
          tag,
          patterns: patternsList,
          responses: [structuredResponse],
          role: documentType,
          complaint: primaryTitle,
        });
      });

      if (intents.length > 0) {
        // Upsert into DocumentIssue DB for WhatsApp bot
        for (const intent of intents) {
          if (!intent.tag || !Array.isArray(intent.responses) || !intent.responses[0]) continue;
          const response = intent.responses[0] as string;
          const stepLines = response.split("\n").filter((l: string) => /^\d+\.\s/.test(l.trim()));
          const steps = stepLines.map((l: string) => l.replace(/^\d+\.\s*/, "").trim());
          if (steps.length === 0) continue;
          
          const title = intent.complaint || intent.tag.replace(/_/g, " ");
          const description = intent.patterns.join(" | ");
          try {
            const existing = await prisma.documentIssue.findUnique({
              where: { problemType: intent.tag },
            });
            const audience = documentType === "service" ? "engineer" : "customer";
            if (existing) {
              await prisma.documentIssueStep.deleteMany({ where: { issueId: existing.id } });
              await prisma.documentIssue.update({
                where: { id: existing.id },
                data: {
                  title,
                  description,
                  audience,
                  steps: {
                    create: steps.map((s: string, i: number) => ({ stepNumber: i + 1, stepContent: s })),
                  },
                },
              });
            } else {
              await prisma.documentIssue.create({
                data: {
                  problemType: intent.tag,
                  title,
                  description,
                  audience,
                  steps: {
                    create: steps.map((s: string, i: number) => ({ stepNumber: i + 1, stepContent: s })),
                  },
                },
              });
            }
          } catch {
            // non-blocking
          }
        }

        structuredEntries.push(
          ...intents.map((intent) => ({
            searchText: intent.patterns.join(" | "),
            answerText: intent.responses[0],
            tag:        intent.tag,
          }))
        );
      }
    }

    if (structuredEntries.length > 0) {
      return embedStructuredEntries(documentId, documentType, structuredEntries);
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
  // NEW: Also run LLM extraction to automatically populate DocumentIssues for dropdowns
  await extractIssuesFromLLM(documentId, text, documentType);
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

async function extractIssuesFromLLM(documentId: string, text: string, documentType: string) {
  const { runtime } = await import("./runtime-config.service");
  const OLLAMA_URL = runtime.ollamaUrl();
  const GEN_MODEL = "phi3:mini";

  const prompt = `You are a technical support extraction system. 
Analyze the following document text and extract all distinct customer complaints, issues, or error codes, along with their step-by-step troubleshooting solutions.
Respond ONLY with a valid JSON array of objects, like this:
[
  {
    "problemType": "power_issue",
    "title": "Machine will not turn on",
    "description": "The machine shows no sign of power when plugged in.",
    "steps": ["Check power cable", "Verify wall outlet", "Check internal fuse"]
  }
]
If no clear troubleshooting instructions are found, output an empty array [].
DO NOT output any markdown blocks or explanations, just the raw JSON array.

TEXT:
${text.substring(0, 10000)}`;

  try {
    const { data } = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: GEN_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
      keep_alive: "10m",
    });

    let raw = data.message.content.trim();
    if (raw.startsWith('```json')) raw = raw.replace(/```json/g, '').replace(/```/g, '');
    
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[doc] Failed to parse LLM JSON output", e);
      return;
    }
    
    if (Array.isArray(parsed)) {
      const audience = documentType === "service" ? "engineer" : "customer";
      const structuredEntries: StructuredEntry[] = [];
      for (const item of parsed) {
         if (item.problemType && item.title && Array.isArray(item.steps) && item.steps.length > 0) {
            const problemTypeSlug = item.problemType.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50);
            
            const existing = await prisma.documentIssue.findUnique({
               where: { problemType: problemTypeSlug }
            });
            
            if (existing) {
               await prisma.documentIssueStep.deleteMany({ where: { issueId: existing.id } });
               await prisma.documentIssue.update({
                 where: { id: existing.id },
                 data: {
                   documentId,
                   title: item.title,
                   description: item.description,
                   audience,
                   steps: {
                     create: item.steps.map((s: string, i: number) => ({ stepNumber: i+1, stepContent: s }))
                   }
                 }
               });
            } else {
               await prisma.documentIssue.create({
                 data: {
                   documentId,
                   problemType: problemTypeSlug,
                   title: item.title,
                   description: item.description,
                   audience,
                   steps: {
                     create: item.steps.map((s: string, i: number) => ({ stepNumber: i+1, stepContent: s }))
                   }
                 }
               });
            }
            
            structuredEntries.push({
              searchText: `${item.title} ${item.description || ''}`,
              answerText: item.steps.map((s: string, i: number) => `Step ${i + 1} -- ${s}`).join("\n"),
              tag: problemTypeSlug
            });
         }
      }
      
      if (structuredEntries.length > 0) {
        await embedStructuredEntries(documentId, documentType, structuredEntries);
      }
    }
  } catch (e) {
    console.error("[doc] LLM Extraction failed:", e);
  }
}
