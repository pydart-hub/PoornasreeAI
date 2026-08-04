// ── Training catalog for Groq WhatsApp agent ─────────────────────────────
// Loads customer/service intents from JSON + DocumentIssue DB + company pack.
// Cached in memory with TTL so Stage-1 prompts stay fast.

import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";

export type CatalogRole = "customer" | "service" | "new_user";

export type CatalogEntry = {
  id: string;
  tag: string;
  role: CatalogRole;
  title: string;
  patterns: string[];
  content: string;
  source: "json" | "document_issue" | "company";
};

type RawIntent = {
  tag: string;
  patterns?: string[];
  responses?: string[];
  role?: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { loadedAt: number; entries: CatalogEntry[] } | null = null;

function resolveTrainingPath(fileName: string): string | null {
  const candidates = [
    `/app/data/${fileName}`,
    path.resolve(process.cwd(), `../data/training/${fileName}`),
    path.resolve(__dirname, `../../../data/training/${fileName}`),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function loadJsonIntents(fileName: string, defaultRole: CatalogRole, source: CatalogEntry["source"]): CatalogEntry[] {
  const filePath = resolveTrainingPath(fileName);
  if (!filePath) {
    console.warn(`[training-catalog] ${fileName} not found — skipped`);
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { intents?: RawIntent[] };
    const intents = data.intents ?? [];
    const out: CatalogEntry[] = [];
    for (const intent of intents) {
      if (!intent.tag || !intent.responses?.[0]) continue;
      const role: CatalogRole =
        intent.role === "customer" ? "customer" : intent.role === "service" ? "service" : intent.role === "new_user" ? "new_user" : defaultRole;
      const content = String(intent.responses[0]).trim();
      if (!content) continue;
      out.push({
        id: `${source}:${intent.tag}`,
        tag: intent.tag,
        role,
        title: intent.patterns?.[0] || intent.tag,
        patterns: intent.patterns ?? [],
        content,
        source,
      });
    }
    return out;
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error(`[training-catalog] Failed to parse ${fileName}:`, e.message ?? err);
    return [];
  }
}

async function loadDocumentIssues(): Promise<CatalogEntry[]> {
  try {
    const issues = await prisma.documentIssue.findMany({
      where: { isActive: true },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 400,
    });

    return issues.map((issue) => {
      const audience = String(issue.audience || "both").toLowerCase();
      const role: CatalogRole =
        audience === "engineer" || audience === "service" ? "service"
        : audience === "new_user" ? "new_user"
        : "customer";
      const steps = issue.steps
        .map((s) => `${s.stepNumber}. ${s.stepContent}`)
        .join("\n");
      const content = [
        issue.title,
        issue.description ? `Description: ${issue.description}` : "",
        steps ? `Steps:\n${steps}` : "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim();

      return {
        id: `document_issue:${issue.problemType}`,
        tag: issue.problemType,
        role,
        title: issue.title,
        patterns: [issue.title, issue.problemType, issue.description || ""].filter(Boolean),
        content,
        source: "document_issue" as const,
      };
    }).filter((e) => e.content.length > 0);
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[training-catalog] DocumentIssue load failed:", e.message ?? err);
    return [];
  }
}

async function loadProductsFromDb(): Promise<CatalogEntry[]> {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
    });

    return products.map((p) => {
      const content = [
        `PRODUCT MODEL: ${p.name}`,
        `CATEGORY: ${p.category}`,
        p.price ? `PRICE: ${p.price}` : "",
        p.detail ? `FEATURES & SPECS: ${p.detail}` : "",
        p.contactNumber ? `SALES CONTACT: ${p.contactNumber}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        id: `product:${p.id}`,
        tag: `product_${p.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        role: "customer" as CatalogRole,
        title: `Product Model: ${p.name}`,
        patterns: [p.name, p.category, "product", "model", "features", "specs", "price"],
        content,
        source: "company" as const,
      };
    });
  } catch (err: unknown) {
    console.error("[training-catalog] Product load failed:", err);
    return [];
  }
}

/**
 * Load and merge all training sources. Dedupes by tag (JSON wins over DocumentIssue
 * when tags collide, except company pack which always stays).
 */
export async function loadTrainingCatalog(force = false): Promise<CatalogEntry[]> {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.entries;
  }

  const fromJson = [
    ...loadJsonIntents("company-knowledge.json", "customer", "company"),
    ...loadJsonIntents("customer-training.json", "customer", "json"),
    ...loadJsonIntents("chatbot-training.json", "customer", "json"),
    ...loadJsonIntents("new-user-training.json", "new_user", "json"),
    ...loadJsonIntents("training.json", "service", "json"),
  ];

  const fromDb = await loadDocumentIssues();
  const fromProducts = await loadProductsFromDb();

  const byTag = new Map<string, CatalogEntry>();
  for (const e of fromDb) byTag.set(`${e.role}:${e.tag}`, e);
  for (const e of fromProducts) byTag.set(`${e.role}:${e.tag}`, e);
  for (const e of fromJson) byTag.set(`${e.role}:${e.tag}`, e);

  const entries = Array.from(byTag.values());
  cache = { loadedAt: Date.now(), entries };
  console.log(
    `[training-catalog] Loaded ${entries.length} entries ` +
      `(customer=${entries.filter((e) => e.role === "customer").length}, ` +
      `service=${entries.filter((e) => e.role === "service").length})`,
  );
  return entries;
}

export async function getCatalogForRole(role: CatalogRole): Promise<CatalogEntry[]> {
  const all = await loadTrainingCatalog();
  if (role === "service") {
    // Engineers get BOTH Engineer/Service training data AND Customer training data!
    return all.filter((e) => e.role === "service" || e.role === "customer" || e.source === "company");
  }
  if (role === "new_user") {
    return all.filter((e) => e.role === "new_user" || e.source === "company");
  }
  // Customers get ONLY Customer training data (no engineer/service PCB board replacement data)!
  return all.filter((e) => e.role === "customer" || e.source === "company");
}

/**
 * Keyword pre-filter so Stage-1 prompt stays within context limits.
 * Always keeps company entries; ranks remaining by token overlap.
 */
export function prefilterCatalog(
  entries: CatalogEntry[],
  query: string,
  limit = 60,
): CatalogEntry[] {
  const company = entries.filter((e) => e.source === "company");
  const rest = entries.filter((e) => e.source !== "company");

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (tokens.length === 0) {
    return [...company, ...rest.slice(0, Math.max(0, limit - company.length))];
  }

  const scored = rest
    .map((e) => {
      const hay = `${e.title} ${e.tag} ${e.patterns.join(" ")} ${e.content}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 1;
      }
      // Boost common product keywords
      if (/vibro/i.test(query) && /vibro/i.test(hay)) score += 2;
      if (/analyzer|lactosure|lactogrand|ecod/i.test(query) && /analyzer|lactosure|lactogrand|ecod/i.test(hay)) {
        score += 2;
      }
      if (/adapter|charger|solar/i.test(query) && /adapter|charger|solar/i.test(hay)) score += 2;
      return { e, score };
    })
    .sort((a, b) => b.score - a.score);

  const matched = scored.filter((s) => s.score > 0).map((s) => s.e);
  const fillers = scored.filter((s) => s.score === 0).map((s) => s.e);
  const picked = [...matched, ...fillers].slice(0, Math.max(0, limit - company.length));
  return [...company, ...picked];
}

export function invalidateTrainingCatalogCache(): void {
  cache = null;
}

export function clearTrainingCatalogCache(): void {
  cache = null;
}

/** Compact numbered catalog for Groq Stage-1 prompts */
export function formatCatalogForPrompt(entries: CatalogEntry[]): string {
  return entries
    .map((e, i) => {
      const preview = e.content.replace(/\s+/g, " ").slice(0, 180);
      return `${i + 1}. id="${e.id}" tag="${e.tag}" title="${e.title}" :: ${preview}`;
    })
    .join("\n");
}
