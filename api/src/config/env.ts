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
  // Dev: defaults to http://localhost:3000
  // Prod: CORS_ORIGIN must be explicitly set or the server refuses to start.
  CORS_ORIGIN: isDev
    ? optional("CORS_ORIGIN", "http://localhost:3000")
    : required("CORS_ORIGIN"),

  // ── Cookies ─────────────────────────────────
  COOKIE_SECURE: !isDev, // true in production (HTTPS), false in dev
  COOKIE_SAMESITE: (isDev ? "lax" : "strict") as "lax" | "strict",
} as const;
