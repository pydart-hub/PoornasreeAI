import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// ── Augment Express Request so req.user is available project-wide ─────
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      userId: string;
      role: string;
    };
  }
}

export interface JwtPayload {
  userId: string;
  role: string;
}

// ── Protect middleware ────────────────────────────────────────────────
// Reads the JWT from the signed HTTP-only cookie, verifies it, and
// attaches { userId, role } to req.user. Rejects with 401 on failure.
export function protect(req: Request, res: Response, next: NextFunction): void {
  const token: string | undefined = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = { userId: payload.userId, role: payload.role };
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
