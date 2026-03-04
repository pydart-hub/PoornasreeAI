/**
 * Client-safe environment variable helper.
 *
 * All API calls are relative paths ("/api/...").
 * The browser sends them to the Next.js server (port 80), which proxies
 * server-to-server to the API container via the rewrite in next.config.mjs.
 * The browser never sees port 4000 — no NEXT_PUBLIC_API_URL needed.
 */

/**
 * Base URL for all API calls.
 * Empty string = same-origin relative URL (e.g. fetch("/api/auth/login")).
 * Next.js rewrites /api/:path* → http://api:4000/api/:path* internally.
 */
export const API_BASE = "";
