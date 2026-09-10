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
  const result = await transcribeAudioDetailed(audioBuffer, fileName);
  return result.text;
}

export type GroqAudioDetails = {
  text: string;
  language?: string;
  duration?: number;
};

/**
 * Transcribes audio and returns language detection and duration telemetry using verbose_json format.
 */
export async function transcribeAudioDetailed(
  audioBuffer: Buffer,
  fileName = "voicenote.ogg",
): Promise<GroqAudioDetails> {
  if (!isGroqConfigured()) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const formData = new FormData();
  const blob = new Blob([audioBuffer as any], { type: "audio/ogg" });
  formData.append("file", blob, fileName);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "verbose_json");
  formData.append(
    "prompt",
    "Poornasree Equipments dairy milk analyzer, LactoSure Eco, LactoGrand, Vibro stirrer, AMCU, T1, T2 error, machine troubleshooting, service support, ticket status, product catalog.",
  );

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

  const data = (await res.json()) as {
    text?: string;
    language?: string;
    duration?: number;
  };

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

  return {
    text: data.text?.trim() ?? "",
    language: data.language?.toLowerCase()?.trim(),
    duration: data.duration,
  };
}

/**
 * Translate non-English audio directly to English ("bot language") using Groq Audio Translation endpoint.
 */
export async function translateAudioWithGroq(
  audioBuffer: Buffer,
  fileName = "voicenote.ogg",
): Promise<string> {
  if (!isGroqConfigured()) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const formData = new FormData();
  const blob = new Blob([audioBuffer as any], { type: "audio/ogg" });
  formData.append("file", blob, fileName);
  formData.append("model", "whisper-large-v3");
  formData.append(
    "prompt",
    "Poornasree Equipments dairy milk analyzer, LactoSure Eco, LactoGrand, Vibro stirrer, AMCU, T1, T2 error, machine troubleshooting, service support, ticket status, product catalog.",
  );

  const startTime = Date.now();

  const res = await fetch("https://api.groq.com/openai/v1/audio/translations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.groqApiKey()}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq Audio Translation API ${res.status}: ${errText.slice(0, 400)}`);
  }

  const durationMs = Date.now() - startTime;

  const data = (await res.json()) as { text?: string };

  prisma.llmUsageLog.create({
    data: {
      provider: "groq",
      model: "whisper-large-v3",
      feature: "whisper_translation",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs,
    },
  }).catch(() => {});

  return data.text?.trim() ?? "";
}

const LANG_CODE_MAP: Record<string, string> = {
  english: "en",
  en: "en",
  malayalam: "ml",
  ml: "ml",
  hindi: "hi",
  hi: "hi",
  tamil: "ta",
  ta: "ta",
  telugu: "te",
  te: "te",
  kannada: "kn",
  kn: "kn",
  marathi: "mr",
  mr: "mr",
  bengali: "bn",
  bn: "bn",
};

export type ProcessedVoiceNote = {
  transcript: string;
  englishQuery: string;
  detectedLangCode: string;
  durationSeconds?: number;
};

/**
 * End-to-end voice note processor:
 * 1. Transcribes spoken speech (Malayalam, Hindi, Tamil, Telugu, English, etc.)
 * 2. Identifies spoken language code
 * 3. Translates to clean English ("bot language") for semantic routing, error matching, and catalog lookup
 */
export async function processVoiceNoteWithGroq(
  audioBuffer: Buffer,
  fileName = "voicenote.ogg",
): Promise<ProcessedVoiceNote> {
  // Run transcription and audio translation in parallel for maximum speed and accuracy
  const [detailed, translatedRaw] = await Promise.all([
    transcribeAudioDetailed(audioBuffer, fileName).catch((err) => {
      console.warn("[groq] transcribeAudioDetailed failed:", err);
      return { text: "", language: "en", duration: 0 };
    }),
    translateAudioWithGroq(audioBuffer, fileName).catch((err) => {
      console.warn("[groq] translateAudioWithGroq failed:", err);
      return "";
    }),
  ]);

  const transcript = detailed.text || "";
  let rawLang = detailed.language || "english";
  // Whisper frequently hallucinates "icelandic" when hearing Malayalam Dravidian phonetics
  if (rawLang.toLowerCase() === "icelandic") {
    rawLang = "malayalam";
  }

  const detectedLangCode = LANG_CODE_MAP[rawLang] || (rawLang.length === 2 ? rawLang : "en");

  // Determine clean English query:
  // Whisper's /audio/translations endpoint directly translates any language into clear, natural English
  const translated = (translatedRaw || "").trim();
  const isCleanEnglish = Boolean(translated && !/[^\u0000-\u007F]/.test(translated) && translated.length > 0);

  let englishQuery = isCleanEnglish ? translated : transcript;

  // If translateAudioWithGroq failed or returned non-English, but transcript has text, use LLM translation
  if (!isCleanEnglish && transcript) {
    try {
      const llmPrompt = `Translate the following user audio transcript into clear, natural English for a technical and product support bot.
Output ONLY the English translation without quotes, preamble, or notes. Preserve technical terms like model names, error codes (e.g. T1, T2, T3, Vibro, Analyzer, LactoSure).

Transcript:
${transcript}`;

      const llmTrans = await groqChat(
        [{ role: "user", content: llmPrompt }],
        { temperature: 0.1, maxTokens: 300, feature: "audio_text_translation" },
      ).catch(() => "");

      if (llmTrans && llmTrans.trim()) {
        englishQuery = llmTrans.trim();
      }
    } catch (err) {
      console.warn("[groq] Audio LLM translation fallback failed:", (err as Error).message);
    }
  }

  // If transcript itself is empty or garbled, use englishQuery as the transcript
  const finalTranscript = transcript || englishQuery;

  return {
    transcript: finalTranscript,
    englishQuery: englishQuery || finalTranscript,
    detectedLangCode,
    durationSeconds: detailed.duration,
  };
}

