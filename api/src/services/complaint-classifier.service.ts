// ── Groq-Powered Complaint Classifier ─────────────────────────────────────────
// Solves the core problem: real customers type "mera machine nahi chalta" or
// "display blank issue" — not the verbose training patterns like
// "VIBRO is not working and LED is not on".
//
// Strategy:
//   1. Fast keyword pre-filter → narrow to ~15 candidate entries
//   2. Groq LLM semantic classification → pick best match with confidence
//   3. Cache results (5 min TTL) so repeat queries are instant
//   4. Fall back gracefully to the LLM generation path if no confident match
//
// This runs BEFORE the expensive full LLM response generation, so a confident
// classifier match saves an LLM call (~400-600ms savings).

import { groqChat, groqFastModel } from "./groq.service";
import type { CatalogEntry } from "./training-catalog.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClassifierResult {
  matched: boolean;
  entryId: string | null;
  confidence: number; // 0–100
  reason?: string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: ClassifierResult;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const classifierCache = new Map<string, CacheEntry>();

function cacheKey(message: string, candidateIds: string[]): string {
  const sig = `${message.toLowerCase().trim()}::${candidateIds.sort().join(",")}`;
  return sig;
}

// ── Keyword Pre-filter ────────────────────────────────────────────────────────
// Quickly narrow the full catalog to ~15 likely candidates before sending to Groq.
// This keeps the LLM call cheap (fewer tokens) and improves accuracy.

const PRODUCT_KEYWORDS: Record<string, RegExp> = {
  vibro: /vibro|stirrer|stir/i,
  analyzer: /analyzer|machine|milk.*test|ecos|ecod|lactosure|lactogrand|eco[_-]?v|eco[_-]?sv|eco[_-]?d|lse/i,
  charger: /charger|adapter|solar.*charger|charging/i,
  solar: /solar.*charger|solar.*board|battery.*charg/i,
  compact: /compact.*adapter|adapter.*compact/i,
  pump: /pump|motor.*dead|motor.*not/i,
  battery: /battery|low.*battery|battery.*full|battery.*error/i,
  display: /display|screen|lcd|blank.*screen|half.*screen/i,
  printer: /printer|print.*not|not.*print/i,
  keyboard: /keypad|keyboard|button.*not/i,
  usb: /usb|pendrive|pen.*drive|keyboard.*detect/i,
  wifi: /wifi|gsm|sim.*card|network.*error|cloud.*error/i,
  sensor: /sensor|sample.*not.*found|air.*milk|water.*sensor|hot.*sample|plunge|reading.*variation|fat.*water|count.*zero/i,
  power: /power|not.*on|not.*working|won.*turn|fuse|no.*power|no.*led|led.*blink|led.*glow/i,
  rtc: /rtc|time.*not|clock|date.*time|time.*change/i,
  scale: /scale|weighing|weight/i,
  cloud: /cloud|updat/i,
  sms: /sms|message.*not.*send|farmer.*sms/i,
  rate: /rate.*chart|chart.*not/i,
};

const COMPLAINT_KEYWORDS: Record<string, string[]> = {
  vibro: ["vibro"],
  analyzer: ["analyzer", "ecod", "dpst", "lactosure"],
  charger: ["charger", "adapter", "solar charger"],
  solar: ["solar charger"],
  compact: ["compact adapter"],
  pump: ["pump"],
  battery: ["battery", "solar charger"],
  display: ["display", "lcd", "dpst"],
  printer: ["printer"],
  keyboard: ["keypad", "keyboard", "dpst"],
  usb: ["usb", "pendrive", "dpst", "backpanel"],
  wifi: ["wifi", "gsm", "dpst", "analyzer", "mainboard"],
  sensor: ["analyzer", "mainboard", "sample", "sensor"],
  power: ["analyzer", "mainboard", "vibro", "ecod"],
  rtc: ["rtc", "dpst", "mainboard"],
  scale: ["scale", "weighing", "dpst", "analyzer"],
  cloud: ["cloud", "dpst", "mainboard"],
  sms: ["sms", "dpst", "mainboard"],
  rate: ["rate", "dpst"],
};

