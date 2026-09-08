// ── Shared Groq LLM client ───────────────────────────────────────────────
// Used by WhatsApp agent, engineer Q&A, and training-video matching.

import { runtime } from "./runtime-config.service";
import prisma from "../lib/prisma";

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
  feature?: string;
  callerPhone?: string;
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

const BACKUP_GROQ_MODELS = [
  "qwen/qwen3.8-27b",
  "groq/compound-mini",
  "openai/gpt-oss-20b",
];

/**
 * Call Groq chat completions with automatic candidate model failover.
 */
export async function groqChat(
  messages: GroqMessage[],
  options: GroqChatOptions = {},
): Promise<string> {
  if (!isGroqConfigured()) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const primaryModel = options.model ?? groqAgentModel();
  const candidateModels = Array.from(new Set([primaryModel, ...BACKUP_GROQ_MODELS]));
  const temperature = options.temperature ?? 0.1;
  const maxTokens = options.maxTokens ?? 4000;
  const timeoutMs = options.timeoutMs ?? 15_000;

  let lastError: Error | null = null;

  for (const model of candidateModels) {
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
    const startTime = Date.now();

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
        console.warn(`[groq] Model ${model} returned ${res.status}: ${errBody.slice(0, 150)}. Trying next candidate...`);
        lastError = new Error(`Groq API ${res.status}: ${errBody.slice(0, 400)}`);
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const durationMs = Date.now() - startTime;

      // Asynchronously log token usage telemetry without delaying the response
      if (data.usage) {
        prisma.llmUsageLog.create({
          data: {
            provider: "groq",
            model,
            feature: options.feature || "general",
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
            durationMs,
            callerPhone: options.callerPhone ?? null,
          },
        }).catch((logErr) => {
          console.warn("[groq] Failed to record token usage log:", logErr?.message || logErr);
        });
      }

      const content = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (content) return content;
    } catch (err) {
      console.warn(`[groq] Model ${model} fetch failed: ${(err as Error).message}. Trying next candidate...`);
      lastError = err as Error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Failed to get completion from Groq API");
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

  const startTime = Date.now();

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

  const durationMs = Date.now() - startTime;

  // Asynchronously record STT call
  prisma.llmUsageLog.create({
    data: {
      provider: "groq",
      model: "whisper-large-v3-turbo",
      feature: "whisper_stt",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs,
    },
  }).catch(() => {});

  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? "";
}

