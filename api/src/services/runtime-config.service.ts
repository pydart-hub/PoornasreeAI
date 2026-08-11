// ── Runtime config (DB-backed, env fallback) ─────────────────────────────
// Super-admin dashboard writes keys here. App code reads via `cfg(...)`.
// Boot-critical secrets (DATABASE_URL, JWT_SECRET) stay in process.env only.

import crypto from "crypto";
import prisma from "../lib/prisma";
import { env } from "../config/env";

export type ConfigCategory =
  | "groq"
  | "whatsapp"
  | "chatbot"
  | "integrations"
  | "general";

export type ConfigKey =
  | "GROQ_API_KEY"
  | "GROQ_MODEL_FAST"
  | "GROQ_MODEL_AGENT"
  | "GROQ_MAX_TOKENS_REPLY"
  | "CHATBOT_MODE"
  | "WA_PHONE_NUMBER_ID"
  | "WA_ACCESS_TOKEN"
  | "WA_VERIFY_TOKEN"
  | "WA_ENGINEER_SETUP_TEMPLATE"
  | "WA_ENGINEER_SETUP_TEMPLATE_LANG"
  | "WA_ENGINEER_TICKET_TEMPLATE"
  | "WA_ENGINEER_TICKET_TEMPLATE_LANG"
  | "FRONTEND_URL"
  | "INTEGRATION_WEBHOOK_URL"
  | "HR_ENGINEERS_URL"
  | "HR_SYNC_MANAGER_ID"
  | "PUBLIC_OTP_SECRET"
  | "OLLAMA_URL"
  | "QDRANT_URL"
  | "WA_BUSINESS_ACCOUNT_ID"
  | "DEALER_DEFAULT_PASSWORD";

export type SettingDefinition = {
  key: ConfigKey;
  label: string;
  description: string;
  category: ConfigCategory;
  isSecret: boolean;
  defaultValue: string;
  options?: string[];
};

