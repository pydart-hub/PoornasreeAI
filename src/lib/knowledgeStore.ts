// ─────────────────────────────────────────────────────────────
// Knowledge Store — localStorage-based structured manual knowledge
// Admins can manually enter complaints & troubleshooting steps here.
// This serves as an editable Excel-like database that the AI will also query.
// ─────────────────────────────────────────────────────────────

export interface KnowledgeRow {
  id: string;
  complaint: string;
  documentIssueSteps: string;
  createdAt: string;
  updatedAt: string;
  source: "admin";
}

const STORAGE_KEY = "poornasree_manual_knowledge";

/** Get all knowledge rows */
export function getKnowledgeRows(): KnowledgeRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Add a new knowledge row */
export function addKnowledgeRow(row: Omit<KnowledgeRow, "id" | "createdAt" | "updatedAt" | "source">): KnowledgeRow {
  const rows = getKnowledgeRows();
  const newRow: KnowledgeRow = {
    ...row,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "admin",
  };
  rows.push(newRow);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  return newRow;
}

/** Update an existing knowledge row */
export function updateKnowledgeRow(id: string, updates: Partial<Pick<KnowledgeRow, "complaint" | "documentIssueSteps">>): KnowledgeRow | null {
  const rows = getKnowledgeRows();
  const index = rows.findIndex((r) => r.id === id);
  if (index === -1) return null;

  rows[index] = {
    ...rows[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  return rows[index];
}

/** Delete a knowledge row */
export function deleteKnowledgeRow(id: string): void {
  const rows = getKnowledgeRows().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}
