import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// ── Augment Express Request so req.user is available project-wide ─────
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      userId: string;
      role: string;
      pincodeId?: string | null;
    };
  }
}

export interface JwtPayload {
  userId: string;
  role: string;
  pincodeId?: string | null;
}

/** Cookie (web) or `Authorization: Bearer` (external / mobile app) — same JWT. */
export function getAuthToken(req: Request): string | undefined {
  const cookie = req.cookies?.token;
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return undefined;
}

// ── Protect middleware ────────────────────────────────────────────────
// Verifies JWT from cookie or Bearer token; attaches req.user.
export function protect(req: Request, res: Response, next: NextFunction): void {
  const token = getAuthToken(req);

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = { userId: payload.userId, role: payload.role, pincodeId: payload.pincodeId ?? null };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Authorize middleware ──────────────────────────────────────────────
// Must be used after `protect`. Rejects with 403 if the authenticated
// user's role is not in the allowed list.
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }
    next();
  };
}

/** Alias for protect — used where requirement docs say "requireAuth". */
export const requireAuth = protect;

/** Alias for authorize — used where requirement docs say "requireRole". */
export const requireRole = authorize;