/** Canonical list shown in the Super Admin UI and used for validation. */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: "GROQ_API_KEY",
    label: "Groq API Key",
    description: "Required for conversational WhatsApp agent and training video matching.",
    category: "groq",
    isSecret: true,
    defaultValue: "",
  },
  {
    key: "CHATBOT_MODE",
    label: "Chatbot Mode",
    description: "groq = human training-grounded agent; legacy_fsm = classic menu bot.",
    category: "chatbot",
    isSecret: false,
    defaultValue: "groq",
    options: ["legacy_fsm", "groq"],
  },
  {
    key: "GROQ_MODEL_FAST",
    label: "Groq Fast Model",
    description: "Used for catalog matching / JSON selection.",
    category: "groq",
    isSecret: false,
    defaultValue: "llama-3.1-8b-instant",
  },
  {
    key: "GROQ_MODEL_AGENT",
    label: "Groq Agent Model",
    description: "Used for natural WhatsApp replies.",
    category: "groq",
    isSecret: false,
    defaultValue: "llama-3.3-70b-versatile",
  },
  {
    key: "GROQ_MAX_TOKENS_REPLY",
    label: "Groq Max Reply Tokens",
    description: "Max tokens for Stage-2 agent replies.",
    category: "groq",
    isSecret: false,
    defaultValue: "600",
  },
  {
    key: "WA_PHONE_NUMBER_ID",
    label: "WhatsApp Phone Number ID",
    description: "Meta Cloud API phone number ID.",
    category: "whatsapp",
    isSecret: false,
    defaultValue: "",
  },
  {
    key: "WA_ACCESS_TOKEN",
    label: "WhatsApp Access Token",
    description: "Meta permanent / system-user access token.",
    category: "whatsapp",
    isSecret: true,
    defaultValue: "",
  },
  {
    key: "WA_VERIFY_TOKEN",
    label: "WhatsApp Verify Token",
    description: "Token Meta sends during webhook verification.",
    category: "whatsapp",
    isSecret: true,
    defaultValue: "",
  },
  {
    key: "WA_ENGINEER_SETUP_TEMPLATE",
    label: "Engineer Setup Template",
    description: "Approved Meta template name for engineer onboarding.",
    category: "whatsapp",
    isSecret: false,
    defaultValue: "",
  },
  {
    key: "WA_ENGINEER_SETUP_TEMPLATE_LANG",
    label: "Engineer Setup Template Lang",
    description: "Language code for the setup template (e.g. en).",
    category: "whatsapp",
    isSecret: false,
    defaultValue: "en",
  },
  {
    key: "WA_ENGINEER_TICKET_TEMPLATE",
    label: "Engineer Ticket Template",
    description: "Approved Meta template when a ticket is assigned.",
    category: "whatsapp",
    isSecret: false,
    defaultValue: "",
  },
  {
    key: "WA_ENGINEER_TICKET_TEMPLATE_LANG",
    label: "Engineer Ticket Template Lang",
    description: "Language code for the ticket-assigned template.",
    category: "whatsapp",
    isSecret: false,
    defaultValue: "en",
  },
  {
    key: "FRONTEND_URL",
    label: "Frontend URL",
    description: "Public web URL used in WhatsApp links (set-password, etc.).",
    category: "general",
    isSecret: false,
    defaultValue: "https://ai.poornasreecloud.com",
  },
  {
    key: "INTEGRATION_WEBHOOK_URL",
    label: "Integration Webhook URL",
    description: "Optional n8n / external webhook for ticket lifecycle events.",
    category: "integrations",
    isSecret: false,
    defaultValue: "",
  },
  {
    key: "HR_ENGINEERS_URL",
    label: "HR Engineers URL",
    description: "External HR API for engineer roster sync.",
    category: "integrations",
    isSecret: false,
    defaultValue: "http://145.223.18.143/hr_api_v2/public/engineers",
  },
  {
    key: "HR_SYNC_MANAGER_ID",
    label: "HR Sync Manager ID",
    description: "UUID of the service_manager who owns HR-synced engineers.",
    category: "integrations",
    isSecret: false,
    defaultValue: "",
  },
  {
    key: "PUBLIC_OTP_SECRET",
    label: "Public OTP Secret",
    description: "X-OTP-Secret header value for public OTP endpoint. Empty disables it.",
    category: "integrations",
    isSecret: true,
    defaultValue: "",
  },
  {
    key: "OLLAMA_URL",
    label: "Ollama URL",
    description: "Local Ollama base URL (embeddings / legacy RAG).",
    category: "general",
    isSecret: false,
    defaultValue: "http://ollama:11434",
  },
  {
    key: "QDRANT_URL",
    label: "Qdrant URL",
    description: "Vector database URL.",
    category: "general",
    isSecret: false,
    defaultValue: "http://qdrant:6333",
  },
  {
    key: "WA_BUSINESS_ACCOUNT_ID",
    label: "WhatsApp Business Account ID",
    description: "Meta WhatsApp Business Account ID (WABA).",
    category: "whatsapp",
    isSecret: false,
    defaultValue: "",
  },
  {
    key: "DEALER_DEFAULT_PASSWORD",
    label: "Dealer Default Password",
    description: "Default password assigned when importing dealers from Excel.",
    category: "general",
    isSecret: true,
    defaultValue: "Dealer@2026",
  },
];

const DEF_BY_KEY = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

/** In-memory resolved values (plain text). */
const cache = new Map<ConfigKey, string>();
let loaded = false;

function encryptionKey(): Buffer {
  // Derive a stable 32-byte key from JWT_SECRET (boot env only).
  return crypto.createHash("sha256").update(`poornasree-settings:${env.JWT_SECRET}`).digest();
}

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