export function prefilterCandidates(
  allEntries: CatalogEntry[],
  userMessage: string,
  maxCandidates = 15,
): CatalogEntry[] {
  const lower = userMessage.toLowerCase();

  // Score each entry by keyword matches
  const scored = allEntries
    .filter((e) => {
      // Only troubleshooting entries (json or document_issue, not company/products)
      if (e.source === "company") return false;
      // Must have patterns or content to match against
      if (!e.patterns.length && !e.content) return false;
      return true;
    })
    .map((e) => {
      let score = 0;
      const hay = `${e.title} ${e.tag} ${e.patterns.join(" ")} ${e.content}`.toLowerCase();

      // Product keyword matching
      for (const [product, regex] of Object.entries(PRODUCT_KEYWORDS)) {
        if (regex.test(lower)) {
          const complaintWords = COMPLAINT_KEYWORDS[product] || [];
          if (complaintWords.some((w) => hay.includes(w))) {
            score += 8;
          }
        }
      }

      // Pattern matching (check if user message contains any training pattern)
      for (const pattern of e.patterns) {
        const patternLower = pattern.toLowerCase();
        if (patternLower.length > 4 && lower.includes(patternLower)) {
          score += 15; // Direct pattern substring match — very strong signal
        }
        // Partial pattern match (some words from pattern in user message)
        const patternWords = patternLower.split(/\s+/).filter((w) => w.length > 3);
        const matchCount = patternWords.filter((w) => lower.includes(w)).length;
        if (matchCount >= 2) score += matchCount * 3;
      }

      // Title/word overlap in content
      const msgWords = lower.split(/\s+/).filter((w) => w.length > 3);
      for (const word of msgWords) {
        if (hay.includes(word)) score += 1;
      }

      // Special keyword boosts
      if (/not working|nahi.*chal|not.*on|won'?t.*turn|dead|broken/i.test(lower)) score += 3;
      if (/error|problem|issue|fault|samasya|kharab/i.test(lower)) score += 2;
      if (/blank|not.*show|not.*display|dark/i.test(lower) && /display|lcd|screen/i.test(hay)) score += 5;
      if (/not.*print|print.*fail/i.test(lower) && /print/i.test(hay)) score += 5;
      if (/not.*detect|not.*found|detect/i.test(lower) && /detect/i.test(hay)) score += 5;

      return { e, score };
    })
    .filter((s) => s.score >= 4)
    .sort((a, b) => b.score - a.score);

  // Require complaint/hardware keywords in user query before building candidates
  const hasComplaintWords = /not|problem|error|issue|fault|broken|not working|not on|blank|fail|repair|fix|trouble|wrong|stuck|stop/i.test(lower);
  if (!hasComplaintWords && scored.length > 0 && scored[0].score < 8) {
    return [];
  }

  const result = scored
    .slice(0, maxCandidates)
    .map((s) => s.e);

  return result;
}

// ── Groq LLM Classifier ───────────────────────────────────────────────────────
// Uses a fast Groq model to semantically match the customer's message to the
// best troubleshooting entry from a pre-filtered candidate set.

const CLASSIFIER_PROMPT = (message: string, candidates: { id: string; title: string; patterns: string[]; content: string }[]) =>
  `You are a troubleshooting classifier for Poornasree Equipments (milk testing machines).

TASK: Match the customer's complaint to the most relevant troubleshooting entry.

CUSTOMER MESSAGE: "${message}"

CANDIDATE TROUBLESHOOTING ENTRIES:
${candidates.map((c, i) => `[${i}] ID="${c.id}" | Title="${c.title}" | Patterns: ${c.patterns.join(", ")} | Content: ${c.content.slice(0, 300)}`).join("\n\n")}

RULES:
1. Analyze the customer's message semantically — understand the INTENT even if the wording is different from the patterns.
2. Consider regional language mix (Hinglish, Tanglish, Manglish) — translate mentally to the underlying technical issue.
3. Pick the SINGLE best matching entry by index number [0-N].
4. If NONE match well, set matched=false.
5. Confidence: 100 = exact match, 80-99 = strong semantic match, 50-79 = plausible match, <50 = uncertain.

RESPONSE FORMAT (JSON only):
{
  "matched": true/false,
  "entryId": "the id of the matched entry or null",
  "index": <number from 0-N or -1>,
  "confidence": <0-100>,
  "reason": "brief explanation of why this entry matches the customer's complaint"
}`;

/**
 * Classify a customer message against a pre-filtered set of troubleshooting entries.
 * Uses Groq LLM for semantic understanding with a 3-second timeout.
 *
 * Returns the best matching CatalogEntry or null if no confident match.
 */
export async function classifyComplaint(
  userMessage: string,
  candidates: CatalogEntry[],
): Promise<{ entry: CatalogEntry | null; confidence: number }> {
  if (candidates.length === 0) {
    return { entry: null, confidence: 0 };
  }

  // Check cache first
  const key = cacheKey(userMessage, candidates.map((c) => c.id));
  const cached = classifierCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    if (cached.result.matched && cached.result.entryId) {
      const entry = candidates.find((c) => c.id === cached.result!.entryId);
      if (entry) return { entry, confidence: cached.result.confidence };
    }
    return { entry: null, confidence: cached.result.confidence };
  }



  // Build condensed candidate list for the LLM
  const condensed = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    patterns: c.patterns.slice(0, 6), // Limit patterns to reduce prompt size
    content: c.content.slice(0, 400), // First 400 chars of troubleshooting content
  }));

  try {
    const response = await groqChat(
      [
        {
          role: "system",
          content:
            "You are a JSON-only classification system. Always respond with valid JSON matching the specified format. Never add markdown, explanations, or text outside the JSON object.",
        },
        {
          role: "user",
          content: CLASSIFIER_PROMPT(userMessage, condensed),
        },
      ],
      {
        model: groqFastModel(), // Use fast model (llama-3.1-8b-instant) for classification
        temperature: 0.05,
        maxTokens: 200,
        timeoutMs: 4000,
      },
    );

    const result = parseClassifierResponse(response, candidates);

    // Cache the result
    classifierCache.set(key, {
      result,
      cachedAt: Date.now(),
    });

    if (result.matched && result.entryId) {
      const entry = candidates.find((c) => c.id === result.entryId);
      if (entry && result.confidence >= 50) {
        return { entry, confidence: result.confidence };
      }
    }

    return { entry: null, confidence: result.confidence };
  } catch (err) {
    // LLM classification failed — return null to fall through to LLM generation
    console.error("[classifier] LLM classification failed:", err);
    return { entry: null, confidence: 0 };
  }
}

function parseClassifierResponse(
  raw: string,
  candidates: CatalogEntry[],
): ClassifierResult {
  try {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.matched && parsed.index >= 0 && parsed.index < candidates.length) {
      return {
        matched: true,
        entryId: candidates[parsed.index].id,
        confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 50)),
        reason: parsed.reason,
      };
    }

    return {
      matched: false,
      entryId: null,
      confidence: parseInt(parsed.confidence) || 0,
      reason: parsed.reason,
    };
  } catch {
    // JSON parse failed — try to extract index from text
    const indexMatch = raw.match(/\[(\d+)\]/);
    if (indexMatch) {
      const idx = parseInt(indexMatch[1]);
      if (idx >= 0 && idx < candidates.length) {
        return {
          matched: true,
          entryId: candidates[idx].id,
          confidence: 40,
          reason: "extracted from non-JSON response",
        };
      }
    }
    return { matched: false, entryId: null, confidence: 0 };
  }
}

/**
 * Invalidate the classifier cache.
 * Call this after documents are re-uploaded/processed.
 */
export function invalidateClassifierCache(): void {
  classifierCache.clear();
}
