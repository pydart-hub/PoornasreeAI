// ── Document Upload Controller ────────────────────────────────────────
// POST /api/admin/documents  —  admin only
// Accepts a multipart file upload, saves to disk, creates a Document
// record, then kicks off the embedding pipeline.

import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import prisma from "../lib/prisma";
import { processDocument, extractTemplatesFromDocument } from "../services/document.service";

// Where uploaded PDFs are stored (simple disk storage).
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

// Ensure directory exists on module load.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * POST /api/admin/documents
 * Requires `multer` middleware to have populated `req.file`.
 */
export async function uploadDocument(req: Request, res: Response): Promise<void> {
  try {
    const { role, userId } = req.user!;

    // Admin-only guard
    if (role !== "admin") {
      res.status(403).json({ error: "Only admins may upload documents" });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No file provided. Send a PDF as form-data field 'file'." });
      return;
    }

    const title = (req.body.title as string)?.trim() || file.originalname;
    const documentType = (req.body.documentType as string)?.trim() || "service";

    if (!["service", "customer", "new_user"].includes(documentType)) {
      res.status(400).json({ error: "documentType must be 'service', 'customer', or 'new_user'" });
      return;
    }

    // 1. Persist Document record
    const document = await prisma.document.create({
      data: {
        title,
        filePath: file.path,
        documentType,
        uploadedById: userId,
      },
    });

    // 2. Kick off embedding pipeline (async — don't block the response for
    //    large files; but for now we await so admin gets immediate feedback).
    const result = await processDocument(document.id, file.path, file.mimetype, documentType);

    res.status(201).json({
      document: {
        id:    document.id,
        title: document.title,
        createdAt: document.createdAt,
      },
      processing: result,
    });
  } catch (err) {
    console.error("uploadDocument error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/suggestions
 * Returns document titles for customer-type documents (used as suggestion chips).
 */
export async function getSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const documents = await prisma.document.findMany({
      where: { documentType: "customer" },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ suggestions: documents });
  } catch (err) {
    console.error("getSuggestions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/documents/:id/extract-templates
 * Takes an uploaded JSON document and creates DocumentIssue rows from it.
 */
export async function extractTemplates(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins may extract templates" });
      return;
    }

    const id = String(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    if (!doc.filePath.endsWith(".json")) {
      res.status(400).json({ error: "Only JSON documents can be used for template extraction" });
      return;
    }

    const audience = doc.documentType === "service" ? "engineer" : "customer";
    const result = await extractTemplatesFromDocument(doc.filePath, audience);
    res.json({ result });
  } catch (err) {
    console.error("extractTemplates error:", err);
    const message = (err as Error).message ?? "Internal server error";
    res.status(500).json({ error: message });
  }
}

/**
 * GET /api/admin/documents/:id/excel
 * Retrieves the raw rows of the uploaded Excel file.
 */
export async function getRawExcel(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins may view raw Excel files" });
      return;
    }

    const id = String(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    if (!doc.filePath.endsWith(".xlsx") && !doc.filePath.endsWith(".xls")) {
      res.status(400).json({ error: "Not an Excel document" });
      return;
    }

    if (!fs.existsSync(doc.filePath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(doc.filePath);
    const sheet = wb.worksheets[0]; // Just read the first sheet

    const rows: string[][] = [];
    sheet.eachRow((row) => {
      // row.values is 1-indexed in ExcelJS. [empty, col1, col2, ...]
      const vals = (row.values as (string | null | undefined)[])
        .slice(1)
        .map((v) => (v != null ? String(v) : ""));
      rows.push(vals);
    });

    res.json({ rows, sheetName: sheet.name });
  } catch (err) {
    console.error("getRawExcel error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/admin/documents/:id/excel
 * Overwrites the first sheet of the Excel file with new rows and re-indexes.
 */
export async function updateRawExcel(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins may edit Excel files" });
      return;
    }

    const id = String(req.params.id);
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: "rows must be an array of string arrays" });
      return;
    }

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    if (!doc.filePath.endsWith(".xlsx") && !doc.filePath.endsWith(".xls")) {
      res.status(400).json({ error: "Not an Excel document" });
      return;
    }

    const wb = new ExcelJS.Workbook();
    if (fs.existsSync(doc.filePath)) {
      await wb.xlsx.readFile(doc.filePath);
    }
    
    // Fallback if file corrupt or missing
    if (wb.worksheets.length === 0) {
      wb.addWorksheet("Sheet1");
    }

    const sheet = wb.worksheets[0];
    
    // Clear existing rows
    const rowCount = sheet.rowCount;
    if (rowCount > 0) {
      sheet.spliceRows(1, rowCount);
    }

    // Add new rows
    for (const r of rows) {
      sheet.addRow(r);
    }

    // Write back to file
    await wb.xlsx.writeFile(doc.filePath);

    // Re-trigger the embedding pipeline
    // First remove old data
    await prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });
    await prisma.documentIssue.deleteMany({ where: { documentId: doc.id } }); // Delete related templates if any
    
    // For raw vectors, we would ideally import deleteVectorsByDocumentId here, 
    // but to avoid circular deps we just let processDocument overwrite or we let it run.
    // We'll require it locally.
    const { deleteVectorsByDocumentId } = require("../services/vector.service");
    if (deleteVectorsByDocumentId) {
      await deleteVectorsByDocumentId(doc.id).catch(() => {});
    }

    const result = await processDocument(
      doc.id, 
      doc.filePath, 
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
      doc.documentType
    );

    res.json({ message: "Excel file updated and re-processed", result });
  } catch (err) {
    console.error("updateRawExcel error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