function decryptSecret(stored: string): string {
  if (!stored.startsWith("enc:v1:")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 5) return "";
  const [, , ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function envFallback(key: ConfigKey): string {
  const def = DEF_BY_KEY.get(key);
  const fromEnv = process.env[key];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  return def?.defaultValue ?? "";
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••••••${value.slice(-4)}`;
}

/** Resolve one key: cache → DB (via cache) → env → default. */
export function cfg(key: ConfigKey): string {
  if (cache.has(key)) return cache.get(key)!;
  return envFallback(key);
}

export function isRuntimeConfigLoaded(): boolean {
  return loaded;
}

/** Ensure SystemSetting table exists (deploy may skip prisma migrate). */
async function ensureSystemSettingsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemSetting" (
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "isSecret" BOOLEAN NOT NULL DEFAULT false,
      "label" TEXT,
      "description" TEXT,
      "category" TEXT NOT NULL DEFAULT 'general',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedBy" TEXT,
      CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
    );
  `);
}

/**
 * Copy current process.env values into SystemSetting for any key not yet stored.
 * Does not overwrite existing DB rows. Safe to run on every startup.
 */
export async function importEnvIntoSystemSettings(updatedBy = "env-import"): Promise<number> {
  await ensureSystemSettingsTable();
  const existing = await prisma.systemSetting.findMany({ select: { key: true } });
  const have = new Set(existing.map((r) => r.key));
  let imported = 0;

  for (const def of SETTING_DEFINITIONS) {
    if (have.has(def.key)) continue;
    const fromEnv = process.env[def.key];
    if (fromEnv === undefined || fromEnv === "") continue;

    const storedValue = def.isSecret ? encryptSecret(fromEnv) : fromEnv;
    await prisma.systemSetting.create({
      data: {
        key: def.key,
        value: storedValue,
        isSecret: def.isSecret,
        label: def.label,
        description: def.description,
        category: def.category,
        updatedBy,
      },
    });
    cache.set(def.key, fromEnv);
    imported += 1;
  }

  if (imported > 0) {
    console.log(`[runtime-config] Imported ${imported} key(s) from environment into SystemSetting`);
  }
  return imported;
}

/** Force-refresh DB from env for all defined keys that have a non-empty env value. */
export async function syncEnvOverSystemSettings(updatedBy = "env-sync"): Promise<number> {
  await ensureSystemSettingsTable();
  let updated = 0;

  for (const def of SETTING_DEFINITIONS) {
    const fromEnv = process.env[def.key];
    if (fromEnv === undefined || fromEnv === "") continue;

    const storedValue = def.isSecret ? encryptSecret(fromEnv) : fromEnv;
    await prisma.systemSetting.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        value: storedValue,
        isSecret: def.isSecret,
        label: def.label,
        description: def.description,
        category: def.category,
        updatedBy,
      },
      update: {
        value: storedValue,
        isSecret: def.isSecret,
        label: def.label,
        description: def.description,
        category: def.category,
        updatedBy,
      },
    });
    cache.set(def.key, fromEnv);
    updated += 1;
  }

  console.log(`[runtime-config] Synced ${updated} key(s) from environment → SystemSetting`);
  return updated;
}

/** Load all settings from DB into memory. Safe to call repeatedly. */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    await ensureSystemSettingsTable();
    // First boot / after deploy: persist currently used env keys into the dashboard.
    await importEnvIntoSystemSettings();

    const rows = await prisma.systemSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));

    for (const def of SETTING_DEFINITIONS) {
      const row = byKey.get(def.key);
      if (row) {
        const plain = row.isSecret ? decryptSecret(row.value) : row.value;
        cache.set(def.key, plain);
      } else {
        cache.set(def.key, envFallback(def.key));
      }
    }
    loaded = true;
    console.log(`[runtime-config] Loaded ${SETTING_DEFINITIONS.length} keys (DB overrides: ${rows.length})`);
  } catch (err) {
    console.error("[runtime-config] Failed to load from DB — using env fallbacks:", err);
    for (const def of SETTING_DEFINITIONS) {
      cache.set(def.key, envFallback(def.key));
    }
    loaded = true;
  }
}

export type PublicSettingRow = {
  key: ConfigKey;
  label: string;
  description: string;
  category: ConfigCategory;
  isSecret: boolean;
  options?: string[];
  /** Masked for secrets; full value for non-secrets. */
  value: string;
  /** Whether a non-empty value is configured (DB or env). */
  isSet: boolean;
  /** true if a DB row exists (vs env-only fallback). */
  storedInDb: boolean;
  updatedAt: string | null;
};

/** Safe payload for the Super Admin UI (secrets masked). */
export async function listSettingsForAdmin(): Promise<PublicSettingRow[]> {
  if (!loaded) await loadRuntimeConfig();

  const rows = await prisma.systemSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return SETTING_DEFINITIONS.map((def) => {
    const plain = cfg(def.key);
    const row = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      category: def.category,
      isSecret: def.isSecret,
      options: def.options,
      value: def.isSecret ? maskSecret(plain) : plain,
      isSet: Boolean(plain),
      storedInDb: Boolean(row),
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });
}

