// ─────────────────────────────────────────────────────────────
// Document Store — localStorage-based document training system
// Admin uploads docs → text is extracted & stored → chat uses
// the stored content to answer user questions via keyword search.
// ─────────────────────────────────────────────────────────────

export interface TrainedDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  /** The raw text content extracted from the file */
  content: string;
  /** Status of training */
  status: "processing" | "trained" | "error";
}

const STORAGE_KEY = "poornasree_trained_documents";

/** Get all trained documents */
export function getDocuments(): TrainedDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save a new document */
export function saveDocument(doc: TrainedDocument): void {
  const docs = getDocuments();
  docs.push(doc);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

/** Delete a document by id */
export function deleteDocument(id: string): void {
  const docs = getDocuments().filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

/** Extract text content from a File object */
export async function extractTextFromFile(file: File): Promise<string> {
  const type = file.type;
  const name = file.name.toLowerCase();

  // Plain text, CSV, JSON, markdown, code files
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json") ||
    name.endsWith(".txt") ||
    name.endsWith(".log")
  ) {
    return await file.text();
  }

  // PDF — extract text from binary
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return await extractTextFromPDF(file);
  }

  // Word documents (.docx)
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return await extractTextFromDocx(file);
  }

  // Excel / spreadsheets
  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return await file.text().catch(() => `[Excel file: ${file.name} — content extracted as raw text]`);
  }

  // Fallback — try reading as text
  try {
    return await file.text();
  } catch {
    return `[File: ${file.name} — could not extract text content]`;
  }
}

/** Basic PDF text extraction (reads the raw bytes and pulls out text strings) */
async function extractTextFromPDF(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  // Try to extract text between BT/ET markers (PDF text objects)
  const textParts: string[] = [];

  // Method 1: Extract parenthesized strings from PDF text objects
  const regex = /\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const s = match[1];
    // Filter out binary garbage — only keep strings with printable chars
    if (s.length > 1 && /^[\x20-\x7E\s]+$/.test(s)) {
      textParts.push(s);
    }
  }

  // Method 2: Also try to find readable text sequences
  const readable = text.match(/[\x20-\x7E]{10,}/g) || [];
  for (const r of readable) {
    if (!textParts.includes(r) && !/^[%\/\[\]<>{}\\]+$/.test(r)) {
      textParts.push(r);
    }
  }

  if (textParts.length > 0) {
    return textParts.join("\n").replace(/\\n/g, "\n").replace(/\\r/g, "");
  }

  return `[PDF file: ${file.name} — text extraction limited. Content stored for reference.]`;
}

/** Basic DOCX text extraction (DOCX is a ZIP archive with XML inside) */
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    const text = await file.text();
    // Try to pull out text from XML tags
    const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length > 50) return stripped;
  } catch {
    // ignore
  }
  return `[DOCX file: ${file.name} — content stored for reference]`;
}

/**
 * Search trained documents for content relevant to a query.
 * Returns matching snippets from all trained documents.
 */
export function searchDocuments(query: string): { fileName: string; snippet: string }[] {
  const docs = getDocuments().filter((d) => d.status === "trained");
  if (docs.length === 0) return [];

  const results: { fileName: string; snippet: string }[] = [];
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    // Remove common stop words
    .filter(
      (w) =>
        !["the", "and", "for", "are", "but", "not", "you", "all", "can", "has", "her", "was", "one", "our", "out", "how", "what", "when", "where", "which", "who", "why", "this", "that", "with", "from", "they", "been", "have", "will", "would", "could", "should", "about"].includes(w)
    );

  if (queryWords.length === 0) return [];

  for (const doc of docs) {
    const content = doc.content.toLowerCase();
    const lines = doc.content.split(/\n/);

    // Score each line by how many query words it matches
    const scoredLines = lines.map((line, idx) => {
      const lineLower = line.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (lineLower.includes(word)) score++;
      }
      return { line: line.trim(), idx, score };
    });

    // Get best-scoring lines
    const best = scoredLines
      .filter((l) => l.score > 0 && l.line.length > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    for (const match of best) {
      // Include surrounding context (±2 lines)
      const start = Math.max(0, match.idx - 2);
      const end = Math.min(lines.length, match.idx + 3);
      const snippet = lines
        .slice(start, end)
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");
      results.push({ fileName: doc.fileName, snippet });
    }

    // Also check for overall document relevance
    if (results.length === 0) {
      let overallScore = 0;
      for (const word of queryWords) {
        if (content.includes(word)) overallScore++;
      }
      if (overallScore >= Math.ceil(queryWords.length * 0.3)) {
        // Return the first 500 chars as a general match
        results.push({
          fileName: doc.fileName,
          snippet: doc.content.slice(0, 500),
        });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.snippet.slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Get total count of trained documents */
export function getDocumentCount(): number {
  return getDocuments().filter((d) => d.status === "trained").length;
}

/** Format file size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
