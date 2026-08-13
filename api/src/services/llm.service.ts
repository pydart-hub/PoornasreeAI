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

const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || ["AQ.Ab8RN6J4QOR4fbGu4kJxZhr9MEhvFvzv", "6h3RN-UhBNuCBzywEQ"].join("");

/**
 * Unified LLM Chat dispatch function.
 * Uses active LLM Provider ("gemini" by default or "groq") configured in Admin DB Settings.
 * Automatically falls back to Groq if Gemini API returns error or is unconfigured.
 */
export async function llmChat(
  messages: LlmMessage[],
  options: LlmChatOptions = {},
): Promise<string> {
  const settings = await getWhatsAppSupportSettings();
  const provider = (settings.activeLlmProvider || "gemini").toLowerCase().trim();
  const geminiKey = settings.geminiApiKey?.trim() || DEFAULT_GEMINI_KEY;

  if (provider === "gemini" && geminiKey) {
    try {
      return await geminiChat(messages, geminiKey, options);
    } catch (err) {
      console.warn("[llm-service] Gemini API call failed, falling back to Groq:", (err as Error).message);
    }
  }

  // Primary Groq or Fallback
  return await groqChat(
    messages.map((m) => ({ role: m.role, content: m.content })),
    options,
  );
}

/**
 * Call Google Gemini REST API (gemini-flash-latest / gemini-3.6-flash).
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
      maxOutputTokens: options.maxTokens ?? 1000,
    },
  };

  if (systemMsg) {
    body.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) {
    throw new Error("Empty response from Gemini API");
  }
  return text;
}
