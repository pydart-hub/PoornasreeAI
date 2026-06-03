// ── Validated environment configuration ──────────
// Fails fast at startup if required vars are missing.

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

const NODE_ENV = optional("NODE_ENV", "development");
const isDev = NODE_ENV === "development";

export const env = {
  NODE_ENV,
  isDev,
  isProd: NODE_ENV === "production",

  // ── Server ──────────────────────────────────
  PORT: parseInt(optional("PORT", "4000"), 10),

  // ── Database ────────────────────────────────
  // Local dev: tunneled via SSH on port 5432
  // Production: direct localhost:5432 on VPS
  DATABASE_URL: required("DATABASE_URL"),

  // ── Auth ────────────────────────────────────
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "7d"),

  // ── CORS ────────────────────────────────────
  // All requests arrive from the Next.js proxy container (server-to-server),
  // so there is no browser Origin header. CORS is set to reflect any origin
  // (origin: true in Express cors()) — the env var is kept only as a safety
  // escape-hatch if direct access is re-enabled.
  CORS_ORIGIN: optional("CORS_ORIGIN", "*"),

  // ── Cookies ─────────────────────────────────
  // The site runs over plain HTTP — secure:true would silently drop cookies.
  // sameSite:"lax" is safe; the browser only ever talks to port 80 (Next.js).
  COOKIE_SECURE: false,
  COOKIE_SAMESITE: "lax" as "lax" | "strict",

  // ── Frontend URL ────────────────────────────
  // Used to build links (e.g. set-password) sent via WhatsApp.
  FRONTEND_URL: optional("FRONTEND_URL", "https://poornasree.pydart.com"),

  // ── WhatsApp Cloud API ──────────────────────
  // Optional — set in .env. Required for real WhatsApp messages via Meta webhook.
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID || "",
  WA_ACCESS_TOKEN:    process.env.WA_ACCESS_TOKEN    || "",
  WA_VERIFY_TOKEN:    process.env.WA_VERIFY_TOKEN    || "",

  // ── External integration ────────────────────────────────────────────────
  // Optional webhook URL — POST normalized ticket events on lifecycle changes.
  INTEGRATION_WEBHOOK_URL: process.env.INTEGRATION_WEBHOOK_URL || "",

  // ── HR engineers roster (hr_api_v2) ─────────────────────────────────────
  HR_ENGINEERS_URL: optional(
    "HR_ENGINEERS_URL",
    "http://145.223.18.143/hr_api_v2/public/engineers",
  ),
  // UUID of service_manager who owns HR-synced engineers; empty = first service_manager in DB
  HR_SYNC_MANAGER_ID: process.env.HR_SYNC_MANAGER_ID || "",
} as const;
