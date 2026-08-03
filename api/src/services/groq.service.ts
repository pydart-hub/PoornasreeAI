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
 * Transcribe an audio file buffer (e.g. WhatsApp .ogg voice note) using Groq Whisper API.
 * Supports Malayalam, Hindi, Tamil, Telugu, English, and 90+ languages.
 */
export async function transcribeAudioWithGroq(
  audioBuffer: Buffer,
  fileName = "voicenote.ogg",
): Promise<string> {
  if (!isGroqConfigured()) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const formData = new FormData();
  const blob = new Blob([audioBuffer as any], { type: "audio/ogg" });
  formData.append("file", blob, fileName);
  formData.append("model", "whisper-large-v3-turbo");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.groqApiKey()}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq Whisper API ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? "";
}