export type SettingUpdate = { key: string; value: string };

/**
 * Upsert settings from Super Admin.
 * Empty string on a secret means "leave unchanged" (unless clearSecret=true).
 */
export async function updateSettings(
  updates: SettingUpdate[],
  updatedBy: string,
  opts?: { clearSecrets?: string[] },
): Promise<PublicSettingRow[]> {
  const clearSet = new Set(opts?.clearSecrets ?? []);

  for (const u of updates) {
    const def = DEF_BY_KEY.get(u.key as ConfigKey);
    if (!def) continue;

    let next = String(u.value ?? "");

    if (def.options && next && !def.options.includes(next)) {
      throw Object.assign(new Error(`Invalid value for ${def.key}`), { status: 400 });
    }

    if (def.isSecret) {
      // Keep existing if UI sent masked / empty and not explicitly clearing
      if (clearSet.has(def.key)) {
        next = "";
      } else if (!next || next.includes("••••")) {
        continue;
      }
    }

    const storedValue = def.isSecret && next ? encryptSecret(next) : next;

    await prisma.systemSetting.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        value: storedValue,
        isSecret: def.isSecret,
        label: def.label,
        description: def.description,
        category: def.category,
        updatedBy,
      },
      update: {
        value: storedValue,
        isSecret: def.isSecret,
        label: def.label,
        description: def.description,
        category: def.category,
        updatedBy,
      },
    });

    cache.set(def.key, next);
  }

  return listSettingsForAdmin();
}

/** Convenience typed getters used across the app. */
export const runtime = {
  groqApiKey: () => cfg("GROQ_API_KEY"),
  groqModelFast: () => cfg("GROQ_MODEL_FAST") || "llama-3.1-8b-instant",
  groqModelAgent: () => cfg("GROQ_MODEL_AGENT") || "llama-3.3-70b-versatile",
  groqMaxTokensReply: () => {
    const n = parseInt(cfg("GROQ_MAX_TOKENS_REPLY") || "600", 10);
    return Number.isFinite(n) && n > 0 ? n : 600;
  },
  chatbotMode: () => (cfg("CHATBOT_MODE") === "legacy_fsm" ? "legacy_fsm" : "groq") as "groq" | "legacy_fsm",
  waPhoneNumberId: () => cfg("WA_PHONE_NUMBER_ID"),
  waAccessToken: () => cfg("WA_ACCESS_TOKEN"),
  waVerifyToken: () => cfg("WA_VERIFY_TOKEN"),
  waBusinessAccountId: () => cfg("WA_BUSINESS_ACCOUNT_ID"),
  waEngineerSetupTemplate: () => cfg("WA_ENGINEER_SETUP_TEMPLATE"),
  waEngineerSetupTemplateLang: () => cfg("WA_ENGINEER_SETUP_TEMPLATE_LANG") || "en",
  waEngineerTicketTemplate: () => cfg("WA_ENGINEER_TICKET_TEMPLATE"),
  waEngineerTicketTemplateLang: () => cfg("WA_ENGINEER_TICKET_TEMPLATE_LANG") || "en",
  frontendUrl: () => cfg("FRONTEND_URL") || env.FRONTEND_URL,
  integrationWebhookUrl: () => cfg("INTEGRATION_WEBHOOK_URL"),
  hrEngineersUrl: () => cfg("HR_ENGINEERS_URL"),
  hrSyncManagerId: () => cfg("HR_SYNC_MANAGER_ID"),
  publicOtpSecret: () => cfg("PUBLIC_OTP_SECRET"),
  ollamaUrl: () => cfg("OLLAMA_URL") || process.env.OLLAMA_URL || "http://localhost:11434",
  qdrantUrl: () => cfg("QDRANT_URL") || process.env.QDRANT_URL || "http://localhost:6333",
  dealerDefaultPassword: () => cfg("DEALER_DEFAULT_PASSWORD") || "Dealer@2026",
};
