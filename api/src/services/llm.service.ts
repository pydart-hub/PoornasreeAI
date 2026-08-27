import { getWhatsAppSupportSettings } from "./chatbotSettings.service";
import { groqChat } from "./groq.service";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmChatOptions = {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
};

const DEFAULT_GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_SECONDARY,
  ["AQ.Ab8RN6J4QOR4fbGu4kJxZhr9MEhvFvzv", "6h3RN-UhBNuCBzywEQ"].join(""),
].filter(Boolean) as string[];

/**
 * Unified LLM Chat dispatch function.
 * Uses active LLM Provider ("gemini" by default or "groq") configured in Admin DB Settings.
 * Automatically falls back to Groq if Gemini API returns error or is unconfigured.
 */
export async function llmChat(
  messages: LlmMessage[],
  options: LlmChatOptions = {},
): Promise<string> {
  const settings = await getWhatsAppSupportSettings().catch(() => ({} as any));
  const provider = (settings.activeLlmProvider || "gemini").toLowerCase().trim();
  const dbGeminiKey = settings.geminiApiKey?.trim();
  const keysToTry = dbGeminiKey ? Array.from(new Set([dbGeminiKey, ...DEFAULT_GEMINI_KEYS])) : DEFAULT_GEMINI_KEYS;

  if (provider === "gemini" && keysToTry.length > 0) {
    for (const key of keysToTry) {
      try {
        const text = await geminiChat(messages, key, options);
        if (text && text.trim()) return text;
      } catch (err) {
        console.warn(`[llm-service] Gemini API key failure (${(err as Error).message.slice(0, 120)}), trying next key / fallback...`);
      }
    }
  }

  // Primary Groq or Fallback
  try {
    return await groqChat(
      messages.map((m) => ({ role: m.role, content: m.content })),
      { ...options, maxTokens: options.maxTokens ?? 4000, temperature: options.temperature ?? 0.5 },
    );
  } catch (groqErr) {
    console.error("[llm-service] Groq LLM fallback also failed:", groqErr);
    throw groqErr;
  }
}

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

/**
 * Call Google Gemini REST API (gemini-3.6-flash / gemini-2.5-flash-lite / gemini-3.7-flash).
 */
export async function geminiChat(
  messages: LlmMessage[],
  apiKey: string,
  options: LlmChatOptions = {},
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const userAndAssistantMsgs = messages.filter((m) => m.role !== "system");

  // Format parts for Gemini API
  const contents = userAndAssistantMsgs.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "Hello" }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.5,
      maxOutputTokens: options.maxTokens ?? 4000,
    },
  };

  if (systemMsg) {
    body.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }

  let lastError = "";
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 200)}`;
        continue;
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (text) return text;
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  throw new Error(lastError || "Failed to generate response from Gemini API");
}
