// ── Shared Groq LLM client ───────────────────────────────────────────────
// Used by WhatsApp agent, engineer Q&A, and training-video matching.

import { runtime } from "./runtime-config.service";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GroqRole = "system" | "user" | "assistant";

export type GroqMessage = {
  role: GroqRole;
  content: string;
};

export type GroqChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
};

export function isGroqConfigured(): boolean {
  return Boolean(runtime.groqApiKey()?.trim());
}

export function groqFastModel(): string {
  return runtime.groqModelFast();
}

export function groqAgentModel(): string {
  return runtime.groqModelAgent();
}

/**
 * Call Groq chat completions. Throws on HTTP / network errors.
 */
export async function groqChat(
  messages: GroqMessage[],
  options: GroqChatOptions = {},
): Promise<string> {
  if (!isGroqConfigured()) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const model = options.model ?? groqAgentModel();
  const temperature = options.temperature ?? 0.1;
  const maxTokens = options.maxTokens ?? runtime.groqMaxTokensReply();
  const timeoutMs = options.timeoutMs ?? 45_000;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.groqApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Groq API ${res.status}: ${errBody.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a JSON object from a Groq response (tolerates markdown fences).
 */
export function parseGroqJson<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
