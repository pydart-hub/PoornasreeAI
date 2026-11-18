import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";
import { getWhatsAppSupportSettings } from "./chatbotSettings.service";

export interface ProductVisionResult {
  name?: string;
  category: "lactosure" | "lactogrand" | "other";
  detail: string;
  keySpecs: string[];
}

const VISION_SYSTEM_PROMPT = `You are a principal dairy equipment engineer at Poornasree Equipments (an ISO-certified dairy automation manufacturer in Kerala, India).

Analyze the attached product image (photograph, nameplate, brochure, or label) with technical accuracy:
1. IDENTIFY THE MACHINE:
   - Read all visible text, model numbers, brand names, serial badges, screen readings, and chassis labels.
   - Detect known Poornasree product lines:
     * LactoSure series (e.g. ECO D-V4, ECO V3, ECO S, ECO V, ECO SV, S-Pro, Lite, SD, etc.)
     * LactoGrand series (e.g. Grand, Grand SD, etc.)
     * Other Dairy Automation (e.g. Vibro Ultrasonic Milk Stirrer, Data Processing Unit / DPU / DPS-T, AMCU, External Display EXD, Mainboards, Solar Chargers).
   - CRITICAL DOMAIN GUARDRAIL:
     Poornasree Equipments manufactures Ultrasonic Milk Analyzers (instruments measuring milk parameters: FAT, SNF, Added Water, Density, Temperature, Protein, Lactose), ultrasonic stirrers, and DPUs.
     Poornasree Equipments DOES NOT manufacture milk separators, cream separators, or centrifugal machines.
     NEVER identify or describe this machine as a milk separator or cream separator under any circumstance!

2. COMPOSE A FACTUAL, PROFESSIONAL DESCRIPTION:
   - Provide 2 to 3 concise, fact-based sentences describing what the equipment actually does, its measurement capabilities or purpose, operational speed, and industrial durability for dairy collection centers and cooperatives.
   - Include key technical specifications formatted with standard dashes (-).

3. STRICT FORMATTING & EMOJI RULES:
   - ABSOLUTELY ZERO DECORATIVE EMOJIS! (NO 🌿, ✨, 🚀, 🥛, 📦, 💡, etc.). Decorative emojis are strictly forbidden in product technical descriptions.
   - Keep the tone professional, objective, and B2B industrial.

Return ONLY a valid JSON object matching this schema (no surrounding markdown code fences, no extra text):
{
  "name": "Detected model name (e.g. LactoSure ECO D-V4)",
  "category": "lactosure",
  "detail": "Accurate 2-3 sentence technical description.\\n- Parameter 1: ...\\n- Parameter 2: ...",
  "keySpecs": ["FAT: 0.5% - 15%", "SNF: 3% - 15%", "Measuring Time: 30 sec"]
}`;

const GEMINI_VISION_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

const GROQ_VISION_MODELS = [
  "llama-3.2-11b-vision-preview",
  "llama-3.2-90b-vision-preview",
];

/**
 * Clean unwanted emojis from text
 */
export function sanitizeProductText(text: string): string {
  if (!text) return "";
  // Strip common marketing and decorative emojis (🌿, ✨, 🚀, 🥛, 📦, 🎉, etc.) while preserving standard characters
  return text
    .replace(/[\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/[✨🌿🚀🥛📦💡🎉🔥⭐]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Call Gemini Vision REST API
 */
async function callGeminiVision(
  base64Data: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "image/jpeg",
              data: base64Data,
            },
          },
          {
            text: VISION_SYSTEM_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2500,
      responseMimeType: "application/json",
    },
  };

  let lastError = "";
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 160)}`;
        continue;
      }

      const data = (await res.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (text) return text;
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  throw new Error(lastError || "Gemini vision failed");
}

/**
 * Call Groq Vision API as fallback
 */
async function callGroqVision(
  base64Data: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64Data}`;

  let lastError = "";
  for (const model of GROQ_VISION_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: VISION_SYSTEM_PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `Groq ${model} HTTP ${res.status}: ${errText.slice(0, 160)}`;
        continue;
      }

      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) return text;
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  throw new Error(lastError || "Groq vision failed");
}

/**
 * Format raw detail text and specifications into clean WhatsApp text with bullets
 */
export function formatProductDetailForDisplay(detailRaw: string, keySpecs?: string[]): string {
  if (!detailRaw) return "";
  let text = detailRaw.trim();

  // If text is wrapped in or contains raw JSON
  if (text.startsWith("{") || (text.includes('"name":') && text.includes('"detail":'))) {
    try {
      const cleanJson = text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleanJson);
      const mainDetail = String(parsed.detail || parsed.description || "").trim();
      const specs = Array.isArray(parsed.keySpecs) ? parsed.keySpecs : (keySpecs || []);
      return buildWhatsAppProductText(mainDetail, specs);
    } catch {
      // Robust regex extraction if JSON was truncated
      const detailMatch = text.match(/"detail"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      let extractedDetail = "";
      if (detailMatch && detailMatch[1]) {
        try {
          extractedDetail = JSON.parse(`"${detailMatch[1]}"`);
        } catch {
          extractedDetail = detailMatch[1];
        }
      }

      // Extract any specs found before truncation
      const specsMatch = text.match(/"keySpecs"\s*:\s*\[([\s\S]*?)(\]|$)/);
      const extractedSpecs: string[] = [];
      if (specsMatch && specsMatch[1]) {
        const itemMatches = specsMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g);
        for (const m of itemMatches) {
          if (m[1]) extractedSpecs.push(m[1].trim());
        }
      }

      if (extractedDetail) {
        return buildWhatsAppProductText(extractedDetail, extractedSpecs.length > 0 ? extractedSpecs : keySpecs);
      }
    }
  }

  return buildWhatsAppProductText(text, keySpecs);
}

function buildWhatsAppProductText(mainText: string, specs?: string[]): string {
  let cleaned = sanitizeProductText(mainText);
  // Convert any markdown bullet lines like "- Measuring Time: 25s" to "• Measuring Time: 25s"
  cleaned = cleaned.replace(/^[\-\*]\s+/gm, "• ");

  const validSpecs = (specs || [])
    .map(s => sanitizeProductText(String(s)).replace(/^[\-\*•]\s*/, "").trim())
    .filter(Boolean);

  if (validSpecs.length > 0 && !cleaned.toLowerCase().includes("key specifications") && !cleaned.toLowerCase().includes("specifications:")) {
    cleaned += `\n\n*Key Specifications:*\n` + validSpecs.map(s => `• ${s}`).join("\n");
  }

  return cleaned.trim();
}

/**
 * Parse JSON safely from LLM output (handles occasional code fences and truncation)
 */
function parseVisionJson(rawOutput: string): ProductVisionResult {
  let cleaned = rawOutput.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    const categoryRaw = String(parsed.category || "other").toLowerCase();
    const category: "lactosure" | "lactogrand" | "other" =
      categoryRaw.includes("lactogrand")
        ? "lactogrand"
        : categoryRaw.includes("lactosure") || categoryRaw.includes("eco")
        ? "lactosure"
        : "other";

    const keySpecs: string[] = Array.isArray(parsed.keySpecs)
      ? parsed.keySpecs.map((s: any) => sanitizeProductText(String(s))).filter(Boolean)
      : [];

    const detail = formatProductDetailForDisplay(parsed.detail || parsed.description || "", keySpecs);

    return {
      name: parsed.name ? sanitizeProductText(String(parsed.name)) : undefined,
      category,
      detail,
      keySpecs,
    };
  } catch {
    // If not strict JSON (e.g. truncated), format through resilient extractor
    const formatted = formatProductDetailForDisplay(cleaned);
    return {
      category: "lactosure",
      detail: formatted,
      keySpecs: [],
    };
  }
}

/**
 * Scan and analyze product image buffer
 */
export async function analyzeProductImageBuffer(
  buffer: Buffer,
  mimeType: string = "image/jpeg",
): Promise<ProductVisionResult> {
  const base64 = buffer.toString("base64");
  const settings = await getWhatsAppSupportSettings().catch(() => ({} as any));
  const geminiKey = settings?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;
  const groqKey = process.env.GROQ_API_KEY;

  let rawOutput = "";

  // 1. Try Gemini Vision first (industry-leading multimodal OCR)
  if (geminiKey) {
    try {
      rawOutput = await callGeminiVision(base64, mimeType, geminiKey);
    } catch (err) {
      console.warn(`[product-vision] Gemini vision attempt failed (${(err as Error).message.slice(0, 100)}), falling back...`);
    }
  }

  // 2. Dual-LLM Failover to Groq Vision
  if (!rawOutput && groqKey) {
    try {
      rawOutput = await callGroqVision(base64, mimeType, groqKey);
    } catch (err) {
      console.warn(`[product-vision] Groq vision attempt failed: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  if (!rawOutput) {
    throw new Error("Unable to analyze product image: No vision AI provider succeeded.");
  }

  return parseVisionJson(rawOutput);
}

/**
 * Resolve local or remote image path to a Buffer
 */
export async function resolveImageBuffer(imagePathOrUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (imagePathOrUrl.startsWith("http://") || imagePathOrUrl.startsWith("https://")) {
    const res = await fetch(imagePathOrUrl);
    if (!res.ok) throw new Error(`Failed to fetch image URL: HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/jpeg";
    return { buffer: Buffer.from(arrayBuf), mimeType: mime };
  }

  // Local filesystem lookup
  const cleanPath = imagePathOrUrl.replace(/^\/+/, "");
  const candidates = [
    path.resolve(cleanPath),
    path.resolve(__dirname, "../../", cleanPath),
    path.resolve(__dirname, "../../uploads", path.basename(cleanPath)),
    path.resolve(__dirname, "../../../", cleanPath),
    path.resolve(__dirname, "../../../public", cleanPath),
    path.resolve(__dirname, "../../../public/images", path.basename(cleanPath)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = path.extname(candidate).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      return { buffer: fs.readFileSync(candidate), mimeType: mime };
    }
  }

  throw new Error(`Product image file not found on disk: ${imagePathOrUrl}`);
}

/**
 * Scan and analyze product image file from local path or URL
 */
export async function analyzeProductImageFile(imagePathOrUrl: string): Promise<ProductVisionResult> {
  const { buffer, mimeType } = await resolveImageBuffer(imagePathOrUrl);
  return analyzeProductImageBuffer(buffer, mimeType);
}
